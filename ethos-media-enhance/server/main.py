#!/usr/bin/env python3
"""EthOS Media Enhancements — face-aware thumbnails.

Runs inside the package's private virtualenv (manifest `runtime: "venv"`).
The core sends one extracted frame as raw image bytes and gets back the largest
face box in original pixel coordinates; it then crops with Pillow. When this
package is not installed the core falls back to the first valid frame, so the
NAS keeps working without OpenCV.

Endpoints
    GET  /health           {"ok", "opencv"}
    POST /face  <bytes>    {"face": [x, y, w, h]} or {"face": null}
"""

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOOL_VERSION = "1.0.0"
PORT = int(os.environ.get("ETHOS_PACKAGE_PORT", "8097"))
MAX_BODY = 16 * 1024 * 1024
# Detection runs on a downscaled copy: same constant the core used in-process.
SCALE_TARGET = 480.0

import cv2  # noqa: E402  (package venv only)
import numpy as np  # noqa: E402

_CASCADE = cv2.CascadeClassifier(
    os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml")
)


def detect_face(data: bytes):
    """Largest face in the image, in original pixel coordinates."""
    if _CASCADE.empty():
        raise RuntimeError("Haar cascade is unavailable in this OpenCV build")
    image = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        return None
    height, width = image.shape[:2]
    if not height or not width:
        return None
    scale = SCALE_TARGET / max(height, width)
    small = cv2.resize(
        image, (max(1, int(width * scale)), max(1, int(height * scale))),
        interpolation=cv2.INTER_AREA,
    )
    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    faces = _CASCADE.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(40, 40))
    if len(faces) == 0:
        return None
    boxes = [(int(x), int(y), int(w), int(h)) for x, y, w, h in faces]
    fx, fy, fw, fh = max(boxes, key=lambda box: box[2] * box[3])
    inverse = 1.0 / scale
    return [int(fx * inverse), int(fy * inverse), int(fw * inverse), int(fh * inverse)]


class Handler(BaseHTTPRequestHandler):
    server_version = f"EthosMediaEnhance/{TOOL_VERSION}"

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
        self._reply(200, {"ok": True, "opencv": cv2.__version__})

    def do_POST(self) -> None:  # noqa: N802 — BaseHTTPRequestHandler API
        if self.path.split("?", 1)[0] != "/face":
            self._reply(404, {"error": "not found"})
            return
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            self._reply(400, {"error": "invalid body size"})
            return
        data = self.rfile.read(length)
        try:
            self._reply(200, {"face": detect_face(data)})
        except Exception as exc:  # noqa: BLE001 — report every failure to the core
            print(f"/face failed: {exc}", file=sys.stderr, flush=True)
            self._reply(500, {"error": str(exc)[:300]})

    def log_message(self, fmt: str, *args) -> None:
        print(f"{self.address_string()} {fmt % args}", file=sys.stderr, flush=True)


def main() -> int:
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    server.daemon_threads = True
    print(f"media enhance listening on 127.0.0.1:{PORT} (opencv {cv2.__version__})",
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
