# ND Blocking & Previs V2 Web Deployment

V2 is a local-first static web application. Creative project data stays in the
browser and leaves the device only through user-initiated `.ndscene`, `.ndblock`,
still-image, or video downloads. There is no API, account, analytics, cloud
storage, or service worker in this build.

## Build and preview

Run these commands from the repository root:

```sh
npm install
npm run build
npx vite preview --config v2/vite.config.ts
```

The deployable output is `v2/dist/`. Upload the contents of that directory to
a static host. `npm run build` validates the legacy root application; the V2
production build is:

```sh
npx vite build --config v2/vite.config.ts
```

## Deployment URL shapes

The preferred deployment is a dedicated HTTPS subdomain:

```text
https://blocking.duongtruongdp.net/
```

Use the default base `/` and point the subdomain DocumentRoot at `v2/dist/`.

For a subpath deployment:

```sh
VITE_BASE_PATH=/blocking/ npx vite build --config v2/vite.config.ts
```

Upload that build to `https://duongtruongdp.net/blocking/`. The base path is
read from `VITE_BASE_PATH`; it must have a leading and trailing slash. The app
uses one document route and does not require React Router or an SPA fallback
rewrite. If a host rewrites unknown paths, keep `/blocking/` scoped to the V2
static directory.

The build has no required secrets or production environment variables. The
only supported V2 build variable is optional `VITE_BASE_PATH`:

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `VITE_BASE_PATH` | No | `/` | Root-relative base for a subpath deployment |

Production builds do not publish source maps. A `--mode staging` build emits
source maps for controlled staging diagnosis; do not upload those staging
artifacts to the public production host unless that exposure is intentional.

Staging can use the same command with a staging base, for example
`blocking-staging.duongtruongdp.net` with `/`. Do not put API keys or private
data in frontend environment files.

## Hosting requirements

- Serve the app over HTTPS. WebCodecs, video capture, downloads, and browser
  permissions are more reliable in a secure context.
- Serve JavaScript as `text/javascript`, CSS as `text/css`, JSON as
  `application/json`, PNG as `image/png`, MP4 as `video/mp4`, and WebM as
  `video/webm` when those files are served directly.
- Keep `index.html` short-lived or no-cache during releases.
- Cache hashed files under `v2/dist/assets/` with a long immutable lifetime.
- No service worker/PWA cache is added; this avoids stale-build recovery issues.
- Static hosting does not need permissive CORS for same-origin assets.

WordPress should remain the marketing, blog, or documentation site. Do not
paste the application source into Elementor. Link to the standalone app or
embed the deployed subdomain in an iframe when needed. Standalone is primary;
iframe embedding may require fullscreen permission, download permission, and
clipboard permission from the embedding policy. If embedding is enabled, the
host should explicitly configure an appropriate `Content-Security-Policy`
`frame-ancestors` policy rather than adding one in application code.

## Browser behavior

Recommended desktop browsers are current Chrome and Edge. Safari desktop is
supported for Stage/WebGL, file workflows, Camera View, and still capture;
video format availability is detected at runtime. Firefox is secondary and may
offer fewer video formats. A missing WebGL context shows a friendly recovery
message instead of a raw Three.js error. MP4 is offered only when WebCodecs
and the selected H.264 encoder are available; otherwise WebM is offered when
MediaRecorder supports it. If neither format is available, video export is
disabled with an explanation.

File loading uses a standard file input and download flows use Blob URLs, so
the File System Access API is optional rather than required. Generated Blob
URLs are revoked after download, export capture tracks are stopped, and
temporary still/export canvases are disposed after use. Dirty Projects retain
the existing `beforeunload` warning; clean Projects do not prompt.

The editor is desktop-class. A compact notice appears below approximately
900×620 pixels, but normal laptop-sized screens remain usable. The existing
development-only `?interactionDebug=1` diagnostic remains off in production.

## Production checks

Before staging acceptance:

1. Build the root app and V2 app.
2. Inspect `v2/dist/index.html` and `v2/dist/assets/` for valid references.
3. Build once with `VITE_BASE_PATH=/blocking/` and verify the generated asset
   URLs begin with `/blocking/`.
4. Serve `v2/dist/` through a static server or `vite preview`, not only Vite
   dev middleware.
5. Test New Project, Actor/Prop/Camera, Wall drawing, Camera Preview, Camera
   View, Timeline, still capture, MP4/WebM fallback, `.ndscene`, `.ndblock`,
   dirty reload warning, and reload recovery in Chrome, Edge, and Safari as
   available.
6. Repeat Scene switching, Camera View/Blocking View, Preview toggle, still
   capture, and export to check for stale renderers, listeners, tracks, or
   Blob URLs.

The V2 build currently keeps the Camera database bundled for offline
availability. Video export code and `mediabunny` are loaded only when export
capability detection/export begins; the core editor remains in the initial
chunk. Three.js and the core editor remain the largest initial contributors.

Staging browser acceptance is a required gate and is not implied by automated
tests or a successful build.
