# Deployment

[简体中文](deployment.md) | [English](deployment.en.md) | [Home](../README.en.md)

This is the current single-channel official Secure MCP Tunnel workflow: original dot → official tunnelclient → loopback router → QQ backend. Clone only this repository. Undeployed channels need no source, credentials or readiness service. The steps below cover this persistent Tunnel topology.

## 1. Inspect the host and pin the source

Use a continuously running Linux VPS with local persistent storage, or Windows with supported private-file protection. Once deployed, the local computer is only an administration entry point. Inspect OS, architecture, disk, existing services, ports and actual egress policy; preserve unrelated services.

Node must be >=24.15 and <25, using built-in `node:sqlite`. Install an architecture-compatible official build and check OpenSSL. Windows also requires Python 3.10+ and local NTFS. Private Tunnel operation on macOS and other platforms is not supported. Static hosting, sleeping instances and short-lived functions do not meet the runtime requirements. Docker builds and operation need separate acceptance.

```sh
git clone https://github.com/Arcueid77/dot-qq-bridge.git
cd dot-qq-bridge
git fetch origin
git checkout --detach REVIEWED_COMMIT_SHA
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
npm run check
npm test
npm run simulate
```

Replace the placeholder with a reviewed full SHA. Keep `vendor/`, lockfile and release metadata together. QQ can also run `npm run simulate:gateway`. Report passes, failures and platform skips separately. These tests do not establish a real connection.

## 2. Prepare a runtime user and private paths

On Linux use a dedicated non-root user, for example `dot-bridge`, with source at `/opt/dot-bridge/dot-qq-bridge`. An administrator must create private directories owned by the final runtime user: leaf directories 0700, files 0600, regular files with one link. Symlinks and hardlinks are rejected. Windows uses owner/SYSTEM-only private DACLs; do not loosen access to bypass checks.

| Example path | Contents |
| --- | --- |
| `/var/lib/dot-bridge/private/qq/credentials.json` | Provider credentials and verified owner binding |
| `/var/lib/dot-bridge/private/qq/storage-key` | Independent persistent-data encryption key |
| `/var/lib/dot-bridge/private/qq/service-key` | Backend service key |
| `/var/lib/dot-bridge/private/tunnel/aggregate-service-key` | Independent router key |
| `/var/lib/dot-bridge/private/tunnel/` | Official runtime key and private profile |
| `/var/lib/dot-bridge/private/qq.env` and `router.env` | Separate backend/router settings |
| `/var/lib/dot-bridge/qq/` and `/var/lib/dot-bridge/locks/` | Database, SQLite sidecars and local lock |

The three local keys—storage, backend and router—must be independent. Each contains the canonical base64url encoding of 32 random bytes: 43 ASCII characters, no newline. Generate or migrate them through an approved protected process, never through command arguments, chats or logs. The official Tunnel runtime key is separate; it cannot replace these keys or establish external user identity.

A database migration must retain its STORAGE_KEY, identity, queues, subscriptions, deduplication and uncertain states. Use a consistent backup or a complete stopped-service backup. A fresh start requires an explicit decision about lost queue/deduplication state. Confirm the old host's consumer and duplicate Tunnel are stopped before consuming messages; the local lock is not cross-host fencing.

## 3. Authorize the provider and bind the owner

Confirm the existing bot AppID on QQ's official platform. The owner scans personally, and any other consumer must stop first. After approving scanning, receipt of owner identity and persistent storage, set the non-secret `QQ_APP_ID` and `QQ_CREDENTIAL_DIRECTORY=/var/lib/dot-bridge/private/qq` in the runtime user's environment:

```sh
node scripts/qq-authorize-persistent.js --confirm-official-scan --confirm-scanner-is-owner --confirm-save-qq-credentials
```

If the AppID is unknown, use `scripts/qq-enroll-persistent.js --confirm-official-scan --confirm-scanner-is-owner --confirm-save-qq-credentials --confirm-select-existing-app-after-scan`. Select the original app in QQ, then type `confirm-existing-app` when the script requests confirmation before saving. An expired QR needs a new explicit attempt.

The credential file must come from the approved official flow: version 1, provider qq, profile tencent-sdk, app_id, app_secret, owner_openid and owner_evidence=official-qr-response. Missing official scanning-owner evidence is rejected; do not invent that evidence marker. The official page may offer bot creation, so inspect the selection. Exiting the local script does not revoke grants already confirmed on the platform.

## 4. Configure backend and router separately

These are placeholders for private environment files. Do not copy every field from the old OAuth `.env.example`; mixed identities and modes are rejected.

Backend `qq.env`:

```dotenv
AUTH_MODE=tunnel-service
BRIDGE_MODE=tunnel
TUNNEL_SERVICE_OPERATION=live
TUNNEL_SERVICE_OWNER_ID=tunnel-owner:dot-bridge
HOST=127.0.0.1
PORT=8787
TUNNEL_SERVICE_KEY_FILE=/var/lib/dot-bridge/private/qq/service-key
QQ_TRANSPORT=gateway
QQ_API_PROFILE=tencent-sdk
QQ_APP_ID=APPROVED_APP_ID
QQ_CREDENTIALS_FILE=/var/lib/dot-bridge/private/qq/credentials.json
STORAGE_KEY_FILE=/var/lib/dot-bridge/private/qq/storage-key
DATABASE_PATH=/var/lib/dot-bridge/qq/bridge.sqlite
BRIDGE_LOCK_DIRECTORY=/var/lib/dot-bridge/locks
CALLBACK_TRANSPORT_MODE=standard
MCP_CALLBACK_ALLOWED_HOSTS=
```

Router `router.env`:

```dotenv
AUTH_MODE=tunnel-service
BRIDGE_MODE=tunnel
TUNNEL_SERVICE_OPERATION=live
TUNNEL_SERVICE_OWNER_ID=tunnel-owner:dot-bridge
TUNNEL_CHANNELS=qq
TUNNEL_LIVE_CHANNELS=qq
HOST=127.0.0.1
PORT=8789
TUNNEL_SERVICE_KEY_FILE=/var/lib/dot-bridge/private/tunnel/aggregate-service-key
QQ_SERVICE_KEY_FILE=/var/lib/dot-bridge/private/qq/service-key
QQ_MCP_PORT=8787
```

Check ports for conflicts; all MCP listeners bind only loopback. The router loads no provider credentials, storage key or database. A single channel needs two service keys: router and backend.

An initially empty callback allowlist permits catalog inspection but blocks messages. Obtain the actual callback through the original dot's subscription flow, then configure only the reviewed exact hostname. Never invent URLs or use wildcards. Direct-capable hosts use `CALLBACK_TRANSPORT_MODE=standard`. Required-proxy environments need a supported callback adapter; do not disable a necessary proxy or assert verification with an environment flag.

## 5. Install persistent services and connect the original dot

This is a Linux backend unit template. Replace `/ABSOLUTE/NODE` with the actual absolute Node path and save as `dot-bridge-qq.service`:

```ini
[Unit]
Description=dot bridge qq backend
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=dot-bridge
Group=dot-bridge
WorkingDirectory=/opt/dot-bridge/dot-qq-bridge
ExecStart=/ABSOLUTE/NODE --env-file=/var/lib/dot-bridge/private/qq.env scripts/qq-service.js --run --confirm-persistent-service
Restart=on-failure
RestartSec=5
TimeoutStopSec=180
UMask=0077
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

Create a separate `dot-bridge-router.service` with the same runtime user, working directory and stop grace. Set `ExecStart` to `/ABSOLUTE/NODE --env-file=/var/lib/dot-bridge/private/router.env scripts/run-tunnel-router.js --confirm-live` and `After=network-online.target dot-bridge-qq.service`. Run official tunnelclient as its own service after the router, using a command supported by the installed version. Do not guess client flags or reuse finite diagnostic windows.

Ordinary persistent services must not set `DOT_BRIDGE_SUPERVISED=1` or depend on SSH/stdin. After inspecting the units, an administrator runs `systemctl daemon-reload` and enables the services. Windows needs service management that survives logout and stops gracefully; an interactive terminal is insufficient.

Keep one instance of the intended official Tunnel and one MCP target pointing to the router. `X-Dot-Bridge-Service-Key` must use the client's supported `file:` reference to the router key. Provision the runtime key/profile through an approved official flow, checking the account, original Tunnel, client version and actual launch command. Restrict Tunnel Use to the deployment owner; its runtime key is not per-user authentication.

Refresh the same plugin on the original dot and inspect its tools and `qq.message.created` event. Create one `{"conversation":"owner"}` subscription; its signing material must come from the real flow. For approved Feishu groups, switch to `configured` as described in Configuration. The backend connects to the provider only after signed challenge verification and an active unique subscription. With default settings, leases are bounded to 24 hours and renewed by the original dot/platform using `refreshBefore`; the bridge creates no independent renewal task.

## 6. Human steps and real acceptance

Human participation is concentrated in choosing the app/host, approving persistent credentials/permissions/storage, scanning or pairing, confirming the old consumer is stopped, creating the original-dot subscription and checking the actual reply. Confirmation flags acknowledge existing approval; they do not grant it.

Verify in layers: dependencies/tests → process health → local authentication/catalogs → Tunnel → active subscription → provider Gateway → one answer in the original chat. Callback 2xx, visible tools or gateway connected alone do not prove end-to-end delivery. Have the owner send ordinary messages, check consecutive replies, then test graceful restart and retained state without duplicates. Repeat after SSH disconnects. Schedule a whole-server reboot separately. See [Operations and troubleshooting](troubleshooting.en.md) for maintenance and rollback.
