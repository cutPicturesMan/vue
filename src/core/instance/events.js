/* @flow */

import {
  tip,
  toArray,
  hyphenate,
  formatComponentName,
  invokeWithErrorHandling
} from '../util/index'
import { updateListeners } from '../vdom/helpers/index'

export function initEvents (vm: Component) {
  // 总体事件对象
  vm._events = Object.create(null)
  vm._hasHookEvent = false
  // init parent attached events
  // TODO 待lifeCircle看完之后再阅读
  const listeners = vm.$options._parentListeners
  if (listeners) {
    updateComponentListeners(vm, listeners)
  }
}

let target: any

function add (event, fn) {
  target.$on(event, fn)
}

function remove (event, fn) {
  target.$off(event, fn)
}

function createOnceHandler (event, fn) {
  const _target = target
  return function onceHandler () {
    const res = fn.apply(null, arguments)
    if (res !== null) {
      _target.$off(event, onceHandler)
    }
  }
}

export function updateComponentListeners (
  vm: Component,
  listeners: Object,
  oldListeners: ?Object
) {
  target = vm
  updateListeners(listeners, oldListeners || {}, add, remove, createOnceHandler, vm)
  target = undefined
}

// 在原型上定义事件有关的方法：$on、$once、$off、$emit
export function eventsMixin (Vue: Class<Component>) {
  const hookRE = /^hook:/
  Vue.prototype.$on = function (event: string | Array<string>, fn: Function): Component {
    const vm: Component = this
    // 1、添加多个事件的单个回调函数
    if (Array.isArray(event)) {
      for (let i = 0, l = event.length; i < l; i++) {
        vm.$on(event[i], fn)
      }
    } else {
      // 2、添加单个事件的单个回调函数
      (vm._events[event] || (vm._events[event] = [])).push(fn)
      // optimize hook:event cost by using a boolean flag marked at registration
      // instead of a hash lookup
      // 只要在html中监听了任意一个生命周期钩子事件，在lifeCircle.js的callHook函数中就需要emit所有生命周期钩子事件
      if (hookRE.test(event)) {
        vm._hasHookEvent = true
      }
    }
    return vm
  }

  Vue.prototype.$once = function (event: string, fn: Function): Component {
    const vm: Component = this
    // 由于$once只触发1次，因此解绑事件需要和fn同时执行，而且要在fn之前执行，否则如果在fn中又触发了同名事件，则会陷入死循环
    function on () {
      vm.$off(event, on)
      fn.apply(vm, arguments)
    }
    // 把fn挂到on函数上，才能知道需要解绑的是哪个事件处理函数
    on.fn = fn
    vm.$on(event, on)
    return vm
  }

  Vue.prototype.$off = function (event?: string | Array<string>, fn?: Function): Component {
    const vm: Component = this
    // all
    // 1、移除所有事件
    if (!arguments.length) {
      vm._events = Object.create(null)
      return vm
    }
    // array of events
    // 2、移除多个事件
    if (Array.isArray(event)) {
      for (let i = 0, l = event.length; i < l; i++) {
        vm.$off(event[i], fn)
      }
      return vm
    }
    // specific event
    // 3、移除指定单个事件
    const cbs = vm._events[event]
    // 待移除的单个事件有可能不存在，则直接返回
    if (!cbs) {
      return vm
    }
    // 3.1、移除指定单个事件下的所有事件处理函数
    if (!fn) {
      vm._events[event] = null
      return vm
    }
    // specific handler
    // 3.2、移除指定单个事件下的某个事件处理函数
    let cb
    let i = cbs.length
    while (i--) {
      cb = cbs[i]
      if (cb === fn || cb.fn === fn) {
        cbs.splice(i, 1)
        break
      }
    }
    return vm
  }

  Vue.prototype.$emit = function (event: string): Component {
    const vm: Component = this
    // html的属性不区分大小写，js区分大小写
    // 当在html上监听一个驼峰式的事件（如<div @submitCart="submit"></div>），而js中正好emit与其对应的小写事件submitcart，会阴差阳错的对应上，这里要提醒下
    if (process.env.NODE_ENV !== 'production') {
      const lowerCaseEvent = event.toLowerCase()
      if (lowerCaseEvent !== event && vm._events[lowerCaseEvent]) {
        tip(
          `Event "${lowerCaseEvent}" is emitted in component ` +
          `${formatComponentName(vm)} but the handler is registered for "${event}". ` +
          `Note that HTML attributes are case-insensitive and you cannot use ` +
          `v-on to listen to camelCase events when using in-DOM templates. ` +
          `You should probably use "${hyphenate(event)}" instead of "${event}".`
        )
      }
    }
    let cbs = vm._events[event]
    if (cbs) {
      // 假设$once为某个事件添加的回调函数超过1个，如vm._events['submit'] = [fn1, fn2]
      // 在$emit触发$once，按顺序执行回调函数数组之前，会先将当前函数从vm._events['submit']中移除掉，这就导致vm._events['submit']数组中的fn1被移除，fn2跑到fn1的位置上，导致fn2直接被跳过
      // 因此在回调函数数量超过1个的情况下，需要复制一份回调函数数组，切断与原来的联系，保证其稳定性
      cbs = cbs.length > 1 ? toArray(cbs) : cbs
      const args = toArray(arguments, 1)
      const info = `event handler for "${event}"`
      for (let i = 0, l = cbs.length; i < l; i++) {
        invokeWithErrorHandling(cbs[i], vm, args, vm, info)
      }
    }
    return vm
  }
}
