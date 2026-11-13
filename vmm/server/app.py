"""EthOS VM Manager — package service.

Two listeners, deliberately separated:

* ``127.0.0.1:8095`` — JSON API. Published on the NAS loopback only, so the only
  way in is EthOS's authenticated ``/api/packages/vmm/proxy/`` endpoint.
* ``0.0.0.0:8094`` — browser console: the noVNC page, its static assets and the
  ticket-gated WebSocket bridge. Nothing else answers on this port, so a LAN
  client can never reach the API or a VM without a signed ticket.
"""

import hashlib
import hmac
import json
import os
import secrets
import signal
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import console
import engine as engine_module

DATA = Path(os.environ.get("VMM_DATA", "/data"))
STATE_FILE = DATA / ".engine" / "state"
SECRET_FILE = DATA / "secret"
NOVNC_ROOT = Path("/usr/share/novnc")
API_PORT = int(os.environ.get("VMM_API_PORT", "8095"))
CONSOLE_PORT = int(os.environ.get("VMM_CONSOLE_PORT", "8094"))
# Inside the container the API listens on all interfaces, because Docker
# forwards published ports to the container's bridge address, not to its
# loopback. The compose file publishes it as 127.0.0.1:8095 on the NAS, so only
# EthOS and the NAS itself can reach it.
API_HOST = "0.0.0.0" 
TICKET_TTL = 120

ENGINE = engine_module.Engine()


def _secret() -> bytes:
    try:
        value = SECRET_FILE.read_bytes().strip()
        if len(value) >= 32:
            return value
    except OSError:
        pass
    value = secrets.token_bytes(32)
    DATA.mkdir(parents=True, exist_ok=True)
    SECRET_FILE.write_bytes(value)
    try:
        SECRET_FILE.chmod(0o600)
    except OSError:
        pass  # the volume is already private to the container
    return value


SECRET = _secret()


def provisioning_step() -> str:
    try:
        return STATE_FILE.read_text(encoding="utf-8").strip() or "starting"
    except OSError:
        return "starting"


def sign_ticket(vm_id: str) -> dict:
    expires = int(time.time()) + TICKET_TTL
    payload = f"{vm_id}.{expires}".encode()
    signature = hmac.new(SECRET, payload, hashlib.sha256).hexdigest()[:40]
    return {"vm": vm_id, "exp": expires, "ticket": f"{expires}.{signature}"}


def verify_ticket(vm_id: str, ticket: str) -> bool:
    try:
        expires_text, signature = str(ticket or "").split(".", 1)
        expires = int(expires_text)
    except (TypeError, ValueError):
        return False
    if expires < int(time.time()):
        return False
    expected = hmac.new(SECRET, f"{vm_id}.{expires}".encode(), hashlib.sha256).hexdigest()[:40]
    return hmac.compare_digest(expected, signature)


class _Base(BaseHTTPRequestHandler):
    server_version = "EthOS-VMM/1.0"
    protocol_version = "HTTP/1.0"

    def log_message(self, fmt, *args):  # noqa: A003 - stdlib signature
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    # ── helpers ─────────────────────────────────────────────────────────────
    def send_json(self, payload, status: int = 200) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def send_text(self, text: str, status: int = 200, content_type: str = "text/html; charset=utf-8") -> None:
        body = text.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def read_json(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0:
            return {}
        if length > 256 * 1024:
            raise engine_module.EngineError("Request body is too large", 413)
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8"))
        except ValueError as exc:
            raise engine_module.EngineError("Body must be JSON", 400) from exc
        if not isinstance(payload, dict):
            raise engine_module.EngineError("Body must be a JSON object", 400)
        return payload


class ApiHandler(_Base):
    """JSON API — reachable only through the EthOS proxy on loopback."""

    def do_GET(self):  # noqa: N802 - stdlib signature
        self._dispatch("GET")

    def do_POST(self):  # noqa: N802
        self._dispatch("POST")

    def do_DELETE(self):  # noqa: N802
        self._dispatch("DELETE")

    def _dispatch(self, method: str) -> None:
        parsed = urlsplit(self.path)
        path = parsed.path.rstrip("/") or "/"
        query = parse_qs(parsed.query)
        try:
            payload, status = self._route(method, path, query)
        except engine_module.EngineError as exc:
            self.send_json({"detail": exc.detail}, exc.status)
        except Exception as exc:  # keep the window usable; log the real cause
            sys.stderr.write(f"api error {method} {path}: {exc}\n")
            self.send_json({"detail": f"Engine error: {exc}"}, 500)
        else:
            self.send_json(payload, status)

    def _route(self, method: str, path: str, query: dict) -> tuple[dict, int]:
        if method == "GET" and path == "/api/health":
            step = provisioning_step()
            if step != "ready":
                return _health_payload(503, step), 503
            return _health_payload(200, step), 200
        if method == "GET" and path == "/api/host":
            return ENGINE.host(), 200
        if method == "GET" and path == "/api/vms":
            return {"items": ENGINE.list_vms()}, 200
        if method == "POST" and path == "/api/vms":
            return {"item": ENGINE.create(self.read_json())}, 200
        if path == "/api/storage/list" and method == "GET":
            raw = (query.get("path") or [""])[0]
            return ENGINE.list_dir(raw), 200
        if path == "/api/console/ticket" and method == "POST":
            body = self.read_json()
            vm_id = str(body.get("vm") or "").strip()
            ENGINE.get(vm_id)
            ticket = sign_ticket(vm_id)
            return {**ticket, "port": CONSOLE_PORT,
                    "url": f"/console?vm={vm_id}&ticket={ticket['ticket']}"}, 200
        if path.startswith("/api/vms/"):
            parts = path[len("/api/vms/"):].split("/")
            vm_id = parts[0]
            if len(parts) == 1 and method == "GET":
                return {"item": ENGINE.get(vm_id)}, 200
            if len(parts) == 1 and method == "DELETE":
                keep = (query.get("keep_disks") or ["0"])[0] in ("1", "true", "yes")
                ENGINE.delete(vm_id, keep_disks=keep)
                return {"deleted": vm_id}, 200
            if len(parts) == 2 and parts[1] == "action" and method == "POST":
                action = str(self.read_json().get("action") or "").strip().lower()
                return {"item": ENGINE.action(vm_id, action)}, 200
        raise engine_module.EngineError(f"Unknown endpoint: {method} {path}", 404)


class ConsoleHandler(_Base):
    """Console page, noVNC assets and the WebSocket bridge. Ticket required."""

    def do_GET(self):  # noqa: N802
        parsed = urlsplit(self.path)
        query = parse_qs(parsed.query)
        if parsed.path == "/websockify":
            return self._websocket(query)
        if parsed.path == "/console":
            return self._console(query)
        if parsed.path.startswith("/novnc/"):
            return self._static(parsed.path[len("/novnc/"):])
        if parsed.path in ("/", "/health"):
            return self.send_json(_health_payload(200, provisioning_step()))
        self.send_json({"detail": "Not found"}, 404)

    def _console(self, query: dict) -> None:
        vm_id = (query.get("vm") or [""])[0]
        ticket = (query.get("ticket") or [""])[0]
        if not verify_ticket(vm_id, ticket):
            return self.send_text(_error_page(
                "This console link has expired.",
                "Open the VM again from EthOS VM Manager to get a fresh one.",
            ), 403)
        try:
            vm = ENGINE.get(vm_id)
        except engine_module.EngineError:
            return self.send_text(_error_page("This VM no longer exists.", ""), 404)
        if vm["status"] != "running":
            return self.send_text(_error_page(
                f"{vm['name']} is {vm['status']}.",
                "Start the VM in EthOS VM Manager, then open the console again.",
            ), 409)
        self.send_text(_console_page(vm["name"], vm_id, ticket))

    def _static(self, relative: str) -> None:
        target = (NOVNC_ROOT / relative).resolve()
        if NOVNC_ROOT not in target.parents and target != NOVNC_ROOT:
            return self.send_json({"detail": "Not found"}, 404)
        if not target.is_file():
            return self.send_json({"detail": "Not found"}, 404)
        content_type = _content_type(target)
        try:
            body = target.read_bytes()
        except OSError:
            return self.send_json({"detail": "Unreadable asset"}, 500)
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "public, max-age=3600")
        self.end_headers()
        self.wfile.write(body)

    def _websocket(self, query: dict) -> None:
        vm_id = (query.get("vm") or [""])[0]
        ticket = (query.get("ticket") or [""])[0]
        key = self.headers.get("Sec-WebSocket-Key") or ""
        if self.headers.get("Upgrade", "").lower() != "websocket" or not key:
            return self.send_json({"detail": "WebSocket upgrade required"}, 400)
        if not verify_ticket(vm_id, ticket):
            return self.send_json({"detail": "Invalid or expired console ticket"}, 403)
        try:
            vm = ENGINE.get(vm_id)
        except engine_module.EngineError:
            return self.send_json({"detail": "Unknown VM"}, 404)
        if vm["status"] != "running":
            return self.send_json({"detail": "VM is not running"}, 409)

        self.send_response(101, "Switching Protocols")
        self.send_header("Upgrade", "websocket")
        self.send_header("Connection", "Upgrade")
        self.send_header("Sec-WebSocket-Accept", console.accept_key(key))
        self.end_headers()
        self.wfile.flush()
        self.close_connection = True
        console.bridge(self.rfile, self.wfile, threading.Lock(), vm["vnc_port"])


def _content_type(path: Path) -> str:
    suffix = path.suffix.lower()
    return {
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".html": "text/html; charset=utf-8",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".json": "application/json",
        ".woff2": "font/woff2",
    }.get(suffix, "application/octet-stream")


def _health_payload(status: int, step: str) -> dict:
    return {
        "state": "ready" if status == 200 else "provisioning",
        "step": step,
        "accel": engine_module.qemu.accelerator(),
    }


def _console_page(name: str, vm_id: str, ticket: str) -> str:
    safe_name = name.replace("<", "&lt;").replace(">", "&gt;")
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{safe_name} — console</title>
<style>
  html, body {{ margin: 0; height: 100%; background: #0b1220; color: #dbe4f0;
               font-family: ui-sans-serif, system-ui, sans-serif; }}
  #wrap {{ position: fixed; inset: 0; }}
  #screen {{ width: 100%; height: 100%; }}
  #hud {{ position: absolute; left: 12px; bottom: 12px; display: flex; gap: 8px;
         align-items: center; background: rgba(2, 6, 23, .72); padding: 6px 10px;
         border-radius: 8px; font-size: 12px; }}
  #hud button {{ background: #1d4ed8; color: #fff; border: 0; border-radius: 6px;
                padding: 4px 10px; font-size: 12px; cursor: pointer; }}
  #state {{ opacity: .8; }}
</style>
</head>
<body>
<div id="wrap"><div id="screen"></div>
  <div id="hud"><span id="state">connecting…</span>
    <button id="reconnect" hidden>Reconnect</button></div>
</div>
<script type="module">
  import RFB from '/novnc/core/rfb.js';
  const params = new URLSearchParams(location.search);
  const vm = params.get('vm') || {json.dumps(vm_id)};
  const ticket = params.get('ticket') || {json.dumps(ticket)};
  const scheme = location.protocol === 'https:' ? 'wss://' : 'ws://';
  const url = `${{scheme}}${{location.host}}/websockify?vm=${{encodeURIComponent(vm)}}&ticket=${{encodeURIComponent(ticket)}}`;
  const stateEl = document.getElementById('state');
  const button = document.getElementById('reconnect');
  let rfb = null;
  function connect() {{
    button.hidden = true;
    stateEl.textContent = 'connecting…';
    rfb = new RFB(document.getElementById('screen'), url, {{ wsProtocols: ['binary'] }});
    rfb.scaleViewport = true;
    rfb.resizeSession = false;
    rfb.addEventListener('connect', () => {{ stateEl.textContent = 'connected'; }});
    rfb.addEventListener('disconnect', (ev) => {{
      stateEl.textContent = ev.detail && ev.detail.clean ? 'session ended' : 'disconnected';
      button.hidden = false;
    }});
  }}
  button.addEventListener('click', connect);
  connect();
</script>
</body>
</html>"""


def _error_page(title: str, hint: str) -> str:
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>{title}</title>
<style>body{{margin:0;height:100vh;display:grid;place-items:center;background:#0b1220;
color:#dbe4f0;font-family:ui-sans-serif,system-ui,sans-serif;text-align:center;padding:24px}}
h1{{font-size:18px;margin:0 0 8px}}p{{margin:0;opacity:.75;font-size:13px}}</style>
</head><body><div><h1>{title}</h1><p>{hint}</p></div></body></html>"""


def _serve(handler, host: str, port: int) -> ThreadingHTTPServer:
    server = ThreadingHTTPServer((host, port), handler)
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, name=f"http-{port}", daemon=True).start()
    return server


def main() -> int:
    _serve(ApiHandler, API_HOST, API_PORT)
    _serve(ConsoleHandler, "0.0.0.0", CONSOLE_PORT)  # noqa: S104 - console only, ticket-gated
    print(f"ethos-vmm ready: api :{API_PORT} (loopback via compose), console :{CONSOLE_PORT}", flush=True)
    ENGINE.recover()

    stop = threading.Event()

    def _terminate(signum, _frame):
        print(f"signal {signum}: powering down VMs", flush=True)
        stop.set()

    signal.signal(signal.SIGTERM, _terminate)
    signal.signal(signal.SIGINT, _terminate)
    while not stop.is_set():
        stop.wait(1.0)

    # Ask every running VM for a clean ACPI shutdown, then wait for the rest of
    # the grace period before the container is killed.
    deadline = time.time() + 45
    for vm in ENGINE.list_vms():
        if vm["status"] == "stopped":
            continue
        try:
            ENGINE.action(vm["id"], "shutdown")
        except engine_module.EngineError as exc:
            print(f"shutdown failed for {vm['id']}: {exc.detail}", flush=True)
    while time.time() < deadline:
        if all(vm["status"] == "stopped" for vm in ENGINE.list_vms()):
            break
        time.sleep(1.0)
    return 0


if __name__ == "__main__":
    sys.exit(main())
