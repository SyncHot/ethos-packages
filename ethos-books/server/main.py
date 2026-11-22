#!/usr/bin/env python3
"""EthOS Books — per-account book & audiobook library as a signed package.

Runs inside the package's private virtualenv (`runtime: "venv"`) with no third
party dependencies: a stdlib HTTP server plus JSON files. The core proxies
`/api/packages/ethos-books/proxy/...` to it and stamps the caller's identity as
`X-Ethos-User`, so every signed-in account sees only its own library.

The service deliberately never opens a book file. It stores metadata, covers and
reading progress; the browser streams the bytes from the core file API
(`/api/files/raw`) with the caller's own JWT, so `path_scope` stays the only
gate on the filesystem. Scanning is driven by the browser too (it lists folders
through `/api/files`, extracts EPUB metadata and posts the result here).

Endpoints (all under /api/books)
    GET    /library                 library + progress + settings + stats
    PUT    /folders                 replace the scan roots {folders:[{path}]}
    POST   /scan                    upsert one scan batch {root, entries[], removed[], done}
    POST   /books/<id>/cover        store a cover {data: base64, format}
    GET    /covers/<id>             cover bytes (image/webp)
    PUT    /books/<id>/progress     save reading/playback position
    PUT    /books/<id>/meta         manual title/author/series override
    DELETE /books/<id>              forget one title (never deletes the file)
    GET    /settings                reader/player preferences
    PUT    /settings                update preferences
    GET    /health                  liveness + version
"""

import base64
import binascii
import hashlib
import json
import os
import re
import shutil
import sys
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOOL_VERSION = "1.0.0"
PORT = int(os.environ.get("ETHOS_PACKAGE_PORT", "8089"))
STATE_DIR = os.environ.get("ETHOS_PACKAGE_DATA_DIR") or os.getcwd()
COVER_DIR = os.path.join(STATE_DIR, "covers")
LIBRARY_FILE = os.path.join(STATE_DIR, "library.json")
PROGRESS_FILE = os.path.join(STATE_DIR, "progress.json")
SETTINGS_FILE = os.path.join(STATE_DIR, "settings.json")

SCHEMA = 1
MAX_BODY = 4 * 1024 * 1024
MAX_COVER_BYTES = 512 * 1024
MAX_BOOKS = 20_000
MAX_FOLDERS = 64
MAX_SCAN_ENTRIES = 500
MAX_TRACKS = 500
MAX_SETTINGS_EXTENSIONS = 12

AUDIO_EXTS = ("m4b", "m4a", "mp3", "flac", "ogg", "opus")
BOOK_EXTS = ("epub", "pdf")
FORMATS = BOOK_EXTS + AUDIO_EXTS

# Only paths the core file API can serve for a non-admin are accepted. This is
# defence in depth: the service never reads these paths, but a bad record would
# still be an unusable entry in the UI.
ALLOWED_PREFIXES = ("/home/", "/mnt/", "/media/")

THEMES = ("system", "light", "sepia", "dark")
FONTS = ("serif", "sans")
FLOWS = ("paginated", "scrolled")

DEFAULT_SETTINGS = {
    "theme": "system",
    "font_family": "serif",
    "font_size": 100,
    "margin": 2,
    "line_height": 1.6,
    "flow": "paginated",
    "skip_seconds": 30,
    "speed": 1.0,
    "extensions": list(FORMATS),
}

_LOCK = threading.RLock()


# ── Small helpers ───────────────────────────────────────────────────────────


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _username(raw: str) -> str:
    """Same normalization the core uses: lowercase, [a-z0-9._-], max 64."""
    return re.sub(r"[^a-z0-9._-]", "", str(raw or "").strip().lower())[:64]


def _text(value, limit: int) -> str:
    text = "" if value is None else str(value)
    text = " ".join(text.split()) if limit <= 300 else text
    return text[:limit]


def _atomic_write(path: str, data: dict) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = f"{path}.tmp-{os.getpid()}"
    with open(tmp, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2, ensure_ascii=False)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(tmp, path)


def _load(path: str) -> dict:
    """Load one store; a corrupt file is quarantined and replaced, never lost."""
    if not os.path.exists(path):
        return {"version": SCHEMA, "users": {}}
    try:
        with open(path, encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, ValueError) as exc:
        stamp = int(time.time())
        broken = f"{path}.corrupt-{stamp}"
        try:
            shutil.move(path, broken)
            where = f" (kept as {os.path.basename(broken)})"
        except OSError:
            where = ""
        print(f"{os.path.basename(path)} unreadable{where}: {exc}", file=sys.stderr, flush=True)
        return {"version": SCHEMA, "users": {}}
    if not isinstance(data, dict) or not isinstance(data.get("users"), dict):
        return {"version": SCHEMA, "users": {}}
    data["version"] = SCHEMA
    return data


def _save(path: str, store: dict) -> None:
    store["version"] = SCHEMA
    _atomic_write(path, store)


# ── Normalizers ─────────────────────────────────────────────────────────────


def _book_id(path: str) -> str:
    return "bk_" + hashlib.sha1(path.encode("utf-8")).hexdigest()[:12]


def _clean_path(value) -> str:
    path = str(value or "").strip()
    if not path:
        raise ApiError("path is required", 400)
    if len(path) > 1024:
        raise ApiError("path is too long", 400)
    if "\x00" in path or not path.startswith("/"):
        raise ApiError("path must be absolute", 400)
    if "/../" in path or path.endswith("/..") or "/./" in path:
        raise ApiError("path must be normalized", 400)
    if not path.startswith(ALLOWED_PREFIXES):
        raise ApiError("path must be inside /home, /mnt or /media", 400)
    return path.rstrip("/") or "/"


def _clean_format(value) -> str:
    fmt = str(value or "").strip().lower().lstrip(".")
    if fmt not in FORMATS:
        raise ApiError(f"unsupported format {value!r}", 400)
    return fmt


def _clean_int(value, low: int, high: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        raise ApiError("expected an integer", 400) from None
    return max(low, min(high, number))


def _clean_float(value, low: float, high: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ApiError("expected a number", 400) from None
    return max(low, min(high, number))


def _clean_tracks(raw) -> list:
    if not isinstance(raw, list):
        return []
    tracks = []
    for item in raw[:MAX_TRACKS]:
        if not isinstance(item, dict):
            continue
        try:
            path = _clean_path(item.get("path"))
        except ApiError:
            continue
        tracks.append({
            "path": path,
            "title": _text(item.get("title"), 300),
            "size": _clean_int(item.get("size") or 0, 0, 1 << 40),
            "modified": _clean_float(item.get("modified") or 0, 0, 10**11),
        })
    return tracks


def _clean_book(raw) -> dict | None:
    """Normalize one scanned entry; unusable entries are skipped, not fatal."""
    if not isinstance(raw, dict):
        return None
    try:
        path = _clean_path(raw.get("path"))
        fmt = _clean_format(raw.get("format"))
        kind = "audiobook" if fmt in AUDIO_EXTS else "book"
        book = {
            "id": _book_id(path),
            "path": path,
            "format": fmt,
            "kind": kind,
            "title": _text(raw.get("title"), 300) or os.path.basename(path).rsplit(".", 1)[0],
            "author": _text(raw.get("author"), 200),
            "series": _text(raw.get("series"), 200),
            "series_index": _clean_float(raw.get("series_index") or 0, 0, 100_000),
            "language": _text(raw.get("language"), 16).lower(),
            "size": _clean_int(raw.get("size") or 0, 0, 1 << 40),
            "modified": _clean_float(raw.get("modified") or 0, 0, 10**11),
            "cover": False,
            "cover_ext": "webp",
            "manual": False,
            "added_at": _now(),
            "updated_at": _now(),
        }
        if kind == "audiobook":
            book["tracks"] = _clean_tracks(raw.get("tracks"))
            if book["tracks"]:
                book["size"] = sum(t["size"] for t in book["tracks"])
        return book
    except ApiError:
        return None


def _clean_progress(raw) -> dict:
    if not isinstance(raw, dict):
        return {}
    return {
        "percent": _clean_float(raw.get("percent") or 0, 0.0, 1.0),
        "locator": _text(raw.get("locator"), 500),
        "position_s": _clean_float(raw.get("position_s") or 0, 0.0, 10**7),
        "finished": bool(raw.get("finished")),
        "updated_at": _text(raw.get("updated_at"), 40) or _now(),
    }


def _clean_settings(raw) -> dict:
    base = dict(DEFAULT_SETTINGS)
    if not isinstance(raw, dict):
        return base
    if raw.get("theme") in THEMES:
        base["theme"] = raw["theme"]
    if raw.get("font_family") in FONTS:
        base["font_family"] = raw["font_family"]
    if raw.get("flow") in FLOWS:
        base["flow"] = raw["flow"]
    base["font_size"] = _clean_int(raw.get("font_size") or base["font_size"], 70, 220)
    base["margin"] = _clean_int(raw.get("margin") or base["margin"], 1, 4)
    base["line_height"] = round(_clean_float(raw.get("line_height") or base["line_height"], 1.2, 2.4), 2)
    base["skip_seconds"] = _clean_int(raw.get("skip_seconds") or base["skip_seconds"], 5, 300)
    base["speed"] = round(_clean_float(raw.get("speed") or base["speed"], 0.5, 3.0), 2)
    extensions = raw.get("extensions")
    if isinstance(extensions, list):
        cleaned = [e for e in (str(x).strip().lower().lstrip(".") for x in extensions) if e in FORMATS]
        if cleaned:
            base["extensions"] = cleaned[:MAX_SETTINGS_EXTENSIONS]
    return base


# ── Store accessors ─────────────────────────────────────────────────────────


def _user_library(store: dict, user: str) -> dict:
    users = store.setdefault("users", {})
    entry = users.get(user)
    if not isinstance(entry, dict):
        entry = {"folders": [], "books": {}}
        users[user] = entry
    if not isinstance(entry.get("folders"), list):
        entry["folders"] = []
    if not isinstance(entry.get("books"), dict):
        entry["books"] = {}
    if not isinstance(entry.get("shared_roots"), list):
        entry["shared_roots"] = []
    if not isinstance(entry.get("shared_books"), dict):
        entry["shared_books"] = {}
    return entry


def _user_progress(store: dict, user: str) -> dict:
    users = store.setdefault("users", {})
    entry = users.get(user)
    if not isinstance(entry, dict):
        entry = {}
        users[user] = entry
    return entry


def _user_settings(store: dict, user: str) -> dict:
    users = store.setdefault("users", {})
    entry = users.get(user)
    if not isinstance(entry, dict):
        entry = dict(DEFAULT_SETTINGS)
        users[user] = entry
    return _clean_settings(entry)


def _under(path: str, root: str) -> bool:
    root = root.rstrip("/")
    return path == root or path.startswith(root + "/")


# ── Operations ──────────────────────────────────────────────────────────────


class ApiError(Exception):
    def __init__(self, detail: str, status: int = 400):
        super().__init__(detail)
        self.detail = detail
        self.status = status


def _library_payload(user: str) -> dict:
    with _LOCK:
        library = _user_library(_load(LIBRARY_FILE), user)
        progress = _user_progress(_load(PROGRESS_FILE), user)
        settings = _user_settings(_load(SETTINGS_FILE), user)
        books = sorted(library["books"].values(),
                       key=lambda b: (b.get("title") or "").lower())
        shared_books = sorted(library.get("shared_books", {}).values(),
                              key=lambda b: (b.get("title") or "").lower())
        stats = {
            "books": sum(1 for b in books if b.get("kind") == "book"),
            "audiobooks": sum(1 for b in books if b.get("kind") == "audiobook"),
            "finished": sum(1 for pid in progress if progress[pid].get("finished")),
            "bytes": sum(int(b.get("size") or 0) for b in books),
        }
        return {
            "folders": library["folders"],
            "books": books,
            "shared_roots": library.get("shared_roots", []),
            "shared_books": shared_books,
            "progress": progress,
            "settings": settings,
            "stats": stats,
        }


def set_folders(user: str, payload: dict) -> dict:
    raw = payload.get("folders")
    if not isinstance(raw, list):
        raise ApiError("folders must be a list", 400)
    if len(raw) > MAX_FOLDERS:
        raise ApiError(f"Too many scan folders (max {MAX_FOLDERS})", 409)
    with _LOCK:
        store = _load(LIBRARY_FILE)
        library = _user_library(store, user)
        known = {f.get("path"): f for f in library["folders"] if isinstance(f, dict)}
        folders = []
        for item in raw:
            path = _clean_path(item.get("path") if isinstance(item, dict) else item)
            previous = known.get(path) or {}
            folders.append({
                "path": path,
                "added_at": previous.get("added_at") or _now(),
                "last_scan": previous.get("last_scan") or "",
                "count": int(previous.get("count") or 0),
            })
        library["folders"] = folders
        # Titles whose root is gone can no longer be streamed: drop them.
        dropped = [bid for bid, book in library["books"].items()
                   if not any(_under(str(book.get("path")), f["path"]) for f in folders)]
        for bid in dropped:
            library["books"].pop(bid, None)
            _remove_cover(bid)
        if dropped:
            progress_store = _load(PROGRESS_FILE)
            progress = _user_progress(progress_store, user)
            for bid in dropped:
                progress.pop(bid, None)
            _save(PROGRESS_FILE, progress_store)
        _save(LIBRARY_FILE, store)
        return _library_payload(user)


def _remove_cover(book_id: str) -> None:
    for ext in ("webp", "png", "jpg"):
        path = os.path.join(COVER_DIR, f"{book_id}.{ext}")
        try:
            os.remove(path)
        except OSError:
            pass


def set_shared_roots(user: str, payload: dict) -> dict:
    """Replace the shared folders granted by the core sharing API.

    The frontend refreshes this list from ``/api/sharing/incoming``; books under
    a root that disappeared are pruned so a revoke also clears the metadata.
    """
    raw = payload.get("roots")
    if not isinstance(raw, list):
        raise ApiError("roots must be a list", 400)
    if len(raw) > MAX_FOLDERS:
        raise ApiError(f"Too many shared roots (max {MAX_FOLDERS})", 409)
    with _LOCK:
        store = _load(LIBRARY_FILE)
        library = _user_library(store, user)
        known = {r.get("path"): r for r in library.get("shared_roots", []) if isinstance(r, dict)}
        roots = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            path = _clean_path(item.get("path"))
            previous = known.get(path) or {}
            roots.append({
                "path": path,
                "owner": _text(item.get("owner"), 64),
                "added_at": previous.get("added_at") or _now(),
                "last_scan": previous.get("last_scan") or "",
                "count": int(previous.get("count") or 0),
            })
        library["shared_roots"] = roots
        shared_books = library.setdefault("shared_books", {})
        dropped = [bid for bid, book in shared_books.items()
                   if not any(_under(str(book.get("path")), r["path"]) for r in roots)]
        for bid in dropped:
            shared_books.pop(bid, None)
            _remove_cover(bid)
        if dropped:
            progress_store = _load(PROGRESS_FILE)
            progress = _user_progress(progress_store, user)
            for bid in dropped:
                progress.pop(bid, None)
            _save(PROGRESS_FILE, progress_store)
        _save(LIBRARY_FILE, store)
        return _library_payload(user)


def scan(user: str, payload: dict) -> dict:
    root = _clean_path(payload.get("root"))
    entries = payload.get("entries")
    removed = payload.get("removed")
    entries = entries[:MAX_SCAN_ENTRIES] if isinstance(entries, list) else []
    removed = removed[:MAX_SCAN_ENTRIES] if isinstance(removed, list) else []
    done = bool(payload.get("done"))
    is_shared = bool(payload.get("shared"))

    with _LOCK:
        store = _load(LIBRARY_FILE)
        library = _user_library(store, user)
        shared_root = next((r for r in library.get("shared_roots", [])
                            if r.get("path") == root), None) if is_shared else None
        books = library["shared_books"] if is_shared else library["books"]
        if is_shared:
            if shared_root is None:
                raise ApiError(f"{root} is not a shared folder", 409)
        elif not any(f.get("path") == root for f in library["folders"]):
            raise ApiError(f"{root} is not a configured scan folder", 409)

        added = updated = 0
        ids = {}
        for raw in entries:
            fresh = _clean_book(raw)
            if not fresh:
                continue
            if not _under(fresh["path"], root):
                continue
            if is_shared:
                fresh["shared"] = True
                fresh["shared_root"] = root
                fresh["shared_owner"] = (shared_root or {}).get("owner") or ""
            ids[fresh["path"]] = fresh["id"]
            current = books.get(fresh["id"])
            if not current:
                if len(books) >= MAX_BOOKS:
                    raise ApiError(f"Library is full (max {MAX_BOOKS} titles)", 409)
                books[fresh["id"]] = fresh
                added += 1
                continue
            if current.get("manual"):
                # A manual title/author fix survives every rescan.
                for key in ("title", "author", "series", "series_index", "language"):
                    fresh[key] = current.get(key, fresh[key])
            fresh["added_at"] = current.get("added_at") or fresh["added_at"]
            fresh["cover"] = bool(current.get("cover")) and os.path.exists(
                os.path.join(COVER_DIR, f"{fresh['id']}.{current.get('cover_ext') or 'webp'}"))
            fresh["cover_ext"] = current.get("cover_ext") or "webp"
            fresh["manual"] = bool(current.get("manual"))
            books[fresh["id"]] = fresh
            updated += 1

        dropped = 0
        for path in removed:
            try:
                book_id = _book_id(_clean_path(path))
            except ApiError:
                continue
            if books.pop(book_id, None) is not None:
                _remove_cover(book_id)
                dropped += 1

        if done:
            targets = [shared_root] if is_shared else library["folders"]
            for folder in targets:
                if folder and folder.get("path") == root:
                    folder["last_scan"] = _now()
                    folder["count"] = sum(1 for b in books.values()
                                          if _under(str(b.get("path")), root))
        _save(LIBRARY_FILE, store)
        return {"added": added, "updated": updated, "removed": dropped,
                "total": len(books), "ids": ids}


def save_cover(user: str, book_id: str, payload: dict) -> dict:
    fmt = str(payload.get("format") or "webp").strip().lower()
    if fmt in ("jpg", "jpeg"):
        fmt = "jpg"
    elif fmt == "png":
        fmt = "png"
    else:
        fmt = "webp"
    data = payload.get("data")
    if not isinstance(data, str) or not data:
        raise ApiError("data (base64) is required", 400)
    if len(data) > (MAX_COVER_BYTES * 4 // 3) + 8:
        raise ApiError("cover image is too large", 413)
    try:
        blob = base64.b64decode(data, validate=True)
    except (ValueError, binascii.Error):
        raise ApiError("data must be valid base64", 400) from None
    if not blob or len(blob) > MAX_COVER_BYTES:
        raise ApiError("cover image is too large", 413)
    with _LOCK:
        store = _load(LIBRARY_FILE)
        book = _user_library(store, user)["books"].get(book_id)
        if not book:
            raise ApiError("book not found", 404)
        os.makedirs(COVER_DIR, exist_ok=True)
        _remove_cover(book_id)
        with open(os.path.join(COVER_DIR, f"{book_id}.{fmt}"), "wb") as handle:
            handle.write(blob)
        book["cover"] = True
        book["cover_ext"] = fmt
        book["updated_at"] = _now()
        _save(LIBRARY_FILE, store)
        return {"ok": True, "book": book}


def read_cover(user: str, book_id: str) -> tuple[bytes, str]:
    with _LOCK:
        store = _load(LIBRARY_FILE)
        book = _user_library(store, user)["books"].get(book_id)
    if not book:
        raise ApiError("book not found", 404)
    ext = book.get("cover_ext") or "webp"
    path = os.path.join(COVER_DIR, f"{book_id}.{ext}")
    if not os.path.isfile(path):
        raise ApiError("no cover for this book", 404)
    media = {"webp": "image/webp", "png": "image/png", "jpg": "image/jpeg"}.get(ext, "image/webp")
    try:
        with open(path, "rb") as handle:
            return handle.read(MAX_COVER_BYTES), media
    except OSError as exc:
        raise ApiError(f"cover unreadable: {exc}", 500) from None


def save_progress(user: str, book_id: str, payload: dict) -> dict:
    with _LOCK:
        library = _user_library(_load(LIBRARY_FILE), user)
        if book_id not in library["books"] and book_id not in library.get("shared_books", {}):
            raise ApiError("book not found", 404)
        store = _load(PROGRESS_FILE)
        progress = _user_progress(store, user)
        record = _clean_progress(payload)
        record["updated_at"] = _now()
        progress[book_id] = record
        _save(PROGRESS_FILE, store)
        return {"progress": record}


def save_meta(user: str, book_id: str, payload: dict) -> dict:
    with _LOCK:
        store = _load(LIBRARY_FILE)
        book = _user_library(store, user)["books"].get(book_id)
        if not book:
            raise ApiError("book not found", 404)
        book["title"] = _text(payload.get("title"), 300) or book.get("title") or ""
        book["author"] = _text(payload.get("author"), 200)
        book["series"] = _text(payload.get("series"), 200)
        book["series_index"] = _clean_float(payload.get("series_index") or 0, 0, 100_000)
        book["manual"] = True
        book["updated_at"] = _now()
        _save(LIBRARY_FILE, store)
        return {"book": book}


def forget_book(user: str, book_id: str) -> dict:
    """Remove one title from the library. The file on the NAS is untouched."""
    with _LOCK:
        library_store = _load(LIBRARY_FILE)
        library = _user_library(library_store, user)
        if library["books"].pop(book_id, None) is None:
            raise ApiError("book not found", 404)
        _save(LIBRARY_FILE, library_store)
        progress_store = _load(PROGRESS_FILE)
        _user_progress(progress_store, user).pop(book_id, None)
        _save(PROGRESS_FILE, progress_store)
        _remove_cover(book_id)
        return {"ok": True, "removed": book_id}


def put_settings(user: str, payload: dict) -> dict:
    with _LOCK:
        store = _load(SETTINGS_FILE)
        current = _user_settings(store, user)
        merged = {**current, **(payload if isinstance(payload, dict) else {})}
        cleaned = _clean_settings(merged)
        store.setdefault("users", {})[user] = cleaned
        _save(SETTINGS_FILE, store)
        return {"settings": cleaned}


# ── HTTP layer ──────────────────────────────────────────────────────────────


def _dispatch(method: str, route: str, user: str, payload: dict):
    """Return (status, body) where body is a dict or a (bytes, media_type) pair."""
    parts = [part for part in route.split("?")[0].strip("/").split("/") if part]
    if parts[:2] == ["api", "books"]:
        parts = parts[2:]
    rest = parts

    if not rest or (rest == ["library"] and method == "GET"):
        if method == "GET":
            return 200, _library_payload(user)
    elif rest == ["folders"] and method == "PUT":
        return 200, set_folders(user, payload)
    elif rest == ["shared-roots"] and method == "PUT":
        return 200, set_shared_roots(user, payload)
    elif rest == ["scan"] and method == "POST":
        return 200, scan(user, payload)
    elif rest == ["settings"]:
        if method == "GET":
            with _LOCK:
                return 200, {"settings": _user_settings(_load(SETTINGS_FILE), user)}
        if method == "PUT":
            return 200, put_settings(user, payload)
    elif len(rest) == 3 and rest[0] == "books":
        book_id = rest[1]
        action = rest[2]
        if not re.fullmatch(r"bk_[0-9a-f]{12}", book_id):
            raise ApiError("book not found", 404)
        if action == "cover" and method == "POST":
            return 200, save_cover(user, book_id, payload)
        if action == "progress" and method == "PUT":
            return 200, save_progress(user, book_id, payload)
        if action == "meta" and method == "PUT":
            return 200, save_meta(user, book_id, payload)
    elif len(rest) == 2 and rest[0] == "books" and method == "DELETE":
        book_id = rest[1]
        if not re.fullmatch(r"bk_[0-9a-f]{12}", book_id):
            raise ApiError("book not found", 404)
        return 200, forget_book(user, book_id)
    elif len(rest) == 2 and rest[0] == "covers" and method == "GET":
        return 200, read_cover(user, rest[1])
    raise ApiError("not found", 404)


class Handler(BaseHTTPRequestHandler):
    server_version = f"EthosBooks/{TOOL_VERSION}"

    def _reply(self, status: int, payload) -> None:
        if isinstance(payload, tuple) and len(payload) == 2 and isinstance(payload[0], bytes):
            body, media = payload
            self.send_response(status)
            self.send_header("Content-Type", media)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "private, max-age=86400")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(body)
            return
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
                self._reply(200, {"ok": True, "version": TOOL_VERSION})
                return
            if not user:
                raise ApiError("Authentication required", 401)
            payload = self._payload() if method in ("POST", "PUT") else {}
            status, body = _dispatch(method, self.path, user, payload)
            self._reply(status, body)
        except ApiError as exc:
            self._reply(exc.status, {"detail": exc.detail})
        except Exception as exc:  # noqa: BLE001 — a package must never crash
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
    os.makedirs(COVER_DIR, exist_ok=True)
    with _LOCK:
        _load(LIBRARY_FILE)
        _load(PROGRESS_FILE)
        _load(SETTINGS_FILE)
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    server.daemon_threads = True
    print(f"books listening on 127.0.0.1:{PORT} (state {STATE_DIR})",
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
