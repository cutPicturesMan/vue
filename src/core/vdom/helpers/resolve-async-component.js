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

// 处理异步组件
export function resolveAsyncComponent (
  factory: Function,
  baseCtor: Class<Component>
): Class<Component> | void {
  // 异步组件刚开始不会渲染，真正渲染时还会进入本函数，此时根据resolved、error判断即可直接返回对应组件
  if (isTrue(factory.error) && isDef(factory.errorComp)) {
    return factory.errorComp
  }

  if (isDef(factory.resolved)) {
    return factory.resolved
  }

  // TODO https://github.com/vuejs/vue/issues/9571
  const owner = currentRenderingInstance
  // TODO owners是记录当前节点的父级？组件在多个地方调用时，父级就有多个？
  if (owner && isDef(factory.owners) && factory.owners.indexOf(owner) === -1) {
    // already pending
    factory.owners.push(owner)
  }

  // TODO loading的判断为什么不跟在上面resolved判断之后？
  if (isTrue(factory.loading) && isDef(factory.loadingComp)) {
    return factory.loadingComp
  }

  if (owner && !isDef(factory.owners)) {
    const owners = factory.owners = [owner]
    // 刚开始的时候，标识组件是同步组件，等到Promise函数执行之后，再设为异步。对应以下2个流程：
    // 【同步流程】 sync标识设为同步 -> Promise() -> 同步Promise立刻执行 -> sync标识设为异步 -> 没有异步Promise执行
    // 【异步流程】 sync标识设为同步 -> Promise() -> 没有同步Promise执行 -> sync标识设为异步 -> 过一段时间，异步Promise执行
    let sync = true

    ;(owner: any).$on('hook:destroyed', () => remove(owners, owner))

    // TODO 什么是强制渲染？
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
      // 只有在异步resolve时，才调用forceRender
      // 在服务端渲染时，会将异步resolve转为同步resolve
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

    /**
     * 处理异步组件中的工厂函数

     同步组件
     new Vue({
      template: '<div><test></test></div>',
      components: {
        test: {
          template: '<div>hi</div>'
       }
    }).$mount()

     异步组件（无返回值）（有返回值的看下面2种情况）
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
    const res = factory(resolve, reject)

    /**
     扩展处理异步函数的2种返回值

     1、情况一：工厂函数直接返回一个promise
     适用于直接请求，请求成功则展示，不成功不展示，即不需要进行异常流处理的情况
     new Vue({
        template: '<div><test></test></div>',
        components: {
          test: () => import('./my-async-component')
        }
      }).$mount()

     2、情况二：工厂函数返回对象，其中的component属性为Promise函数
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
    if (isObject(res)) {
      // 情况1
      if (isPromise(res)) {
        // () => Promise
        // 有可能是同步的Promise，所以要检查下是否已经resolve
        if (isUndef(factory.resolved)) {
          res.then(resolve, reject)
        }
      } else if (isPromise(res.component)) {
        // 情况2
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
              // 上面的res.component.then有可能是立即resolve的，或者异步resolve的时间小于延迟渲染的时间
              // 确保在延迟渲染时间过后，组件还未resolve/reject，这时才展示loading
              if (isUndef(factory.resolved) && isUndef(factory.error)) {
                factory.loading = true
                forceRender(false)
              }
            }, res.delay || 200)
          }
        }

        // 如果超时，则设置为reject
        if (isDef(res.timeout)) {
          setTimeout(() => {
            // 超时 -> 已经resolve -> 不再reject
            //     -> 还未resolve -> 已reject -> reject（该函数只会触发一次）
            //                   -> 未reject -> reject
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
    // return是为了处理同步resolve的情况
    return factory.loading
      ? factory.loadingComp
      : factory.resolved
  }
}
