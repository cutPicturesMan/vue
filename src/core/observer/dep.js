/* @flow */

import type Watcher from './watcher'
import { remove } from '../util/index'
import config from '../config'

let uid = 0

/**
 * A dep is an observable that can have multiple
 * directives subscribing to it.
 */
export default class Dep {
  static target: ?Watcher;
  id: number;
  subs: Array<Watcher>;

  constructor () {
    this.id = uid++
    // 订阅者，subscriber的简写
    this.subs = []
  }

  addSub (sub: Watcher) {
    this.subs.push(sub)
  }

  removeSub (sub: Watcher) {
    remove(this.subs, sub)
  }

  depend () {
    if (Dep.target) {
      Dep.target.addDep(this)
    }
  }

  notify () {
    // stabilize the subscriber list first
    // 如果不浅复制出一个数组，而是在for循环中实时访问this.subs
    // 由于在提供的回调函数中可以访问并修改dep.subs，会造成错误
    // TODO 由于watcher暂未熟读，上述待验证
    const subs = this.subs.slice()
    if (process.env.NODE_ENV !== 'production' && !config.async) {
      // subs aren't sorted in scheduler if not running async
      // we need to sort them now to make sure they fire in correct
      // order
      // 如果config.async设置为false，subs在调度器中不会排序
      // 我们需要对其进行排序，以确保按照正确的顺序执行
      // TODO 分析一下在watcher的同步执行方式下，待执行的watcher回调数组按顺序执行的重要性/test/unit/features/global-api/config.spec.js runs watchers in correct order when false
      subs.sort((a, b) => a.id - b.id)
    }
    // TODO for与forEach的效率？
    for (let i = 0, l = subs.length; i < l; i++) {
      subs[i].update()
    }
  }
}

// The current target watcher being evaluated.
// This is globally unique because only one watcher
// can be evaluated at a time.
// 当前目标的watcher被调用的时候，Dep.target才会有值
// 由于在任何时间内，只有1个watcher能被调用，因此Dep.target是全局唯一的
Dep.target = null
// TODO Vue2 中(本文源码为Vue2)，视图被抽象为一个 render 函数，一个 render 函数只会生成一个 watcher。比如我们有如下一个模板，模板中使用了Header组件。Vue2 中组件数的结构在视图渲染时就映射为 render 函数的嵌套调用，有嵌套调用就会有调用栈。当 render模板时，遇到Header组件会调用Header组件的render函数，两个render函数依次入栈，执行完函数，依次出栈
const targetStack = []

export function pushTarget (target: ?Watcher) {
  targetStack.push(target)
  Dep.target = target
}

export function popTarget () {
  targetStack.pop()
  Dep.target = targetStack[targetStack.length - 1]
}
