# Anatomical Pose Solver

Milestone 2G separates pose intent from the production skeleton. The solver is a blocking-pose system, not a general-purpose character editor.

## Runtime path

```text
Imported Character
  → Rig Diagnostics
  → Anatomical Pose Intent
  → Rig Pose Solution
  → Skin Deformation
  → Contact Solve
  → Actor World Placement
```

`ActorDocument.placement` remains the world-level blocking transform. Pose solving and contact adjustment never write to that placement.

## Rig diagnostics

Each loaded GLB is inspected in its rest pose. The diagnostic report records semantic joints, parent relationships, rest-local transforms, rest-world transforms, character-space primary bone directions, and local axes expressed in character space. Character up, right, and forward are derived from the imported rig instead of assumed from Three.js or the asset authoring tool.

The report is the only place that knows production bone names. The solver addresses semantic joints such as `upperArm.L`, `lowerArm.L`, `upperLeg.R`, and `foot.R`.

## Anatomical intent

Intent describes what the body should do in filmmaking terms:

- torso and head flexion, side bend, and twist;
- restrained shoulder-girdle intent and separate upper-arm target directions;
- forearm/elbow target directions;
- hip/thigh, knee/lower-leg, and foot target directions;
- the contact context: feet, seat, or back, with an internal Lying support frame when applicable;
- an optional root rotation for a body orientation such as supine lying.

Direction intent is expressed as coefficients of diagnosed character right, up, and forward. This keeps Male 01 and Female 01 on the same anatomical definition while allowing each rig's measured frames and proportions to solve independently.

## Rig pose solution

For a directional joint, the solver:

1. Reads the joint's diagnosed rest primary direction.
2. Builds the desired character-space direction from the anatomical coefficients.
3. Creates the shortest quaternion aligning the rest direction to the target direction.
4. Applies that alignment to the diagnosed rest-world joint orientation.
5. Converts the desired world orientation into the diagnosed parent-local frame.
6. Stores a rest-relative local quaternion offset in the `PoseDefinition`.

Rotation intent uses axes derived from the character basis and converts the result through the diagnosed rest frame. Canonical authored poses therefore do not depend on guessed Euler-axis signs. Runtime still uses quaternions because the imported rig's local frames are not uniform.

## Reference poses and reconstructed library

The three locked reference poses remain production-facing:

- `standing-neutral`: relaxed arms down with slightly flexed forearms and feet contact;
- `sitting-neutral`: thighs forward/down, lower legs down/forward, arms relaxed, and seat contact at a pelvis reference;
- `lying-supine`: body rotated horizontal around diagnosed character right, arms relaxed, legs extended with a slight bend, and back contact.

They are production semantic definitions generated per Rig Profile. The 18-pose library passed browser visual review; the development calibration overlay remains available only for future controlled diagnostics.

Milestone 2H-B reconstructs the remaining Standing and Sitting definitions from those references rather than reviving raw quaternion constants:

- Standing: Relaxed, Arms Crossed, Hands on Hips, Weight Shift, and Attention inherit Standing Neutral and add explicit arm, torso, head, or weight-bearing intent.
- Sitting: Relaxed, Forward, Back, Legs Crossed, and Stool inherit Sitting Neutral. Legs Crossed expresses knee crossover and releases secondary foot contact; Stool raises the seat reference and also permits feet to hang free.
- Male 01 and Female 01 use the same semantic definitions; the diagnosed rig frames solve the intent independently for each asset.

Milestone 2H-C completes those five Lying variants through a support-frame model separate from pose anatomy:

- Prone uses anterior/front support.
- Left Side and Right Side use mirrored lateral support frames with stacked shoulders and relaxed leg bends.
- Reclined uses posterior-inclined support with measurable torso elevation.
- Curled uses lateral support with coordinated torso, hip, knee, shoulder, and arm flexion.

Support orientation is metadata for diagnostics and contact correction; it does not replace the anatomical pose solve. The legacy Root/Pelvis-only approach was rejected and is not reused to turn a standing body into a Lying pose.

Before contact, the solver produces a shape signature for each reference: bounds, height ratio, longitudinal extent, torso alignment, hip/knee flexion, and chain alignment. Sitting and lying validation uses those signatures to reject standing-like skeletons before any seat, floor, or back translation is applied.

## Contact solve

Contact is solved after pose application and separately from the pose definition:

- standing uses a semantic foot reference with geometry fallback;
- sitting uses the pelvis/hips reference as the primary seat approximation and calibrated skinned foot/toe support offsets as secondary floor contacts;
- lying uses the posed body's deformed support bounds after the selected posterior, anterior, or lateral support frame is established, with a diagnosed spine reference retained for reporting.

The solve moves only the internal `CharacterModel`. It does not change the Actor's world position, facing, height, or selection identity.

The sitting seat height is derived from the reconstructed hip-to-floor-support span. The secondary foot offsets are measured from the visible skinned support vertices, so a foot joint origin is not incorrectly treated as the sole. Lying contact is applied only after the semantic anatomy and support frame are solved; it uses small support translation rather than corrective rotations and does not assume every Lying pose rests on the Supine back surface.

## Validation and limits

Automated validation checks finite quaternions, non-cumulative pose switching, standing arm drop, sitting hip/knee ranges, lying torso alignment, deterministic output, and both production rigs. Pose-specific checks additionally require Arms Crossed forearms to cross in front of the torso, Hands on Hips hands to reach the waist region, Weight Shift to remain asymmetric, Legs Crossed knees to cross the body midline, Prone anterior support, side-lying shoulder stacking, Reclined torso elevation, and Curled hip/knee flexion with reduced spread. Generic relaxed-arm clearance is not used as an artistic requirement for intentional silhouettes. These are regression guards, not proof of artistic quality, anatomy, cloth behavior, or final contact fidelity.

For Standing Neutral specifically, the arm target overlay and validation distinguish shoulder-origin placement from upper-arm direction. The imported rig's shoulder bone is treated as a restrained clavicle/origin; its child upper arm is solved toward the anatomical elbow target. This avoids rotating the shoulder child offset into the torso.

For Sitting Neutral and Lying Supine, the same separation is explicit: the clavicle/shoulder remains in its diagnosed rest frame while the humerus and forearm are solved from the established socket. Sitting uses a relaxed downward arm chain with outward clearance; Supine uses a distinct abducted arm direction that continues toward the feet after the horizontal body rotation. Shoulder width, socket separation, centerline distances, segment-length preservation, symmetry, and arm-to-torso clearance are validated before contact.

`?poseCalibration=1` exposes development-only **Show Pose Targets**, **Show Rig**, **Show Joint Axes**, and **Show Contact** overlays. The target overlay is a visual explanation of the generated anatomical directions; it is not serialized into a project.
