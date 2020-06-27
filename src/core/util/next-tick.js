/* @flow */
/* globals MutationObserver */

import { noop } from 'shared/util'
import { handleError } from './error'
import { isIE, isIOS, isNative } from './env'

export let isUsingMicroTask = false

const callbacks = []
let pending = false

function flushCallbacks () {
  pending = false
  // 重新复制一个callbacks队列，防止在执行各个callback时，callback中又调用$nextTick改变了callbacks队列
  const copies = callbacks.slice(0)
  callbacks.length = 0
  for (let i = 0; i < copies.length; i++) {
    copies[i]()
  }
}

// Here we have async deferring wrappers using microtasks.
// In 2.5 we used (macro) tasks (in combination with microtasks).
// However, it has subtle problems when state is changed right before repaint
// (e.g. #6813, out-in transitions).
// Also, using (macro) tasks in event handler would cause some weird behaviors
// that cannot be circumvented (e.g. #7109, #7153, #7546, #7834, #8109).
// So we now use microtasks everywhere, again.
// A major drawback of this tradeoff is that there are some scenarios
// where microtasks have too high a priority and fire in between supposedly
// sequential events (e.g. #4521, #6690, which have workarounds)
// or even between bubbling of the same event (#6566).

// TODO 1、先解释使用microtask而不是macrotask的原因
// TODO 2、再解释macrotask中不用postMessage、messageChannel的原因
// 这里我们有一个使用microtasks来实现的异步延迟包装器
// 在2.5版本我们使用macrotasks（结合microtasks）
// 然而，如果在重绘前改变了状态，那么这么做会有微妙的问题（例如 #6813 out-in过渡，A 改变的状态在下一个tick才会生效，导致css先生效，页面闪一下）
// 而且，在事件处理器中使用macrotasks，会导致一些奇怪的行为并且无法规避（例如 #7109, #7153, #7546, #7834, #8109）
// A 这里使用#7546来说明，出于安全原因考虑，移动端浏览器限制某些操作必须由用户交互触发，且这些操作需要在事件循环的当前tick运行，例如video全屏、media播放等。如果在事件处理中使用macrotasks，那么用户交互事件已经触发，但是其对应的处理函数不会在本轮事件循环执行（具体哪一轮看macrotasks队列中任务有多少），这就造成一些奇怪的现象。
// 所以我们再次在各处使用microtasks
// 这种权衡的一个主要缺点是，在某些情况下微任务具有过高的优先级，会发生在本应该按顺序发生的事件之间（TODO #4521、#6690等到events.js再看）
// 甚至在同一事件的冒泡过程中先执行microtask，之后事件才会冒泡到外层（#6566，TODO 这个的解决方案是不是把html上触发的事件用macrotask包裹？还是使用事件代理解决了？https://github.com/zhiguangphoenix/vue/commit/22fdb7c9543fbc08fb891ee61ebd4f0c2766384c）
let timerFunc

// The nextTick behavior leverages the microtask queue, which can be accessed
// via either native Promise.then or MutationObserver.
// MutationObserver has wider support, however it is seriously bugged in
// UIWebView in iOS >= 9.3.3 when triggered in touch event handlers. It
// completely stops working after triggering a few times... so, if native
// Promise is available, we will use it:

// nextTick函数的行为，改变了microtask队列。microtask队列可以通过原生的Promise.then或者MutationObserver改变
// MutationObserver有着广泛的支持，然而在iOS >= 9.3.3的UIWebView上，当在触摸事件处理函数中触发MutationObserver时有着严重的bug
// 在触发了几次之后，MutationObserver完全停止了工作
// 所以，如果原生的Promise是可用的，我们将使用原生Promise
/* istanbul ignore next, $flow-disable-line */
if (typeof Promise !== 'undefined' && isNative(Promise)) {
  const p = Promise.resolve()
  timerFunc = () => {
    p.then(flushCallbacks)
    // In problematic UIWebViews, Promise.then doesn't completely break, but
    // it can get stuck in a weird state where callbacks are pushed into the
    // microtask queue but the queue isn't being flushed, until the browser
    // needs to do some other work, e.g. handle a timer. Therefore we can
    // "force" the microtask queue to be flushed by adding an empty timer.
    if (isIOS) setTimeout(noop)
  }
  isUsingMicroTask = true
} else if (!isIE && typeof MutationObserver !== 'undefined' && (
  isNative(MutationObserver) ||
  // PhantomJS and iOS 7.x
  MutationObserver.toString() === '[object MutationObserverConstructor]'
)) {
  // Use MutationObserver where native Promise is not available,
  // e.g. PhantomJS, iOS7, Android 4.4
  // (#6466 MutationObserver is unreliable in IE11)
  let counter = 1
  const observer = new MutationObserver(flushCallbacks)
  const textNode = document.createTextNode(String(counter))
  observer.observe(textNode, {
    characterData: true
  })
  timerFunc = () => {
    counter = (counter + 1) % 2
    textNode.data = String(counter)
  }
  isUsingMicroTask = true
} else if (typeof setImmediate !== 'undefined' && isNative(setImmediate)) {
  // Fallback to setImmediate.
  // Technically it leverages the (macro) task queue,
  // but it is still a better choice than setTimeout.
  timerFunc = () => {
    setImmediate(flushCallbacks)
  }
} else {
  // Fallback to setTimeout.
  timerFunc = () => {
    setTimeout(flushCallbacks, 0)
  }
}

export function nextTick (cb?: Function, ctx?: Object) {
  let _resolve
  // 将$nextTick的回调函数加入回调队列
  callbacks.push(() => {
    if (cb) {
      try {
        cb.call(ctx)
      } catch (e) {
        handleError(e, ctx, 'nextTick')
      }
    } else if (_resolve) {
      // 不传回调函数，则为$nextTick提供Promise风格的调用方式
      _resolve(ctx)
    }
  })
  // 类似scheduler.js中的变量waiting，可以多次调用nextTick将cb推入队列，但是在nextTick的回调函数队列执行完毕之前，只能调用1次刷新回调函数队列的方法
  if (!pending) {
    pending = true
    timerFunc()
  }
  // $flow-disable-line
  if (!cb && typeof Promise !== 'undefined') {
    return new Promise(resolve => {
      _resolve = resolve
    })
  }
}
