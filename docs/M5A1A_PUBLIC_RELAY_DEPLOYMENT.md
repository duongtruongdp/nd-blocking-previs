# M5A.1A — Public Live Review Relay Deployment

This runbook prepares the existing ND Blocking & Previs Live Review relay for
one public Linux deployment. It does not add collaboration features, storage,
clustering, or a user-facing server selector.

## Architecture and production contract

```text
Browser / Desktop clients
        │ HTTPS frontend + WSS relay
        ▼
https://live.example.com/health
wss://live.example.com/live
        │ TLS terminates at nginx
        ▼
127.0.0.1:8787  ND Live Relay (one Node process)
```

The official production relay for this project is
`wss://live.duongtruongdp.net/live`. The frontend origin and relay origin may differ. The relay's `LIVE_ALLOWED_ORIGINS`
contains browser origins such as `https://app.example.com`; it does not contain
the relay URL and it does not include a WordPress pathname. An app at
`https://app.example.com/previs/` still sends the origin
`https://app.example.com`.

The public WebSocket contract is exactly `/live`. The proxy must not turn it
into `/live/live` or proxy it to the root path.

## Support and repository layout

The repository uses Vite 8, whose supported Node contract is recorded in the
root `package.json`: `^20.19.0 || >=22.12.0`. Install a maintained LTS release
within that contract and pin the operational version on the server. Confirm
with `node --version` before building.

The relay is built from the repository root, not as an independent npm package:

```text
/opt/nd-live/
  package.json
  package-lock.json
  node_modules/
  live-server/
    config.ts
    server.ts
    sessionStore.ts
    dist/
      live-server/server.js
      live-server/config.js
      live-server/sessionStore.js
      src/liveReview/protocol.js
  src/liveReview/protocol.ts
  .env
```

The runtime command is:

```bash
NODE_ENV=production node live-server/dist/live-server/server.js
```

The repository convenience command also rebuilds first:

```bash
npm run live-server
```

The relay binds `HOST` and `PORT`; production should use `HOST=127.0.0.1` and
`PORT=8787`. Port 8787 must not be public.

## Install and build

Run as a deployment administrator, then give ownership to the non-root service
user:

```bash
sudo useradd --system --home /opt/nd-live --shell /usr/sbin/nologin ndlive
sudo mkdir -p /opt/nd-live
sudo chown ndlive:ndlive /opt/nd-live
cd /opt/nd-live
# Copy the repository source or a reviewed release artifact here.
npm ci
npm run live-server:build
sudo install -d -o ndlive -g ndlive /opt/nd-live
sudo install -o ndlive -g ndlive live-server/.env.example /opt/nd-live/.env
sudo chmod 600 /opt/nd-live/.env
```

The relay has no automatic `.env` loading. `live-server/config.ts` reads
`process.env`; the systemd `EnvironmentFile` is the explicit production
configuration mechanism. Shell launches must export the same variables before
starting Node.

Copy `live-server/.env.example` to `.env`, replace the example origins, and do
not commit `.env` or put secrets/tokens in it.

## Environment

The checked-in template contains every implemented relay setting. The core
production values are:

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=8787
LIVE_ALLOWED_ORIGINS=https://app.example.com,https://www.app.example.com
LIVE_WEBSOCKET_PATH=/live
```

The current defaults are intentionally finite: 1-hour sliding room TTL,
30-second Host reclaim grace, 16 MiB messages, 25 viewers per room, 100 active
in-memory rooms, heartbeat every 15 seconds, and the configured message,
transform, invalid-message, connection, and session-create rate limits.

## systemd

The checked-in template is [nd-live.service](./deployment/nd-live.service).
Install and enable it:

```bash
sudo cp docs/deployment/nd-live.service /etc/systemd/system/nd-live.service
sudo systemctl daemon-reload
sudo systemctl enable --now nd-live
sudo systemctl status nd-live
```

The service runs as `ndlive`, uses `/opt/nd-live/.env`, restarts on failure, and
sends SIGTERM for the relay's graceful shutdown path. It does not require a
privileged port.

View logs without exposing project data or tokens:

```bash
sudo journalctl -u nd-live -f
sudo journalctl -u nd-live --since today
```

## DNS, TLS, nginx, and firewall

Create a DNS record for `live.example.com` pointing to the public relay server
IP. Provider-specific DNS steps are not required by the application.

The checked-in [nginx reference](./deployment/nd-live.nginx.conf) terminates
TLS, proxies `/health`, `/ready`, and `/live`, preserves `Origin`, enables the
WebSocket upgrade, and uses long WebSocket timeouts. Replace the hostname and
certificate paths, obtain a certificate for the relay hostname, then enable the
server block. Test and reload nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Minimal firewall policy:

```text
Public: 80/tcp and 443/tcp
Private: 8787/tcp (loopback only)
SSH: deployment-specific administration policy
```

End users do not configure routers, port forwarding, LAN addresses, or a local
server.

## Health and WebSocket checks

Before exposing the service, check locally:

```bash
curl -i http://127.0.0.1:8787/health
curl -i http://127.0.0.1:8787/ready
```

Expected body shape is similar to:

```json
{"ok":true,"ready":true,"service":"nd-blocking-live-review-relay","protocol":2,"websocketPath":"/live","rooms":0}
```

After nginx and TLS:

```bash
curl -i https://live.example.com/health
curl -i https://live.example.com/ready
```

The WebSocket check must use `wss://live.example.com/live`; a request to the
root or `/live/live` is not the production contract. A client using the wrong
protocol version receives the existing compatibility error. The existing relay
also keeps these errors distinct: unreachable/TLS failures occur at transport,
while protocol mismatch, origin rejection, missing session, invalid Host token,
room-full, and Host-disconnected states remain protocol/status errors.

## Frontend build and invite links

Build the normal web app with the public relay URL:

```bash
VITE_LIVE_RELAY_URL=wss://live.duongtruongdp.net/live npm run build
```

Web and Desktop production builds use this official relay when
`VITE_LIVE_RELAY_URL` is omitted. An explicit valid `wss://.../live` value
remains available for self-hosted deployments; an invalid explicit value fails
closed.

Deploy the generated frontend through the existing static/WordPress workflow.
Production and packaged Desktop invites use the canonical public frontend
destination:

```text
https://blocking.duongtruongdp.net/?live=<session-id>
```

It must not point viewers at `live.duongtruongdp.net`. Production HTTPS pages
require `wss://`; the app fails closed rather than falling back to `ws://` or
localhost. The Host token is not included in the invite URL.

## Remote acceptance sequence

Automated work can prepare this deployment, but it cannot claim public manual
acceptance. Use genuinely different networks: Host on Network A and Viewer on
Network B/cellular, not two tabs or devices on one LAN.

1. Start the relay and confirm `/health` and `/ready` over HTTPS.
2. Build and deploy the frontend with the public WSS URL.
3. On Network A, open the app and start Live Review.
4. Copy the canonical public invite link.
5. On Network B, open the link and join as Viewer.
6. Verify scene/shot/camera changes, Actor and Camera moves, timeline seek and
   playback, Master playback/cuts, Shot List, and Present mode.
7. Verify the accepted Camera local gizmo behavior remains local on the Host;
   only the resulting transform is sent to Viewers.
8. Add Viewers A, B, and C on separate connections and verify fan-out/count.
9. Interrupt Host networking briefly, reconnect within the grace period, and
   verify reclaim without creating a new room.
10. Disconnect/reconnect a Viewer and verify the latest snapshot, revision,
    presentation state, playhead, and workspace return.
11. End the session and verify Viewers receive `session_ended`.
12. Stop the relay and verify the normal app still supports Blocking, Save,
    Master export, and Shot List export offline.

Internet latency affects update delay; this is interactive previs review, not a
frame-perfect synchronized playback guarantee.

## Updates, rollback, and limitations

This relay is intentionally a single in-memory instance. Do not place multiple
independent instances behind round-robin load balancing. Memory scales with
active rooms, serialized project snapshots, connected sockets, and thumbnail-
heavy projects. There is no database, Redis, room persistence, clustering,
asset upload, authentication system, or multi-user editing in M5A.1A.

Safe update:

```bash
cd /opt/nd-live
cp -a live-server/dist live-server/dist.before-update
npm ci
npm run live-server:build
sudo systemctl restart nd-live
curl -fsS https://live.example.com/health
curl -fsS https://live.example.com/ready
```

Rollback is the inverse: restore the reviewed previous source/dependencies or
`live-server/dist.before-update`, restart the service, and repeat the health
checks. A server restart ends all active Live Review sessions; zero-downtime
updates are not supported yet.

## Desktop contract

The relay protocol is platform-neutral. Desktop clients use the same configured
`wss://` URL and do not depend on browser-only Host/server behavior. Native
clients may omit `Origin`; the session protocol still authenticates Host
authority. No desktop packaging is added by this milestone.

## Product boundary

The normal product has one configured Live Review service. Do not add Local
Server, LAN Server, Host This Computer, or a relay URL field to the UI. Comments,
chat, pointers, reactions, participant accounts, permissions, and other M5A.2
features remain deferred.
