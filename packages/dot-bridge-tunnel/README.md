# 双渠道聚合兼容入口

[简体中文](README.md) | [English](README.en.md) | [首页](../../README.md)

此薄入口在代码中注册同级 QQ、飞书适配器，共享路由实现来自已安装的 core。单渠道生产部署使用各自仓库的 `scripts/run-tunnel-router.js`，见[部署指南](../../docs/deployment.md)。

双渠道开发需同级 `dot-qq-bridge`、`dot-lark-bridge`，分别安装锁定依赖。两个后端及聚合器各有独立 service key，MCP 仅监听 loopback；聚合器配置实际部署的 `TUNNEL_CHANNELS`，`TUNNEL_LIVE_CHANNELS` 只能是其子集。聚合器不加载平台凭据或数据库。

在 QQ 仓库根目录执行离线兼容测试：

```sh
node --test --test-concurrency=1 packages/dot-bridge-tunnel/test/*.test.js
```

实际兄弟适配器用例不得因路径缺失而跳过。测试通过不代表任何平台已接通。

获准的 live 运行使用 `node --env-file=/approved/private/router.env packages/dot-bridge-tunnel/src/main.js --confirm-live`。`src/drain-main.js` 是计划替换聚合器时的排空入口：停止后等待已接收请求结束、确认退出，再复用端口；不启动第二个消费者或自动切换订阅。官方 Tunnel 仍只有一个指向聚合器的 MCP target，其 header 引用聚合器 key。
