#!/usr/bin/env python3
"""EthOS Velvet — private video library service.

Runs inside the package's private virtualenv (`runtime: "venv"`) with no third
party dependencies. The core proxies `/api/packages/ethos-velvet/proxy/...`
here and stamps the caller's identity as `X-Ethos-User` / `X-Ethos-Role`, so
every signed-in account gets its own index, tags, ratings and resume points.

The service never streams or deletes media. Video bytes come from the core
(`/api/videos/stream`, `/api/videos/hls`) and permanent deletion goes through
`DELETE /api/files/delete` from the UI, keeping `path_scope` and the core file
op progress in charge.

Endpoints (all under /api/packages/ethos-velvet/proxy):
    GET    /health                 liveness + version (no identity required)
    GET    /state                  folders + settings + scan status
    PUT    /folders                replace the picked folders {folders:[...]}
    POST   /scan                   start a scan {roots?:[...]}
    GET    /scan/status            current scan snapshot
    GET    /library                filtered, sorted, paged library + facets
    GET    /item?path=             one row with tags
    PATCH  /media                  rating/favourite/reject/title/tags for one row
    POST   /media/batch            the same for up to 500 rows
    GET    /tags                   tag counts
    POST   /tags/rename            {from, to}
    POST   /tags/delete            {tag}
    GET    /duplicates             duplicate groups (same title, similar runtime)
    GET    /resume?path=           saved position
    PUT    /resume                 {path, t}
    GET    /settings               per-account preferences
    PUT    /settings               {settings:{...}}
    POST   /forget                 drop rows + cached stills (never files) {paths}
    POST   /events                 File Manager bridge: mark removed paths missing,
                                   rescan changed folders {removed, changed, full}
    GET    /thumb?path=            left-eye WebP still (200, 202 or 404)
    GET    /frame?path=&i=         preview strip frame (200, 202 or 404)
"""

import json
import os
import signal
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

import media
import paths
import scanner
import store

TOOL_VERSION = "1.0.0"
DEFAULT_PORT = 8100
MAX_BODY = 1024 * 1024
MAX_BATCH = 500

_LOCK = threading.RLock()


class ApiError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


def _log(message: str) -> None:
    print(f"velvet: {message}", file=sys.stderr, flush=True)


class VelvetServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


class Handler(BaseHTTPRequestHandler):
    server_version = f"Velvet/{TOOL_VERSION}"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # noqa: A003 — BaseHTTPRequestHandler API
        pass  # request lines can carry video paths; the service logs its own events

    # ── Plumbing ────────────────────────────────────────────────────────────

    def do_GET(self):  # noqa: N802
        self._dispatch("GET")

    def do_POST(self):  # noqa: N802
        self._dispatch("POST")

    def do_PUT(self):  # noqa: N802
        self._dispatch("PUT")

    def do_PATCH(self):  # noqa: N802
        self._dispatch("PATCH")

    def do_DELETE(self):  # noqa: N802
        self._dispatch("DELETE")

    def _dispatch(self, method: str) -> None:
        route = ""
        try:
            parsed = urlsplit(self.path)
            route = parsed.path.rstrip("/") or "/"
            query = {key: values[0] for key, values in parse_qs(parsed.query).items()}
            status, payload, content_type, extra_headers = self._route(method, route, query)
            self._send(status, payload, content_type, extra_headers)
        except ApiError as exc:
            self._send_json(exc.status, {"detail": exc.detail})
        except PermissionError as exc:
            self._send_json(403, {"detail": str(exc)})
        except FileNotFoundError as exc:
            self._send_json(404, {"detail": str(exc) or "Not found"})
        except ValueError as exc:
            self._send_json(400, {"detail": str(exc)})
        except RuntimeError as exc:
            self._send_json(409, {"detail": str(exc)})
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as exc:  # noqa: BLE001 — never leak a traceback to the client
            _log(f"request failed route={route} error={type(exc).__name__}")
            self._send_json(500, {"detail": "The Velvet service failed to handle the request"})

    def _identity(self) -> tuple[str, str]:
        username = paths.normalize_username(self.headers.get("X-Ethos-User"))
        role = "admin" if (self.headers.get("X-Ethos-Role") or "").strip() == "admin" else "user"
        if not username:
            raise ApiError(401, "Authentication required")
        return username, role

    def _body(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError as exc:
            raise ApiError(400, "Invalid Content-Length") from exc
        if length > MAX_BODY:
            raise ApiError(413, "Request body is too large")
        raw = self.rfile.read(length) if length > 0 else b"{}"
        try:
            data = json.loads(raw or b"{}")
        except ValueError as exc:
            raise ApiError(400, "Invalid JSON body") from exc
        if not isinstance(data, dict):
            raise ApiError(400, "The JSON body must be an object")
        return data

    def _send_json(self, status: int, payload) -> None:
        self._send(status, payload, "application/json; charset=utf-8",
                   {"Cache-Control": "no-store"})

    def _send(self, status: int, payload, content_type: str, headers: dict | None = None) -> None:
        if isinstance(payload, (dict, list)):
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            content_type = content_type or "application/json; charset=utf-8"
        elif isinstance(payload, str):
            body = payload.encode("utf-8")
        else:
            body = bytes(payload or b"")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        if body:
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass

    # ── Routes ──────────────────────────────────────────────────────────────

    def _route(self, method: str, route: str, query: dict):
        if route == "/health" and method == "GET":
            return 200, {"status": "ok", "service": "ethos-velvet", "version": TOOL_VERSION}, \
                "application/json", {"Cache-Control": "no-store"}

        username, role = self._identity()

        if route == "/state" and method == "GET":
            return 200, {
                "version": TOOL_VERSION,
                "folders": store.list_folders(username),
                "settings": store.get_settings(username),
                "scan": scanner.status(username),
            }, "application/json", None

        if route == "/folders" and method == "PUT":
            body = self._body()
            raw = body.get("folders")
            if not isinstance(raw, list):
                raise ApiError(400, "folders must be a list")
            if len(raw) > store.MAX_FOLDERS:
                raise ApiError(400, f"At most {store.MAX_FOLDERS} folders are supported")
            resolved: list[str] = []
            for entry in raw:
                real = paths.check_path(username, role, entry, must_exist=True, must_be_dir=True)
                if real not in resolved:
                    resolved.append(real)
            return 200, {"folders": store.replace_folders(username, resolved)}, \
                "application/json", None

        if route == "/scan" and method == "POST":
            body = self._body()
            roots = body.get("roots")
            if roots is not None and not isinstance(roots, list):
                raise ApiError(400, "roots must be a list")
            selected = None
            if roots:
                selected = [paths.check_path(username, role, entry, must_exist=True,
                                             must_be_dir=True) for entry in roots]
            return 202, {"scan": scanner.start_scan(username, role, selected)}, \
                "application/json", None

        if route == "/scan/status" and method == "GET":
            return 200, {"scan": scanner.status(username)}, "application/json", None

        if route == "/library" and method == "GET":
            filters = {
                "q": query.get("q", "").strip()[:200],
                "studio": query.get("studio", ""),
                "proj": query.get("proj", ""),
                "res": query.get("res", ""),
                "tag": query.get("tag", ""),
                "sort": query.get("sort", "added_desc"),
                "rating_min": _int(query.get("rating"), 0),
                "favorite": query.get("favorite") in ("1", "true"),
                "rejected": query.get("rejected") in ("1", "true"),
                "dup": query.get("dup") in ("1", "true"),
                "missing": query.get("missing") in ("1", "true"),
                "limit": _int(query.get("limit"), 90),
                "offset": _int(query.get("offset"), 0),
            }
            result = store.list_media(username, filters)
            result["summary"] = store.summary(username)
            result["facets"] = store.facets(username)
            return 200, result, "application/json", None

        if route == "/item" and method == "GET":
            path, _item = self._owned(username, role, query.get("path"))
            item = store.get_item(username, path)
            return 200, {"item": item}, "application/json", None

        if route == "/media" and method == "PATCH":
            body = self._body()
            path, _item = self._owned(username, role, body.get("path"))
            patch = self._media_patch(body)
            if patch:
                store.patch_media(username, path, patch)
            add, remove = self._tag_changes(body)
            if add or remove:
                store.set_tags(username, [path], add, remove)
            return 200, {"item": store.get_item(username, path)}, "application/json", None

        if route == "/media/batch" and method == "POST":
            body = self._body()
            raw_paths = body.get("paths")
            if not isinstance(raw_paths, list) or not raw_paths:
                raise ApiError(400, "paths must be a non-empty list")
            if len(raw_paths) > MAX_BATCH:
                raise ApiError(400, f"At most {MAX_BATCH} paths per call")
            owned: list[str] = []
            for entry in raw_paths:
                path, _item = self._owned(username, role, entry)
                if path not in owned:
                    owned.append(path)
            patch = self._media_patch(body)
            if patch:
                for path in owned:
                    store.patch_media(username, path, patch)
            add, remove = self._tag_changes(body)
            if add or remove:
                store.set_tags(username, owned, add, remove)
            return 200, {"updated": len(owned)}, "application/json", None

        if route == "/tags" and method == "GET":
            return 200, {"tags": store.all_tags(username)}, "application/json", None

        if route == "/tags/rename" and method == "POST":
            body = self._body()
            count = store.rename_tag(username, body.get("from"), body.get("to"))
            return 200, {"count": count}, "application/json", None

        if route == "/tags/delete" and method == "POST":
            body = self._body()
            return 200, {"removed": store.delete_tag(username, body.get("tag"))}, \
                "application/json", None

        if route == "/duplicates" and method == "GET":
            return 200, {"groups": store.duplicate_groups(username)}, "application/json", None

        if route == "/resume" and method == "GET":
            path, _item = self._owned(username, role, query.get("path"))
            return 200, {"t": store.get_resume(username, path)}, "application/json", None

        if route == "/resume" and method == "PUT":
            body = self._body()
            path, _item = self._owned(username, role, body.get("path"))
            return 200, {"t": store.set_resume(username, path, body.get("t"))}, \
                "application/json", None

        if route == "/settings" and method == "GET":
            return 200, {"settings": store.get_settings(username)}, "application/json", None

        if route == "/settings" and method == "PUT":
            body = self._body()
            patch = body.get("settings")
            if not isinstance(patch, dict):
                raise ApiError(400, "settings must be an object")
            return 200, {"settings": store.set_settings(username, patch)}, \
                "application/json", None

        if route == "/forget" and method == "POST":
            body = self._body()
            raw_paths = body.get("paths")
            if not isinstance(raw_paths, list):
                raise ApiError(400, "paths must be a list")
            cleaned: list[str] = []
            for entry in raw_paths[:MAX_BATCH]:
                try:
                    cleaned.append(paths.check_path(username, role, entry))
                except (ValueError, PermissionError, FileNotFoundError):
                    continue
            removed = store.forget(username, cleaned)
            for path in cleaned:
                media.purge(username, path)
            return 200, {"removed": removed}, "application/json", None

        if route == "/events" and method == "POST":
            body = self._body()
            raw_removed = body.get("removed") or []
            raw_changed = body.get("changed") or []
            if not isinstance(raw_removed, list) or not isinstance(raw_changed, list):
                raise ApiError(400, "removed and changed must be lists")

            removed_paths: list[str] = []
            for entry in raw_removed[:MAX_BATCH]:
                try:
                    real = paths.check_path(username, role, entry)
                except (ValueError, PermissionError, FileNotFoundError):
                    continue
                if real not in removed_paths:
                    removed_paths.append(real)
            matched = store.mark_paths_missing(username, removed_paths)
            for path in matched:
                media.purge(username, path)

            changed_dirs: list[str] = []
            for entry in raw_changed[:MAX_BATCH]:
                try:
                    real = paths.check_path(username, role, entry)
                except (ValueError, PermissionError, FileNotFoundError):
                    continue
                if os.path.isdir(real) and real not in changed_dirs:
                    changed_dirs.append(real)

            folders = [item["path"] for item in store.list_folders(username)]
            roots = folders if bool(body.get("full")) else changed_dirs
            roots = [root for root in roots
                     if any(_inside(root, folder) for folder in folders)]
            scan_started = False
            if roots:
                try:
                    scanner.start_scan(username, role, roots)
                    scan_started = True
                except RuntimeError:
                    # A scan is already running; its pass will pick these up.
                    scan_started = False
            return 200, {"removed": len(matched), "scan": scan_started}, \
                "application/json", None

        if route == "/thumb" and method == "GET":
            return self._image(username, role, query, frame=False)

        if route == "/frame" and method == "GET":
            return self._image(username, role, query, frame=True)

        raise ApiError(404, "Unknown endpoint")

    # ── Helpers ─────────────────────────────────────────────────────────────

    def _owned(self, username: str, role: str, raw) -> tuple[str, dict]:
        real = paths.check_path(username, role, raw)
        item = store.get_media(username, real)
        if not item:
            raise ApiError(404, "That file is not in your library")
        return real, item

    @staticmethod
    def _media_patch(body: dict) -> dict:
        patch = {}
        for key in ("rating", "favorite", "reject", "title"):
            if key in body:
                patch[key] = body[key]
        return patch

    @staticmethod
    def _tag_changes(body: dict) -> tuple[list[str], list[str]]:
        add = body.get("tags_add") or []
        remove = body.get("tags_remove") or []
        if not isinstance(add, list) or not isinstance(remove, list):
            raise ApiError(400, "tags_add and tags_remove must be lists")
        return add[:64], remove[:64]

    def _image(self, username: str, role: str, query: dict, *, frame: bool):
        path, _item = self._owned(username, role, query.get("path"))
        index = None
        if frame:
            index = max(0, min(media.FRAMES - 1, _int(query.get("i"), 0)))
        state, filename, retry_ms = media.lookup(username, path, index)
        if state == "ready" and filename:
            try:
                with open(filename, "rb") as handle:
                    payload = handle.read(4 * 1024 * 1024)
            except OSError as exc:
                _log(f"thumbnail read failed key={os.path.basename(filename)[:16]} "
                     f"error={type(exc).__name__}")
                raise ApiError(404, "The cached still is unreadable") from exc
            return 200, payload, "image/webp", {"Cache-Control": "private, max-age=3600"}
        if state == "pending":
            return 202, {"state": "pending", "retry_ms": int(retry_ms * 1000)}, "application/json", \
                {"Retry-After": str(max(1, retry_ms))}
        if state == "failed":
            raise ApiError(404, "A still could not be generated for this file")
        raise ApiError(404, "That file is not in your library")


def _int(value, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return int(default)


def _inside(path: str, root: str) -> bool:
    path = path.rstrip(os.sep) or os.sep
    root = root.rstrip(os.sep) or os.sep
    return path == root or path.startswith(root + os.sep)


def build_server(host: str = "127.0.0.1", port: int | None = None) -> VelvetServer:
    if port is None:
        port = _int(os.environ.get("ETHOS_PACKAGE_PORT"), DEFAULT_PORT)
    return VelvetServer((host, int(port)), Handler)


def main() -> None:
    server = build_server()
    _log(f"listening on 127.0.0.1:{server.server_port} version={TOOL_VERSION}")

    def shutdown(_signum=None, _frame=None):
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    try:
        server.serve_forever(poll_interval=0.5)
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
