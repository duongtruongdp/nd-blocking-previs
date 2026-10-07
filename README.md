# ND Blocking & Previs

ND Blocking & Previs is a browser-based and desktop blocking tool for
directors, cinematographers, and filmmakers. Plan actor movement, place the
camera, test lenses and framing, build a shot, and review a quick previs.

**Beta software · developed by Dương Trương (Andy)**

Website: [duongtruongdp.net](https://duongtruongdp.net) · Contact:
[ndtruong.contact@gmail.com](mailto:ndtruong.contact@gmail.com)

## Try the Web App

Open the current production Web App at
[blocking.duongtruongdp.net](https://blocking.duongtruongdp.net/). No install is
required. The Web App is independent from WordPress internally and can be
served as a static application.

## Beta downloads

The macOS Beta is distributed as a direct download from the latest published
GitHub Release:

[Download ND Blocking & Previs for macOS](https://github.com/duongtruongdp/nd-blocking-previs/releases/latest/download/ND-Blocking-Previs-macOS.zip)

Windows support is **coming after Windows packaging and validation**. No
Windows download is published yet.

See [macOS Beta installation](docs/MACOS_BETA_INSTALL.md) for the first-open
steps, including the macOS **Open Anyway** path when Gatekeeper requires it.

## What it does

- **Blocking:** place procedural Actors and scenic Props in a measured Stage,
  select them directly, and move or rotate them for blocking.
- **Cameras:** add generic cinema Cameras, choose production camera data,
  change focal length and capture mode, inspect physical capture FOV, preview
  anamorphic squeeze, and use delivery frame guides and Camera View.
- **Scenic planning:** block with Props, walls, doors, windows, and Sun
  positioning.
- **Timeline:** mark a shot range, place movement and camera keyframes, and
  review the shot at the project frame rate.
- **Quick previs export:** capture PNG stills and export the marked camera range
  as MP4 when the desktop encoder is available, with WebM browser fallback.
- **Project workflow:** save and load portable `.ndscene` and `.ndblock`
  projects, use recent projects on the desktop shell, and continue the same
  scene between Web and desktop where the platform supports it.
- **Web and desktop:** use the Web App with no installation, or use the
  optional macOS Tauri desktop shell for local project files and native
  export workflows.

This is a filmmaking planning tool, not a general-purpose 3D editor. Its
language and controls are organized around shots, actors, cameras, lenses,
frames, and movement.

## Desktop Beta and installation

The macOS desktop Beta is distributed outside the Mac App Store. Download the
ZIP above, extract it, open the DMG, and drag the app to Applications. If macOS
blocks the first launch, use **System Settings → Privacy & Security → Open
Anyway**. See [macOS Beta installation](docs/MACOS_BETA_INSTALL.md) for the
full short checklist.

## Portable projects

Project files are intended to be portable between supported builds. Keep the
`.ndblock` file with any referenced project data when moving between machines.
The Web App does not upload project files to a server as part of normal local
editing. Windows portability will be validated with the future Windows build.

## Beta feedback and support

Please report reproducible bugs through
[GitHub Issues](https://github.com/duongtruongdp/nd-blocking-previs/issues) or
follow the checklist in [SUPPORT.md](SUPPORT.md). Include the app version,
platform, browser or desktop build, the steps to reproduce, and a screenshot
or short recording when useful. Do not attach private project files unless
you have removed sensitive material and intend to share them.

For direct contact: [ndtruong.contact@gmail.com](mailto:ndtruong.contact@gmail.com).

## Privacy

See [PRIVACY.md](PRIVACY.md) for the current local-first data and update-check
behavior.

## License

No `LICENSE` file is currently present in this repository, so licensing has
not yet been specified. Do not assume that the project is available for
redistribution until a license is added by the developer.

## Development

Requirements: Node.js, npm, and Rust for desktop checks. The frontend uses
React, TypeScript, Vite, and Three.js; the optional desktop shell uses Tauri 2.

```bash
npm ci
npm run dev
```

Open [http://localhost:5174/](http://localhost:5174/). Common validation
commands are:

```bash
npm test
npm run lint
npx tsc -p tsconfig.json --noEmit
npm run build
npm run version:check
git diff --check
```

For the desktop shell:

```bash
npm run desktop:dev
npm run desktop:build
```

Release packaging and version procedures are documented in
[`docs/BETA_RELEASE_WORKFLOW.md`](docs/BETA_RELEASE_WORKFLOW.md). The
repository intentionally keeps the Web App and desktop shell independent from
WordPress integration.
