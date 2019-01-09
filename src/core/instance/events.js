/* @flow */

import {
  tip,
  toArray,
  hyphenate,
  handleError,
  formatComponentName
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
    if (Array.isArray(event)) {
      for (let i = 0, l = event.length; i < l; i++) {
        vm.$on(event[i], fn)
      }
    } else {
      // 将事件添加到总事件对象上，单个事件可以使用$on添加多个处理函数
      (vm._events[event] || (vm._events[event] = [])).push(fn)
      // optimize hook:event cost by using a boolean flag marked at registration
      // instead of a hash lookup
      // TODO lifeCircle待验证；有那么多个内部事件钩子，为啥不用哈希查找而是集中在一个标识上？
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
    // 如果没有指定任何参数，则移除所有事件
    if (!arguments.length) {
      vm._events = Object.create(null)
      return vm
    }
    // array of events
    // 如果是数组，则逐个移除
    if (Array.isArray(event)) {
      for (let i = 0, l = event.length; i < l; i++) {
        vm.$off(event[i], fn)
      }
      return vm
    }
    // specific event
    const cbs = vm._events[event]
    // 如果没有找到指定事件的函数集合，则返回
    if (!cbs) {
      return vm
    }
    // 如果没有指定解绑具体的事件处理函数，那么就解绑该事件下所有的处理函数
    // 这里不能用arguments.length === 1来作为判断条件，因为在事件数组的循环中，fn是有值的，为undefined
    // https://github.com/vuejs/vue/issues/6945
    if (!fn) {
      vm._events[event] = null
      return vm
    }
    // specific handler
    let cb
    let i = cbs.length
    // 循环指定事件的函数集合，移除指定的事件处理函数
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
      // TODO 为什么要判断长度？
      // TODO 这里我个人认为不需要，应该去掉
      cbs = cbs.length > 1 ? toArray(cbs) : cbs
      // TODO 这里用toArray和Array.prototype.slice.call(arguments, 1)的区别？
      const args = toArray(arguments, 1)
      for (let i = 0, l = cbs.length; i < l; i++) {
        try {
          cbs[i].apply(vm, args)
        } catch (e) {
          handleError(e, vm, `event handler for "${event}"`)
        }
      }
    }
    return vm
  }
}
