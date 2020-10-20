/* @flow */

import { makeMap } from 'shared/util'

// 由于html标签是区分大小写的，因此在使用makeMap()创建标签映射时，也要区分大小写，即不能传第二个参数

// 一元标签
export const isUnaryTag = makeMap(
  'area,base,br,col,embed,frame,hr,img,input,isindex,keygen,' +
  'link,meta,param,source,track,wbr'
)

// Elements that you can, intentionally, leave open
// (and which close themselves)
// TODO 查下self-closing的来源（官方文档）？
// 自闭合标签
export const canBeLeftOpenTag = makeMap(
  'colgroup,dd,dt,li,options,p,td,tfoot,th,thead,tr,source'
)

// HTML5 tags https://html.spec.whatwg.org/multipage/indices.html#elements-3
// Phrasing Content https://html.spec.whatwg.org/multipage/dom.html#phrasing-content
// TODO 验证下面缺少、应排除的标签是否正确，以及html5的标签嵌套规则
// 缺少：main,menu,nav,ol,p,pre,section,table,ul ?
// 应排除：menuitem,meta ?

// http://blog.shaochuancs.com/w3c-html5-content-model/
export const isNonPhrasingTag = makeMap(
  'address,article,aside,base,blockquote,body,caption,col,colgroup,dd,' +
  'details,dialog,div,dl,dt,fieldset,figcaption,figure,footer,form,' +
  'h1,h2,h3,h4,h5,h6,head,header,hgroup,hr,html,legend,li,menuitem,meta,' +
  'optgroup,option,param,rp,rt,source,style,summary,tbody,td,tfoot,th,thead,' +
  'title,tr,track'
)
