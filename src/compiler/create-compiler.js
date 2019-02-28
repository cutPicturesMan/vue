/* @flow */

import { extend } from 'shared/util'
import { detectErrors } from './error-detector'
import { createCompileToFunctionFn } from './to-function'

// TODO 为了精简代码，createCompilerCreator函数采用闭包的方式，将共有的处理部分，放到了createCompiler之中
// 讲解顺序为：闭包 -> 闭包例子 -> 这里这么写的原因
export function createCompilerCreator (baseCompile: Function): Function {
  return function createCompiler (baseOptions: CompilerOptions) {
    function compile (
      template: string,
      options?: CompilerOptions
    ): CompiledResult {
      const finalOptions = Object.create(baseOptions)
      const errors = []
      const tips = []
      finalOptions.warn = (msg, tip) => {
        (tip ? tips : errors).push(msg)
      }

      if (options) {
        // merge custom modules
        if (options.modules) {
          finalOptions.modules =
            (baseOptions.modules || []).concat(options.modules)
        }
        // merge custom directives
        if (options.directives) {
          // 需要复制原型链上的属性，因此不能用Object.assign
          finalOptions.directives = extend(
            // TODO baseOptions.directives有可能含有原型链上的属性，因此不能用Object.assign，要用Object.create？
            Object.create(baseOptions.directives || null),
            options.directives
          )
        }
        // copy other options
        for (const key in options) {
          // TODO 为何options中modules、directives属性需要与baseOptions对象合并，而剩余的属性直接赋值即可？
          if (key !== 'modules' && key !== 'directives') {
            finalOptions[key] = options[key]
          }
        }
      }

      const compiled = baseCompile(template, finalOptions)
      if (process.env.NODE_ENV !== 'production') {
        // detectErrors函数返回的是一个数组，因此需要通过apply将数组分解成多个参数，再push进去
        errors.push.apply(errors, detectErrors(compiled.ast))
      }
      compiled.errors = errors
      compiled.tips = tips
      return compiled
    }

    return {
      compile,
      compileToFunctions: createCompileToFunctionFn(compile)
    }
  }
}
