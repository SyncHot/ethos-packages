"""Certificate inventory for the Domains UI.

Caddy keeps every managed certificate in its data volume::

    /caddy-data/certificates/<ca-host-dir>/<name-dir>/<name>.crt

We only read that tree (the volume is mounted read-only). The UI needs to answer
two questions - "which names have a certificate" and "when does it expire" - so
the cert is decoded for its SANs and ``notAfter``.

``ssl._ssl._test_decode_cert`` is a private CPython helper, but it is the only
stdlib way to read an X.509 certificate. It is wrapped so a future Python
release that drops it degrades to "unknown expiry" instead of a 500.
"""

import logging
import os
import ssl
import time
from pathlib import Path

logger = logging.getLogger("domains.certs")

CERT_ROOTS = (
    # Caddy's default storage root (the data dir itself).
    Path(os.environ.get("CADDY_DATA_DIR", "/caddy-data")) / "certificates",
    # The official image sets XDG_DATA_HOME=/data, so storage lands in
    # /data/caddy/certificates (this is the layout that actually ships).
    Path(os.environ.get("CADDY_DATA_DIR", "/caddy-data")) / "caddy" / "certificates",
)

_decode = getattr(getattr(ssl, "_ssl", None), "_test_decode_cert", None)


def _names(info: dict) -> list[str]:
    names = []
    for kind, value in info.get("subjectAltName") or ():
        if kind == "DNS" and value not in names:
            names.append(value)
    if not names:
        for rdn in info.get("subject") or ():
            for key, value in rdn:
                if key == "commonName" and value not in names:
                    names.append(value)
    return names


def _issuer(info: dict) -> str:
    for rdn in info.get("issuer") or ():
        for key, value in rdn:
            if key == "organizationName":
                return str(value)
    for rdn in info.get("issuer") or ():
        for key, value in rdn:
            if key == "commonName":
                return str(value)
    return ""


def inventory() -> dict:
    """``{"ok": bool, "items": [...]}`` — never raises."""
    if _decode is None:
        logger.warning("ssl._ssl._test_decode_cert is unavailable; certificate expiry is hidden")
        return {"ok": False, "items": []}
    try:
        files = sorted(path for root in CERT_ROOTS if root.is_dir() for path in root.glob("*/*/*.crt"))
    except OSError as exc:
        logger.warning("Cannot list certificate storage: %s", exc)
        return {"ok": False, "items": []}

    now = time.time()
    items = []
    for path in files:
        try:
            info = _decode(str(path))
        except (OSError, ValueError, ssl.SSLError) as exc:
            logger.warning("Cannot decode %s: %s", path, exc)
            continue
        not_after = info.get("notAfter") or ""
        try:
            expires_at = ssl.cert_time_to_seconds(not_after)
        except ValueError:
            expires_at = 0.0
        items.append({
            "names": _names(info),
            "issuer": _issuer(info),
            "not_after": not_after,
            "expires_at": int(expires_at),
            "days_left": int((expires_at - now) // 86400) if expires_at else None,
            "source": path.parent.parent.name,
        })
    items.sort(key=lambda item: item["expires_at"])
    return {"ok": True, "items": items}
