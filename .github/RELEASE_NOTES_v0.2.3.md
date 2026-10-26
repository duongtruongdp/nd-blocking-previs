# ND Blocking & Previs v0.2.3

## Fixed

### Master Timeline Export Consistency

- Fixed an issue where exported Master Timeline videos could show outdated
  object or camera positions.
- Unified Scene evaluation for Master Preview and video export.
- Corrected grouped Actor, Prop, Wall, and Camera transforms during export.
- Preserved Shot timing, trims, source references, and existing project
  compatibility.

## Validation

- Automated regression tests pass.
- The original issue was manually verified as resolved.

## Known Limitations

- Two-client Live Review acceptance remains unverified unless independently
  tested.
- macOS builds are unsigned and not notarized unless signing is configured.
- Windows packaging is not currently available.

## Downloads

- `ND-Blocking-Previs-macOS-latest.zip` — macOS Apple Silicon package.
- `ND.Blocking.Previs_0.2.3_aarch64.dmg` — macOS Apple Silicon disk image.
- Matching SHA256 checksum files are attached to the release.
