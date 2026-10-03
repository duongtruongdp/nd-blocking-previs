# Blocking Timeline Model

This is the authoritative V1 timeline contract.

## Time representation

Timeline positions are integer frame numbers. The project stores a rational frame rate:

```ts
type FrameRate = {
  numerator: number
  denominator: number
}
```

Examples:

- 24 → `24/1`
- 23.976 → `24000/1001`
- 29.97 → `30000/1001`
- 59.94 → `60000/1001`

Frame-to-seconds conversion happens at the runtime/export boundary. Drop-frame timecode is not part of V1, but the rational timing model leaves room for it later.

## Shot range

Each shot defines:

```text
startFrame <= markIn <= markOut <= endFrame
```

Invalid ranges cannot enter a valid `ProjectDocument`. Mark In and Mark Out represent the active shot playback/export range, not a separate animation system.

## Typed tracks

V1 supports only blocking properties:

- `position` → `Vec3`
- `rotation` → explicit `EulerRotation`
- `focalLengthMm` → number
- `focusDistanceM` → number

`aim` is static in V1. `aimTarget` is intentionally not a keyframed property until camera aim semantics are reviewed alongside camera movement.

Interpolation is deliberately limited to:

- `step` — hold the previous value;
- `linear` — component-wise interpolation for vectors/rotations and scalar interpolation for lens/focus.

Smooth interpolation is omitted because it has no approved mathematical behavior yet.

Keyframes at duplicate frames are invalid in a project file. The pure evaluator remains deterministic for in-memory editing: when duplicate frames are supplied, the last keyframe in source order wins.

## Deterministic evaluation

The future runtime must be able to evaluate a specific frame without depending on wall-clock playback. That same evaluation path should eventually support deterministic frame-by-frame export:

```text
evaluate frame N
render frame N
evaluate frame N+1
render frame N+1
```

No export implementation is included in Milestone 0.
