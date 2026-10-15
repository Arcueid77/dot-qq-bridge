# Operations and troubleshooting

[简体中文](troubleshooting.md) | [English](troubleshooting.en.md) | [Home](../README.en.md)

Use this with an instance configured through [Deployment](deployment.en.md). Names and paths below are examples; verify the actual installation first. Inspect sanitized state rather than sharing whole environments, databases, message text or full callback URLs.

## Verify each layer

| Layer | What it establishes |
| --- | --- |
| Installation, check, test | Offline results for that revision and environment |
| Process and /healthz | Process liveness |
| Local authentication, tool/event catalogs | Working MCP authentication and routing |
| Official Tunnel connected | Tunnel transport connected |
| One active subscription and signed challenge | The original dot's delivery path |
| Provider Gateway connected | Provider connection established |
| Original-dot read/reply, provider ACK and visible original-chat answer | Actual end-to-end result |

The router intentionally returns 503 from `/readyz`; it is not a standalone failure signal. Backend readiness also depends on configuration, subscription and Gateway. Catalog discovery or any single ready state cannot prove that the model answered.

```sh
systemctl is-active dot-bridge-qq.service dot-bridge-router.service
sudo -u dot-bridge /ABSOLUTE/NODE --env-file=/var/lib/dot-bridge/private/qq.env /opt/dot-bridge/dot-qq-bridge/scripts/status.js
systemctl stop dot-bridge-qq.service
systemctl start dot-bridge-qq.service
```

Replace the Node path. Status reads queue counts without sending or decrypting text. Startup diagnostics and the authenticated `check_bridge_setup` tool can identify missing settings and the callback hostname. Do not add a public management port for diagnosis.

## Common symptoms

| Symptom | Action |
| --- | --- |
| Private-file refusal | Check absolute paths, runtime ownership, 0700/0600 or Windows DACLs, single links and no symlink/reparse points; do not weaken checks |
| Callback policy pending | Obtain the address from the original dot's real subscription flow and approve its exact host, never a guessed address or wildcard |
| Callback transport pending | Check standard direct transport or an approved proxy with a supported adapter; no fake verification flag or required-proxy bypass |
| Missing tools | Check registered router channels, live settings and the original plugin catalog; refresh that plugin while keeping the same dot |
| Delivered event, no reply | Callback 2xx is asynchronous receipt. Inspect task execution, permissions, every batched message_id, read/reply calls and deadlines |
| Growing pending queue | Check subscription, networking, rate and capacity limits; do not blindly add consumers |
| uncertain | The provider ACK or interrupted send is uncertain. Retain it, inspect the owner's chat, never resend automatically or reset to pending |
| expired / unanswered past deadline | The window has passed; do not fall back to proactive messaging. Ask the owner to send a new ordinary message |
| dead / cancelled | Check sanitized errors, provider grants or revocation. A new subscription does not authorize old-generation work |
| Lock conflict | Confirm the old process has fully exited and reconcile sends before explicit recovery; a new database path does not fix duplicate consumers |

QQ's native input notification lasts about 60 seconds; it is not periodically renewed and does not extend the default 240-second reply window. Native streaming/Markdown need actual app capability; provider rejection is not delivery. A historical combined batch carried a ChatGPT-only confirmation requirement; see the [acceptance record](archive/runtime-acceptance.md). Passing two consecutive messages does not prove all combined batches. Report platform conflicts rather than bypassing them.

## Subscription and credential maintenance

With default settings, subscriptions are bounded to 24 hours. The original dot/platform should renew using the actual `refreshBefore`. This bridge does not extend leases itself or create new tasks. Inspect the new expiry and subscription identity after a real renewal; a reply after an old timestamp alone does not prove the mechanism. Expiry/revocation stops consumption. Restore the original task/subscription while keeping one consumer.

Maintain runtime, provider and service credentials separately. Coordinate service-key rotation across the matching client/router/backend references; never use the backend key as the Tunnel header. Changing STORAGE_KEY or owner identity is not an ordinary setting update: do not rebind an existing database. Approve the scope and destination of newly created, migrated or expanded persistent credentials.

## Upgrades, backups and rollback

1. Record code SHA, core version/hash, private configuration version and service units.
2. Validate a pinned candidate and locked dependencies in an isolated directory. Report platform skips and unrun checks separately.
3. Gracefully stop the old consumer and confirm no other host is consuming. Preserve uncertain outcomes and back up complete state.
4. Use consistent SQLite backup or a full stopped-service database backup including required sidecars. Never copy only a live main database. Protect the original STORAGE_KEY separately and restore it with the original identity.
5. Switch source/configuration, start one consumer and verify new messages plus restart state retention.
6. Roll back code, dependencies and configuration while retaining the latest database. If the old code cannot read the new schema, stop and assess; never overwrite newly received messages with an old backup as a shortcut.

SIGTERM stops intake/claims, waits for work and closes the database. Events may recover under the same stable event ID; interrupted replies become uncertain. Sends already on the network cannot be recalled. Allow 180 seconds for bounded media work to stop.

## Logs and retention

Runtime logs use fixed states, counts, booleans and timestamps, not credentials, identities, message bodies or full callback/WSS URLs. Configure actual journal/log retention and size limits on the host. This repository does not set the host policy or promise seven-day logs for every installation.

Text/replies default to seven-day logical cleanup; deduplication tombstones remain and disk use needs monitoring. Old database pages, WAL, backups and system logs have separate retention. Logical deletion is not physical erasure. Messages during long outages or inactive subscriptions may be unrecoverable. See the [archive](archive/README.en.md) for dated evidence and acceptance gaps.
