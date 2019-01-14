/* @flow */

import { ASSET_TYPES } from 'shared/constants'
import { isPlainObject, validateComponentName } from '../util/index'

export function initAssetRegisters (Vue: GlobalAPI) {
  /**
   * Create asset registration methods.
   */
  ASSET_TYPES.forEach(type => {
    // TODO 为什么Vue.component、Vue.directive、Vue.filter可以放在一起定义？
    // 添加Vue.component、Vue.directive、Vue.filter函数，函数返回传入的第二个参数definition
    Vue[type] = function (
      id: string,
      definition: Function | Object
    ): Function | Object | void {
      if (!definition) {
        return this.options[type + 's'][id]
      } else {
        /* istanbul ignore if */
        // 检测组件名是否重复
        if (process.env.NODE_ENV !== 'production' && type === 'component') {
          // 组件名的两种命名方式：
          // 1、短横线分隔命名：Vue.component('my-component-name', {})，在html中使用时保持一致<my-component-name>
          // 2、首字母大写命名：Vue.component('MyComponentName', {})
          // 在html中使用时只有一种方式<my-component-name>
          // 在字符串模板（包括.vue文件）中使用有两种方式<my-component-name>和<MyComponentName>
          // TODO 命名方式的解析在哪？
          validateComponentName(id)
        }
        if (type === 'component' && isPlainObject(definition)) {
          // 为组件附上组件名
          definition.name = definition.name || id
          // TODO 为什么要extend？
          definition = this.options._base.extend(definition)
        }
        if (type === 'directive' && typeof definition === 'function') {
          definition = { bind: definition, update: definition }
        }
        this.options[type + 's'][id] = definition
        return definition
      }
    }
  })
}
