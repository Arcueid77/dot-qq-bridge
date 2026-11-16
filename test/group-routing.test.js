import test from 'node:test';
import assert from 'node:assert/strict';
import {harness, qqPayload, subscriptionParams} from './helpers.js';
import {incomingMessage} from '../src/qq.js';
import {qqRoutingChannel, qqRoute} from '../src/qq-routing.js';
import {interactionPolicy} from '@dot-bridge/core/channels/experience-policy.js';

test('QQ group mentions use configured membership, preserve the provider ID and isolate private context', async t => {
  const interaction = interactionPolicy({groups: [{conversation_id: 'fixture-group', members: 'all'}]}, qqRoutingChannel);
  const groupSends = [];
  const f = await harness({overrides: {interaction}, sendOverride: async (url, options) => {
    if (!url.includes('/v2/groups/')) return;
    groupSends.push({url, body: JSON.parse(options.body)});
    return {status: 200, body: Buffer.from(JSON.stringify({id: 'group-reply'}))};
  }});
  t.after(f.close);
  assert.equal((await f.subscribe(subscriptionParams({arguments: {conversation: 'configured'}}))).status, 200);
  const payload = qqPayload(f.now(), {author: {member_openid: f.config.ownerOpenid}, group_openid: 'fixture-group', content: 'group content'});
  payload.t = 'GROUP_AT_MESSAGE_CREATE';
  payload.id = 'group-event';
  const message = incomingMessage(payload, f.config, f.now());
  assert.notEqual(message.id, payload.d.id);
  assert.equal(message.providerMessageId, payload.d.id);
  f.app.bridge.acceptQq(payload, 'fixture-group-replay');
  await f.postQq(qqPayload(f.now(), {content: 'private content'}));
  await f.app.bridge.tick();
  await f.app.bridge.tick();
  assert.equal(f.deliveries.length, 2);
  assert.deepEqual(new Set(f.deliveries.map(value => value.data.conversation)), new Set(['owner', 'configured']));
  const context = await f.postMcp('tools/call', {name: 'get_qq_context', arguments: {message_id: message.id}});
  assert.equal(context.status, 200);
  assert.ok(context.body.result.structuredContent.messages.every(value => value.text === 'group content'));
  assert.equal((await f.reply(message.id, 'group answer')).status, 200);
  await f.app.bridge.tick();
  assert.equal(groupSends.length, 1);
  assert.match(groupSends[0].url, /\/v2\/groups\/fixture-group\/messages$/);
  assert.equal(groupSends[0].body.msg_id, payload.d.id);
  const stored = f.app.bridge.store.message(message.id);
  assert.equal(stored.groupOpenid, 'fixture-group');
  assert.equal(qqRoute(f.config, stored).scope, 'configured');
});

test('QQ group admission remains disabled by default and owner-only subscriptions cannot consume groups', async t => {
  const f = await harness();
  t.after(f.close);
  const payload = qqPayload(f.now(), {author: {member_openid: 'member'}, group_openid: 'fixture-group'});
  payload.t = 'GROUP_AT_MESSAGE_CREATE';
  assert.equal(incomingMessage(payload, f.config, f.now()), null);
  f.config.interaction = interactionPolicy({groups: [{conversation_id: 'fixture-group', members: 'allowlist', allow_from: ['member']}]}, qqRoutingChannel);
  await f.subscribe();
  assert.throws(() => f.app.bridge.acceptQq(payload, 'owner-scope-group'));
  assert.equal(f.app.bridge.store.get('SELECT count(*) AS n FROM messages').n, 0);
});
