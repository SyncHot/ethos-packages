"""Atomic JSON stores for the EthOS VM Manager engine.

The package keeps its own state under /data; EthOS core stores are not reachable
from inside the container. Writes go through a temp file in the same directory
so a crash can never leave a half-written vms.json behind.
"""

import json
import os
import tempfile
import time
from pathlib import Path
from typing import Any

MAX_VMS = 32


def read(path: Path, default: Any) -> Any:
    """Load JSON, keeping a corrupt file for inspection instead of losing it."""
    try:
        with open(path, encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError:
        return default
    except (OSError, ValueError):
        stamp = int(time.time())
        try:
            os.replace(path, f"{path}.corrupt-{stamp}")
        except OSError:
            pass  # nothing else we can do; the caller falls back to the default
        return default


def write(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    handle = tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, prefix=f".{path.name}.", delete=False,
    )
    try:
        with handle:
            json.dump(payload, handle, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(handle.name, path)
    except OSError:
        try:
            os.unlink(handle.name)
        except OSError:
            pass  # the temp file may already be gone
        raise


def load_vms(path: Path) -> list[dict]:
    payload = read(path, {"schema": 1, "vms": []})
    vms = payload.get("vms") if isinstance(payload, dict) else None
    if not isinstance(vms, list):
        return []
    return [vm for vm in vms if isinstance(vm, dict) and vm.get("id")][:MAX_VMS]


def save_vms(path: Path, vms: list[dict]) -> None:
    write(path, {"schema": 1, "vms": vms[:MAX_VMS]})
