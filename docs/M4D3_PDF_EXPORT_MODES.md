# M4D.3 — PDF Export Modes + Print Margins

## Root cause

M4D.2 rendered a dedicated print-only storyboard container whenever printing was initiated. The live List table remained editor-only and the `@media print` rules hid it, so PDF/Print always produced Storyboard cards regardless of the active Grid/List view.

## Print model

The canonical export rows remain shared with XLSX and CSV. `buildShotListPrintModel()` adds only a print layout choice:

- `storyboard` — large visual cards, two per row in landscape.
- `list` — semantic `table` output with enabled columns, compact thumbnails, wrapped Notes, and no Actions/Master usage.

The Export Shot List dialog defaults PDF/Print from the active view and exposes an explicit layout override. XLSX and CSV do not expose or consume the PDF layout choice.

## Page policy

Print uses `@page { size: landscape; margin: 12mm 14mm; }`, full-width content inside that printable area, a spaced project/title header, and no negative offsets or viewport-width positioning. Storyboard cards and table rows use page-break avoidance. The table uses `thead { display: table-header-group; }` so browsers can repeat the header on subsequent pages when supported.

Print never scales all Shots onto one page. The browser remains responsible for Save as PDF in Web builds. The packaged desktop app uses the same print model to render isolated landscape pages into a lightweight JPEG-backed PDF, then saves those bytes through the existing native export file dialog. This avoids relying on `window.print()` inside the Tauri WebView while keeping the browser print path unchanged.

Desktop PDF behavior

- `storyboard` and `list` use the shared `ShotListPrintModel`, including enabled columns, thumbnails, missing-thumbnail fallbacks, long values, and Unicode rendered by the platform canvas font.
- Native success is shown only after the bytes have been written. Cancelled destination selection returns to the dialog without success, and write/reveal failures remain explicit.
- The generated PDF is intentionally dependency-free and image-backed; it is optimized for reliable previs delivery rather than selectable/searchable PDF text.
