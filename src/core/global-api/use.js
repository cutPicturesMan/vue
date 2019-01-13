/* @flow */

import { toArray } from '../util/index'

export function initUse (Vue: GlobalAPI) {
  Vue.use = function (plugin: Function | Object) {
    // TODO 解决插件在多个版本的vue下只实例一次的bug
    // https://github.com/vuejs/vue/issues/5970
    const installedPlugins = (this._installedPlugins || (this._installedPlugins = []))
    // 如果插件列表中有该插件，则直接返回
    if (installedPlugins.indexOf(plugin) > -1) {
      return this
    }

    // additional parameters
    const args = toArray(arguments, 1)
    // TODO 为什么要在args数组前端插入this？
    args.unshift(this)
    // TODO plugin的内部实现是什么样的？
    if (typeof plugin.install === 'function') {
      plugin.install.apply(plugin, args)
    } else if (typeof plugin === 'function') {
      plugin.apply(null, args)
    }
    installedPlugins.push(plugin)
    return this
  }
}
