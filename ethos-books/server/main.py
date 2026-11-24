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
    DELETE /books/<id>/cover        drop the stored cover (poster returns)
    GET    /covers/<id>             cover bytes (image/webp) or a generated SVG poster
    PUT    /books/<id>/progress     save reading/playback position
    PUT    /books/<id>/meta         manual metadata override (any editable field)
    GET    /books/<id>/search       ranked metadata candidates from the providers
    POST   /books/<id>/apply        apply one chosen candidate + its cover
    POST   /books/<id>/enrich       fill missing metadata/cover from the provider chain
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
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from html import escape as html_escape

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import providers  # noqa: E402
from naming import fold, looks_like_release, parse_name  # noqa: E402

TOOL_VERSION = "2.0.0"
PORT = int(os.environ.get("ETHOS_PACKAGE_PORT", "8089"))
STATE_DIR = os.environ.get("ETHOS_PACKAGE_DATA_DIR") or os.getcwd()
COVER_DIR = os.path.join(STATE_DIR, "covers")
LIBRARY_FILE = os.path.join(STATE_DIR, "library.json")
PROGRESS_FILE = os.path.join(STATE_DIR, "progress.json")
SETTINGS_FILE = os.path.join(STATE_DIR, "settings.json")

SCHEMA = 2
MAX_BODY = 4 * 1024 * 1024
MAX_COVER_BYTES = 512 * 1024
MAX_BOOKS = 20_000
MAX_FOLDERS = 64
MAX_SCAN_ENTRIES = 500
MAX_TRACKS = 500
MAX_SETTINGS_EXTENSIONS = 12

# Fields a provider (or the user) may fill beyond the scan. A rescan must keep
# them, otherwise every scan would throw away the enriched metadata.
PROVIDER_FIELDS = (
    "title", "author", "narrator", "series", "series_index", "language",
    "description", "publisher", "year", "isbn", "pages", "genres", "rating",
    "source", "source_id", "source_url", "cover_source",
)
MANUAL_FIELDS = {
    "title": 300, "author": 200, "narrator": 200, "series": 200,
    "language": 16, "description": 4000, "publisher": 200, "isbn": 20,
}
EDITABLE_FIELDS = tuple(MANUAL_FIELDS) + ("series_index", "year", "pages", "rating", "genres")

# Online enrichment runs through `server/providers.py` (Apple Books, Google
# Books, Open Library). The service is the only place allowed to make the
# outbound call: the browser cannot read those responses (no CORS), and the
# provider module keeps an HTTPS host allowlist so this cannot become SSRF.
ENRICH_MIN_SCORE = 0.72
ENRICH_COVER_SCORE = 0.80
ENRICH_RETRY_DAYS = 30

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
    "enrich_after_scan": True,
    "provider": "auto",
    "google_key": "",
    "posters": True,
}
PROVIDERS = ("auto", "apple", "google", "openlibrary")

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


def _upgrade_book(book: dict) -> None:
    """Bring a version-1 book record up to the version-2 metadata shape."""
    if not isinstance(book, dict):
        return
    for key, default in (("description", ""), ("narrator", ""), ("publisher", ""),
                         ("isbn", ""), ("source", ""), ("source_id", ""),
                         ("source_url", ""), ("cover_source", "")):
        if not isinstance(book.get(key), str):
            book[key] = default
    for key in ("year", "pages"):
        if not isinstance(book.get(key), int):
            book[key] = 0
    if not isinstance(book.get("rating"), (int, float)):
        book["rating"] = 0.0
    if not isinstance(book.get("genres"), list):
        book["genres"] = []
    if not isinstance(book.get("fields_manual"), list):
        book["fields_manual"] = []
    if book.get("manual") and not book["fields_manual"]:
        book["fields_manual"] = ["title", "author", "series", "series_index", "language"]


def _migrate_store(data: dict) -> None:
    try:
        version = int(data.get("version") or 1)
    except (TypeError, ValueError):
        version = 1
    if version >= SCHEMA:
        return
    for entry in data.get("users", {}).values():
        if not isinstance(entry, dict):
            continue
        for group in ("books", "shared_books"):
            books = entry.get(group)
            if isinstance(books, dict):
                for book in books.values():
                    _upgrade_book(book)


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
    try:
        _migrate_store(data)
    except Exception as exc:  # noqa: BLE001 — a bad record must not brick the store
        print(f"{os.path.basename(path)} migration failed: {exc}", file=sys.stderr, flush=True)
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


def _clean_genres(raw) -> list:
    if not isinstance(raw, list):
        return []
    out = []
    for item in raw[:8]:
        text = _text(item, 40)
        if text and text.lower() not in (seen.lower() for seen in out):
            out.append(text)
    return out[:6]


def _author_from_parent(path: str, root: str) -> str:
    """`root/Author/Book` and `root/Author/Series/Book`; release folders never count."""
    root = root.rstrip("/")
    parent = os.path.dirname(path.rstrip("/"))
    if not parent or parent == root or not _under(parent, root):
        return ""
    chain = []
    current = parent
    while current and current != root and _under(current, root):
        chain.append(os.path.basename(current))
        current = os.path.dirname(current)
    for name in reversed(chain):  # top-most folder below the root wins
        if looks_like_release(name) or re.search(r"\d", name) or re.search(r"[._]", name):
            continue
        tokens = name.split()
        if 1 <= len(tokens) <= 4:
            return name[:200]
    return ""


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
            "duration": round(_clean_float(item.get("duration") or 0, 0.0, 10**7), 1),
            "modified": _clean_float(item.get("modified") or 0, 0, 10**11),
        })
    return tracks


def _clean_book(raw, root: str = "") -> dict | None:
    """Normalize one scanned entry; unusable entries are skipped, not fatal."""
    if not isinstance(raw, dict):
        return None
    try:
        path = _clean_path(raw.get("path"))
        fmt = _clean_format(raw.get("format"))
        kind = "audiobook" if fmt in AUDIO_EXTS else "book"
        tags = raw.get("tags") if isinstance(raw.get("tags"), dict) else {}
        parsed = parse_name(os.path.basename(path))
        # A release folder name is never an author, even if an older client sent it.
        author = _text(raw.get("author"), 200)
        if author and looks_like_release(author):
            author = ""
        raw_title = _text(raw.get("title"), 300)
        if raw_title and (_fold(raw_title) == _fold(os.path.basename(path))
                          or looks_like_release(raw_title)):
            raw_title = ""
        title = (_text(tags.get("title"), 300) or raw_title
                 or parsed.get("title") or os.path.basename(path).rsplit(".", 1)[0])
        author = (_text(tags.get("artist"), 200) or author or parsed.get("author")
                  or _author_from_parent(path, root))
        narrator = (_text(raw.get("narrator"), 200) or _text(tags.get("narrator"), 200)
                    or parsed.get("narrator") or "")
        series = _text(raw.get("series"), 200) or parsed.get("series") or ""
        year = raw.get("year") or tags.get("year") or parsed.get("year") or 0
        book = {
            "id": _book_id(path),
            "path": path,
            "format": fmt,
            "kind": kind,
            "title": title,
            "author": author,
            "narrator": narrator,
            "series": series,
            "series_index": _clean_float(raw.get("series_index") or parsed.get("series_index") or 0,
                                         0, 100_000),
            "language": (_text(raw.get("language"), 16) or _text(tags.get("language"), 16)).lower(),
            "description": "",
            "publisher": "",
            "year": _clean_int(year, 0, 2200),
            "isbn": "",
            "pages": 0,
            "genres": [],
            "rating": 0.0,
            "source": "",
            "source_id": "",
            "source_url": "",
            "cover_source": "",
            "fields_manual": [],
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
                book["duration_s"] = round(sum(t["duration"] for t in book["tracks"]), 1)
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


def _ts(value) -> float:
    """ISO timestamp → epoch seconds; unparseable values sort first (oldest)."""
    text = str(value or "").strip()
    if not text:
        return 0.0
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return 0.0


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
    if isinstance(raw.get("enrich_after_scan"), bool):
        base["enrich_after_scan"] = raw["enrich_after_scan"]
    if isinstance(raw.get("posters"), bool):
        base["posters"] = raw["posters"]
    if raw.get("provider") in PROVIDERS:
        base["provider"] = raw["provider"]
    key = raw.get("google_key")
    if isinstance(key, str):
        base["google_key"] = key.strip()[:200]
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


def _public_settings(settings: dict) -> dict:
    """Settings as the browser may see them: the provider key never leaks."""
    public = {key: value for key, value in settings.items() if key != "google_key"}
    key = str(settings.get("google_key") or "")
    public["google_key_set"] = bool(key)
    public["google_key_masked"] = ("…" + key[-4:]) if len(key) >= 4 else ("…" if key else "")
    return public


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
            "settings": _public_settings(settings),
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
            fresh = _clean_book(raw, root)
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
            # Manual edits survive every rescan, and so does provider metadata:
            # otherwise the next scan would wipe the description and the cover.
            manual_fields = {key for key in (current.get("fields_manual") or [])
                             if key in EDITABLE_FIELDS}
            if current.get("manual") and not manual_fields:
                manual_fields.update(("title", "author", "series", "series_index", "language"))
            for key in manual_fields:
                if key in current:
                    fresh[key] = current[key]
            if current.get("enrich_status") == "updated":
                for key in PROVIDER_FIELDS:
                    if current.get(key) not in (None, "", [], 0, 0.0):
                        fresh[key] = current[key]
            fresh["added_at"] = current.get("added_at") or fresh["added_at"]
            fresh["cover"] = bool(current.get("cover")) and os.path.exists(
                os.path.join(COVER_DIR, f"{fresh['id']}.{current.get('cover_ext') or 'webp'}"))
            fresh["cover_ext"] = current.get("cover_ext") or "webp"
            fresh["cover_source"] = current.get("cover_source") or fresh.get("cover_source") or ""
            fresh["enriched_at"] = current.get("enriched_at") or ""
            fresh["enrich_status"] = current.get("enrich_status") or ""
            fresh["enrich_query"] = current.get("enrich_query") or ""
            fresh["fields_manual"] = sorted(manual_fields)
            fresh["manual"] = bool(manual_fields)
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
        book["cover_source"] = "manual"
        book["updated_at"] = _now()
        _save(LIBRARY_FILE, store)
        return {"ok": True, "book": book}


def _poster_svg(book: dict) -> bytes:
    """Deterministic placeholder poster so no card is ever a bare emoji."""
    seed = int(hashlib.sha1(str(book.get("id") or book.get("title") or "").encode()).hexdigest()[:6], 16)
    hue = seed % 360
    hue2 = (hue + 38) % 360
    title = str(book.get("title") or "Untitled")
    author = str(book.get("author") or "")
    words, lines, current = title.split(), [], ""
    for word in words:
        if len(current) + len(word) + 1 > 16 and current:
            lines.append(current)
            current = word
        else:
            current = (current + " " + word).strip()
    if current:
        lines.append(current)
    lines = lines[:4]
    font = 26 if len(lines) <= 2 else (22 if len(lines) == 3 else 19)
    spans = "".join(
        f'<text x="26" y="{150 + index * (font + 8)}">{html_escape(line)}</text>'
        for index, line in enumerate(lines)
    )
    glyph = "🎧" if book.get("kind") == "audiobook" else "📖"
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450" role="img">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="hsl({hue} 46% 34%)"/><stop offset="1" stop-color="hsl({hue2} 52% 16%)"/>
</linearGradient></defs>
<rect width="300" height="450" fill="url(#g)"/>
<text x="26" y="72" font-family="sans-serif" font-size="46" fill="rgba(255,255,255,0.28)">{glyph}</text>
<g font-family="sans-serif" font-weight="600" fill="#ffffff">{spans}</g>
<text x="26" y="418" font-family="sans-serif" font-size="15" fill="rgba(255,255,255,0.78)">{html_escape(author[:48])}</text>
</svg>'''
    return svg.encode("utf-8")


def read_cover(user: str, book_id: str) -> tuple[bytes, str]:
    with _LOCK:
        store = _load(LIBRARY_FILE)
        library = _user_library(store, user)
        book = library["books"].get(book_id) or library.get("shared_books", {}).get(book_id)
        settings = _user_settings(_load(SETTINGS_FILE), user)
    if not book:
        raise ApiError("book not found", 404)
    ext = book.get("cover_ext") or "webp"
    path = os.path.join(COVER_DIR, f"{book_id}.{ext}")
    if os.path.isfile(path):
        media = {"webp": "image/webp", "png": "image/png", "jpg": "image/jpeg"}.get(ext, "image/webp")
        try:
            with open(path, "rb") as handle:
                return handle.read(MAX_COVER_BYTES), media
        except OSError as exc:
            raise ApiError(f"cover unreadable: {exc}", 500) from None
    if settings.get("posters", True):
        return _poster_svg(book), "image/svg+xml"
    raise ApiError("no cover for this book", 404)


def save_progress(user: str, book_id: str, payload: dict) -> dict:
    with _LOCK:
        library = _user_library(_load(LIBRARY_FILE), user)
        if book_id not in library["books"] and book_id not in library.get("shared_books", {}):
            raise ApiError("book not found", 404)
        store = _load(PROGRESS_FILE)
        progress = _user_progress(store, user)
        record = _clean_progress(payload)
        existing = progress.get(book_id) or {}
        # Two devices can flush a position for the same book. The newest write
        # wins; a late flush from a phone that was offline must not rewind the
        # position the desktop reached afterwards.
        if existing and _ts(record.get("updated_at")) < _ts(existing.get("updated_at")):
            return {"progress": existing, "skipped": True}
        progress[book_id] = record
        _save(PROGRESS_FILE, store)
        return {"progress": record}


def save_meta(user: str, book_id: str, payload: dict) -> dict:
    """Apply a manual edit and remember which fields the user owns."""
    with _LOCK:
        store = _load(LIBRARY_FILE)
        book = _user_library(store, user)["books"].get(book_id)
        if not book:
            raise ApiError("book not found", 404)
        fields = set(book.get("fields_manual") or [])
        for key, limit in MANUAL_FIELDS.items():
            if key not in payload:
                continue
            value = _text(payload.get(key), limit)
            if key == "language":
                value = value.lower()
            if key == "title" and not value:
                raise ApiError("title cannot be empty", 400)
            book[key] = value
            fields.add(key)
        if "series_index" in payload:
            book["series_index"] = _clean_float(payload.get("series_index") or 0, 0, 100_000)
            fields.add("series_index")
        if "year" in payload:
            book["year"] = _clean_int(payload.get("year") or 0, 0, 2200)
            fields.add("year")
        if "pages" in payload:
            book["pages"] = _clean_int(payload.get("pages") or 0, 0, 100_000)
            fields.add("pages")
        if "rating" in payload:
            book["rating"] = round(_clean_float(payload.get("rating") or 0, 0, 5), 1)
            fields.add("rating")
        if "genres" in payload:
            book["genres"] = _clean_genres(payload.get("genres"))
            fields.add("genres")
        book["fields_manual"] = sorted(fields)
        book["manual"] = bool(fields)
        book["updated_at"] = _now()
        _save(LIBRARY_FILE, store)
        return {"book": book}


# ── Online metadata (provider chain) ──────────────────────────────────────

_fold = fold
_similarity = providers.similarity


NOISE = re.compile(
    r"\[[^\]]*\]|\([^)]*\)|\b(audiobook|ebook|e-book|epub|pdf|mp3|m4a|m4b|flac|ogg|opus|"
    r"unabridged|retail|proper|webrip)\b",
    re.I,
)


def _clean_query(value) -> str:
    text = NOISE.sub(" ", str(value or ""))
    text = re.sub(r"[_.]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip(" -–—")
    return text[:120]


def _stem(book) -> str:
    path = str(book.get("path") or "").rstrip("/")
    base = os.path.basename(path)
    fmt = str(book.get("format") or "").lower()
    if fmt and base.lower().endswith("." + fmt):
        base = base[: -(len(fmt) + 1)]
    return base


def _title_candidates(book) -> list:
    stem = _stem(book)
    author = _fold(book.get("author") or "")
    parts = [part for part in (_clean_query(piece) for piece in re.split(r"\s+[-–—]\s+", stem)) if part]
    parts = [part for part in parts if not re.fullmatch(r"\d{1,4}", _fold(part))]
    primary = ""
    if parts:
        primary = parts[-1]
        if author and author in _fold(primary) and len(parts) > 1:
            primary = parts[0]
    ordered = []
    if primary:
        ordered.append(primary)
    title = _clean_query(book.get("title") or "")
    if title and _fold(title) != _fold(stem):
        ordered.append(title)
    if len(parts) > 1:
        ordered.append(" ".join(parts))
    elif stem:
        ordered.append(_clean_query(stem))
    seen, out = set(), []
    for value in ordered:
        key = _fold(value)
        if len(key) < 2 or key in seen:
            continue
        seen.add(key)
        out.append(value)
    return out[:2]


def _looks_auto_title(book) -> bool:
    return _fold(book.get("title")) in ("", _fold(_stem(book)))


def _author_hint(book) -> str:
    """The stored author, or an 'Author - Title' prefix inferred from the name."""
    stored = _fold(book.get("author") or "")
    if stored:
        return str(book.get("author") or "")
    parts = [part.strip() for part in re.split(r"\s+[-–—]\s+", _stem(book)) if part.strip()]
    if len(parts) >= 2:
        first = _clean_query(parts[0])
        tokens = first.split()
        if 1 < len(tokens) <= 4 and not re.search(r"\d", first):
            return first
    return ""


def _enrich_retry_due(book) -> bool:
    if not book.get("enriched_at"):
        return True
    return time.time() - _ts(book.get("enriched_at")) >= ENRICH_RETRY_DAYS * 86400


def _provider_choice(payload: dict, settings: dict) -> str:
    wanted = payload.get("provider") if isinstance(payload, dict) else ""
    if wanted in PROVIDERS:
        return wanted
    current = settings.get("provider") if isinstance(settings, dict) else ""
    return current if current in PROVIDERS else "auto"


def _store_cover(book_id: str, candidate: dict):
    """Download a candidate cover outside the store lock; returns the extension."""
    url = str(candidate.get("cover_url") or "")
    if not url:
        return ""
    got = providers.get_image(str(candidate.get("source") or "openlibrary"), url)
    if not got:
        return ""
    blob, fmt = got
    os.makedirs(COVER_DIR, exist_ok=True)
    _remove_cover(book_id)
    try:
        with open(os.path.join(COVER_DIR, f"{book_id}.{fmt}"), "wb") as handle:
            handle.write(blob)
    except OSError as exc:
        print(f"cover write failed for {book_id}: {exc}", file=sys.stderr, flush=True)
        return ""
    return fmt


def _apply_enrichment(book: dict, candidate: dict) -> list:
    """Fill empty or auto-derived fields; fields the user owns never change."""
    manual = set(book.get("fields_manual") or [])
    changed = []

    def fill(key, value, limit=0):
        if key in manual or value in (None, "", [], 0, 0.0):
            return
        value = _text(value, limit) if limit else value
        if book.get(key) in (None, "", [], 0, 0.0):
            book[key] = value
            changed.append(key)

    title = _text(candidate.get("title"), 300)
    current_title = str(book.get("title") or "")
    if (title and "title" not in manual and title != current_title
            and (not current_title or _looks_auto_title(book)
                 or _similarity(title, current_title) >= 0.72)):
        book["title"] = title
        changed.append("title")

    author = _text(candidate.get("author"), 200)
    current_author = str(book.get("author") or "")
    if author and "author" not in manual and _fold(author) != _fold(current_author):
        if (not current_author or looks_like_release(current_author)
                or _fold(current_author) in _fold(author)
                or providers.author_match(current_author, author) >= 0.6):
            book["author"] = author
            changed.append("author")

    fill("narrator", candidate.get("narrator"), 200)
    fill("description", candidate.get("description"), 4000)
    fill("publisher", candidate.get("publisher"), 200)
    fill("isbn", candidate.get("isbn"), 20)
    fill("language", str(candidate.get("language") or "").lower()[:16])
    fill("series", candidate.get("series"), 200)
    fill("series_index", candidate.get("series_index"))
    fill("year", candidate.get("year"))
    fill("pages", candidate.get("pages"))
    fill("rating", candidate.get("rating"))
    fill("genres", candidate.get("genres"))
    return changed


def _candidate_queries(book, query: str) -> list:
    if query:
        return [query]
    return _title_candidates(book) or [_stem(book)]


def _search_candidates(book: dict, provider: str, google_key: str, query: str) -> tuple:
    """Search every provider in order and score the results for this book."""
    titles = _candidate_queries(book, query)
    author = str(book.get("author") or "") or _author_hint(book)
    found, tried, errors = [], [], []
    for title in titles:
        candidates, seen, errs = providers.search(title, author, provider, google_key)
        for name in seen:
            if name not in tried:
                tried.append(name)
        errors.extend(errs)
        for candidate in candidates:
            candidate["score"] = round(providers.score(book, candidate, titles), 3)
            found.append(candidate)
        if any(candidate["score"] >= ENRICH_MIN_SCORE + 0.1 for candidate in found):
            break
    found.sort(key=lambda candidate: candidate.get("score", 0.0), reverse=True)
    deduped, seen_ids = [], set()
    for candidate in found:
        key = (candidate.get("source"), candidate.get("source_id") or candidate.get("title"))
        if key in seen_ids:
            continue
        seen_ids.add(key)
        deduped.append(candidate)
    return deduped[:24], tried, errors


_PREVIEWS = {}


def _remember_previews(candidates: list) -> None:
    """Keep provider image URLs server-side; the UI gets a short-lived token."""
    now = time.time()
    with _LOCK:
        for token in [item for item, value in _PREVIEWS.items() if value[0] < now]:
            _PREVIEWS.pop(token, None)
        for candidate in candidates:
            url = str(candidate.get("cover_url") or "")
            if not url:
                continue
            seed = f"{candidate.get('source')}:{candidate.get('source_id') or candidate.get('title')}"
            token = hashlib.sha1(seed.encode("utf-8")).hexdigest()[:16]
            _PREVIEWS[token] = (now + 900, str(candidate.get("source") or "apple"), url)
            candidate["cover_preview"] = f"covers/preview/{token}"


def read_preview(token: str) -> tuple[bytes, str]:
    if not re.fullmatch(r"[0-9a-f]{16}", token):
        raise ApiError("not found", 404)
    with _LOCK:
        entry = _PREVIEWS.get(token)
    if not entry or entry[0] < time.time():
        raise ApiError("preview expired", 404)
    got = providers.get_image(entry[1], entry[2])
    if not got:
        raise ApiError("no preview", 404)
    blob, fmt = got
    return blob, {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}.get(fmt, "image/png")


def search_books(user: str, book_id: str, payload: dict) -> dict:
    """Return ranked candidates so the window can offer a manual pick."""
    with _LOCK:
        book = _user_library(_load(LIBRARY_FILE), user)["books"].get(book_id)
        settings = _user_settings(_load(SETTINGS_FILE), user)
        if not book:
            raise ApiError("book not found", 404)
    provider = _provider_choice(payload, settings)
    candidates, tried, errors = _search_candidates(
        book, provider, settings.get("google_key") or "", _text(payload.get("query"), 200))
    _remember_previews(candidates)
    return {"candidates": candidates, "tried": tried, "errors": errors,
            "provider": provider}


def apply_candidate(user: str, book_id: str, payload: dict) -> dict:
    """Apply one search result (and its cover) chosen by the user."""
    source = _text(payload.get("source"), 32)
    source_id = _text(payload.get("source_id"), 64)
    if not source or not source_id:
        raise ApiError("source and source_id are required", 400)
    with _LOCK:
        settings = _user_settings(_load(SETTINGS_FILE), user)
        book = _user_library(_load(LIBRARY_FILE), user)["books"].get(book_id)
        if not book:
            raise ApiError("book not found", 404)
    query = _text(payload.get("query"), 200)
    candidates, _, _ = _search_candidates(
        book, source, settings.get("google_key") or "", query)
    candidate = next((item for item in candidates
                      if item.get("source") == source and item.get("source_id") == source_id), None)
    if not candidate:
        raise ApiError("that result is gone — search again", 404)
    fmt = _store_cover(book_id, candidate)
    with _LOCK:
        store = _load(LIBRARY_FILE)
        book = _user_library(store, user)["books"].get(book_id)
        if not book:
            raise ApiError("book not found", 404)
        changed = _apply_enrichment(book, candidate)
        book["source"] = source
        book["source_id"] = source_id
        book["source_url"] = _text(candidate.get("source_url"), 512)
        if fmt:
            book["cover"] = True
            book["cover_ext"] = fmt
            book["cover_source"] = source
            changed.append("cover")
        book["enriched_at"] = _now()
        book["enrich_status"] = "updated" if changed else "unchanged"
        book["enrich_query"] = query
        book["updated_at"] = _now()
        _save(LIBRARY_FILE, store)
        return {"ok": True, "status": book["enrich_status"], "changed": changed, "book": book}


def enrich_book(user: str, book_id: str, payload: dict) -> dict:
    """Fill missing metadata and artwork through the provider chain.

    The browser cannot call these services (no CORS), so the package service
    does it behind an HTTPS host allowlist with a timeout and a rate limit.
    User corrections (`fields_manual`) are never overwritten.
    """
    force = bool(payload.get("force"))
    with _LOCK:
        book = _user_library(_load(LIBRARY_FILE), user)["books"].get(book_id)
        settings = _user_settings(_load(SETTINGS_FILE), user)
        if not book:
            raise ApiError("book not found", 404)
        snapshot = dict(book)
        if not force and not _enrich_retry_due(snapshot):
            return {"ok": True, "skipped": True, "status": "skipped", "book": snapshot}

    provider = _provider_choice(payload, settings)
    candidates, tried, errors = _search_candidates(
        snapshot, provider, settings.get("google_key") or "", _text(payload.get("query"), 200))
    best = candidates[0] if candidates else None
    best_score = float(best.get("score") or 0.0) if best else 0.0
    fmt = ""
    if best and best_score >= ENRICH_COVER_SCORE and not snapshot.get("cover"):
        fmt = _store_cover(book_id, best)

    status = "error" if errors and not tried else "no-match"
    changed = []
    with _LOCK:
        store = _load(LIBRARY_FILE)
        book = _user_library(store, user)["books"].get(book_id)
        if not book:
            raise ApiError("book not found", 404)
        if best and best_score >= ENRICH_MIN_SCORE:
            changed = _apply_enrichment(book, best)
            book["source"] = str(best.get("source") or "")
            book["source_id"] = str(best.get("source_id") or "")
            book["source_url"] = _text(best.get("source_url"), 512)
            if fmt:
                book["cover"] = True
                book["cover_ext"] = fmt
                book["cover_source"] = str(best.get("source") or "")
                changed.append("cover")
            status = "updated" if changed else "unchanged"
        book["enriched_at"] = _now()
        book["enrich_status"] = status
        book["enrich_query"] = _text(best.get("title") if best else "", 300)
        if changed:
            book["updated_at"] = _now()
        _save(LIBRARY_FILE, store)
        return {"ok": True, "status": status, "changed": changed, "score": round(best_score, 3),
                "source": str(best.get("source") or "") if best else "",
                "tried": tried, "errors": errors, "book": book}


def delete_cover(user: str, book_id: str) -> dict:
    """Drop a stored cover so the generated poster (or a new pick) takes over."""
    with _LOCK:
        store = _load(LIBRARY_FILE)
        book = _user_library(store, user)["books"].get(book_id)
        if not book:
            raise ApiError("book not found", 404)
        _remove_cover(book_id)
        book["cover"] = False
        book["cover_source"] = ""
        book["updated_at"] = _now()
        _save(LIBRARY_FILE, store)
        return {"ok": True, "book": book}


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
        incoming = dict(payload) if isinstance(payload, dict) else {}
        # The browser only ever sees a masked key: an absent or empty value
        # keeps the stored one, `clear_google_key` removes it deliberately.
        if incoming.get("clear_google_key"):
            incoming["google_key"] = ""
        elif not str(incoming.get("google_key") or "").strip():
            incoming["google_key"] = current.get("google_key") or ""
        merged = {**current, **incoming}
        cleaned = _clean_settings(merged)
        store.setdefault("users", {})[user] = cleaned
        _save(SETTINGS_FILE, store)
        return {"settings": _public_settings(cleaned)}


# ── HTTP layer ──────────────────────────────────────────────────────────────


def _dispatch(method: str, route: str, user: str, payload: dict):
    """Return (status, body) where body is a dict or a (bytes, media_type) pair."""
    query_string = route.split("?", 1)[1] if "?" in route else ""
    params = {key: values[0] for key, values in urllib.parse.parse_qs(query_string).items()}
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
                return 200, {"settings": _public_settings(_user_settings(_load(SETTINGS_FILE), user))}
        if method == "PUT":
            return 200, put_settings(user, payload)
    elif len(rest) == 3 and rest[0] == "books":
        book_id = rest[1]
        action = rest[2]
        if not re.fullmatch(r"bk_[0-9a-f]{12}", book_id):
            raise ApiError("book not found", 404)
        if action == "cover" and method == "POST":
            return 200, save_cover(user, book_id, payload)
        if action == "cover" and method == "DELETE":
            return 200, delete_cover(user, book_id)
        if action == "progress" and method == "PUT":
            return 200, save_progress(user, book_id, payload)
        if action == "meta" and method == "PUT":
            return 200, save_meta(user, book_id, payload)
        if action == "enrich" and method == "POST":
            return 200, enrich_book(user, book_id, payload)
        if action == "search" and method == "GET":
            return 200, search_books(user, book_id, params)
        if action == "apply" and method == "POST":
            return 200, apply_candidate(user, book_id, payload)
    elif len(rest) == 2 and rest[0] == "books" and method == "DELETE":
        book_id = rest[1]
        if not re.fullmatch(r"bk_[0-9a-f]{12}", book_id):
            raise ApiError("book not found", 404)
        return 200, forget_book(user, book_id)
    elif len(rest) == 2 and rest[0] == "covers" and method == "GET":
        return 200, read_cover(user, rest[1])
    elif len(rest) == 3 and rest[0] == "covers" and rest[1] == "preview" and method == "GET":
        return 200, read_preview(rest[2])
    raise ApiError("not found", 404)


class Handler(BaseHTTPRequestHandler):
    server_version = f"EthosBooks/{TOOL_VERSION}"

    def _reply(self, status: int, payload, inm: str = "") -> None:
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
        tag = hashlib.sha1(body).hexdigest()
        if inm and inm.strip() in (tag, f'"{tag}"'):
            # The phone revalidates the library on every start; 304 keeps it
            # cheap once nothing changed.
            self.send_response(304)
            self.send_header("ETag", f'"{tag}"')
            self.end_headers()
            return
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "private, no-cache")
        self.send_header("ETag", f'"{tag}"')
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
            self._reply(status, body, inm=self.headers.get("If-None-Match") or "")
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
