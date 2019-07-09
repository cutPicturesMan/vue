/* @flow */

import { ASSET_TYPES } from 'shared/constants'
import { defineComputed, proxy } from '../instance/state'
import { extend, mergeOptions, validateComponentName } from '../util/index'

export function initExtend (Vue: GlobalAPI) {
  /**
   * 每一个实例化的构造器，包括Vue，都有一个唯一的cid
   * 这让我们能够创建包裹着子构造器的原型继承，并缓存它们
   * Each instance constructor, including Vue, has a unique
   * cid. This enables us to create wrapped "child
   * constructors" for prototypal inheritance and cache them.
   */
  Vue.cid = 0
  let cid = 1

  /**
   * 类继承，返回Vue对象的子类
   * Class inheritance
   */
  // TODO extend的作用
  Vue.extend = function (extendOptions: Object): Function {
    extendOptions = extendOptions || {}
    // 即Vue
    const Super = this
    // Vue.cid，即0
    const SuperId = Super.cid
    // extendOptions._Ctor用于缓存构造函数
    const cachedCtors = extendOptions._Ctor || (extendOptions._Ctor = {})
    // 使用自定子组件的时候会调用Vue.extend，初次生成vnode的时候生成新构造函数并缓存
    // 如果页面数据有更新，则会重新生成vnode并做diff，在第二次生成vnode过程中，调用Vue.extend就会直接从缓存中取
    if (cachedCtors[SuperId]) {
      return cachedCtors[SuperId]
    }

		// 未指定name时，使用父级的name
    const name = extendOptions.name || Super.options.name
    if (process.env.NODE_ENV !== 'production' && name) {
      // 校验组件名称是否合法（name会直接当成组件名称来使用）
      validateComponentName(name)
    }

    const Sub = function VueComponent (options) {
      this._init(options)
    }
    // TODO 红宝书第六章类的继承
    // TODO 为什么要这样继承？
    Sub.prototype = Object.create(Super.prototype)
    Sub.prototype.constructor = Sub
    Sub.cid = cid++
    // TODO 父子data选项都是函数？
    Sub.options = mergeOptions(
      Super.options,
      extendOptions
    )
    Sub['super'] = Super

    // For props and computed properties, we define the proxy getters on
    // the Vue instances at extension time, on the extended prototype. This
    // avoids Object.defineProperty calls for each instance created.
		// 对于在extend时定义的props、computed属性，我们在扩展原型prototype上定义Vue实例上的代理getter
		// 这样可以避免每次实例创建时，调用Object.defineProperty
		// Q 这里的props是Sub.options和Super.options合并的，如果都定义在Super.prototype上，那么岂不是等于是Super也拥有了Sub的props？
		// A 由于上面prototype赋值时已经用Object.create切断了与Super之间的联系，因此不会影响到Super

    // TODO 为什么定义在prototype上的属性，每次实例化时可以避免调用Object.defineProperty重复声明？
    // props的值，从父类（Sub.prototype）的_props取
    if (Sub.options.props) {
      initProps(Sub)
    }
    if (Sub.options.computed) {
      initComputed(Sub)
    }

    // allow further extension/mixin/plugin usage
    Sub.extend = Super.extend
    Sub.mixin = Super.mixin
    Sub.use = Super.use

    // create asset registers, so extended classes
    // can have their private assets too.
		// 创建资源注册器，这样通过extend创建的类也能够拥有自己的私有资源
    // TODO 验证以下2个问题
    // Q 这里如果调用Sub.component()来声明组件的话，会作用到全局Vue上？？？
    // A 实测每个extend创建出来的类，都拥有自己的Sub.component、Sub.directive、Sub.filter，并不会注册到父类上，怎么切断的联系？
    // Q 这里为什么不直接initAssetRegisters(Sub)?
    // A 实测可以替换成initAssetRegisters(Sub)
    ASSET_TYPES.forEach(function (type) {
      Sub[type] = Super[type]
    })
    /**
     TODO【bug】在extend后调用Vue.mixin({})，导致自定义组件<bbb>找不到
     const Test = Vue.extend({
      template: '<div>你的名字：{{ firstName }}</div>',
      data: function () {
        return {
          firstName: 'Walter',
        }
      }
    })

     Test.component('bbb', {
      template: '<strong>bbb</strong>',
    });

     // Update super constructor's options
     Vue.mixin({})

     // mount the component
     const vm = new Test({
      template: '<div>{{ firstName }}<bbb></bbb></div>'
    }).$mount('#app')
     */

    // enable recursive self-lookup
    // 允许在本组件中引用自身
    if (name) {
      Sub.options.components[name] = Sub
    }

    // keep a reference to the super options at extension time.
    // later at instantiation we can check if Super's options have
    // been updated.
    // 由于mixin操作会重新赋值Vue.options，经过mixin操作之后，Sub.superOptions存储的是之前旧的Vue.options
    // superOptions用于判断Vue.options被完全赋值的情况
    Sub.superOptions = Super.options
    Sub.extendOptions = extendOptions
    // sealedOptions用于判断当前组件options的属性是否有被修改，因此要重新复制一份，跟原来的Sub.options隔离开
    Sub.sealedOptions = extend({}, Sub.options)

    // cache constructor
    cachedCtors[SuperId] = Sub
    return Sub
  }
}

function initProps (Comp) {
  const props = Comp.options.props
  for (const key in props) {
    proxy(Comp.prototype, `_props`, key)
  }
}

function initComputed (Comp) {
  const computed = Comp.options.computed
  for (const key in computed) {
    defineComputed(Comp.prototype, key, computed[key])
  }
}
