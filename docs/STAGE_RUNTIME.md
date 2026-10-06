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

The Stage environment uses a finite 24-meter ground plane, a subtle 20-meter reference grid, and neutral internal illumination. These are visualization infrastructure only. They are not editable `LightDocument` records and never enter the project document.

## Failure and disposal

Renderer initialization errors are logged for development and translated into a product-facing `Stage unavailable` message. Raw browser/WebGL diagnostics are not shown in the normal UI.

On unmount, the runtime cancels pending frames, removes listeners and observers,
disposes transform controls, disposes geometry/materials, disposes the renderer,
and removes its canvas.
