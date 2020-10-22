/* @flow */

/**
 * v-model不支持动态的input[types]属性，input[type]属性改变时，不会更新dom，因此要改为v-if使其支持动态type
 * TODO 为何v-if要单独列出checkbox、radio的情况，直接v-if + v-else触发dom修改不行么？
 * TODO 等更新dom流程熟悉了再回来看https://stackoverflow.com/questions/44461188/vue2-v-model-does-not-support-dynamic-input-types
 * Expand input[v-model] with dynamic type bindings into v-if-else chains
 * Turn this:
 *   <input v-model="data[type]" :type="type">
 * into this:
 *   <input v-if="type === 'checkbox'" type="checkbox" v-model="data[type]">
 *   <input v-else-if="type === 'radio'" type="radio" v-model="data[type]">
 *   <input v-else :type="type" v-model="data[type]">
 */

import {
  addRawAttr,
  getBindingAttr,
  getAndRemoveAttr
} from 'compiler/helpers'

import {
  processFor,
  processElement,
  addIfCondition,
  createASTElement
} from 'compiler/parser/index'

// 预处理使用了v-model、动态绑定type属性的input标签
function preTransformNode (el: ASTElement, options: CompilerOptions) {
  if (el.tag === 'input') {
    const map = el.attrsMap
    if (!map['v-model']) {
      return
    }

    let typeBinding
    // 如果动态绑定的type属性有值，则获取其值
    if (map[':type'] || map['v-bind:type']) {
      // 其实可以直接用map[:type]获取具体值，调用getBindingAttr()为的是将type从el.attrsList中移除
      typeBinding = getBindingAttr(el, 'type')
    }
    // 没有使用type="text"，也没有使用:type="inputType"、v-bind:type="inputType"来绑定type属性，但是使用了<input v-bind="{ type: inputType }" />这种形式来绑定数据
    // 由于map['v-bind']中不一定有type属性，因此要排除type="text"的情况，防止type被覆盖
    if (!map.type && !typeBinding && map['v-bind']) {
      typeBinding = `(${map['v-bind']}).type`
    }

    // 使用了动态绑定type属性
    if (typeBinding) {
      const ifCondition = getAndRemoveAttr(el, 'v-if', true)
      // TODO ifCondition为何要用()包裹？
      const ifConditionExtra = ifCondition ? `&&(${ifCondition})` : ``
      const hasElse = getAndRemoveAttr(el, 'v-else', true) != null
      const elseIfCondition = getAndRemoveAttr(el, 'v-else-if', true)
      // 1. checkbox
      const branch0 = cloneASTElement(el)
      // process for on the main node
      // 1）v-if在上面几行处理了，此处不再处理
      // 2）v-once此处不处理，直接无效。因为v-model、:type每次渲染肯定都要更新，不会当作静态内容
      processFor(branch0)
      // 设置input的type="checkbox"
      addRawAttr(branch0, 'type', 'checkbox')
      processElement(branch0, options)
      // 添加已处理标识，防止在src/compiler/parser/index.js中重复处理
      branch0.processed = true // prevent it from double-processed
      // 假设html为：<input v-model="val" :type="inputType" v-if="display" />
      // branch0.if = "(${inputType})==='checkbox'&&(display)"
      branch0.if = `(${typeBinding})==='checkbox'` + ifConditionExtra
      addIfCondition(branch0, {
        exp: branch0.if,
        block: branch0
      })

      // 2. add radio else-if condition
      const branch1 = cloneASTElement(el)
      // v-for在type="checkbox"中处理过了，这里移除掉
      getAndRemoveAttr(branch1, 'v-for', true)
      addRawAttr(branch1, 'type', 'radio')
      processElement(branch1, options)
      addIfCondition(branch0, {
        exp: `(${typeBinding})==='radio'` + ifConditionExtra,
        block: branch1
      })

      // 3. other
      const branch2 = cloneASTElement(el)
      // v-for在type="checkbox"中处理过了，这里移除掉
      getAndRemoveAttr(branch2, 'v-for', true)
      addRawAttr(branch2, ':type', typeBinding)
      processElement(branch2, options)
      addIfCondition(branch0, {
        exp: ifCondition,
        block: branch2
      })

      // 处理input标签使用v-else的情况
      if (hasElse) {
        branch0.else = true
      } else if (elseIfCondition) {
        // 处理input标签使用v-else-if的情况
        branch0.elseif = elseIfCondition
      }

      return branch0
    }
  }
}

function cloneASTElement (el) {
  return createASTElement(el.tag, el.attrsList.slice(), el.parent)
}

export default {
  preTransformNode
}
