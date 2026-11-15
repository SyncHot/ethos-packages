# Samba Shares

Create and edit Samba shares without editing `smb.conf` by hand. The core `/api/shares` endpoints
own `smb.conf`, `testparm` validation and the service reload; the package ships the UI only.

- **Package id:** `ethos-shares` · **Runtime:** files · **UI:** native (window)
- **Host dependency:** `system_requires: ["samba"]` — EthOS installs Samba with the package through
  the root helper and removes it on uninstall when no other package needs it. When Samba is
  missing, the window shows a banner and disables the actions instead of leaving dead buttons.
- **Themes:** light and dark; no hard-coded text colours.
- **Pickers:** Browse… uses `ctx.pickFolder` (`/home`, `/mnt`, `/media`) with a typed input
  fallback for older cores.

## Development

`frontend/app.js` exports `render(container, ctx)`. Bump `version`, prepend `changelog`, then
rebuild/sign with `ethos-pack`.
