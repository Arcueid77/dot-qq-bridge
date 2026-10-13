import {createUpstreamClient as createCore} from '@dot-bridge/core/router/upstream.js';
import {coreConfig} from './config.js';
export const createUpstreamClient=(config,keys,options)=>createCore(coreConfig(config),keys,options);
