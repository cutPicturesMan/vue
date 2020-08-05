/* @flow */

import { inBrowser } from 'core/util/env'
import { makeMap } from 'shared/util'

export const namespaceMap = {
  svg: 'http://www.w3.org/2000/svg',
  math: 'http://www.w3.org/1998/Math/MathML'
  // TODO jsfiddle.net访问不了，稍后看 https://github.com/vuejs/vue/issues/4478
}

export const isHTMLTag = makeMap(
  'html,body,base,head,link,meta,style,title,' +
  'address,article,aside,footer,header,h1,h2,h3,h4,h5,h6,hgroup,nav,section,' +
  'div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,' +
  'a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,rtc,ruby,' +
  's,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,' +
  'embed,object,param,source,canvas,script,noscript,del,ins,' +
  'caption,col,colgroup,table,thead,tbody,td,th,tr,' +
  'button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,' +
  'output,progress,select,textarea,' +
  'details,dialog,menu,menuitem,summary,' +
  'content,element,shadow,template,blockquote,iframe,tfoot'
)

// this map is intentionally selective, only covering SVG elements that may
// contain child elements.
// 此映射是有意选择的，仅覆盖可能包含子元素的SVG元素
// TODO jsfiddle.net访问不了，稍后看 https://github.com/vuejs/vue/issues/4813
export const isSVG = makeMap(
  'svg,animate,circle,clippath,cursor,defs,desc,ellipse,filter,font-face,' +
  'foreignObject,g,glyph,image,line,marker,mask,missing-glyph,path,pattern,' +
  'polygon,polyline,rect,switch,symbol,text,textpath,tspan,use,view',
  true
)

export const isPreTag = (tag: ?string): boolean => tag === 'pre'

// 是否是保留标签
export const isReservedTag = (tag: string): ?boolean => {
  return isHTMLTag(tag) || isSVG(tag)
}

export function getTagNamespace (tag: string): ?string {
  if (isSVG(tag)) {
    return 'svg'
  }
  // basic support for MathML
  // note it doesn't support other MathML elements being component roots
  if (tag === 'math') {
    return 'math'
  }
}

const unknownElementCache = Object.create(null)
// 是否是浏览器环境下的未知标签
export function isUnknownElement (tag: string): boolean {
  /* istanbul ignore if */
  // 如果是非浏览器环境，由于该版本是浏览器专用，因此直接认为是未知标签
  if (!inBrowser) {
    return true
  }
  // 如果是浏览器环境的保留标签，则不是未知标签
  if (isReservedTag(tag)) {
    return false
  }
  tag = tag.toLowerCase()
  // 之前已经判断过了，则直接返回结果
  /* istanbul ignore if */
  if (unknownElementCache[tag] != null) {
    return unknownElementCache[tag]
  }

  // 这里开始真正的未知标签的判断
  const el = document.createElement(tag)
  // W3C规范定义，自定义元素中间必须要有短横线
  // 由于自定义元素与未知元素的判断有区别，因此要分开判断
  // 2、自定义元素，如果是未知的，有以下2种情况：
  // 1) 组件名称不合法的自定义元素的constructor才指向window.HTMLUnknownElement
  // 2) 未注册的自定义元素的constructor指向window.HTMLElement
  // TODO https://www.zhangxinxu.com/wordpress/2018/03/htmlunknownelement-html5-custom-elements/
  // TODO https://developer.mozilla.org/zh-CN/docs/Web/API/CustomElementRegistry/define
  if (tag.indexOf('-') > -1) {
    // http://stackoverflow.com/a/28210364/1070244
    return (unknownElementCache[tag] = (
      el.constructor === window.HTMLUnknownElement ||
      el.constructor === window.HTMLElement
    ))
  } else {
    // 1、普通标签，如果是未知的，其document.createElement(tag).constructor指向window.HTMLUnknownElement
    return (unknownElementCache[tag] = /HTMLUnknownElement/.test(el.toString()))
  }
}

export const isTextInputType = makeMap('text,number,password,search,email,tel,url')
