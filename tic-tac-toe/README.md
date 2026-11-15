# Tic-Tac-Toe

Two-player game inside an EthOS window; no container, no port, no API.

- **Package id:** `tic-tac-toe` · **Runtime:** files · **UI:** native (window)
- **Legacy layout:** one of the two documented exceptions to the shared package shell (a
  single-card game), together with `ethos-welcome`.
- **Themes:** light and dark follow the EthOS toggle.

## Development

`frontend/app.js` exports `render(container, ctx)`. Bump `version`, prepend `changelog`, then
rebuild/sign with `ethos-pack`.
