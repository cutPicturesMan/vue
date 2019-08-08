/* @flow */

import { toNumber, toString, looseEqual, looseIndexOf } from 'shared/util'
import { createTextVNode, createEmptyVNode } from 'core/vdom/vnode'
import { renderList } from './render-list'
import { renderSlot } from './render-slot'
import { resolveFilter } from './resolve-filter'
import { checkKeyCodes } from './check-keycodes'
import { bindObjectProps } from './bind-object-props'
import { renderStatic, markOnce } from './render-static'
import { bindObjectListeners } from './bind-object-listeners'
import { resolveScopedSlots } from './resolve-scoped-slots'
import { bindDynamicKeys, prependModifier } from './bind-dynamic-keys'

export function installRenderHelpers (target: any) {
  target._o = markOnce // 单次渲染【codegen/index.js】
  target._n = toNumber // 将输入转为数字【/src/platforms/web/compiler/directives/model.js】
  target._s = toString // TODO 分析下具体为啥这么写【parse/text-parser.js】
  target._l = renderList // 渲染v-for【codegen/index.js】
  target._t = renderSlot // 渲染<slot>【codegen/index.js】
  target._q = looseEqual // 判断2个值是否宽松相等【/src/platforms/web/compiler/directives/model.js】
  target._i = looseIndexOf // 查找对象在数组中的位置
  target._m = renderStatic // 渲染静态树【codegen/index.js】
  target._f = resolveFilter // 处理过滤器【parse/text-parser.js】
  target._k = checkKeyCodes // TODO 看event时再分析【/src/compiler/codegen/events.js】
  target._b = bindObjectProps // 处理v-bind绑定的参数为对象的情况【codegen/index.js】
  target._v = createTextVNode // 创建文字节点【codegen/index.js】
  target._e = createEmptyVNode // 创建注释节点【codegen/index.js】
  target._u = resolveScopedSlots // 解决局部作用域插槽【codegen/index.js】
  target._g = bindObjectListeners // 绑定对象监听【/src/compiler/directives/on.js】
  target._d = bindDynamicKeys // 处理动态key绑定 :[key]="xxx"【codegen/index.js】
  target._p = prependModifier  // 为事件动态添加修饰符【/src/compiler/helpers.js】
}
