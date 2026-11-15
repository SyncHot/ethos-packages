# Music

Spotify-style Music desktop app (start page, search, podcasts, radio, library, settings, mini-player
and full-screen player) that shares liked tracks, playlists, history and podcast subscriptions with
the EthOS Music Android app.

- **Package id:** `ethos-music` · **Runtime:** files · **UI:** native (window)
- **API:** EthOS core `/api/music/*`; search/stream/download need the separate `Music Engine`
  package (`requires: ["ethos-music-engine"]`, installed automatically).
- **Themes:** light and dark follow the EthOS toggle; the full-screen player keeps a dark
  immersion surface by design.

Feedback goes through the global Notification Center (`ctx.notifications`) and downloads report in
the shared progress panel — there is no package-local toast or progress UI.

## Development

`frontend/app.js` exports `render(container, ctx)`. Bump `version`, prepend `changelog`, then
rebuild/sign with `ethos-pack`.
