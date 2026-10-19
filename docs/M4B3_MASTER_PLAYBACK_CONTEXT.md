# M4B.3 — Master Playback Context

Master playback now has an explicit runtime context separate from the active
Scene editor. One keyboard routing path chooses Scene or Master transport from
the current timeline mode; Space and the existing transport guards therefore
cannot drive the Scene timeline while Master is active.

At each Master frame, `resolveMasterPreviewContext` resolves the Master clip,
Shot, Scene, Camera, and source frame. The existing timeline evaluator is then
used to evaluate that source Scene, and the isolated Camera View runtime
renders the resolved camera without changing `activeSceneId`, `activeShotId`,
or the Scene editor playhead. Missing Shot, Scene, or Camera references remain
safe and are shown as explicit preview states.

Pause, Stop, and seek preserve the current Master frame; Return to Start moves
to frame zero. Master video playback ends at the end of the Shot sequence even
when Music continues beyond it. Fit All uses the complete visible extent,
`max(Shot end, Music end)`, and the horizontal transport wraps on narrow
layouts.

This is a runtime preview contract for M4C. It does not add cross-scene export,
transitions, or a second timeline evaluator.
