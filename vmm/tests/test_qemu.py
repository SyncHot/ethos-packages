#!/usr/bin/env python3
"""EthOS VM Manager engine tests — no QEMU, no Docker, no network."""
import os
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVER = HERE.parent / "server"
sys.path.insert(0, str(SERVER))


results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail and not ok else ""))


# ── qemu.build_argv ─────────────────────────────────────────────────────────
import qemu  # noqa: E402

VM = {
    "id": "vm-abc123",
    "name": "Windows 11",
    "config": {
        "vcpu": 4,
        "memory_mb": 4096,
        "firmware": "bios",
        "disks": [{"id": "disk0", "path": "/vmhost/mnt/nas/ethos-vm/vm-abc123/disk0.qcow2",
                   "format": "qcow2", "bus": "virtio", "size_gb": 64}],
        "media": [{"path": "/vmhost/mnt/nas/iso/win11.iso", "bus": "sata"}],
        "nics": [{"model": "virtio", "mac": "52:54:00:aa:bb:cc", "forwards": []}],
        "display": {"type": "vnc", "port": 5903},
        "boot_order": ["disk", "cdrom"],
    },
}

argv = qemu.build_argv(VM, accel="kvm", qmp_path="/data/run/vm-abc123.qmp",
                       pid_path="/data/run/vm-abc123.pid", vnc_port=5903)

print("QEMU argv")
check("binary is qemu-system-x86_64", "qemu-system-x86_64" in argv[0], argv[0])
check("kvm accelerator", "q35,accel=kvm" in argv)
check("host cpu with kvm", "host" in argv)
check("vcpu rendered", argv[argv.index("-smp") + 1] == "4")
check("memory rendered", argv[argv.index("-m") + 1] == "4096")
check("vnc on loopback", "127.0.0.1:3" in argv)
check("qmp unix socket", any(item.startswith("unix:/data/run/vm-abc123.qmp") for item in argv))
check("disk drive present", any("file=/vmhost/mnt/nas/ethos-vm/vm-abc123/disk0.qcow2" in item for item in argv))
check("iso attached", any("media=cdrom" in item for item in argv))
check("boots cdrom first with media", "order=dc" in argv)
check("mac passed through", any("mac=52:54:00:aa:bb:cc" in item for item in argv))
check("daemonized", "-daemonize" in argv)
check("no shell metacharacters", not any(ch in " ".join(argv) for ch in ";&|`$"))

tcg = qemu.build_argv(VM, accel="tcg", qmp_path="/data/x.qmp", pid_path="/data/x.pid", vnc_port=5901)
check("tcg accelerator", "q35,accel=tcg" in tcg)
check("tcg uses cpu max", "max" in tcg)

plain = {**VM, "config": {**VM["config"], "media": []}}
check("disk-only boot order", "order=c" in qemu.build_argv(
    plain, accel="kvm", qmp_path="/d/q", pid_path="/d/p", vnc_port=5901))


# ── engine path validation ──────────────────────────────────────────────────
TMP = Path(tempfile.mkdtemp(prefix="vmm-test-"))
(TMP / "mnt").mkdir()
(TMP / "mnt" / "share").mkdir()
os.environ["VMM_HOST_ROOT"] = str(TMP)
os.environ["VMM_DATA"] = str(TMP / "data")
os.environ.pop("VMM_API_PORT", None)
import engine as engine_module  # noqa: E402

print("Path scope")

check("path inside a root accepted",
      str(engine_module.safe_path(str(TMP / "mnt" / "share"))) == str(TMP / "mnt" / "share"))
for bad in ("/etc", "/root", "/vmhost/mnt", "relative/path"):
    try:
        engine_module.safe_path(bad)
        ok = False
    except engine_module.EngineError:
        ok = True
    check(f"path rejected: {bad}", ok)
try:
    engine_module.safe_path(str(TMP / "mnt" / "missing"))
    traversal_blocked = False
except engine_module.EngineError:
    traversal_blocked = True
check("missing path rejected", traversal_blocked)

symlink_target = TMP / "outside"
symlink_target.mkdir()
(TMP / "mnt" / "escape").symlink_to(symlink_target)
try:
    engine_module.safe_path(str(TMP / "mnt" / "escape"))
    symlink_ok = False
except engine_module.EngineError:
    symlink_ok = True
check("symlink out of root resolved and rejected", symlink_ok)


# ── tickets ────────────────────────────────────────────────────────────────
sys.modules["engine"] = engine_module
import app as app_module  # noqa: E402  (imports engine + console, binds nothing)

check("engine module reused", app_module.ENGINE.__class__ is engine_module.Engine)
ticket = app_module.sign_ticket("vm-abc123")["ticket"]
check("fresh ticket verifies", app_module.verify_ticket("vm-abc123", ticket))
check("ticket is bound to the VM", not app_module.verify_ticket("vm-other", ticket))
check("garbage ticket rejected", not app_module.verify_ticket("vm-abc123", "nope"))
expired = f"{1}.{'a' * 40}"
check("expired ticket rejected", not app_module.verify_ticket("vm-abc123", expired))

print("WebSocket framing")
import console as console_module  # noqa: E402

check("handshake key matches RFC example",
      console_module.accept_key("dGhlIHNhbXBsZSBub25jZQ==") == "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=")
check("ping frame encodes", console_module.frame(0x9, b"hi") == b"\x89\x02hi")

failed = [name for name, ok, _ in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
