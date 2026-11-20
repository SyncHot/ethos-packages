# EthOS VM Manager

KVM virtual machines with qcow2 disks on your shares, a browser console and autostart.

- **Package id:** `vmm` · **Runtime:** compose · **UI:** native (window, port 8095)
- **Capability:** `capabilities: ["compose", "kvm"]` — the only allowed `devices:` entry is
  `/dev/kvm`. Without it the engine falls back to QEMU's TCG (slow) and the UI says so.
- **Service:** control plane on `127.0.0.1:8095`, reached through the authenticated package proxy.
- **Console:** the container listens on 8094; Docker publishes it on a **free host port** (no fixed
  port to collide with other services) and the VM window discovers the mapping through the core
  container list. Every connection needs a short-lived HMAC ticket bound to the VM and issued by an
  authenticated admin call. Do not expose that port beyond your LAN.

State (disk metadata, autostart flags) lives in the `vmm-data` volume; disks live on the NAS shares.

## Development

`frontend/app.js` exports `render(container, ctx)`; the server is stdlib Python. Bump `version`,
prepend `changelog`, then rebuild/sign with `ethos-pack`.
