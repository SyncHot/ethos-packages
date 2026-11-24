// EthOS Books — Package Center app (native window)
//
// Library of books and audiobooks that live on the NAS. The package service
// (server/main.py) owns only metadata, covers and per-account progress; every
// byte is streamed by this module from the core file API with the caller's own
// JWT, so path_scope stays the only filesystem gate and nothing is copied.
//
// Layout: shared package shell (218 px rail, panels, summary tiles, tables).
// Readers: EPUB via the vendored epub.js, PDF via the vendored pdf.js, audio
// through <audio> + /api/files/raw (Range). Light and dark themes both ship.

let _ctx = null;
let _pkgBase = '';
let _uiBase = '';

const AUDIO_EXTS = new Set(['m4b', 'm4a', 'mp3', 'flac', 'ogg', 'opus']);
const BOOK_EXTS = new Set(['epub', 'pdf']);
const ALL_EXTS = [...BOOK_EXTS, ...AUDIO_EXTS];
// Folder artwork: a normal book layout keeps `cover.jpg` next to the file, so
// those files are collected while walking but never treated as titles.
const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp']);
const FOLDER_COVER_STEMS = ['cover', 'folder', 'front', 'frontcover', 'poster', 'smallcover', 'okladka'];
const MAX_COVER_BYTES = 500 * 1024;
const SKIP_DIRS = new Set(['@eaDir', '#recycle', '.@__thumb', 'lost+found', '.Trash-1000',
    '$RECYCLE.BIN', 'System Volume Information', 'node_modules', '__pycache__']);
const MAX_DEPTH = 8;
const MAX_NODES = 20000;
const MAX_META_BYTES = 150 * 1024 * 1024;
const MAX_AUDIO_META = 400;      // metadata reads per scan (new files only)
const SCAN_BATCH = 100;

const READ_THEMES = {
    light: { bg: '#ffffff', text: '#1f2430', muted: '#5b6472', link: '#2563eb' },
    sepia: { bg: '#f6ecd9', text: '#3d2f1f', muted: '#7a6752', link: '#8a5a1e' },
    dark: { bg: '#0f1720', text: '#e2e8f0', muted: '#94a3b8', link: '#7dd3fc' },
};

const _state = {
    view: 'library',
    library: { folders: [], books: [], shared_roots: [], shared_books: [], progress: {}, settings: {}, stats: {} },
    sharedFiles: [],
    query: '',
    format: 'all',
    sort: 'title',
    loading: true,
    coverUrls: new Map(),
    coverLoading: new Set(),
    reading: null,
    scanCancel: false,
    progressTimer: null,
    pendingProgress: null,
};

// Vendored readers are plain UMD builds served by the package itself. A plain
// <script src> cannot send the bearer token, so each file is fetched with
// ctx.apiFetch, wrapped in a temporary blob URL and executed as a classic script
// (the libraries then publish themselves on `window`: ePub / pdfjsLib / JSZip).
// Nothing is fetched from a CDN at run time.
let _vendorPromise = null;
let _pdfWorkerUrl = '';

async function loadVendorScript(src) {
    const res = await _ctx.apiFetch(src);
    if (!res.ok) throw new Error(await detailOf(res, `HTTP ${res.status}`));
    const source = await res.text();
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    try {
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.async = false;
            script.onload = () => resolve(true);
            script.onerror = () => reject(new Error(`could not execute ${src}`));
            document.head.appendChild(script);
        });
    } finally {
        URL.revokeObjectURL(url);
    }
    return true;
}

function loadVendors() {
    if (!_vendorPromise) {
        _vendorPromise = (async () => {
            await loadVendorScript(`${_uiBase}frontend/vendor/jszip.min.js`);
            await loadVendorScript(`${_uiBase}frontend/vendor/epub.min.js`);
            await loadVendorScript(`${_uiBase}frontend/vendor/pdf.min.js`);
            try {
                const res = await _ctx.apiFetch(`${_uiBase}frontend/vendor/pdf.worker.min.js`);
                if (res.ok) _pdfWorkerUrl = URL.createObjectURL(await res.blob());
                ensurePdfWorker();
            } catch (err) {
                log.warn('pdf worker unavailable', String(err?.message || err));
            }
            return true;
        })().catch((err) => {
            log.warn('reader libraries unavailable', String(err?.message || err));
            return false;
        });
    }
    return _vendorPromise;
}

/** pdf.js derives a worker URL from the script it was loaded from; ours is a blob,
 *  so the fetched worker blob is always assigned explicitly. */
function ensurePdfWorker() {
    if (window.pdfjsLib && _pdfWorkerUrl) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = _pdfWorkerUrl;
    }
}

// ── Shims around the host context ───────────────────────────────────────────

const escHtml = (value) => _ctx.escape.html(value);
const escAttr = (value) => _ctx.escape.attr(value);
const log = {
    debug: (message, detail = '') => _ctx.logger.debug(message, detail),
    info: (message, detail = '') => _ctx.logger.info(message, detail),
    warn: (message, detail = '') => _ctx.logger.warn(message, detail),
    error: (message, detail = '') => _ctx.logger.error(message, detail),
};

function setStatus(text, tone = '') {
    const el = document.querySelector('#bk-status');
    if (!el) return;
    el.textContent = text || '';
    el.className = `bk-status${tone ? ` ${tone}` : ''}`;
}

function setPill(text, tone = 'starting') {
    const el = document.querySelector('#bk-status-pill');
    if (!el) return;
    el.textContent = text;
    el.className = `bk-pill ${tone}`;
}

/** The reader overlay covers the window status line: use the global toasts. */
function readerNote(message, tone = 'info') {
    const kind = tone === 'error' ? 'error' : tone === 'warn' ? 'warning' : 'info';
    setStatus(message, tone === 'error' ? 'error' : tone === 'warn' ? 'warn' : '');
    if (_state.reading) _ctx.notifications.toast(message, kind);
}

function rawUrl(path) {
    return `/api/files/raw?path=${encodeURIComponent(path)}`;
}

function mediaUrl(path) {
    const token = localStorage.getItem('token') || '';
    return `${rawUrl(path)}&token=${encodeURIComponent(token)}`;
}

async function detailOf(res, fallback = '') {
    try {
        const payload = await res.clone().json();
        return payload?.detail || payload?.error || fallback || `HTTP ${res.status}`;
    } catch {
        return fallback || `HTTP ${res.status}`;
    }
}

async function json(path, { method = 'GET', body } = {}) {
    const opts = { method };
    if (body !== undefined) {
        opts.body = JSON.stringify(body);
        opts.headers = { 'Content-Type': 'application/json' };
    }
    return _ctx.proxy(path, opts);
}

// ── Downloads ───────────────────────────────────────────────────────────────

// Downloads go through the core file API (`/api/files/download`) with the
// caller's own token, so `path_scope` decides what can be saved exactly as it
// does for reading. A hidden anchor keeps the browser in charge: the response
// streams straight to disk, so a 1 GB audiobook is never buffered in page
// memory. Folder audiobooks are several files — browsers may ask to allow
// multiple downloads.
const DOWNLOAD_GAP_MS = 700;

function downloadUrl(path) {
    const token = localStorage.getItem('token') || '';
    return `/api/files/download?path=${encodeURIComponent(path)}&token=${encodeURIComponent(token)}`;
}

function bookPaths(book) {
    const tracks = Array.isArray(book.tracks) ? book.tracks : [];
    return (tracks.length ? tracks.map((track) => track.path) : [book.path]).filter(Boolean);
}

function saveToDevice(path) {
    const anchor = document.createElement('a');
    anchor.href = downloadUrl(path);
    anchor.download = baseName(path);
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    setTimeout(() => { anchor.remove(); }, 2000);
}

function downloadLabel(book) {
    return book.kind === 'audiobook' && (book.tracks || []).length > 1 ? 'All tracks' : 'Download';
}

async function downloadBook(book, paths = null) {
    const list = (paths && paths.length ? paths : bookPaths(book)).filter(Boolean);
    if (!list.length) {
        setStatus('There is no file to download for this title.', 'warn');
        return;
    }
    const label = book.title || baseName(book.path);
    for (let i = 0; i < list.length; i += 1) {
        saveToDevice(list[i]);
        if (i < list.length - 1) await new Promise((resolve) => setTimeout(resolve, DOWNLOAD_GAP_MS));
    }
    const message = list.length > 1
        ? `Downloading ${list.length} files of ${label} — allow multiple downloads if the browser asks.`
        : `Downloading ${baseName(list[0])}…`;
    log.info('download started', `${list.length} file(s) · ${label}`);
    setStatus(message);
    _ctx.notifications.toast(message, 'info');
}

// ── Formatting helpers ──────────────────────────────────────────────────────

function fmtBytes(value) {
    let size = Number(value) || 0;
    if (size <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1; }
    return `${size >= 10 || unit === 0 ? Math.round(size) : size.toFixed(1)} ${units[unit]}`;
}

function fmtTime(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    return hours
        ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
        : `${minutes}:${String(secs).padStart(2, '0')}`;
}

function pct(value) {
    return Math.max(0, Math.min(100, Math.round((Number(value) || 0) * 100)));
}

function extOf(name) {
    const parts = String(name || '').split('.');
    return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

function fileTitle(name) {
    return String(name || '').replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
}

function baseName(path) {
    const parts = String(path || '').split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '/';
}

function under(path, root) {
    const cleanRoot = String(root || '').replace(/\/+$/, '');
    return path === cleanRoot || String(path).startsWith(`${cleanRoot}/`);
}

function progressOf(book) {
    return (_state.library.progress || {})[book.id] || null;
}

function sortBooks(books) {
    const dir = _state.sort;
    const list = [...books];
    const byTitle = (a, b) => String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' });
    if (dir === 'author') return list.sort((a, b) => String(a.author || '~').localeCompare(String(b.author || '~')) || byTitle(a, b));
    if (dir === 'recent') return list.sort((a, b) => String(b.added_at || '').localeCompare(String(a.added_at || '')) || byTitle(a, b));
    if (dir === 'size') return list.sort((a, b) => (Number(b.size) || 0) - (Number(a.size) || 0));
    return list.sort(byTitle);
}

function filteredBooks() {
    const needle = _state.query.trim().toLowerCase();
    return sortBooks((_state.library.books || []).filter((book) => {
        if (_state.format === 'book' && book.kind !== 'book') return false;
        if (_state.format === 'audio' && book.kind !== 'audiobook') return false;
        if (_state.format === 'epub' && book.format !== 'epub') return false;
        if (_state.format === 'pdf' && book.format !== 'pdf') return false;
        if (!needle) return true;
        return `${book.title} ${book.author} ${book.series}`.toLowerCase().includes(needle);
    }));
}

// ── Covers (fetched with the auth header, cached as object URLs) ────────────

function coverMarkup(book, size = '') {
    const url = _state.coverUrls.get(book.id) || '';
    if (url) {
        return `<img class="bk-cover-img is-loaded ${size}" src="${escAttr(url)}" alt="" loading="lazy">`;
    }
    if (book.cover) _loadCover(book);
    const glyph = book.kind === 'audiobook' ? '🎧' : (book.format === 'pdf' ? '📄' : '📖');
    return `<span class="bk-cover-fallback ${size}" aria-hidden="true">${glyph}</span>`;
}

async function _loadCover(book) {
    if (_state.coverLoading.has(book.id) || _state.coverUrls.has(book.id)) return;
    _state.coverLoading.add(book.id);
    try {
        const res = await _ctx.apiFetch(`${_pkgBase}/covers/${encodeURIComponent(book.id)}`);
        if (!res.ok) return;
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        _state.coverUrls.set(book.id, url);
        document.querySelectorAll(`[data-cover-slot="${book.id}"]`).forEach((host) => {
            host.innerHTML = `<img class="bk-cover-img is-loaded" src="${escAttr(url)}" alt="">`;
        });
    } catch (err) {
        log.debug('cover load failed', String(err?.detail || err?.message || err));
    } finally {
        _state.coverLoading.delete(book.id);
    }
}

// ── Styles ──────────────────────────────────────────────────────────────────

function injectStyles(container) {
    if (document.getElementById('bk-styles')) return;
    const style = document.createElement('style');
    style.id = 'bk-styles';
    style.textContent = `
.bk-root {
    color-scheme: light;
    --pkg-bg: #eef2f7;
    --pkg-side-bg: rgba(255, 255, 255, 0.88);
    --pkg-panel: #ffffff;
    --pkg-surface: #f4f5f7;
    --pkg-input-bg: #ffffff;
    --pkg-border: #e3e5e8;
    --pkg-text: #1f2430;
    --pkg-muted: #5b6472;
    --pkg-accent: #2563eb;
    --pkg-accent-soft: rgba(37, 99, 235, 0.10);
    --pkg-accent-border: rgba(37, 99, 235, 0.45);
    --pkg-green: #15803d;
    --pkg-green-soft: rgba(21, 128, 61, 0.12);
    --pkg-green-border: rgba(21, 128, 61, 0.35);
    --pkg-red: #b91c1c;
    --pkg-red-soft: rgba(185, 28, 28, 0.08);
    --pkg-red-border: rgba(185, 28, 28, 0.32);
    --pkg-amber: #b45309;
    --pkg-amber-soft: rgba(180, 83, 9, 0.10);
    --pkg-amber-border: rgba(180, 83, 9, 0.30);
    --pkg-hover: rgba(15, 23, 42, 0.06);
    display: flex;
    position: relative;
    height: 100%;
    overflow: hidden;
    background:
        radial-gradient(circle at 8% 4%, rgba(37, 99, 235, 0.08), transparent 40%),
        radial-gradient(circle at 92% 96%, rgba(21, 128, 61, 0.06), transparent 40%),
        var(--pkg-bg);
    color: var(--pkg-text);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
:root.dark .bk-root {
    color-scheme: dark;
    --pkg-bg: #08111d;
    --pkg-side-bg: rgba(2, 6, 23, 0.45);
    --pkg-panel: rgba(148, 163, 184, 0.07);
    --pkg-surface: rgba(15, 23, 42, 0.45);
    --pkg-input-bg: rgba(2, 6, 23, 0.55);
    --pkg-border: rgba(148, 163, 184, 0.22);
    --pkg-text: #e2e8f0;
    --pkg-muted: #94a3b8;
    --pkg-accent: #38bdf8;
    --pkg-accent-soft: rgba(56, 189, 248, 0.14);
    --pkg-accent-border: rgba(56, 189, 248, 0.55);
    --pkg-green: #4ade80;
    --pkg-green-soft: rgba(74, 222, 128, 0.14);
    --pkg-green-border: rgba(74, 222, 128, 0.45);
    --pkg-red: #f87171;
    --pkg-red-soft: rgba(248, 113, 113, 0.12);
    --pkg-red-border: rgba(248, 113, 113, 0.45);
    --pkg-amber: #fbbf24;
    --pkg-amber-soft: rgba(251, 191, 36, 0.10);
    --pkg-amber-border: rgba(251, 191, 36, 0.45);
    --pkg-hover: rgba(148, 163, 184, 0.09);
}
.bk-root * { box-sizing: border-box; }
.bk-side {
    flex: none; width: 218px; padding: 20px 14px;
    border-right: 1px solid var(--pkg-border);
    background: var(--pkg-side-bg);
    display: flex; flex-direction: column; gap: 16px; overflow-y: auto;
}
.bk-brand { display: flex; align-items: center; gap: 9px; }
.bk-brand-icon { font-size: 26px; line-height: 1; }
.bk-brand strong { display: block; font-size: 14px; letter-spacing: -0.01em; }
.bk-brand small { display: block; font-size: 10px; color: var(--pkg-muted); }
.bk-nav { display: flex; flex-direction: column; gap: 3px; }
.bk-nav-item {
    border: 0; background: transparent; color: var(--pkg-muted);
    font: 600 12px/1.2 ui-sans-serif, system-ui, sans-serif;
    text-align: left; padding: 9px 11px; border-radius: 9px; cursor: pointer;
}
.bk-nav-item:hover { background: var(--pkg-hover); color: var(--pkg-text); }
.bk-nav-item.is-active { background: var(--pkg-accent-soft); color: var(--pkg-accent); }
.bk-nav-item:focus-visible { outline: 2px solid var(--pkg-accent); outline-offset: 1px; }
.bk-side-foot { margin-top: auto; display: flex; flex-direction: column; gap: 8px; }
.bk-pill {
    align-self: flex-start; padding: 5px 10px; border-radius: 999px;
    font: 700 10px/1 ui-sans-serif, system-ui, sans-serif; letter-spacing: 0.02em;
    border: 1px solid transparent; white-space: nowrap;
}
.bk-pill.ready { background: var(--pkg-green-soft); color: var(--pkg-green); border-color: var(--pkg-green-border); }
.bk-pill.starting { background: var(--pkg-amber-soft); color: var(--pkg-amber); border-color: var(--pkg-amber-border); }
.bk-pill.offline { background: var(--pkg-red-soft); color: var(--pkg-red); border-color: var(--pkg-red-border); }
.bk-side-note { font-size: 10px; line-height: 1.5; color: var(--pkg-muted); }
.bk-main { flex: 1; min-width: 0; overflow-y: auto; padding: 24px 28px 32px; }
.bk-main h1 { margin: 0; font-size: clamp(22px, 3.4vw, 30px); letter-spacing: -0.02em; font-weight: 650; }
.bk-page-sub { margin: 4px 0 0; font-size: 12px; color: var(--pkg-muted); }
.bk-status { margin: 8px 0 0; min-height: 18px; font: 600 12px/1.4 ui-sans-serif, system-ui, sans-serif; color: var(--pkg-accent); }
.bk-status.error { color: var(--pkg-red); }
.bk-status.warn { color: var(--pkg-amber); }
.bk-view { display: flex; flex-direction: column; gap: 14px; margin-top: 16px; }
.bk-panel {
    background: var(--pkg-panel); border: 1px solid var(--pkg-border);
    border-radius: 15px; padding: 17px 18px;
}
.bk-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.bk-tile {
    background: var(--pkg-surface); border: 1px solid var(--pkg-border);
    border-radius: 11px; padding: 10px 12px;
}
.bk-tile span { display: block; font-size: 9px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: var(--pkg-muted); }
.bk-tile strong { display: block; margin-top: 3px; font-size: 20px; font-variant-numeric: tabular-nums; }
.bk-toolbar { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.bk-toolbar h2 { margin: 0; font-size: 13px; font-weight: 650; }
.bk-toolbar .bk-hint { margin: 2px 0 0; font-size: 11px; color: var(--pkg-muted); }
.bk-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.bk-btn {
    border: 1px solid var(--pkg-border); background: var(--pkg-surface); color: var(--pkg-text);
    font: 600 11px/1 ui-sans-serif, system-ui, sans-serif; padding: 8px 13px;
    border-radius: 9px; cursor: pointer;
}
.bk-btn:hover { background: var(--pkg-hover); }
.bk-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.bk-btn:focus-visible { outline: 2px solid var(--pkg-accent); outline-offset: 1px; }
.bk-btn.primary { background: var(--pkg-accent); border-color: var(--pkg-accent); color: #fff; }
:root.dark .bk-btn.primary { color: #04121f; }
.bk-btn.danger { background: var(--pkg-red-soft); border-color: var(--pkg-red-border); color: var(--pkg-red); }
.bk-btn.small { padding: 4px 9px; font-size: 10px; }
.bk-input, .bk-select {
    border: 1px solid var(--pkg-border); background: var(--pkg-input-bg); color: var(--pkg-text);
    border-radius: 9px; padding: 9px 11px; font: 400 12px/1.2 ui-monospace, monospace;
}
.bk-select { font-family: ui-sans-serif, system-ui, sans-serif; }
.bk-input:focus-visible, .bk-select:focus-visible { outline: 2px solid var(--pkg-accent); outline-offset: 1px; }
.bk-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(148px, 1fr)); gap: 14px; }
.bk-card { position: relative; display: flex; flex-direction: column; gap: 7px; min-width: 0; }
.bk-cover-btn {
    position: relative; display: block; width: 100%; aspect-ratio: 2 / 3;
    border: 1px solid var(--pkg-border); border-radius: 11px; overflow: hidden;
    background: var(--pkg-surface); cursor: pointer; padding: 0;
}
.bk-cover-btn:focus-visible { outline: 2px solid var(--pkg-accent); outline-offset: 2px; }
.bk-cover-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.bk-cover-fallback { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; font-size: 34px; opacity: 0.7; }
.bk-card-title {
    font-size: 12px; font-weight: 650; line-height: 1.35;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.bk-card-sub {
    font-size: 10.5px; color: var(--pkg-muted);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.bk-bar { display: block; height: 4px; border-radius: 999px; background: var(--pkg-border); overflow: hidden; }
.bk-bar span { display: block; height: 100%; background: var(--pkg-accent); }
.bk-badge {
    position: absolute; left: 7px; bottom: 7px; padding: 3px 7px; border-radius: 999px;
    font: 700 9px/1 ui-monospace, monospace; letter-spacing: 0.04em; text-transform: uppercase;
    background: rgba(2, 6, 23, 0.72); color: #e2e8f0;
}
.bk-menu-btn {
    position: absolute; top: 6px; right: 6px; width: 26px; height: 26px; border-radius: 8px;
    border: 1px solid var(--pkg-border); background: var(--pkg-panel); color: var(--pkg-text);
    cursor: pointer; font-size: 13px; line-height: 1; padding: 0;
}
.bk-menu {
    position: absolute; top: 36px; right: 6px; z-index: 5; min-width: 158px;
    background: var(--pkg-panel); border: 1px solid var(--pkg-border); border-radius: 11px;
    box-shadow: 0 14px 34px rgba(2, 6, 23, 0.28); padding: 5px; display: flex; flex-direction: column;
}
.bk-menu button {
    border: 0; background: transparent; color: var(--pkg-text); text-align: left;
    font: 500 11.5px/1.2 ui-sans-serif, system-ui, sans-serif; padding: 8px 9px; border-radius: 7px; cursor: pointer;
}
.bk-menu button:hover { background: var(--pkg-hover); }
.bk-menu button.danger { color: var(--pkg-red); }
.bk-table { width: 100%; border-collapse: collapse; font-size: 11px; }
.bk-table th {
    text-align: left; font-size: 9px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase;
    color: var(--pkg-muted); padding: 8px 9px; border-bottom: 1px solid var(--pkg-border);
}
.bk-table td { padding: 8px 9px; border-bottom: 1px solid var(--pkg-border); vertical-align: middle; }
.bk-table tr:last-child td { border-bottom: 0; }
.bk-table .path { font-family: ui-monospace, monospace; font-size: 10.5px; color: var(--pkg-muted); word-break: break-all; }
.bk-table .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.bk-table .actions { text-align: right; white-space: nowrap; }
.bk-tag {
    display: inline-block; padding: 3px 8px; border-radius: 999px;
    font: 600 10px/1 ui-monospace, monospace; border: 1px solid var(--pkg-border); color: var(--pkg-muted);
}
.bk-tag.is-ok { color: var(--pkg-green); background: var(--pkg-green-soft); border-color: var(--pkg-green-border); }
.bk-tag.is-info { color: var(--pkg-accent); background: var(--pkg-accent-soft); border-color: var(--pkg-accent-border); }
.bk-empty {
    border: 1px dashed var(--pkg-border); border-radius: 12px; padding: 24px;
    text-align: center; font-size: 11px; color: var(--pkg-muted); line-height: 1.6;
}
.bk-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.bk-field { display: flex; flex-direction: column; gap: 6px; }
.bk-field.full { grid-column: 1 / -1; }
.bk-field label { font-size: 10px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: var(--pkg-muted); }
.bk-def-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
.bk-def-grid div { background: var(--pkg-surface); border: 1px solid var(--pkg-border); border-radius: 10px; padding: 9px 11px; }
.bk-def-grid span { display: block; font-size: 9px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--pkg-muted); }
.bk-def-grid strong { display: block; margin-top: 3px; font-size: 12px; font-weight: 600; word-break: break-word; }
.bk-continue { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.bk-continue-card {
    display: flex; gap: 11px; align-items: center; background: var(--pkg-surface);
    border: 1px solid var(--pkg-border); border-radius: 12px; padding: 10px 12px; cursor: pointer; text-align: left;
}
.bk-continue-card:hover { border-color: var(--pkg-accent-border); }
.bk-continue-cover { flex: none; width: 44px; height: 62px; border-radius: 7px; overflow: hidden; background: var(--pkg-panel); display: flex; align-items: center; justify-content: center; font-size: 20px; }
.bk-continue-body { min-width: 0; flex: 1; }
.bk-continue-body strong { display: block; font-size: 12px; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bk-continue-body span { display: block; font-size: 10.5px; color: var(--pkg-muted); margin-top: 2px; }
.bk-reader {
    position: absolute; inset: 0; z-index: 20; display: flex; flex-direction: column;
    background: var(--pkg-bg); color: var(--pkg-text);
}
.bk-reader-bar {
    display: flex; align-items: center; gap: 10px; padding: 10px 14px;
    border-bottom: 1px solid var(--pkg-border); background: var(--pkg-side-bg); flex-wrap: wrap;
}
.bk-reader-bar strong { font-size: 12.5px; font-weight: 650; flex: 1; min-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bk-reader-body { flex: 1; min-height: 0; position: relative; display: flex; }
.bk-epub-host { flex: 1; min-height: 0; }
.bk-pdf-scroll { flex: 1; min-height: 0; overflow: auto; padding: 18px; display: flex; justify-content: center; }
.bk-pdf-scroll canvas { box-shadow: 0 10px 30px rgba(2, 6, 23, 0.28); border-radius: 3px; background: #fff; }
.bk-reader-foot {
    display: flex; align-items: center; gap: 10px; padding: 8px 14px;
    border-top: 1px solid var(--pkg-border); background: var(--pkg-side-bg);
    font: 600 11px/1.3 ui-sans-serif, system-ui, sans-serif; flex-wrap: wrap;
}
.bk-toc {
    position: absolute; top: 0; left: 0; bottom: 0; width: 280px; max-width: 80%;
    background: var(--pkg-panel); border-right: 1px solid var(--pkg-border);
    overflow-y: auto; padding: 12px; z-index: 3; display: flex; flex-direction: column; gap: 4px;
}
.bk-toc button {
    border: 0; background: transparent; color: var(--pkg-text); text-align: left;
    font: 500 11.5px/1.4 ui-sans-serif, system-ui, sans-serif; padding: 7px 8px; border-radius: 7px; cursor: pointer;
}
.bk-toc button:hover { background: var(--pkg-hover); }
.bk-toc button.sub { padding-left: 20px; color: var(--pkg-muted); font-size: 11px; }
.bk-player { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.bk-player-head { padding: 22px 26px 12px; display: flex; gap: 18px; align-items: flex-start; }
.bk-player-art {
    flex: none; width: 132px; height: 132px; border-radius: 14px; overflow: hidden;
    background: var(--pkg-surface); border: 1px solid var(--pkg-border);
    display: flex; align-items: center; justify-content: center; font-size: 46px;
}
.bk-player-meta { min-width: 0; }
.bk-player-meta h2 { margin: 0; font-size: 17px; font-weight: 650; letter-spacing: -0.01em; }
.bk-player-meta p { margin: 4px 0 0; font-size: 12px; color: var(--pkg-muted); }
.bk-tracks { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 26px 16px; }
.bk-track {
    display: flex; align-items: center; gap: 2px; width: 100%;
    border-radius: 8px; color: var(--pkg-text);
}
.bk-track:hover { background: var(--pkg-hover); }
.bk-track.is-active { background: var(--pkg-accent-soft); color: var(--pkg-accent); }
.bk-track-main {
    flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px;
    padding: 8px 9px; border: 0; border-radius: 8px; background: transparent;
    color: inherit; font: 500 11.5px/1.3 ui-sans-serif, system-ui, sans-serif;
    text-align: left; cursor: pointer;
}
.bk-track-main:focus-visible { outline: 2px solid var(--pkg-accent); outline-offset: -2px; }
.bk-track .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bk-track .num { font-family: ui-monospace, monospace; font-size: 10px; color: var(--pkg-muted); min-width: 20px; }
.bk-track .dur { margin-left: auto; font-family: ui-monospace, monospace; font-size: 10px; color: var(--pkg-muted); }
.bk-track-dl {
    flex: none; border: 0; background: transparent; color: var(--pkg-muted);
    cursor: pointer; padding: 6px 8px; border-radius: 7px; font-size: 12px; line-height: 1;
}
.bk-track-dl:hover { background: var(--pkg-hover); color: var(--pkg-text); }
.bk-track-dl:focus-visible { outline: 2px solid var(--pkg-accent); outline-offset: 1px; }
.bk-player-bar {
    display: flex; align-items: center; gap: 10px; padding: 10px 18px 14px;
    border-top: 1px solid var(--pkg-border); background: var(--pkg-side-bg); flex-wrap: wrap;
}
.bk-player-bar input[type="range"] { flex: 1; min-width: 140px; accent-color: var(--pkg-accent); }
.bk-player-bar .time { font: 600 10.5px/1 ui-monospace, monospace; color: var(--pkg-muted); min-width: 46px; text-align: center; }
.bk-startup { padding: 9px 11px; border-radius: 9px; background: var(--pkg-amber-soft); border: 1px solid var(--pkg-amber-border); color: var(--pkg-amber); font-size: 11px; line-height: 1.5; }
.bk-startup.error { background: var(--pkg-red-soft); border-color: var(--pkg-red-border); color: var(--pkg-red); }
.bk-startup.info { background: var(--pkg-accent-soft); border-color: var(--pkg-accent-border); color: var(--pkg-accent); }
.bk-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
@media (max-width: 780px) {
    .bk-root { flex-direction: column; }
    .bk-side { width: 100%; flex-direction: row; align-items: center; gap: 10px; padding: 10px 12px; overflow-x: auto; border-right: 0; border-bottom: 1px solid var(--pkg-border); }
    .bk-brand small, .bk-side-foot { display: none; }
    .bk-nav { flex-direction: row; gap: 2px; }
    .bk-nav-item { white-space: nowrap; }
    .bk-main { padding: 16px; }
    .bk-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .bk-fields { grid-template-columns: 1fr; }
    .bk-toc { width: 78%; }
}
`;
    document.head.appendChild(style);
}

// ── Shell ───────────────────────────────────────────────────────────────────

function shellMarkup() {
    return `
<div class="bk-root" data-testid="books-root">
  <aside class="bk-side">
    <div class="bk-brand">
      <span class="bk-brand-icon" aria-hidden="true">📚</span>
      <div><strong>Books</strong><small>EthOS package</small></div>
    </div>
    <nav class="bk-nav" aria-label="Books sections">
      <button class="bk-nav-item is-active" type="button" data-view="library" data-testid="books-nav-library">Library</button>
      <button class="bk-nav-item" type="button" data-view="continue" data-testid="books-nav-continue">Continue</button>
      <button class="bk-nav-item" type="button" data-view="audiobooks" data-testid="books-nav-audiobooks">Audiobooks</button>
      <button class="bk-nav-item" type="button" data-view="folders" data-testid="books-nav-folders">Folders &amp; Scan</button>
      <button class="bk-nav-item" type="button" data-view="settings" data-testid="books-nav-settings">Settings</button>
    </nav>
    <div class="bk-side-foot">
      <span class="bk-pill starting" id="bk-status-pill" role="status" aria-live="polite">Loading…</span>
      <span class="bk-side-note" id="bk-side-note">Books stay on your NAS — the library keeps metadata only.</span>
    </div>
  </aside>
  <main class="bk-main">
    <header>
      <h1 id="bk-title">Library</h1>
      <p class="bk-page-sub" id="bk-sub">Your books and audiobooks.</p>
      <p class="bk-status" id="bk-status" role="status" aria-live="polite">Loading library…</p>
    </header>
    <div class="bk-view" id="bk-view"></div>
  </main>
</div>`;
}

const VIEW_META = {
    library: { title: 'Library', sub: 'Every title the scan found in your folders.' },
    continue: { title: 'Continue', sub: 'Pick up where you stopped.' },
    audiobooks: { title: 'Audiobooks', sub: 'Series and single titles, with a player that remembers your place.' },
    folders: { title: 'Folders & Scan', sub: 'Folders are read through the EthOS file API — nothing is copied.' },
    settings: { title: 'Settings', sub: 'Reader and player defaults for your account.' },
};

function setView(view) {
    _state.view = view;
    document.querySelectorAll('.bk-nav-item').forEach((btn) => {
        btn.classList.toggle('is-active', btn.dataset.view === view);
    });
    const meta = VIEW_META[view] || VIEW_META.library;
    const title = document.querySelector('#bk-title');
    const sub = document.querySelector('#bk-sub');
    if (title) title.textContent = meta.title;
    if (sub) sub.textContent = meta.sub;
    renderView();
}

function renderView() {
    const host = document.querySelector('#bk-view');
    if (!host) return;
    if (_state.loading) {
        host.innerHTML = '<section class="bk-panel"><div class="bk-empty">Loading library…</div></section>';
        return;
    }
    if (_state.view === 'folders') return renderFoldersView(host);
    if (_state.view === 'settings') return renderSettingsView(host);
    if (_state.view === 'continue') return renderContinueView(host);
    if (_state.view === 'audiobooks') return renderAudiobooksView(host);
    return renderLibraryView(host);
}

// ── Library view ────────────────────────────────────────────────────────────

function summaryMarkup() {
    const stats = _state.library.stats || {};
    return `
<section class="bk-summary" data-testid="books-summary">
  <div class="bk-tile"><span>Books</span><strong>${Number(stats.books) || 0}</strong></div>
  <div class="bk-tile"><span>Audiobooks</span><strong>${Number(stats.audiobooks) || 0}</strong></div>
  <div class="bk-tile"><span>Finished</span><strong>${Number(stats.finished) || 0}</strong></div>
  <div class="bk-tile"><span>Library size</span><strong>${escHtml(fmtBytes(stats.bytes))}</strong></div>
</section>`;
}

function cardMarkup(book) {
    const progress = progressOf(book);
    const percent = pct(progress?.percent);
    const authorLine = [book.author, book.series, book.format.toUpperCase()].filter(Boolean).join(' · ');
    return `
<article class="bk-card" data-testid="books-card" data-book="${escAttr(book.id)}" data-path="${escAttr(book.path)}">
  <button class="bk-cover-btn" type="button" data-open="${escAttr(book.id)}" data-testid="books-open" title="${escAttr(book.title || '')}">
    <span class="bk-cover-slot" data-cover-slot="${escAttr(book.id)}">${coverMarkup(book)}</span>
    ${progress && percent > 0 ? `<span class="bk-badge">${percent}%${progress.finished ? ' ✓' : ''}</span>` : `<span class="bk-badge">${escAttr(book.format.toUpperCase())}</span>`}
  </button>
  <button class="bk-menu-btn" type="button" data-menu="${escAttr(book.id)}" aria-label="Actions for ${escAttr(book.title || '')}" data-testid="books-menu">⋯</button>
  <div class="bk-card-title">${escHtml(book.title || baseName(book.path))}</div>
  <div class="bk-card-sub" title="${escAttr(authorLine)}">${escHtml(authorLine || 'Unknown author')}</div>
  ${percent > 0 && !progress?.finished ? `<div class="bk-bar"><span style="width:${percent}%"></span></div>` : ''}
</article>`;
}

function renderLibraryView(host) {
    const books = filteredBooks();
    const hasFolders = (_state.library.folders || []).length > 0;
    host.innerHTML = `
${summaryMarkup()}
<section class="bk-panel">
  <div class="bk-toolbar">
    <div>
      <h2>All titles</h2>
      <p class="bk-hint">${books.length} shown of ${(_state.library.books || []).length}</p>
    </div>
    <div class="bk-row">
      <input class="bk-input" id="bk-search" type="search" placeholder="Search title, author, series" value="${escAttr(_state.query)}" data-testid="books-search" aria-label="Search library">
      <select class="bk-select" id="bk-filter" data-testid="books-filter" aria-label="Filter by format">
        <option value="all"${_state.format === 'all' ? ' selected' : ''}>All formats</option>
        <option value="book"${_state.format === 'book' ? ' selected' : ''}>Books only</option>
        <option value="audio"${_state.format === 'audio' ? ' selected' : ''}>Audiobooks only</option>
        <option value="epub"${_state.format === 'epub' ? ' selected' : ''}>EPUB</option>
        <option value="pdf"${_state.format === 'pdf' ? ' selected' : ''}>PDF</option>
      </select>
      <select class="bk-select" id="bk-sort" data-testid="books-sort" aria-label="Sort titles">
        <option value="title"${_state.sort === 'title' ? ' selected' : ''}>Title</option>
        <option value="author"${_state.sort === 'author' ? ' selected' : ''}>Author</option>
        <option value="recent"${_state.sort === 'recent' ? ' selected' : ''}>Recently added</option>
        <option value="size"${_state.sort === 'size' ? ' selected' : ''}>Largest first</option>
      </select>
      <button class="bk-btn" type="button" id="bk-rescan" data-testid="books-rescan"${hasFolders ? '' : ' disabled'}>Rescan all</button>
    </div>
  </div>
</section>
${!hasFolders ? `<section class="bk-panel"><div class="bk-startup info">No scan folder yet. Open <strong>Folders &amp; Scan</strong> and add the folder that holds your books.</div></section>` : ''}
${books.length ? `<section class="bk-grid" data-testid="books-grid">${books.map(cardMarkup).join('')}</section>`
        : `<section class="bk-panel"><div class="bk-empty" data-testid="books-empty">${hasFolders ? 'No title matches this filter.' : 'Add a folder to build your library.'}</div></section>`}
${((_state.library.shared_books || []).length || (_state.sharedFiles || []).length) ? `<section class="bk-panel"><div class="bk-toolbar"><div><h2>Shared with me</h2><p class="bk-hint">Read-only titles other accounts shared with you.</p></div></div>
  <div class="bk-grid" data-testid="books-shared-grid">${[...(_state.library.shared_books || []), ...(_state.sharedFiles || [])].map(sharedCardMarkup).join('')}</div></section>` : ''}`;
}

function renderContinueView(host) {
    const progress = _state.library.progress || {};
    const items = (_state.library.books || [])
        .filter((book) => progress[book.id] && !progress[book.id].finished && (Number(progress[book.id].percent) || 0) > 0)
        .sort((a, b) => String(progress[b.id]?.updated_at || '').localeCompare(String(progress[a.id]?.updated_at || '')))
        .slice(0, 40);
    host.innerHTML = items.length
        ? `<section class="bk-continue" data-testid="books-continue">${items.map((book) => {
            const percent = pct(progress[book.id]?.percent);
            const glyph = book.kind === 'audiobook' ? '🎧' : '📖';
            return `
<button class="bk-continue-card" type="button" data-open="${escAttr(book.id)}" data-testid="books-continue-card">
  <span class="bk-continue-cover" data-cover-slot="${escAttr(book.id)}">${_state.coverUrls.get(book.id) ? `<img class="bk-cover-img" src="${escAttr(_state.coverUrls.get(book.id))}" alt="">` : glyph}</span>
  <span class="bk-continue-body">
    <strong>${escHtml(book.title || baseName(book.path))}</strong>
    <span>${escHtml(book.author || 'Unknown author')} · ${percent}%</span>
    <span class="bk-bar" style="margin-top:6px"><span style="width:${percent}%"></span></span>
  </span>
</button>`;
        }).join('')}</section>`
        : '<section class="bk-panel"><div class="bk-empty" data-testid="books-continue-empty">Nothing in progress yet. Open a title and it will show up here.</div></section>';
}

function renderAudiobooksView(host) {
    const audio = sortBooks((_state.library.books || []).filter((book) => book.kind === 'audiobook'));
    const groups = new Map();
    for (const book of audio) {
        const key = book.series || book.author || 'Audiobooks';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(book);
    }
    if (!audio.length) {
        host.innerHTML = '<section class="bk-panel"><div class="bk-empty" data-testid="books-audio-empty">No audiobooks found yet. Add a folder with .m4b or .mp3 titles and rescan.</div></section>';
        return;
    }
    host.innerHTML = [...groups.entries()].map(([name, books]) => `
<section class="bk-panel" data-testid="books-audio-group">
  <div class="bk-toolbar"><div><h2>${escHtml(name)}</h2><p class="bk-hint">${books.length} title${books.length === 1 ? '' : 's'}</p></div></div>
  <table class="bk-table" style="margin-top:10px">
    <thead><tr><th>Title</th><th>Tracks</th><th class="num">Length</th><th class="actions">Progress</th><th></th></tr></thead>
    <tbody>${books.map((book) => {
        const progress = progressOf(book);
        const percent = pct(progress?.percent);
        return `<tr>
  <td><strong>${escHtml(book.title || baseName(book.path))}</strong><div class="path">${escHtml(book.path)}</div></td>
  <td>${(book.tracks || []).length || 1}</td>
  <td class="num">${escHtml(fmtBytes(book.size))}</td>
  <td class="num">${percent ? `${percent}%` : '—'}</td>
  <td class="actions"><button class="bk-btn small primary" type="button" data-open="${escAttr(book.id)}" data-testid="books-play">${percent ? 'Resume' : 'Play'}</button> <button class="bk-btn small" type="button" data-download="${escAttr(book.id)}" data-testid="books-download" title="Download to your device" aria-label="Download ${escAttr(book.title || baseName(book.path))}">⤓</button></td>
</tr>`;
    }).join('')}</tbody>
  </table>
</section>`).join('');
}

// ── Folders & scan ──────────────────────────────────────────────────────────

function renderFoldersView(host) {
    const folders = _state.library.folders || [];
    const counts = new Map();
    for (const book of _state.library.books || []) {
        for (const folder of folders) {
            if (under(book.path, folder.path)) counts.set(folder.path, (counts.get(folder.path) || 0) + 1);
        }
    }
    host.innerHTML = `
<section class="bk-panel">
  <div class="bk-toolbar">
    <div><h2>Scan folders</h2><p class="bk-hint">Each folder is read with your own permissions through <code>/api/files</code>. Books are never copied.</p></div>
    <div class="bk-row">
      <button class="bk-btn primary" type="button" id="bk-add-folder" data-testid="books-add-folder">Add folder</button>
      <button class="bk-btn" type="button" id="bk-rescan" data-testid="books-rescan"${folders.length ? '' : ' disabled'}>Rescan all</button>
    </div>
  </div>
  ${folders.length ? `<table class="bk-table" style="margin-top:10px" data-testid="books-folders">
    <thead><tr><th>Folder</th><th class="num">Titles</th><th>Last scan</th><th class="actions"></th></tr></thead>
    <tbody>${folders.map((folder) => `<tr>
      <td class="path">${escHtml(folder.path)}</td>
      <td class="num">${counts.get(folder.path) || 0}</td>
      <td>${folder.last_scan ? escHtml(String(folder.last_scan).replace('T', ' ').replace('+00:00', ' UTC')) : '<span class="bk-tag">never</span>'}</td>
      <td class="actions">
        <button class="bk-btn small" type="button" data-share-folder="${escAttr(folder.path)}" data-testid="books-share-folder">Share</button>
        <button class="bk-btn small" type="button" data-scan-root="${escAttr(folder.path)}" data-testid="books-scan-folder">Scan</button>
        <button class="bk-btn small danger" type="button" data-remove-root="${escAttr(folder.path)}" data-testid="books-remove-folder">Remove</button>
      </td>
    </tr>`).join('')}</tbody>
  </table>` : '<div class="bk-empty" style="margin-top:12px" data-testid="books-folders-empty">No folders yet. Add one to start building the library.</div>'}
</section>
<section class="bk-panel" data-testid="books-shared-roots-panel">
  <div class="bk-toolbar"><div><h2>Shared with me</h2><p class="bk-hint">Folders other accounts shared with you — scan them to read the titles here.</p></div></div>
  ${(_state.library.shared_roots || []).length ? `<table class="bk-table" style="margin-top:10px" data-testid="books-shared-roots">
    <thead><tr><th>Folder</th><th>Owner</th><th class="num">Titles</th><th class="actions"></th></tr></thead>
    <tbody>${(_state.library.shared_roots || []).map((root) => `<tr>
      <td class="path">${escHtml(root.path)}</td>
      <td>${escHtml(root.owner || '')}</td>
      <td class="num">${Number(root.count) || 0}</td>
      <td class="actions">
        <button class="bk-btn small" type="button" data-scan-shared="${escAttr(root.path)}" data-testid="books-scan-shared">Scan</button>
        <button class="bk-btn small danger" type="button" data-remove-shared="${escAttr(root.path)}" data-testid="books-remove-shared">Remove</button>
      </td>
    </tr>`).join('')}</tbody>
  </table>` : '<div class="bk-empty" style="margin-top:12px" data-testid="books-shared-empty">Nothing shared with you yet.</div>'}
</section>
<section class="bk-panel">
  <div class="bk-toolbar"><div><h2>What the scan picks up</h2><p class="bk-hint">${ALL_EXTS.map((ext) => `.${ext}`).join(' · ')}</p></div></div>
  <div class="bk-def-grid" style="margin-top:10px">
    <div><span>Books</span><strong>EPUB with title, author, series and cover</strong></div>
    <div><span>PDF</span><strong>First page is used as the cover</strong></div>
    <div><span>Audiobooks</span><strong>.m4b titles and folders of .mp3/.flac tracks</strong></div>
    <div><span>Skipped</span><strong>Hidden folders, @eaDir, #recycle, system folders</strong></div>
  </div>
</section>`;
}

async function addFolder() {
    const picked = await pickFolder();
    if (!picked) return;
    if ((_state.library.folders || []).some((folder) => folder.path === picked)) {
        setStatus('That folder is already in the library.', 'warn');
        return;
    }
    try {
        const folders = [...(_state.library.folders || []).map((folder) => ({ path: folder.path })), { path: picked }];
        const data = await json('folders', { method: 'PUT', body: { folders } });
        _state.library = data;
        renderView();
        setStatus(`Added ${picked}. Scanning…`);
        await scanRoots([picked]);
    } catch (err) {
        setStatus(String(err?.detail || err?.message || err), 'error');
    }
}

async function pickFolder() {
    const opts = { title: 'Choose the folder with your books', roots: ['/home', '/mnt', '/media'], acceptLabel: 'Add folder' };
    try {
        if (typeof _ctx.pickFolder === 'function') {
            const picked = await _ctx.pickFolder(opts);
            if (Array.isArray(picked)) return picked[0] || '';
            return picked || '';
        }
    } catch (err) {
        log.warn('folder picker failed', String(err?.detail || err?.message || err));
    }
    // Older hosts without the picker: keep a typed path as the fallback.
    let typed = '';
    await _ctx.modal.form({
        title: 'Add a scan folder',
        bodyHtml: '<div class="bk-field full"><label for="bk-path">Absolute path</label>'
            + '<input class="bk-input" id="bk-path" name="path" placeholder="/mnt/books" data-testid="books-path-input"></div>',
        confirmLabel: 'Add',
        validate: (values) => (String(values.path || '').startsWith('/') ? '' : 'Use an absolute path'),
        onSubmit: (values) => { typed = String(values.path || '').trim(); },
    });
    return typed;
}

async function removeFolder(path) {
    const ok = await _ctx.modal.confirm('Remove scan folder?', `Titles under ${path} leave the library. The files themselves are not touched.`, {
        confirmLabel: 'Remove folder', danger: true,
    });
    if (!ok) return;
    try {
        const folders = (_state.library.folders || []).filter((folder) => folder.path !== path).map((folder) => ({ path: folder.path }));
        _state.library = await json('folders', { method: 'PUT', body: { folders } });
        renderView();
        setStatus(`Removed ${path}.`);
    } catch (err) {
        setStatus(String(err?.detail || err?.message || err), 'error');
    }
}

// ── Scan engine (browser-driven, core file API) ─────────────────────────────

async function listDir(path) {
    const data = await _ctx.apiJsonFetch(`/api/files?path=${encodeURIComponent(path)}`);
    return Array.isArray(data?.files) ? data.files : [];
}

async function scanRoots(roots, { shared = false } = {}) {
    const folders = shared ? (_state.library.shared_roots || []) : (_state.library.folders || []);
    const targets = (roots && roots.length ? roots : folders.map((folder) => folder.path)).slice();
    if (!targets.length) {
        setStatus('Add a folder first.', 'warn');
        return;
    }
    const task = _ctx.progress.startTask({
        appId: `pkg-${_ctx.pkg.id}`,
        title: 'Scanning books',
        detail: targets.join(', '),
        testIdPrefix: 'books-scan',
    });
    _state.scanCancel = false;
    setPill('Scanning…', 'starting');
    let added = 0;
    let updated = 0;
    let removed = 0;
    try {
        for (const root of targets) {
            const result = await scanOne(root, task, shared);
            added += result.added;
            updated += result.updated;
            removed += result.removed;
            if (_state.scanCancel) break;
        }
        await reloadLibrary();
        const summary = `${added} added · ${updated} refreshed · ${removed} gone`;
        task.finish(_state.scanCancel ? 'cancelled' : 'done', { detail: summary });
        setPill('Ready', 'ready');
        setStatus(`Scan finished — ${summary}.`);
        if (added || removed) {
            _ctx.notifications.toast(`Library updated — ${summary}`, 'success');
        }
    } catch (err) {
        const message = String(err?.detail || err?.message || err);
        task.finish(message === 'cancelled' ? 'cancelled' : 'failed', { detail: message });
        setPill('Ready', 'ready');
        setStatus(message === 'cancelled' ? 'Scan cancelled.' : `Scan failed: ${message}`, message === 'cancelled' ? 'warn' : 'error');
        log.warn('scan failed', message);
    } finally {
        _state.scanCancel = false;
        renderView();
    }
}

async function scanOne(root, task, shared = false) {
    const settings = _state.library.settings || {};
    const exts = new Set((settings.extensions || ALL_EXTS).map((ext) => String(ext).toLowerCase()));
    const found = [];
    const dirImages = new Map();
    const queue = [{ path: root, depth: 0 }];
    let nodes = 0;
    let dirs = 0;

    while (queue.length) {
        if (_state.scanCancel) throw new Error('cancelled');
        const current = queue.shift();
        let entries;
        try {
            entries = await listDir(current.path);
        } catch (err) {
            log.warn('cannot list folder', `${current.path}: ${String(err?.detail || err?.message || err)}`);
            continue;
        }
        dirs += 1;
        for (const entry of entries) {
            nodes += 1;
            if (nodes > MAX_NODES) throw new Error('Folder is too large (over 20 000 entries)');
            const name = String(entry.name || '');
            if (!name || name.startsWith('.')) continue;
            if (entry.is_dir) {
                if (current.depth < MAX_DEPTH && !SKIP_DIRS.has(name)) {
                    queue.push({ path: entry.path, depth: current.depth + 1 });
                }
                continue;
            }
            const ext = extOf(name);
            if (IMAGE_EXTS.has(ext)) {
                const size = Number(entry.size) || 0;
                if (size > 0 && size <= MAX_COVER_BYTES) {
                    let images = dirImages.get(current.path);
                    if (!images) { images = []; dirImages.set(current.path, images); }
                    images.push({ path: entry.path, name, size, ext });
                }
                continue;
            }
            if (!exts.has(ext)) continue;
            found.push({
                path: entry.path, name, ext,
                size: Number(entry.size) || 0,
                modified: Number(entry.modified) || 0,
                dir: current.path, depth: current.depth,
            });
        }
        task.update({ detail: `${found.length} candidates · ${dirs} folders · ${root}` });
    }

    const entries = [];
    const looseAudio = new Map();
    for (const file of found) {
        if (_state.scanCancel) throw new Error('cancelled');
        if (BOOK_EXTS.has(file.ext)) {
            const entry = {
                path: file.path,
                format: file.ext,
                size: file.size,
                modified: file.modified,
                title: fileTitle(file.name),
                _coverDir: file.dir,
                _coverStem: stemOf(file.name),
            };
            if (file.ext === 'epub' && file.size <= MAX_META_BYTES) {
                task.update({ detail: `Reading ${file.name}` });
                const meta = await epubMeta(file.path).catch((err) => {
                    log.debug('epub metadata failed', `${file.path}: ${String(err?.message || err)}`);
                    return null;
                });
                if (meta) {
                    entry.title = meta.title || entry.title;
                    entry.author = meta.author || '';
                    entry.series = meta.series || '';
                    entry.series_index = meta.series_index || 0;
                    entry.language = meta.language || '';
                    if (meta.cover) entry._cover = meta.cover;
                }
            }
            entries.push(entry);
        } else if (file.ext === 'm4b') {
            entries.push({
                path: file.path, format: 'm4b', size: file.size, modified: file.modified,
                title: fileTitle(file.name), author: dirAuthor(file.dir, root),
                _coverDir: file.dir, _coverStem: stemOf(file.name),
                tracks: [{ path: file.path, title: fileTitle(file.name), size: file.size, modified: file.modified }],
            });
        } else {
            if (!looseAudio.has(file.dir)) looseAudio.set(file.dir, []);
            looseAudio.get(file.dir).push(file);
        }
    }

    for (const [dir, items] of looseAudio.entries()) {
        items.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        const first = items[0];
        entries.push({
            path: dir,
            format: first.ext,
            size: items.reduce((sum, item) => sum + item.size, 0),
            modified: Math.max(...items.map((item) => item.modified)),
            title: baseName(dir),
            author: dirAuthor(dir, root),
            _coverDir: dir,
            _coverStem: baseName(dir),
            tracks: items.map((item) => ({
                path: item.path,
                title: fileTitle(item.name),
                size: item.size,
                modified: item.modified,
            })),
        });
    }

    // Durations power “time left”, the progress percentage and the phone
    // player. Only new/changed tracks are opened; a rescan reuses stored values.
    const knownTracks = new Map();
    for (const book of (_state.library.books || [])) {
        for (const track of (book.tracks || [])) {
            if (Number(track.duration) > 0) {
                knownTracks.set(track.path, {
                    duration: Number(track.duration),
                    modified: Number(track.modified) || 0,
                });
            }
        }
    }
    const pendingTracks = [];
    for (const entry of entries) {
        for (const track of (entry.tracks || [])) {
            const known = knownTracks.get(track.path);
            if (known && known.modified === (Number(track.modified) || 0)) track.duration = known.duration;
            else pendingTracks.push(track);
        }
    }
    if (pendingTracks.length) {
        task.update({ detail: `Reading audio metadata · ${root}` });
        await mapLimit(pendingTracks.slice(0, MAX_AUDIO_META), 4, async (track) => {
            if (_state.scanCancel) return;
            try { track.duration = await audioDuration(track.path); } catch { track.duration = 0; }
        });
    }

    // Embedded artwork: ID3 APIC for MP3, `covr` for M4B/M4A. Shared titles
    // skip covers — the service only stores covers for owned books.
    if (!shared) {
        const candidates = entries
            .filter((entry) => (entry.tracks || []).length && !entry._cover)
            .slice(0, MAX_AUDIO_META);
        if (candidates.length) {
            task.update({ detail: `Reading audio covers · ${root}` });
            await mapLimit(candidates, 2, async (entry) => {
                if (_state.scanCancel || entry._cover) return;
                try {
                    const cover = await audioCover(entry.tracks[0].path);
                    if (cover) entry._cover = cover;
                } catch (err) {
                    log.debug('audio cover failed', `${entry.path}: ${String(err?.message || err)}`);
                }
            });
        }
    }

    // Folder artwork: `cover.jpg`, `folder.jpg`, `okladka.*` or a sibling
    // `<book name>.jpg` next to the file/folder. Embedded artwork wins. Generic
    // names are only used when the folder holds a single title — otherwise one
    // `cover.jpg` would end up on every book in a flat directory.
    if (!shared) {
        const perDir = new Map();
        for (const entry of entries) {
            if (!entry._coverDir) continue;
            perDir.set(entry._coverDir, (perDir.get(entry._coverDir) || 0) + 1);
        }
        const missing = entries.filter((entry) => !entry._cover && entry._coverDir);
        if (missing.length) {
            task.update({ detail: `Folder covers · ${root}` });
            await mapLimit(missing, 4, async (entry) => {
                if (_state.scanCancel || entry._cover) return;
                const allowGeneric = (perDir.get(entry._coverDir) || 0) <= 1;
                const image = pickFolderCover(dirImages.get(entry._coverDir), entry._coverStem, allowGeneric);
                if (!image) return;
                try {
                    const cover = await readFolderCover(image);
                    if (cover) entry._cover = cover;
                } catch (err) {
                    log.debug('folder cover failed', `${image.path}: ${String(err?.message || err)}`);
                }
            });
        }
    }

    const sourceBooks = shared ? (_state.library.shared_books || []) : (_state.library.books || []);
    const known = sourceBooks.filter((book) => under(book.path, root)).map((book) => book.path);
    const seen = new Set(entries.map((entry) => entry.path));
    const removedPaths = known.filter((path) => !seen.has(path));

    let added = 0;
    let updated = 0;
    let removed = 0;
    const idByPath = new Map();
    const total = entries.length;
    for (let index = 0; index < entries.length || index === 0; index += SCAN_BATCH) {
        if (_state.scanCancel) throw new Error('cancelled');
        const batch = entries.slice(index, index + SCAN_BATCH).map((entry) => {
            const { _cover, _coverDir, _coverStem, ...rest } = entry;
            return rest;
        });
        const last = index + SCAN_BATCH >= entries.length;
        const result = await json('scan', {
            method: 'POST',
            body: {
                root,
                entries: batch,
                removed: index === 0 ? removedPaths : [],
                done: last,
                shared: !!shared,
            },
        });
        added += Number(result.added) || 0;
        updated += Number(result.updated) || 0;
        removed += Number(result.removed) || 0;
        for (const [path, id] of Object.entries(result.ids || {})) idByPath.set(path, id);
        task.update({ detail: `${Math.min(index + SCAN_BATCH, total)} of ${total} titles · ${root}` });
        if (last) break;
    }

    // Covers are uploaded after the entries exist; ids come from the scan reply.
    // Shared books skip covers: the service only stores covers for owned titles.
    const withCover = shared ? [] : entries.filter((entry) => entry._cover && idByPath.has(entry.path)).slice(0, 400);
    for (const entry of withCover) {
        if (_state.scanCancel) break;
        try {
            await json(`books/${idByPath.get(entry.path)}/cover`, {
                method: 'POST',
                body: { data: entry._cover.data, format: entry._cover.format },
            });
        } catch (err) {
            log.debug('cover upload failed', `${entry.path}: ${String(err?.detail || err?.message || err)}`);
        }
    }

    // PDFs have no embedded cover: render page one with the vendored pdf.js.
    const haveCover = new Set((_state.library.books || []).filter((book) => book.cover).map((book) => book.path));
    const pdfs = shared ? [] : entries.filter((entry) => entry.format === 'pdf' && idByPath.has(entry.path)
        && !haveCover.has(entry.path) && !entry._cover).slice(0, 80);
    if (pdfs.length) {
        await loadVendors();
        for (const entry of pdfs) {
            if (_state.scanCancel || !window.pdfjsLib) break;
            task.update({ detail: `Cover for ${baseName(entry.path)} · ${root}` });
            try {
                const data = await pdfCoverBase64(entry.path);
                if (data) {
                    await json(`books/${idByPath.get(entry.path)}/cover`, { method: 'POST', body: { data, format: 'webp' } });
                }
            } catch (err) {
                log.debug('pdf cover failed', `${entry.path}: ${String(err?.detail || err?.message || err)}`);
            }
        }
    }
    return { added, updated, removed };
}

function dirAuthor(dir, root) {
    if (!dir || dir === root) return '';
    const parent = dir.replace(/\/[^/]+$/, '');
    if (!parent || parent === root || parent === '') return '';
    return baseName(parent);
}

// ── Audio metadata (duration + embedded cover) ───────────────────────────

/** Run `worker` over `items` with at most `limit` promises in flight. */
async function mapLimit(items, limit, worker) {
    const results = new Array(items.length);
    let cursor = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
        for (;;) {
            const index = cursor++;
            if (index >= items.length) return;
            results[index] = await worker(items[index], index);
        }
    });
    await Promise.all(runners);
    return results;
}

/** Duration of one audio file, read from metadata only (no full download). */
function audioDuration(path) {
    return new Promise((resolve) => {
        const audio = new Audio();
        let settled = false;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            try { audio.pause(); } catch { /* ignore */ }
            audio.removeAttribute('src');
            try { audio.load(); } catch { /* ignore */ }
            resolve(value);
        };
        const timer = setTimeout(() => finish(0), 8000);
        audio.preload = 'metadata';
        audio.addEventListener('loadedmetadata', () => finish(Number(audio.duration) || 0), { once: true });
        audio.addEventListener('error', () => finish(0), { once: true });
        audio.src = mediaUrl(path);
    });
}

function base64FromBytes(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunk) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
    }
    return btoa(binary);
}

function stemOf(name) {
    return String(name || '').replace(/\.[^.]+$/, '');
}

/** A file/folder name stem first; generic names only for a single-title folder. */
function pickFolderCover(images, stem, allowGeneric) {
    if (!images?.length) return null;
    const wanted = [];
    if (stem) wanted.push(String(stem).toLowerCase());
    if (allowGeneric) wanted.push(...FOLDER_COVER_STEMS);
    for (const name of wanted) {
        const hit = images.find((image) => stemOf(image.name).toLowerCase() === name);
        if (hit) return hit;
    }
    return null;
}

async function readFolderCover(image) {
    const res = await _ctx.apiFetch(rawUrl(image.path));
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_COVER_BYTES) return null;
    const format = image.ext === 'jpeg' ? 'jpg' : image.ext;
    return { data: base64FromBytes(bytes), format };
}

/** ID3v2 APIC (MP3) → {data, format}. */
function id3Cover(bytes) {
    if (bytes.length < 10) return null;
    if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return null;  // "ID3"
    const version = bytes[3];
    const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14)
        | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
    let offset = 10;
    if (bytes[5] & 0x40) {  // extended header
        if (version >= 4) {
            const ext = ((bytes[offset] & 0x7f) << 21) | ((bytes[offset + 1] & 0x7f) << 14)
                | ((bytes[offset + 2] & 0x7f) << 7) | (bytes[offset + 3] & 0x7f);
            offset += ext;
        } else {
            const ext = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
            offset += 4 + ext;
        }
    }
    const end = Math.min(bytes.length, 10 + size);
    while (offset + 10 <= end) {
        const id = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
        if (!/^[A-Z0-9]{4}$/.test(id)) return null;
        const frameSize = version >= 4
            ? ((bytes[offset + 4] & 0x7f) << 21) | ((bytes[offset + 5] & 0x7f) << 14)
                | ((bytes[offset + 6] & 0x7f) << 7) | (bytes[offset + 7] & 0x7f)
            : (bytes[offset + 4] << 24) | (bytes[offset + 5] << 16) | (bytes[offset + 6] << 8) | bytes[offset + 7];
        if (frameSize <= 0) return null;
        if (id === 'APIC') {
            let position = offset + 10;
            const encoding = bytes[position];
            position += 1;
            let mime = '';
            while (position < end && bytes[position] !== 0) {
                mime += String.fromCharCode(bytes[position]);
                position += 1;
            }
            position += 1;  // MIME terminator
            position += 1;  // picture type
            if (encoding === 1 || encoding === 2) {
                while (position + 1 < end && !(bytes[position] === 0 && bytes[position + 1] === 0)) position += 2;
                position += 2;
            } else {
                while (position < end && bytes[position] !== 0) position += 1;
                position += 1;
            }
            const frameEnd = Math.min(end, offset + 10 + frameSize);
            const data = bytes.subarray(position, frameEnd);
            if (!data.length || data.length > 500 * 1024) return null;
            return { data: base64FromBytes(data), format: mime.includes('png') ? 'png' : 'jpg' };
        }
        offset += 10 + frameSize;
    }
    return null;
}

/** MP4 `covr` atom (M4B/M4A) → {data, format}. */
function mp4Cover(bytes) {
    for (let index = 4; index + 8 < bytes.length; index += 1) {
        if (!(bytes[index] === 0x63 && bytes[index + 1] === 0x6f
                && bytes[index + 2] === 0x76 && bytes[index + 3] === 0x72)) continue;  // "covr"
        const boxSize = (bytes[index - 4] << 24) | (bytes[index - 3] << 16)
            | (bytes[index - 2] << 8) | bytes[index - 1];
        let position = index + 4;
        const boxEnd = Math.min(bytes.length, index - 4 + boxSize);
        while (position + 16 <= boxEnd) {
            const childSize = (bytes[position] << 24) | (bytes[position + 1] << 16)
                | (bytes[position + 2] << 8) | bytes[position + 3];
            const type = String.fromCharCode(bytes[position + 4], bytes[position + 5],
                bytes[position + 6], bytes[position + 7]);
            if (childSize < 8) break;
            if (type === 'data') {
                const dataType = (bytes[position + 8] << 24) | (bytes[position + 9] << 16)
                    | (bytes[position + 10] << 8) | bytes[position + 11];
                const payload = bytes.subarray(position + 16, Math.min(boxEnd, position + childSize));
                if (!payload.length || payload.length > 500 * 1024) return null;
                return { data: base64FromBytes(payload), format: dataType === 14 ? 'png' : 'jpg' };
            }
            position += childSize;
        }
    }
    return null;
}

/**
 * Embedded cover of one audio file. Only the head and the tail are fetched:
 * ID3 sits at the start of an MP3 and MP4 `covr` lives in `moov`, which
 * ffmpeg often puts at the end. A 1 GB audiobook is never downloaded here.
 */
async function audioCover(path) {
    const window = 512 * 1024;
    const chunks = [];
    for (const range of [`bytes=0-${window - 1}`, `bytes=-${window}`]) {
        try {
            const res = await _ctx.apiFetch(rawUrl(path), { headers: { Range: range } });
            if (res.ok) chunks.push(new Uint8Array(await res.arrayBuffer()));
        } catch (err) {
            log.debug('audio cover range failed', `${path}: ${String(err?.message || err)}`);
        }
    }
    for (const chunk of chunks) {
        const cover = id3Cover(chunk) || mp4Cover(chunk);
        if (cover) return cover;
    }
    return null;
}


// ── EPUB metadata & covers ──────────────────────────────────────────────────

function xmlDoc(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    return doc.getElementsByTagName('parsererror').length ? null : doc;
}

function firstText(root, names) {
    for (const name of names) {
        const nodes = root.getElementsByTagName(name);
        for (const node of nodes) {
            const value = String(node.textContent || '').trim();
            if (value) return value;
        }
    }
    return '';
}

function resolveHref(baseDir, href) {
    const clean = String(href || '').split('#')[0].trim();
    if (!clean) return '';
    let decoded = clean;
    try { decoded = decodeURIComponent(clean); } catch { /* keep raw */ }
    const parts = [...(baseDir ? baseDir.split('/') : []), ...decoded.split('/')];
    const out = [];
    for (const part of parts) {
        if (!part || part === '.') continue;
        if (part === '..') out.pop();
        else out.push(part);
    }
    return out.join('/');
}

async function epubMeta(path) {
    await loadVendors();
    if (!window.JSZip) throw new Error('JSZip is not loaded');
    const res = await _ctx.apiFetch(rawUrl(path));
    if (!res.ok) throw new Error(await detailOf(res, `HTTP ${res.status}`));
    const buffer = await res.arrayBuffer();
    const zip = await window.JSZip.loadAsync(buffer);
    const containerText = await zipText(zip, 'META-INF/container.xml');
    const container = containerText ? xmlDoc(containerText) : null;
    const rootfile = container?.getElementsByTagName('rootfile')?.[0];
    const opfPath = rootfile?.getAttribute('full-path') || '';
    if (!opfPath) throw new Error('container.xml has no rootfile');
    const opfText = await zipText(zip, opfPath);
    const opf = opfText ? xmlDoc(opfText) : null;
    if (!opf) throw new Error('OPF is not valid XML');
    const baseDir = opfPath.split('/').slice(0, -1).join('/');

    const meta = {
        title: firstText(opf, ['dc:title', 'title']),
        author: '',
        series: '',
        series_index: 0,
        language: firstText(opf, ['dc:language', 'language']),
    };
    const creators = opf.getElementsByTagName('dc:creator');
    const authors = [];
    for (const node of creators) {
        const name = String(node.textContent || '').trim();
        if (name) authors.push(name);
    }
    meta.author = authors.slice(0, 3).join(', ');

    let coverId = '';
    for (const node of opf.getElementsByTagName('meta')) {
        const name = (node.getAttribute('name') || node.getAttribute('property') || '').toLowerCase();
        const content = node.getAttribute('content') || String(node.textContent || '').trim();
        if (name === 'calibre:series') meta.series = content;
        if (name === 'calibre:series_index') meta.series_index = Number(content) || 0;
        if (name === 'belongs-to-collection' && !meta.series) meta.series = content;
        if (name === 'cover') coverId = content;
    }

    let coverHref = '';
    const items = opf.getElementsByTagName('item');
    for (const item of items) {
        const id = item.getAttribute('id') || '';
        const properties = (item.getAttribute('properties') || '').toLowerCase();
        const href = item.getAttribute('href') || '';
        if (properties.split(/\s+/).includes('cover-image')) coverHref = href;
        else if (coverId && id === coverId) coverHref = href;
    }
    if (coverHref) {
        const coverPath = resolveHref(baseDir, coverHref);
        const file = zip.file(coverPath);
        if (file) {
            try {
                const blob = await file.async('blob');
                meta.cover = { data: await toWebpBase64(blob), format: 'webp' };
            } catch (err) {
                log.debug('cover extraction failed', String(err?.message || err));
            }
        }
    }
    return meta;
}

async function zipText(zip, path) {
    const file = zip.file(path);
    if (!file) return '';
    return file.async('string');
}

async function toWebpBase64(blob, max = 420) {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, max / Math.max(bitmap.width || 1, bitmap.height || 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round((bitmap.width || 1) * scale));
    canvas.height = Math.max(1, Math.round((bitmap.height || 1) * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (typeof bitmap.close === 'function') bitmap.close();
    const dataUrl = canvas.toDataURL('image/webp', 0.82);
    return String(dataUrl.split(',')[1] || '');
}

/** Render page one of a PDF to a small WebP cover (pdf.js, vendored). */
async function pdfCoverBase64(path, max = 420) {
    ensurePdfWorker();
    const buffer = await fetchBookBuffer(path);
    const doc = await window.pdfjsLib.getDocument({ data: buffer }).promise;
    try {
        const page = await doc.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const scale = Math.max(0.2, Math.min(2.5, max / (base.width || 1)));
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        return String(canvas.toDataURL('image/webp', 0.8).split(',')[1] || '');
    } finally {
        try { doc.destroy(); } catch { /* already released */ }
    }
}

// ── Settings view ───────────────────────────────────────────────────────────

function renderSettingsView(host) {
    const settings = _state.library.settings || {};
    host.innerHTML = `
<section class="bk-panel">
  <div class="bk-toolbar"><div><h2>Reader</h2><p class="bk-hint">Applies to EPUB and PDF. “Match EthOS” follows the window theme.</p></div></div>
  <div class="bk-fields" style="margin-top:12px">
    <div class="bk-field"><label for="bk-set-theme">Reading theme</label>
      <select class="bk-select" id="bk-set-theme" data-testid="books-set-theme">
        ${['system', 'light', 'sepia', 'dark'].map((value) => `<option value="${value}"${settings.theme === value ? ' selected' : ''}>${value === 'system' ? 'Match EthOS' : value[0].toUpperCase() + value.slice(1)}</option>`).join('')}
      </select></div>
    <div class="bk-field"><label for="bk-set-font">Typeface</label>
      <select class="bk-select" id="bk-set-font" data-testid="books-set-font">
        <option value="serif"${settings.font_family === 'serif' ? ' selected' : ''}>Serif</option>
        <option value="sans"${settings.font_family === 'sans' ? ' selected' : ''}>Sans-serif</option>
      </select></div>
    <div class="bk-field"><label for="bk-set-size">Font size (%)</label>
      <input class="bk-input" id="bk-set-size" type="number" min="70" max="220" value="${Number(settings.font_size) || 100}" data-testid="books-set-size"></div>
    <div class="bk-field"><label for="bk-set-line">Line height</label>
      <input class="bk-input" id="bk-set-line" type="number" min="1.2" max="2.4" step="0.05" value="${Number(settings.line_height) || 1.6}" data-testid="books-set-line"></div>
    <div class="bk-field"><label for="bk-set-margin">Margins</label>
      <select class="bk-select" id="bk-set-margin" data-testid="books-set-margin">
        ${[1, 2, 3, 4].map((value) => `<option value="${value}"${Number(settings.margin) === value ? ' selected' : ''}>${value === 1 ? 'Narrow' : value === 2 ? 'Normal' : value === 3 ? 'Wide' : 'Extra wide'}</option>`).join('')}
      </select></div>
    <div class="bk-field"><label for="bk-set-flow">Page flow</label>
      <select class="bk-select" id="bk-set-flow" data-testid="books-set-flow">
        <option value="paginated"${settings.flow === 'paginated' ? ' selected' : ''}>Paginated</option>
        <option value="scrolled"${settings.flow === 'scrolled' ? ' selected' : ''}>Scrolled</option>
      </select></div>
  </div>
</section>
<section class="bk-panel">
  <div class="bk-toolbar"><div><h2>Audiobooks</h2><p class="bk-hint">Playback defaults; the player bar can change them for the current session.</p></div></div>
  <div class="bk-fields" style="margin-top:12px">
    <div class="bk-field"><label for="bk-set-skip">Skip back/forward (seconds)</label>
      <input class="bk-input" id="bk-set-skip" type="number" min="5" max="300" value="${Number(settings.skip_seconds) || 30}" data-testid="books-set-skip"></div>
    <div class="bk-field"><label for="bk-set-speed">Default speed</label>
      <input class="bk-input" id="bk-set-speed" type="number" min="0.5" max="3" step="0.05" value="${Number(settings.speed) || 1}" data-testid="books-set-speed"></div>
  </div>
</section>
<section class="bk-panel">
  <div class="bk-toolbar"><div><h2>Scan</h2><p class="bk-hint">File types the scanner looks for. Changes apply to the next scan.</p></div></div>
  <div class="bk-row" style="margin-top:12px">
    ${ALL_EXTS.map((ext) => `<label class="bk-tag" style="cursor:pointer">
      <input type="checkbox" data-ext="${ext}"${(settings.extensions || ALL_EXTS).includes(ext) ? ' checked' : ''}> .${ext}
    </label>`).join('')}
  </div>
</section>
<section class="bk-panel">
  <div class="bk-toolbar"><div><h2>Library</h2><p class="bk-hint">${((_state.library.books || []).length)} titles · ${escHtml(fmtBytes((_state.library.stats || {}).bytes))} · ${((_state.library.folders || []).length)} folders</p></div>
    <div class="bk-row"><button class="bk-btn" type="button" id="bk-rescan" data-testid="books-rescan">Rescan all</button></div></div>
</section>`;
}

async function saveSettings(patch) {
    try {
        const data = await json('settings', { method: 'PUT', body: patch });
        _state.library.settings = data.settings;
        setStatus('Settings saved.');
        if (_state.reading) applyReadingTheme();
    } catch (err) {
        setStatus(String(err?.detail || err?.message || err), 'error');
    }
}

// ── Reader ──────────────────────────────────────────────────────────────────

function readerThemeName() {
    const settings = _state.library.settings || {};
    if (settings.theme && settings.theme !== 'system') return settings.theme;
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function readerTheme() {
    return READ_THEMES[readerThemeName()] || READ_THEMES.light;
}

/** CSS injected into every EPUB chapter document (epub.js renders in an iframe). */
function epubStyles() {
    const theme = readerTheme();
    const settings = _state.library.settings || {};
    const pad = 4 * (Number(settings.margin) || 2);
    const family = settings.font_family === 'sans' ? 'system-ui, sans-serif' : 'Georgia, "Iowan Old Style", serif';
    return `
html, body { background: ${theme.bg} !important; color: ${theme.text} !important; }
body {
    padding: 0 ${pad}% !important;
    max-width: 46em;
    margin: 0 auto !important;
    font-family: ${family} !important;
    font-size: ${Number(settings.font_size) || 100}% !important;
    line-height: ${Number(settings.line_height) || 1.6} !important;
    text-align: left;
}
p, li, div, span, blockquote, td { color: ${theme.text}; }
h1, h2, h3, h4 { color: ${theme.text}; line-height: 1.25; }
a { color: ${theme.link}; }
img, svg { max-width: 100% !important; height: auto !important; }
::selection { background: rgba(37, 99, 235, 0.28); }`;
}

function applyEpubContentTheme(contents) {
    const doc = contents?.document;
    if (!doc || !doc.head) return;
    let style = doc.getElementById('ethos-books-theme');
    if (!style) {
        style = doc.createElement('style');
        style.id = 'ethos-books-theme';
        doc.head.appendChild(style);
    }
    style.textContent = epubStyles();
    if (doc.documentElement) doc.documentElement.style.background = readerTheme().bg;
}

function openReaderShell(book, extraActions = '') {
    closeReader();
    const host = document.querySelector('.bk-root');
    const overlay = document.createElement('div');
    overlay.className = 'bk-reader';
    overlay.dataset.testid = 'books-reader';
    overlay.innerHTML = `
  <div class="bk-reader-bar">
    <button class="bk-btn small" type="button" data-reader-close data-testid="books-reader-back">← Library</button>
    <strong data-testid="books-reader-title">${escHtml(book.title || baseName(book.path))}</strong>
    <div class="bk-row">${extraActions}<button class="bk-btn small" type="button" data-reader-download data-testid="books-reader-download" title="Download to your device">⤓ ${escHtml(downloadLabel(book))}</button><button class="bk-btn small" type="button" data-reader-close data-testid="books-reader-close">Close</button></div>
  </div>
  <div class="bk-reader-body" data-reader-body></div>
  <div class="bk-reader-foot" data-reader-foot></div>`;
    host.appendChild(overlay);
    overlay.tabIndex = -1;
    overlay.querySelectorAll('[data-reader-close]').forEach((btn) => {
        btn.addEventListener('click', closeReader);
    });
    overlay.querySelectorAll('[data-reader-download]').forEach((btn) => {
        btn.addEventListener('click', () => downloadBook(book));
    });
    overlay.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeReader();
    });
    _state.reading = { book, kind: book.format, overlay, cleanup: null };
    try { overlay.focus({ preventScroll: true }); } catch { /* not focusable yet */ }
    return overlay;
}

function closeReader() {
    const reading = _state.reading;
    if (!reading) return;
    _state.reading = null;
    try { if (typeof reading.cleanup === 'function') reading.cleanup(); } catch (err) { log.debug('reader cleanup failed', String(err?.message || err)); }
    _flushProgress();
    if (reading.overlay?.isConnected) reading.overlay.remove();
    renderView();
}

function applyReadingTheme() {
    const reading = _state.reading;
    if (!reading) return;
    const theme = readerTheme();
    if (reading.rendition) {
        try {
            (reading.rendition.getContents?.() || []).forEach(applyEpubContentTheme);
        } catch (err) {
            log.debug('theme refresh failed', String(err?.message || err));
        }
        reading.rendition.themes.fontSize(`${Number((_state.library.settings || {}).font_size) || 100}%`);
    }
    if (reading.pdfCanvasHost) {
        // PDF pages are rendered images: only the surroundings follow the theme.
        reading.pdfCanvasHost.style.background = theme.bg;
    }
}

async function fetchBookBuffer(path) {
    const res = await _ctx.apiFetch(rawUrl(path));
    if (!res.ok) throw new Error(await detailOf(res, `HTTP ${res.status}`));
    return res.arrayBuffer();
}

async function openBook(book) {
    setStatus(`Opening ${book.title || baseName(book.path)}…`);
    if (book.kind === 'audiobook' || AUDIO_EXTS.has(book.format)) return openPlayer(book);
    if (book.format === 'pdf') return openPdf(book);
    return openEpub(book);
}

async function openEpub(book) {
    await loadVendors();
    if (!window.ePub) {
        readerNote('The EPUB reader failed to load. Reinstall the package.', 'error');
        return;
    }
    const overlay = openReaderShell(book, '<button class="bk-btn small" type="button" data-toc data-testid="books-reader-toc">Contents</button>');
    const body = overlay.querySelector('[data-reader-body]');
    body.innerHTML = '<div class="bk-epub-host" data-epub-host></div>';
    const foot = overlay.querySelector('[data-reader-foot]');
    foot.innerHTML = '<span data-reader-position>Loading…</span>';
    const hostEl = body.querySelector('[data-epub-host]');

    try {
        const buffer = await fetchBookBuffer(book.path);
        const epubBook = window.ePub(buffer);
        const settings = _state.library.settings || {};
        const rendition = epubBook.renderTo(hostEl, {
            width: '100%',
            height: '100%',
            flow: settings.flow === 'scrolled' ? 'scrolled-doc' : 'paginated',
            spread: 'none',
            allowScriptedContent: false,
        });
        _state.reading.rendition = rendition;
        _state.reading.epub = epubBook;
        rendition.hooks.content.register(applyEpubContentTheme);
        applyReadingTheme();

        const progress = progressOf(book) || {};
        const position = foot.querySelector('[data-reader-position]');
        let lastPercent = Number(progress.percent) || 0;

        rendition.on('relocated', (location) => {
            const start = location?.start || {};
            const percent = Number(start.percentage);
            const value = Number.isFinite(percent) ? Math.max(0, Math.min(1, percent)) : lastPercent;
            lastPercent = value;
            if (position) position.textContent = `${pct(value)}% · ${start.displayed?.page || 1} / ${location?.start?.displayed?.total || '?'}`;
            queueProgress(book, { percent: value, locator: start.cfi || '', position_s: 0, finished: value >= 0.995 });
        });

        await rendition.display(progress.locator || undefined);
        applyReadingTheme(); // re-apply once the first view exists (margins/typography)

        rendition.on('keyup', (event) => {
            if (event?.key === 'ArrowLeft') rendition.prev();
            if (event?.key === 'ArrowRight') rendition.next();
        });

        overlay.querySelector('[data-toc]')?.addEventListener('click', async () => {
            let nav = null;
            try { nav = await epubBook.loaded.navigation; } catch (err) { log.debug('toc failed', String(err?.message || err)); }
            const toc = nav?.toc || [];
            const existing = overlay.querySelector('.bk-toc');
            if (existing) { existing.remove(); return; }
            const panel = document.createElement('div');
            panel.className = 'bk-toc';
            panel.dataset.testid = 'books-reader-toc-panel';
            panel.innerHTML = toc.length
                ? toc.map((item) => {
                    const sub = Array.isArray(item.subitems) ? item.subitems : [];
                    return `<button type="button" data-href="${escAttr(item.href || '')}">${escHtml(item.label || '')}</button>`
                        + sub.map((child) => `<button class="sub" type="button" data-href="${escAttr(child.href || '')}">${escHtml(child.label || '')}</button>`).join('');
                }).join('')
                : '<div class="bk-empty">This book has no table of contents.</div>';
            panel.addEventListener('click', (event) => {
                const btn = event.target.closest('[data-href]');
                if (!btn) return;
                rendition.display(btn.dataset.href);
                panel.remove();
            });
            body.appendChild(panel);
        });

        _state.reading.cleanup = () => {
            try { epubBook.destroy(); } catch { /* already gone */ }
        };
        setStatus('');
    } catch (err) {
        const message = String(err?.detail || err?.message || err);
        readerNote(`Could not open the book: ${message}`, 'error');
        body.innerHTML = `<div class="bk-empty" style="margin:20px">Could not open this EPUB: ${escHtml(message)}</div>`;
    }
}

async function openPdf(book) {
    await loadVendors();
    const overlay = openReaderShell(book, '');
    const body = overlay.querySelector('[data-reader-body]');
    const foot = overlay.querySelector('[data-reader-foot]');
    const progress = progressOf(book) || {};
    body.innerHTML = '<div class="bk-pdf-scroll" data-pdf-scroll></div>';
    const scroll = body.querySelector('[data-pdf-scroll]');
    _state.reading.pdfCanvasHost = scroll;

    const fallback = () => {
        scroll.innerHTML = `<iframe title="${escAttr(book.title || 'PDF')}" style="width:100%;height:100%;border:0;border-radius:8px" src="${escAttr(mediaUrl(book.path))}" data-testid="books-pdf-frame"></iframe>`;
        foot.innerHTML = `<span>Inline preview</span><a class="bk-btn small" href="${escAttr(mediaUrl(book.path))}" target="_blank" rel="noopener" data-testid="books-pdf-open">Open in new tab</a>`;
    };

    if (!window.pdfjsLib) { fallback(); return; }
    try {
        ensurePdfWorker();
        const buffer = await fetchBookBuffer(book.path);
        const doc = await window.pdfjsLib.getDocument({ data: buffer }).promise;
        let pageNumber = Math.max(1, Math.min(doc.numPages, Number(progress.locator) || 1));
        let zoom = 1;
        let rendering = false;

        foot.innerHTML = `
  <button class="bk-btn small" type="button" data-page-prev data-testid="books-pdf-prev" aria-label="Previous page">◀</button>
  <input class="bk-input" type="number" min="1" max="${doc.numPages}" value="${pageNumber}" data-page-input style="width:76px" aria-label="Page" data-testid="books-pdf-page">
  <span>/ ${doc.numPages}</span>
  <button class="bk-btn small" type="button" data-page-next data-testid="books-pdf-next" aria-label="Next page">▶</button>
  <span style="flex:1"></span>
  <button class="bk-btn small" type="button" data-zoom-out aria-label="Zoom out">−</button>
  <button class="bk-btn small" type="button" data-zoom-in aria-label="Zoom in">+</button>
  <a class="bk-btn small" href="${escAttr(mediaUrl(book.path))}" target="_blank" rel="noopener">Open in new tab</a>`;

        const render = async () => {
            if (rendering) return;
            rendering = true;
            try {
                const page = await doc.getPage(pageNumber);
                const base = page.getViewport({ scale: 1 });
                const available = Math.max(320, (scroll.clientWidth || 640) - 40);
                const scale = Math.max(0.3, Math.min(3, (available / base.width) * zoom));
                const viewport = page.getViewport({ scale });
                const dpr = Math.min(2, window.devicePixelRatio || 1);
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(viewport.width * dpr);
                canvas.height = Math.round(viewport.height * dpr);
                canvas.style.width = `${Math.round(viewport.width)}px`;
                canvas.style.height = `${Math.round(viewport.height)}px`;
                canvas.dataset.testid = 'books-pdf-canvas';
                const context = canvas.getContext('2d');
                scroll.replaceChildren(canvas);
                await page.render({ canvasContext: context, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null }).promise;
                const input = foot.querySelector('[data-page-input]');
                if (input) input.value = String(pageNumber);
                applyReadingTheme();
                queueProgress(book, {
                    percent: pageNumber / doc.numPages,
                    locator: String(pageNumber),
                    position_s: 0,
                    finished: pageNumber >= doc.numPages,
                });
            } catch (err) {
                log.warn('pdf page render failed', String(err?.message || err));
            } finally {
                rendering = false;
            }
        };

        foot.addEventListener('click', (event) => {
            if (event.target.closest('[data-page-prev]') && pageNumber > 1) { pageNumber -= 1; render(); }
            else if (event.target.closest('[data-page-next]') && pageNumber < doc.numPages) { pageNumber += 1; render(); }
            else if (event.target.closest('[data-zoom-in]')) { zoom = Math.min(3, zoom + 0.2); render(); }
            else if (event.target.closest('[data-zoom-out]')) { zoom = Math.max(0.5, zoom - 0.2); render(); }
        });
        foot.querySelector('[data-page-input]')?.addEventListener('change', (event) => {
            const value = Number(event.target.value) || 1;
            pageNumber = Math.max(1, Math.min(doc.numPages, value));
            render();
        });
        overlay.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowLeft' && pageNumber > 1) { pageNumber -= 1; render(); }
            if (event.key === 'ArrowRight' && pageNumber < doc.numPages) { pageNumber += 1; render(); }
        });
        _state.reading.cleanup = () => { try { doc.destroy(); } catch { /* gone */ } };
        await render();
        setStatus('');
    } catch (err) {
        log.warn('pdf read failed', String(err?.message || err));
        fallback();
    }
}

async function openPlayer(book) {
    const overlay = openReaderShell(book);
    const body = overlay.querySelector('[data-reader-body]');
    const settings = _state.library.settings || {};
    const tracks = (book.tracks && book.tracks.length) ? book.tracks : [{ path: book.path, title: book.title }];
    const progress = progressOf(book) || {};
    let index = Math.max(0, Math.min(tracks.length - 1, Number(progress.locator) || 0));
    let speed = Number(settings.speed) || 1;
    let skip = Number(settings.skip_seconds) || 30;
    let sleepTimer = null;

    body.innerHTML = `
<div class="bk-player">
  <div class="bk-player-head">
    <div class="bk-player-art" data-cover-slot="${escAttr(book.id)}">${_state.coverUrls.get(book.id) ? `<img class="bk-cover-img" src="${escAttr(_state.coverUrls.get(book.id))}" alt="">` : '🎧'}</div>
    <div class="bk-player-meta">
      <h2>${escHtml(book.title || baseName(book.path))}</h2>
      <p>${escHtml(book.author || 'Unknown author')}${book.series ? ` · ${escHtml(book.series)}` : ''}</p>
      <p>${tracks.length} track${tracks.length === 1 ? '' : 's'} · ${escHtml(fmtBytes(book.size))}</p>
    </div>
  </div>
  <div class="bk-tracks" data-testid="books-tracks">${tracks.map((track, i) => `
    <div class="bk-track${i === index ? ' is-active' : ''}">
      <button class="bk-track-main" type="button" data-track="${i}" data-testid="books-track">
        <span class="num">${i + 1}</span><span class="name">${escHtml(track.title || baseName(track.path))}</span>
        <span class="dur">${escHtml(fmtBytes(track.size))}</span>
      </button>
      <button class="bk-track-dl" type="button" data-track-download="${i}" data-testid="books-track-download" title="Download this track" aria-label="Download ${escAttr(track.title || baseName(track.path))}">⤓</button>
    </div>`).join('')}</div>
</div>`;
    const foot = overlay.querySelector('[data-reader-foot]');
    foot.innerHTML = `
  <button class="bk-btn small" type="button" data-seek-back data-testid="books-audio-back" aria-label="Skip back">&minus;${skip}s</button>
  <button class="bk-btn small primary" type="button" data-play data-testid="books-audio-play" aria-label="Play">▶</button>
  <button class="bk-btn small" type="button" data-seek-fwd data-testid="books-audio-fwd" aria-label="Skip forward">+${skip}s</button>
  <span class="time" data-time>0:00</span>
  <input type="range" min="0" max="1000" value="0" data-seek aria-label="Seek">
  <span class="time" data-duration>0:00</span>
  <select class="bk-select" data-speed aria-label="Playback speed" data-testid="books-audio-speed">
    ${[0.75, 1, 1.25, 1.5, 1.75, 2].map((value) => `<option value="${value}"${Math.abs(value - speed) < 0.01 ? ' selected' : ''}>${value}×</option>`).join('')}
  </select>
  <select class="bk-select" data-sleep aria-label="Sleep timer" data-testid="books-audio-sleep">
    <option value="0">Sleep off</option>
    <option value="15">15 min</option>
    <option value="30">30 min</option>
    <option value="45">45 min</option>
    <option value="60">60 min</option>
  </select>`;

    const audio = new Audio();
    audio.preload = 'metadata';
    const ui = {
        play: foot.querySelector('[data-play]'),
        time: foot.querySelector('[data-time]'),
        duration: foot.querySelector('[data-duration]'),
        seek: foot.querySelector('[data-seek]'),
    };

    const trackPercent = () => (audio.duration ? audio.currentTime / audio.duration : 0);
    const overall = () => Math.max(0, Math.min(1, (index + trackPercent()) / Math.max(1, tracks.length)));

    const save = () => queueProgress(book, {
        percent: overall(),
        locator: String(index),
        position_s: audio.currentTime || 0,
        finished: index === tracks.length - 1 && audio.duration > 0 && trackPercent() >= 0.995,
    });

    const load = (nextIndex, atSeconds = 0) => {
        index = Math.max(0, Math.min(tracks.length - 1, nextIndex));
        audio.src = mediaUrl(tracks[index].path);
        audio.playbackRate = speed;
        overlay.querySelectorAll('.bk-track').forEach((row) => {
            row.classList.toggle('is-active', Number(row.dataset.track) === index);
        });
        if (atSeconds > 0) {
            const seekOnce = () => { try { audio.currentTime = atSeconds; } catch { /* not seekable yet */ } audio.removeEventListener('loadedmetadata', seekOnce); };
            audio.addEventListener('loadedmetadata', seekOnce);
        }
    };

    audio.addEventListener('loadedmetadata', () => {
        ui.duration.textContent = fmtTime(audio.duration);
    });
    audio.addEventListener('timeupdate', () => {
        ui.time.textContent = fmtTime(audio.currentTime);
        ui.seek.value = String(Math.round(trackPercent() * 1000));
        if (Math.floor(audio.currentTime) % 5 === 0) save();
    });
    audio.addEventListener('play', () => { ui.play.textContent = '⏸'; save(); });
    audio.addEventListener('pause', () => { ui.play.textContent = '▶'; save(); });
    audio.addEventListener('ended', () => {
        if (index < tracks.length - 1) { load(index + 1); audio.play().catch(() => {}); }
        else { save(); readerNote('Finished this audiobook.'); }
    });
    audio.addEventListener('error', () => {
        readerNote(`Could not play ${baseName(tracks[index].path)} — the file may have moved.`, 'error');
    });

    foot.addEventListener('click', (event) => {
        if (event.target.closest('[data-play]')) {
            if (audio.paused) audio.play().catch((err) => readerNote(String(err?.message || err), 'error'));
            else audio.pause();
        } else if (event.target.closest('[data-seek-back]')) {
            audio.currentTime = Math.max(0, audio.currentTime - skip);
        } else if (event.target.closest('[data-seek-fwd]')) {
            audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + skip);
        }
    });
    ui.seek.addEventListener('input', () => {
        if (audio.duration) audio.currentTime = (Number(ui.seek.value) / 1000) * audio.duration;
    });
    foot.querySelector('[data-speed]')?.addEventListener('change', (event) => {
        speed = Number(event.target.value) || 1;
        audio.playbackRate = speed;
    });
    foot.querySelector('[data-sleep]')?.addEventListener('change', (event) => {
        const minutes = Number(event.target.value) || 0;
        if (sleepTimer) clearTimeout(sleepTimer);
        sleepTimer = null;
        if (minutes > 0) {
            sleepTimer = setTimeout(() => {
                audio.pause();
                readerNote(`Sleep timer paused playback after ${minutes} minutes.`);
            }, minutes * 60000);
            readerNote(`Sleep timer set for ${minutes} minutes.`);
        }
    });
    body.addEventListener('click', (event) => {
        const download = event.target.closest('[data-track-download]');
        if (download) {
            const track = tracks[Number(download.dataset.trackDownload)];
            if (track) downloadBook(book, [track.path]);
            return;
        }
        const row = event.target.closest('[data-track]');
        if (!row) return;
        load(Number(row.dataset.track));
        audio.play().catch((err) => readerNote(String(err?.message || err), 'error'));
    });

    const startAt = Number(progress.position_s) || 0;
    load(index, startAt);
    _state.reading.cleanup = () => {
        save();
        if (sleepTimer) clearTimeout(sleepTimer);
        try { audio.pause(); } catch { /* gone */ }
        audio.removeAttribute('src');
        audio.load();
    };
    setStatus('');
    audio.play().catch(() => {
        // Autoplay can be blocked until the user interacts — the Play button works.
        readerNote('Press play to start listening.');
    });
}

// ── Progress queue ──────────────────────────────────────────────────────────

function queueProgress(book, payload) {
    _state.pendingProgress = { book, payload };
    if (_state.progressTimer) clearTimeout(_state.progressTimer);
    _state.progressTimer = setTimeout(() => { _flushProgress(); }, 2500);
}

async function _flushProgress() {
    const pending = _state.pendingProgress;
    if (!pending) return;
    _state.pendingProgress = null;
    if (_state.progressTimer) { clearTimeout(_state.progressTimer); _state.progressTimer = null; }
    try {
        const result = await json(`books/${pending.book.id}/progress`, { method: 'PUT', body: pending.payload });
        _state.library.progress = _state.library.progress || {};
        _state.library.progress[pending.book.id] = result.progress;
    } catch (err) {
        log.warn('progress save failed', `${pending.book.path}: ${String(err?.detail || err?.message || err)}`);
    }
}

// ── Book actions ────────────────────────────────────────────────────────────

function findBook(id) {
    return (_state.library.books || []).find((book) => book.id === id) || null;
}

function findVisibleBook(path) {
    return [...(_state.library.shared_books || []), ...(_state.sharedFiles || [])]
        .find((book) => book.path === path) || null;
}

function closeMenus() {
    document.querySelectorAll('.bk-menu').forEach((menu) => menu.remove());
}

function toggleMenu(book, anchor) {
    const existing = anchor.parentElement.querySelector('.bk-menu');
    closeMenus();
    if (existing) return;
    const menu = document.createElement('div');
    menu.className = 'bk-menu';
    menu.dataset.testid = 'books-menu-panel';
    menu.innerHTML = `
  <button type="button" data-act="open" data-testid="books-act-open">${book.kind === 'audiobook' ? 'Play' : 'Read'}</button>
  <button type="button" data-act="download" data-testid="books-act-download">⤓ ${book.kind === 'audiobook' ? 'Download tracks' : 'Download'}</button>
  <button type="button" data-act="details" data-testid="books-act-details">Edit details</button>
  <button type="button" data-act="reset" data-testid="books-act-reset">Reset progress</button>
  <button type="button" class="danger" data-act="remove" data-testid="books-act-remove">Remove from library</button>`;
    menu.addEventListener('click', async (event) => {
        const btn = event.target.closest('[data-act]');
        if (!btn) return;
        const action = btn.dataset.act;
        closeMenus();
        if (action === 'open') return openBook(book);
        if (action === 'download') return downloadBook(book);
        if (action === 'details') return editDetails(book);
        if (action === 'reset') return resetProgress(book);
        if (action === 'remove') return removeBook(book);
    });
    anchor.parentElement.appendChild(menu);
}

async function editDetails(book) {
    await _ctx.modal.form({
        title: 'Edit details',
        bodyHtml: `
  <div class="bk-fields">
    <div class="bk-field full"><label for="bk-meta-title">Title</label>
      <input class="bk-input" id="bk-meta-title" name="title" value="${escAttr(book.title || '')}"></div>
    <div class="bk-field"><label for="bk-meta-author">Author</label>
      <input class="bk-input" id="bk-meta-author" name="author" value="${escAttr(book.author || '')}"></div>
    <div class="bk-field"><label for="bk-meta-series">Series</label>
      <input class="bk-input" id="bk-meta-series" name="series" value="${escAttr(book.series || '')}"></div>
    <div class="bk-field"><label for="bk-meta-index">Series number</label>
      <input class="bk-input" id="bk-meta-index" name="series_index" type="number" min="0" step="0.1" value="${Number(book.series_index) || 0}"></div>
  </div>
  <p class="bk-hint" style="margin:12px 0 0">Manual values survive a rescan.</p>`,
        confirmLabel: 'Save',
        validate: (values) => (String(values.title || '').trim() ? '' : 'A title is required'),
        onSubmit: async (values) => {
            await json(`books/${book.id}/meta`, {
                method: 'PUT',
                body: {
                    title: values.title,
                    author: values.author,
                    series: values.series,
                    series_index: Number(values.series_index) || 0,
                },
            });
            await reloadLibrary();
            setStatus('Details saved.');
        },
    });
}

async function resetProgress(book) {
    try {
        await json(`books/${book.id}/progress`, {
            method: 'PUT',
            body: { percent: 0, locator: '', position_s: 0, finished: false },
        });
        _state.library.progress = _state.library.progress || {};
        delete _state.library.progress[book.id];
        renderView();
        setStatus('Progress reset.');
    } catch (err) {
        setStatus(String(err?.detail || err?.message || err), 'error');
    }
}

async function removeBook(book) {
    const ok = await _ctx.modal.confirm('Remove from library?', `${book.title || baseName(book.path)} leaves the library index. The file on the NAS is not deleted.`, {
        confirmLabel: 'Remove', danger: true,
    });
    if (!ok) return;
    try {
        await json(`books/${book.id}`, { method: 'DELETE' });
        const url = _state.coverUrls.get(book.id);
        if (url) { URL.revokeObjectURL(url); _state.coverUrls.delete(book.id); }
        await reloadLibrary();
        setStatus('Removed from the library.');
    } catch (err) {
        setStatus(String(err?.detail || err?.message || err), 'error');
    }
}

// ── Data ────────────────────────────────────────────────────────────────────

async function reloadLibrary() {
    const data = await json('library');
    _state.library = {
        folders: Array.isArray(data.folders) ? data.folders : [],
        books: Array.isArray(data.books) ? data.books : [],
        shared_roots: Array.isArray(data.shared_roots) ? data.shared_roots : [],
        shared_books: Array.isArray(data.shared_books) ? data.shared_books : [],
        progress: data.progress && typeof data.progress === 'object' ? data.progress : {},
        settings: data.settings || {},
        stats: data.stats || {},
    };
    _state.loading = false;
    updateSideNote();
    renderView();
}

function updateSideNote() {
    const note = document.querySelector('#bk-side-note');
    if (!note) return;
    const books = _state.library.books || [];
    const folders = _state.library.folders || [];
    note.textContent = folders.length
        ? `${books.length} titles · ${fmtBytes((_state.library.stats || {}).bytes)} · ${folders.length} folder${folders.length === 1 ? '' : 's'}`
        : 'Add the folder that holds your books to get started.';
}

// ── Wiring ──────────────────────────────────────────────────────────────────

function attachEvents(container) {
    container.addEventListener('click', async (event) => {
        const navBtn = event.target.closest('[data-view]');
        if (navBtn) { closeMenus(); setView(navBtn.dataset.view); return; }

        const openBtn = event.target.closest('[data-open]');
        if (openBtn) {
            const book = findBook(openBtn.dataset.open);
            if (book) openBook(book);
            return;
        }
        const menuBtn = event.target.closest('[data-menu]');
        if (menuBtn) {
            const book = findBook(menuBtn.dataset.menu);
            if (book) toggleMenu(book, menuBtn);
            return;
        }
        const downloadBtn = event.target.closest('[data-download]');
        if (downloadBtn) {
            const book = findBook(downloadBtn.dataset.download);
            if (book) downloadBook(book);
            return;
        }
        const downloadShared = event.target.closest('[data-download-shared]');
        if (downloadShared) {
            const book = findVisibleBook(downloadShared.dataset.downloadShared);
            if (book) downloadBook(book);
            return;
        }
        if (!event.target.closest('.bk-menu')) closeMenus();

        if (event.target.closest('#bk-rescan')) { scanRoots([]); return; }
        if (event.target.closest('#bk-add-folder')) { addFolder(); return; }
        const scanBtn = event.target.closest('[data-scan-root]');
        if (scanBtn) { scanRoots([scanBtn.dataset.scanRoot]); return; }
        const removeBtn = event.target.closest('[data-remove-root]');
        if (removeBtn) { removeFolder(removeBtn.dataset.removeRoot); return; }
        const sharedScan = event.target.closest('[data-scan-shared]');
        if (sharedScan) { scanRoots([sharedScan.dataset.scanShared], { shared: true }); return; }
        const sharedRemove = event.target.closest('[data-remove-shared]');
        if (sharedRemove) { removeSharedRoot(sharedRemove.dataset.removeShared); return; }
        const shareFolder = event.target.closest('[data-share-folder]');
        if (shareFolder) {
            if (_ctx.share) {
                _ctx.share.open({ kind: 'path', resource: shareFolder.dataset.shareFolder })
                    .then(() => syncSharedRoots());
            } else {
                setStatus('This EthOS version does not support user sharing.', 'warn');
            }
            return;
        }
        const openShared = event.target.closest('[data-open-shared]');
        if (openShared) {
            const path = openShared.dataset.openShared;
            const book = [...(_state.library.shared_books || []), ...(_state.sharedFiles || [])]
                .find((item) => item.path === path);
            if (book) openBook(book);
            return;
        }
    });

    container.addEventListener('input', (event) => {
        if (event.target.id !== 'bk-search') return;
        _state.query = event.target.value;
        const host = document.querySelector('#bk-view');
        if (!host) return;
        renderLibraryView(host);
        const input = document.querySelector('#bk-search');
        if (input) {
            input.focus();
            try { input.setSelectionRange(input.value.length, input.value.length); } catch { /* search inputs */ }
        }
    });

    container.addEventListener('change', (event) => {
        const target = event.target;
        if (target.id === 'bk-filter') { _state.format = target.value; renderView(); return; }
        if (target.id === 'bk-sort') { _state.sort = target.value; renderView(); return; }
        const map = {
            'bk-set-theme': 'theme', 'bk-set-font': 'font_family', 'bk-set-flow': 'flow',
        };
        if (map[target.id]) { saveSettings({ [map[target.id]]: target.value }); return; }
        const numeric = {
            'bk-set-size': ['font_size', 1], 'bk-set-line': ['line_height', 0.01],
            'bk-set-margin': ['margin', 1], 'bk-set-skip': ['skip_seconds', 1], 'bk-set-speed': ['speed', 0.01],
        };
        if (numeric[target.id]) {
            const [key, step] = numeric[target.id];
            const value = step >= 1 ? parseInt(target.value, 10) : parseFloat(target.value);
            if (Number.isFinite(value)) saveSettings({ [key]: value });
            return;
        }
        if (target.dataset.ext) {
            const boxes = [...document.querySelectorAll('[data-ext]')];
            const extensions = boxes.filter((box) => box.checked).map((box) => box.dataset.ext);
            if (!extensions.length) {
                target.checked = true;
                setStatus('Keep at least one file type.', 'warn');
                return;
            }
            saveSettings({ extensions });
        }
    });
}

async function bootstrap() {
    setPill('Loading…', 'starting');
    try {
        await reloadLibrary();
        await syncSharedRoots();
        const total = (_state.library.books || []).length;
        setPill('Ready', 'ready');
        setStatus(total ? `${total} title${total === 1 ? '' : 's'} in the library.` : 'No titles yet — add a folder to scan.');
        const note = document.querySelector('#bk-side-note');
        if (note) {
            note.textContent = (_state.library.folders || []).length
                ? `${total} titles · ${fmtBytes((_state.library.stats || {}).bytes)} · ${(_state.library.folders || []).length} folders`
                : 'Add the folder that holds your books to get started.';
        }
    } catch (err) {
        _state.loading = false;
        setPill('Offline', 'offline');
        setStatus(`Library unavailable: ${String(err?.detail || err?.message || err)}`, 'error');
        const host = document.querySelector('#bk-view');
        if (host) host.innerHTML = '<section class="bk-panel"><div class="bk-startup error">The Books service is not answering. Check <strong>Packages</strong> for its status and start it again.</div></section>';
    }
}

// ── Shared with me ──────────────────────────────────────────────────────────

async function syncSharedRoots() {
    let grants = [];
    try {
        const res = await _ctx.apiFetch('/api/sharing/incoming?kind=path');
        if (res.ok) grants = (await res.json()).grants || [];
    } catch { grants = []; }

    const folders = [];
    const files = [];
    for (const grant of grants) {
        try {
            const res = await _ctx.apiFetch(`/api/files/stat?path=${encodeURIComponent(grant.resource)}`);
            if (!res.ok) continue;
            const info = await res.json();
            if (info.is_dir) folders.push({ owner: grant.owner, path: grant.resource });
            else if (ALL_EXTS.includes(extOf(info.name || grant.resource))) {
                files.push({
                    path: grant.resource,
                    format: extOf(info.name || grant.resource),
                    kind: AUDIO_EXTS.includes(extOf(info.name || grant.resource)) ? 'audiobook' : 'book',
                    title: fileTitle(info.name || baseName(grant.resource)),
                    owner: grant.owner,
                    size: Number(info.size) || 0,
                    modified: Number(info.modified) || 0,
                });
            }
        } catch { /* revoked between list and stat */ }
    }
    _state.sharedFiles = files;

    const current = JSON.stringify((_state.library.shared_roots || []).map((r) => [r.owner, r.path]));
    const next = JSON.stringify(folders.map((r) => [r.owner, r.path]));
    if (current !== next) {
        try {
            _state.library = await json('shared-roots', { method: 'PUT', body: { roots: folders } });
        } catch (err) {
            log.warn('could not sync shared roots', String(err?.detail || err?.message || err));
        }
    }
    renderView();
}

async function removeSharedRoot(path) {
    const ok = await _ctx.modal.confirm('Remove shared folder?', `Titles from ${path} leave this library view. The owner's files are untouched.`, {
        confirmLabel: 'Remove', danger: true,
    });
    if (!ok) return;
    const roots = (_state.library.shared_roots || []).filter((root) => root.path !== path)
        .map((root) => ({ owner: root.owner, path: root.path }));
    try {
        _state.library = await json('shared-roots', { method: 'PUT', body: { roots } });
        renderView();
    } catch (err) {
        setStatus(String(err?.detail || err?.message || err), 'error');
    }
}

function sharedCardMarkup(book) {
    const label = book.title || baseName(book.path);
    const owner = book.shared_owner || book.owner || '';
    return `<article class="bk-card" data-testid="books-shared-card">
  <button class="bk-cover-btn" type="button" data-open-shared="${escAttr(book.path)}" data-testid="books-open-shared" title="${escAttr(label)}">
    ${coverMarkup(book)}
    <span class="bk-badge">${escHtml(String(book.format || '').toUpperCase() || 'BOOK')}</span>
  </button>
  <div class="bk-card-title">${escHtml(label)}</div>
  <div class="bk-card-sub">${owner ? `Shared by ${escHtml(owner)}` : 'Shared with you'}</div>
  <button class="bk-btn small" type="button" data-download-shared="${escAttr(book.path)}" data-testid="books-download-shared" title="Download to your device">⤓ Download</button>
</article>`;
}

export async function render(container, ctx) {
    _ctx = ctx;
    _pkgBase = `/api/packages/${encodeURIComponent(ctx.pkg.id)}/proxy`;
    _uiBase = `/api/packages/${encodeURIComponent(ctx.pkg.id)}/ui/`;
    injectStyles(container);
    container.innerHTML = shellMarkup();
    attachEvents(container);

    try {
        ctx.windows.registerCloseGuard(`pkg-${ctx.pkg.id}`, () => {
            _flushProgress();
            closeReader();
            _state.coverUrls.forEach((url) => URL.revokeObjectURL(url));
            _state.coverUrls.clear();
            return true;
        });
    } catch (err) {
        log.debug('close guard unavailable', String(err?.message || err));
    }

    log.info('books window opened');
    loadVendors(); // warm the readers in the background
    await bootstrap();
}
