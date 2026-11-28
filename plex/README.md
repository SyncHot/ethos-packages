# Plex Media Server

Plex on the NAS: films, series, music and photos with rich metadata and Plex clients on every TV and
phone. Runs upstream `plexinc/pms-docker` (pinned 1.43.5) in an EthOS package; the web UI opens in a
browser tab (Plex refuses to be framed).

## What you get

- **Library from the shares.** `/home`, `/mnt` and `/media` are mounted **read-only** at
  `/media/home`, `/media/mnt`, `/media/media` — add those paths as Plex libraries.
- **Database in a folder you choose.** Installed → Settings → data folder; it survives updates and a
  reinstall (unless you tick “delete package data” on uninstall). The files are written as the EthOS
  account (`PLEX_UID`/`PLEX_GID`), not as root.
- Web UI and API on port **32400** — `http://<nas>:32400/web`, with Plex's own login.
- Optional **claim token** (`https://www.plex.tv/claim`, valid a few minutes, first start only) so the
  server appears in your Plex account without opening a browser on the NAS.
- Optional **advertised URL** (`ADVERTISE_IP`, e.g. `http://192.168.1.20:32400`) — clients find the
  server faster, which matters because host networking is not allowed (see below).

## Hardware transcoding

The package declares `capabilities: ["compose", "dri", "nvidia"]`. EthOS probes the host and, only
when a GPU is usable, writes the devices into `docker-compose.override.yml`:

```yaml
devices: ["/dev/dri/renderD128"]
group_add: ["990", "44"]        # the host's render/video group ids
```

NVENC additionally gets `runtime: nvidia` + a GPU reservation when `docker info` advertises the
`nvidia` runtime. No GPU → nothing is injected and Plex transcodes on the CPU.

Enable it in **Settings → Server → Transcoder → Show Advanced → Use hardware acceleration when
available**. Two things to know:

- **Hardware transcoding needs a Plex Pass** (Plex's licence, not EthOS's).
- Plex documents Intel Quick Sync (Intel/AMD `i915`/`amdgpu` via `/dev/dri`) officially; NVENC works
  on many hosts but is best-effort, so VAAPI is the supported path.

If the option stays greyed out:

```bash
ls -l /dev/dri; groups ethos-nas          # expect render + video; otherwise:
sudo usermod -aG render,video ethos-nas && sudo systemctl restart ethos-nas
docker exec ethos-plex ls -l /dev/dri     # the container must see the node
```

After installing a driver or joining the group, press **Repair ports & devices** in the package's
detail dialog (or Stop → Start) — devices are re-detected on every start.

## Notes and limits

- **No host networking** (EthOS policy), so Plex's DLNA/GDM discovery and “remote access” helpers are
  unavailable. Map port 32400 on your router if you really need remote access; the LAN works as-is.
- The port has **no EthOS login**: Plex authenticates its own users. Keep the NAS on a trusted
  network.
- 4 GB memory, 3 CPUs and 1024 processes are the container caps.
- Driver installation is the operator's job; EthOS only detects what is already there.

## Changelog

- **1.0.0** — first release: Plex Media Server 1.43.5 pinned, database in a package folder, read-only
  media from `/home`, `/mnt` and `/media`, optional claim token / advertised URL, VAAPI/QuickSync via
  `/dev/dri` and NVENC via the Docker nvidia runtime, CPU fallback when no GPU is available.
