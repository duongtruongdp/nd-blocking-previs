# ND Blocking & Previs V2 Web Deployment

V2 is a local-first static web application. Creative project data stays in the
browser and leaves the device only through user-initiated `.ndscene`, `.ndblock`,
still-image, or video downloads. There is no API, account, analytics, cloud
storage, or service worker in this build.

## Production target and architecture

The production editor URL is:

```text
https://blocking.duongtruongdp.net/
```

This is a standalone static Vite application. The subdomain opens the editor
directly; it does not contain a marketing screen and it does not depend on
WordPress, PHP, a database, an API, a service worker, or a rewrite rule. The
main WordPress site remains responsible for the public landing page at
`https://duongtruongdp.net/blocking/`, which may link to this app in the same
tab or a new tab.

The app is local-first. Scene, Project, Camera, Timeline, and export data stay
in browser memory until the user explicitly loads or downloads a file. The
subdomain and the WordPress origin should be treated as separate origins: do
not assume shared cookies, localStorage, sessionStorage, or authentication
state between them.

## Build and preview

Run these commands from the repository root:

```sh
npm install
npm run build
npx vite preview --config v2/vite.config.ts
```

The root `npm run build` continues to validate the legacy root application.
The exact V2 production build for the standalone subdomain is:

```sh
npm run build:web
```

It uses the default `VITE_BASE_PATH=/` and writes the deployable output to
`v2/dist/`. The equivalent explicit command is:

```sh
VITE_BASE_PATH=/ npm run build:web
```

The staging build is:

```sh
npm run build:web:staging
```

It uses the same root base and emits source maps for controlled diagnosis.
Keep staging source maps access-controlled and do not upload them to the
public production host.

Preview the production artifact, rather than the development server:

```sh
npx vite preview --config v2/vite.config.ts --host 127.0.0.1
```

The deployable output is `v2/dist/`. Upload the *contents* of that directory
to the subdomain document root; do not upload the containing `dist` directory
as a nested folder.

## Deployment URL shapes

The preferred deployment is a dedicated HTTPS subdomain:

```text
https://blocking.duongtruongdp.net/
```

Use the default base `/` and point the subdomain DocumentRoot at the uploaded
contents of `v2/dist/`.

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

## Subdomain, DNS, and HTTPS setup

The exact labels depend on the hosting provider, but the provider workflow is:

1. Create the subdomain `blocking` and assign it a dedicated static document
   root. If the host separates DNS from hosting, create the document root in
   the hosting control panel first.
2. Create either an `A` record pointing `blocking.duongtruongdp.net` at the
   host's published IPv4 address, or a `CNAME` pointing it at the host's
   documented hostname. Use the provider's recommended record when it offers
   a managed static-site target; do not guess an IP address.
3. Wait for DNS propagation, then confirm the hostname resolves with `dig`
   or the provider's DNS diagnostics.
4. Issue or enable a certificate for
   `blocking.duongtruongdp.net`, redirect HTTP to HTTPS, and verify the
   certificate covers the exact hostname. The application must be served over
   HTTPS in production.

The upload does not require WordPress `.htaccess`, PHP, or a WordPress plugin.
If the provider uses Apache/Nginx configuration, configure the subdomain's
virtual host/document root there. One-page hosting only needs `/` to serve
`index.html` and `/assets/*` to serve the static hashed files. There are no
client-side routes in this milestone, so do not add a catch-all rewrite. If
future routing is introduced, define the fallback deliberately and test direct
loads of each route.

## Expected document-root layout

After upload, the subdomain document root should look like this:

```text
<subdomain-document-root>/
├── index.html
└── assets/
    ├── index-<hash>.js
    ├── index-<hash>.css
    ├── src-<hash>.js
    └── videoExporter-<hash>.js
```

`index.html` must be directly at `/`. The incorrect layout is
`<document-root>/dist/index.html`, which would make the root URL return a
directory/404 instead of opening the editor.

## Cache and release policy

- `index.html`: `Cache-Control: no-cache` (or a short revalidation lifetime),
  so a release can point users at new hashed assets.
- `/assets/*`: `Cache-Control: public, max-age=31536000, immutable`; filenames
  are content-hashed and safe to retain.
- Do not put a service-worker cache in front of the app. There is no service
  worker/PWA in this project.
- Keep the subdomain outside WordPress page-cache rules. If Cloudflare or
  another CDN is used, configure it as a static origin for this subdomain and
  purge only the subdomain's `index.html` when releasing.

For a release, upload the new assets and `index.html` together when possible.
Keep the previous `index.html` and asset directory as a named backup. Rollback
is restoring that previous static set, then revalidating `/` and the asset
URLs. No database migration or application-state rollback is required.

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

1. Build the root app and V2 app with `npm run build`, then
   `npm run build:web`.
2. Inspect `v2/dist/index.html` and `v2/dist/assets/` for valid root-relative
   references. The production artifact must contain no `.map` files and no
   `/blocking/assets/` references.
3. Build once with `VITE_BASE_PATH=/blocking/` and verify the generated asset
   URLs begin with `/blocking/`; this is a compatibility check only, not the
   production subdomain build.
4. Serve `v2/dist/` through a static server or `vite preview`, not only Vite
   dev middleware. Check `/`, every CSS/JS asset in `index.html`, and the
   lazy `videoExporter` chunk for HTTP 200.
5. Run the manual staging checklist in
   [WEB_DEPLOY_CHECKLIST.md](WEB_DEPLOY_CHECKLIST.md) in Chrome, Safari, and
   Edge as available. Firefox remains best-effort and mobile is outside the
   acceptance gate.
6. Repeat Scene switching, Camera View/Blocking View, Preview toggle, still
   capture, and export to check for stale renderers, listeners, tracks, or
   Blob URLs.

The V2 build currently keeps the Camera database bundled for offline
availability. Video export code and `mediabunny` are loaded only when export
capability detection/export begins; the core editor remains in the initial
chunk. Three.js and the core editor remain the largest initial contributors.

Staging browser acceptance is a required gate and is not implied by automated
tests or a successful build.

## Security, privacy, and dependency audit

The app has no runtime network dependency after its static bundle loads. The
Camera database is bundled, and export code is loaded from the same-origin
hashed asset directory on demand. There are no external fonts, CDN scripts,
analytics, account services, or remote asset URLs required by the editor.

The production bundle should be reviewed for insecure `http://` asset/runtime
references before release. A restrictive CSP can be added at the hosting
layer after checking the generated bundle; do not add `unsafe-eval` merely as
a default. If a future dependency requires it, document that exception and
scope it to the smallest practical deployment. The app does not require
iframe embedding. If WordPress later embeds it, configure `frame-ancestors`
and the embedding permissions at the hosting layer deliberately; do not infer
shared storage or cookies across the two origins.

The build identity is available in the generated document as:

```html
<meta name="nd-build" content="v2-web1a" />
```

This is a quiet diagnostic marker for distinguishing a deployed artifact from
another local or staging copy; it is not shown in the editor UI.
