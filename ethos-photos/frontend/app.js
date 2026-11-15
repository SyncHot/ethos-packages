// EthOS NAS — PhotoStation (Package Center app)
// Library model: configured folders are indexed by the backend (/api/gallery/*).
// Views: shell (sidebar + toolbar + infinite grid), lightbox viewer, folder picker.
//
// The gallery API stays in the EthOS core (the Android Moments app uses it); this
// package owns the desktop UI only.

// ── Native-module shim ────────────────────────────────────────────────────────
// Loaded as a blob module, so core helpers arrive through `ctx` in render().
let _ctx = null;

function apiFetch(path, options) {
    return _ctx.apiFetch(path, options); // core API, same origin, caller's JWT
}

// Visibility-aware poller with the same contract as core/poller.js: pauses in a
// hidden tab, skips a tick while the previous one is in flight, returns stop().
function poll(fn, intervalMs, { immediate = true } = {}) {
    let busy = false;
    let stopped = false;
    const tick = async () => {
        if (stopped || document.hidden || busy) return;
        busy = true;
        try { await fn(); } catch (_) { /* the app renders its own error state */ }
        finally { busy = false; }
    };
    const timer = setInterval(tick, Math.max(250, Number(intervalMs) || 1000));
    const onVisible = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', onVisible);
    if (immediate) tick();
    return () => {
        stopped = true;
        clearInterval(timer);
        document.removeEventListener('visibilitychange', onVisible);
    };
}

const VIDEO_EXTS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.wmv', '.flv']);

const SORTS = [
    { id: 'date_desc', label: 'Newest first' },
    { id: 'date_asc',  label: 'Oldest first' },
    { id: 'name_asc',  label: 'Name A→Z' },
    { id: 'size_desc', label: 'Largest first' },
];

const GRID_SIZES = { small: 96, medium: 140, large: 200 };
const PAGE_SIZE = 90;

// ── SVG icon set (stroke icons, inherit currentColor) ─────────────────────────
// Emoji glyphs rendered differently on every platform; a small inline icon set
// keeps the UI consistent and crisp in dark and light themes.
const ICONS = {
    camera: '<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1l1-1.6A1 1 0 0 1 9.3 4h5.4a1 1 0 0 1 .8.4L16.5 6h1A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.5" r="3.2"/>',
    sparkles: '<path d="M12 3.5l1.6 4.2 4.2 1.6-4.2 1.6L12 15l-1.6-4.1L6.2 9.3l4.2-1.6z"/><path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>',
    timeline: '<path d="M4 6h16"/><path d="M4 12h10"/><path d="M4 18h6"/>',
    star: '<path d="M12 3.8l2.5 5.1 5.6.8-4 4 .9 5.6-5-2.7-5 2.7.9-5.6-4-4 5.6-.8z"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M8 3v4"/><path d="M16 3v4"/><path d="M3.5 10h17"/>',
    lock: '<rect x="4.5" y="10" width="15" height="10" rx="2.4"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10"/>',
    folder: '<path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h3.8l1.8 2.2h7.4a2 2 0 0 1 2 2v6.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
    folderPlus: '<path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h3.8l1.8 2.2h7.4a2 2 0 0 1 2 2v6.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="M12 11v5"/><path d="M9.5 13.5h5"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.4"/><circle cx="8.6" cy="9.6" r="1.6"/><path d="M4.5 17l4.6-4.4a1.4 1.4 0 0 1 1.9 0l3 2.9a1.4 1.4 0 0 0 1.9 0l1.6-1.5 2.5 2.4"/>',
    video: '<rect x="3" y="6" width="13" height="12" rx="2.2"/><path d="M16 10.2l4-2.2v8l-4-2.2z"/>',
    search: '<circle cx="10.8" cy="10.8" r="6.3"/><path d="M15.5 15.5L20 20"/>',
    settings: '<path d="M4 7h9"/><path d="M17 7h3"/><circle cx="15" cy="7" r="2"/><path d="M4 17h3"/><path d="M11 17h9"/><circle cx="9" cy="17" r="2"/>',
    checkSquare: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M8 12.2l2.6 2.6L16 9.6"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    close: '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>',
    chevronLeft: '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
    chevronRight: '<path d="M9.5 5.5L16 12l-6.5 6.5"/>',
    arrowUp: '<path d="M12 19V5"/><path d="M6.5 10.5L12 5l5.5 5.5"/>',
    download: '<path d="M12 4v11"/><path d="M7.5 10.5L12 15l4.5-4.5"/><path d="M4.5 19.5h15"/>',
    share: '<path d="M9.5 13.5l5-3"/><path d="M9.5 10.5l5 3"/><circle cx="6.5" cy="12" r="2.4"/><circle cx="17.5" cy="7" r="2.4"/><circle cx="17.5" cy="17" r="2.4"/>',
    trash: '<path d="M4.5 7h15"/><path d="M9.5 7V5.2a1.2 1.2 0 0 1 1.2-1.2h2.6a1.2 1.2 0 0 1 1.2 1.2V7"/><path d="M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12"/><path d="M10 11v5"/><path d="M14 11v5"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
    zoom: '<path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9"/><path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9"/><path d="M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15"/><path d="M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15"/>',
    play: '<path d="M8 5.5v13l11-6.5z"/>',
    menu: '<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4.5V9h-4.5"/>',
    key: '<circle cx="8" cy="15" r="3.5"/><path d="M10.5 12.5L19 4"/><path d="M16.5 6.5L19 9"/>',
    unlock: '<rect x="4.5" y="10" width="15" height="10" rx="2.4"/><path d="M8 10V7.5a4 4 0 0 1 7.5-1.9"/>',
};
function _svg(name, style) {
    const paths = ICONS[name] || ICONS.image;
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${style ? ` style="${style}"` : ''}>${paths}</svg>`;
}

// ── State ─────────────────────────────────────────────────────────────────────
let _body = null;            // .window-body element of the current window
let _cfg = { folders: [], options: { sort: 'date_desc', include_videos: true, grid_size: 'medium' } };
let _currentFolder = '';     // '' → All Photos
let _query = '';
let _items = [];             // accumulated pages of the current view
let _total = 0;
let _offset = 0;
let _facets = [];            // subfolder chips for the current scope
let _facetParent = '';       // parent dir of _currentFolder (chip target)
let _counts = {};            // sidebar count cache keyed 'all' | 'f<i>'
let _loadingPage = false;
let _gen = 0;                // generation counter — drops stale page responses
let _lightboxIndex = -1;     // -1 → lightbox closed
let _lbZoom = { scale: 1, x: 0, y: 0 };   // image zoom/pan state (images only)
let _fmCollection = null;    // {files:[...], dir:''} from File Manager double-click
let _pickerPath = '/home';
let _pickerDirs = [];
let _pickerSelected = new Set();
let _searchTimer = null;
let _statusTimer = null;
let _wasScanning = false;    // previous /rescan-status scanning flag (auto-refresh on completion)
let _observer = null;
let _lbThumbEls = {};        // lightbox strip: index -> <img> element (current window)
let _selectMode = false;     // grid click toggles selection instead of opening the lightbox
let _selected = new Set();   // selected item paths (current view)
let _lastSelIdx = -1;        // anchor tile for shift-click range select
let _privateView = false;    // viewing the Private section instead of a folder scope
let _psToken = null;         // active Private session token (in-memory only, ~30 min)
let _pinSet = null;          // null=unknown | true/false — whether a PIN is configured
let _psViewMode = 'grid';    // 'grid' | 'timeline'
let _monthMeta = {};         // month key → {label, count, images, videos} (from /api/gallery/months)
let _lastMonthKey = null;    // last rendered timeline group header
let _lastDayKey = null;      // last rendered day group header (grid view)
let _momentsView = false;    // curated Moments home instead of a folder grid
let _momentsExpanded = null; // 'YYYY-MM' | null — month expanded inline in Moments
let _momentsTotal = 0;       // library total from /api/moments/stats (status line)
let _momentsHighlights = []; // highlight items (prefix of the lightbox list in Moments)
let _calendarView = false;  // Calendar home instead of a folder grid
let _calMonth = '';         // 'YYYY-MM' currently shown on the calendar
let _calDay = null;         // 'YYYY-MM-DD' | null — day picked for the item grid
let _calDays = [];          // [{date,count,videos,images,samples}] from /calendar
let _favView = false;       // Favorites view (starred items)
let _albumView = null;      // album id being viewed | null
let _albums = [];           // [{id,name,count,created}] from /api/gallery/albums
let _cameraView = null;      // camera string being viewed | null
let _cameras = [];           // [{camera, count}] from /api/gallery/cameras
let _dayNav = null;          // { prev: dateStr|null, next: dateStr|null } — day navigation in Calendar view
let _durationCache = new Map();   // path → seconds (filled from items or /meta)

// ── Helpers ───────────────────────────────────────────────────────────────────

function _escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function _escAttr(s) { return String(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
// Safe JS string literal for embedding paths in inline onclick attributes.
function _jsArg(s) { return JSON.stringify(String(s)).replace(/"/g, '&quot;'); }

function _token() { return encodeURIComponent(localStorage.getItem('token') || ''); }
function _rawUrl(path) { return `/api/files/raw?path=${encodeURIComponent(path)}&token=${_token()}`; }
// Private items live on disk as ciphertext — they are only served through the
// session-gated gallery endpoints (PIN-unlocked), never via /api/files/*.
function _privMediaUrl(it) {
    return `/api/gallery/private-media?path=${encodeURIComponent(it.path)}&ps=${encodeURIComponent(_psToken || '')}&token=${_token()}`;
}

// Download URL for one item. Private items use the session-gated endpoint,
// which serves the PIN-encrypted blob (a copied file is useless without the PIN).
function _downloadUrlFor(it) {
    if (it.private) {
        return `/api/gallery/private-download?path=${encodeURIComponent(it.path)}&ps=${encodeURIComponent(_psToken || '')}&token=${_token()}`;
    }
    return _rawUrl(it.path);
}

function _triggerDownload(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || '';
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 4000);
}
function _thumbUrl(it, size) {
    // /api/files/video-thumbnail rejects sizes below 64 px (422), so clamp —
    // the calendar/strip ask for 48/72 px thumbs.
    const px = Math.max(64, Math.round(Number(size) || 64));
    if (it.private && _psToken) {
        return `/api/gallery/private-thumb?path=${encodeURIComponent(it.path)}&size=${px}&ps=${encodeURIComponent(_psToken)}&token=${_token()}`;
    }
    const ep = _isVideo(it) ? '/api/files/video-thumbnail' : '/api/files/thumbnail';
    return `${ep}?path=${encodeURIComponent(it.path)}&size=${px}&token=${_token()}`;
}

function _extOf(name) { const n = String(name); const i = n.lastIndexOf('.'); return i < 0 ? '' : '.' + n.slice(i + 1).toLowerCase(); }
function _isVideo(it) { return it.type === 'video' || VIDEO_EXTS.has(_extOf(it.name)); }
function _baseName(p) { const s = String(p || '').replace(/\/+$/, ''); return s.split('/').pop() || '/'; }
function _parentPath(p) {
    const s = String(p || '').replace(/\/+$/, '');
    const i = s.lastIndexOf('/');
    return i <= 0 ? (i === 0 ? '/' : '') : s.slice(0, i);
}

function _fmtSize(n) {
    if (n == null) return '';
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return `${n >= 10 || i === 0 ? Math.round(n) : n.toFixed(1)} ${u[i]}`;
}

function _fmtDuration(sec) {
    if (sec == null || !(sec > 0)) return '';
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function _durationOf(it) {
    if (_durationCache.has(it.path)) return _durationCache.get(it.path);
    const d = it.duration != null ? it.duration : null;
    if (d != null) _durationCache.set(it.path, d);
    return d;
}

function _fmtDate(epoch, withTime = false) {
    if (!epoch) return '';
    const d = new Date(Number(epoch) * 1000);
    const day = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    if (!withTime) return day;
    return `${day}, ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
}

function _cellPx() { return GRID_SIZES[_cfg.options.grid_size] || 140; }
// Grid template that keeps ≥2 columns on phones (cells capped at 44vw).
function _gridCols(cell) { return `repeat(auto-fill,minmax(min(${cell}px,44vw),1fr))`; }
function _active() { return !!(_body && _body.isConnected); }

function _ensureStyles() {
    if (document.getElementById('ps-styles')) return;
    const st = document.createElement('style');
    st.id = 'ps-styles';
    st.textContent = `
        /* ══ Photos — modern UI (Synology Photos / QuMagie inspired) ══════════ */
        .ps-app{position:relative;display:flex;height:100%;min-height:0;background:var(--surface-0);color:var(--text-1);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;overflow:hidden;-webkit-font-smoothing:antialiased;}
        .ps-app *,.ps-app *::before,.ps-app *::after{box-sizing:border-box;}
        .ps-app button,.ps-app input,.ps-app select{font-family:inherit;}
        .ps-app svg{display:block;flex-shrink:0;}

        /* ── Sidebar ─────────────────────────────────────────────────────── */
        .ps-sidebar{width:236px;flex:0 0 236px;display:flex;flex-direction:column;min-height:0;background:var(--surface-1);border-right:1px solid var(--border);z-index:40;}
        .ps-brand{display:flex;align-items:center;gap:10px;padding:16px 16px 12px;}
        .ps-brand-mark{width:36px;height:36px;border-radius:12px;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,#6366f1,#0ea5e9);box-shadow:0 10px 22px -8px rgba(56,132,255,.65);}
        .ps-brand-mark svg{width:19px;height:19px;}
        .ps-brand-title{font-size:15px;font-weight:700;letter-spacing:-.25px;line-height:1.15;}
        .ps-brand-sub{font-size:11px;color:var(--text-3);margin-top:2px;}
        .ps-nav{flex:1;overflow-y:auto;padding:0 10px 10px;display:flex;flex-direction:column;gap:2px;}
        .ps-nav::-webkit-scrollbar{width:6px;}
        .ps-nav::-webkit-scrollbar-thumb{background:var(--surface-2);border-radius:99px;}
        .ps-nav-group{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:14px 10px 6px;font-size:10px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--text-3);}
        .ps-nav-group button{border:none;background:transparent;color:var(--text-3);cursor:pointer;display:grid;place-items:center;width:22px;height:22px;border-radius:7px;transition:background .14s,color .14s;}
        .ps-nav-group button:hover{background:var(--surface-2);color:var(--text-1);}
        .ps-nav-group button svg{width:13px;height:13px;}
        .ps-nav-item{position:relative;display:flex;align-items:center;gap:9px;padding:7px 9px;border-radius:10px;cursor:pointer;font-size:12.8px;color:var(--text-2);transition:background .14s,color .14s;user-select:none;}
        .ps-nav-item:hover{background:var(--surface-2);color:var(--text-1);}
        .ps-nav-item.active{background:var(--accent-glow);color:var(--text-1);font-weight:600;}
        .ps-nav-item.active::before{content:'';position:absolute;left:-10px;top:50%;width:3px;height:18px;margin-top:-9px;border-radius:0 3px 3px 0;background:var(--accent);}
        .ps-nav-ic{width:26px;height:26px;border-radius:8px;display:grid;place-items:center;background:var(--surface-2);color:var(--text-2);transition:background .14s,color .14s;}
        .ps-nav-ic svg{width:15px;height:15px;}
        .ps-nav-item.active .ps-nav-ic{background:var(--accent);color:#fff;}
        .ps-nav-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .ps-nav-count{font-size:10.5px;color:var(--text-3);font-variant-numeric:tabular-nums;}
        .ps-nav-actions{display:flex;align-items:center;gap:2px;opacity:0;transition:opacity .14s;}
        .ps-nav-item:hover .ps-nav-actions{opacity:1;}
        .ps-nav-mini{border:none;background:transparent;color:var(--text-3);cursor:pointer;width:20px;height:20px;border-radius:6px;display:grid;place-items:center;}
        .ps-nav-mini:hover{background:var(--surface-0);color:var(--text-1);}
        .ps-nav-mini svg{width:12px;height:12px;}
        .ps-side-foot{padding:10px;border-top:1px solid var(--border);}
        .ps-side-btn{display:flex;align-items:center;justify-content:center;gap:7px;width:100%;height:34px;border-radius:10px;border:1px dashed var(--border);background:transparent;color:var(--text-2);font-size:12.5px;font-weight:600;cursor:pointer;transition:border-color .14s,color .14s,background .14s;}
        .ps-side-btn:hover{border-color:var(--accent);color:var(--text-1);background:var(--accent-glow);}
        .ps-side-btn svg{width:14px;height:14px;}

        /* ── Main + top bar ──────────────────────────────────────────────── */
        .ps-main{position:relative;display:flex;flex-direction:column;flex:1;min-width:0;min-height:0;}
        .ps-topbar{display:flex;align-items:center;gap:12px;padding:11px 18px;border-bottom:1px solid var(--border);background:color-mix(in srgb,var(--surface-0) 90%,transparent);backdrop-filter:blur(16px) saturate(1.5);z-index:20;flex-wrap:wrap;row-gap:8px;}
        .ps-heading{display:flex;flex-direction:column;gap:1px;min-width:0;}
        .ps-title-row{display:flex;align-items:center;gap:8px;min-width:0;}
        .ps-title{margin:0;font-size:16.5px;font-weight:700;letter-spacing:-.3px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px;}
        .ps-subtitle{font-size:11.5px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:320px;}
        .ps-toolbar-controls{display:flex;align-items:center;gap:8px;flex:1;min-width:0;justify-content:flex-end;flex-wrap:wrap;row-gap:6px;}
        .ps-search{display:flex;align-items:center;gap:8px;flex:1 1 190px;min-width:140px;max-width:340px;height:34px;padding:0 11px;border-radius:10px;background:var(--surface-1);border:1px solid var(--border);transition:border-color .15s,box-shadow .15s;}
        .ps-search:focus-within{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-glow);}
        .ps-search svg{width:14px;height:14px;color:var(--text-3);}
        .ps-search input{flex:1;min-width:0;height:100%;background:none;border:none;outline:none;color:var(--text-1);font-size:13px;}
        .ps-search input::placeholder{color:var(--text-3);}
        .ps-search input::-webkit-search-cancel-button{display:none;}
        .ps-select{height:34px;padding:0 26px 0 10px;border-radius:10px;border:1px solid var(--border);background-color:var(--surface-1);color:var(--text-2);font-size:12px;cursor:pointer;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23888' stroke-width='1.6' stroke-linecap='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 9px center;}
        .ps-select:focus{outline:none;border-color:var(--accent);}
        .ps-seg{display:flex;gap:2px;padding:3px;border-radius:10px;background:var(--surface-1);border:1px solid var(--border);}
        .ps-seg button{width:28px;height:26px;display:grid;place-items:center;border:none;border-radius:7px;background:transparent;color:var(--text-3);cursor:pointer;transition:background .14s,color .14s;}
        .ps-seg button svg{width:14px;height:14px;}
        .ps-seg button:hover{color:var(--text-1);background:var(--surface-2);}
        .ps-seg button.on{background:var(--accent);color:#fff;}
        .ps-icon-btn{width:34px;height:34px;display:grid;place-items:center;border-radius:10px;border:1px solid var(--border);background:var(--surface-1);color:var(--text-2);cursor:pointer;transition:background .14s,color .14s,border-color .14s;}
        .ps-icon-btn svg{width:15px;height:15px;}
        .ps-icon-btn:hover{background:var(--surface-2);color:var(--text-1);}
        .ps-icon-btn.on{background:var(--accent);border-color:var(--accent);color:#fff;}
        .ps-text-btn{height:34px;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:0 12px;border-radius:10px;border:1px solid var(--border);background:var(--surface-1);color:var(--text-2);font-size:12.5px;font-weight:600;cursor:pointer;transition:background .14s,color .14s,border-color .14s;}
        .ps-text-btn:hover{background:var(--surface-2);color:var(--text-1);}
        .ps-text-btn.on{background:var(--accent);border-color:var(--accent);color:#fff;}
        .ps-text-btn svg{width:14px;height:14px;}
        .ps-pill{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:999px;background:var(--surface-1);border:1px solid var(--border);color:var(--text-3);font-size:11px;white-space:nowrap;font-variant-numeric:tabular-nums;}
        .ps-badge{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;font-size:10.5px;font-weight:700;letter-spacing:.02em;white-space:nowrap;}
        .ps-badge svg{width:11px;height:11px;}
        .ps-badge.moments{color:#a78bfa;background:rgba(167,139,250,.14);border:1px solid rgba(167,139,250,.4);}
        .ps-badge.private{color:#f59e0b;background:rgba(245,158,11,.13);border:1px solid rgba(245,158,11,.4);}
        .ps-menu-btn{display:none;width:34px;height:34px;place-items:center;border-radius:10px;border:1px solid var(--border);background:var(--surface-1);color:var(--text-2);cursor:pointer;}

        /* ── Filter chips ────────────────────────────────────────────────── */
        .ps-chips{display:none;gap:6px;padding:10px 18px 0;overflow-x:auto;flex-shrink:0;scrollbar-width:none;}
        .ps-chips::-webkit-scrollbar{display:none;}
        .ps-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:999px;background:var(--surface-1);border:1px solid var(--border);color:var(--text-2);font-size:12px;cursor:pointer;white-space:nowrap;transition:background .14s,border-color .14s,color .14s;}
        .ps-chip:hover{background:var(--surface-2);color:var(--text-1);border-color:var(--accent);}
        .ps-chip svg{width:13px;height:13px;}
        .ps-chip .ps-chip-count{color:var(--text-3);font-size:11px;}

        /* ── Scroll area + grid ──────────────────────────────────────────── */
        .ps-scroll{flex:1;min-height:0;overflow-y:auto;scroll-behavior:smooth;}
        .ps-scroll::-webkit-scrollbar{width:8px;}
        .ps-scroll::-webkit-scrollbar-thumb{background:var(--surface-2);border-radius:99px;}
        .ps-grid{display:grid;gap:6px;padding:14px 18px 28px;align-content:start;}
        .ps-day-header,.ps-month{grid-column:1/-1;position:sticky;top:0;z-index:6;display:flex;align-items:baseline;gap:10px;padding:10px 2px 7px;background:var(--surface-0);}
        .ps-day-title,.ps-month-label{font-size:13px;font-weight:700;letter-spacing:-.1px;color:var(--text-1);}
        .ps-day-line{flex:1;height:1px;background:var(--border);transform:translateY(-3px);}
        .ps-day-count,.ps-month-count{font-size:11px;color:var(--text-3);}
        .ps-month{padding-top:16px;}
        .ps-month .ps-month-label{font-size:15px;}

        /* ── Tiles ───────────────────────────────────────────────────────── */
        .ps-tile{position:relative;margin:0;aspect-ratio:1/1;border-radius:12px;overflow:hidden;background:var(--surface-2);cursor:pointer;isolation:isolate;outline:none;transition:box-shadow .18s;animation:psTileIn .22s ease both;}
        @keyframes psTileIn{from{opacity:0;transform:scale(.985);}to{opacity:1;transform:none;}}
        .ps-tile:hover{box-shadow:0 12px 30px -10px rgba(0,0,0,.6);}
        .ps-tile-img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .5s cubic-bezier(.22,.61,.36,1);}
        .ps-tile:hover .ps-tile-img{transform:scale(1.055);}
        .ps-tile-shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 42%,rgba(0,0,0,.78));opacity:0;transition:opacity .18s;pointer-events:none;}
        .ps-tile:hover .ps-tile-shade,.ps-tile:focus-visible .ps-tile-shade{opacity:1;}
        .ps-tile-info{position:absolute;left:0;right:0;bottom:0;padding:8px 10px 9px;display:flex;flex-direction:column;gap:1px;opacity:0;transform:translateY(4px);transition:opacity .18s,transform .18s;pointer-events:none;}
        .ps-tile:hover .ps-tile-info,.ps-tile:focus-visible .ps-tile-info{opacity:1;transform:none;}
        .ps-tile-name{color:#fff;font-size:11.5px;font-weight:600;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 3px rgba(0,0,0,.6);}
        .ps-tile-meta{color:rgba(255,255,255,.72);font-size:10.5px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .ps-tile-badge{position:absolute;top:7px;right:7px;display:inline-flex;align-items:center;gap:4px;padding:3px 7px;border-radius:7px;background:rgba(8,10,14,.62);backdrop-filter:blur(6px);color:#fff;font-size:10px;font-weight:600;letter-spacing:.02em;}
        .ps-tile-badge svg{width:10px;height:10px;fill:currentColor;stroke:none;}
        .ps-tile-check{position:absolute;top:7px;left:7px;width:22px;height:22px;border-radius:50%;background:rgba(8,10,14,.45);border:2px solid rgba(255,255,255,.85);display:none;place-items:center;z-index:3;transition:background .12s,border-color .12s;}
        .ps-tile-check::after{content:'';width:9px;height:5px;border-left:2px solid #fff;border-bottom:2px solid #fff;transform:rotate(-45deg) translate(1px,-1px);display:none;}
        #ps-grid.ps-select-mode .ps-tile-check{display:grid;}
        .ps-tile.selected .ps-tile-check{background:var(--accent);border-color:#fff;display:grid;}
        .ps-tile.selected .ps-tile-check::after{display:block;}
        .ps-tile.selected{outline:3px solid var(--accent);outline-offset:-3px;}
        .ps-tile.selected .ps-tile-img{filter:brightness(.8);}
        .ps-tile:focus-visible{outline:3px solid #f59e0b;outline-offset:-3px;z-index:2;}
        .ps-fav{position:absolute;right:6px;bottom:6px;z-index:3;display:grid;place-items:center;width:28px;height:28px;border-radius:50%;border:none;background:rgba(8,10,14,.4);backdrop-filter:blur(6px);color:#fff;cursor:pointer;opacity:0;transition:opacity .14s,background .14s,color .14s,padding .14s;}
        .ps-fav svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.7;}
        .ps-fav:hover{background:rgba(8,10,14,.7);}
        .ps-tile:hover .ps-fav{opacity:1;}
        .ps-fav.on{opacity:1;color:#fbbf24;background:rgba(8,10,14,.55);}
        .ps-fav.on svg{fill:currentColor;stroke:currentColor;}

        /* ── Empty / loading states ──────────────────────────────────────── */
        .ps-empty{grid-column:1/-1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:56px 0;color:var(--text-3);font-size:13px;text-align:center;}
        .ps-empty-ic{width:64px;height:64px;border-radius:20px;display:grid;place-items:center;background:var(--surface-1);border:1px solid var(--border);color:var(--text-2);margin-bottom:4px;}
        .ps-empty-ic svg{width:28px;height:28px;}
        .ps-empty b{color:var(--text-1);font-size:15px;font-weight:700;}
        .ps-loading{grid-column:1/-1;display:flex;flex-direction:column;align-items:center;gap:12px;padding:56px 0;color:var(--text-3);font-size:12.5px;}
        .ps-spinner{width:26px;height:26px;border-radius:50%;border:2.5px solid var(--surface-2);border-top-color:var(--accent);animation:psSpin .8s linear infinite;}
        @keyframes psSpin{to{transform:rotate(360deg);}}

        /* ── Floating selection action bar ───────────────────────────────── */
        .ps-actionbar{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);z-index:30;display:none;align-items:center;gap:3px;padding:7px;border-radius:16px;background:color-mix(in srgb,var(--surface-1) 94%,transparent);backdrop-filter:blur(20px) saturate(1.6);border:1px solid var(--border);box-shadow:0 18px 48px -12px rgba(0,0,0,.65);animation:psBarIn .18s ease both;}
        @keyframes psBarIn{from{opacity:0;transform:translate(-50%,8px);}to{opacity:1;transform:translate(-50%,0);}}
        .ps-act-count{padding:0 10px 0 6px;font-size:12px;font-weight:700;color:var(--text-1);white-space:nowrap;}
        .ps-act{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 11px;border-radius:10px;border:none;background:transparent;color:var(--text-2);font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;transition:background .14s,color .14s;}
        .ps-act svg{width:14px;height:14px;}
        .ps-act:hover{background:var(--surface-2);color:var(--text-1);}
        .ps-act.danger:hover{background:rgba(248,113,113,.15);color:#f87171;}
        .ps-act.warn:hover{background:rgba(245,158,11,.15);color:#f59e0b;}
        .ps-act.ok:hover{background:rgba(34,197,94,.15);color:#4ade80;}
        .ps-act.info:hover{background:rgba(59,130,246,.15);color:#60a5fa;}
        .ps-act-div{width:1px;height:20px;background:var(--border);margin:0 3px;}
        @media (max-width:900px){.ps-act span{display:none;}.ps-act{padding:0 9px;}}

        /* ── Settings popover ───────────────────────────────────────────── */
        .ps-pop{position:absolute;top:64px;right:18px;z-index:40;width:250px;padding:8px;border-radius:14px;background:var(--surface-1);border:1px solid var(--border);box-shadow:0 24px 60px -16px rgba(0,0,0,.7);display:none;flex-direction:column;gap:2px;animation:psPopIn .14s ease both;}
        @keyframes psPopIn{from{opacity:0;transform:translateY(-4px) scale(.985);}to{opacity:1;transform:none;}}
        .ps-pop-row{display:flex;align-items:center;gap:9px;padding:9px 10px;border-radius:9px;font-size:12.5px;color:var(--text-1);cursor:pointer;}
        .ps-pop-row:hover{background:var(--surface-2);}
        .ps-pop-row svg{width:14px;height:14px;color:var(--text-3);}
        .ps-pop-row select{margin-left:auto;height:26px;padding:0 6px;border-radius:7px;border:1px solid var(--border);background:var(--surface-0);color:var(--text-1);font-size:12px;}
        .ps-pop-sep{height:1px;background:var(--border);margin:5px 4px;}
        .ps-pop-btn{display:flex;align-items:center;gap:9px;width:100%;padding:9px 10px;border:none;border-radius:9px;background:transparent;color:var(--text-2);font-size:12.5px;text-align:left;cursor:pointer;}
        .ps-pop-btn:hover{background:var(--surface-2);color:var(--text-1);}
        .ps-pop-btn svg{width:14px;height:14px;}
        .ps-switch{position:relative;width:34px;height:20px;margin-left:auto;flex-shrink:0;}
        .ps-switch input{position:absolute;inset:0;opacity:0;width:100%;height:100%;margin:0;cursor:pointer;z-index:1;}
        .ps-switch span{position:absolute;inset:0;border-radius:999px;background:var(--surface-2);border:1px solid var(--border);transition:background .16s,border-color .16s;}
        .ps-switch span::after{content:'';position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.4);transition:transform .16s;}
        .ps-switch input:checked + span{background:var(--accent);border-color:var(--accent);}
        .ps-switch input:checked + span::after{transform:translateX(14px);}

        /* ── Moments ────────────────────────────────────────────────────── */
        #ps-moments{display:flex;flex-direction:column;gap:24px;padding:18px 20px 40px;min-height:100%;}
        .ps-hero{position:relative;overflow:hidden;display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap;padding:24px 26px;border-radius:20px;color:#fff;background:linear-gradient(118deg,#4338ca 0%,#2563eb 48%,#06b6d4 100%);box-shadow:0 24px 48px -22px rgba(37,99,235,.85);}
        .ps-hero::after{content:'';position:absolute;right:-60px;top:-90px;width:280px;height:280px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.28),transparent 68%);pointer-events:none;}
        .ps-hero-kicker{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;opacity:.78;}
        .ps-hero-title{font-size:26px;font-weight:800;letter-spacing:-.8px;line-height:1.12;margin-top:6px;}
        .ps-hero-sub{font-size:12.5px;opacity:.85;margin-top:6px;}
        .ps-hero-stats{position:relative;display:flex;gap:10px;flex-wrap:wrap;}
        .ps-hero-stat{min-width:76px;padding:10px 14px;border-radius:14px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.22);backdrop-filter:blur(6px);text-align:center;}
        .ps-hero-stat b{display:block;font-size:17px;font-weight:800;letter-spacing:-.4px;}
        .ps-hero-stat span{font-size:10.5px;opacity:.82;}
        .ps-section{display:flex;flex-direction:column;gap:12px;}
        .ps-section-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;}
        .ps-section-head h3{margin:0;font-size:14.5px;font-weight:700;letter-spacing:-.2px;color:var(--text-1);}
        .ps-section-head span{font-size:11.5px;color:var(--text-3);}
        .ps-months{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));}
        .ps-month-card{display:flex;flex-direction:column;gap:9px;padding:9px;border-radius:16px;background:var(--surface-1);border:1px solid var(--border);cursor:pointer;text-align:left;transition:border-color .16s,transform .16s,box-shadow .16s;}
        .ps-month-card:hover{border-color:var(--accent);transform:translateY(-2px);box-shadow:0 16px 32px -18px rgba(0,0,0,.6);}
        .ps-month-mosaic{display:grid;grid-template-columns:2fr 1fr;grid-template-rows:1fr 1fr;gap:2px;aspect-ratio:16/9.4;border-radius:11px;overflow:hidden;background:var(--surface-2);}
        .ps-month-mosaic img{width:100%;height:100%;object-fit:cover;display:block;}
        .ps-month-mosaic img:first-child{grid-row:span 2;}
        .ps-month-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 3px 2px;}
        .ps-month-name{font-size:12.5px;font-weight:700;color:var(--text-1);}
        .ps-month-total{font-size:11px;color:var(--text-3);}

        /* ── Calendar ───────────────────────────────────────────────────── */
        .ps-cal-card{margin:16px 18px 6px;padding:14px;border-radius:18px;background:var(--surface-1);border:1px solid var(--border);}
        .ps-cal-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;}
        .ps-cal-month{font-size:15px;font-weight:700;letter-spacing:-.3px;color:var(--text-1);}
        .ps-cal-nav{display:flex;gap:6px;}
        .ps-cal-navbtn{width:30px;height:30px;display:grid;place-items:center;border-radius:9px;border:1px solid var(--border);background:var(--surface-0);color:var(--text-2);cursor:pointer;transition:background .14s,color .14s;}
        .ps-cal-navbtn:hover{background:var(--surface-2);color:var(--text-1);}
        .ps-cal-navbtn svg{width:13px;height:13px;}
        .ps-cal-week{display:grid;grid-template-columns:repeat(7,1fr);gap:5px;margin-bottom:6px;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text-3);text-align:center;}
        .ps-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:5px;}
        .ps-cal-day{position:relative;min-height:78px;border-radius:11px;overflow:hidden;border:1px solid transparent;background:var(--surface-2);padding:6px;display:flex;flex-direction:column;}
        .ps-cal-day.has{cursor:pointer;border-color:var(--border);}
        .ps-cal-day.has:hover{border-color:var(--accent);}
        .ps-cal-day.sel{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-glow);}
        .ps-cal-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.45;transition:opacity .16s,transform .3s;}
        .ps-cal-day.has:hover .ps-cal-bg{opacity:.6;transform:scale(1.04);}
        .ps-cal-day.sel .ps-cal-bg{opacity:.68;}
        .ps-cal-num{position:relative;z-index:1;font-size:11.5px;font-weight:700;color:var(--text-1);}
        .ps-cal-day.has .ps-cal-num,.ps-cal-day.sel .ps-cal-num{color:#fff;text-shadow:0 1px 4px rgba(0,0,0,.85);}
        .ps-cal-count{position:relative;z-index:1;margin-top:auto;align-self:flex-start;padding:1px 6px;border-radius:999px;background:rgba(0,0,0,.55);color:#fff;font-size:9.5px;font-weight:700;backdrop-filter:blur(4px);}
        .ps-cal-empty{min-height:78px;}
        .ps-cal-quickbar{display:flex;align-items:center;gap:6px;margin:2px 18px 6px;}
        .ps-cal-qbtn{width:30px;height:30px;display:grid;place-items:center;border-radius:9px;border:1px solid var(--border);background:var(--surface-1);color:var(--text-2);cursor:pointer;flex-shrink:0;}
        .ps-cal-qbtn:hover{background:var(--surface-2);color:var(--text-1);}
        .ps-cal-qbtn svg{width:13px;height:13px;}
        .ps-cal-daychip{flex:1;min-width:0;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:6px 12px;border-radius:999px;background:var(--surface-1);border:1px solid var(--border);color:var(--text-2);font-size:12px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .ps-cal-daychip:hover{border-color:var(--accent);color:var(--text-1);}
        .ps-cal-daychip svg{width:13px;height:13px;flex-shrink:0;}

        /* ── Lightbox ───────────────────────────────────────────────────── */
        #ps-lightbox{position:fixed;inset:0;z-index:9500;display:flex;flex-direction:column;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#05070b;overflow:hidden;}
        #ps-lb-backdrop{position:absolute;inset:-8%;background-position:center;background-size:cover;filter:blur(70px) brightness(.42) saturate(1.35);transform:scale(1.08);opacity:.95;transition:background-image .3s ease;pointer-events:none;}
        #ps-lightbox::after{content:'';position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 40%,rgba(0,0,0,.08),rgba(0,0,0,.72));pointer-events:none;}
        .ps-lb-topbar{position:relative;z-index:3;display:flex;align-items:center;gap:10px;padding:12px 16px;background:linear-gradient(rgba(4,6,10,.75),transparent);}
        .ps-lb-counter{font-size:12px;font-weight:700;letter-spacing:.02em;padding:5px 12px;border-radius:999px;background:rgba(255,255,255,.13);border:1px solid rgba(255,255,255,.16);font-variant-numeric:tabular-nums;backdrop-filter:blur(10px);flex-shrink:0;}
        .ps-lb-name{font-size:13px;font-weight:600;color:rgba(255,255,255,.92);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;}
        .ps-lb-actions{display:flex;align-items:center;gap:5px;margin-left:auto;flex-shrink:0;}
        .ps-lb-btn{width:34px;height:34px;display:grid;place-items:center;border-radius:50%;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.1);backdrop-filter:blur(10px);color:rgba(255,255,255,.88);font-size:14px;cursor:pointer;transition:background .14s,color .14s;}
        .ps-lb-btn svg{width:16px;height:16px;}
        .ps-lb-btn:hover{background:rgba(255,255,255,.22);color:#fff;}
        .ps-lb-btn.on{color:#fbbf24;}
        .ps-lb-btn.on svg{fill:currentColor;stroke:currentColor;}
        .ps-lb-btn.priv{color:#f59e0b;}
        .ps-lb-btn.danger:hover{background:rgba(248,113,113,.28);color:#fca5a5;}
        .ps-lb-btn.close{font-size:19px;}
        #ps-lb-media{position:relative;z-index:2;flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:6px 70px;touch-action:none;overflow:hidden;}
        #ps-lb-media img,#ps-lb-media video{max-width:100%;max-height:100%;object-fit:contain;border-radius:14px;box-shadow:0 32px 80px -20px rgba(0,0,0,.9);user-select:none;background:#000;}
        .ps-lb-nav{position:absolute;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;border:1px solid rgba(255,255,255,.16);background:rgba(10,12,18,.55);backdrop-filter:blur(12px);color:#fff;display:none;place-items:center;cursor:pointer;z-index:3;transition:background .14s;}
        .ps-lb-nav:hover{background:rgba(255,255,255,.22);}
        .ps-lb-nav svg{width:20px;height:20px;}
        .ps-lb-nav.prev{left:14px;}
        .ps-lb-nav.next{right:14px;}
        .ps-lb-foot{position:relative;z-index:3;display:flex;flex-direction:column;gap:7px;padding:8px 16px 14px;background:linear-gradient(transparent,rgba(4,6,10,.82));}
        .ps-lb-info{text-align:center;font-size:11.5px;color:rgba(255,255,255,.55);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .ps-lb-strip{display:flex;gap:6px;padding:8px;overflow-x:auto;border-radius:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);backdrop-filter:blur(14px);scrollbar-width:none;}
        .ps-lb-strip::-webkit-scrollbar{display:none;}
        .ps-strip-thumb{width:52px;height:52px;object-fit:cover;border-radius:8px;cursor:pointer;border:2px solid transparent;opacity:.6;flex-shrink:0;transition:border-color .12s,opacity .12s,transform .12s;}
        .ps-strip-thumb:hover{opacity:.9;transform:translateY(-1px);}
        .ps-strip-thumb.active{border-color:#60a5fa !important;opacity:1 !important;}
        .ps-lb-meta{position:absolute;top:0;right:0;bottom:0;width:min(340px,86vw);z-index:6;display:none;flex-direction:column;background:rgba(12,14,20,.95);backdrop-filter:blur(22px);border-left:1px solid rgba(255,255,255,.1);}
        .ps-lb-meta-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.1);}
        .ps-lb-meta-head b{font-size:13.5px;font-weight:700;}
        .ps-lb-meta-body{flex:1;overflow-y:auto;}
        .ps-meta-row{display:flex;gap:12px;padding:8px 16px;border-bottom:1px solid rgba(255,255,255,.05);font-size:12.5px;}
        .ps-meta-k{width:82px;flex-shrink:0;color:rgba(255,255,255,.45);}
        .ps-meta-v{color:rgba(255,255,255,.92);word-break:break-word;}

        /* ── Folder picker ──────────────────────────────────────────────── */
        .ps-picker{position:absolute;inset:0;z-index:55;display:flex;flex-direction:column;background:var(--surface-0);color:var(--text-1);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}
        .ps-picker-head{display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid var(--border);}
        .ps-picker-title{font-size:15px;font-weight:700;letter-spacing:-.2px;}
        .ps-picker-sub{font-size:12px;color:var(--text-3);}
        .ps-picker-close{margin-left:auto;width:32px;height:32px;display:grid;place-items:center;border:none;border-radius:9px;background:var(--surface-1);color:var(--text-2);cursor:pointer;}
        .ps-picker-close svg{width:15px;height:15px;}
        .ps-picker-close:hover{background:var(--surface-2);color:var(--text-1);}
        .ps-picker-mounts{display:flex;gap:6px;padding:10px 18px;overflow-x:auto;scrollbar-width:none;}
        .ps-picker-mounts::-webkit-scrollbar{display:none;}
        .ps-picker-bc{display:flex;align-items:center;gap:3px;flex-wrap:wrap;padding:8px 18px;font-size:12.5px;color:var(--text-2);background:var(--surface-1);border-top:1px solid var(--border);border-bottom:1px solid var(--border);}
        .ps-picker-list{flex:1;overflow-y:auto;padding:14px;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;align-content:start;}
        .ps-pick-card{display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px 10px;border-radius:14px;background:var(--surface-1);border:1px solid var(--border);cursor:pointer;transition:border-color .14s,background .14s,transform .14s;}
        .ps-pick-card:hover{border-color:var(--accent);transform:translateY(-1px);}
        .ps-pick-card.sel{border-color:var(--accent);background:var(--accent-glow);}
        .ps-pick-ic{width:44px;height:44px;border-radius:13px;display:grid;place-items:center;background:var(--surface-2);color:var(--text-2);}
        .ps-pick-card.sel .ps-pick-ic{background:var(--accent);color:#fff;}
        .ps-pick-ic svg{width:20px;height:20px;}
        .ps-pick-name{font-size:12px;color:var(--text-1);text-align:center;word-break:break-word;line-height:1.3;}
        .ps-picker-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 18px;border-top:1px solid var(--border);background:var(--surface-1);}

        /* PIN / dialog inputs */
        .ps-pin-input{width:100%;box-sizing:border-box;background:var(--surface-0);border:1px solid var(--border);border-radius:10px;color:var(--text-1);font-size:16px;letter-spacing:.3em;padding:10px 12px;margin-bottom:10px;outline:none;transition:border-color .14s,box-shadow .14s;}
        .ps-pin-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-glow);}

        /* ── Welcome ────────────────────────────────────────────────────── */
        .ps-welcome{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:32px;text-align:center;background:radial-gradient(120% 90% at 50% 0%,var(--accent-glow),transparent 62%);}
        .ps-welcome-ic{width:88px;height:88px;border-radius:28px;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,#6366f1,#0ea5e9);box-shadow:0 24px 54px -18px rgba(59,130,246,.8);margin-bottom:6px;}
        .ps-welcome-ic svg{width:40px;height:40px;}
        .ps-welcome h2{margin:0;font-size:20px;font-weight:800;letter-spacing:-.4px;color:var(--text-1);}
        .ps-welcome p{margin:0;max-width:370px;font-size:13px;line-height:1.6;color:var(--text-2);}
        .ps-welcome-actions{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;justify-content:center;}
        .ps-primary-btn{display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 18px;border-radius:11px;border:none;background:var(--accent);color:#fff;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 10px 24px -10px var(--accent);transition:transform .14s,background .14s;}
        .ps-primary-btn:hover{background:var(--accent-hover);transform:translateY(-1px);}
        .ps-primary-btn svg{width:15px;height:15px;}

        /* ── Responsive ────────────────────────────────────────────────── */
        @media (max-width:768px){
            .ps-sidebar{position:absolute;left:0;top:0;bottom:0;z-index:60;transform:translateX(-105%);transition:transform .22s cubic-bezier(.22,.61,.36,1);box-shadow:0 0 60px rgba(0,0,0,.6);}
            .ps-sidebar.open{transform:none;}
            .ps-menu-btn{display:grid;}
            .ps-topbar{padding:9px 12px;gap:9px;}
            .ps-title{font-size:15px;max-width:44vw;}
            .ps-subtitle{display:none;}
            .ps-toolbar-controls{gap:6px;}
            #ps-select-btn span{display:none;}
            #ps-select-btn{padding:0 9px;}
            .ps-search{flex:1 1 100%;max-width:none;order:-1;}
            .ps-search input{font-size:16px;}
            .ps-status-pill{display:none;}
            .ps-grid{padding:10px 10px 92px;gap:4px;}
            .ps-tile{border-radius:9px;}
            .ps-tile-info{opacity:1;transform:none;}
            .ps-tile-shade{opacity:.55;}
            .ps-fav{opacity:1;}
            .ps-actionbar{left:10px;right:10px;transform:none;bottom:12px;flex-wrap:wrap;justify-content:center;}
            .ps-act-count{width:100%;text-align:center;padding:2px 0 4px;}
            .ps-lb-topbar{flex-wrap:wrap;row-gap:6px;padding:10px;}
            .ps-lb-actions{gap:3px;}
            .ps-lb-btn{width:32px;height:32px;}
            .ps-lb-name{order:3;width:100%;}
            #ps-lb-media{padding:4px 8px;}
            .ps-lb-nav{display:none !important;}
            .ps-cal-card{margin:10px 10px 4px;padding:10px;}
            .ps-cal-day,.ps-cal-empty{min-height:56px;padding:4px;}
            .ps-cal-count{font-size:8.5px;padding:0 4px;}
            .ps-cal-quickbar{margin:2px 10px 4px;}
            .ps-months{grid-template-columns:repeat(auto-fill,minmax(150px,1fr));}
            .ps-hero{padding:18px;border-radius:16px;}
            .ps-hero-title{font-size:22px;}
            .ps-hero-stats{width:100%;}
            #ps-moments{padding:12px 12px 32px;gap:18px;}
        }
        @media (hover:none){
            .ps-nav-actions{opacity:1;}
            .ps-fav{opacity:1;}
            .ps-tile-info{opacity:1;transform:none;}
            .ps-tile-shade{opacity:.5;}
        }`;
    document.head.appendChild(st);
}

// ════════════════════════════════════════════
// APP: PhotoStation — API layer
// ════════════════════════════════════════════

async function _loadConfig() {
    try {
        const r = await apiFetch('/api/gallery/config');
        if (r.ok) {
            const d = await r.json();
            _cfg = { folders: d.folders || [], options: { ..._cfg.options, ...(d.options || {}) } };
        }
    } catch (e) { console.error('PhotoStation config load failed:', e); }
}

async function _saveConfigPatch(patch) {
    // Folder changes and the include-videos toggle trigger a background rescan.
    // Capture the scan timestamp first so completion can be detected reliably
    // even when the scan finishes before the next status poll.
    const triggersScan = Array.isArray(patch.folders)
        || (patch.options && Object.prototype.hasOwnProperty.call(patch.options, 'include_videos'));
    const before = triggersScan ? await _rescanBaseline() : 0;
    let ok = false;
    try {
        const r = await apiFetch('/api/gallery/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
        });
        if (r.ok) {
            const d = await r.json();
            if (Array.isArray(d.folders)) _cfg.folders = d.folders;
            Object.assign(_cfg.options, d.options || {});
            ok = true;
        }
    } catch (e) { console.error('PhotoStation config save failed:', e); }
    if (ok && triggersScan) _watchRescan(before);
    return ok;
}

async function _rescanBaseline() {
    try {
        const r = await apiFetch('/api/gallery/rescan-status');
        if (r.ok) return (await r.json()).scanned_at || 0;
    } catch (e) { /* non-fatal */ }
    return 0;
}

// Poll until the index reports a newer scan timestamp, then refresh the view.
// (A 5s status poll can easily miss a fast incremental scan.)
async function _watchRescan(before, maxMs = 300000) {
    const started = Date.now();
    while (Date.now() - started < maxMs) {
        await new Promise(r => setTimeout(r, 2000));
        if (!_active()) return;
        try {
            const r = await apiFetch('/api/gallery/rescan-status');
            if (!r.ok) return;
            const d = await r.json();
            if ((d.scanned_at || 0) > (before || 0)) {
                if (_momentsView) _loadMoments(); else _reloadView();
                _renderSidebar();
                return;
            }
        } catch (e) { return; }
    }
}

// Current view → query params for the data endpoints.  Camera is sent as its
// own parameter (it composes with the free-text search server-side); merging
// the two into one `q` string made camera+search always return nothing.
function _viewParams(extra = {}) {
    const sort = _psViewMode === 'timeline' ? 'date_desc' : (_cfg.options.sort || 'date_desc');
    const params = new URLSearchParams({ sort, ...extra });
    // Folder scoping applies to the Private section too — the backend supports
    // view=private&folder=…, and without it private folder facets did nothing.
    if (_currentFolder) params.set('folder', _currentFolder);
    if (_query) params.set('q', _query);
    if (_cameraView) params.set('camera', _cameraView);
    if (_calendarView && _calDay) params.set('day', _calDay);
    if (_favView) params.set('fav', '1');
    if (_albumView) params.set('album', _albumView);
    if (_privateView) { params.set('view', 'private'); if (_psToken) params.set('ps', _psToken); }
    return params;
}

// Fetches are serialized through a promise chain: an in-flight request can
// never make a newer view silently skip its fetch (the old code returned
// early while a previous page was still loading, leaving the grid stuck on
// "Loading photos…" forever).  `_gen` still drops results for views the user
// has already navigated away from.
let _fetchChain = Promise.resolve();

function _fetchPage(reset) {
    if (!reset && _offset >= _total) return Promise.resolve();
    const gen = _gen;
    const params = _viewParams({ offset: String(reset ? 0 : _offset), limit: String(PAGE_SIZE) });
    const run = () => _doFetchPage(reset, gen, params);
    _fetchChain = _fetchChain.then(run, run);
    return _fetchChain;
}

async function _doFetchPage(reset, gen, params) {
    _loadingPage = true;
    try {
        let r = await apiFetch(`/api/gallery/items?${params.toString()}`);
        if (!r.ok && _privateView && r.status === 403) {
            // Private session expired mid-browse → re-prompt for the PIN once.
            _psToken = null;
            const ok = await _psPinModal('enter');
            if (ok && _psToken) { params.set('ps', _psToken); r = await apiFetch(`/api/gallery/items?${params.toString()}`); }
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        if (gen !== _gen) return;
        if (reset) { _items = []; _offset = 0; }
        _total = d.total || 0;
        _facets = d.folders || [];
        _items.push(...(d.items || []));
        _offset += (d.items || []).length;
    } catch (e) {
        console.error('PhotoStation load failed:', e);
        if (gen === _gen && window.addNotification) window.addNotification('Failed to load photos: ' + e.message, 'error');
    } finally {
        _loadingPage = false;
    }
}

async function _reloadView() {
    const gen = ++_gen;
    const grid = document.getElementById('ps-grid');
    if (grid) grid.innerHTML = '<div class="ps-loading" data-testid="ps-loading"><span class="ps-spinner"></span><span>Loading photos…</span></div>';
    _items = []; _offset = 0; _facets = []; _total = 0;
    _lastMonthKey = null;
    _lastDayKey = null;
    if (_calendarView && !_calDay) {
        const g2 = document.getElementById('ps-grid');
        if (g2) g2.innerHTML = `<div class="ps-empty" data-testid="ps-cal-hint"><span class="ps-empty-ic">${_svg('calendar')}</span><b>Pick a day</b><span>Days with photos are highlighted on the calendar.</span></div>`;
        _renderFacets();
        _updateLoadMore();
        _updateStatus();
        return;
    }
    await _fetchPage(true);
    if (gen !== _gen) return;   // another navigation started while fetching
    if (_psViewMode === 'timeline') _loadMonthsMeta();
    if (grid) grid.innerHTML = '';   // drop the loading placeholder before appending tiles
    if (_items.length) {
        _appendTiles(0);
    } else if (grid) {
        const title = _query ? `No matches for “${_escHtml(_query)}”`
            : _cameraView ? `No photos from ${_escHtml(_cameraView)}`
                : (_calendarView && _calDay) ? `No photos on ${_calDay}`
                    : _favView ? 'No favorites yet'
                        : _privateView ? 'Nothing private yet'
                            : 'No photos in this folder';
        const hint = _favView ? 'Hover a photo and click the star to save it here.'
            : _privateView ? 'Select photos and choose “Make private”.'
                : 'Add a folder or run a rescan to build your library.';
        grid.innerHTML = `<div class="ps-empty" data-testid="ps-empty">
            <span class="ps-empty-ic">${_svg(_favView ? 'star' : _privateView ? 'lock' : 'image')}</span>
            <b>${title}</b>
            <span>${hint}</span></div>`;
    }
    _selected.clear(); _lastSelIdx = -1;
    _renderFacets();
    _updateTileSelection();
    _updateActionBar();
    _updateStatus();
    _updateLoadMore();
}

// ════════════════════════════════════════════
// APP: PhotoStation — Shell (sidebar + toolbar + grid)
// ════════════════════════════════════════════

function _renderShell() {
    if (!_body) return;
    if (_observer) { _observer.disconnect(); _observer = null; }
    const cell = _cellPx();
    _body.innerHTML = `
        <div class="ps-app" data-testid="ps-shell">
            <aside class="ps-sidebar" data-testid="ps-sidebar">
                <div class="ps-brand">
                    <div class="ps-brand-mark">${_svg('camera')}</div>
                    <div style="min-width:0;">
                        <div class="ps-brand-title">Photos</div>
                        <div class="ps-brand-sub">Personal media library</div>
                    </div>
                </div>
                <nav class="ps-nav" data-testid="ps-nav"></nav>
                <div class="ps-side-foot">
                    <button class="ps-side-btn" data-testid="ps-add-folder-btn" onclick="_psShowPicker()">${_svg('plus')} Add folder</button>
                </div>
            </aside>
            <main class="ps-main">
                <header class="ps-topbar" id="ps-toolbar" data-testid="ps-toolbar">
                    <button class="ps-menu-btn" data-testid="ps-menu-btn" onclick="_psToggleSidebar()" title="Menu">${_svg('menu')}</button>
                    <div class="ps-heading">
                        <div class="ps-title-row">
                            <h1 class="ps-title" id="ps-title">All Photos</h1>
                            ${_privateView ? `<span class="ps-badge private" data-testid="ps-private-badge">${_svg('lock')} Private</span>` : ''}
                            ${_momentsView ? `<span class="ps-badge moments" data-testid="ps-moments-badge">${_svg('sparkles')} Moments</span>` : ''}
                        </div>
                        <div class="ps-subtitle" id="ps-subtitle"></div>
                    </div>
                    <div class="ps-toolbar-controls" data-testid="ps-toolbar-controls">
                        <label class="ps-search" title="Search by name, folder or camera">
                            ${_svg('search')}
                            <input data-testid="ps-search" id="ps-search-input" type="search" placeholder="Search photos, folders, cameras…" autocomplete="off" oninput="_psOnSearch(this.value)">
                        </label>
                        <select aria-label="Sort" class="ps-select" data-testid="ps-sort" onchange="_psOnSort(this.value)" title="Sort order">
                            ${SORTS.map(s => `<option value="${s.id}" ${(_cfg.options.sort || 'date_desc') === s.id ? 'selected' : ''}>${s.label}</option>`).join('')}
                        </select>
                        <div class="ps-seg" data-testid="ps-view-toggle" title="Grid or timeline view">
                            <button class="${_psViewMode === 'grid' ? 'on' : ''}" data-testid="ps-view-grid" onclick="_psSetViewMode('grid')" title="Grid view">${_svg('grid')}</button>
                            <button class="${_psViewMode === 'timeline' ? 'on' : ''}" data-testid="ps-view-timeline" onclick="_psSetViewMode('timeline')" title="Timeline — grouped by month">${_svg('timeline')}</button>
                        </div>
                        <button class="ps-text-btn${_selectMode ? ' on' : ''}" data-testid="ps-select-btn" id="ps-select-btn" onclick="_psToggleSelectMode()" title="Click tiles to select multiple items (Ctrl/⌘+click works too)">
                            ${_svg('checkSquare')}<span>${_selectMode ? 'Selecting' : 'Select'}</span>
                        </button>
                        <button class="ps-icon-btn" data-testid="ps-settings-btn" id="ps-settings-btn" onclick="_psToggleSettings()" title="Library settings">${_svg('settings')}</button>
                        <span class="ps-pill ps-status-pill" data-testid="ps-status" id="ps-status"></span>
                    </div>
                </header>
                <div id="ps-settings-pop" class="ps-pop" style="display:none;">
                    <div class="ps-pop-row">
                        ${_svg('video')} <span>Include videos</span>
                        <label class="ps-switch"><input type="checkbox" data-testid="ps-opt-videos" ${_cfg.options.include_videos !== false ? 'checked' : ''} onchange="_psOptVideos(this.checked)"><span></span></label>
                    </div>
                    <label class="ps-pop-row">
                        ${_svg('grid')} <span>Thumbnail size</span>
                        <select aria-label="Opt Gridsize" data-testid="ps-opt-gridsize" onchange="_psOptGridSize(this.value)">
                            <option value="small" ${_cfg.options.grid_size === 'small' ? 'selected' : ''}>Small</option>
                            <option value="medium" ${(_cfg.options.grid_size || 'medium') === 'medium' ? 'selected' : ''}>Medium</option>
                            <option value="large" ${_cfg.options.grid_size === 'large' ? 'selected' : ''}>Large</option>
                        </select>
                    </label>
                    <div class="ps-pop-sep"></div>
                    <button class="ps-pop-btn" data-testid="ps-pin-btn" onclick="_psTogglePinSettings()" title="Set or change the PIN that protects and encrypts the Private section">${_svg('key')} Private PIN (set / change)</button>
                    <button class="ps-pop-btn" data-testid="ps-rescan-btn" onclick="_psRescanNow()">${_svg('refresh')} Rescan library now</button>
                </div>
                <div class="ps-chips" data-testid="ps-facets"></div>
                <div class="ps-scroll" id="ps-grid-scroll">
                    <div id="ps-cal-host"></div>
                    <div id="ps-grid" class="ps-grid" data-testid="ps-grid" onkeydown="_gridKeyNav(event)" style="grid-template-columns:${_gridCols(cell)};"></div>
                    <div id="ps-sentinel" style="height:2px;"></div>
                    <div id="ps-loadmore" style="display:none;padding:0 18px 26px;text-align:center;">
                        <button class="ps-text-btn" data-testid="ps-loadmore-btn" onclick="_psLoadMore()">Load more</button>
                    </div>
                </div>
                <div id="ps-actionbar" class="ps-actionbar" data-testid="ps-actionbar">
                    <span class="ps-act-count" data-testid="ps-actionbar-count"></span>
                    <button class="ps-act warn" data-testid="ps-private-selected-btn" onclick="_psTogglePrivateSelected()" title="Move selected items to/from the Private section (encrypted at rest)">${_privateView ? _svg('unlock') : _svg('lock')}<span>${_privateView ? 'Make public' : 'Make private'}</span></button>
                    ${_albumView ? `<button class="ps-act danger" data-testid="ps-album-remove-btn" onclick="_psRemoveFromAlbum()" title="Remove selected items from this album (files stay on disk)">${_svg('minus')}<span>From album</span></button>` : ''}
                    <button class="ps-act ok" data-testid="ps-album-add-btn" onclick="_psAddToAlbumModal()" title="Add selected items to an album">${_svg('folderPlus')}<span>Album</span></button>
                    <button class="ps-act" data-testid="ps-fav-selected-btn" onclick="_psFavoriteSelected()" title="Star/unstar the selected items">${_svg('star')}<span>Favorite</span></button>
                    <button class="ps-act info" data-testid="ps-download-selected-btn" onclick="_psDownloadSelected()" title="Download selected items (private items download as PIN-encrypted files)">${_svg('download')}<span>Download</span></button>
                    <button class="ps-act info" data-testid="ps-share-selected-btn" onclick="_psShareSelected()" title="Create public share link(s) for the selected photos">${_svg('share')}<span>Share</span></button>
                    <div class="ps-act-div"></div>
                    <button class="ps-act danger" data-testid="ps-delete-selected-btn" onclick="_psDeleteSelected()" title="Move selected items to trash">${_svg('trash')}<span>Delete</span></button>
                    <button class="ps-act" data-testid="ps-clear-selection-btn" onclick="_psClearSelection()" title="Clear selection">${_svg('close')}</button>
                </div>
            </main>
        </div>`;
    _updateHeading();
    _renderSidebar();
    _setupObserver();
    _startStatusPolling();
    if (_momentsView) {
        const ctl = document.querySelector('[data-testid="ps-toolbar-controls"]');
        if (ctl) ctl.style.display = 'none';
        const grid = document.getElementById('ps-grid');
        if (grid) grid.style.display = 'none';
        _loadMoments();
    } else {
        const host = document.getElementById('ps-moments');
        if (host) host.remove();
        if (_calendarView) _loadCalendar();
        _reloadView();
    }
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

// ════════════════════════════════════════════
// APP: PhotoStation — Private PIN (gate + at-rest encryption)
// ════════════════════════════════════════════

async function _psPinStatus() {
    try {
        const r = await apiFetch('/api/gallery/private-pin/status');
        if (r.ok) { const d = await r.json(); _pinSet = !!d.set; }
    } catch (e) { /* keep previous value */ }
    return _pinSet;
}

// PIN prompt. mode: 'enter' | 'create' | 'change'. Resolves true on success
// (_psToken set), false when cancelled or failed.
function _psPinModal(mode) {
    return new Promise((resolve) => {
        const titles = { enter: 'Unlock Private section', create: 'Create a Private PIN', change: 'Change Private PIN' };
        const hints = {
            enter: 'Enter your PIN to view private photos.',
            create: 'Private photos are encrypted on disk with this PIN. If you forget it, they cannot be recovered — choose something memorable (min 6 characters).',
            change: 'All encrypted private files will be re-encrypted with the new PIN.',
        };
        const fields = {
            enter: [{ id: 'pin1', label: 'PIN' }],
            create: [{ id: 'pin1', label: 'New PIN (min 6 characters)' }, { id: 'pin2', label: 'Repeat PIN' }],
            change: [{ id: 'pin0', label: 'Current PIN' }, { id: 'pin1', label: 'New PIN (min 6 characters)' }, { id: 'pin2', label: 'Repeat new PIN' }],
        }[mode];

        const ov = document.createElement('div');
        ov.id = 'ps-pin-overlay';
        ov.style.cssText = 'position:fixed;inset:0;z-index:9600;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px);';
        const inputHtml = fields.map(f => `
            <label style="display:block;font-size:12px;color:var(--text-3);margin-bottom:4px;">${f.label}</label>
            <input id="${f.id}" type="password" autocomplete="off" spellcheck="false" class="ps-pin-input">`).join('');
        ov.innerHTML = `
            <div style="width:min(360px,90vw);background:var(--surface-1);border:1px solid var(--border);border-radius:14px;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.55);">
                <div style="display:flex;align-items:center;gap:8px;font-size:15px;font-weight:600;color:var(--text-1);margin-bottom:6px;">${_svg('lock', 'width:16px;height:16px;')} ${titles[mode]}</div>
                <div id="ps-pin-hint" style="font-size:12.5px;line-height:1.45;color:var(--text-3);margin-bottom:14px;">${hints[mode]}</div>
                ${inputHtml}
                <div id="ps-pin-error" style="display:none;font-size:12.5px;color:#f87171;margin:-4px 0 10px;"></div>
                <div style="display:flex;gap:8px;justify-content:flex-end;">
                    <button id="ps-pin-cancel" class="btn-ghost" style="font-size:13px;padding:8px 14px;border-radius:8px;">Cancel</button>
                    <button id="ps-pin-ok" style="background:var(--accent);border:none;color:#fff;font-size:13px;font-weight:600;padding:8px 18px;border-radius:8px;cursor:pointer;">${mode === 'enter' ? 'Unlock' : 'Save PIN'}</button>
                </div>
            </div>`;
        document.body.appendChild(ov);
        const first = ov.querySelector('#pin1'); if (first) first.focus();

        let done = false;
        const cleanup = () => { document.removeEventListener('keydown', escKey, true); };
        const close = (ok) => { if (!done) { done = true; cleanup(); ov.remove(); resolve(ok); } };
        const errEl = () => { const e = ov.querySelector('#ps-pin-error'); e.style.display = 'block'; return e; };
        const val = (id) => { const el = ov.querySelector('#' + id); return el ? el.value : ''; };

        ov.querySelector('#ps-pin-cancel').onclick = () => close(false);
        ov.onclick = (e) => { if (e.target === ov) close(false); }
        const escKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(false); } };
        document.addEventListener('keydown', escKey, true);

        const submit = async () => {
            try {
                if (mode !== 'enter' && val('pin1') !== val('pin2')) { errEl().textContent = 'PINs do not match'; return; }
                let r;
                if (mode === 'enter') {
                    r = await apiFetch('/api/gallery/private-pin/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: val('pin1') }) });
                } else if (mode === 'create') {
                    r = await apiFetch('/api/gallery/private-pin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set', new_pin: val('pin1') }) });
                } else {
                    r = await apiFetch('/api/gallery/private-pin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'change', old_pin: val('pin0'), new_pin: val('pin1') }) });
                }
                if (!r.ok) {
                    let msg = `HTTP ${r.status}`;
                    try { const e2 = await r.clone().json(); if (e2.detail) msg = typeof e2.detail === 'string' ? e2.detail : JSON.stringify(e2.detail); } catch (_) {}
                    errEl().textContent = msg === 'wrong_pin' ? 'Wrong PIN — try again.' : msg;
                    return;
                }
                const d = await r.json();
                _psToken = d.ps_token || null;
                _pinSet = true;
                close(true);
            } catch (e) { errEl().textContent = e.message; }
        };
        ov.querySelector('#ps-pin-ok').onclick = submit;
        const onKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } };
        ov.addEventListener('keydown', onKey);
    });
}

// Ensure a Private session exists before an operation that needs the key.
async function _psEnsureSession() {
    if (_psToken) return true;
    const set = await _psPinStatus();
    return await _psPinModal(set ? 'enter' : 'create');
}

// POST /api/gallery/private with the active session token attached.
async function _psPrivateRequest(paths, makePrivate) {
    return apiFetch('/api/gallery/private', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths, private: makePrivate, ps: _psToken || '' }),
    });
}

window._psTogglePinSettings = async () => {
    const pop = document.getElementById('ps-settings-pop');
    if (pop) pop.style.display = 'none';
    const set = await _psPinStatus();
    const ok = await _psPinModal(set ? 'change' : 'create');
    if (ok && window.addNotification) {
        window.addNotification(set ? 'Private PIN changed — files re-encrypted' : 'Private PIN created', 'success');
    }
};

async function _countFor(folder, key, view) {
    try {
        const params = new URLSearchParams({ offset: '0', limit: '1', sort: _cfg.options.sort || 'date_desc' });
        if (folder) params.set('folder', folder);
        if (view) { params.set('view', view); if (_psToken) params.set('ps', _psToken); }
        const r = await apiFetch(`/api/gallery/items?${params.toString()}`);
        if (!r.ok) return;
        const d = await r.json();
        _counts[key] = d.total || 0;
    } catch (e) { /* non-fatal */ }
}

async function _renderSidebar() {
    const nav = document.querySelector('[data-testid="ps-nav"]');
    if (!nav) return;
    await Promise.all([
        _countFor('', 'all'),
        _refreshPrivateCount(),
        _loadAlbums(),
        ..._cfg.folders.map((f, i) => _countFor(f.path, 'f' + i)),
    ]);
    if (!_active()) return;
    _updateHeading();
    const special = _momentsView || _calendarView || _favView || _albumView || _privateView || _cameraView;
    let html = `<div class="ps-nav-group" style="padding-top:8px;">Library</div>`;
    html += _navRow('ps-nav-moments', 'sparkles', 'Moments', null, _momentsView, '_psNavMoments()', 'Curated highlights and month timeline');
    html += _navRow('ps-nav-all', 'grid', 'All Photos', _counts.all, !special && _currentFolder === '', '_psNavAll()', 'Everything in your library');
    html += _navRow('ps-nav-favorites', 'star', 'Favorites', null, _favView, '_psNavFavorites()', 'Photos you starred');
    html += _navRow('ps-nav-calendar', 'calendar', 'Calendar', null, _calendarView, '_psNavCalendar()', 'Browse photos by day on a calendar');
    html += _navRow('ps-nav-private', 'lock', 'Private', _counts.private, _privateView, '_psNavPrivate()', 'Hidden items — encrypted at rest');
    html += `<div class="ps-nav-group" data-testid="ps-albums-header">Albums
        <button data-testid="ps-album-new" onclick="_psAlbumCreate()" title="New album">${_svg('plus')}</button></div>`;
    html += _albums.map(a => _navRow(
        `ps-nav-album-${a.id}`, 'folder', a.name, a.count, _albumView === a.id,
        `_psNavAlbum(${_jsArg(a.id)})`, a.name,
        `<button class="ps-nav-mini" data-testid="ps-album-del-${a.id}" onclick="_psAlbumDelete(${_jsArg(a.id)}, event)" title="Delete album (items stay on disk)">${_svg('close')}</button>`,
    )).join('');
    html += `<div class="ps-nav-group" data-testid="ps-folders-header">Folders</div>`;
    html += _cfg.folders.map((f, i) => _navRow(
        `ps-nav-folder-${i}`, 'folder', f.name, _counts['f' + i], !_privateView && _currentFolder === f.path,
        `_psNavFolder(${i})`, f.path,
        `<button class="ps-nav-mini" data-testid="ps-share-folder-${i}" onclick="_psShareFolder(${i}, event)" title="Create public share link for this folder">${_svg('share')}</button>`
        + `<button class="ps-nav-mini" data-testid="ps-remove-folder-${i}" onclick="_psRemoveFolder(${i})" title="Remove from library">${_svg('close')}</button>`,
    )).join('');
    nav.innerHTML = html;
}

// One sidebar row: tinted icon square + label + optional count + hover actions.
function _navRow(testid, icon, label, count, active, onclick, title, actions) {
    const cnt = `<span class="ps-nav-count">${count != null && count !== '' ? count : ''}</span>`;
    return `<div class="ps-nav-item${active ? ' active' : ''}" data-testid="${testid}" onclick="${onclick}"${title ? ` title="${_escAttr(title)}"` : ''}>
        <span class="ps-nav-ic">${_svg(icon)}</span>
        <span class="ps-nav-label">${_escHtml(label)}</span>
        ${cnt}${actions ? `<span class="ps-nav-actions">${actions}</span>` : ''}
    </div>`;
}

// Page title/subtitle for the current scope (top bar heading).
function _viewTitle() {
    if (_momentsView) return ['Moments', 'Rediscover your library'];
    if (_calendarView) return ['Calendar', 'Browse your photos by day'];
    if (_favView) return ['Favorites', 'Everything you starred'];
    if (_albumView) {
        const a = _albums.find(x => x.id === _albumView);
        return [a ? a.name : 'Album', 'Album'];
    }
    if (_privateView) return ['Private', 'PIN-protected, encrypted at rest'];
    if (_cameraView) return [_cameraView, 'Photos from this camera'];
    if (_currentFolder) return [_baseName(_currentFolder), _currentFolder];
    return ['All Photos', 'Everything in your library'];
}

function _updateHeading() {
    const [title, sub] = _viewTitle();
    const t = document.getElementById('ps-title');
    if (t) t.textContent = title;
    const s = document.getElementById('ps-subtitle');
    if (s) s.textContent = sub;
}

function _psNavAll() { _psSelectFolder(''); }
function _psNavFolder(i) { const f = _cfg.folders[i]; if (f) _psSelectFolder(f.path); }

function _psNavCamera(cam) {
    _cameraView = cam || null;
    _momentsView = false;
    _calendarView = false; _calDay = null;
    _favView = false;
    _albumView = null;
    _privateView = false;
    _currentFolder = '';
    // The search box shows only the free-text part; the camera chip carries
    // the rest, so keep the two sources in sync.
    _query = '';
    const si = document.getElementById('ps-search-input');
    if (si) si.value = '';
    _renderShell();
}

async function _loadCameras() {
    // Exclude the camera filter itself so the list shows every camera that
    // still matches the current folder/search/favourites/album scope.
    const params = _viewParams();
    params.delete('sort'); params.delete('camera'); params.delete('day');
    try {
        const r = await apiFetch(`/api/gallery/cameras?${params.toString()}`);
        if (!r.ok || !_active()) return;
        const d = await r.json();
        _cameras = d.cameras || [];
    } catch (e) { _cameras = []; }
}

function _psCalShiftDay(delta) {
    if (!_calDay) return;
    const d = new Date(_calDay + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const newDate = `${mk}-${String(d.getDate()).padStart(2, '0')}`;
    if (mk !== _calMonth) {
        _calMonth = mk;
        _calDay = null;
        _loadCalendar();
    } else {
        _calDay = newDate;
        _reloadView();
        _renderCalendarPanel();
    }
}

// Enter the Private section: only items flagged private are shown.
// Requires an active PIN session — prompts to create/enter the PIN first.
async function _psNavPrivate() {
    if (_privateView && !_query) return;
    if (!_psToken) {
        const set = await _psPinStatus();
        const ok = await _psPinModal(set ? 'enter' : 'create');
        if (!ok || !_psToken) return;   // cancelled / wrong PIN → stay where we are
    }
    _momentsView = false;
    _calendarView = false; _calDay = null;
    _favView = false;
    _albumView = null;
    _privateView = true;
    _cameraView = null;
    _currentFolder = '';
    _query = '';
    const si = document.getElementById('ps-search-input');
    if (si) si.value = '';
    _renderShell();
}

// Mobile drawer toggle (no-op on desktop — the button is hidden there).
function _psToggleSidebar() {
    const sb = document.querySelector('[data-testid="ps-sidebar"]');
    if (!sb) return;
    let bd = document.getElementById('ps-sb-backdrop');
    const open = !sb.classList.contains('open');
    sb.classList.toggle('open', open);
    if (open && !bd) {
        bd = document.createElement('div');
        bd.id = 'ps-sb-backdrop';
        bd.style.cssText = 'position:absolute;inset:0;z-index:34;background:rgba(0,0,0,.45);display:none;cursor:pointer;';
        const shell = _body && _body.querySelector('[data-testid="ps-shell"]');
        if (shell) { shell.appendChild(bd); bd.onclick = () => _psToggleSidebar(); }
    }
    if (bd) bd.style.display = open ? 'block' : 'none';
}

function _psSelectFolder(path) {
    // Special views (Calendar, Favorites, Album, Camera, Private, Moments) all
    // reset `_currentFolder` to '', so a plain "path === _currentFolder" check
    // used to make the sidebar "All Photos" entry a no-op from those views.
    const inSpecialView = _privateView || _momentsView || _calendarView
        || _favView || _albumView || _cameraView;
    _privateView = false;
    _momentsView = false;
    _calendarView = false; _calDay = null;
    _favView = false;
    _albumView = null;
    _cameraView = null;
    if (!inSpecialView && path === _currentFolder && !_query) return;
    _currentFolder = path || '';
    _query = '';
    _renderShell();
}

async function _psRemoveFolder(i) {
    const f = _cfg.folders[i];
    if (!f) return;
    if (window.showModalConfirm) {
        const ok = await window.showModalConfirm('Remove Folder', `Remove "${f.name}" from the PhotoStation library?\nFiles on disk are not deleted.`);
        if (!ok) return;
    }
    await _saveConfigPatch({ folders: _cfg.folders.filter(x => x.path !== f.path) });
    if (_currentFolder === f.path || _currentFolder.startsWith(f.path + '/')) _currentFolder = '';
    _counts = {};
    _renderShell();
}

// ── Facet chips (subfolders of the current scope) ─────────────────────────────

function _psFacetGo(i) {
    const f = _facets[i];
    if (!f) return;
    // Inside the Private section stay private — folder chips drill down there
    // too (the backend supports folder scoping with view=private).
    if (_privateView) { _currentFolder = f.path; _renderShell(); return; }
    _psSelectFolder(f.path);
}
function _psFacetParent() {
    if (!_facetParent || _facetParent === '/') return;
    if (_privateView) { _currentFolder = _facetParent; _renderShell(); return; }
    _psSelectFolder(_facetParent);
}

function _renderFacets() {
    const el = document.querySelector('[data-testid="ps-facets"]');
    if (!el) return;
    const searchChip = _query
        ? `<button class="ps-chip" data-testid="ps-search-chip" onclick="_psClearSearch()" title="Clear search">${_svg('search')}<span>${_escHtml(_query)}</span>${_svg('close')}</button>`
        : '';
    if (_albumView) {
        const a = _albums.find(x => x.id === _albumView);
        el.innerHTML = `<button class="ps-chip" data-testid="ps-album-chip" onclick="_psNavAll()" title="Back to All Photos">${_svg('folder')}<span>${_escHtml(a ? a.name : 'Album')}</span>${_svg('close')}</button>${searchChip}`;
        el.style.display = 'flex';
        return;
    }
    let html = searchChip;
    if (_cameraView) {
        html += `<button class="ps-chip" data-testid="ps-camera-chip" onclick="_psNavCamera(null)" title="Clear camera filter">${_svg('camera')}<span>${_escHtml(_cameraView)}</span>${_svg('close')}</button>`;
    }
    _facetParent = (_currentFolder && _currentFolder !== '/') ? _parentPath(_currentFolder) : '';
    const isLibraryRoot = _cfg.folders.some(f => f.path === _currentFolder);
    if (isLibraryRoot || _facetParent === '/') _facetParent = '';
    if (_facetParent && _facetParent !== '/') {
        html += `<button class="ps-chip" data-testid="ps-facet-parent" onclick="_psFacetParent()">${_svg('arrowUp')}<span>${_escHtml(_baseName(_facetParent))}</span></button>`;
    }
    for (let i = 0; i < _facets.length; i++) {
        const f = _facets[i];
        // '.' means media sitting directly in the current folder — the grid
        // already shows it, so the chip would be a no-op.
        if (f.name === '.') continue;
        html += `<button class="ps-chip" data-testid="ps-facet-${i}" onclick="_psFacetGo(${i})">${_svg('folder')}<span>${_escHtml(f.name)}</span><span class="ps-chip-count">${f.count}</span></button>`;
    }
    el.innerHTML = html;
    el.style.display = html ? 'flex' : 'none';
}

// ── Grid tiles + infinite scroll ──────────────────────────────────────────────

// ── Timeline (month-grouped) view ────────────────────────────────────────────

function _monthKeyOf(it) {
    const ts = it.taken || it.modified;
    if (!ts) return '';
    const d = new Date(Number(ts) * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function _monthLabelOf(mk) {
    const meta = _monthMeta[mk];
    if (meta && meta.label) return meta.label;
    const [y, m] = mk.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function _monthCountText(m) {
    if (!m) return '';
    const bits = [];
    if (m.images) bits.push(`${m.images} photo${m.images === 1 ? '' : 's'}`);
    if (m.videos) bits.push(`${m.videos} video${m.videos === 1 ? '' : 's'}`);
    return bits.join(' · ');
}

function _monthHeaderHtml(mk) {
    return `<div class="ps-month" data-mk="${mk}">
        <span class="ps-month-label">${_escHtml(_monthLabelOf(mk))}</span>
        <span class="ps-month-count" data-testid="ps-month-count-${mk}">${_monthCountText(_monthMeta[mk])}</span>
        <span class="ps-day-line"></span>
    </div>`;
}

// ── Day grouping (grid view, date sort) ──────────────────────────────────────
// Synology Photos groups the library by day ("Today", "Yesterday", dates) —
// the month headers stay for the timeline mode.
function _showDateHeaders() {
    const sort = _psViewMode === 'timeline' ? 'date_desc' : (_cfg.options.sort || 'date_desc');
    return sort === 'date_desc' || sort === 'date_asc';
}

function _dateKeyOf(it) {
    const ts = it.taken || it.modified;
    if (!ts) return '';
    const d = new Date(Number(ts) * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function _dayLabelOf(dk) {
    const d = new Date(dk + 'T12:00:00');
    if (isNaN(d.getTime())) return dk;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const that = new Date(d); that.setHours(0, 0, 0, 0);
    const diff = Math.round((today - that) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff === -1) return 'Tomorrow';
    return d.toLocaleDateString(undefined, {
        weekday: 'long', day: 'numeric', month: 'long',
        year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric',
    });
}

function _dayHeaderHtml(dk) {
    return `<div class="ps-day-header" data-day="${dk}">
        <span class="ps-day-title">${_escHtml(_dayLabelOf(dk))}</span>
        <span class="ps-day-line"></span>
    </div>`;
}

async function _loadMonthsMeta() {
    if (_fmCollection) return; // File Manager collection — no index-backed counts
    const myGen = _gen;
    const params = _viewParams();
    params.delete('sort'); params.delete('offset'); params.delete('limit');
    params.delete('day');
    try {
        const r = await apiFetch(`/api/gallery/months?${params.toString()}`);
        if (!r.ok || myGen !== _gen) return; // view changed while loading
        const d = await r.json();
        const meta = {};
        for (const m of d.months || []) meta[m.month] = m;
        _monthMeta = meta;
        // Patch counts on headers already rendered.
        const grid = document.getElementById('ps-grid');
        if (!grid) return;
        for (const hdr of grid.querySelectorAll('.ps-month')) {
            const mk = hdr.dataset.mk;
            const m = meta[mk];
            if (!m) continue;
            const lbl = hdr.querySelector('.ps-month-label');
            if (lbl) lbl.textContent = _monthLabelOf(mk);
            const cnt = hdr.querySelector('.ps-month-count');
            if (cnt) cnt.textContent = _monthCountText(m);
        }
    } catch (e) { /* counts are optional */ }
}

function _psSetViewMode(mode) {
    if (_psViewMode === mode || !_active()) return;
    _psViewMode = mode;
    const sel = document.querySelector('[data-testid="ps-sort"]');
    if (sel) {
        sel.disabled = mode === 'timeline';
        sel.value = mode === 'timeline' ? 'date_desc' : (_cfg.options.sort || 'date_desc');
    }
    for (const [id, on] of [['ps-view-grid', mode === 'grid'], ['ps-view-timeline', mode === 'timeline']]) {
        const b = document.querySelector(`[data-testid="${id}"]`);
        if (b) b.classList.toggle('on', on);
    }
    _reloadView();
}

// ── Moments (curated home: stats + highlights + month timeline) ────────────────

function _psNavMoments() {
    if (_momentsView && !_query) return;
    _momentsView = true;
    _calendarView = false; _calDay = null;
    _favView = false;
    _albumView = null;
    _cameraView = null;
    _privateView = false;
    _currentFolder = '';
    _query = '';
    const si = document.getElementById('ps-search-input');
    if (si) si.value = '';
    _renderShell();
}

// ── Calendar view (P0.6) ─────────────────────────────────────────────────────

function _calCurrentMonth() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function _psNavFavorites() {
    if (_favView && !_query) return;
    _favView = true;
    _albumView = null;
    _cameraView = null;
    _privateView = false;
    _momentsView = false;
    _calendarView = false; _calDay = null;
    _currentFolder = '';
    _query = '';
    const si = document.getElementById('ps-search-input');
    if (si) si.value = '';
    _renderShell();
}

function _psNavAlbum(id) {
    if (_albumView === id && !_query) return;
    _albumView = id;
    _cameraView = null;
    _privateView = false;
    _momentsView = false;
    _calendarView = false; _calDay = null;
    _favView = false;
    _currentFolder = '';
    _query = '';
    const si = document.getElementById('ps-search-input');
    if (si) si.value = '';
    _renderShell();
}

async function _psNavCalendar() {
    if (_calendarView && !_query) return;
    _favView = false;
    _albumView = null;
    _cameraView = null;
    _calendarView = true;
    _privateView = false;
    _momentsView = false;
    _currentFolder = '';
    _calDay = null;
    _calMonth = _calCurrentMonth();
    _calDays = [];
    _query = '';
    const si = document.getElementById('ps-search-input');
    if (si) si.value = '';
    _renderShell();
    // Opening the calendar on an empty current month (library's newest photo
    // may be months/years old) looks broken — jump to the latest month that
    // actually has media.
    await _calPickDefaultMonth();
}

async function _calPickDefaultMonth() {
    if (!_calendarView) return;
    const params = _viewParams();
    params.delete('sort'); params.delete('day'); params.delete('offset'); params.delete('limit');
    try {
        const r = await apiFetch(`/api/gallery/months?${params.toString()}`);
        if (!r.ok || !_active() || !_calendarView) return;
        const months = (await r.json()).months || [];
        const newest = months[0]?.month;
        const currentHasMedia = months.some(m => m.month === _calMonth);
        if (newest && !currentHasMedia && newest !== _calMonth) {
            _calMonth = newest;
            await _loadCalendar();
        }
    } catch (e) { /* calendar still usable with the current month */ }
}

// ── Albums (P0.8): named collections of library items ───────────────────────

async function _loadAlbums() {
    try {
        const r = await apiFetch('/api/gallery/albums');
        if (!r.ok || !_active()) return;
        const d = await r.json();
        _albums = d.albums || [];
    } catch (e) { /* keep the previous list */ }
}

async function _psAlbumCreate() {
    const name = await window.showPrompt('New Album', 'Name for the new album:');
    if (!name || !String(name).trim()) return;
    const d = await apiFetch('/api/gallery/albums', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }).then(r => r.json()).catch(() => null);
    if (!d || !d.ok) return;
    await _loadAlbums();
    _renderSidebar();
}

async function _psAlbumDelete(id, e) {
    if (e && e.stopPropagation) e.stopPropagation();
    const a = _albums.find(x => x.id === id);
    if (!a) return;
    const ok = await window.showModalConfirm('Delete Album', `Delete album "${a.name}"?\nItems stay on disk and in your library.`);
    if (!ok) return;
    const d = await apiFetch(`/api/gallery/albums/${id}`, { method: 'DELETE' }).then(r => r.json()).catch(() => null);
    if (!d || !d.ok) return;
    const wasViewing = _albumView === id;
    if (wasViewing) _albumView = null;
    await _loadAlbums();
    if (wasViewing) _renderShell(); else _renderSidebar();
}

function _psAddToAlbumModal() {
    const paths = [..._selected];
    if (!paths.length) return;
    document.getElementById('ps-album-modal')?.remove();
    const rows = _albums.map(a => `
        <div data-testid="ps-album-pick-${a.id}" onclick="_psAlbumPick(${_jsArg(a.id)})" style="display:flex;align-items:center;gap:8px;padding:9px 12px;border-radius:8px;cursor:pointer;font-size:13.5px;color: var(--text-1);">
            <span>${_svg('folder', 'width:14px;height:14px;color:var(--text-3);')}</span><span style="flex:1;">${_escHtml(a.name)}</span><span style="font-size:11px;color: var(--text-3);">${a.count}</span></div>`).join('');
    const m = document.createElement('div');
    m.id = 'ps-album-modal';
    m.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;';
    m.innerHTML = `
        <div style="background:var(--surface-1);border:1px solid var(--border);border-radius:14px;width:min(380px,92vw);max-height:70vh;display:flex;flex-direction:column;padding:16px;">
            <div style="font-size:14.5px;font-weight:700;color: var(--text-1);margin-bottom:4px;">Add to album</div>
            <div style="font-size:12px;color: var(--text-3);margin-bottom:10px;">${paths.length} item${paths.length === 1 ? '' : 's'} selected</div>
            <div style="overflow-y:auto;display:flex;flex-direction:column;gap:2px;margin-bottom:10px;">
                ${rows || '<div style="padding:8px;font-size:13px;color: var(--text-3);">No albums yet — create one below.</div>'}
            </div>
            <div style="display:flex;gap:8px;">
                <button data-testid="ps-album-modal-new" onclick="_psAlbumCreateFromModal()" style="flex:1;background:rgba(59,130,246,.15);border:1px solid rgba(59,130,246,.5);color:#60a5fa;font-size:13px;padding:8px;border-radius:8px;cursor:pointer;">＋ New album</button>
                <button onclick="document.getElementById('ps-album-modal').remove()" style="background:var(--surface-1);border:1px solid var(--border);color: var(--text-2);font-size:13px;padding:8px 14px;border-radius:8px;cursor:pointer;">Cancel</button>
            </div>
        </div>`;
    document.body.appendChild(m);
}

async function _psAlbumPick(id) {
    const paths = [..._selected];
    const d = await apiFetch(`/api/gallery/albums/${id}/add`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paths }) }).then(r => r.json()).catch(() => null);
    document.getElementById('ps-album-modal')?.remove();
    if (!d || !d.ok) return;
    await _loadAlbums();
    _renderSidebar();
}

async function _psAlbumCreateFromModal() {
    const name = await window.showPrompt('New Album', 'Name for the new album:');
    if (!name || !String(name).trim()) return;
    const d = await apiFetch('/api/gallery/albums', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }).then(r => r.json()).catch(() => null);
    if (!d || !d.ok) return;
    // add the selection straight into the fresh album
    const paths = [..._selected];
    await apiFetch(`/api/gallery/albums/${d.album.id}/add`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paths }) }).then(r => r.json()).catch(() => null);
    document.getElementById('ps-album-modal')?.remove();
    await _loadAlbums();
    _renderSidebar();
}

async function _psRemoveFromAlbum() {
    const paths = [..._selected];
    if (!_albumView || !paths.length) return;
    const d = await apiFetch(`/api/gallery/albums/${_albumView}/remove`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paths }) }).then(r => r.json()).catch(() => null);
    if (!d || !d.ok) return;
    _selected.clear();
    await _loadAlbums();
    _renderSidebar();
    _reloadView();   // items leave the grid
}

function _psCalShift(delta) {
    let [y, m] = _calMonth.split('-').map(Number);
    m += delta;
    while (m < 1) { m += 12; y--; }
    while (m > 12) { m -= 12; y++; }
    _calMonth = `${y}-${String(m).padStart(2, '0')}`;
    _calDay = null;
    _loadCalendar();
}

function _psCalPickDay(dateStr) {
    if (_calDay === dateStr) return;
    _calDay = dateStr;
    _reloadView();
    _renderCalendarPanel();   // re-render from cache to show the selection ring
}

function _psCalClearDay() {
    _calDay = null;
    _reloadView();
    _renderCalendarPanel();
}

async function _loadCalendar() {
    const host = document.getElementById('ps-cal-host');
    if (!host || !_calendarView) return;
    host.innerHTML = '<div class="ps-loading"><span class="ps-spinner"></span><span>Loading calendar…</span></div>';
    const month = _calMonth;
    const params = _viewParams({ month });
    params.delete('sort'); params.delete('day');
    try {
        const r = await apiFetch(`/api/gallery/calendar?${params.toString()}`);
        if (!r.ok || !_active() || month !== _calMonth || !_calendarView) return;
        const d = await r.json();
        _calDays = d.days || [];
        _renderCalendarPanel();
    } catch (e) {
        host.innerHTML = `<div class="ps-empty"><span class="ps-empty-ic">${_svg('calendar')}</span><b>Could not load calendar</b><span>${_escHtml(e.message)}</span></div>`;
    }
}

function _calMonthLabel() {
    const [y, m] = _calMonth.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function _renderCalendarPanel() {
    const host = document.getElementById('ps-cal-host');
    if (!host || !_calendarView) return;
    const byDate = {};
    for (const d of _calDays) byDate[d.date] = d;
    const [y, m] = _calMonth.split('-').map(Number);
    const firstDow = (new Date(y, m - 1, 1).getDay() + 6) % 7;   // Monday-first grid
    const daysInMonth = new Date(y, m, 0).getDate();
    let cells = '';
    for (let i = 0; i < firstDow; i++) cells += '<div class="ps-cal-empty"></div>';
    for (let dnum = 1; dnum <= daysInMonth; dnum++) {
        const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(dnum).padStart(2, '0')}`;
        const dd = byDate[dateStr];
        const has = !!(dd && dd.count > 0);
        const sel = _calDay === dateStr;
        const s0 = has && dd.samples && dd.samples[0] ? dd.samples[0] : null;
        const bg = s0
            ? `<img class="ps-cal-bg" src="${_thumbUrl({ path: s0.path, name: s0.name, type: s0.type, private: s0.private }, 200)}" alt="" loading="lazy">`
            : '';
        cells += `<div class="ps-cal-day${has ? ' has' : ''}${sel ? ' sel' : ''}" data-testid="ps-cal-day-${dnum}" onclick="${has ? `_psCalPickDay(${_jsArg(dateStr)})` : ''}" title="${dateStr}${dd ? ` — ${dd.count} item${dd.count === 1 ? '' : 's'}` : ''}">
            ${bg}
            <span class="ps-cal-num">${dnum}</span>
            ${dd ? `<span class="ps-cal-count" data-testid="ps-cal-count-${dnum}">${dd.count}</span>` : ''}
        </div>`;
    }
    host.innerHTML = `
        <div class="ps-cal-card" data-testid="ps-cal-panel">
            <div class="ps-cal-head">
                <span class="ps-cal-month" data-testid="ps-cal-label">${_calMonthLabel()}</span>
                <div class="ps-cal-nav">
                    <button class="ps-cal-navbtn" data-testid="ps-cal-prev" onclick="_psCalShift(-1)" title="Previous month">${_svg('chevronLeft')}</button>
                    <button class="ps-cal-navbtn" data-testid="ps-cal-next" onclick="_psCalShift(1)" title="Next month">${_svg('chevronRight')}</button>
                </div>
            </div>
            <div class="ps-cal-week">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(w => `<span>${w}</span>`).join('')}</div>
            <div class="ps-cal-grid">${cells}</div>
        </div>
        ${_calDay ? `<div class="ps-cal-quickbar">
            <button class="ps-cal-qbtn" data-testid="ps-cal-day-prev" onclick="_psCalShiftDay(-1)" title="Previous day">${_svg('chevronLeft')}</button>
            <button class="ps-cal-daychip" data-testid="ps-cal-daychip" onclick="_psCalClearDay()" title="Show the whole month again">${_svg('calendar')}<span>${_escHtml(_fmtDate(Date.parse(_calDay + 'T12:00:00') / 1000))}</span><span style="color:var(--text-3);">· that day only</span>${_svg('close')}</button>
            <button class="ps-cal-qbtn" data-testid="ps-cal-day-next" onclick="_psCalShiftDay(1)" title="Next day">${_svg('chevronRight')}</button>
        </div>` : ''}`;
    const grid = document.getElementById('ps-grid');
    if (grid && !_calDay) {
        grid.innerHTML = `<div class="ps-empty" data-testid="ps-cal-hint"><span class="ps-empty-ic">${_svg('calendar')}</span><b>Pick a day</b><span>Days with photos are highlighted on the calendar.</span></div>`;
    }
}

function _momentsCell() {
    return GRID_SIZES[_cfg.options.grid_size || 'medium'] || 140;
}

function _momentsMonthCardHtml(m) {
    const samples = (m.samples || []).slice(0, 4);
    const imgs = samples.map(s => `<img src="${_thumbUrl(s, 200)}" alt="" loading="lazy" onerror="_psThumbError(this)">`).join('');
    return `<button class="ps-month-card" data-testid="ps-moments-month-${m.month}" onclick="_momentsToggleMonth('${m.month}')" title="${_escAttr(m.label)} — ${m.count} items">
        <span class="ps-month-mosaic">${imgs}</span>
        <span class="ps-month-meta"><span class="ps-month-name">${_escHtml(m.label)}</span><span class="ps-month-total">${m.count} items</span></span>
    </button>`;
}

async function _loadMoments() {
    if (!_active()) return;
    const scroll = document.getElementById('ps-grid-scroll');
    if (!scroll) return;

    let host = document.getElementById('ps-moments');
    if (!host) {
        host = document.createElement('div');
        host.id = 'ps-moments';
        const sentinel = document.getElementById('ps-sentinel');
        scroll.insertBefore(host, sentinel || null);
    }
    host.innerHTML = '<div class="ps-loading"><span class="ps-spinner"></span><span>Loading Moments…</span></div>';

    // Lightbox list is rebuilt from the curated data below; keep paging inert.
    _items = []; _offset = 0; _total = 0;
    const cell = _momentsCell();
    try {
        const [stats, hl, tl] = await Promise.all([
            apiFetch('/api/moments/stats').then(r => r.ok ? r.json() : null),
            apiFetch('/api/moments/highlights?limit=24').then(r => r.ok ? r.json() : null),
            apiFetch('/api/moments/timeline?per_month=4').then(r => r.ok ? r.json() : null),
        ]);
        if (!_active()) return;
        _momentsTotal = stats ? (stats.total || 0) : 0;

        const highlights = (hl && hl.highlights) || [];
        const months = (tl && tl.months) || [];
        _momentsHighlights = highlights;
        _items = [...highlights];   // lightbox navigates the curated list (+ expanded month)

        let html = '';
        if (stats) {
            html += `<section class="ps-hero" data-testid="ps-moments-stats">
                <div>
                    <div class="ps-hero-kicker">Your library</div>
                    <div class="ps-hero-title">${stats.total || 0} memories</div>
                    <div class="ps-hero-sub">${stats.images || 0} photos · ${stats.videos || 0} videos · ${_fmtSize(stats.total_size || 0)} · ${stats.folders || 0} folders</div>
                </div>
                <div class="ps-hero-stats">
                    <div class="ps-hero-stat"><b>${stats.images || 0}</b><span>Photos</span></div>
                    <div class="ps-hero-stat"><b>${stats.videos || 0}</b><span>Videos</span></div>
                    <div class="ps-hero-stat"><b>${stats.folders || 0}</b><span>Folders</span></div>
                </div>
            </section>`;
        }

        html += `<section class="ps-section">
            <div class="ps-section-head"><h3 data-testid="ps-moments-hl-title">Highlights</h3><span>Rediscover your best shots</span></div>
            ${highlights.length ? `<div data-testid="ps-moments-highlights" class="ps-grid" style="padding:0;grid-template-columns:${_gridCols(cell)};">${highlights.map((it, i) => _tileHtml(it, i)).join('')}</div>` : `<div class="ps-empty"><span class="ps-empty-ic">${_svg('sparkles')}</span><b>No media yet</b><span>Add a folder to start building your library.</span></div>`}
        </section>`;

        html += `<section class="ps-section">
            <div class="ps-section-head"><h3>Timeline</h3><span>Browse by month</span></div>
            ${months.length ? `<div class="ps-months" data-testid="ps-moments-months">${months.map(_momentsMonthCardHtml).join('')}</div>` : ''}
            <div id="ps-moments-expanded"></div>
        </section>`;

        host.innerHTML = html;
        const st = document.querySelector('[data-testid="ps-status"]');
        if (st) st.textContent = `${_momentsTotal} items`;
    } catch (e) {
        host.innerHTML = `<div class="ps-empty"><span class="ps-empty-ic">${_svg('image')}</span><b>Could not load Moments</b><span>${_escHtml(e.message)}</span></div>`;
    }
}

async function _momentsToggleMonth(mk) {
    const box = document.getElementById('ps-moments-expanded');
    if (!box) return;
    if (_momentsExpanded === mk) {   // collapse
        _momentsExpanded = null;
        box.innerHTML = '';
        _items = [..._momentsHighlights];
        return;
    }
    _momentsExpanded = mk;
    box.innerHTML = '<div class="ps-loading"><span class="ps-spinner"></span><span>Loading month…</span></div>';
    try {
        const r = await apiFetch(`/api/moments/month?month=${encodeURIComponent(mk)}&limit=120`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        if (!_active()) return;
        const hlCount = _momentsHighlights.length;
        _items = [..._momentsHighlights, ...d.items];
        box.innerHTML = `<div class="ps-section-head" style="margin:4px 0 2px;">
            <h3>${_escHtml(d.label)}</h3>
            <span>${d.count} items${d.items.length < d.count ? ` (showing ${d.items.length})` : ''}</span></div>
        <div data-testid="ps-moments-month-items" class="ps-grid" style="padding:0;grid-template-columns:${_gridCols(_momentsCell())};">
            ${d.items.map((it, i) => _tileHtml(it, hlCount + i)).join('')}</div>`;
    } catch (e) {
        box.innerHTML = `<div class="ps-empty"><span class="ps-empty-ic">${_svg('image')}</span><b>Could not load month</b><span>${_escHtml(e.message)}</span></div>`;
    }
}

function _tileHtml(it, i) {
    const video = _isVideo(it);
    const thumb = Math.min(720, Math.round(_cellPx() * 1.8));
    const dur = _durationOf(it);
    const durTxt = video && dur != null ? _fmtDuration(dur) : '';
    const meta = [_fmtDate(it.taken || it.modified), it.size != null ? _fmtSize(it.size) : ''].filter(Boolean).join(' · ');
    return `<figure class="ps-tile" tabindex="-1" data-testid="ps-item-${i}" data-path="${_escAttr(it.path)}" onclick="_tileClick(${i}, event)" title="${_escAttr(it.name)}${durTxt ? ' — ' + durTxt : ''}">
        <img class="ps-tile-img" src="${_thumbUrl(it, thumb)}" alt="" loading="lazy" decoding="async" onerror="_psThumbError(this)">
        <span class="ps-tile-shade"></span>
        ${video ? `<span class="ps-tile-badge" title="Video${durTxt ? ' — ' + durTxt : ''}">${_svg('play')}<span>${durTxt || 'Video'}</span></span>` : ''}
        <figcaption class="ps-tile-info">
            <span class="ps-tile-name">${_escHtml(it.name)}</span>
            ${meta ? `<span class="ps-tile-meta">${_escHtml(meta)}</span>` : ''}
        </figcaption>
        <span class="ps-tile-check" title="Select"></span>
        <button class="ps-fav${it.favorite ? ' on' : ''}" data-testid="ps-fav-${i}" onclick="_favToggle(${i}, event)" title="${it.favorite ? 'Remove from Favorites' : 'Add to Favorites'}">${_svg('star')}</button>
    </figure>`;
}

function _appendTiles(from) {
    const grid = document.getElementById('ps-grid');
    if (!grid) return;
    grid.querySelector('[data-testid="ps-loading"]')?.remove();
    if (from === 0) { _lastMonthKey = null; _lastDayKey = null; }   // full re-render → groups restart
    const dateHeaders = _psViewMode !== 'timeline' && _showDateHeaders();
    let html = '';
    for (let i = from; i < _items.length; i++) {
        const it = _items[i];
        if (_psViewMode === 'timeline') {
            const mk = _monthKeyOf(it);
            if (mk && mk !== _lastMonthKey) {
                _lastMonthKey = mk;
                html += _monthHeaderHtml(mk);
            } else if (!mk) {
                _lastMonthKey = null; // undated item — next dated one starts a new group
            }
        } else if (dateHeaders) {
            const dk = _dateKeyOf(it);
            if (dk && dk !== _lastDayKey) {
                _lastDayKey = dk;
                html += _dayHeaderHtml(dk);
            } else if (!dk) {
                _lastDayKey = null;
            }
        }
        html += _tileHtml(it, i);
    }
    if (html) {
        grid.insertAdjacentHTML('beforeend', html);
        _ensureGridTabStop();   // roving focus: keep exactly one tab stop in the grid
    }
}

function _psThumbError(img) {
    // Video thumbs return 202 (queued) while ffmpeg is busy → retry, else placeholder.
    const src = img.src || '';
    if (src.includes('/video-thumbnail') || src.includes('/private-thumb')) {
        const n = Number(img.dataset.retries || 0);
        if (n < 8) {
            img.dataset.retries = String(n + 1);
            setTimeout(() => { if (img.isConnected) img.src = src; }, 3000);
            return;
        }
    }
    const tile = img.closest('.ps-tile');
    if (tile) {
        img.remove();
        const video = !!tile.querySelector('span[title*="video"]') || src.includes('video-thumbnail');
        tile.insertAdjacentHTML('afterbegin', `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:30px;">${video ? '🎬' : '🖼️'}</div>`);
    }
}

function _setupObserver() {
    const sentinel = document.getElementById('ps-sentinel');
    const scroller = document.getElementById('ps-grid-scroll');
    if (!sentinel || !scroller) return;
    if (_observer) _observer.disconnect();
    _observer = new IntersectionObserver((entries) => {
        if (entries.some(e => e.isIntersecting)) _loadMore();
    }, { root: scroller, rootMargin: '400px 0px' });
    _observer.observe(sentinel);
}

async function _loadMore() {
    if (_loadingPage || _offset >= _total) return;
    const gen = _gen;
    const start = _items.length;
    await _fetchPage(false);
    if (gen !== _gen) return;   // a navigation happened while the page was in flight
    if (start < _items.length) _appendTiles(start);
    _updateLoadMore();
    _updateStatus();
}

// Explicit affordance for touch devices / when the IntersectionObserver sentinel
// is missed — the grid pages in 90 items at a time.
async function _psLoadMore() {
    const btn = document.querySelector('[data-testid="ps-loadmore-btn"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }
    await _loadMore();
    if (btn) btn.disabled = false;
    _updateLoadMore();
}

function _updateLoadMore() {
    const box = document.getElementById('ps-loadmore');
    if (!box) return;
    const more = _items.length > 0 && !_momentsView
        && !(_calendarView && !_calDay) && _offset < _total;
    box.style.display = more ? 'block' : 'none';
    const btn = box.querySelector('button');
    if (btn && more) { btn.disabled = false; btn.textContent = `Load more (${_items.length} of ${_total})`; }
}

// ── Multi-select + bulk delete ───────────────────────────────────────────────

function _tileClick(i, e) {
    const it = _items[i];
    if (!it) return;
    if (_selectMode || (e && (e.ctrlKey || e.metaKey))) {
        _toggleSelectItem(i, e);
    } else {
        _lbOpen(i);
    }
}

function _toggleSelectItem(i, e) {
    const it = _items[i];
    if (!it) return;
    if (e && e.shiftKey && _lastSelIdx >= 0 && _lastSelIdx !== i) {
        // Range select from the anchor tile to this one.
        const [a, b] = [_lastSelIdx, i].sort((x, y) => x - y);
        for (let k = a; k <= b; k++) if (_items[k]) _selected.add(_items[k].path);
    } else {
        const p = it.path;
        if (_selected.has(p)) _selected.delete(p); else _selected.add(p);
        _lastSelIdx = i;
    }
    _updateTileSelection();
    _updateActionBar();
}

function _psToggleSelectMode() {
    _selectMode = !_selectMode;
    const btn = document.querySelector('[data-testid="ps-select-btn"]');
    if (btn) {
        btn.classList.toggle('on', _selectMode);
        const label = btn.querySelector('span');
        if (label) label.textContent = _selectMode ? 'Selecting' : 'Select';
    }
    _updateTileSelection();
}

function _psClearSelection() {
    _selected.clear();
    _lastSelIdx = -1;
    _updateTileSelection();
    _updateActionBar();
}

// Refresh check badges / selection rings on all rendered tiles.
function _updateTileSelection() {
    const grid = document.getElementById('ps-grid');
    if (!grid) return;
    grid.classList.toggle('ps-select-mode', _selectMode);
    for (const el of grid.children) {
        if (el.dataset && el.dataset.path != null) {
            el.classList.toggle('selected', _selected.has(el.dataset.path));
        }
    }
}

function _updateActionBar() {
    const bar = document.getElementById('ps-actionbar');
    if (!bar) return;
    const n = _selected.size;
    bar.style.display = n ? 'flex' : 'none';
    const cnt = document.querySelector('[data-testid="ps-actionbar-count"]');
    if (cnt) cnt.textContent = `${n} selected`;
}

// Bulk delete: move all selected items to the shared trash.
async function _psDeleteSelected() {
    const paths = [..._selected];
    if (!paths.length) return;
    const ok = await _ctx.modal.confirm(
        'Move to trash',
        `Move ${paths.length} item${paths.length === 1 ? '' : 's'} to the trash?\nYou can restore them later from File Manager → Trash.`,
    );
    if (!ok) return;
    const task = _ctx.progress?.startTask
        ? _ctx.progress.startTask({
            appId: 'pkg-ethos-photos',
            title: `Moving ${paths.length} item${paths.length === 1 ? '' : 's'} to trash`,
            total: paths.length,
            detail: 'Trash…',
            testIdPrefix: 'ps-trash',
        })
        : null;
    let removedCount = 0, failedCount = 0, firstErr = '';
    for (let i = 0; i < paths.length; i += 500) {   // backend caps one call at 500 paths
        const chunk = paths.slice(i, i + 500);
        try {
            const r = await apiFetch('/api/gallery/trash', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paths: chunk }),
            });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const d = await r.json();
            const failed = (d.failed || []).length;
            removedCount += chunk.length - failed;
            failedCount += failed;
            if (failed && !firstErr) firstErr = d.failed[0].error;
        } catch (e) {
            failedCount += chunk.length;
            if (!firstErr) firstErr = e.message;
        }
        task?.update({
            index: Math.min(paths.length, i + chunk.length),
            percent: Math.round((Math.min(paths.length, i + chunk.length) / paths.length) * 100),
        });
    }
    task?.finish(failedCount ? 'failed' : 'done', {
        percent: 100,
        detail: failedCount ? `${removedCount} moved, ${failedCount} failed: ${firstErr}` : `${removedCount} moved to trash`,
    });
    _selected.clear();
    _lastSelIdx = -1;
    if (_fmCollection) {   // keep the File Manager lightbox collection in sync
        const gone = new Set(paths);
        _fmCollection.files = _fmCollection.files.filter(f => !gone.has(f.path));
    }
    await _reloadView();   // re-fetch the grid so it matches disk
    _renderSidebar();      // counts/albums changed
    if (window.addNotification) {
        if (removedCount && !failedCount) window.addNotification(`Moved ${removedCount} item${removedCount === 1 ? '' : 's'} to trash`, 'success');
        else if (removedCount) window.addNotification(`Moved ${removedCount}, failed ${failedCount}: ${firstErr}`, 'error');
        else window.addNotification('Delete failed: ' + firstErr, 'error');
    }
}

// Keep sidebar counts accurate after a privacy toggle without re-fetching:
// delta = +1 per item moved into Private (−1 when made public).
function _bumpPrivacyCounts(delta) {
    if (!delta) return;
    if (_counts.all != null) _counts.all = Math.max(0, _counts.all - delta);
    if (_counts.private != null) _counts.private = Math.max(0, _counts.private + delta);
    const allEl = document.querySelector('[data-testid="ps-nav-all"] .ps-nav-count');
    const privEl = document.querySelector('[data-testid="ps-nav-private"] .ps-nav-count');
    if (allEl) allEl.textContent = _counts.all;
    if (privEl) privEl.textContent = _counts.private;
}

// Bulk privacy toggle: move selected items to/from the Private section.
// Files stay on disk — only the index flag changes, so "Make Public" is
// always lossless and instant.
async function _psTogglePrivateSelected() {
    const paths = [..._selected];
    if (!paths.length) return;
    const makePrivate = !_privateView;   // normal view → hide them; Private section → unhide
    let updatedCount = 0, failedCount = 0, firstErr = '';
    for (let i = 0; i < paths.length; i += 500) {   // backend caps one call at 500 paths
        const chunk = paths.slice(i, i + 500);
        try {
            let r = await _psPrivateRequest(chunk, makePrivate);
            if (!r.ok && (r.status === 403 || r.status === 409)) {
                // No PIN set yet / no active Private session → prompt once, retry.
                const ok = await _psEnsureSession();
                if (ok) r = await _psPrivateRequest(chunk, makePrivate);
            }
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const d = await r.json();
            updatedCount += d.updated || 0;
            failedCount += (d.failed || []).length;
            if ((d.failed || []).length && !firstErr) firstErr = d.failed[0].error;
        } catch (e) {
            failedCount += chunk.length;
            if (!firstErr) firstErr = e.message;
        }
    }
    _selected.clear();
    _lastSelIdx = -1;
    await _reloadView();   // items move between the normal and private scopes
    _bumpPrivacyCounts(makePrivate ? updatedCount : -updatedCount);
    _renderSidebar();      // folder counts change as well
    if (window.addNotification) {
        const verb = makePrivate ? 'moved to Private' : 'made public';
        if (updatedCount && !failedCount) window.addNotification(`${updatedCount} item${updatedCount === 1 ? '' : 's'} ${verb}`, 'success');
        else if (updatedCount) window.addNotification(`${updatedCount} ${verb}, failed ${failedCount}: ${firstErr}`, 'error');
        else window.addNotification('Failed to update privacy: ' + firstErr, 'error');
    }
}

// ── Status / search / sort / options ──────────────────────────────────────────

async function _updateStatus() {
    const el = document.querySelector('[data-testid="ps-status"]');
    if (!el) return;
    try {
        const r = await apiFetch('/api/gallery/rescan-status');
        if (!r.ok) return;
        const d = await r.json();
        // The Private count is available without unlocking the PIN (it is just
        // a number — the items themselves stay session-gated).
        if (typeof d.private_items === 'number') {
            _counts.private = d.private_items;
            const privEl = document.querySelector('[data-testid="ps-nav-private"] .ps-nav-count');
            if (privEl) privEl.textContent = d.private_items;
        }
        const shownTotal = _momentsView ? (_momentsTotal || d.items || 0) : (_total || d.items || 0);
        if (d.scanning) el.textContent = `Indexing… ${d.items} items`;
        else if (_momentsView) el.textContent = `${shownTotal} items`;
        else if (_calendarView && !_calDay) el.textContent = `${_calDays.length} day${_calDays.length === 1 ? '' : 's'}`;
        else el.textContent = `${_items.length} / ${_total || 0} items`;
        // A rescan finishing (Add folder / Rescan now / restored from trash)
        // must refresh the grid and the sidebar counts — silence here made the
        // app look stuck on an empty library until it was reopened.
        const scanning = !!d.scanning;
        if (_wasScanning && !scanning && _active()) {
            _wasScanning = false;
            if (_momentsView) _loadMoments(); else _reloadView();
            _renderSidebar();
            return;
        }
        _wasScanning = scanning;
    } catch (e) { /* non-fatal */ }
}

async function _refreshPrivateCount() {
    if (_psToken) return _countFor('', 'private', 'private');
    try {
        const r = await apiFetch('/api/gallery/rescan-status');
        if (!r.ok) return;
        const d = await r.json();
        if (typeof d.private_items === 'number') _counts.private = d.private_items;
    } catch (e) { /* non-fatal */ }
}

function _startStatusPolling() {
    if (_statusTimer) { _statusTimer(); _statusTimer = null; }
    // `_statusTimer` is the shared poller's stop() handle (core/poller.js).
    _statusTimer = poll(_updateStatus, 5000,
                        { appId: 'gallery', immediate: false, name: 'gallery-status' });
    _updateStatus();
}

function _psOnSearch(v) {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => {
        _query = (v || '').trim();
        if (!_active()) return;
        if (_calendarView) { _loadCalendar(); return; }   // filter the month panel too
        _reloadView();
    }, 300);
}

function _psClearSearch() {
    _query = '';
    const si = document.getElementById('ps-search-input');
    if (si) si.value = '';
    if (_calendarView) { _loadCalendar(); return; }
    _reloadView();
}

// ── Keyboard navigation (P0.10): roving focus across the grid ───────────────
// One tile carries tabindex=0; arrows/Home/End/PageUp/PageDown move it,
// Enter/Space activate (open lightbox, or toggle selection in select mode).

function _ensureGridTabStop() {
    const grid = document.getElementById('ps-grid');
    if (!grid) return;
    const tiles = grid.querySelectorAll('.ps-tile');
    if (!tiles.length) return;
    let has = false;
    for (const el of tiles) { if (el.getAttribute('tabindex') === '0') { has = true; break; } }
    if (!has) tiles[0].setAttribute('tabindex', '0');
}

function _setGridFocus(i) {
    const grid = document.getElementById('ps-grid');
    if (!grid) return;
    const tile = grid.querySelector(`[data-testid="ps-item-${i}"]`);
    if (!tile) return;
    for (const el of grid.querySelectorAll('.ps-tile')) el.setAttribute('tabindex', '-1');
    tile.setAttribute('tabindex', '0');
    tile.focus();
    tile.scrollIntoView({ block: 'nearest' });
}

function _gridKeyNav(e) {
    const grid = document.getElementById('ps-grid');
    if (!grid) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Enter', ' '];
    if (!keys.includes(e.key)) return;

    let idx = -1;
    const tileEl = t.closest ? t.closest('.ps-tile') : null;
    if (tileEl) {
        const m = (tileEl.getAttribute('data-testid') || '').match(/^ps-item-(\d+)$/);
        if (m) idx = Number(m[1]);
    }

    // Columns from the real layout (grid gap is 6px).
    let cols = 1;
    const firstTile = grid.querySelector('.ps-tile');
    if (firstTile) {
        const w = firstTile.getBoundingClientRect().width;
        if (w > 0) cols = Math.max(1, Math.round((grid.clientWidth + 6) / (w + 6)));
    }

    if (e.key === 'Enter' || e.key === ' ') {
        if (idx >= 0 && _items[idx]) { e.preventDefault(); _tileClick(idx, e); }
        return;
    }
    const maxIdx = _items.length - 1;   // only loaded items are navigable
    let next = idx < 0 ? 0 : idx;
    if (idx >= 0) {
        switch (e.key) {
            case 'ArrowLeft': next = Math.max(0, idx - 1); break;
            case 'ArrowRight': next = Math.min(maxIdx, idx + 1); break;
            case 'ArrowUp': next = Math.max(0, idx - cols); break;
            case 'ArrowDown': next = Math.min(maxIdx, idx + cols); break;
            case 'Home': next = 0; break;
            case 'End': next = maxIdx; break;
            case 'PageUp': next = Math.max(0, idx - cols * 8); break;
            case 'PageDown': next = Math.min(maxIdx, idx + cols * 8); break;
        }
    }
    e.preventDefault();
    _setGridFocus(next);
}

async function _psOnSort(v) {
    _cfg.options.sort = v;
    await _saveConfigPatch({ options: { sort: v } });
    _reloadView();
}

function _psToggleSettings() {
    const pop = document.getElementById('ps-settings-pop');
    if (!pop) return;
    // Keep the popup below the toolbar — it wraps to multiple rows on mobile.
    const tb = document.getElementById('ps-toolbar');
    if (tb) pop.style.top = (tb.offsetHeight + 6) + 'px';
    pop.style.display = pop.style.display === 'none' ? 'flex' : 'none';
}

async function _psOptVideos(checked) {
    await _saveConfigPatch({ options: { include_videos: checked } });
    _reloadView();
}

async function _psOptGridSize(v) {
    await _saveConfigPatch({ options: { grid_size: v } });
    if (_active()) _renderShell();
}

async function _psRescanNow() {
    try {
        const before = await _rescanBaseline();
        await apiFetch('/api/gallery/rescan', { method: 'POST' });
        if (window.addNotification) window.addNotification('Library rescan started', 'success');
        _watchRescan(before);
    } catch (e) {
        if (window.addNotification) window.addNotification('Rescan failed: ' + e.message, 'error');
    }
    _updateStatus();
}

// ════════════════════════════════════════════
// APP: PhotoStation — Folder picker (add to library)
// ════════════════════════════════════════════

async function _psShowPicker() {
    if (!_body) return;
    // Prefer the shared EthOS picker; the in-window browser below stays as a
    // fallback for older cores (it can still add several folders at once).
    if (typeof _ctx.pickFolder === 'function') {
        const picked = await _ctx.pickFolder({
            title: 'Add photo folder',
            startPath: '/home',
            roots: ['/home', '/mnt', '/media'],
            acceptLabel: 'Add folder',
        });
        if (picked) await _psAddFolders([picked]);
        return;
    }
    _pickerPath = '/home';
    _pickerDirs = [];
    _pickerSelected = new Set();
    if (document.getElementById('ps-picker')) document.getElementById('ps-picker').remove();
    _body.style.position = 'relative';
    const el = document.createElement('div');
    el.id = 'ps-picker';
    el.className = 'ps-picker';
    el.setAttribute('data-testid', 'ps-picker');
    el.innerHTML = `
        <div class="ps-picker-head">
            <div class="ps-brand-mark" style="width:32px;height:32px;border-radius:10px;">${_svg('folderPlus')}</div>
            <div>
                <div class="ps-picker-title">Add photo folder</div>
                <div class="ps-picker-sub">Tap to select · double-tap or long-press to open</div>
            </div>
            <button class="ps-picker-close" data-testid="ps-picker-close" onclick="_psHidePicker()" title="Close">${_svg('close')}</button>
        </div>
        <div class="ps-picker-mounts" data-testid="ps-picker-mounts"></div>
        <div class="ps-picker-bc" data-testid="ps-picker-bc"></div>
        <div id="ps-picker-list" class="ps-picker-list"></div>
        <div class="ps-picker-foot">
            <span data-testid="ps-picker-count" style="font-size:12.5px;color:var(--text-2);"></span>
            <div style="display:flex;gap:8px;">
                <button data-testid="ps-picker-cancel" onclick="_psHidePicker()" class="ps-text-btn">Cancel</button>
                <button data-testid="ps-picker-add" onclick="_psAddSelected()" class="ps-primary-btn" style="height:34px;font-size:12.5px;">Add selected</button>
            </div>
        </div>`;
    _body.appendChild(el);
    _psLoadPickerMounts();
    _psLoadPickerDirs();
}

function _psHidePicker() {
    const el = document.getElementById('ps-picker');
    if (el) el.remove();
}

async function _psLoadPickerMounts() {
    const el = document.querySelector('[data-testid="ps-picker-mounts"]');
    if (!el) return;
    const mounts = [{ name: 'Home', path: '/home' }];
    try {
        const r = await apiFetch('/api/gallery/mounts');
        if (r.ok) {
            for (const m of (await r.json()) || []) {
                if (!mounts.some(x => x.path === m.path)) mounts.push(m);
            }
        }
    } catch (e) { /* non-fatal */ }
    el.innerHTML = mounts.map(m =>
        `<button class="ps-chip" data-testid="ps-picker-mount" onclick="_psBrowseTo(${_jsArg(m.path)})">${_svg(m.path === '/home' ? 'folder' : 'grid')}<span>${_escHtml(m.name)}</span></button>`
    ).join('');
}

function _psBrowseTo(path) {
    _pickerPath = path || '/';
    _pickerSelected = new Set();
    _psLoadPickerDirs();
}

function _psRenderPickerBc() {
    const el = document.querySelector('[data-testid="ps-picker-bc"]');
    if (!el) return;
    const parts = _pickerPath.split('/').filter(Boolean);
    let html = `<span onclick="_psBrowseTo(${_jsArg('/')})" style="cursor:pointer;color: var(--text-2);">/</span>`;
    let acc = '';
    for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        acc += '/' + p;
        // The leading "/" already acts as the separator for the first part.
        if (i > 0) html += `<span style="color: var(--text-3);">/</span>`;
        html += `<span onclick="_psBrowseTo(${_jsArg(acc)})" style="cursor:pointer;color:${acc === _pickerPath ? 'var(--text-1)' : 'var(--text-2)'};">${_escHtml(p)}</span>`;
    }
    el.innerHTML = html;
}

async function _psLoadPickerDirs() {
    _psRenderPickerBc();
    const list = document.getElementById('ps-picker-list');
    if (!list) return;
    list.innerHTML = '<div class="ps-loading" style="grid-column:1/-1"><span class="ps-spinner"></span><span>Loading…</span></div>';
    let dirs = [];
    try {
        const r = await apiFetch(`/api/gallery/browse?path=${encodeURIComponent(_pickerPath)}`);
        if (r.ok) dirs = (await r.json()) || [];
    } catch (e) { console.error('PhotoStation browse failed:', e); }
    _pickerDirs = dirs;
    let html = '';
    const parent = _parentPath(_pickerPath);
    if (_pickerPath !== '/' && parent) {
        html += `<div class="ps-pick-card" data-testid="ps-picker-up" onclick="_psBrowseTo(${_jsArg(parent)})"><span class="ps-pick-ic">${_svg('arrowUp')}</span><span class="ps-pick-name">.. (parent)</span></div>`;
    }
    for (let i = 0; i < dirs.length; i++) {
        const sel = _pickerSelected.has(dirs[i].path);
        html += `<div class="ps-pick-card${sel ? ' sel' : ''}" data-testid="ps-picker-dir-${i}" onclick="_psPickerToggle(${i})" ondblclick="_psPickerOpen(${i})" oncontextmenu="_psPickerCtx(${i}, event)">
            <span class="ps-pick-ic">${_svg(sel ? 'checkSquare' : 'folder')}</span>
            <span class="ps-pick-name">${_escHtml(dirs[i].name)}</span></div>`;
    }
    if (!dirs.length) html += '<div class="ps-empty" style="grid-column:1/-1"><span class="ps-empty-ic">' + _svg('folder') + '</span><b>No subfolders</b><span>Pick a parent folder or add this one directly.</span></div>';
    list.innerHTML = html;
    _psUpdatePickerCount();
}

function _psPickerToggle(i) {
    const d = _pickerDirs[i];
    if (!d) return;
    if (_pickerSelected.has(d.path)) _pickerSelected.delete(d.path);
    else _pickerSelected.add(d.path);
    const card = document.querySelector(`[data-testid="ps-picker-dir-${i}"]`);
    if (card) {
        const sel = _pickerSelected.has(d.path);
        card.classList.toggle('sel', sel);
        const icon = card.querySelector('.ps-pick-ic');
        if (icon) icon.innerHTML = _svg(sel ? 'checkSquare' : 'folder');
    }
    _psUpdatePickerCount();
}

function _psPickerOpen(i) {
    const d = _pickerDirs[i];
    if (d) _psBrowseTo(d.path);
}

// Long-press / right-click opens a folder — touch-friendly alternative to double-tap.
function _psPickerCtx(i, e) {
    if (e && e.preventDefault) e.preventDefault();
    _psPickerOpen(i);
}

function _psUpdatePickerCount() {
    const el = document.querySelector('[data-testid="ps-picker-count"]');
    if (el) el.textContent = `${_pickerSelected.size} folder${_pickerSelected.size === 1 ? '' : 's'} selected`;
}

async function _psAddSelected() {
    const paths = [..._pickerSelected];
    if (!paths.length) return;
    await _psAddFolders(paths);
}

async function _psAddFolders(paths) {
    const existing = new Set(_cfg.folders.map(f => f.path));
    const add = paths.filter(p => !existing.has(p)).map(p => ({ path: p }));
    if (!add.length) { _psHidePicker(); return; }
    const ok = await _saveConfigPatch({ folders: [..._cfg.folders, ...add] });
    if (!ok) {
        if (window.addNotification) window.addNotification('Failed to save library folders', 'error');
        return;
    }
    _psHidePicker();
    _counts = {};
    if (window.addNotification) window.addNotification('Folder added — scanning…', 'success');
    _renderShell();
}

// ════════════════════════════════════════════
// APP: PhotoStation — Lightbox viewer (flicker-free)
// The overlay is built once per open. Prev/next only swap the media src and
// update text/strip in place, so the current image stays visible until the
// next one has finished loading (no blank flash). Neighbours are preloaded.
// ════════════════════════════════════════════

const _LB_STRIP_HALF = 24;   // strip thumbs on each side of the active item

function _lbItems() {
    if (_momentsView) return _items;
    return _fmCollection ? _fmCollection.files : _items;
}

function _lbOpen(i) {
    const items = _lbItems();
    if (!items.length || !_body) return;
    i = ((i % items.length) + items.length) % items.length;
    _lightboxIndex = i;
    _lbBuild();
    _lbShow(i);
}

function _lbClose() {
    removeEventListener('keydown', _lbKeyHandler);
    const el = document.getElementById('ps-lightbox');
    if (el) el.remove();
    _lightboxIndex = -1;
    _fmCollection = null;
    _lbThumbEls = {};
    _lbPtr.pts.clear(); _lbPtr.downPt = null; _lbPtr.lastPt = null; _lbPtr.dragMode = null; _lbPtr.pinchStart = null;
    _stopWinWatcher();
}

// The lightbox is a full-viewport overlay on document.body. If its window is
// closed out from under it, close the overlay (and key handler) as well.
let _winWatcher = null;
function _startWinWatcher() {
    if (_winWatcher) return;
    const winEl = _body && _body.closest('.app-window');
    if (!winEl || !winEl.parentNode) return;
    _winWatcher = new MutationObserver(() => {
        if (_lightboxIndex >= 0 && !_active()) _lbClose();
    });
    _winWatcher.observe(winEl.parentNode, { childList: true });
}
function _stopWinWatcher() {
    if (_winWatcher) { _winWatcher.disconnect(); _winWatcher = null; }
}

function _lbPrev() { if (_lightboxIndex > 0) _lbOpen(_lightboxIndex - 1); }
// Next: if the lightbox is at the end of the loaded page, pull the next page
// first so browsing never stops at the initial 60 items.
async function _lbNext() {
    const items = _lbItems();
    if (_lightboxIndex < items.length - 1) { _lbOpen(_lightboxIndex + 1); return; }
    if (_fmCollection || _momentsView || _offset >= _total) return;
    const before = _items.length;
    await _loadMore();
    if (_items.length > before && _lightboxIndex < _items.length - 1) _lbOpen(_lightboxIndex + 1);
}

function _lbKeyHandler(e) {
    if (_lightboxIndex < 0) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (e.key === 'Escape') _lbClose();
    else if (e.key === 'ArrowLeft') _lbPrev();
    else if (e.key === 'ArrowRight') _lbNext()
    else if (e.key === 'Delete') { e.preventDefault(); _lbDeleteCurrent(); }
    else if (e.key.toLowerCase() === 'd') _lbDownloadCurrent()
    else if (e.key.toLowerCase() === 's') _lbShareCurrent()
    else if (e.key.toLowerCase() === 'i') _lbToggleMeta()
    else if (e.key.toLowerCase() === 'f') _lbToggleFavorite()
    else if ((e.key === '+' || e.key === '=') && !_isVideoCurrent()) {
        const box = document.getElementById('ps-lb-media');
        if (box) { const r = box.getBoundingClientRect(); _lbZoomAt(r.left + r.width / 2, r.top + r.height / 2, _lbZoom.scale * 1.4); }
    } else if ((e.key === '-' || e.key === '_') && !_isVideoCurrent()) {
        const box = document.getElementById('ps-lb-media');
        if (box) { const r = box.getBoundingClientRect(); _lbZoomAt(r.left + r.width / 2, r.top + r.height / 2, _lbZoom.scale / 1.4); }
    } else if (e.key === '0') _lbResetZoom(true);
}

function _lbBuild() {
    let el = document.getElementById('ps-lightbox');
    if (el) return;
    // Full-viewport viewer with a blurred copy of the current photo as backdrop.
    el = document.createElement('div');
    el.id = 'ps-lightbox';
    el.setAttribute('data-testid', 'ps-lightbox');
    el.innerHTML = `
        <div id="ps-lb-backdrop"></div>
        <div class="ps-lb-topbar">
            <span class="ps-lb-counter" data-testid="ps-lb-counter">–</span>
            <span class="ps-lb-name" data-testid="ps-lb-name"></span>
            <div class="ps-lb-actions">
                <button class="ps-lb-btn" data-testid="ps-lb-zoom-reset" onclick="_lbResetZoom(true)" title="Reset zoom (0)" style="display:none;">${_svg('zoom')}</button>
                <button class="ps-lb-btn" data-testid="ps-lb-fav" onclick="_lbToggleFavorite()" title="Add to Favorites (f)">${_svg('star')}</button>
                <button class="ps-lb-btn" data-testid="ps-lb-meta-btn" onclick="_lbToggleMeta()" title="Photo info / EXIF (i)">${_svg('info')}</button>
                <button class="ps-lb-btn" data-testid="ps-lb-private" onclick="_lbTogglePrivateCurrent()" title="Make private (hidden from normal views, encrypted on disk)">${_svg('lock')}</button>
                <button class="ps-lb-btn" data-testid="ps-lb-share" onclick="_lbShareCurrent()" title="Create public share link (s)">${_svg('share')}</button>
                <button class="ps-lb-btn" data-testid="ps-lb-download" onclick="_lbDownloadCurrent()" title="Download (d)">${_svg('download')}</button>
                <button class="ps-lb-btn danger" data-testid="ps-lb-delete" onclick="_lbDeleteCurrent()" title="Move to trash (or swipe down)">${_svg('trash')}</button>
                <button class="ps-lb-btn close" data-testid="ps-lb-close" onclick="_lbClose()" title="Close (Esc)">×</button>
            </div>
        </div>
        <div id="ps-lb-media">
            <button class="ps-lb-nav prev" data-testid="ps-lb-prev" onclick="_lbPrev()" title="Previous (←)">${_svg('chevronLeft')}</button>
            <button class="ps-lb-nav next" data-testid="ps-lb-next" onclick="_lbNext()" title="Next (→)">${_svg('chevronRight')}</button>
        </div>
        <div class="ps-lb-foot">
            <div class="ps-lb-info" data-testid="ps-lb-info"></div>
            <div class="ps-lb-strip" id="ps-lb-strip" data-testid="ps-lb-strip"></div>
        </div>
        <div id="ps-lb-meta-panel" class="ps-lb-meta" data-testid="ps-lb-meta-panel" style="display:none;"></div>`;
    document.body.appendChild(el);
    addEventListener('keydown', _lbKeyHandler);   // once per open — prev/next re-enter via _lbOpen
    _startWinWatcher();
    _lbBindMediaPointer(el.querySelector('#ps-lb-media'));
}

// Swipe gestures on the media area (mobile): horizontal → prev/next,
// down → move current item to trash without confirmation.
// ---- Zoom & pan (images only; videos keep native controls) -----------------

function _isVideoCurrent() {
    const it = _lbItems()[_lightboxIndex];
    return !!it && _isVideo(it);
}

// Keep the world point under (px, py) fixed while changing scale.
function _lbZoomAt(px, py, newScale) {
    if (_isVideoCurrent()) return;
    const box = document.getElementById('ps-lb-media');
    const el = box && box.querySelector('img,video');
    if (!el || !(el instanceof HTMLImageElement)) return;
    const st = _lbZoom;
    const s0 = st.scale;
    const s1 = Math.min(8, Math.max(1, newScale));
    if (s1 === s0) return;
    if (!el.offsetWidth || !el.offsetHeight) {   // not loaded yet — zoom around center
        st.scale = s1; _lbApplyTransform(false); return;
    }
    const br = box.getBoundingClientRect();
    const cx = br.left + el.offsetLeft + el.offsetWidth / 2;
    const cy = br.top + el.offsetTop + el.offsetHeight / 2;
    st.x = (px - cx) - (s1 / s0) * (px - cx - st.x);
    st.y = (py - cy) - (s1 / s0) * (py - cy - st.y);
    st.scale = s1;
    if (st.scale <= 1.001) { st.scale = 1; st.x = 0; st.y = 0; }
    _lbClampPan();
    _lbApplyTransform(false);
}

// Never let a zoomed image be dragged fully off-screen.
function _lbClampPan() {
    const st = _lbZoom;
    if (st.scale <= 1) { st.x = 0; st.y = 0; return; }
    const box = document.getElementById('ps-lb-media');
    const el = box && box.querySelector('img,video');
    if (!el || !(el instanceof HTMLImageElement)) return;
    const keep = 80;   // px of image always visible
    const mx = Math.max(0, (el.offsetWidth * st.scale - keep) / 2);
    const my = Math.max(0, (el.offsetHeight * st.scale - keep) / 2);
    st.x = Math.min(mx, Math.max(-mx, st.x));
    st.y = Math.min(my, Math.max(-my, st.y));
}

function _lbApplyTransform(smooth) {
    const box = document.getElementById('ps-lb-media');
    const el = box && box.querySelector('img,video');
    if (!el || !(el instanceof HTMLImageElement)) return;
    const st = _lbZoom;
    el.style.transition = smooth ? 'transform .18s ease-out' : 'none';
    el.style.transform = `translate(${st.x}px, ${st.y}px) scale(${st.scale})`;
    el.style.cursor = st.scale > 1 ? 'grab' : '';
    const zb = document.querySelector('[data-testid="ps-lb-zoom-reset"]');
    if (zb) zb.style.display = st.scale > 1 ? 'grid' : 'none';
}

function _lbResetZoom(smooth) {
    _lbZoom = { scale: 1, x: 0, y: 0 };
    _lbApplyTransform(!!smooth);
}

// Pointer handling: swipe at 1× (legacy), pan when zoomed, pinch to zoom.
// move/up are tracked on document (no setPointerCapture — Chromium drops
// subsequent mouse moves when capture is taken by an ancestor of the target).
const _lbPtr = { pts: new Map(), downPt: null, lastPt: null, dragMode: null, pinchStart: null };
let _lbDocBound = false;

function _lbPtrMove(e) {
    const st = _lbPtr;
    if (!st.pts.has(e.pointerId)) return;
    st.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (st.pinchStart && st.pts.size === 2) {
        const [a, b] = [...st.pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > 0 && st.pinchStart.dist > 0)
            _lbZoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, st.pinchStart.scale * d / st.pinchStart.dist);
    } else if (st.pts.size === 1 && st.dragMode === 'pan') {
        const p = st.pts.get(e.pointerId);
        _lbZoom.x += p.x - st.lastPt.x;
        _lbZoom.y += p.y - st.lastPt.y;
        st.lastPt = { x: p.x, y: p.y };
        _lbClampPan();
        _lbApplyTransform(false);
    }
}

function _lbPtrFinish(e) {
    const st = _lbPtr;
    if (!st.pts.has(e.pointerId)) return;
    st.pts.delete(e.pointerId);
    if (st.pinchStart && st.pts.size < 2) st.pinchStart = null;
    if (st.pts.size === 0) {
        // Legacy swipe decisions, only at 1× zoom.
        if (st.dragMode === 'swipe' && st.downPt && !_isVideoCurrent()) {
            const dx = e.clientX - st.downPt.x, dy = e.clientY - st.downPt.y;
            if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                if (dx < 0) _lbNext(); else _lbPrev();
            } else if (dy > 96 && dy > Math.abs(dx) * 1.5) {
                _lbTrashCurrent();   // swipe-down delete — no confirmation
            }
        }
        st.dragMode = null; st.downPt = null; st.lastPt = null;
    } else if (st.pts.size === 1) {
        const [p] = [...st.pts.values()];
        st.lastPt = { x: p.x, y: p.y };
        st.dragMode = (!_isVideoCurrent() && _lbZoom.scale > 1) ? 'pan' : 'swipe';
    }
}

function _lbBindMediaPointer(area) {
    if (!area || area.dataset.pointerBound) return;
    area.dataset.pointerBound = '1';
    const st = _lbPtr;

    area.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        st.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (!st.downPt) st.downPt = { x: e.clientX, y: e.clientY };
        if (st.pts.size === 2) {
            const [a, b] = [...st.pts.values()];
            st.pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale: _lbZoom.scale };
            st.dragMode = null;
        } else if (st.pts.size === 1) {
            st.dragMode = (!_isVideoCurrent() && _lbZoom.scale > 1) ? 'pan' : 'swipe';
            st.lastPt = { x: e.clientX, y: e.clientY };
        }
    });

    area.addEventListener('dragstart', (e) => e.preventDefault());   // no native drags in the media area
    if (!_lbDocBound) {
        _lbDocBound = true;   // document handlers live for the page lifetime
        document.addEventListener('pointermove', _lbPtrMove);
        document.addEventListener('pointerup', _lbPtrFinish);
        document.addEventListener('pointercancel', _lbPtrFinish);
    }

    // Wheel / trackpad-pinch zoom toward the cursor.
    area.addEventListener('wheel', (e) => {
        if (_isVideoCurrent()) return;   // let videos keep native behavior
        e.preventDefault();
        const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002));
        _lbZoomAt(e.clientX, e.clientY, _lbZoom.scale * factor);
    }, { passive: false });

    // Double-click toggles between fit and 250% at the click point.
    area.addEventListener('dblclick', (e) => {
        if (_isVideoCurrent()) return;
        if (_lbZoom.scale > 1) _lbResetZoom(true);
        else _lbZoomAt(e.clientX, e.clientY, 2.5);
    });
}

function _lbShow(i) {
    const items = _lbItems();
    const it = items[i];
    if (!it || !_body) return;
    const lb = document.getElementById('ps-lightbox');
    if (!lb) return;

    // Media — swap src in place; the old frame stays visible until the new
    // one has loaded, which is what makes prev/next flicker-free.
    const box = lb.querySelector('#ps-lb-media');
    _lbResetZoom(false);   // each item starts at fit
    if (_isVideo(it)) {   // zoom is image-only — hide the reset button for videos
        const zb = document.querySelector('[data-testid="ps-lb-zoom-reset"]');
        if (zb) zb.style.display = 'none';
    }
    let el = box.querySelector('img,video');
    const video = _isVideo(it);
    const url = it.private ? _privMediaUrl(it) : _rawUrl(it.path);
    const bd = lb.querySelector('#ps-lb-backdrop');
    if (bd) bd.style.backgroundImage = `url("${url.replace(/"/g, '%22')}")`;
    if (video && !(el instanceof HTMLVideoElement)) {
        if (el) el.remove();
        const v = document.createElement('video');
        v.src = url; v.controls = true; v.autoplay = true;
        box.appendChild(v);
    } else if (!video && !(el instanceof HTMLImageElement)) {
        if (el) el.remove();
        const im = document.createElement('img');
        im.alt = it.name;
        im.src = url;
        im.draggable = false;   // native HTML5 drag would swallow pointer moves (breaks pan)
        box.appendChild(im);
    } else if (el.getAttribute('src') !== url) {
        el.src = url;
        if (video) el.play().catch(() => {});
    }

    // Text bits.
    const counter = lb.querySelector('[data-testid="ps-lb-counter"]');
    if (counter) counter.textContent = `${i + 1} / ${items.length}`;
    const name = lb.querySelector('[data-testid="ps-lb-name"]');
    if (name) name.textContent = it.name;
    const folder = it.folder || _parentPath(it.path || '');
    const dur = _isVideo(it) && it.duration != null ? ` · ${_fmtDuration(it.duration)}` : '';
    const infoBits = [_fmtDate(it.taken || it.modified, true) + dur, it.size != null ? _fmtSize(it.size) : '', folder].filter(Boolean);
    const info = lb.querySelector('[data-testid="ps-lb-info"]');
    if (info) info.textContent = infoBits.join(' · ');

    // Privacy toggle reflects the current item's state.
    const privBtn = lb.querySelector('[data-testid="ps-lb-private"]');
    if (privBtn) {
        const isPriv = !!it.private;
        privBtn.classList.toggle('priv', isPriv);
        privBtn.title = isPriv ? 'Make public (show in normal views)' : 'Make private (hidden from normal views)';
    }

    // Favorite star reflects the current item's state.
    const favBtn = lb.querySelector('[data-testid="ps-lb-fav"]');
    if (favBtn) {
        const isFav = !!it.favorite;
        favBtn.classList.toggle('on', isFav);
        favBtn.title = isFav ? 'Remove from Favorites (f)' : 'Add to Favorites (f)';
    }

    // Prev/next visibility.
    const prev = lb.querySelector('[data-testid="ps-lb-prev"]');
    const next = lb.querySelector('[data-testid="ps-lb-next"]');
    if (prev) prev.style.display = i > 0 ? 'grid' : 'none';
    if (next) next.style.display = i < items.length - 1 ? 'grid' : 'none';

    _lbMetaMaybeRefresh();   // info panel follows prev/next when open
    _lbUpdateStrip(i);
    _lbPreload(i);
}

// ---- Info panel (EXIF / file metadata) --------------------------------------
const _metaCache = new Map();   // path -> meta JSON (per page session)

function _fmtShutter(s) {
    if (s == null || !(s > 0)) return '';
    if (s >= 1) return `${parseFloat(s.toFixed(2))} s`;
    const d = Math.round(1 / s);
    if (d > 0 && Math.abs(1 / d - s) / s < 0.08) return `1/${d} s`;
    return `${parseFloat(s.toFixed(3))} s`;
}

function _lbMetaRows(it, meta) {
    const rows = [];
    const add = (label, val) => { if (val != null && val !== '') rows.push([label, String(val)]); };
    add('Camera', [meta.make, meta.model].filter(Boolean).join(' '));
    add('Lens', meta.lens);
    const exp = [];
    if (meta.focal_length_mm != null) exp.push(`${meta.focal_length_mm} mm`);
    if (meta.aperture != null) exp.push(`f/${meta.aperture}`);
    const sh = _fmtShutter(meta.shutter_s);
    if (sh) exp.push(sh);
    if (meta.iso != null) exp.push(`ISO ${meta.iso}`);
    add('Exposure', exp.join(' · '));
    if (meta.width && meta.height) add('Dimensions', `${meta.width} × ${meta.height}`);
    if (meta.lat != null && meta.lon != null) {
        const mapUrl = `https://www.openstreetmap.org/?mlat=${meta.lat}&mlon=${meta.lon}#map=17/${meta.lat}/${meta.lon}`;
        rows.push(['Location', `<span style="font-family:ui-monospace,monospace;">${meta.lat.toFixed(4)}, ${meta.lon.toFixed(4)}</span><a href="${mapUrl}" target="_blank" rel="noopener" style="color:#60a5fa;text-decoration:none;margin-left:8px;white-space:nowrap;">🗺 map</a>`]);
    }
    add('Software', meta.software);
    add('Size', it.size != null ? _fmtSize(it.size) : (meta.size != null ? _fmtSize(meta.size) : ''));
    add('Taken', _fmtDate(it.taken || meta.mtime, true));
    if (it.modified && it.modified !== it.taken) add('Modified', _fmtDate(it.modified, true));
    add('Folder', it.folder || _parentPath(it.path || ''));
    return rows;
}

function _lbMetaRender(panel, it, meta) {
    const rows = _lbMetaRows(it, meta);
    if (!rows.length) {
        panel.innerHTML = `<div class="ps-lb-meta-head"><b>Photo info</b><button class="ps-lb-btn close" onclick="_lbToggleMeta()" title="Close">×</button></div><div class="ps-empty"><span class="ps-empty-ic">${_svg('info')}</span><b>No metadata</b><span>This file carries no EXIF data.</span></div>`;
        return;
    }
    const html = rows.map(([l, v]) =>
        `<div class="ps-meta-row"><span class="ps-meta-k">${l}</span><span class="ps-meta-v">${v}</span></div>`).join('');
    panel.innerHTML = `
        <div class="ps-lb-meta-head"><b>Photo info</b><button class="ps-lb-btn close" onclick="_lbToggleMeta()" title="Close">×</button></div>
        <div class="ps-lb-meta-body">${html}</div>`;
}

async function _lbMetaRefresh() {
    const lb = document.getElementById('ps-lightbox');
    if (!lb) return;
    const panel = lb.querySelector('#ps-lb-meta-panel');
    if (!panel || panel.style.display === 'none') return;
    const it = _lbItems()[_lightboxIndex];
    if (!it) return;
    let meta = _metaCache.get(it.path);
    if (meta == null) {
        panel.innerHTML = '<div class="ps-loading"><span class="ps-spinner"></span><span>Loading…</span></div>';
        const ps = it.private ? `&ps=${encodeURIComponent(_psToken || '')}` : '';
        try {
            const r = await apiFetch(`/api/gallery/meta?path=${encodeURIComponent(it.path)}${ps}`);
            meta = (r.ok) ? await r.json() : {};
        } catch (_) { meta = {}; }
        _metaCache.set(it.path, meta);
    }
    // The item may have changed while the request was in flight.
    const cur = _lbItems()[_lightboxIndex];
    if (cur && cur.path === it.path) _lbMetaRender(panel, it, meta);
}

function _lbToggleMeta() {
    const lb = document.getElementById('ps-lightbox');
    if (!lb) return;
    const panel = lb.querySelector('#ps-lb-meta-panel');
    if (!panel) return;
    const open = panel.style.display !== 'none';
    panel.style.display = open ? 'none' : 'flex';
    if (!open) _lbMetaRefresh();
}

function _lbMetaMaybeRefresh() {
    const p = document.getElementById('ps-lb-meta-panel');
    if (p && p.style.display !== 'none') _lbMetaRefresh();
}

// Keep a sliding window of strip thumbs in the DOM; only add/remove the edges.
function _lbUpdateStrip(i) {
    const items = _lbItems();
    const strip = document.getElementById('ps-lb-strip');
    if (!strip) return;
    let end = Math.min(items.length, i + _LB_STRIP_HALF * 2 + 1);
    let start = Math.max(0, end - (_LB_STRIP_HALF * 2 + 1));
    for (const key of Object.keys(_lbThumbEls)) {
        const idx = Number(key);
        if (idx < start || idx >= end) { _lbThumbEls[key].remove(); delete _lbThumbEls[key]; }
    }
    for (let k = start; k < end; k++) {
        if (_lbThumbEls[k]) continue;
        const img = document.createElement('img');
        img.className = 'ps-strip-thumb';
        img.src = _thumbUrl(items[k], 72);
        img.alt = '';
        img.loading = 'lazy';
        img.onclick = () => _lbOpen(k);
        _lbThumbEls[k] = img;
        let inserted = false;
        for (const key of Object.keys(_lbThumbEls)) {
            if (Number(key) > k) { strip.insertBefore(img, _lbThumbEls[key]); inserted = true; break; }
        }
        if (!inserted) strip.appendChild(img);
    }
    for (const key of Object.keys(_lbThumbEls)) {
        const idx = Number(key), e = _lbThumbEls[key];
        e.classList.toggle('active', idx === i);
    }
    const act = _lbThumbEls[i];
    if (act) act.scrollIntoView({ inline: 'center', block: 'nearest' });
}

// Preload the neighbours at full size so both prev and next are instant.
function _lbPreload(i) {
    const items = _lbItems();
    for (const j of [i - 1, i + 1]) {
        const it2 = items[j];
        if (!it2 || _isVideo(it2)) continue;
        const im = new Image();
        im.src = it2.private ? _privMediaUrl(it2) : _rawUrl(it2.path);
    }
}

// Delete the current item → shared trash (restorable from File Manager).
function _lbDownloadCurrent() {
    const it = _lbItems()[_lightboxIndex];
    if (!it) return;
    _triggerDownload(_downloadUrlFor(it), it.name);
}

// Favorites (P0.7): star toggle on tiles, lightbox and the action bar.
function _favToggle(i, e) {
    if (e && e.stopPropagation) e.stopPropagation();
    const it = _items[i];
    if (!it) return;
    const next = !it.favorite;
    it.favorite = next;   // optimistic
    const el = document.querySelector(`[data-testid="ps-fav-${i}"]`);
    if (el) el.classList.toggle('on', next);
    apiFetch('/api/gallery/favorite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: [it.path], favorite: next }),
    }).then(r => r.json()).catch(() => null).then(d => {
        if (!d || !d.ok) {   // revert
            it.favorite = !next;
            const el2 = document.querySelector(`[data-testid="ps-fav-${i}"]`);
            if (el2) el2.classList.toggle('on', !next);
            return;
        }
        if (_favView && !next) _reloadView();   // unstarred inside Favorites → tile leaves the grid
    });
}

async function _psFavoriteSelected() {
    const paths = [..._selected];
    if (!paths.length) return;
    const byPath = new Map(_items.map(it => [it.path, it]));
    const allFav = paths.every(p => (byPath.get(p) || {}).favorite);
    for (const p of paths) { const it = byPath.get(p); if (it) it.favorite = !allFav; }
    const d = await apiFetch('/api/gallery/favorite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths, favorite: !allFav }),
    }).then(r => r.json()).catch(() => null);
    if (!d || !d.ok) { _reloadView(); return; }
    for (const p of paths) {
        const tile = document.querySelector(`.ps-tile[data-path="${CSS.escape(p)}"] .ps-fav`);
        if (tile) tile.classList.toggle('on', !allFav);
    }
    if (_favView && allFav) _reloadView();   // unfavorited inside Favorites → tiles leave the grid
}

function _lbToggleFavorite() {
    const it = _lbItems()[_lightboxIndex];
    if (!it) return;
    const next = !it.favorite;
    it.favorite = next;   // optimistic — also updates any matching tile in place
    const btn = document.querySelector('[data-testid="ps-lb-fav"]');
    if (btn) btn.classList.toggle('on', next);
    apiFetch('/api/gallery/favorite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: [it.path], favorite: next }),
    }).then(r => r.json()).catch(() => null).then(d => {
        if (!d || !d.ok) {
            it.favorite = !next;
            const b2 = document.querySelector('[data-testid="ps-lb-fav"]');
            if (b2) b2.classList.toggle('on', !next);
        }
    });
}

async function _psDownloadSelected() {
    const paths = [..._selected];
    if (!paths.length) return;
    const byPath = new Map(_items.map(it => [it.path, it]));
    for (let i = 0; i < paths.length; i++) {
        const p = paths[i];
        const it = byPath.get(p);
        _triggerDownload(_downloadUrlFor(it || { path: p }), it ? it.name : p.split('/').pop());
        if (i < paths.length - 1) await new Promise(r => setTimeout(r, 350)); // let the browser accept each download
    }
}

// Share selected photos via public share links (Shared Links app).
// One photo → open Shared Links with the path pre-filled so the user picks
// expiry/label. Several photos → create one 7-day link per photo directly.
// Private items are encrypted at rest and can never be served through a
// public link — they're skipped with an explanatory toast.
// Share the photo currently open in the lightbox → Shared Links app with
// path pre-filled (same flow as File Station's "Share link…" context action).
function _lbShareCurrent() {
    const it = _lbItems()[_lightboxIndex];
    if (!it) return;
    if (it.private && window.addNotification) {
        window.addNotification('This photo is private/encrypted — make it public first to share.', 'warning');
        return;
    }
    window.__fmShareCtx = { path: it.path, name: it.name };
    window.openApp('shared-links');
}

// Options modal for bulk sharing (mirrors the Shared Links create form):
// expiry + max downloads applied to every selected photo.
function _psShareOptionsModal(count) {
    return new Promise((resolve) => {
        const ov = document.createElement('div');
        ov.id = 'ps-share-overlay';
        ov.style.cssText = 'position:fixed;inset:0;z-index:9600;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px);';
        ov.innerHTML = `
            <div style="width:min(380px,90vw);background:var(--surface-1);border:1px solid var(--border);border-radius:14px;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.55);">
                <div style="display:flex;align-items:center;gap:8px;font-size:15px;font-weight:600;color:var(--text-1);margin-bottom:6px;">${_svg('share', 'width:16px;height:16px;')} Share ${count} photo${count === 1 ? '' : 's'}</div>
                <div id="ps-share-hint" style="font-size:12.5px;line-height:1.45;color:var(--text-3);margin-bottom:14px;">One public link for all ${count} photos (Shared Links). Recipients can browse them, download single photos or grab everything as a .zip — no account needed.</div>
                <label style="display:block;font-size:12px;color:var(--text-3);margin-bottom:4px;">Expires</label>
                <select aria-label="Share Expiry" id="ps-share-expiry" style="width:100%;box-sizing:border-box;background:var(--surface-2,#1e293b);border:1px solid var(--border);border-radius:8px;color:var(--text-1);font-size:14px;padding:9px 12px;margin-bottom:12px;">
                    <option value="">Never</option>
                    <option value="1">1 day</option>
                    <option value="7" selected>7 days</option>
                    <option value="30">30 days</option>
                </select>
                <label style="display:block;font-size:12px;color:var(--text-3);margin-bottom:4px;">Max downloads per link (optional)</label>
                <input id="ps-share-maxdl" type="number" min="1" placeholder="∞" autocomplete="off"
                    style="width:100%;box-sizing:border-box;background:var(--surface-2,#1e293b);border:1px solid var(--border);border-radius:8px;color:var(--text-1);font-size:14px;padding:9px 12px;margin-bottom:16px;">
                <div style="display:flex;gap:8px;justify-content:flex-end;">
                    <button id="ps-share-cancel" class="btn-ghost" style="font-size:13px;padding:8px 14px;border-radius:8px;">Cancel</button>
                    <button id="ps-share-ok" style="background:#0e7490;border:none;color:#fff;font-size:13px;font-weight:600;padding:8px 18px;border-radius:8px;cursor:pointer;">Create link</button>
                </div>
            </div>`;
        document.body.appendChild(ov);
        const maxEl = ov.querySelector('#ps-share-maxdl');
        if (maxEl) maxEl.focus();

        let done = false;
        const close = (opts) => { if (!done) { done = true; ov.remove(); resolve(opts); } };
        ov.querySelector('#ps-share-cancel').onclick = () => close(null);
        ov.onclick = (e) => { if (e.target === ov) close(null); };
        const escKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(null); } };
        document.addEventListener('keydown', escKey, true);
        const submit = () => {
            const exp = Number(ov.querySelector('#ps-share-expiry').value || 0);
            const maxDl = parseInt(maxEl.value, 10) > 0 ? parseInt(maxEl.value, 10) : null;
            document.removeEventListener('keydown', escKey, true);
            close({ expires_in_days: exp || null, max_downloads: maxDl });
        };
        ov.querySelector('#ps-share-ok').onclick = submit;
        const onKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } };
        ov.addEventListener('keydown', onKey);
    });
}

async function _psShareSelected() {
    const paths = [..._selected];
    if (!paths.length) return;
    const byPath = new Map(_items.map(it => [it.path, it]));
    const items = paths.map(p => byPath.get(p)).filter(Boolean);
    const privCount = items.filter(it => it.private).length;
    if (privCount && window.addNotification) {
        window.addNotification(
            `${privCount} private photo${privCount === 1 ? '' : 's'} skipped — they're encrypted at rest. Make them public first to share.`,
            'warning');
    }
    const shareable = items.filter(it => !it.private);
    if (!shareable.length) return;

    if (shareable.length === 1) {
        window.__fmShareCtx = { path: shareable[0].path, name: shareable[0].name };
        window.openApp('shared-links');
        return;
    }

    const opts = await _psShareOptionsModal(shareable.length);
    if (!opts) return;

    // ONE link for all selected photos — recipients get a gallery page where
    // they can browse, download single photos, or grab everything as .zip.
    try {
        const payload = { paths: shareable.map(it => it.path), name: `${shareable.length} photos` };
        if (opts.expires_in_days) payload.expires_in_days = opts.expires_in_days;
        if (opts.max_downloads) payload.max_downloads = opts.max_downloads;
        const r = await apiFetch('/api/share-links', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!r.ok) {
            let detail = `HTTP ${r.status}`;
            try { detail = (await r.json()).detail || detail; } catch (_) {}
            throw new Error(detail);
        }
        const expLabel = opts.expires_in_days ? `expires in ${opts.expires_in_days} day${opts.expires_in_days === 1 ? '' : 's'}` : 'no expiry';
        if (window.addNotification) {
            window.addNotification(`Share link created for ${shareable.length} photos (${expLabel})`, 'success');
        }
    } catch (e) {
        if (window.addNotification) window.addNotification(e.message, 'error');
        return;
    }
    window.openApp('shared-links');
}

// Share a whole library folder as one link → Shared Links app with path pre-filled.
function _psShareFolder(i, e) {
    if (e && e.stopPropagation) e.stopPropagation();
    const f = _cfg.folders[i];
    if (!f) return;
    window.__fmShareCtx = { path: f.path, name: f.name };
    window.openApp('shared-links');
}

// Lightbox 🗑 button — moves the current item straight to trash, no confirmation.
function _lbDeleteCurrent() {
    const it = _lbItems()[_lightboxIndex];
    if (!it) return;
    _lbTrashCurrent();
}

// Toggle privacy of the current item. If it leaves the current view's scope
// (made private while browsing normally, or made public inside Private),
// drop it from the list like trash does and advance to the next item.
async function _lbTogglePrivateCurrent() {
    const items = _lbItems();
    const it = items[_lightboxIndex];
    if (!it) return;
    const makePrivate = !it.private;
    try {
        let r = await _psPrivateRequest([it.path], makePrivate);
        if (!r.ok && (r.status === 403 || r.status === 409)) {
            const ok = await _psEnsureSession();
            if (ok) r = await _psPrivateRequest([it.path], makePrivate);
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        if (d.failed && d.failed.length) {
            if (window.addNotification) window.addNotification('Failed to update privacy: ' + d.failed[0].error, 'error');
            return;
        }
    } catch (e) {
        if (window.addNotification) window.addNotification('Failed to update privacy: ' + e.message, 'error');
        return;
    }
    it.private = makePrivate;
    _bumpPrivacyCounts(makePrivate ? 1 : -1);
    const idx = _lightboxIndex;
    if (it.private !== _privateView) {   // item no longer belongs to this view
        if (_fmCollection) {
            _fmCollection.files.splice(idx, 1);
        } else {
            const k = _items.findIndex(x => x.path === it.path);
            if (k >= 0) _items.splice(k, 1);
            _total = Math.max(0, _total - 1);
        }
    }
    if (_selected.has(it.path)) {   // keep an active multi-select in sync
        _selected.delete(it.path);
        _updateActionBar();
    }
    if (!_lbItems().length) { _lbClose(); _reloadView(); return; }
    const nextIdx = Math.min(idx, _lbItems().length - 1);
    _lightboxIndex = nextIdx;
    _lbShow(nextIdx);
    if (_momentsView) {
        _loadMoments();   // the curated feed has its own DOM, refresh it too
    } else {
        const grid = document.getElementById('ps-grid');
        if (grid) { grid.innerHTML = ''; _appendTiles(0); _updateTileSelection(); }
    }
    _renderSidebar();
    if (window.addNotification) window.addNotification(makePrivate ? `"${it.name}" moved to Private` : `"${it.name}" made public`, 'success');
}

// Core delete path (no confirmation) — shared by the 🗑 button and swipe-down.
async function _lbTrashCurrent() {
    const items = _lbItems();
    const it = items[_lightboxIndex];
    if (!it) return;
    try {
        const r = await apiFetch('/api/gallery/trash', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paths: [it.path] }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        if (d.failed && d.failed.length) {
            if (window.addNotification) window.addNotification('Delete failed: ' + d.failed[0].error, 'error');
            return;
        }
    } catch (e) {
        if (window.addNotification) window.addNotification('Delete failed: ' + e.message, 'error');
        return;
    }
    const idx = _lightboxIndex;
    if (_fmCollection) {
        _fmCollection.files.splice(idx, 1);
    } else {
        const k = _items.findIndex(x => x.path === it.path);
        if (k >= 0) _items.splice(k, 1);
        _total = Math.max(0, _total - 1);
    }
    if (_selected.has(it.path)) {   // keep an active multi-select in sync
        _selected.delete(it.path);
        _updateActionBar();
    }
    if (!_lbItems().length) { _lbClose(); _reloadView(); return; }
    const nextIdx = Math.min(idx, _lbItems().length - 1);
    _lightboxIndex = nextIdx;
    _lbShow(nextIdx);
    if (_momentsView) {
        _loadMoments();   // the curated feed has its own DOM, refresh it too
    } else {
        const grid = document.getElementById('ps-grid');
        if (grid) { grid.innerHTML = ''; _appendTiles(0); _updateTileSelection(); }
    }
    _renderSidebar();
    if (window.addNotification) window.addNotification(`Moved "${it.name}" to trash`, 'success');
}

// ════════════════════════════════════════════
// APP: PhotoStation — Entry
// ════════════════════════════════════════════

function _renderWelcome() {
    if (!_body) return;
    _body.innerHTML = `
        <div class="ps-welcome" data-testid="ps-welcome">
            <div class="ps-welcome-ic">${_svg('camera')}</div>
            <h2>Welcome to Photos</h2>
            <p>Add a folder with photos and videos to build your personal library. Everything stays on this NAS — thumbnails, albums, favorites and a private, PIN-encrypted section included.</p>
            <div class="ps-welcome-actions">
                <button class="ps-primary-btn" data-testid="ps-welcome-add" onclick="_psShowPicker()">${_svg('folderPlus')} Choose folder</button>
            </div>
        </div>`;
}

async function _initApp(openLightboxIndex) {
    _ensureStyles();
    await _loadConfig();
    if (!_active()) return;
    if (_fmCollection && _fmCollection.files.length && openLightboxIndex != null) {
        _renderShell();
        setTimeout(() => _lbOpen(openLightboxIndex), 60);
        return;
    }
    if (!_cfg.folders.length && !_currentFolder) {
        _renderWelcome();
    } else {
        _renderShell();
    }
}

function renderGallery(winBody) {
    _body = winBody || document.querySelector('[data-testid="window-pkg-ethos-photos"] .window-body');
    if (!_body) return;
    // Invalidate any fetch from a previous window instance so its results can
    // never land in the freshly opened view.
    _gen++;
    _fetchChain = Promise.resolve();
    _loadingPage = false;
    _wasScanning = false;
    _items = []; _offset = 0; _total = 0; _facets = []; _query = ''; _privateView = false;
    _psToken = null; _pinSet = null;
    _psViewMode = 'grid'; _monthMeta = {}; _lastMonthKey = null; _lastDayKey = null;
    _momentsView = false; _momentsExpanded = null; _momentsTotal = 0; _momentsHighlights = [];
    _calendarView = false; _calMonth = ''; _calDay = null; _calDays = []; _favView = false; _albumView = null; _albums = [];
    _cameraView = null; _cameras = []; _dayNav = null; _durationCache.clear();
    _lightboxIndex = -1; _fmCollection = null; _counts = {}; _currentFolder = '';
    _selectMode = false; _selected.clear(); _lastSelIdx = -1;
    if (_statusTimer) { clearInterval(_statusTimer); _statusTimer = null; }
    if (_observer) { _observer.disconnect(); _observer = null; }
    const oldLb = document.getElementById('ps-lightbox'); if (oldLb) oldLb.remove();
    _stopWinWatcher();
    const oldPk = document.getElementById('ps-picker'); if (oldPk) oldPk.remove();

    const ctx = window.__fmGalleryCtx || null;
    window.__fmGalleryCtx = null;
    if (ctx && ctx.files && ctx.files.length > 0) {
        _fmCollection = { files: ctx.files.filter(f => !f.is_dir), dir: ctx.dir || '' };
        _currentFolder = _fmCollection.dir;
        _initApp(ctx.index != null ? ctx.index : 0);
    } else if (ctx && ctx.folder) {
        _currentFolder = ctx.folder;
        _initApp();
    } else {
        _initApp();
    }
}

// ════════════════════════════════════════════
// APP: PhotoStation — Global exports for inline handlers
// ════════════════════════════════════════════

window._psShowPicker = _psShowPicker;
window._psHidePicker = _psHidePicker;
window._psBrowseTo = _psBrowseTo;
window._psPickerToggle = _psPickerToggle;
window._psPickerOpen = _psPickerOpen;
window._psPickerCtx = _psPickerCtx;
window._psAddSelected = _psAddSelected;
window._psNavAll = _psNavAll;
window._psNavPrivate = _psNavPrivate;
window._psNavFolder = _psNavFolder;
window._psSelectFolder = _psSelectFolder;
window._psRemoveFolder = _psRemoveFolder;
window._psFacetGo = _psFacetGo;
window._psFacetParent = _psFacetParent;
window._psOnSearch = _psOnSearch;
window._psClearSearch = _psClearSearch;
window._gridKeyNav = _gridKeyNav;
window._psOnSort = _psOnSort;
window._psSetViewMode = _psSetViewMode;
window._psNavMoments = _psNavMoments;
window._momentsToggleMonth = _momentsToggleMonth;
window._psNavCalendar = _psNavCalendar;
window._psCalShift = _psCalShift;
window._psCalPickDay = _psCalPickDay;
window._psCalClearDay = _psCalClearDay;
window._psNavCamera = _psNavCamera;
window._psCalShiftDay = _psCalShiftDay;
window._psNavFavorites = _psNavFavorites;
window._favToggle = _favToggle;
window._psFavoriteSelected = _psFavoriteSelected;
window._lbToggleFavorite = _lbToggleFavorite;
window._psNavAlbum = _psNavAlbum;
window._psAlbumCreate = _psAlbumCreate;
window._psAlbumDelete = _psAlbumDelete;
window._psAddToAlbumModal = _psAddToAlbumModal;
window._psAlbumPick = _psAlbumPick;
window._psAlbumCreateFromModal = _psAlbumCreateFromModal;
window._psRemoveFromAlbum = _psRemoveFromAlbum;
window._psToggleSettings = _psToggleSettings;
window._psOptVideos = _psOptVideos;
window._psOptGridSize = _psOptGridSize;
window._psRescanNow = _psRescanNow;
window._psToggleSidebar = _psToggleSidebar;
window._psThumbError = _psThumbError;
window._tileClick = _tileClick;
window._psToggleSelectMode = _psToggleSelectMode;
window._psLoadMore = _psLoadMore;
window._psClearSelection = _psClearSelection;
window._psDeleteSelected = _psDeleteSelected;
window._psTogglePrivateSelected = _psTogglePrivateSelected;
window._lbOpen = _lbOpen;
window._lbClose = _lbClose;
window._lbPrev = _lbPrev;
window._lbNext = _lbNext;
window._lbDeleteCurrent = _lbDeleteCurrent;
window._lbDownloadCurrent = _lbDownloadCurrent;
window._lbToggleMeta = _lbToggleMeta;
window._lbResetZoom = _lbResetZoom;
window._psDownloadSelected = _psDownloadSelected;
window._psShareSelected = _psShareSelected;
window._lbShareCurrent = _lbShareCurrent;
window._psShareFolder = _psShareFolder;
window._lbTogglePrivateCurrent = _lbTogglePrivateCurrent;
window.__galleryImages = () => _items;

export { renderGallery };

// ── Package entry point ───────────────────────────────────────────────────────
export async function render(container, ctx) {
    _ctx = ctx;
    ctx.log('info', 'Photos opened');
    await renderGallery(container);
}
