# M5D.8 — Project Camera Defaults

M5D.8 adds a project-scoped default camera model. `ProjectDocument.cameraDefaults.cameraModelId` records the model used when the application creates a genuinely new Camera.

## Project default versus Camera objects

The default is a creation preference, not a live preset applied to the Scene. Changing it never rewrites existing CameraDocuments, Shot camera assignments, Camera Preview state, or Master Timeline resolution.

## Creation behavior

- **New Project** creates its initial Scene and Camera with the project default.
- **New Scene** creates its initial Camera with the current project default.
- **Add Camera** resolves the project model by stable database ID and initializes the Camera through the existing canonical CameraDocument factory and default capture mode.
- **Duplicate Camera** clones the source Camera, including its model and capture mode.
- **Duplicate Scene** preserves every copied CameraDocument exactly.

The project default stores only the camera body/model ID. Existing focal-length and canonical capture-mode defaults remain owned by the Camera factory.

## Legacy and invalid projects

Projects without `cameraDefaults` are migrated deterministically. The migration first uses the active Camera in the active Scene, then another valid existing Camera, and finally the application/database fallback. An unavailable stored model follows the same safe resolution. Existing Cameras are never changed by migration.

## Persistence and history

The field is included in `.ndblock` save/load and Save As. Changing it is one ProjectHistory transaction, marks the project dirty, and is undoable/redoable through the existing project history lane. Project Settings is available from the compact ND Blocking & Previs brand menu and is host-only during Live Review.

## Master and Shot safety

Project Camera Defaults are never used to resolve an existing Shot → Camera reference or a Master Timeline clip. Export and Camera Preview continue to use the actual assigned Camera objects.

No app-level last-used-camera preference was added: the existing application has shortcut/update/recovery preferences but no clean general project-preference store, and this milestone does not justify a new settings subsystem.
