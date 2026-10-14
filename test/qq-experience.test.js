import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, qqPayload } from './helpers.js';
import { projectToolResult, qqAdapter } from '../src/tunnel-adapter.js';

const id = 'fixture-message-1';
const tool = (f, name, args = {}) => f.postMcp('tools/call', { name, arguments: { message_id: id, ...args } });
async function received(f) { await f.subscribe(); await f.postQq(); await f.app.bridge.tick(); }
async function drain(f, count = 12) { for (let i = 0; i < count; i++) { await f.app.bridge.tick(); f.advance(600); } }

test('native input indication is once, consumes its own durable sequence, and final reply is next', async t => {
  const f = await harness(); t.after(f.close); await received(f);
  assert.equal((await tool(f, 'begin_qq_reply')).body.result.structuredContent.status, 'pending');
  await tool(f, 'begin_qq_reply'); await f.app.bridge.tick(); await tool(f, 'begin_qq_reply');
  assert.equal(f.sends.length, 1);
  assert.deepEqual(f.sends[0].body, { msg_type: 6, input_notify: { input_type: 1, input_second: 60 }, msg_id: id, msg_seq: 1 });
  await f.reply(); await f.app.bridge.tick(); assert.equal(f.sends.length, 2);
  assert.equal(f.sends[1].body.msg_seq, 2); assert.equal(f.sends[1].body.content, '4');
  assert.equal((await tool(f, 'begin_qq_reply')).body.result.structuredContent.status, 'sent');
});

test('native stream uses one stable sequence and message ID, consecutive indexes, and a durable DONE frame', async t => {
  const f = await harness(); t.after(f.close); await received(f);
  await tool(f, 'begin_qq_reply'); await f.app.bridge.tick();
  await tool(f, 'append_qq_reply', { sequence: 1, text: '第一段' }); await f.app.bridge.tick();
  await tool(f, 'append_qq_reply', { sequence: 1, text: '第一段' });
  assert.equal((await tool(f, 'append_qq_reply', { sequence: 1, text: '另一个答案' })).status, 400);
  assert.equal((await tool(f, 'append_qq_reply', { sequence: 3, text: '第一段\n第三段' })).status, 400);
  assert.equal((await tool(f, 'append_qq_reply', { sequence: 2, text: '重写第一段' })).status, 400);
  await tool(f, 'append_qq_reply', { sequence: 2, text: '第一段\n第二段' });
  assert.equal((await f.reply(id, '重写')).status, 400);
  await f.reply(id, '第一段\n第二段\n完成'); await drain(f);
  const frames = f.sends.filter(s => s.url.endsWith('/stream_messages')).map(s => s.body);
  assert.equal(frames.length, 3); assert.deepEqual(frames.map(v => v.index), [0, 1, 2]);
  assert.deepEqual(frames.map(v => v.msg_seq), [2, 2, 2]); assert.deepEqual(frames.map(v => v.input_state), [1, 1, 10]);
  assert.equal(frames[0].stream_msg_id, undefined); assert.equal(frames[1].stream_msg_id, 'fixture-outbound-1');
  for (const frame of frames) { assert.equal(frame.event_id, id); assert.equal(frame.msg_id, id); assert.equal(frame.input_mode, 'replace'); }
  assert.equal(f.app.bridge.store.replyStatus(id).status, 'sent');
  await f.reply(id, '第一段\n第二段\n完成'); await drain(f); assert.equal(f.sends.length, 4);
});

test('long final answers use one native DONE message without unsafe splitting, and are encrypted', async t => {
  const f = await harness(); t.after(f.close); await received(f);
  const text = '长答案'.repeat(900);
  assert.equal((await f.reply(id, text)).status, 200); await f.app.bridge.tick();
  assert.equal(f.sends.length, 1); assert.equal(f.sends[0].body.input_state, 10); assert.equal(f.sends[0].body.content_raw, text);
  assert.notEqual(f.app.bridge.store.get('SELECT text FROM replies WHERE message_id=?', id).text, text);
  assert.equal((await f.reply(id, 'x'.repeat(30001))).status, 400);
});

test('Markdown replies remain in the passive original route and cannot change format on retry', async t => {
  const f = await harness(); t.after(f.close); await received(f);
  await tool(f, 'reply_to_qq', { text: '**完成**', format: 'markdown' }); await f.app.bridge.tick();
  assert.deepEqual(f.sends[0].body, { msg_type: 2, markdown: { content: '**完成**' }, msg_id: id, msg_seq: 1 });
  assert.equal((await f.reply(id, '**完成**')).status, 400);
  assert.equal((await tool(f, 'reply_to_qq', { text: '**完成**', format: 'markdown' })).body.result.structuredContent.status, 'sent');
});

test('an uncertain native frame is never resent or replaced by a second answer', async t => {
  const f = await harness({ sendOverride: async url => {
    if (url.endsWith('/stream_messages')) throw new Error('synthetic socket interrupted after writing');
  } }); t.after(f.close); await received(f);
  await tool(f, 'append_qq_reply', { sequence: 1, text: '已生成片段' }); await f.app.bridge.tick();
  assert.equal((await tool(f, 'get_qq_message')).body.result.structuredContent.reply.status, 'uncertain');
  assert.equal((await f.reply(id, '已生成片段\n完成')).status, 400);
  assert.equal((await tool(f, 'append_qq_reply', { sequence: 2, text: '已生成片段\n新片段' })).status, 400);
  await drain(f); assert.equal(f.requests.filter(v => v.url.endsWith('/stream_messages')).length, 1);
});

test('crashed stream leases stay uncertain, while known positive acknowledgements stay sent', async t => {
  const f = await harness(); t.after(f.close); await received(f);
  await tool(f, 'append_qq_reply', { sequence: 1, text: '片段' });
  const claimed = f.app.bridge.store.claim(f.now()); assert.equal(claimed.kind, 'stream');
  f.advance(61000); await f.app.bridge.tick();
  assert.equal(f.app.bridge.store.get('SELECT state FROM jobs WHERE id=?', claimed.id).state, 'uncertain');
  assert.equal((await f.reply(id, '片段完成')).status, 400); assert.equal(f.sends.length, 0);
});

test('expired, revoked and undelivered messages cannot trigger input status or context reads', async t => {
  const f = await harness(); t.after(f.close); await f.subscribe(); await f.postQq();
  for (const name of ['begin_qq_reply', 'get_qq_context']) assert.equal((await tool(f, name)).status, 400);
  await f.app.bridge.tick(); f.advance(240001);
  assert.equal((await tool(f, 'begin_qq_reply')).status, 400);
  // Historical context is still readable with a live subscription; it grants no send.
  assert.equal((await tool(f, 'get_qq_context')).status, 200);
  f.app.bridge.store.unsubscribe(f.app.bridge.store.activeSubscription(f.now()).id);
  assert.equal((await tool(f, 'get_qq_context')).status, 400); assert.equal(f.sends.length, 0);
});

test('context is chronological, bounded, and omits unacknowledged answers and changed generations', async t => {
  const f = await harness(); t.after(f.close); await received(f); await f.reply(); await f.app.bridge.tick(); f.advance(1000);
  const next = qqPayload(f.now(), { id: 'message-two', content: '刚才的答案再解释一下' }); next.id = 'event-two';
  await f.postQq(next); await f.app.bridge.tick();
  const response = await f.postMcp('tools/call', { name: 'get_qq_context', arguments: { message_id: 'message-two', limit: 2 } });
  const v = response.body.result.structuredContent; assert.deepEqual(v.messages.map(v => v.message_id), [id, 'message-two']);
  assert.equal(v.messages[0].reply_text, '4'); assert.equal(v.messages[1].reply_text, null);
  f.app.bridge.store.run('UPDATE messages SET generation=generation+1 WHERE id=?', id);
  const filtered = await f.postMcp('tools/call', { name: 'get_qq_context', arguments: { message_id: 'message-two' } });
  assert.deepEqual(filtered.body.result.structuredContent.messages.map(v => v.message_id), ['message-two']);
  assert.equal((await tool(f, 'get_qq_context', { limit: 21 })).status, 400);
});

test('delivery options and reply creation roll back together when the passive sequence budget is exhausted', async t => {
  const f = await harness(); t.after(f.close); await received(f);
  f.app.bridge.store.run('INSERT INTO qq_sequences VALUES (?,6)', id);
  assert.equal((await f.reply()).status, 400);
  assert.equal(f.app.bridge.store.get('SELECT count(*) AS n FROM replies').n, 0);
  assert.equal(f.app.bridge.store.get("SELECT count(*) AS n FROM jobs WHERE kind='reply'").n, 0);
});

test('adapter rejects recipient injection, overlarge context and mismatched stream IDs', () => {
  assert.throws(() => qqAdapter.validateToolArguments('begin_qq_reply', { message_id: id, recipient: 'other' }, true));
  assert.throws(() => qqAdapter.validateToolArguments('append_qq_reply', { message_id: id, text: '片段', sequence: 0 }, true));
  assert.throws(() => qqAdapter.validateToolArguments('get_qq_context', { message_id: id, limit: 21 }, true));
  const result = { isError: false, structuredContent: { message_id: 'wrong', messages: [], truncated: false } };
  assert.throws(() => projectToolResult({ name: 'get_qq_context', arguments: { message_id: id } }, result, true));
  assert.throws(() => qqAdapter.validateToolArguments('begin_qq_reply', { message_id: id }, false));
});
