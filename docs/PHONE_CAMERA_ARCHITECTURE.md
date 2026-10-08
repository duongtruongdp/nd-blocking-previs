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
relative quaternion from the recenter baseline, applies bounded smoothing, and
calls an imperative runtime bridge.

The phone adapter reads the authoritative screen angle with the legacy iOS
orientation fallback, applies one screen correction, and labels the result as
landscape-left, landscape-right, or portrait. Portrait pauses live Camera
updates until the phone is held sideways and the user recenters. Sensitivity
and smoothing are applied only after this normalization and recenter step.

The bridge updates the active Camera proxy and isolated Camera View only. It
does not alter StageEngine, navigation, camera projection math, Frame Guides,
or the saved Camera document during live sensor control. The Inspector's
orientation fields and Rotate tool are disabled while the active Camera is
live-controlled. V1 owns Camera Rotation only; Camera Position XYZ remains
outside the workflow.

Switching the active Camera automatically establishes a new baseline from that
Camera's saved orientation, preventing a jump between Cameras. A user
Disconnect sends an explicit session-termination packet; the relay invalidates
that session and its token so a new Connect action always creates a fresh QR.
Late callbacks from a replaced desktop socket are ignored by a session
generation guard.

## Recording

Record Move samples the latest live quaternion at the Scene's rational frame
rate. At most one rotation key is written per frame, with linear interpolation.
The document is updated while recording without adding history entries. Stop,
disconnect, or reaching Mark Out commits the complete before/after Scene as one
undoable history transaction.

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

## Future 6DoF direction

The next target is `PHONE-CAMERA-6DOF-V1 — NATIVE IPHONE POSITION + ROTATION
PROTOTYPE`. A future pose packet can extend the existing `orientation` field
with `position: [x, y, z]` without replacing the pairing, session, or relay
model. Position should come from a spatial tracker such as iOS ARKit or
Android ARCore; do not estimate long-term translation by integrating raw
accelerometer data because accumulated drift is unsuitable for reliable Camera
movement.

Intended future mapping is phone left/right to Camera Truck, forward/back to
Camera Dolly, up/down to Camera Pedestal, with phone rotation continuing to
control Pan, Tilt, and Dutch. A future user-facing tracking mode may offer
`Rotation Only` and `Position + Rotation`, with a separate Movement Scale such
as 0.5×, 1×, 2×, 5×, or 10×. V1 remains implicitly `Rotation Only`.

The future native progression is HTTPS Web companion for V1, native iOS with
ARKit next, and Android with ARCore later. No native mobile app is part of this
checkpoint.
