# Character Asset Specification

This document defines the authored character assets used by ND Blocking & Previs. The repository now contains licensed Male 01 and Female 01 GLBs, alongside the character pipeline and its procedural resilience fallback.

## Required asset slots

Repository-owned assets should be placed in:

```text
public/assets/characters/
├── male-01.glb
└── female-01.glb
```

The Character Registry owns the stable IDs and public paths. Additional variants can be added as `male-02`, `female-02`, and so on without changing `ActorDocument` or the Inspector architecture.

Do not add downloaded models unless the project has explicit permission to redistribute them. Each committed asset must have a recorded license and redistribution status before it is added to the repository.

## Model requirements

- Format: GLB preferred; glTF is acceptable if the delivery pipeline later packages it consistently.
- Coordinate system: Y-up, compatible with the Stage world.
- Units: normalized so the imported character is 1 unit tall before runtime Actor height scaling.
- Origin: at the standing character's foot-ground contact; the runtime also normalizes imported bounds defensively.
- Forward: the model's local forward must map to the Actor's local forward, documented as negative Z in the Stage.
- Rig: humanoid skeletal hierarchy with a stable semantic mapping.
- Required conceptual joints: hips/pelvis, spine, chest, neck, head, left/right shoulders, upper/lower arms, hands, upper/lower legs, and feet.
- Finger bones: optional.
- Facial rig: not required.
- Textures: optional; a neutral material must work without textures.

Assets should be authored in a neutral standing pose suitable as a base for pose-library transforms. Sitting and lying are pose definitions, not separate character files.

## Practical browser budget

Per character target:

- 15,000–35,000 triangles for the complete visible model.
- One material preferred; two is an acceptable upper target.
- Zero textures preferred; if needed, one 1024px texture set maximum.
- 40–80 bones, with no facial or finger rig required for the initial system.
- No cloth, hair simulation, morph-target system, or animation-only helper geometry.

The goal is readable silhouette and blocking pose at normal Stage distance, not game or photoreal detail. A scene with 20 Actors should remain practical in a browser.

## Runtime behavior

`CharacterAssetLoader` caches each source GLB by Character Registry ID and clones an instance per Actor. Actor color is applied to per-instance material clones, so two Actors using the same character can have different blocking colors. Pose definitions address semantic joints through a Rig Profile and never store Three.js objects in the project file. The current production assets are normalized from their exported bounds and rotated once at the character-model root because inspection shows their authored forward points along +Z; ND Actor forward is -Z.

If an asset is absent, malformed, or cannot load, the Actor stays visible using the procedural fallback. This fallback is resilience behavior only; it is not the intended final character visual.

## Pose root conventions

- Standing: feet rest on the Stage floor when Actor placement Y is zero.
- Sitting: the pose uses a hips/seat reference as primary contact and keeps the visible foot support surfaces close to the Stage floor as secondary contact; no production chair is created.
- Lying: the pose rotates the body from the Actor root convention and uses a back-contact reference; the filmmaker positions it manually on the Stage.

No automatic collision, furniture snapping, or pose keyframing belongs to this milestone.
