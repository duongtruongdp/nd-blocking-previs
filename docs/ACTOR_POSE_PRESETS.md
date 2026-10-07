# Actor Pose Presets

Actors support a compact static pose library for blocking and previs. The
selected pose changes the procedural mannequin immediately while the authored
Actor position, heading, height, color, and selection remain independent.

Available presets:

- Standing
- Relaxed
- Walking
- Sitting
- Kneeling
- Crouching
- Lying
- Reaching
- Arms Crossed
- Hands on Hips

Pose selection is shared by the Web and Desktop applications and is stored in
`.ndblock` and `.ndscene` files. Older Actor records without a pose selection
load as Standing. Duplicating or copying an Actor preserves its pose, and pose
changes use the existing undo/redo and dirty-state paths.

This milestone intentionally does not provide custom joint editing, bone
selection, IK, pose keyframes, or pose animation. The pose is a static
blocking choice; Actor movement remains the responsibility of the existing
timeline and root transform tools.
