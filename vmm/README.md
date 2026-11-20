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

## Boot a ready-made image (EthOS OS, cloud images)

An installer ISO is attached as a CD-ROM. A **system image** is different: it
already contains an installed OS, so it replaces the VM's empty disk instead.

| File | How it is used |
|---|---|
| `*.iso` | CD-ROM (install into the empty disk) |
| `*.img`, `*.raw`, `*.qcow2` | becomes `disk0.qcow2` (converted) |
| `*.img.xz`, `*.img.gz` | decompressed, then converted |

That means the image produced by the EthOS OS release
(`ethos-os-<version>-<arch>-<variant>.img.xz`) can be booted directly: copy it to
a share under `/mnt` or `/media`, pick it in **Installer ISO or system image**,
choose **UEFI** firmware (the image boots through GRUB EFI) and start the VM.
The first boot runs the EthOS OS first-boot wizard and grows the partition.

## Reach the guest (port forwarding)

Every VM sits behind its own QEMU user-mode NAT — deliberately, so a guest cannot
talk to the NAS or the LAN on its own. The catch is that nothing can reach *into*
it either, so a guest with a web UI is console-only until you forward a port.

Put the guest's port in **Forward guest ports** when you create the machine (up
to three, comma separated). The engine pairs it with a published host port and
the machine card gets a link:

```
guest 9000  →  http://this-nas:18190/
```

| Guest port | Typical use |
|---|---|
| `9000` | EthOS OS — the whole NAS UI, including the first-run setup wizard |
| `80`, `443` | a web appliance or a WordPress VM |
| `22` | SSH into the guest |

Ports come from the range `18190-18194` (docker-compose publishes it 1:1, keep it
in sync with `FORWARD_HOST_RANGE` in `server/qemu.py`). A forward is bound when
the machine starts — change it by recreating the VM.

