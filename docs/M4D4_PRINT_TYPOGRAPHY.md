# M4D.4 Print Typography + Table Geometry

M4D.4 keeps browser Print/Save as PDF as the authoritative PDF path and
refines the existing M4D.3 layouts without changing stored Shot metadata or
the XLSX/CSV export contracts.

## Safe area

Print uses an 8mm landscape `@page` margin and a normal-flow print document
with `6mm 8mm 8mm` internal padding. The physical page margin and document
padding are intentionally separate so the visible header, storyboard grid,
and Shot List table share one predictable inset.

## Shot identity

`formatShotDisplayIdentity()` detects generated names such as `Shot 01` from
the Shot order. Generated names are shown once. Custom names retain the Shot
ordinal and name, using a two-line-friendly heading for Storyboard and a
compact ordinal/name value for the table.

## List table geometry

The print table remains semantic and fixed-layout. Visible columns receive
normalized weights from the canonical print policy, so hidden columns do not
reserve blank space. Duration remains one line, compact production fields use
nowrap when short, Notes wraps, and thumbnail cells target a useful 24mm row
height with a 26mm image width.

## Pagination

The table header remains a repeating `thead`, rows avoid page breaks where
supported, and no scale transform or one-page compression is used.
