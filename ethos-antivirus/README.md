# EthOS AntiVirus

ClamAV scanner for the NAS: full/quick/custom scans of `/home`, `/mnt` and `/media`, a
quarantine, completed-scan history and a scheduled scan.

- **Package id:** `ethos-antivirus` · **Runtime:** compose · **UI:** native (window)
- **Container:** ClamD + a small Python API bound to `127.0.0.1:8092`; the UI reaches it only
  through EthOS's authenticated `/api/packages/ethos-antivirus/proxy/…`.
- **Host mounts:** `/home`, `/mnt`, `/media` are mounted **read-only** under `/scan`.
- **State:** the `antivirus-data` named volume (settings, quarantine copies, scan history,
  schedule). Uninstall keeps the volume by design.

The scanner runs as root *inside* the container so it can read `0660` shares; the host mounts stay
read-only. Do not expose port 8092 to the LAN — it is loopback-only.

Scans report through the shared EthOS progress panel; diagnostics go to the unified Logs app
(`pkg:ethos-antivirus`), never to a package-local log file.

## Development

`manifest.json` + `docker-compose.yml` + `server/app.py` + `frontend/app.js` (native module
exporting `render(container, ctx)`). Bump `version`, prepend `changelog`, then rebuild/sign the
repository with `ethos-pack` as described in the main README.
