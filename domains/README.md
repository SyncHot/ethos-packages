# Domains — reverse proxy with automatic HTTPS

Point your own domain at this NAS, forward it to any host and port, and let Caddy
issue and renew the Let's Encrypt certificate. No nginx editing, no certbot cron.

## What runs

| Container | Role | Ports |
|---|---|---|
| `ethos-domains-proxy` | Caddy 2.11 — terminates TLS, proxies, runs ACME | `80/tcp`, `443/tcp`, `443/udp` (public) |
| `ethos-domains` | control plane + config renderer | `127.0.0.1:8093` (loopback only) |

The two containers share four volumes: `caddy-data` (certificates, ACME account),
`caddy-config`, `caddy-generated` (the rendered config) and `caddy-logs`.
Routes and settings live in `domains-data` as one JSON document.

## Independent of EthOS

Both containers use `restart: unless-stopped`, and EthOS never talks to them
while serving traffic. Restarting `ethos-nas` or closing the Domains window does
not interrupt routing. On a host reboot Docker starts Caddy first and it loads
the last accepted config from `caddy-generated` before the control plane has even
started.

The management API is bound to loopback and reached only through EthOS's
authenticated `/api/packages/domains/proxy/` endpoint, so there is no second
admin surface on the LAN.

## Requirements for a certificate

1. A public DNS `A`/`AAAA` record for the name, pointing at your public IP.
2. Ports 80 and 443 forwarded to this NAS (HTTP-01 / TLS-ALPN challenges).
3. A reachable target behind the proxy — for EthOS itself use
   `host.docker.internal:9000`.

Use **Use the Let's Encrypt staging CA** in Settings while testing: it issues
certificates browsers do not trust, but has no rate limits. Switch it off once
the route works.

## Targets

`host:port`, where host is an IPv4 address, a bracketed IPv6 address or a
hostname the proxy container can resolve. Use an IP address for LAN devices;
Docker's resolver does not see the host's `/etc/hosts`.

Wildcard domains (`*.example.com`) need the DNS-01 challenge and a Caddy build
with the provider's DNS module — not part of 1.0.0.

## Uninstalling

Package Center first removes the containers, the network and the package
directory. Tick **Delete package data** in the uninstall dialog to also delete
the certificate storage and routes; otherwise reinstalling resumes with the same
certificates. Images are removed only when no other container uses them.

## Notes

- The proxy writes its log to `/var/log/caddy/caddy.log` (the Diagnostics panel
  shows the tail). `docker logs ethos-domains-proxy` is therefore quiet.
- HTTP is redirected to HTTPS automatically for every configured domain.
- WebSockets work out of the box; the per-route streaming toggle additionally
  disables response buffering for SSE and live logs.
