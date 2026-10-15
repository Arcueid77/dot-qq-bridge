# 验证记录

> 历史归档 / Historical archive: 保留原始语言及当时的适用范围，不作为当前部署指南。
> This record retains its original language and dated scope. Start with the [current guide](../deployment.en.md) / [现行指南](../deployment.md).


## 2026-10-15 独立交付和 Windows 回归修复

基于 `65bad2244eadc89d37f13d10ff065f622959247d` 的修复工作树，
使用 Windows、本地 NTFS、Node 24.15.0 和已有 OpenSSL 3.5.6。
从受 Git 管理的源码创建独立副本，不包含飞书或 core 源码目录，也不复制
私有环境、凭据、数据库或日志；core 仍为锁定的 0.2.1 发行包。

| 检查 | 实际结果 |
| --- | --- |
| 独立锁定安装 | `npm ci --omit=dev --ignore-scripts --no-audit --no-fund --offline` 通过，使用已有缓存 |
| `npm run check` | 81 个 JavaScript 文件、JSON、26 份 Markdown 本地链接与 core 包 hash/integrity 检查通过 |
| 独立目录 `npm test` | 226 通过、0 失败、0 跳过；实际 QQ 适配器的单渠道聚合用例执行 |
| `npm run simulate` | 合成 HTTP 闭环通过，一条事件、一条原会话回复和重复抑制 |
| `npm run simulate:gateway` | 合成 loopback WebSocket 的断线恢复、已提交序号和重复抑制通过 |
| 原失败文件专项 | 14 通过、0 失败、0 跳过，含 Windows 原生权限、私有凭据和恢复流程 |
| 容器构建输入安装 | 仅复制 Dockerfile 所需文件后，锁定安装、QQ/core 模块加载和服务 plan 通过；不是 Docker build |

Dockerfile 先复制 `vendor/` 再安装，不再引用已删除的共享目录；数据目录为
0700。默认测试只使用 QQ 自己的凭据读写器、QQ 适配器和 core；双渠道用例留在
可选兼容套件中。Windows fixture 创建真实私有 DACL，保留全部运行时权限检查。
源码交接、代理、Tunnel 和开发启动器文档已按 [core 边界](core.md) 更新。

本轮未执行 Docker 构建/容器运行、更新后的 Linux 回归、新的真实消息验收或
服务切换。此前真实部署证据与合并批次、自然续订及客户端视觉效果的限制仍见
[runtime-acceptance.md](runtime-acceptance.md)，不能用本轮离线结果覆盖。

## 2026-10-02 历史本地验证

日期：2026-10-02。环境：Windows RMB16 工作区、Node `v24.15.0`。原仓库基于 `6a21cde`（只含现有 MIT LICENSE），新增代码没有覆盖已有实现；工作分支 `feat/qq-mcp-events-v1`。

## 执行结果

| 命令 | 结果 |
| --- | --- |
| `npm run check` | 32 个 JavaScript 文件语法通过；package 和两个 plugin JSON 模板可解析 |
| `node --test --test-concurrency=1 test/gateway.test.js test/connection-wizard.test.js` | 初次长连接/向导专项 19 项通过；随后补一个同步回调检查 |
| `npm run test:coverage` | 最终全量 91 项通过，0 失败/跳过；全文件行 95.95%、分支 88.09%、函数 92.44% |
| `npm run simulate` | HTTP 闭环通过；一次事件、一次回复、正确原单聊、重复入站和回复幂等 |
| Gateway integration / `npm run simulate:gateway` | 实际 loopback WebSocket，两个连接；从已提交 seq=2 恢复到 seq=4；重复消息只产生一个 event 和一个 reply |
| `npm run connect:qq -- --plan` / `--demo` | 纯离线计划与 synthetic 公开接口演练；不扫码、不写凭据、不改绑定 |
| `npm audit --omit=dev --json` | 官方 registry 对固定 `ws@8.21.0` 报告 0 个已知漏洞；不是安全证明 |
| `git diff --check` | 通过，无空白错误 |

覆盖率是测试过程指标，不代表安全证明或真实客户端兼容。模拟回答固定为 `4`，没有模型推理。测试以公开 synthetic fixture、进程内临时密钥和临时 SQLite 文件运行，未创建真实账号凭据或绑定；临时库在验证后关闭清理。

本轮长连接版本基于接入修复提交 `a1a9c0a`；已有沙箱隔离、受认证预检和 callback 手动白名单行为保留。新增 21 项测试：Gateway 原子消息/seq、恢复去重、同库租约、撤销、心跳、配额和 WSS DNS/TLS 固定；公开扫码接口默认拒绝、唯一主人、多账号选择、许可/授权门槛、取消/超时、CLI 不泄漏、不保存及同步回调清理。两个初次测试 hook 在 Windows 提前删开着的 DB/关库后释放另一 receiver，修正清理顺序后完整通过；不是隐藏的持久化失败。

扫码 connector 独立审查为 UNLICENSED、无 LICENSE，未安装/执行。固定 MIT ws 是唯一运行依赖，安装时禁用生命周期脚本；从官方 registry 下载。真正 Gateway simulation 使用受控 loopback 注入，生产 WSS 的公网 DNS/TLS/IP 规则另外测试，未用放宽网络检查接入 QQ。

## 检查范围

- QQ 官方签名/public-key golden vectors、challenge、原始字节篡改、签名时间窗口、主人默认拒绝及非文字过滤。
- MCP 2.0 discovery、元数据与 HTTP 头、严格 schema、订阅验证/刷新/轮换/撤销、签名投递和无历史 cursor。
- 真正 loopback HTTP 的收取、工具调用和模拟出站；并发去重、一条回答幂等与禁止任意收件人。
- SQLite 独立句柄 lease、独立进程/重启持久性、不同主人/AppID/主体/密钥不可复用原库、正文加密与保留。
- 内网/保留 IP、DNS rebinding、连接固定 IP 与 TLS 校验、禁止重定向、超时和体积上限。
- OAuth 合成 JWT 的 issuer、resource audience、scope、唯一 subject、RS256/JWKS、安全拒绝与到期。
- 排队/频控/有界重试、被动期限、模糊 QQ 回执不重发、发送前撤销与已发请求成功回执、优雅停机。
- Gateway 持久提交才前移 seq，失败回滚后 RESUME、重启、同库单 receiver、旧租约拒绝、缺 owner 无 I/O、配额耗尽/账号关闭停止及 Webhook 模式隔离。
- 扫码结果缺主人默认拒绝、独立验证身份显式确认、多账号只选一项、没有许可/授权不调用 adapter，错误不泄漏 SDK secret，超时/取消无配置写入。
- 本地身份 capture 验签不会自动绑定，状态命令不解密正文或输出秘密，缺配置/库失败时不创建服务。

## 没有证明的事项

**真实 QQ 或原 dot 都未连接。** 没有发出真实 QQ token/消息请求，没有 OAuth 登录、真实 callback challenge、插件注册/安装、dot 订阅或事件任务执行。没有公网 TLS 回调、固定出网配置、Docker 构建、云端部署或电脑关机测试。没有接受新的持续权限、迁移记忆或产生托管费用；代码尚未推送。

真实验收及下一步最小授权见 [activation.md](activation.md)。腾讯参考审查与版本证据见 [tencent-reference.md](tencent-reference.md)。
