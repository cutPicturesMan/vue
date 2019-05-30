/* @flow */

import { cached, extend, toObject } from 'shared/util'

/**
 将非绑定的style属性解析为对象形式
 <div style="color: red; background: green;"></div>

 @cssText String "color: red; background: green;"
 @return {
    color: 'red',
    background: 'green'
  }
 */
export const parseStyleText = cached(function (cssText) {
  const res = {}
  // <div style="color: red; background: url(data:image/jpg;base64,iVBORw0KGg...);"></div>
  // 不局限于background，也有可能是border-image
  // style以";"来区分每一个样式。此时，有一种额外的情况，如果background:url()中带有";"，会造成误判，思路如下
  // 排除掉";"后面跟")"的情况：/;(?!.*\))/g
  // 对于"color: red;"来说，";"是合法的，因为后面的")"之前存在"("，将其完整包裹起来
  const listDelimiter = /;(?![^(]*\))/g
  // 表示匹配第一个":"到最后，不能直接用/:/
  // 'background: url(https://vuejs.org/images/logo.png)'.split(/:/)
  // -> ["background", " url(https", "//vuejs.org/images/logo.png)"]
  const propertyDelimiter = /:(.+)/
  cssText.split(listDelimiter).forEach(function (item) {
    if (item) {
      const tmp = item.split(propertyDelimiter)
      tmp.length > 1 && (res[tmp[0].trim()] = tmp[1].trim())
    }
  })
  return res
})

// merge static and dynamic style data on the same vnode
function normalizeStyleData (data: VNodeData): ?Object {
  const style = normalizeStyleBinding(data.style)
  // static style is pre-processed into an object during compilation
  // and is always a fresh object, so it's safe to merge into it
  return data.staticStyle
    ? extend(data.staticStyle, style)
    : style
}

// normalize possible array / string values into Object
export function normalizeStyleBinding (bindingStyle: any): ?Object {
  if (Array.isArray(bindingStyle)) {
    return toObject(bindingStyle)
  }
  if (typeof bindingStyle === 'string') {
    return parseStyleText(bindingStyle)
  }
  return bindingStyle
}

/**
 * parent component style should be after child's
 * so that parent component's style could override it
 */
export function getStyle (vnode: VNodeWithData, checkChild: boolean): Object {
  const res = {}
  let styleData

  if (checkChild) {
    let childNode = vnode
    while (childNode.componentInstance) {
      childNode = childNode.componentInstance._vnode
      if (
        childNode && childNode.data &&
        (styleData = normalizeStyleData(childNode.data))
      ) {
        extend(res, styleData)
      }
    }
  }

  if ((styleData = normalizeStyleData(vnode.data))) {
    extend(res, styleData)
  }

  let parentNode = vnode
  while ((parentNode = parentNode.parent)) {
    if (parentNode.data && (styleData = normalizeStyleData(parentNode.data))) {
      extend(res, styleData)
    }
  }
  return res
}
