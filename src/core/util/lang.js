/* @flow */

/**
 * Check if a string starts with $ or _
 */
export function isReserved (str: string): boolean {
  // 1、隐式转换为字符串
  // 2、javascript采用Unicode字符集。Unicode为每种语言中的每个字符设定了统一并且唯一的二进制编码，以满足跨语言、跨平台进行文本转换、处理的要求。因此要先把字符'$'、'_'转换成在Unicode字符集中的编码值
  // 在表示一个Unicode的字符时，通常会用“U+”然后紧接着一组十六进制的数字来表示这一个字符
  // https://baike.baidu.com/item/Unicode%E5%AD%97%E7%AC%A6%E5%88%97%E8%A1%A8/12022016?fr=aladdin
  // 3、'$'为0x24，'_'为0x5F
  // charCodeAt返回0 - 65535之间的整数
  // 在进行算术计算时，所有以八进制和十六进制表示的数值最终都将被转换成十进制数值
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
