/* @flow */

import { ASSET_TYPES } from 'shared/constants'
import { isPlainObject, validateComponentName } from '../util/index'

// 初始化资源注册器
// 将Vue.xxx()全局申明提供的多种声明格式，转化为在Vue.options中的最终格式
export function initAssetRegisters (Vue: GlobalAPI) {
  /**
   * Create asset registration methods.
   */
  ASSET_TYPES.forEach(type => {
    // 添加Vue.component、Vue.directive、Vue.filter函数，由于这3个api转化过程相似，因此可以放在一起声明
    // 函数返回传入的第二个参数definition
    Vue[type] = function (
      id: string,
      definition: Function | Object
    ): Function | Object | void {
      // 如果没有定义声明，则把Vue.options上的值当作声明
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
          // TODO 为什么要extend，不是说_base只用在weex中？
          definition = this.options._base.extend(definition)
        }
        // Vue.directive()提供了函数简写，将其转化为最终格式
        if (type === 'directive' && typeof definition === 'function') {
          definition = { bind: definition, update: definition }
        }
        this.options[type + 's'][id] = definition
        return definition
      }
    }
  })
}
