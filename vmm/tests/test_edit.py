#!/usr/bin/env python3
"""Editing an existing machine (engine.update) — resources and port forwards.

Disks are not editable on purpose; what people do need is to fix a missing
forward or give a slow guest more RAM without rebuilding it. A host port a guest
already owns must survive an edit, otherwise the link they bookmarked dies.
"""
import json
import os
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVER = HERE.parent / "server"
sys.path.insert(0, str(SERVER))
DATA = Path(tempfile.mkdtemp(prefix="vmm-edit-"))
os.environ["VMM_DATA"] = str(DATA)

import engine as engine_module  # noqa: E402
import qemu  # noqa: E402

results = []
FIRST = qemu.FORWARD_HOST_RANGE[0]


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail and not ok else ""))


def record(vm_id, forwards=None, vcpu=2, memory_mb=2048):
    return {
        "id": vm_id,
        "name": vm_id,
        "autostart": True,
        "created_at": "2026-11-20T00:00:00+00:00",
        "updated_at": "2026-11-20T00:00:00+00:00",
        "config": {
            "vcpu": vcpu,
            "memory_mb": memory_mb,
            "machine": "q35",
            "firmware": "uefi",
            "disks": [{"id": "disk0", "path": "/tmp/disk0.qcow2", "format": "qcow2",
                       "bus": "virtio", "size_gb": 8}],
            "media": [],
            "nics": [{"model": "virtio", "mac": "52:54:00:00:00:01", "forwards": forwards or []}],
            "display": {"type": "vnc", "port": 5901},
            "boot_order": ["disk", "cdrom"],
        },
    }


def write_vms(vms):
    # store.load_vms expects the versioned envelope, not a bare list
    (DATA / "vms.json").write_text(json.dumps({"schema": 1, "vms": vms}), encoding="utf-8")


def load():
    return json.loads((DATA / "vms.json").read_text(encoding="utf-8"))["vms"]


ENGINE = engine_module.Engine()
STATUS = {"value": "stopped"}


ENGINE.status = lambda vm: STATUS["value"]  # noqa: ARG005 - QMP is not available here


def rejects(payload, status="stopped"):
    STATUS["value"] = status
    try:
        ENGINE.update("vm-a", payload)
        return False
    except engine_module.EngineError:
        return True


print("port forwards")
write_vms([record("vm-a"), record("vm-b")])
item = ENGINE.update("vm-a", {"guest_ports": "9000, 8080"})
check("two forwards are assigned", [f["guest"] for f in item["forwards"]] == [9000, 8080],
      str(item["forwards"]))
first_host = item["forwards"][0]["host"]
check("host ports come from the published range", first_host == FIRST, str(item["forwards"]))

item = ENGINE.update("vm-a", {"guest_ports": "9000"})
check("dropping a forward keeps the surviving host port",
      item["forwards"] == [{"host": first_host, "guest": 9000}], str(item["forwards"]))

item = ENGINE.update("vm-a", {"guest_ports": "9000, 22"})
hosts = {f["guest"]: f["host"] for f in item["forwards"]}
check("existing port is not renumbered", hosts[9000] == first_host, str(item["forwards"]))
check("new port gets a free one", hosts[22] not in (None, first_host), str(item["forwards"]))

write_vms([record("vm-a"), record("vm-b", forwards=[{"host": FIRST + 1, "guest": 9000}])])
item = ENGINE.update("vm-a", {"guest_ports": "9000"})
check("another machine's host port is never reused",
      item["forwards"][0]["host"] != FIRST + 1, str(item["forwards"]))

print("resources")
write_vms([record("vm-a")])
item = ENGINE.update("vm-a", {"vcpu": 4, "memory_mb": 4096})
check("vcpu and memory saved", (item["vcpu"], item["memory_mb"]) == (4, 4096), str(item))

check("bad vcpu refused", rejects({"vcpu": 0}))
check("huge memory refused", rejects({"memory_mb": 10 ** 6}))
check("bad guest port refused", rejects({"guest_ports": "http"}))
check("empty name refused", rejects({"name": "   "}))

print("running machine")
STATUS["value"] = "running"
check("resources refused while running", rejects({"vcpu": 8}, status="running"))
check("forwards refused while running", rejects({"guest_ports": "9000"}, status="running"))
STATUS["value"] = "running"
item = ENGINE.update("vm-a", {"name": "renamed", "autostart": False})
check("rename and autostart work while running",
      item["name"] == "renamed" and item["autostart"] is False, str(item))

saved = load()[0]
check("changes are persisted", saved["name"] == "renamed" and saved["autostart"] is False, str(saved))
check("disks are untouched", saved["config"]["disks"][0]["path"] == "/tmp/disk0.qcow2", str(saved))

failed = [name for name, ok, _ in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
