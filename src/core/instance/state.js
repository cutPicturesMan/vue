/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import Dep, { pushTarget, popTarget } from '../observer/dep'
import { isUpdatingChildComponent } from './lifecycle'

import {
  set,
  del,
  observe,
  defineReactive,
  toggleObserving
} from '../observer/index'

import {
  warn,
  bind,
  noop,
  hasOwn,
  hyphenate,
  isReserved,
  handleError,
  nativeWatch,
  validateProp,
  isPlainObject,
  isServerRendering,
  isReservedAttribute
} from '../util/index'

const sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: noop,
  set: noop
}

export function proxy (target: Object, sourceKey: string, key: string) {
  sharedPropertyDefinition.get = function proxyGetter () {
    return this[sourceKey][key]
  }
  sharedPropertyDefinition.set = function proxySetter (val) {
    this[sourceKey][key] = val
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

// Q initState只在new Vue()时调用？name子组件的初始化是在哪里？不需要调用initState吗？
export function initState (vm: Component) {
  vm._watchers = []
  const opts = vm.$options
  // TODO 如下两个疑问：
  // 1、如果在new Vue时声明了props，会如何？跟data是一样的
  // 2、data作为父级以及子组件都有的属性，为什么不是最先初始化的？由于子组件中，data、methods
  if (opts.props) initProps(vm, opts.props)
  if (opts.methods) initMethods(vm, opts.methods)
  if (opts.data) {
    initData(vm)
  } else {
    observe(vm._data = {}, true /* asRootData */)
  }
  if (opts.computed) initComputed(vm, opts.computed)
  // TODO Firefox 中原生提供了 Object.prototype.watch 函数，所以即使没有 opts.watch 选项，如果在火狐浏览器中依然能够通过原型链访问到原生的 Object.prototype.watch。但这其实不是我们想要的结果，所以这里加了一层判断避免把原生 watch 函数误认为是我们预期的 opts.watch 选项
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch)
  }
}

function initProps (vm: Component, propsOptions: Object) {
  // 用户定义的props数据
  const propsData = vm.$options.propsData || {}
  // 挂载到vue实例上的props数据
  const props = vm._props = {}
  // cache prop keys so that future props updates can iterate using Array
  // instead of dynamic object key enumeration.
  // 缓存props的所有key。这样在lifeCircle更新时就可以直接使用数组，而不需要动态枚举对象取key值
  // TODO https://github.com/vuejs/vue/issues/4767
  // Q 1、lifeCircle更新是什么样的过程？2、for...in枚举key值与循环数组的性能差距？
  const keys = vm.$options._propKeys = []
  const isRoot = !vm.$parent
  // root instance props should be converted
  // 根实例上的props不需要被Observe
  if (!isRoot) {
    toggleObserving(false)
  }
  // 处理子组件上声明的props
  for (const key in propsOptions) {
    keys.push(key)
    const value = validateProp(key, propsOptions, propsData, vm)
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      const hyphenatedKey = hyphenate(key)
      if (isReservedAttribute(hyphenatedKey) ||
          config.isReservedAttr(hyphenatedKey)) {
        warn(
          `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
          vm
        )
      }
      defineReactive(props, key, value, () => {
        if (!isRoot && !isUpdatingChildComponent) {
          warn(
            `Avoid mutating a prop directly since the value will be ` +
            `overwritten whenever the parent component re-renders. ` +
            `Instead, use a data or computed property based on the prop's ` +
            `value. Prop being mutated: "${key}"`,
            vm
          )
        }
      })
    } else {
      defineReactive(props, key, value)
    }
    // static props are already proxied on the component's prototype
    // during Vue.extend(). We only need to proxy props defined at
    // instantiation here.
    if (!(key in vm)) {
      proxy(vm, `_props`, key)
    }
  }
  toggleObserving(true)
}

// 初始化data属性
function initData (vm: Component) {
  let data = vm.$options.data
  // 这里的data有可能是根的data，也有可能是组件的data
  // 如果是组件中的data，则必须是函数
  // 因为组件可能被用来创建多个实例，如果data仍然是一个纯粹的对象，则所有的实例将共享引用同一个数据对象
  data = vm._data = typeof data === 'function'
    ? getData(data, vm)
    : data || {}
  // data必须是纯粹的对象 (含有零个或多个的 key/value 对)
  if (!isPlainObject(data)) {
    // 限制为对象
    data = {}
    process.env.NODE_ENV !== 'production' && warn(
      'data functions should return an object:\n' +
      'https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function',
      vm
    )
  }
  // proxy data on instance
  const keys = Object.keys(data)
  const props = vm.$options.props
  const methods = vm.$options.methods
  let i = keys.length
  while (i--) {
    const key = keys[i]
    if (process.env.NODE_ENV !== 'production') {
      // 1、如果methods对象上的key值，已经被data对象定义
      if (methods && hasOwn(methods, key)) {
        warn(
          `Method "${key}" has already been defined as a data property.`,
          vm
        )
      }
    }
    // 2、如果data对象上的key值，已经被prop对象定义
    if (props && hasOwn(props, key)) {
      process.env.NODE_ENV !== 'production' && warn(
        `The data property "${key}" is already declared as a prop. ` +
        `Use prop default value instead.`,
        vm
      )
    } else if (!isReserved(key)) {
      // 以 _ 或 $ 开头的属性不会被Vue实例代理，因为它们可能和Vue内置的属性、API方法冲突，因此要判断下

      // 3、将data对象的所有key，代理到vm上。存取vm上的对应key时，实为存取vm._data上对应key
      proxy(vm, `_data`, key)
    }
  }
  // observe data
  observe(data, true /* asRootData */)
}

export function getData (data: Function, vm: Component): any {
  // #7573 disable dep collection when invoking data getters
  // 禁止子组件的data在初始化时，收集依赖。防止：
  // 1、父组件data更新，触发update lifecircle
  // TODO 下述逻辑需要验证，即在子组件初始化时，Dep.target是否指向子组件
  // 2、父组件data更新，通知其依赖项（子组件的data），触发其更新？
  pushTarget()
  try {
    return data.call(vm, vm)
  } catch (e) {
    handleError(e, vm, `data()`)
    return {}
  } finally {
    popTarget()
  }
}

const computedWatcherOptions = { lazy: true }

function initComputed (vm: Component, computed: Object) {
  // $flow-disable-line
  const watchers = vm._computedWatchers = Object.create(null)
  // computed properties are just getters during SSR
  const isSSR = isServerRendering()

  for (const key in computed) {
    const userDef = computed[key]
    // 定义computed有2种方式：
    // 1、函数，会被当做getter
    // 2、含有get、set属性的对象
    const getter = typeof userDef === 'function' ? userDef : userDef.get
    if (process.env.NODE_ENV !== 'production' && getter == null) {
      warn(
        `Getter is missing for computed property "${key}".`,
        vm
      )
    }

    // TODO 为什么非服务端才创建watcher
    if (!isSSR) {
      // create internal watcher for the computed property.
      // 为计算属性创建内部watcher
      // TODO 哪些地方需要调用Watcher？分析下其第二个参数
      watchers[key] = new Watcher(
        vm,
        getter || noop,
        noop,
        computedWatcherOptions
      )
    }

    // component-defined computed properties are already defined on the
    // component prototype. We only need to define computed properties defined
    // at instantiation here.
    // 组件定义的计算属性由组件自己处理（定义在组件的prototype上）
    // 我们只需要在这里处理new Vue()时的计算属性即可
    if (!(key in vm)) {
      defineComputed(vm, key, userDef)
    } else if (process.env.NODE_ENV !== 'production') {
      // 非生产环境下，如果计算属性名称与data、props重复，则进行提示
      if (key in vm.$data) {
        warn(`The computed property "${key}" is already defined in data.`, vm)
      } else if (vm.$options.props && key in vm.$options.props) {
        // TODO 这里的判断方式为何跟上面的vm.$data不同？
        warn(`The computed property "${key}" is already defined as a prop.`, vm)
      }
    }
  }
}

// TODO 把Observer看完后再回头看这块
export function defineComputed (
  target: any,
  key: string,
  userDef: Object | Function
) {
  // 是否应该进行缓存。不是服务端渲染的话，应该缓存
  const shouldCache = !isServerRendering()
  if (typeof userDef === 'function') {
    sharedPropertyDefinition.get = shouldCache
      ? createComputedGetter(key)
      : createGetterInvoker(userDef)
    sharedPropertyDefinition.set = noop
  } else {
    sharedPropertyDefinition.get = userDef.get
      ? shouldCache && userDef.cache !== false
        ? createComputedGetter(key)
        : createGetterInvoker(userDef.get)
      : noop
    sharedPropertyDefinition.set = userDef.set || noop
  }
  if (process.env.NODE_ENV !== 'production' &&
      sharedPropertyDefinition.set === noop) {
    sharedPropertyDefinition.set = function () {
      warn(
        `Computed property "${key}" was assigned to but it has no setter.`,
        this
      )
    }
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

function createComputedGetter (key) {
  return function computedGetter () {
    const watcher = this._computedWatchers && this._computedWatchers[key]
    if (watcher) {
      if (watcher.dirty) {
        watcher.evaluate()
      }
      if (Dep.target) {
        watcher.depend()
      }
      return watcher.value
    }
  }
}

function createGetterInvoker(fn) {
  return function computedGetter () {
    return fn.call(this, this)
  }
}

function initMethods (vm: Component, methods: Object) {
  const props = vm.$options.props
  for (const key in methods) {
    if (process.env.NODE_ENV !== 'production') {
      if (typeof methods[key] !== 'function') {
        warn(
          `Method "${key}" has type "${typeof methods[key]}" in the component definition. ` +
          `Did you reference the function correctly?`,
          vm
        )
      }
      if (props && hasOwn(props, key)) {
        warn(
          `Method "${key}" has already been defined as a prop.`,
          vm
        )
      }
      if ((key in vm) && isReserved(key)) {
        warn(
          `Method "${key}" conflicts with an existing Vue instance method. ` +
          `Avoid defining component methods that start with _ or $.`
        )
      }
    }
    vm[key] = typeof methods[key] !== 'function' ? noop : bind(methods[key], vm)
  }
}

// 初始化new Vue()的watch
function initWatch (vm: Component, watch: Object) {
  for (const key in watch) {
    const handler = watch[key]
    // handler合法类型有4种：Function、Object、String、Array
    // 由于Array的子元素可以包含任意类型，其中包括Function、Object、String，因此这里单独处理Array类型
    // 这里不再判断子元素是否合法了，因为$watch只接受Object、Function，不合法的话自然会报错
    if (Array.isArray(handler)) {
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i])
      }
    } else {
      createWatcher(vm, key, handler)
    }
  }
}

// 用于以下2种调用
// 1、new Vue(): Object、String、Function、不合法类型 => Function、不合法类型
// 2、$watch: Object、Function、不合法类型 => Function、不合法类型
function createWatcher (
  vm: Component,
  expOrFn: string | Function,
  handler: any,
  options?: Object
) {
  if (isPlainObject(handler)) {
    options = handler
    handler = handler.handler
  }
  if (typeof handler === 'string') {
    handler = vm[handler]
  }
  return vm.$watch(expOrFn, handler, options)
}

// 在原型上定义数据有关的：
// 属性：$data、$props
// 方法：$set、$delete、$watch
export function stateMixin (Vue: Class<Component>) {
  // flow somehow has problems with directly declared definition object
  // when using Object.defineProperty, so we have to procedurally build up
  // the object here.
  // 将this.$data、this.$props代理到this._data、this._props上
  // 通过声明dataDef/propsDef而不是直接在Object.defineProperty中使用{}的方式，来解决flow对Object.defineProperty的支持不是很好的问题
  const dataDef = {}
  dataDef.get = function () { return this._data }
  const propsDef = {}
  propsDef.get = function () { return this._props }
  // $data/$props为只读属性，不小心对其进行修改时，在非生产环境下进行提示
  if (process.env.NODE_ENV !== 'production') {
    dataDef.set = function () {
      warn(
        'Avoid replacing instance root $data. ' +
        'Use nested data properties instead.',
        this
      )
    }
    propsDef.set = function () {
      warn(`$props is readonly.`, this)
    }
  }
  // Q 为什么要代理？直接访问_data、_props不就好了吗？
  /**
   * flow对Object.defineProperty的支持不是很好，Object.defineProperty第三个参数需要按照如下处理才不会出错
   * https://github.com/facebook/flow/issues/285
    Object.defineProperty(Vue.prototype, '$data', ({
      get : function () { return this._data }
    }: Object))
   */
  Object.defineProperty(Vue.prototype, '$data', dataDef)
  Object.defineProperty(Vue.prototype, '$props', propsDef)

  Vue.prototype.$set = set
  Vue.prototype.$delete = del

  // $watch不仅提供给用户调用，还提供给内部处理new Vue()的watch属性
  Vue.prototype.$watch = function (
    expOrFn: string | Function,
    // 合法的cb类型为Object、Function。先验证是否是Object，如果不是则直接当作Function，运行错误就抛出异常
    cb: any,
    options?: Object
  ): Function {
    const vm: Component = this
    if (isPlainObject(cb)) {
      return createWatcher(vm, expOrFn, cb, options)
    }
    options = options || {}
    options.user = true
    const watcher = new Watcher(vm, expOrFn, cb, options)
    // 这里要说明下immediate的用处。在初始化的时候，watch的回调函数，是不会执行的。如果需要让cb在初始化的时候就执行，则将immediate设为true
    // 比如说有个组件，在初始化的时候，要根据props传来的tabIndex去加载不同接口，这时候在监控tabIndex的同时，需要开启immediate，避免第一次传值不生效
    // 比如有个计算购物车总价的功能。初始化的时候购物车是空数组，在created时发出请求去取购物车数据。由于这个数据与初始化无关，因此不需要添加immediate
    if (options.immediate) {
      try {
        cb.call(vm, watcher.value)
      } catch (error) {
        handleError(error, vm, `callback for immediate watcher "${watcher.expression}"`)
      }
    }
    return function unwatchFn () {
      watcher.teardown()
    }
  }
}
