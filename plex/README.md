# Plex Media Server

Plex on the NAS: films, series, music and photos with rich metadata and Plex clients on every TV and
phone. Runs upstream `plexinc/pms-docker` (pinned 1.43.5) in an EthOS package; the web UI opens in a
browser tab (Plex refuses to be framed).

## What you get

- **Library from the shares.** `/home`, `/mnt` and `/media` are mounted **read-only** at
  `/media/home`, `/media/mnt`, `/media/media` — add those paths as Plex libraries.
- **Transcode scratch** on a named volume (`plex-transcode`), so aggressive transcoding cannot bloat
  the container layer or the config folder.
- **Database in a folder you choose.** Installed → Settings → data folder; it survives updates and a
  reinstall (unless you tick “delete package data” on uninstall). The files are written as the EthOS
  account (`PLEX_UID`/`PLEX_GID`), not as root.
- Web UI and API on port **32400** — `http://<nas>:32400/web`, with Plex's own login.
- Optional **claim token** (`https://www.plex.tv/claim`, valid a few minutes, first start only) so the
  server appears in your Plex account without opening a browser on the NAS.
- Optional **advertised URL** (`ADVERTISE_IP`, e.g. `http://192.168.1.20:32400`) — clients find the
  server faster, which matters because host networking is not allowed (see below).

## First start: claim the server

Plex refuses to talk to a browser until the server belongs to a Plex account. EthOS cannot use
host networking (policy), so Plex sees every client as the **Docker gateway address** instead of the
real device — an unclaimed server then answers *“You do not have access to this server”* even from
your own LAN. The package ships `ALLOWED_NETWORKS` (default: `172.16.0.0/12,10.0.0.0/8,192.168.0.0/16`)
exactly for that: those ranges are trusted without a Plex login, which lets the setup wizard load.

Pick **one** of these, in order of preference:

1. **Claim token (recommended, also enables Plex’s own remote access).** Open
   <https://www.plex.tv/claim>, copy the token (`claim-…`, valid ~4 minutes), then
   *Installed → Plex → Settings → Claim token* → **Save**. EthOS recreates the container and the
   server is claimed as soon as it starts.
2. **Sign in from the browser.** Open `http://<nas>:32400/web`, log in with your Plex account and
   complete the wizard. Works because `ALLOWED_NETWORKS` covers the LAN and the Docker gateway.

Once the server is claimed you can clear **Allowed networks** in Settings (the field stays empty
afterwards) — Plex then authenticates every client with the Plex account. Leaving the default in
place keeps the LAN usable without a login; that is Plex’s documented behaviour for these ranges.

The claim is applied by the image’s *first run* script, which re-runs whenever the container is
recreated, so you can claim later without wiping the database. If the wizard still refuses after a
recreate, remove the package **with “delete package data”** and install it again with the claim token
filled in.

### Signs everything is fine

```bash
curl -s http://<nas>:32400/identity | grep -o 'claimed="[01]"'   # claimed="1"
docker exec ethos-plex grep -o 'allowedNetworks="[^"]*"' \
  "/config/Library/Application Support/Plex Media Server/Preferences.xml"
```

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

- **1.0.2** — `ALLOWED_NETWORKS` setting (LAN + Docker ranges) so the claim/setup wizard is reachable
  without host networking, transcode scratch on its own `plex-transcode` volume, and this walkthrough.
- **1.0.1** — the icon now ships in `files[]`.
- **1.0.0** — first release: Plex Media Server 1.43.5 pinned, database in a package folder, read-only
  media from `/home`, `/mnt` and `/media`, optional claim token / advertised URL, VAAPI/QuickSync via
  `/dev/dri` and NVENC via the Docker nvidia runtime, CPU fallback when no GPU is available.
