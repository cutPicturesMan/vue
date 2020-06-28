/* @flow */

import type Watcher from './watcher'
import config from '../config'
import { callHook, activateChildComponent } from '../instance/lifecycle'

import {
  warn,
  nextTick,
  devtools,
  inBrowser,
  isIE
} from '../util/index'

export const MAX_UPDATE_COUNT = 100

const queue: Array<Watcher> = []
const activatedChildren: Array<Component> = []
let has: { [key: number]: ?true } = {}
let circular: { [key: number]: number } = {}
let waiting = false
let flushing = false
let index = 0

/**
 * Reset the scheduler's state.
 */
function resetSchedulerState () {
  index = queue.length = activatedChildren.length = 0
  has = {}
  if (process.env.NODE_ENV !== 'production') {
    circular = {}
  }
  waiting = flushing = false
}

// Async edge case #6566 requires saving the timestamp when event listeners are
// attached. However, calling performance.now() has a perf overhead especially
// if the page has thousands of event listeners. Instead, we take a timestamp
// every time the scheduler flushes and use that for all event listeners
// attached during that flush.
// 异步边界情况#6566：当事件监听器附加上时（addEventListener），需要保存时间戳
// 然而，调用performance.now()开销特别大，尤其是页面有成千上万个事件监听器
// 取而代之的是，每次调度程序刷新时，我们都要加上一个时间戳，并将其用于该刷新期间附加的所有事件侦听器
export let currentFlushTimestamp = 0

// Async edge case fix requires storing an event listener's attach timestamp.
// getNow函数即Date.now函数
let getNow: () => number = Date.now

// Determine what event timestamp the browser is using. Annoyingly, the
// timestamp can either be hi-res (relative to page load) or low-res
// (relative to UNIX epoch), so in order to compare time we have to use the
// same timestamp type when saving the flush timestamp.
// All IE versions use low-res event timestamps, and have problematic clock
// implementations (#9632)
// 确定浏览器正在使用的事件时间戳
// 烦人的是，时间戳既可以是hi-res（High Resolution Time，高精度事件，亚毫秒级别）（相对于页面加载），也可以是low-res（相对于UNIX纪元），所以为了按顺序比较时间，我们必须在保存时间戳的时候，使用相同的时间戳类型
// 所有的IE版本都是使用low-res事件时间戳，并且时钟实现有问题（#9632）
if (inBrowser && !isIE) {
  const performance = window.performance
  if (
    performance &&
    typeof performance.now === 'function' &&
    getNow() > document.createEvent('Event').timeStamp
  ) {
    // if the event timestamp, although evaluated AFTER the Date.now(), is
    // smaller than it, it means the event is using a hi-res timestamp,
    // and we need to use the hi-res version for event listener timestamps as
    // well.
    // 如果事件的时间戳，
    getNow = () => performance.now()
  }
}

/**
 * Flush both queues and run the watchers.
 * 刷新队列并运行观察程序
 */
function flushSchedulerQueue () {
  currentFlushTimestamp = getNow()
  flushing = true
  let watcher, id

  // Sort queue before flush.
  // This ensures that:
  // 1. Components are updated from parent to child. (because parent is always
  //    created before the child)
  // 2. A component's user watchers are run before its render watcher (because
  //    user watchers are created before the render watcher)
  // 3. If a component is destroyed during a parent component's watcher run,
  //    its watchers can be skipped.
  // 刷新前排序队列
  // 这样做确保了：
  // 1、组件的更新顺序始终是从父组件到子组件（因为父组件总是比子组件先创建）
  // 2、组件内用户创建的watcher比组件自身的render watcher先运行（因为用户的watcher比render watcher先创建）
  // 3、如果组件在父组件的watcher运行的时候被销毁，该组件的watcher会被跳过
  // TODO 写一篇[].sort使用注意事项
  queue.sort((a, b) => a.id - b.id)

  // do not cache length because more watchers might be pushed
  // as we run existing watchers
  // 不要缓存队列的length属性，因为当我们运行已存在的watcher时，可能会有更多的watcher被加入到队列中
  for (index = 0; index < queue.length; index++) {
    watcher = queue[index]
    if (watcher.before) {
      watcher.before()
    }
    id = watcher.id
    has[id] = null
    watcher.run()
    // in dev build, check and stop circular updates.
    // 在开发环境中，记录每一个watcher的更新次数，超过100次则提示
    if (process.env.NODE_ENV !== 'production' && has[id] != null) {
      circular[id] = (circular[id] || 0) + 1
      if (circular[id] > MAX_UPDATE_COUNT) {
        warn(
          'You may have an infinite update loop ' + (
            watcher.user
              ? `in watcher with expression "${watcher.expression}"`
              : `in a component render function.`
          ),
          watcher.vm
        )
        break
      }
    }
  }

  // keep copies of post queues before resetting state
  // 在重置状态前将队列复制一份
  const activatedQueue = activatedChildren.slice()
  const updatedQueue = queue.slice()

  resetSchedulerState()

  // call component updated and activated hooks
  // 调用组件的updated、activated钩子
  callActivatedHooks(activatedQueue)
  callUpdatedHooks(updatedQueue)

  // devtool hook
  /* istanbul ignore if */
  if (devtools && config.devtools) {
    devtools.emit('flush')
  }
}

function callUpdatedHooks (queue) {
  let i = queue.length
  while (i--) {
    const watcher = queue[i]
    const vm = watcher.vm
    // vm表示Vue、VueComponent，如果watcher相等则表示当前是Vue、VueComponent
    // 是Vue、VueComponent && 已挂载 && 未销毁
    if (vm._watcher === watcher && vm._isMounted && !vm._isDestroyed) {
      callHook(vm, 'updated')
    }
  }
}

/**
 * Queue a kept-alive component that was activated during patch.
 * The queue will be processed after the entire tree has been patched.
 * 将patch期间处于活跃状态的keep-alive组件放入队列中
 * 该队列将会在整个树patch之后被处理
 */
export function queueActivatedComponent (vm: Component) {
  // setting _inactive to false here so that a render function can
  // rely on checking whether it's in an inactive tree (e.g. router-view)
  // 将_inactive标识设置为false，这样render函数就能据此判断当前组件是否处于不活跃树中
  vm._inactive = false
  activatedChildren.push(vm)
}

function callActivatedHooks (queue) {
  for (let i = 0; i < queue.length; i++) {
    queue[i]._inactive = true
    activateChildComponent(queue[i], true /* true */)
  }
}

/**
 * Push a watcher into the watcher queue.
 * Jobs with duplicate IDs will be skipped unless it's
 * pushed when the queue is being flushed.
 */
// 将一个watcher推入watcher队列
// ID重复的watcher将会被跳过，除非在更新队列时，通过某个watcher.run()函数推入到队列中
// 注意，之前队列中相同的watcher已被执行并且退出队列
export function queueWatcher (watcher: Watcher) {
  const id = watcher.id
  // 不在队列中的watcher才能被添加
  if (has[id] == null) {
    has[id] = true
    // 队列没有执行更新时，直接将watcher放到队列尾部
    if (!flushing) {
      queue.push(watcher)
    } else {
      // if already flushing, splice the watcher based on its id
      // if already past its id, it will be run next immediately.
      // 如果此时队列正在刷新，且刷新到第index个watcher，由于上面的has[id] == null 决定了待添加的watcher要么是队列中已经执行过的watcher(第index个watcher也算执行过)、要么是全新的watcher
      // 1、该watcher是全新的watcher，根据该watcher的id将其插入到对应的位置
      // 2、该watcher已经执行过，则插入到当前队列的第index个之后（即立马执行）
      let i = queue.length - 1
      // 队列正在刷新的第index之后的watchers && 根据id排序找到对应的位置
      while (i > index && queue[i].id > watcher.id) {
        i--
      }
      queue.splice(i + 1, 0, watcher)
    }
    // queue the flush
    // 在队列刷新期间，可以添加watcher，但是直到队列刷新完毕，都不能再次运行刷新函数
    if (!waiting) {
      waiting = true

      // 测试环境 && 配置开启同步模式，则不缓冲watcher，调用多少次queueWatcher，就直接刷新队列，性能将会降低很多
      if (process.env.NODE_ENV !== 'production' && !config.async) {
        flushSchedulerQueue()
        return
      }
      // 将刷新队列函数放到下一个tick执行，缓冲在同一事件循环中发生的所有数据变更
      // https://cn.vuejs.org/v2/guide/reactivity.html#异步更新队列
      nextTick(flushSchedulerQueue)
    }
  }
}
