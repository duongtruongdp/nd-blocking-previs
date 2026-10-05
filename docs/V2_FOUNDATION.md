# ND Blocking & Previs V2 Foundation

V2 is a clean Scene Editor application boundary. The existing root `src/` application is V1 legacy/R&D and remains in place for reference; V2 does not refactor or import its runtime.

## Product hierarchy

The portable creative unit is a `SceneDocument`:

```text
SceneDocument
├── metadata
├── stage
├── actors
├── props
├── cameras
├── lights
└── timeline
```

The future desktop-only hierarchy is separate:

```text
Project Library → ProjectDocument → SceneDocument[]
```

Web has no Project Library. Web and Desktop will exchange individual scenes through `.ndscene`; Desktop projects will use `.ndblock`.

## Platform boundary

V2 shared editor code depends on a small `PlatformAdapter` seam. The current adapter identifies the Web platform only. Tauri 2 will provide a future Desktop adapter without entering Scene Editor components. No filesystem, cloud, backend, authentication, or export capability is implemented in V2.0.

## Runtime foundation

The current Stage proof uses the isolated DEMO-derived `StageEngine` in `v2/src/stage-engine/`. It owns the production V2 canvas, Three.js scene, Ground, Grid, Cube, Sphere, Cylinder, direct raycasting, pointer lifecycle, orbit/pan/zoom, and Move/Rotate gizmos. React is limited to mounting the engine, sending `setTool('select' | 'move' | 'rotate')`, and receiving final selection IDs. The older `V2StageRuntime` remains in the tree for comparison and is not mounted by the V2 Stage.

The proof scene deliberately excludes Actors, Cameras, SceneDocument transform synchronization, history, and timeline state. Those are future additions through the same entity boundary after browser acceptance.

Mouse input is left-drag orbit, right-drag pan, and wheel zoom. The existing browser trackpad path treats two-finger scroll as pan and pinch as zoom. Browser Pointer/Wheel events do not reliably expose trackpad finger counts; a macOS three-finger drag emitted as an ordinary mouse drag cannot be distinguished from one-finger orbit in the web runtime. Native Tauri gesture integration is the future place to investigate that distinction.

Blocking View navigation is represented by `target`, `distance`, `azimuth`, and `polar`. The camera transform is derived from that state. A three-pixel pointer threshold distinguishes selection from orbit; `F` frames the selected entity using its bounds and camera field of view, while `Home` restores deterministic Stage defaults. The application owns one authoritative `selectedEntityId`; the runtime mirrors it only for visual highlighting and diagnostics.

V2.2 adds a serializable `ActorDocument` and `ActorPose` plus a dedicated `ProceduralActorRuntime`. The runtime builds an `ActorRoot` with explicit pelvis, torso, shoulder, elbow, hip, knee, ankle, neck, and head groups. Its canonical body proportions are centralized in `v2/src/runtime/actor/proportions.ts`; `+Y` is up, ActorRoot `Y = 0` grounds the feet, and Actor forward is `-Z`. The visible body meshes carry the Actor entity ID directly for the accepted V2.1 picker. No GLB, imported skeleton, SkinnedMesh, IK, or animation system is involved.

V2.3 adds a custom `V2TransformGizmo` without `TransformControls`. The existing Stage canvas remains the only pointer surface. Gizmo picking has priority over selection and navigation; move handles use ray/interaction-plane intersections projected onto world axes or the ground XZ plane, while Rotate uses signed ring angles around world X and Y. Actor moves are constrained to X/Z with Y fixed at zero; Actor X rotation is whole-character pitch and Y rotation remains heading. Transform documents synchronize at `transformEnd`; `transformStart`, `transformChange`, and `transformEnd` events form the future undo/timeline seam without adding either system now.

## Procedural character decision

Future V2 characters are procedural Three.js structures with explicit semantic joints. They will not depend on GLB assets, imported skeletons, skinning, or bone-name mapping. Standing, sitting, walking, running, crouching, kneeling, lying, and custom pose support are future milestones.

## Camera and timeline direction

Future camera work keeps Physical Sensor, Capture Mode, Delivery Frame, lens, focal length, anamorphic squeeze, and frame rate as distinct domains. The future canonical timeline uses integer frames and rational frame rates. Playback, keyframes, and preview-video export are not part of V2.0.

## UI design system

V2 uses semantic light Soft UI tokens in `v2/src/styles/tokens.css`: cool lavender background, raised white surfaces, inset controls, indigo accent, restrained shadows, rounded panels, generous spacing, and filmmaker terminology. The UI avoids the dense dark V1 workstation treatment and keeps technical runtime terms out of the product surface.

## Milestone gates

- **V2.0 — Foundation:** product shell, SceneDocument seam, platform seam, empty Stage, future navigation state, timeline shell.
- **V2.1 — Stage Interaction:** direct selection, empty clear, orbit, pan, zoom, framing/reset, and the three-Prop interaction test scene. Automated checks pass; manual browser acceptance remains separate.
- **V2.2 — Procedural Character Foundation:** add Actor flow, canonical neutral mannequin, explicit pose-ready hierarchy, serializable Standing pose, direct visible-mesh picking, Actor Inspector, and disposal. No transform editing, additional poses, camera, or animation.
- **V2.3 — Transform Tools Foundation:** Select, Move, Rotate, custom gizmo picking, Actor ground movement, Actor X pitch/Y heading rotation, Prop transforms, Inspector feedback, and transform lifecycle seams. No Scale, pose library, timeline, or camera work.
- **Later:** procedural actors, camera engine/data, timeline evaluation, scene load/export, preview video, and Tauri Desktop shell.

V2.1 must pass before character, camera, timeline, or desktop feature work begins.
