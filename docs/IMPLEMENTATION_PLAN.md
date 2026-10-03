# ND Blocking & Previs — Architecture and Implementation Plan

Status: Milestone 1 application shell and empty Stage implemented
Scope: Phase 1 foundation and workspace shell; actor/camera/timeline editing remain intentionally unimplemented.

Milestone 0 decisions are implemented in the domain source and specified by these focused contracts:

- [PROJECT_FORMAT.md](PROJECT_FORMAT.md) — `.ndblock`, validation, portability, and migrations
- [CAMERA_MODEL.md](CAMERA_MODEL.md) — sensor gate, delivery frame, lens profile, and anamorphic math
- [TIMELINE_MODEL.md](TIMELINE_MODEL.md) — integer-frame blocking timeline and typed tracks
- [PERFORMANCE_RULES.md](PERFORMANCE_RULES.md) — runtime/render-loop constraints for later milestones
- [STAGE_RUNTIME.md](STAGE_RUNTIME.md) — Milestone 1 Stage lifecycle and rendering policy

## 1. Repository audit

The repository is an unmodified React + TypeScript + Vite starter.

- React `19.2.8`, React DOM `19.2.8`
- Three.js `0.186.1` with matching type definitions
- Vite `8.3.0` (resolved build output reports `8.3.2`)
- TypeScript `6.0.2`
- Oxlint `1.81.0`
- No state-management, UI, routing, persistence, export, or testing library is installed.
- `src/App.tsx` is still the Vite counter/demo screen.
- `src/App.css` and `src/index.css` contain starter visual styles and color-scheme behavior.
- No domain model, Three.js runtime, selection model, timeline, project format, or WordPress integration exists.
- `public/` contains only starter favicon/icon assets.

Baseline verification:

- `npm run build` passes.
- `npm run lint` passes.
- Git history contains only the initial project commit.
- The working tree was clean before this plan was added.

The first implementation should therefore establish the product shell and domain contracts deliberately rather than incrementally reshaping the starter demo.

## 2. Product boundaries

This is a shot-blocking and cinematography planning tool, not a general-purpose 3D editor.

### In scope for the first product direction

- Stage-based blocking with simple actor and prop proxies.
- Camera placement, aiming, lens selection, sensor format, and focus distance.
- Shot aspect ratio, frame mask, safe areas, center marks, and other frame guides.
- Optional anamorphic de-squeezed preview.
- Simple actor and camera movement over a shot timeline.
- Mark In / Mark Out playback.
- Project save/load as versioned JSON.
- Quick preview export after the core playback path is stable.

### Explicitly out of scope initially

- Full character rigs, animation retargeting, facial performance, or cloth simulation.
- Photoreal materials, physically accurate lighting, and a general asset marketplace.
- Arbitrary geometry modeling, sculpting, or scene-graph editing.
- Multi-user collaboration, WordPress APIs, accounts, or server-side project storage.
- Final-quality film rendering or a replacement for a DCC application.

## 3. Proposed application architecture

The main boundary is between a serializable filmmaking document and a Three.js runtime that displays it.

```text
React application shell
├── Project / shot controls
├── Scene inventory (Actors, Props, Cameras, Lights)
├── Stage viewport
│   ├── Blocking view
│   ├── Active camera preview
│   └── Frame guides / anamorphic display overlay
├── Inspector (filmmaking properties)
└── Timeline (Mark In, Mark Out, tracks, keyframes, playback)

Filmmaking domain store
├── Project document (serializable)
├── Shot and entity state
├── Timeline evaluation
├── Commands / undoable edits
└── Selection and UI state (transient)

Three.js runtime adapter
├── Runtime scene registry
├── Proxy/object creation
├── Camera and light synchronization
├── Hit testing and selection mapping
├── Transform controls
└── Render loop
```

### Suggested source structure

```text
src/
  app/
    App.tsx
    AppShell.tsx
  domain/
    project.ts
    shot.ts
    entities.ts
    camera.ts
    timeline.ts
    selection.ts
    commands.ts
    serialization.ts
  state/
    projectStore.ts
    playbackStore.ts
    selectors.ts
  runtime/
    SceneRuntime.ts
    RuntimeRegistry.ts
    entityAdapters.ts
    cameraRuntime.ts
    picking.ts
    transformRuntime.ts
  components/
    topbar/
    scene-inventory/
    stage/
    inspector/
    timeline/
    shared/
  math/
    cameraMath.ts
    timelineMath.ts
  styles/
    tokens.css
    app.css
  test/
    fixtures/
```

The exact folder names can change during implementation, but the domain/runtime split should remain. React components must not become the source of truth for Three.js objects, and Three.js objects must not be stored in the project JSON.

### State strategy

Use one domain-facing project store with explicit actions or commands. The first implementation can use a small `useSyncExternalStore`-compatible store or a focused state library if one is added after review. Avoid putting high-frequency playback values into broad React context.

Separate state into:

1. **Project state** — the editable, serializable document.
2. **Playback state** — current frame, playing/paused, playback rate, loop setting.
3. **Selection state** — selected entity, multi-selection, active tool, and active panel.
4. **Runtime state** — Three.js references, object registry, pointer state, and renderer resources. Runtime state is never serialized.

Use commands for edits such as `addActor`, `moveEntity`, `setCameraLens`, `addKeyframe`, and `setShotMarks`. This gives the future undo/redo system a stable seam without requiring it in the first screen.

## 4. Domain data model

All persisted data should be plain JSON-compatible values. IDs are stable strings, preferably generated once with `crypto.randomUUID()` and retained across saves.

### Project

```ts
type ProjectDocument = {
  schemaVersion: 1
  id: string
  name: string
  createdAt: string
  updatedAt: string
  unitSystem: 'metric'
  frameRate: { numerator: number; denominator: number }
  startFrame: number
  endFrame: number
  activeShotId: string
  shots: ShotDocument[]
}
```

Use meters internally and display meters/centimeters in the UI. A project-level frame rate should be deterministic and apply to all shots in the initial version. Supporting mixed frame rates can be considered later.

### Shot

```ts
type ShotDocument = {
  id: string
  name: string
  description?: string
  markIn: number
  markOut: number
  frame: FrameSettings
  actors: ActorDocument[]
  props: PropDocument[]
  cameras: CameraDocument[]
  lights: LightDocument[]
  timeline: TimelineDocument
  activeCameraId: string
}
```

The shot is the primary authoring context. A project may later contain multiple shots with shared cast/prop definitions, but the first version should keep shot data self-contained to reduce reference and migration complexity.

### Shared placement model

```ts
type Placement = {
  position: [number, number, number]
  rotation: [number, number, number]
}
```

Rotation values are stored as Euler angles in radians in the document for readability and interoperability. Quaternions may be used internally by Three.js, but they should not be exposed in the product or required in the saved format until interpolation needs demand it.

### Actor

```ts
type ActorDocument = {
  id: string
  name: string
  role?: string
  appearance: {
    color: string
    height: number
    representation: 'person-proxy' | 'box-proxy'
  }
  placement: Placement
}
```

The initial actor proxy should communicate body position, facing, and eyeline without pretending to be a final character asset. Height is important to camera blocking and should be visible/editable in the Inspector.

### Prop

```ts
type PropDocument = {
  id: string
  name: string
  appearance: {
    color: string
    dimensions: [number, number, number]
    representation: 'box-proxy' | 'cylinder-proxy' | 'plane-proxy'
  }
  placement: Placement
}
```

### Light

```ts
type LightDocument = {
  id: string
  name: string
  role: 'key' | 'fill' | 'rim' | 'practical'
  type: 'area' | 'point' | 'directional'
  color: string
  intensity: number
  placement: Placement
  target?: [number, number, number]
}
```

Lights exist to support readable blocking and a simple preview look. They should not become a separate lighting-production tool.

### Frame settings

```ts
type FrameSettings = {
  aspectRatio: { width: number; height: number }
  guideOptions: {
    showSafeAreas: boolean
    showCenterMarks: boolean
    showThirds: boolean
    showHorizon: boolean
  }
  safeAreaPercent: number
}
```

Frame guides should be DOM/CSS or a dedicated overlay, not baked into the 3D scene. This keeps them crisp, accessible, and independent from scene geometry.

## 5. Camera model

The camera model should use cinematography values first and derive render values second.

```ts
type CameraDocument = {
  id: string
  name: string
  placement: Placement
  lens: {
    focalLengthMm: number
    sensorFormat: SensorFormat
    customSensor?: { widthMm: number; heightMm: number }
  }
  focusDistanceM: number
  projection: 'perspective'
  aim?: {
    mode: 'free' | 'look-at'
    targetEntityId?: string
    targetPoint?: [number, number, number]
  }
}

type SensorFormat =
  | 'super-35'
  | 'full-frame'
  | 'academy'
  | 'micro-four-thirds'
  | 'custom'
```

### Camera behavior

- Store focal length in millimeters, not field of view.
- Store sensor dimensions in millimeters through named presets.
- Derive horizontal and vertical field of view from focal length and sensor dimensions.
- Derive the Three.js camera projection from the selected shot aspect ratio and render size.
- When the shot aspect ratio changes, preserve the cinematography settings and update the preview framing rather than silently changing the lens.
- Display lens, sensor format, focus distance, and shot aspect ratio together in the Inspector because they are the director of photography's framing decisions.
- Support a `look-at` aim mode for quick blocking, while preserving a free camera rotation mode for manual composition.

### Anamorphic preview behavior

Anamorphic is a viewing mode, not a different camera projection. The first version should:

1. Render the active camera normally.
2. Apply the selected squeeze factor to the preview display or de-squeeze the image inside the frame.
3. Keep the shot aspect ratio and guides legible after de-squeeze.
4. Label the mode clearly as `Anamorphic: 1.5x` or similar.

The display treatment must be tested at multiple viewport sizes. Do not change the saved camera lens when toggling anamorphic preview.

## 6. Selection and transform tools

Selection is transient UI state and should be independent from the project document.

```ts
type SelectionState = {
  selectedIds: string[]
  activeId?: string
  activeKind?: 'actor' | 'prop' | 'camera' | 'light'
  tool: 'select' | 'move' | 'rotate' | 'aim'
}
```

Runtime objects should carry a mapping to the domain entity ID. Pointer picking returns that ID, and the Inspector reads the corresponding document object.

Initial tools:

- Select: inspect and choose an actor, prop, camera, or light.
- Move: translate the selected object on the stage.
- Rotate: rotate an actor, prop, or camera.
- Aim: point a camera toward a target entity or point.

Use Three.js transform controls internally, but present the controls as `Move`, `Rotate`, and `Aim`. Scaling should be restricted to prop dimensions in the Inspector rather than exposed as a general scene tool.

Transform edits should update the document through commands and synchronize the runtime object. During pointer dragging, update the runtime immediately and commit a single undoable edit on pointer release when undo/redo is added.

## 7. Camera preview and stage views

The stage should support two clear modes:

- **Blocking view** — a navigable overview for arranging actors, props, lights, and cameras.
- **Camera preview** — the active shot as seen through the selected camera.

The active camera preview should include:

- aspect-ratio crop/mask;
- title-safe and action-safe guides;
- center mark, thirds, and horizon options;
- current shot name and optional frame number in a non-recorded UI chrome layer;
- anamorphic preview mode;
- a clear exit path back to Blocking view.

The stage render loop should be owned by `SceneRuntime`. React should provide controls and settings, but should not cause a full component tree render for every animation frame.

## 8. Timeline and keyframe model

Use integer frame numbers as the canonical time representation.

```ts
type TimelineDocument = {
  tracks: TimelineTrack[]
}

type TimelineTrack = {
  id: string
  entityId: string
  property: 'position' | 'rotation' | 'focalLengthMm' | 'focusDistanceM'
  keyframes: Keyframe[]
}

type Keyframe = {
  id: string
  frame: number
  value: Vec3 | EulerRotation | number
  interpolation: 'step' | 'linear'
}
```

### Timeline rules

- `currentFrame`, playback state, and playback rate are transient.
- `markIn` and `markOut` define the active playback/export range.
- A property may have at most one track per entity in the first version.
- Track values are typed by the property even if the serialized value is a numeric array.
- Position, rotation, lens, and focus interpolate with explicitly defined linear or step behavior. Smooth interpolation is intentionally omitted until its mathematical behavior is designed.
- Lens and focus tracks are scalar values.
- Actor movement uses position and rotation tracks; camera movement uses position, rotation/aim, lens, and focus tracks.
- At a frame, evaluate the nearest surrounding keyframes and apply the result to the runtime. If no keyframes exist, use the entity's base placement/settings.

Timeline UI priorities:

- visible frame ruler;
- Mark In / Mark Out controls;
- play, pause, step, and loop;
- actor and camera tracks;
- add/remove keyframe at current frame;
- current frame and duration shown in filmmaker-friendly notation.

Do not build a general animation editor. The timeline should be optimized for a small number of blocking decisions per shot.

## 9. Project serialization

The saved project format should be a versioned JSON document containing only domain data.

```ts
type ProjectFile = {
  format: 'nd-blocking-previs'
  formatVersion: 1
  project: ProjectDocument
}
```

Implementation requirements:

- Validate the top-level shape before loading.
- Apply migrations from older `formatVersion` values before the document enters the store.
- Strip or reject runtime-only values such as `THREE.Object3D`, render targets, GPU resources, functions, and DOM references.
- Provide download and upload actions before any server integration.
- Add local autosave only after explicit load/save behavior is stable; use a namespaced storage key and surface the last saved time.
- Keep WordPress completely outside the domain and runtime modules. A later embed or hosting layer can load the compiled app without changing project semantics.

## 10. Implementation milestones

### Milestone 0 — foundation and review

Deliverables:

- approve this architecture and naming vocabulary;
- add source folders and TypeScript domain contracts;
- add representative project fixtures;
- add pure tests for camera math, timeline evaluation, and serialization validation;
- replace starter metadata/title only when implementation begins.

Exit criteria: the document can be created, validated, and evaluated without importing Three.js.

### Milestone 1 — application shell and empty stage

Deliverables:

- dark, studio-style shell with top bar, scene inventory, stage, Inspector, and timeline regions;
- project and shot context;
- `SceneRuntime` with renderer, resize handling, orbit-style blocking navigation, and disposal;
- empty-state copy using filmmaking terminology.

Exit criteria: the app opens to a usable empty shot without starter Vite content or console errors.

### Milestone 2 — actors, props, selection, and blocking

Deliverables:

- create/delete/rename actor and prop proxies;
- stage picking and scene-inventory selection;
- Move and Rotate tools;
- Inspector editing for actor height, prop dimensions, and placement;
- stable mapping between domain IDs and runtime objects.

Exit criteria: a user can block a simple scene, select any object, and save its placement in the project document.

### Milestone 3 — camera, lens, frame, and preview

Deliverables:

- create/select cameras;
- focal length, sensor format, focus distance, and aim controls;
- Blocking view and Camera preview modes;
- aspect-ratio frame mask and guide toggles;
- initial anamorphic preview.

Exit criteria: a user can place a camera, choose a lens/sensor combination, and judge framing through the camera preview.

### Milestone 4 — timeline and playback

Deliverables:

- frame ruler and playback controls;
- Mark In / Mark Out;
- position/rotation keyframes for actors and cameras;
- camera focal length and focus tracks;
- deterministic interpolation and current-frame evaluation.

Exit criteria: a blocking move and a camera move can be previewed repeatedly at the selected frame rate.

### Milestone 5 — lighting and preview polish

Deliverables:

- simple key/fill/rim/practical lights;
- readable proxy shading and basic shadow settings;
- scene readability improvements without turning the tool into a lighting package;
- responsive layout and keyboard shortcuts.

Exit criteria: actors, props, and camera intent remain readable in a practical previs scene.

### Milestone 6 — project files and resilience

Deliverables:

- versioned JSON download/upload;
- schema validation and migration seam;
- local draft recovery/autosave if desired;
- error states for invalid or incompatible files;
- undo/redo for core blocking and camera edits.

Exit criteria: a shot can be closed, reopened, and continue from the same blocking and timeline state.

### Milestone 7 — quick preview export

Deliverables:

- render the Mark In / Mark Out range from the active camera;
- include the selected frame aspect ratio and anamorphic treatment;
- prefer a browser-supported recording path such as `MediaRecorder`;
- show progress, cancellation, and a download result;
- provide a clear fallback when a codec is unavailable.

Exit criteria: a short previs clip can be exported from a supported browser and matches the on-screen camera preview closely enough for blocking review.

## 11. Verification strategy

### Pure logic tests

- sensor format + focal length to field-of-view calculations;
- aspect-ratio and preview frame calculations;
- anamorphic display calculations;
- timeline interpolation and boundary behavior;
- Mark In / Mark Out clamping;
- serialization validation, defaulting, and migrations.

### Runtime/integration checks

- create and select each entity type;
- pick runtime objects and resolve the correct domain ID;
- move/rotate/aim updates the Inspector and runtime;
- camera preview switches without losing Blocking view state;
- playback applies keyframes at exact integer frames;
- project save/load preserves all serializable state.

### Visual checks

- frame guides remain aligned at several viewport aspect ratios;
- anamorphic preview remains centered and labeled;
- transform controls do not obscure small actor proxies excessively;
- timeline remains usable at short and long shot durations;
- UI terminology stays cinematography-first.

Every milestone should keep `npm run build` and `npm run lint` passing. Add a test runner only with the first pure logic tests so that test infrastructure is justified by product behavior.

## 12. Key risks and mitigations

### Domain state and Three.js drift

Risk: runtime objects and serialized state diverge during direct manipulation.
Mitigation: domain commands are authoritative; use a runtime registry and synchronize on command commit/pointer release.

### Camera math and framing accuracy

Risk: field-of-view, sensor, crop, and aspect-ratio behavior produce misleading compositions.
Mitigation: centralize camera math in pure functions, use named sensor fixtures, and verify against known lens/sensor combinations.

### Anamorphic preview ambiguity

Risk: users cannot tell whether the lens, crop, or display is being changed.
Mitigation: treat it as an explicit preview display mode, label squeeze factor, and preserve the saved lens values.

### Timeline determinism

Risk: frame-rate drift and time-based animation cause different playback results.
Mitigation: use integer frames as the source of truth; convert to seconds only at the renderer/export boundary.

### Browser export support

Risk: codec availability varies by browser and platform.
Mitigation: probe supported MIME types, offer a clear fallback/error, and keep export isolated behind an adapter.

### Performance during playback

Risk: React rerenders or object creation inside the render loop cause stutter.
Mitigation: keep per-frame state out of broad React state, reuse runtime objects, and evaluate only active tracks.

### Scope creep into a 3D editor

Risk: features become technically interesting but do not improve blocking or framing.
Mitigation: review every feature against the product verbs: block, frame, move, aim, preview, or export.

### Persistence and future WordPress embedding

Risk: application code becomes coupled to a host CMS.
Mitigation: keep the app as a standalone Vite build with browser-native file/local persistence; add any host bridge only at the edge later.

## 13. User-facing vocabulary

Preferred labels:

- Project, Shot, Actor, Prop, Camera, Light
- Blocking View, Camera Preview
- Lens, Focal Length, Sensor Format, Focus Distance
- Frame, Aspect Ratio, Safe Area, Center Mark, Horizon
- Move, Rotate, Aim
- Timeline, Track, Keyframe, Play, Pause
- Mark In, Mark Out, Current Frame
- Anamorphic Preview, De-squeeze

Avoid in visible UI:

- mesh, node, scene graph, renderer, transform matrix, quaternion, object3D, component, entity, GPU, or engine terminology.

Internal implementation names may use technical terms where they make the code clearer, but the UI and product documentation should remain cinematography-first.

## 14. Recommended next step

Milestone 0 is now implemented: typed contracts, pure math/serialization seams, validation, fixtures, and tests. The exact recommendation for Milestone 1 is to build the application shell and empty stage only after reviewing the locked contracts; do not add production scene behavior, actor UI, camera UI, timeline UI, or export in the foundation pass.
