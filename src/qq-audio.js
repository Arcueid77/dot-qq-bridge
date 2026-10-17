import { Worker } from 'node:worker_threads';
import { BridgeError, plainText } from './common.js';
import { destinationUrl } from './network.js';
import { QQ_MEDIA_HOSTS } from './provider-network.js';

export const QQ_AUDIO_BYTES = 8 * 1024 * 1024;
export const QQ_AUDIO_BASE64 = Math.ceil(QQ_AUDIO_BYTES / 3) * 4;
export const QQ_AUDIO_DURATION_MS = 120000;
export const QQ_AUDIO_MIMES = Object.freeze(['audio/wav', 'audio/mpeg', 'audio/ogg']);

// URLs originate only in authenticated owner events. They are never tool inputs,
// callback destinations, or places to send the bot's Authorization header.
export function voiceUrl(raw) {
  if (typeof raw !== 'string' || !raw || raw.length > 4096 || /[\s\u0000-\u001f\u007f]/u.test(raw)) throw new BridgeError('Invalid QQ voice resource');
  return destinationUrl(raw.startsWith('//') ? `https:${raw}` : raw, QQ_MEDIA_HOSTS).href;
}

export function incomingVoice(attachments) {
  if (attachments === undefined || (Array.isArray(attachments) && !attachments.length)) return [];
  if (!Array.isArray(attachments) || attachments.length !== 1) return null;
  const item = attachments[0];
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const mime = typeof item.content_type === 'string' ? item.content_type.toLowerCase() : '';
  const extension = typeof item.filename === 'string' && /\.(silk|slk|slac|amr)$/i.test(item.filename);
  if (!(mime === 'voice' || mime.startsWith('audio/') || (mime === 'application/octet-stream' && extension))) return null;
  // Invalid or unsupported download links must not silence an otherwise valid
  // voice event. The dot can still use QQ's optional reference transcription.
  const urls = [];
  for (const raw of [item.voice_wav_url, item.url]) {
    if (!raw) continue;
    try { const url = voiceUrl(raw); if (!urls.includes(url)) urls.push(url); } catch { /* fail closed on this resource */ }
  }
  let transcript = null;
  if (typeof item.asr_refer_text === 'string' && item.asr_refer_text.trim()) {
    try { transcript = plainText(item.asr_refer_text.trim()); } catch { /* never trust malformed ASR */ }
  }
  return [{ type: 'audio', urls, transcript }];
}

export function voiceMetadata(items = []) {
  return items.map((item, index) => ({ index, type: 'audio', transcript: item.transcript ?? null, audio_available: item.urls.length > 0 }));
}

export function audioMime(bytes) {
  if (bytes.length >= 44 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE') return 'audio/wav';
  if (bytes.length >= 4 && (bytes.toString('ascii', 0, 3) === 'ID3' || (bytes[0] === 255 && (bytes[1] & 224) === 224))) return 'audio/mpeg';
  if (bytes.length >= 32 && bytes.toString('ascii', 0, 4) === 'OggS' &&
      (bytes.subarray(0,256).includes(Buffer.from('OpusHead')) || bytes.subarray(0,256).includes(Buffer.from('vorbis')))) return 'audio/ogg';
  return null;
}

export async function decodeVoice(input) {
  if (!Buffer.isBuffer(input) || !input.length || input.length > QQ_AUDIO_BYTES) throw new BridgeError('QQ voice size refused');
  const mime = audioMime(input);
  if (mime) return { bytes: Buffer.from(input), mime };
  // A worker isolates the decoder from the gateway heartbeat and can be stopped
  // on timeout. No media file, shell command, model API or persistent key is used.
  return new Promise((resolve, reject) => {
    let settled = false;
    const worker = new Worker(new URL('./qq-audio-worker.js', import.meta.url), {
      workerData: Uint8Array.from(input), stdout: true, stderr: true,
      resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 }
    });
    worker.stdout.resume(); worker.stderr.resume();
    const finish = bytes => {
      if (settled) return;
      settled = true; clearTimeout(timer); void worker.terminate();
      if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > QQ_AUDIO_BYTES) {
        reject(new BridgeError('QQ voice format unavailable; use its reference transcript or ask the sender for text')); return;
      }
      resolve({ bytes: Buffer.from(bytes), mime: 'audio/wav' });
    };
    const timer = setTimeout(() => finish(null), 10000);
    worker.once('message', finish);
    worker.once('error', () => finish(null));
    worker.once('exit', () => finish(null));
  });
}

export function createVoiceReader(send) {
  let active = 0;
  return async (message, index, authorize) => {
    authorize();
    const item = message.attachments?.[index];
    if (index !== 0 || !item || !item.urls.length) throw new BridgeError('QQ voice audio unavailable; use its reference transcript or ask the sender for text');
    if (active >= 2) throw new BridgeError('QQ voice reader busy; retry shortly', { status: 429, retryable: true });
    active++;
    try {
      for (const raw of item.urls) {
        let input, decoded;
        try {
          const url = voiceUrl(raw);
          authorize();
          const response = await (send.resourceRequester ?? send)(url, {
            method: 'GET', purpose: 'provider', hosts: QQ_MEDIA_HOSTS,
            headers: { 'Accept-Encoding': 'identity' }, body: Buffer.alloc(0), beforeConnect: authorize
          });
          input = response.body;
          authorize();
          if (response.status !== 200 || (response.headers?.['content-encoding'] && response.headers['content-encoding'] !== 'identity')) throw new BridgeError('QQ voice resource unavailable');
          decoded = await decodeVoice(input);
          authorize();
          return decoded;
        } catch (error) {
          decoded?.bytes.fill(0);
          if (error?.code === -32012) throw error;
        } finally { input?.fill(0); }
      }
      throw new BridgeError('QQ voice audio unavailable; use its reference transcript or ask the sender to resend or send text');
    } finally { active--; }
  };
}
