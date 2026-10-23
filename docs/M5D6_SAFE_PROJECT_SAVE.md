# M5D.6 — Safe Project Save / Quit Guard

## Dirty state

Production document changes advance an in-memory project revision in the
canonical `replaceProjectDocument` path. The last successful save stores both
that revision and a creative project fingerprint. The fingerprint is the
authoritative comparison so undoing back to the saved document clears the
dirty indicator, while a later edit remains dirty if an older async save
finishes.

Selection, menu, viewport, playhead, and other editor-only state are not save
checkpoints.

## Save behavior

`runProjectSave()` is the single Save / Save As path. It returns success,
cancelled, or failure semantics internally, prevents overlapping writes, and
shows Saving, Saved, or a persistent failure message in the project menu and
header. The current path is updated only after the platform adapter confirms a
write. A successful write never replaces a newer live document with its older
snapshot.

Desktop writes are awaited native filesystem writes. Web writes use the
existing browser download adapter. Serialization and filesystem exceptions are
reported as save failures; technical details are logged only in development.
Recent-project metadata, recovery cleanup, and thumbnails are follow-up work
and cannot turn an already-confirmed project write into a false save failure.
The existing direct native write API is retained for this focused milestone;
no unverified cross-platform temporary-file replacement was introduced.

## Quit and context guards

Desktop Tauri close requests are prevented while dirty. The app-owned modal
offers Save & Quit, Don’t Save, and Cancel. Save & Quit allows the one close
request only after Save resolves successfully; cancelled or failed saves keep
the app open. The native close listener serializes repeated close requests and
uses a one-shot programmatic-close bypass.

New Project, Load Project, Projects, and project switching use the same modal
guard. Failed or cancelled saves leave the current document in place. Browser
`beforeunload` protection remains limited to dirty Web sessions; it is not used
for the Tauri close path.

## Project menu

The ND Blocking & Previs brand is now the compact project menu trigger. The
floating menu contains Projects, New Project, Load Project, Save, and Save As…
and closes on outside interaction or Escape. Project and Scene identity remain
in the header, including the small unsaved indicator.
