import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
test('legacy router contains package consumers, not independent shared implementations',()=>{
 for(const name of ['auth','common','protocol','transport-headers']){const text=fs.readFileSync(new URL('../src/'+name+'.js',import.meta.url),'utf8');assert.match(text,/^export \* from '@dot-bridge\/core\/router\//);}
});
