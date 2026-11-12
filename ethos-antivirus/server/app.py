#!/usr/bin/env python3
"""EthOS AntiVirus — small ClamAV front end.

The container talks to a sibling ``clamav`` container over the Compose network
using the ClamD null-terminated protocol. It never modifies scanned files and
only accepts paths under /home, /mnt and /media, which are mounted read-only
into the scanner container at /scan/<root>.
"""

from __future__ import annotations

import json
import mimetypes
import os
import posixpath
import socket
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

HOST = "0.0.0.0"
PORT = int(os.environ.get("PORT", "8092"))
CLAMD_HOST = os.environ.get("CLAMD_HOST", "clamav")
CLAMD_PORT = int(os.environ.get("CLAMD_PORT", "3310"))
SCAN_TIMEOUT = int(os.environ.get("SCAN_TIMEOUT", "1800"))
STATIC_DIR = Path(__file__).resolve().parent / "static"
ALLOWED_ROOTS = ("/home", "/mnt", "/media")
MAX_RESPONSE = 16 * 1024 * 1024


def clamd(command: str, timeout: int = 30) -> str:
    """Send one ClamD command and return the null-terminated response."""
    with socket.create_connection((CLAMD_HOST, CLAMD_PORT), timeout=timeout) as sock:
        sock.settimeout(timeout)
        sock.sendall(command.encode("utf-8") + b"\0")
        chunks: list[bytes] = []
        total = 0
        while True:
            chunk = sock.recv(65536)
            if not chunk:
                break
            chunks.append(chunk)
            total += len(chunk)
            if chunk.endswith(b"\0"):
                break
            if total > MAX_RESPONSE:
                raise RuntimeError("ClamD response is too large")
    return b"".join(chunks).rstrip(b"\0").decode("utf-8", "replace")


def engine_version() -> str:
    try:
        return clamd("zVERSION", timeout=5).strip()
    except OSError:
        return ""


def health() -> tuple[int, dict]:
    try:
        pong = clamd("zPING", timeout=5).strip()
    except OSError as exc:
        return 503, {"status": "starting",
                      "detail": "ClamAV is starting; the first run downloads signatures",
                      "error": str(exc)}
    if pong != "PONG":
        return 503, {"status": "starting", "detail": f"unexpected PING reply: {pong!r}"}
    return 200, {"status": "ready", "engine": engine_version(), "allowed_roots": list(ALLOWED_ROOTS)}


def safe_host_path(raw: str) -> str:
    path = posixpath.normpath(str(raw or "/home").strip())
    if not path.startswith("/"):
        raise ValueError("Path must be absolute")
    if not any(path == root or path.startswith(root + "/") for root in ALLOWED_ROOTS):
        raise ValueError("Path must be under /home, /mnt or /media")
    return path


def scan_path(raw: str) -> dict:
    host_path = safe_host_path(raw)
    container_path = "/scan" + host_path
    # CONTSCAN handles both a single file and a directory tree.
    output = clamd("zCONTSCAN " + container_path, timeout=SCAN_TIMEOUT)
    clean = 0
    infected: list[dict] = []
    errors: list[str] = []
    for line in output.splitlines():
        line = line.strip()
        if not line:
            continue
        file_path, separator, status = line.rpartition(": ")
        if not separator:
            errors.append(line)
            continue
        shown = file_path[len("/scan"):] if file_path.startswith("/scan/") else file_path
        if status == "OK":
            clean += 1
        elif "FOUND" in status:
            infected.append({
                "file": shown,
                "signature": status.split("FOUND", 1)[0].strip(),
            })
        elif status.startswith("ERROR"):
            errors.append(f"{shown}: {status}")
    return {
        "path": host_path,
        "clean": clean,
        "infected": infected,
        "errors": errors,
        "engine": engine_version(),
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "EthOS-AntiVirus/1.0"

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _asset(self, raw_path: str) -> None:
        relative = unquote(urlparse(raw_path).path).lstrip("/") or "index.html"
        if relative.startswith("static/"):
            relative = relative[len("static/"):]
        target = (STATIC_DIR / relative).resolve()
        if STATIC_DIR not in target.parents or not target.is_file():
            self.send_error(404)
            return
        payload = target.read_bytes()
        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", content_type + ("; charset=utf-8" if content_type.startswith("text/") else ""))
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/api/health":
            status, payload = health()
            self._json(status, payload)
            return
        if self.path == "/api/info":
            self._json(200, {"name": "EthOS AntiVirus", "version": "1.0.0",
                             "allowed_roots": list(ALLOWED_ROOTS)})
            return
        self._asset(self.path)

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/api/scan":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
            if length <= 0 or length > 64 * 1024:
                raise ValueError("Invalid request size")
            payload = json.loads(self.rfile.read(length) or b"{}")
            result = scan_path(str(payload.get("path") or "/home"))
        except ValueError as exc:
            self._json(400, {"detail": str(exc)})
            return
        except OSError as exc:
            self._json(503, {"detail": f"Scanner unavailable: {exc}"})
            return
        except RuntimeError as exc:
            self._json(502, {"detail": str(exc)})
            return
        self._json(200, result)


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"EthOS AntiVirus listening on {HOST}:{PORT}, clamd={CLAMD_HOST}:{CLAMD_PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
