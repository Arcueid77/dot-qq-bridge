import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,qqPayload} from './helpers.js';
import {QqGateway} from '../src/gateway.js';

test('verified owner commands use the shared durable local outbox without a dot subscription',async t=>{
  const f=await harness();t.after(f.close);f.app.bridge.management.enabled=true;
  const payload=qqPayload(f.now(),{content:'/status'});assert.equal((await f.postQq(payload)).status,200);await f.app.bridge.tick();assert.equal(f.deliveries.length,0);assert.equal(f.sends.length,1);assert.match(f.sends[0].body.content,/subscription: none/);
  await f.postQq(payload);await f.app.bridge.tick();assert.equal(f.sends.length,1);
});
test('QQ gateway retains its subscription gate unless owner management connection is explicitly enabled',async t=>{
  const f=await harness({overrides:{qqTransport:'gateway'}});t.after(f.close);const gateway=new QqGateway(f.app.bridge,{connectSocket:async()=>{throw Error('network must not run');}});
  assert.equal(gateway.allowed(),false);f.app.bridge.config.ownerManagementConnection=true;assert.equal(gateway.allowed(),false);f.app.bridge.management.enabled=true;assert.equal(gateway.allowed(),true);
});
test('quoted references read only retained same-owner and same-generation messages',async t=>{
  const f=await harness();t.after(f.close);await f.subscribe();
  const first=qqPayload(f.now(),{id:'first',content:'retained private source'});first.id='event-first';await f.postQq(first);await f.app.bridge.tick();
  const second=qqPayload(f.now(),{id:'second',content:'follow up',message_reference:{message_id:'first'}});second.id='event-second';await f.postQq(second);await f.app.bridge.tick();
  const result=await f.postMcp('tools/call',{name:'get_qq_message',arguments:{message_id:'second'}});assert.equal(result.body.result.structuredContent.quote.text,'retained private source');
  f.app.bridge.store.run('UPDATE messages SET owner=? WHERE id=?','stranger','first');const hidden=await f.postMcp('tools/call',{name:'get_qq_message',arguments:{message_id:'second'}});assert.equal(hidden.body.result.structuredContent.quote,undefined);
});
