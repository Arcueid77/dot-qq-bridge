import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,qqPayload} from './helpers.js';
import {interactionPolicy} from '@dot-bridge/core/channels/experience-policy.js';

test('QQ long work saves a full result after passive expiry without sending it again', async t => {
  const f = await harness();
  t.after(f.close);
  await f.subscribe();
  await f.postQq();
  await f.app.bridge.tick();
  const call = (name, args) => f.postMcp('tools/call', {name, arguments: args});
  const started = await call('begin_qq_task', {message_id: 'fixture-message-1'});
  assert.equal(started.status, 200);
  const taskId = started.body.result.structuredContent.task_id;
  f.advance(f.config.replyTtlMs + 1000);
  const text = '完整结果'.repeat(5000);
  const args = {task_id: taskId, text, idempotency_key: 'one-retained-result'};
  const saved = await call('save_qq_task_result', args);
  assert.equal(saved.status, 200);
  assert.equal(saved.body.result.structuredContent.remaining_seconds, 0);
  assert.equal((await call('save_qq_task_result', args)).status, 200);
  assert.notEqual((await call('save_qq_task_result', {...args, text: 'different'})).status, 200);
  const result = await call('get_qq_task_result', {task_id: taskId});
  assert.equal(result.body.result.structuredContent.text, text);
  await f.app.bridge.tick();
  assert.equal(f.sends.length, 0);
});

test('QQ configured batches retain every source and one shared final outcome',async t=>{
  const f=await harness({overrides:{interaction:interactionPolicy({queue:{mode:'batch',window_ms:100}})}});
  t.after(f.close);await f.subscribe();
  await f.postQq();
  const second=qqPayload(f.now(),{id:'fixture-message-2',content:'second question'});second.id='fixture-event-2';
  await f.postQq(second);
  await f.app.bridge.tick();assert.equal(f.deliveries.length,0);
  f.advance(101);await f.app.bridge.tick();assert.equal(f.deliveries.length,1);
  const read=await f.postMcp('tools/call',{name:'get_qq_message',arguments:{message_id:'fixture-message-2'}});
  assert.deepEqual(read.body.result.structuredContent.source_message_ids,['fixture-message-1','fixture-message-2']);
  assert.match(read.body.result.structuredContent.text,/second question/u);
  assert.notEqual((await f.reply('fixture-message-1','duplicate')).status,200);
  assert.equal((await f.reply('fixture-message-2','combined answer')).status,200);
  await f.app.bridge.tick();assert.equal(f.sends.length,1);
  assert.equal(f.app.bridge.experience.replyStatus('fixture-message-1').status,'sent');
});


test('qq speech tools queue one persisted reply and retain the generated text',async t=>{
  const f=await harness();t.after(f.close);await f.subscribe();await f.postQq();await f.app.bridge.tick();
  const {pcm16Wave}=await import('@dot-bridge/core/audio/wav.js');
  let conversions=0;
  f.app.bridge.speech.synthesizer={status:()=>({configured:true,runtime_ready:true,busy:false,last_failure:null}),generate:async()=>{conversions++;return {data:pcm16Wave(Buffer.alloc(32000)),mimeType:'audio/wav',name:'voice.wav'};}};
  const args={message_id:'fixture-message-1',text:'Generated answer',idempotency_key:'one-speech'};
  const call=()=>f.postMcp('tools/call',{name:'reply_qq_speech',arguments:args});
  assert.equal((await call()).body.result.structuredContent.status,'pending');
  assert.equal((await call()).body.result.structuredContent.status,'pending');assert.equal(conversions,1);
  const task=f.app.bridge.tasks.begin('fixture-message-1');assert.equal(task.result_available,true);
  assert.equal(f.app.bridge.tasks.get(task.task_id).text,'Generated answer');
});
