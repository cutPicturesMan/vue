/* @flow */

import Dep from './dep'
import VNode from '../vdom/vnode'
import { arrayMethods } from './array'
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering
} from '../util/index'

const arrayKeys = Object.getOwnPropertyNames(arrayMethods)

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
export let shouldObserve: boolean = true

export function toggleObserving (value: boolean) {
  shouldObserve = value
}

/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 */
export class Observer {
  value: any;
  dep: Dep;
  vmCount: number; // number of vms that have this object as root $data

  constructor (value: any) {
    this.value = value
    this.dep = new Dep()
    this.vmCount = 0
    def(value, '__ob__', this)
    if (Array.isArray(value)) {
      // 判断是否可以通过浏览器内置属性__proto__进行继承
      // 如果可以，则修改value的__proto__，指向重写了7个内置方法的数组
      // 这么做的好处是所有的value的原型，都指向同一个重写内置方法的数组
      // 如果不行，则将重写的7个内置方法赋值给数组value
      // 这样每次都要生成7个内置方法，很冗余
      if (hasProto) {
        protoAugment(value, arrayMethods)
      } else {
        copyAugment(value, arrayMethods, arrayKeys)
      }
      this.observeArray(value)
    } else {
      // 1、首次进来肯定是obj。
      // 由于可以确定为obj，obj的根属性可以为任意值，当整个替换掉时，是可以触发页面的更新的，因为已经为这个根属性设置了getter/setter。
      // 但如果这个根属性是对象/数组，仅仅改变该对象/数组中的某个属性，由于根属性引用的还是这个对象/数组本身，因此不会触发getter/setter，这时候就需要：
      // 1、为对象的每个属性设置getter/setter，但是新增属性、删除属性则无法监控到（解决方法：1、需要写一个set方法；2、整个替换掉对象）
      // 2、为数组中的每个值设置getter/setter（并不是为每个序号设置getter/setter），导致直接修改数组中的某个值、直接改变数组的长度则无法监控到（解决方法：1、在set方法中处理；2、用异变方法处理，而不是直接替换值）
      this.walk(value)
    }
  }

  /**
   * Walk through all properties and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   */
  walk (obj: Object) {
    const keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
      // #7280 https://github.com/vuejs/vue/pull/7280
      // defineReactive(obj, keys[i], obj(keys[i]))
      // 第三个参数会导致组件在初始化的时候就调用了data的getters
      defineReactive(obj, keys[i])
    }
  }

  /**
   * Observe a list of Array items.
   */
  observeArray (items: Array<any>) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i])
    }
  }
}

// helpers

/**
 * Augment a target Object or Array by intercepting
 * the prototype chain using __proto__
 */
function protoAugment (target, src: Object) {
  /* eslint-disable no-proto */
  target.__proto__ = src
  /* eslint-enable no-proto */
}

/**
 * Augment a target Object or Array by defining
 * hidden properties.
 */
/* istanbul ignore next */
function copyAugment (target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i]
    def(target, key, src[key])
  }
}

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 */
// 尝试为一个值创建一个观察者，返回observer实例
export function observe (value: any, asRootData: ?boolean): Observer | void {
  // 只有对象或者数组，才会执行本函数
  if (!isObject(value) || value instanceof VNode) {
    return
  }
  let ob: Observer | void
  // 如果该值已经创建了观察者，则返回observer实例
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    ob = value.__ob__
  } else if (
    shouldObserve &&
    !isServerRendering() &&
    (Array.isArray(value) || isPlainObject(value)) &&
    Object.isExtensible(value) &&
    !value._isVue
  ) {
    ob = new Observer(value)
  }
  if (asRootData && ob) {
    ob.vmCount++
  }
  return ob
}

/**
 * Define a reactive property on an Object.
 */
export function defineReactive (
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  const dep = new Dep()

  const property = Object.getOwnPropertyDescriptor(obj, key)
  // 如果该属性的特性无法配置（get、set），那么无法监听
  if (property && property.configurabe === false) {
    return
  }

  // cater for pre-defined getter/setters
  // Q 访问器属性和数据属性的区别？
  // A 访问器属性带有非必需的get和set，数据属性即键值对
  const getter = property && property.get
  const setter = property && property.set
  // T 下式的if讨论的仅仅是访问器属性的情况，该情况比较少见。用的更多的是数据属性
  // #7280 https://github.com/vuejs/vue/pull/7280
  // #7302 https://github.com/vuejs/vue/pull/7302
  // 为了防止初始化组件时，就调用了data的getter，因此不在walk函数中直接访问data的value
  // 而是在本函数内部，如果该属性定义了getter，则不访问这个属性。如果没有定义getter，才进行访问

  // #7828 https://github.com/vuejs/vue/pull/7828
  // 由于#7302为了在初始化时不触发getter，仅根据getter的有无，来判断是否能访问属性
  // 这会导致当存在setter，即需要改变属性的值时，由于没有执行observe函数，属性的改变不是响应式的
  // 因此需要在条件判断加上setter
  // 下式表示只存在getter时，才不访问属性的值
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key]
  }

  let childOb = !shallow && observe(val)
  // 将data的属性，转为访问器属性
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter () {
      const value = getter ? getter.call(obj) : val
      if (Dep.target) {
        dep.depend()
        if (childOb) {
          childOb.dep.depend()
          if (Array.isArray(value)) {
            dependArray(value)
          }
        }
      }
      return value
    },
    set: function reactiveSetter (newVal) {
      const value = getter ? getter.call(obj) : val
      /* eslint-disable no-self-compare */
      // 关闭eslint的禁止自身比较
      // 新旧值相同 || 新旧值都是NaN，则不执行set
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }
      /* eslint-enable no-self-compare */
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        customSetter()
      }
      // #7981: for accessor properties without setter
      // 如果一个访问器属性，原本只有getter，没有setter。在经过defineReactive函数处理之后，会加上setter
      // 当试图修改这个属性的值时，setter函数会执行，并且observe新值
      // 但是由于只存在getter，setter中设置的值，与getter获取的值，永远没有关联，这个被观察的新值永远不会被依赖
      if (getter && !setter) return
      if (setter) {
        setter.call(obj, newVal)
      } else {
        val = newVal
      }
      childOb = !shallow && observe(newVal)
      dep.notify()
    }
  })
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
/**
 * 为对象或数组添加响应式属性 https://cn.vuejs.org/v2/guide/reactivity.html
 * 1、Vue不能检测到对象属性的添加或删除
 * 2、Vue不能检测以下变动的数组
 *  1）当你利用索引直接设置一个项时，例如：vm.items[indexOfItem] = newValue
 *  2）当你修改数组的长度时，例如：vm.items.length = newLength
 *
 * 【对象】
 *    1、全局方法：Vue.set(vm.someObject, 'b', 2)
 *    2、实例方法：this.$set(this.someObject,'b',2)
 *    3、为对象添加多个属性
 *    有效（Object.assign返回了一个新对象）：this.someObject = Object.assign({}, this.someObject, { a: 1, b: 2 })
 *    无效：Object.assign(this.someObject, { a: 1, b: 2 })
 *
 */
export function set (target: Array<any> | Object, key: any, val: any): any {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.length = Math.max(target.length, key)
    target.splice(key, 1, val)
    return val
  }
  if (key in target && !(key in Object.prototype)) {
    target[key] = val
    return val
  }
  const ob = (target: any).__ob__
  // 由于在data上添加根属性时，需要：
  // 1、检测props、methods上是否有同名属性
  // 2、检测待添加的属性是否是保留属性（$、_开头）
  // 3、将该属性代理到vm上
  // 如果要为data添加根属性，完全可以通过初始化的时候在data上声明，没有必要调用Vue.set函数来专门声明
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }
  if (!ob) {
    target[key] = val
    return val
  }
  defineReactive(ob.value, key, val)
  // TODO 如果在data上定义了根属性，那这里的notify会通知所有的data属性吗？（目前对dep依赖不是特别熟悉）
  ob.dep.notify()
  return val
}

/**
 * Delete a property and trigger change if necessary.
 */
export function del (target: Array<any> | Object, key: any) {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1)
    return
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid deleting properties on a Vue instance or its root $data ' +
      '- just set it to null.'
    )
    return
  }
  if (!hasOwn(target, key)) {
    return
  }
  delete target[key]
  if (!ob) {
    return
  }
  ob.dep.notify()
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 */
function dependArray (value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    e && e.__ob__ && e.__ob__.dep.depend()
    if (Array.isArray(e)) {
      dependArray(e)
    }
  }
}
