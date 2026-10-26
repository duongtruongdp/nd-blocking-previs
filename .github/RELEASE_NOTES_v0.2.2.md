# ND Blocking & Previs v0.2.2

## What's New

- Board View provides a thumbnail-only contact sheet for reviewing visual flow.
- Shot List now offers Board, Grid, and List presentations using the same Shot
  thumbnails and selection workflow.
- Scene and Shot ordering supports insert-before/after and pointer-based
  workspace reordering.
- Master Timeline editing supports independent Shot placement, multi-selection,
  group movement, non-destructive trimming, and double-click navigation into a
  source Scene Timeline.
- Keyframe and transform authoring is more stable, including independent
  position/rotation editing and same-frame keyframe upsert behavior.
- Group children can be selected and edited through the Inspector.
- Live Review Editor workflow improvements synchronize workspace and timeline
  state more reliably.

## Fixes

- Restored full-frame Shot thumbnail rendering in Grid View.
- Improved low-zoom Master Timeline geometry and ruler/playhead interaction.
- Repaired timeline edge interaction, source-bound trim clamping, and
  independent Shot movement behavior.
- Improved workspace sidebar layout, compact Shot labels, and context-menu
  interactions.
- Prevented duplicate same-frame transform keys during authoring.

## Known Limitations

- Full two-client Host/Editor/Viewer Live Review acceptance has not been
  completed in this release unless verified separately by the user.
- The macOS application is distributed as an unsigned, non-notarized Apple
  Silicon build. macOS may require the normal Finder **Open Anyway** approval.
- Windows installers are not published.

## Downloads

- `ND-Blocking-Previs-macOS-latest.zip` — macOS Apple Silicon package.
- `ND Blocking & Previs_0.2.2_aarch64.dmg` — macOS Apple Silicon disk image.
- Matching SHA256 checksum files are included with the release assets.
