/*
 * not type checking this file because flow doesn't play well with
 * dynamically accessing methods on Array prototype
 */

import { def } from '../util/index'

const arrayProto = Array.prototype
// 创造一个公共对象，将该对象的__proto__指向Array.prototype，以便能访问数组原型上的方法
// 同时，将需要重写的方法定义在该对象上，避免修改Array.prototype而影响到所有的数组
export const arrayMethods = Object.create(arrayProto)

const methodsToPatch = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
]

/**
 * Intercept mutating methods and emit events
 * 拦截改变数组值的方法，并发出事件
 */
methodsToPatch.forEach(function (method) {
  // cache original method
  // 缓存数组的原型方法
  const original = arrayProto[method]
  def(arrayMethods, method, function mutator (...args) {
    const result = original.apply(this, args)
    const ob = this.__ob__
    let inserted
    // 对数组中新增的参数，进行observe
    switch (method) {
      case 'push':
      case 'unshift':
        inserted = args
        break
      case 'splice':
        inserted = args.slice(2)
        break
    }
    if (inserted) ob.observeArray(inserted)
    // notify change
    // 通知改变
    ob.dep.notify()
    // 部分内置方法有返回值，这里要返回
    return result
  })
})
