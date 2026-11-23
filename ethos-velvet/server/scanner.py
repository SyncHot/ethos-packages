"""Velvet — folder scanner, probe classification and duplicate keys.

The scanner walks the picked folders as the EthOS service user. It is bounded
(one scan per account, two ffprobe workers, 20 000 files per pass) and never
runs ffprobe on a file whose size and mtime are unchanged since the last pass.

Classification works from the filename plus ffprobe facts:
  * side-by-side when the frame is ~2:1 or the name carries LR/SBS/3dh tokens
  * projection: 180 SBS, Fisheye 180, 360, 3D SBS or Mono
  * resolution label from the name (8K/4096p…) or the per-eye height
  * studio from a known leading token
  * duplicate key = cleaned title, split by comparable duration
"""

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import paths
import store

MAX_FILES = 20_000
PROBE_WORKERS = 2
PROBE_TIMEOUT = 30

_LOCK = threading.RLock()
_ACTIVE: str | None = None
_STATE: dict[str, dict] = {}

_KNOWN_STUDIOS = frozenset({
    "slr", "drvr", "povr", "pervrt", "narcos", "realitylovers", "maturesvr",
    "stasyqvr", "virtualtaboo", "virtualrealporn", "wankzvr", "wankitnow",
    "milfvr", "realjamvr", "lotus", "badoinkvr", "vrbangers", "vrhush",
    "vrspy", "vrallure", "vrhotwife", "porncornvr", "jackandjillvr",
    "squeeze", "purityvr", "lustyvr", "lustreality", "deepinsex", "peeping",
    "r3dvr", "vrsexperts", "vredging", "vrixxens", "steel", "amateurvr3d",
    "asiansexvr", "kinked", "9block",
})

_TECH_TOKENS = frozenset({
    "lr", "sbs", "3d", "3dh", "stereo", "180", "360", "180x180", "180sbs",
    "sbs180", "3d180", "fisheye", "fisheye190", "mkx", "mkx200", "alpha",
    "passthrough", "transparent", "original", "uhq", "hq", "h265", "h264",
    "hevc", "avc", "vr265", "8kvr265", "6kvr265", "vrdesktophd", "oculus",
    "oculusrift", "rift", "quest", "pico", "60fps", "50fps", "30fps", "24fps",
    "hbr10", "vr180", "uhd", "fullvr", "vr",
})


def _log(message: str) -> None:
    print(f"velvet: {message}", file=sys.stderr, flush=True)


def _nice_prefix() -> list[str]:
    return ["nice", "-n", "19"] if shutil.which("nice") else []


def _ffprobe_bin() -> str:
    return os.environ.get("VELVET_FFPROBE") or "ffprobe"


def status(username: str) -> dict:
    with _LOCK:
        return dict(_STATE.get(username) or {"state": "idle"})


def _update(username: str, **fields) -> None:
    with _LOCK:
        state = _STATE.setdefault(username, {"state": "idle"})
        state.update(fields)


def start_scan(username: str, role: str, roots: list[str] | None = None) -> dict:
    global _ACTIVE
    with _LOCK:
        if _ACTIVE and _ACTIVE != username:
            raise RuntimeError("A scan is already running for another account")
        current = _STATE.get(username) or {}
        if _ACTIVE == username and current.get("state") == "scanning":
            return dict(current)
        _ACTIVE = username
        _STATE[username] = {
            "state": "starting", "root": "", "scanned": 0, "total": 0,
            "probed": 0, "skipped": 0, "failed": 0, "missing": 0,
            "truncated": False, "started_at": time.time(), "finished_at": 0,
            "error": "",
        }
    thread = threading.Thread(
        target=_run, args=(username, role, list(roots) if roots else None),
        name="velvet-scan", daemon=True,
    )
    thread.start()
    return status(username)


def _run(username: str, role: str, roots: list[str] | None) -> None:
    global _ACTIVE
    started = time.time()
    try:
        selected = roots if roots is not None else [f["path"] for f in store.list_folders(username)]
        if not selected:
            raise ValueError("Add a folder before scanning")
        resolved: list[str] = []
        for raw in selected:
            real = paths.check_path(username, role, raw, must_exist=True, must_be_dir=True)
            if real not in resolved:
                resolved.append(real)
        _update(username, state="scanning", root=resolved[0] if len(resolved) == 1 else "",
                total=0, scanned=0, probed=0, skipped=0, failed=0, error="")

        files: list[tuple[str, str, int, float]] = []
        truncated = False
        for root in resolved:
            for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
                dirnames[:] = sorted(
                    name for name in dirnames
                    if not name.startswith(".") and not os.path.islink(os.path.join(dirpath, name))
                )
                for name in sorted(filenames):
                    if name.startswith(".") or not paths.is_video_name(name):
                        continue
                    full = os.path.join(dirpath, name)
                    if os.path.islink(full):
                        continue
                    try:
                        stat = os.stat(full)
                    except OSError:
                        continue
                    if not os.path.isfile(full) or stat.st_size > paths.MAX_FILE_BYTES:
                        continue
                    files.append((os.path.realpath(full), name, int(stat.st_size), float(stat.st_mtime)))
                    if len(files) >= MAX_FILES:
                        truncated = True
                        break
                if truncated:
                    break
            if truncated:
                break

        _update(username, total=len(files), truncated=truncated)
        existing = store.existing_index(username)
        seen: set[str] = set()
        probed = 0
        skipped = 0
        failed = 0

        def probe(path: str) -> dict | None:
            try:
                return probe_file(path)
            except Exception as exc:  # noqa: BLE001 — one bad file must not kill the scan
                _log(f"probe failed key={hashlib.sha256(path.encode()).hexdigest()[:16]} "
                     f"error={type(exc).__name__}")
                return None

        def prepare(entry):
            path, name, size, mtime = entry
            cached = existing.get(path)
            meta: dict = {}
            metadata_fresh = False
            if cached and int(cached["size"]) == size and abs(float(cached["mtime"]) - mtime) < 0.001:
                metadata_fresh = float(cached.get("probed_at") or 0) > 0
            if metadata_fresh:
                meta = {
                    "duration": float(cached.get("duration") or 0),
                    "width": int(cached.get("width") or 0),
                    "height": int(cached.get("height") or 0),
                    "bitrate": int(cached.get("bitrate") or 0),
                    "vcodec": cached.get("vcodec") or "",
                    "acodec": cached.get("acodec") or "",
                    "audio_tracks": int(cached.get("audio_tracks") or 0),
                }
                return entry, meta, True, True
            return entry, meta, False, False

        # Phase 1: reuse unchanged metadata without touching ffprobe or writing
        # every row again. Only restored rows need their missing flag cleared.
        pending: list[tuple[str, str, int, float]] = []
        restored: list[str] = []
        for entry in files:
            entry, meta, fresh, _ = prepare(entry)
            path, name, size, mtime = entry
            if fresh:
                skipped += 1
                restored.append(path)
                seen.add(path)
            else:
                pending.append(entry)
        if restored:
            store.mark_present(username, restored)

        _update(username, scanned=len(seen), skipped=skipped, probed=probed, failed=failed)

        # Phase 2: probe new or changed files with a bounded pool.
        if pending:
            with ThreadPoolExecutor(max_workers=PROBE_WORKERS) as pool:
                futures = {pool.submit(probe, entry[0]): entry for entry in pending}
                for index, future in enumerate(as_completed(futures), start=1):
                    path, name, size, mtime = futures[future]
                    meta = future.result() or {}
                    if not meta:
                        failed += 1
                    else:
                        probed += 1
                    _upsert(username, path, name, size, mtime, meta,
                            time.time() if meta else 0.0)
                    seen.add(path)
                    if index % 5 == 0 or index == len(pending):
                        _update(username, scanned=len(seen), probed=probed, failed=failed)

        missing = store.mark_missing(username, resolved, seen)
        _update(username, state="done", scanned=len(seen), probed=probed, skipped=skipped,
                failed=failed, missing=missing, finished_at=time.time(),
                elapsed=round(time.time() - started, 1))
        _log(f"scan done user_library files={len(seen)} probed={probed} "
             f"skipped={skipped} failed={failed} missing={missing}")
    except Exception as exc:  # noqa: BLE001 — surfaced in the UI status line
        _update(username, state="error", error=str(exc), finished_at=time.time())
        # The message may name a folder (not a video); keep the log content-free.
        _log(f"scan failed error={type(exc).__name__}")
    finally:
        with _LOCK:
            _ACTIVE = None


def _upsert(username: str, path: str, name: str, size: int, mtime: float,
            meta: dict, probed_at: float) -> None:
    info = classify(name, meta)
    store.upsert_media(username, {
        "path": path,
        "name": name,
        "dir": os.path.dirname(path),
        "size": size,
        "mtime": mtime,
        "duration": meta.get("duration") or 0,
        "width": meta.get("width") or 0,
        "height": meta.get("height") or 0,
        "bitrate": meta.get("bitrate") or 0,
        "vcodec": meta.get("vcodec") or "",
        "acodec": meta.get("acodec") or "",
        "audio_tracks": meta.get("audio_tracks") or 0,
        "probed_at": probed_at,
        **info,
    })


# ── ffprobe ─────────────────────────────────────────────────────────────────


def parse_probe(data: dict) -> dict:
    fmt = data.get("format") or {}
    streams = data.get("streams") or []
    video = next((s for s in streams if s.get("codec_type") == "video"), {}) or {}
    audios = [s for s in streams if s.get("codec_type") == "audio"]

    def number(value, cast):
        try:
            return cast(value)
        except (TypeError, ValueError):
            return cast(0)

    return {
        "duration": number(fmt.get("duration"), float),
        "bitrate": number(fmt.get("bit_rate"), int),
        "width": number(video.get("width"), int),
        "height": number(video.get("height"), int),
        "vcodec": str(video.get("codec_name") or "")[:32],
        "acodec": str((audios[0].get("codec_name") if audios else "") or "")[:32],
        "audio_tracks": len(audios),
    }


def probe_file(path: str) -> dict:
    cmd = _nice_prefix() + [
        _ffprobe_bin(), "-v", "error", "-print_format", "json",
        "-show_format", "-show_streams", path,
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=PROBE_TIMEOUT)
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or "ffprobe failed").strip()[:200])
    return parse_probe(json.loads(proc.stdout or "{}"))


# ── Classification (pure functions, unit-tested) ────────────────────────────


def _token_set(name: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", name.lower()))


def clean_title(name: str) -> str:
    base = os.path.splitext(os.path.basename(name))[0]
    text = re.sub(r"[._]+", " ", base)
    text = re.sub(r"\(\s*oculus\s*\)", " ", text, flags=re.IGNORECASE)
    kept: list[str] = []
    for token in text.split():
        stripped = token.strip("()[]{}&,'\"")
        core = re.sub(r"[^a-z0-9]+", "", stripped.lower())
        if not core:
            continue
        if core in _TECH_TOKENS:
            continue
        if re.fullmatch(r"\d{10,}", core):
            continue
        if re.fullmatch(r"\d{3,4}p", core) or re.fullmatch(r"[4-8]k", core):
            continue
        kept.append(stripped)
    title = re.sub(r"\s{2,}", " ", " ".join(kept)).strip(" -_")
    return title or base


def studio_of(name: str) -> str:
    base = os.path.splitext(os.path.basename(name))[0]
    first = re.split(r"[_\- ]+", base.strip(), maxsplit=1)[0]
    core = re.sub(r"[^a-z0-9]+", "", first.lower())
    if not core or core.isdigit():
        return ""
    if core in _KNOWN_STUDIOS or "vr" in core:
        return first.strip()[:40]
    return ""


def resolution_label(name: str, meta: dict) -> str:
    match = re.search(r"(?i)(?:^|[^a-z0-9])([4-8])k(?:[^a-z0-9]|$)", name)
    if match:
        return match.group(1) + "K"
    match = re.search(r"(?i)(?:^|[^a-z0-9])(\d{3,4})p(?:[^a-z0-9]|$)", name)
    if match:
        return match.group(1) + "p"
    height = int(meta.get("height") or 0)
    for threshold, label in ((3800, "8K"), (3300, "7K"), (2800, "6K"), (2400, "5K"),
                             (2000, "4K"), (1400, "1440p"), (1000, "1080p"), (700, "720p")):
        if height >= threshold:
            return label
    return f"{height}p" if height else ""


def classify(name: str, meta: dict) -> dict:
    tokens = _token_set(name)
    width = int(meta.get("width") or 0)
    height = int(meta.get("height") or 0)
    aspect = (width / height) if width and height else 0.0

    def has(*values: str) -> bool:
        return any(value in tokens for value in values)

    stereo_lr = has("lr", "sbs", "stereo", "180x180", "sbs180", "3d180")
    stereo_3d = has("3d", "3dh")
    is_360 = has("360")
    sbs = stereo_lr or stereo_3d or (aspect >= 1.9 and (not is_360 or aspect >= 3.0))

    if is_360:
        projection = "360 SBS" if sbs else "360"
    elif has("fisheye", "fisheye190", "mkx", "mkx200"):
        projection = "Fisheye 180"
    elif stereo_lr or aspect >= 1.9:
        projection = "180 SBS"
    elif stereo_3d:
        projection = "3D SBS"
    else:
        projection = "Mono"

    title = clean_title(name)
    studio = studio_of(name)
    if studio and title.lower().startswith(studio.lower() + " "):
        title = title[len(studio):].strip()
    norm = hashlib.sha1(
        re.sub(r"[^a-z0-9]+", "", title.lower()).encode("utf-8")
    ).hexdigest()[:16]
    return {
        "title": title,
        "studio": studio,
        "res_label": resolution_label(name, meta),
        "projection": projection,
        "sbs": sbs,
        "alpha": has("alpha", "passthrough", "transparent"),
        "norm_key": norm,
    }
