# Phone Camera Protocol

Phone Camera is a temporary, paired orientation controller for the active
Camera. It is not a second editor, project client, or motion-data store.

Protocol version `1` uses JSON messages over a short-lived WSS session. The
allowlist is deliberately small:

- `hello` and `ready` establish the desktop/phone roles and may advertise
  `{ orientation: true, position: false|true, controlChannels: false|true }`
  capabilities. Native channel-capable companions set `controlChannels: true`;
  the Web companion remains `false` or omitted.
- `pose` carries a normalized quaternion, timestamp, and an optional finite
  `position: [x, y, z]` in meters. Omitted or `null` position is the accepted
  Rotation Only Web companion shape; an array is the native Position + Rotation
  shape.
- `recenter` is a phone-to-desktop request. The desktop resets the relative
  phone baseline without changing the Timeline base and returns `recenterAck`.
- `recenterHoldStart` and `recenterHoldEnd` bracket the native press-and-hold
  reposition gesture. The desktop freezes only the Phone Camera live layer;
  Timeline playback and the latest physical pose continue independently.
- `controlChannels` carries six independent booleans: `truck`, `pedestal`,
  `dolly`, `pan`, `tilt`, and `dutch`. The native phone sends it after pairing
  and whenever a channel or preset changes. The desktop applies the mask at
  the semantic Camera channel layer; it never masks quaternion components.
- `setMovementScale` carries a continuous finite value from `0.1` to `10` for
  translation. It affects Truck, Pedestal, and Dolly only.
- `setRotationSensitivity` carries a continuous finite value from `0.25` to
  `3`. It affects Pan, Tilt, and Dutch only.
- `controlState` is desktop-to-phone state synchronization. It contains the
  exact channel mask, Movement Scale, and Rotation Sensitivity and is sent only
  to native companions that advertise `controlChannels: true`.
- `recenterAck` is desktop-to-phone confirmation. Native Recenter is not shown
  as complete until the acknowledgement arrives.
- `recenterHoldState` confirms whether the desktop accepted the active hold.
- `controlMode` carrying `rotation`, `position`, or `positionRotation` remains
  accepted as a legacy fallback for older companions. A channel-capable peer
  takes precedence from capability negotiation onward, and the desktop ignores
  later legacy mode packets.
- `setCameraKey` asks the desktop authority to capture the current visible
  Camera Rotation at the current frame.
- `recordStart` and `recordStop` bracket one desktop recording transaction.
- `setCameraKeyAck` and `recordAck` acknowledge desktop acceptance to the
  phone companion.
- `ping` and `pong` keep the outbound connection alive.

The relay forwards phone `pose`, `recenter`, control requests, `setCameraKey`,
and recording intent packets to the desktop, and desktop `controlState`,
`recenterAck`, and other acknowledgement packets to the phone. Unknown message
types, invalid quaternions, oversized packets, role mismatches, and
wrong-session packets are rejected.
There is exactly one desktop and one phone per session. Pairing tokens expire
after ten minutes and are not project credentials.

The Web companion sends orientation only, keeps `position: null`, and remains
Rotation-only. The native iOS prototype may send a finite ARKit position
vector alongside the quaternion and persists its channel mask and sensitivity
preferences locally on the device, not in the project document. No camera
position history, microphone, image, video, account, project, or persistent
pose log is transmitted; the relay only forwards the current packet.
