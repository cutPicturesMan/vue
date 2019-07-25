/* @flow */

import * as nodeOps from 'web/runtime/node-ops'
import { createPatchFunction } from 'core/vdom/patch'
import baseModules from 'core/vdom/modules/index'
import platformModules from 'web/runtime/modules/index'

// the directive module should be applied last, after all
// built-in modules have been applied.
/**
 directive指令模块应该放在最后，在所有内置模块应用之后

 [
   attrs,
   klass,
   events,
   domProps,
   style,
   transition,

   ref,
   directives
 ]
 */
const modules = platformModules.concat(baseModules)

export const patch: Function = createPatchFunction({ nodeOps, modules })
