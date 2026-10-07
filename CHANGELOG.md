# Changelog

User-visible changes are recorded here. This project is currently in Beta.

## 0.1.3 — Beta

### Updates

- Fixed Download Update on macOS desktop so the browser opens the latest
  release package correctly.
- Added clearer feedback if the download link cannot be opened.

## 0.1.0 — Beta

### Added

- Added a filmmaker-focused Web App for actor blocking, scenic props, cinema
  camera planning, framing, lens and capture settings, timeline keyframes, and
  quick previs export.
- Added Web and macOS desktop workflows around the same portable project data.
- Added local desktop Project Library behavior, recent projects, thumbnails,
  `.ndblock` file handling, and recovery support.
- Added manual macOS Beta packaging with a fixed download filename and
  installation guidance.
- Added About, support, version, and manual update-check controls.
- Added direct links for the production Web App and Beta support.

### Known limitations

- The macOS Beta is unsigned and distributed outside the Mac App Store.
- Windows packaging remains pending real Windows validation.

## 0.1.1 — Beta

### Added

- Published the Apple Silicon macOS Beta package and stable direct download
  path.
- Added public installation, support, privacy, and release guidance.

### Improved

- Improved About/update and release metadata consistency.
- Added package-content verification for the macOS Beta ZIP.

### Fixed

- Clarified that Windows packaging remains pending real Windows validation.

## 0.1.2 — Beta

### Timeline

- Added a more direct NLE-style Auto-Key workflow for blocking changes.
- Added multi-keyframe selection, group editing, copy/paste, and batch easing.
- Added visible Linear, Ease In, Ease Out, and Ease In & Out keyframe shapes.

### Camera

- Camera Preview and Camera View now stay synchronized with scene changes.
- Corrected the Pan, Tilt, and Dutch transform-axis workflow.
- Improved Active Camera selection and switching.

### Frame Guides

- Improved selection and editing of multiple frame guides.
- Newly added guides are selected immediately.
- Deleting a guide now selects the next or previous available guide reliably.

### UI / Stability

- Cleaned up the Inspector presentation.
- Improved consistency across Timeline, Camera, and runtime editing workflows.
