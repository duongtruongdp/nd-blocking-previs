# ND Blocking & Previs Beta Release Workflow

The Beta update flow is manual and download-only. It does not install updates,
replace the running app, use the Tauri updater plugin, require signing or
notarization, or require a backend.

## Version authority

The application version must be identical in these four metadata locations:

- `package.json`
- `package-lock.json` root metadata
- `src-tauri/tauri.conf.json`
- `[package] version` in `src-tauri/Cargo.toml`

Check the current version without changing files:

```sh
npm run version:check
```

Set a new version safely. This updates only those version fields and does not
regenerate dependency resolution or modify the lockfile's package graph:

```sh
npm run version:set -- 0.1.1
npm run version:check
```

Use normal semantic versions and tag releases as `vX.Y.Z`. Do not bump the
version automatically as part of a build.

Git tags are reserved for published product versions. Internal milestones and
development checkpoints use commits, not tags. Do not create feature or
milestone tags going forward.

## About and update checks

The About/update surface reads the application version from `package.json`.
The app checks the public GitHub latest published release endpoint:

```text
https://api.github.com/repos/duongtruongdp/nd-blocking-previs/releases/latest
```

Release tags accept an optional `v` prefix and are compared semantically. Draft
and pre-release records are ignored. Desktop startup checks run once per launch
when **Check for updates automatically** is enabled; failures are silent.
Manual checks show a friendly retry message and never block startup.

Download URLs are centralized and stable:

```text
https://github.com/duongtruongdp/nd-blocking-previs/releases/latest/download/ND-Blocking-Previs-macOS.zip
https://github.com/duongtruongdp/nd-blocking-previs/releases/latest/download/ND-Blocking-Previs-Windows.zip
```

The app opens these URLs externally. It never opens the Releases webpage and
never executes downloaded files. The Windows URL remains reserved until a
validated package is published.

## Beta package

Run the checks before packaging:

```sh
npm test
npm run lint
npx tsc -p tsconfig.json --noEmit
npm run build
npm run version:check
cargo check --manifest-path src-tauri/Cargo.toml
npm run desktop:build
npm run release:package
npm run release:verify
git diff --check
```

`release:package` is currently macOS-only. It finds the current Tauri DMG and
creates the fixed file `release/ND-Blocking-Previs-macOS.zip`. The ZIP contains
only:

```text
ND Blocking & Previs_<version>_<arch>.dmg
README - INSTALLATION.txt
```

The future Windows package name is `ND-Blocking-Previs-Windows.zip`; it is not
generated or claimed tested until a real Windows build exists.

`release:verify` confirms the synchronized version, fixed ZIP name, exactly one
DMG, and the installation README. Generated packages are ignored by Git.

## GitHub Release procedure

The release must be a normal published release, not a draft or prerelease, so
the app's `/releases/latest` lookup and fixed asset URLs work.

1. Run `npm run version:set -- X.Y.Z` and commit the synchronized metadata.
2. Run the full validation and packaging commands above on Apple Silicon macOS.
3. Commit the source, documentation, and version changes.
4. Create and push the exact tag `vX.Y.Z`.
5. Create a GitHub Release for that tag using `.github/RELEASE_TEMPLATE.md`.
6. Publish `ND-Blocking-Previs-macOS.zip` as an asset before publishing the
   release.
7. Do not upload a Windows asset until a real Windows package is validated.

The current published Beta baseline is **0.1.1**. The next planned update test
is **0.1.1 → 0.1.2**. Do not bump to 0.1.2 automatically; use the version
helper when preparing that release.

Removing an obsolete Git tag does not remove a GitHub Release object. Release
objects must be audited and removed separately only with explicit approval.

## GitHub Actions architecture

`.github/workflows/release.yml` validates a pushed `vX.Y.Z` tag, or a manually
entered tag through `workflow_dispatch`. It runs the web checks, TypeScript
check, Rust check, and tag/version guard. It intentionally does not create an
incomplete Release or upload an asset.

The current FFmpeg sidecar is
`src-tauri/binaries/ffmpeg-aarch64-apple-darwin`, a Mach-O Apple Silicon
binary. A generic hosted x86_64 runner must not be allowed to build a desktop
package against it. Until a compatible ARM64 macOS build path and signing
policy exist, the safe architecture is:

- build and package locally on Apple Silicon;
- let Actions validate source and tag consistency; and
- upload the verified fixed ZIP manually to the normal published Release.

There is no Apple Developer signing, notarization, or automatic Windows build
claim in this pipeline.

## Manual update test

After publishing both releases:

1. Install or run the published version 0.1.1.
2. Confirm the About panel shows 0.1.1.
3. Prepare and publish a normal 0.1.2 release with the macOS ZIP asset.
4. Open About and choose **Check for updates**.
5. Confirm the newer version is shown and **Download Update** opens the fixed
   `/releases/latest/download/ND-Blocking-Previs-macOS.zip` URL.
6. Download and install manually; the app does not install it for the user.
7. Repeat with automatic checks enabled on the next desktop launch.

This is a procedure only; no browser or desktop manual acceptance is claimed
by repository automation.

## Verify the public download

After a normal published release has the required macOS asset, verify the
stable direct URL without relying on a versioned filename:

```sh
curl -I -L https://github.com/duongtruongdp/nd-blocking-previs/releases/latest/download/ND-Blocking-Previs-macOS.zip
```

The response should resolve successfully to the published ZIP. A release must
not be considered complete if the latest-release URL returns 404 or the ZIP
has not passed `npm run release:verify`.
