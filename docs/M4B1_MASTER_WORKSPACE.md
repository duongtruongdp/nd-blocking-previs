# M4B.1 — Master Workspace UX + Music Track Foundation

## Status

Implemented and ready for manual Master workspace acceptance. Browser/manual acceptance is not claimed by this document.

## Workspace boundary

The existing Scene timeline remains the editing workspace for one Scene. The Master tab now swaps the normal left hierarchy for a project-wide Shot Bin and swaps the normal entity Inspector for a Master Inspector. Scene entity selection is cleared when entering Master mode, so actor/prop/camera IDs cannot leak into Master clip or music selection.

The Shot Bin references the existing `ProjectDocument.shots` collection. It does not duplicate Shot data. Each item exposes its thumbnail, Shot name, source Scene, compact camera/lens information, and a stable drag payload (`application/x-nd-blocking-shot-id`).

## Master timeline

The lower panel is intentionally compact and contains only two tracks:

- `SHOTS`: ordered Master clip blocks, draggable for reordering and accepting Shot drops.
- `MUSIC`: one optional music clip.

Master clip ranges retain the existing M4B inclusive/exclusive source-frame convention. Master duration is derived from video Shot clips. Mixed Scene frame rates are rejected using the existing rational-rate comparison before insertion.

## Music foundation

There is no reusable audio asset/playback runtime in the current application. M4B.1 therefore imports one browser-decodable WAV/MP3/M4A/AAC file only to read duration metadata. The persisted `MasterMusicClipDocument` stores:

- display/file name
- MIME type
- byte size
- last-modified timestamp
- source duration
- Master start frame and source trim seconds

Raw audio bytes, object URLs, waveform data, decoded buffers, and embedded blobs are deliberately not persisted. Project dirty tracking includes the metadata model, and old M4B projects normalize to `musicClip: null` without changing their Shot clips.

The music visual extent may extend beyond the video Shot duration, but it does not change `masterSequenceDurationFrames` or `resolveMasterFrame`. `resolveMasterMusicTime` is a separate mapping helper for the future playback layer.

## M4C handoff

M4B.1 itself did not add playback. M4B.2 adds current-session and same-profile
Music audition, transport synchronization, scrubbing, and waveform decoding.
The `.ndblock` remains metadata-only; the imported source is kept in a
project-scoped IndexedDB sidecar when available, so copied projects can still
require an explicit Music re-import. Cross-Scene playback, fades, and audio
export remain M4C work.

## Reusable-path audit

The current reusable media paths are the video capture/export utilities (`src/export`, `src/runtime/stillCapture.ts`, and the existing capture/thumbnail readers), plus the bounded Web Audio decoder and project-scoped Music sidecar introduced for M4B.2. The sidecar remains independent from StageEngine and the existing video exporter.
