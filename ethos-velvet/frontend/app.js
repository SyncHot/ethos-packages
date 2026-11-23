// EthOS Velvet — private video library (Package Center app)
//
// Native module: loaded as a blob and called as render(container, ctx).
// Views: Library (infinite grid), Duplicates, Tags and Settings, plus a detail
// overlay with a left-eye frame strip and an immersive player that reuses the
// core Video Station API (direct stream or HLS through hls.js).
//
// The package service owns the index, tags, ratings and cached stills. Video
// bytes and permanent deletion stay in the core so path_scope, file-op
// progress and the signed-in caller remain the only authority.

let _ctx = null;
let _root = null;
let _main = null;
let _view = null;
let _titleEl = null;
let _subEl = null;
let _statusEl = null;
let _pillEl = null;
let _noteEl = null;
let _detailEl = null;
let _playerEl = null;
let _thumbObserver = null;
let _scanTimer = null;
let _searchTimer = null;
let _player = null;
let _keyHandler = null;
let _resizeHandler = null;
let _filesWs = null;
let _resyncTimer = null;
const _pendingResync = { removed: new Set(), changed: new Set(), full: false };
const _recentDeletes = new Map();

const APP_ID = 'pkg-ethos-velvet';
const FRAMES = 6;
const PAGE_SIZE = 300;
const PLACEHOLDER = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">' +
    '<rect width="640" height="360" fill="#0d1117"/>' +
    '<path d="M296 158l56 32-56 32z" fill="#64748b"/>' +
    '<rect x="24" y="24" width="592" height="312" rx="18" fill="none" stroke="#334155" stroke-width="3"/>' +
    '</svg>');

const QUALITY_LABELS = { auto: 'Auto quality', balanced: '1080p', fast: '720p', tiny: '480p' };
const EYE_LABELS = { left: 'Left eye', right: 'Right eye', sbs: 'SBS' };
const SORT_LABELS = {
    added_desc: 'Newest added', added_asc: 'Oldest added', name_asc: 'Title A→Z',
    name_desc: 'Title Z→A', size_desc: 'Largest first', duration_desc: 'Longest first',
    rating_desc: 'Best rated', mtime_desc: 'Newest file',
};

const state = {
    view: 'library',
    folders: [],
    settings: { quality: 'auto', eye: 'left', grid: 'medium', auto_scan: true, page_size: 90 },
    scan: { state: 'idle' },
    summary: null,
    facets: { studios: [], projections: [], resolutions: [], tags: [] },
    items: [],
    total: 0,
    byPath: new Map(),
    dups: [],
    tags: [],
    loading: false,
    error: '',
    statusText: 'Ready.',
    statusKind: '',
    filters: {
        q: '', studio: '', proj: '', res: '', tag: '', rating: 0,
        sort: 'added_desc', dup: false, favorite: false, rejected: false, missing: false,
    },
    selectMode: false,
    selected: new Set(),
    detail: null,
    autoScanned: false,
};

// ── Small helpers ───────────────────────────────────────────────────────────

const esc = (value) => _ctx.escape.html(value == null ? '' : String(value));
const attr = (value) => _ctx.escape.attr(value == null ? '' : String(value));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const base = () => `/api/packages/${encodeURIComponent(_ctx.pkg.id)}/proxy/`;

function fmtBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value >= 1024 ** 4) return `${(value / 1024 ** 4).toFixed(2)} TB`;
    if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
    if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(0)} MB`;
    if (value >= 1024) return `${(value / 1024).toFixed(0)} KB`;
    return `${value} B`;
}

function fmtDuration(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        : `${m}:${String(s).padStart(2, '0')}`;
}

function fmtDate(timestamp) {
    const value = Number(timestamp) || 0;
    if (!value) return '—';
    try {
        return new Date(value * 1000).toLocaleDateString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric',
        });
    } catch {
        return '—';
    }
}

function starsHtml(rating) {
    const value = Math.max(0, Math.min(5, Number(rating) || 0));
    return '★'.repeat(value) + '☆'.repeat(5 - value);
}

function basename(path) {
    return String(path || '').split('/').pop() || String(path || '');
}

function setStatus(text, kind = '') {
    state.statusText = text || 'Ready.';
    state.statusKind = kind;
    if (_statusEl) {
        _statusEl.textContent = state.statusText;
        _statusEl.className = `vl-status${kind ? ` ${kind}` : ''}`;
    }
}

async function proxyJson(path, options = {}) {
    const opts = { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } };
    if (opts.body !== undefined && typeof opts.body !== 'string') opts.body = JSON.stringify(opts.body);
    return _ctx.apiJsonFetch(base() + path, opts);
}

function proxyFetch(path) {
    return _ctx.apiFetch(base() + path);
}

function withToken(url) {
    const token = localStorage.getItem('token') || '';
    return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
}

function itemFor(path) {
    if (state.byPath.has(path)) return state.byPath.get(path);
    if (state.detail && state.detail.path === path) return state.detail;
    if (_player && _player.item.path === path) return _player.item;
    for (const group of state.dups) {
        const found = (group.items || []).find((row) => row.path === path);
        if (found) return found;
    }
    return null;
}

function remember(items) {
    for (const item of items || []) state.byPath.set(item.path, item);
}

// ── Thumbnails / frames ─────────────────────────────────────────────────────

const imageCache = new Map();

function cacheImage(key, url) {
    // No eviction: this is a desktop window, and a few hundred WebP stills are
    // cheaper than reloading them while scrolling. Revoked on teardown.
    imageCache.set(key, url);
}

async function loadStill(img, kind, path, index) {
    const key = kind === 'frame' ? `f:${path}:${index}` : `t:${path}`;
    if (imageCache.has(key)) {
        img.src = imageCache.get(key);
        img.classList.remove('is-loading');
        return;
    }
    if (img.dataset.waiting === '1') return;
    img.dataset.waiting = '1';
    img.classList.add('is-loading');
    const url = kind === 'frame'
        ? `frame?path=${encodeURIComponent(path)}&i=${index}`
        : `thumb?path=${encodeURIComponent(path)}`;
    for (let attempt = 0; attempt < 80; attempt += 1) {
        try {
            const response = await proxyFetch(url);
            // 202 must be handled before `ok`: `ok` covers 200–299, and a pending
            // response carries JSON, not image bytes.
            if (response.status === 202) {
                let wait = 1200;
                try {
                    const data = await response.json();
                    wait = Math.max(400, Number(data.retry_ms || 1200));
                } catch { /* the body may be empty */ }
                await sleep(wait);
                continue;
            }
            if (response.ok) {
                const blob = await response.blob();
                const objectUrl = URL.createObjectURL(blob);
                cacheImage(key, objectUrl);
                img.src = objectUrl;
                img.dataset.waiting = '0';
                img.classList.remove('is-loading');
                return;
            }
            if (response.status >= 500) {
                await sleep(3000);
                continue;
            }
            break;
        } catch {
            await sleep(2500);
        }
    }
    img.src = PLACEHOLDER;
    img.dataset.waiting = '0';
    img.classList.remove('is-loading');
}

function bindThumbs(scope = _view) {
    if (_thumbObserver) _thumbObserver.disconnect();
    const images = [...scope.querySelectorAll('img[data-thumb]')];
    if (!images.length) return;
    _thumbObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const img = entry.target;
            _thumbObserver.unobserve(img);
            loadStill(img, 'thumb', img.dataset.thumb, null);
        }
    }, { root: null, rootMargin: '300px' });
    images.forEach((img) => _thumbObserver.observe(img));
}

function bindFrames() {
    if (!_detailEl) return;
    // The poster is the same left-eye still the grid already loaded, so the
    // detail opens with a real image instead of waiting for a fresh 960 px grab.
    const poster = _detailEl.querySelector('[data-testid="velvet-poster"]');
    if (poster && poster.dataset.thumb) loadStill(poster, 'thumb', poster.dataset.thumb, null);
    for (const img of _detailEl.querySelectorAll('img[data-frame]')) {
        loadStill(img, 'frame', img.dataset.frame, Number(img.dataset.index || 0));
    }
}

// Pre-generate the six preview frames while the pointer rests on a card, so the
// detail view usually opens with the strip already cached.
let _warmTimer = null;
let _warmPath = null;

function scheduleFrameWarm(path) {
    if (!path || _warmPath === path) return;
    _warmPath = path;
    if (_warmTimer) clearTimeout(_warmTimer);
    _warmTimer = setTimeout(() => {
        _warmTimer = null;
        if (state.detail || _player) return;  // the detail warms them itself
        for (let i = 0; i < FRAMES; i += 1) {
            proxyFetch(`frame?path=${encodeURIComponent(path)}&i=${i}`)
                .then((response) => { response.body?.cancel().catch(() => {}); })
                .catch(() => {});
        }
    }, 450);
}

// ── Boot ────────────────────────────────────────────────────────────────────

export async function render(container, ctx) {
    _ctx = ctx;
    state.autoScanned = false;
    container.innerHTML = STYLES + shellHtml();
    _root = container.querySelector('.vl-root');
    _main = container.querySelector('.vl-main');
    _view = container.querySelector('[data-testid="velvet-view"]');
    _titleEl = container.querySelector('[data-testid="velvet-title"]');
    _subEl = container.querySelector('[data-testid="velvet-subtitle"]');
    _statusEl = container.querySelector('[data-testid="velvet-status"]');
    _pillEl = container.querySelector('[data-testid="velvet-status-pill"]');
    _noteEl = container.querySelector('[data-testid="velvet-side-note"]');
    _detailEl = container.querySelector('[data-testid="velvet-detail"]');
    _playerEl = container.querySelector('[data-testid="velvet-player"]');

    _root.addEventListener('click', onClick);
    _root.addEventListener('change', onChange);
    _root.addEventListener('input', onInput);
    _root.addEventListener('pointerover', (event) => {
        const card = event.target.closest?.('[data-testid="velvet-card"]');
        if (card) scheduleFrameWarm(card.getAttribute('data-path'));
    });
    _main.addEventListener('scroll', onScroll, { passive: true });
    _keyHandler = (event) => onKeydown(event);
    document.addEventListener('keydown', _keyHandler);
    connectFileEvents();

    applyGridSize();
    try {
        await refreshState();
    } catch (err) {
        setStatus(err?.detail || err?.message || 'The Velvet service is unreachable.', 'error');
        setPill('offline', 'offline');
    }
    setView('library');
    maybeAutoScan();
}

function shellHtml() {
    return `
<div class="vl-root" data-testid="velvet-root" data-grid="medium">
  <aside class="vl-side">
    <div class="vl-brand">
      <span class="vl-brand-icon" aria-hidden="true">🍑</span>
      <div><strong>Velvet</strong><small>EthOS package</small></div>
    </div>
    <nav class="vl-nav" aria-label="Velvet sections">
      <button class="vl-nav-item is-active" type="button" data-action="view" data-view="library" data-testid="velvet-nav-library">Library</button>
      <button class="vl-nav-item" type="button" data-action="view" data-view="duplicates" data-testid="velvet-nav-duplicates">Duplicates</button>
      <button class="vl-nav-item" type="button" data-action="view" data-view="tags" data-testid="velvet-nav-tags">Tags</button>
      <button class="vl-nav-item" type="button" data-action="view" data-view="settings" data-testid="velvet-nav-settings">Settings</button>
    </nav>
    <div class="vl-side-foot">
      <span class="vl-pill starting" role="status" aria-live="polite" data-testid="velvet-status-pill">Connecting…</span>
      <span class="vl-side-note" data-testid="velvet-side-note">Private collection · nothing leaves the NAS</span>
    </div>
  </aside>
  <main class="vl-main" data-testid="velvet-main">
    <header>
      <h1 data-testid="velvet-title">Library</h1>
      <p class="vl-page-sub" data-testid="velvet-subtitle">Your private collection with single-eye VR thumbnails.</p>
      <p class="vl-status" role="status" aria-live="polite" data-testid="velvet-status">Ready.</p>
    </header>
    <div class="vl-view" data-testid="velvet-view"></div>
  </main>
  <div class="vl-overlay" data-testid="velvet-detail" hidden></div>
  <div class="vl-overlay vl-player-overlay" data-testid="velvet-player" hidden></div>
</div>`;
}

// ── State / chrome ──────────────────────────────────────────────────────────

async function refreshState() {
    const data = await proxyJson('state');
    state.folders = data.folders || [];
    state.settings = { ...state.settings, ...(data.settings || {}) };
    state.scan = data.scan || { state: 'idle' };
    applyGridSize();
    updateChrome();
    if (['scanning', 'starting'].includes(state.scan.state)) startScanPolling();
    return data;
}

function setPill(kind, text) {
    if (!_pillEl) return;
    _pillEl.className = `vl-pill ${kind}`;
    _pillEl.textContent = text;
}

function updateChrome() {
    const titles = {
        library: ['Library', 'Your private collection — thumbnails show the left eye of SBS VR files.'],
        duplicates: ['Duplicates', 'Same cleaned title and a comparable runtime. Keep one, delete the rest.'],
        tags: ['Tags', 'Labels you assigned. Rename or remove them across the whole library.'],
        settings: ['Settings', 'Folders, playback defaults and maintenance.'],
    };
    const [title, subtitle] = titles[state.view] || titles.library;
    if (_titleEl) _titleEl.textContent = title;
    if (_subEl) _subEl.textContent = subtitle;

    const total = state.summary?.files ?? 0;
    const size = state.summary?.size ?? 0;
    if (_noteEl) {
        _noteEl.textContent = state.folders.length
            ? `${state.folders.length} folder${state.folders.length === 1 ? '' : 's'} · ${total} file${total === 1 ? '' : 's'} · ${fmtBytes(size)}`
            : 'Add a folder to build your library.';
    }
    if (state.scan.state === 'scanning' || state.scan.state === 'starting') {
        const scanned = state.scan.scanned || 0;
        const scanTotal = state.scan.total || 0;
        setPill('starting', scanTotal ? `Scanning ${scanned}/${scanTotal}` : 'Scanning…');
        setStatus(scanTotal ? `Scanning ${scanned} of ${scanTotal} files…` : 'Scanning…');
    } else if (state.scan.state === 'error') {
        setPill('offline', 'Scan failed');
        setStatus(state.scan.error || 'The scan failed.', 'error');
    } else {
        setPill('ready', 'ready');
    }
    if (state.statusText) setStatus(state.statusText, state.statusKind);
    for (const button of _root.querySelectorAll('.vl-nav-item')) {
        button.classList.toggle('is-active', button.dataset.view === state.view);
    }
}

function applyGridSize() {
    if (_root) _root.dataset.grid = state.settings.grid || 'medium';
}

function setView(view) {
    state.view = view;
    state.selected.clear();
    state.selectMode = false;
    updateChrome();
    if (view === 'library') {
        renderView();
        loadLibrary({ reset: true });
    } else if (view === 'duplicates') {
        loadDuplicates();
    } else if (view === 'tags') {
        loadTags();
    } else {
        renderView();
    }
}

function maybeAutoScan() {
    if (state.autoScanned || !state.settings.auto_scan || !state.folders.length) return;
    if (state.scan.state === 'scanning' || state.scan.state === 'starting') return;
    // A quick incremental pass on every open reconciles changes made while the
    // window was closed (unchanged files skip ffprobe and DB writes).
    state.autoScanned = true;
    startScan();
}

// ── File Manager event bridge ───────────────────────────────────────────────

function connectFileEvents() {
    if (typeof _ctx.ws?.connect !== 'function') return;
    try {
        _filesWs = _ctx.ws.connect('/ws/files/events', onFileEvent, {
            appId: APP_ID,
            name: 'velvet-files',
        });
    } catch (err) {
        _ctx.logger?.warn?.('Velvet: file events unavailable', err?.message || String(err));
    }
}

function joinPath(parent, name) {
    if (!parent || !name) return '';
    return `${String(parent).replace(/\/+$/, '')}/${String(name).replace(/^\/+/, '')}`;
}

function inAnyFolder(path) {
    const value = String(path || '');
    return state.folders.some((folder) => {
        const root = String(folder.path || '').replace(/\/+$/, '');
        return Boolean(root) && (value === root || value.startsWith(root + '/'));
    });
}

function onFileEvent(event) {
    if (!_root || !document.body.contains(_root)) {
        try { _filesWs?.close?.(); } catch { /* window is gone */ }
        return;
    }
    const action = String(event?.action || '');
    const parent = String(event?.path || '').replace(/\/+$/, '');
    const items = Array.isArray(event?.items) ? event.items : [];
    if (!action || !parent) return;

    if (action === 'delete_soft' || action === 'delete_hard') {
        let touched = false;
        for (const item of items) {
            if (action === 'delete_soft' && item?.status && item.status !== 'ok') continue;
            const path = joinPath(parent, item?.name);
            if (!path || !inAnyFolder(path)) continue;
            if ((_recentDeletes.get(path) || 0) > Date.now() - 10000) continue;
            _pendingResync.removed.add(path);
            closeIfShowing(path);
            touched = true;
        }
        if (touched) scheduleResync();
        return;
    }
    if (action === 'rename') {
        let touched = false;
        for (const item of items) {
            const oldPath = joinPath(parent, item?.old_name);
            const newPath = joinPath(parent, item?.name);
            if (oldPath && inAnyFolder(oldPath)) {
                _pendingResync.removed.add(oldPath);
                closeIfShowing(oldPath);
            }
            if ((newPath && inAnyFolder(newPath)) || inAnyFolder(parent)) {
                _pendingResync.changed.add(parent);
            }
            touched = true;
        }
        if (touched) scheduleResync();
        return;
    }
    if (action === 'move') {
        // A move event names only the destination; the source may sit inside
        // the library, so one incremental full scan is the only safe sync.
        _pendingResync.full = true;
        scheduleResync();
        return;
    }
    if ((action === 'copy' || action === 'upload' || action === 'zip') && inAnyFolder(parent)) {
        _pendingResync.changed.add(parent);
        scheduleResync();
    }
}

function closeIfShowing(path) {
    const inside = (candidate) => candidate === path || candidate.startsWith(path + '/');
    if (state.detail && inside(state.detail.path)) closeDetail();
    if (_player && inside(_player.item.path)) closePlayer();
}

function scheduleResync() {
    if (_resyncTimer) clearTimeout(_resyncTimer);
    _resyncTimer = setTimeout(flushResync, 500);
}

async function flushResync() {
    _resyncTimer = null;
    const batch = {
        removed: [..._pendingResync.removed],
        changed: [..._pendingResync.changed],
        full: _pendingResync.full,
    };
    _pendingResync.removed.clear();
    _pendingResync.changed.clear();
    _pendingResync.full = false;
    if (!batch.removed.length && !batch.changed.length && !batch.full) return;
    try {
        const result = await proxyJson('events', { method: 'POST', body: batch });
        if (result.removed) {
            for (const path of batch.removed) {
                state.byPath.delete(path);
                state.selected.delete(path);
            }
            state.items = state.items.filter((item) =>
                !batch.removed.some((path) => item.path === path || item.path.startsWith(path + '/')));
            _ctx.notifications.toast(
                `Velvet updated after ${result.removed} change${result.removed === 1 ? '' : 's'} in File Manager.`,
                'info');
            setStatus('Library updated from File Manager.');
        }
        if (result.scan) {
            state.scan = { state: 'starting' };
            updateChrome();
            startScanPolling();
        }
        if (state.view === 'library') await loadLibrary({ reset: true });
        else if (state.view === 'duplicates') await loadDuplicates();
        else if (state.view === 'tags') await loadTags();
    } catch (err) {
        _ctx.logger?.warn?.('Velvet: file-event resync failed', err?.detail || err?.message || String(err));
    }
}

async function startScan() {
    try {
        const data = await proxyJson('scan', { method: 'POST', body: {} });
        state.scan = data.scan;
        updateChrome();
        startScanPolling();
    } catch (err) {
        setStatus(err?.detail || err?.message || 'The scan could not start.', 'error');
        _ctx.notifications.toast(err?.detail || 'The scan could not start.', 'error');
    }
}

function startScanPolling() {
    if (_scanTimer) return;
    _scanTimer = setInterval(async () => {
        if (!_root || !document.body.contains(_root)) {
            clearInterval(_scanTimer);
            _scanTimer = null;
            return;
        }
        try {
            const data = await proxyJson('scan/status');
            state.scan = data.scan || { state: 'idle' };
            updateChrome();
            if (['done', 'error'].includes(state.scan.state)) {
                clearInterval(_scanTimer);
                _scanTimer = null;
                if (state.scan.state === 'done') {
                    const count = state.scan.scanned || 0;
                    _ctx.notifications.toast(
                        `Scan finished — ${count} file${count === 1 ? '' : 's'} indexed`, 'success');
                    setStatus(`Scan finished — ${count} files indexed.`);
                }
                if (state.view === 'library') loadLibrary({ reset: true });
                else if (state.view === 'duplicates') loadDuplicates();
            }
        } catch {
            /* service restarting — retry on the next tick */
        }
    }, 1500);
}

// ── Library ─────────────────────────────────────────────────────────────────

async function loadLibrary({ reset = false } = {}) {
    if (state.loading && !reset) return;
    state.loading = true;
    if (reset) {
        state.items = [];
        state.byPath.clear();
        state.selected.clear();
    }
    const filters = state.filters;
    const params = new URLSearchParams({
        limit: String(PAGE_SIZE), offset: String(reset ? 0 : state.items.length),
        sort: filters.sort,
    });
    if (filters.q) params.set('q', filters.q);
    if (filters.studio) params.set('studio', filters.studio);
    if (filters.proj) params.set('proj', filters.proj);
    if (filters.res) params.set('res', filters.res);
    if (filters.tag) params.set('tag', filters.tag);
    if (filters.rating) params.set('rating', String(filters.rating));
    if (filters.dup) params.set('dup', '1');
    if (filters.favorite) params.set('favorite', '1');
    if (filters.rejected) params.set('rejected', '1');
    if (filters.missing) params.set('missing', '1');

    try {
        const data = await proxyJson(`library?${params.toString()}`);
        state.items = reset ? data.items : [...state.items, ...data.items];
        remember(data.items);
        state.total = data.total || 0;
        state.summary = data.summary || state.summary;
        state.facets = data.facets || state.facets;
        state.error = '';
        state.loading = false;
        if (reset) {
            renderView();
        } else {
            appendCards(data.items || []);
        }
        updateChrome();
    } catch (err) {
        state.loading = false;
        state.error = err?.detail || err?.message || 'The library could not be loaded.';
        renderView();
        setStatus(state.error, 'error');
        setPill('offline', 'offline');
    }
}

function renderView() {
    if (!_view) return;
    _root.classList.toggle('selecting', state.selectMode);
    if (state.view === 'library') {
        _view.innerHTML = libraryHtml();
        bindThumbs();
    } else if (state.view === 'duplicates') {
        _view.innerHTML = duplicatesHtml();
        bindThumbs();
    } else if (state.view === 'tags') {
        _view.innerHTML = tagsHtml();
    } else {
        _view.innerHTML = settingsHtml();
    }
}

function libraryHtml() {
    if (!state.folders.length) {
        return `<section class="vl-panel vl-empty" data-testid="velvet-empty">
            <strong>No folder yet</strong>
            <p>Add the folder that holds your collection. Velvet indexes it in place — nothing is copied or uploaded.</p>
            <button class="vl-btn primary" type="button" data-action="add-folder" data-testid="velvet-add-folder">Add folder</button>
        </section>`;
    }
    const summary = state.summary || {};
    const counts = summary.duplicates || {};
    const tiles = `<section class="vl-summary" data-testid="velvet-summary">
        <div class="vl-tile"><span>Files</span><strong>${summary.files ?? 0}</strong></div>
        <div class="vl-tile"><span>Total size</span><strong>${fmtBytes(summary.size)}</strong></div>
        <div class="vl-tile"><span>Runtime</span><strong>${fmtDuration(summary.duration)}</strong></div>
        <div class="vl-tile"><span>Reclaimable</span><strong>${fmtBytes(counts.reclaimable)}</strong></div>
    </section>`;

    const scanning = ['scanning', 'starting'].includes(state.scan.state);
    const selection = state.selected.size
        ? `<div class="vl-selectionbar" data-testid="velvet-selection">
             <strong>${state.selected.size} selected</strong>
             <span class="vl-muted">${fmtBytes(selectedSize())}</span>
             <span class="vl-spacer"></span>
             <button class="vl-btn small" type="button" data-action="select-all" data-testid="velvet-select-all">Select all</button>
             <button class="vl-btn small" type="button" data-action="select-none" data-testid="velvet-select-none">Clear</button>
             <button class="vl-btn danger small" type="button" data-action="delete-selected" data-testid="velvet-delete-selected">Delete permanently</button>
           </div>`
        : '';

    return `
    <section class="vl-panel vl-toolbar">
      <div class="vl-toolbar-title"><strong>Collection</strong><span class="vl-muted">${state.items.length} of ${state.total} shown</span></div>
      <div class="vl-row">
        <button class="vl-btn primary" type="button" data-action="add-folder" data-testid="velvet-add-folder">Add folder</button>
        <button class="vl-btn" type="button" data-action="scan" data-testid="velvet-scan" ${scanning ? 'disabled' : ''}>${scanning ? 'Scanning…' : 'Rescan'}</button>
        <button class="vl-btn ${state.selectMode ? 'primary' : ''}" type="button" data-action="select-mode" data-testid="velvet-select-mode">${state.selectMode ? 'Done selecting' : 'Select'}</button>
      </div>
    </section>
    ${tiles}
    ${selection}
    <section class="vl-panel vl-filters">
      <input class="vl-input vl-search" type="search" data-role="search" placeholder="Search title or filename"
             value="${attr(state.filters.q)}" data-testid="velvet-search">
      ${filterSelect('studio', 'Studio', state.facets.studios, state.filters.studio)}
      ${filterSelect('proj', 'Projection', state.facets.projections, state.filters.proj)}
      ${filterSelect('res', 'Resolution', state.facets.resolutions, state.filters.res)}
      ${filterSelect('tag', 'Tag', state.facets.tags, state.filters.tag)}
      <select class="vl-select" data-role="filter" data-key="rating" data-testid="velvet-filter-rating">
        <option value="0">Any rating</option>
        ${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${Number(state.filters.rating) === n ? 'selected' : ''}>${n}+ stars</option>`).join('')}
      </select>
      <select class="vl-select" data-role="filter" data-key="sort" data-testid="velvet-sort">
        ${Object.entries(SORT_LABELS).map(([value, label]) =>
            `<option value="${value}" ${state.filters.sort === value ? 'selected' : ''}>${label}</option>`).join('')}
      </select>
      <button class="vl-btn small ${state.filters.dup ? 'primary' : ''}" type="button" data-action="filter-toggle" data-key="dup" data-testid="velvet-filter-duplicates">Duplicates</button>
      <button class="vl-btn small ${state.filters.favorite ? 'primary' : ''}" type="button" data-action="filter-toggle" data-key="favorite" data-testid="velvet-filter-favorites">Favourites</button>
      <button class="vl-btn small ${state.filters.rejected ? 'primary' : ''}" type="button" data-action="filter-toggle" data-key="rejected" data-testid="velvet-filter-rejected">Marked</button>
      <button class="vl-btn small ${state.filters.missing ? 'primary' : ''}" type="button" data-action="filter-toggle" data-key="missing" data-testid="velvet-filter-missing">Missing</button>
    </section>
    ${state.error ? `<div class="vl-startup error">${esc(state.error)}</div>` : ''}
    ${state.loading && !state.items.length ? '<div class="vl-empty">Loading library…</div>' : ''}
    ${!state.loading && !state.items.length && !state.error ? '<div class="vl-empty">Nothing matches these filters.</div>' : ''}
    <section class="vl-grid" data-testid="velvet-grid">${state.items.map(cardHtml).join('')}</section>
    ${state.items.length < state.total ? `<div class="vl-more"><button class="vl-btn" type="button" data-action="load-more" data-testid="velvet-load-more">Load more (${state.total - state.items.length} left)</button></div>` : ''}
    `;
}

function filterSelect(key, label, entries, current) {
    const values = (entries || []).filter((entry) => entry && entry.value);
    if (!values.length) return '';
    return `<select class="vl-select" data-role="filter" data-key="${key}" data-testid="velvet-filter-${key}">
        <option value="">${label}: any</option>
        ${values.map((entry) => `<option value="${attr(entry.value)}" ${current === entry.value ? 'selected' : ''}>${esc(entry.value)} (${entry.count})</option>`).join('')}
    </select>`;
}

function cardHtml(item) {
    const selected = state.selected.has(item.path);
    const classes = ['vl-card', selected ? 'is-selected' : '', item.reject ? 'is-rejected' : '']
        .filter(Boolean).join(' ');
    return `<article class="${classes}" data-action="open" data-path="${attr(item.path)}" data-testid="velvet-card" tabindex="0">
      <div class="vl-thumb">
        <img data-thumb="${attr(item.path)}" src="${PLACEHOLDER}" alt="" loading="lazy">
        <span class="vl-dur">${item.duration ? fmtDuration(item.duration) : '—'}</span>
        <span class="vl-badges">
          ${item.res_label ? `<span class="vl-badge">${esc(item.res_label)}</span>` : ''}
          ${item.projection ? `<span class="vl-badge">${esc(item.projection)}</span>` : ''}
          ${item.alpha ? '<span class="vl-badge warn">alpha</span>' : ''}
        </span>
        <button class="vl-check ${selected ? 'is-on' : ''}" type="button" data-action="select"
                data-path="${attr(item.path)}" aria-label="Select" data-testid="velvet-select"></button>
        <button class="vl-play" type="button" data-action="play" data-path="${attr(item.path)}"
                aria-label="Play" data-testid="velvet-play">▶</button>
      </div>
      <div class="vl-card-body">
        <strong title="${attr(item.title || item.name)}">${esc(item.title || item.name)}</strong>
        <span class="vl-muted">${esc(item.studio || 'Unknown studio')} · ${fmtBytes(item.size)}</span>
        <span class="vl-stars">${starsHtml(item.rating)}${item.favorite ? ' <span class="vl-fav">♥</span>' : ''}</span>
      </div>
    </article>`;
}

function appendCards(items) {
    const grid = _view?.querySelector('[data-testid="velvet-grid"]');
    if (!grid || !items.length) return;
    grid.insertAdjacentHTML('beforeend', items.map(cardHtml).join(''));
    bindThumbs(_view);
    const more = _view.querySelector('[data-testid="velvet-load-more"]');
    if (more) {
        const left = state.total - state.items.length;
        if (left > 0) more.textContent = `Load more (${left} left)`;
        else more.remove();
    }
}

function selectedSize() {
    let total = 0;
    for (const path of state.selected) {
        const item = itemFor(path);
        if (item) total += Number(item.size || 0);
    }
    return total;
}

async function onScroll() {
    if (state.view !== 'library' || state.loading || !state.items.length) return;
    if (state.items.length >= state.total) return;
    if (_main.scrollTop + _main.clientHeight > _main.scrollHeight - 500) {
        await loadLibrary({ reset: false });
    }
}

// ── Detail overlay ──────────────────────────────────────────────────────────

async function openDetail(path) {
    try {
        const data = await proxyJson(`item?path=${encodeURIComponent(path)}`);
        state.detail = data.item;
        remember([data.item]);
        renderDetail();
        _detailEl.hidden = false;
        bindFrames();
    } catch (err) {
        _ctx.notifications.toast(err?.detail || 'That file is no longer in the library.', 'error');
    }
}

function closeDetail() {
    state.detail = null;
    if (_detailEl) {
        _detailEl.hidden = true;
        _detailEl.innerHTML = '';
    }
}

function detailIndex() {
    if (!state.detail) return -1;
    return state.items.findIndex((item) => item.path === state.detail.path);
}

function renderDetail() {
    const item = state.detail;
    if (!item || !_detailEl) return;
    const index = detailIndex();
    const perEye = item.sbs && item.width ? `${Math.round(item.width / 2)}×${item.height} per eye`
        : (item.width ? `${item.width}×${item.height}` : '—');
    const tags = (item.tags || []).map((tag) => `<button class="vl-tag is-info" type="button"
        data-action="tag-remove" data-tag="${attr(tag)}" title="Remove tag" data-testid="velvet-tag-remove">${esc(tag)} ×</button>`).join('');
    _detailEl.innerHTML = `
    <div class="vl-overlay-head">
      <div class="vl-grow"><strong>${esc(item.title || item.name)}</strong>
        <div class="vl-muted">${esc(item.studio || 'Unknown studio')} · ${esc(item.projection || '')}</div></div>
      <button class="vl-btn small" type="button" data-action="detail-prev" data-testid="velvet-detail-prev" ${index <= 0 ? 'disabled' : ''}>‹</button>
      <button class="vl-btn small" type="button" data-action="detail-next" data-testid="velvet-detail-next" ${index < 0 || index >= state.items.length - 1 ? 'disabled' : ''}>›</button>
      <button class="vl-btn small" type="button" data-action="detail-close" data-testid="velvet-detail-close">✕</button>
    </div>
    <div class="vl-detail-grid">
      <div class="vl-detail-left">
        <div class="vl-poster"><img data-thumb="${attr(item.path)}" src="${PLACEHOLDER}" alt="" data-testid="velvet-poster"></div>
        <div class="vl-strip">${Array.from({ length: FRAMES }, (_, i) =>
            `<img data-frame="${attr(item.path)}" data-index="${i}" data-action="frame-pick" src="${PLACEHOLDER}" alt="" data-testid="velvet-frame-${i}">`).join('')}</div>
      </div>
      <div class="vl-detail-right">
        <div class="vl-def-grid">
          <div><span>Studio</span><strong>${esc(item.studio || '—')}</strong></div>
          <div><span>Projection</span><strong>${esc(item.projection || '—')}</strong></div>
          <div><span>Resolution</span><strong>${esc(item.res_label || '—')}</strong></div>
          <div><span>Frame</span><strong>${esc(perEye)}</strong></div>
          <div><span>Duration</span><strong>${fmtDuration(item.duration)}</strong></div>
          <div><span>Size</span><strong>${fmtBytes(item.size)}</strong></div>
          <div><span>Video</span><strong>${esc(item.vcodec || '—')}</strong></div>
          <div><span>Audio</span><strong>${esc(item.acodec || '—')}${item.audio_tracks > 1 ? ` · ${item.audio_tracks} tracks` : ''}</strong></div>
          <div><span>Bitrate</span><strong>${item.bitrate ? `${(item.bitrate / 1_000_000).toFixed(1)} Mb/s` : '—'}</strong></div>
          <div><span>File date</span><strong>${fmtDate(item.mtime)}</strong></div>
        </div>
        <div class="vl-tag-editor">
          <span class="vl-label">Tags</span>
          <div class="vl-tags">${tags || '<span class="vl-muted">No tags yet.</span>'}</div>
          <div class="vl-row">
            <input class="vl-input vl-grow" data-role="tag-input" placeholder="Add a tag (performer, scene type…)" data-testid="velvet-tag-input">
            <button class="vl-btn small" type="button" data-action="tag-add" data-testid="velvet-tag-add">Add</button>
          </div>
        </div>
        <div class="vl-rating">
          <span class="vl-label">Rating</span>
          ${[1, 2, 3, 4, 5].map((n) => `<button class="vl-star ${Number(item.rating) >= n ? 'is-on' : ''}" type="button"
              data-action="rate" data-value="${n}" aria-label="${n} stars" data-testid="velvet-rate-${n}">★</button>`).join('')}
          <button class="vl-btn small" type="button" data-action="rate" data-value="0" data-testid="velvet-rate-clear">Clear</button>
          <span class="vl-spacer"></span>
          <button class="vl-btn small ${item.favorite ? 'primary' : ''}" type="button" data-action="favorite" data-testid="velvet-favorite">${item.favorite ? '♥ Favourite' : '♡ Favourite'}</button>
          <button class="vl-btn small ${item.reject ? 'danger' : ''}" type="button" data-action="reject" data-testid="velvet-reject">${item.reject ? 'Marked to delete' : 'Mark to delete'}</button>
        </div>
        <div class="vl-form-actions">
          <button class="vl-btn primary" type="button" data-action="detail-play" data-testid="velvet-detail-play">▶ Play</button>
          <button class="vl-btn danger" type="button" data-action="detail-delete" data-testid="velvet-detail-delete">Delete permanently</button>
        </div>
      </div>
    </div>`;
}

async function patchDetail(patch) {
    if (!state.detail) return;
    try {
        const data = await proxyJson('media', { method: 'PATCH', body: { path: state.detail.path, ...patch } });
        state.detail = data.item;
        remember([data.item]);
        const index = state.items.findIndex((item) => item.path === data.item.path);
        if (index >= 0) state.items[index] = data.item;
        renderDetail();
        bindFrames();
    } catch (err) {
        _ctx.notifications.toast(err?.detail || 'That change could not be saved.', 'error');
    }
}

async function navigateDetail(delta) {
    const index = detailIndex();
    const next = index + delta;
    if (next < 0 || next >= state.items.length) return;
    await openDetail(state.items[next].path);
}

// ── Duplicates ──────────────────────────────────────────────────────────────

async function loadDuplicates() {
    _view.innerHTML = '<div class="vl-empty">Looking for duplicates…</div>';
    try {
        const data = await proxyJson('duplicates');
        state.dups = data.groups || [];
        for (const group of state.dups) remember(group.items);
        renderView();
    } catch (err) {
        _view.innerHTML = `<div class="vl-startup error">${esc(err?.detail || 'Duplicates could not be loaded.')}</div>`;
    }
}

function duplicatesHtml() {
    if (!state.dups.length) {
        return `<section class="vl-panel vl-empty"><strong>No duplicates found</strong>
            <p>Velvet groups files whose cleaned title matches and whose runtime is within a few seconds.</p></section>`;
    }
    const reclaim = state.dups.reduce((sum, group) => sum + Math.max(0, group.size - group.keep_bytes), 0);
    const groups = state.dups.map((group) => {
        const rows = (group.items || []).map((item) => {
            const selected = state.selected.has(item.path);
            return `<tr>
              <td><input type="checkbox" data-action="select" data-path="${attr(item.path)}" ${selected ? 'checked' : ''} data-testid="velvet-dup-select"></td>
              <td><img class="vl-row-thumb" data-thumb="${attr(item.path)}" src="${PLACEHOLDER}" alt=""></td>
              <td class="vl-path">${esc(item.name)}</td>
              <td class="vl-num">${esc(item.res_label || '—')}</td>
              <td class="vl-num">${fmtDuration(item.duration)}</td>
              <td class="vl-num">${fmtBytes(item.size)}</td>
              <td class="vl-num">${fmtDate(item.mtime)}</td>
              <td class="vl-actions">
                <button class="vl-btn small" type="button" data-action="play" data-path="${attr(item.path)}" data-testid="velvet-dup-play">Play</button>
                <button class="vl-btn small danger" type="button" data-action="delete-path" data-path="${attr(item.path)}" data-testid="velvet-dup-delete">Delete</button>
              </td>
            </tr>`;
        }).join('');
        return `<section class="vl-panel" data-testid="velvet-dup-group">
          <div class="vl-toolbar">
            <div class="vl-toolbar-title"><strong>${esc(group.title)}</strong>
              <span class="vl-muted">${group.count} files · ${fmtBytes(group.size)} · saves ${fmtBytes(group.size - group.keep_bytes)}</span></div>
            <button class="vl-btn small" type="button" data-action="dup-select-others" data-key="${attr(group.key)}" data-testid="velvet-dup-select-others">Select all but largest</button>
          </div>
          <table class="vl-table"><thead><tr><th></th><th></th><th>File</th><th>Res</th><th>Duration</th><th>Size</th><th>Date</th><th></th></tr></thead>
          <tbody>${rows}</tbody></table>
        </section>`;
    }).join('');
    const selection = state.selected.size
        ? `<div class="vl-selectionbar" data-testid="velvet-selection">
             <strong>${state.selected.size} selected</strong><span class="vl-muted">${fmtBytes(selectedSize())}</span>
             <span class="vl-spacer"></span>
             <button class="vl-btn small" type="button" data-action="select-none">Clear</button>
             <button class="vl-btn danger small" type="button" data-action="delete-selected" data-testid="velvet-delete-selected">Delete permanently</button>
           </div>`
        : '';
    return `<section class="vl-panel vl-toolbar"><div class="vl-toolbar-title"><strong>${state.dups.length} duplicate groups</strong>
        <span class="vl-muted">${fmtBytes(reclaim)} reclaimable</span></div>
        <button class="vl-btn" type="button" data-action="scan" data-testid="velvet-dup-rescan">Rescan</button></section>
        ${selection}${groups}`;
}

// ── Tags ────────────────────────────────────────────────────────────────────

async function loadTags() {
    _view.innerHTML = '<div class="vl-empty">Loading tags…</div>';
    try {
        const data = await proxyJson('tags');
        state.tags = data.tags || [];
        renderView();
    } catch (err) {
        _view.innerHTML = `<div class="vl-startup error">${esc(err?.detail || 'Tags could not be loaded.')}</div>`;
    }
}

function tagsHtml() {
    if (!state.tags.length) {
        return `<section class="vl-panel vl-empty"><strong>No tags yet</strong>
            <p>Open a file and add labels — performer, scene type, anything you want to filter by.</p></section>`;
    }
    return `<section class="vl-panel">
      <table class="vl-table"><thead><tr><th>Tag</th><th class="vl-num">Files</th><th></th></tr></thead>
      <tbody>${state.tags.map((row) => `<tr>
        <td><span class="vl-tag is-info">${esc(row.tag)}</span></td>
        <td class="vl-num">${row.count}</td>
        <td class="vl-actions">
          <button class="vl-btn small" type="button" data-action="tag-rename" data-tag="${attr(row.tag)}" data-testid="velvet-tag-rename">Rename</button>
          <button class="vl-btn small danger" type="button" data-action="tag-delete" data-tag="${attr(row.tag)}" data-testid="velvet-tag-delete">Delete</button>
        </td></tr>`).join('')}</tbody></table>
    </section>`;
}

// ── Settings ────────────────────────────────────────────────────────────────

function settingsHtml() {
    const folders = state.folders.length
        ? state.folders.map((folder) => `<tr>
            <td class="vl-path">${esc(folder.path)}</td>
            <td class="vl-actions"><button class="vl-btn small danger" type="button" data-action="folder-remove"
                data-path="${attr(folder.path)}" data-testid="velvet-folder-remove">Remove</button></td>
          </tr>`).join('')
        : '<tr><td colspan="2" class="vl-muted">No folders yet.</td></tr>';
    const summary = state.summary || {};
    const select = (key, label, values) => `<label class="vl-field"><span>${label}</span>
        <select class="vl-select" data-role="setting" data-key="${key}" data-testid="velvet-setting-${key}">
          ${values.map(([value, text]) => `<option value="${value}" ${state.settings[key] === value ? 'selected' : ''}>${text}</option>`).join('')}
        </select></label>`;
    return `
    <section class="vl-panel">
      <div class="vl-toolbar"><div class="vl-toolbar-title"><strong>Folders</strong>
        <span class="vl-muted">Scanned in place; read through the EthOS service identity.</span></div>
        <div class="vl-row">
          <button class="vl-btn primary" type="button" data-action="add-folder" data-testid="velvet-add-folder">Add folder</button>
          <button class="vl-btn" type="button" data-action="scan" data-testid="velvet-settings-scan">Rescan all</button>
        </div></div>
      <table class="vl-table"><thead><tr><th>Folder</th><th></th></tr></thead><tbody>${folders}</tbody></table>
    </section>
    <section class="vl-panel">
      <div class="vl-toolbar"><div class="vl-toolbar-title"><strong>Playback &amp; view</strong>
        <span class="vl-muted">Defaults for the player and the grid.</span></div></div>
      <div class="vl-fields">
        ${select('quality', 'Transcode quality', [['auto', 'Auto (1080p)'], ['balanced', '1080p'], ['fast', '720p'], ['tiny', '480p']])}
        ${select('eye', 'Default eye', [['left', 'Left eye'], ['right', 'Right eye'], ['sbs', 'Side by side']])}
        ${select('grid', 'Grid size', [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']])}
        <label class="vl-field"><span>On open</span>
          <span class="vl-check-line"><input type="checkbox" data-role="setting" data-key="auto_scan"
            ${state.settings.auto_scan ? 'checked' : ''} data-testid="velvet-setting-auto-scan"> Quick rescan when Velvet opens (picks up File Manager changes)</span>
        </label>
      </div>
    </section>
    <section class="vl-panel">
      <div class="vl-toolbar"><div class="vl-toolbar-title"><strong>Data</strong>
        <span class="vl-muted">${summary.files || 0} files · ${fmtBytes(summary.size)} · service ${esc(_ctx.pkg.version || '')}</span></div></div>
      <div class="vl-def-grid">
        <div><span>Missing files</span><strong>${summary.missing || 0}</strong></div>
        <div><span>Marked to delete</span><strong>${summary.rejected?.files || 0} · ${fmtBytes(summary.rejected?.size)}</strong></div>
        <div><span>Duplicate groups</span><strong>${summary.duplicates?.groups || 0}</strong></div>
        <div><span>Reclaimable</span><strong>${fmtBytes(summary.duplicates?.reclaimable)}</strong></div>
      </div>
      <div class="vl-form-actions">
        <button class="vl-btn" type="button" data-action="forget-missing" data-testid="velvet-forget-missing" ${summary.missing ? '' : 'disabled'}>Forget missing entries</button>
      </div>
      <p class="vl-muted">Velvet stores metadata and thumbnails only. Video files are streamed by EthOS and permanently deleted through the core file API after you confirm.</p>
    </section>`;
}

async function saveSetting(key, value) {
    try {
        const data = await proxyJson('settings', { method: 'PUT', body: { settings: { [key]: value } } });
        state.settings = { ...state.settings, ...(data.settings || {}) };
        if (key === 'grid') applyGridSize();
        if (key === 'eye') {
            for (const button of _playerEl?.querySelectorAll('[data-action="player-eye"]') || []) {
                button.classList.toggle('is-active', button.dataset.eye === value);
            }
            applyEye(value);
        }
        updateChrome();
    } catch (err) {
        _ctx.notifications.toast(err?.detail || 'That setting could not be saved.', 'error');
    }
}

// ── Folder picker / scan helpers ────────────────────────────────────────────

async function addFolder() {
    let path = '';
    if (typeof _ctx.pickFolder === 'function') {
        path = await _ctx.pickFolder({
            title: 'Add a video folder',
            roots: ['/home', '/mnt', '/media'],
            acceptLabel: 'Add folder',
        });
        if (!path) return;
    } else {
        const values = await _ctx.modal.form({
            title: 'Add a video folder',
            bodyHtml: '<label class="vl-field"><span>Absolute path</span><input class="vl-input" name="path" placeholder="/media/…" data-testid="velvet-folder-path"></label>',
            confirmLabel: 'Add folder',
            validate: (values) => String(values.path || '').trim().startsWith('/') ? null : 'Enter an absolute path.',
        });
        if (!values) return;
        path = String(values.path || '').trim();
    }
    const folders = [...state.folders.map((folder) => folder.path), path];
    try {
        const data = await proxyJson('folders', { method: 'PUT', body: { folders } });
        state.folders = data.folders || [];
        setStatus('Folder added — scanning…');
        await startScan();
        if (state.view === 'library') loadLibrary({ reset: true });
    } catch (err) {
        _ctx.notifications.toast(err?.detail || 'That folder could not be added.', 'error');
    }
}

async function removeFolder(path) {
    const ok = await confirmDialog({
        title: 'Remove folder',
        message: 'Remove this folder from Velvet? Indexed entries stay listed until you forget them.',
        okText: 'Remove',
    });
    if (!ok) return;
    const folders = state.folders.map((folder) => folder.path).filter((entry) => entry !== path);
    try {
        const data = await proxyJson('folders', { method: 'PUT', body: { folders } });
        state.folders = data.folders || [];
        state.scan = { state: 'idle' };
        updateChrome();
        renderView();
        setStatus('Folder removed.');
    } catch (err) {
        _ctx.notifications.toast(err?.detail || 'That folder could not be removed.', 'error');
    }
}

async function forgetMissing() {
    try {
        const data = await proxyJson('library?missing=1&limit=300');
        const paths = (data.items || []).map((item) => item.path);
        if (!paths.length) return;
        await proxyJson('forget', { method: 'POST', body: { paths } });
        _ctx.notifications.toast(`Forgot ${paths.length} missing entr${paths.length === 1 ? 'y' : 'ies'}.`, 'success');
        await loadLibrary({ reset: true });
    } catch (err) {
        _ctx.notifications.toast(err?.detail || 'Missing entries could not be forgotten.', 'error');
    }
}

// ── Permanent delete ────────────────────────────────────────────────────────

function confirmDialog({ title, message, okText = 'OK' }) {
    return new Promise((resolve) => {
        _ctx.modal.confirm({
            title, message, okText,
            onConfirm: () => resolve(true),
            onCancel: () => resolve(false),
        });
    });
}

// The core op is a plain unlink (milliseconds on an idle disk), but thumbnail
// extraction or a copy job can keep the volume busy for seconds. Hide the rows
// as soon as the request is accepted and put them back only when the op fails.
function hidePendingDelete(paths) {
    const drop = new Set(paths);
    const snapshot = {
        items: state.items,
        total: state.total,
        summary: state.summary ? { ...state.summary } : null,
        byPath: new Map(state.byPath),
        selected: new Set(state.selected),
    };
    const present = state.items.filter((item) => drop.has(item.path)).length;
    state.items = state.items.filter((item) => !drop.has(item.path));
    state.total = Math.max(0, state.total - present);
    for (const path of paths) {
        const card = _view?.querySelector(
            `[data-testid="velvet-card"][data-path="${CSS.escape(path)}"]`);
        if (card) card.remove();
        state.selected.delete(path);
    }
    return snapshot;
}

function restorePendingDelete(snapshot) {
    if (!snapshot) return;
    state.items = snapshot.items;
    state.total = snapshot.total;
    state.summary = snapshot.summary;
    state.byPath = snapshot.byPath;
    state.selected = snapshot.selected;
    renderView();
}

async function deletePaths(paths) {
    const unique = [...new Set(paths.filter(Boolean))];
    if (!unique.length) return;
    const items = unique.map((path) => itemFor(path)).filter(Boolean);
    const totalSize = items.reduce((sum, item) => sum + Number(item.size || 0), 0);

    if (unique.length === 1) {
        const item = itemFor(unique[0]);
        const label = item?.title || basename(unique[0]);
        const ok = await confirmDialog({
            title: 'Delete permanently',
            message: `${label}\n\n${fmtBytes(item?.size)} · This removes the file from disk and cannot be undone.`,
            okText: 'Delete permanently',
        });
        if (!ok) return;
    } else {
        const values = await _ctx.modal.form({
            title: `Delete ${unique.length} files permanently`,
            bodyHtml: `<p style="font-size:12px;line-height:1.55;margin:0 0 12px">${unique.length} files · ${fmtBytes(totalSize)}<br>
                This removes them from disk. It cannot be undone.</p>
                <label style="display:flex;flex-direction:column;gap:6px;font-size:12px"><span>Type DELETE to confirm</span>
                <input class="vl-input" name="confirm" autocomplete="off" style="background:#111827;color:#e2e8f0;border:1px solid #334155;border-radius:9px;padding:9px 11px" data-testid="velvet-delete-confirm"></label>`,
            confirmLabel: 'Delete permanently',
            validate: (values) => String(values.confirm || '').trim() === 'DELETE'
                ? null : 'Type DELETE exactly to confirm.',
        });
        if (!values) return;
    }

    if (_player && unique.includes(_player.item.path)) await closePlayer();
    if (state.detail && unique.includes(state.detail.path)) closeDetail();

    const task = _ctx.progress.startTask({
        appId: APP_ID,
        title: `Deleting ${unique.length} file${unique.length === 1 ? '' : 's'}…`,
        total: unique.length,
    });
    // Rows disappear immediately; the progress row keeps reporting until the
    // core confirms the unlink (and rolls the rows back if it did not).
    const rollback = hidePendingDelete(unique);
    try {
        const response = await _ctx.apiJsonFetch('/api/files/delete', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paths: unique }),
        });
        const opId = response?.op_id;
        if (opId) {
            let finished = false;
            let delay = 150;  // first check fast: most deletes finish in ~ms
            for (let tick = 0; tick < 900; tick += 1) {
                await sleep(delay);
                delay = Math.min(1000, Math.round(delay * 1.6));
                const snapshot = await _ctx.apiJsonFetch(`/api/files/ops/${encodeURIComponent(opId)}`);
                task.update({
                    index: snapshot.index || 0,
                    detail: snapshot.current
                        ? `Removing ${snapshot.current}…`
                        : `${snapshot.succeeded || 0} deleted`,
                });
                if (snapshot.status === 'done') {
                    if (snapshot.failed) {
                        const first = (snapshot.details || []).find((d) => d.status !== 'ok');
                        throw new Error(first?.reason
                            || `${snapshot.failed} file(s) could not be deleted`);
                    }
                    finished = true;
                    break;
                }
            }
            if (!finished) throw new Error('The delete operation did not finish in time');
        }
        let cleanupWarning = '';
        try {
            await proxyJson('forget', { method: 'POST', body: { paths: unique } });
        } catch (err) {
            cleanupWarning = err?.detail || err?.message || 'the index could not be cleaned up';
        }
        task.finish('done', { percent: 100, detail: `${unique.length} deleted` });
        for (const path of unique) {
            state.byPath.delete(path);
            state.selected.delete(path);
            _recentDeletes.set(path, Date.now());
        }
        for (const [path, stamp] of _recentDeletes) {
            if (stamp < Date.now() - 60000) _recentDeletes.delete(path);
        }
        // Counts move locally: reloading the whole page after every delete was
        // the slow part (and pointless — the rows are already gone).
        if (state.summary) {
            state.summary = {
                ...state.summary,
                files: Math.max(0, (state.summary.files || 0) - unique.length),
                size: Math.max(0, (state.summary.size || 0) - totalSize),
            };
        }
        _ctx.notifications.toast(
            `Permanently deleted ${unique.length} file${unique.length === 1 ? '' : 's'}.`, 'success');
        if (cleanupWarning) {
            _ctx.notifications.toast(`Files deleted, but the index cleanup failed: ${cleanupWarning}`, 'warning');
        }
        try { await refreshState(); } catch { /* the next load will retry */ }
        if (state.view === 'library') {
            updateChrome();
            renderView();
        } else if (state.view === 'duplicates') await loadDuplicates();
        else await loadTags();
    } catch (err) {
        restorePendingDelete(rollback);
        task.finish('failed', { detail: err?.detail || err?.message || 'Delete failed' });
        _ctx.notifications.toast(err?.detail || err?.message || 'The delete failed.', 'error');
    }
}

// ── Player ──────────────────────────────────────────────────────────────────

function qualityPreset(setting) {
    return setting === 'balanced' || setting === 'fast' || setting === 'tiny' ? setting : 'balanced';
}

function audioCodec() {
    try {
        if (!window.MediaSource) return 'none';
        if (MediaSource.isTypeSupported('audio/mp4; codecs="mp4a.40.2"')) return 'aac';
        if (MediaSource.isTypeSupported('audio/webm; codecs="opus"')) return 'opus';
    } catch { /* no MSE */ }
    return 'none';
}

let _hlsPromise = null;
async function loadHlsLib() {
    if (window.Hls) return;
    if (_hlsPromise) return _hlsPromise;
    _hlsPromise = (async () => {
        const asset = `/api/packages/${encodeURIComponent(_ctx.pkg.id)}/ui/frontend/hls.min.js`;
        const response = await _ctx.apiFetch(asset);
        if (!response.ok) throw new Error(`hls.js asset HTTP ${response.status}`);
        const source = await response.text();
        const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        try {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = url;
                script.onload = resolve;
                script.onerror = () => reject(new Error('hls.js failed to load'));
                document.head.appendChild(script);
            });
        } finally {
            URL.revokeObjectURL(url);
        }
        if (!window.Hls) throw new Error('hls.js did not initialise');
    })().finally(() => { _hlsPromise = null; });
    return _hlsPromise;
}

function playerShell(item) {
    const eyeButtons = item.sbs
        ? `<div class="vl-seg" role="group" aria-label="Eye view">
             ${['left', 'right', 'sbs'].map((eye) => `<button type="button" class="vl-seg-btn ${state.settings.eye === eye ? 'is-active' : ''}"
                 data-action="player-eye" data-eye="${eye}" data-testid="velvet-eye-${eye}">${EYE_LABELS[eye]}</button>`).join('')}
           </div>`
        : '<span class="vl-tag is-warn">Mono</span>';
    return `
    <div class="vl-player-head">
      <div class="vl-grow"><strong>${esc(item.title || item.name)}</strong>
        <div class="vl-muted">${esc(item.studio || '')}${item.projection ? ` · ${esc(item.projection)}` : ''}${item.res_label ? ` · ${esc(item.res_label)}` : ''}</div></div>
      ${eyeButtons}
      <button class="vl-btn danger small" type="button" data-action="player-delete" data-testid="velvet-player-delete">Delete</button>
      <button class="vl-btn small" type="button" data-action="player-close" data-testid="velvet-player-close">✕</button>
    </div>
    <div class="vl-stage-area" data-role="stage-area">
      <div class="vl-stage" data-role="stage"><video data-role="video" playsinline preload="metadata"></video></div>
      <div class="vl-player-status" data-role="player-status" hidden></div>
    </div>
    <div class="vl-controls">
      <input class="vl-seek" type="range" min="0" max="1000" value="0" step="1" data-role="seek" data-testid="velvet-seek">
      <div class="vl-control-row">
        <button class="vl-btn small" type="button" data-action="player-toggle" data-testid="velvet-player-toggle">Play</button>
        <button class="vl-btn small" type="button" data-action="player-back" data-testid="velvet-player-back">−10s</button>
        <button class="vl-btn small" type="button" data-action="player-fwd" data-testid="velvet-player-fwd">+10s</button>
        <span class="vl-time" data-role="time">0:00 / ${fmtDuration(item.duration)}</span>
        <span class="vl-spacer"></span>
        <select class="vl-select" data-role="quality" data-testid="velvet-quality">
          ${Object.entries(QUALITY_LABELS).map(([value, label]) =>
            `<option value="${value}" ${state.settings.quality === value ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
        <select class="vl-select" data-role="audio" data-testid="velvet-audio" hidden></select>
        <select class="vl-select" data-role="speed" data-testid="velvet-speed">
          ${[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) =>
            `<option value="${rate}" ${rate === 1 ? 'selected' : ''}>${rate}×</option>`).join('')}
        </select>
        <button class="vl-btn small" type="button" data-action="player-pip" data-testid="velvet-pip">PiP</button>
        <button class="vl-btn small" type="button" data-action="player-fullscreen" data-testid="velvet-fullscreen">⛶</button>
      </div>
    </div>`;
}

async function openPlayer(item, options = {}) {
    if (!_playerEl) return;
    if (_player) await closePlayer();
    _playerEl.hidden = false;
    _playerEl.innerHTML = playerShell(item);
    const refs = {
        video: _playerEl.querySelector('[data-role="video"]'),
        stage: _playerEl.querySelector('[data-role="stage"]'),
        stageArea: _playerEl.querySelector('[data-role="stage-area"]'),
        status: _playerEl.querySelector('[data-role="player-status"]'),
        seek: _playerEl.querySelector('[data-role="seek"]'),
        time: _playerEl.querySelector('[data-role="time"]'),
        quality: _playerEl.querySelector('[data-role="quality"]'),
        audio: _playerEl.querySelector('[data-role="audio"]'),
        speed: _playerEl.querySelector('[data-role="speed"]'),
    };
    _player = {
        item, refs, hls: null, sid: null, mode: '', duration: Number(item.duration || 0),
        eye: item.sbs ? (options.eye || state.settings.eye || 'left') : 'sbs',
        audioIndex: 0, audioTracks: [], lastSave: 0, timer: null, seekTimer: null,
        resume: 0, dragging: false, error: '', offset: 0,
    };
    applyEye(_player.eye);
    _resizeHandler = () => layoutStage();
    window.addEventListener('resize', _resizeHandler);
    refs.video.addEventListener('timeupdate', onTimeUpdate);
    refs.video.addEventListener('waiting', () => showPlayerStatus('Buffering…'));
    refs.video.addEventListener('playing', () => hidePlayerStatus());
    refs.video.addEventListener('ended', () => {
        setStatus('Finished.');
        saveResume(true);
    });
    refs.video.addEventListener('error', () => {
        if (_player?.mode === 'direct') showPlayerError('The video could not be played. Try the HLS mode.');
    });
    _player.timer = setInterval(() => saveResume(false), 5000);

    try {
        const info = await _ctx.apiJsonFetch(`/api/videos/info?path=${encodeURIComponent(item.path)}`);
        // `/api/videos/info` nests the facts under `info` (playback_mode,
        // audio_tracks, duration); tolerate older cores that answered flat.
        const details = info?.info || info || {};
        _player.duration = Number(details.duration || info?.duration || _player.duration || 0);
        _player.audioTracks = details.audio_tracks || info?.audio_tracks || [];
        _player.info = info;
        renderAudioOptions();
        const resume = options.t != null ? Number(options.t)
            : await resumeFor(item.path);
        _player.resume = resume || 0;
        const playbackMode = details.playback_mode || info?.playback_mode || '';
        if (playbackMode === 'direct') {
            await startDirect();
        } else {
            await startHls(_player.resume);
        }
    } catch (err) {
        showPlayerError(err?.detail || err?.message || 'Playback could not start.');
    }
}

function renderAudioOptions() {
    if (!_player?.refs.audio) return;
    const tracks = _player.audioTracks || [];
    if (tracks.length <= 1) {
        _player.refs.audio.hidden = true;
        return;
    }
    _player.refs.audio.hidden = false;
    _player.refs.audio.innerHTML = tracks.map((track, index) =>
        `<option value="${index}">${esc(track.language || track.codec || `Track ${index + 1}`)}${track.channels ? ` · ${track.channels}ch` : ''}</option>`
    ).join('');
}

async function resumeFor(path) {
    try {
        const data = await proxyJson(`resume?path=${encodeURIComponent(path)}`);
        return Number(data.t || 0);
    } catch {
        return 0;
    }
}

async function startDirect() {
    if (!_player) return;
    const { video } = _player.refs;
    _player.mode = 'direct';
    _player.offset = 0;
    _player.refs.quality.disabled = true;
    if (_player.refs.audio) _player.refs.audio.hidden = true;
    video.src = withToken(`/api/videos/stream?path=${encodeURIComponent(_player.item.path)}`);
    video.addEventListener('loadedmetadata', () => {
        if (!_player) return;
        if (_player.resume > 0 && _player.resume < video.duration - 5) video.currentTime = _player.resume;
        video.play().catch(() => { /* autoplay may be blocked */ });
        layoutStage();
    }, { once: true });
}

async function startHls(startAt) {
    if (!_player) return;
    const { video } = _player.refs;
    const offset = Math.max(0, Number(startAt) || 0);
    _player.offset = offset;
    try {
        const payload = {
            path: _player.item.path,
            t: offset,
            a: _player.audioIndex,
            q: qualityPreset(state.settings.quality),
            acodec: audioCodec(),
        };
        const data = await _ctx.apiJsonFetch('/api/videos/hls', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        _player.sid = data.session;
        _player.mode = 'hls';
        _player.duration = Number(data.duration || _player.duration || 0);
        _player.refs.quality.disabled = false;
        await loadHlsLib();
        const Hls = window.Hls;
        const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
        _player.hls = hls;
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (!_player) return;
            video.play().catch(() => { /* user gesture */ });
            layoutStage();
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
            if (!data.fatal) return;
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                hls.startLoad();
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                hls.recoverMediaError();
            } else {
                showPlayerError('The stream could not be played.');
            }
        });
        hls.loadSource(withToken(data.playlist));
        hls.attachMedia(video);
        hidePlayerStatus();
    } catch (err) {
        showPlayerError(err?.detail || err?.message || 'The transcode session could not start.');
    }
}

async function stopSession() {
    if (_player?.hls) {
        try { _player.hls.destroy(); } catch { /* already gone */ }
        _player.hls = null;
    }
    if (_player?.sid) {
        const sid = _player.sid;
        _player.sid = null;
        try {
            await _ctx.apiJsonFetch(`/api/videos/hls/${encodeURIComponent(sid)}/stop`, { method: 'POST' });
        } catch { /* the session may already have expired */ }
    }
}

async function restartStream(at) {
    if (!_player) return;
    await stopSession();
    const { video } = _player.refs;
    try {
        video.removeAttribute('src');
        video.load();
    } catch { /* no-op */ }
    _player.resume = Math.max(0, Number(at) || 0);
    await startHls(_player.resume);
}

async function closePlayer() {
    if (!_player) {
        if (_playerEl) {
            _playerEl.hidden = true;
            _playerEl.innerHTML = '';
        }
        return;
    }
    await saveResume(true);
    clearInterval(_player.timer);
    clearTimeout(_player.seekTimer);
    if (_resizeHandler) {
        window.removeEventListener('resize', _resizeHandler);
        _resizeHandler = null;
    }
    const video = _player.refs.video;
    try {
        video.pause();
        video.removeAttribute('src');
        video.load();
    } catch { /* element is going away */ }
    await stopSession();
    _player = null;
    if (_playerEl) {
        _playerEl.hidden = true;
        _playerEl.innerHTML = '';
    }
}

async function saveResume(force) {
    if (!_player) return;
    const now = Date.now();
    if (!force && now - _player.lastSave < 5000) return;
    const seconds = absoluteTime();
    const duration = Number(_player.duration || 0);
    if (!seconds || seconds < 5) return;
    if (duration && seconds > duration * 0.95) {
        try { await proxyJson('resume', { method: 'PUT', body: { path: _player.item.path, t: 0 } }); } catch { /* ignore */ }
        return;
    }
    _player.lastSave = now;
    try {
        await proxyJson('resume', { method: 'PUT', body: { path: _player.item.path, t: seconds } });
    } catch { /* best-effort */ }
}

function absoluteTime() {
    if (!_player) return 0;
    return Math.max(0, Number(_player.offset || 0) + Number(_player.refs.video.currentTime || 0));
}

function onTimeUpdate() {
    if (!_player || _player.dragging) return;
    const { video, seek, time } = _player.refs;
    const duration = _player.duration || video.duration || 0;
    const absolute = absoluteTime();
    if (duration > 0) {
        seek.value = String(Math.round(Math.min(1, absolute / duration) * 1000));
    }
    time.textContent = `${fmtDuration(absolute)} / ${fmtDuration(duration)}`;
}

function seekBy(delta) {
    if (!_player) return;
    const target = Math.max(0, Math.min(_player.duration || 0, absoluteTime() + delta));
    seekTo(target);
}

function seekTo(target) {
    if (!_player) return;
    if (_player.mode === 'direct') {
        _player.refs.video.currentTime = target;
        return;
    }
    clearTimeout(_player.seekTimer);
    _player.seekTimer = setTimeout(() => restartStream(target), 400);
}

function applyEye(eye) {
    if (!_player) return;
    _player.eye = _player.item.sbs ? (eye || 'left') : 'sbs';
    for (const button of _playerEl.querySelectorAll('[data-action="player-eye"]')) {
        button.classList.toggle('is-active', button.dataset.eye === _player.eye);
    }
    layoutStage();
}

function layoutStage() {
    if (!_player) return;
    const { stage, stageArea, video } = _player.refs;
    if (!stage || !stageArea) return;
    const area = stageArea.getBoundingClientRect();
    if (!area.width || !area.height) return;
    const width = Number(_player.item.width || video.videoWidth || 1920);
    const height = Number(_player.item.height || video.videoHeight || 1080);
    const fullRatio = width && height ? width / height : 16 / 9;
    const eye = _player.eye;
    const ratio = (!_player.item.sbs || eye === 'sbs') ? fullRatio : fullRatio / 2;
    let h = area.height;
    let w = h * ratio;
    if (w > area.width) {
        w = area.width;
        h = w / ratio;
    }
    stage.style.width = `${Math.max(1, Math.floor(w))}px`;
    stage.style.height = `${Math.max(1, Math.floor(h))}px`;
    const videoWidth = Math.round(h * fullRatio);
    video.style.height = `${Math.round(h)}px`;
    video.style.width = `${videoWidth}px`;
    video.style.left = eye === 'right' && _player.item.sbs ? `${-Math.round(w)}px` : '0px';
}

function showPlayerStatus(message) {
    if (!_player?.refs.status) return;
    _player.refs.status.hidden = false;
    _player.refs.status.innerHTML = `<span class="vl-muted">${esc(message)}</span>`;
}

function hidePlayerStatus() {
    if (!_player?.refs.status) return;
    _player.refs.status.hidden = true;
    _player.refs.status.innerHTML = '';
}

function showPlayerError(message) {
    if (!_player?.refs.status) return;
    _player.refs.status.hidden = false;
    _player.refs.status.innerHTML = `<div class="vl-startup error">${esc(message)}</div>
        <button class="vl-btn small" type="button" data-action="player-retry" data-testid="velvet-player-retry">Try again</button>`;
    _player.error = message;
}

async function retryPlayer() {
    if (!_player) return;
    hidePlayerStatus();
    await restartStream(absoluteTime() || _player.resume || 0);
}

async function changeQuality(value) {
    if (!_player) return;
    state.settings.quality = value;
    saveSetting('quality', value);
    if (_player.mode === 'hls') await restartStream(absoluteTime());
}

async function changeAudio(index) {
    if (!_player) return;
    _player.audioIndex = Number(index) || 0;
    if (_player.mode === 'hls') await restartStream(absoluteTime());
}

function togglePlay() {
    if (!_player) return;
    const video = _player.refs.video;
    if (video.paused) video.play().catch(() => { /* ignore */ });
    else video.pause();
}

async function toggleFullscreen() {
    if (!_player) return;
    const target = _player.refs.stageArea;
    try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await target.requestFullscreen();
    } catch { /* denied */ }
}

// ── Events ──────────────────────────────────────────────────────────────────

function onClick(event) {
    const actionEl = event.target.closest('[data-action]');
    if (!actionEl || !_root.contains(actionEl)) return;
    const action = actionEl.dataset.action;
    const path = actionEl.dataset.path;

    switch (action) {
        case 'view':
            setView(actionEl.dataset.view);
            return;
        case 'add-folder':
            addFolder();
            return;
        case 'scan':
            startScan();
            return;
        case 'select-mode':
            state.selectMode = !state.selectMode;
            if (!state.selectMode) state.selected.clear();
            renderView();
            return;
        case 'select':
            if (path) toggleSelected(path);
            return;
        case 'select-all':
            for (const item of state.items) state.selected.add(item.path);
            renderView();
            return;
        case 'select-none':
            state.selected.clear();
            renderView();
            return;
        case 'delete-selected':
            deletePaths([...state.selected]);
            return;
        case 'delete-path':
            if (path) deletePaths([path]);
            return;
        case 'filter-toggle': {
            const key = actionEl.dataset.key;
            state.filters[key] = !state.filters[key];
            loadLibrary({ reset: true });
            return;
        }
        case 'load-more':
            loadLibrary({ reset: false });
            return;
        case 'open':
            if (path) {
                if (state.selectMode) toggleSelected(path);
                else openDetail(path);
            }
            return;
        case 'play':
            if (path) {
                const item = itemFor(path);
                if (item) openPlayer(item);
            }
            return;
        case 'detail-close':
            closeDetail();
            return;
        case 'detail-prev':
            navigateDetail(-1);
            return;
        case 'detail-next':
            navigateDetail(1);
            return;
        case 'detail-play':
            if (state.detail) openPlayer(state.detail);
            return;
        case 'frame-pick': {
            const poster = _detailEl.querySelector('[data-testid="velvet-poster"]');
            if (poster && actionEl.src) poster.src = actionEl.src;
            return;
        }
        case 'detail-delete':
            if (state.detail) deletePaths([state.detail.path]);
            return;
        case 'rate':
            patchDetail({ rating: Number(actionEl.dataset.value || 0) });
            return;
        case 'favorite':
            patchDetail({ favorite: !state.detail?.favorite });
            return;
        case 'reject':
            patchDetail({ reject: !state.detail?.reject });
            return;
        case 'tag-add': {
            const input = _detailEl.querySelector('[data-role="tag-input"]');
            const tag = String(input?.value || '').trim();
            if (tag) patchDetail({ tags_add: [tag] });
            return;
        }
        case 'tag-remove':
            patchDetail({ tags_remove: [actionEl.dataset.tag] });
            return;
        case 'tag-rename':
            renameTag(actionEl.dataset.tag);
            return;
        case 'tag-delete':
            deleteTag(actionEl.dataset.tag);
            return;
        case 'dup-select-others': {
            const group = state.dups.find((entry) => entry.key === actionEl.dataset.key);
            if (group) {
                const keep = [...(group.items || [])].sort((a, b) => Number(b.size) - Number(a.size))[0];
                for (const item of group.items || []) {
                    if (item.path !== keep?.path) state.selected.add(item.path);
                }
                renderView();
            }
            return;
        }
        case 'folder-remove':
            if (path) removeFolder(path);
            return;
        case 'forget-missing':
            forgetMissing();
            return;
        case 'player-close':
            closePlayer();
            return;
        case 'player-delete':
            if (_player) {
                const current = _player.item.path;
                closePlayer().then(() => deletePaths([current]));
            }
            return;
        case 'player-toggle':
            togglePlay();
            return;
        case 'player-back':
            seekBy(-10);
            return;
        case 'player-fwd':
            seekBy(10);
            return;
        case 'player-eye':
            applyEye(actionEl.dataset.eye);
            saveSetting('eye', actionEl.dataset.eye);
            return;
        case 'player-pip':
            if (_player?.refs.video.requestPictureInPicture) {
                _player.refs.video.requestPictureInPicture().catch(() => { /* unsupported */ });
            }
            return;
        case 'player-fullscreen':
            toggleFullscreen();
            return;
        case 'player-retry':
            retryPlayer();
            return;
        default:
            return;
    }
}

function onChange(event) {
    const el = event.target;
    if (el.dataset?.role === 'filter') {
        state.filters[el.dataset.key] = el.value;
        loadLibrary({ reset: true });
        return;
    }
    if (el.dataset?.role === 'setting') {
        const value = el.type === 'checkbox' ? el.checked : el.value;
        saveSetting(el.dataset.key, value);
        return;
    }
    if (el.dataset?.role === 'seek' && _player) {
        _player.dragging = false;
        const duration = _player.duration || _player.refs.video.duration || 0;
        seekTo((Number(el.value) / 1000) * duration);
        return;
    }
    if (el.dataset?.role === 'quality') {
        changeQuality(el.value);
        return;
    }
    if (el.dataset?.role === 'audio') {
        changeAudio(el.value);
        return;
    }
    if (el.dataset?.role === 'speed' && _player) {
        _player.refs.video.playbackRate = Number(el.value) || 1;
    }
}

function onInput(event) {
    const el = event.target;
    if (el.dataset?.role === 'search') {
        clearTimeout(_searchTimer);
        _searchTimer = setTimeout(() => {
            state.filters.q = el.value.trim();
            loadLibrary({ reset: true });
        }, 300);
        return;
    }
    if (el.dataset?.role === 'seek' && _player) {
        _player.dragging = true;
        const duration = _player.duration || _player.refs.video.duration || 0;
        const seconds = (Number(el.value) / 1000) * duration;
        _player.refs.time.textContent = `${fmtDuration(seconds)} / ${fmtDuration(duration)}`;
    }
}

function onKeydown(event) {
    if (!_root || !document.body.contains(_root)) {
        if (_keyHandler) document.removeEventListener('keydown', _keyHandler);
        return;
    }
    if (_playerEl && !_playerEl.hidden) {
        if (event.key === 'Escape') { event.preventDefault(); closePlayer(); }
        else if (event.code === 'Space') { event.preventDefault(); togglePlay(); }
        else if (event.key === 'ArrowLeft') { event.preventDefault(); seekBy(-10); }
        else if (event.key === 'ArrowRight') { event.preventDefault(); seekBy(10); }
        else if (event.key === 'f' || event.key === 'F') toggleFullscreen();
        else if (event.key === 'm' || event.key === 'M') {
            const video = _player?.refs.video;
            if (video) video.muted = !video.muted;
        }
        return;
    }
    if (!_detailEl || _detailEl.hidden) return;
    if (event.target?.dataset?.role === 'tag-input' && event.key === 'Enter') {
        event.preventDefault();
        _detailEl.querySelector('[data-action="tag-add"]')?.click();
        return;
    }
    if (event.key === 'Escape') { event.preventDefault(); closeDetail(); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); navigateDetail(-1); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); navigateDetail(1); }
}

function toggleSelected(path) {
    if (state.selected.has(path)) state.selected.delete(path);
    else state.selected.add(path);
    renderView();
}

async function renameTag(tag) {
    const values = await _ctx.modal.form({
        title: 'Rename tag',
        bodyHtml: `<label style="display:flex;flex-direction:column;gap:6px;font-size:12px"><span>New name</span>
            <input class="vl-input" name="name" value="${attr(tag)}" style="background:#111827;color:#e2e8f0;border:1px solid #334155;border-radius:9px;padding:9px 11px" data-testid="velvet-tag-rename-input"></label>`,
        confirmLabel: 'Rename',
        validate: (values) => String(values.name || '').trim() ? null : 'Enter a tag name.',
    });
    if (!values) return;
    try {
        await proxyJson('tags/rename', { method: 'POST', body: { from: tag, to: String(values.name).trim() } });
        await loadTags();
        _ctx.notifications.toast('Tag renamed.', 'success');
    } catch (err) {
        _ctx.notifications.toast(err?.detail || 'The tag could not be renamed.', 'error');
    }
}

async function deleteTag(tag) {
    const ok = await confirmDialog({
        title: 'Delete tag',
        message: `Remove “${tag}” from every file? The files themselves are untouched.`,
        okText: 'Delete tag',
    });
    if (!ok) return;
    try {
        await proxyJson('tags/delete', { method: 'POST', body: { tag } });
        await loadTags();
        _ctx.notifications.toast('Tag removed.', 'success');
    } catch (err) {
        _ctx.notifications.toast(err?.detail || 'The tag could not be removed.', 'error');
    }
}

// ── Styles ──────────────────────────────────────────────────────────────────

const STYLES = `
<style>
.vl-root {
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
  --pkg-accent-contrast: #ffffff;
  --vl-media-bg: #0d1117;
  --vl-media-edge: #1e293b;
  --vl-overlay: #f8fafc;
  --vl-chip-bg: rgba(3, 7, 18, 0.82);
  --vl-chip-text: #e2e8f0;
  --vl-control-bg: rgba(3, 7, 18, 0.55);
  --vl-control-border: rgba(226, 232, 240, 0.75);
  --vl-player-bg: #02040a;
  --vl-player-scrim: rgba(2, 4, 10, 0.72);
  --vl-player-panel: #0b1220;
  --vl-player-hover: #1e293b;
  --vl-player-border: #334155;
  --vl-player-text: #e2e8f0;
  --vl-player-muted: #94a3b8;
  --vl-player-danger-bg: rgba(248, 113, 113, 0.14);
  --vl-player-danger-border: rgba(248, 113, 113, 0.45);
  --vl-player-danger-text: #f87171;
  --vl-video-bg: #000000;
}
:root.dark .vl-root {
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
  --pkg-accent-contrast: #04121f;
  --vl-media-bg: #04070d;
  --vl-media-edge: #1e293b;
  --vl-overlay: #050b14;
}
.vl-root {
  display: flex;
  height: 100%;
  overflow: hidden;
  position: relative;
  background:
    radial-gradient(circle at 8% 4%, rgba(225, 29, 72, 0.10), transparent 42%),
    radial-gradient(circle at 92% 96%, rgba(244, 114, 182, 0.07), transparent 44%),
    var(--pkg-bg);
  color: var(--pkg-text);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
.vl-side {
  flex: none; width: 218px; padding: 20px 14px;
  border-right: 1px solid var(--pkg-border); overflow-y: auto;
  display: flex; flex-direction: column; gap: 18px; background: var(--pkg-side-bg);
}
.vl-brand { display: flex; align-items: center; gap: 10px; padding: 2px 6px; }
.vl-brand-icon { font-size: 26px; line-height: 1; }
.vl-brand strong { display: block; font-size: 15px; letter-spacing: 0.01em; }
.vl-brand small { color: var(--pkg-muted); font-size: 10px; }
.vl-nav { display: flex; flex-direction: column; gap: 3px; }
.vl-nav-item {
  text-align: left; border: 0; background: transparent; color: var(--pkg-text);
  font: 600 12px/1.25 ui-sans-serif, system-ui, sans-serif;
  padding: 9px 11px; border-radius: 9px; cursor: pointer;
}
.vl-nav-item:hover { background: var(--pkg-hover); }
.vl-nav-item.is-active { background: var(--pkg-accent-soft); color: var(--pkg-accent); }
.vl-side-foot { margin-top: auto; display: flex; flex-direction: column; gap: 8px; padding: 0 6px; }
.vl-side-note { color: var(--pkg-muted); font-size: 10px; line-height: 1.45; }
.vl-pill {
  align-self: flex-start; padding: 5px 10px; border-radius: 999px;
  font-size: 10px; font-weight: 700; letter-spacing: 0.03em;
  border: 1px solid var(--pkg-border); background: var(--pkg-surface); color: var(--pkg-muted);
}
.vl-pill.ready { color: var(--pkg-green); border-color: var(--pkg-green-border); background: var(--pkg-green-soft); }
.vl-pill.starting { color: var(--pkg-amber); border-color: var(--pkg-amber-border); background: var(--pkg-amber-soft); }
.vl-pill.offline { color: var(--pkg-red); border-color: var(--pkg-red-border); background: var(--pkg-red-soft); }
.vl-main { flex: 1; min-width: 0; overflow-y: auto; padding: 24px 28px 32px; }
.vl-main h1 { margin: 0; font-size: clamp(22px, 3.4vw, 30px); line-height: 1.1; }
.vl-page-sub { margin: 5px 0 0; color: var(--pkg-muted); font-size: 12px; }
.vl-status { min-height: 18px; margin: 8px 0 0; color: var(--pkg-accent); font-size: 12px; font-weight: 600; }
.vl-status.error { color: var(--pkg-red); }
.vl-status.warn { color: var(--pkg-amber); }
.vl-view { display: flex; flex-direction: column; gap: 14px; margin-top: 16px; }
.vl-panel {
  padding: 17px 18px; border-radius: 15px; border: 1px solid var(--pkg-border);
  background: var(--pkg-panel); min-width: 0;
}
.vl-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.vl-toolbar-title { display: flex; flex-direction: column; gap: 3px; }
.vl-toolbar-title strong { font-size: 14px; }
.vl-toolbar-title .vl-muted { font-size: 11px; }
.vl-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.vl-grow { flex: 1; min-width: 0; }
.vl-spacer { flex: 1; }
.vl-muted { color: var(--pkg-muted); font-size: 11px; }
.vl-label { display: block; font-size: 9px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--pkg-muted); margin-bottom: 6px; }
.vl-btn {
  border: 1px solid var(--pkg-border); background: var(--pkg-surface); color: var(--pkg-text);
  border-radius: 9px; padding: 8px 13px; font: 600 11px/1 ui-sans-serif, system-ui, sans-serif;
  cursor: pointer; white-space: nowrap;
}
.vl-btn:hover { background: var(--pkg-hover); }
.vl-btn:disabled { opacity: 0.5; cursor: default; }
.vl-btn.primary { background: var(--pkg-accent); border-color: var(--pkg-accent); color: var(--pkg-accent-contrast); }
.vl-btn.danger { background: var(--pkg-red-soft); border-color: var(--pkg-red-border); color: var(--pkg-red); }
.vl-btn.small { padding: 4px 9px; font-size: 10px; border-radius: 7px; }
.vl-input, .vl-select {
  background: var(--pkg-input-bg); color: var(--pkg-text); border: 1px solid var(--pkg-border);
  border-radius: 9px; padding: 9px 11px; font: 12px ui-monospace, SFMono-Regular, Menlo, monospace;
  min-width: 0;
}
.vl-input:focus, .vl-select:focus { outline: 2px solid var(--pkg-accent-border); outline-offset: 1px; }
.vl-search { flex: 1; min-width: 180px; }
.vl-filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.vl-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; }
.vl-field { display: flex; flex-direction: column; gap: 6px; font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--pkg-muted); }
.vl-field .vl-select, .vl-field .vl-input { text-transform: none; letter-spacing: normal; }
.vl-check-line { display: flex; align-items: center; gap: 8px; text-transform: none; letter-spacing: normal; font: 11px ui-sans-serif, system-ui, sans-serif; color: var(--pkg-text); }
.vl-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.vl-tile {
  padding: 12px 14px; border-radius: 13px; border: 1px solid var(--pkg-border);
  background: var(--pkg-panel); display: flex; flex-direction: column; gap: 4px;
}
.vl-tile span { font-size: 9px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--pkg-muted); }
.vl-tile strong { font-size: 20px; font-variant-numeric: tabular-nums; }
.vl-selectionbar {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 10px 14px; border-radius: 12px; border: 1px solid var(--pkg-accent-border);
  background: var(--pkg-accent-soft); font-size: 12px;
}
.vl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(var(--vl-card, 190px), 1fr)); gap: 12px; }
.vl-root[data-grid="small"] .vl-grid { --vl-card: 150px; }
.vl-root[data-grid="large"] .vl-grid { --vl-card: 240px; }
.vl-card {
  border: 1px solid var(--pkg-border); border-radius: 14px; overflow: hidden;
  background: var(--pkg-panel); cursor: pointer; display: flex; flex-direction: column;
}
.vl-card:hover { border-color: var(--pkg-accent-border); }
.vl-card.is-selected { border-color: var(--pkg-accent); box-shadow: 0 0 0 1px var(--pkg-accent) inset; }
.vl-card.is-rejected { opacity: 0.62; }
.vl-thumb { position: relative; aspect-ratio: 16 / 9; background: var(--vl-media-bg); overflow: hidden; }
.vl-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.vl-dur {
  position: absolute; right: 7px; bottom: 7px; padding: 2px 6px; border-radius: 6px;
  background: var(--vl-chip-bg); color: var(--vl-chip-text); font: 10px ui-monospace, monospace;
}
.vl-badges { position: absolute; left: 7px; top: 7px; display: flex; gap: 4px; flex-wrap: wrap; max-width: 75%; }
.vl-badge {
  padding: 2px 6px; border-radius: 6px; background: var(--vl-chip-bg);
  color: var(--vl-chip-text); font: 9px/1.3 ui-monospace, monospace; letter-spacing: 0.02em;
}
.vl-badge.warn { background: var(--pkg-amber-soft); color: var(--pkg-amber); }
.vl-check {
  position: absolute; left: 7px; bottom: 7px; width: 22px; height: 22px; border-radius: 7px;
  border: 1px solid var(--vl-control-border); background: var(--vl-control-bg);
  color: var(--vl-chip-text); font-size: 12px; cursor: pointer; opacity: 0; transition: opacity 0.15s;
}
.vl-check::after { content: "✓"; }
.vl-card:hover .vl-check, .vl-check.is-on, .vl-root.selecting .vl-check { opacity: 1; }
.vl-check.is-on { background: var(--pkg-accent); border-color: var(--pkg-accent); }
.vl-play {
  position: absolute; right: 7px; top: 7px; width: 30px; height: 30px; border-radius: 50%;
  border: 0; background: var(--vl-chip-bg); color: var(--vl-chip-text); font-size: 12px;
  cursor: pointer; opacity: 0; transition: opacity 0.15s;
}
.vl-card:hover .vl-play { opacity: 1; }
.vl-card-body { padding: 9px 11px 11px; display: flex; flex-direction: column; gap: 3px; }
.vl-card-body strong { font-size: 12px; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vl-card-body .vl-muted { font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vl-stars { color: var(--pkg-amber); font-size: 11px; letter-spacing: 1px; min-height: 14px; }
.vl-fav { color: var(--pkg-red); }
.vl-more { display: flex; justify-content: center; padding: 6px 0 2px; }
.vl-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
  text-align: center; padding: 28px; border: 1px dashed var(--pkg-border); border-radius: 15px;
  color: var(--pkg-muted); font-size: 11px; background: var(--pkg-panel);
}
.vl-empty strong { color: var(--pkg-text); font-size: 13px; }
.vl-startup { padding: 9px 11px; border-radius: 9px; background: var(--pkg-amber-soft); border: 1px solid var(--pkg-amber-border); color: var(--pkg-amber); font-size: 11px; }
.vl-startup.error { background: var(--pkg-red-soft); border-color: var(--pkg-red-border); color: var(--pkg-red); }
.vl-def-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px 16px; }
.vl-def-grid div { display: flex; flex-direction: column; gap: 3px; }
.vl-def-grid span { font-size: 9px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--pkg-muted); }
.vl-def-grid strong { font-size: 12px; font-weight: 600; }
.vl-table { width: 100%; border-collapse: collapse; font-size: 11px; }
.vl-table th { text-align: left; padding: 8px 9px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--pkg-muted); border-bottom: 1px solid var(--pkg-border); }
.vl-table td { padding: 7px 9px; border-bottom: 1px solid var(--pkg-border); vertical-align: middle; }
.vl-table tr:last-child td { border-bottom: 0; }
.vl-table .vl-path { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; word-break: break-all; }
.vl-table .vl-num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.vl-table .vl-actions { text-align: right; white-space: nowrap; }
.vl-row-thumb { width: 56px; height: 32px; object-fit: cover; border-radius: 6px; background: var(--vl-media-bg); display: block; }
.vl-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 8px; }
.vl-tag {
  border: 1px solid var(--pkg-border); background: var(--pkg-surface); color: var(--pkg-text);
  border-radius: 999px; padding: 3px 8px; font: 10px ui-monospace, monospace; cursor: pointer;
}
.vl-tag.is-info { border-color: var(--pkg-accent-border); background: var(--pkg-accent-soft); color: var(--pkg-accent); }
.vl-tag.is-warn { border-color: var(--pkg-amber-border); background: var(--pkg-amber-soft); color: var(--pkg-amber); cursor: default; }
.vl-tag-editor { margin-top: 14px; }
.vl-rating { display: flex; align-items: center; gap: 6px; margin-top: 14px; flex-wrap: wrap; }
.vl-star { border: 0; background: transparent; color: var(--pkg-border); font-size: 20px; cursor: pointer; padding: 0 2px; }
.vl-star.is-on { color: var(--pkg-amber); }
.vl-form-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--pkg-border); }
.vl-overlay {
  position: absolute; inset: 0; z-index: 40; background: var(--vl-overlay);
  display: flex; flex-direction: column; overflow: hidden;
}
.vl-overlay[hidden] { display: none; }
.vl-overlay-head {
  display: flex; align-items: center; gap: 10px; padding: 14px 18px;
  border-bottom: 1px solid var(--pkg-border); background: var(--pkg-panel);
}
.vl-overlay-head strong { font-size: 14px; display: block; }
.vl-detail-grid { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(300px, 1fr); gap: 18px; padding: 18px; overflow-y: auto; }
.vl-poster { border-radius: 14px; overflow: hidden; background: var(--vl-media-bg); aspect-ratio: 16 / 9; }
.vl-poster img { width: 100%; height: 100%; object-fit: contain; display: block; }
.vl-strip { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px; margin-top: 8px; }
.vl-strip img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 7px; background: var(--vl-media-bg); cursor: pointer; border: 1px solid transparent; }
.vl-strip img:hover { border-color: var(--pkg-accent-border); }
.vl-thumb img.is-loading, .vl-strip img.is-loading, .vl-poster img.is-loading {
  animation: vl-pulse 1.3s ease-in-out infinite;
}
@keyframes vl-pulse { 0%, 100% { opacity: 0.45; } 50% { opacity: 0.9; } }
.vl-detail-right { min-width: 0; display: flex; flex-direction: column; }
.vl-player-overlay { background: var(--vl-player-bg); color: var(--vl-player-text); }
.vl-player-head { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--vl-player-border); }
.vl-player-head .vl-muted { color: var(--vl-player-muted); }
.vl-player-head strong { color: var(--vl-player-text); }
.vl-seg { display: inline-flex; border: 1px solid var(--vl-player-border); border-radius: 9px; overflow: hidden; }
.vl-seg-btn { border: 0; background: transparent; color: var(--vl-player-muted); padding: 6px 10px; font: 600 10px ui-sans-serif, system-ui, sans-serif; cursor: pointer; }
.vl-seg-btn.is-active { background: var(--pkg-accent); color: var(--pkg-accent-contrast); }
.vl-stage-area { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; position: relative; background: var(--vl-video-bg); }
.vl-stage { position: relative; overflow: hidden; background: var(--vl-video-bg); }
.vl-stage video { position: absolute; top: 0; max-width: none; background: var(--vl-video-bg); }
.vl-player-status {
  position: absolute; inset: 0; display: flex; flex-direction: column; gap: 10px;
  align-items: center; justify-content: center; background: var(--vl-player-scrim);
  color: var(--vl-player-text); font-size: 12px; z-index: 2;
}
.vl-player-status[hidden] { display: none; }
.vl-controls { padding: 10px 16px 14px; border-top: 1px solid var(--vl-player-border); display: flex; flex-direction: column; gap: 8px; }
.vl-seek { width: 100%; accent-color: var(--pkg-accent); }
.vl-control-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.vl-time { font: 11px ui-monospace, monospace; color: var(--vl-player-muted); min-width: 96px; }
.vl-player-overlay .vl-btn { background: var(--vl-player-panel); border-color: var(--vl-player-border); color: var(--vl-player-text); }
.vl-player-overlay .vl-btn:hover { background: var(--vl-player-hover); }
.vl-player-overlay .vl-btn.primary { background: var(--pkg-accent); color: var(--pkg-accent-contrast); border-color: var(--pkg-accent); }
.vl-player-overlay .vl-btn.danger { background: var(--vl-player-danger-bg); border-color: var(--vl-player-danger-border); color: var(--vl-player-danger-text); }
.vl-player-overlay .vl-select { background: var(--vl-player-panel); color: var(--vl-player-text); border-color: var(--vl-player-border); padding: 6px 8px; font-size: 10px; }
.vl-modal-note { font-size: 12px; line-height: 1.55; margin-bottom: 12px; }
.vl-root.selecting .vl-card { cursor: copy; }
@media (max-width: 980px) {
  .vl-detail-grid { grid-template-columns: 1fr; }
}
@media (max-width: 780px) {
  .vl-root { flex-direction: column; }
  .vl-side { width: auto; border-right: 0; border-bottom: 1px solid var(--pkg-border); flex-direction: row; align-items: center; gap: 10px; padding: 10px 12px; overflow-x: auto; }
  .vl-brand { padding: 0; }
  .vl-brand small, .vl-side-note { display: none; }
  .vl-nav { flex-direction: row; }
  .vl-side-foot { margin-top: 0; padding: 0; }
  .vl-main { padding: 16px 14px 24px; }
  .vl-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .vl-strip { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .vl-player-head { flex-wrap: wrap; }
  .vl-control-row .vl-time { width: 100%; }
}
</style>`;
