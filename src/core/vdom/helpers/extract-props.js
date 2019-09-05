/* @flow */

import {
  tip,
  hasOwn,
  isDef,
  isUndef,
  hyphenate,
  formatComponentName
} from 'core/util/index'

// 从VNodeData中提取props的值
export function extractPropsFromVNodeData (
  data: VNodeData,
  Ctor: Class<Component>,
  tag?: string
): ?Object {
  // we are only extracting raw values here.
  // validation and default values are handled in the child
  // component itself.
  // 在这里仅提取原始值，类型校验和默认值赋值在子组件中处理
  // props为声明组件时传入的options的props属性
  const propOptions = Ctor.options.props
  if (isUndef(propOptions)) {
    return
  }
  const res = {}
  const { attrs, props } = data
  // attrs是html属性 || TODO 这里猜测props是使用渲染函数_c()时声明的
  if (isDef(attrs) || isDef(props)) {
    for (const key in propOptions) {
      // aB -> a-b
      const altKey = hyphenate(key)
      if (process.env.NODE_ENV !== 'production') {
        // aB -> ab
        const keyInLowerCase = key.toLowerCase()
        // key是大小写混合的 && key存在于attrs中，则提示
        if (
          key !== keyInLowerCase &&
          attrs && hasOwn(attrs, keyInLowerCase)
        ) {
          tip(
            `Prop "${keyInLowerCase}" is passed to component ` +
            `${formatComponentName(tag || Ctor)}, but the declared prop name is` +
            ` "${key}". ` +
            `Note that HTML attributes are case-insensitive and camelCased ` +
            `props need to use their kebab-case equivalents when using in-DOM ` +
            `templates. You should probably use "${altKey}" instead of "${key}".`
          )
        }
      }
      checkProp(res, props, key, altKey, true) ||
      checkProp(res, attrs, key, altKey, false)
    }
  }
  return res
}

// props -> aB -> a-b
// attrs -> aB -> a-b
function checkProp (
  res: Object,
  hash: ?Object,
  key: string,
  altKey: string,
  preserve: boolean
): boolean {
  if (isDef(hash)) {
    // 检查hash上是否存在aB
    if (hasOwn(hash, key)) {
      res[key] = hash[key]
      if (!preserve) {
        delete hash[key]
      }
      return true
    } else if (hasOwn(hash, altKey)) {
      // 检查hash上是否存在a-b
      res[key] = hash[altKey]
      if (!preserve) {
        delete hash[altKey]
      }
      return true
    }
  }
  return false
}
