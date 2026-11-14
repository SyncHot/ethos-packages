---
description: "Package logging rules: native UIs use ctx.log / ctx.logger, backend logs go to stdout/stderr, never ship a package-local log viewer or log file."
applyTo: "**/*.js"
---

# Logging — packages feed the EthOS system

Full spec: `docs/logs.md` in the EthOS repo (`SyncHot/ethosnas`). EthOS has one log store, one API,
one WebSocket and one viewer (the Logs app).

## Native UI (`ui.mode: "native"`)

```js
ctx.log('info', 'Scan started', path);
ctx.logger.warn('Cache empty', detail);
ctx.logger.error('Write failed', err?.stack || String(err));
```

- Levels: `debug` | `info` | `warning` | `error`. `detail` is capped at 4000 chars.
- The server verifies the installed `package_id` and stores the row as `app="pkg:<id>"`. A package
  cannot impersonate core or another package.
- Never ship a log viewer, history list, log file or a `/api/logs` endpoint. To show logs to the
  user, tell them to open the Logs app (Admin → Logs) — do not render one inside the package.

## Backend / container

- Write to stdout/stderr (plain text or one JSON object per line). EthOS reads Docker logs and groups
  them by the compose project (= package id) inside the Logs app.
- Keep domain datasets (scan history, job history, certificate list) separate — they are data, not
  diagnostics, and may stay package-local.
- Never log credentials, tokens, API keys or credential-bearing request bodies.

## Port/iframe UIs

Cross-origin pages are not captured by the EthOS reporter. Use `ctx.log` when the UI is native, and
stdout in the backend; do not add a third-party log viewer to the package.
