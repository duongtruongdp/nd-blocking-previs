# Camera and Framing Model

This is the authoritative V1 camera contract. Milestone 2.5A adds the
framework-independent factual dataset and calculation contracts described in
[CAMERA_DATA_MODEL.md](CAMERA_DATA_MODEL.md) and
[CINEMATOGRAPHY_MATH.md](CINEMATOGRAPHY_MATH.md). Camera UI and Stage camera
runtime remain later work.

## Filmmaker-facing decisions

The user chooses:

- Camera Format / Sensor
- Lens Type
- Focal Length
- Focus Distance
- Delivery Frame / Aspect Ratio

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
