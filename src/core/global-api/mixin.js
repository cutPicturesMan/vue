/* @flow */

import { mergeOptions } from '../util/index'

export function initMixin (Vue: GlobalAPI) {
  Vue.mixin = function (mixin: Object) {
    // 将传入mixin()的参数与this.options合并
    // TODO mergeOptions函数的作用
    // 这里的this指的是Vue构造函数，而不是new Vue()创建出来的对象
    this.options = mergeOptions(this.options, mixin)
    return this
  }
}
