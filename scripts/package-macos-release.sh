#!/bin/bash
set -euo pipefail

repository_root="$(cd "$(dirname "$0")/.." && pwd)"
release_directory="$repository_root/release"
app_path="$repository_root/src-tauri/target/release/bundle/macos/ND Blocking & Previs.app"
staging_directory="$release_directory/.staging-macos-latest"
output_path="$release_directory/ND-Blocking-Previs-macOS-latest.zip"
checksum_path="$output_path.sha256"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "error: macOS packaging must run on macOS" >&2
  exit 1
fi

if [[ ! -d "$app_path" ]]; then
  echo "error: app bundle not found: $app_path" >&2
  echo "Run npm run desktop:build first." >&2
  exit 1
fi

version="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$repository_root/package.json', 'utf8')).version)")"
bundle_version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app_path/Contents/Info.plist")"
bundle_identifier="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app_path/Contents/Info.plist")"
executable_name="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$app_path/Contents/Info.plist")"
executable="$app_path/Contents/MacOS/$executable_name"

if [[ "$bundle_version" != "$version" ]]; then
  echo "error: app version $bundle_version does not match project version $version" >&2
  exit 1
fi

if [[ "$bundle_identifier" != "net.duongtruongdp.blocking" ]]; then
  echo "error: unexpected bundle identifier: $bundle_identifier" >&2
  exit 1
fi

if [[ ! -x "$executable" ]]; then
  echo "error: app executable is missing or not executable: $executable" >&2
  exit 1
fi

architecture="$(file -b "$executable")"
if [[ "$architecture" != *"arm64"* ]]; then
  echo "error: app executable is not Apple Silicon arm64: $architecture" >&2
  exit 1
fi

mkdir -p "$release_directory"
rm -rf "$staging_directory"
rm -f "$output_path" "$checksum_path"
trap 'rm -rf "$staging_directory"' EXIT
mkdir -p "$staging_directory"

# ditto preserves the application bundle's macOS metadata and internal layout.
ditto "$app_path" "$staging_directory/ND Blocking & Previs.app"
cp "$repository_root/docs/INSTALLATION_MACOS.md" "$staging_directory/INSTALLATION.md"
cat > "$staging_directory/README.txt" <<EOF
ND Blocking & Previs ${version}
macOS Apple Silicon / arm64

Open INSTALLATION.md for installation, first-launch security approval, and
future update instructions.

Product: https://github.com/duongtruongdp/nd-blocking-previs
Web App: https://blocking.duongtruongdp.net/
EOF

# Archive the staged contents without adding a temporary parent directory.
(cd "$staging_directory" && ditto -c -k --sequesterRsrc --keepParent \
  "ND Blocking & Previs.app" "$output_path")

# Add the two text guides without changing the copied app bundle.
(cd "$staging_directory" && /usr/bin/zip -q "$output_path" INSTALLATION.md README.txt)

if [[ ! -s "$output_path" ]]; then
  echo "error: ZIP was not created: $output_path" >&2
  exit 1
fi

checksum="$(shasum -a 256 "$output_path" | awk '{print $1}')"
printf '%s  %s\n' "$checksum" "$(basename "$output_path")" > "$checksum_path"

echo "Packaged ND Blocking & Previs ${version}"
echo "App: $app_path"
echo "Architecture: $architecture"
echo "ZIP: $output_path ($(stat -f '%z bytes' "$output_path"))"
echo "SHA-256: $checksum"
echo "Checksum: $checksum_path"
