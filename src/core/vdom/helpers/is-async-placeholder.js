/* @flow */

// 是否是异步组件占位符
export function isAsyncPlaceholder (node: VNode): boolean {
  // 注释 && 有异步组件工厂函数
  return node.isComment && node.asyncFactory
}
