# Grafana

Dashboards for the metrics that already live on the NAS. A Package Center app: Grafana OSS 13.3.1
in Docker, its web UI and API on port 3010, and a native EthOS window that embeds the UI.

- **Package id:** `grafana` · **Runtime:** compose · **UI:** window on `:3010`
- **Data:** the `grafana-data` volume (`/var/lib/grafana`) holds the SQLite database, dashboards,
  users, data sources and plugins. It survives updates.
- **Host requirements:** Docker (installed automatically through Package Center when missing).
- **Network:** port 3010 is reachable on the LAN. Grafana has its own login.

## First visit

Open the **Grafana** window (or `http://<nas-ip>:3010`) and sign in with the built-in account:

| User | Password |
|---|---|
| `admin` | `admin` |

Grafana asks you to choose a new password immediately. Do it — the port is reachable on the LAN.
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
