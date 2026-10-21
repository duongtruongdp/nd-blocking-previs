# Live Review relay deployment artifact

This directory is the standalone Node relay source used by `npm run live-server:build`. The compiled output is emitted under `live-server/dist/` and includes the platform-neutral protocol needed at runtime. The relay has no frontend, Three.js, renderer, export, or project-file I/O dependency.

For production, run the root build with `npm ci`, then launch the compiled relay with `NODE_ENV=production node live-server/dist/live-server/server.js`. Put TLS and the public WSS hostname in a reverse proxy; bind Node to loopback. See `docs/M5A1A_PUBLIC_RELAY_DEPLOYMENT.md` for the VPS/systemd/nginx path and `docs/M5A1B_CPANEL_LIVE_RELAY_DEPLOYMENT.md` for cPanel Setup Node.js App / Passenger hosting.

Example public contract:

```text
https://app.example.com       static frontend
wss://live.example.com/live   relay WebSocket
https://live.example.com/health
```

The relay is intentionally one-instance and in-memory for M5A.1. A process restart destroys active rooms. Do not deploy it as a multi-instance service without a later shared-room design.
