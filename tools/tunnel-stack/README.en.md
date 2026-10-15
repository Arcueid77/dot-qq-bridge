# Finite-window development launcher

[简体中文](README.md) | [English](README.en.md) | [Home](../../README.en.md)

Optional development/diagnosis with sibling QQ and Feishu source, limited to a 30-minute online window. Persistent services use the independent entries in [Deployment](../../docs/deployment.en.md), not this supervisor.

Requires Python 3.10+, Node 24.15–24.x and Linux or native Windows private-file protection. Windows uses local NTFS/DACLs, not chmod emulation. Install each repository's locked dependencies; use `--node` for an explicit trusted absolute Node path when needed.

Default commands only print offline plans, without network access, credential reads or state writes:

```sh
python3 tools/tunnel-stack/live-stack.py
python3 tools/tunnel-stack/readiness-native-stack.py
```

Copy [runtime-config.example.json](runtime-config.example.json), [live-plan.example.json](live-plan.example.json) and [tunnel-profile.example.yaml](tunnel-profile.example.yaml) to an approved private directory outside both repositories and replace placeholders. The manifest contains four absolute paths: `tunnel_client`, `tunnel_profile`, `private_root` and `state_root`. Private/state roots must not overlap; binary/profile locations stay outside them. Reference secret files without embedding key values.

```sh
python3 tools/tunnel-stack/live-stack.py --validate-plan --runtime-config /absolute/config/runtime.json --config /absolute/config/live-plan.json
python3 tools/tunnel-stack/readiness-native-stack.py --validate-plan --runtime-config /absolute/config/runtime.json
```

Validation checks non-secret configuration and paths, not credentials, ACLs, Node, profile contents or connectivity. After approving the mode and credential use, readiness accepts `--check --confirm-readiness-runtime` or `--run --confirm-readiness-runtime`; live uses `--run --confirm-live-runtime`. Supply the same manifest, live plan (live only) and Node path. Live does not renew/restart itself; readiness online means only a successful control-plane poll.

Both modes share one state root/lock and reject occupied ports or duplicate clients. Inspect or request stop with:

```sh
python3 tools/tunnel-stack/live-stack.py --status --runtime-config /absolute/config/runtime.json
python3 tools/tunnel-stack/live-stack.py --stop --runtime-config /absolute/config/runtime.json
```

A stop request is not proof of exit. `stop_incomplete_requires_review` retains the lease; never remove it automatically. Moving hosts still needs coordination to stop the old instance. The supervisor manages only its own children and retains the latest 1000 sanitized events for the current run, replacing them next run; OS logs/backups are separate. It neither installs runtimes nor weakens ACLs.

Offline tests: `python3 -B -m unittest discover -s tools/tunnel-stack -p 'test_*.py' -v`. On Windows use the installed `python.exe` instead of `python3`. Synthetic tests start no real Tunnel or provider connection.
