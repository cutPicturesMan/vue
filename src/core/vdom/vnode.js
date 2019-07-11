/* @flow */

export default class VNode {
  tag: string | void;
  data: VNodeData | void;
  children: ?Array<VNode>;
  text: string | void;
  elm: Node | void;
  ns: string | void;
  context: Component | void; // rendered in this component's scope
  key: string | number | void;
  componentOptions: VNodeComponentOptions | void;
  componentInstance: Component | void; // component instance
  parent: VNode | void; // component placeholder node

  // strictly internal
  raw: boolean; // contains raw HTML? (server only)
  isStatic: boolean; // hoisted static node
  isRootInsert: boolean; // necessary for enter transition check
  isComment: boolean; // empty comment placeholder?
  isCloned: boolean; // is a cloned node?
  isOnce: boolean; // is a v-once node?
  asyncFactory: Function | void; // async component factory function
  asyncMeta: Object | void;
  isAsyncPlaceholder: boolean;
  ssrContext: Object | void;
  fnContext: Component | void; // real context vm for functional nodes
  fnOptions: ?ComponentOptions; // for SSR caching
  devtoolsMeta: ?Object; // used to store functional render context for devtools
  fnScopeId: ?string; // functional scope id support

  constructor (
    tag?: string,
    data?: VNodeData,
    children?: ?Array<VNode>,
    text?: string,
    elm?: Node,
    context?: Component,
    componentOptions?: VNodeComponentOptions,
    asyncFactory?: Function
  ) {
    // 标签名
    this.tag = tag
    // 数据对象，具体看flow/vnode.js
    this.data = data
    // 子标签数组
    this.children = children
    // 文本内容
    this.text = text
    // 当前虚拟节点对应的真实dom
    this.elm = elm
    // 名字空间
    this.ns = undefined
    // 编译作用域
    this.context = context
    // 函数化组件作用域
    this.fnContext = undefined
    //
    this.fnOptions = undefined
    //
    this.fnScopeId = undefined
    // key标识
    this.key = data && data.key
    // 组件option选项
    this.componentOptions = componentOptions
    // 当前对应的组件实例
    this.componentInstance = undefined
    // 父节点
    this.parent = undefined
    // 是否是原生HTML或只是普通文本，innerHTML的时候为true，textContent的时候为false
    this.raw = false
    // 是否是静态节点
    this.isStatic = false
    // 是否作为根节点插入，进入过渡时需要用到
    this.isRootInsert = true
    // 是否是注释节点
    this.isComment = false
    // 是否是克隆节点
    this.isCloned = false
    // 是否有v-once指令
    this.isOnce = false
    this.asyncFactory = asyncFactory
    this.asyncMeta = undefined
    this.isAsyncPlaceholder = false
  }

  // DEPRECATED: alias for componentInstance for backwards compat.
  /* istanbul ignore next */
  get child (): Component | void {
    return this.componentInstance
  }
}

// 创建空vnode节点
// TODO 这个节点渲染出来之后是注释？<!-- xxx -->
export const createEmptyVNode = (text: string = '') => {
  const node = new VNode()
  node.text = text
  node.isComment = true
  return node
}

// 创建文本节点
export function createTextVNode (val: string | number) {
  return new VNode(undefined, undefined, undefined, String(val))
}

// optimized shallow clone
// used for static nodes and slot nodes because they may be reused across
// multiple renders, cloning them avoids errors when DOM manipulations rely
// on their elm reference.
// 优化浅拷贝
// 主要用于静态节点和slot节点，因为他们可能多次渲染之间被重用
// 复制他们可以避免依赖于VNode.elm的DOM操作产生错误
export function cloneVNode (vnode: VNode): VNode {
  const cloned = new VNode(
    vnode.tag,
    vnode.data,
    // #7975
    // clone children array to avoid mutating original in case of cloning
    // a child.
    vnode.children && vnode.children.slice(),
    vnode.text,
    vnode.elm,
    vnode.context,
    vnode.componentOptions,
    vnode.asyncFactory
  )
  cloned.ns = vnode.ns
  cloned.isStatic = vnode.isStatic
  cloned.key = vnode.key
  cloned.isComment = vnode.isComment
  cloned.fnContext = vnode.fnContext
  cloned.fnOptions = vnode.fnOptions
  cloned.fnScopeId = vnode.fnScopeId
  cloned.asyncMeta = vnode.asyncMeta
  cloned.isCloned = true
  return cloned
}
