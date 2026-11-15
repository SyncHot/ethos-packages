# Git Diff

IntelliJ-style side-by-side diff with hunk selection: review the worktree against the index, stage
or unstage selected hunks, and hand files to the Code Editor.

- **Package id:** `ethos-git-diff` · **Runtime:** files · **UI:** native (window)
- **API:** EthOS core `/api/editor/git/*` (path-scoped, admin-gated like the editor).
- **Themes:** follows the EthOS light/dark toggle; colours come from the shared CSS variables.

## Development

`frontend/app.js` exports `render(container, ctx)`. Bump `version`, prepend `changelog`, then
rebuild/sign with `ethos-pack` (see the main README).
