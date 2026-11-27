# Web Browser

A real Chromium browser in an EthOS window. The pages are rendered on the NAS and streamed to the
device you are holding, so a phone, a tablet or a locked-down laptop gets a full desktop browser
without installing one. A Package Center app: LinuxServer's Chromium (Selkies) container, its web
UI on port 8091, embedded in a window.

- **Package id:** `webbrowser` · **Runtime:** compose · **UI:** window on `:8091` (HTTPS)
- **Data:** a folder on the NAS — by default `packages/data/webbrowser`, or any folder under
  `/home`, `/mnt` or `/media` chosen in the install dialog and under **Installed → Settings** — is
  mounted at `/config`. It holds the Chromium profile: bookmarks, history, cookies, logins and open
  tabs. It survives a restart, an update and a reinstall.
- **Host requirements:** Docker (installed automatically through Package Center when missing).
- **Network:** port 8091 is reachable on the LAN and has its own login.

## Login and start page

The login, password and start page are chosen in the Package Center **install dialog** and can be
changed later under **Installed → Settings**. EthOS stores them with the package and passes them to
the container as `CUSTOM_USER`, `PASSWORD` and `CHROME_CLI`; the compose file stays fixed.

- The window asks for the login through the browser's own basic-auth prompt; the password is never
  sent back to the UI afterwards ("stored — leave blank to keep").
- A password is required and must be at least 8 characters. Shipping a browser session with no
  login is not offered: the session can reach any site the NAS can reach.
- The start page is passed to Chromium as a command-line argument, so a bare URL
  (`https://start.duckduckgo.com/`) works, and so does a full argument list.
- Changing the settings recreates the container. The profile is not touched, so it is the same
  browsing state as before — the login is simply the new one from that moment on.

## First visit: accept the certificate once

The port is served over **HTTPS with the image's own self-signed certificate**. That is a
requirement, not a preference: the streaming client decodes video with WebCodecs, which browsers
expose only in a secure context, so the plain-HTTP port (3000) shows a black panel on every address
except `localhost`.

The first time, the browser does not know that certificate yet, so the window stays empty. Fix it
once per browser:

1. Click **Open in new tab** in the window toolbar.
2. Accept the warning (Chrome/Edge: *Advanced → Proceed*; Firefox: *Advanced → Accept the Risk and
   Continue*). The session appears and asks for the login.
3. Go back to the EthOS window and click **Reload UI**. It works from then on — the browser
   remembers the exception for that NAS address.

Each NAS gets its own certificate, generated on the container's first start and kept in the
profile folder as `ssl/cert.pem` and `ssl/cert.key` (10-year validity, `CN=*`).

### Removing the warning entirely

Replace those two files with a certificate that the browser already trusts — for example one issued
by the **Domains** package, or by a local CA you installed on your devices — and restart the
package. Keep the file names (`ssl/cert.pem`, `ssl/cert.key`) and point the certificate's subject at
the name you use to reach the NAS; nothing else in the package has to change.

## Hardening and limits

The container is set up as a kiosk browser, not as a remote desktop:

| Setting | Effect |
|---|---|
| `HARDEN_DESKTOP=true` | no terminal, no `sudo`, no `xdg-open` helpers, no file transfer sidebar, no printing |
| `SELKIES_ENABLE_SHARING=false` | no view-only / player sharing links that would hand out the session |
| `SELKIES_FILE_TRANSFERS=none` | upload/download between the page and the container is disabled |
| `SELKIES_FRAME_ANCESTORS=http: https:` | allows the EthOS window to embed the session (CSP `frame-ancestors`) |

| Limit | Value |
|---|---|
| Memory | 2 GB (`mem_limit`) |
| CPU | 2 cores (`cpus`) |
| Processes | 512 (`pids_limit`) |
| `/dev/shm` | 1 GB (`shm_size` — the 64 MB default crashes tabs) |
| Container logs | 10 MB × 3 files (`json-file`, 30 MB max) |

No GPU is requested: a package may not claim `/dev/dri`, so the stream is encoded in software. A
tab with a runaway page is OOM-killed inside its own cgroup instead of taking the NAS down.

## One shared session

The container has one Chromium profile, so every EthOS account that opens the window sees the same
bookmarks, history and logged-in sites. The profile belongs to the NAS, not to individual accounts.
Per-account browsers would need one container per user; this package deliberately stays at one.

## Updates and uninstall

The image is pinned by digest (`lscr.io/linuxserver/chromium`, tag `version-b8f70cfa`, one
multi-arch index for amd64 and arm64). A new image is a new digest plus a package version bump, so
an update is always a conscious act.

Uninstalling stops and removes the container. Package Center asks separately whether the image and
the data folder should be deleted, so the profile survives a reinstall unless you confirm the
cleanup — and **Installed → Unused package data** cleans up a folder left behind.
