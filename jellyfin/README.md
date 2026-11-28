# Jellyfin

Free media server for the NAS — movies, series, music and photos with posters, subtitles and
hardware transcoding. Runs upstream `jellyfin/jellyfin` (pinned 10.11.11) in an EthOS package; the
web UI opens in a browser tab (Jellyfin refuses to be framed).

## What you get

- **Library from the shares.** `/home`, `/mnt` and `/media` are mounted **read-only** at
  `/media/home`, `/media/mnt`, `/media/media` — add those paths in Jellyfin's library setup.
- **Config in a folder you choose.** Installed → Settings → data folder; it survives updates and a
  reinstall (unless you tick “delete package data” on uninstall).
- **Transcode scratch** on a named volume (`jellyfin-cache`), so it never fills the config folder.
- Web UI and API on host port **8094** (`ui.expose: lan`, Jellyfin's own login). Jellyfin still
  listens on 8096 *inside* the container; only the host side moves, because 8096–8100 are already
  declared by other EthOS packages (Music engine, Media enhance, Kanban, Sticky Notes, Velvet).

## Hardware transcoding

The package declares `capabilities: ["compose", "dri", "nvidia"]`. EthOS probes the host and, only
when a GPU is actually usable, writes the devices into the package's
`docker-compose.override.yml`:

```yaml
devices: ["/dev/dri/renderD128"]
group_add: ["990", "44"]        # the host's render/video group ids
```

NVENC additionally gets `runtime: nvidia` + a GPU reservation when `docker info` advertises the
`nvidia` runtime. Without a GPU nothing is injected — the package still installs and transcodes on
the CPU, just slower.

Enable it in **Jellyfin → Dashboard → Playback → Transcoding**: pick `VAAPI` (Intel/AMD) or
`NVIDIA NVENC`, and keep “Enable hardware decoding” on for H.264/HEVC. If the dashboard does not
list a hardware type, check:

```bash
# Host: is the render node there and can the EthOS account open it?
ls -l /dev/dri; groups ethos-nas          # expect render + video; otherwise:
sudo usermod -aG render,video ethos-nas && sudo systemctl restart ethos-nas

# Container: does Jellyfin see the GPU?
docker exec ethos-jellyfin /usr/lib/jellyfin-ffmpeg/vainfo
```

After installing a driver or joining the group, press **Repair ports & devices** in the package's
detail dialog (or Stop → Start) — the devices are re-detected on every start.

## Notes and limits

- **No host networking** (EthOS policy), so client auto-discovery and DLNA are unavailable. Add the
  server by address in the Jellyfin app: `http://<nas>:8094`.
- The port has **no EthOS login**: Jellyfin authenticates its own users. Keep the NAS on a trusted
  network and do not forward port 8094 from the internet.
- Firmware/driver installation is the operator's job. EthOS only detects what is already there.
- 3 GB memory, 3 CPUs and 1024 processes are the container caps; the package cannot take the NAS down
  with a runaway scan.

## Changelog

- **1.0.1** — UI moved to host port 8094 (8096–8100 belong to other packages) and the icon now
  ships in `files[]`.
- **1.0.0** — first release: Jellyfin 10.11.11 pinned, config folder that survives updates, read-only
  media from `/home`, `/mnt` and `/media`, VAAPI/QuickSync via `/dev/dri` and NVENC via the Docker
  nvidia runtime, CPU fallback when no GPU is available.
