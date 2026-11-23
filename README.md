# EthOS Community Packages

Signed package repository for [EthOS NAS](https://github.com/SyncHot/ethos-nas).

The catalog is generated from `index.json` — run `ethos-pack readme` after a build.

<!-- catalog:start -->
| Package | Version | UI | What it is |
|---|---|---|---|
| `backup-manager` 🔄 | 1.0.3 | native | Versioned backups for folders and Docker Compose projects. Dated hardlink snapshots, GFS retention, quick/deep verify, a restore wizard and optional… |
| `domains` 🌐 | 1.2.2 | native | Reverse proxy with free, automatically renewed HTTPS certificates. Point your own domains at this NAS and forward them to any host and port - another… |
| `download-manager` ⬇️ | 1.1.2 | native | HTTP, magnet and debrid downloads with a priority queue, categories, a daily schedule, bandwidth limits and RSS rules — in a native EthOS window. |
| `ethos-antivirus` 🛡️ | 2.1.6 | native | ClamAV antivirus with a native EthOS window: full, custom and scheduled scans, quarantine copies, scan logs and configurable scan options. Read-only… |
| `ethos-books` 📚 | 1.2.1 | native | Read EPUB and PDF books and listen to audiobooks that already live on your NAS. Folders are browsed through the EthOS file API, so nothing is copied… |
| `ethos-cleaner` 🧹 | 2.0.0 | native | Find what is eating your disk — folder sizes, biggest files, junk cleanup, EthOS caches and Docker leftovers — with recoverable deletes. |
| `ethos-docker` 🐳 | 1.0.5 | native | Engine status, containers, images, volumes and Compose projects in one place: start, stop, restart, inspect logs, prune and install Docker Engine on… |
| `ethos-editor` ⌨️ | 1.0.2 | native | A VS Code-style workbench in the browser: single files or whole folders, tabs and breadcrumbs, search, Source Control with inline git gutters, split… |
| `ethos-git` 🦊 | 1.0.1 | window 3005 | Self-hosted Git for your NAS: repositories, issues, pull requests, releases and a web editor, reachable on your LAN or through the Domains package. G… |
| `ethos-git-diff` ⎇ | 1.0.1 | native | Side-by-side diff with partial (hunk and line) staging, commit box, pull/push and recent history for any Git repository on your shares. Opening a dif… |
| `ethos-kanban` 🗂️ | 1.0.3 | native | Boards, columns and cards with drag and drop, labels, due dates and a card editor. Now a Packages app: the board lives in the package's own service a… |
| `ethos-media-enhance` 🎯 | 1.0.2 | engine | Face-aware video thumbnails for Files: picks the frame with the largest face and crops around it instead of using a random shot. OpenCV runs in a pri… |
| `ethos-monitor` 📈 | 1.0.1 | window 3091 | Watch the things a NAS is supposed to keep alive: web apps, routers, printers, cameras and other servers. Uptime Kuma pings HTTP, TCP, DNS and ICMP e… |
| `ethos-music` 🎵 | 1.0.3 | native | Spotify-style player for your NAS: search and stream from YouTube, a downloaded library, playlists, likes, radio stations and podcasts, all shared wi… |
| `ethos-music-engine` 🎵 | 1.0.1 | engine | YouTube search, streaming and downloads for the Music app and the EthOS Music Android app. yt-dlp runs in a private environment that only this packag… |
| `ethos-photos` 📷 | 1.0.3 | native | Photos for your NAS: a timeline of every photo and video on your shares, albums, favourites, a private PIN-protected section and a full-screen viewer… |
| `ethos-rss` 📰 | 1.0.1 | window 8085 | A news reader that lives on the NAS and keeps your feeds, read state and stars in one place instead of in a phone app's silo. FreshRSS fetches RSS/At… |
| `ethos-shares` 📁 | 1.3.0 | native | Manage SMB shares, per-user and group access rules, and Samba credentials for existing Linux accounts. Includes permission masks, service status, and… |
| `ethos-sticky-notes` 🗒️ | 2.0.0 | native | Per-account notes and checklist tasks: search, pin, archive, due dates, reminders with browser push, and a collapsible right-edge desktop ribbon. |
| `ethos-surveillance` 📹 | 2.0.1 | native | Surveillance Station for EthOS: live HLS wall, continuous or scheduled recording with retention, timeline playback and MP4 export, masked motion zone… |
| `ethos-sync` 🔁 | 1.0.2 | window 8384 | Keep folders in sync between this NAS, laptops, phones and other servers. Syncthing transfers directly between devices — no cloud account in the midd… |
| `ethos-velvet` 🍑 | 1.0.0 | native | A private library for your personal 18+ video collection. Pick folders on the NAS and get single-eye thumbnails for VR/180° side-by-side files, a fra… |
| `ethos-video` 🎬 | 2.3.1 | native | Browse and watch the videos on your NAS: a cinema library with poster shelves, Continue Watching, Movies/Series, search and My List; HLS playback for… |
| `ethos-welcome` 🌅 | 1.0.4 | window 8090 | A tiny static welcome page for your NAS, served by nginx on port 8090. |
| `tic-tac-toe` ❌ | 2.1.1 | native | A tiny two-player tic-tac-toe game that opens directly in an EthOS window. No container, no port. |
| `vmm` 🖥️ | 1.2.1 | native | Run Windows and Linux virtual machines on this NAS with hardware acceleration. Create a VM from an ISO or boot a ready-made system image such as the… |
<!-- catalog:end -->

Every manifest declares the EthOS version it needs (`min_ethos_version`, enforced at install
time) and ships a Package Center icon (`<package-id>/icon.svg`) referenced by `icon_url`.

## Add this repository

In EthOS open **Package Center → Sources → Add source** and use:

- **URL:** `https://raw.githubusercontent.com/SyncHot/ethos-packages/main/index.json`
- **Trust:** Signed (pinned key)
- **Public key:**

```text
sXiL7v0droY2BVyttuDt0Bqq6jB7MpknylJo+/iavqE=
```

- **Key fingerprint:** `47254c572056ec99` — compare it out-of-band with the
  publisher before adding the source. The private key is never stored in this
  repository.

A pinned source verifies `index.json.sig` before reading the catalog, and every
manifest, compose file and package file is checked against its `sha256`.

After adding the source, open **Available**, select a package, and click
**Install**. Packages with `ui.mode: "native"` render their module directly in an
EthOS window and do not need an exposed port. The antivirus container binds its API
to `127.0.0.1:8092`; EthOS reaches it through an authenticated proxy.

Native UI packages require a **pinned, signed** source because their module runs
with the EthOS session. Only install them from publishers you trust.

The antivirus package runs ClamD as root **inside its container** so it can read
shares with `0660` permissions. The host shares are mounted read-only and the
container has no writable host bind. Settings, scan logs, quarantine copies and
schedule definitions live in the `antivirus-data` volume, so they survive
package updates.

## Repository layout

```text
index.json          generated catalog
index.json.sig      detached Ed25519 signature over index.json
repo.pub            public key (the matching private key is never committed)
ethos-welcome/
├── manifest.json
├── icon.svg        Package Center icon (icon_url)
├── docker-compose.yml
└── site/
    ├── index.html
    └── style.css
```

## Package icons

Package Center renders `icon_url` as an image in the catalog, installed list and
detail header; the emoji `icon` stays as the desktop-shortcut fallback.
The same `manifest.name` and `icon_url` are used by the package **window header
and taskbar**, so `name` must be the human-readable product name (not the package
id).

- Icon file: `<package-id>/icon.svg` — 256×256 viewBox, rounded-square
  background, no text, legible at 20 px.
- Manifest: `"icon_url": "https://raw.githubusercontent.com/SyncHot/ethos-packages/main/<package-id>/icon.svg"`
  and `"icon.svg"` in `files[]`.
- Bump `version`, rebuild and sign, or installed clients keep the old icon.

Details and a checklist: [`AGENTS.md`](AGENTS.md) and
[`.github/skills/package-icon/SKILL.md`](.github/skills/package-icon/SKILL.md).

## Light and dark themes

Every package UI supports both themes; EthOS keeps one appearance for the whole session and the
topbar toggle switches `<html class="light">` / `<html class="dark">` at runtime.

- Native modules (`ui.mode: "native"`) define light defaults on the package root and dark
  overrides under `:root.dark`, using CSS variables and `color-scheme`.
- Port/iframe UIs receive `?theme=light|dark` and fall back to `prefers-color-scheme`.
- No dark-only palettes or hard-coded surface/text colours.

Details and a checklist: [`.github/skills/package-theme/SKILL.md`](.github/skills/package-theme/SKILL.md).

## Window UIs and ports

A package with a web UI is embedded in an EthOS window by loading its own port, so the manifest
must state whether that port is reachable on your network and whether the app brings a login:

```json
"ui": { "mode": "window", "port": 3001, "path": "/", "expose": "lan", "auth": "package" }
```

`expose` is `loopback` (default) or `lan`; `auth` is `package` or `none` and is required for `lan`.
Package Center shows that in the detail dialog and asks for an explicit confirmation when a port
has no login. A service that writes to `/mnt` or `/media` should run as the NAS account
(`PUID: "${ETHOS_SERVICE_UID:-1000}"`) — EthOS passes `ETHOS_SERVICE_UID`/`ETHOS_SERVICE_GID` to
`docker compose`.

## Rebuilding and signing

The CLI lives in the EthOS NAS repository. `lint` enforces the catalog rules (pinned images,
`restart:`, `ui.expose`/`ui.auth`, README drift) and `readme` regenerates the table above.

```bash
cd ~/apps/compose/ethos-nas

# One-time key generation (keep the private key outside this repo)
.venv/bin/python scripts/ethos-pack keygen --out-dir ~/.ethos-pack/ethos-packages
cp ~/.ethos-pack/ethos-packages/repo.pub ~/apps/compose/ethos-packages/repo.pub

# After editing a package, regenerate the index and signature
.venv/bin/python scripts/ethos-pack build \
  --repo ~/apps/compose/ethos-packages \
  --base-url https://raw.githubusercontent.com/SyncHot/ethos-packages/main
.venv/bin/python scripts/ethos-pack readme --repo ~/apps/compose/ethos-packages
.venv/bin/python scripts/ethos-pack lint   --repo ~/apps/compose/ethos-packages
.venv/bin/python scripts/ethos-pack sign \
  --repo ~/apps/compose/ethos-packages \
  --key ~/.ethos-pack/ethos-packages/repo.key
.venv/bin/python scripts/ethos-pack verify \
  --repo ~/apps/compose/ethos-packages \
  --pub ~/.ethos-pack/ethos-packages/repo.pub
```

Bump `version` in the changed package's `manifest.json` before publishing so
Package Center offers an update.

## License

MIT
