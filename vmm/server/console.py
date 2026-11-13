"""WebSocket <-> VNC bridge.

EthOS proxies only GET/POST, so the browser cannot reach QEMU's VNC port
directly. The engine terminates the WebSocket itself and forwards raw bytes to
`127.0.0.1:<vnc_port>`; the socket stays on loopback and every connection needs
a signed, short-lived ticket (see app.py).
"""

import base64
import hashlib
import socket
import struct
import threading

GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
MAX_FRAME = 4 * 1024 * 1024

OP_CONT, OP_TEXT, OP_BINARY, OP_CLOSE, OP_PING, OP_PONG = 0x0, 0x1, 0x2, 0x8, 0x9, 0xA


class WSClosed(Exception):
    """The peer closed the socket or sent a malformed frame."""


def accept_key(client_key: str) -> str:
    digest = hashlib.sha1((client_key + GUID).encode("ascii")).digest()
    return base64.b64encode(digest).decode("ascii")


def read_frame(reader) -> tuple[int, bytes]:
    header = reader.read(2)
    if len(header) < 2:
        raise WSClosed("connection closed")
    first, second = header[0], header[1]
    opcode = first & 0x0F
    masked = bool(second & 0x80)
    length = second & 0x7F
    if length == 126:
        length = struct.unpack("!H", _read_exact(reader, 2))[0]
    elif length == 127:
        length = struct.unpack("!Q", _read_exact(reader, 8))[0]
    if length > MAX_FRAME:
        raise WSClosed("frame too large")
    mask = _read_exact(reader, 4) if masked else b""
    payload = _read_exact(reader, length) if length else b""
    if mask:
        payload = bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload))
    return opcode, payload


def frame(opcode: int, payload: bytes) -> bytes:
    length = len(payload)
    head = bytearray([0x80 | opcode])
    if length < 126:
        head.append(length)
    elif length < 65536:
        head.append(126)
        head += struct.pack("!H", length)
    else:
        head.append(127)
        head += struct.pack("!Q", length)
    return bytes(head) + payload


def _read_exact(reader, count: int) -> bytes:
    if count == 0:
        return b""
    data = reader.read(count)
    if data is None or len(data) < count:
        raise WSClosed("truncated frame")
    return data


def bridge(reader, writer, write_lock: threading.Lock, vnc_port: int) -> None:
    """Proxy one WebSocket connection to QEMU's VNC port until either side ends."""
    try:
        vnc = socket.create_connection(("127.0.0.1", vnc_port), timeout=10)
    except OSError as exc:
        _send(writer, write_lock, frame(OP_CLOSE, b"\x03\xe9" + str(exc).encode()[:120]))
        return
    vnc.settimeout(None)
    stop = threading.Event()

    def pump_vnc() -> None:
        try:
            while not stop.is_set():
                chunk = vnc.recv(65536)
                if not chunk:
                    break
                _send(writer, write_lock, frame(OP_BINARY, chunk))
        except OSError:
            pass
        finally:
            stop.set()
            try:
                vnc.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass

    pump = threading.Thread(target=pump_vnc, daemon=True)
    pump.start()

    buffered = b""
    try:
        while not stop.is_set():
            opcode, payload = read_frame(reader)
            if opcode == OP_CLOSE:
                break
            if opcode == OP_PING:
                _send(writer, write_lock, frame(OP_PONG, payload))
                continue
            if opcode == OP_PONG:
                continue
            if opcode in (OP_TEXT, OP_BINARY, OP_CONT):
                buffered += payload
                if buffered:
                    vnc.sendall(buffered)
                    buffered = b""
    except (WSClosed, OSError):
        pass
    finally:
        stop.set()
        try:
            vnc.close()
        except OSError:
            pass
        try:
            _send(writer, write_lock, frame(OP_CLOSE, b"\x03\xe8"))
        except OSError:
            pass


def _send(writer, write_lock: threading.Lock, payload: bytes) -> None:
    with write_lock:
        writer.write(payload)
        writer.flush()
