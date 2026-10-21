// cPanel Setup Node.js App startup file.
// Build first with `npm run live-server:build`; the compiled relay owns the
// HTTP server, WebSocket upgrade path, health routes, and graceful shutdown.
import './live-server/dist/live-server/server.js'
