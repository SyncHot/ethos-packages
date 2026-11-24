# Grafana

Dashboards for the metrics that already live on the NAS. A Package Center app: Grafana OSS 13.3.1
in Docker, its web UI and API on port 3010, and a native EthOS window that embeds the UI.

- **Package id:** `grafana` · **Runtime:** compose · **UI:** window on `:3010`
- **Data:** a folder on the NAS — by default `packages/data/grafana`, or any folder under
  `/home`, `/mnt`, `/media` chosen in the install dialog and under **Installed → Settings** — is
  mounted at `/var/lib/grafana`. It holds the SQLite database, dashboards, users, data sources and
  plugins, survives updates and can live on a data disk.
- **Host requirements:** Docker (installed automatically through Package Center when missing).
- **Network:** port 3010 is reachable on the LAN. Grafana has its own login.

## Data folder

Grafana 1.2.0 replaced the `grafana-data` named volume with a folder on the NAS. Nothing is moved
automatically:

- Fresh install: pick the folder in the install dialog, or leave it empty for the package-named
  default, and Grafana initialises there.
- Updating from 1.1.0 with existing dashboards: copy the old volume once, then update. On the NAS
  shell (`<target>` = the folder you choose in Settings):

  ```bash
  docker run --rm -v grafana_grafana-data:/from -v "<target>:/to" \
    alpine:3.20 sh -c 'cp -a /from/. /to/'
  ```

  Keep the volume until Grafana shows the dashboards from the new location.
- Changing the folder later recreates the container on the new path with an empty data set; move
  the files first (Files app), then switch.

## Administrator account

The login and password are chosen in the Package Center **install dialog** and can be changed
later under **Installed → Settings**. EthOS stores them with the package and passes them to the
container as `GF_SECURITY_ADMIN_USER` / `GF_SECURITY_ADMIN_PASSWORD`; Grafana creates the admin
account from them on the **first start of an empty data folder**.

- Left empty, the fields fall back to `admin` / `admin`. Change that immediately — port 3010 is
  reachable on the LAN.
- Changing the settings later recreates the container, but Grafana does not rewrite an account that
  already exists. To change the password of an existing install, use the Grafana UI (Profile →
  Change password) or reset it on the NAS:
  `docker exec ethos-grafana grafana cli --homepath /usr/share/grafana admin reset-admin-password <new>`
  and sign in again. The administrator **login** can only be renamed inside Grafana (Server admin →
  Users).
- Grafana 13 logs in through `POST /login` (JSON `{"user", "password"}`); the old `/api/login`
  endpoint no longer exists.

Sign-up and organisation creation are disabled in the package environment.

If the embedded window cannot keep a session (some browsers block third-party cookies inside
frames), use the window's **Open in new tab** button; the same page works normally there.

## Connect the InfluxDB package

The InfluxDB package on this NAS listens on port 8086. From Grafana's container, `localhost` is the
container itself, so use **`http://host.docker.internal:8086`** (the package publishes that host
alias) or the NAS's LAN address.

1. **Connections → Data sources → Add data source → InfluxDB**.
2. Query language: **Flux**.
3. URL: `http://host.docker.internal:8086`.
4. Organization and Token: the values copied when the InfluxDB bucket was created.
5. Default bucket: the bucket that holds your metrics (for example `home_assistant`).
6. **Save & test**, then build a dashboard or import one.

The same page accepts Prometheus, PostgreSQL, SQLite and other data sources if you add them later.

## Migrate an existing Grafana

If you already have a Grafana data directory (for example the old
`/mnt/SharedDrive/Backup/docker/influx-grafana/grafana-storage`), you can either:

- copy it into the `grafana-data` volume **before the first start**:
  ```bash
  docker run --rm -v ethos-grafana_grafana-data:/data \
    -v /mnt/SharedDrive/Backup/docker/influx-grafana/grafana-storage:/old:ro \
    alpine sh -c 'cp -a /old/. /data/ && chown -R 472:0 /data'
  ```
  Grafana migrates an older `grafana.db` forward on start; or
- import individual dashboards in the UI: **Dashboards → New → Import** and paste the exported JSON.

Do not do both: a copied database replaces whatever the new instance already created.

## Resource guard

The container is capped so a heavy dashboard or plugin cannot take the NAS down:

| Limit | Value |
|---|---|
| Memory | 768 MB (`mem_limit`) |
| CPU | 1.0 core (`cpus`) |
| Processes | 256 (`pids_limit`) |
| Container logs | 10 MB × 3 files (`json-file`, 30 MB max) |

Grafana documents 512 MB as its minimum and uses about 200 MB idle. If you install many plugins or
render large dashboards, raise the memory limit in the package's `docker-compose.yml`.

## Updates and uninstall

Package updates keep the `grafana-data` volume. Uninstalling stops and removes the container;
Package Center asks separately whether the volume and image should be deleted, so dashboards
survive a reinstall unless you confirm the cleanup.

## Limits

- One Grafana instance, SQLite storage; enough for a home NAS. For HA use an external database and
  object storage, which this package does not set up.
- Usage reporting and update checks are disabled in the package environment.
