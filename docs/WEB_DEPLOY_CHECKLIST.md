# ND Blocking & Previs Web Deploy Checklist

This is the short operator checklist for the standalone app at
`https://blocking.duongtruongdp.net/`.

## Before build

- Confirm the intended commit and keep the previous deployed static files as a rollback backup.
- Do not edit WordPress or the `.ndscene`/`.ndblock` formats for a web release.
- Confirm the subdomain document root is dedicated to this app.

## Build

```sh
npm install
npm test
npm run lint
npx tsc -p tsconfig.json --noEmit
npm run build
npm run build:web
git diff --check
```

The production artifact is `dist/`. It must have `index.html` at its top
level, an `assets/` directory, root-relative asset paths, and no `.map` files.
The staging command is `npm run build:web:staging`; keep its source maps private.

## Upload

Upload the contents of `dist/` directly into the subdomain document root:

```text
document-root/index.html
document-root/assets/*
```

Do not create `document-root/dist/`.

The current production document root is:

```text
/home/duongtr1/blocking.duongtruongdp.net/
```

## HTTPS and cache

- DNS: `blocking` must resolve to the chosen static host using its documented A or CNAME target.
- TLS: enable a certificate for `blocking.duongtruongdp.net` and redirect HTTP to HTTPS.
- `index.html`: no-cache or short revalidation.
- `assets/*`: long immutable cache; filenames are hashed.
- Keep WordPress/CDN page-cache rules separate from this subdomain.

## Smoke test

- Open `https://blocking.duongtruongdp.net/`; the editor must open immediately.
- Check the browser Network and Console panels for 404, 500, CORS, mixed-content, and failed dynamic-import errors.
- Confirm the document contains `meta[name="nd-build"][content="nd-blocking-previs-web"]`.
- Check Scene, Stage WebGL, Actor, Prop, Wall, Door/Window, Sun, Camera, Camera Preview, Camera View, Frame Guides, Timeline, and project switching.
- Test `.ndscene`, `.ndblock`, PNG, WebM/MP4 capability messaging, and dirty reload warning.
- Test representative cameras: Sony FX5, Sony BURANO, and ARRI ALEXA 35.
- Test anamorphic preview, a short Mark In/Out export, and repeated preview open/close.

## Browser gate

- Chrome: primary staging gate, including WebGL, lazy chunks, downloads, and export.
- Edge: baseline Chromium smoke test.
- Safari: HTTPS, WebGL, file workflows, Camera View, still capture, keyboard shortcuts, and capability fallback.
- Firefox: core editor best-effort; do not claim video codec support without feature detection.
- Mobile: outside the production acceptance gate.

## Rollback

Restore the previous `index.html` and matching hashed `assets/` backup as one
static set, purge only the subdomain's HTML cache if needed, then repeat the
root/lazy-chunk smoke test. No WordPress or database rollback is involved.
