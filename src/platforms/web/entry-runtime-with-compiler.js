/* @flow */

import config from 'core/config'
import { warn, cached } from 'core/util/index'
import { mark, measure } from 'core/util/perf'

import Vue from './runtime/index'
import { query } from './util/index'
import { compileToFunctions } from './compiler/index'
import { shouldDecodeNewlines, shouldDecodeNewlinesForHref } from './util/compat'

// 返回并缓存id对应的html字符串
const idToTemplate = cached(id => {
  const el = query(id)
  return el && el.innerHTML
})

const mount = Vue.prototype.$mount
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {
  // 将字符串形式、Element形式的el统一转为Element（el只在由new Vue下时使用）
  el = el && query(el)

  /* istanbul ignore if */
  // 由于挂载元素会被Vue生成的DOM替换，因此不推荐挂载root实例到<html>或者<body>上
  if (el === document.body || el === document.documentElement) {
    process.env.NODE_ENV !== 'production' && warn(
      `Do not mount Vue to <html> or <body> - mount to normal elements instead.`
    )
    // 返回this使其可以连缀调用
    return this
  }

  const options = this.$options
  // resolve template/el and convert to render function
  // 如果没有提供render函数，则通过template、el生成render函数
  if (!options.render) {
    let template = options.template
    // 如果提供了template，template有3种可能，最终要转换成html字符串模板
    if (template) {
      if (typeof template === 'string') {
        // 1、id选择器，常用于<script type="x-template">包含模板
        if (template.charAt(0) === '#') {
          template = idToTemplate(template)
          /* istanbul ignore if */
          if (process.env.NODE_ENV !== 'production' && !template) {
            warn(
              `Template element not found or is empty: ${options.template}`,
              this
            )
          }
        }
        // 2、html字符串模板（这个就是最终要处理成的结果，不需要处理了）

      } else if (template.nodeType) {
        // 3、HTMLElement实例，则取其字符串形式
        template = template.innerHTML
      } else {
        // 如果template非以上3种，则提示
        if (process.env.NODE_ENV !== 'production') {
          warn('invalid template option:' + template, this)
        }
        return this
      }
    } else if (el) {
      // 获取Element形式的el的字符串
      template = getOuterHTML(el)
    }
    // html字符串模板
    if (template) {
      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile')
      }

      const { render, staticRenderFns } = compileToFunctions(template, {
        outputSourceRange: process.env.NODE_ENV !== 'production',
        shouldDecodeNewlines,
        shouldDecodeNewlinesForHref,
        delimiters: options.delimiters,
        comments: options.comments
      }, this)
      options.render = render
      options.staticRenderFns = staticRenderFns

      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile end')
        measure(`vue ${this._name} compile`, 'compile', 'compile end')
      }
    }
  }
  return mount.call(this, el, hydrating)
}

/**
 * Get outerHTML of elements, taking care
 * of SVG elements in IE as well.
 */
// 原先outerHTML是HTMLElement才有的属性，而SVG是XML元素，因此SVG上没有outerHTML属性
// 后来各大浏览器将innerHTML、outerHTML从HTMLElement移到了Element上，SVG才有了outerHTML属性
// 但是此时IE11在2013年11月07日就发布了，没有outerHTML属性，因此把SVG插入到div中，再获取div的innerHTML即可
// TODO 验证IE11是否有outerHTML属性
// https://stackoverflow.com/questions/12592417/outerhtml-of-an-svg-element
// https://bugs.chromium.org/p/chromium/issues/detail?id=311080
function getOuterHTML (el: Element): string {
  if (el.outerHTML) {
    return el.outerHTML
  } else {
    const container = document.createElement('div')
    // appendChild会将旧的dom节点移动到新的位置，因此要cloneNode复制一份
    container.appendChild(el.cloneNode(true))
    return container.innerHTML
  }
}

Vue.compile = compileToFunctions

export default Vue
