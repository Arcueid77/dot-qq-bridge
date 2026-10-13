import {createApp as createCore} from '@dot-bridge/core/router/server.js';
import {coreConfig} from './config.js';
export {checkHeaders} from '@dot-bridge/core/router/server.js';
export const createApp=(config,options)=>createCore(coreConfig(config),options);
