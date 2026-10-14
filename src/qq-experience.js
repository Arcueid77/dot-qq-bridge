import { BridgeError, hash, plainText } from './common.js';

const terminal = new Set(['sent', 'dead', 'cancelled', 'expired', 'uncertain']);
// All external writes run in the existing leased worker. A lost acknowledgement
// remains uncertain across restarts, including non-final native stream frames.
export class QqExperience {
  constructor(bridge) {
    this.bridge = bridge; this.store = bridge.store;
    this.store.db.exec(`
      CREATE TABLE IF NOT EXISTS qq_sequences (message_id TEXT PRIMARY KEY REFERENCES messages(id), next_seq INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS qq_typing (message_id TEXT PRIMARY KEY REFERENCES messages(id), msg_seq INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS qq_reply_options (message_id TEXT PRIMARY KEY REFERENCES messages(id), msg_seq INTEGER NOT NULL, format TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS qq_streams (message_id TEXT PRIMARY KEY REFERENCES messages(id), msg_seq INTEGER NOT NULL,
        accepted_sequence INTEGER NOT NULL DEFAULT 0, outbound_id TEXT, updated INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS qq_frames (message_id TEXT NOT NULL REFERENCES messages(id), sequence INTEGER NOT NULL,
        digest TEXT NOT NULL, text TEXT, created INTEGER NOT NULL, PRIMARY KEY(message_id,sequence));`);
  }
  sequence(id) {
    this.store.run('INSERT OR IGNORE INTO qq_sequences VALUES (?,1)', id);
    const n = this.store.get('SELECT next_seq FROM qq_sequences WHERE message_id=?', id).next_seq;
    if (n > 5) throw new BridgeError('QQ passive send budget exhausted');
    this.store.run('UPDATE qq_sequences SET next_seq=next_seq+1 WHERE message_id=?', id);
    return n;
  }
  job(id, kind, message, now) {
    this.store.capacity();
    this.store.run('INSERT INTO jobs(id,kind,message_id,subscription_id,next_at) VALUES (?,?,?,?,?)', id, kind, message.id, message.subscription_id, now);
  }
  status(id, jobId) {
    const row = this.store.get('SELECT state,last_error FROM jobs WHERE id=?', jobId);
    return { message_id: id, status: row?.state ?? 'none', error: row?.last_error ?? null };
  }
  replyStatus(id) {
    const final = this.store.replyStatus(id);
    if (final.status !== 'none') return final;
    const failed = this.store.get("SELECT state,last_error FROM jobs WHERE message_id=? AND kind='stream' AND state IN ('uncertain','dead','cancelled','expired') ORDER BY id LIMIT 1", id);
    return failed ? { message_id: id, status: failed.state, error: failed.last_error } : final;
  }
  begin(id, principal, now) {
    return this.store.tx(() => {
      const m = this.store.authorizeMessage(id, principal, now);
      if (this.store.get('SELECT message_id FROM qq_typing WHERE message_id=?', id)) return this.status(id, `typing:${id}`);
      if (m.expires <= now || this.store.get('SELECT message_id FROM replies WHERE message_id=?', id)) throw new BridgeError('Reply already finished or passive window expired');
      this.store.run('INSERT INTO qq_typing VALUES (?,?)', id, this.sequence(id));
      this.job(`typing:${id}`, 'typing', m, now);
      return this.status(id, `typing:${id}`);
    });
  }
  ensureStream(m) {
    let stream = this.store.get('SELECT * FROM qq_streams WHERE message_id=?', m.id);
    if (!stream) {
      this.store.run('INSERT INTO qq_streams(message_id,msg_seq) VALUES (?,?)', m.id, this.sequence(m.id));
      stream = this.store.get('SELECT * FROM qq_streams WHERE message_id=?', m.id);
    }
    return stream;
  }
  assertStreamUsable(id) {
    if (this.store.get("SELECT id FROM jobs WHERE message_id=? AND kind='stream' AND state IN ('uncertain','dead','cancelled','expired') LIMIT 1", id)) {
      throw new BridgeError('QQ stream stopped; do not resend an unconfirmed answer');
    }
  }
  append(id, sequence, text, principal, now) {
    plainText(text, 30000);
    if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > 50) throw new BridgeError('Invalid stream sequence');
    return this.store.tx(() => {
      const m = this.store.authorizeMessage(id, principal, now);
      const previous = this.store.get('SELECT digest FROM qq_frames WHERE message_id=? AND sequence=?', id, sequence);
      if (previous) {
        if (previous.digest !== hash(text)) throw new BridgeError('Stream sequence already has different text');
        return this.status(id, `stream:${id}:${sequence}`);
      }
      if (m.expires <= now || this.store.get('SELECT message_id FROM replies WHERE message_id=?', id)) throw new BridgeError('Reply already finished or passive window expired');
      this.assertStreamUsable(id);
      const stream = this.ensureStream(m);
      if (sequence !== stream.accepted_sequence + 1) throw new BridgeError('Stream sequence must be consecutive');
      if (stream.accepted_sequence) {
        const last = this.frameText(id, stream.accepted_sequence);
        if (!last || !text.startsWith(last) || text === last) throw new BridgeError('Stream text must extend previous generated text');
      }
      this.store.run('INSERT INTO qq_frames VALUES (?,?,?,?,?)', id, sequence, hash(text), this.store.vault.seal(text, `qq-frame:${id}:${sequence}`), now);
      this.store.run('UPDATE qq_streams SET accepted_sequence=? WHERE message_id=?', sequence, id);
      this.job(`stream:${id}:${sequence}`, 'stream', m, now);
      return this.status(id, `stream:${id}:${sequence}`);
    });
  }
  frameText(id, n) {
    const v = this.store.get('SELECT text FROM qq_frames WHERE message_id=? AND sequence=?', id, n)?.text;
    return v ? this.store.vault.open(v, `qq-frame:${id}:${n}`) : null;
  }
  queueReply(id, text, principal, now, format = 'plain') {
    if (!['plain', 'markdown'].includes(format)) throw new BridgeError('Invalid reply format');
    // The delivery sequence and queue commit in one existing SQLite transaction.
    const m = this.store.authorizeMessage(id, principal, now);
    const old = this.store.get('SELECT * FROM qq_reply_options WHERE message_id=?', id);
    const stream = this.store.get('SELECT * FROM qq_streams WHERE message_id=?', id);
    if (!old) {
      this.assertStreamUsable(id);
      if (stream?.accepted_sequence) {
        const last = this.frameText(id, stream.accepted_sequence);
        if (!last || !text.startsWith(last)) throw new BridgeError('Final answer must preserve the generated stream');
      }
    } else if (old.format !== format) throw new BridgeError('Reply already has a different format');
    return this.store.queueReply(id, text, principal, now, () => {
      const native = stream || text.length > 2000;
      const seq = native ? this.ensureStream(m).msg_seq : this.sequence(id);
      this.store.run('INSERT INTO qq_reply_options VALUES (?,?,?)', id, seq, format);
    });
  }
  context(id, principal, now, limit = 10) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) throw new BridgeError('Invalid context limit');
    const anchor = this.store.authorizeMessage(id, principal, now);
    const rows = this.store.all(`SELECT id FROM messages WHERE principal=? AND owner=? AND subscription_id=? AND generation=?
      AND attempted_at IS NOT NULL AND received>=? AND (received<? OR (received=? AND rowid<=(SELECT rowid FROM messages WHERE id=?)))
      ORDER BY received DESC,rowid DESC LIMIT ?`, principal, anchor.owner, anchor.subscription_id, anchor.generation,
      now - this.bridge.config.textRetentionMs, anchor.received, anchor.received, anchor.id, limit + 1);
    let budget = 30000; const messages = []; let truncated = rows.length > limit;
    for (const row of rows.slice(0, limit)) {
      const m = this.store.message(row.id), reply = this.store.replyStatus(m.id).status === 'sent' ? this.store.replyText(m.id) : null;
      const size = (m.text?.length ?? 0) + (reply?.length ?? 0);
      if (size > budget) { truncated = true; break; }
      budget -= size;
      messages.push({ message_id: m.id, text: m.text, received_at: new Date(m.received).toISOString(), reply_text: reply });
    }
    return { message_id: id, messages: messages.reverse(), truncated };
  }
  defer(job, at) {
    this.store.run("UPDATE jobs SET state='pending',attempts=attempts-1,next_at=?,lease_until=NULL,lease_token=NULL WHERE id=? AND lease_token=?", at, job.id, job.lease_token);
  }
  async sendJob(job, message) {
    const now = this.bridge.clock(), id = message.id;
    const authorize = () => this.bridge.authorizeJob(job);
    if (job.kind === 'typing') {
      if (this.store.replyStatus(id).status === 'sent') { this.store.finish(job, 'cancelled', 'reply_already_sent'); return; }
      const seq = this.store.get('SELECT msg_seq FROM qq_typing WHERE message_id=?', id).msg_seq;
      await this.bridge.qq.sendTyping(message, { msgSeq: seq, authorize });
      this.store.finish(job, 'sent'); return;
    }
    let stream = this.store.get('SELECT * FROM qq_streams WHERE message_id=?', id);
    if (job.kind === 'reply' && !stream) {
      let options = this.store.get('SELECT * FROM qq_reply_options WHERE message_id=?', id);
      if (!options) this.store.tx(() => {
        options = { msg_seq: this.sequence(id), format: 'plain' };
        this.store.run('INSERT INTO qq_reply_options VALUES (?,?,?)', id, options.msg_seq, options.format);
      });
      const outbound = await this.bridge.sendQq(message, this.store.replyText(id), { ...options, msgSeq: options.msg_seq, authorize });
      this.store.recordReplyAck(job, outbound); return;
    }
    if (!stream) throw new BridgeError('QQ stream state unavailable');
    const frame = job.kind === 'stream' ? Number(job.id.slice(job.id.lastIndexOf(':') + 1)) : stream.accepted_sequence + 1;
    const prior = this.store.all("SELECT id,state FROM jobs WHERE message_id=? AND kind='stream'", id)
      .filter(v => Number(v.id.slice(v.id.lastIndexOf(':') + 1)) < frame);
    if (prior.some(v => terminal.has(v.state) && v.state !== 'sent')) throw new BridgeError('Earlier QQ stream frame did not complete');
    if (prior.some(v => v.state !== 'sent') || stream.updated + 500 > now) { this.defer(job, Math.max(now + 500, stream.updated + 500)); return; }
    const text = job.kind === 'reply' ? this.store.replyText(id) : this.frameText(id, frame);
    if (!text) throw new BridgeError('QQ stream text unavailable');
    const outbound = await this.bridge.qq.sendStream(message, text, { msgSeq: stream.msg_seq, index: frame - 1,
      streamId: stream.outbound_id, done: job.kind === 'reply', authorize });
    this.store.tx(() => {
      this.store.run('UPDATE qq_streams SET outbound_id=?,updated=? WHERE message_id=?', outbound, this.bridge.clock(), id);
      if (job.kind === 'reply') {
        this.store.run('UPDATE messages SET outbound_id=? WHERE id=?', outbound, id);
      }
      // Preserve a positive ACK even when subscription revocation cancelled the lease.
      this.store.run("UPDATE jobs SET state='sent',last_error=NULL,lease_until=NULL,lease_token=NULL WHERE id=?", job.id);
    });
  }
  prune(now) {
    this.store.run('UPDATE qq_frames SET text=NULL WHERE created<?', now - this.bridge.config.textRetentionMs);
  }
}
