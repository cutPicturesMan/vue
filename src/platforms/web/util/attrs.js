/* @flow */

import { makeMap } from 'shared/util'

// these are reserved for web because they are directly compiled away
// during template compilation
export const isReservedAttr = makeMap('style,class')

// attributes that should be using props for binding
// 用DOM property的方式来绑定属性，这样才能够获取该属性的实时值
// 如果用HTML attribute的方式绑定属性，只能获取到该属性的初始值
// TODO https://stackoverflow.com/questions/6003819/what-is-the-difference-between-properties-and-attributes-in-html#answer-6004028
/**
 TODO 看完processAttr之后，解决下面问题：当btn2切换到btn1时（btn1的domProps属性为空，attr.value有值），其按钮内的文案没了？是因为这两个按钮的vnode重用了？
 const vm = new Vue({
  data: {
    message: 'Hello Vue.js!',
    show: true ,
    btnValue1: 'button 1',
    btnValue2: 'button 2'
  },
  methods: {
    show1 () {
      this.show=!this.show;
      this.$nextTick().then(()=>{
        const children = this._vnode.children;
        console.log(children[children.length-1].data);
      })
    }
  },
  template: `
    <div>
      <p>{{ message }}</p>
      <input type="button" @click="show1" value="Toggle">（Switch multiple times to see the results）
      <p>===========scene one=============</p>
      <input v-if="show" type="button" value="btnValue1" data-ttt="1">
      <input v-else type="button" :value="btnValue2" data-ttt="2">
    </div>
  `
}).$mount('#app1')
 */
const acceptValue = makeMap('input,textarea,option,select,progress')
export const mustUseProp = (tag: string, type: ?string, attr: string): boolean => {
  return (
    // button按钮的值不用获取实时值，因此排除
    (attr === 'value' && acceptValue(tag)) && type !== 'button' ||
    (attr === 'selected' && tag === 'option') ||
    (attr === 'checked' && tag === 'input') ||
    (attr === 'muted' && tag === 'video')
  )
}

export const isEnumeratedAttr = makeMap('contenteditable,draggable,spellcheck')

const isValidContentEditableValue = makeMap('events,caret,typing,plaintext-only')

export const convertEnumeratedValue = (key: string, value: any) => {
  return isFalsyAttrValue(value) || value === 'false'
    ? 'false'
    // allow arbitrary string value for contenteditable
    : key === 'contenteditable' && isValidContentEditableValue(value)
      ? value
      : 'true'
}

export const isBooleanAttr = makeMap(
  'allowfullscreen,async,autofocus,autoplay,checked,compact,controls,declare,' +
  'default,defaultchecked,defaultmuted,defaultselected,defer,disabled,' +
  'enabled,formnovalidate,hidden,indeterminate,inert,ismap,itemscope,loop,multiple,' +
  'muted,nohref,noresize,noshade,novalidate,nowrap,open,pauseonexit,readonly,' +
  'required,reversed,scoped,seamless,selected,sortable,translate,' +
  'truespeed,typemustmatch,visible'
)

export const xlinkNS = 'http://www.w3.org/1999/xlink'

export const isXlink = (name: string): boolean => {
  return name.charAt(5) === ':' && name.slice(0, 5) === 'xlink'
}

export const getXlinkProp = (name: string): string => {
  return isXlink(name) ? name.slice(6, name.length) : ''
}

export const isFalsyAttrValue = (val: any): boolean => {
  return val == null || val === false
}
