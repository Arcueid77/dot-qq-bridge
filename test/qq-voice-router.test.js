import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { privateMkdtempSync, cleanupPrivateFixture, beforeFixtureCleanup } from '@dot-bridge/core/platform/test-fixtures.js';
import { createApp as createRouter, readConfig as routerConfig } from '@dot-bridge/core/router';
import { OWNER, SERVICE_HEADER, VERSION, metadata } from '@dot-bridge/core/router/common.js';
import { preflightCallbackTransport } from '@dot-bridge/core/transport';
import { readConfig } from '../src/config.js';
import { createApp } from '../src/server.js';
import { saveQqCredentials } from '../src/credential-store.js';
import { qqAdapter } from '../src/tunnel-adapter.js';

test('actual standalone QQ backend and core router preserve large audio reads and media replies without sibling source', async t => {
  const dir=privateMkdtempSync(path.join(os.tmpdir(),'qq-voice-router-'));cleanupPrivateFixture(t,dir);
  const key=(name,n)=>{const file=path.join(dir,name);fs.writeFileSync(file,Buffer.alloc(32,n).toString('base64url'),{mode:0o600});return file;};
  const backendKey=key('backend',61),ingressKey=key('ingress',62),storageKey=key('storage',63);
  saveQqCredentials({appId:'fixture-app',appSecret:'synthetic-voice-secret',ownerOpenid:'fixture-owner',ownerEvidence:'official-qr-response'},
    {directory:path.join(dir,'credentials'),expectedAppId:'fixture-app',profile:'tencent-sdk'});
  const config=readConfig({AUTH_MODE:'tunnel-service',BRIDGE_MODE:'tunnel',TUNNEL_SERVICE_OPERATION:'live',TUNNEL_SERVICE_OWNER_ID:OWNER,
    TUNNEL_SERVICE_KEY_FILE:backendKey,STORAGE_KEY_FILE:storageKey,QQ_APP_ID:'fixture-app',QQ_API_PROFILE:'tencent-sdk',QQ_TRANSPORT:'gateway',
    QQ_CREDENTIALS_FILE:path.join(dir,'credentials','credentials.json'),DATABASE_PATH:path.join(dir,'bridge.sqlite'),BRIDGE_LOCK_DIRECTORY:dir,
    MCP_CALLBACK_ALLOWED_HOSTS:'callback.example.test'});
  // A real PCM WAV over the former 32 KiB router response budget.
  const audio=Buffer.alloc(96044);audio.write('RIFF',0);audio.writeUInt32LE(audio.length-8,4);audio.write('WAVEfmt ',8);
  audio.writeUInt32LE(16,16);audio.writeUInt16LE(1,20);audio.writeUInt16LE(1,22);audio.writeUInt32LE(24000,24);
  audio.writeUInt32LE(48000,28);audio.writeUInt16LE(2,32);audio.writeUInt16LE(16,34);audio.write('data',36);audio.writeUInt32LE(96000,40);
  const delivered=[],uploaded=[],replies=[],mediaUrl='https://multimedia.nt.qq.com/fixture.wav';
  const send=async(url,options)=>{
    options.beforeConnect?.();
    if(url===mediaUrl){assert.equal(options.headers.Authorization,undefined);return{status:200,body:Buffer.from(audio)};}
    if(url==='https://bots.qq.com/app/getAppAccessToken')return{status:200,body:Buffer.from('{"access_token":"synthetic-token","expires_in":7200}')};
    if(url==='https://api.sgroup.qq.com/v2/users/fixture-owner/files'){uploaded.push(JSON.parse(options.body));return{status:200,body:Buffer.from('{"file_info":"synthetic-file-info","ttl":3600}')};}
    if(url==='https://api.sgroup.qq.com/v2/users/fixture-owner/messages'){replies.push(JSON.parse(options.body));return{status:200,body:Buffer.from('{"id":"synthetic-outbound"}')};}
    assert.equal(new URL(url).hostname,'callback.example.test');
    const body=JSON.parse(options.body);if(body.type==='verification')return{status:200,body:Buffer.from(JSON.stringify({challenge:body.challenge}))};
    delivered.push(body);return{status:202,body:Buffer.from('{}')};
  };
  send.callbackPreflight=()=>preflightCallbackTransport({proxyEnv:{}});
  const backend=createApp(config,{approvedLive:true,worker:false,send});beforeFixtureCleanup(t,()=>backend.close());await backend.listen(0);
  const router=createRouter(routerConfig({AUTH_MODE:'tunnel-service',BRIDGE_MODE:'tunnel',TUNNEL_SERVICE_OPERATION:'live',TUNNEL_LIVE_CHANNELS:'qq',
    TUNNEL_SERVICE_OWNER_ID:OWNER,TUNNEL_SERVICE_KEY_FILE:ingressKey,QQ_SERVICE_KEY_FILE:backendKey,QQ_MCP_PORT:String(backend.server.address().port)},[qqAdapter]),{approvedLive:true});
  beforeFixtureCleanup(t,()=>router.close());const address=await router.listen(0);
  const post=(method,params={})=>new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port:address.port,path:'/mcp',method:'POST',agent:false,headers:{
      [SERVICE_HEADER]:Buffer.alloc(32,62).toString('base64url'),'content-type':'application/json',accept:'application/json, text/event-stream',
      'mcp-method':method,'mcp-protocol-version':VERSION,...(method==='tools/call'?{'mcp-name':params.name}:{})}},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks))}));
    });req.on('error',reject);req.end(JSON.stringify({jsonrpc:'2.0',id:1,method,params:{...params,_meta:metadata()}}));
  });
  const call=(name,args)=>post('tools/call',{name,arguments:args});
  const catalog=await post('tools/list');assert.equal(catalog.status,200);assert.ok(catalog.body.result.tools.some(tool=>tool.name==='get_qq_attachment'));
  assert.ok(catalog.body.result.tools.every(tool=>!tool.name.includes('lark')));
  assert.equal((await post('events/subscribe',{name:'qq.message.created',arguments:{conversation:'owner'},delivery:{mode:'webhook',url:'https://callback.example.test/voice',secret:'whsec_'+Buffer.alloc(32,64).toString('base64')}})).status,200);
  const event={op:0,t:'C2C_MESSAGE_CREATE',id:'voice-event',d:{id:'voice',author:{user_openid:'fixture-owner'},timestamp:new Date().toISOString(),content:'',attachments:[{content_type:'voice',voice_wav_url:mediaUrl,url:mediaUrl}]}};
  assert.equal(backend.bridge.acceptQq(event,'voice-replay'),'queued');await backend.bridge.tick();assert.equal(delivered.length,1);assert.equal(delivered[0].data.attachments,1);
  const read=await call('get_qq_message',{message_id:'voice'});assert.equal(read.status,200);assert.equal(read.body.result.structuredContent.attachments[0].type,'audio');
  const output=await call('get_qq_attachment',{message_id:'voice',attachment_index:0});assert.equal(output.status,200);
  assert.equal(output.body.result.content[1].type,'audio');assert.deepEqual(Buffer.from(output.body.result.content[1].data,'base64'),audio);
  assert.ok(!JSON.stringify(output).includes(mediaUrl));assert.ok(!JSON.stringify(output).includes('fixture-owner'));
  assert.equal((await call('get_qq_attachment',{message_id:'voice',attachment_index:0,url:mediaUrl})).status,400);
  const file=Buffer.alloc(350000,65),args={message_id:'voice',type:'file',name:'reply.bin',mime_type:'application/octet-stream',data:file.toString('base64')};
  assert.equal((await call('reply_qq_media',args)).body.result.structuredContent.status,'pending');await backend.bridge.tick();
  assert.equal(uploaded.length,1);assert.equal(uploaded[0].srv_send_msg,false);assert.deepEqual(Buffer.from(uploaded[0].file_data,'base64'),file);
  assert.deepEqual(replies,[{msg_type:7,media:{file_info:'synthetic-file-info'},msg_id:'voice',msg_seq:1}]);
  assert.equal((await call('reply_qq_media',args)).body.result.structuredContent.status,'sent');await backend.bridge.tick();assert.equal(replies.length,1);
  assert.equal((await post('events/unsubscribe',{name:'qq.message.created',arguments:{conversation:'owner'},delivery:{mode:'webhook',url:'https://callback.example.test/voice'}})).status,200);
  assert.equal((await call('get_qq_attachment',{message_id:'voice',attachment_index:0})).body.error.code,-32012);
});
