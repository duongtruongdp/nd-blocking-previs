# ND Blocking & Previs desktop shell

The native Project Library and `.ndblock` file-opening path belong to the Tauri
2 shell around the existing React, domain, and Stage runtime. The browser build still opens directly in
the editor; the desktop build opens the library first and mounts the editor
only after a Project is created or opened. The `.ndblock` project document and
all existing scene, camera, timeline, and Stage contracts remain unchanged.

## Structure and commands

The shell lives in `src-tauri/`. It uses the existing Vite application and
does not create a second frontend:

```bash
npm run desktop:dev
npm run desktop:build
```

`desktop:dev` starts the existing Vite server through Tauri's
`beforeDevCommand`. `desktop:build` runs the existing `build:web` command and
packages `dist/` as the local frontend. The browser build remains available
with `npm run build:web` and does not depend on Tauri.

The application identifier is `net.duongtruongdp.blocking`. The default window
is resizable and starts at 1280 × 800 with no custom titlebar.

The desktop bundle registers `.ndblock` as `ND Blocking Project` with the
native operating system. A first launch opens an associated file directly in
the editor. Later launches use the single-instance route to focus the existing
window and deliver the requested path to the same Project-open controller.
The association is declared in `src-tauri/tauri.conf.json` and uses the
existing neutral ND application icon.

## Project thumbnails

After a successful desktop Project Save or Save As, the active Camera is
captured through the existing `CameraViewRuntime` production-camera scene.
The capture reuses its isolated preview renderer, so it does not depend on the
Camera View tab being visible and does not create a second StageEngine. Guides
are disabled for the library image; the selected Camera delivery framing still
determines the output crop.

PNG bytes are written to the Tauri `appLocalDataDir()` under
`project-thumbnails/<stable-project-key>.png`. The directory is created
recursively on first write. The write is verified with `exists` and `stat`
before the Recent Project UI is updated. The library reads the verified bytes
and converts them to an in-memory `data:image/png` URL, avoiding unsupported
raw filesystem paths in `<img>` elements. Thumbnail failures are secondary to
Project Save: the saved `.ndblock` remains successful and the existing image,
or the ND fallback, is preserved.

Development builds log the resolved app-local root, capture stage, byte count,
write path, and post-write verification result with the `[thumbnail]` prefix.

## Platform boundary

`src/platform/platformAdapter.ts` is the only platform seam. The web
adapter keeps browser file pickers and downloads. The Tauri adapter uses native
open/save dialogs and the Tauri filesystem plugin. React and the domain layer
call the same adapter methods on both platforms.

Native project behavior is:

- `.ndblock` opens through a native file dialog.
- Save overwrites the current native path when one exists; otherwise it opens
  Save As.
- Save As, `.ndscene` scene export, still capture, and video export use native
  save dialogs.
- Cancel is silent.
- Unicode names are passed through and extensions are normalized without
  creating `.ndblock.ndblock` or `.ndscene.ndscene`.
- The current native path is session/runtime state only and is never part of
  the serialized project or scene schema.

## Native Project Library

The desktop library stores only recent-file metadata in the Tauri Store plugin;
it never stores a second copy of a Project document. The list is capped at 16
entries, deduplicated by normalized path identity, and sorted by most recent
open/save activity. A recent entry contains its path, Project display name,
timestamps, an optional scene count, a missing-file flag, and an external
modification indicator. The actual file's modified time is refreshed when the
path can be stat-ed; a changed timestamp is shown as Modified until the file
is opened or saved again.

The library supports:

- New Project and Open Project as the primary actions.
- Open recent Project, with missing entries retained for Locate.
- Locate to replace a missing path while opening the selected `.ndblock`.
- Remove from Recent without touching the file on disk.
- Rename File, which changes only the native filename; `ProjectDocument.name`
  remains unchanged.
- Duplicate, using collision-safe `Copy`, `Copy 2`, and later filenames; the
  copied bytes are produced by the native filesystem copy operation and the
  copy is added to Recent without opening it.
- Delete Project File as a separate confirmed operation that removes only the
  selected `.ndblock` and then removes its recent metadata.
- Recent cards use a compact two- or three-column grid with a 320 × 180-class
  local thumbnail. After a successful desktop Project save, the read-only
  Camera View capture path produces a small thumbnail without entering a
  continuous render loop or changing the Project/Scene document. Thumbnail
  bytes are stored in the platform app-data cache, keyed by recent-entry
  metadata; stale thumbnails are acceptable and cleanup follows recent-entry
  cleanup. If capture or storage fails, the branded ND fallback remains.
- The card overflow menu provides Open, Rename File, Duplicate, Remove from
  Recent, Delete Project File, and Show in Finder or Show in Explorer. Reveal
  uses the official Tauri opener plugin and safely reports a missing path.
- Desktop `.ndblock` drag-and-drop accepts the first supported Project path;
  unsupported drops are ignored. The browser build has no global drop handler.

Recent paths are restored across desktop launches through the filesystem
scope persistence plugin, while recent metadata is stored locally in
`recent-projects.json`. Thumbnail cache bytes are separate from both the
`.ndblock` file and `ProjectDocument`. Recovery snapshots are separate from
both as well; they are temporary local safety copies, not alternate Project
files. There is no cloud synchronization, templates, or alternate project
format. Returning from the editor to Projects and opening another Project use
the Save / Don't Save / Cancel dirty-document guard.

## Desktop recovery snapshots

Recovery is desktop-only and defaults to On. The browser adapter does not
create recovery files or show recovery UI. A single `RecoveryManager` observes
the existing creative Project fingerprint after committed edits, ignores
selection, playback, playhead, and other session-only changes, and schedules a
write after 25 seconds of inactivity with a 2-minute maximum dirty interval.
Only the latest snapshot is retained for each Project.

Recovery bytes are stored below the official Tauri `appLocalDataDir()` as:

```text
recovery/<deterministic-id>.ndblock.recovery
```

Metadata is stored in the Tauri Store file `recovery.json`. Saved Projects use
a deterministic ID derived from their normalized native path. Unsaved Projects
use a stable session recovery ID; the native path is never added to
`ProjectDocument`. Metadata records the Project name, original path when
available, snapshot path, recovery time, dirty-since time, and the saved file's
last known modification time.

Snapshot writes use the existing `serializeProject` `.ndblock` pipeline, write
to a `.tmp` file, verify a non-zero file, atomically rename it to the recovery
name, verify again, then update metadata. One write is allowed at a time; an
edit during a write is scheduled after the current write completes. Startup
removes stale `.tmp` files and validates each snapshot through
`parseProjectFile`.

At desktop launch, valid recoveries are sorted newest first. The Recovery
screen distinguishes ready, missing, corrupt, older-than-saved, and externally
changed snapshots. Recover loads the validated Project, restores its original
native path when known, and keeps the Project dirty. Save and Save As delete
the associated recovery after the authoritative `.ndblock` succeeds. Don't
Save and an explicit recovery Discard delete only the recovery copy; Cancel
leaves it available. Opening a saved version for an associated recovery asks
for explicit confirmation before discarding the recovery.

Recovery writes are best-effort and never block the editor. They do not create
Recent Project entries or thumbnails. Recovery snapshots remain local and
there is no recovery history, cloud sync, telemetry, or schema change.

The desktop close guard presents Save / Don't Save / Cancel when the project is
dirty. The browser keeps its existing `beforeunload` behavior. There is no
updater, signing integration, or native FFmpeg integration in this milestone.
Video export continues to use the existing
browser/WebCodecs or MediaRecorder path; native FFmpeg is a later decision.

## Tauri permissions

The default capability is intentionally narrow. It enables the default window
and dialog plugin permissions plus the exact filesystem operations required for
project read/stat/rename/copy/delete and export writes. A user-selected dialog
path is the boundary for project, scene, still, and video files; the shell does
not grant broad folder access, shell access, network access, or arbitrary
commands. Tauri capabilities are declared in
`src-tauri/capabilities/default.json`; see the [Tauri
capabilities guide](https://v2.tauri.app/security/capabilities/) and the
[dialog](https://v2.tauri.app/plugin/dialog/) and
[filesystem](https://v2.tauri.app/plugin/file-system/), [Store](https://v2.tauri.app/plugin/store/),
and [Persisted Scope](https://v2.tauri.app/plugin/persisted-scope/) plugin documentation.
Reveal behavior follows the [Tauri opener plugin](https://v2.tauri.app/plugin/opener/),
while the desktop open handoff uses the [single-instance plugin](https://v2.tauri.app/plugin/single-instance/).

## Platform notes

On macOS, Tauri uses the system WebKit/WKWebView runtime. On Windows, the
expected runtime is WebView2. This repository does not claim a Windows build
or runtime pass from macOS. Windows validation requires a Windows machine with
the WebView2 runtime and the Rust/MSVC toolchain.

The shell includes a small neutral ND desktop icon generated from
`src-tauri/icon-source.svg`; it is separate from the unrelated web Vite
favicon. Signing, notarization, and Windows SmartScreen release handling are
future release work.

## Exact manual macOS checklist

Run `npm run desktop:dev` and verify:

1. The desktop window launches from this repository and shows the Project Library.
2. The initial window is approximately 1280 × 800 and remains resizable.
3. New Project and Open Project work from the library.
4. Saving a Project adds it to Recent and reopening the desktop app restores it.
5. Recent entries sort newest first and duplicate paths do not appear twice.
6. A missing recent entry remains visible and Locate replaces its path.
7. Remove from Recent does not delete the file.
8. Rename File changes the native filename without changing the Project name.
9. Duplicate creates exact copied content with collision-safe naming.
10. Delete Project File asks for confirmation and removes only the selected file.
11. Add Actor, Prop, Camera, and scenic entities still work after entering the editor.
12. Blocking View selection and transforms still work.
13. Camera View still works.
14. Timeline playback and keyframe editing still work.
15. Save with no current path opens Save As and writes a `.ndblock` file.
16. Save again overwrites the same path without a second extension.
17. Load opens a `.ndblock` file and restores the project.
18. Save As writes a new `.ndblock` path and updates Recent without duplicates.
19. Import Scene and Export Scene use `.ndscene` files.
20. Capture Frame opens a native output location and writes the image.
21. Video export opens a native output location and writes the existing
    supported browser export format.
22. Back to Projects and closing with unsaved changes show Save / Don't Save /
    Cancel and each choice behaves correctly.
23. A saved Project shows a thumbnail or branded ND fallback in the library.
24. Show in Finder / Show in Explorer reveals an existing Project file.
25. Rename preserves the recent card thumbnail, Duplicate copies it when
    available, and Remove from Recent / Delete Project File clean it up.
26. Double-clicking an `.ndblock` opens the existing desktop instance or
    focuses the current one and routes the Project path.
27. Dropping multiple files opens only the first `.ndblock`; unsupported drops
    are ignored.
28. A dirty Project opened through association or drop offers Save, Don't
    Save, and Cancel.
29. Make a creative edit without pressing Save; after the recovery interval,
    verify `recovery/<id>.ndblock.recovery` under the Tauri app-local data
    directory and confirm a `[recovery] write complete` development log.
30. Force-terminate the desktop app after recovery writes, relaunch, choose
    Recover, and confirm the Project is dirty while the original `.ndblock`
    remains unchanged until Save.
31. Recover a saved Project, press Save, and confirm its recovery file and
    metadata are removed.
32. Create an unsaved Project, edit it, force-terminate, Recover it, and
    confirm Save opens Save As because no native path exists.
33. Create a recovery, relaunch, choose Discard, and confirm only the
    recovery copy is removed.
34. Quit a dirty Project with Don't Save, relaunch, and confirm that the
    intentionally discarded work is not offered again.
35. Use Back to Projects with Cancel and confirm the recovery remains; use
    Don't Save and confirm it is removed.
36. Disable Recovery snapshots in Settings, edit without saving, and confirm
    no new recovery is written while existing recoveries remain available.
37. With Wi-Fi disabled, repeat recovery write and Recover; no network is
    required.

This checklist is not a substitute for a Windows acceptance pass.
