import WebSocket from 'ws'

const relayUrl = process.argv[2] ?? 'ws://localhost:8787/live'
const origin = process.argv[3] ?? (relayUrl.startsWith('wss:') ? 'https://blocking.duongtruongdp.net' : 'http://localhost')
const timeoutMs = 10000
const participantId = `smoke-${Math.random().toString(36).slice(2, 10)}`

function endpoint(value) {
  const url = new URL(value)
  return `${url.protocol}//${url.host}${url.pathname}`
}

const safeEndpoint = endpoint(relayUrl)
console.log(`[smoke] connecting ${safeEndpoint} origin=${origin}`)

const socket = new WebSocket(relayUrl, { origin })
let settled = false
const timeout = setTimeout(() => {
  if (settled) return
  settled = true
  console.error('[smoke] timeout before session_created')
  socket.terminate()
  process.exitCode = 1
}, timeoutMs)

socket.once('open', () => {
  console.log('[smoke] websocket open')
  socket.send(JSON.stringify({ v: 2, type: 'create_session', participantId, displayName: 'Smoke' }))
  console.log('[smoke] create-session sent')
})

socket.on('message', (raw) => {
  let message
  try { message = JSON.parse(raw.toString()) } catch {
    console.error('[smoke] invalid JSON response')
    return
  }
  console.log(`[smoke] response type=${typeof message.type === 'string' ? message.type : 'invalid'} v=${typeof message.v === 'number' ? message.v : 'unknown'}`)
  if (message.type === 'session_created') {
    settled = true
    clearTimeout(timeout)
    console.log('[smoke] protocol session creation complete')
    socket.close(1000, 'smoke-complete')
  } else if (message.type === 'error') {
    settled = true
    clearTimeout(timeout)
    console.error(`[smoke] relay error code=${typeof message.code === 'string' ? message.code : 'unknown'}`)
    socket.close(1000, 'smoke-error')
    process.exitCode = 1
  }
})

socket.once('error', () => {
  if (settled) return
  settled = true
  clearTimeout(timeout)
  console.error('[smoke] websocket error')
  process.exitCode = 1
})

socket.once('close', (code) => {
  clearTimeout(timeout)
  console.log(`[smoke] websocket close code=${code}`)
  if (!settled) process.exitCode = 1
})
