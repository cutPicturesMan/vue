/* @flow */

import type VNode from 'core/vdom/vnode'

/**
 * Runtime helper for resolving raw children VNodes into a slot object.
 * 运行时的帮助函数，将原始的子节点VNode解析为slot对象
 */
export function resolveSlots (
  children: ?Array<VNode>,
  context: ?Component
): { [key: string]: Array<VNode> } {
  // children即VNode.componentOptions.children，用户可通过createElement()函数传入
  // 类型为Array、String，或者不传
  // 没有值 || 值为空，返回空对象
  if (!children || !children.length) {
    return {}
  }
  const slots = {}
  for (let i = 0, l = children.length; i < l; i++) {
    const child = children[i]
    const data = child.data
    /**
     * ast将命名<slot>、默认<slot>处理成如下格式，默认<slot>没有data参数
     * <test><span slot="foo">foo</span><span>默认</span></test>
     * _c('test',[
     *    _c('span',{attrs:{"slot":"foo"},slot:"foo"},[_v("foo")]),
     *    _c('span',[_v("默认")])
     * ])
     */
    // remove slot attribute if the node is resolved as a Vue slot node
    // 如果是<slot>节点，其slot属性只是表示该节点是<slot>节点，并不是真正的属性，因此需要删除attrs上的slot属性
    if (data && data.attrs && data.attrs.slot) {
      delete data.attrs.slot
    }
    // named slots should only be respected if the vnode was rendered in the
    // same context.
    // TODO 为什么要判断相同的context
    // 仅当在同一上下文中渲染vnode时，才认为是命名插槽
    // data.slot有可能是数字0，因此需要 != null
    if ((child.context === context || child.fnContext === context) &&
      data && data.slot != null
    ) {
      const name = data.slot
      const slot = (slots[name] || (slots[name] = []))
      if (child.tag === 'template') {
        slot.push.apply(slot, child.children || [])
      } else {
        slot.push(child)
      }
    } else {
      // 其余情况都是默认插槽
      (slots.default || (slots.default = [])).push(child)
    }
  }
  // ignore slots that contains only whitespace
  // 如果将空格、注释当做default slot，会导致default slot的默认内容不显示，因此要去掉
  // <test><div slot="first">1</div> <div slot="second">2</div></test>
  // TODO 为何除了default slot，named slot也要排除空格？
  for (const name in slots) {
    if (slots[name].every(isWhitespace)) {
      delete slots[name]
    }
  }
  return slots
}

function isWhitespace (node: VNode): boolean {
  // 注释节点（排除掉异步组件占位符） || 空白节点
  // TODO 为何要排除掉注释节点？注释节点好像并不会存在于ast树中？
  // TODO https://github.com/vuejs/vue/issues/7041
  return (node.isComment && !node.asyncFactory) || node.text === ' '
}
