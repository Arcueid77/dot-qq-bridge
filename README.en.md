# dot-qq-bridge

[简体中文](README.md) | [English](README.en.md)

Connect an official QQ bot's owner-only private chat to your existing OpenAI dot, which replies in that same conversation through the official Secure MCP Tunnel. No model API is used.

Clone only this repository. A pinned `@dot-bridge/core` distribution is included in `vendor/`; neither Feishu nor core source checkouts are required.


Received attachments can be reused by their source-message index, without copying Base64 through the model. Platform format, size and media-configuration limits still apply. Plain UTF-8 and BOM-marked UTF-16 documents include bounded text excerpts; truncated excerpts are explicitly marked and the original file remains available.

## Capabilities

- Owner C2C text, images, voice and files, retained context, Markdown and answers up to 30000 characters.
- A native input notification when processing starts, plus native updates to one reply.
- Durable queues, deduplication and restart recovery; uncertain sends are never automatically resent.
- Optional owner-only proactive text and once/daily/weekly reminders, reusing encrypted state. Disabled by default; verify actual QQ application eligibility and quota before enabling. See [configuration](docs/configuration.en.md#owner-proactive-text-and-saved-reminders).
- Reply with images, files or existing audio; PCM WAV is converted locally to QQ SILK. Incoming attachments are capped at 5 MiB and outgoing attachments at 5 MiB.
- The original dot interprets voice, using QQ WAV resources or local SILK decoding. Audio replies can use existing bytes or the optional protected local speech synthesizer.
- Selected official QQ group mentions use protected membership rules. Owner C2C is the default; guild channels and video keep their separate provider limits. When the platform supplies a quote ID, retained quoted content is resolved only within the same owner and subscription generation; missing references never fetch another conversation.

## Start here

| Goal | Guide |
| --- | --- |
| Install, scan, connect the original dot and run continuously | [Deployment](docs/deployment.en.md) |
| Configure reply behavior and understand tools and limits | [Configuration](docs/configuration.en.md) |
| Diagnose missing replies, expiry, backups and upgrades | [Operations and troubleshooting](docs/troubleshooting.en.md) |
| Change code, add IM adapters or contribute a PR | [Development](docs/development.en.md) |

## Runtime

Use Node.js **>=24.15 and <25** on a continuously running Linux VPS or native Windows with local NTFS. Windows also needs Python 3.10+. The deployment guide covers installation, owner pairing and systemd; development commands are in the development guide.

## Authorization and license

Each installation uses its own app authorization, owner binding, private state and Tunnel. Scanning, persistent credential storage, new permissions and subscriptions require operator participation. Keep secrets out of Git, chats and logs. Every Tunnel Use holder receives the local service owner's authority, so this mode is for private deployments.

The project uses the [MIT license](LICENSE). See [third-party notices](THIRD_PARTY_NOTICES.en.md) for dependency provenance and the scanner's separate licensing boundary.


Shared owner IM maintenance (`/status`, `/queue`, `/subscription`, `/cancel`) preserves the existing inbox, keys and subscriptions. Optional management-only gateway connection and shared protected document extraction are described in [configuration](docs/configuration.en.md).


## Interaction and maintenance

`begin_qq_reply` signals genuine processing. `append_qq_reply` submits complete cumulative generated text with consecutive sequence numbers, then `reply_to_qq` finalizes the same native stream. Retained context/quotes stay within the same owner and subscription generation. PDF/Office excerpts use the protected shared worker.

The owner DM supports `/help`, `/status`, `/queue`, `/subscription`, and `/cancel [reference]`. In standard callback mode, explicit `DOT_BRIDGE_OWNER_MANAGEMENT=1` keeps maintenance connected without an active dot subscription. Cancel only unsent bridge replies; the current legitimate begin/append flow still completes one final answer, while uncertain outcomes remain for review. See [configuration](docs/configuration.en.md).

See [deployment](docs/deployment.en.md) for Windows/Linux foreground and Linux systemd operation. macOS is unverified; trials and feedback are welcome. Hosted-dot pause/reset/approval remain in the original platform.

## Choices, uploads and reminder management

Numbered text choices let the user answer with a selection. A dot environment with programmatic file access can upload generated media in bounded encrypted chunks, verify its size and SHA-256, then submit the source-bound final reply. Files are limited to 5 MiB and this provider's supported media types and formats.

Literal reminders support weekdays, fixed intervals, pause, resume and delivery history. Check `check_qq_outbound` before use and supply the saved reminder ID and current revision. Resuming skips old paused occurrences.


## Tasks, consecutive messages and speech

Task tools return a source-bound reference, passive deadline and remaining seconds. The original dot can save one complete text result. The paired owner can use `/tasks` and `/result reference` in the original DM. Source retention applies, and ambiguous delivery stays uncertain.

The protected interaction policy accepts `queue`, for example `{"mode":"batch","window_ms":750,"max_messages":5}`. Modes are `independent`, `serial` and `batch`, defaulting to independent. A batch retains every source and replies through the last source as its anchor. Attachments, quotes and work already started are handled separately, with the existing conversation/member isolation.

Linux operators can install eSpeak NG and the protected audio runtime, then set `DOT_BRIDGE_SPEECH_SYNTHESIS=local-espeak` and `DOT_BRIDGE_SPEECH_VOICE=zh`. The original dot uses `check_qq_speech` and `reply_qq_speech`, limited to 2000 characters and 120 seconds. The full text is also retained in the task record.

An explicitly rejected one-time proactive send can be retried after owner confirmation using `retry_qq_outbound`, its original ID and current revision. The per-channel proactive switch still applies. Recurring reminders keep their edit/resume flow. Hosted-dot stop, reset and approvals use the original platform controls.

## Selected QQ groups

`DOT_BRIDGE_INTERACTION_POLICY_FILE` points to protected JSON. Its `groups` use the shared `conversation_id`, `members`, `allow_from`, `mention`, `auto_reply`, `keywords` and `context_scope` fields. Membership supports owner, allowlist and all. Reception follows the official QQ group-mention events actually delivered. No group is enabled by default. Coordinate the original dot's single subscription to `conversation=configured` before enabling groups. Replies retain the original provider message ID, and group/private context stays separate. Long group answers use a file.
