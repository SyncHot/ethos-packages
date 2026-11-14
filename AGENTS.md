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
- **Manifest identity is the window identity.** EthOS renders the package window header and
  taskbar entry from `manifest.name` and `manifest.icon_url`. `name` must be the human-readable
  product name (not the package id, no `pkg-` prefix) and `icon_url` must be the same artwork as
  the Package Center icon. Bump the version so installed clients refresh the identity. Native
  modules must not set the window title themselves. See `.github/skills/package-icon/SKILL.md`.
- **Path selection uses the EthOS picker.** Native package UIs call `ctx.pickFolder(opts)` /
  `ctx.pickFile(opts)` instead of shipping their own browser or forcing users to type absolute
  paths. Pass `roots: ['/home', '/mnt', '/media']` (or the paths the service accepts) so the
  picker cannot navigate outside what the backend will allow; `startPath` and `acceptLabel` are
  optional. Keep a typed input as a fallback for older EthOS versions where `ctx.pickFolder` is
  missing.
- **Every package UI ships light _and_ dark themes.** EthOS persists one theme for the
  whole session: the `<html>` element always carries `light` or `dark`, and the topbar toggle
  switches it at runtime. Native modules must define both palettes and follow the class
  (light is the default); port/iframe UIs receive `?theme=light|dark` and must also fall back to
  `prefers-color-scheme`. No dark-only palettes, no hard-coded surface/text colours outside the
  variable block. See `.github/skills/package-theme/SKILL.md`.
- **Every native window uses the shared package shell.** A package with `ui.mode: "native"` must
  follow `.github/skills/package-ui/SKILL.md` — the same layout and tokens as `backup-manager`,
  `ethos-antivirus`, `domains` and `vmm` (218 px rail, text-only nav, panels, summary tiles,
  tables, tags, status pill). A one-off layout is a review blocker. Only the documented legacy
  exceptions (`ethos-welcome`, `tic-tac-toe`) may differ; do not extend the exception.
- **Bump `version` and prepend `changelog`** for anything users can receive. Without a bump,
  Package Center never offers the update and installed rows keep the old manifest (including the
  old icon).
- **Rebuild, sign and verify** after every edit — an unsigned or stale `index.json` is rejected by
  pinned clients:
  ```bash
  cd ~/apps/compose/ethos-nas
  .venv/bin/python scripts/ethos-pack build  --repo ~/apps/compose/ethos-packages \
    --base-url https://raw.githubusercontent.com/SyncHot/ethos-packages/main
  .venv/bin/python scripts/ethos-pack sign   --repo ~/apps/compose/ethos-packages \
    --key ~/.ethos-pack/ethos-packages/repo.key
  .venv/bin/python scripts/ethos-pack verify --repo ~/apps/compose/ethos-packages \
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
- **Never ship a package-local notification UI.** Use `ctx.notifications.{toast,emit,open}` — one
  global Notification Center, see “Notifications (mandatory)” below.

## Native package UI shell (mandatory)

Every native package window reuses the **shared EthOS package shell** — do not invent a new visual
language. Reference implementations: **`backup-manager/frontend/app.js`** (newest) and
**`ethos-antivirus/frontend/app.js`** (canonical); `domains` and `vmm` follow it too. The full
contract, a copyable skeleton and the class inventory live in
**`.github/skills/package-ui/SKILL.md`** — load it before building or restyling a package window.

- **Root**: `display:flex; height:100%; overflow:hidden;` with the package palette scoped to the
  root element (light defaults + `:root.dark` overrides, see the `package-theme` skill). No teal or
  purple gradients, no raw colours in component rules.
- **Rail**: `flex:none; width:218px; padding:20px 14px; border-right; overflow-y:auto`. Brand =
  26 px emoji + product name + `EthOS package`; nav items are **text-only**, 12 px/600, 9×11 px
  padding, 9 px radius, active `.is-active` uses `--accent-soft`; the foot is pinned (`margin-top:auto`)
  with a status pill (`ready` / `starting` / `offline`) and one short note.
- **Main**: `flex:1; min-width:0; overflow-y:auto; padding:24px 28px 32px`. Header = `<h1>`
  `clamp(22px, 3.4vw, 30px)`, a 12 px muted subtitle and one `role="status"` line. Views are
  `display:flex; flex-direction:column; gap:14px; margin-top:16px`.
- **Building blocks**: panel (17×18 px, 15 px radius), 4-tile summary (9 px uppercase labels,
  20 px values), 11 px tables with 9 px uppercase headers, buttons (`primary` / `danger` / `small`),
  monospace 12 px inputs, tag pills for states, dashed empty state, amber `.startup` callout.
- **Progress & dialogs**: `ctx.progress.startTask` for long work and `ctx.modal` for confirms; never
  hand-roll a progress bar or a second modal implementation.
- **Responsive**: below 780 px the rail becomes a horizontal strip, the foot hides its note and grids
  collapse to one column.
- **Both themes are part of the shell**, not an afterthought: screenshot the window in light and dark
  before publishing.
- **Definition of done**: rail 218 px with a text-only nav, status pill in the foot, panels/summary/
  tables/tags only, `ctx.progress` for long work, `ctx.modal` for confirms, responsive ≤780 px, light
  **and** dark screenshots checked. The checklist in `package-ui/SKILL.md` is the review gate.
- **Legacy exceptions**: `ethos-welcome` (static page) and `tic-tac-toe` (single-card game) keep
  their layouts. New packages and redesigns must not copy that exception.
- Never copy another package's *content*; copy its *layout and tokens*.

## Logging (mandatory)

EthOS has **one** log system (`docs/logs.md` in the EthOS repo). Packages feed it; they never ship a
log viewer, a history list or a log file. A package-local log UI is a review blocker — the Logs app
is the single place users read diagnostics.

```js
// native UI — stored as app="pkg:<id>", source="pkg-ui"
ctx.log('info', 'Scan started', path);
ctx.logger.warn('Cache empty');
```

- `ctx.log(level, message, detail)` / `ctx.logger.{debug,info,warn,error}`. Levels: `debug`, `info`,
  `warning`, `error`. The server verifies `pkg.id`; never send another package's id.
- **Backend/container logs**: write to stdout/stderr (plain or structured). EthOS shows them in the
  Logs app under the package (containers are grouped by the compose project = package id). Do not
  write your own log file or expose a `/api/logs` endpoint of your own.
- Domain datasets (scan results, job history, certificate lists) are **not** logs and may stay local.
- Never log credentials, tokens, API keys or full request bodies.
- Port/iframe UIs run on another origin; use `ctx.log` (native) or stdout — the EthOS reporter cannot
  see their console.

## Notifications (mandatory)

EthOS has **one** Notification Center: a bell badge, a right-edge history sheet,
toasts, optional sound and desktop alerts. Packages plug into it — they never
build their own toast, panel, badge or event list. A local notification UI is a
review blocker: it double-renders the unread count and breaks the global bell.

```js
// inside render(container, ctx) — ui.mode: "native" only
ctx.notifications.toast('Scan finished', 'success');          // transient toast
ctx.notifications.emit({                                      // persisted in the sheet
  kind: 'info', title: 'Scan finished', message: '0 threats found',
  action: { label: 'Open', appId: 'pkg-antivirus' },
});
ctx.notifications.open('unread');                             // focus the sheet
ctx.notify('Saved', 'success');                               // legacy toast-only alias
```

- `kind` is `success` | `error` | `warning` | `info`. `action` opens an EthOS app
  (`appId`) or a same-origin path (`href`).
- `emit()` is stored with `source="pkg:<package-id>"`, derived server-side from
  the installed package. Do not pass a `source`, and never try to impersonate
  another subsystem (`health`, `downloads`, `system`, …).
- `ctx.notifications` exists for `ui.mode: "native"` modules only. Port/iframe UIs
  run on their own origin and cannot reach the EthOS API — their events must come
  from their backend, and they must not build an in-iframe notification panel.
- Long-running work: `ctx.progress.startTask()` drives the shared progress panel,
  then **one** `emit()` at the end — not one notification per file or scan item.
- Style with EthOS CSS variables; no hardcoded colours or emoji icons in anything
  notification-shaped (the shell owns the visuals entirely).

Contract and rationale: `ethos-nas/docs/notifications.md`. EthOS enforces the
same rule on its own apps (`tests/test_notification_ui.py`).

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
- Desktop icons and the App Drawer read `/api/packages/desktop-icons`, which exposes `icon_url`
  (absolute HTTPS only) and the emoji `icon` as fallback, so the same artwork appears everywhere.

## Workflow

- One package change per commit: `feat(<package-id>): …` or `fix(<package-id>): …`.
- After editing: bump version, rebuild/sign/verify, commit `manifest.json`, `icon.svg`, `index.json`
  and `index.json.sig` together.
- Keep the README catalog table in sync (package, version, UI, description).
