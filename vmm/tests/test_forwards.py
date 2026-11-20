#!/usr/bin/env python3
"""Guest port forwarding — the guest's web UI has to be reachable from the NAS.

A VM runs behind QEMU user networking (SLIRP): the host cannot open a connection
to the guest without `hostfwd`, and the browser cannot reach the container's
127.0.0.1. So a forward is a pair — a guest port and a container port from
FORWARD_HOST_RANGE that docker-compose publishes 1:1.
"""
import os
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVER = HERE.parent / "server"
sys.path.insert(0, str(SERVER))
os.environ.setdefault("VMM_DATA", tempfile.mkdtemp(prefix="vmm-forwards-"))

import engine as engine_module  # noqa: E402
import qemu  # noqa: E402

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail and not ok else ""))


def rejects(value):
    try:
        engine_module._guest_ports(value)
        return False
    except engine_module.EngineError:
        return True


print("parsing")
check("empty means no forwards", engine_module._guest_ports("") == [])
check("one port", engine_module._guest_ports("9000") == [9000])
check("comma separated", engine_module._guest_ports("9000, 8080") == [9000, 8080])
check("list input", engine_module._guest_ports([9000, 8080]) == [9000, 8080])
check("non-numeric refused", rejects("http"))
check("port 0 refused", rejects("0"))
check("port 65536 refused", rejects("65536"))
check("duplicates refused", rejects("9000,9000"))
check("too many refused", rejects(",".join(str(p) for p in range(9000, 9010))))

print("host port allocation")
first, last = qemu.FORWARD_HOST_RANGE
check("range is below the ephemeral range", last < 32768, str(qemu.FORWARD_HOST_RANGE))
check("first free port is the start", qemu.forward_hosts_available(set())[0] == first)
check("used ports are skipped", first not in qemu.forward_hosts_available({first}))
check("range is finite", len(qemu.forward_hosts_available(set())) == last - first + 1)

print("qemu argv")
vm = {
    "id": "vm-test", "name": "test",
    "config": {
        "vcpu": 1, "memory_mb": 512, "firmware": "bios",
        "disks": [], "media": [],
        "nics": [{"model": "virtio", "mac": "52:54:00:11:22:33",
                  "forwards": [{"host": first, "guest": 9000}]}],
        "display": {"type": "vnc", "port": 5901},
    },
}
argv = qemu.build_argv(vm, accel="tcg", qmp_path="/tmp/x.qmp", pid_path="/tmp/x.pid", vnc_port=5901)
netdev = argv[argv.index("-netdev") + 1] if "-netdev" in argv else ""
check("hostfwd reaches the netdev options", f"hostfwd=tcp:0.0.0.0:{first}-:9000" in netdev, netdev)
check("netdev keeps the user backend", netdev.startswith("user,id=net0"), netdev)

plain = {**vm, "config": {**vm["config"], "nics": [{"model": "virtio", "mac": "52:54:00:11:22:33"}]}}
argv2 = qemu.build_argv(plain, accel="tcg", qmp_path="/tmp/x.qmp", pid_path="/tmp/x.pid", vnc_port=5901)
check("no forwards means no hostfwd", "hostfwd" not in argv2[argv2.index("-netdev") + 1])

print("reading forwards back")
check("missing nics is safe", qemu.forwards_of({}) == [])
check("forwards are copied", qemu.forwards_of(vm["config"]) == [{"host": first, "guest": 9000}])

failed = [name for name, ok, _ in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
