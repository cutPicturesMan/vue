/* @flow */

import { mergeOptions } from '../util/index'

export function initMixin (Vue: GlobalAPI) {
  Vue.mixin = function (mixin: Object) {
    // 将传入mixin()的参数与this.options合并
    // TODO megeOptions函数的作用
    this.options = mergeOptions(this.options, mixin)
    return this
  }
}
