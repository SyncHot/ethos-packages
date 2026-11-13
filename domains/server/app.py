"""EthOS Domains - control plane for the Caddy reverse proxy.

Serves a small JSON API on port 8093 (published as 127.0.0.1:8093 on the host).
EthOS reaches it through the authenticated ``/api/packages/domains/proxy/``
endpoint, so it is never reachable from the LAN.

Every mutation follows the same order::

    payload -> validate -> new state -> adapt -> load -> persist

``/adapt`` parses the rendered Caddyfile without touching the running config, so
a bad route is rejected with Caddy's own message and nothing changes. ``/load``
applies it with zero downtime and rolls back on error. Only then is the state
written, and the same text is stored on disk for the next boot.

Only GET and POST exist: the EthOS package proxy forwards nothing else.
"""

import ipaddress
import json
import logging
import os
import socket
import sys
import threading
import time
import traceback
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))

import certs  # noqa: E402
import config_gen  # noqa: E402
import store  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("domains.api")

PORT = int(os.environ.get("DOMAINS_PORT", "8093"))
CADDY_ADMIN = os.environ.get("CADDY_ADMIN", "http://proxy:2019").rstrip("/")
CADDY_LOG_FILE = Path(os.environ.get("CADDY_LOG_FILE", "/var/log/caddy/caddy.log"))
GENERATED_DIR = Path(os.environ.get("GENERATED_DIR", "/etc/caddy/generated"))
MAX_BODY = 64 * 1024
VERSION = "1.1.1"

_APPLY_LOCK = threading.Lock()
_LAST_APPLY = {"at": "", "error": "", "warnings": []}


class ApiError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


# ── Caddy admin API ─────────────────────────────────────────────────────────

def _caddy(path: str, body: str | None = None, content_type: str = "application/json",
           timeout: int = 30) -> tuple[int, bytes]:
    data = body.encode("utf-8") if isinstance(body, str) else body
    headers = {"Content-Type": content_type} if data is not None else {}
    request = urllib.request.Request(
        f"{CADDY_ADMIN}{path}", data=data, headers=headers,
        method="POST" if data is not None else "GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read()
    except (urllib.error.URLError, OSError) as exc:
        reason = getattr(exc, "reason", exc)
        raise ApiError(
            503,
            f"The proxy container is not reachable ({reason}). Check that ports 80 and 443 "
            "are free and that the package containers are running.",
        ) from exc


def caddy_alive() -> bool:
    try:
        status, _ = _caddy("/config/", timeout=3)
    except ApiError:
        return False
    return status == 200


def _caddy_error(body: bytes) -> str:
    try:
        payload = json.loads(body.decode("utf-8") or "{}")
    except ValueError:
        return body.decode("utf-8", "replace").strip()[:400] or "unknown error"
    message = str(payload.get("error") or "").strip()
    warnings = payload.get("warnings") or []
    if warnings:
        extra = "; ".join(
            f"{item.get('file', '')}:{item.get('line', '')} {item.get('message', '')}".strip()
            for item in warnings[:3] if isinstance(item, dict)
        )
        message = f"{message} ({extra})" if message else extra
    return message[:600]


def _write_atomic(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)


def apply_state(state: dict) -> list[dict]:
    """Push ``state`` to Caddy; raise ApiError when Caddy rejects it."""
    document = config_gen.build_caddyfile(state["settings"], state["routes"])
    with _APPLY_LOCK:
        status, body = _caddy("/adapt", document, "text/caddyfile")
        if status != 200:
            message = _caddy_error(body)
            _LAST_APPLY.update({"at": _now(), "error": message, "warnings": []})
            raise ApiError(400, f"Caddy rejected the configuration: {message}")
        try:
            warnings = (json.loads(body.decode("utf-8") or "{}") or {}).get("warnings") or []
        except ValueError:
            warnings = []
        status, body = _caddy("/load", document, "text/caddyfile")
        if status != 200:
            message = _caddy_error(body)
            _LAST_APPLY.update({"at": _now(), "error": message, "warnings": []})
            raise ApiError(400, f"Caddy could not load the configuration: {message}")
        _write_atomic(GENERATED_DIR / "options.caddy", config_gen.render_options(state["settings"]))
        _write_atomic(GENERATED_DIR / "routes.caddy", config_gen.render_routes(state["routes"]))
        _LAST_APPLY.update({"at": _now(), "error": "", "warnings": warnings})
    return warnings


# ── Payloads ────────────────────────────────────────────────────────────────

def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def tail_log(limit: int = 120) -> list[str]:
    try:
        size = CADDY_LOG_FILE.stat().st_size
        with CADDY_LOG_FILE.open("rb") as handle:
            handle.seek(max(0, size - 128 * 1024))
            raw = handle.read().decode("utf-8", "replace")
    except OSError:
        return []
    lines = [line for line in raw.splitlines() if line.strip()]
    return lines[-limit:]


def resolve_domain(name: str) -> dict:
    domain = config_gen.normalize_domain(name)
    try:
        infos = socket.getaddrinfo(domain, 443, proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        return {"domain": domain, "addresses": [], "error": f"DNS lookup failed: {exc}"}
    addresses = sorted({info[4][0] for info in infos})
    private = bool(addresses) and all(ipaddress.ip_address(ip).is_private for ip in addresses)
    hint = ""
    if not addresses:
        hint = "No A/AAAA record yet. Create it at your DNS provider and wait for the TTL."
    elif private:
        hint = ("This resolves to a private address, which Let's Encrypt cannot reach. "
                "Add a public A/AAAA record (and forward ports 80/443) for certificate issuance.")
    return {"domain": domain, "addresses": addresses, "private": private, "hint": hint}


def state_payload() -> dict:
    state = store.load()
    return {
        "version": VERSION,
        "settings": state["settings"],
        "routes": state["routes"],
        "caddy": {"reachable": caddy_alive()},
        "certs": certs.inventory(),
        "apply": dict(_LAST_APPLY),
        "targets": [
            {"label": "This EthOS NAS", "value": "host.docker.internal:9000"},
            {"label": "This NAS, another port", "value": "host.docker.internal:"},
        ],
    }


def _commit(mutator) -> dict:
    """Apply ``mutator(state)`` to a copy, push it to Caddy, then persist."""
    candidate = store.load()
    result = mutator(candidate)
    warnings = apply_state(candidate)
    store.save(candidate)
    return {"ok": True, "result": result, "warnings": warnings, "state": state_payload()}


# ── HTTP handler ────────────────────────────────────────────────────────────

class Handler(BaseHTTPRequestHandler):
    server_version = "ethos-domains"
    sys_version = ""

    def log_message(self, fmt, *args):  # noqa: A003 - stdlib signature
        logger.debug("%s - %s", self.address_string(), fmt % args)

    def _send(self, status: int, payload) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _body(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length > MAX_BODY:
            raise ApiError(413, "Request body is too large")
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8") or "{}")
        except ValueError as exc:
            raise ApiError(400, f"Invalid JSON: {exc}") from exc
        if not isinstance(payload, dict):
            raise ApiError(400, "Expected a JSON object")
        return payload

    def do_GET(self):  # noqa: N802 - stdlib signature
        self._dispatch("GET")

    def do_POST(self):  # noqa: N802 - stdlib signature
        self._dispatch("POST")

    def do_PUT(self):  # noqa: N802
        self._not_allowed()

    def do_PATCH(self):  # noqa: N802
        self._not_allowed()

    def do_DELETE(self):  # noqa: N802
        self._not_allowed()

    def _not_allowed(self) -> None:
        self._send(405, {"detail": "Only GET and POST are available through the EthOS package proxy"})

    def _dispatch(self, method: str) -> None:
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        query = parse_qs(parsed.query)
        try:
            handler = ROUTES.get((method, path))
            if handler is None:
                raise ApiError(404, f"No route for {method} {path}")
            if method == "GET":
                payload = handler(query)
            else:
                payload = handler(self._body())
            self._send(200, payload)
        except config_gen.ValidationError as exc:
            self._send(400, {"detail": str(exc)})
        except ApiError as exc:
            self._send(exc.status, {"detail": exc.detail})
        except Exception as exc:  # noqa: BLE001 - the HTTP boundary logs everything
            logger.error("Unhandled error on %s %s: %s", method, path, exc, exc_info=True)
            self._send(500, {"detail": f"Unexpected error: {exc}"})


# ── Endpoints ───────────────────────────────────────────────────────────────

def _health(_query) -> dict:
    alive = caddy_alive()
    return {
        "status": "ready" if alive else "degraded",
        "caddy": alive,
        "version": VERSION,
        "managed_routes": len(store.load()["routes"]),
    }


def _state(_query) -> dict:
    return state_payload()


def _certs(_query) -> dict:
    return certs.inventory()


def _logs(query) -> dict:
    try:
        limit = max(1, min(500, int((query.get("limit") or ["120"])[0])))
    except ValueError:
        limit = 120
    return {"lines": tail_log(limit)}


def _dns(query) -> dict:
    name = (query.get("domain") or [""])[0]
    if not name:
        raise ApiError(400, "domain is required")
    return resolve_domain(name)


def _save_route(payload: dict) -> dict:
    fields = config_gen.sanitize_route(payload)
    created: dict = {}

    def mutate(state):
        created.update(store.merge_route(state, fields))
        return created

    return _commit(mutate)


def _delete_route(payload: dict) -> dict:
    route_id = str(payload.get("id") or "").strip()
    if not route_id:
        raise ApiError(400, "id is required")
    deleted = {"removed": False}

    def mutate(state):
        deleted["removed"] = store.remove_route(state, route_id)
        return deleted

    if not any(route.get("id") == route_id for route in store.load()["routes"]):
        raise ApiError(404, "Route not found")
    return _commit(mutate)


def _save_settings(payload: dict) -> dict:
    fields = {
        "acme_email": config_gen.normalize_email(payload.get("acme_email")),
        "staging": config_gen.normalize_bool(payload.get("staging")),
    }
    return _commit(lambda state: store.merge_settings(state, fields))


def _apply(_payload: dict) -> dict:
    return _commit(lambda state: {"applied": True})


def _import_routes(payload: dict) -> dict:
    """Replace (or append) the whole route list in one atomic step.

    Used to migrate an existing proxy configuration: every route is validated
    first, then rendered, adapted and loaded as a single document. A single bad
    route rejects the import and leaves the running config untouched.
    """
    raw_routes = payload.get("routes")
    if not isinstance(raw_routes, list):
        raise ApiError(400, "routes must be a list")
    incoming = [config_gen.sanitize_route(item) for item in raw_routes]
    replace = config_gen.normalize_bool(payload.get("replace"), True)
    settings = payload.get("settings") or {}
    settings_fields = {}
    if isinstance(settings, dict) and settings:
        settings_fields = {
            "acme_email": config_gen.normalize_email(settings.get("acme_email")),
            "staging": config_gen.normalize_bool(settings.get("staging")),
        }

    def mutate(state):
        if replace:
            state["routes"] = []
        for route in incoming:
            route.pop("id", None)  # fresh ids, so an import never collides
            store.merge_route(state, route)
        if settings_fields:
            store.merge_settings(state, settings_fields)
        return {"imported": len(incoming), "replace": replace}

    return _commit(mutate)


ROUTES = {
    ("GET", "/api/health"): _health,
    ("GET", "/api/state"): _state,
    ("GET", "/api/certs"): _certs,
    ("GET", "/api/logs"): _logs,
    ("GET", "/api/dns"): _dns,
    ("POST", "/api/routes"): _save_route,
    ("POST", "/api/routes/import"): _import_routes,
    ("POST", "/api/routes/delete"): _delete_route,
    ("POST", "/api/settings"): _save_settings,
    ("POST", "/api/apply"): _apply,
}


def main() -> None:
    store.DATA_DIR.mkdir(parents=True, exist_ok=True)
    # Bind inside the container network; the compose file publishes it as
    # 127.0.0.1:8093 on the host, so nothing is exposed to the LAN. Binding
    # 127.0.0.1 here would be unreachable through Docker's port forwarding.
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    logger.info("Domains control plane listening on 127.0.0.1:%s (caddy admin %s)", PORT, CADDY_ADMIN)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Stopping")
    finally:
        server.server_close()


if __name__ == "__main__":
    try:
        main()
    except Exception:  # noqa: BLE001 - top-level crash must be visible in the log
        traceback.print_exc()
        sys.exit(1)
