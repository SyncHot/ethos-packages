# AGENTS.md — EthOS Community Packages

Signed static repository for [EthOS NAS](https://github.com/SyncHot/ethos-nas) Package Center.
The catalog is `index.json` + `index.json.sig`; every manifest, compose file and `files[]` entry is
referenced by `sha256`. Nothing is served until the index is rebuilt and signed.

## Layout

```text
index.json          generated catalog (never hand-edit)
index.json.sig      detached Ed25519 signature over index.json
repo.pub            publisher public key (private key never committed)
<package-id>/
├── manifest.json
├── icon.svg          required — Package Center icon
├── docker-compose.yml
└── ...files listed in manifest.files[]
```

## Hard rules

- **Every package ships an icon.** `manifest.json` must contain an absolute `icon_url` pointing at
  `<package-id>/icon.svg` in this repository, and `"icon.svg"` must be listed in `files[]`. The
  emoji `icon` stays as the desktop-shortcut fallback. See
  `.github/skills/package-icon/SKILL.md`.
- **Bump `version` and prepend `changelog`** for anything users can receive. Without a bump,
  Package Center never offers the update and installed rows keep the old manifest (including the
  old icon).
- **Rebuild, sign and verify** after every edit — an unsigned or stale `index.json` is rejected by
  pinned clients:
  ```bash
  cd ~/apps/compose/ethos-nas
  .venv/bin/python scripts/ethos-pack build  --repo ~/ethos-packages \
    --base-url https://raw.githubusercontent.com/SyncHot/ethos-packages/main
  .venv/bin/python scripts/ethos-pack sign   --repo ~/ethos-packages \
    --key ~/.ethos-pack/ethos-packages/repo.key
  .venv/bin/python scripts/ethos-pack verify --repo ~/ethos-packages \
    --pub ~/.ethos-pack/ethos-packages/repo.pub
  ```
- **Never commit `repo.key`** or any private key material. Only `repo.pub` belongs here.
- Remote URLs must be HTTPS under
  `https://raw.githubusercontent.com/SyncHot/ethos-packages/main/`. No relative URLs and no
  `main`-less forks — clients resolve the manifest against the internet, not against the NAS.
- Lifecycle scripts (`preinst`, `postinst`, `prerm`, `postrm`) are rejected by EthOS; ship compose +
  declarative `files[]` instead.
- Package ids: `^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$`; reserved ids (`packages`, `trash`,
  `snapshots`, …) are rejected.

## Icons

- File: `<package-id>/icon.svg`, 256×256 `viewBox`, rounded-square background (`rx="56"`), no text,
  legible at 20 px (Package Center uses 20–48 px, `object-fit: cover`, `border-radius: 8px`).
- Manifest:
  ```json
  "icon": "🛡️",
  "icon_url": "https://raw.githubusercontent.com/SyncHot/ethos-packages/main/ethos-antivirus/icon.svg",
  "files": [..., "icon.svg"]
  ```
- `raw.githubusercontent.com` serves `.svg` as `image/svg+xml`; other hosts may serve
  `text/plain` and the `<img>` will stay blank. Verify with `curl -sI`.
- Desktop icons still come from `/api/packages/desktop-icons`, which only serializes the emoji
  `icon`; the SVG is a Package Center (catalog, installed, detail) feature.

## Workflow

- One package change per commit: `feat(<package-id>): …` or `fix(<package-id>): …`.
- After editing: bump version, rebuild/sign/verify, commit `manifest.json`, `icon.svg`, `index.json`
  and `index.json.sig` together.
- Keep the README catalog table in sync (package, version, UI, description).
