# QQ private chat experience

[简体中文](configuration.md) | [English](configuration.en.md) | [Home](../README.en.md)

`check_bridge_setup` reports gateway and original-dot subscription state separately, including the stored expiry and complete pending, processing and uncertain outbound-work counts. The gateway waits for a valid subscription. Missing diagnostic history cannot reconstruct an earlier failure. Reading status never renews a subscription or changes configuration.

QQ continues to use `MCP_CALLBACK_ALLOWED_HOSTS`. A mistakenly supplied `CALLBACK_HOSTS` setting is reported as a name mismatch; its domains are not accepted or copied automatically.

The original dot still produces the answer. No model API, OpenClaw runtime or
second bot is introduced. Shared network, filesystem and router implementations
come exclusively from the fixed core release. QQ-specific operations stay here.

When actual processing starts, call `begin_qq_reply(message_id)` once. This queues
QQ's native `msg_type=6` input notification for 60 seconds. It consumes one
passive send sequence and does not renew the incoming message's deadline. There
is no repeated typing keepalive. Notification failure must not be confused with
answer delivery. The backend persists both sequences independently.

Use `get_qq_context(message_id,limit?)` for follow-ups. It returns at most 20
messages, 30000 characters in total, only from the same owner and subscription
generation and within seven-day retention. Only positively acknowledged answers
are included. An expired passive reply window never permits a new send, even
though retained context remains readable through a valid subscription.

For native C2C streaming call `append_qq_reply(message_id,sequence,text)` with the
complete genuinely generated text so far. Sequences start at one and are
consecutive; every new snapshot extends the previous text. Identical sequence
retries are idempotent. The backend uses one stable `msg_seq`, consecutive QQ
`index` values, replace-mode, and a minimum 500 ms between acknowledged frames.
It persists the returned stream ID before subsequent frames. Use `reply_to_qq`
with the complete final text to send DONE in the same stream. Do not replay a
finished answer in pieces to create a fake streaming effect.

`reply_to_qq` accepts `format:plain|markdown` (default plain). Short non-streamed
answers use QQ's ordinary passive endpoint; Markdown uses the official Markdown
body. Answers above 2000 characters (maximum 30000) use one native DONE message.
This requires the selected application's existing platform capability. The
bridge never silently expands permissions or splits an unknown send into more
messages. Explicit provider rejection is a failure, not delivery. Connection
loss, malformed acknowledgement or interrupted leased send becomes uncertain;
neither the frame nor a replacement answer is automatically resent.

Native input status/streaming and Markdown are based on Tencent's official
[Node.js SDK](https://github.com/tencent-connect/qqbot-nodejs/blob/main/USAGE.md),
whose public protocol was inspected. The bridge keeps its own guarded requester
and durable worker; it does not import SDK retry policies or raw-message logging.
Offline tests do not prove this application's live permissions or visible UX.

For event-triggered conversations, the saved task must process every distinct
`message_id`, including all entries in a combined batch. Check each deadline and
durable reply state independently. Ordinary follow-ups and explanations that an
external action needs confirmation should return to the bound QQ private chat;
this does not authorize that external action. A ChatGPT task-run confirmation
does not establish QQ delivery. Report a conflicting platform instruction
instead of treating a ChatGPT summary as a completed QQ reply or bypassing the
platform's restriction. See [troubleshooting](troubleshooting.en.md) for the
observed batch conflict and the narrower successful consecutive-message test.

Initial deployment remains owner C2C only. QQ group, guild and other-user messages
are ignored. There is no unapproved group subscription or all-member access.

## Images, voice and files

Send an image, voice message or file to the same QQ bot. The dot reads the attachment list, then the selected attachment by its zero-based index. Reads remain bound to the original owner's private message; no arbitrary URL, local path or recipient is accepted.

`get_qq_message` lists up to 10 attachments, each bounded to 5 MiB. `get_qq_attachment(message_id, attachment_index)` returns PNG/JPEG/GIF/WebP images, MCP file resources, or audio. Voice prefers QQ's WAV resource and falls back to the original file; SILK is decoded locally to WAV. MP3 and Ogg are also readable. SILK is limited to two minutes. QQ reference transcription can be inaccurate and never grants authority.

Use `reply_qq_media` for one final image, file or existing audio reply. PNG/JPEG images and SILK voice are supported; 16-bit mono PCM WAV is converted locally to SILK, up to two minutes. Outgoing attachments are capped at 5 MiB for the official direct-upload path. Other audio can be sent as a file. No text-to-speech service or external file hosting is included. Finish an existing text stream as text before using media for another source message.

If audio is unavailable, use an existing reference transcription or ask the sender to resend or use text. Signed links can expire. Real AMR bitstreams, unknown formats, video and quoted messages remain unsupported. File and audio interpretation also depends on the original dot's capabilities.

Downloads use only HTTPS URLs from verified owner events on `multimedia.nt.qq.com`, `gchat.qpic.cn` and `c2cpicdw.qpic.cn`, without bot credentials or redirects. Direct requests retain public DNS/IP checks and original-host TLS validation; configured proxies remain in use. Other domains are not automatically approved. Audio is handled in memory. Resource links and reference transcription are encrypted and logically cleared after seven days; old SQLite pages, WAL and backups are not thereby physically erased.

Update the QQ backend and its router adapter together, then refresh the existing plugin catalog to discover `get_qq_attachment` and `reply_qq_media`. Preserve the database, storage key and single subscription. Media uses the existing encrypted queue; older versions cannot process these jobs. Follow the downgrade rules in [troubleshooting](troubleshooting.en.md).

Uploads follow Tencent's [C2C media interface](https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/v2_users_user_openid_files.post.html): upload first, then reply passively to the source message. A platform rejection never causes a switch of bot, broader permissions or proactive sends.

Retained encrypted media replies are limited to 64 MiB in total, including uncertain outcomes. At the limit, new media is refused before queueing; an identical existing reply can still return its status. Do not delete state or turn an uncertain job back into pending to free space. Follow the retention policy and reconcile the original chat first.

## Runtime limits

For hosts that omit native MCP audio, read `extracted_text` from `get_qq_attachment`. QQ reference transcription is preferred. Linux can fall back to local Whisper: set `DOT_BRIDGE_AUDIO_TRANSCRIPTION=local-whisper`, `DOT_BRIDGE_WHISPER_BINARY` and `DOT_BRIDGE_WHISPER_MODEL` in the backend environment. The latter two are absolute paths to a reviewed root-owned whisper-cli and multilingual model, neither writable by the service user. Install `/usr/bin/ffmpeg`, `prlimit`, `flock`; both backends share their existing private `BRIDGE_LOCK_DIRECTORY` to serialize recognition. Audio stays in memory pipes on the VPS; no transcription API key is used. The original dot still replies.

Local recognition is limited to 5 MiB, 120 seconds of audio, 28 seconds of processing and 12000 output characters. Busy, timed-out or unclear audio requires a shorter recording or text. Treat transcription as an imperfect reference. Refresh the existing plugin catalog after upgrading; do not create another subscription.

Compile core's included `audio/no-core-dump.c` as a shared library in the protected runtime directory and set its absolute path in `DOT_BRIDGE_AUDIO_GUARD`. It makes audio subprocesses nondumpable, including on systems with piped crash collectors. Local recognition refuses to run without this protection.

Set these in the backend environment file, not the router environment:

| Setting | Default | Meaning |
| --- | --- | --- |
| `REPLY_TTL_SECONDS` | 240 | Local reply deadline |
| `SUBSCRIPTION_TTL_SECONDS` | 86400 | Subscription lifetime cap, also bounded by the requested TTL and authenticated principal lifetime |
| `QUEUE_LIMIT` | 100 | Queue capacity |
| `INBOUND_PER_MINUTE` / `REPLIES_PER_MINUTE` | 10 / 10 | Intake/reply rate limits |
| `MAX_DELIVERY_ATTEMPTS` | 5 | Bounded attempts, never permission to resend an uncertain reply |

QQ text retention is seven days in code. A retained context record does not extend QQ's passive-reply window or authorize a proactive send.
