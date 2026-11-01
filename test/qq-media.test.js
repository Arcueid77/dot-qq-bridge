import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {privateMkdtempSync} from '@dot-bridge/core/platform/test-fixtures.js';
import {RICH_TOOL_RESULT} from '@dot-bridge/core/router/common.js';
import {harness,qqPayload,config} from './helpers.js';
import {incomingMessage,createQqClient} from '../src/qq.js';
import {validateQqMedia,prepareQqUpload,QQ_UPLOAD_BYTES,QQ_RETAINED_MEDIA_BYTES} from '../src/qq-media.js';
import {decodeVoice} from '../src/qq-audio.js';
import {projectToolResult,qqAdapter} from '../src/tunnel-adapter.js';

const id='fixture-message-1',cdn='https://multimedia.nt.qq.com',png=Buffer.from('89504e470d0a1a0a0000000049454e44ae426082','hex');
const media=(extra={})=>({message_id:id,type:'image',name:'synthetic.png',mime_type:'image/png',data:png.toString('base64'),...extra});
const tool=(f,name,args={})=>f.postMcp('tools/call',{name,arguments:{message_id:id,...args}});
async function received(f,payload){await f.subscribe();await f.postQq(payload);await f.app.bridge.tick();}
const ack=()=>({status:200,body:Buffer.from(JSON.stringify({file_info:'synthetic-file-info',ttl:3600}))});
function wav(){
  const bytes=Buffer.alloc(4844);bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(24000,24);bytes.writeUInt32LE(48000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(4800,40);
  for(let i=0;i<2400;i++)bytes.writeInt16LE(Math.round(Math.sin(i/10)*4000),44+i*2);return bytes;
}

test('readiness exposes only actual binding, subscription and Gateway booleans',async t=>{
  const f=await harness();t.after(f.close);
  let response=await fetch(f.origin+'/readyz');assert.equal(response.status,503);assert.deepEqual(await response.json(),{ready:false,binding_ready:true,mcp_subscription_active:false,gateway_connected:false});
  await f.subscribe();response=await fetch(f.origin+'/readyz');assert.equal(response.status,200);assert.deepEqual(await response.json(),{ready:true,binding_ready:true,mcp_subscription_active:true,gateway_connected:false});
  f.app.bridge.store.unsubscribe(f.app.bridge.store.activeSubscription(f.now()).id);assert.equal((await fetch(f.origin+'/readyz')).status,503);
});

test('source attachment reply reads one bound image and preserves its reference after upload',async t=>{
  let reads=0,uploads=0;const f=await harness({sendOverride:async(url)=>{
    if(url.startsWith(cdn)){reads++;return{status:200,body:Buffer.from(png)};}
    if(url.endsWith('/files')){uploads++;return ack();}
  }});t.after(f.close);
  await received(f,qqPayload(f.now(),{attachments:[{content_type:'image/png',filename:'source.png',url:cdn+'/image?private=fixture'}]}));
  const args={attachment_index:0};assert.equal((await tool(f,'reply_qq_attachment',args)).body.result.structuredContent.status,'pending');
  await f.app.bridge.tick();assert.equal(f.sends.length,1);assert.equal(reads,1);assert.equal(uploads,1);
  assert.equal((await tool(f,'reply_qq_attachment',{...args,type:'image'})).body.result.structuredContent.status,'sent');
  await f.app.bridge.tick();assert.equal(reads,1);assert.equal(uploads,1);assert.equal(f.sends.length,1);
  assert.equal((await tool(f,'reply_qq_attachment',{...args,type:'file'})).status,400);
  assert.equal(JSON.stringify((await tool(f,'reply_qq_attachment',args)).body).includes('private=fixture'),false);
});

test('forwarding a source voice preserves validated SILK instead of decoding and re-encoding it',async t=>{
  const encoded=await prepareQqUpload({type:'audio',name:'voice.wav',mimeType:'audio/wav',data:wav().toString('base64')});
  let upload;const f=await harness({sendOverride:async(url,options)=>{
    if(url.startsWith(cdn))return{status:200,body:Buffer.from(encoded.data,'base64')};
    if(url.endsWith('/files')){upload=JSON.parse(options.body);return ack();}
  }});t.after(f.close);
  await received(f,qqPayload(f.now(),{attachments:[{content_type:'audio/silk',url:cdn+'/voice'}]}));
  assert.equal((await tool(f,'reply_qq_attachment',{attachment_index:0})).status,200);await f.app.bridge.tick();
  assert.equal(upload.file_type,3);assert.equal(upload.file_data,encoded.data);assert.equal(f.sends.length,1);
});

test('source reply refuses routing fields and cannot queue after revocation during a download',async t=>{
  let reads=0,downloads=[];let f;
  f=await harness({sendOverride:async url=>{
    if(url.startsWith(cdn)){
      reads++;f.app.bridge.store.unsubscribe(f.app.bridge.store.activeSubscription(f.now()).id);
      const bytes=Buffer.from(png);downloads.push(bytes);return{status:200,body:bytes};
    }
  }});t.after(f.close);
  await received(f,qqPayload(f.now(),{attachments:[{content_type:'image/png',url:cdn+'/image'}]}));
  for(const extra of [{recipient:'other'},{url:cdn+'/other'},{source_message_id:'other'},{attachment_index:9}])assert.notEqual((await tool(f,'reply_qq_attachment',{attachment_index:0,...extra})).status,200);
  assert.equal(reads,0);assert.notEqual((await tool(f,'reply_qq_attachment',{attachment_index:0})).status,200);
  assert.equal(reads,1);assert.equal(f.sends.length,0);assert.equal(f.app.bridge.store.get('SELECT count(*) AS n FROM replies').n,0);
  assert.ok(downloads.every(bytes=>bytes.every(n=>n===0)));
});

test('uncertain source attachment retry after reopening SQLite neither downloads nor sends again',async t=>{
  const dir=privateMkdtempSync(path.join(os.tmpdir(),'qq-source-media-'));let f,reads=0,uploads=0,sends=0;
  t.after(async()=>{await f?.close();assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert.ok(path.basename(dir).startsWith('qq-source-media-'));fs.rmSync(dir,{recursive:true,force:true});});
  const dbPath=path.join(dir,'bridge.sqlite'),sendOverride=async url=>{
    if(url.startsWith(cdn)){reads++;return{status:200,body:Buffer.from(png)};}
    if(url.endsWith('/files')){uploads++;return ack();}
    if(url.endsWith('/messages')){sends++;throw Error('synthetic lost acknowledgement');}
  };
  f=await harness({dbPath,sendOverride});await received(f,qqPayload(f.now(),{attachments:[{content_type:'image/png',filename:'a.png',url:cdn+'/image'}]}));
  await tool(f,'reply_qq_attachment',{attachment_index:0});await f.app.bridge.tick();assert.equal(f.app.bridge.store.replyStatus(id).status,'uncertain');
  await f.close();f=await harness({dbPath,sendOverride});
  assert.equal((await tool(f,'reply_qq_attachment',{attachment_index:0})).body.result.structuredContent.status,'uncertain');await f.app.bridge.tick();
  assert.equal(reads,1);assert.equal(uploads,1);assert.equal(sends,1);
});

test('QQ text file excerpts remain bounded, explicitly truncated and bound to the original binary result',async t=>{
  const source='a'.repeat(11999)+'🙂more';
  const f=await harness({sendOverride:async url=>url.startsWith(cdn)?{status:200,body:Buffer.from(source)}:undefined});t.after(f.close);
  await received(f,qqPayload(f.now(),{attachments:[{content_type:'text/plain',filename:'note.txt',url:cdn+'/file'}]}));
  const call={name:'get_qq_attachment',arguments:{message_id:id,attachment_index:0}};
  const raw=(await tool(f,call.name,{attachment_index:0})).body.result;
  assert.equal(raw.structuredContent.extraction_status,'truncated');assert.equal(raw.structuredContent.extracted_text,'a'.repeat(11999));
  const projected=projectToolResult(call,raw,true);assert.equal(Buffer.from(projected.content[1].resource.blob,'base64').toString(),source);
  const bad=structuredClone(raw);bad.structuredContent.extraction_status='unsupported';assert.throws(()=>projectToolResult(call,bad,true));
});

test('owner image and file events persist private links while exposing only indexed metadata and bound MCP bytes',async t=>{
  const f=await harness({sendOverride:async(url,options)=>{
    if(url.startsWith(cdn)){assert.equal(options.method,'GET');assert.equal(options.headers.Authorization,undefined);return{status:200,body:Buffer.from(url.includes('/image')?png:Buffer.from('synthetic document'))};}
  }});t.after(f.close);
  await received(f,qqPayload(f.now(),{content:'',attachments:[{content_type:'image/png',filename:'a.png',url:cdn+'/image?token=private-fixture'},{content_type:'application/pdf',filename:'report.pdf',url:cdn+'/file?token=private-fixture'}]}));
  assert.equal(f.deliveries[0].data.attachments,2);
  const result=(await tool(f,'get_qq_message')).body.result;
  assert.deepEqual(result.structuredContent.attachments,[{index:0,type:'image',name:'a.png',attachment_available:true},{index:1,type:'file',name:'report.pdf',attachment_available:true}]);
  assert.equal(JSON.stringify(result).includes('private-fixture'),false);
  assert.equal(f.app.bridge.store.get('SELECT attachments FROM messages WHERE id=?',id).attachments.includes(cdn),false);
  projectToolResult({name:'get_qq_message',arguments:{message_id:id}},result,true);
  for(const index of [0,1]){
    const call={name:'get_qq_attachment',arguments:{message_id:id,attachment_index:index}};
    const raw=(await tool(f,call.name,{attachment_index:index})).body.result;
    const projected=projectToolResult(call,raw,true);assert.equal(projected[RICH_TOOL_RESULT],true);
    assert.equal(projected.content[1].type,index?'resource':'image');
    if(index){const bad=structuredClone(raw);bad.content[1].resource.uri='qq-attachment:'+'0'.repeat(32);assert.throws(()=>projectToolResult(call,bad,true));}
  }
  assert.equal((await tool(f,'get_qq_attachment',{attachment_index:2})).status,400);
});

test('foreign identities, unsupported groups and attachment redirects never grant a file read',async t=>{
  const settings=config(),now=Date.now();
  assert.throws(()=>incomingMessage(qqPayload(now,{author:{user_openid:'other'},attachments:[{content_type:'image/png',url:cdn+'/x'}]}),settings,now));
  assert.equal(incomingMessage(qqPayload(now,{group_openid:'group',attachments:[{content_type:'image/png',url:cdn+'/x'}]}),settings,now),null);
  const f=await harness({sendOverride:async url=>url===cdn+'/redirect'?{status:302,headers:{location:'https://attacker.invalid/'},body:Buffer.from('redirect')}:undefined});t.after(f.close);
  await received(f,qqPayload(f.now(),{attachments:[{content_type:'application/pdf',url:cdn+'/redirect'},{content_type:'image/png',url:'https://attacker.invalid/image'}]}));
  assert.equal((await tool(f,'get_qq_attachment',{attachment_index:0})).status,400);
  assert.equal((await tool(f,'get_qq_attachment',{attachment_index:1})).status,400);
  assert.equal(f.requests.some(v=>v.url.startsWith('https://attacker.invalid/')),false);
});

test('image/file/voice upload uses official bytes API with no automatic send, then one passive original-chat reply',async t=>{
  const silk=await prepareQqUpload({type:'audio',name:'voice.wav',mimeType:'audio/wav',data:wav().toString('base64')});
  for(const args of [media(),media({type:'file',name:'report.pdf',mime_type:'application/pdf',data:Buffer.from('report').toString('base64')}),media({type:'audio',name:'voice.silk',mime_type:'audio/silk',data:silk.data})]){
    const uploads=[];const f=await harness({sendOverride:async(url,options)=>{if(url.endsWith('/files')){uploads.push({url,body:JSON.parse(options.body.toString())});return ack();}}});t.after(f.close);await received(f);
    assert.equal((await tool(f,'reply_qq_media',args)).body.result.structuredContent.status,'pending');
    const encrypted=f.app.bridge.store.get('SELECT text FROM replies WHERE message_id=?',id).text;assert.equal(encrypted.includes(args.data),false);
    await f.app.bridge.tick();
    assert.deepEqual(uploads[0],{url:'https://api.bot.qq.com/v2/users/fixture_qq_owner/files',body:{file_type:{image:1,audio:3,file:4}[args.type],file_name:args.name,file_data:args.data,srv_send_msg:false}});
    assert.deepEqual(f.sends[0].body,{msg_type:7,media:{file_info:'synthetic-file-info'},msg_id:id,msg_seq:1});
    assert.equal((await tool(f,'reply_qq_media',args)).body.result.structuredContent.status,'sent');
    await f.app.bridge.tick();assert.equal(uploads.length,1);assert.equal(f.sends.length,1);
    assert.equal((await tool(f,'get_qq_context')).body.result.structuredContent.messages[0].reply_text,'[媒体回复]');
    assert.equal((await f.reply()).status,400);
    assert.equal((await tool(f,'reply_qq_media',{...args,name:'changed.bin'})).status,400);
  }
});

test('shared codec converts real PCM WAV to QQ SILK before upload, with bounded duration and valid decoded output',async t=>{
  let uploaded;const f=await harness({sendOverride:async(url,options)=>{if(url.endsWith('/files')){uploaded=JSON.parse(options.body);return ack();}}});t.after(f.close);await received(f);
  const args=media({type:'audio',name:'voice.wav',mime_type:'audio/wav',data:wav().toString('base64')});
  assert.equal((await tool(f,'reply_qq_media',args)).status,200);await f.app.bridge.tick();assert.equal(f.app.bridge.store.replyStatus(id).status,'sent');
  assert.equal(uploaded.file_type,3);assert.equal(uploaded.file_name,'voice.silk');
  const decoded=await decodeVoice(Buffer.from(uploaded.file_data,'base64'));assert.equal(decoded.mime,'audio/wav');assert.equal(decoded.bytes.readUInt32LE(24),24000);assert.ok(decoded.bytes.length>44);
  const bad=wav();bad.writeUInt16LE(2,22);assert.throws(()=>validateQqMedia({...args,data:bad.toString('base64')}));
  assert.throws(()=>validateQqMedia({...args,data:Buffer.from('RIFFinvalid').toString('base64')}));
  const cancelled=new AbortController();cancelled.abort();await assert.rejects(decodeVoice(Buffer.from(uploaded.file_data,'base64'),{signal:cancelled.signal}));
});

test('invalid or overlarge bytes and arbitrary routing fields are refused before queueing or provider I/O',async t=>{
  const f=await harness();t.after(f.close);await received(f);const before=f.requests.length;
  for(const args of [media({recipient:'other'}),media({url:cdn+'/x'}),media({data:'not base64'}),media({name:'../bad.png'}),media({mime_type:'image/jpeg'}),media({data:Buffer.alloc(QQ_UPLOAD_BYTES+1).toString('base64')}),media({type:'audio',mime_type:'audio/mpeg'})]){
    assert.throws(()=>validateQqMedia(args));assert.throws(()=>qqAdapter.validateToolArguments('reply_qq_media',args,true));assert.equal((await tool(f,'reply_qq_media',args)).status,400);
  }
  assert.equal(f.requests.length,before);assert.equal(f.app.bridge.store.get('SELECT count(*) AS n FROM replies').n,0);
  assert.equal(validateQqMedia(media({type:'file',mime_type:'application/octet-stream',data:Buffer.alloc(QQ_UPLOAD_BYTES).toString('base64')})).type,'file');
  const client=createQqClient(f.config,async()=>assert.fail('invalid upload reached provider'),f.now);
  await assert.rejects(client.uploadMedia({id,owner:'other',expires:f.now()+1000},{type:'image'}));
  await assert.rejects(client.uploadMedia({id,owner:f.config.ownerOpenid,expires:f.now()+1000},{type:'image',name:'bad',mimeType:'image/png',data:'bad'}));
});

test('retained ciphertext capacity includes new bytes and uncertain replies without blocking identical retries',async t=>{
  for(const state of ['pending','uncertain']){
    const f=await harness();t.after(f.close);await received(f);
    const secondId='fixture-message-2',payload=qqPayload(f.now(),{id:secondId});payload.id='fixture-event-2';
    await f.postQq(payload);await f.app.bridge.tick();
    assert.equal((await tool(f,'reply_qq_media',media())).status,200);
    const store=f.app.bridge.store;store.run("UPDATE jobs SET state=? WHERE message_id=? AND kind='reply'",state,id);
    // Sparse synthetic bytes stand in for retained encrypted payloads. No
    // decryption is required by the capacity accounting or retry path.
    store.run('UPDATE replies SET text=zeroblob(?) WHERE message_id=?',QQ_RETAINED_MEDIA_BYTES-100,id);
    const before=f.requests.length;
    const retry=await tool(f,'reply_qq_media',media());assert.equal(retry.status,200);assert.equal(retry.body.result.structuredContent.status,state);
    const next=media({message_id:secondId,type:'file',name:'reply.bin',mime_type:'application/octet-stream',data:Buffer.alloc(200,65).toString('base64')});
    const refused=await tool(f,'reply_qq_media',next);assert.equal(refused.status,429);assert.equal(refused.body.error.code,-32013);
    for(const table of ['replies','qq_reply_options','qq_sequences'])assert.equal(store.get(`SELECT count(*) AS n FROM ${table} WHERE message_id=?`,secondId).n,0);
    assert.equal(store.get("SELECT count(*) AS n FROM jobs WHERE message_id=? AND kind='reply'",secondId).n,0);
    assert.equal(store.replyStatus(id).status,state);assert.equal(f.requests.length,before);
    const newBytes=Buffer.byteLength(store.vault.seal(JSON.stringify(validateQqMedia(next)),`reply:${secondId}`));
    store.run('UPDATE replies SET text=zeroblob(?) WHERE message_id=?',QQ_RETAINED_MEDIA_BYTES-newBytes,id);
    assert.equal((await tool(f,'reply_qq_media',next)).status,200);
    assert.equal(store.get("SELECT sum(length(r.text)) AS bytes FROM replies r JOIN qq_reply_options o ON o.message_id=r.message_id WHERE o.format='media'").bytes,QQ_RETAINED_MEDIA_BYTES);
    assert.equal(f.requests.length,before);
  }
});

test('a known rate-limit after upload reuses the durable uploaded key across a process restart',async t=>{
  const dir=privateMkdtempSync(path.join(os.tmpdir(),'qq-media-'));let f;let uploads=0,sends=0;
  t.after(async()=>{await f?.close();assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert.ok(path.basename(dir).startsWith('qq-media-'));fs.rmSync(dir,{recursive:true,force:true});});
  const dbPath=path.join(dir,'bridge.sqlite');
  const sendOverride=async(url)=>{if(url.endsWith('/files')){uploads++;return ack();}if(url.endsWith('/messages')&&++sends===1)return{status:429,body:Buffer.from('{}')};};
  f=await harness({dbPath,sendOverride});await received(f);await tool(f,'reply_qq_media',media());await f.app.bridge.tick();
  assert.equal(f.app.bridge.store.replyStatus(id).status,'pending');assert.equal(JSON.parse(f.app.bridge.store.replyText(id)).data,undefined);
  await f.close();f=await harness({dbPath,sendOverride});f.advance(60000);await f.app.bridge.tick();
  assert.equal(f.app.bridge.store.replyStatus(id).status,'sent');assert.equal(uploads,1);assert.equal(sends,2);
});

test('ambiguous upload or send is retained as uncertain and never automatically retried',async t=>{
  for(const phase of ['files','messages']){
    let uploads=0,sends=0;const f=await harness({sendOverride:async url=>{
      if(url.endsWith('/files')){uploads++;if(phase==='files')throw new Error('synthetic lost ACK');return ack();}
      if(url.endsWith('/messages')){sends++;throw new Error('synthetic lost ACK');}
    }});t.after(f.close);await received(f);await tool(f,'reply_qq_media',media());await f.app.bridge.tick();
    assert.equal(f.app.bridge.store.replyStatus(id).status,'uncertain');
    await tool(f,'reply_qq_media',media());f.advance(10000);await f.app.bridge.tick();assert.equal(uploads,1);assert.equal(sends,phase==='messages'?1:0);
  }
});

test('revocation or passive expiry during upload prevents the final message from being sent',async t=>{
  for(const action of ['revoke','expire']){
    let f;f=await harness({sendOverride:async url=>{if(url.endsWith('/files')){if(action==='revoke')f.app.bridge.store.unsubscribe(f.app.bridge.store.activeSubscription(f.now()).id);else f.advance(f.config.replyTtlMs+1);return ack();}}});t.after(f.close);
    await received(f);await tool(f,'reply_qq_media',media());await f.app.bridge.tick();assert.equal(f.sends.length,0);
    assert.ok(['cancelled','dead'].includes(f.app.bridge.store.replyStatus(id).status));
  }
});

test('a started text stream cannot be replaced by media, and expired/undelivered messages cannot queue it',async t=>{
  const f=await harness();t.after(f.close);await f.subscribe();await f.postQq();
  assert.equal((await tool(f,'reply_qq_media',media())).status,400);await f.app.bridge.tick();
  await tool(f,'append_qq_reply',{sequence:1,text:'partial text'});assert.equal((await tool(f,'reply_qq_media',media())).status,400);
  const other=await harness();t.after(other.close);await received(other);other.advance(other.config.replyTtlMs+1);assert.equal((await tool(other,'reply_qq_media',media())).status,400);
});
