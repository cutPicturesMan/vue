/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import { mark, measure } from '../util/perf'
import { createEmptyVNode } from '../vdom/vnode'
import { updateComponentListeners } from './events'
import { resolveSlots } from './render-helpers/resolve-slots'
import { toggleObserving } from '../observer/index'
import { pushTarget, popTarget } from '../observer/dep'

import {
  warn,
  noop,
  remove,
  emptyObject,
  validateProp,
  invokeWithErrorHandling
} from '../util/index'

export let activeInstance: any = null
export let isUpdatingChildComponent: boolean = false

// 设置当前活动实例
export function setActiveInstance(vm: Component) {
  const prevActiveInstance = activeInstance
  activeInstance = vm
  // 将之前的活动实例设为当前活动实例
  return () => {
    activeInstance = prevActiveInstance
  }
}

// 初始化在整个生命周期会用到的属性
export function initLifecycle (vm: Component) {
  const options = vm.$options

  // locate first non-abstract parent
  // 针对非抽象组件，向上查找到距离最近的第一个非抽象父组件
  // 【抽象组件】不渲染真实dom，如keep-alive、<transition>；不会出现在父子关系的路径上
  let parent = options.parent
  if (parent && !options.abstract) {
    // 如果父组件是抽象的，且父组件存在父级，则继续向上查找
    while (parent.$options.abstract && parent.$parent) {
      parent = parent.$parent
    }
    // 查找完毕之后，将vm添加到父组件的$children上
    parent.$children.push(vm)
  }

  vm.$parent = parent
  vm.$root = parent ? parent.$root : vm

  // 子组件
  vm.$children = []
  vm.$refs = {}

  vm._watcher = null
  // <keep-alive>相关状态，是否是不活跃组件
  vm._inactive = null
  // TODO
  vm._directInactive = false
  // 是否已经挂载到页面
  vm._isMounted = false
  // 是否已经被销毁
  vm._isDestroyed = false
  // 是否正在被销毁中
  vm._isBeingDestroyed = false
}

// 在原型上定义生命周期有关的方法：_update、$forceUpdate、$destroy
export function lifecycleMixin (Vue: Class<Component>) {
  Vue.prototype._update = function (vnode: VNode, hydrating?: boolean) {
    const vm: Component = this
    const prevEl = vm.$el
    const prevVnode = vm._vnode
    // TODO slot、transition-group有关
    const restoreActiveInstance = setActiveInstance(vm)
    vm._vnode = vnode
    // Vue.prototype.__patch__ is injected in entry points
    // based on the rendering backend used.
    // __patch__函数在/platforms/web/runtime/index.js中定义，如果是服务端渲染则__patch__为空函数
    // TODO 这里的真实dom如何对应上属于它的虚拟dom？
    if (!prevVnode) {
      // initial render
      // 初始化渲染
      vm.$el = vm.__patch__(vm.$el, vnode, hydrating, false /* removeOnly */)
    } else {
      // updates
      // 更新
      vm.$el = vm.__patch__(prevVnode, vnode)
    }
    restoreActiveInstance()
    // update __vue__ reference
    if (prevEl) {
      prevEl.__vue__ = null
    }
    if (vm.$el) {
      vm.$el.__vue__ = vm
    }
    // if parent is an HOC, update its $el as well
    if (vm.$vnode && vm.$parent && vm.$vnode === vm.$parent._vnode) {
      vm.$parent.$el = vm.$el
    }
    // updated hook is called by the scheduler to ensure that children are
    // updated in a parent's updated hook.
  }

  Vue.prototype.$forceUpdate = function () {
    const vm: Component = this
    if (vm._watcher) {
      vm._watcher.update()
    }
  }

  // 销毁组件
  // TODO 待看
  Vue.prototype.$destroy = function () {
    const vm: Component = this
    // 防止重复销毁
    if (vm._isBeingDestroyed) {
      return
    }
    callHook(vm, 'beforeDestroy')
    vm._isBeingDestroyed = true
    // remove self from parent
    const parent = vm.$parent
    // 存在父级 && 父级不处于正在销毁中 && 本组件不是抽象组件，则将本组件从parent.$children移出
    if (parent && !parent._isBeingDestroyed && !vm.$options.abstract) {
      remove(parent.$children, vm)
    }
    // teardown watchers
    if (vm._watcher) {
      vm._watcher.teardown()
    }
    let i = vm._watchers.length
    while (i--) {
      vm._watchers[i].teardown()
    }
    // remove reference from data ob
    // frozen object may not have observer.
    if (vm._data.__ob__) {
      vm._data.__ob__.vmCount--
    }
    // call the last hook...
    vm._isDestroyed = true
    // invoke destroy hooks on current rendered tree
    vm.__patch__(vm._vnode, null)
    // fire destroyed hook
    callHook(vm, 'destroyed')
    // turn off all instance listeners.
    vm.$off()
    // remove __vue__ reference
    if (vm.$el) {
      vm.$el.__vue__ = null
    }
    // release circular reference (#6759)
    if (vm.$vnode) {
      vm.$vnode.parent = null
    }
  }
}

export function mountComponent (
  vm: Component,
  el: ?Element,
  hydrating?: boolean
): Component {
  vm.$el = el
  if (!vm.$options.render) {
    vm.$options.render = createEmptyVNode
    if (process.env.NODE_ENV !== 'production') {
      /* istanbul ignore if */
      // TODO 本函数是直接用render函数编译，只要render函数不存在，就应该警告，为啥还要判断template的非id情况以及el是否指定？
      // 运行时版本不支持将模板编译成render函数
      // 为什么判断el？是因为render函数、template属性都不存在的情况下，会将el的html模板提取出来当作模板
      if ((vm.$options.template && vm.$options.template.charAt(0) !== '#') ||
        vm.$options.el || el) {
        warn(
          'You are using the runtime-only build of Vue where the template ' +
          'compiler is not available. Either pre-compile the templates into ' +
          'render functions, or use the compiler-included build.',
          vm
        )
      } else {
        warn(
          'Failed to mount component: template or render function not defined.',
          vm
        )
      }
    }
  }
  callHook(vm, 'beforeMount')

  let updateComponent
  /* istanbul ignore if */
  if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
    updateComponent = () => {
      // TODO 性能记录主要用在哪里
      const name = vm._name
      const id = vm._uid
      const startTag = `vue-perf-start:${id}`
      const endTag = `vue-perf-end:${id}`

      mark(startTag)
      const vnode = vm._render()
      mark(endTag)
      measure(`vue ${name} render`, startTag, endTag)

      mark(startTag)
      vm._update(vnode, hydrating)
      mark(endTag)
      measure(`vue ${name} patch`, startTag, endTag)
    }
  } else {
    updateComponent = () => {
      vm._update(vm._render(), hydrating)
    }
  }

  // we set this to vm._watcher inside the watcher's constructor
  // since the watcher's initial patch may call $forceUpdate (e.g. inside child
  // component's mounted hook), which relies on vm._watcher being already defined
  new Watcher(vm, updateComponent, noop, {
    before () {
      if (vm._isMounted && !vm._isDestroyed) {
        callHook(vm, 'beforeUpdate')
      }
    }
  }, true /* isRenderWatcher */)
  hydrating = false

  // manually mounted instance, call mounted on self
  // mounted is called for render-created child components in its inserted hook
  if (vm.$vnode == null) {
    vm._isMounted = true
    callHook(vm, 'mounted')
  }
  return vm
}

export function updateChildComponent (
  vm: Component,
  propsData: ?Object,
  listeners: ?Object,
  parentVnode: MountedComponentVNode,
  renderChildren: ?Array<VNode>
) {
  if (process.env.NODE_ENV !== 'production') {
    isUpdatingChildComponent = true
  }

  // determine whether component has slot children
  // we need to do this before overwriting $options._renderChildren.
  // 在重写$options._renderChildren前，需要确定组件是否有插槽子级

  // check if there are dynamic scopedSlots (hand-written or compiled but with
  // dynamic slot names). Static scoped slots compiled from template has the
  // "$stable" marker.
  // 检查是否存在动态作用域插槽（手写或者编译，但是存在动态插槽名称）
  // 从template编译而来的静态作用域插槽，带有$stable标记

  // 父级的作用域插槽，形如：{ default: ..., $stable: true }
  const newScopedSlots = parentVnode.data.scopedSlots
  const oldScopedSlots = vm.$scopedSlots
  const hasDynamicScopedSlot = !!(
    // 新作用域插槽是非静态的
    (newScopedSlots && !newScopedSlots.$stable) ||
    // 旧作用域插槽不为空对象，且旧作用域插槽是非静态的
    (oldScopedSlots !== emptyObject && !oldScopedSlots.$stable) ||
    // 新作用域$key与旧作用域$key不相同
    (newScopedSlots && vm.$scopedSlots.$key !== newScopedSlots.$key)
  )

  // Any static slot children from the parent may have changed during parent's
  // update. Dynamic scoped slots may also have changed. In such cases, a forced
  // update is necessary to ensure correctness.
  // 在父级update时，任何来自父级的静态插槽子节点都有可能改变，动态作用域插槽也有可能改变
  // 这种情况下，有必要用一个强制的update来确保正确性
  const needsForceUpdate = !!(
    renderChildren ||               // has new static slots
    vm.$options._renderChildren ||  // has old static slots
    hasDynamicScopedSlot
  )

  vm.$options._parentVnode = parentVnode
  vm.$vnode = parentVnode // update vm's placeholder node without re-render

  if (vm._vnode) { // update child tree's parent
    vm._vnode.parent = parentVnode
  }
  vm.$options._renderChildren = renderChildren

  // update $attrs and $listeners hash
  // these are also reactive so they may trigger child update if the child
  // used them during render
  // 更新$attrs和$listeners
  // 这两个属性也是响应式的，所以如果子级在render时使用它们，它们有可能触发子级update
  vm.$attrs = parentVnode.data.attrs || emptyObject
  vm.$listeners = listeners || emptyObject

  // update props
  if (propsData && vm.$options.props) {
    toggleObserving(false)
    const props = vm._props
    const propKeys = vm.$options._propKeys || []
    for (let i = 0; i < propKeys.length; i++) {
      const key = propKeys[i]
      const propOptions: any = vm.$options.props // wtf flow?
      props[key] = validateProp(key, propOptions, propsData, vm)
    }
    toggleObserving(true)
    // keep a copy of raw propsData
    vm.$options.propsData = propsData
  }

  // update listeners
  listeners = listeners || emptyObject
  const oldListeners = vm.$options._parentListeners
  vm.$options._parentListeners = listeners
  updateComponentListeners(vm, listeners, oldListeners)

  // resolve slots + force update if has children
  if (needsForceUpdate) {
    vm.$slots = resolveSlots(renderChildren, parentVnode.context)
    vm.$forceUpdate()
  }

  if (process.env.NODE_ENV !== 'production') {
    isUpdatingChildComponent = false
  }
}

// 是否处于不活跃树中
// 向上查找最近的不活跃父级，找到了，则返回true；否则一直向上查找，没找到的话，返回false
function isInInactiveTree (vm) {
  while (vm && (vm = vm.$parent)) {
    if (vm._inactive) return true
  }
  return false
}

// TODO 分析vm._directInactive的步骤：1、不考虑嵌套的情况，直接设置当前以及子组件状态；2、考虑嵌套的2种情况；3、最后加上嵌套的第二种情况
export function activateChildComponent (vm: Component, direct?: boolean) {
  // 处理<keep-alive></keep-alive>包裹的直接组件
  if (direct) {
    vm._directInactive = false
    // 在嵌套keep-alive组件情况下
    // 1、如果父组件是不活跃状态，则不允许修改本keep-alive组件的状态为活跃
    if (isInInactiveTree(vm)) {
      return
    }
  } else if (vm._directInactive) {
    // 2、如果子组件已经被设置为不活跃状态，则在循环子组件时，不修改该子组件的状态为活跃
    return
  }
  // 不活跃状态 || 初始化状态，则将当前状态以及子组件状态改变为活跃状态，并调用activated钩子函数
  if (vm._inactive || vm._inactive === null) {
    vm._inactive = false
    for (let i = 0; i < vm.$children.length; i++) {
      activateChildComponent(vm.$children[i])
    }
    callHook(vm, 'activated')
  }
}

export function deactivateChildComponent (vm: Component, direct?: boolean) {
  // 处理<keep-alive></keep-alive>包裹的直接组件
  if (direct) {
    vm._directInactive = true
    // 在嵌套keep-alive组件情况下，如果父组件是不活跃状态，则不允许修改本组件的状态为不活跃
    if (isInInactiveTree(vm)) {
      return
    }
  }
  // 是活跃的组件，将不活跃标识设为true
  if (!vm._inactive) {
    vm._inactive = true
    // 循环设置子级为不活跃
    for (let i = 0; i < vm.$children.length; i++) {
      deactivateChildComponent(vm.$children[i])
    }
    callHook(vm, 'deactivated')
  }
}

// 调用生命周期钩子函数
export function callHook (vm: Component, hook: string) {
  // TODO
  // #7573 disable dep collection when invoking lifecycle hooks
  pushTarget()
  const handlers = vm.$options[hook]
  const info = `${hook} hook`
  if (handlers) {
    // 每个生命周期钩子函数都可以是数组
    for (let i = 0, j = handlers.length; i < j; i++) {
      invokeWithErrorHandling(handlers[i], vm, null, vm, info)
    }
  }
  /**
   为了能够在html这样使用：
   <child
     @hook:beforeCreate="handleChildBeforeCreate"
     @hook:created="handleChildCreated"
     @hook:mounted="handleChildMounted"
     @hook:生命周期钩子/>
   */
  // $emit内部有检测事件是否存在的逻辑。由于hook:这个特性用的比较少，每次直接$emit的话有点做无用功
  // 因此加个_hasHookEvent判断，如果html中有监听的话，才emit事件
  // 不用精确到每个事件名，毕竟比较少用
  if (vm._hasHookEvent) {
    vm.$emit('hook:' + hook)
  }
  popTarget()
}
