/* @flow */
// 匹配函数2种声明形式：
// 1、箭头函数：arg => 或者 (arg1, arg2) =>
// 2、函数声明：function a (
const fnExpRE = /^([\w$_]+|\([^)]*?\))\s*=>|^function\s*(?:[\w$]+)?\s*\(/
// 匹配函数调用时的括号，如fn(a, b, c);中的'(a, b, c);'
const fnInvokeRE = /\([^)]*?\);*$/
// `] }`只与`[ {`成对出现时具有特殊含义，如果单独出现，则不需要转义
// https://www.runoob.com/regexp/regexp-syntax.html
// 匹配方法的路径：
// 1、fn1
// 2、obj.fn1、obj['fn-1']、obj["fn-1"]、obj[1]、obj[name]
const simplePathRE = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\['[^']*?']|\["[^"]*?"]|\[\d+]|\[[A-Za-z_$][\w$]*])*$/

// KeyboardEvent.keyCode aliases
// 由于keyCode被废弃了，这里提供别名
const keyCodes: { [key: string]: number | Array<number> } = {
  esc: 27,
  tab: 9,
  enter: 13,
  space: 32,
  up: 38,
  left: 37,
  right: 39,
  down: 40,
  'delete': [8, 46]
}

// KeyboardEvent.key aliases
// key的别名
const keyNames: { [key: string]: string | Array<string> } = {
  // #7880: IE11 and Edge use `Esc` for Escape key name.
  esc: ['Esc', 'Escape'],
  tab: 'Tab',
  enter: 'Enter',
  // #9112: IE11 uses `Spacebar` for Space key name.
  space: [' ', 'Spacebar'],
  // #7806: IE11 uses key names without `Arrow` prefix for arrow keys.
  up: ['Up', 'ArrowUp'],
  left: ['Left', 'ArrowLeft'],
  right: ['Right', 'ArrowRight'],
  down: ['Down', 'ArrowDown'],
  // #9112: IE11 uses `Del` for Delete key name.
  'delete': ['Backspace', 'Delete', 'Del']
}

// #4868: modifiers that prevent the execution of the listener
// need to explicitly return null so that we can determine whether to remove
// the listener for .once
const genGuard = condition => `if(${condition})return null;`

/**
 修饰符
 .capture - 添加事件侦听器时使用 capture 模式。
 .once - 只触发一次回调。
 .passive - (2.3.0) 以 { passive: true } 模式添加侦听器

 .native - 监听组件根元素的原生事件。

 .stop - 调用 event.stopPropagation()。
 .prevent - 调用 event.preventDefault()。
 .self - 只当事件是从侦听器绑定的元素本身触发时才触发回调。
 .{keyCode | keyAlias} - 只当事件是从特定键触发时才触发回调。
 .left - (2.2.0) 只当点击鼠标左键时触发。
 .right - (2.2.0) 只当点击鼠标右键时触发。
 .middle - (2.2.0) 只当点击鼠标中键时触发。
 */
const modifierCode: { [key: string]: string } = {
  stop: '$event.stopPropagation();',
  prevent: '$event.preventDefault();',
  self: genGuard(`$event.target !== $event.currentTarget`),
  ctrl: genGuard(`!$event.ctrlKey`),
  shift: genGuard(`!$event.shiftKey`),
  alt: genGuard(`!$event.altKey`),
  meta: genGuard(`!$event.metaKey`),
  left: genGuard(`'button' in $event && $event.button !== 0`),
  middle: genGuard(`'button' in $event && $event.button !== 1`),
  right: genGuard(`'button' in $event && $event.button !== 2`)
}

// 处理事件
// <div @[event]="dynamic" @click="static"></div>
// "on:_d({"click":static},[event,dynamic])"
export function genHandlers (
  events: ASTElementHandlers,
  isNative: boolean
): string {
  const prefix = isNative ? 'nativeOn:' : 'on:'
  let staticHandlers = ``
  let dynamicHandlers = ``
  for (const name in events) {
    const handlerCode = genHandler(events[name])
    if (events[name] && events[name].dynamic) {
      dynamicHandlers += `${name},${handlerCode},`
    } else {
      staticHandlers += `"${name}":${handlerCode},`
    }
  }
  // 去掉最后一个逗号
  staticHandlers = `{${staticHandlers.slice(0, -1)}}`
  // 含有动态事件名的情况
  if (dynamicHandlers) {
    return prefix + `_d(${staticHandlers},[${dynamicHandlers.slice(0, -1)}])`
  } else {
    // 不含有动态事件名
    return prefix + staticHandlers
  }
}

// Generate handler code with binding params on Weex
/* istanbul ignore next */
function genWeexHandler (params: Array<any>, handlerCode: string) {
  let innerHandlerCode = handlerCode
  const exps = params.filter(exp => simplePathRE.test(exp) && exp !== '$event')
  const bindings = exps.map(exp => ({ '@binding': exp }))
  const args = exps.map((exp, i) => {
    const key = `$_${i + 1}`
    innerHandlerCode = innerHandlerCode.replace(exp, key)
    return key
  })
  args.push('$event')
  return '{\n' +
    `handler:function(${args.join(',')}){${innerHandlerCode}},\n` +
    `params:${JSON.stringify(bindings)}\n` +
    '}'
}

function genHandler (handler: ASTElementHandler | Array<ASTElementHandler>): string {
  // @click=''
  if (!handler) {
    return 'function(){}'
  }

  // 多次绑定同一个事件，handler为数组
  if (Array.isArray(handler)) {
    return `[${handler.map(handler => genHandler(handler)).join(',')}]`
  }

  // 事件名称是函数声明式，@click="fn"
  const isMethodPath = simplePathRE.test(handler.value)
  // 事件名称是函数表达式，@click="function(){ ... }" 或 @click="() => { ... }"
  const isFunctionExpression = fnExpRE.test(handler.value)
  // 事件名称是内联js语句，这是一条JS语句，而不是方法名 @click="fn(arg1)"
  // 不支持自执行函数：@click="function(){ ... }()" 或 @click="() => { ... }()"
  // 不支持自执行函数的情况下，自然不支持这种：@click="function(){ return function () {}  }()"
  const isFunctionInvocation = simplePathRE.test(handler.value.replace(fnInvokeRE, ''))

  if (!handler.modifiers) {
    // 先处理函数声明式 和 函数表达式，这两种形式直接返回即可
    if (isMethodPath || isFunctionExpression) {
      return handler.value
    }
    /* istanbul ignore if */
    if (__WEEX__ && handler.params) {
      return genWeexHandler(handler.params, handler.value)
    }
    // 内联js语句的处理，即用函数包裹
    return `function($event){${
      isFunctionInvocation ? `return ${handler.value}` : handler.value
    }}` // inline statement
  } else {
    let code = ''
    let genModifierCode = ''
    const keys = []
    // 循环处理修饰符
    for (const key in handler.modifiers) {
      // 该修饰符存在对应的处理代码，则赋值
      if (modifierCode[key]) {
        genModifierCode += modifierCode[key]
        // left/right
        if (keyCodes[key]) {
          keys.push(key)
        }
      } else if (key === 'exact') {
        // 如果修饰符是exact，且指定了系统按键修饰符，表示精确匹配到系统按键组合时，才会触发相应事件；没有指定系统按键修饰符，则表示在没有系统按键组合时，才会触发相应事件
        const modifiers: ASTModifiers = (handler.modifiers: any)
        // TODO genGuard的作用
        genModifierCode += genGuard(
          ['ctrl', 'shift', 'alt', 'meta']
            // 不阻止指定的系统修饰键
            .filter(keyModifier => !modifiers[keyModifier])
            .map(keyModifier => `$event.${keyModifier}Key`)
            .join('||')
        )
      } else {
        // TODO 处理键码？还有没有其他情况
        keys.push(key)
      }
    }
    if (keys.length) {
      code += genKeyFilter(keys)
    }
    // Make sure modifiers like prevent and stop get executed after key filtering
    if (genModifierCode) {
      code += genModifierCode
    }
    const handlerCode = isMethodPath
      ? `return ${handler.value}($event)`
      : isFunctionExpression
        ? `return (${handler.value})($event)`
        : isFunctionInvocation
          ? `return ${handler.value}`
          : handler.value
    /* istanbul ignore if */
    if (__WEEX__ && handler.params) {
      return genWeexHandler(handler.params, code + handlerCode)
    }
    return `function($event){${code}${handlerCode}}`
  }
}

// 确保key过滤器只用在键盘事件上
function genKeyFilter (keys: Array<string>): string {
  return (
    // make sure the key filters only apply to KeyboardEvents
    // #9441: can't use 'keyCode' in $event because Chrome autofill fires fake
    // key events that do not have keyCode property...
    `if(!$event.type.indexOf('key')&&` +
    `${keys.map(genFilterCode).join('&&')})return null;`
  )
}

function genFilterCode (key: string): string {
  const keyVal = parseInt(key, 10)
  if (keyVal) {
    return `$event.keyCode!==${keyVal}`
  }
  const keyCode = keyCodes[key]
  const keyName = keyNames[key]
  return (
    `_k($event.keyCode,` +
    `${JSON.stringify(key)},` +
    `${JSON.stringify(keyCode)},` +
    `$event.key,` +
    `${JSON.stringify(keyName)}` +
    `)`
  )
}
