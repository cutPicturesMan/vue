/* @flow */

import { makeMap, isBuiltInTag, cached, no } from 'shared/util'

let isStaticKey
let isPlatformReservedTag

const genStaticKeysCached = cached(genStaticKeys)

/**
 * Goal of the optimizer: walk the generated template AST tree
 * and detect sub-trees that are purely static, i.e. parts of
 * the DOM that never needs to change.
 *
 * Once we detect these sub-trees, we can:
 *
 * 1. Hoist them into constants, so that we no longer need to
 *    create fresh nodes for them on each re-render;
 * 2. Completely skip them in the patching process.
 *
 * 优化器目标：遍历生成的模板ast树，查找纯静态子树。即一部分dom永远不需要改变
 *
 * 一旦找这些静态子树，我们可以：
 * 1、将静态子树提升为常量，这样我们就不再需要在每一个重新渲染中为其创建刷新节点
 * 2、完全跳过patching处理过程
 */
export function optimize (root: ?ASTElement, options: CompilerOptions) {
  if (!root) return
  // options.staticKeys = 'staticClass,staticStyle'
  isStaticKey = genStaticKeysCached(options.staticKeys || '')
  isPlatformReservedTag = options.isReservedTag || no
  // first pass: mark all non-static nodes.
  // 第一步：标记所有非静态节点
  markStatic(root)
  // second pass: mark static roots.
  // 第二步：标记静态根节点
  // ast树的根节点肯定没有v-for属性，因此这里是false
  markStaticRoots(root, false)
}

// 静态节点拥有的所有静态属性
// TODO 分析下为何是这些属性
function genStaticKeys (keys: string): Function {
  return makeMap(
    'type,tag,attrsList,attrsMap,plain,parent,children,attrs,start,end,rawAttrsMap' +
    (keys ? ',' + keys : '')
  )
}

// 标记非静态节点
/**
  <div>
    <p v-if="xxx"></p>
    <p v-else-if="xxx"></p>
    <p v-else></p>
  </div>
 * @param node
 */
function markStatic (node: ASTNode) {
  node.static = isStatic(node)
  /**
   * node.type为2、3时是可以直接判断是否是静态节点
   * 但是node.type为1时，如果当前节点被判断为静态节点，而其子节点是动态节点时，子节点就不会重新渲染了
   * 因此需要判断子节点的动态情况，反过来得出当前节点的静态情况
   */
  if (node.type === 1) {
    // do not make component slot content static. this avoids
    // 1. components not able to mutate slot nodes
    // 2. static slot content fails for hot-reloading
    // 不要将组件的slot内容标记为静态，这样可以避免：
    // 1、组件无法转变slot节点
    // 2、热重载静态slot内容失败

    // 不需要通过子节点来判断当前节点是否为静态的情况
    if (
      // 不是html或svg标签，即表示所有内置组件 + 自定义组件
      !isPlatformReservedTag(node.tag) &&
      // TODO 将内容传入<slot>标签，然后判断其子节点是否是静态节点？
      // 排除掉内置组件中的<slot>标签，避免：
      // 1、组件无法改变<slot>节点
      // 2、静态<slot>节点的内容无法热重载
      node.tag !== 'slot' &&
      // 不含有inline-template属性的组件，即非内联模板组件，可以直接判断其为非静态属性，不需要对子级进行判断
      // 含有inline-template属性的组件，还是要根据子级来判断的
      node.attrsMap['inline-template'] == null
    ) {
      return
    }
    // 判断子节点是否是静态
    for (let i = 0, l = node.children.length; i < l; i++) {
      const child = node.children[i]
      markStatic(child)
      // 子节点非静态，当前节点要改为非静态
      if (!child.static) {
        node.static = false
      }
    }
    // node.ifConditions包含同级节点，每个同级节点还有可能包含子元素，需要进行优化
    if (node.ifConditions) {
      // 循环除了if之外的条件判断
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        const block = node.ifConditions[i].block
        markStatic(block)
        // TODO 个人认为，v-if节点在isStatic函数的判断中，由于存在非静态属性if，因此肯定是非静态节点，这里就不需要再设置为false了
        if (!block.static) {
          node.static = false
        }
      }
    }
  }
}

// 将子元素都是静态元素的节点，打上"静态根节点"的标记
function markStaticRoots (node: ASTNode, isInFor: boolean) {
  if (node.type === 1) {
    // 如果是静态节点或v-once节点，需要判断是否处在v-for循环中，防止重用导致问题
    // https://github.com/vuejs/vue/issues/3406
    if (node.static || node.once) {
      node.staticInFor = isInFor
    }
    // For a node to qualify as a static root, it should have children that
    // are not just static text. Otherwise the cost of hoisting out will
    // outweigh the benefits and it's better off to just always render it fresh.
    // 如果一个节点只有一个静态文本子节点，则不把该节点标记为静态根节点
    // 因为处理该节点的开销会大于收益，还不如每次重新渲染

    // 节点及其子节点都是静态的 && 节点含有子节点 && 子节点不是仅有的一个静态文本节点
    if (node.static && node.children.length && !(
      node.children.length === 1 &&
      node.children[0].type === 3
    )) {
      node.staticRoot = true
      // 该节点已经标记为静态根节点了，无需再处理其子元素
      return
    } else {
      node.staticRoot = false
    }
    // 递归判断子节点
    if (node.children) {
      for (let i = 0, l = node.children.length; i < l; i++) {
        markStaticRoots(node.children[i], isInFor || !!node.for)
      }
    }
    // 循环处理if的情况
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
    // v-else(-if)的节点信息会放在v-if节点的ifConditions数组中
    !node.if && !node.for && // not v-if or v-for or v-else
    // 不是<component>、<slot>标签
    !isBuiltInTag(node.tag) && // not a built-in
    // 是html标签 || svg标签
    // 即isReservedTag函数，src/platforms/web/util/element.js
    // TODO 如果可以确定是html或者svg标签，为何还要进行isBuiltInTag()判断？
    isPlatformReservedTag(node.tag) && // not a component
    // 不是<template v-for>标签的直接子元素
    !isDirectChildOfTemplateFor(node) &&
    // 节点上的属性必须存在于静态属性列表中
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
