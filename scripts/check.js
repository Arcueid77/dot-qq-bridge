import { checkDocumentation } from './check-docs.js';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const roots = ['src', 'scripts', 'test'];
const files = roots.flatMap(root => fs.readdirSync(root, { recursive: true }).filter(file => file.endsWith('.js')).map(file => path.join(root, file)));
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) { process.stderr.write(result.stderr); process.exit(1); }
}
process.stdout.write(`Syntax checked ${files.length} JavaScript files.\n`);
for (const file of ['package.json', 'plugin/plugin.json', 'plugin/mcp.json']) JSON.parse(fs.readFileSync(file, 'utf8'));
process.stdout.write('Parsed package and plugin template JSON. Remote plugin installation remains unverified.\n');
checkDocumentation();
const release = JSON.parse(fs.readFileSync('vendor/core-release.json', 'utf8'));
const installed = JSON.parse(fs.readFileSync('node_modules/@dot-bridge/core/package.json', 'utf8'));
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const artifact = fs.readFileSync(`vendor/dot-bridge-core-${release.version}.tgz`);
if (release.package !== '@dot-bridge/core' || installed.version !== release.version || !/^[a-f0-9]{40}$/.test(release.source_revision) ||
    createHash('sha256').update(artifact).digest('hex') !== release.sha256 ||
    lock.packages['node_modules/@dot-bridge/core'].integrity !== 'sha512-' + createHash('sha512').update(artifact).digest('base64')) {
  throw new Error('Core distribution or lockfile integrity differs');
}
process.stdout.write('Verified installed core version, source revision and locked release artifact.\n');
