# M4B.5 — Master Timeline Density + Toolbar Re-layout

The Master Timeline header is a single compact flex toolbar. Scene/Master tabs,
the Master title, transport, timecode, zoom/Fit, and `+ Add Shot` share the same
normal-flow row at desktop widths. Controls use compact 28px hit areas and the
timecode uses a bounded 110–118px readout rather than a separate tall block.

The Master shell no longer reserves the Scene modebar row while Master is
active. Scene mode keeps its existing modebar and timeline component. The
collapsed workspace default is 190px, while the existing resize handle and
minimum height continue to permit user expansion.

The timeline remains a visualization and arrangement surface. The ruler is
separate from the toolbar, the playhead continues through the ruler and both
tracks, and the SHOTS/MUSIC rows retain their approximately 26px, 62px, and
42px geometry. The MUSIC label contains the compact Import/Replace action; when
Music exists, selection and trim/removal actions remain in the Master Inspector.

Fit All, frame mapping, Master playback, waveform generation, drag/drop, Shot
Bin behavior, and the MasterSequence model are unchanged. Responsive widths may
wrap the toolbar into at most two compact rows; controls remain horizontal and
never become a vertical button stack. M4C export and transition work remains
deferred.
