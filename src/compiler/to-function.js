/* @flow */

import { noop, extend } from 'shared/util'
import { warn as baseWarn, tip } from 'core/util/debug'
import { generateCodeFrame } from './codeframe'

type CompiledFunctionResult = {
  render: Function;
  staticRenderFns: Array<Function>;
};

// 使用new Function()对表达式code求值
// 有些环境，如 Google Chrome Apps，会强制应用内容安全策略 (CSP)，不能使用 new Function() 对表达式求值。这时可以用 CSP 兼容版本。完整版本依赖于该功能来编译模板，所以无法在这些环境下使用。
// https://cn.vuejs.org/v2/guide/installation.html#CSP-%E7%8E%AF%E5%A2%83
function createFunction (code, errors) {
  try {
    return new Function(code)
  } catch (err) {
    errors.push({ err, code })
    return noop
  }
}

export function createCompileToFunctionFn (compile: Function): Function {
  const cache = Object.create(null)

  // Vue.compile = compileToFunctions
  return function compileToFunctions (
    template: string,
    options?: CompilerOptions,
    vm?: Component
  ): CompiledFunctionResult {
    // TODO 以下3行是为了处理ssr内部模板错误？
    options = extend({}, options)
    const warn = options.warn || baseWarn
    delete options.warn

    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production') {
      // detect possible CSP restriction
      // TODO 了解CSP https://developers.google.com/web/fundamentals/security/csp/?hl=zh-cn#top_of_page
      try {
        new Function('return 1')
      } catch (e) {
        if (e.toString().match(/unsafe-eval|CSP/)) {
          // 在使用预编译的时候（vue-loader 或 vueify），会自动把第一遍编译生成的代码进行一次额外处理，用完整的 AST 分析来处理作用域，把 with 拿掉，顺便支持模板中的 ES2015 语法
          // TODO 预编译里还存在new Function吗？先去看vue-loader了
          warn(
            'It seems you are using the standalone build of Vue.js in an ' +
            'environment with Content Security Policy that prohibits unsafe-eval. ' +
            'The template compiler cannot work in this environment. Consider ' +
            'relaxing the policy to allow unsafe-eval or pre-compiling your ' +
            'templates into render functions.'
          )
        }
      }
    }

    // check cache
    // 由于相同模板的插入分隔符delimiters可能不同，因此要把delimiters带上，模板才是唯一的
    // https://cn.vuejs.org/v2/api/#delimiters
    const key = options.delimiters
      // 将delimiters数组转为逗号分隔的字符串的2种方法
      // 1、对象（包括数组）转为字符串的过程：如果值有valueOf()方法并且返回基本类型值，就使用该值进行强制类型转换；如果没有，就使用toString()的返回值来进行强制类型转换。数组的默认toString()方法经过了重新定义，将所有单元字符串化以后再用","连接起来
      // 2、[xxx].join(',')
      ? String(options.delimiters) + template
      : template
    if (cache[key]) {
      return cache[key]
    }

    // compile
    // 编译template模板
    const compiled = compile(template, options)

    // check compilation errors/tips
    // 检查编译是否出错/提示
    if (process.env.NODE_ENV !== 'production') {
      // 编译有错误，则提示
      if (compiled.errors && compiled.errors.length) {
        // 是否显示错误代码的开始结束区间
        if (options.outputSourceRange) {
          compiled.errors.forEach(e => {
            warn(
              `Error compiling template:\n\n${e.msg}\n\n` +
              generateCodeFrame(template, e.start, e.end),
              vm
            )
          })
        } else {
          warn(
            `Error compiling template:\n\n${template}\n\n` +
            compiled.errors.map(e => `- ${e}`).join('\n') + '\n',
            vm
          )
        }
      }
      if (compiled.tips && compiled.tips.length) {
        if (options.outputSourceRange) {
          compiled.tips.forEach(e => tip(e.msg, vm))
        } else {
          compiled.tips.forEach(msg => tip(msg, vm))
        }
      }
    }

    // turn code into functions
    const res = {}
    const fnGenErrors = []
    res.render = createFunction(compiled.render, fnGenErrors)
    res.staticRenderFns = compiled.staticRenderFns.map(code => {
      return createFunction(code, fnGenErrors)
    })

    // check function generation errors.
    // this should only happen if there is a bug in the compiler itself.
    // mostly for codegen development use
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production') {
      if ((!compiled.errors || !compiled.errors.length) && fnGenErrors.length) {
        warn(
          `Failed to generate render function:\n\n` +
          fnGenErrors.map(({ err, code }) => `${err.toString()} in\n\n${code}\n`).join('\n'),
          vm
        )
      }
    }

    return (cache[key] = res)
  }
}
