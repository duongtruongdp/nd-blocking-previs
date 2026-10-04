# `.ndblock` Project Format

This is the authoritative V1 contract for native ND Blocking & Previs project files.

## File contract

The physical file extension is `.ndblock`. V1 stores portable UTF-8 JSON with this top-level shape:

```json
{
  "format": "nd-blocking-previs",
  "formatVersion": 1,
  "generator": {
    "application": "ND Blocking & Previs",
    "version": "0.0.0"
  },
  "project": {}
}
```

`format` is the stable product identifier. `formatVersion` is an integer and identifies the file contract, not the application release. `generator.version` records the application version that wrote the file.

The portable project body contains only plain JSON values. It has no absolute macOS/Windows paths, browser references, WordPress data, binary blobs, functions, Three.js objects, DOM objects, renderer resources, or GPU resources.

## V1 project shape

```text
Project
└── shots[]
    ├── actors[]
    ├── props[]
    ├── cameras[]
    ├── lights[]
    └── timeline
```

Each shot owns its blocking data in V1. `activeShotId` must reference a real project shot. `activeCameraId` references a real camera when a shot has cameras and is `null` while the shot is still empty. Entity IDs must be unique within a shot. Props use an explicit `propType` for blocking proxy identity; older V1 props without that field are inferred from their representation during validation.

Actors now persist stable `character.characterId` and `pose.poseId` values alongside color, height, and placement. Cameras persist stable catalog-selection IDs, a resolved capture snapshot, lens profile, focus distance, placement, aim, and frame guide. Existing V1 Actor and Camera records that do not yet contain these additive fields are normalized during validation; the format version remains V1 because this is a backward-compatible default, not a reinterpretation of existing fields. Newly serialized files always include the normalized fields.

## Serialization API

The foundation exposes:

- `serializeProject(project, generatorVersion)` — validates and emits formatted UTF-8 JSON.
- `deserializeProject(contents)` — parses, migrates, validates, and returns a `ProjectDocument`.
- `validateProjectFile(input)` — returns structured validation status and domain-level issues.
- `migrateProjectFile(input)` — runs the explicit migration seam before validation.

Malformed data is rejected. Errors use `ProjectFileError` with a stable code and path-aware details so a later UI can present filmmaker-friendly messages without changing domain behavior.

## Migration policy

V1 is the current format. Its validation seam performs only documented additive defaults for older Actor, Prop, and Camera records. Legacy cameras receive a generic or sensor-format-derived resolved capture snapshot and a Capture frame guide; they do not silently adopt a current production catalog selection. A future incompatible release should add explicit functions such as `migrateV1ToV2`, apply them in order, and validate the migrated result. A newer unknown `formatVersion` is rejected; it is never silently treated as V1.

## Portability policy

The project model uses meters, rational frame rates, stable string IDs, and explicit rotation metadata. There are no host-specific paths or runtime references. This keeps the same `.ndblock` portable between macOS, Windows, browser use, and a future desktop wrapper.

Production project files are ignored by Git. Test fixtures under `src/test/fixtures/*.ndblock` are explicitly included.
