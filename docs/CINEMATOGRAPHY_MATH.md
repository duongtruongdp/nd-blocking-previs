# Cinematography Math Foundation

The pure calculation layer lives in `src/math/cinematography.ts`. It has no
React, Three.js, or browser dependency.

## Source facts and derived values

Active aperture dimensions, recorded dimensions, focal length, and supported
rates are source facts. The calculation layer derives capture aspect ratio,
diagonal, FOV, delivery aperture, crop fractions, and subject-distance
coverage. Derived FOV values are never stored as manufacturer facts.

Production camera data may expose several recording outputs for one sensor
mode. Output file dimensions do not replace the active physical aperture used
for aspect ratio, FOV, delivery crop, or coverage calculations.

## Projection and coverage

For a rectilinear pinhole camera:

```text
FOV = 2 × atan(sensor dimension / (2 × focal length))
coverage at distance = distance × sensor dimension / focal length
```

Focal length and active dimensions use millimeters. Subject distance and
physical coverage use meters, with the millimeter ratio cancelling explicitly.
Horizontal, vertical, and diagonal FOV are available independently. Invalid,
zero, negative, NaN, and infinite inputs are rejected.

## Delivery frame

`centeredDeliveryAperture()` returns the effective aperture inside the active
capture area. A narrower delivery ratio crops horizontally; a wider delivery
ratio crops vertically; equal ratios do not crop. The result includes crop
fractions and does not modify focal length or capture geometry.

Delivery-frame FOV is calculated separately from capture FOV. A 2.39:1 crop of
an open-gate capture can therefore reduce usable vertical FOV while the lens
and physical capture remain unchanged.

## Anamorphic geometry

Spherical is represented by a 1.0 squeeze factor. Supported architecture also
accepts 1.33x, 1.5x, 1.8x, 2.0x, and custom positive factors. Squeeze does not
change focal length or physical capture FOV. The math reports physical capture
FOV separately from desqueezed/display geometry; it does not simulate optical
distortion, flare, oval bokeh, breathing, or aberration.

Any future crop/reference calculation must receive an explicit reference
aperture. The helper uses the phrase crop/reference factor and never exposes an
unlabelled generic “crop factor”. Active capture diagonal is only the minimum
geometric rectangle-covering image circle; it is not a lens compatibility
claim.
