import {BridgeError, object, string} from './common.js';
import {incomingVoice, voiceMetadata, voiceUrl, createVoiceReader, QQ_AUDIO_BYTES} from './qq-audio.js';
import {QQ_MEDIA_HOSTS} from './provider-network.js';
import {createSilkEncoder,validatePcmWav} from '@dot-bridge/core/audio/silk.js';
import {isSilk,getDuration} from 'silk-wasm';

export const QQ_UPLOAD_BYTES = 5 * 1024 * 1024;
export const QQ_UPLOAD_BASE64 = Math.ceil(QQ_UPLOAD_BYTES / 3) * 4;
export const QQ_RETAINED_MEDIA_BYTES = 64 * 1024 * 1024;
export const QQ_MEDIA_TYPES = ['image', 'audio', 'file'];
export function validateQqAttachmentReply(args){
  object(args,['message_id','attachment_index','type'],['message_id','attachment_index']);string(args.message_id,256);
  if(!Number.isSafeInteger(args.attachment_index)||args.attachment_index<0||args.attachment_index>9||(args.type!==undefined&&!QQ_MEDIA_TYPES.includes(args.type)))throw new BridgeError('Invalid QQ source attachment request');
  return {...args};
}
export function sourceReplyName(item,mime){
  const extension={'image/png':'.png','image/jpeg':'.jpg','audio/wav':'.wav','audio/silk':'.silk','audio/mpeg':'.mp3','audio/ogg':'.ogg'}[mime]??'.bin';
  const raw=(typeof item.name==='string'&&item.name?item.name.split(/[\\/]/u).at(-1):'')||'attachment'+extension;
  const name=raw.replace(/[\u0000-\u001f\u007f"\\/]/gu,'_').slice(0,128).toWellFormed();
  return name&&name!=='.'&&name!=='..'?name:'attachment'+extension;
}
export function imageMime(bytes) {
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
  if(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')return 'image/webp';
  if(['GIF87a','GIF89a'].includes(bytes.subarray(0,6).toString()))return 'image/gif';
  return null;
}
export function incomingMedia(items) {
  if(items===undefined || (Array.isArray(items)&&items.length===0))return [];
  if(!Array.isArray(items)||items.length>10)return null;
  const result=[];
  for(const item of items){
    const voice=incomingVoice([item]);
    if(voice){result.push(voice[0]);continue;}
    if(!item||typeof item!=='object'||Array.isArray(item))return null;
    const mime=typeof item.content_type==='string'?item.content_type.toLowerCase():'';
    if(!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(mime)||mime.length>127||mime.startsWith('video/'))return null;
    const type=mime.startsWith('image/')?'image':'file';
    let name='';try{if(item.filename!==undefined){string(item.filename,255);if(!/[\r\n\u0000-\u001f\u007f]|\p{Surrogate}/u.test(item.filename))name=item.filename;}}catch{}
    const urls=[];try{if(item.url)urls.push(voiceUrl(item.url));}catch{}
    result.push({type,name,mime,urls});
  }
  return result;
}
export function mediaMetadata(items=[]) {
  return items.map((item,index)=>item.type==='audio'?{...voiceMetadata([item])[0],index}:{index,type:item.type,name:item.name??'',attachment_available:item.urls.length>0});
}
export function validateQqMedia(args) {
  object(args,['message_id','type','name','mime_type','data'],['message_id','type','name','mime_type','data']);
  string(args.message_id,256);string(args.name,128);string(args.mime_type,128);
  if(!QQ_MEDIA_TYPES.includes(args.type)||/[\u0000-\u001f\u007f"\\/]|\p{Surrogate}/u.test(args.name)||['.','..'].includes(args.name)||!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(args.mime_type))throw new BridgeError('Invalid QQ media metadata');
  if(typeof args.data!=='string'||args.data.length>QQ_UPLOAD_BASE64||!/^[A-Za-z0-9+/]+={0,2}$/.test(args.data))throw new BridgeError('Invalid QQ media bytes');
  const bytes=Buffer.from(args.data,'base64');
  try{
    if(!bytes.length||bytes.length>QQ_UPLOAD_BYTES||bytes.toString('base64')!==args.data)throw new BridgeError('QQ media upload must be at most 5 MiB');
    if(args.type==='image'&&(!['image/png','image/jpeg'].includes(args.mime_type)||imageMime(bytes)!==args.mime_type))throw new BridgeError('QQ image replies require PNG or JPEG bytes');
    if(args.type==='audio'){
      try{
        if(args.mime_type==='audio/wav')validatePcmWav(bytes);
        else if(args.mime_type!=='audio/silk'||!isSilk(bytes)||!Number.isFinite(getDuration(bytes))||getDuration(bytes)<=0||getDuration(bytes)>120000)throw Error();
      }catch{throw new BridgeError('QQ voice replies require PCM16 mono WAV or SILK, up to 120 seconds; send other formats as a file');}
    }
  }finally{bytes.fill(0);}
  return {type:args.type,name:args.name,mimeType:args.mime_type,data:args.data};
}
const encodeSilk=createSilkEncoder(import.meta.resolve('silk-wasm'));
export async function prepareQqUpload(plan,{authorize=()=>{}}={}){
  if(plan.type!=='audio'||plan.mimeType!=='audio/wav')return plan;
  authorize();const input=Buffer.from(plan.data,'base64');let output;
  try{
    output=await encodeSilk(input);authorize();
    if(output.length>QQ_UPLOAD_BYTES)throw new BridgeError('QQ encoded voice exceeds 5 MiB');
    return{...plan,name:plan.name.replace(/\.[^.]*$/,'').slice(0,123)+'.silk',mimeType:'audio/silk',data:output.toString('base64')};
  }finally{input.fill(0);output?.fill(0);}
}
export function createMediaReader(send) {
  const readVoice=createVoiceReader(send);let active=0;
  return async(message,index,authorize,options={})=>{
    authorize();const item=message.attachments?.[index];
    if(!Number.isSafeInteger(index)||index<0||index>9||!item)throw new BridgeError('QQ attachment unavailable');
    if(item.type==='audio')return readVoice({...message,attachments:[item]},0,authorize,options);
    if(!['image','file'].includes(item.type)||!item.urls?.length)throw new BridgeError('QQ attachment unavailable');
    if(active>=2)throw new BridgeError('QQ attachment reader busy',{status:429,retryable:true});active++;
    let bytes;
    try{
      const response=await(send.resourceRequester??send)(voiceUrl(item.urls[0]),{method:'GET',purpose:'provider',hosts:QQ_MEDIA_HOSTS,headers:{'Accept-Encoding':'identity'},body:Buffer.alloc(0),beforeConnect:authorize});
      bytes=response.body;authorize();
      if(response.status!==200||!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>QQ_AUDIO_BYTES||(response.headers?.['content-encoding']&&response.headers['content-encoding']!=='identity'))throw new BridgeError('QQ attachment download refused');
      const mime=item.type==='image'?imageMime(bytes):'application/octet-stream';
      if(!mime)throw new BridgeError('Unsupported QQ image representation');
      return {bytes,mime,type:item.type};
    }catch(error){bytes?.fill(0);if(error?.code===-32012)throw error;throw new BridgeError('QQ attachment unavailable; ask the sender to resend it');}
    finally{active--;}
  };
}
