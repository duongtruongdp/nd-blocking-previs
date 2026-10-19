# M4D.1 Shot Thumbnails + Configurable Metadata

## Thumbnail capture

Shot List recapture uses the existing isolated production Camera runtime and
clean still path. It does not capture the Stage canvas, editor UI, guides, or
gizmos. The runtime renders at a 1280px source width, then the application
downsamples once to a 960px JPEG at quality 0.90. Existing lower-resolution
JPEG thumbnails remain valid and are replaced only when the user recaptures.

The stored `ShotThumbnail` keeps its encoded data URL, frame, width, and height,
so `.ndblock` persistence remains backward-compatible. The higher target will
increase project size relative to the former 320px-class previews; JPEG quality
and the 960px cap keep the increase bounded for storyboard use.

## Descriptive Shot metadata

`ShotDocument` now optionally stores one nullable value for each of:

- `shotSize`
- `angle`
- `movement`
- `equipment`

These are cinematography planning labels only. They do not affect Camera
behavior, Timeline evaluation, Master playback, rendering, or export.

## Project Shot List settings

`ProjectDocument.settings.shotList` stores the visible List columns and the four
option vocabularies. New projects receive the default vocabularies; older
projects are normalized on load without a migration dialog. Custom options are
trimmed, case-insensitively deduplicated, and can be renamed or removed. Removing
an option never mutates a Shot's existing value; the Inspector keeps a removed
current value visible until the user changes it.

The canonical column order is Thumbnail, Scene, Shot, Camera, Lens, Shot Size,
Angle, Movement, Equipment, Duration, Notes. `Shot` is always visible. Grid,
List, Inspector, Presentation, and browser print all consume the same settings.
