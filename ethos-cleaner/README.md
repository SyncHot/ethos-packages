# Disk Cleaner

Analyse disk usage and clean safe junk: folder/file size trees, biggest files, trash/temp/cache
suggestions and a systemd-journal vacuum.

- **Package id:** `ethos-cleaner` · **Runtime:** files · **UI:** native (window)
- **API:** EthOS core `/api/disk-clean/*`; every delete goes through the scoped file service and
  the shared Trash, so it is recoverable.

Long scans, deletes and the journal vacuum report through the shared EthOS progress panel.
Diagnostics go to the unified Logs app (`pkg:ethos-cleaner`).

## Development

`frontend/app.js` is a self-contained native module exporting `render(container, ctx)`. Bump
`version`, prepend `changelog`, then rebuild/sign with `ethos-pack` (see the main README).
