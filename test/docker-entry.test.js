import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('the Docker default command reaches service preflight and refuses missing configuration', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const dockerfile = fs.readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
  const command = JSON.parse(dockerfile.match(/^CMD (\[.*\])$/m)[1]);
  assert.equal(command[0], 'node');
  const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATH'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  const result = spawnSync(process.execPath, command.slice(1), { cwd: root, env, encoding: 'utf8', windowsHide: true, timeout: 10000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1, 'an unconfigured service must not exit successfully after printing a plan');
  const records = result.stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(records[0].event, 'service_preflight');
  assert.equal(records[0].ready_to_start, false);
  assert.ok(records[0].missing_settings.includes('DATABASE_PATH'));
  assert.ok(records.every(record => record.mode !== 'QQ_PERSISTENT_SERVICE_PLAN'));
});
