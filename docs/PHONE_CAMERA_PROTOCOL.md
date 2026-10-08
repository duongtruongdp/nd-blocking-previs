# Phone Camera Protocol

Phone Camera is a temporary, paired orientation controller for the active
Camera. It is not a second editor, project client, or motion-data store.

Protocol version `1` uses JSON messages over a short-lived WSS session. The
allowlist is deliberately small:

- `hello` and `ready` establish the desktop/phone roles.
- `pose` carries a normalized quaternion, timestamp, and `position: null`.
- `recenter` resets the relative phone baseline.
- `setCameraKey` asks the desktop authority to capture the current visible
  Camera Rotation at the current frame.
- `recordStart` and `recordStop` bracket one desktop recording transaction.
- `setCameraKeyAck` and `recordAck` acknowledge desktop acceptance to the
  phone companion.
- `ping` and `pong` keep the outbound connection alive.

The relay forwards phone `pose`, `recenter`, `setCameraKey`, and recording
intent packets to the desktop, and desktop control/acknowledgement packets to
the phone. Unknown message types, invalid quaternions, oversized packets, role
mismatches, and wrong-session packets are rejected.
There is exactly one desktop and one phone per session. Pairing tokens expire
after ten minutes and are not project credentials.

The phone sends orientation only. `position` is explicitly `null` in V1. No
camera position, microphone, image, video, account, project, or persistent
pose log is transmitted. The protocol can later add a finite position vector
alongside the quaternion without replacing the session model.
