"""Route and settings state for the Domains service.

One JSON document in the package data volume::

    {"version": 1, "settings": {...}, "routes": [...]}

Writes are atomic (temp file + ``os.replace``) so a power cut cannot leave half
a document behind, and the route list is capped so it cannot grow forever.

The ``merge_*`` helpers are pure: the caller applies a change to an in-memory
copy, pushes it to Caddy, and only then persists it. That keeps the store in
sync with the config Caddy actually accepted.
"""

import json
import logging
import os
import secrets
import tempfile
import threading
import time
from pathlib import Path

logger = logging.getLogger("domains.store")

DATA_DIR = Path(os.environ.get("DOMAINS_DATA_DIR", "/data"))
STATE_FILE = DATA_DIR / "domains.json"
SCHEMA_VERSION = 1
MAX_ROUTES = 200

_LOCK = threading.Lock()

DEFAULT_SETTINGS = {"acme_email": "", "staging": False}


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _empty() -> dict:
    return {"version": SCHEMA_VERSION, "settings": dict(DEFAULT_SETTINGS), "routes": []}


def normalise(doc) -> dict:
    state = _empty()
    if not isinstance(doc, dict):
        return state
    settings = doc.get("settings")
    if isinstance(settings, dict):
        state["settings"].update({
            "acme_email": str(settings.get("acme_email") or ""),
            "staging": bool(settings.get("staging")),
        })
    routes = doc.get("routes")
    if isinstance(routes, list):
        state["routes"] = [r for r in routes if isinstance(r, dict) and r.get("id")][:MAX_ROUTES]
    return state


def load() -> dict:
    with _LOCK:
        try:
            return normalise(json.loads(STATE_FILE.read_text(encoding="utf-8")))
        except FileNotFoundError:
            return _empty()
        except (OSError, ValueError) as exc:
            logger.error("Cannot read %s: %s", STATE_FILE, exc, exc_info=True)
            return _empty()


def _write(state: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(state, indent=2, sort_keys=True) + "\n"
    fd, tmp = tempfile.mkstemp(dir=str(DATA_DIR), prefix=".domains-", suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(tmp, 0o600)
        os.replace(tmp, STATE_FILE)
    except OSError:
        logger.error("Cannot write %s", STATE_FILE, exc_info=True)
        try:
            os.unlink(tmp)
        except OSError:
            pass  # already gone; the write failure above is the real error
        raise


def save(state: dict) -> dict:
    with _LOCK:
        normalised = normalise(state)
        _write(normalised)
        return normalised


def merge_route(state: dict, fields: dict) -> dict:
    """Create or replace a route in ``state`` (which the caller then persists)."""
    route_id = str(fields.get("id") or "").strip()
    if route_id:
        for index, route in enumerate(state.get("routes") or []):
            if route.get("id") == route_id:
                updated = {**route, **fields, "id": route_id, "updated_at": _now()}
                state["routes"][index] = updated
                return updated
        route_id = ""  # unknown id: fall through and create it
    routes = state.setdefault("routes", [])
    if len(routes) >= MAX_ROUTES:
        raise ValueError(f"At most {MAX_ROUTES} routes are supported")
    created = {
        **fields,
        "id": route_id or f"r_{secrets.token_hex(4)}",
        "created_at": _now(),
        "updated_at": _now(),
    }
    routes.append(created)
    return created


def remove_route(state: dict, route_id: str) -> bool:
    routes = state.get("routes") or []
    remaining = [route for route in routes if route.get("id") != route_id]
    if len(remaining) == len(routes):
        return False
    state["routes"] = remaining
    return True


def merge_settings(state: dict, fields: dict) -> dict:
    settings = state.setdefault("settings", dict(DEFAULT_SETTINGS))
    settings.update({k: v for k, v in fields.items() if k in DEFAULT_SETTINGS})
    return settings
