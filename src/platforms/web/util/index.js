/* @flow */

import { warn } from 'core/util/index'

export * from './attrs'
export * from './class'
export * from './element'

/**
 * Query an element selector if it's not an element already.
 */
export function query (el: string | Element): Element {
  // 传入的是css选择器，则查找对应dom
  if (typeof el === 'string') {
    const selected = document.querySelector(el)
    if (!selected) {
      process.env.NODE_ENV !== 'production' && warn(
        'Cannot find element: ' + el
      )
      // 未找到指定节点，则返回新创建的<div>节点
      return document.createElement('div')
    }
    return selected
  } else {
    // 传入的是HTMLElement实例，则直接返回
    return el
  }
}
