/* @flow */

/**
 * unicode letters used for parsing html tags, component names and property paths.
 * using https://www.w3.org/TR/html53/semantics-scripting.html#potentialcustomelementname
 * skipping \u10000-\uEFFFF due to it freezing up PhantomJS
 */
export const unicodeRegExp = /a-zA-Z\u00B7\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u037D\u037F-\u1FFF\u200C-\u200D\u203F-\u2040\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD/

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
// 定义对象上的数据属性
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
const bailRE = new RegExp(`[^${unicodeRegExp.source}.$_\\d]`)
export function parsePath (path: string): any {
  // 路径除了字母数字下划线之外，只能包含两个特殊字符"."、"$"：'a.b.c'、'$a.b.c'
  // 其余都是都是错误路径，直接return
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
