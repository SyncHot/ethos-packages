# EthOS Download Manager (package)

Native Package Center window for the EthOS Download Station engine.

- Live queue with drag-and-drop ordering, pause/resume/reset/delete and details.
- Add downloads from an HTTP(S) URL, a magnet link or uploaded `.torrent` files.
- Categories with their own destination, daily start window, global/per-task speed limits.
- Debrid provider setup (AllDebrid / Real-Debrid / TorBox) with key verification.
- Two independent provider slots — a torrent debrid **and** a hoster-link multihoster (AllDebrid / tb7.pl) can be active together.
- tb7.pl username/password login with account status (premium until, transfer left) and its supported-hoster list.
- qBittorrent API key for Sonarr/Radarr (copy + rotate; admins only).
- RSS rules (include/exclude) and watch folders.

The window talks to the core Download Station API (`/api/downloads/*`); no container
is shipped and no port is exposed. Sign-in and permissions are EthOS's own.
