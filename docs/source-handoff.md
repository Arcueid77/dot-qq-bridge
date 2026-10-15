# Source-only handoff

This delivery contains source, tests and generic configuration templates. It contains no runtime keys, provider identities, callback addresses, private databases, logs, tunnel-client binaries or deployment state.

## Standalone source layout

For QQ, clone only this repository at the reviewed commit. Keep its vendored core
release and lockfile together:

```text
work/
  dot-qq-bridge/
    src/
    scripts/run-tunnel-router.js
    vendor/dot-bridge-core-0.2.1.tgz
    vendor/core-release.json
    package-lock.json
```

Record the exact QQ Git revision, core version, source revision and artifact hash
when handing off a deployment. Branch tips can change. `vendor/core-release.json`
and the lockfile pin the reviewed package; no core source checkout is needed.

Shared transport, platform protection and routing have their only canonical
source in `dot-bridge-core`. QQ installs `@dot-bridge/core` from its included
release archive. Feishu also deploys independently from its own repository; it
does not import QQ source or require a QQ readiness backend. See [core.md](core.md).

## Offline checks

Use Node 24.15 or later within major version 24 and OpenSSL on PATH. Native
Windows additionally requires local NTFS and an existing trusted Python 3.10+
interpreter; its private storage boundary is described in [core.md](core.md).
Install locked dependencies with lifecycle scripts disabled. No account
credentials are needed for these checks. Run the same checks on the target Linux
runtime before deployment; Windows results do not replace Linux validation.

```sh
cd dot-qq-bridge
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
npm run check
npm test
npm run simulate
npm run simulate:gateway
```

The default suite needs neither Feishu nor core source directories. Its QQ
owner-runtime test registers only `qqAdapter` with the installed core router.
Use an isolated source directory to verify this property. Tests use synthetic
fixtures and loopback listeners; they do not prove real callback or provider
delivery.

For optional dual-adapter compatibility regression, keep both IM checkouts as
siblings named `dot-qq-bridge` and `dot-lark-bridge`, install each lockfile, and run
`node --test --test-concurrency=1 packages/dot-bridge-tunnel/test/*.test.js`
from QQ. Check that actual-sibling cases run rather than skip. Shared transport
tests belong to the core source repository and run with its `npm test`.
The finite-window [development launcher](../tools/tunnel-stack/README.md) still
uses this two-adapter layout; ordinary persistent single-QQ service does not.

## Safe continuation

- Default bridge authentication remains deny; private service mode is explicit and binds the loopback socket to one configured owner. Caller identity headers never grant identity or routing authority.
- Readiness uses an empty in-memory store, disables provider transports and excludes message tools and subscriptions.
- Live mode needs explicit CLI activation, verified channel-owner pairing, separate file-referenced service and storage keys, and private storage. Existing credentials must be provisioned locally through an approved secure input route; do not migrate a different computer's keys.
- A valid subscription and callback policy must be present before provider traffic can begin. Replies target the original verified private conversation.
- Callback challenge and delivery share the tested transport implementation. HTTPS proxy configuration without a supported managed adapter is blocked before callback DNS/network activity. There is no hidden direct fallback or unverified IP CONNECT route.
- `callback_transport.ready` describes adapter configuration, not network acceptance. The status always reports `network_checked: false`.

## Runtime evidence and remaining acceptance

The authorized 2026-10-14 to 15 deployment evidence is recorded in
[runtime-acceptance.md](runtime-acceptance.md), including real replies, restarts
and explicit unverified cases. It is not portable authorization or evidence that
a new installation is already connected.

The general managed-proxy adapter and its final destination binding remain
unverified. Inspect each target environment before selecting standard direct
transport. Preserve any required proxy, TLS verification and public-address
checks. A new installation needs its own approved real subscription and
same-conversation delivery acceptance; discovery is insufficient.

This source handoff does not stop an existing authorized service or authorize
another consumer. Confirm cross-host exclusivity before cutover, preserve the
database/key/identity and uncertain records, then follow the approved activation
and rollback procedure.
