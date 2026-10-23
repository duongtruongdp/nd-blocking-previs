# M5E.4 Portable Project Package

The .ndpack format is the portable snapshot format for moving an ND Blocking
& Previs Project together with its referenced Master graphics and music
sidecars.

## Archive layout

    project.ndblock
    manifest.json
    media/images/<safe-name>
    media/audio/<safe-name>

The embedded .ndblock remains the authoritative ProjectDocument envelope. The
manifest is versioned independently and records the Project identity,
document schema version, media kind, stable asset ID, original file name, MIME
type, byte size, SHA-256 checksum, package-relative path, and logical clip
references. It contains no source filesystem paths.

Identical referenced binaries are stored once in the package. Logical asset
entries retain their original stable IDs and references.

## Export and import behavior

Export is a snapshot operation. It reads the current ProjectDocument and the
existing IndexedDB media sidecars without changing ProjectDocument, history,
dirty state, or ordinary .ndblock Save behavior. Missing graphics or music
sidecars stop the export before a package is written and report the affected
asset and reference count.

Open Project accepts both .ndblock and .ndpack. Package import validates the
ZIP directory, safe relative paths, manifest, embedded document, media sizes,
and SHA-256 checksums before restoring anything. Media restore is transactional:
sidecars created during a failed import are removed. If an existing sidecar
with the same Project/asset identity has different bytes, the imported asset ID
and all document references are remapped. Same-content sidecars are reused.

After opening a package, the current source package is never overwritten by
ordinary Save. Save creates the established .ndblock project file.

## Safety limits

The reader rejects unsafe paths, unsupported compression methods, duplicate ZIP
paths, excessive entry counts, oversized media entries, oversized archives, and
archives whose expanded size exceeds the bounded import limit. Package media
uses the existing browser/desktop storage adapters; no WebGL renderer, FFmpeg
workspace, or project binary is involved.

## UI

Export Project Package… is available in the ND project menu. The operation
reports Checking Media, Collecting Assets, Building Package, Saving Package,
and completion/error states. Desktop saves use the native file dialog and offer
the existing platform reveal action. Browser saves use a named download and
report browser download handoff rather than claiming a filesystem location.
