# ND Blocking & Previs

> **Plan the frame. Block the scene. See the shot.**

ND Blocking & Previs is a 3D cinematography blocking and previsualization
workspace for planning shots, camera movement, scene staging, and production
workflows before stepping onto set.

<p>
  <a href="https://blocking.duongtruongdp.net/">Open the Web App</a>
  &nbsp; · &nbsp;
  <a href="https://github.com/duongtruongdp/nd-blocking-previs/releases/latest/download/ND-Blocking-Previs-macOS-latest.zip"><strong>Download for macOS</strong></a>
  &nbsp; · &nbsp;
  <a href="https://github.com/duongtruongdp/nd-blocking-previs/releases/latest">View Latest Release</a>
</p>

**Current release:** `0.2.0` · **Desktop:** macOS Apple Silicon / arm64

The desktop build is distributed outside the Mac App Store and is currently
unsigned and not Apple-notarized. Windows installers are not published.
See the [macOS installation guide](docs/INSTALLATION_MACOS.md) for the normal
Finder security workflow.

## The workspace

Plan a shot from the first block to the final review:

**Build the Scene** → **Position Actors and Cameras** → **Plan Shots** →
**Assemble the Sequence** → **Export and Share**

### 3D scene blocking

Stage actors, procedural poses, scenic props, walls, doors, windows, and sun
positioning in a lightweight 3D blocking environment. Keep the spatial logic
of the scene visible while you work through composition.

### Camera planning

Work with cinema-camera data, sensor areas, capture modes, focal length,
anamorphic preview, delivery framing, frame guides, Camera Preview, and Camera
View. The camera tools are designed to answer practical questions about lens,
position, and coverage early.

### Scene timeline

Block actor, prop, and camera movement with a timeline, playhead, Mark In/Out,
position and rotation keys, and a compact NLE-style workflow.

### Master sequence

Organize scenes and shots into a master sequence, review timing in context,
and keep shot-camera authority explicit as the sequence develops.

### Shot planning and storyboard

Build a shot list with framing and camera metadata, thumbnails, storyboard
presentation, and PDF, CSV, and XLSX export paths for production handoff.

### Video export

Export still frames and video from the browser, or produce native H.264 MP4
output on the macOS desktop build. Export supports scene and master-sequence
workflows, graphics, fades, audio where configured, and shot information
burn-in.

### Portable projects and media

Use `.ndblock` for a normal editable project file. Use `.ndpack` when a project
and its referenced media need to travel together. The desktop media manager
helps identify missing references before handoff.

## Screenshots

Application screenshots are not currently tracked in this repository. The
documentation team’s capture checklist is maintained in
[`docs/images/README.md`](docs/images/README.md). It identifies the preferred
Stage, Camera View, timeline, shot list, and export captures for a future
gallery. Only manually reviewed, production-safe screenshots should be added;
no generated or simulated images are used here.

## Web and desktop availability

| Capability | Web | macOS desktop |
| --- | --- | --- |
| Scene blocking and previs | Yes | Yes |
| `.ndblock` projects | Yes | Yes |
| Camera tools and frame guides | Yes | Yes |
| Scene and master timelines | Yes | Yes |
| Shot planning and storyboard | Yes | Yes |
| Video export | Browser | Native H.264 MP4 |
| Project Library and recovery | — | Yes |
| `.ndpack` portable packages | Yes | Yes |

## Install on macOS

1. [Download the latest macOS Apple Silicon ZIP](https://github.com/duongtruongdp/nd-blocking-previs/releases/latest/download/ND-Blocking-Previs-macOS-latest.zip).
2. Extract it and move **ND Blocking & Previs.app** to **Applications**.
3. Open the app. If macOS blocks the first launch, use **System Settings →
   Privacy & Security → Open Anyway** after attempting to open it once.

Read the complete [macOS installation guide](docs/INSTALLATION_MACOS.md),
including update and support instructions. The ZIP is the installer package;
it is separate from `.ndpack`, which is a portable project package.

## Development

The application uses React, TypeScript, Vite, Three.js, and Tauri 2.

```bash
npm ci
npm run dev
npm test
npm run lint
npm run build
```

Desktop validation and the repeatable macOS release package workflow are
documented in [`docs/BETA_RELEASE_WORKFLOW.md`](docs/BETA_RELEASE_WORKFLOW.md).

## Status and limitations

This is Beta software. The Web App and macOS Apple Silicon desktop build are
available for evaluation. Live Review and collaborative editing are Beta
foundations, not a production-grade multi-user service. Windows packaging is
pending real Windows validation and is not published.

The macOS application is unsigned and not Apple-notarized. macOS may require
the normal Finder **Open Anyway** approval on first launch. No global Gatekeeper
or system-security bypass is required.

## Support

Report reproducible issues through
[GitHub Issues](https://github.com/duongtruongdp/nd-blocking-previs/issues), or
see [`SUPPORT.md`](SUPPORT.md) for what to include. Do not attach confidential
production projects by default. Security-sensitive reports should follow
[`SECURITY.md`](SECURITY.md).

## License

No `LICENSE` file is currently present. This repository does not make an
open-source licensing claim.

## Credits

ND Blocking & Previs is developed by **Dương Trương (Andy)**.

[duongtruongdp.net](https://duongtruongdp.net) ·
[ndtruong.contact@gmail.com](mailto:ndtruong.contact@gmail.com)
