# dot-qq-bridge

[简体中文](README.md) | [English](README.en.md)

把 QQ 官方机器人本人私聊接到现有 OpenAI dot，再由同一个 dot 回复原私聊。使用官方 Secure MCP Tunnel，不调用模型 API。

只需克隆本仓库；固定版本 `@dot-bridge/core` 已随 `vendor/` 提供，无需飞书或 core 源码仓库。

## 支持什么

- 本人 C2C 文字、连续上下文、Markdown、最长 30000 字符回答。
- 实际处理时的原生输入提示、同一回复的原生流式更新。
- 持久队列、去重、重启恢复；发送结果不明时停止自动重发。
- 当前不接收 QQ 群、频道、其他成员、入站附件或引用。

## 从这里开始

| 你要做什么 | 文档 |
| --- | --- |
| 从零安装、扫码、接回原 dot、长期运行 | [部署指南](docs/deployment.md) |
| 调整回复体验、理解工具与限制 | [功能配置](docs/configuration.md) |
| 查不回复、过期、重复、备份及升级 | [运行与排错](docs/troubleshooting.md) |
| 修改代码、接入更多 IM、提交 PR | [开发说明](docs/development.md) |

旧方案和有日期的验收证据放在[历史归档](docs/archive/README.md)，首次部署无需逐篇阅读。

## 离线检查

需要 Node.js **>=24.15 且 <25**，TLS 测试需要可信 OpenSSL。Windows 还需要 Python 3.10+ 与本地 NTFS；PowerShell 可用 `npm.cmd`。

```sh
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
npm run check
npm test
npm run simulate
npm run simulate:gateway
```

Linux 与原生 Windows 有相应私有文件保护实现；其他系统尚不支持私人 Tunnel 运行。Linux 的 systemd 持续部署步骤见指南；Windows 运行需要独立配置能处理优雅停止的后台服务。Docker 模板存在，但镜像构建和运行须另行验证。

测试使用合成身份与本机服务，不接真实账户。2026-10-15 的 Windows 独立回归为 226 通过、0 失败、0 跳过；真实 VPS 收发记录另见[验收归档](docs/archive/runtime-acceptance.md)。合并批次、客户端提示视觉效果和自然续订仍有未验收项，不能把一次部署结果当作所有环境的保证。

## 授权和许可

每个部署使用自己的应用授权、主人绑定、私有状态及 Tunnel。首次扫码、保存长期凭据、增加权限和创建订阅需要操作者参与；秘密不写入 Git、聊天或日志。所有 Tunnel Use 持有者都拥有本地服务身份的权限，因此此模式只用于私有部署。

项目采用 [MIT](LICENSE)；依赖与来源见[第三方声明](THIRD_PARTY_NOTICES.md)。扫码依赖有独立的许可边界，不能用本项目许可覆盖。
