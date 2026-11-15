# Sticky Notes

Per-account sticky notes on colored cards. This is a Package Center app: a native EthOS window and a
small stdlib-only Python service in the package's private virtualenv.

- **Package id:** `ethos-sticky-notes` · **Runtime:** venv · **UI:** native (window)
- **Service:** `server/main.py` on `127.0.0.1:8099`, reached through
  `/api/packages/ethos-sticky-notes/proxy/…`; `user_access: true`, so every signed-in account can use it.
- **State:** `<DATA_DIR>/packages/data/ethos-sticky-notes/notes.json` — `{version: 1, users: {name: […]}}`
  with atomic replace. The first start imports the built-in widget's `sticky_notes.json`.

## API

| Method | Path | Body | Result |
|---|---|---|---|
| GET | `/api/sticky-notes` | — | `{"notes": [...]}` |
| POST | `/api/sticky-notes` | `{text?, color?}` | full list + the new note |
| PUT | `/api/sticky-notes/{id}` | `{text?, color?}` | full list + the updated note |
| DELETE | `/api/sticky-notes/{id}` | — | full list |
| POST | `/api/sticky-notes/{id}/move` | `{"direction": "up"\|"down"}` | full list |

Colors: `yellow`, `pink`, `blue`, `green`, `orange` (auto-cycled when omitted). Text is capped at
2000 characters, 200 notes per account.

## Development

The UI calls only `ctx.*` helpers (`ctx.apiFetch`, `ctx.notifications`, `ctx.log`). Bump `version`
and prepend `changelog`, then rebuild/sign with `ethos-pack`.
