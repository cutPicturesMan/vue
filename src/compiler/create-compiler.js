/* @flow */

import { extend } from 'shared/util'
import { detectErrors } from './error-detector'
import { createCompileToFunctionFn } from './to-function'

// 由于web、server端的编译方式不同，因此将不同的编译部分用参数的形式传入
export function createCompilerCreator (baseCompile: Function): Function {
  // Vue有以下两种版本：
  // 1、完整版：运行时+编译器。此版本需要将html模板编译成render函数，使用下面的compileToFunctions方法（由于该方法使用了new Function，受限于CSP策略，无法在这些环境下使用）
  // 2、只有运行时。此时html模板已经预编译成render函数，可以在CSP环境中完美运行
  // TODO 为啥可以完美运行？既然说是编译成render函数，如果用的是createCompileToFunctionFn方法，就会有CSP限制，难道运行时的html模板编译与完整版的不同？。分析下vue-loader是如何编译.vue文件的
  return function createCompiler (baseOptions: CompilerOptions) {
    function compile (
      template: string,
      options?: CompilerOptions
    ): CompiledResult {
      const finalOptions = Object.create(baseOptions)
      const errors = []
      const tips = []

      let warn = (msg, range, tip) => {
        (tip ? tips : errors).push(msg)
      }

      if (options) {
        if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
          // 前导空格
          // $flow-disable-line
          const leadingSpaceLength = template.match(/^\s*/)[0].length

          warn = (msg, range, tip) => {
            const data: WarningMessage = { msg }
            if (range) {
              if (range.start != null) {
                data.start = range.start + leadingSpaceLength
              }
              if (range.end != null) {
                data.end = range.end + leadingSpaceLength
              }
            }
            (tip ? tips : errors).push(data)
          }
        }
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

      finalOptions.warn = warn

      const compiled = baseCompile(template.trim(), finalOptions)
      if (process.env.NODE_ENV !== 'production') {
        detectErrors(compiled.ast, warn)
      }
      compiled.errors = errors
      compiled.tips = tips
      return compiled
    }

    return {
      // 将模板字符串编译成js代码
      compile,
      // 将compile编译的js代码用一个函数包裹，即render函数
      compileToFunctions: createCompileToFunctionFn(compile)
    }
  }
}
