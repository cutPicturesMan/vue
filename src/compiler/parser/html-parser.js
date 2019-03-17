/**
 * Not type-checking this file because it's mostly vendor code.
 */

/*!
 * HTML Parser By John Resig (ejohn.org)
 * Modified by Juriy "kangax" Zaytsev
 * Original code by Erik Arvidsson, Mozilla Public License
 * http://erik.eae.net/simplehtmlparser/simplehtmlparser.js
 */
// TODO Resig写htmlParser的原因：https://johnresig.com/blog/pure-javascript-html-parser/；https://johnresig.com/files/htmlparser.js
import { makeMap, no } from 'shared/util'
import { isNonPhrasingTag } from 'web/compiler/util'

// Regular Expressions for parsing tags and attributes
// html 标签属性值的4种声明方式：
// 1、单独的属性名：disabled。^\s*([^\s"'<>\/=]+)
// 2、双引号：class="some-class"。"([^"]*)"+
// 3、单引号：class='some-class'。'([^']*)'+
// 4、不使用引号：class=some-class。([^\s"'=<>`]+)
const attribute = /^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/
// could use https://www.w3.org/TR/1999/REC-xml-names-19990114/#NT-QName
// but for Vue templates we can enforce a simple charset
// TODO 了解下xml标签规范
// 匹配标签名，<my-component data-index=...中的my-component
// 标签名：以字母、下划线开头，后跟任意多个的字符、中横线、和`.`
const ncname = '[a-zA-Z_][\\w\\-\\.]*'
const qnameCapture = `((?:${ncname}\\:)?${ncname})`
const startTagOpen = new RegExp(`^<${qnameCapture}`)
// 匹配开始标签的结束部分。标签可能是一元标签，如<br />
const startTagClose = /^\s*(\/?)>/
const endTag = new RegExp(`^<\\/${qnameCapture}[^>]*>`)
// 匹配 <!DOCTYPE HTML>
const doctype = /^<!DOCTYPE [^>]+>/i
// #7298: escape - to avoid being pased as HTML comment when inlined in page
// TODO https://github.com/vuejs/vue/issues/7298
// TODO vue代码内联到html中长什么样？
const comment = /^<!\--/
// TODO 条件注释节点，如<!--[if IE 8]>...<![endif]-->
// https://docs.microsoft.com/en-us/previous-versions/windows/internet-explorer/ie-developer/compatibility/ms537512(v=vs.85)
// https://zh.wikipedia.org/wiki/%E6%9D%A1%E4%BB%B6%E6%B3%A8%E9%87%8A
// https://css-tricks.com/downlevel-hidden-downlevel-revealed/
// 【Downlevel hidden】Show only in some subset of IE < 10's
// 【Downlevel revealed】Show some subset of IE < 10's plus every non-IE browser.
const conditionalComment = /^<!\[/

// TODO #8359
// https://github.com/vuejs/vue/pull/8359
// https://bugzilla.mozilla.org/show_bug.cgi?id=369778

// Special Elements (can contain anything)
export const isPlainTextElement = makeMap('script,style,textarea', true)
const reCache = {}

/**
 chrome下，当获取的innerHTML中含有<a>标签，且其href属性中含有制表符，则制表符会转为"&#9;"；如果含有换行符，会转为"&#10;"
 <div id="link-box">
     <a href="https://www.baidu.com	">aaaa</a>
     <a href="https://www.baidu.com
     ">aaaa</a>
 </div>

 <a href="https://www.baidu.com&#9;">aaaa</a>
 <a href="https://www.baidu.com&#10;">aaaa</a>
 */
const decodingMap = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&amp;': '&',
  '&#10;': '\n',  // 换行符
  '&#9;': '\t'  // 制表符
}
const encodedAttr = /&(?:lt|gt|quot|amp);/g
const encodedAttrWithNewLines = /&(?:lt|gt|quot|amp|#10|#9);/g

// #5992 https://github.com/vuejs/vue/issues/5992
// 紧跟在<pre>开始标签后的换行符会被省略，vue原本不会省略，这里处理下
// TODO 是在ssr渲染的时候会出现这种情况，还是客户端渲染的时候会出现？
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
  const stack = []
  const expectHTML = options.expectHTML
  const isUnaryTag = options.isUnaryTag || no
  const canBeLeftOpenTag = options.canBeLeftOpenTag || no
  let index = 0
  let last, lastTag
  while (html) {
    last = html
    // Make sure we're not in a plaintext content element like script/style
    // 确保即将解析的内容不是纯文本
    if (!lastTag || !isPlainTextElement(lastTag)) {
      let textEnd = html.indexOf('<')
      // html以"<"开头
      if (textEnd === 0) {
        // Comment:
        // 如果html以<!--开头
        if (comment.test(html)) {
          const commentEnd = html.indexOf('-->')

          // 如果存在注释结尾节点。由于commentEnd肯定比0大（当前的html以"<!--"开头）。这里的>=0是表示有找到commentEnd
          if (commentEnd >= 0) {
            // 如果用户指定html中需要保留注释
            if (options.shouldKeepComment) {
              // 取到注释中的文字内容，传给options.comment函数。4表示注释开头为<!--的字符长度为4
              options.comment(html.substring(4, commentEnd))
            }
            // 从html中剔除掉当前的注释字符串
            advance(commentEnd + 3)
            continue
          }
        }

        // http://en.wikipedia.org/wiki/Conditional_comment#Downlevel-revealed_conditional_comment
        // 如果html以<![开头
        // Q vue把Downlevel-revealed条件注释去掉的原因？
        // A Downlevel-revealed在vue中的范围为IE9、非IE浏览器，因此等于全显示，可以去掉
        // TODO <![ 是错误语法，浏览器会将其解析为注释节点
        // https://stackoverflow.com/questions/25067709/html-comment-behavior/25068759#25068759
        if (conditionalComment.test(html)) {
          const conditionalEnd = html.indexOf(']>')

          // 如果找到downlevel-revealed注释节点，则跳过
          if (conditionalEnd >= 0) {
            advance(conditionalEnd + 2)
            continue
          }
        }

        // Doctype:
        // 跳过html字符串中的整个doctype节点
        const doctypeMatch = html.match(doctype)
        if (doctypeMatch) {
          advance(doctypeMatch[0].length)
          continue
        }

        // End tag:
        // 跳过html字符串中的标签结束节点
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
          if (shouldIgnoreFirstNewline(startTagMatch.tagName, html)) {
            advance(1)
          }
          continue
        }
      }

      let text, rest, next
      if (textEnd >= 0) {
        rest = html.slice(textEnd)
        while (
          !endTag.test(rest) &&
          !startTagOpen.test(rest) &&
          !comment.test(rest) &&
          !conditionalComment.test(rest)
        ) {
          // < in plain text, be forgiving and treat it as text
          next = rest.indexOf('<', 1)
          if (next < 0) break
          textEnd += next
          rest = html.slice(textEnd)
        }
        text = html.substring(0, textEnd)
        advance(textEnd)
      }

      if (textEnd < 0) {
        text = html
        html = ''
      }

      if (options.chars && text) {
        options.chars(text)
      }
    } else {
      // 解析纯文本
      let endTagLength = 0
      const stackedTag = lastTag.toLowerCase()
      const reStackedTag = reCache[stackedTag] || (reCache[stackedTag] = new RegExp('([\\s\\S]*?)(</' + stackedTag + '[^>]*>)', 'i'))
      const rest = html.replace(reStackedTag, function (all, text, endTag) {
        endTagLength = endTag.length
        if (!isPlainTextElement(stackedTag) && stackedTag !== 'noscript') {
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

    if (html === last) {
      options.chars && options.chars(html)
      if (process.env.NODE_ENV !== 'production' && !stack.length && options.warn) {
        options.warn(`Mal-formatted tag at end of template: "${html}"`)
      }
      break
    }
  }

  // Clean up any remaining tags
  parseEndTag()

  // 截取html字符串
  function advance (n) {
    index += n
    html = html.substring(n)
  }

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
      while (!(end = html.match(startTagClose)) && (attr = html.match(attribute))) {
        // 将index移动到当前属性之后
        advance(attr[0].length)
        match.attrs.push(attr)
      }
      if (end) {
        // 如果是一元标签，则unarySlash为斜杆/
        match.unarySlash = end[1]
        // 将index移动到闭合之后
        advance(end[0].length)
        match.end = index
        // 只有完整的解析了一个标签字符串，才会返回该标签字符串的对象形式
        return match
      }
    }
  }

  function handleStartTag (match) {
    const tagName = match.tagName
    const unarySlash = match.unarySlash

    if (expectHTML) {
      if (lastTag === 'p' && isNonPhrasingTag(tagName)) {
        parseEndTag(lastTag)
      }
      if (canBeLeftOpenTag(tagName) && lastTag === tagName) {
        parseEndTag(tagName)
      }
    }

    const unary = isUnaryTag(tagName) || !!unarySlash

    const l = match.attrs.length
    const attrs = new Array(l)
    for (let i = 0; i < l; i++) {
      const args = match.attrs[i]
      const value = args[3] || args[4] || args[5] || ''
      const shouldDecodeNewlines = tagName === 'a' && args[1] === 'href'
        ? options.shouldDecodeNewlinesForHref
        : options.shouldDecodeNewlines
      attrs[i] = {
        name: args[1],
        value: decodeAttr(value, shouldDecodeNewlines)
      }
    }

    if (!unary) {
      stack.push({ tag: tagName, lowerCasedTag: tagName.toLowerCase(), attrs: attrs })
      lastTag = tagName
    }

    if (options.start) {
      options.start(tagName, attrs, unary, match.start, match.end)
    }
  }

  function parseEndTag (tagName, start, end) {
    let pos, lowerCasedTagName
    if (start == null) start = index
    if (end == null) end = index

    // Find the closest opened tag of the same type
    if (tagName) {
      lowerCasedTagName = tagName.toLowerCase()
      for (pos = stack.length - 1; pos >= 0; pos--) {
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
      for (let i = stack.length - 1; i >= pos; i--) {
        if (process.env.NODE_ENV !== 'production' &&
          (i > pos || !tagName) &&
          options.warn
        ) {
          options.warn(
            `tag <${stack[i].tag}> has no matching end tag.`
          )
        }
        if (options.end) {
          options.end(stack[i].tag, start, end)
        }
      }

      // Remove the open elements from the stack
      stack.length = pos
      lastTag = pos && stack[pos - 1].tag
    } else if (lowerCasedTagName === 'br') {
      if (options.start) {
        options.start(tagName, [], true, start, end)
      }
    } else if (lowerCasedTagName === 'p') {
      if (options.start) {
        options.start(tagName, [], false, start, end)
      }
      if (options.end) {
        options.end(tagName, start, end)
      }
    }
  }
}
