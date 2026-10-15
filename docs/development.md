# 开发说明

[简体中文](development.md) | [English](development.en.md) | [首页](../README.md)

日常安装和操作只需[部署](deployment.md)、[功能配置](configuration.md)和[运行排错](troubleshooting.md)。本页面向修改代码的维护者；旧设计和逐次验证记录保存在[归档](archive/README.md)，不再作为并行维护的现行指南。

## 仓库职责

| 部分 | 位置与职责 |
| --- | --- |
| 共享实现 | [dot-bridge-core](https://github.com/AvaloNero/dot-bridge-core)：callback 传输、私有文件/平台锁、注册渠道聚合器 |
| 本 IM 适配器 | `src/tunnel-adapter.js`：本渠道工具、事件及协议 |
| 平台与业务 | 本仓库 `src/`：SDK/网关、身份校验、持久队列、受限回复、体验 |
| 单渠道入口 | `scripts/run-tunnel-router.js` 只注册本仓库适配器 |
| 固定发行包 | `vendor/core-release.json`、`vendor/*.tgz`、lockfile 共同记录版本、源码 revision 与 integrity |

core 不导入各 IM 的 SDK；新增渠道应持有自身适配器并使用公共接口，不复制一份共享实现。固定包可独立部署，安装不需 core 或其他 IM 源码。修改 core 时发布新的不可变版本并更新消费者的包、元数据与锁文件，不能覆盖同名版本。

`packages/dot-bridge-tunnel` 和 `tools/tunnel-stack` 是旧双适配器兼容/开发入口，需要同级飞书源码。它们不是单 QQ 正式部署依赖，也不含第二份共享路由实现。

## 必须保留的约束

- 持久提交后才 ACK；入站身份、订阅代次、期限、去重、租约和回复状态都在服务端校验。
- 工具按已核验的源消息定位原会话，不开放任意收件人或 URL；同一入站最多一个逻辑回答。
- HTTPS、公网 DNS/IP 固定、原域名 TLS 校验和禁止重定向；代理无法满足策略时拒绝，不偷偷回退。
- 认证/回调、平台请求和可选 Sites 路径各有边界。runtime key 不是外部用户身份，`clientInfo` 不是认证。
- 回复处理中崩溃或 ACK 不明进入 uncertain，禁止自动重发。订阅撤销/过期立即限制后续读取、入站和发送。
- 不记录凭据、身份、正文或完整地址；SQLite 只加密载荷与部分秘密，元数据和去重 ID 仍依赖私有磁盘保护。
- 同机模式锁不提供跨主机互斥。普通常驻服务不使用有限窗口/依赖 stdin 的开发监督器。

协议依据和早期兼容路径见[协议归档](archive/protocol.md)、[架构归档](archive/architecture.md)。OAuth 兼容路径验证既有发行方 RS256/JWKS；Sites 是另行授权和验证的模式，不作为 Tunnel 失败后的自动降级。

## 验证和提交

在不含其他 IM/core 源码的独立目录执行：

```sh
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
npm run check
npm test
npm run simulate
```

QQ 另外运行 `npm run simulate:gateway`。默认套件应独立完成；可选双适配器测试才需要同级飞书。 对共享实现的修改应在 core 仓库运行相应测试。记录精确 SHA、OS、Node、通过/失败/跳过/未运行；Windows 结果不能替代 Linux，合成结果不能替代真实消息验收。

文档以中文主文件和同目录 `.en.md` 成对维护。首页只链接四份现行指南；同一流程只维护一处。`docs/languages.json` 列出当前双语文件，`npm run check` 检查覆盖、切换链接及本地链接。历史归档保留原语言和原时间范围，不重新包装成当前保证。

PR 先确认变更范围、通过适用检查并更新描述。希望保留普通提交且避免额外 merge commit 时，选择 **Rebase and merge**：

```sh
gh pr merge PR_NUMBER --rebase
```

若只需保留一个整理后的功能提交，可选择 **Squash and merge**。不要选择 Create a merge commit。合并前需要解决冲突并按仓库规则完成检查；已发布主干的历史重写须单独明确授权，并保留回滚引用及精确旧 SHA 保护。
