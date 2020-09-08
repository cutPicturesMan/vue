/* @flow */

import { parse } from './parser/index'
import { optimize } from './optimizer'
import { generate } from './codegen/index'
import { createCompilerCreator } from './create-compiler'

// `createCompilerCreator` allows creating compilers that use alternative
// parser/optimizer/codegen, e.g the SSR optimizing compiler.
// Here we just export a default compiler using the default parts.

/*
 整体流程：
  -> template字符串
  -> parse（获得ast）
  -> optimize（优化ast）
  -> generate（生成render字符串）
  -> compiler（生成render函数）
  -> render（生成vnode）
  -> patch（比较vnode）
  -> update（更新页面）
  -> 渲染到页面？

  TODO AST和VNode有啥差别
 */
export const createCompiler = createCompilerCreator(function baseCompile (
  template: string,
  options: CompilerOptions
): CompiledResult {
  const ast = parse(template.trim(), options)
  if (options.optimize !== false) {
    optimize(ast, options)
  }
  const code = generate(ast, options)
  return {
    ast,
    render: code.render,
    staticRenderFns: code.staticRenderFns
  }
})
