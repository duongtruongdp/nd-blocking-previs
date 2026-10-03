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

Each shot owns its blocking data in V1. `activeShotId` must reference a real project shot, and `activeCameraId` must reference a real camera within that shot. Entity IDs must be unique within a shot.

## Serialization API

The foundation exposes:

- `serializeProject(project, generatorVersion)` — validates and emits formatted UTF-8 JSON.
- `deserializeProject(contents)` — parses, migrates, validates, and returns a `ProjectDocument`.
- `validateProjectFile(input)` — returns structured validation status and domain-level issues.
- `migrateProjectFile(input)` — runs the explicit migration seam before validation.

Malformed data is rejected. Errors use `ProjectFileError` with a stable code and path-aware details so a later UI can present filmmaker-friendly messages without changing domain behavior.

## Migration policy

V1 is the current format. A future release should add explicit functions such as `migrateV1ToV2`, apply them in order, and validate the migrated result. A newer unknown `formatVersion` is rejected; it is never silently treated as V1.

## Portability policy

The project model uses meters, rational frame rates, stable string IDs, and explicit rotation metadata. There are no host-specific paths or runtime references. This keeps the same `.ndblock` portable between macOS, Windows, browser use, and a future desktop wrapper.

Production project files are ignored by Git. Test fixtures under `src/test/fixtures/*.ndblock` are explicitly included.
