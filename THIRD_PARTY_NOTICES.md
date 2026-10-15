# 来源与依赖

[简体中文](THIRD_PARTY_NOTICES.md) | [English](THIRD_PARTY_NOTICES.en.md) | [首页](README.md)

本项目的 [MIT LICENSE](LICENSE) 保持不变；该许可不替代第三方依赖或运行环境各自的许可。

- `ws@8.21.0` 是固定版本的 MIT 运行依赖；版权与许可证见 [licenses/ws-MIT.txt](licenses/ws-MIT.txt)。版本和包 integrity 在 `package-lock.json` 中保存，不安装可选原生 peer。
- `@tencent-connect/qqbot-connector@1.2.0` 通过公开 `startQrConnect` API 集成，固定包 metadata 为 `UNLICENSED`，未附独立 LICENSE。腾讯 MIT 包装层不使该依赖自动获得 MIT 许可；本源码树不复制其内部实现。分发或商业使用需单独核对授权范围，不能用本项目许可覆盖。实际扫码及凭据保存见[部署指南](docs/deployment.md)。
- 腾讯 Connect 的 [openclaw-qqbot](https://github.com/tencent-connect/openclaw-qqbot) 固定提交 `a730701d36aa7a070f98d4cba0f340f91f15e5f5` 仅供协议审查，未导入其运行时。其 [MIT LICENSE](https://github.com/tencent-connect/openclaw-qqbot/blob/a730701d36aa7a070f98d4cba0f340f91f15e5f5/LICENSE) 署名 sliverp / Tencent Connect。
- `@tencent-connect/qqbot-nodejs@1.0.4` 仅用于静态协议审查，metadata 为 MIT，未作为运行依赖。审查包 integrity 为 `sha512-gU5HySLplczZXMUjM7NtiUACY7YfX9YlI/R9PKzCLMgLmHvwsX9L2sitsrYPMentGUr9b8NLfSaSTsndF77NBA==`。
- 共享实现来自固定 `@dot-bridge/core` 发行包；版本、来源 revision 和 hash 见 `vendor/core-release.json`。不另维护共享实现副本。
- Node.js 及 [官方 Node Docker 镜像](https://github.com/nodejs/docker-node) 有自身组件许可。分发含依赖的镜像时保留全部适用声明。

公开协议依据：[QQ 官方协议](https://bot.q.qq.com/wiki/)、[腾讯 SDK 使用说明](https://github.com/tencent-connect/qqbot-nodejs/blob/main/USAGE.md)、[MCP Events](https://developers.openai.com/plugins/build/mcp-events)、[OpenAI 鉴权](https://developers.openai.com/plugins/build/auth)、[Standard Webhooks](https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md)。本桥自行实现受限请求、签名与持久状态，不复制官方文档全文或 Standard Webhooks 库源码。
