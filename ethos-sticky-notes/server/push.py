#!/usr/bin/env python3
"""Web Push support for EthOS Sticky Notes.

The package owns its push state: a per-installation VAPID key pair and the
browser push subscriptions of every account (``push.json``, mode 0600). The
notes service calls :func:`send_to_user` when a reminder is due; the browser's
service worker (served by the EthOS core) displays the notification.

``pywebpush`` is imported lazily so the notes service still starts when the
wheelhouse was not installed (push is then reported as unavailable). The
endpoint is validated twice — on subscribe and again before every send — to
keep the service from becoming an SSRF proxy: only HTTPS URLs that resolve to
public IP addresses are accepted.
"""

from __future__ import annotations

import base64
import ipaddress
import json
import os
import socket
import sys
import threading
from datetime import datetime, timezone
from urllib.parse import urlsplit

STATE_DIR = os.environ.get("ETHOS_PACKAGE_DATA_DIR") or os.getcwd()
PUSH_FILE = os.path.join(STATE_DIR, "push.json")
VAPID_PRIVATE_FILE = os.path.join(STATE_DIR, "vapid_private.pem")
VAPID_SUBJECT = os.environ.get("ETHOS_STICKY_VAPID_SUB", "mailto:ethos-nas@example.com")

MAX_SUBSCRIPTIONS = 5
MAX_ENDPOINT = 2048
MAX_KEY = 512

_LOCK = threading.RLock()


# ── State ───────────────────────────────────────────────────────────────────

def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _default_store() -> dict:
    return {"version": 1, "vapid": {}, "users": {}}


def _atomic_write(path: str, payload: str, mode: int = 0o600) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as handle:
        handle.write(payload)
        handle.flush()
        os.fsync(handle.fileno())
    os.chmod(tmp, mode)
    os.replace(tmp, path)


def _load() -> dict:
    if not os.path.exists(PUSH_FILE):
        return _default_store()
    try:
        with open(PUSH_FILE, encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, ValueError) as exc:
        print(f"push store unreadable, starting empty: {exc}", file=sys.stderr, flush=True)
        return _default_store()
    if not isinstance(data, dict):
        return _default_store()
    store = _default_store()
    vapid = data.get("vapid")
    if isinstance(vapid, dict):
        store["vapid"] = {
            "private_pem": str(vapid.get("private_pem") or ""),
            "public_key": str(vapid.get("public_key") or ""),
        }
    users = data.get("users")
    if isinstance(users, dict):
        for raw_user, entries in users.items():
            user = str(raw_user or "")[:64]
            if not user or not isinstance(entries, list):
                continue
            cleaned = []
            for entry in entries[:MAX_SUBSCRIPTIONS]:
                sub = _clean_subscription(entry, resolve=False)
                if sub:
                    cleaned.append(sub)
            store["users"][user] = cleaned
    return store


def _save(store: dict) -> None:
    _atomic_write(PUSH_FILE, json.dumps(store, indent=2))


# ── VAPID ───────────────────────────────────────────────────────────────────

def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _generate_vapid() -> tuple[str, str]:
    """Return (private PEM, public key as base64url) for a new P-256 key."""
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec

    key = ec.generate_private_key(ec.SECP256R1())
    pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption(),
    ).decode("ascii")
    raw = key.public_key().public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint,
    )
    return pem, _b64url(raw)


def ensure_vapid(store: dict | None = None) -> dict:
    """Make sure this installation has a VAPID key pair; write the PEM file."""
    own = store is None
    with _LOCK:
        if own:
            store = _load()
        vapid = store.setdefault("vapid", {})
        if not vapid.get("private_pem") or not vapid.get("public_key"):
            pem, public = _generate_vapid()
            vapid["private_pem"] = pem
            vapid["public_key"] = public
            if own:
                _save(store)
        pem = str(vapid["private_pem"])
        if not os.path.isfile(VAPID_PRIVATE_FILE):
            _atomic_write(VAPID_PRIVATE_FILE, pem, 0o600)
        return dict(vapid)


def public_key() -> str:
    with _LOCK:
        store = _load()
        return str(ensure_vapid(store).get("public_key") or "")


def is_available() -> bool:
    """True when pywebpush is installed and a key pair can be produced."""
    try:
        import importlib.util
        if importlib.util.find_spec("pywebpush") is None:
            return False
        import cryptography  # noqa: F401
    except Exception:  # noqa: BLE001 - reporting availability only
        return False
    return True


# ── Subscriptions ───────────────────────────────────────────────────────────

def _host(endpoint: str) -> str:
    try:
        return urlsplit(endpoint).hostname or "?"
    except ValueError:
        return "?"


def validate_endpoint(endpoint) -> str:
    """Return a safe HTTPS push endpoint or raise ValueError.

    Push endpoints are attacker-controlled input (any signed-in account can
    POST one), so the notes service must never turn them into a request to a
    loopback, LAN or link-local address. Validation happens on subscribe and
    again before every send (DNS can change).
    """
    text = str(endpoint or "").strip()
    if not text or len(text) > MAX_ENDPOINT:
        raise ValueError("push endpoint is empty or too long")
    try:
        parsed = urlsplit(text)
    except ValueError as exc:
        raise ValueError("push endpoint is not a valid URL") from exc
    if parsed.scheme != "https":
        raise ValueError("push endpoint must use https")
    if parsed.username or parsed.password:
        raise ValueError("push endpoint must not contain credentials")
    host = (parsed.hostname or "").strip().lower()
    if not host or host in ("localhost",) or host.endswith(".local") or host.endswith(".internal"):
        raise ValueError("push endpoint host is not public")
    try:
        addresses = {
            info[4][0]
            for info in socket.getaddrinfo(host, parsed.port or 443, type=socket.SOCK_STREAM)
        }
    except OSError as exc:
        raise ValueError("push endpoint host does not resolve") from exc
    if not addresses:
        raise ValueError("push endpoint host does not resolve")
    for raw in addresses:
        try:
            address = ipaddress.ip_address(raw)
        except ValueError:
            raise ValueError("push endpoint resolved to an invalid address") from None
        if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped:
            address = address.ipv4_mapped
        if not address.is_global:
            raise ValueError("push endpoint resolves to a non-public address")
    return text


def _clean_subscription(value, *, resolve: bool = True, strict: bool = False) -> dict | None:
    def fail(message: str):
        if strict:
            raise ValueError(message)
        return None

    if not isinstance(value, dict):
        return fail("subscription must be an object")
    try:
        endpoint = validate_endpoint(value.get("endpoint")) if resolve else str(
            value.get("endpoint") or "").strip()
    except ValueError as exc:
        return fail(str(exc))
    if not endpoint or len(endpoint) > MAX_ENDPOINT:
        return fail("push endpoint is empty or too long")
    keys = value.get("keys")
    if not isinstance(keys, dict):
        return fail("subscription.keys must be an object")
    p256dh = str(keys.get("p256dh") or "").strip()
    auth = str(keys.get("auth") or "").strip()
    if not p256dh or not auth:
        return fail("subscription keys are incomplete")
    if len(p256dh) > MAX_KEY or len(auth) > MAX_KEY:
        return fail("subscription keys are too long")
    return {
        "endpoint": endpoint,
        "keys": {"p256dh": p256dh, "auth": auth},
        "created_at": str(value.get("created_at") or _now()),
    }


def list_subscriptions(user: str) -> list[dict]:
    with _LOCK:
        return list(_load()["users"].get(user, []))


def subscribe(user: str, subscription) -> dict:
    sub = _clean_subscription(subscription, strict=True)
    if not sub:
        raise ValueError("invalid push subscription")
    with _LOCK:
        store = _load()
        # A browser profile can only belong to one EthOS account at a time.
        for other, entries in store["users"].items():
            store["users"][other] = [
                entry for entry in entries if entry.get("endpoint") != sub["endpoint"]
            ]
        entries = store["users"].setdefault(user, [])
        entries[:] = [entry for entry in entries if entry.get("endpoint") != sub["endpoint"]]
        if len(entries) >= MAX_SUBSCRIPTIONS:
            raise ValueError(f"too many push subscriptions (max {MAX_SUBSCRIPTIONS})")
        entries.append(sub)
        _save(store)
        return {"ok": True, "subscriptions": len(entries)}


def unsubscribe(user: str, endpoint: str) -> dict:
    target = str(endpoint or "").strip()
    with _LOCK:
        store = _load()
        entries = store["users"].get(user, [])
        before = len(entries)
        entries[:] = [entry for entry in entries if entry.get("endpoint") != target]
        if not entries:
            store["users"].pop(user, None)
        if len(entries) != before:
            _save(store)
        return {"ok": True, "removed": before - len(entries)}


def _remove_endpoint(user: str, endpoint: str) -> None:
    with _LOCK:
        store = _load()
        entries = store["users"].get(user, [])
        entries[:] = [entry for entry in entries if entry.get("endpoint") != endpoint]
        if not entries:
            store["users"].pop(user, None)
        _save(store)


# ── Delivery ────────────────────────────────────────────────────────────────

def send_webpush(subscription: dict, payload: dict) -> tuple[bool, str, int]:
    """Send one push. Returns (ok, detail, http_status)."""
    try:
        from pywebpush import WebPushException, webpush
    except Exception as exc:  # noqa: BLE001 - optional dependency
        return False, f"pywebpush unavailable: {exc}", 0
    try:
        endpoint = validate_endpoint(subscription.get("endpoint"))
    except ValueError as exc:
        return False, str(exc), 0
    with _LOCK:
        store = _load()
        vapid = ensure_vapid(store)
    data = json.dumps(payload, ensure_ascii=False)
    claims = {"sub": VAPID_SUBJECT}
    kwargs = {
        "subscription_info": {**subscription, "endpoint": endpoint},
        "data": data,
        "vapid_private_key": VAPID_PRIVATE_FILE,
        "vapid_claims": claims,
        "ttl": 3600,
        "timeout": 10,
    }
    try:
        try:
            import requests
            session = requests.Session()
            session.max_redirects = 0
            webpush(**kwargs, requests_session=session)
        except TypeError:
            # Older pywebpush releases do not accept requests_session.
            webpush(**kwargs)
        return True, "", 200
    except WebPushException as exc:  # type: ignore[misc]
        status = int(getattr(exc, "status_code", 0) or 0)
        text = str(exc)
        if endpoint:
            text = text.replace(endpoint, f"https://{_host(endpoint)}/…")
        return False, text[:300], status
    except Exception as exc:  # noqa: BLE001 - a push failure must not crash the service
        return False, str(exc)[:300].replace(endpoint, f"https://{_host(endpoint)}/…"), 0


def send_to_user(user: str, payload: dict) -> dict:
    """Send a payload to every subscription of one account."""
    sent = failed = removed = 0
    for sub in list_subscriptions(user):
        ok, detail, status = send_webpush(sub, payload)
        if ok:
            sent += 1
            continue
        failed += 1
        if status in (404, 410):
            _remove_endpoint(user, sub.get("endpoint") or "")
            removed += 1
        elif detail:
            print(f"push to {user} ({_host(sub.get('endpoint') or '')}) failed: {detail}",
                  file=sys.stderr, flush=True)
    return {"sent": sent, "failed": failed, "removed": removed}


def test_push(user: str) -> dict:
    return send_to_user(user, {
        "title": "Sticky Notes",
        "body": "Notifications work — reminders will arrive here.",
        "tag": "sticky-notes-test",
        "url": "/notes",
        "kind": "test",
    })
