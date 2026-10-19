# M4B.7 Unified Timeline Transport + Master Mark Range

## Header structure

Scene and Master Timeline toolbars now use the same natural-width sequence:

1. Scene/Master tabs
2. contextual controls
3. Return, Play/Pause, Stop, and Loop
4. timecode
5. zoom out, Fit, and zoom in
6. compact Mark In/Out controls
7. Master-only Add Shot

The old visual `Scene Timeline` and `Master Timeline` labels are removed. The
shared inner toolbar is an inline flow rather than a `space-between` layout:
there is no growing center group and no auto-margin action group. On narrower
layouts it may wrap locally without moving the timeline canvas, ruler, tracks,
or resize behavior.

## Master mark model

`MasterSequenceDocument` persists optional `markInFrame` and `markOutFrame`
in Master-frame coordinates. They are normalized on load and after structural
clip edits. The valid render/review range is resolved by
`effectiveMasterRenderRange()`:

- start is inclusive and defaults to frame `0`;
- end is exclusive and defaults to the end of the Shot/video sequence;
- the range is clamped to non-empty video content;
- invalid or inverted persisted marks are discarded safely.

The Master timeline displays the effective In/Out lines even when a side has
not been explicitly authored, making the default video range visible.

## Video range versus music extent

Master video duration comes only from ordered Shot clips. Music can remain
longer for waveform display and Fit All framing, but a music-only tail cannot
extend the displayed Master duration, Master playback, Master loop, or marks.

Master loop is session-only. When enabled it loops the effective mark range;
otherwise it loops the entire video sequence. It is intentionally excluded
from `.ndscene` persistence.

This `effectiveMasterRenderRange()` contract is the explicit source-frame
boundary intended for a future M4C render/export pass. That future work should
consume this range rather than infer an end frame from visual or music extent.

## Scope

This pass does not alter Scene timeline evaluation, keyframe data, Master clip
mapping, music timing, shot data, or export behavior.
