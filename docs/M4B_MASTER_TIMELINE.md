# M4B — Master Timeline / Sequence Assembly

## Audit decisions

- Project FPS is not stored globally. Each `SceneDocument.timeline` owns its
  rational frame rate.
- A Shot is a project-level reference to an existing Scene/Camera and stores
  its own source range. Shot duration is `endFrame - startFrame`, matching the
  existing timeline boundary convention.
- Mark In/Mark Out and temporary Shot Preview ranges remain Scene Timeline
  state. They are not copied into a Master clip.
- The existing video exporter renders one active Scene/Camera frame range. It
  does not switch Scenes or Cameras inside one export session.

## M4B policy

The first referenced Scene establishes the Master frame rate. A Shot whose
Scene uses a different rate cannot be added to the Master Sequence; the UI
surfaces a validation message instead of silently converting frame timing.
This keeps the M4B mapping deterministic without introducing mixed-FPS
conversion before M4C.

## Data contract

```ts
type MasterSequenceDocument = {
  clips: MasterClipDocument[]
  musicClip: MasterMusicClipDocument | null
}

type MasterClipDocument = {
  id: string
  shotId: string
  sourceStartFrame: number
  sourceEndFrame: number
  order: number
}
```

The optional M4B.1 music foundation is metadata-only and is documented in
`docs/M4B1_MASTER_WORKSPACE.md`; it does not change the shot-duration mapping
or add playback to this milestone.

`sourceStartFrame` is inclusive and `sourceEndFrame` is exclusive. A Master
clip duration is derived as `sourceEndFrame - sourceStartFrame`; total Master
duration is the sum of those derived durations. Trimming is permitted only
inside the referenced Shot range and never changes the Shot.

`resolveMasterFrame()` is the shared M4C contract. It resolves a Master frame
to `clipId`, `shotId`, resolved Scene/Camera IDs, `sourceFrame`, and
`localClipFrame`. The same Shot may be referenced by multiple clips because
clip IDs are independent stable identities.

## Editor behavior

The accepted Scene Timeline remains available in its own tab. The Master tab
is a lightweight single horizontal row with proportional clip widths, a
minimum readable size, reused Shot thumbnails, a Master playhead, total
timecode, source trim fields, and a compact clip detail area. The Shot menu
and Master empty state can append existing Shots. Clip selection and playhead
position are session state; sequence edits use the existing project dirty and
persistence path.

`Open Shot` activates the referenced Shot's Scene and Camera and moves the
Scene Timeline to the clip's source start. Removing a Master clip never
deletes source data. Deleting a Shot with dependent Master clips requires an
explicit second confirmation and removes those dependent clips atomically.
Missing Shot clips remain removable; Missing Camera inherits the existing Shot
state.

## Persistence and M4C handoff

`masterSequence` is saved in `.ndblock` files. Older project files migrate to
an empty sequence. The Master sequence does not add an independent renderer,
video element, or export path. M4C can consume the sequence contract to build
cross-scene playback and export; M4B deliberately leaves that work, along
with transitions, audio, and multi-track editing, out of scope.
