# EthOS Welcome

A tiny static welcome page served by nginx, used as the reference "port UI" package.

- **Package id:** `ethos-welcome` · **Runtime:** compose · **UI:** window on port **8090**
- **Files:** `site/index.html`, `site/style.css` (mounted read-only into nginx).

**Security:** the page on port 8090 has **no EthOS login**. Run it only on a trusted LAN and never
expose the port to the internet. It contains no secrets.

The page honours `?theme=light|dark` (appended by EthOS when it opens the window) and falls back to
`prefers-color-scheme`.

## Development

Edit `site/` (bump the `v…` label too), bump `version` in `manifest.json`, prepend `changelog`, then
rebuild/sign with `ethos-pack`.
