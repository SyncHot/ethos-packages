# EthOS Community Packages

Signed package repository for [EthOS NAS](https://github.com/SyncHot/ethos-nas).

The catalog currently contains three packages:

| Package | Version | UI | What it is |
|---|---|---|---|
| `ethos-welcome` 🌅 | 1.0.0 | port 8090 | Static welcome page served by nginx |
| `tic-tac-toe` ❌ | 2.0.0 | native | Two-player game inside an EthOS window; no container or port |
| `ethos-antivirus` 🛡️ | 2.0.0 | native | ClamAV scanner for `/home`, `/mnt`, `/media`; API via authenticated proxy |

## Add this repository

In EthOS open **Package Center → Sources → Add source** and use:

- **URL:** `https://raw.githubusercontent.com/SyncHot/ethos-packages/main/index.json`
- **Trust:** pinned
- **Public key:**

```text
sXiL7v0droY2BVyttuDt0Bqq6jB7MpknylJo+/iavqE=
```

A pinned source verifies `index.json.sig` before reading the catalog, and every
manifest, compose file and package file is checked against its `sha256`.

After adding the source, open **Available**, select a package, and click
**Install**. Packages with `ui.mode: "native"` render their module directly in an
EthOS window and do not need an exposed port. The antivirus container binds its API
to `127.0.0.1:8092`; EthOS reaches it through an authenticated proxy.

Native UI packages require a **pinned, signed** source because their module runs
with the EthOS session. Only install them from publishers you trust.

The antivirus package runs ClamD as root **inside its container** so it can read
shares with `0660` permissions. The host shares are mounted read-only and the
container has no writable host bind.

## Repository layout

```text
index.json          generated catalog
index.json.sig      detached Ed25519 signature over index.json
repo.pub            public key (the matching private key is never committed)
ethos-welcome/
├── manifest.json
├── docker-compose.yml
└── site/
    ├── index.html
    └── style.css
```

## Rebuilding and signing

The CLI lives in the EthOS NAS repository:

```bash
cd ~/apps/compose/ethos-nas

# One-time key generation (keep the private key outside this repo)
.venv/bin/python scripts/ethos-pack keygen --out-dir ~/.ethos-pack/ethos-packages
cp ~/.ethos-pack/ethos-packages/repo.pub ~/ethos-packages/repo.pub

# After editing a package, regenerate the index and signature
.venv/bin/python scripts/ethos-pack build \
  --repo ~/ethos-packages \
  --base-url https://raw.githubusercontent.com/SyncHot/ethos-packages/main
.venv/bin/python scripts/ethos-pack sign \
  --repo ~/ethos-packages \
  --key ~/.ethos-pack/ethos-packages/repo.key
.venv/bin/python scripts/ethos-pack verify \
  --repo ~/ethos-packages \
  --pub ~/.ethos-pack/ethos-packages/repo.pub
```

Bump `version` in `ethos-welcome/manifest.json` before publishing a change so
Package Center offers an update.

## License

MIT
