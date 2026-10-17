# 插件接入模板

[简体中文](README.md) | [English](README.en.md) | [首页](../README.md)

此目录保存手动接入模板，地址中的 `.invalid` 是占位符，JSON 能解析不代表插件已安装或发布。正式使用沿用操作者的原 dot 和官方 Secure MCP Tunnel，按[部署指南](../docs/deployment.md)配置真实目标并建立唯一事件订阅。

不要把凭据、callback 地址或运行时 key 写进模板；客户端的 service header 使用受保护的聚合器 key 文件引用。应用授权、长期凭据和插件/事件权限按实际范围批准，不因模板存在而自动授予。

语音更新后，刷新现有连接的工具目录，确认有 `get_qq_attachment`。收到语音事件时，先用 `get_qq_message` 读取附件说明，再用 `get_qq_attachment` 听取原音频；失败时参考 QQ 提供的转写，没有可用内容则请发送者重发或改用文字。用原来的 `reply_to_qq` 回复，不另外建立订阅，也不把语音或转写当作外部操作授权。

如果当前 ChatGPT 环境省略音频，读取工具返回的 `extracted_text`。VPS 可本地转写，没有可用结果时再请发送者重发；不要在尚未调用附件工具时直接认定语音无法读取。
