# Sticky Notes

Per-account notes and checklist tasks for EthOS NAS, with three surfaces that share one store:

- a native **package window** (full management, search, archive, settings);
- a collapsible **right-edge desktop ribbon** for quick capture;
- an installable mobile PWA at **`/notes`** (quick capture, offline queue, Web Push).

- **Package id:** `ethos-sticky-notes` · **Version:** 2.0.0 · **Requires EthOS:** 2.14.1+
- **Runtime:** `venv` · **Service:** `server/main.py` on `127.0.0.1:8099`
- **UI:** native (`frontend/app.js`) + ribbon (`frontend/ribbon.js`)
- **Proxy:** `/api/packages/ethos-sticky-notes/proxy/…`; `user_access: true`, so every signed-in
  account sees only its own notes.
- **State:** `<DATA_DIR>/packages/data/ethos-sticky-notes/`
  - `notes.json` (v2) — `{version: 2, users: {name: [note, …]}}`
  - `settings.json` (v1) — per-account `{ribbon_enabled, ribbon_show_completed}`
  - `push.json` (v1) — VAPID public key + ≤ 5 subscriptions per account
  - `vapid_private.pem` (0600) — generated on first push use
  The first start imports the legacy built-in widget store `<DATA_DIR>/sticky_notes.json`.

## Features

- Notes and checklist tasks on five colors; pin, archive and delete.
- Search across note text and checklist items; filters all / notes / tasks / archive.
- Due dates and reminders; finished checklists never remind.
- Reminder delivery by Web Push (VAPID, per-device subscription) with an in-app
  `/reminders/due` fallback and a test notification.
- Right-edge ribbon: quick add note/task, toggle checklist items, pin, open the app; it reserves a
  44 px desktop gutter while enabled.
- Mobile PWA `/notes`: install prompt, New note/New task shortcuts, GET share target, offline
  cache + bounded outbox, service-worker `push`/`notificationclick`.
- All feedback uses the global Notification Center and the unified Logs app; the package ships no
  toast, panel, badge or log viewer of its own.

## Data model

```jsonc
{
  "id": "sn_a1b2c3d4e5f6",
  "kind": "note",                 // note | checklist
  "text": "buy milk",             // ≤ 2000 chars
  "items": [                      // ≤ 100; forces kind=checklist
    {"id": "ci_0123456789ab", "text": "2 l", "done": false}  // item ≤ 500 chars
  ],
  "color": "yellow",              // yellow | pink | blue | green | orange
  "pinned": false,
  "archived": false,
  "due_at": "2026-11-20",         // YYYY-MM-DD or null
  "reminder_at": "2026-11-20T09:00:00+00:00",
  "reminder_fired_at": null,
  "created_at": "2026-11-19T10:00:00+00:00",
  "updated_at": "2026-11-19T10:05:00+00:00"
}
```

Caps: 200 notes/account, 100 items/checklist, 256 KiB request body. Client ids (`sn_`/`ci_` + 12
hex) make retries idempotent, which the PWA offline outbox relies on.

## API

All paths are service paths under `/api/packages/ethos-sticky-notes/proxy`.

| Method | Path | Body | Result |
|---|---|---|---|
| GET | `/api/sticky-notes` | — | `{"notes": [...]}` |
| POST | `/api/sticky-notes` | `{client_id?, kind?, text?, color?, items?}` | 201 `{notes, note}` |
| PUT | `/api/sticky-notes/{note}` | `{text?, color?, kind?, pinned?, archived?, due_at?, reminder_at?}` | `{notes, note}` |
| DELETE | `/api/sticky-notes/{note}` | — | `{notes}` |
| POST | `/api/sticky-notes/{note}/move` | `{"direction": "up"\|"down"}` | `{notes}` |
| POST | `/api/sticky-notes/{note}/items` | `{text, client_id?}` | 201 `{notes, note}` |
| PUT | `/api/sticky-notes/{note}/items/{item}` | `{text?, done?}` | `{notes, note}` |
| DELETE | `/api/sticky-notes/{note}/items/{item}` | — | `{notes, note}` |
| GET | `/api/sticky-notes/settings` | — | `{settings}` |
| PUT | `/api/sticky-notes/settings` | `{ribbon_enabled?, ribbon_show_completed?}` | `{settings}` |
| GET | `/api/sticky-notes/reminders/due` | — | `{reminders: [...]}` (claims them) |
| GET | `/api/sticky-notes/push/key` | — | `{public_key}` |
| POST | `/api/sticky-notes/push/subscribe` | `{subscription}` | `{ok, subscriptions}` |
| POST | `/api/sticky-notes/push/unsubscribe` | `{endpoint}` | `{ok, removed}` |
| POST | `/api/sticky-notes/push/test` | — | `{ok, sent, failed, ...}` |
| GET | `/health` | — | `{ok, version, user, push}` |

Errors: 400 bad input, 401 missing proxy identity, 404 unknown note/item, 409 note cap, 413 body
too large, 503 push unavailable.

## Reminders and Web Push

The service runs a 30 s scheduler. A reminder fires when `reminder_at <= now` and it is no older
than 24 h; archived and completed checklists are skipped. Push uses an installation VAPID P-256 key
and validates subscription endpoints (HTTPS, public IP, no credentials, ≤ 2048 chars) on subscribe
and again before every send. `sw.js` in EthOS core shows the notification and routes clicks to
`/notes?note=<id>`. Users without a subscription get the in-app `/reminders/due` fallback.

Push requires HTTPS (or localhost) and the browser permission; the package and PWA both offer
enable/disable and a test notification. Permission is requested through the core
`requestNotificationPermission()` helper — never directly by the package.

## Ribbon

`manifest.json` declares:

```json
"ui": {
  "mode": "native",
  "entry": "frontend/app.js",
  "ribbon": {"entry": "frontend/ribbon.js", "title": "Sticky Notes"}
}
```

`frontend/ribbon.js` exports `mount(host, ctx)`. The core mounts it in `#ethos-ribbon-host` (z 950,
hidden below 900 px), provides `ctx.proxy`, `ctx.notifications`, `ctx.log`, `ctx.openApp` and
`ctx.setDesktopGutter`, and unmounts it when the package is uninstalled or `ribbon_enabled` is
false. The package owns every visual; it does not ship a second fixed host, toast or log panel.

## Development

```bash
# service tests (stdlib unittest; no venv needed)
python -m unittest discover -s tests -v

# package repo validation (signature, manifest/index hash chain, icons)
python ../.github/scripts/validate_repo.py

# rebuild + sign after changing any shipped file
cd ~/apps/compose/ethos-nas
.venv/bin/python scripts/ethos-pack build --repo ~/apps/compose/ethos-packages \
  --base-url https://raw.githubusercontent.com/SyncHot/ethos-packages/main
.venv/bin/python scripts/ethos-pack sign --repo ~/apps/compose/ethos-packages \
  --key ~/.ethos-pack/ethos-packages/repo.key
.venv/bin/python scripts/ethos-pack verify --repo ~/apps/compose/ethos-packages \
  --pub ~/apps/compose/ethos-packages/repo.pub
```

`requirements.txt` pins `pywebpush==2.5.0` and `cryptography==50.0.2`. The manifest's
`python.wheels` is a complete offline wheelhouse for x86_64 and aarch64; `http_ece` is sdist-only
upstream, so a built wheel is committed under `wheels/` and referenced by its raw GitHub URL.
`scripts/ethos-wheels` can regenerate the list with `--find-links` and `--local-url-base`.

The package service is stdlib-only; `push.py` imports `pywebpush`/`cryptography` lazily and reports
`push: false` in `/health` if the wheelhouse was not installed. Bump `version`, prepend
`changelog`, then rebuild/sign. The mobile PWA lives in EthOS core (`/notes`,
`docs/notes-pwa.md`).
