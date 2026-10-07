# ND Blocking & Previs — Architecture and Implementation Plan

Status: Current: ProjectDocument, multi-Scene editing, portable `.ndblock` persistence, procedural Scenic Props, Wall/Openings, Sun lighting, and extended Timeline tracks are implemented in the active root application; manual browser acceptance remains required.

V2.UI1 keeps workspace dimensions outside SceneDocument and `.ndscene`
serialization. Timeline height defaults to 240px, clamps to a 140px minimum,
and uses a viewport-aware upper bound that preserves a 240px Stage minimum.
The existing Stage ResizeObserver handles Stage and Camera View changes in
place; Timeline track rows scroll inside their viewport while the toolbar and
ruler remain fixed.

V2.9 introduces a ProjectDocument above SceneDocument. A Project contains an
ordered non-empty list of embedded SceneDocuments and an activeSceneId. The
portable `{ format: "ndblock", version: 1, project }` envelope is separate
from `.ndscene`; project persistence validates each embedded Scene through the
existing SceneDocument validator and rejects unsupported newer versions.
Scene IDs are stable at the Project boundary. Scene-local Actor, Prop, Camera,
Frame Guide, Timeline Track, and Keyframe IDs remain local for imported Scenes,
while Duplicate Scene creates new IDs and remaps every Timeline reference and
active Camera. Only the active Scene owns runtime objects; inactive Scenes are
plain serializable documents.

Project structure actions are intentionally outside the active Scene undo
history. Switching Scenes clears selection, playback, transform transactions,
and the active Scene history baseline without changing creative data. Project
dirty state covers Project name, Scene structure/names, and creative data in
any Scene; active Scene selection, playback, and editor navigation do not mark
the Project dirty. Saving the Project clears the Project dirty state; exporting
an individual `.ndscene` does not.
Scope: Phase 1 foundation, workspace shell, Actor/Prop blocking, locked Actor/Pose system, verified camera data, and serializable Camera objects.

Milestone 0 decisions are implemented in the domain source and specified by these focused contracts:

- [PROJECT_FORMAT.md](PROJECT_FORMAT.md) — `.ndblock`, validation, portability, and migrations
- [CAMERA_MODEL.md](CAMERA_MODEL.md) — sensor gate, delivery frame, lens profile, and anamorphic math
- [TIMELINE_MODEL.md](TIMELINE_MODEL.md) — integer-frame blocking timeline and typed tracks
- [PERFORMANCE_RULES.md](PERFORMANCE_RULES.md) — runtime/render-loop constraints for later milestones
- [STAGE_RUNTIME.md](STAGE_RUNTIME.md) — Milestone 1 Stage lifecycle and rendering policy
- [BLOCKING_RUNTIME.md](BLOCKING_RUNTIME.md) — Milestone 2 entity mapping, selection, and transform commits
- [CHARACTER_ASSET_SPEC.md](CHARACTER_ASSET_SPEC.md) — authored GLB requirements, licensing, budgets, and grounding
- [CHARACTER_RIG_DIAGNOSTICS.md](CHARACTER_RIG_DIAGNOSTICS.md) — production rig findings, reconstruction, symmetry, and contact decisions
- [ANATOMICAL_POSE_SOLVER.md](ANATOMICAL_POSE_SOLVER.md) — anatomical intent, rig-specific quaternion solving, references, and contact boundary
- [CAMERA_DATA_MODEL.md](CAMERA_DATA_MODEL.md) — versioned factual camera dataset, provenance, registry, and reproducibility snapshot
- [CINEMATOGRAPHY_MATH.md](CINEMATOGRAPHY_MATH.md) — pure FOV, coverage, crop, anamorphic, and reference-aperture calculations
- [CAMERA_DATA_ARRI.md](CAMERA_DATA_ARRI.md) — ARRI Batch 1 source register, sensor/output review, and known limitations
- [PRODUCT_LANGUAGE.md](PRODUCT_LANGUAGE.md) — filmmaker-first UI terminology and internal-only vocabulary

Milestone 2.5 camera data is now locked enough for authoring. The production
dataset contains five verified ARRI camera models: ALEXA Mini LF, ALEXA 35,
ALEXA Mini, ALEXA LF, and AMIRA. One sensor mode can own multiple recording
outputs, each with codec, container/image-content dimensions, frame-rate
conditions, and provenance. The dataset remains independent from project files;
projects persist the selected IDs plus a resolved capture snapshot.

Milestone 3A adds the first real filmmaking Camera object. Cameras are created
from a deterministic generic 36 × 24 mm default, can be selected and moved in
the Blocking View, and expose Camera Model, Sensor Mode, Recording Format, Lens,
Focus, Placement, and Frame Guide fields in the Inspector. The Stage displays a
lightweight camera body, lens, forward marker, and finite frustum guide. The
navigation camera remains an editor-only viewpoint and is never serialized.
Camera View, timeline animation, and export remain later milestones.

## 1. Repository audit

The repository now contains the promoted React + TypeScript + Vite application
at its root. The former legacy V1 application is no longer part of the active
source tree.

- React `19.2.8`, React DOM `19.2.8`
- Three.js `0.186.1` with matching type definitions
- Vite `8.3.0` (resolved build output reports `8.3.2`)
- TypeScript `6.0.2`
- Oxlint `1.81.0`
- No state-management, UI, routing, persistence, export, or testing library is installed.
- `src/App.tsx` is the active Blocking & Previs shell.
- The root `src/` contains the Stage engine, scene domain, camera data, timeline,
  project persistence, export, and desktop platform seam.
- WordPress integration remains external to the application.

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

- Full artist-facing pose authoring, animation retargeting, facial performance, or cloth simulation. Pose Calibration is a development diagnostic only; all 18 shipped semantic poses are production-locked.
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
  activeCameraId: string | null
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
  character: { characterId: string }
  appearance: {
    color: string
    heightM: number
    representation: 'person-proxy' | 'box-proxy'
  }
  pose: { poseId: string }
  placement: Placement
}
```

The Actor stores only stable character and pose IDs, color, height, and placement. The runtime resolves the selected character through the Character Registry and uses the procedural articulated mannequin only when a production GLB is unavailable or fails validation. Height is important to camera blocking and should be visible/editable in the Inspector.

### Prop

```ts
type PropDocument = {
  id: string
  name: string
  appearance: {
    color: string
    dimensionsM: [number, number, number]
    propType: 'cube' | 'cylinder' | 'wall' | 'floor' | 'table' | 'chair'
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

The current implementation extends this contract with stable camera-model,
sensor-mode, and recording-output IDs, a persisted `resolvedCapture` snapshot,
an anamorphic lens profile, and a crop-only `frameGuide`. The snapshot records
the physical capture geometry used when the shot was authored, so a future
dataset correction cannot silently change an existing shot's framing. New
cameras use the generic default until a production camera is deliberately
chosen.

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

### Milestone 3A — camera object foundation (current)

Deliverables completed:

- create, select, rename, move, rotate, and delete real Camera objects;
- generic camera creation independent of the production dataset;
- dependent Camera Model, Sensor Mode, and Recording Format selection;
- focal length, anamorphic profile, focus distance, camera height, and
  Pan/Tilt/Roll controls;
- persisted resolved capture geometry and crop-only frame-guide settings;
- lightweight Stage camera body, lens, forward marker, and finite frustum guide;
- separate navigation camera and filmmaking CameraDocument runtime paths;
- legacy V1 camera normalization without an unnecessary format-version bump.

Exit criteria met: cameras are serializable, independently selectable and
movable, and their Stage projection derives from persisted capture geometry and
focal length.

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

### V2.4 Camera System Foundation

V2.4 adds the first production Camera workflow to the V2 editor. Camera
definitions and provenance live in `src/core/cameraDatabase.ts`; scenes
store stable camera and capture-mode IDs plus lens, squeeze, delivery-frame,
and transform values. Runtime projection uses the selected mode's active
capture area, while recording resolution and physical sensor dimensions stay
separate.

The Stage creates a lightweight generic procedural cinema-camera proxy and a
separate production `PerspectiveCamera`. Blocking View continues to use its
existing navigation camera and state. Camera View switches only the render
camera, applies capture-aspect letterboxing (and display desqueeze for
anamorphic lenses), and draws a compact delivery Frame Guide. Selection,
Move, Rotate, framing, and history use the existing V2 entity pathways.

The initial verified seed set and source notes are documented in
`docs/CAMERA_DATA.md`. Timeline, Camera View image effects, project file
serialization, and video export remain later milestones.

V2 Camera Integration B reconnects this workflow through the frozen V2
StageEngine entity API. Cameras are registered as ordinary selectable Stage
entities, while `activeCameraId` remains independent from `selectedEntityId`.
Blocking View keeps the editor camera and all existing interaction algorithms;
Camera View uses a separate read-only render adapter with the production camera,
capture letterboxing, and delivery-frame guides. Camera settings and completed
Camera transforms continue through the existing SceneDocument and history paths.

### V2.7A Complete Capture Modes and Real Anamorphic Desqueeze

V2.7A expands the professional capture dataset to 120 geometry-changing modes
across the existing 40 camera bodies and records a per-body official-source
audit in `docs/CAMERA_DATABASE_SOURCES.md`. The Sony FX5 includes its seven
documented FF/FFc/S35 imager modes, with X-OCN compatibility attached to the
Open Gate mode rather than represented as duplicate geometry.

`src/runtime/cameraMath.ts` is the authoritative projection boundary. It
keeps physical capture aspect and FOV separate from the desqueezed display
aspect, applies anamorphic squeeze to horizontal optical coverage only, and is
shared by the Blocking View FOV guide, Camera View, Inspector, and export
renderer. Camera View and export render the desqueezed source first, then apply
the selected Delivery Frame crop. StageEngine interaction and project
persistence remain outside this milestone.

### V2.7B/C Multi-Frame Guides / Frame Lines

Frame Guides are camera-owned JSON records layered over the Camera View image.
They remain separate from physical Capture Mode, anamorphic display aspect,
and the primary Delivery Frame. A guide stores its aspect ratio, visibility,
line style, opacity, line weight, editable `#RRGGBB` color, optional outside
shade, shade strength, and safe-margin inset. Built-in Cinema/Broadcast and
Social/Digital presets are supplemented by a custom decimal aspect entry.

Guide rectangles are calculated by a pure normalized-rectangle helper: each
enabled guide is the largest centered rectangle of its target aspect inside
the displayed source image. Delivery and guide rectangles share the same
`fitAspectInsideSource` helper, so equal aspects have identical geometry. For
anamorphic shots the displayed source is the desqueezed image aspect. The
overlay never changes production projection, capture crop, export output, or
timeline evaluation. Edits use the existing camera update/history path, while
guide selection remains transient UI state. Blocking View intentionally shows
no frame rectangles.

### V2.8 Portable `.ndscene` Save / Load

V2.8 adds an explicit `{ format: "ndscene", version: 1, scene }` JSON
envelope. The file contains creative SceneDocument data, including current
frame convenience state, active Camera, complete Frame Guides, Timeline, and
rational frame rate; it excludes selection, playback, editor navigation,
history, runtime objects, DOM state, and export state. The core serializer,
validator, migration boundary, and filename sanitizer are browser-independent.

Each saved Camera carries a resolved physical capture snapshot alongside its
stable database and Capture Mode IDs. On load, current database records are
used when their geometry matches; otherwise the saved active dimensions and
recording raster remain authoritative for framing. Save/Load/New are Web-shell
actions only, so Project Library, `.ndblock`, cloud storage, and Tauri remain
out of scope.

### V2.8A Timeline UX / Scalability + Prop Keyframes

The Timeline remains a bounded editor region with a fixed toolbar and ruler;
only its track viewport scrolls vertically. Animated tracks are grouped by
Scene entity in Actor / Prop / Camera order with local disclosure state owned
by the Timeline UI. Prop Position and Rotation use the existing generic
TimelineTrack, evaluator, transform ownership, Camera View, and export paths.
Spacebar playback uses the same toggle action as the transport and ignores
text-editing controls. Timeline surfaces suppress accidental browser text
selection without disabling selection inside real inputs.

Milestone 2I is complete. The production Actor baseline contains Male 01 and Female 01, 18 stable semantic poses (six Standing, six Sitting, six Lying), shared semantic definitions adapted through Rig Profiles, support/contact-aware Sitting and Lying, height-preserving Actor placement, and a development-only Pose Calibration tool hidden from normal use. The full Actor/Pose development phase is locked.

Milestone 2.5A, 2.5B, 2.5B-FIX, and 2.5C are complete. The Camera Data
Foundation contains an independent dataset version, stable manufacturer,
camera, mode, and output IDs, physical sensor and recording-mode separation,
provenance references, rational frame-rate capabilities, a framework-
independent Camera Registry, pure cinematography calculations, centered
delivery crops, anamorphic geometry, and a resolved capture-selection contract
for project reproducibility.

Milestone 3A established the Camera object as part of the Stage and project
document. Its navigation camera remained editor-only and Camera data stayed
independent from Stage representation.

Milestone 3A.1 is a language-only pass over the existing shell. Normal UI uses
filmmaking terms such as Capture Mode, Sensor Area, Capture Ratio, Lens Type,
Position, and Facing Direction. Internal implementation names and technical
documentation remain unchanged. Camera behavior, project fields, and runtime
math are not altered.

Milestone 3A.2 established the generic Camera proxy as a lightweight
procedural cinema-camera symbol with a
graphite body, compact front-to-back top handle, stepped lens, shallow matte-
box frame, side details, and lens-aligned finite FOV guide. It remains
manufacturer-independent; Camera Model selection changes capture behavior only
and never swaps the Stage representation.

Milestone 3B adds the first Camera View foundation. Camera View reuses the
existing Stage renderer and selected filmmaking Camera runtime, preserves the
Blocking View navigation state, centers the capture image at its desqueezed
display aspect, and overlays the selected delivery Frame Guide without
changing capture geometry. Timeline, depth of field, and other image-making
effects remain out of scope.

Milestone 3B.1 restores direct Stage selection and subject manipulation on
top of that Camera View foundation. Blocking View and Camera View now share
owner-aware hit testing, helper exclusion, click-versus-orbit-drag handling,
and the existing authoritative placement commit path. Camera View uses the
actual centered capture rectangle for pointer coordinates and permits Move or
Rotate only for Actors and Props; the viewed Camera remains hidden and the
view remains locked. Timeline, new Camera behavior, and image-making effects
remain out of scope.

Milestone 3B.2 adds a compact Stage-only View Cube for Blocking View. It uses
a DOM/CSS orientation cube with explicit face controls, follows the navigation
camera orientation, and snaps FRONT/BACK/LEFT/RIGHT/TOP/BOTTOM while
preserving the current orbit target and working distance. It provides a
navigation-only Home action and is isolated from Stage entity selection,
project serialization, Camera View, and the event-driven render policy.

Milestone 3B.5 makes Stage input explicit and professional. One Stage Gesture
Router arbitrates pending left clicks, Orbit drags, and TransformControls
priority before native OrbitControls receives a gesture. Orbit drags used
OrbitControls' public rotation semantics, while right-drag and wheel remained
native. The DOM View Cube exposed semantic face, edge, and corner zones for all
26 directions, supported cube dragging, and preserved target/distance on snap.

Milestone 3B.6 rebases Blocking View interaction around one deterministic
navigation state instead of OrbitControls. The state contains target, distance,
azimuth, and polar; the PerspectiveCamera is derived from it. A 5 CSS-pixel
pending gesture threshold routes left click selection on pointerup, left drag
orbit, right drag pan, and wheel zoom without a competing native click listener.
TransformControls retains highest priority for Move/Rotate gizmo drags. Camera
View and the existing DOM View Cube remain compatibility seams, while all
Blocking View navigation updates preserve selection and use invalidate-on-demand
rendering. `?interactionDebug=1` remains available for manual browser
acceptance.

## V2.10 Scenic Props, Architecture, and Sun

V2.10 adds a stable procedural Scenic foundation. Legacy primitive Props remain
valid, while Table, Chair, Bicycle, Motorbike, and Car use lightweight proxy
geometry. Wall and Door/Window Opening records are separate serializable
collections, distinguishing architecture from free-standing Props. Walls store
length, height, thickness, position, and rotation. Openings store dimensions,
sill placement, hinge side, optional wall reference, and a serializable Door
open angle. The existing timeline evaluator supports Prop transforms, Door
open angle, and Sun azimuth, elevation, intensity, and color tracks.

Sun records reuse the Scene light collection and store azimuth, elevation,
intensity, and color. Blocking View shows a selectable helper; Camera View and
video export use the same directional light without editor-only helper
geometry. Boolean wall cutting, external asset loading, and ambitious lighting
simulation remain intentionally out of scope for this stable foundation.

## V2.10A Scenic UX, Appearance, and Editing Shortcuts

V2.10A keeps the V2.10 procedural foundation and adds per-entity appearance
editing. Actors retain their existing appearance field, scenic records retain
their serializable primary color, and Cameras add an editor-only proxy color;
camera proxy color never enters capture or export rendering. Older files are
normalized with safe defaults. The same procedural scenic definitions are
reused by Blocking View, Camera View, and export.

Delete/Backspace and Cmd/Ctrl+D use the same document actions as Inspector
buttons, with a focused-field guard and ordinary history snapshots. Camera
duplication deep-copies Frame Guides and preserves capture settings. Vehicle
proxies remain procedural and inexpensive, with connected Bicycle/Motorbike
frames and four-wheel Car structure.

Sun helpers are derived from serializable Direction/Height values on a fixed
editor sky radius. A direct helper drag is adapted at the transform commit
boundary into azimuth/elevation; StageEngine pointer and axis algorithms are
unchanged. Normal UI uses filmmaker-facing Sun Position and Sunlight labels.

## V2.10B Vehicle Proxies and Scale Tool

V2.10B keeps vehicles as ordinary serializable Props but locks their visual
coordinate convention to +Y up, -Z forward, length on Z, width on X, and
wheel axles on X. Bicycle and Motorbike are lightweight procedural assemblies
with distinct open/light and substantial/heavy silhouettes; Car retains its
simple body language while receiving an orientation, four-wheel, and
grounding audit. Vehicle wheels use dark materials while the frame/body uses
the Prop color.

Primitive Cube, Sphere, and Cylinder Props now carry an optional backward-
compatible Scale value, defaulting to [1, 1, 1]. Scale is applied at runtime,
serialized by both .ndscene and .ndblock, editable in the Prop details panel,
and committed as one ordinary transform history transaction. StageEngine adds
only a separate Scale gizmo and scale math module: X/Y/Z handles affect one
component, the center handle scales uniformly, and Shift preserves the
starting proportions. Move, Rotate, navigation, and timeline keyframe models
remain unchanged; Scale has no timeline tracks.

## V2.10C Car Simplification and Wall Drawing

The Car proxy is intentionally reduced to a large lower body, a smaller
upper cabin, and four dark wheels. Bicycle is frozen and Motorbike is not
changed. Vehicle geometry remains procedural, serializable, and shared by
Blocking View, Camera View, and export.

Wall creation is a Blocking View placement mode owned by a small
`WallDrawingController`. The first ground click establishes an endpoint; the
next click commits one WallDocument and continues from that endpoint for
chain drawing. Escape or Enter exits the mode. The controller owns only the
temporary preview and left-click placement arbitration; StageEngine Move,
Rotate, Scale, orbit, pan, and trackpad navigation remain unchanged.

`wallMath` is the authoritative pure geometry layer for endpoint conversion,
tangent/normal vectors, projection, opening-offset clamping, nearest-wall
snapping, and 45-degree angle snapping. Door and Window records retain a
wallId plus optional `offsetAlongWallMeters`. Attached openings are resolved
from wall-relative data whenever a wall or opening changes, so they follow
wall movement, rotation, and length edits without CSG. The same resolved
architecture is used in Blocking View, Camera View, and export.

## V2.10D Procedural Wall Cutouts

Attached Doors and Windows now produce real through-wall apertures. The
semantic Wall and Opening documents remain the only persisted data; runtime
geometry is derived by `wallApertures.ts` in wall-local U/V space. Each
horizontal wall interval is split into solid vertical rectangles outside the
union of its attached rectangular aperture ranges, then each rectangle is
extruded through the complete wall thickness. This handles floor-to-ceiling
doors, raised windows, multiple openings, overlaps, edge clamping, and
detachment without CSG or generated scene records.

`scenicRuntime.ts` creates inexpensive full-thickness Wall section boxes and
assigns every section the parent Wall entity ID, so raycasting, selection, and
Move/Rotate continue to operate on one Wall. Geometry signatures include only
the affected Wall's construction values and attached opening dimensions/
offsets, allowing Blocking View, Camera View, still capture, and video export
to rebuild affected walls while preserving the shared production render path.
Door hinge animation remains an Opening concern and never changes the Wall
aperture. Persistence and duplication continue storing/remapping semantic
Wall/Opening links only.

## V2.10E Openable / Animatable Windows

V2.10E extends the existing serializable Opening foundation to make Windows
usable for blocking and previs. `hingeSide` and `openAngle` are normalized for
new and older scene/project files, with left/closed defaults and a 0–90 degree
Window range. The Window runtime is a fixed outer aperture frame plus a
movable inner sash/glass group rotating around a local vertical hinge. The
semantic Wall aperture remains unchanged by the sash angle.

The Window Inspector exposes Width, Height, Sill, Hinge, Open Angle, and small
closed/45/open presets. Open Angle uses the existing diamond keyframe workflow
and scalar interpolation; no new animation or physics system is introduced.
The shared evaluated Opening path drives Blocking View, Camera View/Preview,
still capture, and video export. Copy/paste, duplication, history, and
serialization preserve Window state. Open-angle changes update an existing
runtime visual in place, while hinge or construction changes use the existing
geometry signature and resource disposal path.

## V2.10C3 Camera View Overlay Layout Cleanup

Camera View keeps its existing production renderer and frame geometry, but the
DOM overlay is divided into a Camera Status badge, frame-attached Delivery and
Guide labels, and an isolated capture-control zone. A small pure placement
helper uses the Camera container width for full/compact metadata and performs
bounded collision-safe label stacking. Sensor/Native Delivery does not add a
redundant Camera View border label. Blocking View Preview uses the same compact
metadata language and hides guide text when its monitor is too small while
retaining the framing lines. Monitor overlays remain UI-only and are never
included in clean still captures.

## V2 Camera Screenshot and Blocking Camera Preview

Camera View now exposes a `Capture Frame` still action with 1280, 1920, and
2560 pixel width choices. Output dimensions use the existing Delivery Frame
math, and the filename contains sanitized Project, Scene, Camera, and current
Timeline frame names. The still is PNG and is rendered from the active
Camera's evaluated production runtime, never from the editor camera or a DOM
screenshot. Guides are opt-in; the clean default excludes guides, gizmos,
grid, proxies, and UI, while the opt-in image draws the Delivery Frame and
enabled Frame Guides with safe margins and labels.

Blocking View has a session-only Camera Preview toggle. It reuses the existing
CameraViewRuntime scene, actors, scenic architecture, production camera, and
lighting through a small secondary canvas renderer; it does not create a
second StageEngine or cloned scene graph. The preview follows active Camera,
Timeline evaluation, camera transforms, focal length, Delivery Frame,
anamorphic display aspect, guides, and committed wall/opening changes. The
temporary Wall drawing overlay remains editor-only. Preview state and still
capture do not dirty the Project or Scene.

## V2.10C4 Camera Preview Overlay Simplification

The small Blocking View monitor now has an explicit compact overlay policy. It
shows only `Camera name · focal length` (falling back to the Camera name when
the badge is too narrow), keeps the Delivery and Frame Guide borders, and
removes Delivery and Guide label text. The badge is pointer-transparent; the
close control occupies an independent top-right safe area. Full Camera View
metadata and frame labels remain unchanged, and no projection, geometry,
capture, export, timeline, or StageEngine behavior is involved.

## V2.10C5 Single Camera Info Box in Full Camera View

The full Camera View now has one authoritative Camera status component. The
legacy Stage header is suppressed in Camera View because it previously added
the active Camera name behind the status badge. The remaining two-line box
shows focal length plus Camera model, followed by Capture Mode; it does not
show the editor Camera name inside the image. Delivery and Frame Guide labels,
compact Camera Preview behavior, capture, and production rendering are
unchanged.

## V2.UI2 Deep Blue visual system

The V2 editor retains its accepted light Soft UI layout and behavior while
moving application accents from purple/lavender to a deep-blue semantic token
family. The token layer covers brand, primary/secondary actions, active View
and transform states, Scene/Details selection and focus, timeline marks and
keyframes, Camera badges, technical FOV helpers, and Camera View controls.
Cool-neutral surfaces and restrained blue-gray shadows keep the workspace
light. Creative Scene colors remain authoritative, including the intentionally
purple Cube and Actor defaults; semantic red, green, amber, Sun, Delivery,
custom Frame Guide, and transform-axis colors remain independent. This is a
visual-only CSS/runtime-helper palette pass with no layout, StageEngine,
camera, timeline, export, or persistence changes.

## V2.UI2A Header and Project workspace cleanup

Project naming is now edited inline from the compact Header rather than from a
duplicate left-panel card. Enter or blur commits a non-empty trimmed name;
Escape restores the original value. The existing Project rename callback and
dirty-state path remain authoritative, and the global shortcut guard continues
to suppress timeline, delete, and duplicate shortcuts while the field is
focused. New, Load, and Save receive secondary deep-blue hover/pressed/focus
feedback, while Export remains primary. No ProjectDocument, persistence,
Scene, StageEngine, Timeline, Camera, or Export semantics change.

## V2.UI2B Dynamic Project name width

The Header Project context uses intrinsic flex sizing for normal names and a
responsive maximum with ellipsis for long names. The inline rename input uses
its current character count as its intrinsic size, with the same responsive
maximum and a compact minimum. The right-side file, View, and Export actions
remain non-shrinking, so flexible empty space is owned by the Header between
the context and actions. Rename semantics and persistence are unchanged.

## V2.WEB1 Production web hardening

Production deployment emits a self-contained `dist/` static directory. Vite
reads optional `VITE_BASE_PATH`, with `/` for
a subdomain and `/blocking/` for a path deployment; there is no router or
service-worker cache. A central browser-capability seam covers WebGL, video,
canvas, file, and Blob APIs. WebGL/context-loss states, a React error boundary,
desktop viewport guidance, bootstrap loading UI, and friendly capture/export
errors protect the normal editor experience.

The MP4/WebM export capability check and Mediabunny export path are split from
the initial editor load. Existing DPR caps, deterministic export stepping,
resource disposal, Blob URL revocation, dirty reload warnings, and standard
file-input/download fallbacks remain in place. This milestone adds no backend,
accounts, telemetry, PWA, or Tauri integration. Staging acceptance remains a
manual gate documented in `docs/WEB_DEPLOYMENT.md`.
