# Blocking Runtime

This document records the Milestone 2 Actor/Prop runtime boundary.

## Domain/runtime mapping

The `ProjectDocument` remains authoritative. `ActorDocument` and `PropDocument` are plain serializable values; the Stage keeps a direct registry from entity ID to its runtime proxy root.

```text
ActorDocument / PropDocument
          ↕ stable entity ID
RuntimeRegistry
          ↕
Three.js proxy group and child meshes
```

Compound proxies register every visible child against the same parent entity ID. A raycast against an arm, table leg, chair back, or other child therefore resolves to the Actor or Prop row the filmmaker sees in the Scene panel.

## Actor character runtime

Actors now resolve through the Character Registry. A `CharacterAssetLoader` caches each source GLB by stable character ID and clones a runtime instance for each Actor. Imported models are normalized to the shared Y-up, one-meter reference convention, tinted with per-Actor material clones, and posed through semantic joints supplied by a Rig Profile.

The procedural articulated mannequin remains only as a resilience fallback while repository-owned authored Male/Female GLB assets are unavailable. It is deliberately kept behind the same ActorRoot, pose, color, height, and selection interfaces; it is not presented as the final character system.

Character and pose choices are data-driven. `ActorDocument` stores only `characterId`, `poseId`, color, height, and placement. Meshes, skeletons, animation mixers, loaded GLTF scenes, and materials never enter project serialization. ActorRoot remains the only selectable or transformable scene entity, regardless of whether its visible child is an authored rigged model or the fallback.

The current production asset mapping and calibration are recorded in [CHARACTER_RIG_PROFILE.md](CHARACTER_RIG_PROFILE.md). The loader resolves `/assets/characters/male-01.glb` and `/assets/characters/female-01.glb`, verifies the required semantic joints, clones the source with `SkeletonUtils`, captures each bone's imported local rest transform, and applies canonical pose definitions relative to that rest state. Pose definitions use stable semantic joint IDs, quaternion rotation offsets, optional position offsets, and grounding metadata. Source-specific `KNEE` intermediates are retained; the pose adapter drives them for lower-leg bends.

Static ND pose definitions are the canonical production strategy for this milestone. They are deterministic semantic JSON/TypeScript definitions; GLTF `AnimationClip` data is not the canonical blocking-pose source for these assets. A development-only calibration panel is available during `npm run dev` with `?poseCalibration=1`; production builds ignore the flag and the panel is not mounted in the normal filmmaking UI.

The imported assets' native forward points along +Z. A one-time π Y rotation is applied to the internal CharacterModel child so the Actor's canonical local forward remains -Z. Height and pose ground contact are normalized inside the runtime model; standing references the feet, sitting references the hips/seat plus calibrated visible foot support, and lying supine references the posed back surface. The persisted Actor placement and facing are not rewritten. Selection bounds are refreshed after character, height, pose, and internal contact changes.

Facing continues to be communicated by the character silhouette and feet. The small brown/gold `facing-tick` is the Actor facing-direction indicator created by the fallback ActorRoot adapter. It is hidden unless an Actor is selected or Rotate is active, and custom character bounds/contact traversal excludes it. It is not part of either production GLB, pose normalization, or contact calculations.

## Proxy ownership

`SceneRuntime` owns the registry, proxy groups, TransformControls, selection helper, and render invalidation. `BlockingAssetLibrary` owns reusable geometries and materials. The domain store owns only serializable project state, selection state, and the active blocking tool.

The Stage visualization ground/grid and internal illumination remain runtime infrastructure. A user-created Floor is a real `PropDocument` and is separate from that reference environment.

## Selection flow

1. A Stage pointer hit is raycast against registered Actor/Prop roots.
2. `RuntimeRegistry.resolveHit()` walks the hit object and parents to recover the stable entity ID.
3. The runtime calls the store's selection command.
4. The Scene panel, Inspector, selection box, and transform tool all read the same selection state.
5. Empty Stage clicks clear selection.

Scene-panel selection follows the same store path in the opposite direction.

## Transform flow

Move and Rotate are the only active transform tools. TransformControls is an internal interaction mechanism; the UI exposes only filmmaking tool names.

During a drag, the runtime proxy moves immediately and OrbitControls is disabled. React is not updated on every pointer movement. When the drag ends, the runtime converts the proxy position and XYZ Euler rotation back into a `Placement` and commits one domain command. This leaves a clean future undo/redo boundary.

Inspector edits also use explicit commands. Positions and dimensions are entered in meters; Actor facing and Prop rotation are displayed in degrees and converted to persisted XYZ radians at the boundary. Invalid numeric values are ignored, while practical out-of-range values are clamped by the domain commands.

Moving an Actor or Prop changes only its base placement. No timeline keyframes are created.

## Resource reuse and cleanup

Actor limbs, body parts, and simple Prop forms reuse common geometries. Materials are cached by blocking color. Removing an entity removes only its proxy from the registry and Stage; shared assets remain available for other entities.

When the Stage unmounts, `SceneRuntime` cancels pending frames, detaches controls/listeners, removes registered proxies, disposes runtime geometry/material resources, and disposes the renderer. No runtime object enters project serialization.
