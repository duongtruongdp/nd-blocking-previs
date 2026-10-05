# ND Blocking & Previs V2

V2 is isolated from the legacy root application in this directory.

Start the V2 foundation from the repository root:

```bash
npm run dev -- --config v2/vite.config.ts
```

Open [http://localhost:5174/](http://localhost:5174/).

The current Stage mounts the isolated DEMO-derived `StageEngine` from `v2/src/stage-engine/`. It owns the Three.js scene, canvas input, shared raycasts for Props and procedural Actors, orbit/pan/zoom, and Select/Move/Rotate gizmos. React mounts the engine, supplies domain entities, receives selection IDs, and commits transforms once per completed drag. Actor clipboard and editor history remain App-level adapters. Camera integration and Timeline synchronization are intentionally disconnected.

Mouse input is left-drag orbit, right-drag pan, and wheel zoom. The existing browser trackpad path treats two-finger scroll as pan and pinch as zoom. Standard browser Pointer/Wheel events do not expose reliable trackpad finger counts, so a macOS three-finger drag that arrives as an ordinary mouse drag cannot be distinguished from one-finger orbit until native Tauri integration exists. Interaction diagnostics are available only in development with `?interactionDebug=1`.
