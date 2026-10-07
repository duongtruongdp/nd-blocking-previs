# ND Blocking & Previs

**Simple blocking and previs for filmmakers.**

Plan actors, props, camera positions, framing, and basic movement before
stepping onto set.

> **Beta** — currently available on the Web and as a macOS Apple Silicon
> desktop app.

[Open the Web App](https://blocking.duongtruongdp.net/) · [Download macOS
Beta](https://github.com/duongtruongdp/nd-blocking-previs/releases/latest/download/ND-Blocking-Previs-macOS.zip)

Developed by **Dương Trương (Andy)**<br>
[duongtruongdp.net](https://duongtruongdp.net) ·
[ndtruong.contact@gmail.com](mailto:ndtruong.contact@gmail.com)

## Try the Web App

[Open blocking.duongtruongdp.net](https://blocking.duongtruongdp.net/)

No installation is required. The Web App is a functional product build and
remains independent from WordPress internally.

## Beta downloads

### macOS Beta

[Download ND Blocking & Previs for macOS](https://github.com/duongtruongdp/nd-blocking-previs/releases/latest/download/ND-Blocking-Previs-macOS.zip)

The current validated desktop build is **Apple Silicon / arm64** and is
distributed outside the Mac App Store. See
[macOS installation](docs/MACOS_BETA_INSTALL.md).

### Windows Beta

**Coming after Windows validation.** The Windows package is not published yet.
See the [Windows installation guide](docs/WINDOWS_BETA_INSTALL.md) for the
planned workflow.

## Block the scene

- Actors and pose presets
- Props and scenic blocking
- Walls, doors, and windows
- Sun positioning

## Plan the camera

- Camera database and capture modes
- Sensor area and focal length
- Anamorphic squeeze preview
- Delivery framing and frame guides
- Camera Preview and Camera View

## Build simple movement

- Timeline-based actor and camera movement
- Actor blocking and prop movement
- Mark In and Mark Out
- Position and rotation keyframes

## Export

- PNG still frames
- Browser video export
- Desktop H.264 MP4 export

## Web and desktop

| Capability | Web | Desktop |
| --- | --- | --- |
| Blocking and previs | Yes | Yes |
| `.ndblock` projects | Yes | Yes |
| Camera tools | Yes | Yes |
| Timeline | Yes | Yes |
| PNG capture | Yes | Yes |
| Video export | Browser | Native H.264 |
| Project Library | — | Yes |
| Crash recovery | — | Yes |

## Screenshots

Current application screenshots are not yet tracked in this repository. The
planned documentation set is recorded in [`docs/images/README.md`](docs/images/README.md):

- Blocking View
- Camera View
- Timeline
- Actor Pose
- Desktop Project Library
- Frame Guides / Camera Preview

Only manually reviewed captures should be added. Do not use generated or
simulated screenshots, and redact private production material first.

## Project files

`.ndblock` is the portable ND Blocking & Previs project format. Projects are
intended to move between the Web App, macOS Desktop, and future Windows
Desktop. Windows portability will be validated with the future Windows build.

## Installation

For macOS: download the ZIP, extract it, open the DMG, and drag ND Blocking &
Previs to Applications. If macOS blocks the first launch, use **System Settings
→ Privacy & Security → Open Anyway**. The complete guide is in
[`docs/MACOS_BETA_INSTALL.md`](docs/MACOS_BETA_INSTALL.md).

For Windows: installation documentation is prepared, but the Beta package is
not released until a real Windows build has been validated.
For the Web App: [no installation is required](https://blocking.duongtruongdp.net/).

## Beta updates

Open **About → Check for Updates** to look for a newer Beta. If one is
available, **Download Update** opens the direct platform package. Close the
current app, install or replace the application manually, and reopen it. The
app does not install updates automatically, and `.ndblock` projects remain
separate files.

## Support and feedback

Use [GitHub Issues](https://github.com/duongtruongdp/nd-blocking-previs/issues)
or follow [SUPPORT.md](SUPPORT.md). Include the app version, platform, steps to
reproduce, and a screenshot or short recording when useful. Do not attach
private production files by default.

Direct contact: [ndtruong.contact@gmail.com](mailto:ndtruong.contact@gmail.com).

See [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md) for the current
project guidance.

## Release documentation

- [Installation index](docs/INSTALL.md)
- [macOS Beta installation](docs/MACOS_BETA_INSTALL.md)
- [Windows Beta installation](docs/WINDOWS_BETA_INSTALL.md)
- [Beta release workflow](docs/BETA_RELEASE_WORKFLOW.md)
- [Changelog](CHANGELOG.md)

## License

No `LICENSE` file is currently present. License information will be added
before the final public release; do not assume redistribution rights.

## Development

The repository contains the React, TypeScript, Vite, Three.js, and optional
Tauri desktop sources. Common checks are:

```bash
npm ci
npm run dev
npm test
npm run lint
npx tsc -p tsconfig.json --noEmit
npm run build
npm run version:check
git diff --check
```

Desktop development and release procedures are documented in
[`docs/BETA_RELEASE_WORKFLOW.md`](docs/BETA_RELEASE_WORKFLOW.md). Internal
milestones use commits; Git tags are reserved for published product versions
in the form `vX.Y.Z`.
