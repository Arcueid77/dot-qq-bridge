# Sources and dependencies

[简体中文](THIRD_PARTY_NOTICES.md) | [English](THIRD_PARTY_NOTICES.en.md) | [Home](README.en.md)

The project's [MIT LICENSE](LICENSE) is unchanged and does not replace the licenses of dependencies or runtime components.

- `ws@8.21.0` is a pinned MIT runtime dependency. Its copyright and license are retained in [licenses/ws-MIT.txt](licenses/ws-MIT.txt); `package-lock.json` fixes version and integrity. Optional native peers are not installed.
- `@tencent-connect/qqbot-connector@1.2.0` is integrated through its public `startQrConnect` API. The pinned package metadata is `UNLICENSED` with no separate LICENSE. Tencent's MIT wrapper does not relicense that dependency, and its internals are not copied into this source tree. Distribution or commercial use needs a separate review of granted rights; the project's license cannot substitute for them. See [Deployment](docs/deployment.en.md) for scanning and credential storage.
- Tencent Connect's [openclaw-qqbot](https://github.com/tencent-connect/openclaw-qqbot), fixed commit `a730701d36aa7a070f98d4cba0f340f91f15e5f5`, was reviewed for protocol behavior without importing its runtime. Its [MIT LICENSE](https://github.com/tencent-connect/openclaw-qqbot/blob/a730701d36aa7a070f98d4cba0f340f91f15e5f5/LICENSE) names sliverp / Tencent Connect.
- `@tencent-connect/qqbot-nodejs@1.0.4` was used only for static protocol review, declares MIT in metadata and is not a runtime dependency. The reviewed archive integrity is `sha512-gU5HySLplczZXMUjM7NtiUACY7YfX9YlI/R9PKzCLMgLmHvwsX9L2sitsrYPMentGUr9b8NLfSaSTsndF77NBA==`.
- Shared implementation comes from the pinned `@dot-bridge/core` distribution; `vendor/core-release.json` records version, source revision and hash. No separate implementation copy is maintained here.
- Node.js and the [official Node Docker image](https://github.com/nodejs/docker-node) carry component-specific licenses. Retain applicable notices when distributing an image containing dependencies.

Public protocol sources: [QQ documentation](https://bot.q.qq.com/wiki/), [Tencent SDK usage](https://github.com/tencent-connect/qqbot-nodejs/blob/main/USAGE.md), [MCP Events](https://developers.openai.com/plugins/build/mcp-events), [OpenAI authentication](https://developers.openai.com/plugins/build/auth) and [Standard Webhooks](https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md). The bridge implements its own restricted requests, signing and durable state without reproducing official documentation or copying Standard Webhooks library source.
