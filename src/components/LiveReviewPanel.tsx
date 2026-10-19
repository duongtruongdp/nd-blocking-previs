import { createPortal } from 'react-dom'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { LiveReviewChatMessage, LiveReviewLease, LiveReviewParticipant, LiveReviewRole } from '../liveReview/protocol'
import type { LiveReviewTransportStatus } from '../liveReview/liveReviewTransport'

type LiveReviewPanelProps = {
  open: boolean
  role: LiveReviewRole | null
  status: LiveReviewTransportStatus
  session: string | null
  inviteUrl: string | null
  viewerCount: number
  participants: LiveReviewParticipant[]
  leases: LiveReviewLease[]
  hostConnected: boolean
  chatMessages: LiveReviewChatMessage[]
  followHost: boolean
  pointerActive: boolean
  inviteSession: string | null
  error: string | null
  canStart: boolean
  configurationError: string | null
  onStart: (displayName: string) => void
  onJoin: (displayName: string) => void
  onFollowHost: (follow: boolean) => void
  onTogglePointer: () => void
  onSendChat: (text: string) => void
  onEnd: () => void
  onLeave: () => void
  onClose: () => void
  onRoleChange: (participantId: string, role: 'editor' | 'viewer') => void
  onTakeControl: (lease: LiveReviewLease) => void
}

function readStoredLiveReviewName() {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem('nd-live-review-name') ?? ''
  } catch {
    return ''
  }
}

function roleLabel(role: LiveReviewRole) {
  return role === 'host' ? 'HOST' : role === 'editor' ? 'EDITOR' : 'VIEWER'
}

type LiveReviewRolePopoverProps = {
  participant: LiveReviewParticipant
  roleButtonRef: RefObject<HTMLButtonElement | null>
  onClose: () => void
  onRoleChange: (role: 'editor' | 'viewer') => void
}

function LiveReviewRolePopover({ participant, roleButtonRef, onClose, onRoleChange }: LiveReviewRolePopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const menuId = 'v2-live-review-role-menu-' + participant.participantId

  const placePopover = useCallback(() => {
    const button = roleButtonRef.current
    if (!button) return
    const rect = button.getBoundingClientRect()
    const viewportPadding = 8
    const gap = 8
    const popoverWidth = Math.min(150, Math.max(0, window.innerWidth - (viewportPadding * 2)))
    const popoverHeight = 96
    const maxLeft = Math.max(viewportPadding, window.innerWidth - popoverWidth - viewportPadding)
    const left = Math.min(Math.max(viewportPadding, rect.right - popoverWidth), maxLeft)
    const belowTop = rect.bottom + gap
    const aboveTop = rect.top - popoverHeight - gap
    const top = belowTop + popoverHeight <= window.innerHeight - viewportPadding
      ? belowTop
      : Math.max(viewportPadding, aboveTop)
    setPosition({ top, left })
  }, [roleButtonRef])

  useLayoutEffect(() => {
    placePopover()
    const frame = window.requestAnimationFrame(placePopover)
    return () => window.cancelAnimationFrame(frame)
  }, [placePopover])

  useLayoutEffect(() => {
    popoverRef.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"]')?.focus()
  }, [])

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && (roleButtonRef.current?.contains(target) || popoverRef.current?.contains(target))) return
      onClose()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    const handleViewportChange = () => onClose()
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
    }
  }, [onClose, roleButtonRef])

  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      ref={popoverRef}
      id={menuId}
      className="v2-live-review-role-menu"
      role="menu"
      aria-label={'Role options for ' + participant.displayName}
      style={position ? { top: position.top, left: position.left } : { visibility: 'hidden' }}
    >
      <button className="v2-live-review-role-option" aria-checked={participant.role === 'viewer'} onClick={() => { onRoleChange('viewer'); onClose() }} role="menuitemradio" type="button">
        <span aria-hidden="true">{participant.role === 'viewer' ? '✓' : ''}</span>
        Viewer
      </button>
      <button className="v2-live-review-role-option" aria-checked={participant.role === 'editor'} onClick={() => { onRoleChange('editor'); onClose() }} role="menuitemradio" type="button">
        <span aria-hidden="true">{participant.role === 'editor' ? '✓' : ''}</span>
        Editor
      </button>
    </div>,
    document.body,
  )
}

type LiveReviewParticipantRowProps = {
  participant: LiveReviewParticipant
  viewerRole: LiveReviewRole
  lease: LiveReviewLease | undefined
  onRoleChange: (participantId: string, role: 'editor' | 'viewer') => void
  onTakeControl: (lease: LiveReviewLease) => void
}

function LiveReviewParticipantRow({ participant, viewerRole, lease, onRoleChange, onTakeControl }: LiveReviewParticipantRowProps) {
  const roleButtonRef = useRef<HTMLButtonElement>(null)
  const [roleMenuOpen, setRoleMenuOpen] = useState(false)
  const canManageRole = viewerRole === 'host' && participant.role !== 'host' && participant.status === 'connected'
  const closeRoleMenu = useCallback(() => {
    setRoleMenuOpen(false)
    window.requestAnimationFrame(() => roleButtonRef.current?.focus())
  }, [])

  const roleControl = canManageRole
    ? <>
      <button
        ref={roleButtonRef}
        className={'v2-live-review-role v2-live-review-role-' + participant.role}
        aria-controls={'v2-live-review-role-menu-' + participant.participantId}
        aria-expanded={roleMenuOpen}
        aria-haspopup="menu"
        aria-label={'Change role for ' + participant.displayName}
        onClick={() => setRoleMenuOpen((open) => !open)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !roleMenuOpen) {
            event.preventDefault()
            setRoleMenuOpen(true)
          }
        }}
        type="button"
      >
        {roleLabel(participant.role)} <span aria-hidden="true">⌄</span>
      </button>
      {roleMenuOpen ? <LiveReviewRolePopover participant={participant} roleButtonRef={roleButtonRef} onClose={closeRoleMenu} onRoleChange={(nextRole) => onRoleChange(participant.participantId, nextRole)} /> : null}
    </>
    : <span className={'v2-live-review-role v2-live-review-role-' + participant.role}>{roleLabel(participant.role)}</span>

  return <div className="v2-live-review-participant">
    <div className="v2-live-review-participant-main">
      <span className={'v2-live-review-presence-dot' + (participant.status === 'connected' ? ' is-connected' : '')} />
      <strong>{participant.displayName}</strong>
      {participant.status === 'reconnecting' ? <small className="v2-live-review-participant-status">reconnecting</small> : null}
      <div className="v2-live-review-role-control">{roleControl}</div>
    </div>
    {lease ? <div className="v2-live-review-edit-status"><span>Editing {lease.targetLabel}</span>{viewerRole === 'host' && participant.role !== 'host' ? <button className="v2-button v2-button-compact" onClick={() => onTakeControl(lease)} type="button">Take Control</button> : null}</div> : null}
  </div>
}

export function LiveReviewPanel({ open, role, status, session, inviteUrl, viewerCount, participants, leases, hostConnected, chatMessages, followHost, pointerActive, inviteSession, error, canStart, configurationError, onStart, onJoin, onFollowHost, onTogglePointer, onSendChat, onEnd, onLeave, onClose, onRoleChange, onTakeControl }: LiveReviewPanelProps) {
  const [copied, setCopied] = useState(false)
  const [displayName, setDisplayName] = useState(readStoredLiveReviewName)
  const [tab, setTab] = useState<'participants' | 'chat'>('participants')
  const [chatDraft, setChatDraft] = useState('')
  if (!open) return null
  const connected = status === 'live'
  const copyInvite = () => {
    if (!inviteUrl || typeof navigator === 'undefined' || !navigator.clipboard) return
    void navigator.clipboard.writeText(inviteUrl).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1400) }).catch(() => {})
  }
  const saveName = () => {
    const name = displayName.trim() || (role === 'host' ? 'Host' : 'Guest')
    try { window.localStorage.setItem('nd-live-review-name', name) } catch { /* Optional preference. */ }
    return name
  }
  const submitChat = () => {
    const text = chatDraft.replace(/\s+/g, ' ').trim()
    if (!text) return
    onSendChat(text)
    setChatDraft('')
  }
  const renderParticipant = (participant: LiveReviewParticipant) => <LiveReviewParticipantRow
    key={participant.participantId}
    participant={participant}
    viewerRole={role as LiveReviewRole}
    lease={leases.find((candidate) => candidate.participantId === participant.participantId)}
    onRoleChange={onRoleChange}
    onTakeControl={onTakeControl}
  />
  return <div className="v2-modal-backdrop" role="presentation">
    <section className="v2-live-review-panel" role="dialog" aria-modal="true" aria-labelledby="v2-live-review-title">
      <div className="v2-modal-heading"><div><span className="v2-eyebrow">Live Review</span><h2 id="v2-live-review-title">Collaborative review room</h2></div><button className="v2-modal-close" onClick={onClose} type="button" aria-label="Close Live Review">×</button></div>
      <p className="v2-live-review-copy">The Host remains canonical. Editors can transform selected scene entities and update Shot metadata; Viewers are read-only.</p>
      {configurationError && !role ? <p className="v2-live-review-error" role="alert">{configurationError}</p> : null}
      {error ? <p className="v2-live-review-error" role="alert">{error}</p> : null}
      {!role ? <div className="v2-live-review-start"><label className="v2-live-review-name"><span>Your name</span><input value={displayName} maxLength={48} placeholder="Guest" onChange={(event) => setDisplayName(event.target.value)} /></label><div className="v2-live-review-actions"><button className="v2-button v2-button-primary" disabled={!canStart} onClick={() => onStart(saveName())} type="button">Start Live Review</button>{inviteSession ? <button className="v2-button" disabled={!canStart} onClick={() => onJoin(saveName())} type="button">Join Session</button> : null}</div></div> : <div className="v2-live-review-status"><span className={`v2-live-review-dot${connected ? ' is-connected' : ''}`} aria-hidden="true" />{role === 'host' ? 'Hosting' : role === 'editor' ? 'Editing' : 'Viewing'} · {status}{role === 'host' ? ` · ${viewerCount} ${viewerCount === 1 ? 'viewer' : 'viewers'}` : null}{role !== 'host' && !hostConnected ? ' · Host reconnecting' : ''}</div>}
      {role === 'host' && session ? <label className="v2-live-review-invite"><span>Invite link</span><input readOnly value={inviteUrl ?? ''} onFocus={(event) => event.currentTarget.select()} /><button className="v2-button" onClick={copyInvite} type="button">{copied ? 'Copied' : 'Copy Link'}</button></label> : null}
      {role && session ? <><div className="v2-live-review-tabs" role="tablist"><button className={tab === 'participants' ? 'is-active' : ''} onClick={() => setTab('participants')} role="tab" type="button">Participants {participants.length}</button><button className={tab === 'chat' ? 'is-active' : ''} onClick={() => setTab('chat')} role="tab" type="button">Chat {chatMessages.length > 0 ? chatMessages.length : ''}</button></div>{tab === 'participants' ? <div className="v2-live-review-participants">{participants.map(renderParticipant)}{participants.length === 0 ? <span className="v2-live-review-empty">Waiting for participants…</span> : null}</div> : <div className="v2-live-review-chat"><div className="v2-live-review-chat-list">{chatMessages.map((message) => <div className="v2-live-review-chat-message" key={message.messageId}><strong>{message.displayName}</strong><span>{message.text}</span></div>)}{chatMessages.length === 0 ? <span className="v2-live-review-empty">No messages yet.</span> : null}</div><div className="v2-live-review-chat-compose"><input value={chatDraft} maxLength={1000} placeholder="Message the room" onChange={(event) => setChatDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submitChat() }} /><button className="v2-button" onClick={submitChat} type="button">Send</button></div></div>}{role === 'viewer' || role === 'editor' ? <label className="v2-live-review-follow"><input type="checkbox" checked={followHost} onChange={(event) => onFollowHost(event.target.checked)} /> Follow Host <small>{followHost ? 'Host presentation is authoritative' : 'Free Look · local navigation only'}</small></label> : <button className={`v2-live-review-pointer${pointerActive ? ' is-active' : ''}`} onClick={onTogglePointer} type="button">{pointerActive ? 'Pointer active · move over Stage' : 'Activate presenter pointer'}</button>}</> : null}
      <div className="v2-modal-actions">{role === 'host' ? <button className="v2-button is-danger" onClick={onEnd} type="button">End Session</button> : role === 'viewer' ? <button className="v2-button" onClick={onLeave} type="button">Exit Live Review</button> : null}<button className="v2-button" onClick={onClose} type="button">Close</button></div>
    </section>
  </div>
}
