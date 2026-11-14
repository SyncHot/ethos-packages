# EthOS Backup Manager

Versioned backups for folders and Docker Compose projects, shipped as a native
EthOS Package Center app.

- **Dated generations** — every run is a point-in-time snapshot built with
  `rsync --link-dest`, so unchanged files are hardlinks (cheap incrementals).
- **GFS retention** — default 7 daily / 4 weekly / 6 monthly, pruned only after
  a newer complete generation exists.
- **Completion manifest + verify** — a killed run never looks complete; quick
  (size/mtime) verify runs after each backup, deep (checksum) verify on demand.
- **Queue and cancel** — one operation at a time, additional runs are queued,
  and the UI can cancel the running job.
- **Restore wizard** — pick a generation, restore in place (with an automatic
  pre-restore snapshot) or into another folder, merge or exact.
- **Docker Compose** — discovers every running compose project under the chosen
  folder and snapshots the project config, named volumes and images.
- **Offsite** — optional `rclone` mirror of the newest generation with a
  30-day versioned history on the remote.

## Requirements

- EthOS NAS with Backup Manager API v2 (`GET /api/backup/meta`). The app shows
  "Update EthOS" on older cores.
- Admin account: the backup API is admin-only.
- Docker Engine only for compose-project schedules.
- `rclone` (installed by `setup_scripts/install.sh`) only for offsite copies.
  Configure remotes as the service user, for example
  `sudo -u ethos-nas rclone config`, or point `ETHOS_RCLONE_CONFIG` at a config
  file. Credentials never travel through the EthOS API.

## Uninstalling the app

The backup engine and schedules live in EthOS core. Removing this package only
removes the window and desktop icon — scheduled backups keep running. Reinstall
the package to get the UI back.

## Development

`frontend/app.js` is a self-contained ES module exporting
`render(container, ctx)`. It uses `ctx.apiFetch`, `ctx.pickFolder`,
`ctx.modal`, `ctx.progress` and `ctx.escape`; there are no relative imports
because EthOS loads the module from a blob URL.
