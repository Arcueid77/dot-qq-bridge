import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { privateMkdtempSync, privateMkdirSync, fixtureChmodSync, fixtureSymlinkSync, cleanupPrivateFixture, beforeFixtureCleanup, assertPrivateFixture } from '@dot-bridge/core/platform/test-fixtures.js';
import { windowsPrivateDirectory, windowsPrivateMetadata, windowsPrivateDatabase, windowsReadPrivateFile, windowsWritePrivateFile } from '@dot-bridge/core/platform';
import { prepareCredentialDestination, readQqCredentials, saveQqCredentials } from '../src/credential-store.js';
import { acquireModeLock } from '../src/bridge-mode.js';
import { Store } from '../src/store.js';
import { config } from './helpers.js';

const native = { skip: process.platform !== 'win32' };
const candidate = { appId: 'fixture-app', appSecret: 'synthetic-secret', ownerOpenid: 'fixture-owner', ownerEvidence: 'official-qr-response' };
const scope = { expectedAppId: candidate.appId, profile: 'tencent-sdk' };
function fixture(t) {
  const directory = privateMkdtempSync(path.join(os.tmpdir(), 'windows-bridge-security-'));
  cleanupPrivateFixture(t, directory);
  return { directory, file: name => path.join(directory, name) };
}
test('Windows credential JSON has a verified owner/DACL and atomic exclusive publication', native, t => {
  const { directory, file } = fixture(t), target = file('credentials.json');
  assert.equal(prepareCredentialDestination(directory), target);
  saveQqCredentials(candidate, { ...scope, directory });
  const expected = { qqSecret: candidate.appSecret, ownerOpenid: candidate.ownerOpenid };
  assertPrivateFixture(assert, target, 0o600); assert.deepEqual(readQqCredentials(target, scope), expected);
  assert.throws(() => saveQqCredentials(candidate, { ...scope, directory })); assert.throws(() => prepareCredentialDestination(directory));
  assert.deepEqual(readQqCredentials(target, scope), expected);
});
test('Windows actual public ACL, insufficient owner access and unsafe parent ACL refuse reads and writes', native, t => {
  const { directory, file } = fixture(t), target = file('credentials.json'); saveQqCredentials(candidate, { ...scope, directory });
  for (const mode of [0o400, 0o640, 0o644, 0o1600]) { fixtureChmodSync(target, mode); assert.throws(() => readQqCredentials(target, scope)); }
  fixtureChmodSync(target, 0o600);
  for (const mode of [0o500, 0o750, 0o755, 0o1700]) {
    fixtureChmodSync(directory, mode);
    assert.throws(() => readQqCredentials(target, scope)); assert.throws(() => windowsWritePrivateFile(file('new.json'), Buffer.from('{}')));
    assert.throws(() => prepareCredentialDestination(directory));
    assert.equal(fs.existsSync(file('new.json')), false);
  }
  fixtureChmodSync(directory, 0o700); assert.equal(readQqCredentials(target, scope).ownerOpenid, candidate.ownerOpenid);
});
test('Windows final and ancestor junctions, dangling reparse points and hard links are refused', native, t => {
  const { directory, file } = fixture(t); saveQqCredentials(candidate, { ...scope, directory });
  fixtureSymlinkSync(file('credentials.json'), file('final-link')); fixtureSymlinkSync(file('missing'), file('dangling-link'));
  privateMkdirSync(file('child')); fixtureSymlinkSync(directory, file('child/ancestor-link'));
  for (const target of [file('final-link'), file('dangling-link'), file('child/ancestor-link/credentials.json')]) {
    assert.throws(() => readQqCredentials(target, scope));
    assert.throws(() => windowsWritePrivateFile(target, Buffer.from('{}')));
  }
  fs.linkSync(file('credentials.json'), file('hard-link')); assert.throws(() => readQqCredentials(file('credentials.json'), scope));
  fs.unlinkSync(file('hard-link')); assert.equal(readQqCredentials(file('credentials.json'), scope).ownerOpenid, candidate.ownerOpenid);
});
test('Windows invalid JSON, oversized credentials and mismatched app scope expose only fixed errors', native, t => {
  const { directory, file } = fixture(t);
  for (const [index, text] of ['synthetic-sensitive-looking-invalid-json', ' '.repeat(2049), '{}'].entries()) {
    const target = file(`bad-${index}.json`); windowsWritePrivateFile(target, Buffer.from(text));
    assert.throws(() => readQqCredentials(target, scope), error => error.message === 'QQ credential file is unavailable, unsafe, or outside approved scope');
  }
  saveQqCredentials(candidate, { ...scope, directory });
  assert.throws(() => readQqCredentials(file('credentials.json'), { ...scope, expectedAppId: 'different-app' }));
});
test('Windows pinned directory and SQLite handles prevent ancestor/database replacement while active', native, t => {
  assert.throws(() => new Store(config({ authMode: 'tunnel-service', tunnelServiceReadinessOnly: false, dbPath: ':memory:' })));
  const { directory, file } = fixture(t);
  const held = windowsPrivateDirectory(directory); beforeFixtureCleanup(t, () => held.close());
  assert.throws(() => fs.renameSync(directory, directory + '-replacement')); held.close(); held.close();
  const store = new Store(config({ dbPath: file('fixture.sqlite') })); beforeFixtureCleanup(t, () => store.close());
  assert.throws(() => fs.renameSync(file('fixture.sqlite'), file('replacement.sqlite')));
  assert.throws(() => fs.renameSync(directory, directory + '-replacement'));
  assertPrivateFixture(assert, file('fixture.sqlite'), 0o600);
  assertPrivateFixture(assert, file('fixture.sqlite-wal'), 0o600);
  assertPrivateFixture(assert, file('fixture.sqlite-shm'), 0o600);
});
test('Windows pre-existing SQLite sidecars reject public ACLs, hard links and reparse points before database creation', native, t => {
  const { file } = fixture(t), db = file('fixture.sqlite');
  for (const suffix of ['-wal', '-shm', '-journal']) {
    fs.writeFileSync(db + suffix, 'synthetic'); fixtureChmodSync(db + suffix, 0o644);
    assert.throws(() => windowsPrivateDatabase(db, { create: true })); assert.equal(fs.existsSync(db), false);
    fs.unlinkSync(db + suffix);
  }
  windowsWritePrivateFile(file('source'), Buffer.from('synthetic'));
  fs.linkSync(file('source'), db + '-wal'); assert.throws(() => windowsPrivateDatabase(db, { create: true }));
  fs.unlinkSync(db + '-wal'); fixtureSymlinkSync(file('source'), db + '-journal');
  assert.throws(() => windowsPrivateDatabase(db, { create: true })); assert.equal(fs.existsSync(db), false);
});
test('Windows mode lock rejects concurrent modes, replacement and changed link identity; rejected release can recover safely', native, t => {
  const { directory } = fixture(t), release = acquireModeLock(directory, 'qq', 'synthetic-app', 'tunnel');
  beforeFixtureCleanup(t, release);
  assert.throws(() => acquireModeLock(directory, 'qq', 'synthetic-app', 'sites'));
  const file = path.join(directory, fs.readdirSync(directory).find(name => name.endsWith('.lock')));
  assert.throws(() => fs.renameSync(file, file + '.replacement'));
  fs.linkSync(file, file + '.hardlink'); assert.throws(release);
  fs.unlinkSync(file + '.hardlink'); release(); release(); assert.equal(fs.existsSync(file), false);
});
test('Windows private traversal refuses device/UNC/ADS/reserved/trailing-dot paths and normalization changes', native, t => {
  const { file } = fixture(t);
  for (const target of ['\\\\localhost\\C$\\synthetic', '\\\\?\\C:\\synthetic', 'C:relative', file('NUL'), file('a:stream'), file('trailing.'), file('trailing '), file('..\\out')]) {
    assert.throws(() => windowsReadPrivateFile(target)); assert.throws(() => windowsWritePrivateFile(target, Buffer.from('synthetic')));
  }
});
