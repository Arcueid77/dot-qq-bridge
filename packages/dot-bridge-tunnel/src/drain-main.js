import {pathToFileURL} from 'node:url';
import {startRouter,drainAggregate} from '@dot-bridge/core/router/main.js';
import {adapters} from './adapters.js';
export {drainAggregate};
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await startRouter(adapters,{drain:true});
