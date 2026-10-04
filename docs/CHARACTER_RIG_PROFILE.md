# Production Humanoid Rig Profile

The current production assets were inspected with the existing `GLTFLoader` before runtime calibration.

## Asset inspection

| Asset | Size | Root | Meshes | Skinned meshes | Materials | Skeletons | Bones | Clips |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `male-01.glb` | 531 KB | `BASEMESH_ARMATURE_MALE` | 1 | 1 | 1 | 1 | 67 | 0 |
| `female-01.glb` | 520 KB | `BASEMESH_ARMATURE_FEMALE` | 1 | 1 | 1 | 1 | 69 | 0 |

Both assets load successfully. Each has one `MeshStandardMaterial` named `BASEMESH MATERIAL `, no texture map, and a bound `SkinnedMesh`. The Female asset adds `BREASTL` and `BREASTR`; these are retained and ignored by the V1 semantic pose layer. Finger and handler bones are also retained.

Native imported bounds are not treated as project stature:

- Male: approximately `2.005 × 1.918 × 0.368` units, min Y `-1.263`, max Y `0.655`.
- Female: approximately `1.634 × 1.700 × 0.298` units, min Y `-1.094`, max Y `0.606`.

These differences are why runtime normalization is required before applying Actor Height.

## Semantic mapping

The profile maps both assets to the same semantic joints:

| Semantic joint | Production bone |
| --- | --- |
| hips | `PELVIS_CENTRAL` |
| spine | `BELLY` |
| chest | `CHEST_CENTRAL` |
| neck | `NECK` |
| head | `HEAD` |
| shoulder.L / shoulder.R | `SHOULDERL` / `SHOULDERR` |
| upperArm.L / upperArm.R | `ARML` / `ARMR` |
| lowerArm.L / lowerArm.R | `FOREARML` / `FOREARMR` |
| hand.L / hand.R | `HAND_MAINL` / `HAND_MAINR` |
| upperLeg.L / upperLeg.R | `THIGHL` / `THIGHR` |
| lowerLeg.L / lowerLeg.R | `CALFL` / `CALFR` |
| foot.L / foot.R | `FOOTL` / `FOOTR` |

The authored hierarchy is not flattened. For pose driving, lower-leg offsets target the intermediate `KNEEL`/`KNEER` joints because they produce the expected knee bend while preserving the `THIGH → KNEE → CALF` hierarchy. The semantic layer remains independent of those source names.

## Rest pose and pose offsets

The imported local bone transforms are the immutable rest pose for the runtime instance. They are captured once after the asset has been normalized and oriented, then restored before every pose application. The pose library stores local, rest-relative quaternion rotation offsets and optional local position offsets. Each offset is multiplied onto the imported rest quaternion; ActorRoot placement is never part of the pose definition. This makes pose switching deterministic and prevents Pose A → Pose B → Pose A from accumulating transforms.

The 18 stable library descriptors are production semantic definitions with stable IDs and compatibility data for older project files. Runtime reconstruction resolves all 18 as production definitions for both character assets. The shared definitions are not character-specific quaternion dumps: each Rig Profile adapts the semantic intent to the imported proportions and rest frames. Standing Neutral keeps the imported shoulder/clavicle origin restrained and solves the upper-arm/forearm chain from anatomical directions; this prevents the shoulder child offset from collapsing the arm into the torso. Lying variants additionally carry an internal support-frame value so contact semantics do not assume Supine posterior support. All 18 poses passed browser visual review.

## Coordinate, facing, and contact calibration

The GLB scenes are Y-up after import. Inspection of the asymmetric head/face depth shows the authored forward points along +Z. The character-model child is therefore rotated `π` around local Y once, making its forward direction match ND Blocking & Previs local -Z. Actor domain rotation remains untouched.

The model is normalized from actual imported bounds to a one-meter reference height, centered horizontally, and lifted so its lowest geometry is at local Y zero. Actor Height then scales the ActorRoot in meters. After each static pose is applied, grounding metadata controls the internal character model's local Y: standing uses a feet reference, sitting uses a hips/seat reference, and Lying uses a support-frame-aware body reference. The persisted Actor placement Y is never mutated. Sitting and lying remain manually placeable relative to furniture and the Stage; no snapping or collision is performed.

## Materials and fallback

The production assets have one untextured standard material each. A cloned material is created per Actor instance and tinted from the Actor color, so shared source geometry and materials remain immutable. If loading, parsing, or required semantic-joint validation fails, the runtime retains the procedural mannequin and records a diagnostic reason; it never creates a partially posed production character.
