import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {harness} from './helpers.js';

test('generated QQ files use the native upload queue once and choices have a text fallback',async t=>{
  const uploads=[];
  const f=await harness({sendOverride:async(url,request)=>{
    if(url.endsWith('/files')){
      uploads.push(JSON.parse(request.body));
      return {status:200,body:Buffer.from(JSON.stringify({file_info:'synthetic-file-reference',ttl:300}))};
    }
  }});t.after(f.close);
  await f.subscribe();await f.postQq();await f.app.bridge.tick();
  const message_id='fixture-message-1',bytes=Buffer.alloc(200000,120);
  const call=(name,args)=>f.postMcp('tools/call',{name,arguments:args});
  const first=await call('begin_qq_attachment_upload',{message_id,type:'file',name:'report.txt',mime_type:'text/plain',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),idempotency_key:'generated-report'});
  assert.equal(first.status,200);const upload_id=first.body.result.structuredContent.upload_id;
  assert.equal((await call('append_qq_attachment_upload',{upload_id,offset:0,data:bytes.toString('base64')})).status,200);
  assert.equal((await call('finish_qq_attachment_upload',{upload_id})).body.result.structuredContent.complete,true);
  const reply={message_id,upload_id,idempotency_key:'reply-report'};
  assert.equal((await call('reply_qq_uploaded_attachment',reply)).status,200);await f.app.bridge.tick();
  assert.equal((await call('reply_qq_uploaded_attachment',reply)).body.result.structuredContent.status,'sent');
  assert.equal(uploads.length,1);assert.equal(f.sends.length,1);assert.equal(f.sends[0].body.msg_type,7);
  f.advance(1);await f.postQq({id:'next-event',op:0,t:'C2C_MESSAGE_CREATE',d:{id:'choice-source',author:{user_openid:f.config.ownerOpenid,bot:false},message_type:0,content:'choose',timestamp:new Date(f.now()).toISOString()}});await f.app.bridge.tick();
  assert.equal((await call('reply_qq_choices',{message_id:'choice-source',text:'选择格式',choices:[{id:'pdf',label:'PDF'},{id:'txt',label:'文本'}],idempotency_key:'format'})).status,200);await f.app.bridge.tick();
  assert.match(f.sends[1].body.content,/1\. PDF\n2\. 文本/);
});
