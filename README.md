# dot-qq-bridge

[简体中文](README.md) | [English](README.en.md)

把 QQ 官方机器人本人私聊和获批群 @ 接到现有 OpenAI dot，再由同一个 dot 回复原会话。使用官方 Secure MCP Tunnel，不调用模型 API。

只需克隆本仓库；固定版本 `@dot-bridge/core` 已随 `vendor/` 提供，无需飞书或 core 源码仓库。


收到 TXT、Markdown、JSON、CSV 等文本附件时，dot 会同时得到可阅读的文字摘录；支持 UTF-8 和带标记的 UTF-16。过长时明确标记为截断，原文件仍然保留。需要把收到的附件发回原会话时，可以使用按附件编号回发的工具，由桥直接读取文件。仍按本渠道的格式和大小限制处理。

## 支持什么

- 本人 C2C 文字、图片、语音和文件，连续上下文、Markdown、最长 30000 字符回答。
- 实际处理时的原生输入提示、同一回复的原生流式更新。
- 持久队列、去重、重启恢复；发送结果不明时停止自动重发。
- 可回复图片、文件或已有音频；WAV 语音会在本机转为 QQ 使用的 SILK。接收附件最多 5 MiB，回复附件最多 5 MiB。
- 语音交给原 dot 理解；支持 WAV 音频和 SILK 本地解码，无需另配转写 API。语音可使用已有音频，或启用受保护的本地文字转语音。
- QQ 群 @ 按受保护群规则接收；默认仍为本人私聊。频道和视频保留各自的平台能力范围。平台提供引用 ID 时，可读取当前本人会话、同一订阅世代中已保留的被引用内容；没有本地记录时不查询其他会话。

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

## 定时消息

QQ 已接入本人主动文字和固定提醒，默认关闭。核实应用具备平台资格及额度后，在 QQ 后端设置 `DOT_BRIDGE_OUTBOUND=owner-text`；可以立即发送，也可以按一次、每天或每周安排。仅发往原配对的本人私聊，复用原数据库和存储密钥。启用步骤、平台限制及拒绝状态见[配置说明](docs/configuration.md#主动文字与定时提醒)。

详见[定时消息使用指南](https://github.com/Arcueid77/dot-bridge/blob/main/docs/scheduled-messages.md)。


## 交互与维护

`begin_qq_reply` 显示真实处理的输入提示；`append_qq_reply` 依序提交截至当前生成的完整累计文本，最后用 `reply_to_qq` 完成同一原生回复流。`get_qq_context` 与已保留引用仅在同一本人、同一订阅世代内读取；PDF／Office 摘录复用受保护的共享处理环境。

本人原私聊支持 `/help`、`/status`、`/queue`、`/subscription`、`/cancel [编号]`。标准回调模式下，显式 `DOT_BRIDGE_OWNER_MANAGEMENT=1` 可在 dot 订阅缺失时保持维护连接。取消只作用于尚未发送的桥回复；本次已开始的 begin/append 处理仍要完成唯一最终回复，结果不明保持核对。详情见[配置说明](docs/configuration.md)。

Linux、Windows 前台运行及 Linux systemd 的用法见[部署说明](docs/deployment.md)。macOS 尚未验证，欢迎试用并反馈。原 dot 的暂停、重置和审批继续使用原平台入口。

## 选项、文件和提醒管理

支持用编号文字回复一组选项，直接回复编号即可继续对话。生成的图片、音频或文件可由具备程序文件读取能力的原 dot 分块上传，经大小与 SHA-256 校验后作为原消息的最终回复。单文件上限 5 MiB，仍需满足本渠道支持的媒体类型与格式。

固定文字提醒支持工作日、固定间隔、暂停、恢复和发送历史。先核对 `check_qq_outbound` 的开关，再按提醒编号与当前版本操作。暂停期间的旧时间点在恢复时跳过。


## 长任务、连续消息与语音

长任务开始时，dot 可调用任务工具取得编号、被动回复截止时间及剩余秒数，再保存完整结果。本人在原私聊发送 `/tasks` 查看编号，用 `/result 编号` 读取已保存的文字。结果按原消息保留期清除。发送结果不明时保留 uncertain，已完成的回复沿用原记录。

受保护交互配置支持 `queue`，例如 `{"mode":"batch","window_ms":750,"max_messages":5}`。`mode` 可选 `independent`、`serial`、`batch`，默认 independent。合并保留每条来源，并以最后一条为回复锚点。附件、引用、已开始处理的来源各自处理，会话与成员范围沿用原隔离规则。

Linux 管理员可安装本地 eSpeak NG 和受保护音频环境，配置 `DOT_BRIDGE_SPEECH_SYNTHESIS=local-espeak`、`DOT_BRIDGE_SPEECH_VOICE=zh`。原 dot 使用 `check_qq_speech` 和 `reply_qq_speech`，单次最多 2000 字符、120 秒。完整文字同时保存在任务记录里。

平台明确拒绝的一次性主动发送，可在本人确认后通过 `retry_qq_outbound` 重试同一编号和当前版本。主动发送开关继续按渠道配置，重复提醒保持原来的编辑和恢复流程。原 dot 任务的停止、重置和审批通过原平台管理。

## 指定 QQ 群

`DOT_BRIDGE_INTERACTION_POLICY_FILE` 指向受保护 JSON。`groups` 使用共享规则字段 `conversation_id`、`members`、`allow_from`、`mention`、`auto_reply`、`keywords`、`context_scope`。`members` 可选 owner、allowlist、all。QQ 官方群 @ 事件按实际投递范围接收，默认无群规则。启用群前，原 dot 的唯一订阅需切换为 `conversation=configured`。群回复使用原始平台消息 ID，群和私聊上下文分离。QQ 群内长回答以文件交付。
