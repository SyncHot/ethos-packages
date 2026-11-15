# Code Editor

A VS Code-style workbench in an EthOS window: single files or whole folders, tabs and breadcrumbs,
find/replace, Source Control with inline git gutters, split terminals, Problems/Output panels and a
Markdown preview.

- **Package id:** `ethos-editor` · **Runtime:** files · **UI:** native (window)
- **API:** EthOS core `/api/editor/*` (path-scoped) and `/api/terminal` for the PTY WebSocket.
- **Themes:** light (VS Code Light+) and dark (Dark+) follow the EthOS appearance toggle, including
  the CodeMirror tokens and the terminal palette.

The window title/taskbar label belong to EthOS (`manifest.name`); unsaved changes are shown in the
editor status bar.

## Development

`frontend/app.js` exports `render(container, ctx)`. The editor stylesheet still lives in the EthOS
`frontend/index.html` (`:root.light`/`:root.dark` variants). Bump `version`, prepend `changelog`,
then rebuild/sign with `ethos-pack`.
