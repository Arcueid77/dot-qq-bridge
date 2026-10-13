import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {privateMkdtempSync,privateMkdirSync,cleanupPrivateFixture,beforeFixtureCleanup} from '@dot-bridge/core/platform/test-fixtures.js';
import {createApp} from '../src/server.js';
import {OWNER,SERVICE_HEADER,VERSION,metadata} from '../src/common.js';
const larkRoot=process.env.LARK_BRIDGE_SOURCE_ROOT?pathToFileURL(path.resolve(process.env.LARK_BRIDGE_SOURCE_ROOT)+path.sep):new URL('../../../../dot-lark-bridge/src/',import.meta.url);
const available=fs.existsSync(new URL('server.js',larkRoot));
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nGQAAAAASUVORK5CYII=','base64');

test('actual sibling rich/group contract routes only Lark through the aggregate and verifies the official bot identity response', {skip:!available},async t=>{
  const dir=privateMkdtempSync(path.join(os.tmpdir(),'aggregate-rich-lark-'));cleanupPrivateFixture(t,dir);
  const stateDir=path.join(dir,'state');privateMkdirSync(stateDir,{mode:0o700});
  const keys=[61,62,63,64].map(value=>Buffer.alloc(32,value).toString('base64url'));
  const privateJson=(name,value)=>{const file=path.join(dir,name);fs.writeFileSync(file,JSON.stringify(value),{mode:0o600});return file;};
  const keyFiles=keys.map((key,index)=>{const file=path.join(dir,'key-'+index);fs.writeFileSync(file,key,{mode:0o600});return file;});
  const creds=privateJson('paired.json',{version:1,status:'paired',appId:'cli_0123456789abcdef',appSecret:'synthetic-app-secret',tenantKey:'tenant',ownerOpenId:'owner',ownerChatId:'private'});
  const policy=privateJson('policy.json',{version:1,enabled:true,reactions:true,render:'card',media:true,streaming:true,auto_card:false,bot_open_id:'bot',groups:[{chat_id:'group',members:'all',auto_reply:'all'}]});
  const {readConfig}=await import(new URL('config.js',larkRoot)),{createApp:createLark}=await import(new URL('server.js',larkRoot));
  const {createLarkDispatcher}=await import(new URL('lark-runtime.js',larkRoot));
  const config=readConfig({AUTH_MODE:'tunnel-service',BRIDGE_MODE:'tunnel',TUNNEL_SERVICE_OPERATION:'live',TUNNEL_SERVICE_OWNER_ID:OWNER,TUNNEL_SERVICE_KEY_FILE:keyFiles[2],LARK_EXPECTED_APP_ID:'cli_0123456789abcdef',LARK_CREDENTIALS_FILE:creds,LARK_TRANSPORT:'long-connection',STORAGE_KEY_FILE:keyFiles[3],DATABASE_PATH:path.join(stateDir,'bridge.sqlite'),BRIDGE_LOCK_DIRECTORY:stateDir,MCP_CALLBACK_ALLOWED_HOSTS:'callback.example.test',LARK_INTERACTION_POLICY_FILE:policy});
  const events=[],replies=[],updates=[];let bot='wrong-bot',botChecks=0,gatewayStarts=0;
  const ok=data=>({status:200,body:Buffer.from(JSON.stringify({code:0,data}))});
  const send=async(url,options)=>{
    options.beforeConnect?.();
    if(url.startsWith('https://callback.example.test/')){const body=JSON.parse(options.body);if(body.type==='verification')return {status:200,body:Buffer.from(JSON.stringify({challenge:body.challenge}))};events.push(body);return {status:202,body:Buffer.from('{}')};}
    if(url.endsWith('/tenant_access_token/internal'))return {status:200,body:Buffer.from(JSON.stringify({code:0,tenant_access_token:'synthetic-token',expire:7200}))};
    if(url.endsWith('/bot/v3/info')){botChecks++;return {status:200,body:Buffer.from(JSON.stringify({code:0,bot:{open_id:bot}}))};}
    if(url.includes('/resources/'))return {status:200,body:Buffer.from(PNG)};
    if(url.endsWith('/cardkit/v1/cards'))return ok({card_id:'card'});
    if(url.includes('/cardkit/v1/cards/')){updates.push(JSON.parse(options.body));return ok({});}
    if(url.endsWith('/reply')){replies.push(JSON.parse(options.body));return ok({message_id:'outbound',chat_id:'group'});}
    throw new Error('Unexpected synthetic provider route');
  };
  send.callbackTransportStatus=()=>({ready:true,mode:'direct',reason:'none',proxy_configured:false,destination_binding:'direct_pinned',network_checked:false});
  class Dispatcher{register(){return this;}async invoke(){}}
  class WS{async start(){gatewayStarts++;throw new Error('External gateway forbidden');}close(){}}
  const lark=createLark(config,{approvedLive:true,worker:false,send,sdk:{EventDispatcher:Dispatcher,WSClient:WS,LoggerLevel:{warn:1},Domain:{Feishu:'feishu'}}});beforeFixtureCleanup(t,()=>lark.close());const la=await lark.listen(0);
  const {createApp:createQq}=await import('../../../src/server.js'),{readConfig:readQq}=await import('../../../src/config.js');
  const qq=createQq({...readQq({AUTH_MODE:'tunnel-service',BRIDGE_MODE:'tunnel',TUNNEL_SERVICE_OWNER_ID:OWNER,TUNNEL_SERVICE_KEY_FILE:keyFiles[1],QQ_TRANSPORT:'disabled'}),dbPath:':memory:',storageKey:Buffer.alloc(32,65).toString('base64')},{worker:false,send:async()=>{throw new Error('QQ provider forbidden');}});beforeFixtureCleanup(t,()=>qq.close());const qa=await qq.listen(0);
  const app=createApp({host:'127.0.0.1',port:8789,owner:OWNER,ingressKeyFile:keyFiles[0],qqKeyFile:keyFiles[1],larkKeyFile:keyFiles[2],qqPort:qa.port,larkPort:la.port,operation:'live',liveChannels:['lark']},{approvedLive:true});beforeFixtureCleanup(t,()=>app.close());const a=await app.listen(0);
  const post=(method,params={})=>new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port:a.port,path:'/mcp',method:'POST',agent:false,headers:{[SERVICE_HEADER]:keys[0],'content-type':'application/json',accept:'application/json, text/event-stream','mcp-method':method,'mcp-protocol-version':VERSION,...(method==='tools/call'?{'mcp-name':params.name}:{})}},res=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks))}));});req.on('error',reject);req.end(JSON.stringify({jsonrpc:'2.0',id:1,method,params:{...params,_meta:metadata()}}));});
  const call=(name,args={})=>post('tools/call',{name,arguments:args});
  assert.equal((await post('tools/list')).body.result.tools.some(tool=>tool.name==='reply_to_qq'),false);
  assert.equal((await post('events/subscribe',{name:'lark.message.created',arguments:{conversation:'configured'},delivery:{mode:'webhook',url:'https://callback.example.test/source',secret:'whsec_'+Buffer.alloc(32,66).toString('base64')},ttlMs:60000})).status,200);
  const dispatcher=createLarkDispatcher(config,lark.bridge.store,Date.now,{verifyGroupIdentity:()=>lark.bridge.interactions.api.verifyBot(()=>{})});
  const now=Date.now(),payload={schema:'2.0',header:{event_id:'event',event_type:'im.message.receive_v1',create_time:String(now),app_id:config.larkAppId,tenant_key:'tenant'},event:{sender:{sender_type:'user',tenant_key:'tenant',sender_id:{open_id:'guest'}},message:{message_id:'message',chat_type:'group',chat_id:'group',message_type:'post',create_time:String(now),content:JSON.stringify({zh_cn:{title:'',content:[[{tag:'text',text:'长'.repeat(5000)},{tag:'img',image_key:'img-fixture'}]]}})}}};
  await assert.rejects(dispatcher.invoke(payload,{needCheck:false}));assert.equal(lark.bridge.store.get('SELECT count(*) AS n FROM messages').n,0);
  bot='bot';assert.equal((await dispatcher.invoke(payload,{needCheck:false})).outcome,'queued');await lark.bridge.tick();assert.equal(events.length,1);assert.equal(events[0].data.conversation,'group');
  assert.equal((await call('get_lark_message',{message_id:'message'})).body.result.structuredContent.text.length,5004);
  const attachment=await call('get_lark_attachment',{message_id:'message',attachment_index:0});assert.equal(attachment.status,200);assert.equal(attachment.body.result.content[1].type,'image');assert.equal(JSON.stringify(attachment.body).includes('img-fixture'),false);
  assert.equal((await call('get_lark_context',{message_id:'message'})).body.result.structuredContent.messages.length,1);
  await call('begin_lark_reply',{message_id:'message'});await call('append_lark_reply',{message_id:'message',sequence:1,text:'真实生成段落。'});await lark.bridge.tick();
  await call('reply_to_lark',{message_id:'message',text:'真实生成段落。'});await lark.bridge.tick();assert.equal(replies.length,1);assert.equal(updates.at(-1).sequence>0,true);assert.equal((await call('get_lark_message',{message_id:'message'})).body.result.structuredContent.reply.status,'sent');
  assert.equal(botChecks,2);assert.equal(gatewayStarts,0);assert.equal(await qq.bridge.tick(),false);
});
