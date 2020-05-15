/* @flow */

import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError,
  noop
} from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget } from './dep'

import type { SimpleSet } from '../util/index'

let uid = 0

/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 */
export default class Watcher {
  vm: Component;
  expression: string;
  cb: Function;
  id: number;
  deep: boolean;
  user: boolean;
  lazy: boolean;
  sync: boolean;
  dirty: boolean;
  active: boolean;
  deps: Array<Dep>;
  newDeps: Array<Dep>;
  depIds: SimpleSet;
  newDepIds: SimpleSet;
  before: ?Function;
  getter: Function;
  value: any;

  constructor (
    vm: Component,
    expOrFn: string | Function,
    cb: Function,
    options?: ?Object,
    isRenderWatcher?: boolean
  ) {
    this.vm = vm
    if (isRenderWatcher) {
      vm._watcher = this
    }
    vm._watchers.push(this)
    // options
    if (options) {
      this.deep = !!options.deep
      this.user = !!options.user
      this.lazy = !!options.lazy
      this.sync = !!options.sync
      this.before = options.before
    } else {
      this.deep = this.user = this.lazy = this.sync = false
    }
    this.cb = cb
    this.id = ++uid // uid for batching
    this.active = true
    this.dirty = this.lazy // for lazy watchers
    // 记录新旧watcher收集的Dep
    this.deps = []
    this.newDeps = []
    // 记录新旧watcher收集的Dep的id
    this.depIds = new Set()
    this.newDepIds = new Set()
    // expOrFn的字符串形式，主要用于开发环境的提示
    this.expression = process.env.NODE_ENV !== 'production'
      ? expOrFn.toString()
      : ''
    // parse expression for getter
    // 将getter统一为函数形式
    // 1、new Vue({ watch: { key: value } })中的key为String类型
    // 2、vm.$watch(expOrFn, cb, [options])中的expOrFn为String、Function类型（见https://cn.vuejs.org/v2/api/#vm-watch）
    if (typeof expOrFn === 'function') {
      this.getter = expOrFn
    } else {
      // 键路径 -> 获取某对象键路径的函数
      this.getter = parsePath(expOrFn)
      // 路径解析出错，要专门提示下。执行getter出错，放到get函数中处理
      if (!this.getter) {
        this.getter = noop
        process.env.NODE_ENV !== 'production' && warn(
          `Failed watching path: "${expOrFn}" ` +
          'Watcher only accepts simple dot-delimited paths. ' +
          'For full control, use a function instead.',
          vm
        )
      }
    }
    this.value = this.lazy
      ? undefined
      : this.get()
  }

  /**
   * Evaluate the getter, and re-collect dependencies.
   */
  // 当数据发生变动时，执行getter函数，并重新收集依赖
  get () {
    pushTarget(this)
    let value
    const vm = this.vm
    try {
      // getter中有可能访问this，如return this.a + this.b，因此需要用call绑定this
      // getter完全是用户自定义的，内部有可能出错，如return this.a.b，这时vm上如果没有a.b，则会报错。所以要用try...catch包裹
      value = this.getter.call(vm, vm)
    } catch (e) {
      // new Watcher在$watch中调用产生的错误，进行错误拦截提示
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        // 内部调用产生的错误，则直接抛出
        throw e
      }
    } finally {
      // "touch" every property so they are all tracked as
      // dependencies for deep watching
      if (this.deep) {
        // 递归访问每一个属性
        traverse(value)
      }
      popTarget()
      this.cleanupDeps()
    }
    return value
  }

  /**
   * Add a dependency to this directive.
   */
  // 将Dep添加到当前Watcher的newDeps中
  // 将当前Watcher添加到Dep.subs中
  addDep (dep: Dep) {
    const id = dep.id
    if (!this.newDepIds.has(id)) {
      this.newDepIds.add(id)
      this.newDeps.push(dep)
      if (!this.depIds.has(id)) {
        dep.addSub(this)
      }
    }
  }

  /**
   * Clean up for dependency collection.
   */
  // 清理依赖收集
  cleanupDeps () {
    let i = this.deps.length
    while (i--) {
      const dep = this.deps[i]
      // 如果上次收集的Dep不再存在，则移除当前watch在该Dep下的订阅
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this)
      }
    }
    // 将新收集Dep的id列表赋值给depIds
    // 然后赋予newDepIds一个空set值
    // 这里没有重新new Set()作为newDepIds的新值，而是使用先前缓存的depIds数组，并将其清空作为newDepIds的新值，是为了节省内存，且避免了频繁触发垃圾回收机制
    let tmp = this.depIds
    this.depIds = this.newDepIds
    this.newDepIds = tmp
    this.newDepIds.clear()
    // 同上
    tmp = this.deps
    this.deps = this.newDeps
    this.newDeps = tmp
    this.newDeps.length = 0
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   */
  // 当Dep改变时，调用这个订阅者接口，重新运行watcher的get方法收集依赖
  update () {
    /* istanbul ignore else */
    if (this.lazy) {
      this.dirty = true
    } else if (this.sync) {
      this.run()
    } else {
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  run () {
    if (this.active) {
      const value = this.get()
      if (
        value !== this.value ||
        // Deep watchers and watchers on Object/Arrays should fire even
        // when the value is the same, because the value may
        // have mutated.
        isObject(value) ||
        this.deep
      ) {
        // set new value
        const oldValue = this.value
        this.value = value
        if (this.user) {
          try {
            this.cb.call(this.vm, value, oldValue)
          } catch (e) {
            handleError(e, this.vm, `callback for watcher "${this.expression}"`)
          }
        } else {
          this.cb.call(this.vm, value, oldValue)
        }
      }
    }
  }

  /**
   * Evaluate the value of the watcher.
   * This only gets called for lazy watchers.
   */
  evaluate () {
    this.value = this.get()
    this.dirty = false
  }

  /**
   * Depend on all deps collected by this watcher.
   */
  // 依赖当前watcher收集的所有dep
  depend () {
    let i = this.deps.length
    while (i--) {
      this.deps[i].depend()
    }
  }

  /**
   * Remove self from all dependencies' subscriber list.
   * 从所有依赖项的订阅者列表中删除自身
   */
  teardown () {
    if (this.active) {
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      // 将自身从vm._watchers中移除
      // 这是一个有点昂贵的操作，所以如果vm处于销毁阶段，则跳过此操作
      if (!this.vm._isBeingDestroyed) {
        remove(this.vm._watchers, this)
      }
      let i = this.deps.length
      while (i--) {
        this.deps[i].removeSub(this)
      }
      this.active = false
    }
  }
}
