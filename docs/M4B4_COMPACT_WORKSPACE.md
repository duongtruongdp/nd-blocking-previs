# M4B.4 — Compact Workspace + Master Camera Evaluation

Master Camera preview now consumes the evaluated source Camera document at
each resolved Master source frame. `CameraViewRuntime` applies both projection
settings and pose during reconciliation; this is shared by the floating Camera
Preview and dedicated Camera View. Normal Scene playback may still apply its
temporary composed pose afterward. Camera IDs remain scoped by the resolved
project/Scene runtime boundary, so a clip cut cannot reuse a stale transform.

The editor shell uses a small set of compact spacing tokens:

- `--app-edge-gap`: 8px
- `--workspace-gap`: 8px
- `--panel-padding`: 12px
- `--timeline-gap`: 8px

Desktop side columns are constrained to a 224px Scene workspace and 264px
Inspector, leaving the Stage as the flexible priority column. The timeline
mode bar and transport headers are reduced without changing their interaction
or resize behavior. Master ruler, Shot, and Music row heights remain aligned
at approximately 26px, 62px, and 42px.

Fit All, waveform extent, Master playback range, keyboard routing, and the
MasterSequence data model are unchanged from M4B.3. Final Master export and
transitions remain deferred to M4C.
