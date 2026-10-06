# ND Blocking & Previs V2 desktop shell

V2.12 adds a native Project Library to the Tauri 2 shell around the existing
V2 React, domain, and Stage runtime. The browser build still opens directly in
the editor; the desktop build opens the library first and mounts the editor
only after a Project is created or opened. The `.ndblock` project document and
all existing scene, camera, timeline, and Stage contracts remain unchanged.

## Structure and commands

The shell lives in `v2/src-tauri/`. It uses the existing Vite application and
does not create a second frontend:

```bash
npm run desktop:dev
npm run desktop:build
```

`desktop:dev` starts the existing Vite server through Tauri's
`beforeDevCommand`. `desktop:build` runs the existing `build:web` command and
packages `v2/dist/` as the local frontend. The browser build remains available
with `npm run build:web` and does not depend on Tauri.

The application identifier is `net.duongtruongdp.blocking`. The default window
is resizable and starts at 1280 × 800 with no custom titlebar.

## Platform boundary

`v2/src/platform/platformAdapter.ts` is the only platform seam. The web
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

Recent paths are restored across desktop launches through the filesystem
scope persistence plugin, while recent metadata is stored locally in
`recent-projects.json`. There are no thumbnails, autosave, recovery snapshots,
cloud synchronization, templates, or alternate project formats in this
milestone. Returning from the editor to Projects uses the existing Save /
Don't Save / Cancel dirty-document guard.

The desktop close guard presents Save / Don't Save / Cancel when the project is
dirty. The browser keeps its existing `beforeunload` behavior. There is no
autosave, recovery snapshot, updater, signing integration, or native FFmpeg
integration in this milestone. Video export continues to use the existing
browser/WebCodecs or MediaRecorder path; native FFmpeg is a later decision.

## Tauri permissions

The default capability is intentionally narrow. It enables the default window
and dialog plugin permissions plus the exact filesystem operations required for
project read/stat/rename/copy/delete and export writes. A user-selected dialog
path is the boundary for project, scene, still, and video files; the shell does
not grant broad folder access, shell access, network access, or arbitrary
commands. Tauri capabilities are declared in
`v2/src-tauri/capabilities/default.json`; see the [Tauri
capabilities guide](https://v2.tauri.app/security/capabilities/) and the
[dialog](https://v2.tauri.app/plugin/dialog/) and
[filesystem](https://v2.tauri.app/plugin/file-system/), [Store](https://v2.tauri.app/plugin/store/),
and [Persisted Scope](https://v2.tauri.app/plugin/persisted-scope/) plugin documentation.

## Platform notes

On macOS, Tauri uses the system WebKit/WKWebView runtime. On Windows, the
expected runtime is WebView2. This repository does not claim a Windows build
or runtime pass from macOS. Windows validation requires a Windows machine with
the WebView2 runtime and the Rust/MSVC toolchain.

The shell includes a small neutral ND desktop icon generated from
`v2/src-tauri/icon-source.svg`; it is separate from the unrelated web Vite
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

This checklist is not a substitute for a Windows acceptance pass.
