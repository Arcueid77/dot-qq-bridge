import { parentPort, workerData } from 'node:worker_threads';
import { decode, isSilk, getDuration } from 'silk-wasm';

// QQ sometimes prefixes SILK with the six-byte AMR label. A real AMR bitstream
// is not SILK: reject it rather than mislabeling bytes as playable WAV.
const maxDuration = 120000, rate = 24000;
let input = Buffer.from(workerData), pcm;
try {
  if (input.toString('ascii', 0, 6) === '#!AMR\n') input = input.subarray(6);
  if (!isSilk(input)) throw new Error();
  const duration = getDuration(input);
  if (!Number.isFinite(duration) || duration <= 0 || duration > maxDuration) throw new Error();
  const result = await decode(input, rate);
  pcm = result.data;
  if (!pcm.length || pcm.length % 2 || pcm.length > rate * 2 * maxDuration / 1000 || result.duration > maxDuration) throw new Error();
  const wav = new Uint8Array(44 + pcm.length), header = Buffer.from(wav.buffer);
  header.write('RIFF', 0); header.writeUInt32LE(wav.length - 8, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(pcm.length, 40); wav.set(pcm, 44);
  parentPort.postMessage(wav, [wav.buffer]);
} catch { parentPort.postMessage(null); }
finally { input.fill(0); workerData.fill(0); pcm?.fill(0); }
