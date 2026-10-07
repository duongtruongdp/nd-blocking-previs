# Installing ND Blocking & Previs on macOS

The current desktop Beta is distributed outside the Mac App Store. The
validated build is for **Apple Silicon / arm64**. It is currently unsigned and
not notarized, so macOS may ask you to approve the first launch.

## 1. Download

[Download the macOS Beta ZIP](https://github.com/duongtruongdp/nd-blocking-previs/releases/latest/download/ND-Blocking-Previs-macOS.zip)

## 2. Install

1. Extract the downloaded ZIP.
2. Open the DMG inside it.
3. Drag **ND Blocking & Previs** to **Applications**.
4. Eject the DMG.

## 3. First launch

Open **ND Blocking & Previs** from Applications. If macOS blocks it, use the
recommended approval route below.

## If macOS blocks the app

### Option A — Open Anyway

1. Try opening the app once.
2. Open **System Settings**.
3. Choose **Privacy & Security**.
4. Scroll to the **Security** section.
5. Click **Open Anyway**, then confirm **Open**.

You normally only need to approve the current Beta once.

### Option B — Terminal fallback

Use this only if **Open Anyway** is unavailable after you have tried opening the
app:

1. Confirm that **ND Blocking & Previs.app** has been copied into
   `/Applications`.
2. Open **Terminal**.
3. Run exactly:

```bash
xattr -dr com.apple.quarantine "/Applications/ND Blocking & Previs.app"
```

4. Press Return.
5. Open ND Blocking & Previs from Applications again.

This command removes the macOS quarantine attribute only from
`/Applications/ND Blocking & Previs.app`. It does not disable Gatekeeper,
System Integrity Protection, or global macOS security settings.

## Updating the Beta

Use **About → Check for Updates** inside the app. When a newer version is
available, **Download Update** downloads the ZIP directly. Close the current
app, repeat the installation steps with the new DMG, and reopen it. Updates are
manual; the app does not replace itself.

Your `.ndblock` projects remain separate files. Keep backups of important
production work.

## Need help?

Report a reproducible issue through
[GitHub Issues](https://github.com/duongtruongdp/nd-blocking-previs/issues) or
contact [ndtruong.contact@gmail.com](mailto:ndtruong.contact@gmail.com).
Include the app version, macOS version, and the steps that led to the problem.

Developer: **Dương Trương (Andy)** ·
[duongtruongdp.net](https://duongtruongdp.net)
