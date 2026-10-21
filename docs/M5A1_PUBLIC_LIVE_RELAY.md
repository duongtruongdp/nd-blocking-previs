# M5A.1 — Public Live Review Relay

M5A.1 keeps the read-only Host → Viewer protocol and moves its transport boundary from a development localhost relay to an Internet-facing WebSocket service.

## Architecture

```text
Static Web / WordPress frontend       macOS / Windows desktop
              │ HTTPS                         │ app WebView
              └────────────── WSS ────────────┘
                       public Node relay
                    /health and /live
```

The relay stores temporary serialized project snapshots and presentation state in memory. It does not render Three.js, run StageEngine, encode video, read `.ndblock` files, or persist project files. A relay restart ends its in-memory rooms; M5A.1 does not pretend to provide process-restart recovery.

## Client configuration

The official production relay is:

```text
wss://live.duongtruongdp.net/live
```

Web and Desktop production builds use that official relay by default. An
explicit build variable remains available for self-hosted deployments:

```sh
VITE_LIVE_RELAY_URL=wss://live.duongtruongdp.net/live npm run build
```

An explicit invalid production override fails closed and never falls back to
the official relay. Production accepts only `wss://` with the `/live` path.
When no override is supplied, production uses the official relay. Development
uses `ws://localhost:8787/live` when no variable is supplied.

The shareable Host invite is a separate concern from the relay URL. Production
and packaged Desktop builds use the canonical public app destination:

```text
https://blocking.duongtruongdp.net/?live=<session>
```

Normal browser development keeps the current browser origin for local testing
(the repository Vite server is fixed to `http://localhost:5174`). A controlled
public-relay development build may set both endpoints explicitly:

```sh
VITE_LIVE_RELAY_URL=wss://live.duongtruongdp.net/live \
VITE_LIVE_INVITE_BASE_URL=https://blocking.duongtruongdp.net \
npm run dev
```

`VITE_LIVE_INVITE_BASE_URL` accepts only an HTTP(S) URL and is optional. A
Tauri origin is never used as a shareable invite destination.

The deployed `live.duongtruongdp.net` record is currently operated as
Cloudflare **DNS Only**. During manual testing of this deployment, enabling
Cloudflare Proxy left the WebSocket connection in `CONNECTING`; this is an
observed deployment finding, not a universal Cloudflare limitation.

The Host token is returned only to the Host transport and is never placed in
the Viewer invite URL. The Live Review panel's Copy Link action copies this
canonical invite URL.

## Relay build and run

```sh
npm ci
npm run live-server:build
NODE_ENV=production HOST=127.0.0.1 PORT=8787 LIVE_ALLOWED_ORIGINS=https://app.example.com,https://www.example.com npm run live-server
```

The relay listens on `HOST:PORT` and accepts WebSockets only at `LIVE_WEBSOCKET_PATH` (default `/live`). `GET /health` is a public liveness check; `GET /ready` returns 200 while the process accepts traffic and 503 during shutdown. Neither endpoint exposes projects, tokens, or message contents.

## Environment variables

| Variable | Default | Purpose |
| --- | ---: | --- |
| `HOST` | `127.0.0.1` | Bind address, normally loopback behind a proxy |
| `PORT` | `8787` | HTTP/WebSocket listener port (`LIVE_RELAY_PORT` remains a local compatibility alias) |
| `LIVE_WEBSOCKET_PATH` | `/live` | WebSocket path |
| `LIVE_ALLOWED_ORIGINS` | none | Comma-separated exact browser origins; required for production browser clients |
| `LIVE_SESSION_TTL_MS` | `3600000` | Sliding room TTL |
| `LIVE_HOST_RECONNECT_GRACE_MS` | `30000` | Host reclaim window after disconnect |
| `LIVE_MAX_MESSAGE_BYTES` | `16777216` | Maximum WebSocket payload, 16 MiB |
| `LIVE_MAX_VIEWERS_PER_SESSION` | `25` | Viewer cap per room |
| `LIVE_MAX_SESSIONS` | `100` | Active in-memory room cap |
| `LIVE_MAX_MESSAGES_PER_SECOND` | `120` | Per-connection message rate |
| `LIVE_MAX_TRANSFORMS_PER_SECOND` | `60` | Per-connection transform rate |
| `LIVE_MAX_INVALID_MESSAGES_PER_MINUTE` | `8` | Invalid-message abuse threshold |
| `LIVE_MAX_CONNECTIONS_PER_IP` | `20` | Concurrent connection cap |
| `LIVE_MAX_SESSION_CREATES_PER_IP_PER_MINUTE` | `5` | Session creation cap |
| `LIVE_HEARTBEAT_INTERVAL_MS` | `15000` | WebSocket ping interval |

Production browser origins are rejected unless they exactly match `LIVE_ALLOWED_ORIGINS`. An absent `Origin` remains permitted for the desktop contract and non-browser smoke clients; session authentication still controls Host authority. The relay disables `permessage-deflate`; payloads are measured as UTF-8 JSON bytes and oversized messages are rejected by the WebSocket server.

## TLS and reverse proxy

Terminate TLS at nginx, Caddy, or the hosting provider. Proxy the public WSS endpoint to the loopback Node process without rewriting `/live`.

Example nginx shape:

```nginx
location /live {
    proxy_pass http://127.0.0.1:8787/live;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 75s;
}

location = /health { proxy_pass http://127.0.0.1:8787/health; }
location = /ready  { proxy_pass http://127.0.0.1:8787/ready; }
```

Public contract: frontend `https://app.example.com`; relay `wss://live.example.com/live`; health `https://live.example.com/health`. The WordPress/static host does not run the relay and does not need a listening port, router configuration, LAN address, or user-selected server.

## Operations and safety

The relay logs startup, session creation, Host reconnect/disconnect, Viewer join/leave, expiry, protocol/rate errors, and shutdown. Logs contain no Host tokens, invite URLs, project snapshots, Shot Notes, or raw WebSocket messages; session IDs are truncated. Heartbeat removes dead sockets. Host disconnects are announced and the room is reclaimable with the private token until the configured grace period expires. Viewer reconnect requests the latest snapshot/state. A graceful SIGTERM/SIGINT closes rooms and sockets before exiting.

M5A.1 is intentionally single-instance. Rooms are process-local, so deploy one relay instance (or provide sticky routing and accept that a restart ends rooms). Redis, CRDTs, persistent sessions, accounts, billing, chat, voice, video, and asset distribution are deferred.

## Remote-network acceptance

1. Build the frontend with the public `VITE_LIVE_RELAY_URL`.
2. Confirm `/health` and `/ready` over HTTPS.
3. Open the Host app on Network A and create a session.
4. Open the invite URL on Network B/cellular; do not use a LAN address.
5. Verify scene/project, actor/camera transforms, scene/master playback, Shot List, Present, reconnect, and End Session.
6. Add two remote Viewers and verify presence/broadcasts.
7. Disconnect the Host, confirm the grace state, reconnect the Host with the same app/session, then separately reconnect a Viewer.
8. Stop the relay and confirm ordinary offline editing, save, export, and Shot List export remain usable.

Physical remote-network testing is manual acceptance and is not claimed by automated validation.
