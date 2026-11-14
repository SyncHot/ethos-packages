# EthOS Download Manager (package)

Native Package Center window for the EthOS Download Station engine.

- Live queue with drag-and-drop ordering, pause/resume/reset/delete and details.
- Add downloads from an HTTP(S) URL, a magnet link or uploaded `.torrent` files.
- Categories with their own destination, daily start window, global/per-task speed limits.
- Debrid provider setup (AllDebrid / Real-Debrid / TorBox) with key verification.
- qBittorrent API key for Sonarr/Radarr (copy + rotate; admins only).
- RSS rules (include/exclude) and watch folders.

The window talks to the core Download Station API (`/api/downloads/*`); no container
is shipped and no port is exposed. Sign-in and permissions are EthOS's own.
