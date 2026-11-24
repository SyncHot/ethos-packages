# Books

Read EPUB and PDF books and listen to audiobooks that already live on the NAS. A Package Center app:
a native EthOS window plus a small stdlib-only Python service in the package's private virtualenv.

- **Package id:** `ethos-books` · **Runtime:** venv · **UI:** native (window)
- **Service:** `server/main.py` on `127.0.0.1:8089`, reached through
  `/api/packages/ethos-books/proxy/…`; `user_access: true`, so every signed-in account has its own
  library, progress and settings.
- **State:** `<DATA_DIR>/packages/data/ethos-books/` — `library.json`, `progress.json`,
  `settings.json` and `covers/`, all written with atomic replace.
- **Host requirements:** none. No compose, no `system_requires`, no `capabilities`.

## Where the books are

The service never opens a book. It stores metadata, covers and reading positions only.

- Folders are added with the EthOS folder picker and read with `GET /api/files` **in the browser**,
  using the caller's own JWT. Names, sizes and permissions come from the core file service, so
  `path_scope` stays the only filesystem gate.
- Bytes are streamed from `GET /api/files/raw` (`Range`-capable), so EPUB/PDF/audio are never
  copied into the package directory.
- Whole titles (or single audiobook tracks) can be saved to the device through
  `GET /api/files/download` (see Downloads below).
- EPUB metadata (title, author, series, language, cover) is parsed in the browser with the vendored
  JSZip; the cover is downscaled to a 420 px WebP and posted to the service.
- Audiobooks gain a **duration** per track (read from `<audio>` metadata, new/changed files only).
  **Tags and artwork** are read from the first/last 512 KB only — never the whole audiobook: ID3v2
  text frames (TIT2/TPE1/TALB/TKRC/TDRC) + APIC for MP3, `©nam`/`©ART`/`©alb`/`©day`/`trkn`/`covr`
  for MP4/M4B, FLAC Vorbis comments + `METADATA_BLOCK_PICTURE`, and OGG/Opus comments.
- **Folder names are parsed offline** (`server/naming.py`): `Nesbø Jo - Cykl Harry Hole Tom 14
  Cięcie (czyta Mariusz Bonaszewski)` becomes author *Jo Nesbø*, series *Harry Hole* #14, title
  *Cięcie* and narrator *Mariusz Bonaszewski*; scene names (`Author.First.Title.128vbr.EM.2026`)
  and slugs (`title-author-ebookpoint`) are understood too. Tags beat a folder name, a folder name
  beats the file name, and a release folder is never used as an author. Calibre `.opf` sidecars
  next to a title are read as well.
- Titles without embedded art fall back to **folder artwork**: the scan looks for `cover.*`,
  `folder.*`, `front.*`, `frontcover.*`, `poster.*`, `smallcover.*`, `okladka.*` or a sibling image
  named after the book file/folder (JPG/PNG/WebP, ≤ 500 KB). Embedded EPUB/audio art still wins,
  and for a PDF the folder image replaces the rendered first page.
- Missing metadata and covers are filled by a **provider chain** (`server/providers.py`):
  **Apple Books** (`itunes.apple.com/search`, `media=ebook`, `country=PL`) first — it has the best
  Polish coverage — then **Google Books** (works keyless, an optional API key raises the quota) and
  **Open Library** last. A record fills title, author, narrator, series, year, publisher, ISBN,
  pages, genres, rating and a description; the artwork is downloaded at up to 600 px (≤ 512 KB).
  Matching is title (65 %) + author (35 %) with diacritic folding, so a same-title book by another
  author is rejected. The service makes the calls (no CORS in the browser) behind an HTTPS host
  allowlist, a timeout, a per-provider rate limit and a 15-minute cooldown after a 429. Manual
  fields are never overwritten, retries happen after 30 days, and titles/authors are sent to the
  selected providers — pick a source or switch automatic fetching off in Settings.
- The **Metadata & cover** panel (card menu) shows the stored record and the ranked candidates with
  thumbnails, and can apply one, upload a cover from the NAS, or drop the cover. Provider image URLs
  never reach the browser directly: the service keeps them and serves short-lived previews.
- When nothing is found, the service answers `GET /covers/{id}` with a deterministic **SVG poster**
  (title, author, a colour derived from the book id), and the window draws a matching CSS poster, so
  no card is an empty placeholder.
- The phone client lives in the core at `/books` (`docs/books-pwa.md` in the EthOS NAS repo); the
  desktop window stays the only place that scans folders.

`DELETE /books/{id}` removes a title from the library only; the file on the NAS is untouched.

## Downloads

Every title can be saved to the device that runs the window. The UI builds a
`/api/files/download?path=…&token=…` link (the core answers with
`Content-Disposition: attachment`) and clicks a hidden anchor, so the browser streams the bytes
straight to disk: nothing is copied onto the NAS and a 1 GB audiobook is never buffered in page
memory.

- the card menu (`⤓ Download` / `⤓ Download tracks`), the reader/player bar and the audiobooks table
  save the whole title;
- a folder audiobook becomes one file per track — the browser may ask to allow multiple downloads,
  and the player has a `⤓` button on every track;
- titles shared with you download read-only, because `/api/files/download` uses `sanitize_read` just
  like streaming.

## API (through the authenticated proxy)

The UI calls `ctx.proxy(...)`, so every path below is
`/api/packages/ethos-books/proxy/<path>` and carries the caller's identity as `X-Ethos-User`.

| Method | Path | Body | Result |
|---|---|---|---|
| GET | `library` | — | `{folders, books, progress, settings, stats}` |
| PUT | `folders` | `{folders: [{path}]}` | library |
| POST | `scan` | `{root, entries[], removed[], done}` | `{added, updated, removed, total, ids}` |
| POST | `books/{id}/cover` | `{data: base64, format}` | book |
| DELETE | `books/{id}/cover` | — | book (poster takes over) |
| GET | `covers/{id}` | — | `image/webp` / `image/svg+xml` poster |
| GET | `covers/preview/{token}` | — | short-lived provider cover preview |
| PUT | `books/{id}/progress` | `{percent, locator, position_s, finished, updated_at?}` | `{progress}` (newest write wins) |
| PUT | `books/{id}/meta` | any editable field (`title`, `author`, `narrator`, `series`, `series_index`, `year`, `publisher`, `isbn`, `pages`, `rating`, `genres`, `language`, `description`) | book |
| GET | `books/{id}/search?q=` | — | `{candidates[], tried, errors}` |
| POST | `books/{id}/apply` | `{source, source_id, query?}` | book |
| POST | `books/{id}/enrich` | `{force?, provider?, query?}` — provider chain | book |
| DELETE | `books/{id}` | — | `{ok, removed}` |
| GET/PUT | `settings` | reader/player preferences + `provider`, `google_key`, `posters` | `{settings}` (key masked) |
| GET | `health` | — | `{ok, version}` |

Limits: 20 000 titles, 64 folders, 500 scan entries per request, 512 KB covers per title, 4 000
characters of description and 200–300 per other metadata field. Paths must be absolute and inside
`/home`, `/mnt` or `/media`.

`library.json` is schema 2: `description`, `narrator`, `publisher`, `year`, `isbn`, `pages`,
`genres`, `rating`, `source`, `source_id`, `source_url`, `cover_source` and `fields_manual` (the
fields the user owns). A version-1 store is migrated on the first read.

Every GET answers an `ETag`; send it back as `If-None-Match` to get `304 Not Modified` (the phone
revalidates its library on each start). JSON responses use `Cache-Control: private, no-cache`.

## Readers

- **EPUB** — `epub.js` in a paginated or scrolled rendition, TOC drawer, light/sepia/dark reading
  theme, font family/size/line height, CFI-based resume.
- **PDF** — `pdf.js` canvas with page navigation, zoom and page-based resume; falls back to the
  inline `/api/files/raw` preview when the worker cannot start.
- **Audiobooks** — `.m4b` single files or folders of `.mp3`/`.flac`/`.m4a` tracks, with resume,
  speed, ±skip and a sleep timer.

## Vendored libraries

Shipped inside the package (no CDN at run time), each pinned by `sha256` in the signed manifest:

| File | Version | License |
|---|---|---|
| `frontend/vendor/jszip.min.js` | JSZip 3.10.1 | MIT or GPLv3 (dual) — MIT chosen |
| `frontend/vendor/epub.min.js` | epub.js 0.3.93 | BSD-2-Clause |
| `frontend/vendor/pdf.min.js`, `pdf.worker.min.js` | pdf.js 3.11.174 | Apache-2.0 |

The license texts ship next to the libraries in `frontend/vendor/LICENSE-*.txt`.

## Development

The UI uses only `ctx.*` helpers (`ctx.apiFetch`, `ctx.proxy`, `ctx.pickFolder`, `ctx.progress`,
`ctx.modal`, `ctx.notifications`, `ctx.log`, `ctx.windows.registerCloseGuard`). It follows the shared
package shell (218 px rail, panels, summary tiles, tables) in both themes.

After any change bump `version`, prepend to `changelog`, and rebuild/sign:

```bash
cd ~/apps/compose/ethos-nas
.venv/bin/python scripts/ethos-pack build  --repo ~/apps/compose/ethos-packages \
  --base-url https://raw.githubusercontent.com/SyncHot/ethos-packages/main
.venv/bin/python scripts/ethos-pack sign   --repo ~/apps/compose/ethos-packages \
  --key ~/.ethos-pack/ethos-packages/repo.key
.venv/bin/python scripts/ethos-pack verify --repo ~/apps/compose/ethos-packages \
  --pub ~/.ethos-pack/ethos-packages/repo.pub
```
