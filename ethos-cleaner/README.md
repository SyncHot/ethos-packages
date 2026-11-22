# Disk Cleaner

Analyse disk usage and reclaim safe junk without guessing.

- **Package id:** `ethos-cleaner` · **Runtime:** files · **UI:** native (window) · **Admin only**
- **API:** EthOS core `/api/disk-clean/*` plus the storage, system, files and Docker endpoints.

## What it does

- **Analyze** — folder-size tree with drill-down, a squarified space map, a biggest-files view,
  name filter and sorting. Scans run as background jobs with live progress and a Cancel button.
- **Cleanup** — trash, `/tmp`, `~/.cache`, `/var/log` and package caches with SAFE/CAUTION tags,
  per-item and bulk deletion (chunked, with real byte progress in the shared task panel).
- **Caches & apps** — EthOS managed caches (thumbnails, transcodes, upload staging, recycle bin),
  Docker images/volumes prune, systemd journal vacuum and orphan package data.
- **Activity** — reclaim history (freed bytes, item counts, failures) and a link to the unified Logs.

Safety: user content is moved to the **per-user EthOS trash** (restore from Files → Trash) unless a
junk category is explicitly permanent. The backend rejects `/`, system roots and every EthOS-managed
tree (`<DATA_DIR>`, the checkout, `/var/lib/docker`), and checks every path against the caller's
`path_scope`.

Long scans, deletes and the journal vacuum report through the shared EthOS progress panel.
Diagnostics go to the unified Logs app (`pkg:ethos-cleaner`).

## Development

`frontend/app.js` is a self-contained native module exporting `render(container, ctx)`; it follows
the shared package shell (`ethos-packages/.github/skills/package-ui/SKILL.md`). Bump `version`,
prepend a one-line `changelog`, then rebuild/sign with `ethos-pack` (see the main README).
