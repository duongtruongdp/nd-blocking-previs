# M5A.1B — cPanel Live Relay Deployment

This guide prepares the existing ND Live Review relay for cPanel shared
hosting with **Setup Node.js App** / Passenger-style hosting. It does not
deploy anything, change DNS, or replace the existing VPS deployment.

## 1. What is being deployed

Only the realtime Node relay is deployed to cPanel:

```text
duongtruongdp.net                         WordPress (unchanged)
blocking.duongtruongdp.net                static Vite frontend
live.duongtruongdp.net                    cPanel Node relay
https://live.duongtruongdp.net/health     health check
https://live.duongtruongdp.net/ready      readiness check
wss://live.duongtruongdp.net/live         Live Review WebSocket
```

The frontend is not moved into the relay and no WordPress plugin is needed.

## 2. Check cPanel capabilities first

Before uploading files, confirm that the hosting plan provides:

- [ ] Setup Node.js App
- [ ] Node 22 LTS, or another version in the repository engine range
- [ ] a custom subdomain mapping
- [ ] HTTPS/SSL for `live.duongtruongdp.net`
- [ ] WebSocket upgrade support on the subdomain
- [ ] long-lived WebSocket connections
- [ ] environment variables in the Node app settings
- [ ] a single application process, or documented sticky routing/shared state
- [ ] application restart control

If the provider cannot keep all participants of one room on the same process,
stop at that point. This relay stores rooms in memory and is not safe behind
round-robin workers.

## 3. Create the relay subdomain and SSL

Create `live.duongtruongdp.net` in cPanel and attach it to the Node
application. Enable a valid certificate before testing the public endpoint.
The public browser connection must be `wss://`; do not use a public insecure
`ws://` endpoint.

Do not change the WordPress domain or the existing blocking frontend domain.

## 4. Build the relay locally

From the repository root on the Mac:

```bash
npm ci
npm run live-server:build
```

The recommended shared-hosting strategy is to compile locally and upload the
small compiled relay artifact. This avoids requiring TypeScript tooling and a
frontend build on the shared host.

## 5. Files to upload

Create this application directory in the cPanel account, for example:

```text
/home/<cpanel-user>/nd-live/
  package.json
  package-lock.json
  live-server.cpanel.js
  live-server/
    dist/
      live-server/server.js
      live-server/config.js
      live-server/sessionStore.js
      src/liveReview/protocol.js
```

Upload the **contents required by the compiled relay**, including the complete
`live-server/dist/` tree, the two package files, and
`live-server.cpanel.js`. Do not upload the Mac `node_modules` directory.

Do not upload the frontend `dist/`, `src/`, screenshots, or local project files
to this Node application. The frontend remains a separate static deployment.

## 6. Create the Node.js App

In cPanel → **Setup Node.js App**, use:

| Field | Value |
|---|---|
| Node.js version | Node 22 LTS (22.12 or newer within the repository engine range) |
| Application mode | Production |
| Application root | `nd-live` |
| Application URL | `https://live.duongtruongdp.net` |
| Application startup file | `live-server.cpanel.js` |

The application root is the cPanel-relative directory under the account home,
not a URL and not the filesystem root. If cPanel displays the full path, it
should resolve to `/home/<cpanel-user>/nd-live`.

The startup file is intentionally thin. It imports the compiled relay; the
relay itself owns HTTP routes, WebSocket upgrades, environment parsing, and
graceful shutdown.

## 7. Environment variables

Add these under **Setup Node.js App → Environment Variables**:

| Name | Value | Required | Purpose |
|---|---|---:|---|
| `NODE_ENV` | `production` | Yes | Enables production origin policy. |
| `LIVE_ALLOWED_ORIGINS` | `https://blocking.duongtruongdp.net,tauri://localhost` | Yes | Exact Web and macOS desktop origins allowed to open Live Review. These are frontend origins, not the relay hostname or a path. |
| `LIVE_WEBSOCKET_PATH` | `/live` | Yes | Keeps the public WebSocket contract. |
| `HOST` | `127.0.0.1` | Recommended | Binds the Node process behind the cPanel proxy. If the provider explicitly requires `0.0.0.0`, use that provider-documented value. |
| `LIVE_SESSION_TTL_MS` | `3600000` | Optional | One-hour in-memory room lifetime. |
| `LIVE_HOST_RECONNECT_GRACE_MS` | `30000` | Optional | Host reconnect grace period. |
| `LIVE_MAX_MESSAGE_BYTES` | `16777216` | Optional | Existing 16 MiB payload limit. Do not increase it without a separate review. |
| `LIVE_MAX_VIEWERS_PER_SESSION` | `25` | Optional | Per-room viewer limit. |
| `LIVE_MAX_SESSIONS` | `100` | Optional | In-memory room limit. |
| `LIVE_HEARTBEAT_INTERVAL_MS` | `15000` | Optional | Existing WebSocket heartbeat interval. |
| `LIVE_EDIT_LEASE_MS` | `8000` | Optional | Existing collaborative edit lease duration. |

Do **not** set `PORT=8787` in cPanel. Passenger/cPanel supplies the runtime
port. The relay already uses `process.env.PORT` and falls back to 8787 only
for local development. Leave `PORT` unset unless the hosting panel explicitly
documents a fixed internal port.

Do not use `*` for `LIVE_ALLOWED_ORIGINS`. Future origins may be added as a
comma-separated exact list, for example:

```text
https://blocking.duongtruongdp.net,https://preview.duongtruongdp.net,tauri://localhost
```

### Controlled localhost public-relay testing

The normal Vite development relay remains local. To test the Web client on
the public relay, the repository's fixed development origin is exactly
`http://localhost:5174` (`vite.config.ts` uses `strictPort: true`). Add that
origin explicitly to the cPanel environment value for the duration of the
test:

```text
https://blocking.duongtruongdp.net,tauri://localhost,http://localhost:5174
```

Then restart the cPanel Node application. Run the client with:

```bash
VITE_LIVE_RELAY_URL=wss://live.duongtruongdp.net/live npm run dev
```

This is an exact-origin development exception, not a wildcard and not a
replacement for the production allowlist. Remove `http://localhost:5174`
again after the public-relay test if it is not needed.

## 8. Install dependencies and start

After selecting the Node version, use the cPanel Terminal or the app’s package
installation control from the application root:

```bash
cd /home/<cpanel-user>/nd-live
npm ci --omit=dev
```

Do not upload Mac `node_modules`; native/platform differences can make it
unusable on the host. The compiled relay runs with the production dependencies
installed by cPanel.

Restart the Node application from cPanel after the files and environment are
ready. A restart ends all current in-memory Live Review sessions.

## 9. Test health, readiness, and WebSocket

First open:

```text
https://live.duongtruongdp.net/health
https://live.duongtruongdp.net/ready
```

Both should return HTTP 200 while the app is running. The safe JSON response
contains service/readiness/protocol/path information and a room count; it does
not expose session IDs, participant IDs, Host tokens, project data, chat, or
server paths.

Then verify a real WebSocket connection to exactly:

```text
wss://live.duongtruongdp.net/live
```

If health works but WebSocket fails, the likely issue is cPanel/Apache/LiteSpeed
WebSocket upgrade or timeout configuration. Do not downgrade to polling.

## 10. Build and upload the frontend

Build the blocking frontend separately:

```bash
VITE_LIVE_RELAY_URL=wss://live.duongtruongdp.net/live npm run build
```

Upload the generated frontend `dist/` contents using the existing static
workflow for `blocking.duongtruongdp.net`. Do not place those files inside the
Node relay application and do not modify the WordPress site.

Production builds fail closed if the relay URL is missing or insecure. Local
development remains `ws://localhost:8787/live` automatically.

## 11. Remote test sequence

1. Confirm `/health` and `/ready`.
2. Open `https://blocking.duongtruongdp.net` on Network A.
3. Start Live Review as Host.
4. Copy the invite link.
5. Open the invite on a phone using cellular data or another Internet network.
6. Join as Viewer.
7. Test presence, Follow Host, pointer, and chat.
8. Test Actor move and Camera move.
9. Test Shot and Master edits.
10. Promote the Viewer to Editor and test one collaborative edit.
11. End the session.

This is a manual acceptance sequence. Local checks must not be reported as
public deployment acceptance.

## 12. Updating the relay

1. Run `npm run live-server:build` locally.
2. Upload the updated `live-server/dist/` tree and startup file.
3. Run `npm ci --omit=dev` only if package dependencies changed.
4. Restart the Node application in cPanel.
5. Recheck `/health`, `/ready`, and `/live`.

Restarting deliberately clears all active rooms because the current relay is
single-process and in-memory.

## 13. Logs and troubleshooting

Use the cPanel Node app log view, the cPanel Errors section, or the app’s
stdout/stderr output in Terminal. Providers place these logs differently, so
do not assume a fixed absolute path. Relay logs are designed to avoid project
snapshots and tokens.

- **Health works, WebSocket fails:** WebSocket upgrade, proxy, or timeout support is missing.
- **403 origin:** `LIVE_ALLOWED_ORIGINS` does not exactly match the frontend origin.
- **App start fails:** check Node version, startup file, application root, and dependencies.
- **502/service unavailable:** the Node application is stopped or failed to boot.
- **Host joins but Viewer cannot find the session:** check for multiple Passenger workers or non-sticky routing.

The heartbeat is 15 seconds and should prevent normal idle WebSocket expiry,
but a provider may impose a lower hard timeout. Do not increase heartbeat
traffic aggressively without a separate review.

## 14. Shared-hosting limitations

The current relay is intentionally a small-team, single-process service.
Memory usage grows with active rooms, connected participants, project snapshots,
thumbnail-heavy projects, chat history, and transient collaboration state.
Shared-hosting quotas may limit simultaneous rooms or users.

One WebSocket connection stays on one worker, but all participants in one room
must reach the same worker. Multiple independent Node workers are unsafe unless
the host provides single-process operation, sticky routing, or shared state.
Redis, a database, persistent rooms, accounts, and multi-instance support are
explicitly deferred.

## 15. VPS fallback

The existing VPS path remains supported. Use
[M5A.1A Public Relay Deployment](./M5A1A_PUBLIC_RELAY_DEPLOYMENT.md) with the
checked-in systemd service and nginx reference. For VPS, use
`HOST=127.0.0.1`, an internally chosen `PORT` such as `8787`, nginx TLS/WSS,
and the same exact frontend-origin allowlist.
