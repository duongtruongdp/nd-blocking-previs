# Phone Camera V1 Architecture

## Connection model

The desktop application is the authority for the current Scene and active
Camera. It creates a cryptographically random short-lived pairing session and
renders a QR code for the separate HTTPS companion page at
`/phone-camera/`. Both peers make outbound WSS connections to a public relay;
the desktop does not open an inbound port and the phone does not connect to a
local development server.

The current deployed relay endpoint is
`wss://nd-blocking-phone-relay.nd-blocking-previs.workers.dev/session`; the
Worker is named `nd-blocking-phone-relay`, with Durable Object
`PhoneSessionRoom` bound as `PHONE_SESSIONS`. The intended custom endpoint
remains `wss://phone.duongtruongdp.net` once its DNS and Worker route are
configured. The companion endpoint remains
`https://blocking.duongtruongdp.net/phone-camera/`. Deployments can override
them with `VITE_PHONE_CAMERA_RELAY_URL` and
`VITE_PHONE_CAMERA_COMPANION_URL`.

## Runtime ownership

`PhoneCameraSession` owns one WebSocket and protocol lifecycle. The phone page
requests Device Orientation permission directly from the Start button, which
preserves Safari's transient-user-activation requirement. `PhoneCameraController`
keeps the latest sensor quaternion outside React render state, computes a
relative semantic layer from the recenter baseline, applies bounded smoothing,
and publishes only the latest layer through an imperative data bridge. The
bridge does not mutate Three.js objects.

The phone adapter reads the authoritative screen angle with the legacy iOS
orientation fallback, applies one screen correction, and labels the result as
landscape-left, landscape-right, or portrait. Portrait pauses live Camera
updates until the phone is held sideways and the user recenters. Sensitivity
and smoothing are applied only after this normalization and recenter step.

V2Stage owns the final Camera composition boundary. It combines the evaluated
Timeline base pose with the latest Phone Camera layer, then sends that one final
pose to the Stage Camera proxy and the isolated Camera View/Preview runtime. It
does not alter StageEngine navigation, camera projection math, Frame Guides, or
the saved Camera document during live sensor control. The Inspector's
orientation fields and Rotate tool are disabled while the active Camera is
live-controlled. The Web companion is Rotation-only. Native iOS can also
control Camera Position through the same temporary composition layer without
writing live movement to the saved Camera document.

During Timeline playback the evaluated Camera pose remains the base. Phone
Truck, Pedestal, Dolly, Pan, Tilt, and Dutch contributions are additive on top
of that base, with the latest phone packet winning and no packet queue. Recenter
rebases the phone baselines while preserving the currently rendered pose;
disconnect removes the temporary layer and leaves Timeline evaluation in
control. Live operation does not create document, keyframe, or history writes
unless the explicit Set Camera Key or Record Move commands are used.

Timeline Camera evaluation is property-authoritative rather than a full-pose
rewrite: Position-only keys leave Rotation untouched, Rotation-only keys leave
Position untouched, and empty Camera tracks have no transform authority. The
temporary phone layer is then composed additively over that partial Timeline
base.

The native companion exposes one Recenter interaction: press and hold to enter
Repositioning, move the phone while the live layer is frozen, then release to
rebase and resume. There is no separate native quick-tap Recenter action.

## Native iOS spatial-control prototype

The isolated `mobile/ios/NDPhoneCamera` companion adds a second pose source:

```text
Web companion       Device Orientation       Rotation Only
Native iOS          ARKit World Tracking    Position + Rotation
        \                    /               |
         same v1 pose protocol + relay + PhoneCameraController
```

The native app uses ARKit's `ARWorldTrackingConfiguration` and sends only the
camera transform's position and quaternion. It does not send AR frames, video,
LiDAR meshes, or accelerometer-integrated movement. ARKit's right-handed
`+Y`-up, `-Z`-forward camera convention matches the ND convention, so the
conversion is centralized in `PhoneCameraPoseMath.swift` rather than scattered
through the relay or desktop runtime.

At Recenter, the desktop captures the latest phone position/orientation and the
active Camera's visible position/orientation. Translation is computed relative
to that physical reference, rotated into the virtual Camera frame, and then
smoothed before the live runtime bridge receives it. Position and rotation are
runtime-only. Native users can choose the `Move`, `Rotate`, `Full`, or `Custom`
preset, then enable individual Truck, Pedestal, Dolly, Pan, Tilt, and Dutch
channels. The Web companion remains Rotation-only and does not expose these
native channel controls.

Each channel has its own semantic baseline. Enabling a channel rebases that
channel to the current phone pose without changing the visible Camera;
disabling it freezes its current virtual contribution. Recenter re-references
enabled channels and leaves disabled channels disabled. Movement Scale affects
translation only, while Rotation Sensitivity affects Pan, Tilt, and Dutch
only. The desktop filters at the Camera channel layer before applying the
runtime pose, so rotation filtering is independent of quaternion storage.
Native capability negotiation explicitly advertises `controlChannels: true`;
native does not send legacy `controlMode` packets. Legacy mode packets are
used only for older/non-channel companions such as the Web Rotation-only path.

For a channel-capable session, the desktop is the authoritative control-state
owner. Native sends channel and slider requests; the desktop applies the same
no-jump rebasing operation used by its Inspector and echoes `controlState`.
Desktop-originated changes publish that state directly and never masquerade as
phone requests. Recenter is one desktop operation: either the desktop button
or a phone `recenter` request calls it, and the phone receives `recenterAck`
after the live layer has been rebased. A ready native peer receives the current
desktop snapshot, so saved phone preferences cannot overwrite an active session.

Native Recenter uses the same operation as a clutch: touch-down asks the desktop
to hold the current live layer, physical pose packets continue updating the
latest reference, and touch-up rebases enabled channels at that latest pose.
The held layer is preserved while Timeline base evaluation continues. Zero
channels remain zero and Movement Scale / Rotation Sensitivity are unchanged.

The native prototype uses a manual pasted pairing link rather than a new deep
link or relay. The desktop Inspector exposes **Copy Pairing Link** beside the
existing QR code. The same Worker and Durable Object session are reused.

Switching the active Camera automatically establishes a new baseline from that
Camera's saved orientation, preventing a jump between Cameras. A user
Disconnect sends an explicit session-termination packet; the relay invalidates
that session and its token so a new Connect action always creates a fresh QR.
Late callbacks from a replaced desktop socket are ignored by a session
generation guard.

## Long-run stability boundary

Native AR frames update the latest pose without publishing tracking state to
SwiftUI on every frame. Debug counters are sampled at approximately 1 Hz, so
the development diagnostics cannot create a per-frame render backlog. Native
pose transmission is latest-state-wins: at most one WebSocket pose send is in
flight and a newer pose replaces the pending packet.

The desktop controller uses bounded, constant-time semantic reconstruction from
the current physical pose and per-channel references. It does not integrate
pose deltas cumulatively, use elapsed-session time for smoothing, or retain a
pose history. Development diagnostics sample receive rate, pose age, live-layer
changes, finite-state checks, and the composition/apply boundary at roughly
1 Hz. The composition RAF is one-shot and clears its pending flag in a
`finally` block so an early return or application exception cannot permanently
disable future updates.

## Recording

Record Move samples the latest live quaternion at the Scene's rational frame
rate. At most one rotation key is written per frame, with linear interpolation.
The Timeline document is updated while recording without adding history entries;
the authored Camera rotation remains the recording-start base until the session
ends, so a newly written key cannot feed the same Phone layer back into the next
sample. Stop, disconnect, or reaching Mark Out commits the complete before/after
Scene as one undoable history transaction.

`Set Camera Key` captures the final visible semantic Camera Rotation at the
current Timeline frame, replaces an existing same-frame Rotation key, creates
the first key when needed, and defaults to Linear interpolation. It does not
move the playhead or start playback and is one undoable history transaction.

The session is runtime state only and is never serialized into `.ndblock` or
`.ndscene` files.

## Accepted V1 session model

Each pairing creates a cryptographically random, short-lived session and
token. Exactly one desktop and one phone may join it. The role-specific
allowlist accepts phone pose/recenter/key/record intent and desktop responses,
while `terminate` is desktop-only. Explicit desktop disconnect invalidates the
session; old credentials cannot be reused. Session generation guards ignore
callbacks from replaced sockets, heartbeats maintain the live session, and the
Durable Object alarm performs expiry cleanup.

Both peers connect outbound over secure WSS. There is no local inbound server,
self-signed certificate, firewall setup, account system, or cloud project
storage.

## Control channels and spatial-control boundary

The current prototype extends the existing `orientation` field with an
optional `position: [x, y, z]` without replacing the pairing, session, or relay
model. Position comes from iOS ARKit; long-term raw accelerometer integration
is intentionally not used.

Native position maps phone translation to Camera Truck, Dolly, and Pedestal,
while phone rotation continues to control Pan, Tilt, and Dutch. The persisted
native preference is the six-channel mask plus Movement Scale and Rotation
Sensitivity. It is local to the native companion and is not serialized into
`.ndblock` or `.ndscene`. The Web workflow always advertises and uses
Rotation-only control. The older three-value `controlMode` remains a wire
compatibility fallback only.

This checkpoint contains the native iOS prototype through live masked Position
and Rotation runtime application. `Set Camera Key` and `Record Move` continue
to use the existing rotation-only desktop key/recording paths. Future recording
work must record only enabled channels; `Record Move` must never silently write
disabled channels, and a future Hold action must preserve the last authored
value until the next key. This milestone does not add native recording,
Position keys, Set Camera Pose, Android/ARCore, phone video, LiDAR, or App
Store distribution. TestFlight or App Store distribution is a future
distribution step, not part of this implementation.

## Final Camera pose ownership during playback

The rendered Camera pose has one authoritative production path. The canonical
Timeline frame is evaluated into the current Camera base pose; the latest
Phone Camera packet contributes only a semantic live layer containing deltas.
The Stage runtime loop composes those two inputs once per active playback/live
tick and publishes one final pose snapshot to the Stage Camera and Camera View.

React reconciliation updates Camera settings, projection, and guides only. It
must not write a rendered Camera position or rotation during active playback.
Phone packets must not schedule a second composition or mutate the saved Camera
document, and Timeline ticks must not apply a separate final pose. This keeps
Position authored by Timeline authoritative when Phone Rotation is active and
prevents Camera View, Preview, and Stage from alternating between two poses.
