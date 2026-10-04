# Production Character Rig Diagnostics

Milestones 2G–2H-C diagnose the repository-owned Male 01 and Female 01 GLBs at runtime before solving the locked references and the complete reconstructed blocking library.

## Coordinate findings

- Both assets are Y-up and share the same core semantic hierarchy.
- The imported character body axis is derived from `hips → head`; it is approximately vertical in the rest pose.
- The semantic right direction is derived from `shoulder.L → shoulder.R` rather than assumed from a Blender axis.
- The resulting authored forward direction is approximately +Z. Runtime rotates the internal CharacterModel by π around Y so the ND Actor forward convention remains -Z.
- Primary bone directions generally follow each bone's local +Y direction, but the local X/Y/Z frames are rolled differently across the torso, arms, and legs. Raw XYZ pose values therefore cannot be shared as anatomical assumptions.

## What the diagnostic report contains

For every required semantic joint, the development report records the production bone name, parent, local rest position/quaternion/scale, world rest position/quaternion, primary child direction in character space, and the three local axes expressed in character space. Missing semantic joints produce explicit warnings and prevent the production asset from replacing the fallback.

The report also compares corresponding left/right joints. Mirroring is implemented as reflection across the diagnosed character sagittal plane, followed by quaternion reconstruction; it is not an XYZ sign-flip rule. The same operation is available to future authored-pose tooling through `mirrorPoseOffset`. Each solved reference audit additionally captures the actual parent bone, rest-local transform, posed child direction, primary/bend/twist axes, centerline/torso distances, and shoulder-to-elbow/elbow-to-wrist vectors for the arm chain.

## Anatomical pose reconstruction

The runtime generates these production definitions in the current milestone:

- `standing-neutral`: uses anatomical target directions to relax the arm chain down and slightly forward, with feet contact.
- `sitting-neutral`: uses forward/down thigh and lower-leg directions for seated hip and knee geometry, relaxed arms, a pelvis-derived `seat` contact, and calibrated secondary foot support.
- `lying-supine`: applies a diagnosed character-right root rotation so the body becomes horizontal, with relaxed arms, slightly bent/extended legs, and `back` contact.
- `standing-relaxed`, `standing-arms-crossed`, `standing-hands-on-hips`, `standing-weight-shift`, and `standing-attention`: inherit Standing Neutral and apply named semantic blocking intent. Crossed arms are validated by front crossover metrics; Hands on Hips uses waist proximity; Weight Shift requires measurable side asymmetry.
- `sitting-relaxed`, `sitting-forward`, `sitting-back`, `sitting-legs-crossed`, and `sitting-stool`: inherit Sitting Neutral. Legs Crossed validates knee crossover and keeps seat contact without forcing floor contact; Stool uses a raised seat reference and permits hanging feet.

The pipeline is explicitly separated into Rig Diagnostics, Anatomical Pose Intent, Rig Pose Solution, Support Frame, and Contact Solve. Each generated definition uses rest-relative local quaternions internally, while the public pose inventory remains semantic and production-locked. Milestones 2H-B and 2H-C removed the old raw quaternion blocks from the Standing/Sitting variants and the five non-Supine Lying variants; the remaining compatibility descriptors are audited below. All 18 poses passed browser visual review. See [ANATOMICAL_POSE_SOLVER.md](ANATOMICAL_POSE_SOLVER.md) for the solver contract.

## Milestone 2H-C Lying family reconstruction

The five remaining Lying poses now share the locked Supine semantic foundation without sharing a generic contact assumption. Prone establishes anterior/front support; Left Side and Right Side use mirrored lateral support frames and stacked shoulders; Reclined uses posterior-inclined support with measurable torso elevation; Curled uses lateral support with coordinated torso, hip, knee, shoulder, and arm flexion. Contact correction follows the pose solve and translates the internal CharacterModel without changing Actor placement or applying corrective rotations.

Validation is support-frame aware. Universal checks cover finite transforms, chain continuity, dimensions, and severe penetration. Category checks cover horizontal or intentionally inclined torso orientation. Intent checks cover anterior support, lateral shoulder stacking, Reclined elevation, and Curled flexion/compactness. The Pose Calibration diagnostics report Support Orientation, Torso Orientation, Contact Mode, and the relevant pose-specific metrics.

## Milestone 2G.2 standing-arm diagnosis

The disappearing standing arms were caused by shoulder/clavicle rotation, not by a skinning failure. The first standing intent applied the downward arm target to both `shoulder.*` and `upperArm.*`. In the imported hierarchy, the upper-arm origin is an offset child of the shoulder bone. Rotating the shoulder toward the arm direction therefore moved the upper-arm origin inward before the upper-arm quaternion was solved. Male 01 measured an upper-arm origin shift from approximately 0.25 m lateral in rest to 0.11 m in the failed solution; Female 01 showed the same inward pattern at its scale.

The primary rest axis, bend axis, twist axis, left/right character-space mirroring, and rest-relative quaternion conversion were not the root failure. The correction leaves the standing shoulder/clavicle at its restrained rest placement and solves `upperArm.*` and `lowerArm.*` from character-space target directions. This same shoulder-socket separation is now used by Sitting and Lying, with pose-specific arm directions rather than one standing vector copied into every body orientation.

## Milestone 2G.3 sitting reconstruction

The sitting failure was a contact-model failure rather than a missing knee bend. The thigh and lower-leg chains already produced forward knees and plausible flexion, but the first contact pass treated the foot joint origins as the floor. In these assets the visible toe/sole support surface is below the `FOOTL`/`FOOTR` origins, so the joints read as grounded while the skinned feet penetrated the Stage.

The reconstruction now keeps the pelvis as the primary seat reference and derives its seat height from the posed hip-to-support span. It measures each foot's actual skinned support surface from the production foot/toe influences and stores a normalized support offset in the secondary contact metadata. The seat solve uses that support surface for floor calibration without moving the Actor root or introducing a production chair. Sitting validation checks hip-origin knee travel, knee flexion, left/right separation, floor contact after the support offset, torso verticality, finite output, and non-crossing leg structure.

The sitting overlay shows the temporary seat and floor planes, pelvis/seat target, hip origins, knee and ankle targets, and calibrated foot-origin targets above the floor. These are development diagnostics only.

## Milestone 2G.3 lying reconstruction

The lying reference was already mathematically close to horizontal and face-up; the visible problem was support calibration. A fixed spine offset did not account for the posed skinned body's posterior surface. The solver now preserves the Actor's world placement and applies the diagnosed root orientation inside `CharacterModel`, then derives the back contact from the posed deformed bounds. The final contact pass grounds the lowest back/body surface, not the feet.

Lying validation checks a horizontal hips-to-head axis, chest/front direction upward, back direction downward, measured back support distance, and finite output. The overlay shows the longitudinal body axis, chest/front target, back support reference, and floor plane.

## Milestone 2G.4 skeleton reconstruction audit

The 2G.4 audit separates pose shape from contact placement. Validation applies the generated pose, measures the pre-contact skeleton and skinned bounds, and only then allows the runtime contact policy to move the internal CharacterModel. Contact never changes joint rotations.

The imported semantic mapping is usable for both Male 01 and Female 01. The affected chain is explicit and shared by both rigs: `hips → spine → chest → neck → head`, `upperLeg.L/R → lowerLeg.L/R → foot.L/R`, and the relaxed `upperArm.L/R → lowerArm.L/R → hand.L/R` chains. `RigProfile` resolves those semantic IDs to each GLB's actual production bones, including the authored `KNEEL`/`KNEER` intermediates. Runtime `poseAudits` record each semantic ID, actual bone, parent semantic joint, rest/posed positions and directions, quaternion offset, and whether the joint is generated by anatomical intent or inherited rest.

Sitting's remaining structural issue was lower-leg target geometry: the first target produced approximately 69° knee flexion. The reconstructed target now produces approximately 90° flexion while keeping thighs forward, calves descending, the torso upright, and left/right chains symmetric. The seat and calibrated foot support offsets remain separate and are applied only after this pre-contact validation.

Lying's orientation is represented by the generated pose-local root quaternion around the diagnosed character-right axis. The pre-contact signature verifies reduced vertical height, increased longitudinal horizontal extent, horizontal pelvis/chest/head and leg chains, and face-up chest direction. This prevents a grounding offset from making a standing-shaped skeleton appear valid.

Development diagnostics expose PASS/FAIL, torso orientation, pre/post-contact bounds, contact mode, Sitting hip/knee flexion, and Lying torso/body alignment. **Show Pose Targets** is built from the pre-contact solved skeleton; **Show Contact** is added after the final contact solve.

The diagnostic report now records each arm's shoulder origin, upper-arm origin, elbow, wrist, rest directions, local primary/bend/twist axis labels, and character-space bend/twist vectors. Standing validation reports shoulder width, lateral elbow/wrist/midpoint positions, torso-core penetration, and left/right symmetry. It is a deterministic silhouette guard, not collision simulation.

## Milestone 2G.6 supine reference lock

Standing Neutral and Sitting Neutral are protected by transition regression tests and were not changed in this pass. The remaining Male 01 failure was a validation-normalization mismatch: the runtime screenshot showed a horizontal visible character, but the longitudinal ratio was derived primarily from semantic joint extent against a reference-height basis that did not represent the normalized skinned silhouette consistently across rigs. Female 01 happened to clear the same threshold because its raw proportions produced a longer semantic span.

Supine validation now keeps the existing threshold and measures the visible pre-contact bounds projected along the posed hips-to-head longitudinal axis, normalized against the runtime character height. Semantic joint extent remains a secondary signal, so both rigs pass because their readable body silhouettes are genuinely longitudinal rather than because the threshold was lowered. Contact still runs after shape validation and only moves the internal CharacterModel.

The supine intent remains deterministic for both supported rigs through the diagnosed `humanoid-v1` Rig Profile: rest-relative joint solutions preserve shoulder separation, relaxed arms, face-up orientation, extended legs, and back contact. No per-rig exception was necessary for this bug; the correction was in the measurement basis, not a rig-specific visual override. The development panel now reports the longitudinal ratio directly, and the facing-tick is hidden while Pose Calibration diagnostics are active.

## Milestone 2G.5 shoulder-girdle correction

The diagnosed production hierarchy is `shoulder/clavicle → upperArm/socket → lowerArm/elbow → hand/wrist`. The previous Sitting and Lying intent aimed both the clavicle and humerus at the same downward or diagonal direction. Because the upper-arm origin is an offset child of the shoulder bone, that moved the socket inward before the arm was solved. It was a hierarchy/control-role error, not a contact or root-placement error.

The corrected intent separates the controls. Standing Neutral remains protected. Sitting keeps both clavicles in the diagnosed rest frame, then solves upper arms down beside the rib cage and forearms down/slightly forward. Supine keeps plausible shoulder width, abducts the upper arms from the torso, and directs both arm segments toward the feet in the rotated body frame. No contact offset or Actor transform is used to compensate.

Pre-contact validation now records socket shoulder width, clavicle width, shoulder/elbow/wrist centerline distances, upper- and forearm length ratios, shoulder-to-elbow and elbow-to-wrist directions, left/right symmetry, and minimum arm-to-torso clearance. Sitting and Lying fail when the arm chain collapses into the torso or loses its diagnosed proportions. Show Pose Targets draws the clavicle origin, socket, elbow, and wrist chain, plus a centerline, shoulder-width guide, rib reference boundary, and clearance guides; these remain development-only diagnostics.

## Validation and contact

Development validation checks head/pelvis ordering, torso orientation, arm T-pose residue, sitting hip/knee ranges, and lying body alignment. Invalid generated results produce runtime warnings instead of being silently accepted. Contact adjustment moves only the internal CharacterModel; Actor world position, facing, color, character choice, and height remain unchanged.

The small brown/gold geometry near the fallback Actor's feet is the `facing-tick` indicator. It is not part of the imported character assets and is excluded from custom character bounds and contact calculations.

## Male/Female differences

Male 01 contains 67 bones and Female 01 contains 69. Female-only breast bones are optional and are not part of core semantic validity. Both rigs use the same semantic pose definitions and the same diagnosed anatomical conversion path; proportion differences remain in the loaded asset rather than duplicating the pose library.

## Development overlay

With `?poseCalibration=1`, the calibration panel can enable **Show Pose Targets**, **Show Rig**, **Show Joint Axes**, and **Show Contact**. These overlays are runtime diagnostics only and are not part of the normal filmmaking interface or project serialization.
