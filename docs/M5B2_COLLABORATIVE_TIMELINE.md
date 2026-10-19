# M5B.2 Collaborative Scene Timeline Editing

M5B.2 extends the existing M5B Live Review protocol with narrow, host-authoritative Scene Timeline editing.

## Supported scope

Editors may add, move, update, and delete one transform key at a time for:

- Actor Position and Rotation
- Prop Position, Rotation, and Scale
- Camera Position and Rotation

Wall, Opening, Light, duration, FPS, marks, interpolation, Camera segment timing, Master, Music, and batch key operations remain Host-only or read-only.

## Authority and leases

Timeline intents use the existing protocol version 2 and are routed by the relay as `editor_timeline_commit` / `edit_timeline_request`. The relay validates the typed payload, participant role, revision, and lease, but does not evaluate or mutate a `TimelineDocument`.

Each edit uses the existing lease service with a track-scoped target:

`timeline:<sceneId>:<entityType>:<entityId>:<property>`

The Host applies the operation through the canonical timeline helpers and returns the authoritative project snapshot/result. Operation IDs are deduplicated by the relay. Rejected or stale operations request an authoritative resync.

## Canonical semantics

Add-key operations evaluate the visible Scene Timeline pose at the requested playhead before capturing the value. Actor public Rotation maps to the existing semantic `heading` track; Camera Position and Rotation continue to use the existing camera timeline representation and evaluation path. Prop Scale is represented as a first-class transform track and uses the same evaluator/transform ownership path as other authored properties.

Key moves use `moveTimelineKeyframe`, including its existing integer-frame conversion, duration extension, and deterministic same-track collision policy: moving onto an occupied destination replaces the destination key while preserving the moved key's value/identity. Add, move, update, and delete each create one Host history transaction. Timeline previews are local/ephemeral; they do not enter history or project persistence.

Direct Stage transforms continue through the pre-existing M5B `commitTimelineTransform` path and are not duplicated by Timeline intents. Camera optical data, Camera View, Camera Preview, Camera Path derivation, and camera transform policy are unchanged.

Follow Host presentation state remains separate from project edits. While an Editor is actively dragging a supported key, incoming Host presentation updates do not replace the Editor's local playhead. On cancel, disconnect, lease expiry, role demotion, scene change, or session end, the existing lease and authoritative resync lifecycle is responsible for clearing the edit.
