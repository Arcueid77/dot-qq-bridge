# dot-qq-bridge

[简体中文](README.md) | [English](README.en.md)

Connect an official QQ bot's owner-only private chat to your existing OpenAI dot, which replies in that same conversation through the official Secure MCP Tunnel. No model API is used.

Clone only this repository. A pinned `@dot-bridge/core` distribution is included in `vendor/`; neither Feishu nor core source checkouts are required.

## Capabilities

- Owner C2C text, retained conversation context, Markdown and answers up to 30000 characters.
- A native input notification when processing starts, plus native updates to one reply.
- Durable queues, deduplication and restart recovery; uncertain sends are never automatically resent.
- QQ groups, guilds, other members, inbound attachments and quotations are outside the current scope.

## Start here

| Goal | Guide |
| --- | --- |
| Install, scan, connect the original dot and run continuously | [Deployment](docs/deployment.en.md) |
| Configure reply behavior and understand tools and limits | [Configuration](docs/configuration.en.md) |
| Diagnose missing replies, expiry, backups and upgrades | [Operations and troubleshooting](docs/troubleshooting.en.md) |
| Change code, add IM adapters or contribute a PR | [Development](docs/development.en.md) |

Completed handoffs and duplicate guides have been removed from the current tree; use Git history when tracing earlier work.

## Offline checks

Use Node.js **>=24.15 and <25** and trusted OpenSSL for TLS tests. Windows also requires Python 3.10+ and local NTFS; use `npm.cmd` if PowerShell restricts `npm.ps1`.

```sh
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
npm run check
npm test
npm run simulate
npm run simulate:gateway
```

Linux and native Windows have platform-specific private-file protection. Other operating systems are not supported for private Tunnel operation. The guide covers persistent Linux systemd services; Windows needs a separately configured background service with graceful stopping. A Docker template exists, but image building and runtime acceptance require separate verification.

Tests use synthetic identities and local services. The 2026-10-15 standalone Windows regression recorded 226 passes, zero failures and zero skips. A separate [validation scope](docs/development.en.md) documents actual replies. Combined batches, visible client effects and natural subscription renewal retain acceptance gaps; one deployment does not prove every environment.

## Authorization and license

Each installation uses its own app authorization, owner binding, private state and Tunnel. Scanning, persistent credential storage, new permissions and subscriptions require operator participation. Keep secrets out of Git, chats and logs. Every Tunnel Use holder receives the local service owner's authority, so this mode is for private deployments.

The project uses the [MIT license](LICENSE). See [third-party notices](THIRD_PARTY_NOTICES.en.md) for dependency provenance and the scanner's separate licensing boundary.
