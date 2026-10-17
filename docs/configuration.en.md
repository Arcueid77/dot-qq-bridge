# QQ private chat experience

[简体中文](configuration.md) | [English](configuration.en.md) | [Home](../README.en.md)

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

## Voice messages

Send a voice message to the same QQ bot. The original dot listens and replies in text to the same private chat; no new bot or transcription API key is needed. Sending voice replies is not supported.

`get_qq_message` includes voice metadata and optional QQ reference transcription. `get_qq_attachment(message_id, attachment_index:0)` returns MCP audio. The bridge prefers QQ's WAV resource, then tries the original file; SILK is decoded locally to WAV. MP3 and Ogg are also readable. Limits are one voice attachment per message, 8 MiB per resource, and two minutes for SILK decoding. Reference transcription can be inaccurate and never grants authority. It is retained in the bounded conversation context.

If audio is unavailable, the dot may use the reference transcription; without usable content, it should ask the sender to resend or use text. It must not invent the voice contents. Signed download links can expire. Real AMR bitstreams, unknown formats, images, files, videos and quoted messages remain unsupported.

Downloads use only HTTPS URLs from verified owner events on `multimedia.nt.qq.com`, `gchat.qpic.cn` and `c2cpicdw.qpic.cn`, without bot credentials or redirects. Direct requests retain public DNS/IP checks and original-host TLS validation; configured proxies remain in use. Other domains are not automatically approved. Audio is handled in memory. Resource links and reference transcription are encrypted and logically cleared after seven days; old SQLite pages, WAL and backups are not thereby physically erased.

Update the QQ backend and its router adapter together, then refresh the existing plugin catalog to discover `get_qq_attachment`. Preserve the database, storage key and single subscription. The migration only adds a nullable encrypted attachment column. Before rolling back, finish pending voice work or keep the service stopped with its pending state intact; never discard the database.

## Runtime limits

Set these in the backend environment file, not the router environment:

| Setting | Default | Meaning |
| --- | --- | --- |
| `REPLY_TTL_SECONDS` | 240 | Local reply deadline |
| `SUBSCRIPTION_TTL_SECONDS` | 86400 | Subscription lifetime cap, also bounded by the requested TTL and authenticated principal lifetime |
| `QUEUE_LIMIT` | 100 | Queue capacity |
| `INBOUND_PER_MINUTE` / `REPLIES_PER_MINUTE` | 10 / 10 | Intake/reply rate limits |
| `MAX_DELIVERY_ATTEMPTS` | 5 | Bounded attempts, never permission to resend an uncertain reply |

QQ text retention is seven days in code. A retained context record does not extend QQ's passive-reply window or authorize a proactive send.
