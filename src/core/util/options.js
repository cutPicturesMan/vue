/* @flow */

import config from '../config'
import { warn } from './debug'
import { set } from '../observer/index'
import { unicodeRegExp } from './lang'
import { nativeWatch, hasSymbol } from './env'

import {
  ASSET_TYPES,
  LIFECYCLE_HOOKS
} from 'shared/constants'

import {
  extend,
  hasOwn,
  camelize,
  toRawType,
  capitalize,
  isBuiltInTag,
  isPlainObject
} from 'shared/util'

/**
 * Option overwriting strategies are functions that handle
 * how to merge a parent option value and a child option
 * value into the final value.
 */
// 自定义合并策略的对象
// https://cn.vuejs.org/v2/api/#optionMergeStrategies
/**
 {
  // options相关
  el: ƒ (parent, child, vm, key)
  props: ƒ ( parentVal, childVal, vm, key )
  data: ƒ ( parentVal, childVal, vm )
  watch: ƒ ( parentVal, childVal, vm, key )
  computed: ƒ ( parentVal, childVal, vm, key )
  methods: ƒ ( parentVal, childVal, vm, key )

  components: ƒ mergeAssets( parentVal, childVal, vm, key )
  directives: ƒ mergeAssets( parentVal, childVal, vm, key )
  filters: ƒ mergeAssets( parentVal, childVal, vm, key )

  provide: ƒ mergeDataOrFn( parentVal, childVal, vm )
  inject: ƒ ( parentVal, childVal, vm, key )
  propsData: ƒ (parent, child, vm, key)

  // 生命周期相关
  beforeCreate: ƒ mergeHook( parentVal, childVal )
  created: ƒ mergeHook( parentVal, childVal )
  beforeMount: ƒ mergeHook( parentVal, childVal )
  mounted: ƒ mergeHook( parentVal, childVal )
  beforeUpdate: ƒ mergeHook( parentVal, childVal )
  updated: ƒ mergeHook( parentVal, childVal )
  beforeDestroy: ƒ mergeHook( parentVal, childVal )
  destroyed: ƒ mergeHook( parentVal, childVal )

  activated: ƒ mergeHook( parentVal, childVal )
  deactivated: ƒ mergeHook( parentVal, childVal )
  errorCaptured: ƒ mergeHook( parentVal, childVal )

  serverPrefetch: ƒ mergeHook( parentVal, childVal )
}
  */
const strats = config.optionMergeStrategies

/**
 * Options with restrictions
 */
// el和propsData这两个属性，只能在new Vue的时候使用，不能在子组件中使用
// TODO 生产环境下el、propsData的处理函数为undefined，同样走defaultStrat。此时的值以子组件为主，有没有问题？
if (process.env.NODE_ENV !== 'production') {
  strats.el = strats.propsData = function (parent, child, vm, key) {
    if (!vm) {
      warn(
        `option "${key}" can only be used during instance ` +
        'creation with the `new` keyword.'
      )
    }
    return defaultStrat(parent, child)
  }
}

/**
 * Helper that recursively merges two data objects together.
 */
// 将from的属性合并到to中
function mergeData (to: Object, from: ?Object): Object {
  if (!from) return to
  let key, toVal, fromVal

  const keys = hasSymbol
    ? Reflect.ownKeys(from)
    : Object.keys(from)

  for (let i = 0; i < keys.length; i++) {
    key = keys[i]
    // in case the object is already observed...
    if (key === '__ob__') continue
    toVal = to[key]
    fromVal = from[key]
    // 如果目标对象上没有对应key，则将该key合并到目标对象上
    if (!hasOwn(to, key)) {
      set(to, key, fromVal)
    } else if (
      // 如果目标对象、源对象上均有相同key，该key值是对象且不相等，则递归合并
      toVal !== fromVal &&
      isPlainObject(toVal) &&
      isPlainObject(fromVal)
    ) {
      mergeData(toVal, fromVal)
    }
    // 其余情况则不处理，均以目标对象的key值为最后值
  }
  return to
}

/**
 * Data
 */
// Q mergeDataOrFn为什么返回函数，而不是合并之后的值？
// A 因为data中有可能会用到props来赋值数据，因此需要在props初始化完毕后再进行合并
export function mergeDataOrFn (
  parentVal: any,
  childVal: any,
  vm?: Component
): ?Function {
  // 在vue子组件中
  if (!vm) {
    // in a Vue.extend merge, both should be functions
    // 直接返回的parentVal函数和childVal函数，在初始化时会进行作用域绑定
    // 当子data不存在时，就不需要合并，直接返回父data函数
    if (!childVal) {
      return parentVal
    }
    // 当父data不存在时，此时子data肯定存在，返回子data函数
    if (!parentVal) {
      return childVal
    }
    // when parentVal & childVal are both present,
    // we need to return a function that returns the
    // merged result of both functions... no need to
    // check if parentVal is a function here because
    // it has to be a function to pass previous merges.
    // TODO 为什么父data一定是函数形式？以及这个issue：https://github.com/vuejs/vue/pull/6025

    // 当父data和子data都存在时，返回一个函数
    // 执行该函数会返回了父子data合并之后的值
    return function mergedDataFn () {
      return mergeData(
        typeof childVal === 'function' ? childVal.call(this, this) : childVal,
        typeof parentVal === 'function' ? parentVal.call(this, this) : parentVal
      )
    }
  } else {
    return function mergedInstanceDataFn () {
      // instance merge
      const instanceData = typeof childVal === 'function'
        ? childVal.call(vm, vm)
        : childVal
      // TODO parentVal什么时候为函数？
      const defaultData = typeof parentVal === 'function'
        ? parentVal.call(vm, vm)
        : parentVal
      if (instanceData) {
        return mergeData(instanceData, defaultData)
      } else {
        return defaultData
      }
    }
  }
}

strats.data = function (
  parentVal: any,
  childVal: any,
  vm?: Component
): ?Function {
  if (!vm) {
    // 如果子组件的data不是一个函数，则提示
    // 并且直接将父组件的data作为合并后的data
    if (childVal && typeof childVal !== 'function') {
      process.env.NODE_ENV !== 'production' && warn(
        'The "data" option should be a function ' +
        'that returns a per-instance value in component ' +
        'definitions.',
        vm
      )

      return parentVal
    }
    return mergeDataOrFn(parentVal, childVal)
  }

  // 传入vm表示是Vue构造函数，而非子组件
  return mergeDataOrFn(parentVal, childVal, vm)
}

/**
 * Hooks and props are merged as arrays.
 */
function mergeHook (
  parentVal: ?Array<Function>,
  childVal: ?Function | ?Array<Function>
): ?Array<Function> {
  const res = childVal
    // 子hook存在，则判断父hook是否存在
    ? parentVal
      // 父hook存在，则与子hook合并成一个数组（父hook永远是数组）
      ? parentVal.concat(childVal)
      // 父hook不存在，则返回数组形式的子hook
      : Array.isArray(childVal)
        ? childVal
        : [childVal]
    // 子hook不存在，直接返回父hook
    : parentVal
  return res
    ? dedupeHooks(res)
    : res
}

/**
 * 过滤掉由Vue.mixin()带来重复的生命周期钩子
 * 下例未过滤前created执行2次，过滤后created执行1次
 Vue.mixin({
    created() {
      spy()
    }
  })

 const mixin = Vue.extend({})

 const Child = Vue.extend({
    mixins: [mixin],
    created() {}
  })

 const vm = new Child()
 */
// TODO 看下 fix(core): dedupe lifecycle hooks during options merge
function dedupeHooks (hooks) {
  const res = []
  for (let i = 0; i < hooks.length; i++) {
    if (res.indexOf(hooks[i]) === -1) {
      res.push(hooks[i])
    }
  }
  return res
}

LIFECYCLE_HOOKS.forEach(hook => {
  strats[hook] = mergeHook
})

/**
 * Assets
 *
 * When a vm is present (instance creation), we need to do
 * a three-way merge between constructor options, instance
 * options and parent options.
 */
function mergeAssets (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): Object {
  // TODO 这里为什么不用Object.assign({}, parentVal || {})，而是要生成一个以parentVal为原型的对象res？
  // TODO Object.assign和Object.create的区别
  // TODO 对象深复制
  const res = Object.create(parentVal || null)
  if (childVal) {
    process.env.NODE_ENV !== 'production' && assertObjectType(key, childVal, vm)
    return extend(res, childVal)
  } else {
    return res
  }
}

ASSET_TYPES.forEach(function (type) {
  strats[type + 's'] = mergeAssets
})

/**
 * Watchers.
 *
 * Watchers hashes should not overwrite one
 * another, so we merge them as arrays.
 */
// 父子watch合并时，不应该互相重写，因此将父子watch的每个key合并为数组形式
strats.watch = function (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): ?Object {
  // work around Firefox's Object.prototype.watch...
  // 由于Firefox的Object原型上自带watch属性，当option没有声明watch属性时，传入本函数的有可能是Object.prototype.watch，因此要重置为undefined
  if (parentVal === nativeWatch) parentVal = undefined
  if (childVal === nativeWatch) childVal = undefined
  /* istanbul ignore if */
  // 从父watch上复制一份出来，避免共用同一个对象，从而导致父watch修改时影响到子watch
  if (!childVal) return Object.create(parentVal || null)
  // watch只能为对象
  if (process.env.NODE_ENV !== 'production') {
    assertObjectType(key, childVal, vm)
  }
  // 不存在父watch，直接使用子watch
  if (!parentVal) return childVal
  const ret = {}
  extend(ret, parentVal)
  for (const key in childVal) {
    let parent = ret[key]
    const child = childVal[key]
    // 子watch的key同时存在于父watch上 && 父watch的key不是数组（Vue.extend创建的父watch的key有可能不是数组）
    if (parent && !Array.isArray(parent)) {
      parent = [parent]
    }
    ret[key] = parent
      // 将父watch与子watch合并为一个数组
      ? parent.concat(child)
      // 确保子watch的key为数组
      : Array.isArray(child) ? child : [child]
  }
  return ret
}

/**
 * Other object hashes.
 */
strats.props =
strats.methods =
strats.inject =
strats.computed = function (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): ?Object {
  if (childVal && process.env.NODE_ENV !== 'production') {
    assertObjectType(key, childVal, vm)
  }
  // 父级不存在，直接返回子级
  if (!parentVal) return childVal
  // TODO 为什么不用Object.assign({}, parentVal)
  const ret = Object.create(null)
  extend(ret, parentVal)
  // 父子同时存在，则用子级覆盖父级
  if (childVal) extend(ret, childVal)
  return ret
}
strats.provide = mergeDataOrFn

/**
 * Default strategy.
 */
// 默认的策略：有子选项就使用子选项，否则使用父选项
const defaultStrat = function (parentVal: any, childVal: any): any {
  return childVal === undefined
    ? parentVal
    : childVal
}

/**
 * Validate component names
 */
function checkComponents (options: Object) {
  for (const key in options.components) {
    validateComponentName(key)
  }
}

export function validateComponentName (name: string) {
  // 组件名称只能包含字母数字下划线、连字符，并且要以字母开头
  if (!new RegExp(`^[a-zA-Z][\\-\\.0-9_${unicodeRegExp.source}]*$`).test(name)) {
    warn(
      'Invalid component name: "' + name + '". Component names ' +
      'should conform to valid custom element name in html5 specification.'
    )
  }
  // 内置组件 || html保留标签
  if (isBuiltInTag(name) || config.isReservedTag(name)) {
    warn(
      'Do not use built-in or reserved HTML elements as component ' +
      'id: ' + name
    )
  }
}

/**
 * Ensure all props option syntax are normalized into the
 * Object-based format.
 */
/**
 将props的三种形式，转化为第三种最完整的格式：
 1、props: ['title', 'list']
 2、props: {
    title: String,
    list: Array
 }
 3、props: {
    title: {
      type: String
    },
    likes: {
      type: Array,
      default(){
        return [];
      }
    }
 }
 */
function normalizeProps (options: Object, vm: ?Component) {
  const props = options.props
  if (!props) return
  const res = {}
  let i, val, name
  // 针对第1点数组形式的props进行转化
  if (Array.isArray(props)) {
    i = props.length
    while (i--) {
      val = props[i]
      if (typeof val === 'string') {
        name = camelize(val)
        res[name] = { type: null }
      } else if (process.env.NODE_ENV !== 'production') {
        warn('props must be strings when using array syntax.')
      }
    }
  } else if (isPlainObject(props)) {
    // 针对第2、3点对象形式的props进行转化
    for (const key in props) {
      val = props[key]
      name = camelize(key)
      // props属性是一个对象，则保持原样
      res[name] = isPlainObject(val)
        ? val
        // 否则赋值给type
        : { type: val }
    }
  } else if (process.env.NODE_ENV !== 'production') {
    warn(
      `Invalid value for option "props": expected an Array or an Object, ` +
      `but got ${toRawType(props)}.`,
      vm
    )
  }
  options.props = res
}

/**
 * Normalize all injections into Object-based format
 */
/**
 将inject的三种形式，转化为第三种最完整的格式：
 1、inject: ['foo']
 2、inject: {
      foo: 'bar'
   }
 3、inject: {
      foo: {
        from: 'bar',
        // 对非原始值使用一个工厂方法
        default: () => [1, 2, 3]
      }
   }
 */
function normalizeInject (options: Object, vm: ?Component) {
  const inject = options.inject
  if (!inject) return
  const normalized = options.inject = {}
  // 1、inject为数组形式
  if (Array.isArray(inject)) {
    for (let i = 0; i < inject.length; i++) {
      normalized[inject[i]] = { from: inject[i] }
    }
  } else if (isPlainObject(inject)) {
    // 2、inject为对象形式
    for (const key in inject) {
      const val = inject[key]
      normalized[key] = isPlainObject(val)
        // inject属性值为对象，则设置对象的from默认为当前属性的key值。可以允许改成其他key值
        // 这里要把对象原型链上的属性也拷贝过去，因为原型链上的属性也是可以访问到的
        ? extend({ from: key }, val)
        : { from: val }
    }
  } else if (process.env.NODE_ENV !== 'production') {
    warn(
      `Invalid value for option "inject": expected an Array or an Object, ` +
      `but got ${toRawType(inject)}.`,
      vm
    )
  }
}

/**
 * Normalize raw function directives into object format.
 */
// 将局部指令的函数形式转为对象形式
function normalizeDirectives (options: Object) {
  const dirs = options.directives
  if (dirs) {
    for (const key in dirs) {
      const def = dirs[key]
      if (typeof def === 'function') {
        dirs[key] = { bind: def, update: def }
      }
    }
  }
}

function assertObjectType (name: string, value: any, vm: ?Component) {
  if (!isPlainObject(value)) {
    warn(
      `Invalid value for option "${name}": expected an Object, ` +
      `but got ${toRawType(value)}.`,
      vm
    )
  }
}

/**
 * Merge two option objects into a new one.
 * Core utility used in both instantiation and inheritance.
 */
// 将两个option对象合并为一个，在new Vue()、Vue.extend、Vue.mixin时使用
// 第三个参数仅在new Vue()时会传入，其余不会
export function mergeOptions (
  parent: Object,
  child: Object,
  vm?: Component
): Object {
  if (process.env.NODE_ENV !== 'production') {
    // 检查组件名称的合法性
    checkComponents(child)
  }

  // 处理这种情况：Vue.extend()创建的子类Function，作为Vue.mixin()的参数
  // 该情况见test/unit/features/global-api/mixin.spec.js vue-class-component#83
  if (typeof child === 'function') {
    child = child.options
  }

  // TODO 为什么这些属性需要normalize，其他不需要吗？
  normalizeProps(child, vm)
  normalizeInject(child, vm)
  normalizeDirectives(child)

  // Apply extends and mixins on the child options,
  // but only if it is a raw options object that isn't
  // the result of another mergeOptions call.
  // Only merged options has the _base property.
  // TODO https://github.com/vuejs/vue/issues/8865，看完Vue.extend()再来看这里
  // 处理未合并过的option对象，防止已合并的options重复合并
  // 只有已合并的options，才有_base属性：
  // /src/core/global-api/index.js将Vue.options._base的值设置为Vue构造函数
  // 在Vue中，Vue.mixin(options)、new Vue(options)都会与Vue.options进行合并，因此可以借_base属性判断该options是否合并过
  if (!child._base) {
    if (child.extends) {
      parent = mergeOptions(parent, child.extends, vm)
    }
    if (child.mixins) {
      for (let i = 0, l = child.mixins.length; i < l; i++) {
        parent = mergeOptions(parent, child.mixins[i], vm)
      }
    }
  }

  // 以下步骤实际上相当于Object.assign({}, parent, child)
  // 但是由于options的每一个属性的合成方式不同，因此这里不能用Object.assign()，需要进行定制，因此要手动合并parent、child的所有属性
  const options = {}
  let key

  // 1、先处理parent的属性
  for (key in parent) {
    mergeField(key)
  }
  // 2、再处理child独有的属性
  for (key in child) {
    // 这里只能用hasOwn判断属性是否在对象实例上，而不能用in同时判断属性是否在对象实例和对象原型上
    // 因为旧版Firefox原生提供了Object.prototype.watch函数，child含有watch属性时，使用in会导致该属性直接被跳过
    if (!hasOwn(parent, key)) {
      mergeField(key)
    }
  }
  function mergeField (key) {
    // 如果key在config.optionMergeStrategies上配置了对应的策略函数，则使用该函数
    // 否则使用默认的策略函数
    const strat = strats[key] || defaultStrat
    options[key] = strat(parent[key], child[key], vm, key)
  }
  return options
}

/*
 * Resolve an asset.
 * This function is used because child instances need access
 * to assets defined in its ancestor chain.
 */
/**
 先查找局部的资源（components/directives/filters）

 先查找options.components本身上的组件声明，即局部声明的组件
 没有找到的话，再通过原型链查找全局声明的组件

 1、局部声明组件
 <template>
   <div>
    <my-component></my-component>
   </div>
 </template>

 <script>
 import myComponent from './myComponent.vue'

 export default {
   components: {
     myComponent
   }
 }
 </script>

 2、全局声明的组件
   当全局声明的组件名称与局部声明的完全一样时，在没找到局部my-component的情况下，不转而查找其驼峰式myComponent，而是先查找相同的组件名称时，会找到全局组件上，导致局部组件完全不会初始化
 Vue.component('my-component', {...})
 */
export function resolveAsset (
  options: Object,
  type: string,
  id: string,
  warnMissing?: boolean
): any {
  /* istanbul ignore if */
  if (typeof id !== 'string') {
    return
  }
  // 即options.components
  const assets = options[type]
  // check local registration variations first
  // 在options.components对象本身上依次查找：my-component -> myComponent -> MyComponent
  // my-component
  if (hasOwn(assets, id)) return assets[id]
  // myComponent
  const camelizedId = camelize(id)
  if (hasOwn(assets, camelizedId)) return assets[camelizedId]
  // MyComponent
  const PascalCaseId = capitalize(camelizedId)
  if (hasOwn(assets, PascalCaseId)) return assets[PascalCaseId]
  // fallback to prototype chain
  // 在options.components对象本身上没有找到，则去其原型链上依次查找：my-component -> myComponent -> MyComponent
  const res = assets[id] || assets[camelizedId] || assets[PascalCaseId]
  // 都没有找到，则提示
  if (process.env.NODE_ENV !== 'production' && warnMissing && !res) {
    warn(
      'Failed to resolve ' + type.slice(0, -1) + ': ' + id,
      options
    )
  }
  return res
}
