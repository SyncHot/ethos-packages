#!/usr/bin/env python3
"""EthOS Kanban — boards, columns and cards as a signed Package Center app.

Runs inside the package's private virtualenv (`runtime: "venv"`) with no third
party dependencies: a stdlib HTTP server plus one JSON file. The core proxies
`/api/packages/ethos-kanban/proxy/...` to it and stamps the caller's identity as
`X-Ethos-User`, so the board is shared by every signed-in account exactly like
the built-in app it replaces.

Endpoints (all under /api/kanban)
    GET    /                                    list boards (full content)
    POST   /                                    create board {name}
    GET    /<board>                             one board
    PUT    /<board>                             rename {name}
    DELETE /<board>                             delete board
    POST   /<board>/columns                     add column {title, position?, wip_limit?}
    PUT    /<board>/columns/<col>               rename/reorder {title?, position?, wip_limit?}
    DELETE /<board>/columns/<col>               delete column
    POST   /<board>/columns/<col>/cards         add card {title, description?, labels?, due_date?}
    PUT    /<board>/cards/<card>                update card
    DELETE /<board>/cards/<card>                delete card
    POST   /<board>/move-card                   move/reorder {card_id, to_column_id, position?}
    GET    /health                              liveness + version

First start imports the boards the built-in Kanban app stored in the core data
directory (`kanban_boards.json`) so an upgrade loses nothing.
"""

import json
import os
import sys
import threading
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOOL_VERSION = "1.0.0"
PORT = int(os.environ.get("ETHOS_PACKAGE_PORT", "8098"))
STATE_DIR = os.environ.get("ETHOS_PACKAGE_DATA_DIR") or os.getcwd()
CORE_DATA_DIR = os.environ.get("ETHOS_CORE_DATA_DIR", "")
STORE_FILE = os.path.join(STATE_DIR, "boards.json")
MAX_BODY = 512 * 1024

DEFAULT_COLUMNS = ["To Do", "In Progress", "Done"]

_LOCK = threading.RLock()


# ── Store ───────────────────────────────────────────────────────────────────

def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def _seed_board() -> dict:
    """Demo board shown on first run so the UI is never empty."""
    def card(title, description="", labels=None):
        return {
            "id": _new_id("card"), "title": title, "description": description,
            "labels": labels or [], "due_date": None, "created_at": _now(),
        }

    return {
        "id": _new_id("board"), "name": "Getting Started", "created_at": _now(),
        "columns": [
            {"id": _new_id("col"), "title": "To Do", "wip_limit": None, "cards": [
                card("Explore File Station", "Open the 📁 icon and browse your NAS volumes.", ["tour"]),
                card("Set up a Samba share", "", ["network"]),
            ]},
            {"id": _new_id("col"), "title": "In Progress", "wip_limit": None, "cards": [
                card("Try the Kanban board", "You are looking at it — drag this card to Done. 🎉", ["tour"]),
            ]},
            {"id": _new_id("col"), "title": "Done", "wip_limit": None, "cards": [
                card("Install EthOS NAS", "", []),
            ]},
        ],
    }


def _backfill(store: dict) -> dict:
    for board in store.get("boards") or []:
        for column in board.get("columns") or []:
            column.setdefault("wip_limit", None)
            column.setdefault("cards", [])
    return store


def _load() -> dict:
    """Read the store, importing the built-in app's boards once."""
    if not os.path.exists(STORE_FILE):
        legacy = os.path.join(CORE_DATA_DIR, "kanban_boards.json") if CORE_DATA_DIR else ""
        if legacy and os.path.isfile(legacy):
            try:
                with open(legacy, encoding="utf-8") as handle:
                    data = json.load(handle)
                if isinstance(data, dict) and isinstance(data.get("boards"), list):
                    store = _backfill({"version": 1, "boards": data["boards"]})
                    _save(store)
                    print(f"imported {len(store['boards'])} board(s) from {legacy}",
                          file=sys.stderr, flush=True)
                    return store
            except (OSError, ValueError) as exc:
                print(f"legacy import skipped: {exc}", file=sys.stderr, flush=True)
        store = {"version": 1, "boards": [_seed_board()]}
        _save(store)
        return store
    try:
        with open(STORE_FILE, encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, ValueError) as exc:
        print(f"store unreadable, reseeding: {exc}", file=sys.stderr, flush=True)
        data = {}
    if not isinstance(data, dict) or not isinstance(data.get("boards"), list):
        data = {"version": 1, "boards": [_seed_board()]}
        _save(data)
    return _backfill(data)


def _save(store: dict) -> None:
    os.makedirs(STATE_DIR, exist_ok=True)
    tmp = STORE_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as handle:
        json.dump(store, handle, indent=2)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(tmp, STORE_FILE)


# ── Lookup helpers ──────────────────────────────────────────────────────────

class ApiError(Exception):
    def __init__(self, detail: str, status: int = 400):
        super().__init__(detail)
        self.detail = detail
        self.status = status


def _board(store: dict, board_id: str) -> dict:
    for board in store["boards"]:
        if board.get("id") == board_id:
            return board
    raise ApiError(f"Board {board_id} not found", 404)


def _column(board: dict, column_id: str) -> dict:
    for column in board.get("columns") or []:
        if column.get("id") == column_id:
            return column
    raise ApiError(f"Column {column_id} not found", 404)


def _card(board: dict, card_id: str):
    for column in board.get("columns") or []:
        for index, card in enumerate(column.get("cards") or []):
            if card.get("id") == card_id:
                return column, index
    return None


def _clamp(position, length: int) -> int:
    if position is None:
        return length
    try:
        return max(0, min(int(position), length))
    except (TypeError, ValueError):
        return length


def _text(payload: dict, key: str, *, minimum: int, maximum: int, required: bool) -> str:
    value = payload.get(key)
    if value is None:
        if required:
            raise ApiError(f"{key} is required", 400)
        return ""
    text = str(value).strip()
    if required and len(text) < minimum:
        raise ApiError(f"{key} is required", 400)
    if len(text) > maximum:
        raise ApiError(f"{key} is too long (max {maximum})", 400)
    return text


def _labels(payload: dict) -> list[str]:
    raw = payload.get("labels") or []
    if not isinstance(raw, list):
        raise ApiError("labels must be a list", 400)
    return [str(item).strip() for item in raw if item and str(item).strip()][:20]


def _wip(payload: dict):
    value = payload.get("wip_limit")
    if value is None:
        return None
    try:
        limit = int(value)
    except (TypeError, ValueError):
        raise ApiError("wip_limit must be a number", 400) from None
    if not 1 <= limit <= 999:
        raise ApiError("wip_limit must be 1-999", 400)
    return limit


# ── Operations ──────────────────────────────────────────────────────────────

def list_boards() -> dict:
    with _LOCK:
        return {"boards": _load()["boards"]}


def create_board(payload: dict) -> dict:
    name = _text(payload, "name", minimum=1, maximum=80, required=True)
    board = {
        "id": _new_id("board"), "name": name, "created_at": _now(),
        "columns": [
            {"id": _new_id("col"), "title": title, "wip_limit": None, "cards": []}
            for title in DEFAULT_COLUMNS
        ],
    }
    with _LOCK:
        store = _load()
        store["boards"].append(board)
        _save(store)
    return board


def get_board(board_id: str) -> dict:
    with _LOCK:
        return _board(_load(), board_id)


def update_board(board_id: str, payload: dict) -> dict:
    name = _text(payload, "name", minimum=1, maximum=80, required=True)
    with _LOCK:
        store = _load()
        board = _board(store, board_id)
        board["name"] = name
        _save(store)
        return board


def delete_board(board_id: str) -> dict:
    with _LOCK:
        store = _load()
        before = len(store["boards"])
        store["boards"] = [b for b in store["boards"] if b.get("id") != board_id]
        if len(store["boards"]) == before:
            raise ApiError(f"Board {board_id} not found", 404)
        _save(store)
    return {"ok": True, "deleted": board_id}


def add_column(board_id: str, payload: dict) -> dict:
    title = _text(payload, "title", minimum=1, maximum=60, required=True)
    column = {"id": _new_id("col"), "title": title, "cards": [], "wip_limit": _wip(payload)}
    with _LOCK:
        store = _load()
        board = _board(store, board_id)
        columns = board.setdefault("columns", [])
        columns.insert(_clamp(payload.get("position"), len(columns)), column)
        _save(store)
    return column


def update_column(board_id: str, column_id: str, payload: dict) -> dict:
    with _LOCK:
        store = _load()
        board = _board(store, board_id)
        column = _column(board, column_id)
        if payload.get("title") is not None:
            column["title"] = _text(payload, "title", minimum=1, maximum=60, required=True)
        position = payload.get("position")
        if position is not None:
            columns = board["columns"]
            if columns.index(column) != int(position):
                columns.remove(column)
                columns.insert(_clamp(position, len(columns)), column)
        if "wip_limit" in payload:
            column["wip_limit"] = _wip(payload)
        _save(store)
        return column


def delete_column(board_id: str, column_id: str) -> dict:
    with _LOCK:
        store = _load()
        board = _board(store, board_id)
        before = len(board.get("columns") or [])
        board["columns"] = [c for c in board.get("columns") or [] if c.get("id") != column_id]
        if len(board["columns"]) == before:
            raise ApiError(f"Column {column_id} not found", 404)
        _save(store)
    return {"ok": True, "deleted": column_id}


def add_card(board_id: str, column_id: str, payload: dict) -> dict:
    title = _text(payload, "title", minimum=1, maximum=200, required=True)
    card = {
        "id": _new_id("card"), "title": title,
        "description": str(payload.get("description") or "").strip()[:4000],
        "labels": _labels(payload),
        "due_date": payload.get("due_date") or None,
        "created_at": _now(),
    }
    with _LOCK:
        store = _load()
        board = _board(store, board_id)
        column = _column(board, column_id)
        limit = column.get("wip_limit")
        if limit and len(column.get("cards") or []) >= limit:
            raise ApiError(f"Column “{column['title']}” is at its WIP limit ({limit})", 409)
        column.setdefault("cards", []).append(card)
        _save(store)
    return card


def update_card(board_id: str, card_id: str, payload: dict) -> dict:
    with _LOCK:
        store = _load()
        board = _board(store, board_id)
        found = _card(board, card_id)
        if not found:
            raise ApiError(f"Card {card_id} not found", 404)
        column, index = found
        card = column["cards"][index]
        if payload.get("title") is not None:
            card["title"] = _text(payload, "title", minimum=1, maximum=200, required=True)
        if payload.get("description") is not None:
            card["description"] = str(payload["description"]).strip()[:4000]
        if payload.get("labels") is not None:
            card["labels"] = _labels(payload)
        if "due_date" in payload:
            card["due_date"] = payload.get("due_date") or None
        _save(store)
        return card


def delete_card(board_id: str, card_id: str) -> dict:
    with _LOCK:
        store = _load()
        board = _board(store, board_id)
        found = _card(board, card_id)
        if not found:
            raise ApiError(f"Card {card_id} not found", 404)
        column, index = found
        column["cards"].pop(index)
        _save(store)
    return {"ok": True, "deleted": card_id}


def move_card(board_id: str, payload: dict) -> dict:
    card_id = str(payload.get("card_id") or "")
    to_column_id = str(payload.get("to_column_id") or "")
    if not card_id or not to_column_id:
        raise ApiError("card_id and to_column_id are required", 400)
    with _LOCK:
        store = _load()
        board = _board(store, board_id)
        found = _card(board, card_id)
        if not found:
            raise ApiError(f"Card {card_id} not found", 404)
        source_column, index = found
        target = _column(board, to_column_id)
        if target is not source_column:
            limit = target.get("wip_limit")
            if limit and len(target.get("cards") or []) >= limit:
                raise ApiError(f"Column “{target['title']}” is at its WIP limit ({limit})", 409)
        card = source_column["cards"].pop(index)
        target.setdefault("cards", []).insert(
            _clamp(payload.get("position"), len(target.get("cards") or [])), card,
        )
        _save(store)
        return board


# ── HTTP layer ──────────────────────────────────────────────────────────────

def _dispatch(method: str, route: str, payload: dict) -> tuple[int, dict]:
    parts = [part for part in route.split("?")[0].strip("/").split("/") if part]
    if parts[:2] != ["api", "kanban"]:
        raise ApiError("not found", 404)
    rest = parts[2:]

    if not rest:
        if method == "GET":
            return 200, list_boards()
        if method == "POST":
            return 201, create_board(payload)
    elif len(rest) == 1:
        board_id = rest[0]
        if method == "GET":
            return 200, get_board(board_id)
        if method == "PUT":
            return 200, update_board(board_id, payload)
        if method == "DELETE":
            return 200, delete_board(board_id)
    elif len(rest) == 2 and rest[1] == "columns" and method == "POST":
        return 201, add_column(rest[0], payload)
    elif len(rest) == 2 and rest[1] == "move-card" and method == "POST":
        return 200, move_card(rest[0], payload)
    elif len(rest) == 3 and rest[1] == "columns":
        if method == "PUT":
            return 200, update_column(rest[0], rest[2], payload)
        if method == "DELETE":
            return 200, delete_column(rest[0], rest[2])
    elif len(rest) == 3 and rest[1] == "cards" and method in ("PUT", "DELETE"):
        if method == "PUT":
            return 200, update_card(rest[0], rest[2], payload)
        return 200, delete_card(rest[0], rest[2])
    elif len(rest) == 4 and rest[1] == "columns" and rest[3] == "cards" and method == "POST":
        return 201, add_card(rest[0], rest[2], payload)
    raise ApiError("not found", 404)


class Handler(BaseHTTPRequestHandler):
    server_version = f"EthosKanban/{TOOL_VERSION}"

    def _reply(self, status: int, payload) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
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
        user = (self.headers.get("X-Ethos-User") or "anonymous")[:64]
        try:
            if self.path.startswith("/health"):
                self._reply(200, {"ok": True, "version": TOOL_VERSION, "user": user})
                return
            payload = self._payload() if method in ("POST", "PUT") else {}
            status, body = _dispatch(method, self.path, payload)
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
    print(f"kanban listening on 127.0.0.1:{PORT} (state {STORE_FILE})", file=sys.stderr, flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
