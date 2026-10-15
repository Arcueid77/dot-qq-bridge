# 公共组件拆分

> 历史归档 / Historical archive: 保留原始语言及当时的适用范围，不作为当前部署指南。
> This record retains its original language and dated scope. Start with the [current guide](../deployment.en.md) / [现行指南](../deployment.md).


公共实现的唯一源码仓库为 `dot-bridge-core`。本仓库通过固定版本的
`@dot-bridge/core` 使用 callback transport、私有平台保护和注册渠道聚合器。
`vendor/` 保存受审查的发行包和来源清单，lockfile 固定 integrity。
这里不再持有 platform/transport 公共实现的独立源码副本。

单 QQ 聚合入口为 `scripts/run-tunnel-router.js`，只注册 QQ 适配器。
飞书部署不需要本仓库。`packages/dot-bridge-tunnel` 的旧入口保留为薄兼容主机，
在代码中注册同级实际 QQ/飞书适配器，供旧双渠道开发启动器与完整集成回归使用。
该目录不会提供第二份 shared router 实现；auth/protocol/server/upstream 等逻辑
均来自安装的 core。正式单渠道 systemd 不使用有限窗口开发启动器。

飞书专属 contract 已归飞书仓库，QQ 专属 contract 在 `src/tunnel-adapter.js`。
新增 IM 使用各自可信适配器，不在 core 中导入 provider SDK 或复制其他 IM 凭据。
配置、代码安装和 readiness 均不构成开启真实 QQ 收发的授权。

## 单 QQ 常驻拓扑

原 dot → 官方 Secure MCP Tunnel → core 聚合器 → QQ live 后端。只需本仓库，
不运行飞书 readiness，也不要求飞书或 core 的源码 checkout。
保持 core 安装包、来源清单和 lockfile 一起交付。

后端和聚合器分别使用独立受保护环境文件。聚合器只配置本地路由，不加载
QQ 应用凭据、STORAGE_KEY 或数据库。以下值均为公开占位路径：

```text
AUTH_MODE=tunnel-service
BRIDGE_MODE=tunnel
TUNNEL_SERVICE_OPERATION=live
TUNNEL_SERVICE_OWNER_ID=tunnel-owner:dot-bridge
TUNNEL_LIVE_CHANNELS=qq
HOST=127.0.0.1
PORT=8789
QQ_MCP_PORT=8787
TUNNEL_SERVICE_KEY_FILE=/ABSOLUTE/PRIVATE_DIRECTORY/aggregate-service-key
QQ_SERVICE_KEY_FILE=/ABSOLUTE/PRIVATE_DIRECTORY/qq-service-key
```

```sh
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
node --env-file=/approved/private/qq.env scripts/qq-service.js --run --confirm-persistent-service
node --env-file=/approved/private/router.env scripts/run-tunnel-router.js --confirm-live
```

上述两个进程由各自普通非 root 常驻服务管理，不依赖 SSH/stdin 或有限窗口。
官方客户端只配置一个 MCP target 指向聚合器；其服务 header 引用聚合 key，
不引用 QQ 后端 key。所有 MCP 端口只监听 loopback，实际端口须先检查冲突。
凭据格式、私有权限、本人绑定、订阅和互斥门禁见 [tunnel-live.md](tunnel-live.md)。

## 离线验证和平台边界

在没有飞书/core 源码的独立目录执行锁定安装、`npm run check`、`npm test`、
`npm run simulate` 与 `npm run simulate:gateway`。Node 为 24.15–24.x；
TLS fixture 需要 PATH 上已有受信任的 OpenSSL。Windows 还需已有 Python 3.10+
与本地 NTFS；私有目录使用所有者/SYSTEM DACL，不能以 chmod 代替。

默认测试使用 QQ 自身的凭据读写器及 QQ 适配器，覆盖私有文件拒绝、重启恢复和
单渠道聚合。可选双适配器套件才要求同级飞书仓库；共享 transport 的完整测试
由 core 仓库负责。Windows 和 Linux 应分别验证，跳过项目及原因必须单独报告。
离线通过不等于真实 dot、QQ Gateway、订阅续期或客户端 UI 已验收。
