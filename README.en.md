# dot-qq-bridge

[简体中文](README.md) | [English](README.en.md)

Connect an official QQ bot's owner-only private chat to your existing OpenAI dot, which replies in that same conversation through the official Secure MCP Tunnel. No model API is used.

Clone only this repository. A pinned `@dot-bridge/core` distribution is included in `vendor/`; neither Feishu nor core source checkouts are required.

## Capabilities

- Owner C2C text, images, voice and files, retained context, Markdown and answers up to 30000 characters.
- A native input notification when processing starts, plus native updates to one reply.
- Durable queues, deduplication and restart recovery; uncertain sends are never automatically resent.
- Reply with images, files or existing audio; PCM WAV is converted locally to QQ SILK. Incoming attachments are capped at 5 MiB and outgoing attachments at 5 MiB.
- The original dot interprets voice, using QQ WAV resources or local SILK decoding. Audio replies require existing bytes; no text-to-speech service is included.
- QQ groups, guilds, other members, videos and quoted messages are not supported.

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
