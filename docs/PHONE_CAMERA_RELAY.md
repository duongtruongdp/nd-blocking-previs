# Phone Camera Relay

The relay is a small Cloudflare Worker plus one Durable Object class per
pairing session. Source lives in `relay/worker.ts`; `wrangler.toml` is a
canonical deployment description.

The Durable Object holds only active WebSocket peer state and an expiring
pairing token while the session is live. It does not write project files,
accounts, images, video, or pose logs to durable storage. There is one desktop
and one phone per session. A second peer of either role is rejected.

The worker exposes `GET /health` and upgrades `GET /session` only when the
request contains a valid session, token, role, and WebSocket upgrade. The
message allowlist is enforced again inside the session object. The relay is a
transport boundary: it does not interpret camera math and does not persist
orientation packets.

Direction is explicit: phone `controlChannels`, `setMovementScale`,
`setRotationSensitivity`, and `recenter` are requests; desktop `controlState`
and `recenterAck` are authoritative responses. A desktop `controlChannels` or
phone `controlState` packet is rejected, preventing accidental request/state
echo loops and preserving compatibility with the legacy Web Rotation-only
companion. Native hold requests are phone-only; `recenterHoldState` is a
desktop-only acknowledgement.

The current deployed Worker is:

```text
https://nd-blocking-phone-relay.nd-blocking-previs.workers.dev
```

Its secure WebSocket endpoint is:

```text
wss://nd-blocking-phone-relay.nd-blocking-previs.workers.dev/session
```

The current channel-controls-compatible deployment is
`8d9ba936-d645-4d55-b436-43eb470e45e0`. The Worker is named
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
