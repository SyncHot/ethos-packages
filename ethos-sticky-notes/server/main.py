#!/usr/bin/env python3
"""EthOS Sticky Notes — per-account notes as a signed Package Center app.

Runs inside the package's private virtualenv (`runtime: "venv"`) with no third
party dependencies: a stdlib HTTP server plus one JSON file. The core proxies
`/api/packages/ethos-sticky-notes/proxy/...` to it and stamps the caller's
identity as `X-Ethos-User`, so every signed-in account sees only its own notes.

Endpoints (all under /api/sticky-notes)
    GET    /                       list the caller's notes (display order)
    POST   /                       create a note {text?, color?}
    PUT    /<note>                 update text and/or color
    DELETE /<note>                 remove a note
    POST   /<id>/move              move one step {direction: up|down}
    GET    /health                 liveness + version

First start imports the notes the built-in widget stored in the core data
directory (`sticky_notes.json`, shape {username: [note, ...]}) so an upgrade
loses nothing.
"""

import json
import os
import re
import sys
import threading
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOOL_VERSION = "1.0.0"
PORT = int(os.environ.get("ETHOS_PACKAGE_PORT", "8099"))
STATE_DIR = os.environ.get("ETHOS_PACKAGE_DATA_DIR") or os.getcwd()
CORE_DATA_DIR = os.environ.get("ETHOS_CORE_DATA_DIR", "")
STORE_FILE = os.path.join(STATE_DIR, "notes.json")
MAX_BODY = 128 * 1024
MAX_TEXT_LEN = 2000
MAX_NOTES = 200

PALETTE = ["yellow", "pink", "blue", "green", "orange"]

_LOCK = threading.RLock()


# ── Store ───────────────────────────────────────────────────────────────────

def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _new_id() -> str:
    return f"sn_{uuid.uuid4().hex[:12]}"


def _username(raw: str) -> str:
    """Same normalization the core used: lowercase, [a-z0-9._-], max 64."""
    return re.sub(r"[^a-z0-9._-]", "", str(raw or "").strip().lower())[:64]


def _clean_note(item) -> dict | None:
    """Normalize one stored note; drop entries that cannot be rendered."""
    if not isinstance(item, dict):
        return None
    note_id = str(item.get("id") or "").strip()
    if not note_id:
        note_id = _new_id()
    color = str(item.get("color") or "yellow").strip().lower()
    if color not in PALETTE:
        color = "yellow"
    text = item.get("text")
    text = "" if text is None else str(text)[:MAX_TEXT_LEN]
    return {
        "id": note_id[:48],
        "text": text,
        "color": color,
        "created_at": str(item.get("created_at") or _now()),
        "updated_at": str(item.get("updated_at") or item.get("created_at") or _now()),
    }


def _clean_users(users) -> dict:
    if not isinstance(users, dict):
        return {}
    cleaned = {}
    for raw_user, notes in users.items():
        user = _username(raw_user)
        if not user or not isinstance(notes, list):
            continue
        cleaned[user] = [n for n in (_clean_note(item) for item in notes[:MAX_NOTES]) if n]
    return cleaned


def _load_legacy() -> dict:
    """Import the built-in widget's per-user store once."""
    legacy = os.path.join(CORE_DATA_DIR, "sticky_notes.json") if CORE_DATA_DIR else ""
    if not legacy or not os.path.isfile(legacy):
        return {}
    try:
        with open(legacy, encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, ValueError) as exc:
        print(f"legacy import skipped: {exc}", file=sys.stderr, flush=True)
        return {}
    users = _clean_users(data)
    if users:
        print(f"imported notes for {len(users)} account(s) from {legacy}",
              file=sys.stderr, flush=True)
    return users


def _load() -> dict:
    if not os.path.exists(STORE_FILE):
        store = {"version": 1, "users": _load_legacy()}
        _save(store)
        return store
    try:
        with open(STORE_FILE, encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, ValueError) as exc:
        print(f"store unreadable, starting empty: {exc}", file=sys.stderr, flush=True)
        data = {}
    if not isinstance(data, dict):
        data = {}
    return {"version": 1, "users": _clean_users(data.get("users"))}


def _save(store: dict) -> None:
    os.makedirs(STATE_DIR, exist_ok=True)
    tmp = STORE_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as handle:
        json.dump(store, handle, indent=2)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(tmp, STORE_FILE)


# ── Operations ──────────────────────────────────────────────────────────────

class ApiError(Exception):
    def __init__(self, detail: str, status: int = 400):
        super().__init__(detail)
        self.detail = detail
        self.status = status


def _notes_for(store: dict, user: str) -> list:
    notes = store["users"].setdefault(user, [])
    return notes


def _text(value) -> str:
    text = "" if value is None else str(value)
    if len(text) > MAX_TEXT_LEN:
        raise ApiError(f"Note text too long (max {MAX_TEXT_LEN} chars)", 400)
    return text


def _color(value, *, allow_none: bool) -> str | None:
    if value is None:
        if allow_none:
            return None
        raise ApiError("color is required", 400)
    color = str(value).strip().lower()
    if color not in PALETTE:
        raise ApiError(
            f"Unknown note color: {value!r} (valid: {', '.join(PALETTE)})", 400)
    return color


def _find(notes: list, note_id: str) -> tuple[int, dict]:
    for index, note in enumerate(notes):
        if note.get("id") == note_id:
            return index, note
    raise ApiError(f"Note {note_id} not found", 404)


def list_notes(user: str) -> dict:
    with _LOCK:
        return {"notes": _notes_for(_load(), user)}


def create_note(user: str, payload: dict) -> dict:
    text = _text(payload.get("text"))
    color = _color(payload.get("color"), allow_none=True)
    with _LOCK:
        store = _load()
        notes = _notes_for(store, user)
        if len(notes) >= MAX_NOTES:
            raise ApiError(f"Too many notes (max {MAX_NOTES}); remove one first", 409)
        if color is None:
            color = PALETTE[len(notes) % len(PALETTE)]
        note = {
            "id": _new_id(),
            "text": text,
            "color": color,
            "created_at": _now(),
            "updated_at": _now(),
        }
        notes.append(note)
        _save(store)
        return {"notes": notes, "note": note}


def update_note(user: str, note_id: str, payload: dict) -> dict:
    with _LOCK:
        store = _load()
        notes = _notes_for(store, user)
        _index, note = _find(notes, note_id)
        if payload.get("text") is not None:
            note["text"] = _text(payload.get("text"))
        if payload.get("color") is not None:
            note["color"] = _color(payload.get("color"), allow_none=False)
        note["updated_at"] = _now()
        _save(store)
        return {"notes": notes, "note": note}


def delete_note(user: str, note_id: str) -> dict:
    with _LOCK:
        store = _load()
        notes = _notes_for(store, user)
        index, _note = _find(notes, note_id)
        notes.pop(index)
        _save(store)
        return {"notes": notes}


def move_note(user: str, note_id: str, payload: dict) -> dict:
    direction = str(payload.get("direction") or "").strip().lower()
    if direction not in ("up", "down"):
        raise ApiError(f"Invalid direction: {payload.get('direction')!r} (valid: up, down)", 400)
    with _LOCK:
        store = _load()
        notes = _notes_for(store, user)
        index, _note = _find(notes, note_id)
        target = index - 1 if direction == "up" else index + 1
        if 0 <= target < len(notes):
            notes[index], notes[target] = notes[target], notes[index]
            _save(store)
        return {"notes": notes}


# ── HTTP layer ──────────────────────────────────────────────────────────────

def _dispatch(method: str, route: str, user: str, payload: dict) -> tuple[int, dict]:
    parts = [part for part in route.split("?")[0].strip("/").split("/") if part]
    if parts[:2] != ["api", "sticky-notes"]:
        raise ApiError("not found", 404)
    rest = parts[2:]

    if not rest:
        if method == "GET":
            return 200, list_notes(user)
        if method == "POST":
            return 201, create_note(user, payload)
    elif len(rest) == 1:
        note_id = rest[0]
        if method == "PUT":
            return 200, update_note(user, note_id, payload)
        if method == "DELETE":
            return 200, delete_note(user, note_id)
    elif len(rest) == 2 and rest[1] == "move" and method == "POST":
        return 200, move_note(user, rest[0], payload)
    raise ApiError("not found", 404)


class Handler(BaseHTTPRequestHandler):
    server_version = f"EthosStickyNotes/{TOOL_VERSION}"

    def _reply(self, status: int, payload) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _payload(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return {}
        if length > MAX_BODY:
            raise ApiError("request body is too large", 413)
        try:
            data = json.loads(self.rfile.read(length).decode())
        except (UnicodeDecodeError, ValueError):
            raise ApiError("invalid JSON", 400) from None
        if not isinstance(data, dict):
            raise ApiError("body must be a JSON object", 400)
        return data

    def _handle(self, method: str) -> None:
        user = _username(self.headers.get("X-Ethos-User") or "")
        try:
            if self.path.startswith("/health"):
                self._reply(200, {"ok": True, "version": TOOL_VERSION, "user": user})
                return
            if not user:
                raise ApiError("Authentication required", 401)
            payload = self._payload() if method in ("POST", "PUT") else {}
            status, body = _dispatch(method, self.path, user, payload)
            self._reply(status, body)
        except ApiError as exc:
            self._reply(exc.status, {"detail": exc.detail})
        except Exception as exc:  # noqa: BLE001 — never crash the service
            print(f"{method} {self.path} failed: {exc}", file=sys.stderr, flush=True)
            self._reply(500, {"detail": "internal error"})

    def do_GET(self) -> None:  # noqa: N802 — BaseHTTPRequestHandler API
        self._handle("GET")

    def do_POST(self) -> None:  # noqa: N802
        self._handle("POST")

    def do_PUT(self) -> None:  # noqa: N802
        self._handle("PUT")

    def do_DELETE(self) -> None:  # noqa: N802
        self._handle("DELETE")

    def log_message(self, fmt: str, *args) -> None:
        user = (self.headers.get("X-Ethos-User") or "-")[:32]
        print(f"[{user}] {self.address_string()} {fmt % args}", file=sys.stderr, flush=True)


def main() -> int:
    os.makedirs(STATE_DIR, exist_ok=True)
    with _LOCK:
        _load()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    server.daemon_threads = True
    print(f"sticky notes listening on 127.0.0.1:{PORT} (state {STORE_FILE})",
          file=sys.stderr, flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
