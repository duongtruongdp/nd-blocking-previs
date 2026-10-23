# Installing ND Blocking & Previs on macOS

ND Blocking & Previs is currently distributed as a **macOS Apple Silicon /
arm64** application outside the Mac App Store. The current build is unsigned
and not Apple-notarized. This may cause macOS to ask for an approval on the
first launch; it does not mean the application is damaged.

## 1. Download

[Download the latest macOS ZIP](https://github.com/duongtruongdp/nd-blocking-previs/releases/latest/download/ND-Blocking-Previs-macOS-latest.zip)
from the permanent GitHub Releases URL.

The ZIP contains:

- `ND Blocking & Previs.app`
- `INSTALLATION.md`
- `README.txt`

This installer ZIP is not an `.ndpack` project package. An `.ndpack` contains
project data and referenced media for transfer between supported installations.

## 2. Install

1. Open the downloaded ZIP in Finder.
2. Drag **ND Blocking & Previs.app** into **Applications**.
3. Eject or close the extracted download location if desired.
4. Open **ND Blocking & Previs** from Applications.

## 3. Approve the first launch

Because this Beta is unsigned and not Apple-notarized, macOS may prevent the
first launch.

1. Try opening the app once.
2. Open **System Settings → Privacy & Security**.
3. Scroll to **Security**.
4. Click **Open Anyway**, then confirm **Open**.

Use Apple’s normal Finder/System Settings approval flow. Do not disable
Gatekeeper globally or change system security settings.

## 4. Install a future update

Download the latest ZIP again, quit the current app, and replace the existing
copy in Applications with the newly extracted **ND Blocking & Previs.app**.
Keep backups of important `.ndblock` projects. The application does not
silently replace itself or install updates automatically.

Inside the app, **About → Check for Updates** can open the current public
download when a newer release is available.

## 5. Report a problem

Report reproducible issues through
[GitHub Issues](https://github.com/duongtruongdp/nd-blocking-previs/issues), or
contact [ndtruong.contact@gmail.com](mailto:ndtruong.contact@gmail.com).
Include the app version, macOS version, steps to reproduce, and a screenshot or
short recording when useful. Remove confidential production material before
sharing.

## Support

The Web App is available at
[blocking.duongtruongdp.net](https://blocking.duongtruongdp.net/). Windows
installers are not currently published.
