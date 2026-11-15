# Surveillance Station

Camera monitoring: live MJPEG grid, camera CRUD with connection test, motion detection and an event
timeline with snapshots and clips. ffmpeg recording and the camera/motion service stay in the EthOS
core.

- **Package id:** `ethos-surveillance` · **Runtime:** files · **UI:** native (window)
- **API:** EthOS core `/api/surveillance/*`; media URLs carry the session token like other media
  endpoints.
- **Themes:** light and dark through the shared CSS variables.

Notifications go to the global Notification Center; diagnostics go to the unified Logs app
(`pkg:ethos-surveillance`).

## Development

`frontend/app.js` exports `render(container, ctx)`. Bump `version`, prepend `changelog`, then
rebuild/sign with `ethos-pack`.
