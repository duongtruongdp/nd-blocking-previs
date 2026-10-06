# ND Blocking & Previs V2

V2 is isolated from the legacy root application in this directory.

Start the V2 foundation from the repository root:

```bash
npm run dev -- --config v2/vite.config.ts
```

Open [http://localhost:5174/](http://localhost:5174/).

The current Stage mounts the isolated DEMO-derived `StageEngine` from `v2/src/stage-engine/`. It owns the Three.js scene, canvas input, shared raycasts for Props, procedural Actors, and generic Camera entities, orbit/pan/zoom, and Select/Move/Rotate gizmos. React mounts the engine, supplies domain entities, receives selection IDs, and commits transforms once per completed drag. Camera View uses a separate read-only production-camera render adapter; Actor clipboard, editor history, and Timeline evaluation remain App-level adapters.

Mouse input is left-drag orbit, right-drag pan, and wheel zoom. The existing browser trackpad path treats two-finger scroll as pan and pinch as zoom. Standard browser Pointer/Wheel events do not expose reliable trackpad finger counts, so a macOS three-finger drag that arrives as an ordinary mouse drag cannot be distinguished from one-finger orbit until native Tauri integration exists. Interaction diagnostics are available only in development with `?interactionDebug=1`.

## Video export foundation

V2.6 exports the inclusive Timeline Mark In → Mark Out range through a dedicated
production render path. Each integer frame is evaluated with the existing
Timeline evaluator, rendered through the active production Camera, center-cropped
to the selected Delivery Frame, and submitted to a dedicated fixed-resolution
canvas. MP4 is preferred when the browser exposes a compatible WebCodecs H.264
encoder and is muxed with Mediabunny; WebM is the fallback through MediaRecorder.
The WebM path paces manual canvas frame requests at the exact rational frame
duration, while MP4 samples carry timestamps derived from the frame index and
rational frame rate. The editor viewport, grid, camera proxy, selection, gizmos,
FOV guide, and UI are never recorded. Export never mutates the SceneDocument or
current playhead.

Delivery output dimensions are derived only from the selected Delivery Frame
(for example, 1920 × 1080 for 16:9); the Camera's physical capture area remains
authoritative for projection and is center-cropped into that delivery. The
Timeline displays Mark In and Mark Out as persistent vertical markers, dims the
outside range without covering keyframes, and keeps the playhead visually
distinct.

Keyframes use explicit capture semantics: move the playhead, edit the visible
Actor or Camera value, then press the diamond to capture that value at the
current frame. Movement and value edits do not create keys automatically.
Existing keys at the current frame are updated in place, while pending manual
overrides remain visible until they are captured or the playhead changes.

## Production web deployment

The V2 production output is `v2/dist/`. Build it with
`npx vite build --config v2/vite.config.ts`; set `VITE_BASE_PATH=/blocking/`
for a subpath deployment. The app has no required secrets, backend, or service
worker. See [`docs/WEB_DEPLOYMENT.md`](../docs/WEB_DEPLOYMENT.md) for static
hosting, HTTPS, browser capability, staging, and WordPress separation guidance.

## Desktop shell

V2.12 adds a native Project Library to the optional Tauri 2 desktop shell
around this same frontend. The browser build still opens directly in the
editor; desktop starts in the library and uses the platform adapter for recent
metadata, native project file operations, export locations, and the native
close guard:

```bash
npm run desktop:dev
npm run desktop:build
```

The shell is configured in `v2/src-tauri/`; it does not change the V2 scene,
camera, timeline, serialization, or StageEngine contracts. See
[`docs/DESKTOP_TAURI.md`](../docs/DESKTOP_TAURI.md) for the platform boundary,
Project Library behavior, capabilities, prerequisites, and the exact manual
macOS checklist.
