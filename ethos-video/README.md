# Video Station

Netflix-style video app for the NAS: home rows, movies/series, search, My List, resume positions and
an in-window player with subtitles. The video library API, thumbnails and streaming stay in EthOS.

- **Package id:** `ethos-video` · **Runtime:** files · **UI:** native (window)
- **API:** EthOS core `/api/videos/*`; optional `Media Enhancements` package improves thumbnails.
- **Themes:** light and dark for the shell, rows and empty states. The hero billboard and the
  player deliberately keep the cinematic dark surface (they sit on artwork).
- **Pickers:** adding a library folder uses the EthOS folder picker, limited to the backend roots.

## Development

`frontend/app.js` exports `render(container, ctx)`; shell colours live in the `--vs-*` variables at
the top of the injected stylesheet. Bump `version`, prepend `changelog`, then rebuild/sign with
`ethos-pack`.
