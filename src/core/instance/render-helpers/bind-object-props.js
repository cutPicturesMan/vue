/* @flow */

import config from 'core/config'

import {
  warn,
  isObject,
  toObject,
  isReservedAttribute,
  camelize,
  hyphenate
} from 'core/util/index'

/**
 * Runtime helper for merging v-bind="object" into a VNode's data.
 * 运行时帮助程序，专门用于将v-bind绑定的对象合并到VNode的data属性上
 * @param data    dom的属性对象，例如{class: "hello", attrs: {"id": "foo"}}，详见/Users/zhangzhen11/z/github/vue/src/compiler/codegen/index.js，genData函数
 * @param tag
 * @param value   v-bind的值
 * @param asProp
 * @param isSync
 * @returns {any}
 */
export function bindObjectProps (
  data: any,
  tag: string,
  value: any,
  asProp: boolean,
  isSync?: boolean
): VNodeData {
  if (value) {
    // 不带参数的v-bind，其值必须是对象（或数组）
    if (!isObject(value)) {
      process.env.NODE_ENV !== 'production' && warn(
        'v-bind without argument expects an Object or Array value',
        this
      )
    } else {
      // 将数组中的多个对象合并为一个完整的对象
      if (Array.isArray(value)) {
        value = toObject(value)
      }
      let hash
      for (const key in value) {
        // 由于v-bind可以任意指定绑定的属性名，因此有可能存在与现有dom属性（即参数data）重名的情况，遇到这种情况时，直接跳过不赋值
        // 现有dom属性有如下3种情况：
        // 1、保留属性
        // 1) class、style属性是html的保留属性
        // 2) vue内部使用到的属性
        if (
          key === 'class' ||
          key === 'style' ||
          isReservedAttribute(key)
        ) {
          hash = data
        } else {
          const type = data.attrs && data.attrs.type
          hash = asProp || config.mustUseProp(tag, type, key)
            // 2、以DOM property的方式渲染的属性
            ? data.domProps || (data.domProps = {})
            // 3、以HTML attribute的方式渲染的属性
            : data.attrs || (data.attrs = {})
        }
        const camelizedKey = camelize(key)
        const hyphenatedKey = hyphenate(key)
        // v-bind绑定的属性不与dom属性重名，才进行赋值
        // TODO 这种情况，指v-model语法糖的:value会覆盖value的值吗？<input type="checkbox" id="jack" value="Jack" v-model="checkedNames">
        // <WelcomeMessage v-bind="{ greetingText: hello }" greeting-text="hi"/>
        // 待绑定的key、其驼峰式写法不存在于现有attr && 待绑定的key、其短横线写法不存在于现有attr，才进行赋值
        if (!(camelizedKey in hash) && !(hyphenatedKey in hash)) {
          hash[key] = value[key]

          if (isSync) {
            const on = data.on || (data.on = {})
            on[`update:${key}`] = function ($event) {
              value[key] = $event
            }
          }
        }
      }
    }
  }
  return data
}
