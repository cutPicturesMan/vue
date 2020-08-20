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
 TODO 下面的文字"hello,VNode"应该是一个单独的children，而不是text
 <div class="test">
  <span class="demo">hello,VNode</span>
 </div>
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
             },
             text: 'hello,VNode'
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
  // 【兼容data不传值的情况】当data不传值时，原本data位置的值（Object类型）变成了children的值（Array | String），其后的所有参数前移一位

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
  // TODO 为何用已经observed的对象作为data会造成渲染死循环？
  if (isDef(data) && isDef((data: any).__ob__)) {
    process.env.NODE_ENV !== 'production' && warn(
      `Avoid using observed data object as vnode data: ${JSON.stringify(data)}\n` +
      'Always create fresh vnode data objects in each render!',
      context
    )
    return createEmptyVNode()
  }

  // object syntax in v-bind
  // 如果html标签存在is属性，则将其作为标签名
  // <div :is="ttt">test</div>
  // https://cn.vuejs.org/v2/guide/components.html#动态组件
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
  // 是因为在checkDuplicateKeys函数中，data.key作为对象的key值，会被转成String/Number，而Object、Null、Undefined转了之后无法分辨是否是同一个值？
  // 属性名称必须是字符串或符号 Symbol。这意味着非字符串对象不能用来作为一个对象属性的键。任何非字符串对象，包括 Number，都会通过 toString 方法，被转换成一个字符串
  // TODO 归纳下对象属性名的存取限制
  // TODO https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Guide/Working_with_Objects
  // TODO https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Operators/Property_Accessors
  if (process.env.NODE_ENV !== 'production' &&
    isDef(data) && isDef(data.key) && !isPrimitive(data.key)
  ) {
    if (!__WEEX__ || !('@binding' in data.key)) {
      // 这个if在非weex环境都会进入
      warn(
        'Avoid using non-primitive value as key, ' +
        'use string/number value instead.',
        context
      )
    }
  }


  /**
   TODO 介绍下面的概念
   1、插槽<slot>的用法
   2、具名插槽
   3、作用域插槽：让插槽内容能够访问子组件中才有的数据
   4、render函数中的slot写法：https://cn.vuejs.org/v2/guide/render-function.html#插槽

   new Vue({
      template: `<div>
        <test>
          <template v-slot:header>
            <h1>Here might be a page title</h1>
          </template>

          <p>A paragraph for the main content.</p>
          <p>And another one.</p>

          <template v-slot:footer="{ cname }">
            <div>作用域插槽的值：{{cname}}</div>
            <p>Here's some contact info</p>
          </template>
        </test>
      </div>`,
      components: {
        test: {
          template: `<div>
            <div class="container">
              <header>
                <div>header----------</div>
                <slot name="header"></slot>
              </header>
              <main>
                <div>main----------</div>
                <slot></slot>
              </main>
              <footer>
                <div>footer----------{{cname}}</div>
                <slot name="footer" :cname="cname"></slot>
              </footer>
            </div>
          </div>`,
          data () {
            return {
              cname: 'inner'
            };
          }
        }
      },
    }).$mount('#app1')
   */

  // support single function children as default scoped slot
  // TODO【为何要这么做】如果children数组的第一个元素为函数时，将其作为默认的作用域插槽，并删除所有子节点
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
    // 获取标签命名空间，有以下一种特殊情况：当存在父级命名空间时，则直接使用父级的命名空间
    // 对于组件内的<a>标签来说，由于组件有可能渲染在常规标签或<svg>标签中，单靠config.getTagNamespace()无法判断当前<a>标签的命名空间，需要靠父级来判断
    // https://github.com/vuejs/vue/issues/6506
    // https://developer.mozilla.org/zh-CN/docs/Web/SVG/Element/a
    ns = (context.$vnode && context.$vnode.ns) || config.getTagNamespace(tag)
    // 如果tag是平台保留标签，则直接创建VNode对象
    if (config.isReservedTag(tag)) {
      // platform built-in elements
      // .native修饰符是用在组件上，不能用在原生html标签上
      if (process.env.NODE_ENV !== 'production' && isDef(data) && isDef(data.nativeOn)) {
        warn(
          `The .native modifier for v-on is only valid on components but it was used on <${tag}>.`,
          context
        )
      }
      vnode = new VNode(
        config.parsePlatformTagName(tag), data, children,
        undefined, undefined, context
      )
    } else if ((!data || !data.pre) && isDef(Ctor = resolveAsset(context.$options, 'components', tag))) {
      // component
      // 渲染组件
      // 跳过v-pre内的节点 && 该节点名称在局部组件、全局组件中有找到对应的短横线、驼峰式名称，则渲染为组件
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
      vnode = new VNode(
        tag, data, children,
        undefined, undefined, context
      )
    }
  } else {
    // direct component options / constructor
    /**
     tag参数有3种情况：
      1、String，上面处理了
      2、Object，即组件的options
      3、Vue.extend()返回的构造器
          new Vue({
            render: function(h){
              return h(Vue.extend({
                template: '<div>test</div>'
              }))
            }
          }).$mount('#app');
     */
    vnode = createComponent(tag, data, context, children)
  }
  // TODO https://github.com/vuejs/vue/issues/7292#issue-283588912
  /*
   html标签可能为：
    1、浏览器内置标签
    2、组件标签
      2.1 常规组件
      2.2 异步组件
      2.3 函数式组件
    3、未知标签
   */
  // 函数式组件有可能返回数组格式的vnode
  // TODO 由于函数式组件没有其他需要处理的，因此直接返回vnode？
  if (Array.isArray(vnode)) {
    return vnode
  } else if (isDef(vnode)) {
    // vnode有值，则处理
    if (isDef(ns)) applyNS(vnode, ns)
    if (isDef(data)) registerDeepBindings(data)
    return vnode
  } else {
    // vnode为null、undefined，则创建空节点
    return createEmptyVNode()
  }
}

// 设置元素的命名空间
function applyNS (vnode, ns, force) {
  // 设置当前元素的命名空间
  vnode.ns = ns
  // <foreignObject>元素可以包含不同的XML命名空间，因此不再指定其子级的命名空间
  if (vnode.tag === 'foreignObject') {
    // use default namespace inside foreignObject
    ns = undefined
    // 如果子元素的命名空间已设置，则强制还原为默认命名空间
    // TODO <foreignObject>下的<p>命名空间错误的显示为svg：https://github.com/vuejs/vue/issues/6642
    force = true
  }
  // 设置子元素的命名空间
  if (isDef(vnode.children)) {
    for (let i = 0, l = vnode.children.length; i < l; i++) {
      const child = vnode.children[i]
      // 子标签存在的情况下，进行如下2种处理：
      // 1、子标签的ns未定义，则设置为对应的ns
      // 2、该子标签的ns已定义，且处于<foreignObject>下 && 该子标签不是<svg>，则强制设置命名空间为undefined。即将<foreignObject>下的非<svg>子标签的ns设置为undefined
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
// 在slot节点上使用深度绑定（如:style、:class）时，必须确保父元素重新渲染
// test/unit/features/directives/style.spec.js
function registerDeepBindings (data) {
  if (isObject(data.style)) {
    traverse(data.style)
  }
  if (isObject(data.class)) {
    traverse(data.class)
  }
}
