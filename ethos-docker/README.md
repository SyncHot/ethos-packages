# Docker Manager

Manage containers, images, volumes and Compose projects from an EthOS window. The Docker Engine
itself is host software: the package only ships the UI and the core `/api/docker` endpoints keep
the privilege.

- **Package id:** `ethos-docker` · **Runtime:** files · **UI:** native (window)
- **Host dependency:** the Docker engine is detected through `GET /api/docker/engine`; when it is
  missing the window offers the privileged install helper (or a restart after the service user was
  added to the `docker` group).
- No Docker socket bind, no `privileged`, no host mounts in this package.

Long operations (engine install, image pull, compose up/down) report through the shared progress
panel; container logs open in the unified Logs viewer. The window uses the shared package shell
(218 px rail with text-only nav, summary tiles, one table per section) and follows the light/dark
theme toggle.

## Development

`frontend/app.js` exports `render(container, ctx)`. Bump `version`, prepend `changelog`, then
rebuild/sign with `ethos-pack` (see the main README).
