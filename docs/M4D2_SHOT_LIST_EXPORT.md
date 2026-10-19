# M4D.2 — Shot List Export Suite

## Export audit

Before M4D.2, the Shot List used `window.print()` against the editor Grid/List DOM. That path exposed the editor header, controls, Inspector, and action buttons, and the browser printed a compact editor layout rather than a dedicated storyboard. The existing high-resolution persisted thumbnail was available in the DOM, but the previous print CSS did not give it a production-document-sized card.

The project did not previously include an XLSX library. CSV remains dependency-free. ExcelJS was added because it is browser-compatible and supports embedding the persisted JPEG thumbnails. The XLSX implementation is loaded dynamically only when Excel export is requested. Export remains local and does not upload project data.

## Canonical export model

`src/core/shotListExport.ts` builds human-readable, read-only rows from the current `ProjectDocument`, normalized Shot List settings, and either the complete project or the current Scene filter. The model resolves project order, Scene name, Shot number/name, Camera name, formatted lens, metadata, duration timecode, notes, and persisted thumbnail data. It intentionally excludes editor actions and Master usage.

The canonical column order is the existing Shot List order. XLSX and print respect enabled columns. CSV also respects enabled columns but always omits Thumbnail because CSV cannot contain embedded images.

## Formats

- **PDF / Print:** uses a dedicated landscape storyboard layout with two cards per row, large thumbnails, readable metadata, full notes, and page-break protection. The browser's Save as PDF flow remains the final PDF writer.
- **XLSX:** one `Shot List` worksheet, project name and title rows, enabled columns, project order, frozen header, AutoFilter, widths, wrapped notes, and embedded persisted thumbnails. Missing thumbnails use `No Thumbnail` text.
- **CSV:** UTF-8 with BOM for spreadsheet compatibility, human-readable headers, standard escaping for commas, quotes, newlines, and Vietnamese text. Thumbnail, Actions, and Master usage are omitted.

## Scope and presentation policy

The export dialog supports `All Shots` and `Current View`. Current View means the active Scene filter; Grid/List mode does not alter the source rows. Export is read-only and does not change selection, ordering, settings, or dirty state.

Present mode and exported output use the title policy:

```text
<Project Name>
Shot List
```

`Visual Planning`, `MASTER ×N`, Open/Preview/Capture/Duplicate/Delete, Options, Grid/List controls, and Actions are editor-only and are excluded from Present mode and every export format. The Master usage calculation remains available to the normal editor Grid view.

## Dependency and future direction

ExcelJS is the only M4D.2 dependency addition. Its browser bundle is lazy-loaded and its image embedding API is used for persisted thumbnails. Future live review/collaboration may follow the M5A direction, but M4D.2 adds no network or collaboration architecture.
