import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_MEDIA_BYTES,MAX_MEDIA_BASE64,MEDIA_RPC_LIMIT} from '@dot-bridge/core/channels/media.js';
import {QQ_AUDIO_BYTES,QQ_AUDIO_BASE64} from '../src/qq-audio.js';
import {QQ_UPLOAD_BYTES,validateQqMedia} from '../src/qq-media.js';
import {qqAdapter,projectToolResult} from '../src/tunnel-adapter.js';
import {hash} from '../src/common.js';

test('QQ attachment reads and native uploads share the five MiB tunnel budget',()=>{
 assert.equal(MAX_MEDIA_BYTES,5*1024*1024);assert.equal(QQ_AUDIO_BYTES,MAX_MEDIA_BYTES);assert.equal(QQ_AUDIO_BASE64,MAX_MEDIA_BASE64);assert.equal(QQ_UPLOAD_BYTES,MAX_MEDIA_BYTES);
 for(const budget of [qqAdapter.limits.bodyTools.reply_qq_media,qqAdapter.limits.requestTools.reply_qq_media,qqAdapter.limits.responseTools.get_qq_attachment])assert.equal(budget,MEDIA_RPC_LIMIT);
 const data=Buffer.alloc(MAX_MEDIA_BYTES,65).toString('base64'),oversize=Buffer.alloc(MAX_MEDIA_BYTES+1,65).toString('base64');assert.equal(data.length,oversize.length);
 const args={message_id:'fixture-media',type:'file',name:'answer.bin',mime_type:'application/octet-stream',data};validateQqMedia(args);assert.throws(()=>validateQqMedia({...args,data:oversize}));
 const value={message_id:args.message_id,attachment_index:0,type:'file',mime_type:args.mime_type,size:MAX_MEDIA_BYTES};
 const resource=blob=>({type:'resource',resource:{uri:`qq-attachment:${hash(`${value.message_id}:0`).slice(0,32)}`,mimeType:value.mime_type,blob}});
 const call={name:'get_qq_attachment',arguments:{message_id:value.message_id,attachment_index:0}};
 assert.equal(projectToolResult(call,{isError:false,structuredContent:value,content:[resource(data)]},true).value.size,MAX_MEDIA_BYTES);
 assert.throws(()=>projectToolResult(call,{isError:false,structuredContent:{...value,size:MAX_MEDIA_BYTES+1},content:[resource(oversize)]},true));
});
