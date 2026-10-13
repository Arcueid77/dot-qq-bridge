import {adapters} from './adapters.js';
import {coreConfig} from './config.js';
import {toolCatalog as coreTools,eventCatalog as coreEvents} from '@dot-bridge/core/router/catalog.js';
export {sameSchema} from '@dot-bridge/core/router/catalog.js';
export const tools=adapters.map(a=>a.readinessTool),liveToolDefinitions=Object.fromEntries(adapters.map(a=>[a.id,a.liveTools])),liveEventDefinitions=Object.fromEntries(adapters.map(a=>[a.id,a.event]));
export const liveSetupTool=adapters[0].liveReadinessTool,larkSetupTool=adapters[1].backendSetupTool,liveLarkReadinessTool=adapters[1].liveReadinessTool;
export const toolCatalog=c=>coreTools(coreConfig(c)),eventCatalog=c=>coreEvents(coreConfig(c));
export const expectedBackendTools=(channel,live)=>{const a=adapters.find(x=>x.id===channel);return live?[...a.liveTools,a.backendSetupTool]:a.readinessBackendTools;};
export const matchesBackendOutputSchema=(channel,name,actual,expected)=>adapters.find(a=>a.id===channel).matchesBackendOutputSchema(name,actual,expected,(a,b)=>JSON.stringify(a)===JSON.stringify(b));
