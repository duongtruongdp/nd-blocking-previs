# Privacy

ND Blocking & Previs is designed as a local-first application.

- The Web App does not require an account or a project cloud service.
- Normal editing keeps project state in the browser or in files selected by the
  user. The app does not intentionally upload project files as part of normal
  editing.
- The optional desktop shell uses local project files and native filesystem
  capabilities granted by the app configuration.
- The About/update check can contact the public GitHub Releases API to learn
  whether a newer published version exists. Downloads are opened at the fixed
  GitHub release asset URLs; the app does not install downloaded files.
- The production Web App is served from
  `https://blocking.duongtruongdp.net/`. Hosting providers may have their own
  server logs and policies.

This document describes the current application behavior, not a legal privacy
policy for third-party hosting services. Contact
[ndtruong.contact@gmail.com](mailto:ndtruong.contact@gmail.com) with privacy
questions.
