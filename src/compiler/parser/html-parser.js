/**
 * Not type-checking this file because it's mostly vendor code.
 */

/*!
 * HTML Parser By John Resig (ejohn.org)
 * Modified by Juriy "kangax" Zaytsev
 * Original code by Erik Arvidsson (MPL-1.1 OR Apache-2.0 OR GPL-2.0-or-later)
 * http://erik.eae.net/simplehtmlparser/simplehtmlparser.js
 */
// TODO Resig写htmlParser的原因：https://johnresig.com/blog/pure-javascript-html-parser/；https://johnresig.com/files/htmlparser.js
import { makeMap, no } from 'shared/util'
import { isNonPhrasingTag } from 'web/compiler/util'
import { unicodeRegExp } from 'core/util/lang'

// Regular Expressions for parsing tags and attributes
// html 标签属性值的4种声明方式：
// 1、单独的属性名：disabled。^\s*([^\s"'<>\/=]+)
// 2、双引号：class="some-class"。"([^"]*)"+
// 3、单引号：class='some-class'。'([^']*)'+
// 4、不使用引号：class=some-class。([^\s"'=<>`]+)
// TODO html属性规范中规定了attr的取值，vue并没有全部覆盖到？https://www.w3.org/TR/html4/intro/sgmltut.html#h-3.2.2
const attribute = /^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/
const dynamicArgAttribute = /^\s*((?:v-[\w-]+:|@|:|#)\[[^=]+\][^\s"'<>\/=]*)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/
// could use https://www.w3.org/TR/1999/REC-xml-names-19990114/#NT-QName
// but for Vue templates we can enforce a simple charset
// 匹配标签名，<my-component data-index=...中的my-component
// 标签名：以字母、下划线开头，后跟任意数量的中横线、`.`、0-9、下划线和字符
const ncname = `[a-zA-Z_][\\-\\.0-9_a-zA-Z${unicodeRegExp.source}]*`
const qnameCapture = `((?:${ncname}\\:)?${ncname})`
const startTagOpen = new RegExp(`^<${qnameCapture}`)
// 匹配开始标签的结束部分。标签可能是一元标签，如<br />
const startTagClose = /^\s*(\/?)>/
const endTag = new RegExp(`^<\\/${qnameCapture}[^>]*>`)
// 匹配 <!DOCTYPE HTML>
const doctype = /^<!DOCTYPE [^>]+>/i
// #7298: escape - to avoid being passed as HTML comment when inlined in page
// 在安卓低端机（v4.4.2），通过将vue代码库内联到html中以减少请求，正则表达式/^<!--/会被认为是html注释<!--，导致后续代码不可用，因此加一个转义符号
const comment = /^<!\--/
// 条件注释标签————下层展示标签
const conditionalComment = /^<!\[/

// Special Elements (can contain anything)
// 特殊的标签（可以包含任何东西）
export const isPlainTextElement = makeMap('script,style,textarea', true)
// key: 纯文本标签；val: 正则
const reCache = {}

/**
 chrome会将<a>标签的href属性进行编码，导致访问的链接出错，例如：
 1、制表符被转为"&#9;"  
    <a href="https://www.baidu.com	">aaaa</a> 
    <a href="https://www.baidu.com&#9;">aaaa</a>
 2、换行符被转为"&#10;"
    <a href="https://www.baidu.com
     ">aaaa</a>
    <a href="https://www.baidu.com&#10;">aaaa</a>
 */
// TODO decodingMap在react中2016年的时候换成了escapeHtml？弄清react中后来改用escapeHtml的原因：https://github.com/facebook/react/pull/6862
const decodingMap = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&amp;': '&',
  '&#10;': '\n',  // 换行符
  '&#9;': '\t',  // 制表符
  '&#39;': "'"
}
const encodedAttr = /&(?:lt|gt|quot|amp|#39);/g
const encodedAttrWithNewLines = /&(?:lt|gt|quot|amp|#39|#10|#9);/g

// #5992 https://github.com/vuejs/vue/issues/5992
// 紧跟在<pre>开始标签后的换行符会被省略，vue原本不会省略，这里处理下
const isIgnoreNewlineTag = makeMap('pre,textarea', true)
const shouldIgnoreFirstNewline = (tag, html) => tag && isIgnoreNewlineTag(tag) && html[0] === '\n'

// 将&lt;等字符实体解码为html字符
function decodeAttr (value, shouldDecodeNewlines) {
  const re = shouldDecodeNewlines ? encodedAttrWithNewLines : encodedAttr
  return value.replace(re, match => decodingMap[match])
}

/**
 * 解析html字符串
 * @param html
 * @param options Object
 */
export function parseHTML (html, options) {
  // 存储解析html字符串时遇到的双标签的开始标签
  // stack数组有值，则表示当前正处于解析双标签的内容中
  const stack = []
  // 是否是html，默认true，非web环境才是false
  const expectHTML = options.expectHTML
  // 判断是否是一元标签的函数
  const isUnaryTag = options.isUnaryTag || no
  // 判断是否是自闭合标签的函数
  const canBeLeftOpenTag = options.canBeLeftOpenTag || no
  let index = 0
  // 解析前的html字符串，最近解析过的双标签
  let last, lastTag
  while (html) {
    last = html
    // Make sure we're not in a plaintext content element like script/style
    // 确保不解析script/style/textarea标签中的文本，因为它们可以包含任何东西
    // 将下式看成!(lastTag && isPlainTextElement(lastTag))，lastTag有值，说明stack肯定有值，则表示正在解析标签中的文本
    if (!lastTag || !isPlainTextElement(lastTag)) {
      // 直接判断html字符串的开头是文字还是疑似标签
      let textEnd = html.indexOf('<')
      if (textEnd === 0) {
        // Comment:
        // 如果html以<!--开头
        if (comment.test(html)) {
          const commentEnd = html.indexOf('-->')

          if (commentEnd >= 0) {
            if (options.shouldKeepComment) {
              // 将注释内容传给options.comment函数，4表示注释开头为<!--的字符长度为4
              options.comment(html.substring(4, commentEnd), index, index + commentEnd + 3)
            }
            // 从html字符串中删除当前注释标签
            advance(commentEnd + 3)
            continue
          } // 匹配不上注释标签，走接下来的流程
        }

        // http://en.wikipedia.org/wiki/Conditional_comment#Downlevel-revealed_conditional_comment
        // 如果html以<![开头
        // Vue不支持非标准的IE（微软）条件注释，Downlevel-hidden已经作为注释节点移除掉了，Downlevel-revealed在这里专门移除掉
        if (conditionalComment.test(html)) {
          const conditionalEnd = html.indexOf(']>')

          // 如果找到downlevel-revealed注释标签，则跳过
          if (conditionalEnd >= 0) {
            advance(conditionalEnd + 2)
            continue
          } // 匹配不上downlevel-revealed标签，走接下来的流程
        }

        // Doctype:
        // 跳过html字符串中的整个doctype标签
        const doctypeMatch = html.match(doctype)
        if (doctypeMatch) {
          advance(doctypeMatch[0].length)
          continue
        }

        // End tag:
        // 跳过html字符串中标签的结束标签
        const endTagMatch = html.match(endTag)
        if (endTagMatch) {
          const curIndex = index
          advance(endTagMatch[0].length)
          parseEndTag(endTagMatch[1], curIndex, index)
          continue
        }

        // Start tag:
        const startTagMatch = parseStartTag()
        // 匹配到了开始标签
        if (startTagMatch) {
          handleStartTag(startTagMatch)
          // 处理pre、textarea标签第一行换行的情况
          if (shouldIgnoreFirstNewline(startTagMatch.tagName, html)) {
            advance(1)
          }
          continue
        }
      }

      let text, rest, next
      // 处理下一个疑似标签前的文本节点部分
      if (textEnd >= 0) {
        // 去除文本节点
        rest = html.slice(textEnd)
        // 快速找到剩余以"<"开头的字符串中，"<"表示的是真正标签而不是字符的位置
        while (
          // 由于<!DOCTYPE>声明必须处于html文档的第一行，如果存在<!DOCTYPE>标签，那么在之前的if中已经被匹配了
          // 此处即使存在<!DOCTYPE>，也是字符串形式，因此while中不需要再判断是否是doctype
          !endTag.test(rest) &&
          !startTagOpen.test(rest) &&
          !comment.test(rest) &&
          !conditionalComment.test(rest)
        ) {
          // < in plain text, be forgiving and treat it as text
          // 查找下一个以"<"开头的疑似标签
          next = rest.indexOf('<', 1)
          // 如果接下来都没有标签了，则跳出while循环
          if (next < 0) break
          // 光标定位到下一个的'<'上
          textEnd += next
          rest = html.slice(textEnd)
        }
        // 文本节点内容
        text = html.substring(0, textEnd)
      }

      // 没找到标签符号，则表示html字符串中包含的都是字符，可以退出while循环
      if (textEnd < 0) {
        text = html
      }

      // 将文本节点从字符串中移除
      if (text) {
        advance(text.length)
      }

      // 将文本节点传入options.chars回调函数中
      if (options.chars && text) {
        options.chars(text, index - text.length, index)
      }
    } else {
      // 将<script>、<style>、<textarea>标签的内容直到结束标签都替换为空字符串，并在最后将其开始标签出栈
      let endTagLength = 0
      const stackedTag = lastTag.toLowerCase()
      // 匹配纯文本标签的内容以及结束标签
      // ([\\s\\S]*?)为惰性匹配，如果有多个形如结束标签的字符串，则匹配第一个
      const reStackedTag = reCache[stackedTag] || (reCache[stackedTag] = new RegExp('([\\s\\S]*?)(</' + stackedTag + '[^>]*>)', 'i'))
      const rest = html.replace(reStackedTag, function (all, text, endTag) {
        endTagLength = endTag.length
        // TODO 这个if判断应该永远进不来
        if (!isPlainTextElement(stackedTag) && stackedTag !== 'noscript') {
          // 将标签内的注释部分提取出来，放入chars回调函数
          // 这里有可能是多行匹配，因此要用\s\S，而不能是.*
          text = text
            .replace(/<!\--([\s\S]*?)-->/g, '$1') // #7298
            .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1')
        }
        if (shouldIgnoreFirstNewline(stackedTag, text)) {
          text = text.slice(1)
        }
        if (options.chars) {
          options.chars(text)
        }
        return ''
      })
      index += html.length - rest.length
      html = rest
      parseEndTag(stackedTag, index - endTagLength, index)
    }

    // 经过上述流程之后，如果前后字符串没变，则表示解析失败，字符串不是合法的html字符串
    if (html === last) {
      options.chars && options.chars(html)
      if (process.env.NODE_ENV !== 'production' && !stack.length && options.warn) {
        options.warn(`Mal-formatted tag at end of template: "${html}"`, { start: index + html.length })
      }
      break
    }
  }

  // Clean up any remaining tags
  parseEndTag()

  // 向前移动n个字符串
  function advance (n) {
    index += n
    html = html.substring(n)
  }

  // 解析开始标签及其属性
  // 有结束符号`>`的开始标签，才会返回其对象表示形式，否则没有返回值
  function parseStartTag () {
    // 假设标签为<my-component data-index="1"></my-component>
    const start = html.match(startTagOpen)
    if (start) {
      const match = {
        tagName: start[1],  // 标签名
        attrs: [],  // 属性数组，数组元素为正则match的所有匹配结果
        start: index  // 标签开始序号
      }
      // 跳过开始标签的标签名
      advance(start[0].length)
      let end, attr
      // 循环解析属性，直到开始标签的结束。如果标签没有闭合，也会因为匹配不到属性而退出while循环
      while (!(end = html.match(startTagClose)) && (attr = html.match(dynamicArgAttribute) || html.match(attribute))) {
        // 将index移动到当前属性之后
        attr.start = index
        advance(attr[0].length)
        attr.end = index
        match.attrs.push(attr)
      }
      if (end) {
        // 如果开始标签为一元标签，则unarySlash为斜杠"/"，否则为undefined
        match.unarySlash = end[1]
        // 将index移动到闭合之后
        advance(end[0].length)
        match.end = index
        return match
      }
    }
  }

  // 处理开始标签
  function handleStartTag (match) {
    const tagName = match.tagName
    // 如果是一元标签，则为斜杠/
    const unarySlash = match.unarySlash

    if (expectHTML) {
      // 由于p标签只能包含短语标签
      // 目前正在解析p标签的内容 && 当前标签本身不是短语类型，这违反了html中的嵌套规则，需要闭合父级标签
      if (lastTag === 'p' && isNonPhrasingTag(tagName)) {
        parseEndTag(lastTag)
      }
      // 自闭合标签 && 当前正在解析这个标签，则手动闭合
      if (canBeLeftOpenTag(tagName) && lastTag === tagName) {
        parseEndTag(tagName)
      }
    }

    // 是否是html规范定义的一元标签 || 以斜杠"/"结尾的自定义一元标签
    const unary = isUnaryTag(tagName) || !!unarySlash

    const l = match.attrs.length
    // 不用map函数，而用new Array是为了避免IE下svg的bug，具体就不深究了
    const attrs = new Array(l)
    for (let i = 0; i < l; i++) {
      const args = match.attrs[i]
      // 属性的值
      const value = args[3] || args[4] || args[5] || ''
      // 将属性值中被编码的html字符实体转为预留字符
      const shouldDecodeNewlines = tagName === 'a' && args[1] === 'href'
        ? options.shouldDecodeNewlinesForHref
        : options.shouldDecodeNewlines
      attrs[i] = {
        name: args[1],
        value: decodeAttr(value, shouldDecodeNewlines)
      }
      if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
        attrs[i].start = args.start + args[0].match(/^\s*/).length
        attrs[i].end = args.end
      }
    }

    // 如果不是单标签，则记录
    if (!unary) {
      // 将标签指定为已解析的最后一个标签
      stack.push({ tag: tagName, lowerCasedTag: tagName.toLowerCase(), attrs: attrs, start: match.start, end: match.end })
      lastTag = tagName
    }

    // 执行提供的钩子函数
    if (options.start) {
      options.start(tagName, attrs, unary, match.start, match.end)
    }
  }

  function parseEndTag (tagName, start, end) {
    let pos, lowerCasedTagName
    if (start == null) start = index
    if (end == null) end = index

    // Find the closest opened tag of the same type
    // 在stack数组中，从后往前找到最接近的标签。如果没找到，pos为-1
    if (tagName) {
      lowerCasedTagName = tagName.toLowerCase()
      for (pos = stack.length - 1; pos >= 0; pos--) {
        // html虽然不区分大小写，但是js字符串区分大小写，所以用小写字母比较是否相等
        if (stack[pos].lowerCasedTag === lowerCasedTagName) {
          break
        }
      }
    } else {
      // If no tag name is provided, clean shop
      pos = 0
    }

    if (pos >= 0) {
      // Close all the open elements, up the stack
      // 将当前标签及其子标签一一关闭
      for (let i = stack.length - 1; i >= pos; i--) {
        // 子标签没闭合 || tagName没值（即最后的清空stack操作），则提示未匹配到结束标签
        if (process.env.NODE_ENV !== 'production' &&
          (i > pos || !tagName) &&
          options.warn
        ) {
          options.warn(
            `tag <${stack[i].tag}> has no matching end tag.`,
            { start: stack[i].start, end: stack[i].end }
          )
        }
        // 执行回调钩子
        if (options.end) {
          options.end(stack[i].tag, start, end)
        }
      }

      // Remove the open elements from the stack
      // 移除stack中的该开始标签
      stack.length = pos
      lastTag = pos && stack[pos - 1].tag
    } else if (lowerCasedTagName === 'br') {
      // 如果html中仅写了</br>，那么浏览器会将其渲染为<br>，这里vue保持一致
      if (options.start) {
        options.start(tagName, [], true, start, end)
      }
    } else if (lowerCasedTagName === 'p') {
      // 如果html中仅写了</p>，那么浏览器会将其渲染为<p></p>，这里vue保持一致
      if (options.start) {
        options.start(tagName, [], false, start, end)
      }
      if (options.end) {
        options.end(tagName, start, end)
      }
    }
  }
}
