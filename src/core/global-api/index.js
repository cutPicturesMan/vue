/* @flow */

import config from '../config'
import { initUse } from './use'
import { initMixin } from './mixin'
import { initExtend } from './extend'
import { initAssetRegisters } from './assets'
import { set, del } from '../observer/index'
import { ASSET_TYPES } from 'shared/constants'
import builtInComponents from '../components/index'

import {
  warn,
  extend,
  nextTick,
  mergeOptions,
  defineReactive
} from '../util/index'

// 为Vue构造函数添加全局的属性(http://hcysun.me/vue-design/appendix/vue-global-api.html)
export function initGlobalAPI (Vue: GlobalAPI) {
  // config
  // 为Vue构造函数添加只读的config属性
  const configDef = {}
  configDef.get = () => config
  if (process.env.NODE_ENV !== 'production') {
    configDef.set = () => {
      warn(
        'Do not replace the Vue.config object, set individual fields instead.'
      )
    }
  }
  Object.defineProperty(Vue, 'config', configDef)

  // exposed util methods.
  // NOTE: these are not considered part of the public API - avoid relying on
  // them unless you are aware of the risk.
  // 添加util属性对象，该属性并非公共API，应该避免使用
  Vue.util = {
    warn,
    extend,
    mergeOptions,
    defineReactive
  }

  // TODO 这3个方法不是在prototype上添加了吗？为什么要添加到vue实例上？
  Vue.set = set
  Vue.delete = del
  Vue.nextTick = nextTick

  /** 经过以下几个步骤，Vue.options从{}变为：
   Vue.options = {
      components: {
        // Transition、TransitionGroup组件在platform/runtime/runtime/index.js文件中被添加
        keepAlive,
      },
      directives: {
        // 平台化的指令model和show在platform/runtime/runtime/index.js文件中directives添加
      },
      filters: {},
      _base: Vue
   }
   */
  Vue.options = Object.create(null)
  ASSET_TYPES.forEach(type => {
    Vue.options[type + 's'] = Object.create(null)
  })

  // this is used to identify the "base" constructor to extend all plain-object
  // components with in Weex's multi-instance scenarios.
  // TODO _base只用于weex的多实例脚本？
  Vue.options._base = Vue

  // 将内置组件（目前只有keepAlive）添加到components中
  extend(Vue.options.components, builtInComponents)

  // 以下4个步骤分别添加了
  // Vue.use
  // Vue.mixin
  // Vue.extend、子类的cid
  // Vue.component、Vue.directive、Vue.filter
  // TODO 分析以下4个步骤的具体代码
  initUse(Vue)
  initMixin(Vue)
  initExtend(Vue)
  initAssetRegisters(Vue)
}
