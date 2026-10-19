# M4C — Master Playback Render + Final Video Export

## Scope

M4C adds the first production Master render/export path while preserving the
existing Scene exporter. The Master path renders a project-wide sequence of
Shots, including hard cuts across Scenes and Cameras, into one fixed-size
video. It is deliberately based on the existing timeline, camera, and export
math authorities.

## Render authority

`src/export/masterRenderPlan.ts` is the deterministic boundary:

- `effectiveMasterRenderRange()` supplies the start-inclusive/end-exclusive
  Master video range.
- every Master frame resolves through `resolveMasterPreviewContext()`;
  missing Shot, Scene, or Camera references fail preflight.
- Shot source ranges must remain inside their source Shot and all used Scenes
  must use the same rational frame rate.
- timeline evaluation is performed once per resolved Master context and passed
  to the production renderer.
- clip boundaries are represented in `clipsUsed`, making exact hard cuts
  testable without screenshot tests.

`MasterExportRenderer` owns one clean `VideoExportRenderer` per Scene/Camera
pair. It never changes the editor active Scene, playhead, selection, or
camera. The output canvas is fixed from the selected Delivery Frame and width.
Existing camera framing and the existing clean export render convention remain
authoritative; editor guides and selection overlays are not rendered.

## Browser and desktop paths

- Browser MP4 uses the existing Mediabunny/WebCodecs path with a Master canvas.
- Browser WebM uses the existing MediaRecorder canvas path.
- Desktop writes exact Master PNG frames, then invokes the existing FFmpeg
  runtime. The desktop path is not a second evaluator.
- Cancellation is checked between frames and during encoding; temporary
  renderers and workspaces are disposed in `finally` blocks.

## Music contract

Master Music is one optional persisted clip reference. The source asset bytes
remain external to the document and are loaded through the existing music asset
store. If Music is selected but the asset is unavailable, export fails with an
explicit missing-asset message.

`masterAudio.ts` maps the overlap of the Music clip and the Master video range
into an output-relative buffer. The native FFmpeg path applies the same source
trim, output offset, silence padding, and final video duration. Music cannot
extend the Master render beyond the video range.

## Scene compatibility

Scene export keeps its established inclusive Mark In/Mark Out behavior and
existing renderer. The new `source` field is optional for serialized/backward
compatible callers and defaults to Scene. Master-only fields are ignored by
the Scene path. No Camera database, capture math, StageEngine, or Camera View
behavior is changed by M4C.

## Acceptance boundary

Automated coverage verifies range semantics, exact clip boundaries,
cross-Scene resolution, evaluated entities, camera selection, preflight
failures, Music overlap, and native audio argument construction. Manual
acceptance is still required for clean rendered frames, hard-cut output,
camera framing, browser encoding, desktop FFmpeg output, and real Music
playback.
