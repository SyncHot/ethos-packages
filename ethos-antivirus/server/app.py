#!/usr/bin/env python3
"""EthOS AntiVirus — ClamAV front end with scan options and history.

The container talks to a sibling ``clamav`` container over the Compose network
using the ClamD null-terminated protocol. It never modifies scanned files and
only accepts paths under /home, /mnt and /media, which are mounted read-only
into the scanner and UI containers at /scan/<root>.

Settings, scan logs, quarantine copies (optional) and scheduled scans persist
in the package data volume (``AV_DATA_DIR``, /data by default).
"""

from __future__ import annotations

import json
import mimetypes
import os
import posixpath
import re
import shutil
import socket
import sys
import threading
import time
import traceback
import uuid
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "8092"))
CLAMD_HOST = os.environ.get("CLAMD_HOST", "clamav")
CLAMD_PORT = int(os.environ.get("CLAMD_PORT", "3310"))
SCAN_TIMEOUT = int(os.environ.get("SCAN_TIMEOUT", "1800"))
# Host paths are mounted under /scan inside the scanner container.
SCAN_PREFIX = (os.environ.get("SCAN_PREFIX", "/scan").rstrip("/") or "/scan")
STATIC_DIR = Path(__file__).resolve().parent / "static"
ALLOWED_ROOTS = tuple(
    root for root in os.environ.get("ALLOWED_ROOTS", "/home,/mnt,/media").split(",") if root
)
DATA_DIR = Path(os.environ.get("AV_DATA_DIR", "/data"))
STATE_FILE = DATA_DIR / "state.json"
QUARANTINE_DIR = DATA_DIR / "quarantine"
MAX_RESPONSE = 16 * 1024 * 1024
MAX_BODY = 64 * 1024
LOG_LIMIT = 200
QUARANTINE_LIMIT = 500
BATCH_SIZE = 100
SCHEDULER_INTERVAL = 30
VERSION = "2.1.0"

DEFAULT_SETTINGS = {
    "processing": "quarantine",          # "quarantine" (copy) | "report"
    "whitelist": [],                      # host paths skipped by scans
    "only_extensions": [],                # e.g. ["jpg", "pdf"]; empty = every type
    "max_file_mb": 0,                     # 0 = no per-file limit
    "max_quarantine_mb": 512,
    "smart_scan": False,
    "reload_signatures": False,
}

STATE_LOCK = threading.RLock()


def _read_reply(sock: socket.socket) -> str:
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


def clamd(command: str, timeout: int = 30) -> str:
    """Send one ClamD command and return the null-terminated response."""
    with socket.create_connection((CLAMD_HOST, CLAMD_PORT), timeout=timeout) as sock:
        sock.settimeout(timeout)
        sock.sendall(command.encode("utf-8") + b"\0")
        return _read_reply(sock)


def engine_version() -> str:
    try:
        return clamd("zVERSION", timeout=5).strip()
    except OSError:
        return ""


def definitions_info() -> dict:
    """Return engine and signature database details reported by clamd."""
    try:
        raw = clamd("VERSION", timeout=5).strip()
    except OSError as exc:
        return {"available": False, "detail": str(exc)}
    match = re.match(r"ClamAV\s+([^/\s]+)/(\d+)/(.+)", raw)
    if not match:
        return {"available": bool(raw), "raw": raw}
    return {
        "available": True,
        "engine": match.group(1),
        "signature": match.group(2),
        "released": match.group(3).strip(),
        "raw": raw,
    }


def health() -> tuple[int, dict]:
    mounts = mounts_status()
    try:
        pong = clamd("zPING", timeout=5).strip()
    except OSError as exc:
        return 503, {"status": "starting",
                      "detail": "ClamAV is starting; the first run downloads signatures",
                      "mounts": mounts,
                      "error": str(exc)}
    if pong != "PONG":
        return 503, {"status": "starting", "detail": f"unexpected PING reply: {pong!r}",
                     "mounts": mounts}
    return 200, {"status": "ready", "engine": engine_version(),
                 "allowed_roots": list(ALLOWED_ROOTS), "mounts": mounts}


def safe_host_path(raw: str) -> str:
    path = posixpath.normpath(str(raw or "/home").strip())
    if not path.startswith("/"):
        raise ValueError("Path must be absolute")
    if not any(path == root or path.startswith(root + "/") for root in ALLOWED_ROOTS):
        raise ValueError("Path must be under /home, /mnt or /media")
    return path


def mounts_status() -> dict:
    """Which allowed roots the UI container can actually see under /scan."""
    return {root: os.path.isdir(SCAN_PREFIX + root) for root in ALLOWED_ROOTS}


# ── Persistent state ───────────────────────────────────────────────────────


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def default_settings() -> dict:
    return json.loads(json.dumps(DEFAULT_SETTINGS))


def default_state() -> dict:
    return {
        "settings": default_settings(),
        "logs": [],
        "quarantine": [],
        "schedules": [],
        "scan_marks": {},
        "last_scan": None,
    }


def _clean_whitelist(raw) -> list[str]:
    cleaned: list[str] = []
    for item in raw if isinstance(raw, list) else []:
        try:
            path = safe_host_path(str(item))
        except ValueError:
            continue
        if path not in cleaned:
            cleaned.append(path)
    return cleaned[:100]


def _clean_extensions(raw) -> list[str]:
    items = raw if isinstance(raw, list) else str(raw or "").replace("\n", ",").split(",")
    cleaned: list[str] = []
    for item in items:
        value = str(item).strip().lower().lstrip(".")
        if value and re.fullmatch(r"[a-z0-9]{1,12}", value) and value not in cleaned:
            cleaned.append(value)
    return cleaned[:100]


def normalize_settings(raw) -> dict:
    settings = default_settings()
    if not isinstance(raw, dict):
        return settings
    if raw.get("processing") in ("quarantine", "report"):
        settings["processing"] = raw["processing"]
    settings["whitelist"] = _clean_whitelist(raw.get("whitelist"))
    settings["only_extensions"] = _clean_extensions(raw.get("only_extensions"))
    for key in ("max_file_mb", "max_quarantine_mb"):
        try:
            value = int(raw.get(key, settings[key]))
        except (TypeError, ValueError):
            continue
        settings[key] = max(0, min(value, 65536))
    for key in ("smart_scan", "reload_signatures"):
        if key in raw:
            settings[key] = bool(raw[key])
    return settings


def _normalize_list(raw, limit: int) -> list[dict]:
    items: list[dict] = []
    for item in raw if isinstance(raw, list) else []:
        if isinstance(item, dict) and item.get("id"):
            items.append(item)
        if len(items) >= limit:
            break
    return items


def load_state() -> dict:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    QUARANTINE_DIR.mkdir(parents=True, exist_ok=True)
    state = default_state()
    if STATE_FILE.exists():
        try:
            loaded = json.loads(STATE_FILE.read_text("utf-8"))
        except (OSError, ValueError) as exc:
            sys.stderr.write(f"anti virus: cannot read state file: {exc}\n")
            loaded = None
        if isinstance(loaded, dict):
            for key in state:
                if key in loaded:
                    state[key] = loaded[key]
    state["settings"] = normalize_settings(state.get("settings"))
    state["logs"] = _normalize_list(state.get("logs"), LOG_LIMIT)
    state["quarantine"] = _normalize_list(state.get("quarantine"), QUARANTINE_LIMIT)
    state["schedules"] = _normalize_list(state.get("schedules"), 50)
    marks = state.get("scan_marks")
    state["scan_marks"] = (
        {str(key): float(value) for key, value in marks.items()
         if isinstance(value, (int, float))}
        if isinstance(marks, dict) else {}
    )
    if not isinstance(state.get("last_scan"), dict):
        state["last_scan"] = None
    return state


def save_state(state: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(state, ensure_ascii=False, indent=1)
    tmp = STATE_FILE.with_name(STATE_FILE.name + ".tmp")
    tmp.write_text(payload, "utf-8")
    os.replace(tmp, STATE_FILE)


def update_state(mutate):
    """Apply ``mutate(state)`` under the state lock and persist the result."""
    with STATE_LOCK:
        state = load_state()
        result = mutate(state)
        save_state(state)
        return result


def status_payload() -> dict:
    with STATE_LOCK:
        state = load_state()
    return {
        "version": VERSION,
        "settings": state["settings"],
        "quarantine_count": len(state["quarantine"]),
        "logs_count": len(state["logs"]),
        "last_scan": state["last_scan"],
        "schedules": state["schedules"],
        "definitions": definitions_info(),
        "allowed_roots": list(ALLOWED_ROOTS),
        "mounts": mounts_status(),
    }


# ── Scanning ───────────────────────────────────────────────────────────────


def _whitelisted(host_path: str, whitelist: list[str]) -> bool:
    for entry in whitelist:
        if host_path == entry or host_path.startswith(entry.rstrip("/") + "/"):
            return True
    return False


def collect_files(host_path: str, settings: dict,
                  cutoff: float | None) -> tuple[list[tuple[str, str]], int, list[str]]:
    """Return ([(host_file, container_file)], skipped, errors) for one target."""
    container_root = SCAN_PREFIX + host_path
    target = Path(container_root)
    if not target.exists():
        return [], 0, [f"{host_path}: not visible in the scanner container "
                       f"(share not mounted at {SCAN_PREFIX}{host_path})"]
    if not target.is_dir():
        if not target.is_file():
            return [], 0, [f"{host_path}: not a regular file or directory"]
        if _skip_extension(host_path, settings):
            return [], 1, []
        return [(host_path, container_root)], 0, []

    files: list[tuple[str, str]] = []
    errors: list[str] = []
    skipped = 0
    only = set(settings["only_extensions"])
    whitelist = settings["whitelist"]
    max_bytes = settings["max_file_mb"] * 1024 * 1024

    def walk(directory: Path, host_dir: str) -> None:
        nonlocal skipped
        try:
            entries = list(os.scandir(directory))
        except OSError as exc:
            errors.append(f"{host_dir}: {exc.strerror or exc}")
            return
        for entry in entries:
            child_host = posixpath.join(host_dir, entry.name)
            if _whitelisted(child_host, whitelist):
                skipped += 1
                continue
            try:
                if entry.is_symlink():
                    continue
                if entry.is_dir(follow_symlinks=False):
                    walk(Path(entry.path), child_host)
                    continue
                if not entry.is_file(follow_symlinks=False):
                    continue
                if only:
                    extension = posixpath.splitext(entry.name)[1].lstrip(".").lower()
                    if extension not in only:
                        skipped += 1
                        continue
                info = entry.stat(follow_symlinks=False)
                if max_bytes and info.st_size > max_bytes:
                    skipped += 1
                    continue
                if cutoff is not None and info.st_mtime <= cutoff:
                    skipped += 1
                    continue
                files.append((child_host, entry.path))
            except OSError as exc:
                errors.append(f"{child_host}: {exc.strerror or exc}")

    walk(target, host_path)
    return files, skipped, errors


def _skip_extension(host_path: str, settings: dict) -> bool:
    extension = posixpath.splitext(posixpath.basename(host_path))[1].lstrip(".").lower()
    return bool(settings["only_extensions"]) and extension not in set(settings["only_extensions"])


def _classify(host_file: str, reply: str) -> tuple[str, str]:
    _path, separator, status = reply.rpartition(": ")
    if not separator:
        return "error", f"{host_file}: {reply or 'empty scanner reply'}"
    if status == "OK":
        return "clean", ""
    if "FOUND" in status:
        return "infected", status.split("FOUND", 1)[0].strip()
    return "error", f"{host_file}: {status}"


def scan_files(files: list[tuple[str, str]]) -> tuple[list[dict], int, list[str]]:
    """Scan files in batches over a single ClamD connection per batch."""
    infected: list[dict] = []
    errors: list[str] = []
    clean = 0
    for start in range(0, len(files), BATCH_SIZE):
        batch = files[start:start + BATCH_SIZE]
        try:
            with socket.create_connection((CLAMD_HOST, CLAMD_PORT),
                                          timeout=SCAN_TIMEOUT) as sock:
                sock.settimeout(SCAN_TIMEOUT)
                for host_file, container_file in batch:
                    sock.sendall(b"zSCAN " + container_file.encode("utf-8") + b"\0")
                    kind, detail = _classify(host_file, _read_reply(sock).strip())
                    if kind == "clean":
                        clean += 1
                    elif kind == "infected":
                        infected.append({"file": host_file, "signature": detail})
                    else:
                        errors.append(detail)
        except OSError as exc:
            errors.append(f"scanner unavailable: {exc}")
            break
    return infected, clean, errors


def _quarantine_records(infected: list[dict], settings: dict) -> list[dict]:
    """Copy detected files into the package data volume (originals untouched)."""
    if settings.get("processing") != "quarantine":
        return []
    limit = settings["max_quarantine_mb"] * 1024 * 1024
    records: list[dict] = []
    for item in infected:
        record = {
            "id": uuid.uuid4().hex[:16],
            "file": item["file"],
            "signature": item["signature"],
            "detected_at": _utcnow(),
            "size": 0,
            "stored": False,
            "note": "",
        }
        source = Path(SCAN_PREFIX + item["file"])
        try:
            size = source.stat().st_size
            record["size"] = size
            if limit and size > limit:
                record["note"] = "file exceeds the quarantine size limit"
            else:
                target_dir = QUARANTINE_DIR / record["id"]
                target_dir.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, target_dir / (source.name or "sample"))
                record["stored"] = True
        except OSError as exc:
            record["note"] = f"copy failed: {exc.strerror or exc}"
        records.append(record)
    return records


def _mark_cutoff(host_path: str, marks: dict) -> float | None:
    best = ""
    for key in marks:
        if host_path == key or host_path.startswith(key.rstrip("/") + "/"):
            if len(key) > len(best):
                best = key
    return marks.get(best) if best else None


def run_scan(raw_paths: list[str], trigger: str = "manual") -> dict:
    with STATE_LOCK:
        state_snapshot = load_state()
    settings = state_snapshot["settings"]
    started = datetime.now(timezone.utc)
    timer = time.monotonic()
    reload_error = ""
    if settings["reload_signatures"]:
        try:
            clamd("zRELOAD", timeout=120)
        except OSError as exc:
            reload_error = f"signature reload failed: {exc}"
    marks = state_snapshot["scan_marks"] if settings["smart_scan"] else {}
    clean = 0
    skipped = 0
    infected: list[dict] = []
    errors: list[str] = []
    scanned: list[str] = []
    for raw in raw_paths:
        try:
            host_path = safe_host_path(raw)
        except ValueError as exc:
            errors.append(str(exc))
            continue
        scanned.append(host_path)
        cutoff = _mark_cutoff(host_path, marks) if settings["smart_scan"] else None
        files, skip_count, walk_errors = collect_files(host_path, settings, cutoff)
        skipped += skip_count
        errors.extend(walk_errors)
        batch_infected, batch_clean, scan_errors = scan_files(files)
        infected.extend(batch_infected)
        clean += batch_clean
        errors.extend(scan_errors)
    if reload_error:
        errors.append(reload_error)
    quarantined = _quarantine_records(infected, settings)
    finished = datetime.now(timezone.utc)
    duration = round(time.monotonic() - timer, 2)
    engine = engine_version()
    entry = {
        "id": uuid.uuid4().hex[:16],
        "started_at": started.isoformat(timespec="seconds"),
        "finished_at": finished.isoformat(timespec="seconds"),
        "duration_s": duration,
        "trigger": trigger,
        "paths": scanned,
        "clean": clean,
        "threats": len(infected),
        "errors": len(errors),
        "skipped": skipped,
        "quarantined": sum(1 for item in quarantined if item["stored"]),
        "engine": engine,
    }

    def mutate(state: dict) -> None:
        state["logs"] = ([entry] + state["logs"])[:LOG_LIMIT]
        state["last_scan"] = entry
        state["quarantine"] = (quarantined + state["quarantine"])[:QUARANTINE_LIMIT]
        if settings["smart_scan"]:
            for path in scanned:
                state["scan_marks"][path] = finished.timestamp()

    update_state(mutate)
    return {
        "paths": scanned,
        "clean": clean,
        "infected": infected,
        "errors": errors,
        "skipped": skipped,
        "quarantined": quarantined,
        "engine": engine,
        "started_at": entry["started_at"],
        "finished_at": entry["finished_at"],
        "duration_s": duration,
    }


# ── Scheduled scans ────────────────────────────────────────────────────────


def _parse_hhmm(value: str) -> tuple[int, int]:
    match = re.fullmatch(r"([01]\d|2[0-3]):([0-5]\d)", str(value or ""))
    if not match:
        raise ValueError("time must use HH:MM (24h)")
    return int(match.group(1)), int(match.group(2))


def compute_next_run(schedule: dict, base: datetime | None = None) -> str:
    current = (base or datetime.now(timezone.utc)).astimezone()
    hour, minute = _parse_hhmm(schedule.get("time") or "03:00")
    candidate = current.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if schedule.get("frequency") == "weekly":
        weekday = int(schedule.get("weekday") or 0) % 7
        candidate += timedelta(days=(weekday - current.weekday()) % 7)
        if candidate <= current:
            candidate += timedelta(days=7)
    elif candidate <= current:
        candidate += timedelta(days=1)
    return candidate.isoformat(timespec="seconds")


def make_schedule(payload: dict) -> dict:
    raw_paths = payload.get("paths") or [payload.get("path") or ALLOWED_ROOTS[0]]
    if not isinstance(raw_paths, list):
        raw_paths = [raw_paths]
    paths: list[str] = []
    for item in raw_paths[:4]:
        path = safe_host_path(str(item))
        if path not in paths:
            paths.append(path)
    if not paths:
        raise ValueError("At least one scan path is required")
    frequency = "weekly" if payload.get("frequency") == "weekly" else "daily"
    hour, minute = _parse_hhmm(payload.get("time") or "03:00")
    try:
        weekday = int(payload.get("weekday") or 0) % 7
    except (TypeError, ValueError):
        weekday = 0
    schedule = {
        "id": uuid.uuid4().hex[:12],
        "paths": paths,
        "path": paths[0],
        "frequency": frequency,
        "time": f"{hour:02d}:{minute:02d}",
        "weekday": weekday,
        "enabled": bool(payload.get("enabled", True)),
        "last_run": "",
        "next_run": "",
    }
    schedule["next_run"] = compute_next_run(schedule)
    return schedule


def _due_now(schedule: dict, now: datetime) -> bool:
    try:
        due_at = datetime.fromisoformat(str(schedule.get("next_run") or ""))
    except ValueError:
        return False
    if due_at.tzinfo is None:
        due_at = due_at.astimezone()
    try:
        return due_at <= now
    except TypeError:
        return False


def run_due_schedules() -> None:
    now = datetime.now(timezone.utc)
    due: list[dict] = []

    def mutate(state: dict) -> None:
        for schedule in state["schedules"]:
            if not schedule.get("enabled"):
                continue
            if not schedule.get("next_run"):
                schedule["next_run"] = compute_next_run(schedule)
                continue
            if _due_now(schedule, now):
                schedule["last_run"] = now.astimezone().isoformat(timespec="seconds")
                schedule["next_run"] = compute_next_run(schedule, base=now)
                due.append({**schedule})

    update_state(mutate)
    for schedule in due:
        threading.Thread(target=_scheduled_scan, args=(schedule,),
                         name="av-schedule-scan", daemon=True).start()


def _scheduled_scan(schedule: dict) -> None:
    try:
        run_scan(list(schedule.get("paths") or [schedule.get("path") or ALLOWED_ROOTS[0]]),
                 trigger="schedule")
    except Exception:  # noqa: BLE001 - a scheduled run must not kill the thread
        sys.stderr.write("anti virus: scheduled scan failed\n" + traceback.format_exc())


def scheduler_loop() -> None:
    while True:
        try:
            run_due_schedules()
        except Exception:  # noqa: BLE001 - keep the scheduler alive
            sys.stderr.write("anti virus: scheduler error\n" + traceback.format_exc())
        time.sleep(SCHEDULER_INTERVAL)


class Handler(BaseHTTPRequestHandler):
    server_version = "EthOS-AntiVirus/2.1"

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

    def _body(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if length < 0 or length > MAX_BODY:
            raise ValueError("Invalid request size")
        if length == 0:
            return {}
        payload = json.loads(self.rfile.read(length) or b"{}")
        if not isinstance(payload, dict):
            raise ValueError("Request body must be a JSON object")
        return payload

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
        parsed = urlparse(self.path)
        route = parsed.path
        if route == "/api/health":
            status, payload = health()
            self._json(status, payload)
        elif route == "/api/info":
            self._json(200, {"name": "EthOS AntiVirus", "version": VERSION,
                             "allowed_roots": list(ALLOWED_ROOTS)})
        elif route == "/api/status":
            self._json(200, status_payload())
        elif route == "/api/settings":
            self._json(200, {"settings": load_state()["settings"],
                             "defaults": default_settings()})
        elif route == "/api/logs":
            try:
                limit = int((parse_qs(parsed.query).get("limit") or ["50"])[0])
            except ValueError:
                limit = 50
            limit = max(1, min(limit, LOG_LIMIT))
            state = load_state()
            self._json(200, {"items": state["logs"][:limit], "total": len(state["logs"])})
        elif route == "/api/quarantine":
            state = load_state()
            self._json(200, {"items": state["quarantine"], "count": len(state["quarantine"])})
        elif route == "/api/schedules":
            self._json(200, {"items": load_state()["schedules"]})
        elif route == "/api/definitions":
            self._json(200, definitions_info())
        else:
            self._asset(self.path)

    def _delete_quarantine(self, qid: str) -> None:
        shutil.rmtree(QUARANTINE_DIR / qid, ignore_errors=True)
        update_state(lambda state: state.update(
            quarantine=[item for item in state["quarantine"] if item.get("id") != qid]))

    def _clear_quarantine(self) -> None:
        shutil.rmtree(QUARANTINE_DIR, ignore_errors=True)
        QUARANTINE_DIR.mkdir(parents=True, exist_ok=True)
        update_state(lambda state: state.update(quarantine=[]))

    def _toggle_schedule(self, sid: str) -> dict:
        def mutate(state: dict) -> dict:
            for schedule in state["schedules"]:
                if schedule.get("id") == sid:
                    schedule["enabled"] = not schedule.get("enabled")
                    schedule["next_run"] = (compute_next_run(schedule)
                                            if schedule["enabled"] else "")
                    return schedule
            raise ValueError("Schedule not found")

        return update_state(mutate)

    def do_POST(self) -> None:  # noqa: N802
        route = urlparse(self.path).path
        known = {"/api/scan", "/api/settings", "/api/settings/reset", "/api/logs/clear",
                 "/api/quarantine/clear", "/api/schedules", "/api/definitions/reload"}
        action = re.fullmatch(
            r"/api/(?:quarantine|schedules)/[A-Za-z0-9]{1,40}/(?:delete|toggle)", route)
        if route not in known and not action:
            self.send_error(404)
            return
        try:
            payload = self._body()
            if route == "/api/scan":
                raw = payload["paths"] if "paths" in payload else payload.get("path")
                if raw is None:
                    raise ValueError("A scan path is required")
                raw_paths = raw if isinstance(raw, list) else [raw]
                paths = [safe_host_path(str(item)) for item in raw_paths][:8]
                if not paths:
                    raise ValueError("At least one scan path is required")
                trigger = "schedule" if payload.get("trigger") == "schedule" else "manual"
                self._json(200, run_scan(paths, trigger=trigger))
            elif route == "/api/settings":
                if not payload:
                    raise ValueError("Missing settings payload")
                settings = normalize_settings(payload.get("settings", payload))
                update_state(lambda state: state.update(settings=settings))
                self._json(200, {"settings": settings})
            elif route == "/api/settings/reset":
                settings = default_settings()
                update_state(lambda state: state.update(settings=settings))
                self._json(200, {"settings": settings})
            elif route == "/api/logs/clear":
                update_state(lambda state: state.update(logs=[]))
                self._json(200, {"ok": True})
            elif route == "/api/quarantine/clear":
                self._clear_quarantine()
                self._json(200, {"ok": True})
            elif route == "/api/schedules":
                schedule = make_schedule(payload)
                update_state(lambda state: state.update(
                    schedules=(state["schedules"] + [schedule])[:50]))
                self._json(200, {"schedule": schedule})
            elif route == "/api/definitions/reload":
                reply = clamd("zRELOAD", timeout=120)
                self._json(200, {"detail": reply.strip() or "reloading",
                                 "definitions": definitions_info()})
            else:
                parts = route.strip("/").split("/")
                item_id = parts[2] if len(parts) > 3 else ""
                if parts[1] == "quarantine" and parts[3] == "delete":
                    self._delete_quarantine(item_id)
                    self._json(200, {"ok": True})
                elif parts[1] == "schedules" and parts[3] == "delete":
                    update_state(lambda state: state.update(
                        schedules=[s for s in state["schedules"] if s.get("id") != item_id]))
                    self._json(200, {"ok": True})
                elif parts[1] == "schedules" and parts[3] == "toggle":
                    self._json(200, {"schedule": self._toggle_schedule(item_id)})
                else:
                    self.send_error(404)
        except ValueError as exc:
            self._json(400, {"detail": str(exc)})
        except OSError as exc:
            self._json(503, {"detail": f"Scanner unavailable: {exc}"})
        except RuntimeError as exc:
            self._json(502, {"detail": str(exc)})


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    QUARANTINE_DIR.mkdir(parents=True, exist_ok=True)
    threading.Thread(target=scheduler_loop, name="av-scheduler", daemon=True).start()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"EthOS AntiVirus {VERSION} listening on {HOST}:{PORT}, "
          f"clamd={CLAMD_HOST}:{CLAMD_PORT}, data={DATA_DIR}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
