/* @flow */

import { cached } from 'shared/util'
import { parseFilters } from './filter-parser'

// https://github.com/vuejs/vue/issues/8103
const defaultTagRE = /\{\{((?:.|\r?\n)+?)\}\}/g
const regexEscapeRE = /[-.*+?^${}()|[\]\/\\]/g

// 由于需要通过new RegExp()构建新的正则表达式，因此需要为自定义的定界符添加转义符号"\"
// ${xxx} -> \$\{xxx\}
const buildRegex = cached(delimiters => {
  const open = delimiters[0].replace(regexEscapeRE, '\\$&')
  const close = delimiters[1].replace(regexEscapeRE, '\\$&')
  return new RegExp(open + '((?:.|\\n)+?)' + close, 'g')
})

type TextParseResult = {
  expression: string,
  tokens: Array<string | { '@binding': string }>
}

/**
 * <div class="{{ isActive ? 'active' : '' }}"></div>
 * 解析字面量表达式，并返回对应的值；如果没有使用字面量表达式，则返回undefined
 * @param text {{ isActive ? 'active' : '' }}
 * @param delimiters
 * @returns {{expression: string, tokens: Array}}
 */
export function parseText (
  text: string,
  delimiters?: [string, string]
): TextParseResult | void {
  const tagRE = delimiters ? buildRegex(delimiters) : defaultTagRE
  // 文本中没有包含字面量表达式，则return
  if (!tagRE.test(text)) {
    return
  }
  const tokens = []
  const rawTokens = []
  let lastIndex = tagRE.lastIndex = 0
  let match, index, tokenValue
  /**
   text = 'abc{{ date | formatDate }}def'
   match = [
      '{{ date | formatDate }}',
      ' date | formatDate ',
      index: 3
      input: 'abc{{ date | formatDate }}def'
   ]
   rawTokens = [
      'abc',
      {
          '@binding': "_f('formatDate')(date)"
      },
      'def'
   ]
   tokens = [
      "'abc'",
      "_f(formatDate)(date)",
      "'def'"
   ]
   */
  while ((match = tagRE.exec(text))) {
    index = match.index
    // push text token
    if (index > lastIndex) {
      rawTokens.push(tokenValue = text.slice(lastIndex, index))
      tokens.push(JSON.stringify(tokenValue))
    }
    // tag token
    const exp = parseFilters(match[1].trim())
    tokens.push(`_s(${exp})`)
    rawTokens.push({ '@binding': exp })
    lastIndex = index + match[0].length
  }
  // 跳出上面的while循环后，如果最后一次匹配的序号小于文本的长度，说明已经匹配完字面量表达式了，剩余的是纯文本了
  if (lastIndex < text.length) {
    rawTokens.push(tokenValue = text.slice(lastIndex))
    tokens.push(JSON.stringify(tokenValue))
  }
  return {
    // "'abc'+_f('formatDate')(date)+'def'"
    expression: tokens.join('+'),
    // 供weex使用
    tokens: rawTokens
  }
}
