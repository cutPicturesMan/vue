/* @flow */

import {
  warn,
  once,
  isDef,
  isUndef,
  isTrue,
  isObject,
  hasSymbol,
  isPromise,
  remove
} from 'core/util/index'

import { createEmptyVNode } from 'core/vdom/vnode'
import { currentRenderingInstance } from 'core/instance/render'

function ensureCtor (comp: any, base) {
  if (
    comp.__esModule ||
    (hasSymbol && comp[Symbol.toStringTag] === 'Module')
  ) {
    comp = comp.default
  }
  return isObject(comp)
    ? base.extend(comp)
    : comp
}

export function createAsyncPlaceholder (
  factory: Function,
  data: ?VNodeData,
  context: Component,
  children: ?Array<VNode>,
  tag: ?string
): VNode {
  const node = createEmptyVNode()
  node.asyncFactory = factory
  node.asyncMeta = { data, context, children, tag }
  return node
}

// 处理异步函数
export function resolveAsyncComponent (
  factory: Function,
  baseCtor: Class<Component>
): Class<Component> | void {
  if (isTrue(factory.error) && isDef(factory.errorComp)) {
    return factory.errorComp
  }

  if (isDef(factory.resolved)) {
    return factory.resolved
  }

  const owner = currentRenderingInstance
  if (owner && isDef(factory.owners) && factory.owners.indexOf(owner) === -1) {
    // already pending
    factory.owners.push(owner)
  }

  if (isTrue(factory.loading) && isDef(factory.loadingComp)) {
    return factory.loadingComp
  }

  if (owner && !isDef(factory.owners)) {
    const owners = factory.owners = [owner]
    let sync = true

    ;(owner: any).$on('hook:destroyed', () => remove(owners, owner))

    const forceRender = (renderCompleted: boolean) => {
      for (let i = 0, l = owners.length; i < l; i++) {
        (owners[i]: any).$forceUpdate()
      }

      if (renderCompleted) {
        owners.length = 0
      }
    }

    const resolve = once((res: Object | Class<Component>) => {
      // cache resolved
      factory.resolved = ensureCtor(res, baseCtor)
      // invoke callbacks only if this is not a synchronous resolve
      // (async resolves are shimmed as synchronous during SSR)
      if (!sync) {
        forceRender(true)
      } else {
        owners.length = 0
      }
    })

    const reject = once(reason => {
      process.env.NODE_ENV !== 'production' && warn(
        `Failed to resolve async component: ${String(factory)}` +
        (reason ? `\nReason: ${reason}` : '')
      )
      if (isDef(factory.errorComp)) {
        factory.error = true
        forceRender(true)
      }
    })

    const res = factory(resolve, reject)


    /**
     同步式声明组件的2种方式
     1、全局声明
       Vue.component('my-component-name', {
          template: '<div>hi</div>'
       })

     2、局部声明
     new Vue({
      template: '<div><test></test></div>',
      components: {
        test: {
          template: '<div>hi</div>'
       }
    }).$mount()

     异步式声明组件的2种方式
     1、全局声明
      Vue.component('my-component-name', function (resolve, reject) {
        setTimeout(function () {
          // 向 `resolve` 回调传递组件定义
          resolve({
            template: '<div>hi</div>'
          })
        }, 1000)
      }))

     2、局部声明
     new Vue({
      template: '<div><test></test></div>',
      components: {
        test: (resolve) => {
          setTimeout(() => {
            resolve({
              template: '<div>hi</div>'
            })
          }, 0)
        }
      }
    }).$mount()
     */


    /**
     处理工厂函数有返回值的情况
     */
    if (isObject(res)) {
      /**
       1、情况一：工厂函数直接返回一个promise
       适用于直接请求，请求成功则展示，不成功不展示，即不需要进行异常流处理的情况
       new Vue({
          template: '<div><test></test></div>',
          components: {
            test: () => {
              return new Promise(resolve => {
                setTimeout(() => {
                  resolve({
                    template: '<div>hi</div>'
                  })
                }, 0)
              })
            }
          }
        }).$mount()
       */
      if (isPromise(res)) {
        // () => Promise
        if (isUndef(factory.resolved)) {
          res.then(resolve, reject)
        }
      } else if (isPromise(res.component)) {
        /**
         情况二：工厂函数返回对象，其中的component属性为Promise函数
         适用于发起请求前进行loading提示、请求失败进行错误提示等的情况
         new Vue({
            template: `<div><test/></div>`,
            components: {
                test: () => ({
                    component: new Promise(resolve => {
                        setTimeout(() => {
                            resolve({ template: '<div>hi</div>' })
                        }, 50)
                    }),
                    loading: { template: `<div>loading</div>` },
                    delay: 0
                })
            }
         }).$mount('#app')
         */
        res.component.then(resolve, reject)

        if (isDef(res.error)) {
          factory.errorComp = ensureCtor(res.error, baseCtor)
        }

        if (isDef(res.loading)) {
          factory.loadingComp = ensureCtor(res.loading, baseCtor)
          if (res.delay === 0) {
            factory.loading = true
          } else {
            setTimeout(() => {
              if (isUndef(factory.resolved) && isUndef(factory.error)) {
                factory.loading = true
                forceRender(false)
              }
            }, res.delay || 200)
          }
        }

        if (isDef(res.timeout)) {
          setTimeout(() => {
            if (isUndef(factory.resolved)) {
              reject(
                process.env.NODE_ENV !== 'production'
                  ? `timeout (${res.timeout}ms)`
                  : null
              )
            }
          }, res.timeout)
        }
      }
    }

    sync = false
    // return in case resolved synchronously
    return factory.loading
      ? factory.loadingComp
      : factory.resolved
  }
}
