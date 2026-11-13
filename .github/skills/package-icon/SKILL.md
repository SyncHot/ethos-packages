---
name: package-icon
description: "Add or fix a Package Center icon for an EthOS package. Use when a package shows only an emoji or 📦 placeholder, when creating a new package, or when icons are missing after publishing."
argument-hint: "Which package needs an icon?"
---

# Package Center icon

## How icons reach the UI

- `frontend/static/apps/packages.js` → `_icon(pkg)` renders `icon_url` as `<img>`, falls back to the
  emoji `icon`, then to 📦.
- The catalog comes from `index.json`; the installed list comes from the record written at install
  time (a copy of the verified manifest). **A version bump is required** before existing installs
  see a new icon.
- `manifest.icon_url` and `index.icon_url` are passed through by `ethos-pack build`; it does not
  rewrite them, so they must already be absolute HTTPS URLs.
- Desktop shortcuts use `/api/packages/desktop-icons`, which serializes only the emoji `icon`.

## Procedure

### 1. Draw `<package-id>/icon.svg`

- `viewBox="0 0 256 256"`, `width="256" height="256"`, `role="img"` + `<title>`.
- Rounded-square background: `<rect width="256" height="256" rx="56" fill="url(#bg)"/>`, gradient
  from a saturated top-left to a darker bottom-right; optional white radial sheen.
- One large, high-contrast glyph (white or near-white) — no text, no fine lines, no more than ~3
  visual elements.
- Must read at 20 px: Package Center renders 20 px (table), 26–28 px (lists), 34–38 px (detail).
- Keep every id (`bg`, `sheen`, …) unique within the file; no external references, scripts or
  embedded raster images.

### 2. Point the manifest at it

```json
"icon": "🛡️",
"icon_url": "https://raw.githubusercontent.com/SyncHot/ethos-packages/main/<package-id>/icon.svg",
"files": [ ..., "icon.svg" ]
```

Add `"icon.svg"` as a string entry in `files[]` — `ethos-pack build` rewrites it to
`{url, sha256, path, mode}` and ships it inside the installed package.

### 3. Bump and document

- Patch-bump `version` (`1.0.0` → `1.0.1`).
- Prepend to `changelog`: `"1.0.1: Package Center icon. 1.0.0: …"`.
- Update the README catalog table if the version changed.

### 4. Rebuild, sign, verify

```bash
cd ~/apps/compose/ethos-nas
.venv/bin/python scripts/ethos-pack build  --repo ~/ethos-packages \
  --base-url https://raw.githubusercontent.com/SyncHot/ethos-packages/main
.venv/bin/python scripts/ethos-pack sign   --repo ~/ethos-packages \
  --key ~/.ethos-pack/ethos-packages/repo.key
.venv/bin/python scripts/ethos-pack verify --repo ~/ethos-packages \
  --pub ~/.ethos-pack/ethos-packages/repo.pub
```

Commit `icon.svg`, `manifest.json`, `index.json`, `index.json.sig` together.

### 5. Verify the published asset

```bash
curl -sI https://raw.githubusercontent.com/SyncHot/ethos-packages/main/<package-id>/icon.svg \
  | grep -i content-type
```

Expect `image/svg+xml`. Then in EthOS: Package Center → Sources → Refresh, and confirm the icon in
**Available**, **Installed** and the package detail header. Existing installs need the version bump
to be offered as an update.

## Common failures

| Symptom | Cause |
|---|---|
| Emoji shown instead of the image | `icon_url` missing/null in `index.json` (rebuild+sign) |
| Blank square | Relative URL, non-HTTPS URL, or server returns `text/plain` |
| Icon appears in Available but not Installed | No version bump — the install record still has the old manifest |
| Icon file missing after install | `"icon.svg"` not listed in `files[]` |
| Catalog refuses to refresh | Forgot `ethos-pack sign` after `build` |
