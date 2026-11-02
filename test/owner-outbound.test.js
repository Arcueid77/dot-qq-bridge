import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createQqClient} from '../src/qq.js';
import {readConfig} from '../src/config.js';
import {qqAdapter} from '../src/tunnel-adapter.js';
import {toolResult} from '../src/common.js';
import {harness,config} from './helpers.js';
import {OutboundRejection} from '@dot-bridge/core/channels/outbound.js';
import {privateMkdtempSync,cleanupPrivateFixture,beforeFixtureCleanup} from '@dot-bridge/core/platform/test-fixtures.js';

const intent={conversation:'owner',text:'synthetic owner reminder',idempotency_key:'qq-owner-reminder'};
const ownerCall={text:intent.text,idempotencyKey:'a'.repeat(64),authorize:()=>{}};

test('QQ outbound defaults off and live standard Tunnel opt-in rejects other modes',async t=>{
  const f=await harness();t.after(f.close);
  assert.equal(f.config.outboundEnabled,false);
  const checked=await f.postMcp('tools/call',{name:'check_qq_outbound',arguments:{}});
  assert.equal(checked.body.result.structuredContent.supported,true);assert.equal(checked.body.result.structuredContent.enabled,false);
  const refused=await f.postMcp('tools/call',{name:'send_qq_message',arguments:intent});
  assert.equal(refused.body.error?.code,-32016);
  assert.equal(f.requests.length,0);
  for(const patch of [{AUTH_MODE:'dev'},{AUTH_MODE:'oauth'},{BRIDGE_MODE:'sites'},{TUNNEL_SERVICE_OPERATION:'readiness'},{CALLBACK_TRANSPORT_MODE:'owner-scoped-proxy'}]) {
    assert.throws(()=>readConfig({AUTH_MODE:'tunnel-service',BRIDGE_MODE:'tunnel',TUNNEL_SERVICE_OPERATION:'live',DOT_BRIDGE_OUTBOUND:'owner-text',...patch}));
  }
});

test('owner proactive text uses bound C2C HTTP without any source message, sequence or event subscription',async t=>{
  const f=await harness({overrides:{outboundEnabled:true}});t.after(f.close);
  f.app.bridge.gatewayConnected=()=>false;
  assert.equal(f.app.bridge.store.activeSubscription(f.now()),undefined);
  const checked=(await f.postMcp('tools/call',{name:'check_qq_outbound',arguments:{}})).body.result.structuredContent;
  assert.equal(checked.enabled,true);assert.equal(checked.gateway_connected,false);
  const queued=(await f.postMcp('tools/call',{name:'send_qq_message',arguments:intent})).body.result.structuredContent;
  assert.equal(queued.status,'pending');await f.app.bridge.tick();
  assert.equal(f.sends.length,1);assert.ok(f.sends[0].url.endsWith('/v2/users/fixture_qq_owner/messages'));
  assert.deepEqual(f.sends[0].body,{msg_type:0,content:intent.text});
  assert.equal(f.app.bridge.outbox.call('get_qq_outbound',{outbound_id:queued.outbound_id}).status,'sent');
  await f.postMcp('tools/call',{name:'send_qq_message',arguments:intent});await f.app.bridge.tick();assert.equal(f.sends.length,1);
  assert.equal(f.app.bridge.store.db.prepare('SELECT payload FROM dotbridge_outbound').get().payload.includes(intent.text),false);
  for(const extra of [{recipient:'other'},{conversation:'group'},{message_id:'old'},{url:'https://example.com'}]) {
    assert.throws(()=>qqAdapter.validateToolArguments('send_qq_message',{...intent,...extra},true));
  }
  assert.deepEqual(qqAdapter.projectToolResult({name:'send_qq_message',arguments:intent},toolResult(queued),true),queued);
});

test('saved QQ reminders survive a server restart and finish once without an inbound subscription',async t=>{
  const directory=privateMkdtempSync(path.join(os.tmpdir(),'qq-owner-outbound-'));if(process.platform!=='win32')fs.chmodSync(directory,0o700);
  cleanupPrivateFixture(t,directory);
  const dbPath=path.join(directory,'state.sqlite');
  const f=await harness({dbPath,overrides:{outboundEnabled:true}});
  let current=f;beforeFixtureCleanup(t,()=>current.close());
  const args={...intent,send_at:new Date(f.now()+60000).toISOString(),timezone:'UTC',repeat:'once',until:null};
  const saved=(await f.postMcp('tools/call',{name:'schedule_qq_message',arguments:args})).body.result.structuredContent;
  await f.app.bridge.tick();assert.equal(f.sends.length,0);await f.close();
  const reopened=await harness({dbPath,overrides:{outboundEnabled:true}});current=reopened;
  reopened.advance(60000);await reopened.app.bridge.tick();assert.equal(reopened.sends.length,1);
  const status=reopened.app.bridge.outbox.call('get_qq_outbound',{outbound_id:saved.outbound_id});
  assert.equal(status.status,'sent');await reopened.app.bridge.tick();assert.equal(reopened.sends.length,1);
});

test('QQ scheduled messages can be edited and cancelled without changing their original intent identity',async t=>{
  const f=await harness({overrides:{outboundEnabled:true}});t.after(f.close);
  const args={...intent,send_at:new Date(f.now()+60000).toISOString(),timezone:'UTC',repeat:'once',until:null};
  const saved=f.app.bridge.outbox.call('schedule_qq_message',args),{idempotency_key,...replacement}=args;
  const edited=f.app.bridge.outbox.call('update_qq_scheduled_message',{...replacement,text:'changed synthetic reminder',outbound_id:saved.outbound_id,expected_revision:1});
  assert.equal(edited.revision,2);
  const cancelled=f.app.bridge.outbox.call('cancel_qq_scheduled_message',{outbound_id:saved.outbound_id,expected_revision:2});
  assert.equal(cancelled.status,'cancelled');f.advance(60000);await f.app.bridge.tick();assert.equal(f.sends.length,0);
});

test('expanded QQ catalog and twenty maximum-size reminders fit their authenticated router budgets',async t=>{
  const f=await harness({overrides:{outboundEnabled:true}});t.after(f.close);
  const catalog=await f.postMcp('tools/list');
  assert.ok(Buffer.byteLength(JSON.stringify(catalog.body))<=qqAdapter.limits.response);
  for(let index=0;index<20;index++)f.app.bridge.outbox.call('send_qq_message',{...intent,text:'界'.repeat(2000),idempotency_key:`maximum-${index}`});
  const result=f.app.bridge.outbox.call('list_qq_scheduled_messages',{});
  assert.equal(result.messages.length,20);
  const call={name:'list_qq_scheduled_messages',arguments:{}};
  assert.deepEqual(qqAdapter.projectToolResult(call,toolResult(result),true),result);
  const wire=Buffer.from(JSON.stringify({jsonrpc:'2.0',id:'fixture',result:toolResult(result)}));
  assert.ok(wire.length>65536);assert.ok(wire.length<=qqAdapter.limits.responseTools.list_qq_scheduled_messages);
});

test('QQ permission and quota rejection pause work and expose fixed reasons without retry or private errors',async t=>{
  for(const [status,body,reason] of [[403,{message:'synthetic-private-provider-detail'},'provider_permission_denied'],
    [429,{},'provider_quota_exhausted'],[200,{code:40034102},'provider_permission_denied'],
    [200,{err_code:0,code:22009},'provider_quota_exhausted'],[400,{code:12345},'provider_rejected']]) {
    let attempts=0;
    const f=await harness({overrides:{outboundEnabled:true},sendOverride:async url=>{
      if(url.includes('/v2/users/')){attempts++;return {status,body:Buffer.from(JSON.stringify(body))};}
    }});
    try {
      const saved=f.app.bridge.outbox.call('send_qq_message',intent);await f.app.bridge.tick();await f.app.bridge.tick();
      const result=f.app.bridge.outbox.call('get_qq_outbound',{outbound_id:saved.outbound_id});
      assert.equal(result.status,'rejected');assert.equal(result.reason,reason);assert.equal(attempts,1);
      assert.ok(!JSON.stringify(result).includes('synthetic-private-provider-detail'));
    }finally{await f.close();}
  }
});

test('a lost or malformed QQ proactive ACK stays uncertain without another request',async t=>{
  for(const ack of [null,'null','{}','{"id":"synthetic-ack","code":0}','{"id":"well-formed-id","code":"invalid-code"}']) {
    let attempts=0;
    const f=await harness({overrides:{outboundEnabled:true},sendOverride:async url=>{
      if(url.includes('/v2/users/')){attempts++;if(ack===null)throw Error('synthetic socket reset');return {status:ack.includes('synthetic-ack')?500:200,body:Buffer.from(ack)};}
    }});
    try {
      const saved=f.app.bridge.outbox.call('send_qq_message',intent);await f.app.bridge.tick();await f.app.bridge.tick();
      assert.equal(f.app.bridge.outbox.call('get_qq_outbound',{outbound_id:saved.outbound_id}).status,'uncertain');assert.equal(attempts,1);
    }finally{await f.close();}
  }
});

test('QQ proactive authorization is rechecked after token acquisition and before the HTTP mutation',async()=>{
  let permitted=true,mutations=0;
  const client=createQqClient(config({outboundEnabled:true}),async(url,options)=>{
    if(url.endsWith('/getAppAccessToken')){permitted=false;return {status:200,body:Buffer.from('{"access_token":"synthetic","expires_in":7200}')};}
    mutations++;options.beforeConnect();return {status:200,body:Buffer.from('{"id":"synthetic"}')};
  });
  await assert.rejects(client.sendOwnerMessage({...ownerCall,authorize:()=>{if(!permitted)throw Error('revoked');}}));
  assert.equal(mutations,0);
  const disabled=createQqClient(config(),async()=>{throw Error('must not request a token');});
  await assert.rejects(disabled.sendOwnerMessage(ownerCall));
});

test('only explicit provider rejection has the terminal rejection type',async()=>{
  const client=createQqClient(config({outboundEnabled:true}),async url=>({status:url.endsWith('/getAppAccessToken')?200:403,
    body:Buffer.from(url.endsWith('/getAppAccessToken')?'{"access_token":"synthetic","expires_in":7200}':'{}')}));
  await assert.rejects(client.sendOwnerMessage(ownerCall),error=>error instanceof OutboundRejection&&error.reason==='provider_permission_denied');
});
