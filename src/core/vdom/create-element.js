/* @flow */

import config from '../config'
import VNode, { createEmptyVNode } from './vnode'
import { createComponent } from './create-component'
import { traverse } from '../observer/traverse'

import {
  warn,
  isDef,
  isUndef,
  isTrue,
  isObject,
  isPrimitive,
  resolveAsset
} from '../util/index'

import {
  normalizeChildren,
  simpleNormalizeChildren
} from './helpers/index'

const SIMPLE_NORMALIZE = 1
const ALWAYS_NORMALIZE = 2
/**
 传入createElement的参数，实际上是vnode的主要属性。vnode结构如下：
 {
     tag: 'div'
     data: {
         class: 'test'
     },
     children: [
         {
             tag: 'span',
             data: {
                 class: 'demo'
             }
             children: 'hello,VNode'
         }
     ]
 }
 */
// wrapper function for providing a more flexible interface
// without getting yelled at by flow
export function createElement (
  context: Component,
  tag: any,
  data: any,
  children: any,
  normalizationType: any,
  alwaysNormalize: boolean
): VNode | Array<VNode> {
  // 兼容data不传值的情况
  // 当data不传值时，原本data位置的值（Object类型）变成了children的值（Array | String），其后的所有参数前移一位

  // 虽然文档上说children值的类型其中之一是String，但实际上支持所有基本类型，因为基本类型都能通过String()函数转化为String类型
  // https://cn.vuejs.org/v2/guide/render-function.html#createElement-参数
  if (Array.isArray(data) || isPrimitive(data)) {
    normalizationType = children
    children = data
    data = undefined
  }
  // alwaysNormalize为true时，表示通过调用render函数来渲染页面，需要标准化参数children
  if (isTrue(alwaysNormalize)) {
    normalizationType = ALWAYS_NORMALIZE
  }
  return _createElement(context, tag, data, children, normalizationType)
}

// 创建虚拟节点
export function _createElement (
  context: Component,
  tag?: string | Class<Component> | Function | Object,
  data?: VNodeData,
  children?: any,
  normalizationType?: number
): VNode | Array<VNode> {
  // 如果data已经observer了，则创建并返回空节点的vnode
  if (isDef(data) && isDef((data: any).__ob__)) {
    process.env.NODE_ENV !== 'production' && warn(
      `Avoid using observed data object as vnode data: ${JSON.stringify(data)}\n` +
      'Always create fresh vnode data objects in each render!',
      context
    )
    return createEmptyVNode()
  }

  // object syntax in v-bind
  // 如果是通过render函数创建的实例，需要特殊处理下data参数中的is
  // https://github.com/vuejs/vue/issues/5881
  /**
   TODO 通过options创建的vue，其options.data.is在哪里处理掉的？为何到这里没有了？

   new Vue({
    template: '<strong>{{is}}</strong>',
    data: {
      is: 'ccc'
    }
  }).$mount('#app')

   new Vue({
    render(h){
      return h(
        'div', {
          is: 'abc'
        })
    }
  }).$mount('#app')
   */
  if (isDef(data) && isDef(data.is)) {
    tag = data.is
  }
  // 标签名称不存在，则创建空节点
  // 对于组件来说，即is属性设为false（<component :is="false"></component>）
  if (!tag) {
    // in case of component :is set to falsy value
    return createEmptyVNode()
  }
  // warn against non-primitive key
  // 对于不是基本类型的key值，进行提示
  // TODO 文档上说key值限制为String/Number，这里为何却是检测范围更大的基本类型？
  if (process.env.NODE_ENV !== 'production' &&
    isDef(data) && isDef(data.key) && !isPrimitive(data.key)
  ) {
    // 这个if在非weex环境都会进入
    if (!__WEEX__ || !('@binding' in data.key)) {
      warn(
        'Avoid using non-primitive value as key, ' +
        'use string/number value instead.',
        context
      )
    }
  }

  // support single function children as default scoped slot
  /**
   * 如果children只包含一个函数，则作为默认的slot
   * https://cn.vuejs.org/v2/guide/render-function.html#插槽
   props: ['message'],
   render: function (createElement) {
     // `<div><slot :text="message"></slot></div>`
     return createElement('div', [
       this.$scopedSlots.default({
         text: this.message
       })
     ])
   }
   */
  if (Array.isArray(children) &&
    typeof children[0] === 'function'
  ) {
    data = data || {}
    data.scopedSlots = { default: children[0] }
    children.length = 0
  }
  // 自行编写render函数时，需要标准化子元素
  if (normalizationType === ALWAYS_NORMALIZE) {
    children = normalizeChildren(children)
  } else if (normalizationType === SIMPLE_NORMALIZE) {
    // 内部调用render函数时，将二维children（可以确保是二维数组）打平成一维数组
    children = simpleNormalizeChildren(children)
  }
  let vnode, ns
  if (typeof tag === 'string') {
    let Ctor
    ns = (context.$vnode && context.$vnode.ns) || config.getTagNamespace(tag)
    // 如果tag是平台保留标签，则直接创建VNode对象
    if (config.isReservedTag(tag)) {
      // platform built-in elements
      vnode = new VNode(
        config.parsePlatformTagName(tag), data, children,
        undefined, undefined, context
      )
    } else if ((!data || !data.pre) && isDef(Ctor = resolveAsset(context.$options, 'components', tag))) {
      // component
      /**
       在options.components以及全局组件列表中，查找对应的自定义组件名，如果找到了则实例化
       要避免对处于<pre>块或者v-pre块中的组件进行解析，处在pre中的元素，data.pre为true
       可将判断条件(!data || !data.pre)转为!(data && data.pre)，更好理解

       避免以下2种情况的解析
       1、
         Vue.component('vtest', { template: ` <div>Hello World</div>` })
         new Vue({
           template: '<div v-pre><vtest></vtest></div>',
         }).$mount('#app')

       2、
         Vue.component('vtest', { template: ` <div>Hello World</div>` })
         new Vue({
           render (h) {
             return h('vtest', {
               pre: true
             })
           }
         }).$mount('#app')
       */

      vnode = createComponent(Ctor, data, context, children, tag)
    } else {
      // unknown or unlisted namespaced elements
      // check at runtime because it may get assigned a namespace when its
      // parent normalizes children
      // 未知的或未列出命名空间的标签
      // 在运行时检查命名空间，因为当父级规范化子级的时候，有可能赋值命名空间
      // TODO 什么是命名空间？runtime为什么会有可能赋值命名空间？
      vnode = new VNode(
        tag, data, children,
        undefined, undefined, context
      )
    }
  } else {
    // direct component options / constructor
    vnode = createComponent(tag, data, context, children)
  }
  if (Array.isArray(vnode)) {
    return vnode
  } else if (isDef(vnode)) {
    if (isDef(ns)) applyNS(vnode, ns)
    if (isDef(data)) registerDeepBindings(data)
    return vnode
  } else {
    return createEmptyVNode()
  }
}

function applyNS (vnode, ns, force) {
  vnode.ns = ns
  if (vnode.tag === 'foreignObject') {
    // use default namespace inside foreignObject
    ns = undefined
    force = true
  }
  if (isDef(vnode.children)) {
    for (let i = 0, l = vnode.children.length; i < l; i++) {
      const child = vnode.children[i]
      if (isDef(child.tag) && (
        isUndef(child.ns) || (isTrue(force) && child.tag !== 'svg'))) {
        applyNS(child, ns, force)
      }
    }
  }
}

// ref #5318
// necessary to ensure parent re-render when deep bindings like :style and
// :class are used on slot nodes
function registerDeepBindings (data) {
  if (isObject(data.style)) {
    traverse(data.style)
  }
  if (isObject(data.class)) {
    traverse(data.class)
  }
}
