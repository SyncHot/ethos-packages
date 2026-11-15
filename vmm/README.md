# EthOS VM Manager

KVM virtual machines with qcow2 disks on your shares, a browser console and autostart.

- **Package id:** `vmm` · **Runtime:** compose · **UI:** native (window, port 8095)
- **Capability:** `capabilities: ["compose", "kvm"]` — the only allowed `devices:` entry is
  `/dev/kvm`. Without it the engine falls back to QEMU's TCG (slow) and the UI says so.
- **Service:** control plane on `127.0.0.1:8095`, reached through the authenticated package proxy.
- **Console:** port **8094** is published on the LAN because the VNC WebSocket cannot travel through
  the GET/POST proxy. Every connection needs a short-lived HMAC ticket bound to the VM and issued by
  an authenticated admin call. Do not expose 8094 beyond your LAN.

State (disk metadata, autostart flags) lives in the `vmm-data` volume; disks live on the NAS shares.

## Development

`frontend/app.js` exports `render(container, ctx)`; the server is stdlib Python. Bump `version`,
prepend `changelog`, then rebuild/sign with `ethos-pack`.
