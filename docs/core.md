# 公共组件拆分

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
