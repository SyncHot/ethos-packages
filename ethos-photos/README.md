# Photos

Personal photo library for the NAS: folders, infinite grid, timeline, calendar, Moments, albums,
favourites, a PIN-encrypted Private section, search and a lightbox.

- **Package id:** `ethos-photos` · **Runtime:** files · **UI:** native (window)
- **API:** EthOS core `/api/gallery/*`, `/api/moments/*` and the scoped file service.
- **Themes:** light and dark through the shared CSS variables.
- **Pickers:** "Add folder" uses the EthOS folder picker (`ctx.pickFolder`), limited to
  `/home`, `/mnt`, `/media`.

Moving items to trash reports through the shared progress panel; notifications go to the global
Notification Center.

## Development

`frontend/app.js` exports `render(container, ctx)`. Bump `version`, prepend `changelog`, then
rebuild/sign with `ethos-pack`.
