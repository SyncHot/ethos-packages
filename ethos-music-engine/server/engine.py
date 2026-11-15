#!/usr/bin/env python3
"""EthOS Music Engine — yt-dlp behind a small loopback HTTP API.

Runs inside the package's private virtualenv (manifest `runtime: "venv"`).
The EthOS core calls it on 127.0.0.1:<python.port> and never imports yt-dlp
itself, which keeps the ~17 MB extractor out of the core environment.

Endpoints
    GET  /health                     {"ok", "version", "ffmpeg"}
    POST /search  {query, limit}     {"items": [{id, title, artist, duration, thumbnail}]}
    POST /resolve {video_id, fmt}    {id, title, artist, duration, thumbnail, url, ext}
    POST /download {video_id, dest_dir, stem}   {"path": "<absolute path>"}

All endpoints are loopback-only: the server binds 127.0.0.1 and runs as the
`ethos-nas` service user, the same identity as the core.
"""

import json
import os
import shutil
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOOL_VERSION = "1.0.0"
PORT = int(os.environ.get("ETHOS_PACKAGE_PORT", "8096"))
MAX_BODY = 64 * 1024

# YouTube rotates which player clients are allowed per video/IP: some videos
# refuse the default client while serving the same request from another one
# (yt-dlp issue #11528). yt-dlp tries the list in order and falls back.
PLAYER_CLIENTS = ["default", "android"]
AUDIO_EXTS = {".m4a", ".mp3", ".opus", ".webm", ".ogg", ".aac"}

import yt_dlp  # noqa: E402  (imported after the env is read; package venv only)


def _ydl(opts: dict):
    return yt_dlp.YoutubeDL(opts)


def search(query: str, limit: int) -> list[dict]:
    """Flat search — cheap (no per-video extraction)."""
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "extract_flat": "in_playlist",
        "noplaylist": False,
    }
    with _ydl(opts) as ydl:
        info = ydl.extract_info(f"ytsearch{limit}:{query}", download=False)
    items = []
    for entry in info.get("entries") or []:
        if not entry:
            continue
        video_id = entry.get("id") or ""
        if not video_id:
            continue
        items.append({
            "id": video_id,
            "title": (entry.get("title") or "Bez tytułu").strip(),
            "artist": (entry.get("uploader") or entry.get("channel") or "").strip()
            or "Nieznany artysta",
            "duration": int(entry.get("duration") or 0),
            "thumbnail": entry.get("thumbnail") or f"https://i.ytimg.com/vi/{video_id}/mqdefault.jpg",
        })
    return items


def resolve(video_id: str, fmt: str) -> dict:
    """Metadata + a direct (IP-bound) stream URL for one video."""
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "format": fmt or "bestaudio/best",
        "extractor_args": {"youtube": {"player_client": PLAYER_CLIENTS}},
    }
    with _ydl(opts) as ydl:
        info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
    return {
        "id": info.get("id") or video_id,
        "title": (info.get("title") or "").strip(),
        "artist": (info.get("uploader") or info.get("channel") or "").strip(),
        "duration": int(info.get("duration") or 0),
        "thumbnail": info.get("thumbnail") or f"https://i.ytimg.com/vi/{video_id}/mqdefault.jpg",
        "url": info.get("url") or "",
        "ext": info.get("ext") or "",
    }


def download(video_id: str, dest_dir: str, stem: str) -> dict:
    """Download bestaudio into ``dest_dir`` and return the produced file."""
    target = os.path.abspath(dest_dir)
    if not os.path.isdir(target):
        raise ValueError(f"dest_dir is not a directory: {target}")
    clean_stem = os.path.basename(stem or video_id).strip() or video_id

    opts = {
        "quiet": True,
        "no_warnings": True,
        "format": "bestaudio/best",
        "outtmpl": os.path.join(target, f"{clean_stem}.%(ext)s"),
        "noplaylist": True,
        # The download must use a client YouTube actually serves this video to.
        "extractor_args": {"youtube": {"player_client": PLAYER_CLIENTS}},
    }
    if shutil.which("ffmpeg"):
        opts["postprocessors"] = [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "m4a",
            "preferredquality": "192",
        }]

    with _ydl(opts) as ydl:
        ydl.download([f"https://www.youtube.com/watch?v={video_id}"])

    # Exact prefix match on purpose — glob() would treat [ ] * ? in titles as
    # wildcards and miss files like "… [Lyrics Video 4k] …".
    prefix = clean_stem + "."
    candidates = sorted(
        (
            os.path.join(target, name) for name in os.listdir(target)
            if name.startswith(prefix) and os.path.splitext(name)[1].lower() in AUDIO_EXTS
        ),
        key=lambda path: os.path.getmtime(path),
        reverse=True,
    )
    if not candidates:
        raise RuntimeError("download finished but no audio file was produced")
    return {"path": candidates[0]}


class Handler(BaseHTTPRequestHandler):
    server_version = f"EthosMusicEngine/{TOOL_VERSION}"

    def _reply(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802 — BaseHTTPRequestHandler API
        if self.path.split("?", 1)[0] != "/health":
            self._reply(404, {"error": "not found"})
            return
        self._reply(200, {
            "ok": True,
            "version": getattr(yt_dlp.version, "__version__", ""),
            "ffmpeg": bool(shutil.which("ffmpeg")),
        })

    def do_POST(self) -> None:  # noqa: N802 — BaseHTTPRequestHandler API
        route = self.path.split("?", 1)[0]
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            self._reply(400, {"error": "invalid body size"})
            return
        try:
            payload = json.loads(self.rfile.read(length).decode())
        except (UnicodeDecodeError, ValueError):
            self._reply(400, {"error": "invalid JSON"})
            return
        try:
            if route == "/search":
                query = str(payload.get("query") or "").strip()
                if not query:
                    raise ValueError("query is required")
                limit = max(1, min(int(payload.get("limit") or 10), 100))
                self._reply(200, {"items": search(query, limit)})
            elif route == "/resolve":
                video_id = str(payload.get("video_id") or "").strip()
                if not video_id:
                    raise ValueError("video_id is required")
                self._reply(200, resolve(video_id, str(payload.get("fmt") or "")))
            elif route == "/download":
                video_id = str(payload.get("video_id") or "").strip()
                if not video_id:
                    raise ValueError("video_id is required")
                result = download(
                    video_id,
                    str(payload.get("dest_dir") or ""),
                    str(payload.get("stem") or ""),
                )
                self._reply(200, result)
            else:
                self._reply(404, {"error": "not found"})
        except Exception as exc:  # noqa: BLE001 — report every engine failure to the core
            print(f"{route} failed: {exc}", file=sys.stderr, flush=True)
            self._reply(500, {"error": str(exc)[:300]})

    def log_message(self, fmt: str, *args) -> None:
        # stdout/stderr is captured by the EthOS package supervisor into the
        # unified log as `pkg:ethos-music-engine`.
        print(f"{self.address_string()} {fmt % args}", file=sys.stderr, flush=True)


def main() -> int:
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    server.daemon_threads = True
    print(f"music engine listening on 127.0.0.1:{PORT} (yt-dlp "
          f"{getattr(yt_dlp.version, '__version__', '?')})", file=sys.stderr, flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
