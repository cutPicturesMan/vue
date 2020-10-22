/* @flow */

const validDivisionCharRE = /[\w).+\-_$\]]/

/**
 解析过滤器
 <div :id="rawId | formatId"></div>
 由于按位或运算符与分隔符相同，均为"|"，在过滤器中"|"仅代表分隔符
 如果一定要使用按位或运算符，可以在计算属性中处理

 以下六种情况，不应该将"|"作为过滤器进行解析
 1、单引号内的管道符：<div :id="'rawId | formatId'"></div>
 2、双引号内的管道符：<div :id='"rawId | formatId"'></div>
 3、模板字符串内的管道符：<div :id="`rawId | formatId`"></div>
 4、正则表达式内的管道符：<div :id="/rawId|formatId/.test(id).toString()"></div>
    由于识别"/"是除号还是正则比较复杂，vue中仅进行简要识别（http://www.ecma-international.org/ecma-262/9.0/index.html#sec-ecmascript-language-lexical-grammar）
    TODO ASI自动插入分号机制
 5、逻辑或运算（两个"|"组成）内的管道符：<div :id="rawId || formatId"></div>
 6、"|"处在{}、[]、()的包裹中
 * @param exp 字符串形式：rawId | formatId
 * @returns {*}
 */
export function parseFilters (exp: string): string {
  let inSingle = false
  let inDouble = false
  let inTemplateString = false
  let inRegex = false
  // 只要curly、square、paren有一个不为0，即当前字符串被{}、[]、()其中之一包裹，不会将"|"解析为分隔符
  // curly：遇到"{"加1，遇到"}"减1
  // square：遇到"["加1，遇到"]"减1
  // paren：遇到"("加1，遇到")"减1
  let curly = 0
  let square = 0
  let paren = 0
  let lastFilterIndex = 0
  let c, prev, i, expression, filters

  // 循环解析属性值字符串中的每一个字符，判断是普通字符还是过滤器。如<div :id="rawId | formatId"></div>
  for (i = 0; i < exp.length; i++) {
    // 上一个字符串
    prev = c
    c = exp.charCodeAt(i)
    // 处在'(0x27)、"(0x22)、`(0x60)、/(0x2f)的包裹中，则直接忽略其中的字符串，不进行解析
    // 由于'"`/不像{[(可以多个嵌套，因此要单独拎出来判断
    // 0x5C -> \
    if (inSingle) {
      // 当前字符是真正的单引号，而不是转义的单引号时，表示由单引号包裹的字符串结束了
      if (c === 0x27 && prev !== 0x5C) inSingle = false
    } else if (inDouble) {
      if (c === 0x22 && prev !== 0x5C) inDouble = false
    } else if (inTemplateString) {
      if (c === 0x60 && prev !== 0x5C) inTemplateString = false
    } else if (inRegex) {
      if (c === 0x2f && prev !== 0x5C) inRegex = false
    } else if (
      // 如果当前字符为过滤器的分隔符"|"，则分离出表达式和过滤器
      // 0x7C -> |

      // 当前字符为"|" &&
      // 当前字符后一个字符不为"|" &&
      // 当前字符前一个字符不为"|" &&
      // 当前字符不处于{}、[]、()包裹中
      c === 0x7C && // pipe
      exp.charCodeAt(i + 1) !== 0x7C &&
      exp.charCodeAt(i - 1) !== 0x7C &&
      !curly && !square && !paren
    ) {
      if (expression === undefined) {
        // first filter, end of expression
        lastFilterIndex = i + 1
        // 'rawId | formatId' -> 'rawId ' -> 'rawId'
        expression = exp.slice(0, i).trim()
      } else {
        // 每次匹配到过滤器分隔符"|"，将上一次的过滤器（两个"|"的边界才能确定）放入filters数组中
        pushFilter()
      }
    } else {
      switch (c) {
        case 0x22: inDouble = true; break         // "
        case 0x27: inSingle = true; break         // '
        case 0x60: inTemplateString = true; break // `
        case 0x28: paren++; break                 // (
        case 0x29: paren--; break                 // )
        case 0x5B: square++; break                // [
        case 0x5D: square--; break                // ]
        case 0x7B: curly++; break                 // {
        case 0x7D: curly--; break                 // }
      }
      // 判断"/"是除号，还是正则表达式
      // TODO 有空再看
      if (c === 0x2f) { // /
        let j = i - 1
        let p
        // find first non-whitespace prev char
        // 当"/"前面的字符为空格时，无法判断当前"/"是除号还是正则表达式开头
        // 只有找到了"/"字符之前第一个不为空格的字符时，针对此字符进行判断，才能确定
        for (; j >= 0; j--) {
          p = exp.charAt(j)
          if (p !== ' ') break
        }
        /**
         首个非空格字符为以下2种情况时，"/"表示正则表达式的开头
         1、空字符''
          <div :key="/rawId/.test('abc')"></div>
          <div :key="    /rawId/.test('abc')"></div>
         2、TODO 该字符是字母、数字、)、.、+、-、_、$、] 之一
         */
        if (!p || !validDivisionCharRE.test(p)) {
          inRegex = true
        }
      }
    }
  }

  // 字符串中没有匹配到过滤器，则全部的字符串都是表达式
  if (expression === undefined) {
    expression = exp.slice(0, i).trim()
  } else if (lastFilterIndex !== 0) {
    // 如果匹配到了过滤器，则把最后一个匹配到的过滤器加入filters数组中
    pushFilter()
  }

  function pushFilter () {
    (filters || (filters = [])).push(exp.slice(lastFilterIndex, i).trim())
    // 针对多个过滤器的情况
    lastFilterIndex = i + 1
  }

  // 将表达式用过滤器函数层层包裹
  if (filters) {
    for (i = 0; i < filters.length; i++) {
      expression = wrapFilter(expression, filters[i])
    }
  }

  return expression
}

/**
 拼接filter和expression
 处理2种情况
 1、不带参数的filter
 <div>{{ message | filterA }}</div>

 2、带参数、带空参数的filter
 <div>{{ message | filterA(arg1, arg2) }}</div>
 <div>{{ message | filterA() }}</div>
 */
function wrapFilter (exp: string, filter: string): string {
  const i = filter.indexOf('(')
  // 不带参数的filter
  if (i < 0) {
    // _f: resolveFilter
    return `_f("${filter}")(${exp})`
  } else {
    const name = filter.slice(0, i)
    const args = filter.slice(i + 1)
    // '_f("filter")(message, arg1, arg2)'
    // _f("filter")是找到名为filter的函数，然后再执行
    return `_f("${name}")(${exp}${args !== ')' ? ',' + args : args}`
  }
}
