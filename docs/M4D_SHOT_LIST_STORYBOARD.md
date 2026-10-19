# M4D Shot List + Storyboard

## Reuse audit

The Shot List is a view over the existing project-level `ShotDocument[]` collection. It does not introduce a storyboard copy or a second ordering source.

- Shot identity, order, Scene/Camera references, ranges, notes, thumbnails, and `thumbnailFrame` come from `src/core/shotDocument.ts` and `ProjectDocument.shots`.
- Shot duration uses `shotDurationFrames` and the canonical `frameToTimecode` formatter.
- Scene and Camera metadata are resolved from the referenced `ProjectSceneEntry`; focal length is evaluated at `thumbnailFrame`, falling back to `startFrame`.
- Open and Preview reuse the existing `activateShot` and `previewShot` paths in `App.tsx`.
- Thumbnail capture reuses the existing `captureShotThumbnail` path and its accepted active Scene/Camera/playhead constraints.
- Rename, notes, duplicate, delete, dirty-state handling, and persistence remain the existing project edit operations.
- Master usage is read from `masterSequence.clips`; Shot List reordering does not touch Master clip order or `shotId` references.

## Workspace behavior

`V2ShotListWorkspace` is a project-level navigation view with session-only Grid/List preference and a simple Scene filter. Grid is the primary storyboard view; List renders the same cards as a compact production table. Shot selection is local to this workspace and does not change the active Scene until Open Shot is used.

The Inspector is a compact Shot detail panel with editable name and notes plus Open, Preview, Capture Thumbnail, Duplicate, and Delete actions. Dragging a card or row calls `reorderShotDocuments`, which derives display numbers from the resulting project order.

## Presentation and print

Present mode hides the editor workspace controls and Inspector while retaining project name, cards, thumbnails, metadata, and notes. Storyboard sharing uses `window.print()` with a dedicated print stylesheet: the browser's PDF destination is the supported PDF path, cards use `break-inside: avoid`, and thumbnails use `object-fit: contain` with a safe missing-thumbnail placeholder.

Missing Scene, Camera, and thumbnail references remain visible as safe labels and do not prevent the rest of the Shot List from rendering.
