# Velvet

Private video library for EthOS NAS — a Package Center app for your own 18+
collection, built for VR/180° side-by-side files.

| | |
|---|---|
| Package id | `ethos-velvet` |
| Runtime | `venv` (stdlib service, no wheels) |
| UI | native module, per-account (`user_access: true`) |
| Service port | `127.0.0.1:8100` |
| State | `<DATA_DIR>/packages/data/ethos-velvet/users/<account>/` |
| Extra dependency | host `ffmpeg`/`ffprobe` (already required by EthOS) |

## What it does

- **Folders, not copies.** Add one or more folders with the EthOS folder picker.
  The service walks them in place; video bytes are never copied or uploaded.
- **Single-eye thumbnails.** VR files are side-by-side; every still is cropped
  to the left eye (`crop=iw/2:ih:0:0`) before scaling, so the grid does not show
  a doubled frame.
- **See what a file contains.** A detail view shows six preview frames plus
  ffprobe facts: per-eye resolution, projection (180 SBS / Fisheye / 360 / Mono),
  duration, bitrate, codecs, file size and date.
- **Your own labels.** Freeform tags, a 1–5 rating, a favourite flag and a
  "mark to delete" flag, all filterable.
- **Duplicate detection.** Files with the same cleaned title and a comparable
  runtime are grouped, with the reclaimable size shown per group.
- **Playback.** Direct streaming when the browser can decode the file, otherwise
  HLS through the core Video Station engine, with **Left / Right / SBS** eye
  switching, quality presets, audio-track choice, speed, resume and PiP.
- **Permanent delete.** Multi-select, a typed `DELETE` confirmation and the
  core's background file-delete operation with shared progress. The package
  service never deletes files.
- **Live File Manager sync.** The UI subscribes to `/ws/files/events`:
  deletions, trashed files and renames made in File Manager disappear from the
  library immediately (the row becomes **Missing**, cached stills are purged),
  uploads/copies trigger a targeted rescan of that folder, and a move triggers
  one incremental scan. Velvet's own deletes are ignored by the bridge.

## Per-account model

The core proxy stamps the signed-in account as `X-Ethos-User`. Every account
gets its own SQLite index, tags, ratings, resume points and thumbnail cache;
one account can never read another account's library. The service mirrors the
core path rule: admins may index anything, every other account only its own
home plus `/mnt` and `/media`. `<DATA_DIR>` is never indexable, symlinks are
resolved before the prefix check, and every still request must match a row in
the caller's own index.

The collection itself still lives on a share, so anyone who can browse that
folder in Files can read the files. Velvet does not change the filesystem ACLs.

## Service API (under `/api/packages/ethos-velvet/proxy/`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | liveness + version (no identity) |
| GET | `/state` | folders, settings, scan snapshot |
| PUT | `/folders` | replace folders `{folders:[...]}` |
| POST | `/scan` | start a scan (`{roots?:[...]}`) |
| GET | `/scan/status` | scan progress |
| GET | `/library` | filters (`q, studio, proj, res, tag, rating, dup, favorite, rejected, missing`), `sort`, `limit`, `offset`; returns items + summary + facets |
| GET | `/item?path=` | one row with tags |
| PATCH | `/media` | rating / favourite / reject / title / `tags_add` / `tags_remove` |
| POST | `/media/batch` | the same for up to 500 paths |
| GET | `/tags` | tag counts |
| POST | `/tags/rename`, `/tags/delete` | tag maintenance |
| GET | `/duplicates` | duplicate groups |
| GET/PUT | `/resume` | playback position per file |
| GET/PUT | `/settings` | quality, eye, grid size, auto-scan |
| POST | `/forget` | drop rows + cached stills (never files) |
| POST | `/events` | File Manager bridge: mark removed paths missing, rescan changed folders (`{removed, changed, full}`) |
| GET | `/thumb?path=` | left-eye WebP still — `200`, `202` (`retry_ms`) or `404` |
| GET | `/frame?path=&i=` | preview-strip frame (`0…5`) |

## Core APIs used by the UI

- `GET /api/videos/info?path=` — playback mode, duration, audio tracks
- `GET /api/videos/stream?path=&token=` — direct play (Range)
- `POST /api/videos/hls` + `POST /api/videos/hls/{sid}/stop` — bounded HLS
- `DELETE /api/files/delete {paths}` → `GET /api/files/ops/{op_id}` — permanent delete
- `GET /api/packages/ethos-velvet/ui/frontend/hls.min.js` — vendored hls.js

## Known limits

- **8K VR is heavy.** Most VR masters here are HEVC 7K–8K. The player downscales
  through the Video Station engine; on a small N150-class host the 1080p preset
  may run below real time. Start with 480p/720p when a stream buffers. Direct
  play is used automatically when the browser can decode the file.
- **Alpha/passthrough files** (separate alpha layer) show a badge; HLS cannot
  carry the alpha layer, so the player shows the base video only.
- **No WebXR / mouse-look** in 1.0 — the eye switch is a flat crop.
- **Received shares** are not indexed yet; folders are limited to the account's
  own home, `/mnt` and `/media`.
- **Duplicate detection** relies on a cleaned title plus duration; files with
  different titles will not be grouped.
- **External changes while Velvet is closed** are reconciled by the quick
  incremental scan on open (default) or by Rescan; turn the open scan off in
  Settings if you prefer manual control. The live File Manager sync only runs
  while the Velvet window is open.

## Development

```bash
cd ~/apps/compose/ethos-nas
.venv/bin/python -m unittest discover -s ../ethos-packages/ethos-velvet/tests -v
node --input-type=module --check < ../ethos-packages/ethos-velvet/frontend/app.js
.venv/bin/python scripts/ethos-pack build  --repo ../ethos-packages \
  --base-url https://raw.githubusercontent.com/SyncHot/ethos-packages/main
.venv/bin/python scripts/ethos-pack lint   --repo ../ethos-packages
```

The service reads `VELVET_FFPROBE` / `VELVET_FFMPEG` (tests point them at
fixtures) and `ETHOS_PACKAGE_DATA_DIR` (per-package state).
