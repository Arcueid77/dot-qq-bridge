# QQ 私聊体验

[简体中文](configuration.md) | [English](configuration.en.md) | [首页](../README.md)

答案仍由原 dot 生成，不引入模型 API、OpenClaw 运行时或第二个机器人。共享网络、文件保护和路由仅来自固定 core 发行包；QQ 专属操作由本仓库持有。

实际开始处理时，仅调用一次 `begin_qq_reply(message_id)`。它排队发送 QQ 原生 `msg_type=6` 输入提示，持续 60 秒，消耗一个被动发送序号，但不延长原消息期限。不重复发送输入提示保活。提示失败与答案是否送达分开判断，两个发送序号独立持久保存。

追问使用 `get_qq_context(message_id,limit?)`：最多 20 条消息、合计 30000 字符，仅同一主人/订阅代次且在七天保留期内；只包含已正向 ACK 的回答。有效订阅仍可读取保留上下文，但原被动窗口过期后不能发送新回复。

原生 C2C 流式使用 `append_qq_reply(message_id,sequence,text)`，text 必须是实际已生成的完整累计文本。序号从 1 连续增长，新快照须扩展前文；相同序号重试幂等。后端保持一个 msg_seq、连续 QQ index、replace 模式，已确认帧之间至少间隔 500 毫秒；先持久保存返回的 stream ID 才发后续帧。最终用 `reply_to_qq` 提交完整答案，在同一流发送 DONE。不要将已经完成的答案切片重播来伪造流式。

`reply_to_qq` 接受 `format:plain|markdown`，默认 plain。短非流式答案使用普通被动接口，Markdown 使用官方 body。超过 2000 字符、最多 30000 字符时使用一个原生 DONE 消息，需要所选应用已有平台能力。桥不会静默扩大权限或把未知发送拆成多条消息。明确 provider 拒绝是失败；连接中断、畸形 ACK 或租约内发送中断为 uncertain，既不自动补发该帧，也不另发替代答案。

原生输入状态、流式和 Markdown 依据已审查公开协议的腾讯 [Node.js SDK](https://github.com/tencent-connect/qqbot-nodejs/blob/main/USAGE.md)。桥保留自身受控 requester 和持久 worker，不导入 SDK 重试策略或原始消息日志。离线测试不能证明当前应用已获真实权限或客户端体验已验收。

事件任务必须处理每个独立 message_id，包括合并批次中的全部条目；逐条核对期限和持久回复状态。普通追问以及“外部操作需要确认”的说明也应回复绑定的 QQ 私聊，但这不授权外部操作本身。ChatGPT 任务运行确认不等于 QQ 送达。遇到冲突的平台指令，应报告冲突，不能用 ChatGPT 摘要冒充 QQ 回复，也不能绕过平台限制。已观察的批次冲突及范围更窄的连续消息成功见 [运行排错](troubleshooting.md)。

初始部署仍仅本人 C2C。群聊、频道及其他人的消息忽略，不建立未经批准的群订阅或全员权限。

## 图片、语音和文件

直接给同一个机器人发送图片、语音或文件即可。dot 先读取附件列表，再按序号读取需要的内容；附件始终属于这条本人私聊消息，不能用一个网址或文件路径让桥代为下载其他内容。

每条消息最多读取 10 个附件，每个最多 8 MiB。`get_qq_message` 列出附件；`get_qq_attachment(message_id, attachment_index)` 读取指定附件，序号从 0 开始。图片支持 PNG、JPEG、GIF、WebP；文件以 MCP resource 返回。语音优先取 QQ 的 WAV，失败时尝试原文件；SILK 在本机解码成 WAV，也可读取 MP3、Ogg。SILK 最长两分钟。QQ 的参考转写可能听错，不能当作新的授权。

可以用 `reply_qq_media` 回复一张图片、一个文件或一段已有音频，每条原消息只能选一种最终回复。图片为 PNG/JPEG；原生语音接受 SILK 或 16 位单声道 PCM WAV，WAV 会在本机转成 SILK，最长两分钟。每个回复附件最多 5 MiB，这是当前采用的官方直传方式的限制。其他音频可以作为文件发送；桥本身不把文字合成为语音，也不创建外部下载链接。已经开始的文字流要用文字完成，不能中途换成媒体。

本地保留的媒体回复密文总量上限为 64 MiB，包含发送结果不明的记录。达到上限时拒绝新媒体入队；已存在的相同回复仍可查状态。不要删除记录或把 `uncertain` 改成待发来释放空间，按保留规则和原会话核对结果处理。

音频下载或理解失败时，dot 可以使用已有参考转写；没有可用内容时应请你重发或改发文字。签名链接可能过期，真正的 AMR、视频、引用和未知格式仍不支持。文件解析和听取音频的能力还取决于原 dot；桥不会把未读懂的附件当成已理解。

下载只接受已核验主人消息内的 HTTPS 资源，固定允许 `multimedia.nt.qq.com`、`gchat.qpic.cn`、`c2cpicdw.qpic.cn`。不向这些地址附加机器人令牌，不跟随重定向；直连保留公网 DNS/IP 和域名 TLS 检查，有既定代理时继续使用原代理策略。其他域名不会自动放行。音频只在内存中处理，地址与参考转写随消息加密保存并按七天规则逻辑清除；这不等于旧数据库页、WAL 或备份已经物理擦除。

升级时，QQ 后端和加载 QQ 适配器的路由器需一起更新，再刷新原插件的工具目录，确认出现 `get_qq_attachment` 和 `reply_qq_media`。保留现有数据库、存储密钥和唯一订阅，不再开一套消费者。媒体计划沿用现有加密队列；旧版不能处理媒体回复，回滚要求见[运行排错](troubleshooting.md)。

上传遵循腾讯的[单聊富媒体接口](https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/v2_users_user_openid_files.post.html)：先上传取得文件引用，再被动回复原消息。应用若被平台拒绝某种媒体，不自动更换应用、扩大权限或转成主动消息。

### 让不支持音频输入的 dot 读懂语音

有些 ChatGPT 工具环境会省略 MCP 音频。此时 dot 要读取 `get_qq_attachment` 返回的 `extracted_text`，不能仅因为看不到音频就说无法读取。桥优先提供 QQ 的参考转写；没有转写时，可在 Linux VPS 启用本地 Whisper。回答仍由原 dot 生成。

在后端环境文件设置 `DOT_BRIDGE_AUDIO_TRANSCRIPTION=local-whisper`、`DOT_BRIDGE_WHISPER_BINARY` 和 `DOT_BRIDGE_WHISPER_MODEL`。后两项为已安装、root 所有且服务用户不可修改的 whisper-cli 和多语言模型绝对路径；依赖 `/usr/bin/ffmpeg`、`prlimit`、`flock`。两个后端复用原 `BRIDGE_LOCK_DIRECTORY`，同一时刻只转写一条。音频只经过内存管道，不上传到外部转写服务，也不需要 API key。

本地转写限 8 MiB、两分钟音频和 28 秒处理时间，返回最多 12000 字符。繁忙、超时或听不清时请重发较短语音或文字，不把参考转写当作准确原文。升级后刷新现有插件工具目录，不新建订阅。

从已安装的 core 包中编译 `audio/no-core-dump.c`，把生成的共享库放到同样受保护的运行目录，并设置 `DOT_BRIDGE_AUDIO_GUARD` 为其绝对路径。这个小组件禁止音频进程生成内存转储，避免系统崩溃收集器保存语音；缺少它时不执行本地转写。

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
