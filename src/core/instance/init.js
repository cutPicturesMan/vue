/* @flow */

import config from '../config'
import { initProxy } from './proxy'
import { initState } from './state'
import { initRender } from './render'
import { initEvents } from './events'
import { mark, measure } from '../util/perf'
import { initLifecycle, callHook } from './lifecycle'
import { initProvide, initInjections } from './inject'
import { extend, mergeOptions, formatComponentName } from '../util/index'

let uid = 0

export function initMixin (Vue: Class<Component>) {
  Vue.prototype._init = function (options?: Object) {
    const vm: Component = this
    // a uid
    // 每次实例化一个Vue实例，uid都会加1
    vm._uid = uid++

    // TODO 了解window.performance API
    // https://developer.mozilla.org/zh-CN/docs/Web/API/Performance/measure
    let startTag, endTag
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      startTag = `vue-perf-start:${vm._uid}`
      endTag = `vue-perf-end:${vm._uid}`
      mark(startTag)
    }

    // a flag to avoid this being observed
    // 表明本对象是vue实例，而非普通的对象
    vm._isVue = true
    // merge options
    // 如果是vue组件
    if (options && options._isComponent) {
      // optimize internal component instantiation
      // since dynamic options merging is pretty slow, and none of the
      // internal component options needs special treatment.
      // 优化内部组件实例化
      // 因为options的动态合并相当缓慢，并且没有内部组件的options需要特殊对待
      initInternalComponent(vm, options)
    } else {
      // 将options的多种情况，比如props的多种传参方式，转变为固定的一种
      vm.$options = mergeOptions(
        resolveConstructorOptions(vm.constructor),
        // options为透传进来的参数。当new Vue()用于event Bus的时候，options为空
        options || {},
        vm
      )
    }
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      initProxy(vm)
    } else {
      vm._renderProxy = vm
    }
    // expose real self
    vm._self = vm
    initLifecycle(vm)
    initEvents(vm)
    initRender(vm)
    callHook(vm, 'beforeCreate')
    initInjections(vm) // resolve injections before data/props
    initState(vm)
    initProvide(vm) // resolve provide after data/props
    callHook(vm, 'created')

    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      vm._name = formatComponentName(vm, false)
      mark(endTag)
      measure(`vue ${vm._name} init`, startTag, endTag)
    }

    if (vm.$options.el) {
      vm.$mount(vm.$options.el)
    }
  }
}

// 初始化内部组件
export function initInternalComponent (vm: Component, options: InternalComponentOptions) {
  // TODO 为什么要继承父级的options？
  const opts = vm.$options = Object.create(vm.constructor.options)
  // doing this because it's faster than dynamic enumeration.
  const parentVnode = options._parentVnode
  opts.parent = options.parent
  opts._parentVnode = parentVnode

  const vnodeComponentOptions = parentVnode.componentOptions
  opts.propsData = vnodeComponentOptions.propsData
  opts._parentListeners = vnodeComponentOptions.listeners
  opts._renderChildren = vnodeComponentOptions.children
  opts._componentTag = vnodeComponentOptions.tag

  if (options.render) {
    opts.render = options.render
    opts.staticRenderFns = options.staticRenderFns
  }
}

/**
  获取构造函数的options选项
  <div id="mount-point"></div>

  var Profile = Vue.extend({
    template: '<p>{{firstName}} {{lastName}} aka {{alias}}</p>',
    data: function () {
      return {
        firstName: 'Walter',
        lastName: 'White',
        alias: 'Heisenberg'
      }
    }
  })

  new Profile().$mount('#mount-point')

 TODO 当使用Vue.extend创造一个子类并使用子类创造实例时，传入本函数的vm.constructor就不是Vue构造函数，而是子类Sub
 * @param Ctor 即/src/core/global-api/extend.js中的Sub，上例中的Profile
 * @returns {*}
 */
export function resolveConstructorOptions (Ctor: Class<Component>) {
  let options = Ctor.options
  // Ctor.super即Vue
  // 有super属性，说明Ctor是通过Vue.extend()方法创建的子类
  if (Ctor.super) {
    // 可能存在Profile2 = Profile.extend({})的情况，因此递归调用获取父级options
    const superOptions = resolveConstructorOptions(Ctor.super)
    const cachedSuperOptions = Ctor.superOptions
    /**
     * 假设在Vue.extend()之后，通过Vue.mixin重新赋值了Vue.options
     * 这里需要同步最新的options

      var Profile = Vue.extend({
        template: '<p>{{firstName}} {{lastName}} aka {{alias}}</p>',
      });

      Vue.mixin({
        data () {
          return {
            firstName: 'Walter',
            lastName: 'White',
            alias: 'Heisenberg'
          }
        }
      });

      new Profile().$mount('#app');
     */
    // 通过Ctor.super引用查找的最新父级options !== Vue.extend()时记录的父级options，则需要同步最新的父级options
    if (superOptions !== cachedSuperOptions) {
      // super option changed,
      // need to resolve new options.
      Ctor.superOptions = superOptions
      // check if there are any late-modified/attached options (#4976)
      /**
       * 检查对option选项是否有任何的后期修改、附加新属性
       * 如果有，则合并到option中，而不是遗漏掉
       * https://github.com/vuejs/vue/issues/4976

	       const Test = Vue.extend({})

	       // Inject options later
	       // vue-loader and vue-hot-reload-api are doing like this
	       Test.options.computed = { $style: () => 123 }
	       Test.options.beforeCreate = [() => { console.log('Should be printed') }]

	       // Update super constructor's options
	       Vue.mixin({})

	       // mount the component
	       const vm = new Test({
	        template: '<div>{{ $style }}</div>'
	       }).$mount()

	       expect(Test.options.computed.$style()).toBe(123)
       */
      const modifiedOptions = resolveModifiedOptions(Ctor)
      // update base extend options
      // 将修改的属性集合，同步到Vue.extend(options)的options中
      if (modifiedOptions) {
        extend(Ctor.extendOptions, modifiedOptions)
      }
      // 将最新的Vue.extend(options)中的options，合并到父级options中，并作为子类的options
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions)
      //
      /**
       * 如果指定了当前组件的名称，则在子组件中也申明一份同样的组件，方便自引用
       * TODO 下面的例子不是很具有实战意义，到时候去看看Element ui、iview之类的框架如何使用
       * https://segmentfault.com/a/1190000010540748
	        const Test = Vue.extend({
	          name: 'z',
	          template: '<div>你的名字：{{ firstName }}</div>',
	          data () {
	            return {
	              firstName: 'Walter'
	            }
	          }
	        })

	        // mount the component
	        const vm = new Test({
	          template: '<div>将自身作为子组件，方便渲染：<test></test></div>'
	        }).$mount('#app')
       */
      if (options.name) {
        options.components[options.name] = Ctor
      }
    }
  }
  return options
}

/**
 * 将当前组件的options对象，与当前组件在extend时冻结的options对比，返回修改过的属性集合对象
 * @param Ctor
 * @returns {*}
 */
function resolveModifiedOptions (Ctor: Class<Component>): ?Object {
  let modified
  const latest = Ctor.options
  const sealed = Ctor.sealedOptions
  for (const key in latest) {
    if (latest[key] !== sealed[key]) {
      if (!modified) modified = {}
      modified[key] = latest[key]
    }
  }
  return modified
}
