import Vue from './instance/index'
import { initGlobalAPI } from './global-api/index'
import { isServerRendering } from 'core/util/env'
import { FunctionalRenderContext } from 'core/vdom/create-functional-component'

// 为Vue构造函数添加全局的属性(http://hcysun.me/vue-design/appendix/vue-global-api.html)
initGlobalAPI(Vue)

// TODO 下式3个与ssr渲染相关的稍后再看
Object.defineProperty(Vue.prototype, '$isServer', {
  get: isServerRendering
})

Object.defineProperty(Vue.prototype, '$ssrContext', {
  get () {
    /* istanbul ignore next */
    return this.$vnode && this.$vnode.ssrContext
  }
})

// expose FunctionalRenderContext for ssr runtime helper installation
Object.defineProperty(Vue, 'FunctionalRenderContext', {
  value: FunctionalRenderContext
})

// 添加vue版本号，在script.js/config.js的rollup中的replace中会替换__VERSION__
Vue.version = '__VERSION__'

export default Vue
