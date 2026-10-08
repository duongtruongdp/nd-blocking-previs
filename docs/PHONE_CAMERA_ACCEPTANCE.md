# Phone Camera V1 Physical Acceptance

## Status

**PASS — manually accepted by the user.**

This document records the accepted rotation-controller baseline. Device model,
iOS version, and browser version were not recorded.

## Confirmed behaviors

- First phone pairing
- Disconnect
- Reconnect
- Recenter from the Phone companion
- Recenter from Desktop
- Camera orientation follow
- Pan
- Tilt
- Dutch
- Set Camera Key
- Same-frame Camera Rotation key replacement
- Set Camera Key leaves the Timeline stationary and does not start playback
- Manual Camera Rotation keys interpolate during playback
- Record Move
- Continuous frame-based Camera Rotation recording
- Reconnect after disconnect

## V1 boundary

Phone Camera V1 controls the active Camera's Rotation only. Camera Position XYZ
is intentionally not available in this checkpoint. This is a product boundary,
not a bug.

## Authoritative architecture

- Companion: `https://blocking.duongtruongdp.net/phone-camera/`
- Transport: secure WSS, with both peers connecting outbound
- Relay: Cloudflare Worker plus Durable Object
- Worker: `nd-blocking-phone-relay`
- Durable Object: `PhoneSessionRoom`
- Binding: `PHONE_SESSIONS`
- Endpoint: `wss://nd-blocking-phone-relay.nd-blocking-previs.workers.dev/session`
- Active deployment: `ac08a24c-11fc-42ed-8e71-c72b21db41a4`

The relay keeps only temporary session metadata and active WebSocket state. It
does not persist projects, `.ndblock` files, pose history, phone video, images,
or account data.

## Future direction

The recommended next milestone is:

`PHONE-CAMERA-6DOF-V1 — NATIVE IPHONE POSITION + ROTATION PROTOTYPE`

That milestone may investigate ARKit/ARCore spatial tracking. It must not use
long-term raw accelerometer integration for Camera translation.
