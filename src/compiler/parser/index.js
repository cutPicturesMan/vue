/* @flow */

import he from 'he'
import { parseHTML } from './html-parser'
import { parseText } from './text-parser'
import { parseFilters } from './filter-parser'
import { genAssignmentCode } from '../directives/model'
import { extend, cached, no, camelize, hyphenate } from 'shared/util'
import { isIE, isEdge, isServerRendering } from 'core/util/env'

import {
  addProp,
  addAttr,
  baseWarn,
  addHandler,
  addDirective,
  getBindingAttr,
  getAndRemoveAttr,
  getRawBindingAttr,
  pluckModuleFunction,
  getAndRemoveAttrByRegex
} from '../helpers'

// 检测标签属性名是否是监听事件的指令
export const onRE = /^@|^v-on:/
// 检测标签属性名是否是指令
// @为v-on的缩写
// :为v-bind的缩写
// .修饰符新特性：https://github.com/vuejs/vue/issues/7582
export const dirRE = process.env.VBIND_PROP_SHORTHAND
  ? /^v-|^@|^:|^\.|^#/
  : /^v-|^@|^:|^#/
// 匹配v-for="item of list"，并提取字符串item、list
// v-for是可以分成多行写的，[^]、[\s\S]都表示匹配任何字符（包括换行符），但是[^]IE不支持，会匹配到空值，因此使用[\s\S]
// http://sjhannah.com/blog/2011/05/17/javascript-matching-all-characters-including-new-line/
// 匹配item字符串时，要用惰性匹配`[\s\S]*?`，不能用贪婪匹配。例如匹配`for key in [{body: 'Hey in body'}]`，如果用贪婪匹配，最后一个匹配组会匹配到`body'}]`而不是`[{body: 'Hey in body'}]`
export const forAliasRE = /([\s\S]*?)\s+(?:in|of)\s+([\s\S]*)/
// support array and nested destructuring in v-for
// 匹配v-for参数部分的3个参数。第一个参数可能存在解构赋值的情况，由于只有数组、对象才能进行解构赋值，因此匹配到结尾都不能出现"}"、"]"这两个符号
// 例如：<li v-for="([ foo, bar, baz ], i) in items"></li>
export const forIteratorRE = /,([^,\}\]]*)(?:,([^,\}\]]*))?$/
// 匹配以"("开头、或者以")"结尾的字符串
const stripParensRE = /^\(|\)$/g
// 匹配动态参数，<a v-on:[eventName]="doSomething"> ... </a>
// https://cn.vuejs.org/v2/guide/syntax.html#动态参数
const dynamicArgRE = /^\[.*\]$/

// 匹配指令的参数列表，<div v-on:click.stop="handleClick"></div>
const argRE = /:(.*)$/
// 匹配v-bind指令
export const bindRE = /^:|^\.|^v-bind:/
const propBindRE = /^\./
// 匹配修饰符（"."以及"."后面的字符）
// TODO https://github.com/vuejs/vue/issues/9577
const modifierRE = /\.[^.\]]+(?=[^\]]*$)/g

// https://cn.vuejs.org/v2/guide/components-slots.html
const slotRE = /^v-slot(:|$)|^#/

// TODO 这里的换行为啥是\r\n，而不是\r?\n，是不是parse阶段的时候处理过了？
const lineBreakRE = /[\r\n]/
const whitespaceRE = /\s+/g

// 匹配非法的动态参数表达式
const invalidAttributeRE = /[\s"'<>\/=]/

// 解码HTML字符实体，并缓存结果
// &#x26; -> '&'
const decodeHTMLCached = cached(he.decode)

export const emptySlotScopeToken = `_empty_`

// configurable state
// 初始化编译器选项参数
export let warn: any
let delimiters
let transforms
let preTransforms
let postTransforms
let platformIsPreTag
let platformMustUseProp
let platformGetTagNamespace
let maybeComponent

// 创建一个ast描述对象
export function createASTElement (
  tag: string,
  attrs: Array<ASTAttr>,
  parent: ASTElement | void
): ASTElement {
  return {
    // 1表示标签，2表示包含字面量表达式的文本节点，3表示普通文本节点或注释节点
    type: 1,
    tag,
    // 标签的原始属性数组：[{name: 'class', value: 'foo'}]
    attrsList: attrs,
    // attrsList对应的对象形式：{'class': 'foo'}
    attrsMap: makeAttrsMap(attrs),
    rawAttrsMap: {},
    parent,
    children: []
  }
}

/**
 * Convert HTML string to AST.
 * 将html字符串转为ast树
 * 实时参考：http://hcysun.me/vue-template-compiler-playground/
 *
  html字符串：
    <ul>
      <li>
        <span>文本</span>
      </li>
    </ul>

  ast树：
    {
      type: 1,
      tag: 'ul',
      parent: null,
      attrsList: [],
      children: [{
        type: 1,
        tag: 'li',
        parent: ul,
        attrsList: [],
        children: [
          ...
        ]
      }]
    }
*/
export function parse (
  template: string,
  // options参数来自于src/platforms/web/compiler/options.js
  options: CompilerOptions
): ASTElement | void {
  warn = options.warn || baseWarn

  platformIsPreTag = options.isPreTag || no
  platformMustUseProp = options.mustUseProp || no
  platformGetTagNamespace = options.getTagNamespace || no
  const isReservedTag = options.isReservedTag || no
  maybeComponent = (el: ASTElement) => !!el.component || !isReservedTag(el.tag)

  /**
   options.modules选项来自于src/platforms/web/compiler/modules/index.js

   options.modules = [{
     staticKeys: ['staticClass'],
     transformNode,
     genData
   }, {
     staticKeys: ['staticStyle'],
     transformNode,
     genData
   }, {
     preTransformNode
   }]

   transforms = [transformNode, transformNode]
   */
  transforms = pluckModuleFunction(options.modules, 'transformNode')
  preTransforms = pluckModuleFunction(options.modules, 'preTransformNode')
  postTransforms = pluckModuleFunction(options.modules, 'postTransformNode')

  delimiters = options.delimiters

  const stack = []
  // 【不推荐使用】默认情况下（true），编译好的render函数会保留元素标签之间的所有空白字符。设为false，则会忽略所有标签之间的空白，这可能会影响到内联元素的布局
  const preserveWhitespace = options.preserveWhitespace !== false
  /**
   whitespace不会影响<pre>标签内的空白，取值有以下2种情况：
   1、preserve：只处理元素标签之间的
    1）如果元素标签之间只有纯空白文本节点，则将其压缩成一个空格
    2）所有其他空白都按原样保留

   2、condense：与纯HTML相比，在某些情况下该选项会造成一些视觉布局上的不同
    1）如果元素标签之间的纯空白文本节点包含新行，则删除该节点；否则，将它压缩成一个单独的空格
    2）非空白文本节点中的连续空白将被压缩成一个空格

   <!-- source -->
   <div>
     <span>
     foo
     </span>   <span>bar</span>
   </div>

   <!-- whitespace: 'preserve' -->
   <div> <span>
     foo
     </span> <span>bar</span> </div>

   <!-- whitespace: 'condense' -->
   <div><span> foo </span> <span>bar</span></div>
   */
  const whitespaceOption = options.whitespace
  let root
  let currentParent
  let inVPre = false
  let inPre = false
  let warned = false

  function warnOnce (msg, range) {
    if (!warned) {
      warned = true
      warn(msg, range)
    }
  }

  // 遇到一元标签或非一元标签的结束标签时，都会调用该方法“闭合”标签
  function closeElement (element) {
    trimEndingWhitespace(element)
    if (!inVPre && !element.processed) {
      element = processElement(element, options)
    }
    // tree management
    // stack.length为0，表示不处于任何标签内，那么当前肯定在处理根节点 && 当前节点不是根节点，则是根节点的同级节点
    if (!stack.length && element !== root) {
      // allow root elements with v-if, v-else-if and v-else
      // 允许使用v-if的情况下存在多个根节点
      if (root.if && (element.elseif || element.else)) {
        if (process.env.NODE_ENV !== 'production') {
          checkRootConstraints(element)
        }
        addIfCondition(root, {
          exp: element.elseif,
          block: element
        })
      } else if (process.env.NODE_ENV !== 'production') {
        // 如果是没有使用v-if指令的多个根节点，则提示
        warnOnce(
          `Component template should contain exactly one root element. ` +
          `If you are using v-if on multiple elements, ` +
          `use v-else-if to chain them instead.`,
          { start: element.start }
        )
      }
    }
    if (currentParent && !element.forbidden) {
      if (element.elseif || element.else) {
        // 将v-else-if、v-else元素的ast添加到v-if元素的ifConditions数组中，而不是添加到父级ast的children中
        processIfConditions(element, currentParent)
      } else {
        if (element.slotScope) {
          // scoped slot
          // keep it in the children list so that v-else(-if) conditions can
          // find it as the prev node.
          // 使用了slot-scope特性的元素将被添加到父级描述对象的scopedSlots对象下，不会作为父级元素的子节点
          const name = element.slotTarget || '"default"'
          ;(currentParent.scopedSlots || (currentParent.scopedSlots = {}))[name] = element
        }
        // 建立元素描述对象的父子关系
        currentParent.children.push(element)
        element.parent = currentParent
      }
    }

    // final children cleanup
    // filter out scoped slots
    element.children = element.children.filter(c => !(c: any).slotScope)
    // remove trailing whitespace node again
    trimEndingWhitespace(element)

    // check pre state
    // 由于起始标签使用了v-pre，这里需要将inVPre设为false
    if (element.pre) {
      inVPre = false
    }
    // 由于起始标签为<pre>，这里需要将inPre设为false
    if (platformIsPreTag(element.tag)) {
      inPre = false
    }
    // apply post-transforms
    // weex中使用的后置处理
    for (let i = 0; i < postTransforms.length; i++) {
      postTransforms[i](element, options)
    }
  }

  // 如果当前元素最后一个子节点是空白节点，则移除
  // <div><span>test</span>     <!-- 空白占位 -->     </div>
  function trimEndingWhitespace (el) {
    // remove trailing whitespace node
    if (!inPre) {
      let lastNode
      while (
        (lastNode = el.children[el.children.length - 1]) &&
        lastNode.type === 3 &&
        lastNode.text === ' '
      ) {
        el.children.pop()
      }
    }
  }

  // 检测模板根元素是否有且只有一个根元素
  function checkRootConstraints (el) {
    // slot插槽的内容是由外界决定的，有可能渲染多个节点
    // template作为抽象组件，不会渲染任何内容到页面，但是可能包含多个子节点
    if (el.tag === 'slot' || el.tag === 'template') {
      warnOnce(
        `Cannot use <${el.tag}> as component root element because it may ` +
        'contain multiple nodes.',
        { start: el.start }
      )
    }
    // v-for指令会渲染多个节点
    if (el.attrsMap.hasOwnProperty('v-for')) {
      warnOnce(
        'Cannot use v-for on stateful component root element because ' +
        'it renders multiple elements.',
        el.rawAttrsMap['v-for']
      )
    }
  }

  parseHTML(template, {
    warn,
    expectHTML: options.expectHTML,
    isUnaryTag: options.isUnaryTag,
    canBeLeftOpenTag: options.canBeLeftOpenTag,
    shouldDecodeNewlines: options.shouldDecodeNewlines,
    shouldDecodeNewlinesForHref: options.shouldDecodeNewlinesForHref,
    shouldKeepComment: options.comments,
    outputSourceRange: options.outputSourceRange,
    // 每次遇到开始标签时调用
    start (tag, attrs, unary, start, end) {
      // check namespace.
      // inherit parent ns if there is one
      // 获取标签命名空间，platformGetTagNamespace()只会获取svg和math这两个标签的命名空间
      const ns = (currentParent && currentParent.ns) || platformGetTagNamespace(tag)

      // handle IE svg bug
      /* istanbul ignore if */
      // http://osgeo-org.1560.x6.nabble.com/WFS-and-IE-11-td5090636.html
      /**
       <svg xmlns:feature="http://www.openplans.org/topp"></svg>
       svg标签在IE下被渲染成
       <svg xmlns:NS1="" NS1:xmlns:feature="http://www.openplans.org/topp"></svg>
       需要移除'xmlns:NS1="" NS1:' 这段字符串
       attrs = [{
         name: 'xmlns:NS1',
         value: ''
       }, {
         name: 'NS1:xmlns:feature',
         value: 'http://www.openplans.org/topp'
       }]
       */
      if (isIE && ns === 'svg') {
        attrs = guardIESVGBug(attrs)
      }

      // 为当前开始标签创建一个AST描述对象
      let element: ASTElement = createASTElement(tag, attrs, currentParent)
      if (ns) {
        element.ns = ns
      }

      if (process.env.NODE_ENV !== 'production') {
        if (options.outputSourceRange) {
          element.start = start
          element.end = end
          element.rawAttrsMap = element.attrsList.reduce((cumulated, attr) => {
            cumulated[attr.name] = attr
            return cumulated
          }, {})
        }
        // 检查并警告非法的动态参数表达式
        attrs.forEach(attr => {
          if (invalidAttributeRE.test(attr.name)) {
            warn(
              `Invalid dynamic argument expression: attribute names cannot contain ` +
              `spaces, quotes, <, >, / or =.`,
              {
                start: attr.start + attr.name.indexOf(`[`),
                end: attr.start + attr.name.length
              }
            )
          }
        })
      }

      // 模板只负责数据状态到UI的映射，不应该存在引起副作用的代码
      if (isForbiddenTag(element) && !isServerRendering()) {
        element.forbidden = true
        process.env.NODE_ENV !== 'production' && warn(
          'Templates should only be responsible for mapping the state to the ' +
          'UI. Avoid placing tags with side-effects in your templates, such as ' +
          `<${tag}>` + ', as they will not be parsed.',
          { start: element.start }
        )
      }

      // apply pre-transforms
      // 预处理（目前只处理了v-model指令）
      for (let i = 0; i < preTransforms.length; i++) {
        element = preTransforms[i](element, options) || element
      }

      // 如果当前元素没有被<pre>标签包裹，则进入此流程
      if (!inVPre) {
        // 如果当前标签使用了v-pre指令，则element.pre为true
        processPre(element)
        if (element.pre) {
          inVPre = true
        }
      }
      // 判断当前元素是否是<pre>标签
      // 1、<pre> 标签会对其所包含的 html 字符实体进行解码
      // 2、<pre> 标签会保留 html 字符串编写时的空白
      if (platformIsPreTag(element.tag)) {
        inPre = true
      }
      if (inVPre) {
        processRawAttrs(element)
      } else if (!element.processed) {
        // structural directives
        // 处理结构上的指令
        processFor(element)
        processIf(element)
        processOnce(element)
      }

      if (!root) {
        // root不存在，说明当前元素就是根元素
        root = element
        if (process.env.NODE_ENV !== 'production') {
          checkRootConstraints(root)
        }
      }

      if (!unary) {
        currentParent = element
        stack.push(element)
      } else {
        closeElement(element)
      }
    },
    // 每次遇到结束标签时调用
    end (tag, start, end) {
      const element = stack[stack.length - 1]
      // TODO https://github.com/vuejs/vue/issues/9208
      // pop stack
      // 移除当前节点
      stack.length -= 1
      currentParent = stack[stack.length - 1]
      if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
        element.end = end
      }
      closeElement(element)
    },
    // 遇到纯文本时调用
    chars (text: string, start: number, end: number) {
      // 当前是根节点（没有父节点）
      if (!currentParent) {
        if (process.env.NODE_ENV !== 'production') {
          // 根节点都是文字的情况
          if (text === template) {
            warnOnce(
              'Component template requires a root element, rather than just text.',
              { start }
            )
          } else if ((text = text.trim())) {
            // text<root>主内容</root>text
            warnOnce(
              `text "${text}" outside root element will be ignored.`,
              { start }
            )
          }
        }
        return
      }
      // IE textarea placeholder bug
      // https://github.com/vuejs/vue/issues/4098
      /**
       <div id="box">
        <textarea placeholder="some placeholder..."></textarea>
       </div>

       在IE下，<textarea>标签拥有placeholder属性，但却没有真实的文本内容
       假如使用如下代码获取字符串内容，<textarea>标签的placeholder属性的属性值会被设置为<textarea>的真实文本内容
       这并不是<textarea>的真实文本内容，因此return不处理
       document.getElementById('box').innerHTML   // '<textarea placeholder="some placeholder...">some placeholder...</textarea>'
       */
      /* istanbul ignore if */
      if (isIE &&
        currentParent.tag === 'textarea' &&
        currentParent.attrsMap.placeholder === text
      ) {
        return
      }
      const children = currentParent.children
      // <pre>标签中的处理方式，与正常文本节点相同
      // else if 处理不在<pre>标签中的空格字符
      if (inPre || text.trim()) {
        // 1、在html中，某些字符是预留字符，如"<"、">"，直接使用会被浏览器误认为是标签。如果希望正确地显示预留字符，需要使用字符实体。最后浏览器将其渲染为字符节点"<"、">"
        //    "&lt;div&gt;&lt;/div&gt;" -> "<div></div>"
        //    由于vue中最后是通过document.createTextNode将文本内容直接插入节点中，因此需要解析字符实体
        // 2、如果文本被包含在<script>、<style>标签中，则保持原样
        text = isTextTag(currentParent) ? text : decodeHTMLCached(text)
      } else if (!children.length) {
        // remove the whitespace-only node right after an opening tag
        // 如果当前文本节点的父节点没有子元素，则不保留空格
        text = ''
      } else if (whitespaceOption) {
        // TODO https://github.com/vuejs/vue/issues/9208
        if (whitespaceOption === 'condense') {
          // in condense mode, remove the whitespace node if it contains
          // line break, otherwise condense to a single space
          // 压缩模式下，空白节点如果包含换行符，则直接移除，否则压缩为单个空格
          text = lineBreakRE.test(text) ? '' : ' '
        } else {
          // 保留模式下，标签之间的纯空格节点会被压缩成单个空格，其余的空格保持不变
          text = ' '
        }
      } else {
        text = preserveWhitespace ? ' ' : ''
      }
      // 1、真正的文本节点
      // 2、空格字符：
      //    1）whitespaceOption选项为"condense"，且文本节点没有换行
      //    2）whitespaceOption选项不为"condense"
      //    3）preserveWhitespace选项为true
      if (text) {
        // TODO
        if (!inPre && whitespaceOption === 'condense') {
          // condense consecutive whitespaces into single space
          text = text.replace(whitespaceRE, ' ')
        }
        let res
        let child: ?ASTNode
        // 解析包含字面量表达式的文本节点：<div>我的名字是：{{ name }}</div>
        if (!inVPre && text !== ' ' && (res = parseText(text, delimiters))) {
          child = {
            type: 2,
            expression: res.expression,
            tokens: res.tokens,
            text
          }
        } else if (text !== ' ' || !children.length || children[children.length - 1].text !== ' ') {
          // TODO 分析else if的情况
          child = {
            type: 3,
            text
          }
        }
        if (child) {
          if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
            child.start = start
            child.end = end
          }
          children.push(child)
        }
      }
    },
    // 遇到注释节点调用
    comment (text: string, start, end) {
      // adding anyting as a sibling to the root node is forbidden
      // comments should still be allowed, but ignored
      // https://github.com/vuejs/vue/issues/9407
      // 忽略根节点的注释
      if (currentParent) {
        const child: ASTText = {
          type: 3,
          text,
          isComment: true
        }
        if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
          child.start = start
          child.end = end
        }
        currentParent.children.push(child)
      }
    }
  })
  return root
}

function processPre (el) {
  if (getAndRemoveAttr(el, 'v-pre') != null) {
    el.pre = true
  }
}

// 将pre标签及其子标签，对应的el.attrsList数组的值，同步一份到el.attr上
function processRawAttrs (el) {
  const list = el.attrsList
  const len = list.length
  if (len) {
    const attrs: Array<ASTAttr> = el.attrs = new Array(len)
    for (let i = 0; i < len; i++) {
      attrs[i] = {
        name: list[i].name,
        // TODO 为什么要加stringify
        value: JSON.stringify(list[i].value)
      }
      if (list[i].start != null) {
        attrs[i].start = list[i].start
        attrs[i].end = list[i].end
      }
    }
  } else if (!el.pre) {
    // 含有v-pre指令的元素，el.pre为true，不会进入这里。只有其子元素才会进入此处
    /**
       解析span（v-pre指令的标签的子标签）时进入此处
       <div v-pre>
        <span></span>
       </div>
     */

    // non root node in pre blocks with no attributes
    // 将没有属性的pre子节点，标记plain为true，跳过genData的渲染
    el.plain = true
  }
}

export function processElement (
  element: ASTElement,
  options: CompilerOptions
) {
  processKey(element)

  // determine whether this is a plain element after
  // removing structural attributes
  // TODO plain表示节点移除了结构相关指令之后，是否还有属性？
  // TODO key、scopedSlots不在attrsList列表中，因此需要单独判断？
  // 结构化指令：v-for、v-if/v-else-if/v-else、v-once
  element.plain = (
    !element.key &&
    !element.scopedSlots &&
    !element.attrsList.length
  )

  processRef(element)
  processSlotContent(element)
  processSlotOutlet(element)
  processComponent(element)
  // 处理class、style属性
  for (let i = 0; i < transforms.length; i++) {
    element = transforms[i](element, options) || element
  }
  processAttrs(element)
  return element
}

function processKey (el) {
  const exp = getBindingAttr(el, 'key')
  if (exp) {
    if (process.env.NODE_ENV !== 'production') {
      if (el.tag === 'template') {
        warn(
          `<template> cannot be keyed. Place the key on real elements instead.`,
          getRawBindingAttr(el, 'key')
        )
      }
      if (el.for) {
        const iterator = el.iterator2 || el.iterator1
        const parent = el.parent
        if (iterator && iterator === exp && parent && parent.tag === 'transition-group') {
          warn(
            `Do not use v-for index as key on <transition-group> children, ` +
            `this is the same as not using keys.`,
            getRawBindingAttr(el, 'key'),
            true /* tip */
          )
        }
      }
    }
    el.key = exp
  }
}

function processRef (el) {
  const ref = getBindingAttr(el, 'ref')
  if (ref) {
    el.ref = ref
    el.refInFor = checkInFor(el)
  }
}

// 处理v-for指令
export function processFor (el: ASTElement) {
  let exp
  if ((exp = getAndRemoveAttr(el, 'v-for'))) {
    const res = parseFor(exp)
    if (res) {
      extend(el, res)
    } else if (process.env.NODE_ENV !== 'production') {
      warn(
        `Invalid v-for expression: ${exp}`,
        el.rawAttrsMap['v-for']
      )
    }
  }
}

type ForParseResult = {
  for: string;
  alias: string;
  iterator1?: string;
  iterator2?: string;
};

// <li v-for="([ foo, bar, baz ], i) in items"></li>
// exp表示v-for的值，如"([ foo, bar, baz ], i) in items"
export function parseFor (exp: string): ?ForParseResult {
  // 将参数部分与列表部分分开："item in list" => ["item in list", "item", "list"]
  const inMatch = exp.match(forAliasRE)
  // 没有匹配到，inMatch为null
  if (!inMatch) return
  const res = {}
  res.for = inMatch[2].trim()
  // 去掉参数部分的左右空白和括号：" (item, key, index)" => "item, key, index"
  const alias = inMatch[1].trim().replace(stripParensRE, '')
  // "item, key, index" => [", key, index", " key", " index" ]
  const iteratorMatch = alias.match(forIteratorRE)
  if (iteratorMatch) {
    res.alias = alias.replace(forIteratorRE, '').trim()
    res.iterator1 = iteratorMatch[1].trim()
    if (iteratorMatch[2]) {
      res.iterator2 = iteratorMatch[2].trim()
    }
  } else {
    res.alias = alias
  }
  return res
}

// 将v-if、v-else-if、v-else指令添加到ast上
function processIf (el) {
  const exp = getAndRemoveAttr(el, 'v-if')
  if (exp) {
    el.if = exp
    addIfCondition(el, {
      exp: exp,
      block: el
    })
  } else {
    if (getAndRemoveAttr(el, 'v-else') != null) {
      el.else = true
    }
    const elseif = getAndRemoveAttr(el, 'v-else-if')
    if (elseif) {
      el.elseif = elseif
    }
  }
}

// 将v-else-if、v-else的ast添加到v-if的ifConditions数组中
function processIfConditions (el, parent) {
  const prev = findPrevElement(parent.children)
  // 前一个同级元素使用了v-if
  if (prev && prev.if) {
    addIfCondition(prev, {
      exp: el.elseif,
      block: el
    })
  } else if (process.env.NODE_ENV !== 'production') {
    // 如果前一个同级元素没有用v-if，则提示
    warn(
      `v-${el.elseif ? ('else-if="' + el.elseif + '"') : 'else'} ` +
      `used on element <${el.tag}> without corresponding v-if.`,
      el.rawAttrsMap[el.elseif ? 'v-else-if' : 'v-else']
    )
  }
}

/**
 * 查找父级ast的children数组中最后一个标签节点（即为当前解析标签的前一个标签）
 * 当解析到span标签时，children数组最后一个元素节点还是div，因为p标签的ast并没有被添加到父级ast的children上
 <div>
   <div v-if="a"></div>
   aaaaa
   <p v-else-if="b"></p>
   bbbbb
   <span v-else="c"></span>
 </div>
 */
function findPrevElement (children: Array<any>): ASTElement | void {
  let i = children.length
  while (i--) {
    if (children[i].type === 1) {
      return children[i]
    } else {
      // 前一个节点是非空白的文本节点，将其排除（v-if系列指令的节点之间不能存在其他节点）
      if (process.env.NODE_ENV !== 'production' && children[i].text !== ' ') {
        warn(
          `text "${children[i].text.trim()}" between v-if and v-else(-if) ` +
          `will be ignored.`,
          children[i]
        )
      }
      children.pop()
    }
  }
}

export function addIfCondition (el: ASTElement, condition: ASTIfCondition) {
  if (!el.ifConditions) {
    el.ifConditions = []
  }
  el.ifConditions.push(condition)
}

function processOnce (el) {
  const once = getAndRemoveAttr(el, 'v-once')
  if (once != null) {
    el.once = true
  }
}

// handle content being passed to a component as slot,
// e.g. <template slot="xxx">, <div slot-scope="xxx">
// TODO
function processSlotContent (el) {
  let slotScope
  if (el.tag === 'template') {
    slotScope = getAndRemoveAttr(el, 'scope')
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && slotScope) {
      warn(
        `the "scope" attribute for scoped slots have been deprecated and ` +
        `replaced by "slot-scope" since 2.5. The new "slot-scope" attribute ` +
        `can also be used on plain elements in addition to <template> to ` +
        `denote scoped slots.`,
        el.rawAttrsMap['scope'],
        true
      )
    }
    el.slotScope = slotScope || getAndRemoveAttr(el, 'slot-scope')
  } else if ((slotScope = getAndRemoveAttr(el, 'slot-scope'))) {
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && el.attrsMap['v-for']) {
      warn(
        `Ambiguous combined usage of slot-scope and v-for on <${el.tag}> ` +
        `(v-for takes higher priority). Use a wrapper <template> for the ` +
        `scoped slot to make it clearer.`,
        el.rawAttrsMap['slot-scope'],
        true
      )
    }
    el.slotScope = slotScope
  }

  // slot="xxx"
  const slotTarget = getBindingAttr(el, 'slot')
  if (slotTarget) {
    el.slotTarget = slotTarget === '""' ? '"default"' : slotTarget
    el.slotTargetDynamic = !!(el.attrsMap[':slot'] || el.attrsMap['v-bind:slot'])
    // preserve slot as an attribute for native shadow DOM compat
    // only for non-scoped slots.
    if (el.tag !== 'template' && !el.slotScope) {
      addAttr(el, 'slot', slotTarget, getRawBindingAttr(el, 'slot'))
    }
  }

  // 2.6 v-slot syntax
  if (process.env.NEW_SLOT_SYNTAX) {
    if (el.tag === 'template') {
      // v-slot on <template>
      const slotBinding = getAndRemoveAttrByRegex(el, slotRE)
      if (slotBinding) {
        if (process.env.NODE_ENV !== 'production') {
          if (el.slotTarget || el.slotScope) {
            warn(
              `Unexpected mixed usage of different slot syntaxes.`,
              el
            )
          }
          if (el.parent && !maybeComponent(el.parent)) {
            warn(
              `<template v-slot> can only appear at the root level inside ` +
              `the receiving component`,
              el
            )
          }
        }
        const { name, dynamic } = getSlotName(slotBinding)
        el.slotTarget = name
        el.slotTargetDynamic = dynamic
        el.slotScope = slotBinding.value || emptySlotScopeToken // force it into a scoped slot for perf
      }
    } else {
      // v-slot on component, denotes default slot
      const slotBinding = getAndRemoveAttrByRegex(el, slotRE)
      if (slotBinding) {
        if (process.env.NODE_ENV !== 'production') {
          if (!maybeComponent(el)) {
            warn(
              `v-slot can only be used on components or <template>.`,
              slotBinding
            )
          }
          if (el.slotScope || el.slotTarget) {
            warn(
              `Unexpected mixed usage of different slot syntaxes.`,
              el
            )
          }
          if (el.scopedSlots) {
            warn(
              `To avoid scope ambiguity, the default slot should also use ` +
              `<template> syntax when there are other named slots.`,
              slotBinding
            )
          }
        }
        // add the component's children to its default slot
        const slots = el.scopedSlots || (el.scopedSlots = {})
        const { name, dynamic } = getSlotName(slotBinding)
        const slotContainer = slots[name] = createASTElement('template', [], el)
        slotContainer.slotTarget = name
        slotContainer.slotTargetDynamic = dynamic
        slotContainer.children = el.children.filter((c: any) => {
          if (!c.slotScope) {
            c.parent = slotContainer
            return true
          }
        })
        slotContainer.slotScope = slotBinding.value || emptySlotScopeToken
        // remove children as they are returned from scopedSlots now
        el.children = []
        // mark el non-plain so data gets generated
        el.plain = false
      }
    }
  }
}

function getSlotName (binding) {
  let name = binding.name.replace(slotRE, '')
  if (!name) {
    if (binding.name[0] !== '#') {
      name = 'default'
    } else if (process.env.NODE_ENV !== 'production') {
      warn(
        `v-slot shorthand syntax requires a slot name.`,
        binding
      )
    }
  }
  return dynamicArgRE.test(name)
    // dynamic [name]
    ? { name: name.slice(1, -1), dynamic: true }
    // static name
    : { name: `"${name}"`, dynamic: false }
}

// handle <slot/> outlets
// 处理<slot>标签，如<slot name="header"></slot>
function processSlotOutlet (el) {
  if (el.tag === 'slot') {
    el.slotName = getBindingAttr(el, 'name')
    // key属性不能使用在<slot>、<template> 上
    // <slot>和<template>都是抽象组件，抽象组件要么渲染真实DOM，要么会被不可预知的DOM元素替代
    if (process.env.NODE_ENV !== 'production' && el.key) {
      warn(
        `\`key\` does not work on <slot> because slots are abstract outlets ` +
        `and can possibly expand into multiple elements. ` +
        `Use the key on a wrapping element instead.`,
        getRawBindingAttr(el, 'key')
      )
    }
  }
}

function processComponent (el) {
  let binding
  if ((binding = getBindingAttr(el, 'is'))) {
    el.component = binding
  }
  if (getAndRemoveAttr(el, 'inline-template') != null) {
    el.inlineTemplate = true
  }
}

/**
 * 处理el.attrsList数组中剩余的属性：
 * 1、v-text、v-html、v-show、v-on、v-bind、v-model、v-cloak
 * 2、自定义绑定属性、自定义事件、自定义非绑定属性：
 *    <div
 *        :custom-prop="someVal"
 *        @custom-event="handleEvent"
 *        other-prop="static-prop"></div>
 *
   已处理的指令：
   v-pre
   v-for
   v-if、v-else-if、v-else
   v-once
   key
   ref
   slot、slot-scope、scope、name
   is、inline-template
 */
function processAttrs (el) {
  const list = el.attrsList
  let i, l, name, rawName, value, modifiers, syncGen, isDynamic
  for (i = 0, l = list.length; i < l; i++) {
    // 属性名
    name = rawName = list[i].name
    // 属性值
    value = list[i].value
    // 如果属性名是指令
    if (dirRE.test(name)) {
      // mark element as dynamic
      el.hasBindings = true
      // modifiers
      // 解析修饰符
      modifiers = parseModifiers(name.replace(dirRE, ''))
      // support .foo shorthand syntax for the .prop modifier
      if (process.env.VBIND_PROP_SHORTHAND && propBindRE.test(name)) {
        // TODO prop为真说明该绑定的属性是原生DOM对象的属性？
        (modifiers || (modifiers = {})).prop = true
        name = `.` + name.slice(1).replace(modifierRE, '')
      } else if (modifiers) {
        // 将修饰符从指令字符串中移除
        name = name.replace(modifierRE, '')
      }
      if (bindRE.test(name)) { // v-bind
        // 去掉v-bind指令：:name -> name
        name = name.replace(bindRE, '')
        value = parseFilters(value)
        isDynamic = dynamicArgRE.test(name)
        if (isDynamic) {
          name = name.slice(1, -1)
        }
        if (
          process.env.NODE_ENV !== 'production' &&
          value.trim().length === 0
        ) {
          warn(
            `The value for a v-bind expression cannot be empty. Found in "v-bind:${name}"`
          )
        }
        // 处理v-bind的三个修饰符：prop、camel、sync
        // .prop修饰符 用于设置标签的DOM对象所对应的同名属性（https://cn.vuejs.org/v2/api/#v-bind）
        if (modifiers) {
          if (modifiers.prop && !isDynamic) {
            name = camelize(name)
            if (name === 'innerHtml') name = 'innerHTML'
          }
          if (modifiers.camel && !isDynamic) {
            name = camelize(name)
          }
          // 修饰符sync是一个语法糖，实质是从子组件发出一个叫'update:xx'的事件（xx为对应的驼峰化prop），父组件监听此事件并修改对应的值
          if (modifiers.sync) {
            syncGen = genAssignmentCode(value, `$event`)
            if (!isDynamic) {
              addHandler(
                el,
                `update:${camelize(name)}`,
                syncGen,
                null,
                false,
                warn,
                list[i]
              )
              if (hyphenate(name) !== camelize(name)) {
                addHandler(
                  el,
                  `update:${hyphenate(name)}`,
                  syncGen,
                  null,
                  false,
                  warn,
                  list[i]
                )
              }
            } else {
              // handler w/ dynamic event name
              addHandler(
                el,
                `"update:"+(${name})`,
                syncGen,
                null,
                false,
                warn,
                list[i],
                true // dynamic
              )
            }
          }
        }
        if ((modifiers && modifiers.prop) || (
          !el.component && platformMustUseProp(el.tag, el.attrsMap.type, name)
        )) {
          addProp(el, name, value, list[i], isDynamic)
        } else {
          addAttr(el, name, value, list[i], isDynamic)
        }
      } else if (onRE.test(name)) { // v-on
        // 替换前缀，取出事件名称
        name = name.replace(onRE, '')
        // 是否是动态事件名
        isDynamic = dynamicArgRE.test(name)
        // 如果是动态事件名（被[]包裹），则取中间的事件名称
        if (isDynamic) {
          name = name.slice(1, -1)
        }
        addHandler(el, name, value, modifiers, false, warn, list[i], isDynamic)
      } else { // normal directives
        // 处理v-text、v-html、v-show、v-cloak、v-model以及其他自定义指令（如<div v-zz:arg.modif="test"></div>，实际处理到这里不会有修饰符了）
        name = name.replace(dirRE, '')
        // parse arg
        const argMatch = name.match(argRE)
        let arg = argMatch && argMatch[1]
        isDynamic = false
        if (arg) {
          name = name.slice(0, -(arg.length + 1))
          if (dynamicArgRE.test(arg)) {
            arg = arg.slice(1, -1)
            isDynamic = true
          }
        }
        // addDirective(el, 'zz', 'v-zz:arg.modif', 'test', 'arg', false, { modif: true }, list[i])
        addDirective(el, name, rawName, value, arg, isDynamic, modifiers, list[i])
        if (process.env.NODE_ENV !== 'production' && name === 'model') {
          checkForAliasModel(el, value)
        }
      }
    } else {
      // literal attribute
      // 对字面量属性做一个提示，让其改用v-bind写法
      // <div id="{{ isTrue ? 'a' : 'b' }}"></div>
      if (process.env.NODE_ENV !== 'production') {
        const res = parseText(value, delimiters)
        if (res) {
          warn(
            `${name}="${value}": ` +
            'Interpolation inside attributes has been removed. ' +
            'Use v-bind or the colon shorthand instead. For example, ' +
            'instead of <div id="{{ val }}">, use <div :id="val">.',
            list[i]
          )
        }
      }
      // 将非指令属性添加到el.attrs中
      // TODO 为何要JSON.stringify(value)
      addAttr(el, name, JSON.stringify(value), list[i])
      // #6887 firefox doesn't update muted state if set via attribute
      // even immediately after element creation
      // https://github.com/vuejs/vue/issues/6887
      // 在由虚拟DOM创建真实DOM的过程中，会通过setAttribute方法将el.attrs数组中的属性添加到真实DOM元素上
      // 而在火狐浏览器中，无法通过DOM元素的setAttribute方法为video标签添加muted属性，需要使用真实DOM对象的属性方式添加
      if (!el.component &&
          name === 'muted' &&
          platformMustUseProp(el.tag, el.attrsMap.type, name)) {
        addProp(el, name, 'true', list[i])
      }
    }
  }
}

// 判断当前元素及其父级是否有v-for指令
function checkInFor (el: ASTElement): boolean {
  let parent = el
  while (parent) {
    if (parent.for !== undefined) {
      return true
    }
    parent = parent.parent
  }
  return false
}

/**
 * 解析修饰符
 * <div @click.stop.prevent="doThat"></div>
 * @param name 'click.stop.prevent'
 * @returns {
 *    stop: true,
 *    prevent: true
 * }
 */
function parseModifiers (name: string): Object | void {
  const match = name.match(modifierRE)
  if (match) {
    const ret = {}
    match.forEach(m => { ret[m.slice(1)] = true })
    return ret
  }
}

/**
 * 将标签的属性数组转换成"属性名-属性值"形式的对象
 * @param attrs
 [{
   name: 'v-for',
   value: 'obj of list'
 }, {
   name: 'class',
   value: 'box'
 }]
 * @returns {}
  {
    'v-for': 'obj of list',
    'class': 'box'
  }
 */
function makeAttrsMap (attrs: Array<Object>): Object {
  const map = {}
  for (let i = 0, l = attrs.length; i < l; i++) {
    if (
      process.env.NODE_ENV !== 'production' &&
      map[attrs[i].name] && !isIE && !isEdge
    ) {
      warn('duplicate attribute: ' + attrs[i].name, attrs[i])
    }
    map[attrs[i].name] = attrs[i].value
  }
  return map
}

// for script (e.g. type="x/template") or style, do not decode content
function isTextTag (el): boolean {
  return el.tag === 'script' || el.tag === 'style'
}

/**
 * 禁用<style>标签、<script>标签、<script type="text/javascript">标签
 * @param el
 * @returns {boolean}
 */
function isForbiddenTag (el): boolean {
  return (
    el.tag === 'style' ||
    (el.tag === 'script' && (
      !el.attrsMap.type ||
      el.attrsMap.type === 'text/javascript'
    ))
  )
}

const ieNSBug = /^xmlns:NS\d+/
const ieNSPrefix = /^NS\d+:/

/* istanbul ignore next */
function guardIESVGBug (attrs) {
  const res = []
  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs[i]
    if (!ieNSBug.test(attr.name)) {
      attr.name = attr.name.replace(ieNSPrefix, '')
      res.push(attr)
    }
  }
  return res
}

/**
 * 循环向上查找
 * 如果在v-for中v-model的值为基本类型值，则v-model对应的修改不会体现到v-for的数组里，如下所示
 * <div v-for="item of [1, 2, 3]">
 *  <input v-model="item" />
 * </div>
 *
 * 需要将v-for的数组改为对象数组
 * <div v-for="obj of [{ item: 1 }, { item: 2 }, { item: 3 }]">
 *   <input v-model="obj.item" />
 * </div>
 * @param el
 * @param value
 */
function checkForAliasModel (el, value) {
  let _el = el
  while (_el) {
    if (_el.for && _el.alias === value) {
      warn(
        `<${el.tag} v-model="${value}">: ` +
        `You are binding v-model directly to a v-for iteration alias. ` +
        `This will not be able to modify the v-for source array because ` +
        `writing to the alias is like modifying a function local variable. ` +
        `Consider using an array of objects and use v-model on an object property instead.`,
        el.rawAttrsMap['v-model']
      )
    }
    _el = _el.parent
  }
}
