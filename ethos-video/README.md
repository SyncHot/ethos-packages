# Video Station (EthOS package)

A full-bleed cinema library for your NAS videos: backdrop hero, poster shelves,
continue-watching progress, Movies/Series views, a detail page and an immersive
player. Works on desktop and phones (bottom tab bar, touch-sized controls).

Playback uses the EthOS core API:

- `direct` — browser-native MP4/WebM stream (`/api/videos/stream`).
- `remux` / `transcode` — server-side HLS (`POST /api/videos/hls`), with a
  legacy fragmented-MP4 pipe fallback (`/api/videos/transcode`).
- Hardware encoding is reported in Settings → Media engine (VA-API/QSV/software);
  VA-API/QSV hardware decode is used when the server probes it for the file.

The video API, library walk, thumbnails, resume positions, metadata cache and
transcoding stay in EthOS core; the Android Video app shares the same endpoints.

## Metadata without an API key

Settings → Metadata defaults to **Automatic**: if a TMDB key is configured it is
used first, otherwise the core uses keyless **Cinemeta** (movies and series,
posters/backdrops/rating/cast) and **TVmaze** (official series fallback). Adding
a TMDB key is optional and gives Polish titles/overviews/posters. Keyless
metadata is English; TVmaze requires CC BY-SA attribution and Cinemeta is an
unofficial Stremio addon. Artwork is downloaded and served by the NAS — the
window never hotlinks an external image. Sources can be tested, switched to
TMDB/TVmaze-only, or turned off at any time.

- **Package id:** `ethos-video` · **Runtime:** files · **UI:** native (window)
- **Themes:** light and dark; the hero and player deliberately keep a cinematic
  dark surface because they sit on artwork.
- **Pickers:** adding a library folder uses the EthOS folder picker, limited to
  the backend roots.
- **Layout:** documented cinema/media exception to the shared package shell — see
  `AGENTS.md`.

## Development

`frontend/app.js` exports `render(container, ctx)` and must stay self-contained
(the loader imports it as a blob, so relative imports are unavailable).
`frontend/hls.min.js` is loaded lazily by the player only when the browser has no
native HLS support (Apache-2.0; see `THIRD-PARTY.md`).

Bump `version`, prepend `changelog`, then rebuild/sign/verify with
`scripts/ethos-pack` from the EthOS NAS repo.

