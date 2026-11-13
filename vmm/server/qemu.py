"""QEMU argv construction and image helpers.

`build_argv` is a pure function so the command line can be unit-tested without
QEMU, KVM or Docker. Everything here is an argument list; nothing is ever
interpolated into a shell.
"""

import os
import shutil
import subprocess
from pathlib import Path

KVM_DEVICE = Path("/dev/kvm")
UEFI_CODE = Path("/usr/share/OVMF/OVMF_CODE.fd")
MAX_VCPU = 16
MIN_MEMORY_MB = 128
DISK_FORMATS = ("qcow2", "raw", "vmdk", "vhdx", "vdi", "img")

# VNC listens on loopback inside the container; the browser reaches it through
# the ticket-gated WebSocket bridge in console.py. QEMU maps `:N` to 5900+N.
VNC_BASE = 5901
VNC_MAX = 5999
VNC_HOST = "127.0.0.1"


def kvm_available() -> bool:
    """True only when the device exists *and* this process may use it."""
    try:
        return KVM_DEVICE.exists() and os.access(KVM_DEVICE, os.R_OK | os.W_OK)
    except OSError:
        return False


def accelerator() -> str:
    return "kvm" if kvm_available() else "tcg"


def qemu_version() -> str:
    binary = shutil.which("qemu-system-x86_64")
    if not binary:
        return ""
    try:
        result = subprocess.run([binary, "--version"], capture_output=True,
                                text=True, timeout=10, check=False)
    except (OSError, subprocess.SubprocessError):
        return ""
    first = (result.stdout or "").splitlines()[0] if result.stdout else ""
    return first[:120]


def build_argv(vm: dict, *, accel: str, qmp_path: str, pid_path: str,
               vnc_port: int) -> list[str]:
    """Return the full `qemu-system-x86_64` argument list for one VM."""
    config = vm.get("config") or {}
    name = str(vm.get("name") or vm.get("id") or "vm")[:60]
    memory = max(MIN_MEMORY_MB, int(config.get("memory_mb") or 1024))
    vcpu = max(1, min(MAX_VCPU, int(config.get("vcpu") or 1)))
    media = config.get("media") or []
    boot = "dc" if media else "c"

    argv = [
        shutil.which("qemu-system-x86_64") or "qemu-system-x86_64",
        "-name", name,
        "-machine", f"q35,accel={accel}",
        "-cpu", "host" if accel == "kvm" else "max",
        "-smp", str(vcpu),
        "-m", str(memory),
        "-boot", f"order={boot}",
        "-vnc", f"{VNC_HOST}:{vnc_port - 5900}",
        "-display", "none",
        "-qmp", f"unix:{qmp_path},server=on,wait=off",
        "-pidfile", pid_path,
    ]
    if config.get("firmware") == "uefi" and UEFI_CODE.exists():
        argv += ["-drive", f"if=pflash,format=raw,readonly=on,file={UEFI_CODE}"]
    for disk in config.get("disks") or []:
        argv += ["-drive", f"file={disk['path']},if=virtio,format=qcow2,cache=writeback,discard=unmap"]
    for item in media:
        argv += ["-drive", f"file={item['path']},media=cdrom,readonly=on"]
    for index, nic in enumerate(config.get("nics") or []):
        argv += [
            "-netdev", f"user,id=net{index}",
            "-device", f"virtio-net-pci,netdev=net{index},mac={nic['mac']}",
        ]
    # Daemonize so the VM survives an engine restart inside the container; the
    # QMP socket stays the only control channel.
    argv += ["-daemonize"]
    return argv


def create_disk(path: Path, size_gb: int) -> None:
    """Create a sparse qcow2 disk; fails loudly instead of booting a broken VM."""
    path.parent.mkdir(parents=True, exist_ok=True)
    binary = shutil.which("qemu-img")
    if not binary:
        raise RuntimeError("qemu-img is missing — the engine is still provisioning")
    result = subprocess.run(
        [binary, "create", "-f", "qcow2", str(path), f"{max(1, int(size_gb))}G"],
        capture_output=True, text=True, timeout=120, check=False,
    )
    if result.returncode != 0:
        raise RuntimeError((result.stderr or "qemu-img create failed").strip()[:300])


def image_info(path: Path) -> dict:
    """Return {format, virtual_size} for a disk image, or {} when unreadable."""
    binary = shutil.which("qemu-img")
    if not binary or not path.is_file():
        return {}
    result = subprocess.run(
        [binary, "info", "--output=json", str(path)],
        capture_output=True, text=True, timeout=60, check=False,
    )
    if result.returncode != 0:
        return {}
    import json

    try:
        payload = json.loads(result.stdout or "{}")
    except ValueError:
        return {}
    return {
        "format": payload.get("format") or "",
        "virtual_size": int(payload.get("virtual-size") or 0),
    }
