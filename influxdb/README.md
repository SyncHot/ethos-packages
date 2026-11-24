# InfluxDB

A time-series database for metrics, sensor readings and events, running on the NAS. A Package Center
app: InfluxDB OSS 2.10.1 in Docker, its web UI and HTTP API on port 8086, and a native EthOS window
that embeds the UI.

- **Package id:** `influxdb` · **Runtime:** compose · **UI:** window on `:8086`
- **Data:** `influxdb-data` volume (`/var/lib/influxdb2`) and `influxdb-config`
  (`/etc/influxdb2`), both named Docker volumes that survive updates.
- **Host requirements:** Docker (installed automatically through Package Center when missing).
- **Network:** port 8086 is reachable on the LAN. InfluxDB comes with its own login and API tokens,
  so set a strong password on the first visit.

## First visit

Open the **InfluxDB** window (or `http://<nas-ip>:8086`) and complete the onboarding form:

1. Create the administrator user and password.
2. Pick an organisation name (for example `home`).
3. Create the first bucket (for example `home_assistant`) and choose its retention period.
4. Copy the generated **API token** — clients use it instead of a password.

The token is shown again under **Data → API Tokens**. A token with all-access rights can write to
every bucket; create narrower tokens per client when you need to.

Nothing is pre-seeded: a fresh install has no users, so the setup form cannot be bypassed. The
package files are public and signed, which is why no credentials live in them.

## Home Assistant

In Home Assistant open **Settings → Devices & services → Add integration → InfluxDB** and fill in:

| Field | Value |
|---|---|
| URL | `http://<nas-ip>:8086` |
| Organisation | the organisation created during onboarding |
| Bucket | the bucket for sensor history |
| API token | the token copied during onboarding |
| Verify SSL | off (plain HTTP on the LAN) |

Home Assistant writes a point per state change; use the bucket's retention period to bound disk use
(for example 90 days for raw sensor data). The same token works for Telegraf, Grafana or any
InfluxDB 2.x client.

## Retention, tasks and dashboards

Everything is managed in the UI: buckets and retention under **Data → Buckets**, Flux queries under
**Data Explorer**, downsampling or alerting under **Tasks**, and charts under **Dashboards**.

## Backups

`influx backup` walks the data directory; run it inside the container and copy the archive out:

```bash
docker exec ethos-influxdb influx backup /tmp/influx-backup --token "$INFLUX_TOKEN" --host http://127.0.0.1:8086
docker cp ethos-influxdb:/tmp/influx-backup ./influx-backup
```

Create a dedicated read-only token for backups if you prefer. A stopped container can also be
archived with any Docker volume backup tool; keep the two volumes together.

## Updates and uninstall

Package updates keep both volumes. Uninstalling stops and removes the container; Package Center asks
separately whether the volumes and images should be deleted, so the data survives a reinstall unless
you confirm the cleanup.

## Limits

- One node: InfluxDB OSS has no clustering. For a single NAS that is the normal setup.
- The UI is embedded over HTTP. If EthOS itself is served over HTTPS, the browser blocks the
  embedded page; use the window's **Open in new tab** button.
- Version 2.x is the current line with Flux and the built-in UI; InfluxDB 3 Core is a different
  product with a SQL-first API and is not what this package runs.
