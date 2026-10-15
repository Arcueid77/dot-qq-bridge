# 来源审查

[简体中文](THIRD_PARTY_NOTICES.md) | [English](THIRD_PARTY_NOTICES.en.md) | [首页](README.md)

本桥按公开协议规范实现，使用 Node.js 内置模块和 MIT 运行依赖 `ws@8.21.0`。该包从官方 npm registry 下载，禁用生命周期脚本；精确版本和 integrity 固定在 `package-lock.json`，版权与许可证保存在 [licenses/ws-MIT.txt](licenses/ws-MIT.txt)。不安装可选原生 peer。仓库原有 MIT LICENSE 保持不变。

以下为最初静态审查阶段的记录；当前官方扫码包作为依赖的使用状态见本页末节。

- 腾讯 Connect 的 [openclaw-qqbot](https://github.com/tencent-connect/openclaw-qqbot)，提交 `a730701d36aa7a070f98d4cba0f340f91f15e5f5`，MIT，版权声明署名 sliverp / Tencent Connect，见固定提交的 [LICENSE](https://github.com/tencent-connect/openclaw-qqbot/blob/a730701d36aa7a070f98d4cba0f340f91f15e5f5/LICENSE)。仅审查，未导入或打包运行源码。
- `@tencent-connect/qqbot-nodejs@1.0.4` 的发布 metadata 声明 MIT；仅从 `registry.npmjs.org` 下载供静态协议审查，禁用生命周期脚本。Integrity 见 [腾讯参考](docs/archive/tencent-reference.md)。
- `@tencent-connect/qqbot-connector@1.2.0` 的 metadata 声明 `UNLICENSED`，没有 LICENSE 文件。最初在仓库外下载，仅审查 README、公开类型声明、metadata 和文件列表；当时未复制、导入、安装、打包或执行运行代码。准备的 callback 接口是按公开契约自行实现，真实使用需独立许可审查和主人授权，见 [连接向导](docs/archive/connection.md)。
- [Standard Webhooks 规范](https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md)，以及 [协议](docs/archive/protocol.md) 中引用的 MCP/OpenAI/QQ 来源。未打包 Standard Webhooks 库源码。

部署模板使用 [官方 Node Docker 镜像](https://github.com/nodejs/docker-node)。上述工作未构建或再分发镜像。未来部署镜像包含自身操作系统与 Node 组件许可证，分发时必须保留相关声明。

## 官方扫码依赖（2026-10-02）

`@tencent-connect/qqbot-connector@1.2.0` 后续已作为普通固定版本 npm 依赖，通过公开 API 使用。其 metadata 仍为 UNLICENSED，未附单独许可证。腾讯 MIT OpenClaw 包装层导入同一包，但不会使该依赖重新获得 MIT 许可。本源码树没有复制依赖实现，本地提交不包含该依赖的再分发。正常集成证据和发布限制见 [官方扫码](docs/archive/official-qr.md)。传递依赖 qrcode-terminal 由 `package-lock.json` 固定。
