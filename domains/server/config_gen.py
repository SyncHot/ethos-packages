"""Validation and Caddyfile rendering.

Every value that ends up in the Caddyfile is validated here: the file is text,
so a stray newline or ``}`` in a domain name would otherwise inject config.
Nothing user-supplied is interpolated verbatim except the route note, and that
never reaches the config.

Rendering is split in two so the same text serves both purposes:

* ``render_options`` -> the contents of ``generated/options.caddy`` (global
  options only, imported inside the global block by ``caddy/Caddyfile``);
* ``render_routes``  -> ``generated/routes.caddy`` (one site block per route);
* ``build_caddyfile`` -> the complete document POSTed to ``/load`` and
  ``/adapt`` at runtime.
"""

import ipaddress
import re

DOMAIN_LABEL = r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?"
DOMAIN_RE = re.compile(rf"^{DOMAIN_LABEL}(?:\.{DOMAIN_LABEL})+$")
HOST_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,252}[A-Za-z0-9])?$")
EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,255}$")

MAX_DOMAINS = 20
STAGING_CA = "https://acme-staging-v02.api.letsencrypt.org/directory"


class ValidationError(ValueError):
    """User-facing input problem (400 in the API)."""


# ── Validation ──────────────────────────────────────────────────────────────

def normalize_domain(value) -> str:
    name = str(value or "").strip().rstrip(".").lower()
    if not name:
        raise ValidationError("Domain name is required")
    if any(ch in name for ch in " /\\{}()\"'`\t\n\r"):
        raise ValidationError(f"Invalid domain name: {name!r}")
    if "*" in name:
        raise ValidationError("Wildcard domains need a DNS-01 certificate and are not supported yet")
    if len(name) > 253:
        raise ValidationError("Domain name is too long")
    if name in {"localhost", "localhost.localdomain"}:
        raise ValidationError("localhost cannot get a public certificate")
    try:
        ascii_name = name.encode("idna").decode("ascii")
    except UnicodeError as exc:
        raise ValidationError(f"Invalid domain name: {exc}") from exc
    if not DOMAIN_RE.match(ascii_name):
        raise ValidationError(f"Invalid domain name: {name!r}")
    try:
        ipaddress.ip_address(ascii_name)
    except ValueError:
        return ascii_name
    raise ValidationError("IP addresses cannot get a public certificate; use a domain name")


def normalize_domains(values) -> list[str]:
    if isinstance(values, str):
        values = [part.strip() for part in re.split(r"[,\s]+", values) if part.strip()]
    if not isinstance(values, (list, tuple)):
        raise ValidationError("Domains must be a list")
    cleaned: list[str] = []
    for value in values:
        domain = normalize_domain(value)
        if domain not in cleaned:
            cleaned.append(domain)
    if not cleaned:
        raise ValidationError("At least one domain is required")
    if len(cleaned) > MAX_DOMAINS:
        raise ValidationError(f"At most {MAX_DOMAINS} domains per route")
    return cleaned


def normalize_upstream(value) -> str:
    """Accept ``host:port`` (optionally prefixed with ``http://``) and return ``host:port``."""
    text = str(value or "").strip()
    lowered = text.lower()
    if lowered.startswith("https://"):
        raise ValidationError("HTTPS targets are not supported yet; use host:port (plain HTTP)")
    if lowered.startswith("http://"):
        text = text[len("http://"):]
    if not text or text != text.strip() or any(ch in text for ch in " /\t\n\r{}"):
        raise ValidationError("Target must be host:port, for example 192.168.1.10:8080")
    if ":" not in text:
        raise ValidationError("Target needs a port, for example 192.168.1.10:8080")
    if text.startswith("["):
        host, _, rest = text.partition("]")
        host = host[1:]
        if not rest.startswith(":"):
            raise ValidationError("Target must be host:port, for example [fd00::1]:8080")
        port_text = rest[1:]
        try:
            ipaddress.IPv6Address(host)
        except ValueError as exc:
            raise ValidationError(f"Invalid IPv6 address: {host}") from exc
    else:
        host, _, port_text = text.rpartition(":")
        if ":" in host:
            raise ValidationError("IPv6 targets need brackets, for example [fd00::1]:8080")
        if not HOST_RE.match(host):
            raise ValidationError(f"Invalid target host: {host!r}")
    if not port_text.isdigit():
        raise ValidationError("Target port must be a number")
    port = int(port_text)
    if not 1 <= port <= 65535:
        raise ValidationError("Target port must be between 1 and 65535")
    return f"[{host}]:{port}" if ":" in host else f"{host}:{port}"


def normalize_email(value) -> str:
    email = str(value or "").strip()
    if not email:
        return ""
    if not EMAIL_RE.match(email):
        raise ValidationError("Enter a valid email address for the certificate authority")
    return email


def normalize_bool(value, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def sanitize_route(payload: dict) -> dict:
    """Turn an API payload into a stored route (no rendering here)."""
    if not isinstance(payload, dict):
        raise ValidationError("Invalid route payload")
    note = str(payload.get("note") or "").replace("\r", " ").replace("\n", " ").strip()[:120]
    return {
        "id": str(payload.get("id") or "").strip()[:32],
        "domains": normalize_domains(payload.get("domains")),
        "upstream": normalize_upstream(payload.get("upstream")),
        "preserve_host": normalize_bool(payload.get("preserve_host"), True),
        "stream": normalize_bool(payload.get("stream")),
        "enabled": normalize_bool(payload.get("enabled"), True),
        "note": note,
    }


# ── Rendering ───────────────────────────────────────────────────────────────

def render_options(settings: dict) -> str:
    lines: list[str] = []
    email = normalize_email(settings.get("acme_email"))
    if email:
        lines.append(f"\temail {email}")
    if normalize_bool(settings.get("staging")):
        lines.append(f"\tacme_ca {STAGING_CA}")
    lines.extend([
        "\tlog {",
        "\t\toutput file /var/log/caddy/caddy.log {",
        "\t\t\troll_size 5MiB",
        "\t\t\troll_keep 3",
        "\t\t}",
        "\t\tformat json",
        "\t}",
    ])
    return "\n".join(lines) + "\n"


def render_routes(routes) -> str:
    blocks: list[str] = []
    for route in routes or []:
        if not normalize_bool(route.get("enabled"), True):
            continue
        domains = [normalize_domain(name) for name in route.get("domains") or []]
        if not domains:
            continue
        upstream = normalize_upstream(route.get("upstream"))
        body = [
            "\tencode zstd gzip",
            f"\treverse_proxy {upstream} {{",
            "\t\tstream_close_delay 5m",
        ]
        if normalize_bool(route.get("stream")):
            body.append("\t\tflush_interval -1")
        if not normalize_bool(route.get("preserve_host"), True):
            body.append("\t\theader_up Host {upstream_hostport}")
        body.append("\t}")
        blocks.append(" ".join(domains) + " {\n" + "\n".join(body) + "\n}")
    return "\n\n".join(blocks) + ("\n" if blocks else "")


def build_caddyfile(settings: dict, routes) -> str:
    """The complete document the running Caddy should use."""
    document = "{\n\tadmin :2019\n" + render_options(settings) + "}\n\n" + render_routes(routes)
    # A trailing blank line makes `caddy adapt` emit a formatting warning.
    return document.rstrip("\n") + "\n"
