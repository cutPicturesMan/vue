/* @flow */

import { _Set as Set, isObject } from '../util/index'
import type { SimpleSet } from '../util/index'
import VNode from '../vdom/vnode'

const seenObjects = new Set()

/**
 * Recursively traverse an object to evoke all converted
 * getters, so that every nested property inside the object
 * is collected as a "deep" dependency.
 */
// 递归地访问对象的每个属性，通过每个属性的getter，将当前watcher添加到每个属性（对象/数组）的全局dep中
export function traverse (val: any) {
  _traverse(val, seenObjects)
  seenObjects.clear()
}

function _traverse (val: any, seen: SimpleSet) {
  let i, keys
  const isA = Array.isArray(val)
  // 既不是数组，也不是对象 || 所有属性不可配置 || 从VNode节点继承
  if ((!isA && !isObject(val)) || Object.isFrozen(val) || val instanceof VNode) {
    return
  }
  // 该对象已被监听
  if (val.__ob__) {
    const depId = val.__ob__.dep.id
    // 该对象已经处理过
    if (seen.has(depId)) {
      return
    }
    seen.add(depId)
  }
  // 数组
  if (isA) {
    i = val.length
    // 访问数组中每个值的getter
    while (i--) _traverse(val[i], seen)
  } else {
    // 对象
    keys = Object.keys(val)
    i = keys.length
    // 最后再访问key调用getter
    while (i--) _traverse(val[keys[i]], seen)
  }
}
