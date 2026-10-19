# M4B.6 Timeline UI Unification + Compact Track Labels

M4B.6 is a UI-only consistency pass for the accepted Scene Timeline and the
Master Timeline. Both headers use the same compact left/center/right grammar:
mode tabs plus title, core status and transport, then zoom and actions. The
responsive wrapping remains local to the header so the timeline canvas,
playhead, ruler, track mapping, and resize behavior keep their existing
contracts.

Timeline track groups derive an ephemeral `displayName` for the timeline only.
Custom user names are shown unchanged. A single default-named entity is shown
by type; multiple default-named animated entities of the same type use stable
numbered type labels, such as `Camera 01` and `Camera 02`. Persisted entity
names, Scene panel names, selection IDs, and serialization are not changed.

No timeline evaluation, playback, keyframe mutation, Master sequencing, music
behavior, or camera behavior is included in this pass.
