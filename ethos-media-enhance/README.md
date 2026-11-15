# Media Enhancements

Engine package (no window): face-aware video thumbnails for File Station. Picks the frame with the
largest face and crops around it instead of using a random shot.

- **Package id:** `ethos-media-enhance` · **Runtime:** venv · **UI:** none (engine)
- **Service:** `server/main.py` on `127.0.0.1:8097` (+ `/health`), with OpenCV installed from the
  pinned offline wheelhouse into the package's private venv.
- **Fallback:** without this package File Station still produces thumbnails from the first valid
  frame, so install/remove is lossless.

## Development

Nothing in the EthOS core imports OpenCV. Bump `version` and the wheel hashes together, prepend
`changelog`, then rebuild/sign with `ethos-pack`.
