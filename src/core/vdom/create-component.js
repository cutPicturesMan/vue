/* @flow */

import VNode from './vnode'
import { resolveConstructorOptions } from 'core/instance/init'
import { queueActivatedComponent } from 'core/observer/scheduler'
import { createFunctionalComponent } from './create-functional-component'

import {
  warn,
  isDef,
  isUndef,
  isTrue,
  isObject
} from '../util/index'

import {
  resolveAsyncComponent,
  createAsyncPlaceholder,
  extractPropsFromVNodeData
} from './helpers/index'

import {
  callHook,
  activeInstance,
  updateChildComponent,
  activateChildComponent,
  deactivateChildComponent
} from '../instance/lifecycle'

import {
  isRecyclableComponent,
  renderRecyclableComponentTemplate
} from 'weex/runtime/recycle-list/render-component-template'

// inline hooks to be invoked on component VNodes during patch
// 在patch组件虚拟节点期间，内联钩子函数将被调用
const componentVNodeHooks = {
  init (vnode: VNodeWithData, hydrating: boolean): ?boolean {
    if (
      vnode.componentInstance &&
      !vnode.componentInstance._isDestroyed &&
      vnode.data.keepAlive
    ) {
      // kept-alive components, treat as a patch
      // TODO keep-alive特性待看
      const mountedNode: any = vnode // work around flow
      componentVNodeHooks.prepatch(mountedNode, mountedNode)
    } else {
      // 如果组件不存在或已销毁，则初始化新的Vue实例
      const child = vnode.componentInstance = createComponentInstanceForVnode(
        vnode,
        activeInstance
      )
      // 将组件实例挂载到页面上
      child.$mount(hydrating ? vnode.elm : undefined, hydrating)
    }
  },

  // diff操作之前进行的处理
  // 该组件本身没有被替换，而是被复用，才会调用此函数
  // 只需要根据传入的props、slots来更新子组件即可
  prepatch (oldVnode: MountedComponentVNode, vnode: MountedComponentVNode) {
    const options = vnode.componentOptions
    const child = vnode.componentInstance = oldVnode.componentInstance
    // TODO 未看完
    updateChildComponent(
      child,
      options.propsData, // updated props
      options.listeners, // updated listeners
      vnode, // new parent vnode
      options.children // new children
    )
  },

  // 在dom插入到页面之后调用，具体调用在patch.js中的invokeInsertHook()
  // TODO 待看
  insert (vnode: MountedComponentVNode) {
    const { context, componentInstance } = vnode
    if (!componentInstance._isMounted) {
      componentInstance._isMounted = true
      callHook(componentInstance, 'mounted')
    }
    if (vnode.data.keepAlive) {
      if (context._isMounted) {
        // vue-router#1212
        // During updates, a kept-alive component's child components may
        // change, so directly walking the tree here may call activated hooks
        // on incorrect children. Instead we push them into a queue which will
        // be processed after the whole patch process ended.
        queueActivatedComponent(componentInstance)
      } else {
        activateChildComponent(componentInstance, true /* direct */)
      }
    }
  },

  // TODO 待看
  destroy (vnode: MountedComponentVNode) {
    const { componentInstance } = vnode
    // 组件未被销毁
    if (!componentInstance._isDestroyed) {
      // 非keep-alive组件，直接销毁
      if (!vnode.data.keepAlive) {
        componentInstance.$destroy()
      } else {
        // keep-alive组件，进入deactivated状态
        deactivateChildComponent(componentInstance, true /* direct */)
      }
    }
  }
}

const hooksToMerge = Object.keys(componentVNodeHooks)

/**
 创建组件，参数Ctor最终将被Vue.extend()处理
 */
export function createComponent (
  Ctor: Class<Component> | Function | Object | void,
  data: ?VNodeData,
  context: Component,
  children: ?Array<VNode>,
  tag?: string
): VNode | Array<VNode> | void {
  if (isUndef(Ctor)) {
    return
  }

  const baseCtor = context.$options._base

  // plain options object: turn it into a constructor
  // Ctor是Object类型，即options，则使用Vue.extend()转化为构造函数
  // 剩余的步骤处理构造函数即可
  if (isObject(Ctor)) {
    Ctor = baseCtor.extend(Ctor)
  }

  // if at this stage it's not a constructor or an async component factory,
  // reject.
  /**
   到了这个阶段，Ctor必须是构造函数 或 Promise版的工厂函数(函数内部resolve了才会创建组件)。Promise函数使用示例如下

   https://cn.vuejs.org/v2/guide/components-dynamic-async.html#%E5%BC%82%E6%AD%A5%E7%BB%84%E4%BB%B6

   Vue.component('async-example', function (resolve, reject) {
      setTimeout(function () {
        // 向 `resolve` 回调传递组件定义
        resolve({
          template: '<div>I am async!</div>'
        })
      }, 1000)
    })
   */
  if (typeof Ctor !== 'function') {
    if (process.env.NODE_ENV !== 'production') {
      warn(`Invalid Component definition: ${String(Ctor)}`, context)
    }
    return
  }

  // async component
  let asyncFactory
  // 通过Vue.extend()创建的函数含有cid属性。没有cid属性，则不是Vue.extend()创建的，即异步函数
  if (isUndef(Ctor.cid)) {
    asyncFactory = Ctor
    Ctor = resolveAsyncComponent(asyncFactory, baseCtor)
    // 处于loading中，但是没有配置loading组件的异步组件
    if (Ctor === undefined) {
      // return a placeholder node for async component, which is rendered
      // as a comment node but preserves all the raw information for the node.
      // the information will be used for async server-rendering and hydration.
      // 为异步组件返回一个注释节点，该节点保存着节点的所有原始信息
      // 这些信息将用来异步服务端渲染和hydration？？？
      return createAsyncPlaceholder(
        asyncFactory,
        data,
        context,
        children,
        tag
      )
    }
  }

  data = data || {}

  // resolve constructor options in case global mixins are applied after
  // component constructor creation
  // 解析构造函数选项，用于Vue.mixins在组件构造函数创建之后调用的情况
  resolveConstructorOptions(Ctor)

  // transform component v-model data into props & events
  // 如果在组件上使用了v-model语法糖，则转化为props和events
  // <component v-model="xxx"></component>
  if (isDef(data.model)) {
    transformModel(Ctor.options, data)
  }

  // extract props
  const propsData = extractPropsFromVNodeData(data, Ctor, tag)

  // functional component
  // TODO 待看
  if (isTrue(Ctor.options.functional)) {
    return createFunctionalComponent(Ctor, propsData, data, context, children)
  }

  // extract listeners, since these needs to be treated as
  // child component listeners instead of DOM listeners
  // 提取侦听器，因为这些需要被视为子组件侦听器，而不是 DOM 侦听器
  const listeners = data.on
  // replace with listeners with .native modifier
  // so it gets processed during parent component patch.
  // data.on替换为.native修饰符的侦听器，以便在父组件patch期间处理它
  data.on = data.nativeOn

  if (isTrue(Ctor.options.abstract)) {
    // abstract components do not keep anything
    // other than props & listeners & slot
    // 抽象组件不需要保持任何东西，除了props、listeners、slot

    // work around flow
    // data上仅保留slot
    const slot = data.slot
    data = {}
    if (slot) {
      data.slot = slot
    }
  }

  // install component management hooks onto the placeholder node
  // 将组件管理挂钩安装到占位符节点上
  installComponentHooks(data)

  // return a placeholder vnode
  const name = Ctor.options.name || tag
  const vnode = new VNode(
    `vue-component-${Ctor.cid}${name ? `-${name}` : ''}`,
    data, undefined, undefined, undefined, context,
    { Ctor, propsData, listeners, tag, children },
    asyncFactory
  )

  // Weex specific: invoke recycle-list optimized @render function for
  // extracting cell-slot template.
  // https://github.com/Hanks10100/weex-native-directive/tree/master/component
  /* istanbul ignore if */
  if (__WEEX__ && isRecyclableComponent(vnode)) {
    return renderRecyclableComponentTemplate(vnode)
  }

  return vnode
}

// 根据虚拟dom创建组件实例
export function createComponentInstanceForVnode (
  vnode: any, // we know it's MountedComponentVNode but flow doesn't
  parent: any, // activeInstance in lifecycle state
): Component {
  const options: InternalComponentOptions = {
    _isComponent: true,
    _parentVnode: vnode,
    parent
  }
  // check inline-template render functions
  const inlineTemplate = vnode.data.inlineTemplate
  if (isDef(inlineTemplate)) {
    options.render = inlineTemplate.render
    options.staticRenderFns = inlineTemplate.staticRenderFns
  }
  return new vnode.componentOptions.Ctor(options)
}

function installComponentHooks (data: VNodeData) {
  const hooks = data.hook || (data.hook = {})
  for (let i = 0; i < hooksToMerge.length; i++) {
    // init、prepatch、insert、destroy
    const key = hooksToMerge[i]
    // TODO data.hook表示的是父级钩子函数？
    const existing = hooks[key]
    // 默认钩子函数
    const toMerge = componentVNodeHooks[key]
    // 避免当组件共享相同的数据对象时，组件被复制
    // https://github.com/vuejs/vue/issues/7805
    // /test/unit/modules/vdom/patch/edge-cases.spec.js #7805
    // 钩子函数不同 && 针对以下2种情况进行赋值：1、根本没有父级钩子，则对应钩子函数为内部钩子；2、父级钩子存在且一次都未合并，则将其与内部钩子合并
    if (existing !== toMerge && !(existing && existing._merged)) {
      // 合并自定义钩子函数
      hooks[key] = existing ? mergeHook(toMerge, existing) : toMerge
    }
  }
}

function mergeHook (f1: any, f2: any): Function {
  const merged = (a, b) => {
    // flow complains about extra args which is why we use any
    f1(a, b)
    f2(a, b)
  }
  // 钩子函数是否被合并
  merged._merged = true
  return merged
}

// transform component v-model info (value and callback) into
// prop and event handler respectively.
// 将组件的options.model分别转换为prop、event
function transformModel (options, data: any) {
  const prop = (options.model && options.model.prop) || 'value'
  const event = (options.model && options.model.event) || 'input'
  // TODO https://github.com/vuejs/vue/issues/9330
  ;(data.attrs || (data.attrs = {}))[prop] = data.model.value
  const on = data.on || (data.on = {})
  const existing = on[event]
  const callback = data.model.callback
  // TODO https://github.com/vuejs/vue/issues/8436
  if (isDef(existing)) {
    if (
      Array.isArray(existing)
        ? existing.indexOf(callback) === -1
        : existing !== callback
    ) {
      on[event] = [callback].concat(existing)
    }
  } else {
    on[event] = callback
  }
}
