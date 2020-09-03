/* @flow */
// 此js具体用处参考：/vue/packages/vue-template-compiler/README.md
// TODO vue-loader：https://vue-loader.vuejs.org/zh/
// TODO 解释下CSP限制：https://developer.mozilla.org/zh-CN/docs/Web/Security/CSP

export { parseComponent } from 'sfc/parser'
export { compile, compileToFunctions } from './compiler/index'
export { ssrCompile, ssrCompileToFunctions } from './server/compiler'
export { generateCodeFrame } from 'compiler/codeframe'
