# Milestone 1 Stage Runtime

This document records the Stage-specific decisions introduced by Milestone 1.

## Boundary

`SceneRuntime` owns the non-serializable Blocking View environment:

- Three.js scene
- WebGL renderer
- navigation camera
- OrbitControls
- resize observation
- render scheduling
- internal ground, grid, and illumination
- serializable Camera object proxies and finite frustum guides
- disposal

The navigation camera is an editor viewpoint only. It is not a `CameraDocument`, is not part of selection, and is never written to `.ndblock` project data.

Each filmmaking Camera is a separate registered Stage object. Its visible proxy
contains a lightweight camera body, lens, forward marker, and finite frustum
guide. The guide projection is derived from the CameraDocument's resolved
active sensor dimensions and focal length; it is not an infinite line or a
hardcoded field of view. The guide is shown for the selected Camera in Blocking
View and is removed with the Camera.

Camera height is the CameraDocument world-Y placement value. Pan, Tilt, and
Roll are displayed in degrees at the Inspector boundary and stored as XYZ
Euler radians. The filmmaking camera looks along local negative Z; this
convention is independent of the navigation camera controls.

React mounts `SceneRuntime` through the `Stage` component and only owns the mount element and user-facing failure state. Three.js objects are not placed in React state.

## Rendering strategy

The empty Stage uses invalidate-on-demand rendering. A frame is requested when:

- the Stage is first initialized;
- the Stage container changes size;
- Orbit navigation changes the view;
- a future runtime owner requests a scene update.

`SceneRuntime.setContinuousRendering(true)` is the reserved seam for future playback. Milestone 1 does not keep an idle 60fps loop running because the Stage has no animated content yet.

OrbitControls damping is allowed to request follow-up frames until the navigation settles.

## Resize strategy

`ResizeObserver` watches the actual Stage container. The renderer size and navigation-camera projection update from the container's width and height. A window resize fallback is retained for browsers without `ResizeObserver`.

The renderer is not recreated when the layout changes.

## Pixel-ratio policy

The renderer uses the browser's device pixel ratio with a maximum of `2`. This preserves normal-density rendering on standard displays while preventing very high-density MacBook Retina displays from multiplying the Stage buffer without bound. The policy is isolated in `src/runtime/renderPolicy.ts` so adaptive quality can be added later.

## Environment

The Stage environment uses a finite 24-meter ground plane, a subtle 20-meter reference grid, and neutral internal illumination. These are visualization infrastructure only. They are not editable `LightDocument` records and never enter the project document.

## Failure and disposal

Renderer initialization errors are logged for development and translated into a product-facing `Stage unavailable` message. Raw browser/WebGL diagnostics are not shown in the normal UI.

On unmount, the runtime cancels pending frames, removes listeners and observers, disposes controls, disposes geometry/materials, disposes the renderer, and removes its canvas.
