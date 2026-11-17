# Samba Shares

Create and edit Samba shares without editing `smb.conf` by hand. The core `/api/shares` endpoints
own config validation, service reload, account administration, and ACL validation; the package
ships the UI only.

- **Package id:** `ethos-shares` · **Runtime:** files · **UI:** native (window)
- **Host dependency:** `system_requires: ["samba"]` — EthOS installs Samba through the root helper
  and removes it on uninstall when no other package needs it. Missing dependencies are shown in
  the window and dependent actions are disabled.
- **Themes:** light and dark; no hard-coded text colours.
- **Pickers:** Browse uses `ctx.pickFolder` restricted to `/home`, `/mnt`, and `/media`; the path
  field remains editable.
- **Accounts:** Set/reset or remove Samba credentials for existing Linux users. Linux accounts are
  never created or deleted by this package.
- **Existing EthOS hosts:** After updating the EthOS core, rerun
  `sudo bash setup_scripts/setup_service.sh` once to install the Samba account helper.
- **Access rules:** Configure read-only and read/write users or groups, plus create/directory masks.

## Development

`frontend/app-shell.js` exports `render(container, ctx)`. Bump `version`, prepend `changelog`, then
rebuild/sign with `ethos-pack`.
