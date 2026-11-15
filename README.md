# EthOS Community Packages

Signed package repository for [EthOS NAS](https://github.com/SyncHot/ethos-nas).

The catalog currently contains twenty-one packages:

| Package | Version | UI | What it is |
|---|---|---|---|
| `backup-manager` 🔄 | 1.0.3 | native | Versioned backups for folders and Docker Compose projects: hardlink snapshots, 7/4/6 retention, verify, restore wizard and optional rclone offsite copies |
| `domains` 🌐 | 1.2.1 | native | Caddy reverse proxy with automatic Let's Encrypt certificates for your own domains |
| `download-manager` ⬇️ | 1.0.4 | native | HTTP, magnet and debrid downloads with a priority queue (drag-and-drop), categories, a daily start window, bandwidth limits, RSS rules and watch folders; uses the core Download Station API |
| `ethos-antivirus` 🛡️ | 2.1.5 | native | ClamAV scanner with quarantine, scan history, scheduled scans and scan settings for `/home`, `/mnt`, `/media`; API via authenticated proxy |
| `ethos-books` 📚 | 1.0.0 | native | EPUB/PDF reader and audiobook player for books already on the NAS: folders are scanned through the core file API, progress and covers per account; ships a small venv service (`user_access`) |
| `ethos-cleaner` 🧹 | 1.0.1 | native | Disk space analyzer, biggest files and safe cleanup suggestions (trash, temp, caches, journal) through the core disk-clean API |
| `ethos-docker` 🐳 | 1.0.4 | native | Containers, images, volumes and Compose projects; the Docker engine itself stays host software installed through the privileged helper |
| `ethos-editor` ⌨️ | 1.0.1 | native | VS Code-style workbench: files and folders, tabs, find/replace, Source Control with inline git gutters, terminals, Problems/Output and Markdown preview |
| `ethos-git-diff` ⎇ | 1.0.1 | native | IntelliJ-style side-by-side diff with hunk staging/unstaging, backed by the core editor git API |
| `ethos-kanban` 🗂️ | 1.0.1 | native | Kanban boards with drag & drop, labels and due dates; ships a small venv service (`user_access`) |
| `ethos-media-enhance` 🎯 | 1.0.1 | engine | Face-aware video thumbnails for File Station (OpenCV in the package's private venv) |
| `ethos-music` 🎵 | 1.0.1 | native | Spotify-style Music desktop app sharing playlists, likes and history with the Android app |
| `ethos-music-engine` 🎵 | 1.0.1 | engine | yt-dlp search/stream/download for Music, installed offline from a pinned wheelhouse |
| `ethos-photos` 📷 | 1.0.1 | native | Photo library: folders, grid/timeline, calendar, Moments, albums, favourites and the PIN-encrypted Private section |
| `ethos-shares` 📁 | 1.2.1 | native | Samba share management; Samba is installed with the package through the host-dependency helper |
| `ethos-sticky-notes` 🗒️ | 1.0.0 | native | Per-account sticky notes on colored cards with auto-save, reorder and five pastel colors; ships a small venv service (`user_access`) |
| `ethos-surveillance` 📹 | 1.0.1 | native | Camera monitoring: live MJPEG grid, motion detection and an event timeline; recording stays in the core |
| `ethos-video` 🎬 | 1.0.1 | native | Video Station: movies/series, search, My List, resume positions and an in-window player |
| `ethos-welcome` 🌅 | 1.0.3 | window 8090 | Static welcome page served by nginx (the reference port UI; no EthOS login) |
| `tic-tac-toe` ❌ | 2.1.1 | native | Two-player game inside an EthOS window; no container or port |
| `vmm` 🖥️ | 1.0.3 | native | EthOS VM Manager — KVM virtual machines with a browser console, qcow2 disks on your shares and autostart; needs `/dev/kvm` (`capabilities: ["kvm"]`) |

All packages declare `min_ethos_version: "2.0.0"`. Every package ships a Package Center icon
(`<package-id>/icon.svg`) referenced by `icon_url` in its manifest.

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

## Rebuilding and signing

The CLI lives in the EthOS NAS repository:

```bash
cd ~/apps/compose/ethos-nas

# One-time key generation (keep the private key outside this repo)
.venv/bin/python scripts/ethos-pack keygen --out-dir ~/.ethos-pack/ethos-packages
cp ~/.ethos-pack/ethos-packages/repo.pub ~/apps/compose/ethos-packages/repo.pub

# After editing a package, regenerate the index and signature
.venv/bin/python scripts/ethos-pack build \
  --repo ~/apps/compose/ethos-packages \
  --base-url https://raw.githubusercontent.com/SyncHot/ethos-packages/main
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
