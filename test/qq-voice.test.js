import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { encode } from 'silk-wasm';
import { privateMkdtempSync } from '@dot-bridge/core/platform/test-fixtures.js';
import { RICH_TOOL_RESULT } from '@dot-bridge/core/router/common.js';
import { harness, qqPayload, config } from './helpers.js';
import { incomingMessage } from '../src/qq.js';
import { Store } from '../src/store.js';
import { BridgeError } from '../src/common.js';
import { incomingVoice, voiceUrl, decodeVoice, createVoiceReader, QQ_AUDIO_BYTES } from '../src/qq-audio.js';
import { qqAdapter, projectToolResult } from '../src/tunnel-adapter.js';
import { makePublicRequester } from '../src/network.js';

const CDN = 'multimedia.nt.qq.com', voice = `https://${CDN}/fixture.silk?token=synthetic-secret`, wavUrl = `https://${CDN}/fixture.wav`;
const id = 'fixture-message-1';
function wav(samples = 2400) {
  const b = Buffer.alloc(44 + samples * 2);
  b.write('RIFF',0); b.writeUInt32LE(b.length-8,4); b.write('WAVEfmt ',8); b.writeUInt32LE(16,16);
  b.writeUInt16LE(1,20); b.writeUInt16LE(1,22); b.writeUInt32LE(24000,24); b.writeUInt32LE(48000,28);
  b.writeUInt16LE(2,32); b.writeUInt16LE(16,34); b.write('data',36); b.writeUInt32LE(samples*2,40);
  for(let i=0;i<samples;i++)b.writeInt16LE(Math.round(Math.sin(i/10)*4000),44+i*2);
  return b;
}
const audio = wav();
const attachment = (extra = {}) => ({ content_type:'voice', url:voice, voice_wav_url:wavUrl, asr_refer_text:'这是一条合成语音', ...extra });
const payload = (f, extra = {}) => qqPayload(f.now(), { content:'', attachments:[attachment()], ...extra });
const tool = (f, name, args = {}) => f.postMcp('tools/call', {name, arguments:{message_id:id,...args}});
const listen = f => tool(f,'get_qq_attachment',{attachment_index:0});

test('owner voice events admit QQ voice, audio MIME and SILK extension while foreign/rich inputs remain rejected', () => {
  const now=Date.now(), settings=config();
  for(const att of [attachment(),attachment({content_type:'audio/silk'}),attachment({content_type:'application/octet-stream',filename:'voice.slac'})]) {
    const message=incomingMessage(qqPayload(now,{content:'',attachments:[att]}),settings,now);
    assert.equal(message.text,'[语音]'); assert.equal(message.attachments[0].transcript,'这是一条合成语音');
  }
  for(const extra of [{author:{user_openid:'other'}},{author:{user_openid:settings.ownerOpenid,bot:true}},
    {group_openid:'group'},{guild_id:'guild'},{message_reference:{message_id:'other'}},{message_type:103},{msg_elements:[{}]}]) {
    try { assert.equal(incomingMessage(qqPayload(now,{content:'',attachments:[attachment()],...extra}),settings,now),null); }
    catch(error) { assert.equal(error.status,403); }
  }
  for(const items of [[{}],[{content_type:'image/png',url:voice}],[attachment(),attachment()],{},null]) assert.equal(incomingVoice(items),null);
  assert.deepEqual(incomingVoice([]),[]);
});

test('voice URLs stay on exact approved HTTPS hosts and bad links retain only safe transcription', () => {
  assert.equal(voiceUrl(`//${CDN}/voice`),`https://${CDN}/voice`);
  for(const url of [`http://${CDN}/x`,`https://${CDN}.evil.example/x`,`https://127.0.0.1/x`,
    `https://user:secret@${CDN}/x`,`https://${CDN}:8443/x`,`https://${CDN}/x#secret`,`https://${CDN}./x`,'file:///etc/passwd']) {
    assert.throws(()=>voiceUrl(url));
    const result=incomingVoice([attachment({url,voice_wav_url:''})]);
    assert.deepEqual(result[0].urls,[]); assert.equal(result[0].transcript,'这是一条合成语音');
  }
  for(const text of ['x'.repeat(2001),'bad\u0000text','\ud800']) assert.equal(incomingVoice([attachment({asr_refer_text:text})])[0].transcript,null);
});

test('real SILK codec decodes synthetic voice (including QQ AMR wrapper) to playable WAV without network or ffmpeg', async () => {
  const encoded=await encode(audio,0);
  for(const bytes of [Buffer.from(encoded.data),Buffer.concat([Buffer.from('#!AMR\n'),encoded.data])]) {
    const result=await decodeVoice(bytes);
    assert.equal(result.mime,'audio/wav'); assert.equal(result.bytes.toString('ascii',8,12),'WAVE');
    assert.equal(result.bytes.readUInt32LE(24),24000); assert.ok(result.bytes.length>44);
    assert.equal(result.bytes.readUInt32LE(40),result.bytes.length-44);
  }
  assert.deepEqual((await decodeVoice(audio)).bytes,audio);
  for(const bytes of [Buffer.alloc(0),Buffer.alloc(QQ_AUDIO_BYTES+1),Buffer.from('not audio'),Buffer.from('#!AMR\ninvalid')]) await assert.rejects(decodeVoice(bytes));
});

test('voice persists encrypted, emits one event, exposes bounded native audio, and replies once to the same owner', async t => {
  const f=await harness({sendOverride:async(url,options)=>{
    if(url===wavUrl){assert.equal(options.method,'GET');assert.equal(options.headers.Authorization,undefined);return{status:200,headers:{},body:Buffer.from(audio)};}
  }});t.after(f.close);
  await f.subscribe(); assert.equal(f.app.bridge.acceptQq(payload(f),'voice-fixture-1'),'queued');
  assert.equal(f.app.bridge.acceptQq(payload(f),'voice-fixture-2'),'duplicate');
  assert.equal((await listen(f)).body.error.code,-32012);
  await f.app.bridge.tick(); assert.equal(f.deliveries.length,1); assert.equal(f.deliveries[0].data.attachments,1);
  assert.ok(!JSON.stringify(f.deliveries).includes('synthetic-secret'));
  const sealed=f.app.bridge.store.get('SELECT attachments FROM messages WHERE id=?',id).attachments;
  assert.ok(!sealed.includes(CDN)); assert.ok(!sealed.includes('合成语音'));
  const read=(await tool(f,'get_qq_message')).body.result;
  assert.deepEqual(read.structuredContent.attachments,[{index:0,type:'audio',transcript:'这是一条合成语音',audio_available:true}]);
  assert.ok(!JSON.stringify(read).includes(CDN));
  assert.match((await tool(f,'get_qq_context')).body.result.structuredContent.messages[0].text,/这是一条合成语音/);
  const response=await listen(f);assert.equal(response.status,200);
  const result=response.body.result;assert.deepEqual(Buffer.from(result.content[1].data,'base64'),audio);
  const projected=projectToolResult({name:'get_qq_attachment',arguments:{message_id:id,attachment_index:0}},result,true);
  assert.equal(projected[RICH_TOOL_RESULT],true);assert.equal(projected.content[1].type,'audio');
  assert.equal((await f.reply(id,'已听到你的语音')).status,200);await f.app.bridge.tick();await f.reply(id,'已听到你的语音');await f.app.bridge.tick();
  assert.equal(f.sends.length,1);assert.ok(f.sends[0].url.includes(encodeURIComponent(f.config.ownerOpenid)));assert.equal(f.sends[0].body.msg_id,id);
});

test('WAV unavailability falls back to SILK; bad audio returns a safe error while the message remains answerable', async t => {
  const encoded=await encode(audio,0);let usable=true;const urls=[];
  const f=await harness({sendOverride:async url=>{
    if([wavUrl,voice].includes(url)){urls.push(url);return{status:url===wavUrl?404:200,headers:{},body:url===voice&&usable?Buffer.from(encoded.data):Buffer.from('unavailable')};}
  }});t.after(f.close);await f.subscribe();await f.postQq(payload(f));await f.app.bridge.tick();
  assert.equal((await listen(f)).body.result.content[1].mimeType,'audio/wav');assert.deepEqual(urls,[wavUrl,voice]);
  usable=false;const failed=await listen(f);assert.equal(failed.status,400);assert.ok(!JSON.stringify(failed).includes('synthetic-secret'));
  assert.equal((await tool(f,'get_qq_message')).body.result.structuredContent.attachments[0].transcript,'这是一条合成语音');
  await f.reply(id,'请再发一次或发文字');await f.app.bridge.tick();assert.equal(f.sends.length,1);
});

test('subscription revocation during download and expired reply windows block voice bytes', async t => {
  let f;f=await harness({sendOverride:async url=>{if(url===wavUrl){f.app.bridge.store.unsubscribe(f.app.bridge.store.activeSubscription(f.now()).id);return{status:200,body:Buffer.from(audio)};}}});t.after(f.close);
  await f.subscribe();await f.postQq(payload(f));await f.app.bridge.tick();
  assert.equal((await listen(f)).body.error.code,-32012);
  await f.subscribe();assert.equal((await listen(f)).body.error.code,-32012);
  const other=await harness();t.after(other.close);await other.subscribe();await other.postQq(payload(other));await other.app.bridge.tick();other.advance(other.config.replyTtlMs+1);
  const before=other.requests.length;assert.equal((await listen(other)).body.error.code,-32012);assert.equal(other.requests.length,before);
});

test('additive old-database migration, restart, encrypted voice retention and deduplication keep existing state', async t => {
  const dir=privateMkdtempSync(path.join(os.tmpdir(),'qq-voice-'));let f;
  t.after(async()=>{await f?.close();assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert.ok(path.basename(dir).startsWith('qq-voice-'));fs.rmSync(dir,{recursive:true,force:true});});
  const dbPath=path.join(dir,'bridge.sqlite'),old=new Store(config({dbPath}));old.db.exec('ALTER TABLE messages DROP COLUMN attachments');old.close();
  f=await harness({dbPath});await f.subscribe();await f.postQq(payload(f));await f.app.bridge.tick();await f.close();
  f=await harness({dbPath,sendOverride:async url=>url===wavUrl?{status:200,body:Buffer.from(audio)}:undefined});
  assert.equal((await listen(f)).status,200);assert.equal(f.app.bridge.acceptQq(payload(f),'voice-restart-1'),'duplicate');
  assert.equal(await f.app.bridge.tick(),false);assert.equal(f.deliveries.length,0);
  f.app.bridge.store.prune(f.now()+f.config.textRetentionMs+1);
  assert.equal(f.app.bridge.store.message(id).text,null);assert.deepEqual(f.app.bridge.store.message(id).attachments,[]);
  assert.equal(f.app.bridge.acceptQq(payload(f),'voice-retention-1'),'duplicate');
});

test('adapter rejects URL injection, wrong IDs, invalid audio blocks and extra metadata', () => {
  const args={message_id:id,attachment_index:0},call={name:'get_qq_attachment',arguments:args};
  for(const bad of [{...args,url:voice},{...args,attachment_index:1},{message_id:id},{...args,recipient:'other'}]) assert.throws(()=>qqAdapter.validateToolArguments(call.name,bad,true));
  assert.throws(()=>qqAdapter.validateToolArguments(call.name,args,false));
  const value={message_id:id,attachment_index:0,type:'audio',mime_type:'audio/wav',size:audio.length};
  const result={isError:false,structuredContent:value,content:[{type:'audio',mimeType:'audio/wav',data:audio.toString('base64')}]};
  for(const bad of [{...result,structuredContent:{...value,message_id:'other'}},{...result,structuredContent:{...value,url:voice}},
    {...result,structuredContent:{...value,size:1}},{...result,content:[{...result.content[0],url:voice}]},
    {...result,content:[{...result.content[0],data:'!!!!'}]},{...result,content:[result.content[0],result.content[0]]}]) assert.throws(()=>projectToolResult(call,bad,true));
});

test('resource reader pins public IP and original TLS hostname, rejects redirects/private DNS, and caps response bytes', async () => {
  let requests=0, status=200, privateDns=false, oversized=false;
  const send=makePublicRequester({proxyEnv:{},lookup:async()=>[{address:privateDns?'127.0.0.1':'8.8.8.8',family:4}],request:(url,options,callback)=>{
    requests++;assert.equal(url.hostname,CDN);assert.equal(options.servername,CDN);assert.equal(options.rejectUnauthorized,true);assert.equal(options.headers.Authorization,undefined);
    options.lookup(CDN,{all:true},(_err,addresses)=>assert.equal(addresses[0].address,'8.8.8.8'));
    const req=new EventEmitter();req.destroy=e=>{req.emit('error',e);req.emit('close');};
    req.end=()=>queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=status;res.headers={location:'https://127.0.0.1/secret'};res.destroy=e=>{res.emit('error',e);req.emit('close');};callback(res);
      res.emit('data',oversized?Buffer.alloc(QQ_AUDIO_BYTES+1):Buffer.from(audio));res.emit('end');req.emit('close');});return req;
  }});
  const read=createVoiceReader(send),message={attachments:[{type:'audio',urls:[wavUrl]}]};
  assert.equal((await read(message,0,()=>{})).mime,'audio/wav');assert.equal(requests,1);
  status=302;await assert.rejects(read(message,0,()=>{}));assert.equal(requests,2);
  status=200;oversized=true;await assert.rejects(read(message,0,()=>{}));assert.equal(requests,3);
  privateDns=true;await assert.rejects(read(message,0,()=>{}));assert.equal(requests,3);
});

test('configured proxies are preserved for voice and revocation prevents any request', async () => {
  let proxyCalls=0;
  const send=makePublicRequester({proxyEnv:{HTTPS_PROXY:'http://fixture-proxy.invalid'},lookup:async()=>assert.fail('must retain proxy'),providerSend:async(_url,options)=>{
    proxyCalls++;assert.equal(options.headers.Authorization,undefined);options.beforeConnect();return{status:200,body:Buffer.from(audio)};
  }});
  const read=createVoiceReader(send),message={attachments:[{type:'audio',urls:[wavUrl]}]};
  await read(message,0,()=>{});assert.equal(proxyCalls,1);
  await assert.rejects(read(message,0,()=>{throw new BridgeError('revoked',{code:-32012});}));assert.equal(proxyCalls,1);
});
