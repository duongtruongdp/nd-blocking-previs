import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { phoneCameraRelaySocketUrl, phoneCameraRelayUrl } from './phoneCameraConfig'
import { deviceOrientationQuaternion, screenOrientationAngle, screenOrientationState } from './poseMath'
import { PHONE_CAMERA_PROTOCOL_VERSION, type PhoneCameraClientMessage } from './protocol'
import './phoneCamera.css'

type PhonePageStatus = 'idle' | 'connecting' | 'ready' | 'error' | 'unsupported'

export function PhoneCameraPage() {
  const params = new URLSearchParams(window.location.search)
  const session = params.get('session') ?? ''
  const token = params.get('token') ?? ''
  const relay = params.get('relay') || phoneCameraRelayUrl()
  const socketRef = useRef<WebSocket | null>(null)
  const lastSentAtRef = useRef(0)
  const latestQuaternionRef = useRef<[number, number, number, number] | null>(null)
  const listeningRef = useRef(false)
  const orientationHandlerRef = useRef<(event: DeviceOrientationEvent) => void>(() => {})
  const orientationListenerRef = useRef<(event: DeviceOrientationEvent) => void>((event) => orientationHandlerRef.current(event))
  const [status, setStatus] = useState<PhonePageStatus>('idle')
  const [message, setMessage] = useState('Tap Start Phone Camera to enable motion access.')
  const [connected, setConnected] = useState(false)
  const [recording, setRecording] = useState(false)
  const [screenMode, setScreenMode] = useState(screenOrientationState())

  const send = useCallback((payload: PhoneCameraClientMessage): boolean => {
    const socket = socketRef.current
    if (socket?.readyState !== WebSocket.OPEN) return false
    socket.send(JSON.stringify(payload))
    return true
  }, [])

  const sendCurrentOrientation = useCallback((mode = screenOrientationState()) => {
    const orientation = latestQuaternionRef.current
    if (!orientation) return
    send({ v: PHONE_CAMERA_PROTOCOL_VERSION, type: 'pose', session, t: Date.now(), orientation, position: null, screenOrientation: mode })
  }, [send, session])

  const handleOrientation = useCallback((event: DeviceOrientationEvent) => {
    const mode = screenOrientationState()
    setScreenMode(mode)
    const quaternion = deviceOrientationQuaternion(
      ((event.alpha ?? 0) * Math.PI) / 180,
      ((event.beta ?? 0) * Math.PI) / 180,
      ((event.gamma ?? 0) * Math.PI) / 180,
      screenOrientationAngle(),
    )
    latestQuaternionRef.current = quaternion.toArray() as [number, number, number, number]
    const now = performance.now()
    if (now - lastSentAtRef.current < 33) return
    lastSentAtRef.current = now
    send({ v: PHONE_CAMERA_PROTOCOL_VERSION, type: 'pose', session, t: Date.now(), orientation: latestQuaternionRef.current, position: null, screenOrientation: mode })
  }, [send, session])

  const connect = () => {
    if (!session || !token) {
      setStatus('error')
      setMessage('This pairing link is incomplete. Generate a new QR code in the desktop app.')
      return
    }
    if (!window.isSecureContext) {
      setStatus('error')
      setMessage('Phone Camera requires HTTPS. Open the secure pairing link again.')
      return
    }
    let socket: WebSocket
    try {
      const url = new URL(phoneCameraRelaySocketUrl(relay))
      url.searchParams.set('session', session)
      url.searchParams.set('token', token)
      url.searchParams.set('role', 'phone')
      socket = new WebSocket(url)
    } catch {
      setStatus('error')
      setMessage('The Phone Camera relay address is invalid.')
      return
    }
    socketRef.current = socket
    setStatus('connecting')
    setMessage('Connecting to the desktop…')
    socket.addEventListener('open', () => {
      setConnected(true)
      setMessage('Connection ready. Enable motion access to begin.')
      socket.send(JSON.stringify({ v: 1, type: 'hello', role: 'phone', session }))
      if (listeningRef.current) socket.send(JSON.stringify({ v: 1, type: 'ready', session, device: navigator.userAgent.slice(0, 120) }))
    })
    socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return
      try {
        const incoming = JSON.parse(event.data) as { type?: string; t?: number; action?: 'start' | 'stop'; accepted?: boolean; message?: string }
        if (incoming.type === 'ping') send({ v: 1, type: 'pong', session, t: incoming.t ?? Date.now() })
        if (incoming.type === 'recenter') setMessage('Recentered from the desktop Camera.')
        if (incoming.type === 'setCameraKeyAck') {
          setMessage(incoming.accepted ? 'Key set on the desktop Camera.' : (incoming.message ?? 'Set Camera Key was not accepted.'))
        }
        if (incoming.type === 'recordStart') setMessage('Recording Camera movement…')
        if (incoming.type === 'recordStart') setRecording(true)
        if (incoming.type === 'recordStop') { setRecording(false); setMessage('Camera movement recording stopped.') }
        if (incoming.type === 'recordAck') {
          setRecording(incoming.accepted && incoming.action === 'start' ? true : incoming.action === 'stop' ? false : recording)
          setMessage(incoming.accepted ? (incoming.action === 'start' ? 'Recording Camera movement…' : 'Camera movement recording stopped.') : (incoming.message ?? 'Camera movement command was not accepted.'))
        }
        if (incoming.type === 'error') {
          setConnected(false)
          setStatus('error')
          setMessage('This pairing has expired. Scan a fresh QR code.')
        }
        if (incoming.type === 'disconnected') {
          setConnected(false)
          setStatus('idle')
          setMessage('Disconnected. Scan a fresh pairing link to reconnect.')
        }
      } catch { /* Ignore malformed relay packets. */ }
    })
    socket.addEventListener('error', () => {
      setConnected(false)
      setStatus('error')
      setMessage('The secure relay could not be reached.')
    })
    socket.addEventListener('close', () => {
      setConnected(false)
      setRecording(false)
      if (listeningRef.current) {
        window.removeEventListener('deviceorientation', orientationListenerRef.current)
        listeningRef.current = false
      }
      setStatus('idle')
      setMessage('Disconnected. Scan a fresh pairing link to reconnect.')
    })
  }

  const startSensor = async () => {
    const orientationApi = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> }
    if (!orientationApi || !('ondeviceorientation' in window)) {
      setStatus('unsupported')
      setMessage('This browser does not provide device orientation access.')
      return
    }
    if (!window.isSecureContext) {
      setStatus('error')
      setMessage('Phone Camera requires HTTPS. Open the secure pairing link again.')
      return
    }
    try {
      const permission = typeof orientationApi.requestPermission === 'function' ? await orientationApi.requestPermission() : 'granted'
      if (permission !== 'granted') {
        setStatus('error')
        setMessage('Motion access was denied. Allow Motion & Orientation Access in Safari, then try again.')
        return
      }
      if (!connected) connect()
      orientationHandlerRef.current = handleOrientation
      window.addEventListener('deviceorientation', orientationListenerRef.current)
      listeningRef.current = true
      setStatus('ready')
      setMessage('Move the phone to aim the active Camera. Hold steady for a clean move.')
      if (socketRef.current?.readyState === WebSocket.OPEN) send({ v: 1, type: 'ready', session, device: navigator.userAgent.slice(0, 120) })
    } catch {
      setStatus('error')
      setMessage('Motion access could not be enabled.')
    }
  }

  const recenter = () => {
    setMessage(send({ v: 1, type: 'recenter', session }) ? 'Recentered.' : 'Connection lost. Scan a fresh pairing link to reconnect.')
  }

  const setCameraKey = () => {
    setMessage(send({ v: 1, type: 'setCameraKey', session }) ? 'Setting Camera Key…' : 'Connection lost. Scan a fresh pairing link to reconnect.')
  }

  const toggleRecording = () => {
    const type = recording ? 'recordStop' : 'recordStart'
    setMessage(send({ v: 1, type, session }) ? (recording ? 'Stopping Camera movement…' : 'Starting Camera movement…') : 'Connection lost. Scan a fresh pairing link to reconnect.')
  }

  const disconnect = () => {
    socketRef.current?.close(1000, 'phone-disconnected')
    socketRef.current = null
    setConnected(false)
    setRecording(false)
    if (listeningRef.current) {
      window.removeEventListener('deviceorientation', orientationListenerRef.current)
      listeningRef.current = false
    }
    setStatus('idle')
    setMessage('Disconnected from the desktop.')
  }

  useEffect(() => () => {
    if (listeningRef.current) window.removeEventListener('deviceorientation', orientationListenerRef.current)
    socketRef.current?.close()
  }, [])
  useEffect(() => {
    const handleScreenChange = () => {
      const mode = screenOrientationState()
      setScreenMode(mode)
      if (mode === 'portrait') setMessage('Rotate your phone sideways.')
      else if (status === 'ready') setMessage('Phone orientation changed. Recenter from the desktop Camera.')
      sendCurrentOrientation(mode)
    }
    window.addEventListener('orientationchange', handleScreenChange)
    screen.orientation?.addEventListener?.('change', handleScreenChange)
    return () => {
      window.removeEventListener('orientationchange', handleScreenChange)
      screen.orientation?.removeEventListener?.('change', handleScreenChange)
    }
  }, [sendCurrentOrientation, status])
  useEffect(() => {
    orientationHandlerRef.current = handleOrientation
  }, [handleOrientation])

  return <main className="phone-camera-page">
    <section className="phone-camera-card">
      <div className="phone-camera-mark">ND</div>
      <span className="phone-camera-kicker">ND BLOCKING &amp; PREVIS</span>
      <h1>Phone Camera</h1>
      <p className="phone-camera-status" role="status">{message}</p>
      <div className={`phone-camera-light is-${status}`} aria-hidden="true" />
      <button className="phone-camera-primary" onClick={() => { void startSensor() }} disabled={status === 'ready'} type="button">{status === 'ready' ? 'Phone Camera Active' : 'Start Phone Camera'}</button>
      {status === 'ready' ? <button className="phone-camera-secondary" onClick={recenter} type="button">Recenter</button> : null}
      {status === 'ready' ? <button className="phone-camera-secondary" onClick={setCameraKey} type="button">Set Camera Key</button> : null}
      {status === 'ready' ? <button className="phone-camera-secondary" onClick={toggleRecording} type="button">{recording ? 'Stop Recording' : 'Record Move'}</button> : null}
      {connected ? <button className="phone-camera-secondary" onClick={disconnect} type="button">Disconnect</button> : null}
      <small>{screenMode === 'portrait' ? 'Rotate your phone sideways for live Camera control.' : 'Keep this page open while the desktop app receives Camera orientation.'}</small>
    </section>
  </main>
}

const root = document.getElementById('phone-camera-root')
if (root) createRoot(root).render(<PhoneCameraPage />)
