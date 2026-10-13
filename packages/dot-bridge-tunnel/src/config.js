// Legacy two-adapter host for existing integration fixtures and finite-window tools.
import {readConfig as readCore,validateConfig as validateCore} from '@dot-bridge/core/router/config.js';
import {adapters} from './adapters.js';
export function coreConfig(value){
 const {host,port,owner,ingressKeyFile,operation='readiness',liveChannels=[]}=value;
 return validateCore({host,port,owner,ingressKeyFile,operation,liveChannels,channels:{qq:{port:value.qqPort,keyFile:value.qqKeyFile,adapter:adapters[0]},lark:{port:value.larkPort,keyFile:value.larkKeyFile,adapter:adapters[1]}}});
}
export function validateConfig(value){
 const fields=['host','port','owner','ingressKeyFile','qqKeyFile','larkKeyFile','qqPort','larkPort','operation','liveChannels'];
 if(!value||Object.keys(value).some(k=>!fields.includes(k)))throw Error('Invalid legacy config');
 const c=coreConfig(value);return Object.freeze({...value,operation:c.operation,liveChannels:c.liveChannels});
}
export function readConfig(env=process.env){const c=readCore(env,adapters);return Object.freeze({host:c.host,port:c.port,owner:c.owner,ingressKeyFile:c.ingressKeyFile,operation:c.operation,liveChannels:c.liveChannels,qqPort:c.channels.qq.port,larkPort:c.channels.lark.port,qqKeyFile:c.channels.qq.keyFile,larkKeyFile:c.channels.lark.keyFile});}
