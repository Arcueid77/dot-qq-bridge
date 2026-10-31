# dot-qq-bridge

[简体中文](README.md) | [English](README.en.md)

把 QQ 官方机器人本人私聊接到现有 OpenAI dot，再由同一个 dot 回复原私聊。使用官方 Secure MCP Tunnel，不调用模型 API。

只需克隆本仓库；固定版本 `@dot-bridge/core` 已随 `vendor/` 提供，无需飞书或 core 源码仓库。

## 支持什么

- 本人 C2C 文字、图片、语音和文件，连续上下文、Markdown、最长 30000 字符回答。
- 实际处理时的原生输入提示、同一回复的原生流式更新。
- 持久队列、去重、重启恢复；发送结果不明时停止自动重发。
- 可回复图片、文件或已有音频；WAV 语音会在本机转为 QQ 使用的 SILK。接收附件最多 5 MiB，回复附件最多 5 MiB。
- 语音交给原 dot 理解；支持 WAV 音频和 SILK 本地解码，无需另配转写 API。语音回复需要已有音频，不包含文字转语音服务。
- 当前不接收 QQ 群、频道、其他成员、视频或引用消息。

## 从这里开始

| 你要做什么 | 文档 |
| --- | --- |
| 从零安装、扫码、接回原 dot、长期运行 | [部署指南](docs/deployment.md) |
| 调整回复体验、理解工具与限制 | [功能配置](docs/configuration.md) |
| 查不回复、过期、重复、备份及升级 | [运行与排错](docs/troubleshooting.md) |
| 修改代码、接入更多 IM、提交 PR | [开发说明](docs/development.md) |

## 运行环境

需要 Node.js **>=24.15 且 <25**。可以部署在长期运行的 Linux VPS，或支持私有文件保护的 Windows 本地 NTFS；Windows 还需要 Python 3.10+。安装、原应用配对与 systemd 常驻步骤见部署指南，开发测试命令见开发说明。

## 授权和许可

每个部署使用自己的应用授权、主人绑定、私有状态及 Tunnel。首次扫码、保存长期凭据、增加权限和创建订阅需要操作者参与；秘密不写入 Git、聊天或日志。所有 Tunnel Use 持有者都拥有本地服务身份的权限，因此此模式只用于私有部署。

项目采用 [MIT](LICENSE)；依赖与来源见[第三方声明](THIRD_PARTY_NOTICES.md)。扫码依赖有独立的许可边界，不能用本项目许可覆盖。
