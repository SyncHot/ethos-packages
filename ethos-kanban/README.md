# Kanban Board

Boards → columns → cards with drag & drop, labels, due dates and a card editor. This is the only
package that ships its own backend service (stdlib-only Python, no third-party dependencies).

- **Package id:** `ethos-kanban` · **Runtime:** venv · **UI:** native (window)
- **Service:** `server/main.py` on `127.0.0.1:8098`, reached through
  `/api/packages/ethos-kanban/proxy/…`; `user_access: true`, so every signed-in account can use it.
- **State:** `<DATA_DIR>/packages/data/ethos-kanban/boards.json` (atomic replace, seeded with one
  demo board).

## Development

The UI calls only `ctx.*` helpers (`ctx.notifications`, `ctx.modal`, `ctx.apiFetch`). Bump
`version` and `python` requirements/hashes together when the engine changes, prepend `changelog`,
then rebuild/sign with `ethos-pack`.
