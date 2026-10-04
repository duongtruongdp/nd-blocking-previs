# ND Blocking & Previs Product Language

## Product principle

Use filmmaker language in the normal interface. The product should feel like a
place to block actors, place cameras, shape frames, and plan shots—not like a
general-purpose 3D editor or software development tool.

Keep labels short, familiar, and useful while a filmmaker is working quickly.

## Preferred terms

- Actor
- Camera
- Prop
- Light
- Lens
- Focal Length
- Capture Mode
- Recording Format
- Sensor Area
- Capture Ratio
- Frame Guide
- Position
- Height
- Facing Direction
- Pan
- Tilt
- Roll
- Focus Distance
- Shot
- Timeline
- Movement
- Keyframe

## Internal-only terms

These terms may remain in source code, tests, technical documentation, and
development diagnostics, but should not define normal product UI:

- Inspector
- Geometry
- Resolved Capture
- Runtime
- Registry
- Object3D
- Scene Graph
- Node
- Quaternion
- Euler
- Transform Matrix
- Rig Profile
- Joint Axis
- Support Frame
- Contact Solver
- Serialization

## Exceptions

Technical documentation and development diagnostics may use precise engineering
terminology when it improves implementation or debugging. Accessibility labels
and error messages should still describe the filmmaker's action or decision in
plain language whenever possible.

## Manufacturer terminology

Official camera model, capture-mode, and recording-format names are factual
filmmaking terminology. Keep them intact when they help identify the real
camera setup; do not simplify or rename official manufacturer names merely
because they contain technical words.

## Future UI rule

Apply this guide to Camera View, Timeline, Lighting, Save/Open, and Export. A
new control should be named for the filmmaking decision it supports, with
implementation details kept behind the interface.
