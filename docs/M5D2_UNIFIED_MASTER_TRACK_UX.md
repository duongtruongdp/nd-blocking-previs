# M5D.2 — Unified Master Track UX

The Master Timeline keeps distinct production semantics for `SHOTS`, zero or
more `GRAPHICS` tracks, and an optional single `MUSIC` track. The three visible
lane types share the same compact lane action styling and pointer-captured
boundary resize interaction.

Track height is workspace-local display state. It is not part of `.ndblock` or
`.ndscene` production data, does not create project history entries, does not
change timing/FPS/duration, and is not sent through Live Review.

Music-track existence is different: it is persisted in
`MasterSequenceDocument.musicTrackPresent` and is project history state. Older
documents without that field migrate to a present Music lane, preserving their
previous UI. Explicit deletion stores `false`; adding the lane stores `true`.
At most one Music lane can exist. Music sidecars are retained through delete
history so undo can restore the existing metadata/audio relationship; normal
asset cleanup remains outside this UI pass.

Graphics and Music menus are rendered as fixed body-level popovers so they do
not participate in lane layout, clip neighboring rows, or change scroll
geometry. The playhead and range guides continue to use the live Master canvas
stack rather than fixed lane constants.
