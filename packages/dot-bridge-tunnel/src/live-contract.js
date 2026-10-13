export * from '@dot-bridge/core/router/live-contract.js';
import {validateToolCall as tools,validateEventCall as events,projectToolResult as project,projectUpstreamError as projectError} from '@dot-bridge/core/router/live-contract.js';
import {coreConfig} from './config.js';import {adapters} from './adapters.js';
export const CHANNELS=Object.freeze(['qq','lark']);
export const validateToolCall=(c,p)=>tools(coreConfig(c),p),validateEventCall=(c,m,p)=>events(coreConfig(c),m,p);
export const projectToolResult=(call,result,live)=>adapters.find(a=>a.id===(call.channel??'qq')).projectToolResult(call,result,live);
export {projectLarkPreflight} from '../../../../dot-lark-bridge/src/tunnel-adapter.js';
export const projectUpstreamError=(value,params,options={})=>projectError(value,params,{...options,adapter:adapters.find(a=>a.id===options.channel)});
