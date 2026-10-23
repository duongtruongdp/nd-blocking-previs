# M5E.2 Missing Media Manager

Graphics images in the current project format are stored as metadata in the JSON `.ndblock` document and as binary sidecars in the local IndexedDB `images` store (`nd-blocking-previs-assets`). The `.ndblock` file does not embed image bytes and does not contain an absolute source path.

The canonical health resolver treats an image as available only after the sidecar is retrieved and decoded as PNG or JPEG. Missing sidecars, unsupported formats, and decode failures are surfaced as separate health states. The same resolver is used by the Project Media Manager and Master export preflight; the preview also removes failed object URLs and displays a Missing Image placeholder.

Relink preserves the stable asset ID, so every Graphics Clip that references that asset recovers together. Replace Source Asset uses the same shared identity. Replace This Clip Only creates a separate asset record and changes only the selected clip reference while preserving its timing and transform parameters. Replacement geometry continues to use the shared aspect-ratio-preserving graphics helper.

Relink All matches exact original filenames, leaves ambiguous matches for review, and applies validated matches independently. The manager can export a CSV Missing Media Report without binary data or private absolute paths.

Recovered sidecars remain local to the current browser/desktop profile. To move a project to another machine, transfer the project and its image files and relink them there; this milestone does not introduce an incompatible embedded-asset container format.

Image relink and replacement are recorded as one ProjectHistory action. A bounded in-session sidecar version ledger restores the corresponding binary for undo/redo without placing image bytes in history snapshots. Unused sidecars are retained conservatively so undo/redo and shared-asset references are not damaged.
