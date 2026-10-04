# Camera and Framing Model

This is the authoritative V1 camera contract. Milestone 2.5 adds the
framework-independent factual dataset and calculation contracts described in
[CAMERA_DATA_MODEL.md](CAMERA_DATA_MODEL.md) and
[CINEMATOGRAPHY_MATH.md](CINEMATOGRAPHY_MATH.md). Milestone 3A makes the
Camera a real serializable Stage object while keeping Camera View and timeline
animation for later work.

## Filmmaker-facing decisions

The user chooses:

- Camera Format / Sensor
- Lens Type
- Focal Length
- Focus Distance
- Delivery Frame / Aspect Ratio
- Frame Guide

The application derives projection values. Field of view is calculated, not the primary camera control.

## Sensor gate and delivery frame

The sensor gate and delivery frame are separate.

Sensor presets currently provide physical dimensions in millimeters:

- Full Frame — 36 × 24 mm
- Super 35 — 24.89 × 18.66 mm
- Micro Four Thirds — 17.3 × 13 mm
- Academy / 35mm — 21.95 × 16.1 mm
- Custom — explicit width and height in millimeters

The sensor gate determines the base horizontal and vertical field of view for a focal length. The delivery frame determines the visible crop of that gate.

For V1, the delivery frame is a centered crop:

- delivery aspect narrower than the sensor gate: crop the sides;
- delivery aspect wider than the sensor gate: crop the top and bottom;
- matching aspect: show the full gate.

Changing 16:9 to 2.39:1 therefore changes the visible/cropped region only. It does not silently change focal length, sensor dimensions, or camera placement.

Pure helpers return both sensor-gate FOV and delivery-frame FOV so the later Three.js adapter can construct a projection intentionally.

## Rotation and world conventions

- Canonical unit: meters.
- Coordinate system: right-handed.
- Up axis: positive Y.
- World forward: negative Z.
- Camera forward: the camera's local negative Z axis.
- Persisted rotation: Euler radians with explicit `XYZ` order.
- Three.js may use quaternions internally, but quaternion terminology is not part of the product model or UI.

## Lens profiles and anamorphic

Every camera has a lens profile:

- Spherical / 1.0x
- Anamorphic / 1.33x
- Anamorphic / 1.5x
- Anamorphic / 1.8x
- Anamorphic / 2.0x
- Anamorphic / Custom

The persisted factor is numeric and exact; `1.33` is not approximated as `1.3`. Anamorphic state does not alter focal length.

The current pure display calculation treats de-squeeze as horizontal display scaling. Given a final delivery aspect and squeeze factor:

```text
squeezed aspect = delivery aspect / squeeze factor
desqueezed aspect = squeezed aspect × squeeze factor
```

Optical artifacts—flare, oval bokeh, distortion, chromatic aberration, and breathing—are deliberately outside Milestone 0.

## Camera object foundation

The persisted Camera object keeps stable catalog-selection IDs together with a
`resolvedCapture` snapshot. The snapshot records the dataset version, selected
camera/mode/output IDs, and resolved physical active width and height (plus
available image dimensions). The project does not duplicate the camera catalog;
the snapshot exists so future dataset corrections cannot silently change an
authored shot's framing.

New cameras use a generic 36 × 24 mm capture default and do not depend on the
production dataset. The Inspector can then switch to a registry camera and
select its valid dependent sensor mode and recording format. Stale dependent
IDs are invalidated rather than retained.

`frameGuide` is a crop-only presentation choice: Capture, 16:9, 1.85:1,
2.00:1, 2.39:1, or Custom. It does not alter focal length, capture geometry,
camera placement, or the persisted resolved snapshot.

The Stage filmmaking camera is separate from the navigation camera. The
filmmaking camera is derived from the Camera object and looks along local -Z;
the navigation camera only orbits, pans, and zooms the Blocking View and is
never serialized.
