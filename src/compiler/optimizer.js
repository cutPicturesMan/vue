/* @flow */

import { makeMap, isBuiltInTag, cached, no } from 'shared/util'

let isStaticKey
let isPlatformReservedTag

const genStaticKeysCached = cached(genStaticKeys)

/**
 * 遍历ast树，查找静态子树，通过以下2点优化避免重新渲染静态子树的dom节点
 * 1、将静态子树提升为常量
 * 2、完全跳过patching处理过程
 * Goal of the optimizer: walk the generated template AST tree
 * and detect sub-trees that are purely static, i.e. parts of
 * the DOM that never needs to change.
 *
 * Once we detect these sub-trees, we can:
 *
 * 1. Hoist them into constants, so that we no longer need to
 *    create fresh nodes for them on each re-render;
 * 2. Completely skip them in the patching process.
 */
export function optimize (root: ?ASTElement, options: CompilerOptions) {
  if (!root) return
  isStaticKey = genStaticKeysCached(options.staticKeys || '')
  isPlatformReservedTag = options.isReservedTag || no
  // first pass: mark all non-static nodes.
  // 标记非静态节点
  markStatic(root)
  // second pass: mark static roots.
  // 为静态节点做上标记
  markStaticRoots(root, false)
}

// 静态节点拥有的所有静态属性
function genStaticKeys (keys: string): Function {
  return makeMap(
    'type,tag,attrsList,attrsMap,plain,parent,children,attrs,start,end,rawAttrsMap' +
    (keys ? ',' + keys : '')
  )
}

// 标记非静态节点
function markStatic (node: ASTNode) {
  node.static = isStatic(node)
  if (node.type === 1) {
    // do not make component slot content static. this avoids
    // 1. components not able to mutate slot nodes
    // 2. static slot content fails for hot-reloading
    // 不将组件<slot>标签的内容标记为静态，这样可以避免：
    // 1、组件无法改变<slot>节点
    // 2、无法热重载静态<slot>节点
    if (
      !isPlatformReservedTag(node.tag) &&
      node.tag !== 'slot' &&
      node.attrsMap['inline-template'] == null
    ) {
      return
    }
    for (let i = 0, l = node.children.length; i < l; i++) {
      const child = node.children[i]
      markStatic(child)
      if (!child.static) {
        node.static = false
      }
    }
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        const block = node.ifConditions[i].block
        markStatic(block)
        if (!block.static) {
          node.static = false
        }
      }
    }
  }
}

function markStaticRoots (node: ASTNode, isInFor: boolean) {
  if (node.type === 1) {
    if (node.static || node.once) {
      node.staticInFor = isInFor
    }
    // For a node to qualify as a static root, it should have children that
    // are not just static text. Otherwise the cost of hoisting out will
    // outweigh the benefits and it's better off to just always render it fresh.
    if (node.static && node.children.length && !(
      node.children.length === 1 &&
      node.children[0].type === 3
    )) {
      node.staticRoot = true
      return
    } else {
      node.staticRoot = false
    }
    if (node.children) {
      for (let i = 0, l = node.children.length; i < l; i++) {
        markStaticRoots(node.children[i], isInFor || !!node.for)
      }
    }
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        markStaticRoots(node.ifConditions[i].block, isInFor)
      }
    }
  }
}

// 判断是否是静态节点
function isStatic (node: ASTNode): boolean {
  // 含有字面量表达式的文本节点，肯定不是静态节点
  if (node.type === 2) { // expression
    return false
  }
  // 普通文本节点或注释节点，肯定是静态节点
  if (node.type === 3) { // text
    return true
  }
  // 剩余的需要判断node.type === 1，即节点为标签的情况，需要满足以下2种情况之一即为静态节点：
  // 1、v-pre
  return !!(node.pre || (
    // 2、不含有processAttrs()所处理的动态属性 &&
    !node.hasBindings && // no dynamic bindings
    // 标签不含有v-if、v-else-if、v-else和v-for指令
    !node.if && !node.for && // not v-if or v-for or v-else
    // 不是<component>、<slot>标签
    !isBuiltInTag(node.tag) && // not a built-in
    // 是html标签 || svg标签
    // 即isReservedTag函数，src/platforms/web/util/element.js
    // TODO 如果可以确定是html或者svg标签，为何还要进行isBuiltInTag()判断？
    isPlatformReservedTag(node.tag) && // not a component
    !isDirectChildOfTemplateFor(node) &&
    // 判断该节点的所有属性值是否是静态节点对应的属性值
    Object.keys(node).every(isStaticKey)
  ))
}

/**
 * 检查是否是<template v-for="item in list">的直接子元素
 * 以下2种情况符合：
 * 1、<template v-for="item in list"><div>child</div></template>
 * 2、<template v-for="item in list">
 *      <template><div>child</div></template>
 *    </template>
 * @param node
 * @returns {boolean}
 */
function isDirectChildOfTemplateFor (node: ASTElement): boolean {
  while (node.parent) {
    node = node.parent
    if (node.tag !== 'template') {
      return false
    }
    if (node.for) {
      return true
    }
  }
  return false
}
