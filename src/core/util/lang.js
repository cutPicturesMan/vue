/* @flow */

/**
 * Check if a string starts with $ or _
 */
export function isReserved (str: string): boolean {
  const c = (str + '').charCodeAt(0)
  return c === 0x24 || c === 0x5F
}

/**
 * Define a property.
 */
export function def (obj: Object, key: string, val: any, enumerable?: boolean) {
  Object.defineProperty(obj, key, {
    value: val,
    enumerable: !!enumerable,
    writable: true,
    configurable: true
  })
}

/**
 * Parse simple path.
 */
const bailRE = /[^\w.$]/
export function parsePath (path: string): any {
  // 路径可能为：'a.b.c'、'$a.b.c'，不属于这种的都是错误路径
  if (bailRE.test(path)) {
    return
  }
  // 'a.b.c' => ['a', 'b', 'c']
  const segments = path.split('.')
  // 传入的对象obj必须包含segments的完整属性路径，否则返回undefined
  return function (obj) {
    for (let i = 0; i < segments.length; i++) {
      if (!obj) return
      obj = obj[segments[i]]
    }
    return obj
  }
}
