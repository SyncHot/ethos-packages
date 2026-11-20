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

# Guest port forwards. QEMU user networking puts the guest behind SLIRP, so
# nothing on the NAS can reach the guest's web UI without `hostfwd`. The host
# side is a *container* port taken from this range, and docker-compose publishes
# exactly the same range 1:1 — the engine never talks to the Docker daemon to
# open a port, and the range sits below the ephemeral range (32768+) so Docker's
# own dynamic mappings cannot steal one.
FORWARD_HOST_RANGE = (18190, 18194)
MAX_FORWARDS_PER_VM = 3


def forward_hosts_available(used: set[int]) -> list[int]:
    """Free host ports from FORWARD_HOST_RANGE, in order."""
    first, last = FORWARD_HOST_RANGE
    return [port for port in range(first, last + 1) if port not in used]


def forwards_of(config: dict) -> list[dict]:
    """Port forwards declared on the first NIC (always a list of dicts)."""
    nics = config.get("nics") or []
    if not nics:
        return []
    return [dict(item) for item in (nics[0].get("forwards") or [])]


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
        options = f"user,id=net{index}"
        # Guest port forwards ("open http://nas:18190" for the guest's :9000).
        # QEMU user networking has no other way in: the guest sits behind SLIRP
        # and nothing on the host can reach it without hostfwd. The host side is
        # a container port from FORWARD_HOST_RANGE, which docker-compose
        # publishes 1:1, so the engine never needs to touch the daemon.
        if index == 0:
            for forward in nic.get("forwards") or []:
                options += f",hostfwd=tcp:0.0.0.0:{int(forward['host'])}-:{int(forward['guest'])}"
        argv += [
            "-netdev", options,
            "-device", f"virtio-net-pci,netdev=net{index},mac={nic['mac']}",
        ]
    # Daemonize so the VM survives an engine restart inside the container; the
    # QMP socket stays the only control channel.
    argv += ["-daemonize"]
    return argv


# An installer is attached as a CD-ROM; a *system image* becomes the disk.
# The EthOS OS release ships `ethos-os-<ver>-<arch>-<variant>.img.xz`, which is a
# preinstalled raw disk, not an ISO — booting it as CD-ROM can never work.
SYSTEM_IMAGE_SUFFIXES = (".img", ".img.xz", ".img.gz", ".qcow2", ".raw")


def image_kind(name: str) -> str:
    """Classify a picked file: "iso", "disk", or "" when it is neither."""
    lowered = name.lower()
    if lowered.endswith(".iso"):
        return "iso"
    if any(lowered.endswith(suffix) for suffix in SYSTEM_IMAGE_SUFFIXES):
        return "disk"
    return ""


def convert_argv(source: Path, destination: Path) -> list[str]:
    """`qemu-img convert` argv for a raw system image (pure, for tests)."""
    return ["qemu-img", "convert", "-f", "raw", "-O", "qcow2",
            str(source), str(destination)]


def _decompress(source: Path, target: Path) -> None:
    """Stream an .xz/.gz image to `target` with the standard library.

    The engine image does not ship the xz binary, and adding a build dependency
    for one file format is not worth it — lzma and gzip are part of Python.
    """
    import gzip
    import lzma

    opener = lzma.open if source.name.lower().endswith(".xz") else gzip.open
    with opener(source, "rb") as stream, target.open("wb") as out:
        shutil.copyfileobj(stream, out, length=1024 * 1024)


def import_disk(source: Path, destination: Path) -> None:
    """Make `destination` a qcow2 copy of a bootable image.

    Compressed images (`.img.xz`, `.img.gz`) are decompressed next to the target
    first: qemu-img cannot read a compressed stream, and a temp copy in the same
    directory means the disk never crosses filesystems. Free space is checked up
    front so a 8 GiB image fails with a clear message instead of filling the
    share.
    """
    destination.parent.mkdir(parents=True, exist_ok=True)
    compressed = source.name.lower().endswith((".xz", ".gz"))
    if not compressed:
        _convert(source, destination)
        return

    free = shutil.disk_usage(destination.parent).free
    estimate = max(source.stat().st_size * 3, 8 * 1024 ** 3)
    if free < estimate:
        raise RuntimeError(
            f"not enough free space for the image: {free // 2 ** 30} GiB free, "
            f"about {estimate // 2 ** 30} GiB needed")
    temporary = destination.with_name(destination.name + ".raw.tmp")
    try:
        _decompress(source, temporary)
        _convert(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)


def _convert(source: Path, destination: Path) -> None:
    binary = shutil.which("qemu-img")
    if not binary:
        raise RuntimeError("qemu-img is missing — the engine is still provisioning")
    argv = convert_argv(source, destination)
    argv[0] = binary
    result = subprocess.run(argv, capture_output=True, text=True, timeout=3600,
                            check=False)
    if result.returncode != 0:
        raise RuntimeError((result.stderr or "qemu-img convert failed").strip()[:300])


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
