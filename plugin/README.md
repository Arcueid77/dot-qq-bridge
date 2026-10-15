# 插件接入模板

[简体中文](README.md) | [English](README.en.md) | [首页](../README.md)

此目录保存手动接入模板，地址中的 `.invalid` 是占位符，JSON 能解析不代表插件已安装或发布。正式使用沿用操作者的原 dot 和官方 Secure MCP Tunnel，按[部署指南](../docs/deployment.md)配置真实目标并建立唯一事件订阅。

不要把凭据、callback 地址或运行时 key 写进模板；客户端的 service header 使用受保护的聚合器 key 文件引用。应用授权、长期凭据和插件/事件权限按实际范围批准，不因模板存在而自动授予。
