"""Minimal QEMU Machine Protocol client.

QEMU exposes one unix socket per VM. Every call opens a connection, negotiates
`qmp_capabilities` and reads until the response with our id arrives; events are
skipped. Connections are cheap and this keeps the engine free of stuck sockets.
"""

import json
import socket
from pathlib import Path
from typing import Any


class QMPError(RuntimeError):
    """QMP refused the command or the socket is gone."""


class QMP:
    def __init__(self, path: str | Path, timeout: float = 5.0) -> None:
        self.path = str(path)
        self.timeout = timeout
        self._counter = 0

    def _open(self) -> socket.socket:
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.settimeout(self.timeout)
        sock.connect(self.path)
        return sock

    @staticmethod
    def _read_message(handle) -> dict:
        while True:
            line = handle.readline()
            if not line:
                raise QMPError("QEMU closed the QMP connection")
            text = line.decode("utf-8", "replace").strip()
            if text:
                return json.loads(text)

    def execute(self, command: str, **arguments: Any) -> dict:
        try:
            sock = self._open()
        except OSError as exc:
            raise QMPError(f"QMP socket unavailable: {exc}") from exc
        try:
            with sock, sock.makefile("rwb") as handle:
                self._read_message(handle)  # greeting
                self._send(handle, {"execute": "qmp_capabilities"})
                self._read_message(handle)  # capabilities ack, not our result
                self._counter += 1
                payload: dict[str, Any] = {"execute": command}
                if arguments:
                    payload["arguments"] = arguments
                self._send(handle, payload)
                while True:
                    message = self._read_message(handle)
                    if message.get("event"):
                        continue
                    if "error" in message:
                        raise QMPError(str(message["error"].get("desc") or "QMP error"))
                    return message.get("return") or {}
        except (OSError, ValueError) as exc:
            raise QMPError(str(exc)) from exc

    @staticmethod
    def _send(handle, payload: dict) -> None:
        handle.write((json.dumps(payload) + "\r\n").encode("utf-8"))
        handle.flush()

    def status(self) -> str:
        """Return running/paused, or 'stopped' when the socket is gone."""
        try:
            result = self.execute("query-status")
        except QMPError:
            return "stopped"
        state = str(result.get("status") or "").lower()
        return "stopped" if state in ("", "shutdown", "finished") else state
