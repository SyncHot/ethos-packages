# Music Engine

Engine package (no window): YouTube search, streaming and downloads for the Music app (web and
Android). yt-dlp runs only here, in the package's private venv, so the EthOS core stays lean.

- **Package id:** `ethos-music-engine` · **Runtime:** venv · **UI:** none (engine)
- **Service:** `server/engine.py` on `127.0.0.1:8096` (+ `/health`), stdlib HTTP server, offline
  install from the pinned wheelhouse.
- **Callers:** EthOS core (`services/package_client.py`) and the Music package. Nothing imports
  yt-dlp from the core.

## Development

Bump `version` together with the `yt-dlp` pin and wheel hashes, prepend `changelog`, then
rebuild/sign with `ethos-pack`.
