# Camera Database

V2 camera records are cinematography planning data, not manufacturer product
catalogue metadata. Each camera has a physical sensor description and one or
more documented capture modes. A capture mode owns the active image area and
recording raster used by projection math.

## Version and coverage

- Database version: `2`
- Snapshot date: `2026-10-06`
- 40 camera bodies and 120 geometry-changing capture modes across ARRI, Sony, RED, Canon, Blackmagic Design,
  Panasonic / LUMIX, and DJI
- Current, legacy, and rental-specialist bodies are intentionally mixed so a
  cinematographer can plan contemporary productions and rental references.

The selector is manufacturer-first and ordered: ARRI, Sony, RED, Canon,
Blackmagic Design, Panasonic / LUMIX, DJI. Selecting a body selects its
documented default capture mode. The existing camera position, rotation,
active-camera state, and focal length remain document values owned by the shot.

## Geometry rules

`sensor.physicalWidthMm` and `sensor.physicalHeightMm` describe the physical
imaging surface. `captureModes[].activeWidthMm` and
`captureModes[].activeHeightMm` describe the selected recording window. FOV,
capture aspect, and the Stage camera projection always use the active capture
area. Resolution alone is never used to infer sensor size.

Crop and window modes are explicit records. This keeps a Super 35 window,
large-format crop, S16 window, or delivery-shaped active area from being
mistaken for the full sensor.

## Verification policy

Every FOV-capable mode has a provenance snapshot with manufacturer, source
title, source URL, access date, and verification status. The current dataset is
seeded only with official manufacturer pages or official technical documents.
If a future record cannot verify active geometry, it must be marked
`incomplete` and must not be used as a projection source until its active area
is documented.

Anamorphic squeeze remains separate from the stored physical sensor dimensions,
but it is part of the authoritative optical projection: horizontal FOV uses the
effective horizontal focal behavior `focalLength / squeeze`, while vertical FOV
continues to use the marked focal length. Camera View and export render the
desqueezed display aspect before applying the Delivery Frame crop.
