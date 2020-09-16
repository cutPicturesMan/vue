/* @flow */

/**
 * unicode letters used for parsing html tags, component names and property paths.
 * using https://www.w3.org/TR/html53/semantics-scripting.html#potentialcustomelementname
 * skipping \u10000-\uEFFFF due to it freezing up PhantomJS
 */
// 在Terser没有开启"ascii_only"编译选项的情况下，会将字符串形式的Unicode序列，例如'\uF900-\uFDCF'，转义为"豈-﷏"，导致正则失效，有2种解决方案：
// 1、设置Terser编译选项"ascii_only"为true。这种方法不好，因为进行了强制设置
// 2、将字符串形式的Unicode序列，换成正则形式，避免被Terser转义。通过RegExp.source获取其字符串形式的Unicode序列

// TODO ascii unicode的区别
// http://www.ruanyifeng.com/blog/2014/12/unicode.html
// http://www.ruanyifeng.com/blog/2007/10/ascii_unicode_and_utf-8.html
// https://github.com/ruanyf/es6tutorial/blob/0e7b53f00f6235929753c0fa526bf9e8e41a039f/docs/string-methods.md
// https://zhuanlan.zhihu.com/p/49477907
// https://blog.csdn.net/huangpb123/article/details/73477800

// TODO potentialcustomelementname中的 #x -> \u的原因？
// TODO unicode转义序列 js权威指南 P38
export const unicodeRegExp = /a-zA-Z\u00B7\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u037D\u037F-\u1FFF\u200C-\u200D\u203F-\u2040\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD/

/**
 * Check if a string starts with $ or _
 * 检查字符串是否以$或者_开头
 */
export function isReserved (str: string): boolean {
  // Q 为啥不直接判断 === '$'？
  // A JavaScript内部字符以UTF-16的格式储存，字符串进行全等对比时，最终会对比对应位的16位数，用字符串的话，最终也是要转为16位数的（http://www.ecma-international.org/ecma-262/11.0/index.html#sec-samevaluenonnumeric，js权威指南 P75），因此直接用charCodeAt性能更好。Lodash也是这么做的：https://github.com/lodash/lodash/commit/8e631dfcd496bc355ee7ceeb959421b0788b9bbc
  const c = (str + '').charCodeAt(0)
  // 这里建议用十进制，'$'为0x24，'_'为0x5F
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
// 键路径 -> 获取某对象键路径的函数
export function parsePath (path: string): any {
  // 路径除了字母数字下划线之外，只能包含两个特殊字符"."、"$"：'a.b.c'、'$a.b.c'
  // 其余都是都是错误路径，直接return
  if (bailRE.test(path)) {
    return
  }
  // 'a.b.c' => ['a', 'b', 'c']
  const segments = path.split('.')
  return function (obj) {
    for (let i = 0; i < segments.length; i++) {
      // 传入的对象obj必须包含segments的完整属性路径，否则返回undefined
      if (!obj) return
      obj = obj[segments[i]]
    }
    return obj
  }
}
