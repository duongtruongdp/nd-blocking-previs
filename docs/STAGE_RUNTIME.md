# Milestone 1 Stage Runtime

This document records the Stage-specific decisions introduced by Milestone 1.

## Boundary

`SceneRuntime` owns the non-serializable Blocking View environment:

- Three.js scene
- WebGL renderer
- navigation camera
- deterministic Blocking View navigation state
- resize observation
- render scheduling
- internal ground, grid, and illumination
- serializable Camera object proxies and finite frustum guides
- disposal

The navigation camera is an editor viewpoint only. It is not a `CameraDocument`, is not part of selection, and is never written to `.ndblock` project data.

Each filmmaking Camera is a separate registered Stage object. Its visible proxy
is a lightweight, manufacturer-independent cinema-camera symbol assembled from
reused primitives: graphite body and lightly inset rear module, front-to-back
top handle, stepped lens, front glass, shallow matte-box frame, and a few large
side details. It is deliberately a polished previs prop rather than a branded
camera model or a photoreal asset.

The proxy also contains a lens-aligned optical reference and finite frustum guide.
The guide projection is derived from the CameraDocument's resolved active
sensor dimensions and focal length; it is not an infinite line or a hardcoded
field of view. Its origin is placed at the visual lens front. The guide is
shown for the selected Camera in Blocking View and is removed with the Camera.
Selection bounds include the visible body, lens, matte box, and handle, while
excluding the optical reference and frustum guide helpers.

Camera height is the CameraDocument world-Y placement value. Pan, Tilt, and
Roll are displayed in degrees at the Inspector boundary and stored as XYZ
Euler radians. The filmmaking camera looks along local negative Z; this
convention is independent of the navigation camera controls.

## Camera View

Camera View is a read-only render adapter alongside the StageEngine viewport,
not a second interaction surface. Blocking View continues to use the frozen
StageEngine editor camera and interaction state; Camera View renders through the
selected filmmaking Camera's production runtime camera in a separate renderer
and scene adapter. Switching modes never changes the editor camera position,
navigation state, or transform tools.

The runtime projection uses the CameraDocument's resolved active capture width
and height with the stored focal length. Vertical FOV remains the physical
capture FOV. The shared camera projection helper applies the marked squeeze
only to horizontal optical coverage (`focalLength / squeeze`), then exposes the
desqueezed display aspect to the runtime camera. The runtime camera's viewport
is centered with scissor rendering, so letterboxing and pillarboxing never
stretch the image.

Frame Guide is a centered delivery overlay, not a replacement for capture
geometry. Capture leaves the full desqueezed image visible. A delivery guide
uses the existing centered-aperture calculation and subtly shades the area
outside the selected 16:9, 1.85:1, 2.00:1, 2.39:1, or Custom frame while
leaving that captured image visible for Open Gate composition.

Camera View hides the viewed Camera's visible proxy, all Camera FOV helpers,
selection bounds, facing indicators, pose diagnostics, and editor transform
controls. The Stage ground and grid remain part of the read-only previs image.
Other physical Camera proxies remain available in Blocking View. Entity changes,
Camera setting changes, mode switches, and resize events update the separate
camera-view adapter without mutating StageEngine navigation state.

## Direct Stage interaction

Blocking View also provides a Stage-only View Cube in the upper-right of the
viewport. The cube is a compact DOM/CSS orientation widget with six explicit
face buttons; it does not use WebGL scene geometry or raycasting. Its pointer
hit area is limited to the widget, and events stop there rather than reaching
Stage selection. It is navigation UI, not a Scene entity: it is never
registered, serialized, included in selection bounds, or shown in Camera View.
Its direction mapping follows the established Y-up Stage convention: FRONT is
the Actor/Camera +Z side because filmmaking subjects face local -Z; BACK is
-Z, RIGHT is +X, LEFT is -X, TOP is +Y, and BOTTOM is -Y.

Clicking a face, edge, or corner preserves the current navigation target and working
distance, then snaps the Blocking View to one of 26 directions. Hovering a
zone uses a restrained ND/gold highlight. TOP and BOTTOM use a stable
near-vertical orientation so repeated plan-view clicks do not accumulate a
roll. Dragging the cube delegates to the same Blocking View azimuth/polar
navigation state as a Stage orbit.
Home frames the useful Stage content, falling back to the default perspective
navigation view when the Stage is empty. These
operations affect only the editor navigation camera, never project data or
filmmaking Camera state.

Blocking View uses one runtime interaction path. A pointer hit is resolved
from any visible child of an Actor, Prop, or Camera back to its registered
filmmaking subject. Grid, ground, FOV, facing, selection, transform, and
diagnostic helpers are filtered before ownership is resolved, so helpers cannot
become selected subjects. Camera View is read-only and does not forward
pointers into StageEngine.

`SceneRuntime` owns one Blocking View navigation state: target, distance,
azimuth, and polar angle. The PerspectiveCamera transform is derived from
those values after every navigation change; camera position and any secondary
pivot are never independent sources of truth. A 5 CSS-pixel Stage gesture
threshold keeps a left press pending as a click and promotes larger movement
to orbit. Selection is performed once on `pointerup` for an unmoved left
gesture, so there is no competing native canvas `click` selection path.
Empty clicks clear selection. Left drags change only azimuth/polar, right
drags change only the navigation target using camera-space right/up vectors,
and wheel input changes only multiplicative distance. All three preserve the
current selection. Move and Rotate use the existing TransformControls path for
Actors, Props, and Cameras; transform interaction has priority and cannot
fall through to orbit or selection. A development-only `?interactionDebug=1`
readout reports gesture, button, movement, NDC, raw/selectable hits, and
resolved subject for live audit.

Camera View is locked to the active Camera's capture image. The viewed Camera
proxy and its guides remain hidden. The image is rendered by the production
camera in the separate read-only adapter; selection and transform controls are
intentionally unavailable from inside that Camera's own image.

React mounts `SceneRuntime` through the `Stage` component and only owns the mount element and user-facing failure state. Three.js objects are not placed in React state.

## V2.10E openable Windows

Windows remain serializable `OpeningDocument` records with a backward-compatible
`hingeSide` (left/right) and `openAngle` in degrees. New and normalized legacy
Windows default to a left hinge and 0 degrees; Window angles are bounded to the
0–90 degree editorial range. The runtime builds a fixed outer frame and a
separate sash group whose local vertical Y pivot is placed on the selected
hinge. Glass and the sash frame rotate with that pivot, while the wall aperture
continues to use only the Window's dimensions, sill, and wall placement.

Open Angle is a scalar Timeline property using the existing keyframe and
evaluation path. Blocking View, Camera View/Preview, still capture, and video
export all consume the evaluated Opening document, so a Window opens in the
same frame everywhere without a second animation system. Changing only
`openAngle` updates the sash in place and does not rebuild the Wall; changing
the hinge side or Window construction values may rebuild the lightweight
Opening visual. Clipboard, duplication, history, and scene/project
persistence keep the hinge and angle as plain data, never Three.js objects.

## Rendering strategy

### V2 Camera Stage Representation

V2 Camera is represented by two runtime concerns: a selectable generic
procedural cinema-camera proxy for Blocking View, and a production
`PerspectiveCamera` attached at the same transform for Camera View. The proxy
uses a compact body, top handle, stepped lens, matte-box frame, and restrained
side controls; it is manufacturer-independent and is never replaced when the
Camera Model changes.

The filmmaking Camera forward axis is `-Z`. Capture projection uses the
selected mode's active physical width and height, not merely the sensor label
or recording resolution. Camera View uses a separate render adapter with a
centered capture rectangle, preserves Blocking View navigation state, and
overlays the selected Delivery Frame as a lightweight DOM guide. Camera View
has no editing controls inside the image and does not serialize Three.js
objects.

Camera proxy geometry and materials are disposed with the Stage runtime. The
runtime keeps the camera document, proxy, production camera, and active-camera
selection as separate concerns so multiple Cameras can coexist without shared
transform or projection state.

### V2.7A capture and anamorphic projection

The capture database is a per-camera, per-image-window dataset with official
provenance. Capture modes describe physical active area and recording raster;
codec variants stay as mode metadata. Sony FX5 monitor desqueeze factors are
stored as optional camera metadata, while lens squeeze remains a separate shot
property. Blocking FOV guides, Camera View, and video export all consume the
same `cameraProjectionForDocument` result, so a 2x anamorphic lens widens
horizontal coverage and display aspect without changing vertical FOV or sensor
dimensions. Delivery crop is applied after desqueeze.

### V2.7B multi-frame guides

Camera View keeps the Delivery Frame as the primary warm outline and can show
multiple additional Frame Guides at the same time. Each guide is stored on its
own CameraDocument as plain serializable data; no Three.js helper is persisted
and no guide collection is shared between Cameras. The Inspector supports the
Cinema/Broadcast presets, Social/Digital presets, custom decimal aspects,
visibility, line style, custom `#RRGGBB` color, opacity, line weight, safe
margin, and an optional selected-guide outside shade.

The overlay uses the displayed image rectangle already established by Camera
View. Delivery and Frame Guides both call the same pure normalized
`fitAspectInsideSource` calculation, so a matching Delivery and Guide aspect
share exactly the same centered rectangle. Anamorphic shots calculate against
the desqueezed display aspect, not the physical sensor aspect. Guides do not
alter the production camera, FOV, capture crop, Delivery Frame, timeline, or
preview export. They are not shown in Blocking View and are never burned into
exported video. Guide edits are committed through the existing camera
document/history update path.

## V2.8 portable SceneDocument files

The V2 Web shell saves and loads a versioned `.ndscene` JSON envelope. The
portable file contains only creative SceneDocument data; StageEngine objects,
Three.js state, selection, editor navigation, undo/redo history, playback
state, and export state are reconstructed or reset at the application boundary.
Loading validates the envelope, migrates supported older versions, clears the
history baseline, clears selection, and reconciles existing Stage entities
against the loaded Actors, Props, and Cameras without changing StageEngine
interaction algorithms. Browser download and file-picker behavior remain in
the Web shell so future desktop adapters can reuse the serializer.

## V2.8A Timeline UX and Prop animation

Timeline rows are grouped by animated entity while the toolbar and ruler stay
outside the vertically scrollable track viewport. Disclosure state is local
editor state and is not part of SceneDocument. Props use the same Position and
Rotation Timeline tracks and evaluator as Actors and Cameras; the evaluated
values feed Blocking View, Camera View, and the existing export renderer.
StageEngine interaction algorithms remain unchanged.

The empty Stage uses invalidate-on-demand rendering. A frame is requested when:

- the Stage is first initialized;
- the Stage container changes size;
- Blocking View orbit, pan, or zoom changes the view;
- a future runtime owner requests a scene update.

`SceneRuntime.setContinuousRendering(true)` is the reserved seam for future playback. Milestone 1 does not keep an idle 60fps loop running because the Stage has no animated content yet.

Blocking View navigation is rendered on demand after state changes. No idle
OrbitControls damping loop is used.

## Resize strategy

`ResizeObserver` watches the actual Stage container. The renderer size and navigation-camera projection update from the container's width and height. A window resize fallback is retained for browsers without `ResizeObserver`.

The renderer is not recreated when the layout changes.

## Pixel-ratio policy

The renderer uses the browser's device pixel ratio with a maximum of `2`. This preserves normal-density rendering on standard displays while preventing very high-density MacBook Retina displays from multiplying the Stage buffer without bound. The policy is isolated in `src/runtime/renderPolicy.ts` so adaptive quality can be added later.

## Environment

The Stage environment uses a finite 24-meter ground plane, a subtle 20-meter reference grid, and neutral internal illumination. This baseline illumination is visualization infrastructure only. User-authored Sun records are separate serializable light entities and are added on top of the baseline when present.

## Failure and disposal

Renderer initialization errors are logged for development and translated into a product-facing `Stage unavailable` message. Raw browser/WebGL diagnostics are not shown in the normal UI.

On unmount, the runtime cancels pending frames, removes listeners and observers,
disposes transform controls, disposes geometry/materials, disposes the renderer,
and removes its canvas.

## V2.UI1 workspace resizing

The V2 editor owns Timeline panel height as transient workspace state. A small
horizontal handle sits between the Stage/Inspector row and Timeline; its
bounded drag changes CSS grid allocation only. Stage and Camera View continue
through the existing container `ResizeObserver`, so the renderer and camera
projection are resized in place. The Timeline toolbar and frame ruler remain
fixed while only its track viewport scrolls. No workspace dimensions or
collapse state are part of `SceneDocument` or `.ndscene` serialization.

## V2.9 Project layer

The Web shell now keeps one `ProjectDocument` above the active
`SceneDocument`. Only the active Scene is reconciled into Stage runtime
objects; inactive Scenes remain plain serializable documents, so switching
among many Scenes does not create multiple StageEngines, renderers, or
playback loops. A Scene switch clears selection and playback, resets the
active Scene history baseline, and restores that Scene's current frame and
active Camera from its own document.

`.ndblock` is a versioned JSON envelope containing the Project metadata and
embedded SceneDocuments. Its platform-neutral serializer validates Project
identity, non-empty unique Scene IDs, active-scene resolution, and every
embedded Scene through the existing `.ndscene` validator. Project structure
undo is intentionally separate from Scene editing undo. Scene duplication
deep-copies and remaps entity, Frame Guide, Track, Keyframe, and active Camera
IDs. `.ndscene` import adds a Scene to the current Project; individual Scene
export remains available and does not clear Project dirty state.

## V2.10 Scenic runtime

Scenic Props are procedural proxy assemblies created from inexpensive Three.js
primitives. The same visual definitions feed Blocking View, Camera View, and
video export, while only Blocking View registers selectable editor helpers.
Walls and Door/Window Openings are registered through the existing
`StageEngine.addEntity` boundary with their own serializable records; no
boolean wall operation or external model loading is introduced. Door panels
use a hinge-side child pivot and read their swing from the evaluated
`openAngle` property.

Sun records create a directional light from azimuth/elevation, intensity, and
color. The Blocking View helper sits on a fixed editor sky radius and is
selectable; its drag is converted back into Direction/Height at the application
transform boundary, while the serializable Sun record remains authoritative.
The helper is omitted from Camera View and export. Runtime resources are owned
by the scenic visual adapter and disposed when the entity is removed or its
active runtime is destroyed.

## V2.10A appearance and scenic interaction

Actors, Props, Walls, Doors, Windows, and editor Camera proxies have
independent serializable colors. Procedural runtime materials are owned per
entity, so changing one object does not tint another. Camera proxy color is
editor metadata only and cannot alter lens projection, Camera View, or export.

The Add menu uses one lightweight inline SVG icon vocabulary for Scenes,
Actors, Cameras, Props, Architecture, and Sun. Delete/Backspace and Cmd/Ctrl+D
route through the existing document/history actions and are ignored while a
text, select, or numeric field is focused. The procedural Car, Bicycle, and
Motorbike assemblies are shared by Blocking View, Camera View, and export.

## V2.10B vehicles and Scale

Vehicle proxies are procedural, low-cost scenic assemblies shared by Blocking
View, Camera View, and export. Their convention is +Y up, -Z forward, length
on Z, width on X, and wheel axles on X. Bicycle uses two wheels, hubs, an
open triangulated frame, fork, saddle, and handlebar. Motorbike uses two
wheels, fork, frame, engine, tank, seat, tail, cowl, and handlebar. Car keeps
a compact body/cabin proxy with four correctly oriented wheels. Roots remain
at Y=0 and wheel geometry is offset so tires meet the Stage floor.

Primitive Props expose a Scale triplet in the document model and details
panel. Missing scale in older files resolves to [1, 1, 1]. Camera View and
export consume the same scaled scenic runtime. Scale is intentionally not a
timeline property. The StageEngine Scale mode is isolated from Move/Rotate:
screen-projected axis handles calculate a multiplicative factor from the
drag-start scale, while the center handle or Shift uses that same factor on
all three components. Values clamp from 0.05 to 100. A pointer gesture calls
the existing transform-start/transform-end boundary once, so one drag creates
one history entry. Scale handles are only registered for primitive Props;
Actors, Cameras, Sun, Walls, Openings, and scenic furniture remain
unsupported.

## V2.10C wall drawing and attached openings

The Car visual is a lightweight three-part silhouette: lower body, upper
cabin, and four dark wheels. Bicycle remains frozen from V2.10B and Motorbike
is unchanged. No external scenic assets or boolean operations are used.

Blocking View creates walls through `WallDrawingController`, which adds a
non-selectable translucent preview overlay and asks StageEngine only for a
ground-plane point. A segment is committed on the second left click; chained
segments start at the previous endpoint. Right-drag remains available for
StageEngine pan, and Escape/Enter cancels the temporary placement mode. Grid
and angle snapping are placement conveniences only.

`wallMath.ts` stores no runtime state. It derives wall endpoints from the
wall's center, length, and Y rotation, then provides projection, tangent,
normal, clamped opening offsets, and nearest-wall candidates. An attached
OpeningDocument stores `wallId` and `offsetAlongWallMeters`; its world
position is reconstructed with a small face offset and its rotation follows
the wall while preserving sill height and hinge metadata. Moving, rotating,
or resizing a wall recomputes attached openings. Moving an opening outside
the snap threshold clears the relation. This is a serializable relationship,
not a mesh cut.

The StageEngine additions are limited to overlay registration, ground-point
sampling, snap-highlight forwarding, transform-preview notification, and a
public render invalidation seam for the drawing overlay. Existing Move,
Rotate, Scale, orbit, pan, and trackpad algorithms are not rewritten.

## V2.10D through-wall apertures

Wall openings are generated procedurally from semantic documents. The pure
`wallApertures.ts` layer maps each attached Opening into Wall-local coordinates:
U runs from the Wall start endpoint to its end, V runs from the ground to the
Wall height, and W is the authored Wall thickness. A Door occupies V=0 through
its clamped height; a Window occupies its clamped sill-to-top range. Horizontal
boundaries are partitioned, overlapping vertical ranges are unioned, and the
remaining solid rectangles are extruded through the full W dimension.

The renderer creates those rectangles as lightweight Wall section boxes. No
CSG, boolean library, aperture records, or geometry payloads are persisted.
Every section carries the parent Wall `entityId`, so picking a visible section
selects the Wall and provides one transform. Door frames/leaves and Window
frames/glass remain separate Opening visuals; changing a Door's swing rotates
only its leaf. Geometry signatures rebuild only Walls whose construction or
attached-opening aperture data changed. The same derived sections are used by
Blocking View, Camera View, still capture, and video export, and resources are
disposed when a rebuilt or removed runtime is replaced.

## V2.10C3 Camera View overlay layout

The Camera View DOM overlay has three independent zones. Camera Status stays
at the viewport top-left in a compact dark translucent badge; Delivery and
Frame Guide labels are positioned against their own computed rectangles; and
still-capture controls remain top-right with pointer events enabled. Labels
are informational and do not intercept the stage. A bounded layout helper
tries opposite-edge and vertical-stack placements when labels collide or
intersect the Camera Status area. The helper is driven by the Camera View
container width, not the browser viewport.

The small Blocking View Camera Preview uses the same separation with a shorter
`Camera · focal length` status line. Delivery and guide lines remain visible;
guide text is omitted at compact monitor widths. These are DOM monitor
overlays only. The existing still renderer continues to output clean frames
unless its deliberate Include Guides option is enabled.

## Camera still capture and Blocking View monitor

`CameraViewRuntime` remains the authoritative production scene adapter for
Camera View. It now supports a PNG still path that renders the current
evaluated production Camera into an offscreen canvas, crops with the shared
Delivery dimension/crop helpers, and optionally paints the Delivery Frame and
enabled Frame Guides. Resolution choices are 1280, 1920, and 2560 pixels wide;
height is derived from the active Delivery Frame. The current active Camera
and Timeline frame determine the capture, and the action creates no document
history or dirty-state change.

Blocking View's Camera Preview uses the same CameraViewRuntime scene and
production camera with a lightweight secondary canvas renderer. Its monitor
is a bottom-right UI overlay with the active Delivery aspect, enabled guide
overlays, and a compact Camera/focal-length label. It is not registered with
StageEngine and cannot affect picking. During StageEngine transform previews,
CameraViewRuntime applies transient Actor, Prop, Wall, Opening, Sun, and
Camera updates so Camera Move/Rotate and blocking changes are visible live;
the next evaluated document sync remains authoritative. Preview visibility is
session-only and is intentionally absent from SceneDocument serialization.

## V2.10C4 compact Camera Preview overlay

The small Blocking View Camera Preview reserves a simple top strip: the active
Camera name and focal length sit in a pointer-transparent dark badge at the
top-left, while the close control has its own top-right circular hit area.
Only that camera badge is textual preview metadata. Delivery and Frame Guide
labels are omitted at every compact-preview width; their mathematically
derived borders remain visible. Full Camera View retains its richer Camera
status, Delivery, and Frame Guide overlay behavior. Monitor UI remains
excluded from still and video output.

## V2.10C5 single Camera View info box

Full Camera View has one authoritative Camera metadata box at the top-left.
It contains only the focal length/model line and the capture-mode line, such
as `35mm · ALEXA 35 Xtreme` and `Open Gate 4.6K`. The general Stage header is
not mounted in Camera View, so it cannot introduce a second active-Camera name
behind the box. Delivery and Frame Guide labels remain owned by their existing
frame overlays, and the compact Blocking View Camera Preview is unchanged.

## V2.UI2 Deep Blue visual system

V2 UI polish uses a centralized deep-blue semantic palette in
`v2/src/styles/tokens.css`. Primary actions, selected rows, View and tool
states, focus rings, Camera badges, timeline playhead/keyframes/range, and
technical FOV helpers use the same blue family. Surfaces and Soft UI shadows
remain light, cool-neutral, and layout dimensions are unchanged. Delivery and
custom Frame Guide colors remain composition data, while red danger, green
success, amber Sun/selection cues, and transform-axis colors retain their
semantic meaning. Actor, Prop, Wall, Opening, and other creative entity colors
are still read from Scene documents and are not overwritten by the UI theme.

The FOV helper remains derived from the existing camera projection and only
changes its technical blue presentation. Camera View keeps its neutral dark
monitor; its Capture Frame action uses the deep-blue control treatment while
warm Delivery overlays remain distinct. No StageEngine, camera math, timeline
evaluation, export, persistence, or interaction code is involved in this
visual system pass.

## V2.UI2A Header and Project workspace cleanup

The compact Header is the sole Project rename surface. The brand reads
`[ND] Blocking & Previs`; the Project name is an inline field with Enter and
blur commit, Escape cancel, empty-name protection, truncation for long names,
and the existing dirty-state callback. New, Load, and Save remain secondary
actions with deep-blue hover, pressed, and focus states, while Export remains
the primary action. The left Workspace panel no longer duplicates the Project
name card and begins with Scenes. ProjectDocument, persistence, scene switching,
file confirmation, and global text-input shortcut guards are unchanged.

## V2.UI2B Dynamic Project name width

The Header Project context is content-sized for ordinary names, so short names
stay close to the `/ Scene` context. The editable name uses a character-sized
input with a responsive maximum; long names remain ellipsized and cannot push
the file, View, or Export actions out of the Header. Flexible space remains
between the Project context and right-side actions. Rename commit, dirty state,
and persistence behavior are unchanged.

## V2.WEB1 Production web hardening

V2 is a standalone static build with an environment-driven Vite base path. The
default output is `v2/dist/` for a root/subdomain deployment; `VITE_BASE_PATH`
supports a path such as `/blocking/`. The browser capability helper centralizes
WebGL, WebCodecs, MediaRecorder/WebM, canvas capture, file, and Blob-download
checks. WebGL failure and context loss produce a user-facing recovery state,
while the React error boundary prevents raw runtime exceptions from becoming a
blank editor. MP4/WebM export detection is explicit and the heavy export path
is loaded on demand.

The Stage keeps its capped device-pixel-ratio and existing disposal paths.
Still capture reports friendly failures; export tracks, temporary canvases,
renderers, and Blob URLs are cleaned up. No service worker, cloud storage,
authentication, analytics, or backend was added. Deployment and staging checks,
HTTPS, cache policy, WordPress separation, and browser limitations are recorded
in `docs/WEB_DEPLOYMENT.md`.
