#!/usr/bin/env python3
"""EthOS Sticky Notes — per-account notes and tasks as a signed package.

Runs inside the package's private virtualenv (`runtime: "venv"`). The core
proxies `/api/packages/ethos-sticky-notes/proxy/...` to this service and stamps
the caller's identity as `X-Ethos-User`, so every signed-in account sees only
its own notes.

Endpoints (all under /api/sticky-notes)
    GET    /                       list the caller's notes (display order)
    POST   /                       create a note/checklist
    PUT    /<note>                 update text, color, kind, pin, archive, due, reminder
    DELETE /<note>                 remove a note
    POST   /<note>/move            move one step {direction: up|down}
    POST   /<note>/items           add a checklist item
    PUT    /<note>/items/<item>    edit item text / toggle done
    DELETE /<note>/items/<item>    remove a checklist item
    GET    /settings               per-account ribbon settings
    PUT    /settings               update settings
    GET    /reminders/due          claim due reminders (fallback when no push)
    GET    /push/key               VAPID public key
    POST   /push/subscribe         store a browser push subscription
    POST   /push/unsubscribe       remove a push subscription
    POST   /push/test              send a test notification
    GET    /health                 liveness + version

The first start imports the notes the built-in widget stored in the core data
directory (`sticky_notes.json`, shape {username: [note, ...]}) so an upgrade
loses nothing. Store v1 notes are migrated in place to the v2 shape.
"""

import json
import os
import re
import sys
import threading
import uuid
from datetime import date, datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

# `push.py` ships next to this entry point; the venv runs it as a script, so
# the script directory is on sys.path. Keep the import optional so the notes
# service still starts if the wheelhouse was installed without pywebpush.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    import push as push_service
except Exception as _push_exc:  # noqa: BLE001 - push is optional
    push_service = None
    print(f"push support unavailable: {_push_exc}", file=sys.stderr, flush=True)

TOOL_VERSION = "2.0.0"
PORT = int(os.environ.get("ETHOS_PACKAGE_PORT", "8099"))
STATE_DIR = os.environ.get("ETHOS_PACKAGE_DATA_DIR") or os.getcwd()
CORE_DATA_DIR = os.environ.get("ETHOS_CORE_DATA_DIR", "")
STORE_FILE = os.path.join(STATE_DIR, "notes.json")
SETTINGS_FILE = os.path.join(STATE_DIR, "settings.json")
MAX_BODY = 256 * 1024
MAX_TEXT_LEN = 2000
MAX_NOTES = 200
MAX_ITEMS = 100
MAX_ITEM_LEN = 500
REMINDER_GRACE = timedelta(hours=24)

PALETTE = ["yellow", "pink", "blue", "green", "orange"]
DEFAULT_SETTINGS = {
    "ribbon_enabled": False,
    "ribbon_show_completed": True,
}
CLIENT_ID_RE = re.compile(r"^(sn|ci)_[a-f0-9]{12}$")

_LOCK = threading.RLock()


# ── Store ───────────────────────────────────────────────────────────────────

def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _new_id() -> str:
    return f"sn_{uuid.uuid4().hex[:12]}"


def _new_item_id() -> str:
    return f"ci_{uuid.uuid4().hex[:12]}"


def _username(raw: str) -> str:
    """Same normalization the core used: lowercase, [a-z0-9._-], max 64."""
    return re.sub(r"[^a-z0-9._-]", "", str(raw or "").strip().lower())[:64]


def _stored_bool(value, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    text = str(value or "").strip().lower()
    if text in ("true", "1", "yes", "on"):
        return True
    if text in ("false", "0", "no", "off"):
        return False
    return default


def _clean_due(value) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        if len(text) == 10:
            return date.fromisoformat(text).isoformat()
        return datetime.fromisoformat(text.replace("Z", "+00:00")).date().isoformat()
    except ValueError:
        return None


def _clean_reminder(value) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        moment = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(timezone.utc).isoformat(timespec="seconds")


def _clean_item(item) -> dict | None:
    if isinstance(item, str):
        item = {"text": item}
    if not isinstance(item, dict):
        return None
    item_id = str(item.get("id") or "").strip()
    if not CLIENT_ID_RE.fullmatch(item_id) or not item_id.startswith("ci_"):
        item_id = _new_item_id()
    text = str(item.get("text") or "")[:MAX_ITEM_LEN]
    return {
        "id": item_id[:48],
        "text": text,
        "done": _stored_bool(item.get("done"), False),
    }


def _clean_items(items) -> list:
    if not isinstance(items, list):
        return []
    return [n for n in (_clean_item(item) for item in items[:MAX_ITEMS]) if n]


def _clean_note(item) -> dict | None:
    """Normalize one stored note; drop entries that cannot be rendered."""
    if not isinstance(item, dict):
        return None
    note_id = str(item.get("id") or "").strip()
    if not CLIENT_ID_RE.fullmatch(note_id) or not note_id.startswith("sn_"):
        note_id = _new_id()
    color = str(item.get("color") or "yellow").strip().lower()
    if color not in PALETTE:
        color = "yellow"
    text = item.get("text")
    text = "" if text is None else str(text)[:MAX_TEXT_LEN]
    items = _clean_items(item.get("items"))
    kind = "checklist" if str(item.get("kind") or "").strip().lower() == "checklist" else "note"
    if items:
        kind = "checklist"
    reminder_at = _clean_reminder(item.get("reminder_at"))
    fired = _clean_reminder(item.get("reminder_fired_at")) if reminder_at else None
    return {
        "id": note_id[:48],
        "kind": kind,
        "text": text,
        "items": items,
        "color": color,
        "pinned": _stored_bool(item.get("pinned"), False),
        "archived": _stored_bool(item.get("archived"), False),
        "due_at": _clean_due(item.get("due_at")),
        "reminder_at": reminder_at,
        "reminder_fired_at": fired,
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
        store = {"version": 2, "users": _load_legacy()}
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
    try:
        version = int(data.get("version") or 1)
    except (TypeError, ValueError):
        version = 1
    store = {"version": 2, "users": _clean_users(data.get("users"))}
    if version != 2:
        _save(store)
        print(f"migrated notes store v{version} → v2", file=sys.stderr, flush=True)
    return store


def _save(store: dict) -> None:
    os.makedirs(STATE_DIR, exist_ok=True)
    tmp = STORE_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as handle:
        json.dump(store, handle, indent=2)
        handle.flush()
        os.fsync(handle.fileno())
    os.chmod(tmp, 0o600)
    os.replace(tmp, STORE_FILE)


def _load_settings() -> dict:
    data = {}
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, encoding="utf-8") as handle:
                data = json.load(handle)
        except (OSError, ValueError) as exc:
            print(f"settings unreadable, using defaults: {exc}", file=sys.stderr, flush=True)
            data = {}
    users = data.get("users") if isinstance(data, dict) else None
    cleaned = {}
    if isinstance(users, dict):
        for raw_user, entry in users.items():
            user = _username(raw_user)
            if not user or not isinstance(entry, dict):
                continue
            cleaned[user] = {
                "ribbon_enabled": _stored_bool(entry.get("ribbon_enabled"), False),
                "ribbon_show_completed": _stored_bool(entry.get("ribbon_show_completed"), True),
            }
    return {"version": 1, "users": cleaned}


def _save_settings(store: dict) -> None:
    os.makedirs(STATE_DIR, exist_ok=True)
    tmp = SETTINGS_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as handle:
        json.dump(store, handle, indent=2)
        handle.flush()
        os.fsync(handle.fileno())
    os.chmod(tmp, 0o600)
    os.replace(tmp, SETTINGS_FILE)


# ── Operations ──────────────────────────────────────────────────────────────

class ApiError(Exception):
    def __init__(self, detail: str, status: int = 400):
        super().__init__(detail)
        self.detail = detail
        self.status = status


def _notes_for(store: dict, user: str) -> list:
    return store["users"].setdefault(user, [])


def _text(value) -> str:
    text = "" if value is None else str(value)
    if len(text) > MAX_TEXT_LEN:
        raise ApiError(f"Note text too long (max {MAX_TEXT_LEN} chars)", 400)
    return text


def _item_text(value) -> str:
    text = "" if value is None else str(value)
    if not text.strip():
        raise ApiError("Checklist item text is required", 400)
    if len(text) > MAX_ITEM_LEN:
        raise ApiError(f"Checklist item too long (max {MAX_ITEM_LEN} chars)", 400)
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


def _kind(value, *, default: str = "note") -> str:
    text = str(value or default).strip().lower()
    if text not in ("note", "checklist"):
        raise ApiError(f"Unknown note kind: {value!r} (valid: note, checklist)", 400)
    return text


def _bool(value, field: str) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)) and value in (0, 1):
        return bool(value)
    text = str(value).strip().lower()
    if text in ("true", "1", "yes", "on"):
        return True
    if text in ("false", "0", "no", "off", ""):
        return False
    raise ApiError(f"{field} must be a boolean", 400)


def _due(value) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return date.fromisoformat(text).isoformat()
    except ValueError:
        raise ApiError("due_at must be a date in YYYY-MM-DD form", 400) from None


def _reminder(value) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        moment = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        raise ApiError("reminder_at must be an ISO 8601 datetime", 400) from None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(timezone.utc).isoformat(timespec="seconds")


def _client_id(value, prefix: str) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    if not CLIENT_ID_RE.fullmatch(text) or not text.startswith(prefix + "_"):
        raise ApiError(f"client_id must look like {prefix}_ + 12 hex characters", 400)
    return text


def _payload_items(value) -> list:
    if value is None:
        return []
    if not isinstance(value, list):
        raise ApiError("items must be a list", 400)
    if len(value) > MAX_ITEMS:
        raise ApiError(f"Too many checklist items (max {MAX_ITEMS})", 409)
    items = []
    for raw in value:
        if isinstance(raw, str):
            raw = {"text": raw}
        if not isinstance(raw, dict):
            raise ApiError("each checklist item must be a string or an object", 400)
        item_id = _client_id(raw.get("client_id") or raw.get("id"), "ci") or _new_item_id()
        items.append({
            "id": item_id,
            "text": _item_text(raw.get("text")),
            "done": _bool(raw.get("done", False), "done"),
        })
    return items


def _find(notes: list, note_id: str) -> tuple[int, dict]:
    for index, note in enumerate(notes):
        if note.get("id") == note_id:
            return index, note
    raise ApiError(f"Note {note_id} not found", 404)


def _find_item(note: dict, item_id: str) -> tuple[int, dict]:
    for index, item in enumerate(note.get("items") or []):
        if item.get("id") == item_id:
            return index, item
    raise ApiError(f"Checklist item {item_id} not found", 404)


def _touch(note: dict) -> None:
    note["updated_at"] = _now()


def list_notes(user: str) -> dict:
    with _LOCK:
        return {"notes": _notes_for(_load(), user)}


def create_note(user: str, payload: dict) -> dict:
    text = _text(payload.get("text"))
    color = _color(payload.get("color"), allow_none=True)
    kind = _kind(payload.get("kind"))
    items = _payload_items(payload.get("items"))
    due_at = _due(payload.get("due_at"))
    reminder_at = _reminder(payload.get("reminder_at"))
    pinned = _bool(payload.get("pinned", False), "pinned")
    client_id = _client_id(payload.get("client_id"), "sn")
    with _LOCK:
        store = _load()
        notes = _notes_for(store, user)
        if client_id:
            for note in notes:
                if note.get("id") == client_id:
                    return {"notes": notes, "note": note}
        if len(notes) >= MAX_NOTES:
            raise ApiError(f"Too many notes (max {MAX_NOTES}); remove one first", 409)
        if color is None:
            color = PALETTE[len(notes) % len(PALETTE)]
        note = {
            "id": client_id or _new_id(),
            "kind": kind,
            "text": text,
            "items": items,
            "color": color,
            "pinned": pinned,
            "archived": False,
            "due_at": due_at,
            "reminder_at": reminder_at,
            "reminder_fired_at": None,
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
        if "text" in payload:
            note["text"] = _text(payload.get("text"))
        if "color" in payload and payload.get("color") is not None:
            note["color"] = _color(payload.get("color"), allow_none=False)
        if "kind" in payload:
            note["kind"] = _kind(payload.get("kind"))
        if "pinned" in payload:
            note["pinned"] = _bool(payload.get("pinned"), "pinned")
        if "archived" in payload:
            note["archived"] = _bool(payload.get("archived"), "archived")
        if "due_at" in payload:
            note["due_at"] = _due(payload.get("due_at"))
        if "reminder_at" in payload:
            next_reminder = _reminder(payload.get("reminder_at"))
            if next_reminder != note.get("reminder_at"):
                note["reminder_fired_at"] = None
            note["reminder_at"] = next_reminder
        _touch(note)
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


def add_item(user: str, note_id: str, payload: dict) -> dict:
    text = _item_text(payload.get("text"))
    client_id = _client_id(payload.get("client_id"), "ci")
    with _LOCK:
        store = _load()
        notes = _notes_for(store, user)
        _index, note = _find(notes, note_id)
        note["kind"] = "checklist"
        items = note.setdefault("items", [])
        if client_id:
            for item in items:
                if item.get("id") == client_id:
                    return {"notes": notes, "note": note, "item": item}
        if len(items) >= MAX_ITEMS:
            raise ApiError(f"Too many checklist items (max {MAX_ITEMS})", 409)
        item = {"id": client_id or _new_item_id(), "text": text, "done": False}
        items.append(item)
        _touch(note)
        _save(store)
        return {"notes": notes, "note": note, "item": item}


def update_item(user: str, note_id: str, item_id: str, payload: dict) -> dict:
    with _LOCK:
        store = _load()
        notes = _notes_for(store, user)
        _index, note = _find(notes, note_id)
        _item_index, item = _find_item(note, item_id)
        if "text" in payload:
            item["text"] = _item_text(payload.get("text"))
        if "done" in payload:
            item["done"] = _bool(payload.get("done"), "done")
        _touch(note)
        _save(store)
        return {"notes": notes, "note": note, "item": item}


def delete_item(user: str, note_id: str, item_id: str) -> dict:
    with _LOCK:
        store = _load()
        notes = _notes_for(store, user)
        _index, note = _find(notes, note_id)
        index, _item = _find_item(note, item_id)
        note["items"].pop(index)
        _touch(note)
        _save(store)
        return {"notes": notes, "note": note}


def get_settings(user: str) -> dict:
    with _LOCK:
        settings = _load_settings()["users"].get(user) or dict(DEFAULT_SETTINGS)
        return {"settings": settings}


def update_settings(user: str, payload: dict) -> dict:
    with _LOCK:
        store = _load_settings()
        current = store["users"].get(user) or dict(DEFAULT_SETTINGS)
        for field in ("ribbon_enabled", "ribbon_show_completed"):
            if field in payload:
                current[field] = _bool(payload.get(field), field)
        store["users"][user] = current
        _save_settings(store)
        return {"settings": current}


# ── Reminders ───────────────────────────────────────────────────────────────

def _open_items(note: dict) -> int:
    return sum(1 for item in note.get("items") or [] if not item.get("done"))


def _is_complete(note: dict) -> bool:
    items = note.get("items") or []
    return bool(items) and not any(not item.get("done") for item in items)


def _reminder_payload(note: dict) -> dict:
    title = str(note.get("text") or "").strip()
    if not title and note.get("items"):
        title = str(note["items"][0].get("text") or "").strip()
    title = title or ("Task reminder" if note.get("kind") == "checklist" else "Note reminder")
    return {
        "note_id": note.get("id"),
        "kind": note.get("kind") or "note",
        "title": "Sticky Notes",
        "body": title[:180],
        "due_at": note.get("due_at"),
        "reminder_at": note.get("reminder_at"),
        "open_items": _open_items(note) if note.get("kind") == "checklist" else 0,
        "tag": f"sn-{note.get('id')}-{note.get('reminder_at')}",
        "url": f"/notes?note={note.get('id')}",
    }


def _due_notes(store: dict, user: str, now: datetime) -> list[dict]:
    """Return due payloads and mark stale/complete reminders as fired."""
    payloads = []
    changed = False
    for note in store["users"].get(user, []):
        reminder_at = _clean_reminder(note.get("reminder_at"))
        if not reminder_at or note.get("reminder_fired_at") or note.get("archived"):
            continue
        try:
            moment = datetime.fromisoformat(reminder_at)
        except ValueError:
            note["reminder_fired_at"] = _now()
            changed = True
            continue
        if moment > now:
            continue
        if now - moment > REMINDER_GRACE or _is_complete(note):
            # A reminder that is too old (the NAS was off) or belongs to a
            # finished checklist must not fire.
            note["reminder_fired_at"] = _now()
            changed = True
            continue
        payloads.append(_reminder_payload(note))
    if changed:
        _save(store)
    return payloads


def claim_due_reminders(user: str) -> dict:
    """Claim due reminders for in-app display (no push subscription)."""
    with _LOCK:
        store = _load()
        payloads = _due_notes(store, user, datetime.now(timezone.utc))
        for note in store["users"].get(user, []):
            if any(p["note_id"] == note.get("id") for p in payloads):
                note["reminder_fired_at"] = _now()
        if payloads:
            _save(store)
        return {"reminders": payloads}


def _run_reminders_once() -> dict:
    """Send push reminders for every account with a subscription."""
    if push_service is None:
        return {"users": 0, "sent": 0, "failed": 0}
    now = datetime.now(timezone.utc)
    pending = []
    with _LOCK:
        store = _load()
        for user in list(store["users"]):
            if not push_service.list_subscriptions(user):
                continue
            payloads = _due_notes(store, user, now)
            if not payloads:
                continue
            for payload in payloads:
                for note in store["users"].get(user, []):
                    if note.get("id") == payload.get("note_id"):
                        note["reminder_fired_at"] = _now()
            _save(store)
            pending.extend((user, payload) for payload in payloads)
    sent = failed = 0
    for user, payload in pending:
        result = push_service.send_to_user(user, payload)
        sent += int(result.get("sent") or 0)
        failed += int(result.get("failed") or 0)
        if not result.get("sent"):
            # No device accepted the push: leave the reminder claimable by the
            # in-app fallback on the next poll.
            with _LOCK:
                store = _load()
                for note in store["users"].get(user, []):
                    if note.get("id") == payload.get("note_id"):
                        note["reminder_fired_at"] = None
                _save(store)
    return {"users": len({u for u, _p in pending}), "sent": sent, "failed": failed}


def _scheduler_loop(stop: threading.Event) -> None:
    if stop.wait(5):
        return
    while not stop.is_set():
        try:
            _run_reminders_once()
        except Exception as exc:  # noqa: BLE001 - keep the scheduler alive
            print(f"reminder scheduler failed: {exc}", file=sys.stderr, flush=True)
        if stop.wait(30):
            return


# ── HTTP layer ──────────────────────────────────────────────────────────────

def _dispatch(method: str, route: str, user: str, payload: dict) -> tuple[int, dict]:
    parsed = urlsplit(route)
    parts = [part for part in parsed.path.strip("/").split("/") if part]
    if parts[:2] != ["api", "sticky-notes"]:
        raise ApiError("not found", 404)
    rest = parts[2:]

    if not rest:
        if method == "GET":
            return 200, list_notes(user)
        if method == "POST":
            return 201, create_note(user, payload)
    elif rest == ["settings"]:
        if method == "GET":
            return 200, get_settings(user)
        if method == "PUT":
            return 200, update_settings(user, payload)
    elif rest == ["reminders", "due"] and method == "GET":
        return 200, claim_due_reminders(user)
    elif rest == ["push", "key"] and method == "GET":
        if push_service is None or not push_service.is_available():
            raise ApiError("push is not available", 503)
        return 200, {"public_key": push_service.public_key()}
    elif rest == ["push", "subscribe"] and method == "POST":
        if push_service is None:
            raise ApiError("push is not available", 503)
        try:
            return 200, push_service.subscribe(user, payload.get("subscription"))
        except ValueError as exc:
            raise ApiError(str(exc), 400) from None
    elif rest == ["push", "unsubscribe"] and method == "POST":
        if push_service is None:
            return 200, {"ok": True, "removed": 0}
        return 200, push_service.unsubscribe(user, payload.get("endpoint"))
    elif rest == ["push", "test"] and method == "POST":
        if push_service is None or not push_service.is_available():
            raise ApiError("push is not available", 503)
        return 200, push_service.test_push(user)
    elif len(rest) == 1:
        note_id = rest[0]
        if method == "PUT":
            return 200, update_note(user, note_id, payload)
        if method == "DELETE":
            return 200, delete_note(user, note_id)
    elif len(rest) == 2 and rest[1] == "move" and method == "POST":
        return 200, move_note(user, rest[0], payload)
    elif len(rest) == 2 and rest[1] == "items" and method == "POST":
        return 201, add_item(user, rest[0], payload)
    elif len(rest) == 3 and rest[1] == "items":
        note_id, _items, item_id = rest
        if method == "PUT":
            return 200, update_item(user, note_id, item_id, payload)
        if method == "DELETE":
            return 200, delete_item(user, note_id, item_id)
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
            if urlsplit(self.path).path.startswith("/health"):
                push_ok = bool(push_service is not None and push_service.is_available())
                self._reply(200, {"ok": True, "version": TOOL_VERSION,
                                  "user": user, "push": push_ok})
                return
            if not user:
                raise ApiError("Authentication required", 401)
            payload = self._payload() if method in ("POST", "PUT") else {}
            status, body = _dispatch(method, self.path, user, payload)
            self._reply(status, body)
        except ApiError as exc:
            self._reply(exc.status, {"detail": exc.detail})
        except ValueError as exc:
            self._reply(400, {"detail": str(exc)})
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
        _load_settings()
    stop = threading.Event()
    threading.Thread(target=_scheduler_loop, args=(stop,),
                     name="sticky-reminders", daemon=True).start()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    server.daemon_threads = True
    push_state = "available" if (push_service is not None and push_service.is_available()) else "unavailable"
    print(f"sticky notes {TOOL_VERSION} listening on 127.0.0.1:{PORT} "
          f"(state {STORE_FILE}, push {push_state})", file=sys.stderr, flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        stop.set()
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
