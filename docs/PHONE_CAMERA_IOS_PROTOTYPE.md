# Native iPhone Phone Camera 6DoF Prototype

This is a development companion for proving physical iPhone movement into the
existing ND Blocking & Previs Camera. It is intentionally small and is not an
iPhone editor, video transmitter, LiDAR scanner, or App Store build.

## What it uses

- SwiftUI for the small control surface.
- ARKit `ARWorldTrackingConfiguration` for position and orientation.
- `URLSessionWebSocketTask` over the existing secure relay.
- iOS 17.0 deployment target, iPhone device family.
- One meter of ARKit translation remains one ND world meter.

The project is at:

`mobile/ios/NDPhoneCamera/NDPhoneCamera.xcodeproj`

The app asks for camera access because ARKit uses the camera to track the
phone. It does not transmit camera frames or images. Tracking is paused after
loss/relocalization and requires Recenter before new poses are sent.

## Free Apple ID / signing

An Apple Developer Program membership is not required for the first local
prototype attempt. Xcode can use a free **Personal Team** for development
signing on an iPhone. Free provisioning normally expires after a short period
(commonly seven days), so this is suitable for local testing rather than
distribution. A paid team may still be required by the user's Apple account,
device policy, or a future distribution workflow.

This repository does not contain signing credentials or a development team ID.
Xcode will ask for the user's Apple ID and team selection locally.

## Run on a real iPhone

1. Install a current full Xcode release with an iOS SDK and connect the iPhone
   by cable or enable wireless device development.
2. Open `mobile/ios/NDPhoneCamera/NDPhoneCamera.xcodeproj`.
3. Select the `NDPhoneCamera` target, open **Signing & Capabilities**, choose
   the user's **Personal Team**, and let Xcode create the local signing
   identity. If Xcode reports a bundle identifier collision, change the
   bundle identifier locally to a unique value.
4. Select the connected iPhone as the run destination and press Run. On the
   first launch, iOS may require **Settings → Privacy & Security → Developer
   Mode**, then a device trust confirmation.
5. In the desktop Camera Inspector, pair the active Camera and choose
   **Copy Pairing Link**. Paste that full link into the native app.
6. Press **Connect**, allow camera access, wait for **Tracking ready**, and
   press **Recenter** while holding the phone still.
7. Choose `Rotation`, `Position`, or `Position + Rotation`. A mode change
   pauses control and requires another **Recenter**. Movement Scale is
   available only for the two position-capable modes.
8. Check live Camera Position in Blocking View and Camera View before testing
   direction or distance.

The native app accepts the same ten-minute pairing session as the Web
companion. Do not leave a Web companion connected to the same session; the
relay permits only one phone role per session. Connect, Disconnect, and a new
Connect create independent transport generations; stale callbacks from an old
socket are ignored.

The pairing link carries the complete relay WebSocket endpoint. The current
endpoint is `wss://nd-blocking-phone-relay.nd-blocking-previs.workers.dev/session`.
The native app validates the `wss` scheme, host, and `/session` path and uses
that URL without reconstructing or silently changing it.

## Physical acceptance order

Run this order with a real device and record the iPhone model, iOS version,
and subjective latency:

1. Connect and wait for Tracking ready.
2. Recenter while still; verify there is no Camera jump.
3. Hold still for stability.
4. Move right, then return: Truck right and return near the baseline.
5. Move forward/back: Dolly direction and return.
6. Raise/lower: Pedestal direction.
7. Pan, Tilt, and Dutch while translating.
8. Observe tracking loss if safe; verify the app pauses and requires Recenter
   rather than teleporting the Camera.

Direction and return-to-baseline are different from centimeter accuracy. Do
not claim metric precision without a measurement.

## Troubleshooting

- **No device in Xcode:** unlock the iPhone, trust the Mac, enable Developer
  Mode, and reconnect by cable.
- **Signing error:** select a Personal Team and use a unique local bundle ID.
- **Camera permission denied:** enable camera access for ND Phone Camera in
  iPhone Settings and relaunch.
- **Relay connection error:** use a fresh desktop pairing link; sessions expire
  after ten minutes and require the current secure WSS relay.
- **Invalid pairing link:** copy the complete link again from the desktop
  Camera Inspector. A link with a relay ending at the Worker root instead of
  `/session` is rejected before the native app opens a socket.
- **Tracking paused:** move slowly toward textured surroundings, wait for
  Tracking ready, then Recenter. The prototype intentionally does not apply a
  potentially discontinuous relocalization jump.
- **Camera does not move:** confirm the Camera is active, the selected native
  mode matches the intended control, and the desktop has received a fresh pose
  after Recenter. Position mode intentionally holds rotation; Rotation mode
  intentionally masks translation. The desktop's Set Camera Key and Record
  Move remain rotation-only at this prototype checkpoint.

## Validation boundary

The repository currently has Swift source and an Xcode project, but native
build/signing requires full Xcode and an iOS SDK. A machine with only Apple
Command Line Tools cannot run `xcodebuild`, sign the app, or prove an iPhone
launch. Physical 6DoF acceptance is therefore a human/device gate, not a
claim made by automated web tests.
