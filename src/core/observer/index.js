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
 * 在某些情况下，我们可能需要禁止观察者，例如在组件的update计算中
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
 * 观察者类附加到每个被观察的对象上
 * 一旦附加上，观察者会将目标对象的属性key值转为getter/setter
 * 以便用来收集依赖和广播更新
 */
export class Observer {
  value: any;
  dep: Dep;
  vmCount: number; // number of vms that have this object as root $data

  constructor (value: any) {
    this.value = value
    // 这里的dep与defineReactive中的dep不同
    // 此dep用于在对象或数组发生无法检测的变动时，通知watch
    this.dep = new Dep()
    this.vmCount = 0
    def(value, '__ob__', this)
    // js中无法检测数组内部的变动，因此重写了7个数组原生的方法，来进行响应式更新
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
      // 1、首次进来肯定是obj
      // 由于可以确定为obj，obj的根属性可以为任意值，当整个替换掉时，是可以触发页面的更新的，因为已经为这个根属性设置了getter/setter
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
// 尝试为一个任意值创建观察者模式，返回observer实例
export function observe (value: any, asRootData: ?boolean): Observer | void {
  // 只有对象或者虚拟dom节点，才会执行本函数
  if (!isObject(value) || value instanceof VNode) {
    return
  }
  let ob: Observer | void
  // 如果该值已经创建了观察者（存在__ob__属性 && 该属性继承自Observer类），则返回observer实例
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
 * 定义响应式属性
 */
export function defineReactive (
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  // 此dep用于对象的属性调用setter时，通知watch
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

  // 递归监听对象或者数组类型的子元素
  let childOb = !shallow && observe(val)
  // 将data的属性，转为访问器属性
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter () {
      const value = getter ? getter.call(obj) : val
      // TODO dep.depend()不应该是在get的时候都要执行吗？为什么是放到Dep.target条件中？
      if (Dep.target) {
        // 当子属性的值整个发生变化时，通知watch
        dep.depend()
        // 当子属性的值是对象或者数组，要将当前watch添加到子属性的__ob__.dep上
        // 这样才能在子元素的值发生无法检测的变动时（对象属性的添加与删除、数组修改长度与利用索引直接设置一个项），手动通知watch
        if (childOb) {
          // observe(val)递归处理了子属性。能进入到这里，说明该子属性为对象或者数组
          // 假设对象为obj.a.b.c.d.e =  {f: 1}，observe会一直处理到obj.a.b.c.d.e属性，并进入到这里，为e的dep加上watch
          // 假设数组为obj.a.b.c.d.e = [{f: 1}]，observe同样会一直处理到obj.a.b.c.d.e属性，并进入到这里，为e的dep加上watch
          // 这里要注意下，e为数组时，childOb.dep.depend()是为该数组的dep添加watch
          // 而数组中的对象{f: 1}，整体的dep中缺少的watch，为{f: 1}添加一个属性的时候，是不会有反应的
          // 有效：this.obj.a.b.c.d.e[0].f = 2;
          // 有效：this.obj.a.b.c.d.e[0].push({g: 2});
          // 无效：this.$set(this.obj.a.b.c.d.e[0], 'g', 2);
          // 因此需要手动将watch添加到dep中
          childOb.dep.depend()
          // 手动添加watch到dep
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
 * 解决方法：
 * 【对象】
 *    1、全局方法：Vue.set(vm.someObject, 'b', 2)
 *    2、实例方法：this.$set(this.someObject,'b',2)
 *    3、为对象添加多个属性
 *    有效（Object.assign返回了一个新对象）：this.someObject = Object.assign({}, this.someObject, { a: 1, b: 2 })
 *    无效：Object.assign(this.someObject, { a: 1, b: 2 })
 *
 * 【数组】
 *    1、Vue.set(vm.items, indexOfItem, newValue)
 *    2、vm.items.splice(indexOfItem, 1, newValue)
 */
export function set (target: Array<any> | Object, key: any, val: any): any {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  // 数组采用异变方法进行值更新
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.length = Math.max(target.length, key)
    target.splice(key, 1, val)
    return val
  }
  // 已存在的对象属性，则直接更新
  if (key in target && !(key in Object.prototype)) {
    target[key] = val
    return val
  }
  // 由于getter/setter是添加到对象的属性上的，直接判断该对象是否Observer过，要通过__ob__属性
  const ob = (target: any).__ob__
  // 由于在data上添加根属性时，需要：
  // 1、检测props、methods上是否有同名属性
  // 2、检测待添加的属性是否是保留属性（$、_开头）
  // 3、将该属性代理到vm上
  // 如果要为data添加根属性，需要先执行上述3个步骤，不能在Vue.set函数中声明
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }
  // 该对象不是响应式对象，则直接添加属性
  if (!ob) {
    target[key] = val
    return val
  }
  // 为响应式对象，添加新的属性
  defineReactive(ob.value, key, val)
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
