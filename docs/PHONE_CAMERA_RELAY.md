# Phone Camera Relay

The relay is a small Cloudflare Worker plus one Durable Object class per
pairing session. Source lives in `relay/worker.ts`; `wrangler.toml` is a
deployment description, not an instruction to deploy during this milestone.

The Durable Object holds only active WebSocket peer state and an expiring
pairing token while the session is live. It does not write project files,
accounts, images, video, or pose logs to durable storage. There is one desktop
and one phone per session. A second peer of either role is rejected.

The worker exposes `GET /health` and upgrades `GET /session` only when the
request contains a valid session, token, role, and WebSocket upgrade. The
message allowlist is enforced again inside the session object. The relay is a
transport boundary: it does not interpret camera math and does not persist
orientation packets.

The current deployed Worker is:

```text
https://nd-blocking-phone-relay.nd-blocking-previs.workers.dev
```

Its secure WebSocket endpoint is:

```text
wss://nd-blocking-phone-relay.nd-blocking-previs.workers.dev/session
```

The active deployment used by the accepted physical V1 test is
`ac08a24c-11fc-42ed-8e71-c72b21db41a4`. The Worker is named
`nd-blocking-phone-relay` and uses the
`PHONE_SESSIONS` Durable Object binding for `PhoneSessionRoom`. Its first
deployment uses the single `v1` SQLite-backed class migration. The intended
`phone.duongtruongdp.net` hostname is not currently DNS-resolvable, so no
custom-domain or unrelated DNS changes were made.

Validate the relay source locally with:

```text
npm run relay:typecheck
```

The companion remains a separate static HTTPS build at
`https://blocking.duongtruongdp.net/phone-camera/`. Deployment of that build
to cPanel and physical iPhone acceptance are still manual boundaries.
