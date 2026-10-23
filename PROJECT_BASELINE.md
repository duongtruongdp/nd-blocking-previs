# ND Blocking & Previs — Project Baseline

**Baseline date:** 2026-10-23
**Repository:** `/Users/NDMacbook/nd-blocking-previs`
**Purpose:** source-verified handoff for the next AI or developer

This document describes the current repository as found during the baseline pass. It is documentation only. No product behavior was changed for this baseline, and the current broken video-export behavior was not repaired.

## 1. Current status at a glance

ND Blocking & Previs is a React/Vite browser application with a Three.js blocking Stage, a Tauri desktop shell, a separate phone-camera companion route, and collaborative Live Review transport. The persistent creative model is project-first: a Project contains Scenes, Shots, a Master Sequence, project settings, and camera defaults; each Scene contains actors, props, architecture, cameras, lights, groups, and a Scene Timeline.

The repository is currently on `main` at `5dc60d8` (`feat: complete M5C scene integrity and master timeline improvements`) and tracks `origin/main`.

### Current blocker

**Video export is currently reported as broken.** This baseline records the blocker only. It does not claim a root cause, fix, or acceptance. The export code has separate browser and native paths and should be reproduced and diagnosed in a later, isolated task.

### Current acceptance posture

Historical milestone acceptance statements and supplied manual-review evidence are recorded below as project history, not as a substitute for a fresh browser or device acceptance run. The current working tree also contains uncommitted M5D-era implementation work, so the repository is not a clean release snapshot. M5D.9A manual acceptance remains pending unless separately observed and recorded.

## 2. Product identity and scope

The product is a previs/blocking tool for arranging actors, scenic elements, architecture, lights, and filmmaking cameras in a scene, then planning shots and assembling a Master Sequence for review and export. The product is not a general 3D DCC, full animation package, NLE, or production-rendering system.

Current scope includes:

- procedural or imported blocking actors/mannequins with pose presets;
- procedural scenic props, vehicles, walls, openings, and lights;
- cinema-camera data, camera blocking, Camera View, frame guides, and camera paths;
- Scene Timeline and Master Timeline editing/playback;
- shot list/storyboard presentation and export;
- Master graphics/image overlays and optional Master music metadata/sidecar assets;
- `.ndscene` scene persistence and `.ndblock` project persistence;
- browser and Tauri desktop adapters;
- Live Review collaboration and the phone-camera companion.

Out of scope for this baseline: a new pose system, IK, physics, photoreal rendering, Camera View redesign, new camera data, or an export rewrite.

## 3. Repository and runtime architecture

### Build and entry chain

The verified web entry chain is:

```text
index.html
  -> src/main.tsx
  -> src/App.tsx (V2App / V2EditorApp)
  -> src/components/V2Stage.tsx and workspace components
  -> src/runtime/stageRuntime.ts / cameraViewRuntime.ts
  -> src/stage-engine/stageEngine.ts
```

`src/main.tsx` installs the React error boundary, detects runtime capabilities, imports the editor styles, and renders `V2App`. `src/App.tsx` owns the project-level React state and routes between the editor, shot-list, and related workspaces. Vite has two HTML inputs: the main app and `phone-camera/index.html`.

### Main layers

- `src/components/`: React UI for the top bar, Scene panel, Inspector, Stage, Scene Timeline, Master Timeline, project settings, shot list, Live Review, and dialogs.
- `src/core/`: serializable domain documents, normalization, persistence, project history, save state, camera defaults, music/image sidecar references, and UI-session models.
- `src/runtime/`: Three.js-facing runtime assembly, camera blocking, Camera View, scenic runtime, mannequin/actor runtime, overlays, and rendering coordination.
- `src/stage-engine/`: Stage selection, transform interaction, gizmos, snapping, arrange operations, bounds, and stage math.
- `src/timeline/`: evaluation, frame math, transform ownership, camera paths, camera review, and timeline clipboard behavior.
- `src/export/`: Scene and Master export planning, rendering, browser encoding, native frame/FFmpeg encoding, audio, and format support.
- `src/platform/`: browser/Tauri adapters, recovery, thumbnails, file operations, and native export/runtime bridges.
- `src/liveReview/`, `live-server/`, and `relay/`: collaboration protocol/client, standalone relay, and Cloudflare relay implementations.
- `mobile/ios/NDPhoneCamera/`: native iPhone companion source.
- `src-tauri/`: Tauri 2 desktop shell and Rust-native integrations.

### Toolchain

`package.json` identifies a React 19 + TypeScript + Vite application using Three.js, Vitest, oxlint, Mediabunny, and Tauri 2. The repository uses `package-lock.json`; no pnpm, Yarn, or Bun lockfile was found. Vite uses the repository root, port `5174`, `dist` output, and `VITE_BASE_PATH` for deployment paths. The Tauri configuration builds the web app before packaging and points `frontendDist` to `../dist`.

Primary commands are:

```text
npm run dev
npm test
npm run lint
npm run build
npm run build:web
npm run relay:typecheck
npm run desktop:dev
npm run desktop:build
npm run live-server:build
npm run release:verify
```

## 4. Scene and project data model

`SceneDocument` is the scene-level serializable model. It uses the `ndscene-v2` schema and contains metadata, Stage metadata, actors, props, walls, openings, cameras, lights, groups, `activeCameraId`, and a `TimelineDocument`.

`ProjectDocument` is the project-level model. It contains:

- project identity and timestamps;
- `scenes` as named `ProjectSceneEntry` records;
- `activeSceneId`;
- project `shots` and `activeShotId`;
- `masterSequence`;
- project settings, including shot-list settings;
- project-scoped `cameraDefaults`.

Entity documents keep stable IDs and serializable transforms. Actors include pose preset and visual-style data. Props include shape/prop type, dimensions, color, and scale. Walls and openings are procedural architectural records; openings can attach to a wall by wall ID and offset. Cameras hold camera database IDs, capture-mode IDs, focal length, optical settings, placement, target/aim/composition settings, delivery/frame-guide state, and optional camera snapshots.

Persistence boundaries are explicit:

- `.ndscene` stores a normalized SceneDocument.
- `.ndblock` stores a validated `NdblockFile` with format `ndblock`, current version `1`, and a ProjectDocument.
- Project normalization migrates/normalizes scenes, shots, Master Sequence, shot-list settings, and camera defaults at the persistence boundary.
- Music and image bytes are not embedded in the project JSON. The project stores serializable asset references; browser sidecars use IndexedDB keyed by project and asset ID.

## 5. Stage, actors, poses, props, architecture, lights, and cameras

The Stage is Three.js-based and event-driven. Runtime objects are constructed from serializable documents and registered with the Stage engine for selection, transform, snapping, bounds, and disposal. Selection identity is separate from the persistent document and is synchronized with the Scene panel and Inspector.

Actors use the Character Registry/asset loader and semantic rig profiles. Imported character assets are normalized to the shared Y-up, one-meter convention; the runtime applies the canonical local forward correction so the Actor convention remains -Z. Pose data is semantic/runtime calibration, while persisted actor placement/facing remain separate. Existing procedural/mannequin and pose behavior is outside this baseline task.

Props and scenic objects are intentionally lightweight procedural proxies. Walls and openings are serializable architecture records with runtime geometry derived from dimensions and wall attachment. Lights are scene entities with serializable position/orientation/intensity/color data. Cameras use the camera database and capture-mode definitions for real capture behavior while the Stage representation remains a generic camera proxy.

The camera database is source data, not Stage geometry. Camera model selection resolves a camera definition and capture mode; it does not change the generic visual camera representation. Camera defaults are project-scoped creation preferences and do not rewrite existing camera, Shot, or Master references.

## 6. Coordinate and camera invariants

The verified Stage convention is:

- **Y-up**;
- world units represent meters;
- **-Z is the filmmaking camera forward axis**;
- **+X is right**;
- +Z is the Actor-facing/front side in the Stage view convention, with -Z as back.

Camera blocking edits begin from `currentEditableCameraPose(scene, cameraId)`. That function evaluates the current Scene Timeline frame and applies any authored timeline properties to the CameraDocument before a blocking edit starts. Therefore the visible/evaluated camera pose at the current playhead is the authority for camera blocking edits; edits must not silently start from stale base-camera values.

The current camera transform policy is body-center based: the Camera runtime body is used for move/rotate interaction, with camera-local axes where the existing Stage transform policy calls for them. Camera capture math, optical values, and projection remain separate from Stage proxy geometry. No scale/position regression or camera-data redesign is part of this baseline.

The filmmaking camera forward axis is `-Z`. Camera math uses Three.js `lookAt`/Euler conversion and the existing camera runtime/camera math helpers. Do not introduce a second forward-axis convention or derive camera projection from the visual proxy.

## 7. Timeline and evaluation invariants

### Scene Timeline

Scene timelines store integer frame positions and rational frame rates. `TimelineDocument` carries current frame, start frame, duration, derived end frame, marks, and typed property tracks. Position, heading, rotation, scale, focal length, opening angle, light azimuth/elevation/intensity/color are distinct timeline properties.

The evaluator resolves the authored state at a frame without mutating the persistent base document. `cameraDocumentWithTimelineEvaluation` overlays evaluated Camera position, rotation, and focal length on a base CameraDocument. Transform ownership and recording code can suppress only the property being recorded; this is important for phone rotation recording, where newly recorded rotation must not feed back into the live base rotation during the capture session.

### Master Timeline

Master clips use **start-inclusive/end-exclusive** source ranges: `[sourceStartFrame, sourceEndFrame)`. A clip from 10 to 12 contains samples 10 and 11 and has duration 2.

Master duration is the sum of ordered clip durations. There are `N` renderable samples and `N + 1` valid edit/cursor boundaries. Renderable samples are `0 .. N-1`; the boundary at `N` is not a render sample. `effectiveMasterRenderRange` and `buildMasterRenderPlan` preserve this contract and exclude a possible music-only tail from video rendering. Mark In/Out are normalized against the video duration and do not make the exclusive end renderable.

Master resolution maps a Master frame to an ordered clip, Shot, Scene, Camera, source Scene frame, and local clip frame. Master export evaluates each resolved context and does not mutate the editor's active scene, playhead, selection, or camera.

### History and edit ownership

`ProjectHistory` stores cloned before/after ProjectDocument snapshots with a label and optional selection state. One logical user action should produce one history entry. Undo/redo applies a stored snapshot and must not create a second history entry. Timeline UI/session changes are not creative project edits and must not create history or dirty the project.

## 8. Graphics, music, frame guides, and Camera View

Master graphics are project-level Master Sequence data, not Scene Camera View data. The model supports graphics tracks, image asset metadata, image clips, normalized position/scale/rotation/opacity, and fade-in/fade-out frames. Images may be PNG/JPEG or another browser-supported image type accepted by the import path; image bytes live in the image sidecar store while metadata is serializable.

The UI may expose fade duration in seconds, but integer Master frames remain canonical and are converted using the active rational frame rate. Image transforms are evaluated in the Master delivery container; they do not alter camera physical projection.

Music is one optional persisted Master clip/reference with source and output timing. Music bytes are kept in the sidecar store and must be available when included in export. Missing music is an explicit export error, not a silent fallback.

Frame guides and delivery frames are camera/preview presentation concerns. Delivery frame changes must not change physical camera FOV or active capture dimensions. Camera View is read-only capture preview; it should not author Scene transforms or Master graphics.

## 9. Collaboration and Live Review

Live Review is based on an Internet relay, not WordPress backend logic. The browser/desktop client uses `src/liveReview/liveReviewTransport.ts` and the protocol types; the standalone Node relay is under `live-server/`; the Cloudflare/Durable Object relay is under `relay/`.

The collaboration boundary is serialized data. Three.js objects, DOM nodes, runtime references, local filesystem paths, object URLs, passwords, and music bytes are not sent through the relay. A Host is authoritative for project snapshots, presentation state, transform previews/commits, timeline collaboration operations, and pointer/end-state messages. Viewers are rejected from host-only mutations at the protocol boundary. Revisions are monotonic; initial join receives a serialized ProjectDocument snapshot.

Editor orbit/pan/zoom is private. Follow Host is presentation state and must not be confused with editor navigation. Reconnect/session state, role, active scene/shot/camera, scene/master playheads, playback, Camera View, shot-list presentation, participants, chat, and pointers are runtime LiveReview state and are not written to `.ndblock` or `.ndscene`.

## 10. Save, recovery, and lifecycle safety

The current save path snapshots the project, prepares/normalizes it, serializes and validates it, and then writes through the platform adapter. The saved checkpoint records a project revision and creative fingerprint. If a later edit occurs while an earlier asynchronous save is completing, the later edit remains dirty; an old save completion cannot incorrectly mark newer content clean.

New Project, Load, project-library context changes, and desktop quit use unsaved-change guards. Browser `beforeunload` is registered for dirty state. Desktop close requests use the platform adapter and allow close only after a successful save or explicit discard. Recovery entries are separate from the production project file.

Timeline viewport/session state and workspace sidebar state are in-memory UI state. They are intentionally excluded from persistence, history, collaboration, dirty-state calculation, and export. Native close/recovery behavior is source-covered, but physical desktop quit acceptance is not claimed by this document.

## 11. Feature inventory

### Stage and scene editing

- Scene creation/selection and Scene panel synchronization.
- Actor/mannequin creation, selection, pose presets, colors, transforms, duplicate/copy/paste, and undo/redo.
- Procedural props and scenic library items, vehicle proxies, walls, openings, and lights.
- Camera creation, selection, move/rotate, camera model/capture mode/focal length, frame guides, target/aim tools, Camera View, and camera defaults.
- Stage selection, local/world transform tools, snapping, arrangement, framing, navigation, view cube, direct selection, and camera proxy interaction.

### Planning and playback

- Scene Timeline with transform/optical/property tracks, keyframes, recording, playback, range marks, clipboard/edit operations, and workspace zoom/session state.
- Shot creation/editing, shot list/storyboard view, thumbnails, presentation/export, and active Shot camera assignment.
- Master Timeline with ordered Shot clips, clip range/reorder editing, playback context, graphics lane, optional music lane, frame marks, and Master evaluation.

### Persistence and platform

- `.ndscene` and `.ndblock` normalization/validation/migration boundaries.
- Project library/recent projects, thumbnails, autosave/recovery, save/save-as, dirty-state guards, and project camera defaults.
- Browser adapters, Tauri desktop adapters, native FFmpeg frame export, update/release support, phone-camera companion, and Live Review relay/client.

## 12. Milestone and acceptance ledger

The following is a handoff ledger, combining the supplied project history with the current source tree. “Historical accepted” means it was reported/accepted in the supplied project record; it is not a fresh manual acceptance in this baseline.

| Milestone family | Current handoff status | Evidence/notes |
|---|---|---|
| M3A–M3C camera/stage foundation | Historical accepted / regression-sensitive | Camera object, Camera View, Stage selection/navigation, and view-cube work are present in source and docs. |
| M3D–M3H camera blocking, composition, path, timing, playback | Historical accepted / regression-sensitive | Camera path, composition overlays, timing, and playback code/docs are present. |
| M4A–M4D shot planning, Master Timeline, Master render, shot list/storyboard exports | Historical accepted in project history; export currently blocked | Master planning/render/export code exists. Current video export is reported broken and is not fixed here. |
| M5A Live Review foundation | Historical accepted / production relay evidence exists | Relay/client/protocol and Live Review docs are present; physical acceptance is separate. |
| M5B collaborative editing/timeline | Historical implementation checkpoint | Host-authoritative collaboration and timeline operation code/docs exist; fresh multi-user acceptance is not claimed here. |
| M5C master/shot collaboration and scene integrity | Reflected by current HEAD | HEAD is `feat: complete M5C scene integrity and master timeline improvements`. |
| M5D.2 unified Master track UX | In current dirty worktree | `docs/M5D2_UNIFIED_MASTER_TRACK_UX.md`, `masterGraphics`, and related UI/source changes are uncommitted. |
| M5D.3–M5D.5 history/camera defaults/timeline UX | In current dirty worktree | Current source includes project history, camera defaults, and Master/timeline updates. |
| M5D.6 safe project save | In current dirty worktree | `docs/M5D6_SAFE_PROJECT_SAVE.md`, save-state code, guards, and tests are present. |
| M5D.7 timeline session state | In current dirty worktree | `docs/M5D7_TIMELINE_SESSION_STATE.md` and session-state code/tests are present. |
| M5D.8 project camera defaults | In current dirty worktree | `docs/M5D8_PROJECT_CAMERA_DEFAULTS.md` and camera-default code/tests are present. |
| M5D.9 collapsible workspace sidebar | In current dirty worktree / manual status not independently verified | Sidebar-session source/tests are present. |
| M5D.9A sidebar header action layout hotfix | Manual acceptance pending | This baseline does not claim browser/manual acceptance. |

## 13. Known risks and deferred work

1. **Video export:** currently broken by report. Reproduce first in browser and desktop separately; isolate whether the failure is plan resolution, renderer capture, browser encoding, native frame output, FFmpeg invocation, or destination finalization. Do not infer a fix from the presence of passing unit tests.
2. **Dirty working tree:** the current M5D-related implementation is not committed. Any follow-up must preserve or explicitly isolate these changes before touching export or other behavior.
3. **Manual acceptance gap:** the source and automated tests do not replace fresh browser, Tauri, relay, or physical iPhone acceptance.
4. **Sidecar lifecycle:** image/music byte stores are separate from project JSON. Asset cleanup, migration, and cross-device behavior need explicit testing.
5. **Native lifecycle:** save/quit/recovery guards are implemented in source, but real packaged-app close, recovery, and update behavior must be tested in the target desktop build.
6. **Collaboration scale:** the relay model is intentionally lightweight and snapshot/operation based. Large projects, reconnect races, and multi-editor contention need bounded tests before production scaling.
7. **Camera/Timeline authority:** future camera tooling must continue to edit the evaluated current-frame pose and must not silently author base values when a track owns the property.

Deferred by design: Camera View expansion, full animation/IK/physics, photoreal assets, a new export architecture, and unrelated Stage-engine redesign.

## 14. Git state at baseline

The baseline was collected on branch `main`, tracking `origin/main`, at:

```text
5dc60d8 (HEAD -> main, origin/main) feat: complete M5C scene integrity and master timeline improvements
```

The worktree is dirty. Existing tracked modifications include `src/App.tsx`, major V2 UI components, core Master/timeline/save/persistence files, export files, platform/runtime files, styles, and related tests. Existing untracked additions include the M5D documentation files, project settings/unsaved dialog, image asset store, Master graphics, project camera defaults, save/session/sidebar state modules, and their tests. `tsconfig.tsbuildinfo` is also modified.

These changes predate this document and were preserved. This baseline adds only `PROJECT_BASELINE.md`; no files were staged, committed, reset, restored, stashed, cleaned, or pushed.

## 15. Development rules for continuation

- Preserve the serializable ProjectDocument/SceneDocument boundaries.
- Keep runtime Three.js objects, DOM, object URLs, local paths, and sidecar bytes out of project JSON and Live Review payloads.
- Treat current-frame timeline evaluation as authoritative for visible/editable state.
- Maintain Y-up, meters, +X right, and -Z camera forward.
- Preserve start-inclusive/end-exclusive Master ranges and distinguish render samples from edit boundaries.
- Make one logical action one history transaction; restore/undo/redo must not create extra history.
- Keep UI-only session state out of persistence, history, dirty state, collaboration, and export.
- Keep camera database/capture math separate from proxy geometry and visual overlays.
- Preserve browser/Tauri adapter boundaries and explicit async save checkpoints.
- Prefer stable, serializable, procedural proxy foundations over fragile visual ambition.
- Do not claim manual/browser/device acceptance without actually observing it.
- Before implementation, inspect the current dirty diff and identify the smallest isolated change set.
- After implementation, run the relevant tests, lint, typecheck/build, and `git diff --check`; then report exact unknowns and manual acceptance gaps.

## 16. Safe continuation protocol

1. Start from the current branch and inspect `git status --short` and the relevant dirty diff.
2. Do not reset, checkout, clean, stash, or overwrite existing work without explicit authorization.
3. Reproduce the reported issue with the smallest fixture and record browser versus desktop behavior separately.
4. Trace the authoritative domain path before changing UI or runtime code.
5. Make a narrow change with focused tests; avoid mixing export, Stage, timeline, and persistence changes.
6. Run the project validation commands that match the changed boundary.
7. Perform the required manual acceptance in the actual target runtime before calling a milestone accepted.
8. Update documentation only after source and observed behavior agree.

## 17. Recommended first task

The next task should be an **export-only forensic reproduction and diagnosis**. Use a minimal valid project with one Scene, one Shot, one Camera, and a short Master range. Test browser WebM, browser MP4, and desktop native export independently. Capture the first failing boundary, error, frame count, output path/blob state, and whether the failure occurs before rendering, during encoding, or during finalization. Do not alter StageEngine, Camera View, timeline contracts, persistence schemas, relay behavior, or unrelated dirty-worktree files during that investigation.

## 18. Baseline validation

- Repository paths and source facts were checked against the current tree, not copied solely from historical milestone prose.
- The final document must be read back after creation and checked for accidental secrets or private tokenized URLs.
- `git diff --check` is the required documentation-pass whitespace validation.
- Automated tests/builds are not evidence that the currently reported video-export blocker is fixed.

PROJECT BASELINE CREATED — READY FOR AI HANDOFF
