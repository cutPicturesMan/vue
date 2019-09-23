/* @flow */

import { emptyObject } from 'shared/util'
import { parseFilters } from './parser/filter-parser'

type Range = { start?: number, end?: number };

/* eslint-disable no-unused-vars */
export function baseWarn (msg: string, range?: Range) {
  console.error(`[Vue compiler]: ${msg}`)
}
/* eslint-enable no-unused-vars */
// 从子元素均为对象的数组modules中，取出每个子元素指定key的函数，并返回数组
export function pluckModuleFunction<F: Function> (
  modules: ?Array<Object>,
  key: string
): Array<F> {
  return modules
    ? modules.map(m => m[key]).filter(_ => _)
    : []
}

// 将原生DOM对象的属性存储到el.props数组中
export function addProp (el: ASTElement, name: string, value: string, range?: Range, dynamic?: boolean) {
  (el.props || (el.props = [])).push(rangeSetItem({ name, value, dynamic }, range))
  el.plain = false
}

export function addAttr (el: ASTElement, name: string, value: any, range?: Range, dynamic?: boolean) {
  const attrs = dynamic
    ? (el.dynamicAttrs || (el.dynamicAttrs = []))
    : (el.attrs || (el.attrs = []))
  attrs.push(rangeSetItem({ name, value, dynamic }, range))
  el.plain = false
}

// add a raw attr (use this in preTransforms)
export function addRawAttr (el: ASTElement, name: string, value: any, range?: Range) {
  el.attrsMap[name] = value
  el.attrsList.push(rangeSetItem({ name, value }, range))
}

export function addDirective (
  el: ASTElement,
  name: string,
  rawName: string,
  value: string,
  arg: ?string,
  isDynamicArg: boolean,
  modifiers: ?ASTModifiers,
  range?: Range
) {
  (el.directives || (el.directives = [])).push(rangeSetItem({
    name,
    rawName,
    value,
    arg,
    isDynamicArg,
    modifiers
  }, range))
  el.plain = false
}

function prependModifierMarker (symbol: string, name: string, dynamic?: boolean): string {
  return dynamic
    ? `_p(${name},"${symbol}")`
    : symbol + name // mark the event as captured
}

// 【v-on】https://cn.vuejs.org/v2/api/#v-on
export function addHandler (
  el: ASTElement,
  name: string,
  value: string,
  modifiers: ?ASTModifiers,
  important?: boolean,
  warn?: ?Function,
  range?: Range,
  dynamic?: boolean
) {
  modifiers = modifiers || emptyObject
  // warn prevent and passive modifier
  /* istanbul ignore if */
  // passive表示不阻止事件的默认行为。prevent与其连用时，prevent将会被忽略
  if (
    process.env.NODE_ENV !== 'production' && warn &&
    modifiers.prevent && modifiers.passive
  ) {
    warn(
      'passive and prevent can\'t be used together. ' +
      'Passive handler can\'t prevent default event.',
      range
    )
  }

  // normalize click.right and click.middle since they don't actually fire
  // this is technically browser-specific, but at least for now browsers are
  // the only target envs that have right/middle clicks.

  // 由于click.right、click.middle实际上不会触发，因此需要规范化
  // 这在技术上是特定于浏览器的，但至少就目前而言，浏览器是唯一具有右键/中间点击的目标环境。

  // click.right -> contextmenu（鼠标右击触发的html5事件）
  // click.middle -> mouseup（点击非鼠标主按钮时，触发auxclick事件，一般是点击鼠标中键触发。但由于auxclick事件不受普遍支持，因此不得不使用mouseup。mouseup事件并不是完美的，如果在元素外单击中键，并拖动到元素上松开时，也会触发mouseup事件。但是它已经足够接近了，并且拖动中键单击似乎是极为罕见操作）
  // TODO 某元素上绑定了click、click.middle事件，单击鼠标左键时，为什么不会触发click.middle(mouseup)事件？
  // https://github.com/vuejs/vue/issues/7020
  if (modifiers.right) {
    if (dynamic) {
      name = `(${name})==='click'?'contextmenu':(${name})`
    } else if (name === 'click') {
      name = 'contextmenu'
      delete modifiers.right
    }
  } else if (modifiers.middle) {
    if (dynamic) {
      name = `(${name})==='click'?'mouseup':(${name})`
    } else if (name === 'click') {
      name = 'mouseup'
    }
  }

  // check capture modifier
  // 事件捕获模式
  if (modifiers.capture) {
    delete modifiers.capture
    name = prependModifierMarker('!', name, dynamic)
  }
  // 事件只会触发一次
  if (modifiers.once) {
    delete modifiers.once
    name = prependModifierMarker('~', name, dynamic)
  }
  /* istanbul ignore if */
  // 不阻止事件的默认行为
  if (modifiers.passive) {
    delete modifiers.passive
    name = prependModifierMarker('&', name, dynamic)
  }

  let events
  if (modifiers.native) {
    delete modifiers.native
    events = el.nativeEvents || (el.nativeEvents = {})
  } else {
    events = el.events || (el.events = {})
  }

  /**
   TODO 为何要这样做：.capture -> !、.once -> ~、.passive -> &
   <div @click.prevent="handleClick1" @click="handleClick2" @click.self="handleClick3"></div>

   el.events = {
      "click": [{
        value: "handleClick1",
        dynamic: false,
        modifiers: { prevent: true }
     }, {
        value: "handleClick2",
        dynamic: false,
        modifiers: {}
     }, {
        value: "handleClick3",
        dynamic: false,
        modifiers: { self: true }
     }]
   }
   */
  const newHandler: any = rangeSetItem({ value: value.trim(), dynamic }, range)
  if (modifiers !== emptyObject) {
    newHandler.modifiers = modifiers
  }

  const handlers = events[name]
  /* istanbul ignore if */
  if (Array.isArray(handlers)) {
    important ? handlers.unshift(newHandler) : handlers.push(newHandler)
  } else if (handlers) {
    events[name] = important ? [newHandler, handlers] : [handlers, newHandler]
  } else {
    events[name] = newHandler
  }

  el.plain = false
}

export function getRawBindingAttr (
  el: ASTElement,
  name: string
) {
  return el.rawAttrsMap[':' + name] ||
    el.rawAttrsMap['v-bind:' + name] ||
    el.rawAttrsMap[name]
}

// 尝试获取el上v-bind的值
// 如果没有获取到该动态绑定属性，则获取对应的静态属性
export function getBindingAttr (
  el: ASTElement,
  name: string,
  getStatic?: boolean
): ?string {
  const dynamicValue =
    getAndRemoveAttr(el, ':' + name) ||
    getAndRemoveAttr(el, 'v-bind:' + name)
  // 如果存在这个指令（无论有没有赋值），则进入此分支
  // <div :list="arrList"></div>
  // <div :list></div>
  if (dynamicValue != null) {
    // 解析指令值包含的过滤器
    return parseFilters(dynamicValue)
  } else if (getStatic !== false) {
    const staticValue = getAndRemoveAttr(el, name)
    // TODO 待验证
    // 静态属性和动态属性公用一套处理方法
    // 由于动态属性值会当作js的值处理，如果静态属性有值并直接返回，也会被当作js的值处理
    // 因此这里要用JSON.stringify处理为字符串
    if (staticValue != null) {
      return JSON.stringify(staticValue)
    }
  }
}

// note: this only removes the attr from the Array (attrsList) so that it
// doesn't get processed by processAttrs.
// By default it does NOT remove it from the map (attrsMap) because the map is
// needed during codegen.
/**
 获取并返回el.attrsMap上的某个指令的值，同时将其从el.attrsList中移除，避免该属性值被processAttrs函数处理

 el = {
  type: 1,
  tag: 'div',
  attrsList: [
    {
      name: 'v-if',
      value: 'display'
    }
  ],
  attrsMap: {
    'v-if': 'display'
  }
}
 * @param el
 * @param name
 * @param removeFromMap
 * @returns {*}
 */
export function getAndRemoveAttr (
  el: ASTElement,
  name: string,
  removeFromMap?: boolean
): ?string {
  let val
  if ((val = el.attrsMap[name]) != null) {
    const list = el.attrsList
    for (let i = 0, l = list.length; i < l; i++) {
      if (list[i].name === name) {
        list.splice(i, 1)
        break
      }
    }
  }
  if (removeFromMap) {
    delete el.attrsMap[name]
  }
  return val
}

export function getAndRemoveAttrByRegex (
  el: ASTElement,
  name: RegExp
) {
  const list = el.attrsList
  for (let i = 0, l = list.length; i < l; i++) {
    const attr = list[i]
    if (name.test(attr.name)) {
      list.splice(i, 1)
      return attr
    }
  }
}

// 为item添加start、end属性
function rangeSetItem (
  item: any,
  range?: { start?: number, end?: number }
) {
  if (range) {
    if (range.start != null) {
      item.start = range.start
    }
    if (range.end != null) {
      item.end = range.end
    }
  }
  return item
}
