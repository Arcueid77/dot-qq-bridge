import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createQrDirectAgent, installQrTransport, scanOfficialBot, scanOfficialBotForEnrollment } from '../src/official-qr.js';
import { waitForExistingAppConfirmation } from '../src/enrollment-confirmation.js';
import { superviseQrChild } from '../src/qr-child-boundary.js';

const credential = { appId: 'synthetic-selected-app', appSecret: 'synthetic-private-secret', userOpenid: 'synthetic-owner' };
const sdk = value => callbacks => { queueMicrotask(() => callbacks.onSuccess(value)); return () => {}; };
const options = { approved: true, scannerIsOwner: true, confirmExistingAppAfterScan: true, displayQr() {} };

test('unknown-AppID enrollment has an explicit separate gate and does not weaken pinned scan', async () => {
  for (const change of [{ approved: false }, { scannerIsOwner: false }, { confirmExistingAppAfterScan: false }]) {
    await assert.rejects(scanOfficialBotForEnrollment(() => assert.fail('SDK must not start'), { ...options, ...change }));
  }
  await assert.rejects(scanOfficialBot(sdk([credential]), { ...options, expectedAppId: '' }));
  await assert.rejects(scanOfficialBot(sdk([credential]), { ...options, expectedAppId: 'other-app' }));
  const candidate = await scanOfficialBotForEnrollment(sdk([credential]), options);
  assert.equal(candidate.appId, credential.appId); assert.equal(candidate.ownerEvidence, 'official-qr-response');
});

test('discovery rejects missing owner, multiple apps and invalid identities or secrets', async () => {
  for (const value of [[], [credential, credential], [{ ...credential, appId: '../../other' }],
    [{ ...credential, userOpenid: undefined }], [{ ...credential, userOpenid: 'owner\nother' }],
    [{ ...credential, appSecret: 'bad\nsecret' }]]) {
    await assert.rejects(scanOfficialBotForEnrollment(sdk(value), options));
  }
});

test('application confirmation ignores early and extra-field commands and releases its listener', async () => {
  const channel = new EventEmitter(); channel.emit('message', { action: 'confirm-existing-app' });
  let resolved = false;
  const pending = waitForExistingAppConfirmation(channel, { deadlineEpochMs: Date.now() + 1000 }).then(() => { resolved = true; });
  channel.emit('message', { action: 'confirm-existing-app', arbitrary: true });
  channel.emit('message', { action: 'other' }); await Promise.resolve(); assert.equal(resolved, false);
  channel.emit('message', { action: 'confirm-existing-app' }); await pending;
  assert.equal(resolved, true); assert.equal(channel.listenerCount('message'), 0);
});

test('post-scan confirmation aborts and rejects a resumed late approval', async () => {
  const channel = new EventEmitter(), controller = new AbortController();
  const cancelled = waitForExistingAppConfirmation(channel, { signal: controller.signal, deadlineEpochMs: Date.now() + 1000 });
  controller.abort(); await assert.rejects(cancelled); assert.equal(channel.listenerCount('message'), 0);
  let now = 100;
  const late = waitForExistingAppConfirmation(channel, { deadlineEpochMs: 1000, clock: () => now });
  now = 1001; channel.emit('message', { action: 'confirm-existing-app' }); await assert.rejects(late);
});

test('only explicit enrollment supervisor forwards sanitized selection stage', () => {
  for (const approved of [false, true]) {
    const child = new EventEmitter(); child.kill = () => {}; const values = []; let pending = 0;
    superviseQrChild(child, { output: value => values.push(value), allowSelectionConfirmation: approved, selectionPending: () => pending++ });
    child.emit('message', { type: 'selection', state: 'awaiting_existing_app_confirmation', owner_identity_verified: true,
      appId: credential.appId, appSecret: credential.appSecret });
    assert.equal(pending, approved ? 1 : 0);
    assert.equal(JSON.stringify(values).includes(credential.appId), false); assert.equal(JSON.stringify(values).includes(credential.appSecret), false);
    child.emit('exit', 0);
  }
});

test('explicit direct QR mode preserves any configured proxy instead of falling back', () => {
  const target = { globalAgent: {} }, fake = { addRequest() {}, destroy() {} }; let calls = 0;
  const restore = installQrTransport({ target, env: {}, factory: () => null, allowDirect: true, directFactory: () => { calls++; return fake; } });
  assert.equal(calls, 1); restore();
  assert.throws(() => installQrTransport({ target, env: { HTTPS_PROXY: 'http://approved-proxy.invalid' }, factory: () => null,
    allowDirect: true, directFactory: () => assert.fail('proxy cannot be bypassed') }));
});

test('direct QR agent validates every destination and every DNS answer before connection', async () => {
  let requested = 0;
  const agent = createQrDirectAgent({ lookup: async () => { requested++; return [{ address: '127.0.0.1', family: 4 }]; } });
  try {
    for (const options of [{ host: 'evil.invalid' }, { host: 'q.qq.com', port: 80 },
      { host: 'q.qq.com', rejectUnauthorized: false }, { host: 'q.qq.com', servername: 'other.invalid' }]) {
      assert.throws(() => agent.addRequest(new EventEmitter(), options));
    }
    const error = await new Promise(resolve => agent.options.lookup('q.qq.com', {}, resolve));
    assert.ok(error instanceof Error); assert.equal(requested, 1);
    const wrongHost = await new Promise(resolve => agent.options.lookup('evil.invalid', {}, resolve));
    assert.ok(wrongHost instanceof Error); assert.equal(requested, 1);
  } finally { agent.destroy(); }
});
