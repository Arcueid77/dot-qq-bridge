# QQ 私聊体验

[简体中文](configuration.md) | [English](configuration.en.md) | [首页](../README.md)

答案仍由原 dot 生成，不引入模型 API、OpenClaw 运行时或第二个机器人。共享网络、文件保护和路由仅来自固定 core 发行包；QQ 专属操作由本仓库持有。

实际开始处理时，仅调用一次 `begin_qq_reply(message_id)`。它排队发送 QQ 原生 `msg_type=6` 输入提示，持续 60 秒，消耗一个被动发送序号，但不延长原消息期限。不重复发送输入提示保活。提示失败与答案是否送达分开判断，两个发送序号独立持久保存。

追问使用 `get_qq_context(message_id,limit?)`：最多 20 条消息、合计 30000 字符，仅同一主人/订阅代次且在七天保留期内；只包含已正向 ACK 的回答。有效订阅仍可读取保留上下文，但原被动窗口过期后不能发送新回复。

原生 C2C 流式使用 `append_qq_reply(message_id,sequence,text)`，text 必须是实际已生成的完整累计文本。序号从 1 连续增长，新快照须扩展前文；相同序号重试幂等。后端保持一个 msg_seq、连续 QQ index、replace 模式，已确认帧之间至少间隔 500 毫秒；先持久保存返回的 stream ID 才发后续帧。最终用 `reply_to_qq` 提交完整答案，在同一流发送 DONE。不要将已经完成的答案切片重播来伪造流式。

`reply_to_qq` 接受 `format:plain|markdown`，默认 plain。短非流式答案使用普通被动接口，Markdown 使用官方 body。超过 2000 字符、最多 30000 字符时使用一个原生 DONE 消息，需要所选应用已有平台能力。桥不会静默扩大权限或把未知发送拆成多条消息。明确 provider 拒绝是失败；连接中断、畸形 ACK 或租约内发送中断为 uncertain，既不自动补发该帧，也不另发替代答案。

原生输入状态、流式和 Markdown 依据已审查公开协议的腾讯 [Node.js SDK](https://github.com/tencent-connect/qqbot-nodejs/blob/main/USAGE.md)。桥保留自身受控 requester 和持久 worker，不导入 SDK 重试策略或原始消息日志。离线测试不能证明当前应用已获真实权限或客户端体验已验收。

事件任务必须处理每个独立 message_id，包括合并批次中的全部条目；逐条核对期限和持久回复状态。普通追问以及“外部操作需要确认”的说明也应回复绑定的 QQ 私聊，但这不授权外部操作本身。ChatGPT 任务运行确认不等于 QQ 送达。遇到冲突的平台指令，应报告冲突，不能用 ChatGPT 摘要冒充 QQ 回复，也不能绕过平台限制。已观察的批次冲突及范围更窄的连续消息成功见 [真实验收](archive/runtime-acceptance.md)。

初始部署仍仅本人 C2C。群聊、频道及其他人的消息忽略，不建立未经批准的群订阅或全员权限。

## 运行限制

以下字段放在后端环境文件中，不放在聚合器环境中：

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| `REPLY_TTL_SECONDS` | 240 | 本地回复期限（秒） |
| `SUBSCRIPTION_TTL_SECONDS` | 86400 | 订阅寿命上限，还受请求 TTL 和已认证主体寿命约束 |
| `QUEUE_LIMIT` | 100 | 队列容量 |
| `INBOUND_PER_MINUTE` / `REPLIES_PER_MINUTE` | 10 / 10 | 每分钟入站/回复限流 |
| `MAX_DELIVERY_ATTEMPTS` | 5 | 有界尝试数，不允许重发 uncertain 回复 |

QQ 正文保留期在代码中为七天；可读历史上下文不延长 QQ 被动回复窗口，也不允许主动发送。
