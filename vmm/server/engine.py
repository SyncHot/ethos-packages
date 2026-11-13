"""VM registry, storage layout and lifecycle.

The engine is the only writer of /data/vms.json. Every mutating call takes the
registry lock, validates paths against /vmhost (the read-write NAS roots mounted
by the compose file) and never passes user input to a shell.
"""

import json
import os
import secrets
import shutil
import subprocess
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import qemu
import store
from qmp import QMP, QMPError

DATA = Path(os.environ.get("VMM_DATA", "/data"))
VMS_FILE = DATA / "vms.json"
RUN_DIR = DATA / "run"
VMHOST = Path(os.environ.get("VMM_HOST_ROOT", "/vmhost"))
HOST_ROOTS = tuple(VMHOST / name for name in ("home", "mnt", "media"))
IMAGE_SUFFIXES = (".iso", ".img", ".qcow2", ".vmdk", ".vhd", ".vhdx", ".vdi")
MAX_NAME = 60
MAX_DISK_GB = 4096
MAX_MEMORY_MB = 65536


class EngineError(Exception):
    def __init__(self, detail: str, status: int = 400) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status = status


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def host_memory_mb() -> int:
    try:
        for line in Path("/proc/meminfo").read_text(encoding="utf-8").splitlines():
            if line.startswith("MemTotal:"):
                return int(line.split()[1]) // 1024
    except (OSError, ValueError, IndexError):
        pass
    return 0


def safe_path(raw: str, *, must_exist: bool = True) -> Path:
    """Resolve a client path and refuse anything outside the mounted NAS roots."""
    text = str(raw or "").strip()
    if not text.startswith("/"):
        raise EngineError("Path must be absolute", 400)
    resolved = Path(os.path.realpath(text))
    for root in HOST_ROOTS:
        real_root = Path(os.path.realpath(root))
        if resolved == real_root or real_root in resolved.parents:
            if must_exist and not resolved.exists():
                raise EngineError(f"Path not found: {text}", 404)
            return resolved
    raise EngineError("Path must be inside /vmhost/{home,mnt,media}", 403)


def _mac() -> str:
    return "52:54:00:" + ":".join(f"{secrets.randbelow(256):02x}" for _ in range(3))


def _next_vnc(used: set[int]) -> int:
    for port in range(qemu.VNC_BASE, qemu.VNC_MAX):
        if port not in used:
            return port
    raise EngineError("No free console port", 409)


class Engine:
    def __init__(self) -> None:
        self.lock = threading.RLock()
        RUN_DIR.mkdir(parents=True, exist_ok=True)

    # ── registry ─────────────────────────────────────────────────────────────
    def _load(self) -> list[dict]:
        return store.load_vms(VMS_FILE)

    def _save(self, vms: list[dict]) -> None:
        store.save_vms(VMS_FILE, vms)

    def _find(self, vms: list[dict], vm_id: str) -> dict:
        for vm in vms:
            if vm.get("id") == vm_id:
                return vm
        raise EngineError(f"VM {vm_id!r} not found", 404)

    def runtime(self, vm: dict) -> dict:
        vm_id = vm["id"]
        return {
            "qmp": str(RUN_DIR / f"{vm_id}.qmp"),
            "pid": str(RUN_DIR / f"{vm_id}.pid"),
            "vnc_port": int((vm.get("config") or {}).get("display", {}).get("port")
                            or qemu.VNC_BASE),
        }

    def status(self, vm: dict) -> str:
        return QMP(self.runtime(vm)["qmp"], timeout=3.0).status()

    def describe(self, vm: dict) -> dict:
        runtime = self.runtime(vm)
        status = self.status(vm)
        config = vm.get("config") or {}
        return {
            "id": vm["id"],
            "name": vm.get("name") or vm["id"],
            "status": status,
            "autostart": bool(vm.get("autostart", True)),
            "created_at": vm.get("created_at"),
            "vcpu": config.get("vcpu"),
            "memory_mb": config.get("memory_mb"),
            "firmware": config.get("firmware") or "bios",
            "disks": config.get("disks") or [],
            "media": config.get("media") or [],
            "mac": (config.get("nics") or [{}])[0].get("mac", ""),
            "vnc_port": runtime["vnc_port"],
            "accel": qemu.accelerator(),
        }

    def list_vms(self) -> list[dict]:
        with self.lock:
            return [self.describe(vm) for vm in self._load()]

    def get(self, vm_id: str) -> dict:
        with self.lock:
            return self.describe(self._find(self._load(), vm_id))

    # ── create / delete ──────────────────────────────────────────────────────
    def create(self, payload: dict) -> dict:
        name = str(payload.get("name") or "").strip()[:MAX_NAME]
        if not name:
            raise EngineError("Name is required", 400)
        cores = os.cpu_count() or 1
        try:
            vcpu = int(payload.get("vcpu") or 1)
            memory_mb = int(payload.get("memory_mb") or 2048)
            disk_gb = int(payload.get("disk_gb") or 32)
        except (TypeError, ValueError) as exc:
            raise EngineError("vcpu, memory_mb and disk_gb must be numbers", 400) from exc
        if not 1 <= vcpu <= min(qemu.MAX_VCPU, cores):
            raise EngineError(f"vcpu must be between 1 and {min(qemu.MAX_VCPU, cores)}", 400)
        if not qemu.MIN_MEMORY_MB <= memory_mb <= MAX_MEMORY_MB:
            raise EngineError(f"memory_mb must be between {qemu.MIN_MEMORY_MB} and {MAX_MEMORY_MB}", 400)
        if not 1 <= disk_gb <= MAX_DISK_GB:
            raise EngineError(f"disk_gb must be between 1 and {MAX_DISK_GB}", 400)

        with self.lock:
            vms = self._load()
            if len(vms) >= store.MAX_VMS:
                raise EngineError(f"At most {store.MAX_VMS} VMs are supported", 409)
            root = safe_path(payload.get("root") or str(HOST_ROOTS[1]))
            firmware = "uefi" if str(payload.get("firmware") or "").lower() == "uefi" else "bios"
            iso_raw = str(payload.get("iso") or "").strip()
            media = []
            if iso_raw:
                iso = safe_path(iso_raw)
                if iso.suffix.lower() not in IMAGE_SUFFIXES:
                    raise EngineError("ISO must be an .iso image", 400)
                media.append({"path": str(iso), "bus": "sata"})

            vm_id = "vm-" + secrets.token_hex(3)
            directory = root / "ethos-vm" / vm_id
            disk_path = directory / "disk0.qcow2"
            try:
                qemu.create_disk(disk_path, disk_gb)
            except (OSError, RuntimeError, subprocess.SubprocessError) as exc:
                raise EngineError(f"Could not create the disk: {exc}", 500) from exc

            used = {self.runtime(vm)["vnc_port"] for vm in vms}
            record = {
                "id": vm_id,
                "name": name,
                "autostart": payload.get("autostart", True) is not False,
                "created_at": _now(),
                "updated_at": _now(),
                "config": {
                    "vcpu": vcpu,
                    "memory_mb": memory_mb,
                    "machine": "q35",
                    "firmware": firmware,
                    "disks": [{
                        "id": "disk0", "path": str(disk_path), "format": "qcow2",
                        "bus": "virtio", "size_gb": disk_gb,
                    }],
                    "media": media,
                    "nics": [{"model": "virtio", "mac": _mac(), "forwards": []}],
                    "display": {"type": "vnc", "port": _next_vnc(used)},
                    "boot_order": ["disk", "cdrom"],
                },
            }
            vms.append(record)
            self._save(vms)
            return self.describe(record)

    def delete(self, vm_id: str, *, keep_disks: bool = False) -> None:
        with self.lock:
            vms = self._load()
            vm = self._find(vms, vm_id)
            try:
                self._quit(vm)
            except EngineError:
                pass  # already stopped: deleting a dead VM must still work
            for disk in (vm.get("config") or {}).get("disks") or []:
                directory = Path(disk["path"]).parent
                if not keep_disks:
                    shutil.rmtree(directory, ignore_errors=True)
                break  # every disk lives in the same per-VM directory
            for suffix in (".qmp", ".pid"):
                try:
                    (RUN_DIR / f"{vm_id}{suffix}").unlink()
                except OSError:
                    pass  # runtime files disappear with the VM
            vms = [item for item in vms if item.get("id") != vm_id]
            self._save(vms)

    # ── lifecycle ────────────────────────────────────────────────────────────
    def _quit(self, vm: dict) -> None:
        runtime = self.runtime(vm)
        client = QMP(runtime["qmp"], timeout=5.0)
        try:
            client.execute("quit")
        except QMPError as exc:
            raise EngineError(f"Could not stop the VM: {exc}", 409) from exc
        deadline = time.time() + 15
        while time.time() < deadline and client.status() != "stopped":
            time.sleep(0.4)

    def start(self, vm: dict) -> str:
        runtime = self.runtime(vm)
        if self.status(vm) != "stopped":
            raise EngineError("VM is already running", 409)
        disk = (vm.get("config") or {}).get("disks", [{}])[0]
        if not Path(str(disk.get("path") or "")).is_file():
            raise EngineError("The VM disk is missing; recreate the VM", 409)
        if not shutil.which("qemu-system-x86_64"):
            raise EngineError("The engine is still provisioning QEMU", 503)
        for suffix in (".qmp", ".pid"):
            try:
                (RUN_DIR / f"{vm['id']}{suffix}").unlink()
            except OSError:
                pass  # no stale runtime file, nothing to clean
        argv = qemu.build_argv(
            vm, accel=qemu.accelerator(), qmp_path=runtime["qmp"],
            pid_path=runtime["pid"], vnc_port=runtime["vnc_port"],
        )
        try:
            result = subprocess.run(argv, capture_output=True, text=True, timeout=60, check=False)
        except (OSError, subprocess.SubprocessError) as exc:
            raise EngineError(f"Could not start QEMU: {exc}", 500) from exc
        if result.returncode != 0:
            detail = (result.stderr or result.stdout or "qemu failed").strip().splitlines()
            raise EngineError(f"QEMU refused to start: {detail[-1][:300] if detail else 'unknown'}", 500)
        deadline = time.time() + 15
        status = "stopped"
        while time.time() < deadline:
            status = self.status(vm)
            if status == "running":
                break
            time.sleep(0.3)
        if status != "running":
            raise EngineError("QEMU started but never reported running; check the VM settings", 500)
        return status

    def action(self, vm_id: str, action: str) -> dict:
        with self.lock:
            vms = self._load()
            vm = self._find(vms, vm_id)
            if action == "start":
                status = self.start(vm)
            elif action in ("shutdown", "stop", "pause", "resume", "reset"):
                status = self._control(vm, action)
            else:
                raise EngineError(f"Unknown action: {action}", 400)
            vm["updated_at"] = _now()
            self._save(vms)
            return {**self.describe(vm), "status": status}

    def _control(self, vm: dict, action: str) -> str:
        commands = {
            "shutdown": ("system_powerdown", "VM is not running"),
            "stop": ("quit", "VM is not running"),
            "pause": ("stop", "VM is not running"),
            "resume": ("cont", "VM is not paused"),
            "reset": ("system_reset", "VM is not running"),
        }
        command, empty_message = commands[action]
        current = self.status(vm)
        if current == "stopped":
            raise EngineError(empty_message, 409)
        try:
            QMP(self.runtime(vm)["qmp"], timeout=10.0).execute(command)
        except QMPError as exc:
            raise EngineError(f"QEMU rejected {command}: {exc}", 409) from exc
        if action == "stop":
            deadline = time.time() + 15
            while time.time() < deadline and self.status(vm) != "stopped":
                time.sleep(0.3)
        elif action == "pause":
            time.sleep(0.3)
            return self.status(vm)
        elif action == "resume":
            time.sleep(0.3)
            return self.status(vm)
        return self.status(vm)

    def recover(self) -> None:
        """Start the VMs marked autostart; the container restarted under us."""
        with self.lock:
            for vm in self._load():
                if not vm.get("autostart", True) or self.status(vm) != "stopped":
                    continue
                try:
                    self.start(vm)
                except EngineError as exc:
                    print(f"autostart failed for {vm.get('id')}: {exc.detail}", flush=True)

    # ── storage ──────────────────────────────────────────────────────────────
    def list_dir(self, raw_path: str) -> dict:
        path = safe_path(raw_path)
        if not path.is_dir():
            raise EngineError("Not a directory", 400)
        entries = []
        try:
            for item in sorted(path.iterdir(), key=lambda p: p.name.lower()):
                if item.name.startswith("."):
                    continue
                try:
                    is_dir = item.is_dir()
                except OSError:
                    continue
                if not is_dir and item.suffix.lower() not in IMAGE_SUFFIXES:
                    continue
                entries.append({
                    "name": item.name,
                    "path": str(item),
                    "dir": is_dir,
                    "size": 0 if is_dir else item.stat().st_size,
                })
                if len(entries) >= 200:
                    break
        except OSError as exc:
            raise EngineError(f"Could not read the directory: {exc}", 500) from exc
        return {"path": str(path), "entries": entries, "roots": [str(r) for r in HOST_ROOTS]}

    # ── host ─────────────────────────────────────────────────────────────────
    def host(self) -> dict:
        usage = shutil.disk_usage(VMHOST if VMHOST.exists() else Path("/"))
        return {
            "kvm": qemu.kvm_available(),
            "accel": qemu.accelerator(),
            "cores": os.cpu_count() or 0,
            "memory_mb": host_memory_mb(),
            "disk_free_gb": round(usage.free / (1024 ** 3), 1),
            "qemu": qemu.qemu_version(),
            "roots": [str(root) for root in HOST_ROOTS if root.exists()],
            "max_vms": store.MAX_VMS,
            "vm_count": len(self._load()),
        }
