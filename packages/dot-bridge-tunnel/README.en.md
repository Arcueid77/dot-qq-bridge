# Dual-channel router compatibility entry

[简体中文](README.md) | [English](README.en.md) | [Home](../../README.en.md)

This thin host registers sibling QQ and Feishu adapters in code; shared routing comes from installed core. Production single-channel deployments use each repository's `scripts/run-tunnel-router.js`; see [Deployment](../../docs/deployment.en.md).

Dual-channel development needs sibling `dot-qq-bridge` and `dot-lark-bridge` checkouts with locked dependencies installed separately. The router and each backend have independent service keys and loopback-only MCP listeners. `TUNNEL_CHANNELS` selects deployed channels; `TUNNEL_LIVE_CHANNELS` must be a subset. The router loads no provider credentials or database.

From the QQ repository root, run offline compatibility tests:

```sh
node --test --test-concurrency=1 packages/dot-bridge-tunnel/test/*.test.js
```

Actual-sibling cases must not skip because a checkout is missing. Passing tests does not prove any provider connection.

Approved live operation uses `node --env-file=/approved/private/router.env packages/dot-bridge-tunnel/src/main.js --confirm-live`. `src/drain-main.js` drains accepted requests during planned router replacement: wait for clean exit before rebinding the port. It does not start another consumer or switch subscriptions automatically. The official Tunnel still has one router MCP target and references the router key in its header.
