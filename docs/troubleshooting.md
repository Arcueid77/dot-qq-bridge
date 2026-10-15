# 运行与排错

[简体中文](troubleshooting.md) | [English](troubleshooting.en.md) | [首页](../README.md)

本文用于已按[部署指南](deployment.md)配置的实例。服务名和路径均为示例，先核对实际配置。操作者查看脱敏状态即可，不要把整个环境、数据库、消息正文或完整 callback URL 发到聊天。

## 逐层检查

| 层级 | 能说明什么 |
| --- | --- |
| 安装、check、test | 对应提交在该环境的离线检查结果 |
| 进程与 /healthz | 进程存活 |
| 本地鉴权、工具和事件目录 | MCP 路由及认证可用 |
| 官方 Tunnel connected | 隧道传输已连接 |
| 唯一有效订阅及 signed challenge | 原 dot 的投递通路已建立 |
| 平台 Gateway connected | 平台长连接已建立 |
| 原 dot 读取/回复、平台 ACK、本人原聊天收到 | 真实端到端结果 |

聚合器的 `/readyz` 按实现固定返回 503，不能单独据此判定故障。后端 readiness 还依赖配置、订阅及网关，目录发现或任何单项 ready 都不是模型已回答的证据。

```sh
systemctl is-active dot-bridge-qq.service dot-bridge-router.service
sudo -u dot-bridge /ABSOLUTE/NODE --env-file=/var/lib/dot-bridge/private/qq.env /opt/dot-bridge/dot-qq-bridge/scripts/status.js
systemctl stop dot-bridge-qq.service
systemctl start dot-bridge-qq.service
```

替换 Node 路径后执行。状态命令只读队列计数，不发送、不解密正文。服务启动日志和受同一 MCP 认证保护的 `check_bridge_setup` 可补充配置缺项与 callback 主机名；不得为了诊断开放公共管理端口。

## 常见问题

| 现象 | 排查和处理 |
| --- | --- |
| 启动拒绝私有文件 | 检查绝对路径、最终运行用户、0700/0600 或 Windows DACL、单链接、无 symlink/reparse point；不要放宽校验 |
| callback policy pending | 从原 dot 真实订阅流程获取地址，仅批准精确主机；不猜地址或使用通配符 |
| callback transport pending | 检查标准直连或已批准代理是否有受支持 adapter；不能用环境标记伪造验证或绕过必要代理 |
| 工具缺失 | 核对聚合器所注册渠道、live 设置及原插件目录；刷新同一插件，保留原 dot |
| 事件已投递但没回复 | callback 2xx 只是异步接收；检查原 dot 任务运行、权限、所有批次 message_id、读取/回复工具调用及回复期限 |
| pending 增长 | 查订阅、网络、限流和容量，不盲目增加消费者 |
| uncertain | 官方 ACK 不确定或发送中断；保留状态，核对本人会话，禁止自动重发或改成 pending |
| expired / 过窗未回复 | 窗口已过，不能降级为主动消息；请本人发送新的普通消息 |
| dead / cancelled | 查看脱敏错误类别、平台权限或订阅撤销；重建订阅不授权旧代次工作 |
| 锁冲突 | 先核实原进程彻底退出和发送状态，再明确恢复；改数据库目录不能解决双消费者 |

QQ 原生提示持续约 60 秒，不会循环续发或延长默认 240 秒回复窗口。流式/Markdown 需要应用实际能力；平台拒绝不能当作已发送。历史合并批次曾附加只在 ChatGPT 确认的要求，见[运行记录](archive/runtime-acceptance.md)。普通连续两条通过不等于所有合并批次都通过，遇到平台冲突应报告，不能绕过。

## 订阅和凭据维护

默认配置下订阅最多 24 小时；原 dot/平台应根据真实 `refreshBefore` 续订。本桥不会自己延长租期，也不会自动新建任务。检查真实续订后的到期时间及订阅身份，不能只凭过了旧时间还能回复就推断机制。到期/撤销后停止消费；恢复原任务/订阅时继续保持唯一实例。

runtime key、平台凭据和 service key 分别维护。轮换 service key 时协调客户端与聚合器/后端的相应引用；不要误用后端 key 作为 Tunnel header。更换存储密钥或主人身份不是普通配置更新，原数据库不能直接换 key 或绑定。新增、迁入或扩大持久凭据/权限要明确批准范围与目标路径。

## 升级、备份和回滚

1. 记录当前代码 SHA、core 包版本/hash、私有配置版本和服务 unit。
2. 在独立目录验证新固定提交及锁定依赖；跨平台跳过和未运行项目单独报告。
3. 优雅停止旧消费者，确认不会在另一主机继续运行。保留 uncertain，备份完整状态。
4. 使用 SQLite 一致性备份，或停机后的完整数据库与必要侧文件；禁止仅复制仍在写入的主库。原 STORAGE_KEY 单独保护，与原身份配套恢复。
5. 切换源码/配置，启动唯一消费者，验证新消息和重启后的状态保持。
6. 回滚代码、依赖和配置时保留最新数据库；旧代码若不兼容新 schema，先停机评估，不能用旧备份覆盖新消息来“修好”。

SIGTERM 停止接收和领取，等待正在执行的工作后关闭库。事件 lease 可按稳定 event ID 恢复；发送中断的回复进入 uncertain。已经在网络上的发送不能撤回。对长媒体操作建议保留 180 秒停止时间。

## 日志与保留

运行日志仅记录固定状态、计数、布尔值和时间，不记录秘密、身份、正文或完整 callback/WSS 地址。配置自己的 journald/日志系统保留期限和容量；本仓库不自动设置主机日志策略，也不承诺所有安装均为 7 天。

正文/回答默认七天逻辑清除，去重墓碑仍保留；磁盘容量要监控。数据库旧页、WAL、备份和系统日志的保留另算，逻辑删除不等于物理擦除。停机太久或未订阅期间的消息可能无法从平台补取。历史证据及未验收项目见[归档](archive/README.md)。
