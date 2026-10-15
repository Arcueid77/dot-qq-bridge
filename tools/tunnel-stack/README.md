# 有限窗口开发启动器

[简体中文](README.md) | [English](README.en.md) | [首页](../../README.md)

用于同级 QQ、飞书源码的可选开发和诊断，最长连接窗口 30 分钟。常驻服务使用[部署指南](../../docs/deployment.md)的独立入口，不使用此监督器。

需要 Python 3.10+、Node 24.15–24.x，以及 Linux 或原生 Windows 私有文件保护。Windows 使用本地 NTFS/DACL，不以 chmod 代替。两个仓库分别安装锁定依赖；必要时用 `--node` 显式指定可信 Node 绝对路径。

默认仅输出离线计划，无网络、凭据读取或状态写入：

```sh
python3 tools/tunnel-stack/live-stack.py
python3 tools/tunnel-stack/readiness-native-stack.py
```

把 [runtime-config.example.json](runtime-config.example.json)、[live-plan.example.json](live-plan.example.json) 和 [tunnel-profile.example.yaml](tunnel-profile.example.yaml) 复制到获批的仓库外私有目录并替换占位值。manifest 仅含 `tunnel_client`、`tunnel_profile`、`private_root`、`state_root` 四个绝对路径；私有根与状态根不能相同或重叠，binary/profile 位于它们之外。配置只引用秘密文件，不填密钥值。

```sh
python3 tools/tunnel-stack/live-stack.py --validate-plan --runtime-config /absolute/config/runtime.json --config /absolute/config/live-plan.json
python3 tools/tunnel-stack/readiness-native-stack.py --validate-plan --runtime-config /absolute/config/runtime.json
```

校验仅检查非秘密配置及路径，不证明凭据、ACL、Node、profile 内容或连通性有效。获得对应运行和凭据使用授权后，readiness 可使用 `--check --confirm-readiness-runtime` 或 `--run --confirm-readiness-runtime`，live 使用 `--run --confirm-live-runtime`；继续提供同一 manifest、live plan（仅 live）及 Node 路径。live 不自动续期或重启；readiness 的 online 只证明控制面轮询成功。

两个模式共用同一个 state root/锁，且拒绝占用端口和重复客户端。状态与停止入口：

```sh
python3 tools/tunnel-stack/live-stack.py --status --runtime-config /absolute/config/runtime.json
python3 tools/tunnel-stack/live-stack.py --stop --runtime-config /absolute/config/runtime.json
```

停止请求不是退出证明；`stop_incomplete_requires_review` 保留租约，不能自动删锁。跨主机仍需人工协调旧实例停止。监督器只管理自己的子进程，日志保留本次最近 1000 个脱敏事件，下次运行覆盖；系统日志/备份另计。不会自动安装运行时或放宽 ACL。

离线测试：`python3 -B -m unittest discover -s tools/tunnel-stack -p 'test_*.py' -v`。Windows 用已安装的 `python.exe` 替代 `python3`。合成测试不启动真实 Tunnel 或平台连接。
