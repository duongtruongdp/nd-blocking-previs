# M4B.2 — Master Timeline Usability, Waveform, and Basic Transport

## Geometry and scale

The Master timeline has one fixed frame-based scale shared by the ruler,
playhead, Shot clips, Music clip, waveform, and insertion marker. Fit All uses
the complete visible content duration: `max(Shot sequence end, Music end)`,
including the Music start offset and source trim. If there are no Shots, the
fit is still bounded by the visible Music extent (or a 20-second preview
window when no content exists).

The track label column is fixed. The ruler and both `SHOTS`/`MUSIC` rows live
inside one horizontal scrolling canvas, with compact fixed row heights. The
Shot video range remains the authoritative playback range; the content canvas
may continue to the end of a longer Music clip.

## Waveform

The browser import path uses `AudioContext.decodeAudioData()`, combines all
channels deterministically, and reduces PCM samples to a bounded peak array.
The array is held in runtime state and drawn with one Canvas element inside the
Music clip. Source trim values map the visible waveform to the selected source
range. Replacing Music invalidates the old runtime peaks and decodes the new
file once.

No PCM, waveform array, Blob URL, or raw audio bytes are written to `.ndblock`.
The project model persists Music metadata and trim/reference values, while the
imported source file is stored separately in a project-scoped IndexedDB sidecar
when browser storage is available. Reopening the same project in the same
browser profile can therefore regenerate its waveform and restore audition.
If the `.ndblock` is copied to another browser/profile, or the sidecar is
unavailable or deleted, the metadata remains valid and the UI explicitly asks
the user to re-import the source instead of showing a fake waveform.

## Transport and playback boundary

Master transport provides Return to Start, Play/Pause, Stop, click-to-seek,
and pointer scrubbing. The Master frame is authoritative and advances at the
resolved Master FPS. Each playback tick calls the existing `resolveMasterFrame`
mapping without mutating project Scene activation. Current-session imported
Music is auditioned through an HTML audio element and synchronized from Master
time where the browser file is still available. Silence is used outside the
Music range.

Cross-Scene visual preview and final Master export remain M4C work. This keeps
Scene editor state stable while providing a useful timeline/playhead review
foundation.
