/* @flow */

import { isDef, isUndef } from 'shared/util'
import { updateListeners } from 'core/vdom/helpers/index'
import { isIE, isFF, supportsPassive, isUsingMicroTask } from 'core/util/index'
import { RANGE_TOKEN, CHECKBOX_RADIO_TOKEN } from 'web/compiler/directives/model'
import { currentFlushTimestamp } from 'core/observer/scheduler'

// normalize v-model event tokens that can only be determined at runtime.
// it's important to place the event as the first in the array because
// the whole point is ensuring the v-model callback gets called before
// user-attached handlers.
function normalizeEvents (on) {
  /* istanbul ignore if */
  if (isDef(on[RANGE_TOKEN])) {
    // IE input[type=range] only supports `change` event
    const event = isIE ? 'change' : 'input'
    on[event] = [].concat(on[RANGE_TOKEN], on[event] || [])
    delete on[RANGE_TOKEN]
  }
  // This was originally intended to fix #4521 but no longer necessary
  // after 2.5. Keeping it for backwards compat with generated code from < 2.4
  /* istanbul ignore if */
  if (isDef(on[CHECKBOX_RADIO_TOKEN])) {
    on.change = [].concat(on[CHECKBOX_RADIO_TOKEN], on.change || [])
    delete on[CHECKBOX_RADIO_TOKEN]
  }
}

let target: any

function createOnceHandler (event, handler, capture) {
  const _target = target // save current target element in closure
  return function onceHandler () {
    const res = handler.apply(null, arguments)
    if (res !== null) {
      remove(event, onceHandler, capture, _target)
    }
  }
}

// #9446: Firefox <= 53 (in particular, ESR 52) has incorrect Event.timeStamp
// implementation and does not fire microtasks in between event propagation, so
// safe to exclude.
// #9446：Firefox v53以下版本的document.createEvent('Event').timeStamp实现有问题，为UNIX时间戳的值 * 1000，让判断错误的认为事件是采用Date.now()。而事件handler函数中的e.timeStamp为performance.now，导致一直不执行处理函数
// 由于在此版本中，事件冒泡期间不会触发microtasks，因此可以不对该版本进行microtasks特殊处理
const useMicrotaskFix = isUsingMicroTask && !(isFF && Number(isFF[1]) <= 53)

function add (
  name: string,
  handler: Function,
  capture: boolean,
  passive: boolean
) {
  // async edge case #6566: inner click event triggers patch, event handler
  // attached to outer element during patch, and triggered again. This
  // happens because browsers fire microtask ticks between event propagation.
  // the solution is simple: we save the timestamp when a handler is attached,
  // and the handler would only fire if the event passed to it was fired
  // AFTER it was attached.
  // 异步边界情况(#6566)：内层元素的click事件触发patch，在patch期间，事件处理器被附加到外层元素上，又触发一遍
  // 这种情况发生的原因是因为浏览器在事件传播期间执行了microtask
  // 解决办法很简单：当处理器被附加上时，保存一个时间戳，该处理器仅会在被附加上之后，事件传递到它时才会触发
  if (useMicrotaskFix) {
    // 缓存currentFlushTimestamp的值（export语句输出的接口，取到的是模块内部实时的值）
    const attachedTimestamp = currentFlushTimestamp
    const original = handler
    handler = original._wrapper = function (e) {
      if (
        // no bubbling, should always fire.
        // this is just a safety net in case event.timeStamp is unreliable in
        // certain weird environments...
        // 不存在冒泡事件，应该总是触发回调函数。即事件是在当前dom触发，而不是其子dom冒泡上来的
        // 这只是一个安全措施，以防止在某些怪异的环境中，event.timeStamp是不可靠的
        e.target === e.currentTarget ||
        // event is fired after handler attachment
        // 在处理器附加上之后触发事件
        e.timeStamp >= attachedTimestamp ||
        // bail for environments that have buggy event.timeStamp implementations
        // #9462 iOS 9 bug: event.timeStamp is 0 after history.pushState
        // #9681 QtWebEngine event.timeStamp is negative value
        // 为event.timeStamp有bug的环境提供保证
        // #9462 IOS 9的bug：在history.pushState之后，event.timeStamp为0
        // #9681 QtWebEngine下的event.timeStamp为负值
        e.timeStamp <= 0 ||
        // #9448 bail if event is fired in another document in a multi-page
        // electron/nw.js app, since event.timeStamp will be using a different
        // starting reference
        // #9448：保证在多页的electron/nw.js应用中，子页面的事件会正常触发。因为event.timeStamp会使用不同的开始引用，所以这里不能用子页面的event.timeStamp与当前页面的attachedTimestamp比较
        // #9448中当前页面的new Vue与子页面的new Vue使用的是相同的currentFlushTimestamp，都是基于父页面onLoad时起算的
        e.target.ownerDocument !== document
      ) {
        return original.apply(this, arguments)
      }
    }
  }
  target.addEventListener(
    name,
    handler,
    supportsPassive
      ? { capture, passive }
      : capture
  )
}

function remove (
  name: string,
  handler: Function,
  capture: boolean,
  _target?: HTMLElement
) {
  (_target || target).removeEventListener(
    name,
    handler._wrapper || handler,
    capture
  )
}

function updateDOMListeners (oldVnode: VNodeWithData, vnode: VNodeWithData) {
  if (isUndef(oldVnode.data.on) && isUndef(vnode.data.on)) {
    return
  }
  const on = vnode.data.on || {}
  const oldOn = oldVnode.data.on || {}
  target = vnode.elm
  normalizeEvents(on)
  updateListeners(on, oldOn, add, remove, createOnceHandler, vnode.context)
  target = undefined
}

export default {
  create: updateDOMListeners,
  update: updateDOMListeners
}
