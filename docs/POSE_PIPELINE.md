# Character Pose Pipeline

Milestones 2E–2H-C establish the pose boundary, automatic rig analysis, anatomical reference-pose solver, and complete semantic pose library for production characters.

## Canonical pose contract

Each pose is a serializable `PoseDefinition` with:

- a stable pose ID, label, and blocking category;
- `bones` keyed by semantic joints such as `hips`, `spine`, `upperArm.L`, and `foot.R`;
- local quaternion rotation offsets relative to the imported rig rest pose;
- optional local position offsets for authored corrections;
- optional root offset or root rotation;
- grounding metadata: `feet`, `seat`, `body`, or `back`;
- status and metadata identifying whether the definition is temporary, auto-calibrated, or artist-reviewed.

The semantic IDs are the stable contract. Production bone names remain inside the Rig Profile and are never exposed to the filmmaking UI or persisted project documents.

## Rest pose boundary

The imported GLB is normalized and oriented once. Every runtime character instance is diagnosed against its actual skeleton, then captures its local rest transforms. Applying a pose always restores those transforms first, applies the pose offsets, and refreshes the visible bounds. The operation is therefore non-cumulative and safe for Pose A → Pose B → Pose A.

Actor world placement is separate from pose data. Pose application does not change the persisted Actor position, facing, or height. Grounding may move only the internal character model: feet for standing, a hips/seat reference plus calibrated foot support surfaces for sitting, and the posed support surface for lying.

The reference poses are generated from the diagnosed rig through anatomical intent: `standing-neutral`, `sitting-neutral`, and `lying-supine`. Milestone 2H-B reconstructed the Standing and Sitting variants. Milestone 2H-C completes the Lying family with `lying-prone`, `lying-left-side`, `lying-right-side`, `lying-reclined`, and `lying-curled`. Each definition is generated from semantic anatomy and marked `auto-calibrated`, not artist-reviewed. See [ANATOMICAL_POSE_SOLVER.md](ANATOMICAL_POSE_SOLVER.md).

## Authored workflow

The chosen production workflow is:

1. Author or calibrate a blocking pose against the production rig in Blender.
2. Extract the selected semantic joints as rest-relative quaternion offsets, optional position offsets, and grounding metadata.
3. Store the result as a deterministic ND pose definition.
4. Validate it against both Male and Female Rig Profiles before marking it `artist-reviewed`.

GLTF `AnimationClip` data is not the canonical source for this static blocking-pose milestone. Animation clips may be supported later for motion studies, but they do not replace deterministic pose definitions.

## Development calibration

The calibration facility is intentionally query-gated and is not part of the normal Inspector. Open the app with `?poseCalibration=1`, select an Actor, choose a semantic joint, edit local rotation in degrees, and use **Copy Pose JSON**. Changes are runtime-only until the copied definition is reviewed and committed to the authored pose library.

This facility is for rig calibration and authored-pose extraction, not a general-purpose character editor. It exposes only filmmaking-relevant joint labels and never mutates the Actor domain placement.

## Diagnostics

Character loading validates the asset, skinned mesh, skeleton, and required semantic joints before replacing the fallback. Failures remain visible through explicit runtime diagnostics. The runtime refreshes skinned bounds after pose application and after contact movement so selection and grounding do not retain a stale standing-pose box. The small `facing-tick` marker is excluded from those bounds.

The full diagnostic conclusions are recorded in [CHARACTER_RIG_DIAGNOSTICS.md](CHARACTER_RIG_DIAGNOSTICS.md). The optional calibration overlay can show semantic joints, anatomical target directions, current joint axes, and the active contact reference/plane.

The development calibration panel also reports the pre-contact pose validation result, torso orientation, pre/post-contact bounds, contact mode, and pose-specific shape metrics. Upper-body diagnostics include shoulder/socket width, arm-to-torso clearance, and the generated Sitting/Lying arm-chain checks. For Supine, longitudinal plausibility is measured from the normalized runtime reference height and the visible skinned bounds projected onto the posed hips-to-head axis; semantic joint extent remains a secondary signal. This keeps the threshold tied to the readable character silhouette instead of a rig-specific raw-joint scale. This report is intentionally absent from the normal blocking interface.
