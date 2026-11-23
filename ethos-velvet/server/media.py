"""Velvet — left-eye thumbnails and preview frames.

VR files are side-by-side: a normal frame grab shows the pair, which looks
doubled in a grid. Every still this app serves is therefore cropped to the left
eye first (`crop=iw/2:ih:0:0`) and only then scaled.

Generation mirrors the core thumbnail service: a bounded pool, `nice`,
input-side seek with keyframe and full-decode fallbacks, a per-file on-disk
cache keyed by path+mtime+size, and exponential backoff for broken files.
`GET /thumb` answers 202 + `retry_ms` while a frame is being produced.
"""

import hashlib
import json
import math
import os
import shutil
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import paths
import store

CACHE_VERSION = 1
MASTER_WIDTH = 640
FRAME_WIDTH = 960
FRAMES = 6
THUMB_TIMEOUT = 120
FAIL_ATTEMPTS = 4
BACKOFF = (60, 300, 900, 3600)

_LOCK = threading.RLock()
_EXECUTOR: ThreadPoolExecutor | None = None
_INFLIGHT: set[str] = set()


def _log(message: str) -> None:
    print(f"velvet: {message}", file=sys.stderr, flush=True)


def _ffmpeg_bin() -> str:
    return os.environ.get("VELVET_FFMPEG") or "ffmpeg"


def _nice_prefix() -> list[str]:
    return ["nice", "-n", "19"] if shutil.which("nice") else []


def _executor() -> ThreadPoolExecutor:
    global _EXECUTOR
    with _LOCK:
        if _EXECUTOR is None:
            _EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix="velvet-thumb")
        return _EXECUTOR


def _prefix(path: str) -> str:
    return hashlib.sha256(path.encode("utf-8")).hexdigest()[:16]


def _stamp(mtime: float, size: int) -> str:
    return hashlib.sha256(f"{mtime:.3f}|{int(size)}".encode("utf-8")).hexdigest()[:10]


def _cache_file(username: str, path: str, mtime: float, size: int, variant: str) -> str:
    name = f"{_prefix(path)}_v{CACHE_VERSION}_{variant}_{_stamp(mtime, size)}.webp"
    return os.path.join(paths.thumbs_dir(username), name)


def _fail_file(username: str, path: str, mtime: float, size: int, variant: str) -> str:
    name = f"{_prefix(path)}_v{CACHE_VERSION}_{variant}_{_stamp(mtime, size)}.json"
    return os.path.join(paths.thumbs_dir(username), ".fail", name)


def _read_failure(filename: str) -> dict:
    try:
        with open(filename, encoding="utf-8") as handle:
            data = json.load(handle)
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def _record_failure(filename: str) -> None:
    previous = _read_failure(filename)
    attempts = int(previous.get("attempts") or 0) + 1
    delay = BACKOFF[min(attempts - 1, len(BACKOFF) - 1)]
    try:
        os.makedirs(os.path.dirname(filename), exist_ok=True)
        with open(filename, "w", encoding="utf-8") as handle:
            json.dump({"attempts": attempts, "next_try": time.time() + delay}, handle)
    except OSError:
        pass


def _clear_failure(filename: str) -> None:
    try:
        os.remove(filename)
    except OSError:
        pass


def seek_seconds(item: dict, frame: int | None) -> float:
    duration = float(item.get("duration") or 0)
    if frame is None:
        return max(5.0, min(60.0, duration * 0.10)) if duration else 5.0
    index = max(0, min(FRAMES - 1, int(frame)))
    if duration > 0:
        return max(0.5, duration * (index + 1) / (FRAMES + 1))
    return (index + 1) * 10.0


def lookup(username: str, path: str, frame: int | None = None) -> tuple[str, str | None, int]:
    """Return (state, cache_file, retry_ms); state is ready|pending|failed|missing."""
    item = store.get_media(username, path)
    if not item or item.get("missing"):
        return ("missing", None, 0)
    mtime = float(item.get("mtime") or 0)
    size = int(item.get("size") or 0)
    variant = "t" if frame is None else f"f{int(frame)}"
    cached = _cache_file(username, path, mtime, size, variant)
    try:
        if os.path.getsize(cached) > 64:
            return ("ready", cached, 0)
    except OSError:
        pass

    failure = _read_failure(_fail_file(username, path, mtime, size, variant))
    if int(failure.get("attempts") or 0) >= FAIL_ATTEMPTS:
        return ("failed", None, 0)
    wait = float(failure.get("next_try") or 0) - time.time()
    if wait > 0:
        return ("pending", None, int(math.ceil(wait)))

    _enqueue(username, path, item, frame, cached, variant)
    return ("pending", None, 3)


def _enqueue(username: str, path: str, item: dict, frame: int | None,
             cached: str, variant: str) -> None:
    with _LOCK:
        if cached in _INFLIGHT:
            return
        _INFLIGHT.add(cached)
    try:
        _executor().submit(_job, username, path, item, frame, cached, variant)
    except RuntimeError as exc:  # executor shut down during exit
        with _LOCK:
            _INFLIGHT.discard(cached)
        _log(f"thumbnail queue unavailable error={type(exc).__name__}")


def _job(username: str, path: str, item: dict, frame: int | None,
         cached: str, variant: str) -> None:
    fail = _fail_file(username, path, float(item.get("mtime") or 0),
                      int(item.get("size") or 0), variant)
    tmp = f"{cached}.tmp-{os.getpid()}-{threading.get_ident()}"
    try:
        os.makedirs(os.path.dirname(cached), exist_ok=True)
        seconds = seek_seconds(item, frame)
        width = MASTER_WIDTH if frame is None else FRAME_WIDTH
        last_error = "ffmpeg produced no frame"
        for command in build_commands(path, tmp, seconds, bool(item.get("sbs")), width):
            try:
                proc = subprocess.run(command, capture_output=True, text=True,
                                      timeout=THUMB_TIMEOUT)
            except subprocess.TimeoutExpired:
                last_error = "ffmpeg timed out"
                continue
            except OSError as exc:
                last_error = f"ffmpeg unavailable ({type(exc).__name__})"
                break
            if proc.returncode == 0 and os.path.isfile(tmp) and os.path.getsize(tmp) > 64:
                os.replace(tmp, cached)
                _clear_failure(fail)
                return
            last_error = (proc.stderr or last_error).strip().splitlines()[-1][:160] \
                if (proc.stderr or "").strip() else last_error
        raise RuntimeError(last_error)
    except Exception as exc:  # noqa: BLE001 — recorded per file, never fatal
        _record_failure(fail)
        _log(f"thumbnail failed key={os.path.basename(cached)[:16]} "
             f"error={type(exc).__name__}")
    finally:
        try:
            if os.path.exists(tmp):
                os.remove(tmp)
        except OSError:
            pass
        with _LOCK:
            _INFLIGHT.discard(cached)


def build_commands(src: str, out: str, seconds: float, sbs: bool, width: int) -> list[list[str]]:
    filters = (f"crop=iw/2:ih:0:0,scale={int(width)}:-2" if sbs
               else f"scale={int(width)}:-2")
    tail = [
        "-map", "0:v:0", "-an", "-sn", "-dn", "-vframes", "1",
        "-vf", filters, "-c:v", "libwebp", "-f", "webp", "-y", out,
    ]
    base = _nice_prefix() + [
        _ffmpeg_bin(), "-nostdin", "-hide_banner", "-loglevel", "error", "-threads", "2",
    ]
    seek = f"{max(0.0, float(seconds)):.3f}"
    # First attempt decodes keyframes only: an 8K HEVC grab near the middle of a
    # 30-minute file otherwise decodes a whole GOP and takes tens of seconds.
    input_seek = base + ["-skip_frame", "nokey", "-ss", seek, "-i", src] + tail
    keyframe = base + ["-skip_frame", "nokey", "-i", src, "-ss", seek] + tail
    fallback = base + ["-i", src, "-ss", seek] + tail
    return [input_seek, keyframe, fallback]


def purge(username: str, path: str) -> None:
    """Drop every cached still for one path (after delete/forget)."""
    prefix = _prefix(path)
    directory = paths.thumbs_dir(username)
    for folder in (directory, os.path.join(directory, ".fail")):
        try:
            names = os.listdir(folder)
        except OSError:
            continue
        for name in names:
            if name.startswith(prefix + "_"):
                try:
                    os.remove(os.path.join(folder, name))
                except OSError:
                    pass
