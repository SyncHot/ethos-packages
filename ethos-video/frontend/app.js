// EthOS NAS — Video Station (Package Center app)
// Library of configured root folders with live browsing (no index):
//   - sidebar: "All Videos" + top-level folders, breadcrumb navigation
//   - grid/list cards with ffmpeg frame-grab thumbnails (icon fallback)
//   - player: Range streaming via /api/videos/stream, ffprobe metadata chips,
//     resume positions (auto-seek + throttled save), sibling .srt/.vtt subtitles
//   - folder picker backed by /api/videos/browse to add root folders
//
// The /api/videos/* API stays in the EthOS core (the Android Video app uses it);
// this package owns the desktop UI only.

// ── Native-module shim ────────────────────────────────────────────────────────
let _ctx = null;
const escapeHtml = (value) => _ctx.escape.html(value);
const escapeAttr = (value) => _ctx.escape.attr(value);
const jsAttr = (value) => _ctx.escape.js(value);

function getToken() {
    return localStorage.getItem('token') || '';
}

function apiFetch(path, options) {
    return _ctx.apiFetch(path, options);
}

async function readErrorDetail(res, fallback = '') {
    let payload = null;
    try { payload = await res.clone().json(); } catch (_) { /* non-JSON body */ }
    const detail = payload?.detail ?? payload?.error ?? '';
    const text = typeof detail === 'string' ? detail : JSON.stringify(detail);
    return text || fallback || `HTTP ${res.status}`;
}

// Icon subset from core/icons.js — a blob module cannot import it.
const ICONS = {
    disk: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10.5h.01M9 10.5h.01"/><path d="M2.5 12.5h19"/>',
    folder: '<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h8.5A1.5 1.5 0 0 1 20.5 10v7.5A1.5 1.5 0 0 1 19 19H4.5A1.5 1.5 0 0 1 3 17.5Z"/>',
    check: '<path d="m4.5 12.5 5 5 10-11"/>',
    alert: '<path d="M12 4.5 2.8 20h18.4L12 4.5Z"/><path d="M12 10v4.5"/><path d="M12 17.2h.01"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v4h-4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    download: '<path d="M12 4v10"/><path d="m7.5 10.5 4.5 4 4.5-4"/><path d="M4.5 19.5h15"/>',
    subtitles: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M6.5 14.5h5M13.5 14.5h4"/>',
    volume: '<path d="M4 9.5h3.2L12 6v12l-4.8-3.5H4Z"/><path d="M15.5 9.2a4 4 0 0 1 0 5.6"/><path d="M18 6.8a7.5 7.5 0 0 1 0 10.4"/>',
    film: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M7.5 4.5v15M16.5 4.5v15"/><path d="M3 12h18"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6"/>',
    activity: '<path d="M3 12.5h3.6l2.2-6 3.4 12 2.4-8 1.6 2h4.8"/>',
    play: '<path d="M8.5 5.5 18 12l-9.5 6.5v-13Z"/>',
};

function uiIcon(name, size = 18, opts = {}) {
    const d = ICONS[name];
    if (!d) return '';
    const stroke = opts.strokeWidth ?? 1.7;
    const cls = opts.className ? ` class="${opts.className}"` : '';
    const title = opts.title ? `<title>${String(opts.title).replace(/[<>&]/g, '')}</title>` : '';
    return `<svg${cls} xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" `
        + `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" `
        + `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" `
        + `style="flex-shrink:0;vertical-align:-3px">${title}${d}</svg>`;
}

// ── Module state ──────────────────────────────────────────────────────────────
let _body = null;                 // .window-body element of this instance
let _cfg = { roots: [], options: {
    sort: 'name', view: 'grid', quality: 'balanced', audio_bitrate: '192k',
    preferred_audio_lang: '', auto_subtitles: true, autoplay_next: true,
}, tmdb: { api_key_set: false, api_key_masked: '', auto_fetch: true, language: 'pl-PL' } };
let _tmdbFetching = false;        // a /tmdb/refresh request is in flight
let _tmdbAutoDone = false;        // background auto-fetch already ran this session
// _mode: 'home' | 'movies' | 'series' | 'browse' (folder / All Videos)
let _mode = 'home';
let _path = null;                  // browse mode only — null → "All Videos" walk
let _q = '';                       // search query (server-side in browse, client-side elsewhere)
let _preSearchMode = null;         // {mode,path} to restore when global search is cleared
let _showDetail = null;            // show name when viewing a series detail page
let _sidebarFolders = [];          // top-level folders, cached from the All-Videos walk
let _listing = { path: null, parent: null, folders: [], videos: [] };
let _viewVideos = [];              // items of the current grid/list view (click index → play)
let _rowItems = [];                // home row cards (Continue Watching / Recently Added)
let _showsList = [];               // series grid cards
let _allVideos = [];               // full library walk cache for movies/series/home
let _homeData = { continue_watching: [], recently_added: [] };
let _resumes = {};                 // path → {time, duration} (card progress bars)
let _myList = new Set();           // paths saved to "My List" (per user, localStorage)
let _playerPath = null;            // video currently playing (null = library view)
let _videoEl = null;               // HTMLVideoElement in the player
let _pendingSeek = 0;              // resume position to apply on loadedmetadata
let _lastResumeSave = 0;           // throttle for timeupdate saves
let _transcoding = false;          // true while the current src is a live /transcode pipe
let _knownDuration = 0;            // ffprobe duration — authoritative for fMP4 pipes
let _pipeBase = 0;                 // absolute source time at video.currentTime=0 of the current pipe
let _seekReload = null;            // {playing} set while reloading after an out-of-buffer seek
let _endSaved = false;             // "finished" resume POST already sent for this play session
let _playerItem = null;            // full item dict of the video being played
let _subs = [];                    // sibling subtitle files for the current player item
let _subIdx = 0;                   // selected index into _subs (-1 = off)
let _subBlobUrl = null;            // object URL for a converted .srt track
let _audioTracks = [];             // audio streams of the current item (from /info)
let _audioIdx = 0;                 // selected audio track index (ffmpeg 0:a:<idx>)
let _playerMode = 'direct';        // direct | processed (remux/transcode)
let _playerMax = false;            // player maximized (sidebar/toolbar hidden)
let _ctlBar = null;                // custom transport bar element (processed mode)
let _searchTimer = null;
let _keyOn = false;                // Escape keydown handler attached?

const SORTS = [
    { id: 'name', label: 'Name' },
    { id: 'date_desc', label: 'Newest first' },
    { id: 'size_desc', label: 'Largest first' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function _active() { return !!(_body && _body.isConnected); }
function _token() { return encodeURIComponent(getToken() || ''); }
function _streamUrl(p) { return `/api/videos/stream?path=${encodeURIComponent(p)}&token=${_token()}`; }
// Live transcode pipe (Intel QSV H.264 + AAC). `t` starts the stream at an
// offset in seconds — used for resume and when re-requesting after a seek.
function _transcodeUrl(p, t = 0, a = 0) {
    const off = t > 0 ? `&t=${t.toFixed(3)}` : '';
    const q = _cfg.options.quality || 'balanced';
    return `/api/videos/transcode?path=${encodeURIComponent(p)}${off}&a=${a}&q=${q}&token=${_token()}`;
}

function _chanLabel(ch) {
    if (ch === 2) return '2.0';
    if (ch === 6) return '5.1';
    if (ch === 8) return '7.1';
    return '';
}

function _trackLabel(t) {
    const lang = t.language ? `${t.language.toUpperCase()} · ` : '';
    const ch = _chanLabel(t.channels);
    return `${lang}${(t.codec || 'audio').toUpperCase()}${ch ? ' ' + ch : ''}`;
}

function _defaultAudioIdx(tracks) {
    const pref = (_cfg.options.preferred_audio_lang || '').toLowerCase();
    if (pref && tracks.length) {
        for (const t of tracks) if ((t.language || '').startsWith(pref)) return t.index;
    }
    return 0;
}

// Seek target outside the buffered range → re-request the transcode pipe from
// that point (a live pipe has no byte-range seek). In-buffer seeks stay native.
// `t` is an ABSOLUTE source time; buffered ranges are relative to _pipeBase.
function _seekReloadStart(video, t) {
    if (_seekReload || !_transcoding) return;
    let inBuf = false;
    try {
        for (let i = 0; i < video.buffered.length; i++) {
            const s = video.buffered.start(i) + _pipeBase;
            const e = video.buffered.end(i) + _pipeBase;
            if (t >= s - 1.5 && t <= e + 1.5) { inBuf = true; break; }
        }
    } catch (_) {}
    if (inBuf) return;
    _seekReload = { playing: !video.paused };
    _pipeBase = Math.max(0, t);
    video.src = _transcodeUrl(_playerPath, _pipeBase, _audioIdx);
}

// Show/hide the custom transport bar (processed mode only — native controls
// can't represent a live pipe's real duration).
function _setCustomCtl(on) {
    if (!_ctlBar || !_videoEl) return;
    _ctlBar.style.display = on ? 'flex' : 'none';
    _videoEl.controls = !on;
}

// Keep the custom transport in sync: ffprobe duration as max, absolute time.
function _syncTransport() {
    if (!_transcoding) return;
    const video = _videoEl, ctl = _ctlBar;
    if (!video || !ctl) return;
    const seekEl = ctl.querySelector('[data-testid="vs-ctl-seek"]');
    const curEl = ctl.querySelector('[data-testid="vs-ctl-cur"]');
    const durEl = ctl.querySelector('[data-testid="vs-ctl-dur"]');
    if (!seekEl) return;
    const d = _effDuration(video);
    seekEl.max = String(d > 0 ? d : 100);
    durEl.textContent = d > 0 ? fmtTime(d) : '--:--';
    curEl.textContent = fmtTime(_absTime(video));
    if (!seekEl.matches(':active')) seekEl.value = String(_absTime(video));
}
function _thumbUrl(p, w = 480) { return `/api/videos/thumbnail?path=${encodeURIComponent(p)}&w=${w}&token=${_token()}`; }

// TMDB (Phase 6): locally cached artwork + display titles. Files are never renamed —
// tmdb.title is display-only, and the ffmpeg frame grab stays as image fallback.
function _tmdbArtUrl(item, preferPoster = false) {
    const t = item && item.tmdb;
    if (!t) return '';
    const f = preferPoster ? (t.poster_file || t.backdrop_file) : (t.backdrop_file || t.poster_file);
    return f ? `/api/videos/tmdb/image?file=${encodeURIComponent(f)}&token=${_token()}` : '';
}

function _displayTitle(item) {
    const tm = item && item.tmdb;
    if (item.kind === 'episode') return item.title || `Episode ${item.episode}`;   // TMDB title is the show name, not the episode
    return (tm && tm.title) || item.title || item.name;
}

function _artImgHtml(item, w = 480, preferPoster = false) {
    const tmdb = _tmdbArtUrl(item, preferPoster);
    const ff = _thumbUrl(item.path, w);
    const src = tmdb || ff;
    const alt = (tmdb && tmdb !== ff) ? ff : '';
    return `<img data-alt="${escapeAttr(alt)}" src="${src}" loading="lazy" style="width:100%;height:100%;object-fit:cover;" onerror="if(this.dataset.alt&&!this.dataset.fb){this.src=this.dataset.alt;this.dataset.fb='1';}else{this.style.display='none';const n=this.nextElementSibling;if(n)n.style.display='flex'}">`;
}
function _rawUrl(p) { return `/api/files/raw?path=${encodeURIComponent(p)}&token=${_token()}`; }

async function _api(path, options = {}) {
    const resp = await apiFetch(path, options);
    if (!resp.ok) {
        throw new Error(await readErrorDetail(resp));
    }
    return resp.json();
}

function fmtBytes(n) {
    if (!n || n < 0) return '';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function fmtTime(sec) {
    if (!sec || !isFinite(sec)) return '0:00';
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtDate(ts) {
    if (!ts) return '';
    try { return new Date(ts * 1000).toLocaleDateString(); } catch (_) { return ''; }
}

function _toast(msg, isError = false) {
    if (window.showToast) window.showToast(msg, isError ? 'error' : 'success');
    else console.warn('[video-station]', msg);
}

// ── Config ────────────────────────────────────────────────────────────────────

async function _loadConfig() {
    try {
        const d = await _api('/api/videos/config');
        _cfg = { roots: d.roots || [], options: { ..._cfg.options, ...(d.options || {}) },
                 tmdb: d.tmdb || { api_key_set: false, api_key_masked: '', auto_fetch: true, language: 'pl-PL' } };
    } catch (e) {
        console.warn('[video-station] config load failed:', e.message);
    }
}

function _saveCfg(patch) {
    const payload = {
        roots: patch.roots !== undefined ? patch.roots : _cfg.roots,
        options: { ..._cfg.options, ...(patch.options || {}) },
    };
    if (patch.tmdb !== undefined) payload.tmdb = patch.tmdb;   // empty key keeps the stored one
    return apiFetch('/api/videos/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    }).then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        _cfg.roots = d.roots || [];
        _cfg.options = { sort: 'name', view: 'grid', ...(d.options || {}) };
        _cfg.tmdb = d.tmdb || _cfg.tmdb;   // server returns the masked view
    }).catch((e) => { _toast('Failed to save library settings: ' + e.message, true); throw e; });
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function renderVideoStation(winBody) {
    // Tear down any previous instance (player stream, subtitle blob, key handler).
    if (_videoEl) { try { _videoEl.pause(); } catch (_) {} _videoEl = null; }
    if (_subBlobUrl) { URL.revokeObjectURL(_subBlobUrl); _subBlobUrl = null; }
    removeEventListener('keydown', _onKey); _keyOn = false;
    const oldPk = document.getElementById('vs-picker'); if (oldPk) oldPk.remove();

    _body = winBody;
    _path = null; _q = ''; _playerPath = null;
    _playerMax = false;
    _tmdbAutoDone = false;
    _loadMyList();
    _sidebarFolders = []; _resumes = {};
    _listing = { path: null, parent: null, folders: [], videos: [] };
    _viewVideos = [];

    winBody.innerHTML = `<div class="vs-skel-shell">
        <div class="vs-skel" style="height:clamp(300px,48vh,520px);border-radius:0;"></div>
        <div style="padding:34px 4% 0;"><div class="vs-skel" style="height:18px;width:190px;margin-bottom:14px;"></div>
            <div style="display:flex;gap:9px;">${Array.from({ length: 7 }, () => '<div class="vs-skel" style="width:156px;aspect-ratio:2/3;"></div>').join('')}</div></div>
        <div style="padding:30px 4% 0;"><div class="vs-skel" style="height:18px;width:150px;margin-bottom:14px;"></div>
            <div style="display:flex;gap:9px;">${Array.from({ length: 5 }, () => '<div class="vs-skel" style="width:234px;aspect-ratio:16/9;"></div>').join('')}</div></div>
    </div>`;
    await _loadConfig();
    if (!_active()) return;
    _renderShell();
}

// ── Shell (sidebar + toolbar + content) ───────────────────────────────────────


// ── Shell: Netflix-style top nav + content area ─────────────────────────────
function _renderShell() {
    if (!_body) return;
    const css = `
        /* Netflix-style palette — scoped overrides of the global theme vars */
        .vs-shell{--surface-0:#141414;--surface-1:#1b1b20;--surface-2:#2a2a31;--border:rgba(255,255,255,.09);--text-1:#fff;--text-2:rgba(255,255,255,.72);--text-3:rgba(255,255,255,.45);--accent:#e50914;--accent-hover:#ff2b36;background:#141414;color:#fff;font-family:'Helvetica Neue',Helvetica,Arial,system-ui,sans-serif;}
        .vs-shell ::-webkit-scrollbar{width:10px;height:10px}
        .vs-shell ::-webkit-scrollbar-thumb{background:rgba(255,255,255,.16);border-radius:8px;border:3px solid transparent;background-clip:content-box;}
        .vs-shell ::-webkit-scrollbar-track{background:transparent}
        /* white primary CTA (Netflix Play button) */
        .vs-shell .btn-primary{background:#fff;color:#141414;font-weight:700;border:none;}
        .vs-shell .btn-primary:hover{opacity:.85;transform:none;}
        #vs-nav { position:absolute; top:0; left:0; right:0; z-index:50; padding:0 4%;
            transition:background .35s ease, box-shadow .35s ease;
            background:linear-gradient(180deg, rgba(0,0,0,.72) 0%, rgba(0,0,0,.35) 60%, rgba(0,0,0,0) 100%); }
        #vs-nav.vs-solid { background:#141414; box-shadow:0 2px 10px rgba(0,0,0,.55); }
        .vs-nav-inner { display:flex; align-items:center; gap:28px; height:58px; }
        .vs-brand { color:#e50914; font-weight:900; font-size:19px; letter-spacing:.6px; cursor:pointer;
            text-transform:uppercase; white-space:nowrap; user-select:none; line-height:1.2; }
        .vs-links { display:flex; gap:18px; flex:1; min-width:0; overflow:hidden; }
        .vs-link { font-size:13.5px; color:#e5e5e5; opacity:.72; cursor:pointer; transition:opacity .2s, color .2s; white-space:nowrap; user-select:none; }
        .vs-link:hover { opacity:1; }
        .vs-link.active { color:#fff; font-weight:600; opacity:1; }
        .vs-nav-right { display:flex; align-items:center; gap:12px; margin-left:auto; flex-shrink:0; }
        .vs-iconbtn { background:none; border:none; color:#fff; cursor:pointer; padding:0; display:flex;
            align-items:center; justify-content:center; width:30px; height:30px; border-radius:50%; transition:background .2s; }
        .vs-iconbtn:hover { background:rgba(255,255,255,.14); }
        .vs-search-wrap { display:flex; align-items:center; }
        .vs-search-wrap input { width:0; opacity:0; border:1px solid transparent; background:rgba(0,0,0,.75); color:#fff;
            font-size:13px; padding:6px 0; margin-right:0; outline:none; transition:width .28s ease, opacity .2s ease, padding .28s ease, border-color .2s; }
        .vs-search-wrap.open input { width:215px; opacity:1; padding:6px 10px; margin-right:8px; border-color:#fff; }
        .vs-navcount { font-size:11.5px; color:#9a9a9a; white-space:nowrap; user-select:none; }

        #vs-main { position:absolute; inset:0; overflow-y:auto; overscroll-behavior:contain; scrollbar-width:thin; scrollbar-color:#4d4d4d transparent; }
        #vs-content { min-height:100%; display:flex; flex-direction:column; }
        #vs-main.vs-player-mode { overflow:hidden; }
        #vs-main.vs-player-mode > #vs-content { height:100%; min-height:0; }

        /* Hero billboard */
        .vs-hero { position:relative; flex-shrink:0; height:clamp(300px,48vh,520px); background:#0b0b0f; overflow:hidden; cursor:pointer; }
        .vs-hero--detail { height:clamp(260px,40vh,420px); }
        .vs-hero-bg { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; filter:brightness(.78) saturate(1.05); }
        .vs-hero-grad { position:absolute; inset:0;
            background:linear-gradient(180deg, rgba(20,20,20,.42) 0%, rgba(20,20,20,0) 32%, rgba(20,20,20,.9) 82%, #141414 100%),
                       linear-gradient(90deg, rgba(20,20,20,.78) 0%, rgba(20,20,20,.25) 46%, rgba(20,20,20,0) 72%); }
        .vs-hero-body { position:absolute; left:4%; right:4%; bottom:9vh; z-index:2; display:flex; flex-direction:column; gap:11px; max-width:660px; pointer-events:none; }
        .vs-hero-eyebrow { display:flex; align-items:center; gap:8px; font-size:12.5px; letter-spacing:3px; color:#d8d8d8; font-weight:700; user-select:none; }
        .vs-hero-eyebrow b { color:#e50914; font-size:15px; letter-spacing:.5px; }
        .vs-hero-title { margin:0; font-size:clamp(26px,3.6vw,44px); line-height:1.06; font-weight:800; color:#fff; text-shadow:0 2px 16px rgba(0,0,0,.65); }
        .vs-hero-meta { display:flex; align-items:center; gap:9px; flex-wrap:wrap; font-size:13.5px; color:#e8e8e8; font-weight:600; text-shadow:0 1px 6px rgba(0,0,0,.6); }
        .vs-hero-meta .dot { opacity:.45; font-weight:400; }
        .vs-hero-overview { margin:0; font-size:13.5px; line-height:1.5; color:rgba(255,255,255,.8); max-width:560px; text-shadow:0 1px 8px rgba(0,0,0,.7);
            display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
        .vs-hero-btns { display:flex; gap:10px; margin-top:4px; pointer-events:auto; }
        .vs-btn-play { background:#fff; color:#000; border:none; font-size:15.5px; font-weight:700; padding:9px 26px; border-radius:4px; cursor:pointer;
            display:inline-flex; align-items:center; gap:8px; transition:background .15s; }
        .vs-btn-play:hover { background:rgba(255,255,255,.78); }
        .vs-btn-info { background:rgba(109,109,110,.5); color:#fff; border:none; font-size:15.5px; font-weight:600; padding:9px 22px; border-radius:4px; cursor:pointer;
            display:inline-flex; align-items:center; gap:8px; transition:background .15s; }
        .vs-btn-info:hover { background:rgba(109,109,110,.32); }

        /* Rows + cards */
        .vs-rowsec { position:relative; margin-top:34px; flex-shrink:0; }
        .vs-rowsech { display:flex; align-items:center; justify-content:space-between; padding:0 4%; margin-bottom:2px; }
        .vs-rowtitle { font-size:16.5px; font-weight:700; color:#e5e5e5; letter-spacing:.2px; margin:0; user-select:none; }
        .vs-rowwrap { position:relative; }
        .vs-row { display:flex; gap:9px; overflow-x:auto; padding:84px 4%; margin:-68px 0; scrollbar-width:none; scroll-behavior:smooth; }
        .vs-row::-webkit-scrollbar { display:none; }
        .vs-arrow { position:absolute; top:16px; bottom:16px; width:44px; z-index:25; border:none; background:rgba(20,20,20,.72); color:#fff; cursor:pointer;
            display:flex; align-items:center; justify-content:center; opacity:0; transition:opacity .2s; }
        .vs-arrow-l { left:0; border-radius:0 6px 6px 0; }
        .vs-arrow-r { right:0; border-radius:6px 0 0 6px; }
        .vs-rowwrap:hover .vs-arrow { opacity:1; }

        .vs-card { position:relative; flex:0 0 auto; width:234px; cursor:pointer; background:#181818; border-radius:6px; transition:z-index 0s; z-index:1; }
        .vs-card-title { margin:7px 2px 0; font-size:12.5px; font-weight:600; color:#dcdcdc; line-height:1.32;
            display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
            word-break:break-word; transition:color .15s; }
        .vs-card:hover .vs-card-title { color:#fff; }
        .vs-card--portrait { width:156px; }
        .vs-card:hover { z-index:30; }
        .vs-card-art { position:relative; aspect-ratio:16/9; border-radius:6px; overflow:hidden; background:#000; display:flex; align-items:center; justify-content:center; }
        .vs-card--portrait .vs-card-art { aspect-ratio:2/3; }
        .vs-emoji-fb { display:none; width:100%; height:100%; align-items:center; justify-content:center; font-size:34px; }
        .vs-chip-q { position:absolute; top:6px; right:6px; z-index:5; background:rgba(0,0,0,.72); color:#fff; font-size:10px; font-weight:700; letter-spacing:.4px; padding:2px 6px; border-radius:3px; }
        .vs-prog { position:absolute; left:0; right:0; bottom:0; height:4px; background:rgba(255,255,255,.28); z-index:4; }
        .vs-prog i { display:block; height:100%; background:#e50914; }
        .vs-cw-x { position:absolute; top:6px; left:6px; z-index:6; width:22px; height:22px; border-radius:50%; border:none; cursor:pointer;
            background:rgba(0,0,0,.72); color:#fff; font-size:12px; line-height:1; display:flex; align-items:center; justify-content:center; opacity:0; transition:opacity .15s; }
        .vs-card:hover .vs-cw-x { opacity:1; }

        /* Netflix-style hover popup panel */
        .vs-card-panel { position:absolute; top:6px; left:-7%; width:114%; z-index:8; background:#181818; border-radius:8px; padding:10px 12px 11px;
            box-shadow:0 14px 30px rgba(0,0,0,.75); opacity:0; transform:scale(.9) translateY(8px); transform-origin:top center; pointer-events:none;
            transition:opacity .16s ease .38s, transform .2s ease .38s; }
        .vs-card:hover .vs-card-panel { opacity:1; transform:none; pointer-events:auto; }
        .vs-cp-top { display:flex; align-items:center; gap:7px; margin-bottom:8px; }
        .vs-cbtn { width:30px; height:30px; border-radius:50%; border:1.6px solid rgba(255,255,255,.4); background:rgba(42,42,42,.8); color:#fff; cursor:pointer;
            display:flex; align-items:center; justify-content:center; padding:0; transition:border-color .15s, background .15s; }
        .vs-cbtn:hover { border-color:#fff; }
        .vs-cbtn-play { background:#fff; color:#000; border-color:#fff; font-size:12px; }
        .vs-cbtn-play:hover { background:rgba(255,255,255,.8); }
        .vs-cp-title { font-size:13px; font-weight:700; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:3px; }
        .vs-cp-meta { display:flex; align-items:center; gap:6px; flex-wrap:wrap; font-size:11.5px; color:#b9b9b9; }
        .vs-cp-meta .dot { opacity:.45; }

        /* Page headers, grids, folders */
        .vs-pagehead { padding:78px 4% 4px; display:flex; align-items:center; gap:6px; flex-wrap:wrap; user-select:none; }
        .vs-pagehead h2 { font-size:25px; font-weight:800; margin:0; color:#fff; letter-spacing:.2px; }
        .vs-crumb { font-size:13.5px; color:#9a9a9a; cursor:pointer; transition:color .15s; white-space:nowrap; }
        .vs-crumb:hover { color:#fff; text-decoration:underline; }
        .vs-crumb.current { color:#fff; font-weight:700; cursor:default; }
        .vs-crumb-sep { color:#6d6d6e; font-size:13px; user-select:none; }
        .vs-folders { display:grid; grid-template-columns:repeat(auto-fill,minmax(205px,1fr)); gap:10px; padding:14px 4% 4px; align-content:start; }
        .vs-folder-tile { position:relative; aspect-ratio:16/9; border-radius:6px; background:#181818; cursor:pointer; overflow:hidden; display:flex; flex-direction:column;
            justify-content:center; gap:4px; padding:0 14px; transition:background .15s, transform .12s; }
        .vs-folder-tile:hover { background:#232323; transform:scale(1.02); z-index:5; }
        .vs-ft-icon { font-size:26px; line-height:1; }
        .vs-ft-name { font-size:13px; font-weight:600; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .vs-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(215px,1fr)); gap:44px 12px; padding:18px 4% 46px; align-content:start; }
        .vs-grid .vs-card { width:auto; }
        .vs-grid--posters { display:grid; grid-template-columns:repeat(auto-fill,minmax(158px,1fr)); gap:22px 12px; padding:18px 4% 46px; align-content:start; }
        .vs-pcard { cursor:pointer; min-width:0; }
        .vs-pcard-art { position:relative; aspect-ratio:2/3; border-radius:6px; overflow:hidden; background:#000; display:flex; align-items:center; justify-content:center;
            transition:transform .15s ease, box-shadow .15s ease; }
        .vs-pcard:hover .vs-pcard-art { transform:scale(1.035); box-shadow:0 10px 26px rgba(0,0,0,.55); }
        .vs-pcard-art .vs-emoji-fb { font-size:40px; }
        .vs-pcard-play { position:absolute; inset:0; z-index:6; display:flex; align-items:center; justify-content:center; opacity:0; transition:opacity .15s; background:rgba(0,0,0,.25); }
        .vs-pcard:hover .vs-pcard-play { opacity:1; }
        .vs-pcard-play i { width:46px; height:46px; border-radius:50%; border:2px solid rgba(255,255,255,.8); background:rgba(20,20,20,.62);
            display:flex; align-items:center; justify-content:center; color:#fff; }
        .vs-pcard-tmdb { position:absolute; top:6px; right:6px; z-index:7; width:26px; height:26px; border-radius:50%; border:none; cursor:pointer;
            background:rgba(0,0,0,.72); color:#fff; display:flex; align-items:center; justify-content:center; opacity:0; transition:opacity .15s; }
        .vs-pcard:hover .vs-pcard-tmdb { opacity:1; }
        .vs-pcard-title { margin-top:7px; font-size:12.5px; font-weight:600; color:#e6e6e6; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .vs-pcard-meta { margin-top:2px; font-size:11px; color:#8c8c8c; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .vs-list { display:flex; flex-direction:column; gap:5px; padding:10px 4% 36px; }
        .vs-listrow { display:flex; align-items:center; gap:12px; padding:7px 10px; border-radius:8px; cursor:pointer; background:#181818; transition:background .15s; }
        .vs-listrow:hover { background:#232323; }

        /* ── Cinematic shine: Ken Burns hero, ambient glow, hover sweep ── */
        .vs-hero-bg { animation:vs-kenburns 38s ease-in-out infinite alternate; will-change:transform; }
        @keyframes vs-kenburns { from { transform:scale(1.02); } to { transform:scale(1.1) translate3d(-1.2%,-1.5%,0); } }
        .vs-hero::after { content:''; position:absolute; inset:0; z-index:1; pointer-events:none;
            background:radial-gradient(120% 85% at 16% 88%, rgba(229,9,20,.17) 0%, rgba(229,9,20,0) 58%); }
        .vs-hero-meta span { background:rgba(255,255,255,.09); border:1px solid rgba(255,255,255,.17);
            border-radius:3px; padding:1px 7px; -webkit-backdrop-filter:blur(4px); backdrop-filter:blur(4px); }
        .vs-hero-meta .dot { background:none; border:none; padding:0; }
        .vs-card-art::after { content:''; position:absolute; inset:0; z-index:3; pointer-events:none; opacity:0;
            background:linear-gradient(115deg, rgba(255,255,255,0) 34%, rgba(255,255,255,.17) 48%, rgba(255,255,255,0) 62%);
            transform:translateX(-70%); }
        .vs-card:hover .vs-card-art::after { opacity:1; animation:vs-sweep .8s ease-out forwards; }
        @keyframes vs-sweep { from { transform:translateX(-70%); } to { transform:translateX(70%); } }
        .vs-rowsec { animation:vs-fadeup .45s ease both; }
        @keyframes vs-fadeup { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }
        .vs-rowsech:hover .vs-rowtitle { color:#fff; }
        .vs-rowtitle { transition:color .2s; }
        .vs-btn-play, .vs-btn-info { transition:background .15s, transform .15s; }
        .vs-btn-play:hover, .vs-btn-info:hover { transform:scale(1.03); }

        /* Empty / welcome */
        .vs-empty { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; color:#8c8c8c; font-size:14px; padding:60px 20px; text-align:center; }

        /* ── Netflix polish: hover zoom, rank numerals, NEW badge, shimmer ── */
        .vs-card { transition:transform .18s ease, box-shadow .18s ease; }
        .vs-card:hover { transform:scale(1.045); box-shadow:0 12px 30px rgba(0,0,0,.62); }
        .vs-badge { position:absolute; top:6px; left:6px; z-index:7; background:#e50914; color:#fff; font-size:9.5px; font-weight:800;
            letter-spacing:.7px; padding:2px 5px; border-radius:2px; text-transform:uppercase; pointer-events:none; }
        .vs-in-list { border-color:#fff !important; background:#fff !important; color:#141414 !important; }
        .vs-top10 { position:relative; display:flex; align-items:flex-end; flex:0 0 auto; cursor:pointer; }
        .vs-top10-num { font-family:'Helvetica Neue',Arial,sans-serif; font-weight:900; font-size:104px; line-height:.72; letter-spacing:-.07em;
            color:#141414; -webkit-text-stroke:3.5px rgba(255,255,255,.55); margin-right:-14px; user-select:none; transition:-webkit-text-stroke-color .2s; }
        .vs-top10:hover .vs-top10-num { -webkit-text-stroke-color:#fff; }
        .vs-top10 .vs-card { margin-bottom:6px; }
        .vs-skel { background:linear-gradient(90deg,#1b1b20 25%,#26262c 37%,#1b1b20 63%); background-size:400% 100%;
            animation:vs-shimmer 1.4s ease-in-out infinite; border-radius:6px; }
        @keyframes vs-shimmer { 0% { background-position:100% 0; } 100% { background-position:-100% 0; } }
        .vs-skel-shell { position:absolute; inset:0; background:#141414; overflow:hidden; }
        .vs-pcard-list { right:38px !important; }
        .vs-pcard-list.vs-in-list { opacity:1 !important; }
    `;
    _body.innerHTML = `<style>${css}</style>
        <div data-testid="vs-shell" class="vs-shell" style="position:absolute;inset:0;">
            <header id="vs-nav" data-testid="vs-nav">
                <div class="vs-nav-inner">
                    <span class="vs-brand" onclick="_vsGoHome()">Video Station</span>
                    <nav class="vs-links">
                        <span class="vs-link" data-mode="home" onclick="_vsGoHome()">Home</span>
                        <span class="vs-link" data-mode="series" onclick="_vsGoSeries()">Series</span>
                        <span class="vs-link" data-mode="movies" onclick="_vsGoMovies()">Movies</span>
                        <span class="vs-link" data-mode="mylist" onclick="_vsOpenMyList()">My List</span>
                        <span class="vs-link" data-mode="browse" onclick="_vsNavTo(null)">All Videos</span>
                    </nav>
                    <div class="vs-nav-right">
                        <div id="vs-search-wrap" class="vs-search-wrap">
                            <input id="vs-search-input" type="text" placeholder="Titles, shows…" oninput="_vsOnSearch(this.value)" />
                            <button class="vs-iconbtn" onclick="_vsToggleSearch()" title="Search">
                                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/></svg>
                            </button>
                        </div>
                        <span data-testid="vs-count" class="vs-navcount"></span>
                        <button class="vs-iconbtn" onclick="_vsShowPicker()" title="Add video folder">
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
                        </button>
                        <button class="vs-iconbtn" data-testid="vs-settings-btn" onclick="_vsShowSettings()" title="Video Station settings">
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                        </button>
                    </div>
                </div>
            </header>
            <main id="vs-main" data-testid="vs-main"><div id="vs-content" data-testid="vs-content"></div></main>
        </div>`;
    const main = document.getElementById('vs-main');
    if (main) main.addEventListener('scroll', () => _setNavSolid(main.scrollTop > 8 || !_navIsHome()), { passive: true });
    _reloadView();
}

function _navIsHome() { return !_playerPath && _mode === 'home' && !_showDetail; }

function _setNavSolid(solid) {
    const n = document.getElementById('vs-nav');
    if (n) n.classList.toggle('vs-solid', !!solid);
}

function _scrollTop() {
    const m = document.getElementById('vs-main');
    if (m) m.scrollTop = 0;
}

function _renderNavState() {
    const active = _playerPath ? '' : (_mode === 'search' ? ((_preSearchMode && _preSearchMode.mode) || '') : (_showDetail ? 'series' : _mode));
    document.querySelectorAll('#vs-nav .vs-link').forEach(el => el.classList.toggle('active', el.dataset.mode === active));
    const m = document.getElementById('vs-main');
    _setNavSolid(!m || m.scrollTop > 8 || !_navIsHome());
}

// ── Global search (client-side over the full library walk) ─────────────────
function _toggleSearch() {
    const w = document.getElementById('vs-search-wrap');
    if (!w) return;
    const open = w.classList.toggle('open');
    const inp = document.getElementById('vs-search-input');
    if (open && inp) setTimeout(() => inp.focus(), 80);
}

function _closeSearch() {
    const w = document.getElementById('vs-search-wrap');
    const inp = document.getElementById('vs-search-input');
    if (w) w.classList.remove('open');
    if (inp) inp.value = '';
    if (_mode === 'search') {
        _scrollTop();
        _q = '';
        const prev = _preSearchMode || { mode: 'home', path: null };
        _preSearchMode = null;
        _showDetail = null;
        _mode = prev.mode || 'home';
        _path = prev.path || null;
        _reloadView();
    }
}

function _navReset() {
    const w = document.getElementById('vs-search-wrap'); if (w) w.classList.remove('open');
    const inp = document.getElementById('vs-search-input'); if (inp) inp.value = '';
}

function _onSearchInput(v) {
    clearTimeout(_searchTimer);
    const nv = (v || '').trim();
    _searchTimer = setTimeout(async () => {
        if (!_active()) return;
        if (nv === '') { _closeSearch(); return; }
        if (_q === nv && _mode === 'search') return;
        if (_playerPath) _closePlayer();
        if (_mode !== 'search') {
            _preSearchMode = { mode: _showDetail ? 'series' : _mode, path: _path };
            _mode = 'search'; _showDetail = null;
        }
        _q = nv;
        if (!_allVideos.length) await _loadAllVideos();
        if (!_active()) return;
        _viewVideos = _sortVideos(_searchResults(), 'name');
        _renderContent();
    }, 250);
}

function _searchResults() {
    const q = (_q || '').toLowerCase();
    if (!q) return [];
    return _allVideos.filter(v => {
        const hay = [v.title, v.name, v.show, (v.tmdb && v.tmdb.title), v.folder].filter(Boolean).join(' ').toLowerCase();
        if (hay.includes(q)) return true;
        if (v.kind === 'episode' && q.length >= 2) {
            const ep = `s${String(v.season || 0)}e${String(v.episode || 0)}`.replace(/\s/g, '');
            if (q.replace(/\s/g, '').includes(ep)) return true;
        }
        return false;
    });
}

// ── Navigation actions ───────────────────────────────────────────────────────
function _goHome() {
    if (_playerPath) _closePlayer();
    _mode = 'home'; _showDetail = null; _path = null; _q = ''; _preSearchMode = null;
    _navReset(); _scrollTop(); _reloadView();
}

function _goMovies() {
    if (_playerPath) _closePlayer();
    _mode = 'movies'; _showDetail = null; _path = null; _q = ''; _preSearchMode = null;
    _navReset(); _scrollTop(); _reloadView();
}

function _goSeries() {
    if (_playerPath) _closePlayer();
    _mode = 'series'; _showDetail = null; _path = null; _q = ''; _preSearchMode = null;
    _navReset(); _scrollTop(); _reloadView();
}

function _openShow(i) {
    const s = _showsList[i];
    if (!s) return;
    _openShowByKey(s.show);
}

async function _openShowByKey(key) {
    if (!key) return;
    if (_playerPath) _closePlayer();
    _mode = 'series'; _showDetail = key; _q = ''; _preSearchMode = null;
    _navReset(); _scrollTop();
    await _loadAllVideos();
    if (!_active()) return;
    _renderContent();
}

function _backToSeries() {
    _showDetail = null; _q = ''; _preSearchMode = null;
    _navReset(); _scrollTop(); _renderContent();   // grid re-renders from cached walk
}

function _navTo(path) {
    if (_playerPath) _closePlayer();
    _mode = 'browse'; _showDetail = null; _q = ''; _preSearchMode = null;
    _path = path || null;
    _navReset(); _scrollTop(); _reloadView();
}

// ── Data loading / views ──────────────────────────────────────────────────────
async function _loadHomeData() {
    const [h, res] = await Promise.all([
        _api('/api/videos/home?limit=12'),
        _api('/api/videos/resume/all').catch(() => ({ resumes: {} })),
    ]);
    if (!_active()) return;
    _homeData = { continue_watching: h.continue_watching || [], recently_added: h.recently_added || [] };
    _resumes = res.resumes || {};
}

async function _loadAllVideos() {
    const [lib, res] = await Promise.all([
        _api('/api/videos/library'),
        _api('/api/videos/resume/all').catch(() => ({ resumes: {} })),
    ]);
    if (!_active()) return;
    _allVideos = lib.videos || [];
    _resumes = res.resumes || {};
}

async function _reloadView() {
    if (!_active()) return;
    try {
        if (_mode === 'home') {
            await Promise.all([_loadHomeData(), _allVideos.length ? Promise.resolve() : _loadAllVideos()]);
        } else if (_mode === 'movies' || _mode === 'series' || _mode === 'mylist') {
            await _loadAllVideos();
        } else if (_mode === 'search') {
            if (!_allVideos.length) await _loadAllVideos();
        } else {
            const params = new URLSearchParams();
            if (_path) params.set('path', _path);
            const qs = params.toString();
            const [lib, res] = await Promise.all([
                _api('/api/videos/library' + (qs ? '?' + qs : '')),
                _api('/api/videos/resume/all').catch(() => ({ resumes: {} })),
            ]);
            if (!_active()) return;
            _listing = { path: lib.path ?? null, parent: lib.parent || null, folders: lib.folders || [], videos: lib.videos || [] };
            _resumes = res.resumes || {};
        }
        if (!_active()) return;
        _applySort();
        _maybeAutoTmdbFetch();
    } catch (e) {
        console.warn('[video-station] reload failed:', e.message);
        const c = document.getElementById('vs-content');
        if (c) c.innerHTML = `<div style="padding:24px;color:#f87171;font-size:13px;">Failed to load library: ${escapeHtml(e.message)}</div>`;
    }
}

function _sortVideos(videos, sortKey) {
    const sort = sortKey || _cfg.options.sort || 'name';
    const v = [...videos];
    if (sort === 'date_desc') v.sort((a, b) => (b.modified || 0) - (a.modified || 0));
    else if (sort === 'size_desc') v.sort((a, b) => (b.size || 0) - (a.size || 0));
    else v.sort((a, b) => String(a.title || a.name).localeCompare(String(b.title || a.name), undefined, { sensitivity: 'base' }));
    return v;
}

function _applySort() {
    if (_mode === 'movies' || _mode === 'series' || _mode === 'mylist') { _renderContent(); return; }   // these views compute their own lists
    if (_mode === 'search') { _viewVideos = _sortVideos(_searchResults(), 'name'); _renderContent(); return; }
    _viewVideos = _sortVideos(_listing.videos);
    _renderContent();
}

function _onSortChange(v) {
    _cfg.options.sort = v;
    _saveCfg({ options: { sort: v } }).catch(() => {});
    _applySort();
}

function _onViewToggle(v) {
    _cfg.options.view = v;
    _saveCfg({ options: { view: v } }).catch(() => {});
    _renderContent();
}

function _renderContent() {
    const c = document.getElementById('vs-content');
    if (!c || !_active()) return;
    const m = document.getElementById('vs-main');
    if (m) m.classList.toggle('vs-player-mode', !!_playerPath);
    if (!_cfg.roots.length) { _renderWelcome(c); }
    else if (_playerPath) { _renderPlayer(c); }
    else if (_mode === 'home') { _renderHome(c); }
    else if (_mode === 'movies') { _renderMovies(c); }
    else if (_mode === 'series' && _showDetail) { _renderShowDetail(c); }
    else if (_mode === 'series') { _renderSeriesGrid(c); }
    else if (_mode === 'search') { _renderSearchResults(c); }
    else if (_mode === 'mylist') { _renderMyList(c); }
    else { _renderLibrary(c); }
    _renderNavState();
}

// ── Shared presentation helpers ──────────────────────────────────────────────
function _setCount(t) {
    const el = document.querySelector('[data-testid="vs-count"]');
    if (el) el.textContent = t;
}

function _qualityChip(q) {
    if (!q) return '';
    return `<span class="vs-chip-q">${escapeHtml(String(q).toUpperCase())}</span>`;
}

function _resumeBarHtml(path) {
    const r = _resumes[path];
    if (!r || !r.duration || r.time < 5 || r.time >= r.duration * 0.97) return '';
    const pct = Math.min(100, (r.time / r.duration) * 100).toFixed(1);
    return `<div class="vs-prog" title="Resume at ${fmtTime(r.time)} of ${fmtTime(r.duration)}"><i style="width:${pct}%"></i></div>`;
}

function _resumeInfo(item) {
    if (item && item.resume_time != null) return { time: item.resume_time, duration: item.resume_duration };
    return (_resumes[item.path] || null);
}

// ── My List (per-user watchlist, kept in localStorage like the desktop layout) ─
function _listUser() {
    try {
        const t = getToken() || '';
        return JSON.parse(atob(t.split('.')[1])).username || 'anon';
    } catch (_) { return 'anon'; }
}

function _listKey() { return 'ethos-vs-list:' + _listUser(); }

function _loadMyList() {
    _myList = new Set();
    try {
        const arr = JSON.parse(localStorage.getItem(_listKey()) || '[]');
        if (Array.isArray(arr)) for (const p of arr) if (typeof p === 'string' && p) _myList.add(p);
    } catch (_) { /* ignore corrupt cache */ }
}

function _saveMyList() {
    try { localStorage.setItem(_listKey(), JSON.stringify([..._myList])); } catch (_) { /* quota */ }
}

function _listBtnHtml(path, size = 13, extraClass = '') {
    const on = _myList.has(path);
    return `<button class="vs-cbtn ${extraClass}${on ? ' vs-in-list' : ''}" data-list-btn="${escapeAttr(path)}"
        title="${on ? 'Remove from My List' : 'Add to My List'}" onclick="_vsListToggle(event, this)">${uiIcon(on ? 'check' : 'plus', size)}</button>`;
}

function _itemTitleForPath(path) {
    const pools = [_rowItems, _viewVideos, _allVideos, _homeData.continue_watching || [], _homeData.recently_added || []];
    for (const pool of pools) {
        const hit = (pool || []).find(v => v && v.path === path);
        if (hit) return _displayTitle(hit);
    }
    return '';
}

// Called from inline onclick with (event, buttonElement).
function _onListToggle(ev, btn) {
    if (ev && ev.stopPropagation) ev.stopPropagation();
    const path = btn && btn.getAttribute ? btn.getAttribute('data-list-btn') : '';
    if (!path) return;
    _toggleList(ev, path, _itemTitleForPath(path));
}

function _toggleList(ev, path, title) {
    if (ev && ev.stopPropagation) ev.stopPropagation();
    if (!path) return;
    const adding = !_myList.has(path);
    if (adding) _myList.add(path); else _myList.delete(path);
    _saveMyList();
    const label = title ? ` “${title}”` : '';
    _toast(adding ? `Added${label} to My List` : `Removed${label} from My List`);
    document.querySelectorAll('[data-list-btn]').forEach(b => {
        if (b.getAttribute('data-list-btn') !== path) return;
        const ico = b.querySelector('.vs-hero-list-ico');
        if (ico) ico.innerHTML = uiIcon(adding ? 'check' : 'plus', 16);
        else b.innerHTML = uiIcon(adding ? 'check' : 'plus', 13);
        b.title = adding ? 'Remove from My List' : 'Add to My List';
        b.classList.toggle('vs-in-list', adding);
    });
    if (!adding && _mode === 'mylist') _renderContent();   // it no longer belongs in this view
    else if (adding && _mode === 'home') _renderContent(); // My List row appears only once it has items
}

// ── Hero billboard ───────────────────────────────────────────────────────────
let _heroItem = null;   // video item the hero's Play button opens (shows → first episode)

function _pickHero() {
    const cands = [...(_homeData.continue_watching || []), ...(_homeData.recently_added || [])];
    if (!cands.length) return null;
    for (const it of cands) if (_tmdbArtUrl(it)) return it;   // prefer a real backdrop
    return cands[0];
}

function _heroHtml(it, opts = {}) {
    const art = _tmdbArtUrl(it) || _thumbUrl(it.path, 1280);
    const tm = it.tmdb || null;
    const title = opts.title || ((tm && tm.title) || _displayTitle(it));
    const meta = [];
    if (it.kind === 'episode' && !opts.hideEpTag) meta.push(`S${String(it.season || 0).padStart(2, '0')}E${String(it.episode || 0).padStart(2, '0')}`);
    if (tm && tm.year) meta.push(tm.year);
    if (tm && tm.rating != null) meta.push(`★ ${tm.rating}`);
    if (tm && Array.isArray(tm.genres) && tm.genres.length) meta.push(...tm.genres.slice(0, 2));
    if (opts.extraMeta) meta.push(...opts.extraMeta);
    if (it.quality) meta.push(it.quality.toUpperCase());
    const r = _resumeInfo(it);
    let resumeTxt = '';
    if (r && r.duration > 0 && r.time > 5 && r.time < r.duration * 0.97) resumeTxt = ` · Resume at ${fmtTime(r.time)}`;
    const overview = tm && tm.overview ? `<p class="vs-hero-overview" data-testid="vs-hero-overview">${escapeHtml(tm.overview)}</p>` : '';
    return `
        <div data-testid="vs-hero" class="vs-hero${opts.compact ? ' vs-hero--detail' : ''}" onclick="_vsPlayHero()">
            <img class="vs-hero-bg" src="${art}" alt="" onerror="this.style.display='none'">
            <div class="vs-hero-grad"></div>
            <div class="vs-hero-body">
                <div class="vs-hero-eyebrow"><b>VS</b><span>${escapeHtml(opts.eyebrow || 'VIDEO')}</span></div>
                <h2 data-testid="vs-hero-title">${escapeHtml(title)}</h2>
                <div data-testid="vs-hero-meta" class="vs-hero-meta" style="display:flex;align-items:center;gap:9px;flex-wrap:wrap;font-size:13.5px;color:#e8e8e8;font-weight:600;">${meta.map(m => `<span>${escapeHtml(String(m))}</span>`).join('<span class="dot">·</span>')}</div>
                ${overview}
                <div class="vs-hero-btns" onclick="event.stopPropagation()">
                    <button data-testid="vs-hero-play" class="vs-btn-play" onclick="_vsPlayHero()"><svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4.5v15l13-7.5z"/></svg> Play${resumeTxt}</button>
                    <button data-testid="vs-hero-details" class="vs-btn-info" onclick="_vsHeroDetails()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M12 11v5"/></svg> More Info</button>
                    <button data-testid="vs-hero-list" class="vs-btn-info" data-list-btn="${escapeAttr(it.path)}" onclick="_vsListToggle(event, this)"><span class="vs-hero-list-ico" style="display:flex;">${uiIcon(_myList.has(it.path) ? 'check' : 'plus', 16)}</span> My List</button>
                </div>
            </div>
        </div>`;
}

// ── Cards (rows + grids) with Netflix hover popup ────────────────────────────
function _cardMetaBits(item) {
    const bits = [];
    const tm = item.tmdb || null;
    if (tm && tm.rating != null) bits.push(`★ ${tm.rating}`);
    if (tm && tm.year) bits.push(String(tm.year));
    if (item.quality) bits.push(item.quality.toUpperCase());
    if (item.duration > 0) bits.push(fmtTime(item.duration));
    else if (item.size) bits.push(fmtBytes(item.size));
    return bits;
}

function _cardHtml(item, idx, opts = {}) {
    const playFn = opts.play || '_vsPlayRow';
    const arrName = opts.arr || 'row';
    const r = _resumeInfo(item);
    let bar = '';
    if (opts.cw && r && r.duration > 0) {
        const pct = Math.min(100, (r.time / r.duration) * 100).toFixed(1);
        bar = `<div class="vs-prog" title="Resume at ${fmtTime(r.time)} of ${fmtTime(r.duration)}"><i style="width:${pct}%"></i></div>`;
    } else if (opts.cw && r && r.duration > 0 && r.time >= r.duration * 0.97) {
        bar = `<div class="vs-prog" title="Finished"><i style="width:100%"></i></div>`;
    }
    const removeBtn = opts.cw ? `<button class="vs-cw-x" title="Remove from Continue Watching" onclick="_vsRemoveCw(event, ${idx})">${uiIcon('close', 12)}</button>` : '';
    const newBadge = opts.isNew ? '<span class="vs-badge">New</span>' : '';
    const panelTitle = _cardPanelTitle(item);
    const metaBits = _cardMetaBits(item);
    return `
        <div class="vs-card${opts.portrait ? ' vs-card--portrait' : ''}" data-testid="${opts.cw ? 'vs-cw-card' : 'vs-item'}-${idx}" onclick="${playFn}(${idx})" title="${escapeAttr(item.name)}">
            <div class="vs-card-art">
                ${_artImgHtml(item, opts.portrait ? 342 : 480, opts.portrait)}
                <div class="vs-emoji-fb">🎬</div>
                ${newBadge}
                ${(opts.cw || opts.portrait) ? '' : _qualityChip(item.quality)}
                ${bar}${removeBtn}
            </div>
            <div class="vs-card-title">${escapeHtml(panelTitle)}</div>
            <div class="vs-card-panel">
                <div class="vs-cp-top">
                    <button class="vs-cbtn vs-cbtn-play" title="Play" onclick="${playFn}(${idx})"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4.5v15l13-7.5z"/></svg></button>
                    ${_listBtnHtml(item.path)}
                    <button class="vs-cbtn" title="${item.kind === 'episode' ? 'Show details' : 'Info'}" onclick="_vsCardInfo(event, '${arrName}', ${idx})"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M12 11v5"/></svg></button>
                    ${opts.tmdb ? `<button class="vs-cbtn" title="Fetch metadata from TMDB (display only — file name is not changed)" onclick="_vsCardTmdb(event, '${arrName}', ${idx})"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6"/></svg></button>` : ''}
                </div>
                <div class="vs-cp-title">${escapeHtml(panelTitle)}</div>
                ${metaBits.length ? `<div class="vs-cp-meta">${metaBits.map(b => `<span>${escapeHtml(String(b))}</span>`).join('<span class="dot">·</span>')}</div>` : ''}
            </div>
        </div>`;
}

function _cardPanelTitle(item) {
    let t = _displayTitle(item);
    if (item.kind === 'episode') {
        const show = ((item.tmdb && item.tmdb.title) || item.show || '');
        t = `${show ? show + ' · ' : ''}S${String(item.season || 0).padStart(2, '0')}E${String(item.episode || 0).padStart(2, '0')}`;
    }
    return t;
}

// Poster-wall card (grid views) — portrait 2:3, TMDB poster first, title always visible.
function _posterCardHtml(item, idx, opts = {}) {
    const playFn = opts.play || '_vsPlayRow';
    const arrName = opts.arr || 'row';
    const metaBits = _cardMetaBits(item).slice(0, 3);
    const tmdbBtn = opts.tmdb ? `<button class="vs-pcard-tmdb" title="Fetch metadata from TMDB (display only — file name is not changed)" onclick="_vsCardTmdb(event, '${arrName}', ${idx})"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6"/></svg></button>` : '';
    const listBtn = `<button class="vs-pcard-tmdb vs-pcard-list${_myList.has(item.path) ? ' vs-in-list' : ''}" data-list-btn="${escapeAttr(item.path)}"
        title="${_myList.has(item.path) ? 'Remove from My List' : 'Add to My List'}"
        onclick="_vsListToggle(event, this)">${uiIcon(_myList.has(item.path) ? 'check' : 'plus', 13)}</button>`;
    return `
        <div class="vs-pcard" data-testid="${opts.testid || 'vs-item'}-${idx}" onclick="${playFn}(${idx})" title="${escapeAttr(item.name)}">
            <div class="vs-pcard-art">
                ${_artImgHtml(item, 342, true)}
                <div class="vs-emoji-fb">🎬</div>
                <div class="vs-pcard-play"><i><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4.5v15l13-7.5z"/></svg></i></div>
                ${tmdbBtn}
                ${listBtn}
            </div>
            <div class="vs-pcard-title">${escapeHtml(_cardPanelTitle(item))}</div>
            ${metaBits.length ? `<div class="vs-pcard-meta">${metaBits.map(b => escapeHtml(String(b))).join(' · ')}</div>` : ''}
        </div>`;
}

function _cardItem(arrName, i) { return (arrName === 'view' ? _viewVideos : _rowItems)[i]; }

function _cardTmdb(ev, arrName, i) {
    if (ev && ev.stopPropagation) ev.stopPropagation();
    const it = _cardItem(arrName, i);
    if (!it || !it.path) return;
    if (window._vsTmdbRefreshCard) window._vsTmdbRefreshCard(ev, it.path);
}

function _infoBits(it) {
    const tm = it.tmdb || null;
    return [fmtBytes(it.size), fmtDate(it.modified),
            tm && Array.isArray(tm.genres) && tm.genres.length ? tm.genres.join(', ') : '',
            tm && Array.isArray(tm.cast) && tm.cast.length ? 'Cast: ' + tm.cast.slice(0, 3).join(', ') : '']
        .filter(Boolean);
}

function _cardInfo(ev, arrName, i) {
    if (ev && ev.stopPropagation) ev.stopPropagation();
    const it = _cardItem(arrName, i);
    if (!it) return;
    if (it.kind === 'episode') { _openShowByKey(_showKey(it)); return; }
    const bits = _infoBits(it).join(' · ');
    _toast(`${_displayTitle(it)}${bits ? ' — ' + bits : ''}`);
}

function _rowScroll(btn, dir) {
    const row = btn.parentElement.querySelector('.vs-row');
    if (row) row.scrollBy({ left: dir * row.clientWidth * 0.9, behavior: 'smooth' });
}

async function _removeCw(ev, i) {
    if (ev && ev.stopPropagation) ev.stopPropagation();
    const it = _rowItems[i];
    if (!it || !it.path) return;
    try {
        await apiFetch('/api/videos/resume', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: it.path, time: 0, duration: 0 }),
        });
        const cw = _homeData.continue_watching || [];
        const j = cw.findIndex(x => x.path === it.path);
        if (j >= 0) cw.splice(j, 1);
        delete _resumes[it.path];
        _toast('Removed from Continue Watching');
        if (_active()) { _rowItems = [...cw, ...(_homeData.recently_added || [])]; _renderContent(); }
    } catch (e) { _toast('Could not remove: ' + e.message, true); }
}

function _rowSection(title, testid, cardsHtml) {
    return `
        <div class="vs-rowsec">
            <div class="vs-rowsech"><h3 class="vs-rowtitle">${escapeHtml(title)}</h3></div>
            <div class="vs-rowwrap">
                <button class="vs-arrow vs-arrow-l" onclick="_vsRowScroll(this, -1)" title="Scroll left"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>
                <div class="vs-row" data-testid="${testid}">${cardsHtml}</div>
                <button class="vs-arrow vs-arrow-r" onclick="_vsRowScroll(this, 1)" title="Scroll right"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>
            </div>
        </div>`;
}

// ── Home view (hero billboard + Netflix-style category rows) ─────────────────

// Most-watched heuristic: resume order first, then fresh arrivals, then top rated.
function _top10Items(cw, ra, lib) {
    const seen = new Set(); const out = [];
    const push = it => {
        if (!it || !it.path || seen.has(it.path) || out.length >= 10) return;
        seen.add(it.path); out.push(it);
    };
    [...cw].sort((a, b) => (b.resume_time || 0) - (a.resume_time || 0)).forEach(push);
    ra.forEach(push);
    [...lib].filter(v => v.kind === 'movie')
        .sort((a, b) => ((b.tmdb && b.tmdb.rating) ?? -1) - ((a.tmdb && a.tmdb.rating) ?? -1)).forEach(push);
    lib.forEach(push);
    return out;
}

// Genre shelves built from cached TMDB metadata (only genres with enough titles).
function _genreRows(lib) {
    const counts = new Map();
    for (const v of lib) {
        const gs = (v.tmdb && Array.isArray(v.tmdb.genres)) ? v.tmdb.genres : [];
        for (const g of gs) if (typeof g === 'string' && g) counts.set(g, (counts.get(g) || 0) + 1);
    }
    return [...counts.entries()]
        .filter(([, n]) => n >= 4)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([genre]) => ({
            genre,
            items: lib.filter(v => v.tmdb && Array.isArray(v.tmdb.genres) && v.tmdb.genres.includes(genre))
                .sort((a, b) => ((b.tmdb && b.tmdb.rating) ?? -1) - ((a.tmdb && a.tmdb.rating) ?? -1))
                .slice(0, 18),
        }));
}

// "Because you watched X" — same-genre suggestions seeded from what was watched.
function _becauseRow(cw, lib) {
    const seeds = cw.filter(v => v.tmdb && Array.isArray(v.tmdb.genres) && v.tmdb.genres.length);
    for (const seed of seeds) {
        const gs = seed.tmdb.genres;
        const items = lib.filter(v => v.path !== seed.path && v.tmdb && Array.isArray(v.tmdb.genres)
                && v.tmdb.genres.some(g => gs.includes(g)))
            .sort((a, b) => ((b.tmdb && b.tmdb.rating) ?? -1) - ((a.tmdb && a.tmdb.rating) ?? -1))
            .slice(0, 18);
        if (items.length < 3) continue;
        let t = _displayTitle(seed);
        if (t.length > 42) t = t.slice(0, 41) + '…';
        return { title: `Because you watched ${t}`, items };
    }
    return null;
}

function _renderHome(c) {
    const cw = _homeData.continue_watching || [];
    const ra = _homeData.recently_added || [];
    const lib = _allVideos || [];
    if (!cw.length && !ra.length && !lib.length) {
        c.innerHTML = `
            <div style="height:clamp(300px,48vh,520px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:radial-gradient(ellipse at 30% 20%, #1f1a17 0%, #141414 65%);">
                <div style="font-size:48px;">🍿</div>
                <div style="color:#9a9a9a;font-size:14.5px;max-width:380px;text-align:center;line-height:1.5;">Nothing here yet — start watching something and it will show up on your home screen.</div>
                <button class="vs-btn-play" style="margin-top:6px;" onclick="_vsNavTo(null)">Browse All Videos</button>
            </div>`;
        _setCount('');
        return;
    }

    // Continue Watching / Recently Added keep their original indices (testids + handlers).
    _rowItems = [...cw, ...ra];

    let html = '';
    const heroIt = _pickHero() || lib[0] || null;
    if (heroIt) { _heroItem = heroIt; html += _heroHtml(heroIt, {}); }
    else { _heroItem = null; }

    if (cw.length) {
        html += _rowSection('Continue Watching', 'vs-row-cw',
            cw.map((it, i) => _cardHtml(it, i, { cw: true, portrait: true, tmdb: true })).join(''));
    }

    // Top 10 — giant rank numerals, Netflix style
    const top = _top10Items(cw, ra, lib);
    if (top.length >= 3) {
        const off = _rowItems.length;
        for (const it of top) _rowItems.push(it);
        html += _rowSection('Top 10 on this server', 'vs-row-top10', top.map((it, i) =>
            `<div class="vs-top10"><span class="vs-top10-num">${i + 1}</span>${_cardHtml(it, off + i, { portrait: true, tmdb: true })}</div>`).join(''));
    }

    if (ra.length) {
        html += _rowSection('Recently Added', 'vs-row-ra',
            ra.map((it, i) => _cardHtml(it, cw.length + i, { portrait: true, tmdb: true, isNew: true })).join(''));
    }

    const because = _becauseRow(cw, lib);
    if (because) {
        const off = _rowItems.length;
        for (const it of because.items) _rowItems.push(it);
        html += _rowSection(because.title, 'vs-row-because',
            because.items.map((it, i) => _cardHtml(it, off + i, { tmdb: true })).join(''));
    }

    const myItems = lib.filter(v => _myList.has(v.path)).slice(0, 18);
    if (myItems.length) {
        const off = _rowItems.length;
        for (const it of myItems) _rowItems.push(it);
        html += _rowSection('My List', 'vs-row-mylist',
            myItems.map((it, i) => _cardHtml(it, off + i, { portrait: true, tmdb: true })).join(''));
    }

    const movies = lib.filter(v => v.kind === 'movie')
        .sort((a, b) => ((b.tmdb && b.tmdb.rating) ?? -1) - ((a.tmdb && a.tmdb.rating) ?? -1)
            || String(a.title || a.name).localeCompare(String(b.title || b.name)))
        .slice(0, 18);
    if (movies.length) {
        const off = _rowItems.length;
        for (const it of movies) _rowItems.push(it);
        html += _rowSection('Movies', 'vs-row-movies',
            movies.map((it, i) => _cardHtml(it, off + i, { tmdb: true })).join(''));
    }

    // One card per series — clicking opens the episode list instead of playing.
    const shows = lib.some(v => v.kind === 'episode') ? _groupShows().slice(0, 18) : [];
    if (shows.length) {
        const off = _rowItems.length;
        for (const s of shows) _rowItems.push(s.latest);
        html += _rowSection('Series', 'vs-row-series', shows.map((s, i) =>
            _cardHtml(s.latest, off + i, { portrait: true, tmdb: true, play: '_vsRowShow' })).join(''));
    }

    for (const g of _genreRows(lib)) {
        const off = _rowItems.length;
        for (const it of g.items) _rowItems.push(it);
        html += _rowSection(g.genre, 'vs-row-genre',
            g.items.map((it, i) => _cardHtml(it, off + i, { tmdb: true })).join(''));
    }

    c.innerHTML = html;
    _setCount(lib.length ? `${lib.length} in library` : `${cw.length + ra.length} items`);
}

// ── My List view ────────────────────────────────────────────────────────────
function _renderMyList(c) {
    const items = (_allVideos || []).filter(v => _myList.has(v.path));
    _viewVideos = items;
    if (!items.length) {
        c.innerHTML = `<div class="vs-pagehead"><h2>My List</h2></div>
            <div class="vs-empty"><div style="color:#4d4d4d;display:flex;">${uiIcon('plus', 44)}</div>
            <div>Nothing saved yet — hover any title and press the <b style="color:#e5e5e5;">+</b> button to add it here.</div>
            <button class="vs-btn-info" onclick="_vsGoHome()" style="margin-top:6px;">Browse Home</button></div>`;
        _setCount('0 titles');
        return;
    }
    c.innerHTML = `<div class="vs-pagehead"><h2>My List</h2>
            <span style="font-size:12.5px;color:#8c8c8c;margin-left:8px;">saved by ${escapeHtml(_listUser())}</span></div>
        <div class="vs-grid--posters" data-testid="vs-mylist-grid">${items.map((v, i) =>
            _posterCardHtml(v, i, { play: '_vsOpenPlayer', arr: 'view', tmdb: true })).join('')}</div>`;
    _setCount(`${items.length} saved`);
}

function _openMyList() {
    if (_playerPath) _closePlayer();
    _mode = 'mylist'; _showDetail = null; _path = null; _q = ''; _preSearchMode = null;
    _navReset(); _scrollTop(); _reloadView();
}

// ── Media engine status (Settings → Media Engine) ────────────────────────────
async function _renderEngineStatus(force = false) {
    const st = document.getElementById('vs-settings-status');
    if (!st) return;
    const chip = (txt, bad = false) => `<span style="background:var(--surface-2);padding:3px 10px;border-radius:10px;font-size:12px;color:${bad ? '#f87171' : 'var(--text-2)'};">${escapeHtml(txt)}</span>`;
    try {
        const s = await _api('/api/videos/status' + (force ? '?refresh=1' : ''));
        if (!document.getElementById('vs-settings-status')) return;
        const hwe = (s.hw && s.hw.encoder) || (s.qsv ? 'qsv' : null);
        const label = hwe === 'qsv' ? 'Hardware encode: Intel QuickSync'
            : hwe === 'vaapi' ? `Hardware encode: VA-API (${(s.hw && s.hw.device) || '/dev/dri/renderD128'})`
            : 'Software encode: libx264';
        st.innerHTML = chip(`ffmpeg ${s.ffmpeg ? 'ok' : 'missing'}`, !s.ffmpeg)
            + chip(`ffprobe ${s.ffprobe ? 'ok' : 'missing'}`, !s.ffprobe)
            + chip(label, !hwe)
            + (s.hw && s.hw.reason
                ? `<span style="font-size:11.5px;color:${hwe ? 'var(--text-3)' : '#f87171'};flex-basis:100%;line-height:1.55;">${escapeHtml(s.hw.reason)}</span>`
                : '');
    } catch (e) {
        st.innerHTML = `<span style="font-size:12px;color:#f87171;">${escapeHtml(e.message)}</span>`;
    }
}

function _recheckEngine() {
    _renderEngineStatus(true).then(() => _toast('Hardware encoder re-probed'));
}

// ── Movies view (poster grid with hero) ──────────────────────────────────────
function _movieList() {
    let v = _allVideos.filter(x => x.kind === 'movie');
    const q = (_q || '').toLowerCase();
    if (q) v = v.filter(x => ((x.title || '') + ' ' + x.name + ' ' + ((x.tmdb && x.tmdb.title) || '')).toLowerCase().includes(q));
    return _sortVideos(v);
}

function _renderMovies(c) {
    const movies = _movieList();
    _viewVideos = movies;
    if (!movies.length) {
        c.innerHTML = `<div class="vs-empty"><div style="font-size:46px;">🎬</div>No movies in the library yet.</div>`;
        _setCount('0 videos');
        return;
    }
    let html = '';
    const rated = [...movies].filter(m => m.tmdb && m.tmdb.rating != null).sort((a, b) => (b.tmdb.rating - a.tmdb.rating));
    const heroIt = (rated[0] && _tmdbArtUrl(rated[0])) ? rated[0] : (_tmdbArtUrl(movies[0]) ? movies[0] : null);
    if (heroIt) {
        _heroItem = heroIt;
        html += _heroHtml(heroIt, { eyebrow: 'FILM' });
    } else {
        _heroItem = null;
    }
    html += `<div class="vs-grid--posters" data-testid="vs-movies-grid">${movies.map((v, i) => _posterCardHtml(v, i, { play: '_vsOpenPlayer', arr: 'view', tmdb: true })).join('')}</div>`;
    c.innerHTML = html;
    _setCount(`${movies.length} movies`);
}

// ── Series view (portrait poster grid + show detail pages) ───────────────────
function _showKey(v) {
    if (v.show) return v.show;
    const seg = String(v.folder || '').split('/').filter(Boolean).pop();
    return seg || 'Unknown';
}

function _groupShows() {
    const q = (_q || '').toLowerCase();
    const map = new Map();
    for (const v of _allVideos) {
        if (v.kind !== 'episode') continue;
        const key = _showKey(v);
        if (q && !(key.toLowerCase().includes(q) || ((v.title || '') + ' ' + v.name).toLowerCase().includes(q))) continue;
        let g = map.get(key);
        if (!g) { g = { show: key, episodes: [] }; map.set(key, g); }
        g.episodes.push(v);
    }
    const shows = [...map.values()];
    for (const s of shows) {
        s.episodes.sort((a, b) => (a.season || 0) - (b.season || 0) || (a.episode || 0) - (b.episode || 0));
        s.latest = s.episodes[s.episodes.length - 1];
    }
    shows.sort((a, b) => a.show.localeCompare(b.show, undefined, { sensitivity: 'base' }));
    return shows;
}

function _showArt(s) {
    for (const e of [s.latest, ...s.episodes]) {
        const u = _tmdbArtUrl(e, true);   // poster wall — prefer the TMDB poster
        if (u) return u;
    }
    return s.latest ? _thumbUrl(s.latest.path, 300) : '';
}

function _showCardHtml(s, i) {
    const art = _showArt(s);
    const tm = (s.latest && s.latest.tmdb) || null;
    const metaBits = [];
    if (tm && tm.rating != null) metaBits.push(`★ ${tm.rating}`);
    if (tm && tm.year) metaBits.push(String(tm.year));
    metaBits.push(`${s.episodes.length} ep${s.episodes.length === 1 ? '' : 's'}`);
    return `
        <div class="vs-pcard" data-testid="vs-show-${i}" onclick="_vsOpenShow(${i})">
            <div class="vs-pcard-art">
                ${art ? `<img src="${art}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none';const n=this.nextElementSibling;if(n)n.style.display='flex'">` : ''}
                <div class="vs-emoji-fb">📺</div>
                <div class="vs-pcard-play"><i><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4.5v15l13-7.5z"/></svg></i></div>
            </div>
            <div class="vs-pcard-title">${escapeHtml(s.show)}</div>
            <div class="vs-pcard-meta">${metaBits.map(b => escapeHtml(String(b))).join(' · ')}</div>
        </div>`;
}

function _renderSeriesGrid(c) {
    const shows = _groupShows();
    _showsList = shows;
    if (!shows.length) {
        c.innerHTML = `<div class="vs-empty"><div style="font-size:46px;">📺</div>No series in the library yet.</div>`;
        _setCount('0 videos');
        return;
    }
    let html = '';
    const heroShow = shows.slice().sort((a, b) => {
        const ra = (a.latest && a.latest.tmdb && a.latest.tmdb.rating != null) ? a.latest.tmdb.rating : -1;
        const rb = (b.latest && b.latest.tmdb && b.latest.tmdb.rating != null) ? b.latest.tmdb.rating : -1;
        return rb - ra || b.episodes.length - a.episodes.length;
    })[0];
    if (heroShow && _showArt(heroShow)) {
        _heroItem = heroShow.episodes[0];
        html += _heroHtml(heroShow.episodes[0], { eyebrow: 'SERIES', title: heroShow.show, hideEpTag: true, extraMeta: [`${heroShow.episodes.length} episodes`] });
    } else {
        _heroItem = null;
    }
    html += `<div class="vs-grid--posters">${shows.map((s, i) => _showCardHtml(s, i)).join('')}</div>`;
    c.innerHTML = html;
    _setCount(`${shows.length} series`);
}

function _renderShowDetail(c) {
    const key = _showDetail;
    const eps = _allVideos.filter(v => v.kind === 'episode' && _showKey(v) === key);
    if (!eps.length) {
        c.innerHTML = `<div class="vs-empty"><div style="font-size:46px;">📺</div>Episodes for “${escapeHtml(key)}” not found.
            <button class="vs-btn-info" onclick="_vsBackToSeries()">‹ Back to Series</button></div>`;
        _setCount('');
        return;
    }
    eps.sort((a, b) => (a.season || 0) - (b.season || 0) || (a.episode || 0) - (b.episode || 0));
    _rowItems = eps;
    const first = eps[0];
    let html = '';
    _heroItem = first;
    html += _heroHtml(first, { eyebrow: 'SERIES', title: key, compact: true, hideEpTag: true, extraMeta: [`${eps.length} episodes`] });
    const seasons = new Map();
    for (const e of eps) {
        const sn = String(e.season || 1);
        if (!seasons.has(sn)) seasons.set(sn, []);
        seasons.get(sn).push(e);
    }
    let gi = 0;
    for (const [sn, list] of seasons) {
        html += _rowSection(`Season ${escapeHtml(sn)}`, `vs-row-season-${gi++}`, list.map(e => _cardHtml(e, eps.indexOf(e), { portrait: true, tmdb: true })).join(''));
    }
    c.innerHTML = html;
    _setCount(`${eps.length} episodes`);
}

// ── Search results view ──────────────────────────────────────────────────────
function _renderSearchResults(c) {
    const items = _viewVideos;
    if (!items.length) {
        c.innerHTML = `<div class="vs-empty"><div style="font-size:46px;">🔍</div>No results for “${escapeHtml(_q)}”.</div>`;
        _setCount('0 videos');
        return;
    }
    const html = `
        <div class="vs-pagehead"><h2>Results for “${escapeHtml(_q)}”</h2><span style="color:#9a9a9a;font-size:13px;">${items.length} video${items.length === 1 ? '' : 's'}</span></div>
        <div class="vs-grid--posters">${items.map((v, i) => _posterCardHtml(v, i, { play: '_vsOpenPlayer', arr: 'view', tmdb: true })).join('')}</div>`;
    c.innerHTML = html;
    _setCount(`${items.length} videos`);
}

// ── Browse view (All Videos / folders — breadcrumbs + folder tiles) ──────────
function _crumbsArr() {
    const arr = [{ label: 'All Videos', path: null }];
    if (_path) {
        const segs = _path.split('/').filter(Boolean);
        let acc = '';
        for (const s of segs) { acc += '/' + s; arr.push({ label: s, path: acc }); }
    }
    return arr;
}

function _crumbsHtml() {
    const arr = _crumbsArr();
    return arr.map((cr, i) => {
        const last = i === arr.length - 1;
        const sep = i > 0 ? '<span class="vs-crumb-sep">/</span>' : '';
        return `${sep}<span data-testid="vs-crumb-${i}" class="vs-crumb${last ? ' current' : ''}" ${last ? '' : `onclick="_vsCrumb(${i})"`}>${escapeHtml(cr.label)}</span>`;
    }).join('');
}

function _crumbNav(i) {
    const arr = _crumbsArr();
    const cr = arr[i];
    if (cr && i > 0) _navTo(cr.path);
    else _navTo(null);
}

function _openFolder(i) {
    const f = (_listing.folders || [])[i];
    if (f) _navTo(f.path);
}

function _renderLibrary(c) {
    const countEl = document.querySelector('[data-testid="vs-count"]');
    // In the root "All Videos" view (!_path) the walk is recursive, so every
    // file inside per-movie folders already appears in the grid below — skip
    // the redundant folder tiles there. Subfolder views keep them for navigation.
    const showFolders = !!_path && (_listing.folders || []).length > 0;
    if (!_viewVideos.length && !showFolders) {
        c.innerHTML = `<div class="vs-empty"><div style="font-size:46px;">🍿</div>No videos found in this folder.</div>`;
        _setCount('0 videos');
        return;
    }
    let html = `<div class="vs-pagehead">${_crumbsHtml()}</div>`;
    if (showFolders) {
        html += `<div class="vs-folders">${_listing.folders.map((f, i) => `
            <div class="vs-folder-tile" data-testid="vs-folder-${i}" onclick="_vsOpenFolder(${i})">
                <div class="vs-ft-icon" style="display:flex;justify-content:center;color:var(--text-2);">${uiIcon('folder', 24)}</div>
                <div class="vs-ft-name">${escapeHtml(f.name)}</div>
            </div>`).join('')}</div>`;
    }
    if (!_viewVideos.length) {
        c.innerHTML = html + `<div style="padding:26px 4%;color:#8c8c8c;font-size:13.5px;">No videos in this folder — open a subfolder above.</div>`;
        _setCount(`${_listing.folders.length} folders`);
        return;
    }
    const view = _cfg.options.view || 'grid';
    if (view === 'list') {
        html += `<div class="vs-list" data-testid="vs-list">${_viewVideos.map((v, i) => `
            <div class="vs-listrow" data-testid="vs-item-${i}" onclick="_vsOpenPlayer(${i})" title="${escapeAttr(v.name)}">
                <div style="position:relative;width:96px;height:54px;flex-shrink:0;background:#000;border-radius:6px;display:flex;align-items:center;justify-content:center;overflow:hidden;">
                    ${_artImgHtml(v, 160)}<div class="vs-emoji-fb" style="font-size:20px;">🎬</div>
                </div>
                <div style="flex:1;min-width:0;">
                    <div style="font-size:13px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(_displayTitle(v))}</div>
                    <div style="font-size:11.5px;color:#8c8c8c;margin-top:2px;">${v.tmdb && v.tmdb.rating != null ? `★ ${v.tmdb.rating} · ` : ''}${fmtBytes(v.size)} · ${fmtDate(v.modified)}${v.folder ? ' · ' + escapeHtml(v.folder) : ''}</div>
                </div>
            </div>`).join('')}</div>`;
    } else {
        html += `<div class="vs-grid--posters" data-testid="vs-grid">${_viewVideos.map((v, i) => _posterCardHtml(v, i, { play: '_vsOpenPlayer', arr: 'view', tmdb: true })).join('')}</div>`;
    }
    c.innerHTML = html;
    if (countEl) countEl.textContent = `${_viewVideos.length} video${_viewVideos.length === 1 ? '' : 's'}`;
    _setCount(`${_viewVideos.length} videos`);
}

// ── Welcome (no library folders yet) ────────────────────────────────────────
function _renderWelcome(c) {
    c.innerHTML = `
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:40px 24px;text-align:center;background:radial-gradient(ellipse at 50% 30%, #1d1a18 0%, #141414 70%);">
            <div class="vs-brand" style="font-size:30px;">Video Station</div>
            <div style="color:#b9b9b9;font-size:15px;max-width:420px;line-height:1.6;">Your library is empty. Add a folder with videos to get started — movies, series and everything in between.</div>
            <button class="vs-btn-play" onclick="_vsShowPicker()">＋ Add Your First Folder</button>
        </div>`;
    _setCount('');
}

function _syncKeyHandler() {
    const need = !!(_active() && (_playerPath || document.getElementById('vs-picker')
        || document.getElementById('vs-settings')));
    if (need && !_keyOn) { addEventListener('keydown', _onKey); _keyOn = true; }
    else if (!need && _keyOn) { removeEventListener('keydown', _onKey); _keyOn = false; }
}

function _openPlayer(item) {
    if (!item || !_active()) return;
    // Reset per-video state.
    if (_videoEl) { try { _videoEl.pause(); } catch (_) {} _videoEl = null; }
    if (_subBlobUrl) { URL.revokeObjectURL(_subBlobUrl); _subBlobUrl = null; }
    _playerPath = item.path;
    _playerItem = item;
    _subs = [];
    _subIdx = -1;
    _audioTracks = [];
    _audioIdx = 0;
    _playerMode = 'direct';
    _pendingSeek = 0;
    _lastResumeSave = 0;
    _transcoding = false;
    _knownDuration = 0;
    _pipeBase = 0;
    _seekReload = null;
    _endSaved = false;
    _syncKeyHandler();
    _renderContent();
}

function _maxIconSvg(expanded) {
    const common = 'width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
    return expanded
        ? `<svg ${common}><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>`
        : `<svg ${common}><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>`;
}

function _applyPlayerMax() {
    for (const el of [document.getElementById('vs-nav')]) {
        if (!el) continue;
        if (_playerMax) {
            if (!el.dataset.origDisplay) el.dataset.origDisplay = el.style.display || 'flex';
            el.style.display = 'none';
        } else if (el.dataset.origDisplay) {
            el.style.display = el.dataset.origDisplay;
            delete el.dataset.origDisplay;
        }
    }
    const btn = document.querySelector('[data-testid="vs-player-max"]');
    if (btn) {
        btn.innerHTML = _maxIconSvg(_playerMax);
        btn.title = _playerMax ? 'Restore player' : 'Maximize player';
    }
}

function _togglePlayerMax() {
    if (!_playerPath) return;
    _playerMax = !_playerMax;
    _applyPlayerMax();
}

function _closePlayer() {
    if (_videoEl) { try { _saveResume(true); _videoEl.pause(); } catch (_) {} _videoEl = null; }
    if (_subBlobUrl) { URL.revokeObjectURL(_subBlobUrl); _subBlobUrl = null; }
    if (_playerMax) { _playerMax = false; _applyPlayerMax(); }
    _playerPath = null;
    _playerItem = null;
    _subs = [];
    _subIdx = -1;
    _audioTracks = [];
    _audioIdx = 0;
    _playerMode = 'direct';
    _pendingSeek = 0;
    _transcoding = false;
    _knownDuration = 0;
    _pipeBase = 0;
    _seekReload = null;
    _endSaved = false;
    _syncKeyHandler();
    _renderContent();
}

// fMP4 transcode pipes report a finite-but-wrong video.duration (only what is
// buffered so far), so the ffprobe duration is authoritative in processed mode.
function _effDuration(v) {
    if (_transcoding && _knownDuration > 0) return _knownDuration;
    return (isFinite(v.duration) && v.duration > 0) ? v.duration : _knownDuration;
}

// Absolute position within the source file. The live pipe always restarts its
// clock at ~0, so add back the offset we requested when opening it.
function _absTime(v) {
    return (_transcoding && _pipeBase > 0) ? _pipeBase + (v.currentTime || 0) : (v.currentTime || 0);
}

function _saveResume(force = false) {
    const v = _videoEl;
    if (!v || !_playerPath) return;
    const dur = _effDuration(v);
    if (!(dur > 0)) return;
    const now = Date.now();
    if (!force && now - _lastResumeSave < 5000) return;
    _lastResumeSave = now;
    apiFetch('/api/videos/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: _playerPath, time: _absTime(v), duration: dur }),
    }).catch(() => {});
}

// Display label for a video item (parsed title + S/E badge, Jellyfin-style).
function _itemLabel(item) {
    const tm = item.tmdb || null;
    if (item.kind === 'episode') {
        const show = (tm && tm.title) || item.show || '';
        const t = item.title || `Episode ${item.episode}`;
        return `${show ? show + ' · ' : ''}S${String(item.season || 0).padStart(2, '0')}E${String(item.episode || 0).padStart(2, '0')} ${t}`.trim();
    }
    const t = (tm && tm.title) || item.title || item.name;
    const y = (tm && tm.year) || item.year;
    return y ? `${t} (${y})` : t;
}

// Next episode in the same show (by S/E order), for autoplay on ended.
function _nextEpisode(item) {
    if (!item || item.kind !== 'episode' || !_allVideos.length) return null;
    const key = _showKey(item);
    const eps = _allVideos.filter(v => v.kind === 'episode' && _showKey(v) === key);
    eps.sort((a, b) => (a.season || 0) - (b.season || 0) || (a.episode || 0) - (b.episode || 0));
    for (let i = 0; i < eps.length - 1; i++) if (eps[i].path === item.path) return eps[i + 1];
    return null;
}

function _renderPlayer(c) {
    const item = _playerItem || { name: (_playerPath || '').split('/').pop(), path: _playerPath };
    c.innerHTML = `
        <div data-testid="vs-player" style="display:flex;flex-direction:column;height:100%;">
            <div style="display:flex;align-items:center;gap:10px;padding:8px 16px;background:#0a0a0a;border-bottom:1px solid #232323;">
                <button data-testid="vs-player-back" onclick="_vsClosePlayer()" class="btn-ghost" style="font-size:13px;font-weight:600;padding:5px 14px;border-radius:6px;color:#fff;background:none;border:none;cursor:pointer;">‹ Library</button>
                <span data-testid="vs-player-title" title="${escapeAttr(item.name)}" style="flex:1;font-size:13.5px;font-weight:600;color: var(--text-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(_itemLabel(item))}</span>
                <button data-testid="vs-player-max" onclick="_vsTogglePlayerMax()" class="btn-ghost" title="Maximize player" style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;padding:0;border-radius:8px;color: var(--text-2);">${_maxIconSvg(_playerMax)}</button>
            </div>
            <div data-testid="vs-player-stage" style="flex:1;display:flex;align-items:center;justify-content:center;background:#000;min-height:0;position:relative;overflow:hidden;"></div>
            <div data-testid="vs-player-meta" style="display:flex;align-items:center;gap:8px;padding:8px 16px;border-top:1px solid var(--border);background:var(--surface-1);flex-wrap:wrap;font-size:11.5px;color: var(--text-3);">
                <span>Loading metadata…</span>
            </div>
        </div>`;

    const stage = c.querySelector('[data-testid="vs-player-stage"]');
    const video = document.createElement('video');
    video.controls = true;
    video.preload = 'metadata';
    // No src yet — we wait for ffprobe info so files the browser can't decode
    // (AC3/EAC3/DTS audio, HEVC video, MKV containers) go through live transcode.
    stage.appendChild(video);
    _videoEl = video;

    // Custom transport bar for processed (fMP4 pipe) mode. Native controls can't
    // work there: video.duration is only what's buffered so far, so the seek bar
    // shows a wrong "length" and can't scrub past the buffer. The ffprobe
    // duration is authoritative; out-of-buffer seeks re-request the pipe from
    // that offset (see _seekReloadStart).
    const ctl = document.createElement('div');
    ctl.setAttribute('data-testid', 'vs-player-ctl');
    ctl.style.cssText = 'position:absolute;left:0;right:0;bottom:0;z-index:2;display:none;align-items:center;gap:10px;padding:8px 14px;background:linear-gradient(transparent, rgba(0,0,0,.78));';
    ctl.innerHTML = `
        <button data-testid="vs-ctl-play" title="Play/Pause" style="background:none;border:none;color:#fff;font-size:15px;cursor:pointer;padding:2px 6px;line-height:1;">⏸</button>
        <span data-testid="vs-ctl-cur" style="color:#fff;font-size:11.5px;font-variant-numeric:tabular-nums;min-width:48px;text-align:right;">0:00</span>
        <input type="range" data-testid="vs-ctl-seek" min="0" max="100" step="0.1" value="0" style="flex:1;height:4px;cursor:pointer;">
        <span data-testid="vs-ctl-dur" style="color:#fff;font-size:11.5px;font-variant-numeric:tabular-nums;min-width:48px;">--:--</span>`;
    stage.appendChild(ctl);
    _ctlBar = ctl;

    const seekEl = ctl.querySelector('[data-testid="vs-ctl-seek"]');
    const playBtn = ctl.querySelector('[data-testid="vs-ctl-play"]');

    playBtn.addEventListener('click', () => {
        if (video.paused) video.play().catch(() => {}); else video.pause();
    });
    video.addEventListener('play', () => { playBtn.textContent = '⏸'; });
    video.addEventListener('pause', () => { playBtn.textContent = '▶'; });
    video.addEventListener('timeupdate', _syncTransport);

    seekEl.addEventListener('input', () => {
        ctl.querySelector('[data-testid="vs-ctl-cur"]').textContent = fmtTime(parseFloat(seekEl.value) || 0);
    });
    seekEl.addEventListener('change', () => {
        const t = parseFloat(seekEl.value) || 0;   // absolute source time
        let inBuf = false;
        try {
            for (let i = 0; i < video.buffered.length; i++) {
                const s = video.buffered.start(i) + _pipeBase;
                const e = video.buffered.end(i) + _pipeBase;
                if (t >= s - 1.5 && t <= e + 1.5) { inBuf = true; break; }
            }
        } catch (_) {}
        if (inBuf) {
            try { video.currentTime = Math.max(0, t - _pipeBase); } catch (_) {}
        } else {
            _seekReloadStart(video, t);
        }
    });

    video.addEventListener('loadedmetadata', () => {
        if (_pendingSeek > 5) {
            const dur = _effDuration(video);
            // Processed mode: the pipe was already requested from this offset
            // (t= in its URL), so there is nothing to seek — just confirm.
            if (!_transcoding && (!dur || _pendingSeek < dur * 0.97)) {
                try { video.currentTime = _pendingSeek; } catch (_) {}
            }
            _toast(`Resumed at ${fmtTime(_pendingSeek)}`);
        }
        _pendingSeek = 0;
    });
    // Out-of-buffer seek on a live transcode pipe → re-request from that point.
    video.addEventListener('seeking', () => {
        if (_transcoding && !_seekReload) _seekReloadStart(video, _absTime(video));
    });
    // After a seek-triggered reload: clear the guard and resume playback.
    video.addEventListener('loadeddata', () => {
        if (!_seekReload) return;
        const st = _seekReload;
        _seekReload = null;
        if (st.playing) video.play().catch(() => {});
    });
    video.addEventListener('timeupdate', () => {
        _saveResume(false);
        // fMP4 pipes may not fire 'ended' — detect the end from ffprobe duration.
        const dur = _effDuration(video);
        if (_transcoding && !_endSaved && dur > 0 && _absTime(video) >= dur - 1) {
            _endSaved = true;
            apiFetch('/api/videos/resume', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: _playerPath, time: dur, duration: dur }),
            }).catch(() => {});
        }
    });
    video.addEventListener('pause', () => _saveResume(true));
    video.addEventListener('ended', () => {
        // Mark finished → backend clears the resume position (≥97%).
        const dur = _effDuration(video) || 0;
        apiFetch('/api/videos/resume', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: _playerPath, time: dur, duration: dur }),
        }).catch(() => {});
        // Jellyfin-style next-episode autoplay.
        const nx = _nextEpisode(_playerItem);
        if (nx && _cfg.options.autoplay_next !== false) {
            const cur = _playerPath;
            _toast(`Next up: ${_itemLabel(nx)}`);
            setTimeout(() => { if (_active() && _playerPath === cur) _openPlayer(nx); }, 800);
        }
    });
    video.addEventListener('error', () => {
        if (!_transcoding || _seekReload) return;
        const meta = c.querySelector('[data-testid="vs-player-meta"]');
        if (meta) meta.insertAdjacentHTML('beforeend', '<span style="color:#f87171;display:inline-flex;align-items:center;gap:4px;">' + uiIcon('alert', 12) + ' Transcode failed — see server log</span>');
    });

    // Resume position + metadata + subtitles (independent fetches).
    // Awaited before video.src is chosen below, so the saved position can't be
    // lost to a /resume-vs-/info response race.
    const resumeP = _api(`/api/videos/resume?path=${encodeURIComponent(_playerPath)}`).then((d) => {
        const r = d.resume;
        if (r && r.time > 5 && (!r.duration || r.time < r.duration * 0.97)) _pendingSeek = r.time;
    }).catch(() => {});

    _api(`/api/videos/info?path=${encodeURIComponent(_playerPath)}`).then(async (d) => {
        if (!_active() || !_playerPath) return;
        await resumeP;
        const i = d.info || {};
        _audioTracks = i.audio_tracks || [];
        _audioIdx = _defaultAudioIdx(_audioTracks);
        const mode = i.playback_mode || (i.needs_transcode ? 'transcode' : 'direct');
        // Start playback now that we know how the browser should get this file.
        if (!video.src) {
            if (mode !== 'direct') {
                // Server picks the lightest path: remux (video copy + AAC audio)
                // or full transcode — see _playback_mode() in video_station.py.
                _playerMode = 'processed';
                _transcoding = true;
                _knownDuration = i.duration || 0;
                // Resume position goes straight into the pipe's start offset.
                const t0 = _pendingSeek > 5 ? _pendingSeek : 0;
                _pipeBase = t0;   // pipe clock starts at ~0 → remember the offset
                video.src = _transcodeUrl(_playerPath, t0, _audioIdx);
                _setCustomCtl(true);
            } else {
                video.src = _streamUrl(_playerPath);
            }
        }
        const chips = [];
        const tm = _playerItem && _playerItem.tmdb;
        if (tm) {
            if (tm.rating != null) chips.push(`★ ${tm.rating}`);
            if (tm.year) chips.push(String(tm.year));
            if (Array.isArray(tm.genres) && tm.genres.length) chips.push(tm.genres[0]);
        }
        if (i.duration) chips.push(fmtTime(i.duration));
        if (i.width && i.height) chips.push(`${i.width}×${i.height}`);
        if (i.video_codec) chips.push(i.video_codec.toUpperCase());
        if (i.audio_codec) chips.push(mode !== 'direct' ? `${i.audio_codec.toUpperCase()} → AAC` : i.audio_codec.toUpperCase());
        if (mode === 'remux') chips.push('REMUX · video copy');
        else if (mode === 'transcode') chips.push('TRANSCODING');
        if (i.bitrate) chips.push((i.bitrate / 1e6).toFixed(1) + ' Mbps');
        if (i.size) chips.push(fmtBytes(i.size));
        const meta = c.querySelector('[data-testid="vs-player-meta"]');
        if (meta && chips.length) {
            meta.innerHTML = chips.map(x => `<span style="background:var(--surface-2);padding:3px 9px;border-radius:10px;">${escapeHtml(String(x))}</span>`).join('') + '<span data-testid="vs-player-audio" style="margin-left:auto;"></span><span data-testid="vs-player-sub"></span>';
        } else if (meta) {
            meta.innerHTML = '<span>Metadata unavailable (ffprobe not installed?)</span><span data-testid="vs-player-audio" style="margin-left:auto;"></span><span data-testid="vs-player-sub"></span>';
        }
        _renderAudioPicker(c);
        _renderSubPicker(c);   // subtitle list may have arrived before metadata
    }).catch(() => {
        // No ffprobe info — fall back to direct streaming so playback still starts.
        if (!video.src) video.src = _streamUrl(_playerPath);
        const meta = c.querySelector('[data-testid="vs-player-meta"]');
        if (meta) meta.innerHTML = '<span>Metadata unavailable</span><span data-testid="vs-player-audio" style="margin-left:auto;"></span><span data-testid="vs-player-sub"></span>';
        _renderAudioPicker(c);
        _renderSubPicker(c);
    });

    _api(`/api/videos/subtitles?path=${encodeURIComponent(_playerPath)}`).then(async (d) => {
        if (!_active() || !_playerPath) return;
        _subs = d.subtitles || [];
        const pref = _subs.findIndex(s => s.preferred);
        if (_cfg.options.auto_subtitles === false) {
            _subIdx = -1;  // auto-load disabled — picker stays available
        } else {
            _subIdx = pref >= 0 ? pref : (_subs.length ? 0 : -1);
        }
        _renderSubPicker(c);
        if (_subs.length && _subIdx >= 0) await _loadSubtitleTrack();
    }).catch(() => {});

    // Start playback (play() may return undefined in non-browser environments).
    try {
        const p = video.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_) {}
}

// Subtitle track picker — shown in the player meta bar when the video has
// sibling subtitle files; switching tracks swaps the attached <track> element.
function _renderSubPicker(c) {
    const subEl = c && c.querySelector('[data-testid="vs-player-sub"]');
    if (!subEl || !_subs.length) return;
    // Dropdown when there's a choice, or when auto-load is off (so subtitles
    // can be turned on manually); otherwise a static label.
    if (_subs.length > 1 || _cfg.options.auto_subtitles === false) {
        subEl.innerHTML = `<select aria-label="Sub Select" data-testid="vs-sub-select" onchange="_vsSubChange(this.value)" style="background:var(--surface-2);border:1px solid var(--border);border-radius:6px;color: var(--text-2);font-size:11.5px;padding:3px 6px;outline:none;">
            <option value="-1" ${_subIdx < 0 ? 'selected' : ''}>Off</option>
            ${_subs.map((s, i) => `<option value="${i}" ${i === _subIdx ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}</select>`;
    } else {
        subEl.innerHTML = `<span title="Subtitle" style="display:inline-flex;align-items:center;gap:4px;">${uiIcon('subtitles', 12)} ${escapeHtml(_subs[_subIdx >= 0 ? _subIdx : 0].name)}</span>`;
    }
}

function _renderAudioPicker(c) {
    const el = c && c.querySelector('[data-testid="vs-player-audio"]');
    if (!el || !_audioTracks.length) return;
    if (_audioTracks.length > 1) {
        el.innerHTML = `<select aria-label="Audio Select" data-testid="vs-audio-select" onchange="_vsAudioChange(this.value)" title="Audio track" style="background:var(--surface-2);border:1px solid var(--border);border-radius:6px;color: var(--text-2);font-size:11.5px;padding:3px 6px;outline:none;">
            ${_audioTracks.map(t => `<option value="${t.index}" ${t.index === _audioIdx ? 'selected' : ''}>${escapeHtml(_trackLabel(t))}</option>`).join('')}</select>`;
    } else {
        el.innerHTML = `<span title="Audio track" style="display:inline-flex;align-items:center;gap:4px;">${uiIcon('volume', 12)} ${escapeHtml(_trackLabel(_audioTracks[0]))}</span>`;
    }
}

function _onAudioChange(v) {
    const video = _videoEl;
    if (!video || !_playerPath) return;
    _audioIdx = parseInt(v, 10) || 0;
    // A live pipe can't swap tracks mid-stream — re-request from the current
    // time. Switching away from direct play also flips us to processed mode.
    const wasDirect = _playerMode === 'direct';
    if (wasDirect) { _playerMode = 'processed'; _transcoding = true; }
    // Absolute position — the pipe clock restarts at ~0 on every re-request.
    const t = Math.max(0, wasDirect ? (video.currentTime || 0) : _absTime(video));
    const wasPlaying = !video.paused;
    _pipeBase = t;
    video.src = _transcodeUrl(_playerPath, t, _audioIdx);
    if (_playerMode === 'processed') { _setCustomCtl(true); _syncTransport(); }
    if (wasPlaying) {
        const h = () => { video.play().catch(() => {}); };
        video.addEventListener('loadedmetadata', h, { once: true });
    }
}

async function _loadSubtitleTrack() {
    const video = _videoEl;
    if (!video) return;
    // Drop previously attached external tracks, then attach the selected one.
    video.querySelectorAll('track').forEach(t => t.remove());
    if (!_subs.length || _subIdx < 0 || _subIdx >= _subs.length) return;
    const pick = _subs[_subIdx];
    try {
        let src, blobUrl = null;
        if (pick.path.toLowerCase().endsWith('.vtt')) {
            src = _rawUrl(pick.path);
        } else {
            // .srt → convert to WebVTT client-side (browsers only load VTT).
            const resp = await apiFetch(_rawUrl(pick.path));
            if (!resp.ok) return;
            const text = await resp.text();
            blobUrl = URL.createObjectURL(new Blob([_srtToVtt(text)], { type: 'text/vtt' }));
            src = blobUrl;
        }
        const track = document.createElement('track');
        track.kind = 'subtitles';
        track.src = src;
        track.label = pick.name;
        track.default = true;
        video.appendChild(track);
        if (blobUrl) { if (_subBlobUrl) URL.revokeObjectURL(_subBlobUrl); _subBlobUrl = blobUrl; }
    } catch (e) { console.warn('[video-station] subtitle load failed:', e.message); }
}

function _onSubChange(v) {
    const video = _videoEl;
    if (!video || !_subs.length) return;
    _subIdx = parseInt(v, 10);   // -1 = Off
    _loadSubtitleTrack();
}

// Minimal SRT → WebVTT conversion: strip BOM, normalise newlines, drop the
// numeric index lines and switch millisecond separators from "," to ".".
function _srtToVtt(text) {
    let t = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    if (/^WEBVTT/m.test(t)) return t;
    const body = t.split(/\n{2,}/).map((block) => {
        const lines = block.trim().split('\n').filter(Boolean);
        if (!lines.length) return '';
        let i = 0;
        if (/^\d+$/.test(lines[0])) i = 1;                 // drop index line
        const tsLine = lines[i] || '';
        if (!tsLine.includes('-->')) return '';
        const ts = tsLine.replace(/(\d+):(\d{1,2}):(\d{1,2})[,.](\d+)/g, (m, h, mi, se, ms) => `${h}:${mi}:${se}.${ms}`);
        return [ts, ...lines.slice(i + 1)].join('\n');
    }).filter(Boolean).join('\n\n');
    return 'WEBVTT\n\n' + body;
}

// ── Folder picker (add root folders via /api/videos/browse) ───────────────────

// ---------------------------------------------------------------- settings
// Full-screen overlay (same pattern as the folder picker): library management,
// playback options, and media-engine status.

function _showSettings() {
    if (!_body) return;
    const old = document.getElementById('vs-settings'); if (old) old.remove();
    const shell = _body.querySelector('[data-testid="vs-shell"]');
    if (!shell) return;
    const el = document.createElement('div');
    el.id = 'vs-settings';
    el.setAttribute('data-testid', 'vs-settings');
    el.style.cssText = 'position:absolute;inset:0;z-index:30;background:var(--surface-0);display:flex;flex-direction:column;font-family:system-ui,sans-serif;color: var(--text-1);';
    el.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid var(--border);">
            <span style="font-size:15px;font-weight:700;display:flex;align-items:center;gap:7px;">${uiIcon('settings', 15)} Video Station Settings</span>
            <button data-testid="vs-settings-close" onclick="_vsHideSettings()" style="margin-left:auto;border:none;background:transparent;color: var(--text-2);font-size:20px;cursor:pointer;">×</button>
        </div>
        <div id="vs-settings-body" data-testid="vs-settings-body" style="flex:1;overflow-y:auto;padding:18px 22px;display:flex;flex-direction:column;gap:24px;"></div>
        <div style="display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:12px 18px;border-top:1px solid var(--border);background:var(--surface-1);">
            <button data-testid="vs-settings-save" onclick="_vsSaveSettings()" class="btn-primary" style="font-size:13px;padding:8px 20px;border-radius:8px;">${uiIcon('check', 13)} Save</button>
        </div>`;
    shell.appendChild(el);
    _syncKeyHandler();
    _renderSettingsBody();
}

function _hideSettings() {
    const el = document.getElementById('vs-settings');
    if (el) el.remove();
    _syncKeyHandler();
}

async function _renderSettingsBody() {
    const body = document.getElementById('vs-settings-body');
    if (!body) return;
    const o = _cfg.options || {};
    const rootsHtml = _cfg.roots.length ? _cfg.roots.map((r, i) => `
        <div data-testid="vs-root-${i}" style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--surface-1);border:1px solid var(--border);border-radius:8px;font-size:12.5px;">
            <span style="display:flex;color:var(--text-3);">${uiIcon('folder', 14)}</span>
            <div style="flex:1;min-width:0;">
                <div style="font-weight:600;color:var(--text-1);">${escapeHtml(r.split('/').filter(Boolean).pop() || r)}</div>
                <div style="color: var(--text-3);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(r)}</div>
            </div>
            <button data-testid="vs-root-del-${i}" onclick="_vsRemoveRoot(${i})" title="Remove from library" style="border:none;background:transparent;color: var(--text-3);font-size:15px;cursor:pointer;padding:2px 6px;">${uiIcon('close', 13)}</button>
        </div>`).join('')
        : '<div style="font-size:12.5px;color: var(--text-3);">No library folders yet — add one below.</div>';

    body.innerHTML = `
        <section data-testid="vs-set-library">
            <h3 style="font-size:13.5px;font-weight:700;margin:0 0 4px;">${uiIcon('folder', 14)} Library</h3>
            <p style="margin:0 0 10px;font-size:12px;color: var(--text-3);">Folders scanned for videos (live scan — no index to rebuild).</p>
            <div style="display:flex;flex-direction:column;gap:6px;">${rootsHtml}</div>
            <button data-testid="vs-set-add-folder" onclick="_vsAddFolderFromSettings()" class="btn-ghost" style="margin-top:8px;font-size:12.5px;padding:7px 14px;border-radius:8px;">${uiIcon('plus', 13)} Add Folder</button>
        </section>
        <section data-testid="vs-set-playback">
            <h3 style="font-size:13.5px;font-weight:700;margin:0 0 4px;">${uiIcon('play', 14)} Playback</h3>
            <p style="margin:0 0 12px;font-size:12px;color: var(--text-3);">Files the browser can't decode (AC3/EAC3/DTS audio, HEVC video, MKV) are processed on the fly. H.264 sources with non-AAC audio use a lossless video copy — real-time.</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 18px;max-width:560px;">
                <label style="font-size:12.5px;color: var(--text-2);display:flex;flex-direction:column;gap:5px;">Transcode quality
                    <select aria-label="Set Quality" id="vs-set-quality" data-testid="vs-set-quality" style="background:var(--surface-1);border:1px solid var(--border);border-radius:8px;color: var(--text-1);font-size:12.5px;padding:7px 9px;outline:none;">
                        <option value="fast" ${o.quality === 'fast' ? 'selected' : ''}>Fast — ≤720p, low CPU</option>
                        <option value="balanced" ${(o.quality || 'balanced') === 'balanced' ? 'selected' : ''}>Balanced — ≤1080p (default)</option>
                        <option value="high" ${o.quality === 'high' ? 'selected' : ''}>High — source resolution</option>
                    </select>
                </label>
                <label style="font-size:12.5px;color: var(--text-2);display:flex;flex-direction:column;gap:5px;">Audio bitrate (AAC)
                    <select aria-label="Set Abr" id="vs-set-abr" data-testid="vs-set-abr" style="background:var(--surface-1);border:1px solid var(--border);border-radius:8px;color: var(--text-1);font-size:12.5px;padding:7px 9px;outline:none;">
                        ${['96k', '128k', '160k', '192k', '256k'].map(b => `<option value="${b}" ${(o.audio_bitrate || '192k') === b ? 'selected' : ''}>${b}</option>`).join('')}
                    </select>
                </label>
                <label style="font-size:12.5px;color: var(--text-2);display:flex;flex-direction:column;gap:5px;">Preferred audio language
                    <input id="vs-set-lang" data-testid="vs-set-lang" type="text" placeholder="e.g. pol, eng (empty = first track)" value="${escapeAttr(o.preferred_audio_lang || '')}" style="background:var(--surface-1);border:1px solid var(--border);border-radius:8px;color: var(--text-1);font-size:12.5px;padding:7px 9px;outline:none;">
                </label>
                <div></div>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px;max-width:560px;">
                <label data-testid="vs-set-autosub-label" style="font-size:12.5px;color: var(--text-2);display:flex;align-items:center;gap:8px;cursor:pointer;">
                    <input id="vs-set-autosub" data-testid="vs-set-autosub" type="checkbox" ${o.auto_subtitles !== false ? 'checked' : ''} style="width:15px;height:15px;"> Auto-load subtitles (sibling .srt/.vtt files)
                </label>
                <label data-testid="vs-set-autoplay-label" style="font-size:12.5px;color: var(--text-2);display:flex;align-items:center;gap:8px;cursor:pointer;">
                    <input id="vs-set-autoplay" data-testid="vs-set-autoplay" type="checkbox" ${o.autoplay_next !== false ? 'checked' : ''} style="width:15px;height:15px;"> Autoplay next episode
                </label>
            </div>
        </section>
        <section data-testid="vs-set-tmdb">
            <h3 style="font-size:13.5px;font-weight:700;margin:0 0 4px;">${uiIcon('film', 14)} Metadata (TMDB)</h3>
            <p style="margin:0 0 12px;font-size:12px;color: var(--text-3);">Display-only enrichment from The Movie Database — real titles, years, ratings and locally cached posters. Files are never renamed or moved.</p>
            <div style="display:grid;grid-template-columns:1fr auto;gap:12px 18px;max-width:560px;align-items:end;">
                <label style="font-size:12.5px;color: var(--text-2);display:flex;flex-direction:column;gap:5px;">API key${_cfg.tmdb && _cfg.tmdb.api_key_set ? ` (currently ${escapeHtml(_cfg.tmdb.api_key_masked)})` : ''}
                    <input id="vs-set-tmdb-key" data-testid="vs-set-tmdb-key" type="password" placeholder="${_cfg.tmdb && _cfg.tmdb.api_key_set ? 'leave empty to keep current key' : 'paste TMDB API key'}" autocomplete="off" style="background:var(--surface-1);border:1px solid var(--border);border-radius:8px;color: var(--text-1);font-size:12.5px;padding:7px 9px;outline:none;">
                </label>
                <button data-testid="vs-tmdb-test" onclick="_vsTmdbTest()" class="btn-ghost" style="font-size:12.5px;padding:8px 14px;border-radius:8px;">${uiIcon('activity', 13)} Test</button>
                <label style="font-size:12.5px;color: var(--text-2);display:flex;flex-direction:column;gap:5px;">Metadata language <span style="color:var(--text-3);">(TMDB code, e.g. pl-PL or en-US)</span>
                    <input id="vs-set-tmdb-lang" data-testid="vs-set-tmdb-lang" type="text" placeholder="pl-PL" value="${escapeAttr((_cfg.tmdb && _cfg.tmdb.language) || 'pl-PL')}" autocomplete="off" spellcheck="false" style="background:var(--surface-1);border:1px solid var(--border);border-radius:8px;color: var(--text-1);font-size:12.5px;padding:7px 9px;outline:none;">
                </label>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px;max-width:560px;">
                <label data-testid="vs-set-tmdb-autofetch-label" style="font-size:12.5px;color: var(--text-2);display:flex;align-items:center;gap:8px;cursor:pointer;">
                    <input id="vs-set-tmdb-autofetch" data-testid="vs-set-tmdb-autofetch" type="checkbox" ${(_cfg.tmdb && _cfg.tmdb.auto_fetch !== false) ? 'checked' : ''} style="width:15px;height:15px;"> Auto-fetch metadata for new videos (once per session, in the background)
                </label>
            </div>
            <div style="display:flex;align-items:center;gap:10px;margin-top:12px;max-width:560px;">
                <button data-testid="vs-tmdb-fetch" onclick="_vsTmdbFetchNow()" class="btn-primary" style="font-size:12.5px;padding:8px 14px;border-radius:8px;">${uiIcon('download', 13)} Fetch metadata now</button>
                <span id="vs-tmdb-status-line" data-testid="vs-tmdb-status-line" style="font-size:12px;color: var(--text-3);"></span>
            </div>
        </section>
        <section data-testid="vs-set-system">
            <div style="display:flex;align-items:center;gap:10px;margin:0 0 8px;">
                <h3 style="font-size:13.5px;font-weight:700;margin:0;">${uiIcon('activity', 14)} Media Engine</h3>
                <button class="btn-ghost btn-sm" data-testid="vs-engine-recheck" onclick="_vsRecheckEngine()" title="Probe the GPU again">${uiIcon('refresh', 12)} Re-check</button>
            </div>
            <div id="vs-settings-status" data-testid="vs-settings-status" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;"><span style="font-size:12px;color: var(--text-3);">Checking…</span></div>
        </section>`;

    await _renderEngineStatus();

    try {
        const t = await _api('/api/videos/tmdb/status');
        if (!document.getElementById('vs-settings')) return;
        const line = document.getElementById('vs-tmdb-status-line');
        if (line) line.textContent = t.api_key_set ? `${t.matched_count} titles matched · key ${t.api_key_masked}` : 'No API key set';
    } catch (_) { /* tmdb status is optional */ }
}

function _removeRoot(i) {
    const r = _cfg.roots[i];
    if (!r) return;
    _cfg.roots.splice(i, 1);
    _saveCfg({ roots: [..._cfg.roots] }).then(() => {
        _toast(`Removed ${r.split('/').pop() || r} from library`);
        if (document.getElementById('vs-settings')) _renderSettingsBody();
        else _reloadView();
    }).catch(() => {});
}

function _addFolderFromSettings() { _hideSettings(); _showPicker(); }

async function _saveSettings() {
    const o = { ...(_cfg.options || {}) };
    const q = document.getElementById('vs-set-quality');
    const ab = document.getElementById('vs-set-abr');
    const lg = document.getElementById('vs-set-lang');
    const asu = document.getElementById('vs-set-autosub');
    const ap = document.getElementById('vs-set-autoplay');
    if (q) o.quality = q.value;
    if (ab) o.audio_bitrate = ab.value;
    if (lg) o.preferred_audio_lang = lg.value.trim().toLowerCase();
    if (asu) o.auto_subtitles = asu.checked;
    if (ap) o.autoplay_next = ap.checked;
    const tk = document.getElementById('vs-set-tmdb-key');
    const tf = document.getElementById('vs-set-tmdb-autofetch');
    const tl = document.getElementById('vs-set-tmdb-lang');
    let tmdbPatch;
    if (tk || tf || tl) {
        // Partial patch — the server keeps previously stored values for any
        // field not sent here (empty key → keep the stored one).
        tmdbPatch = {};
        if (tk && tk.value.trim()) tmdbPatch.api_key = tk.value.trim();
        if (tf) tmdbPatch.auto_fetch = tf.checked;
        if (tl) tmdbPatch.language = tl.value.trim();
    }
    try {
        await _saveCfg({ options: o, ...(tmdbPatch ? { tmdb: tmdbPatch } : {}) });
        _toast('Settings saved');
        _hideSettings();
    } catch (_) { /* _saveCfg already toasted */ }
}

let _pickerPath = null;          // null → show allowed roots
let _pickerRoots = [];           // [{path,name,folders}] from the no-path browse
let _pickerFolders = [];         // folder names at _pickerPath

function _showPicker() {
    if (!_body) return;
    _pickerPath = null; _pickerRoots = []; _pickerFolders = [];
    const old = document.getElementById('vs-picker'); if (old) old.remove();
    const shell = _body.querySelector('[data-testid="vs-shell"]');
    if (!shell) return;
    const el = document.createElement('div');
    el.id = 'vs-picker';
    el.setAttribute('data-testid', 'vs-picker');
    el.style.cssText = 'position:absolute;inset:0;z-index:30;background:var(--surface-0);display:flex;flex-direction:column;font-family:system-ui,sans-serif;color: var(--text-1);';
    el.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid var(--border);">
            <span style="font-size:15px;font-weight:700;">${uiIcon('folder', 15)} Add Video Folder</span>
            <span style="font-size:12px;color: var(--text-3);">Double-click to open · add the folder you land on</span>
            <button data-testid="vs-picker-close" onclick="_vsHidePicker()" style="margin-left:auto;border:none;background:transparent;color: var(--text-2);font-size:20px;cursor:pointer;">×</button>
        </div>
        <div id="vs-picker-bc" data-testid="vs-picker-bc" style="padding:8px 18px;font-size:13px;color: var(--text-2);background:var(--surface-1);display:flex;align-items:center;gap:4px;flex-wrap:wrap;"></div>
        <div id="vs-picker-list" data-testid="vs-picker-list" style="flex:1;overflow-y:auto;padding:14px;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;align-content:start;"></div>
        <div style="display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:12px 18px;border-top:1px solid var(--border);background:var(--surface-1);">
            <button data-testid="vs-picker-add" onclick="_vsPickerAddCurrent()" class="btn-primary" style="font-size:13px;padding:8px 18px;border-radius:8px;">＋ Add This Folder</button>
        </div>`;
    shell.appendChild(el);
    _syncKeyHandler();
    _pickerLoad(null);
}

function _hidePicker() {
    const el = document.getElementById('vs-picker');
    if (el) el.remove();
    _syncKeyHandler();
}

async function _pickerLoad(path) {
    const list = document.getElementById('vs-picker-list');
    const bc = document.getElementById('vs-picker-bc');
    if (!list || !bc) return;
    try {
        const d = path ? await _api(`/api/videos/browse?path=${encodeURIComponent(path)}`) : await _api('/api/videos/browse');
        // Abort if the picker was closed while we were fetching.
        if (!document.getElementById('vs-picker')) return;
        if (!path) {
            _pickerPath = null;
            _pickerRoots = d.roots || [];
            bc.innerHTML = '<span style="color: var(--text-3);">Allowed locations</span>';
            list.innerHTML = _pickerRoots.map((r, i) => `
                <div data-testid="vs-picker-root-${i}" ondblclick="_vsPickerOpen('${jsAttr(r.path)}')" onclick="this.style.outline=this.style.outline?'':'2px solid #3b82f6'"
                     style="padding:14px;border-radius:10px;background:var(--surface-1);border:1px solid var(--border);cursor:pointer;display:flex;align-items:center;gap:10px;font-size:13px;">
                    <span style="font-size:20px;display:flex;color:var(--text-2);">${uiIcon('disk', 20)}</span><div><div>${escapeHtml(r.name)}</div><div style="font-size:11px;color: var(--text-3);">${r.folders.length} folders</div></div>
                </div>`).join('') || '<div style="color: var(--text-3);font-size:13px;">No accessible locations</div>';
            return;
        }
        _pickerPath = d.path;
        _pickerFolders = d.folders || [];
        const segs = d.path.split('/').filter(Boolean);
        let acc = '';
        bc.innerHTML = `<span style="color: var(--text-3);cursor:pointer;" onclick="_vsPickerLoad(null)">Locations</span>` + segs.map((s, i) => {
            acc += '/' + s;
            const last = i === segs.length - 1;
            return `<span>/</span><span style="cursor:${last ? 'default' : 'pointer'};color:${last ? 'var(--text-1)' : 'var(--text-2)'};font-weight:${last ? 700 : 400};" ${last ? '' : `onclick="_vsPickerLoad('${jsAttr(acc)}')"`}>${escapeHtml(s)}</span>`;
        }).join('');
        list.innerHTML = _pickerFolders.map((f, i) => {
            const full = d.path.endsWith('/') ? d.path + f : d.path + '/' + f;
            return `<div data-testid="vs-picker-folder-${i}" ondblclick="_vsPickerOpen('${jsAttr(full)}')" onclick="this.style.outline=this.style.outline?'':'2px solid #3b82f6'"
                style="padding:14px;border-radius:10px;background:var(--surface-1);border:1px solid var(--border);cursor:pointer;display:flex;align-items:center;gap:9px;font-size:13px;">
                <span style="font-size:18px;display:flex;color:var(--text-2);">${uiIcon('folder', 18)}</span><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(f)}</span></div>`;
        }).join('') || '<div style="color: var(--text-3);font-size:13px;">No subfolders — add this folder.</div>';
    } catch (e) {
        list.innerHTML = `<div style="color:#f87171;font-size:13px;">${escapeHtml(e.message)}</div>`;
    }
}

function _pickerOpen(path) { _pickerLoad(path); }

async function _pickerAddCurrent() {
    if (!_pickerPath) { _toast('Open a location first', true); return; }
    try {
        await _saveCfg({ roots: [..._cfg.roots, _pickerPath] });
        _hidePicker();
        _toast(`Added ${_pickerPath.split('/').pop() || _pickerPath} to library`);
        _path = null; _q = '';
        await _reloadView();
    } catch (e) { /* _saveCfg already toasted */ }
}

// ── Keyboard ──────────────────────────────────────────────────────────────────

function _onKey(e) {
    if (!_active()) { removeEventListener('keydown', _onKey); _keyOn = false; return; }
    if (e.key !== 'Escape') return;
    const st = document.getElementById('vs-settings');
    if (st) { _hideSettings(); return; }
    const pk = document.getElementById('vs-picker');
    if (pk) { _hidePicker(); return; }
    const sw = document.getElementById('vs-search-wrap');
    if (sw && sw.classList.contains('open')) { _closeSearch(); return; }
    if (_playerPath) {
        if (_playerMax) { _togglePlayerMax(); return; }   // first Esc restores, second closes
        _closePlayer();
    }
}

// ── Window-scope handlers (inline onclick/onchange targets) ───────────────────

// ── TMDB metadata (Phase 6) ───────────────────────────────────────────────────

async function _startTmdbRefresh(userInitiated) {
    if (_tmdbFetching) return null;
    _tmdbFetching = true;
    try {
        const d = await _api('/api/videos/tmdb/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
        if (userInitiated) {
            const msg = d.aborted ? `TMDB: ${d.aborted}`
                : `TMDB: ${d.titles_matched}/${d.titles_checked} titles matched (${d.files_matched} files)` + (d.errors ? `, ${d.errors} errors` : '');
            _toast(msg, !!d.aborted || (d.errors > 0 && !d.titles_matched));
        } else if (!d.aborted && d.files_matched > 0) {
            // Background auto-fetch found posters — refresh the current view once.
            setTimeout(() => { if (_active()) _reloadView(); }, 50);
        }
        return d;
    } catch (e) {
        if (userInitiated) _toast('TMDB refresh failed: ' + e.message, true);
        return null;
    } finally {
        _tmdbFetching = false;
    }
}

function _maybeAutoTmdbFetch() {
    const t = _cfg.tmdb || {};
    if (_tmdbFetching || _tmdbAutoDone) return;
    if (!t.api_key_set || t.auto_fetch === false) return;
    _tmdbAutoDone = true;   // at most once per app session, even on failure
    _startTmdbRefresh(false);
}

window._vsNavTo = (p) => _navTo(p);
window._vsOpenPlayer = (i) => { const v = _viewVideos[i]; if (v) _openPlayer(v); };
window._vsGoHome = () => _goHome();
window._vsGoMovies = () => _goMovies();
window._vsGoSeries = () => _goSeries();
window._vsOpenShow = (i) => _openShow(i);
window._vsBackToSeries = () => _backToSeries();
window._vsPlayRow = (i) => { const it = _rowItems[i]; if (it) _openPlayer(it); };
window._vsRowShow = (i) => {
    const it = _rowItems[i];
    if (!it) return;
    if (it.kind === 'episode') _openShowByKey(_showKey(it)); else _openPlayer(it);
};
window._vsListToggle = (ev, btn) => _onListToggle(ev, btn);
window._vsOpenMyList = () => _openMyList();
window._vsRecheckEngine = () => _recheckEngine();
window._vsPlayHero = () => { if (_heroItem) _openPlayer(_heroItem); };
window._vsHeroDetails = async () => {
    const it = _heroItem;
    if (!it) return;
    if (it.kind === 'episode') { await _openShowByKey(_showKey(it)); return; }
    const bits = _infoBits(it).join(' · ');
    _toast(`${_displayTitle(it)}${bits ? ' — ' + bits : ''}`);
};
window._vsSubChange = (v) => _onSubChange(v);
window._vsClosePlayer = () => _closePlayer();
window._vsTogglePlayerMax = () => _togglePlayerMax();
window._vsOnSearch = (v) => _onSearchInput(v);
window._vsOnSort = (v) => _onSortChange(v);
window._vsOnView = (v) => _onViewToggle(v);
window._vsToggleSearch = () => _toggleSearch();
window._vsRowScroll = (btn, dir) => _rowScroll(btn, dir);
window._vsRemoveCw = (ev, i) => _removeCw(ev, i);
window._vsOpenFolder = (i) => _openFolder(i);
window._vsCrumb = (i) => _crumbNav(i);
window._vsCardInfo = (ev, arr, i) => _cardInfo(ev, arr, i);
window._vsCardTmdb = (ev, arr, i) => _cardTmdb(ev, arr, i);
window._vsShowPicker = () => _showPicker();
window._vsHidePicker = () => _hidePicker();
window._vsPickerLoad = (p) => _pickerLoad(p || null);
window._vsPickerOpen = (p) => _pickerOpen(p);
window._vsPickerAddCurrent = () => _pickerAddCurrent();
window._vsSrtToVtt = (t) => _srtToVtt(t);
window._vsShowSettings = () => _showSettings();
window._vsHideSettings = () => _hideSettings();
window._vsRemoveRoot = (i) => _removeRoot(i);
window._vsAddFolderFromSettings = () => _addFolderFromSettings();
window._vsSaveSettings = () => _saveSettings();
window._vsAudioChange = (v) => _onAudioChange(v);

// TMDB: test the stored key, batch refresh from settings, per-card single-file refresh.
window._vsTmdbTest = async () => {
    const line = document.getElementById('vs-tmdb-status-line');
    if (line) line.textContent = 'Testing…';
    try {
        // If a new key was typed, save it first so the server can validate it.
        const inp = document.getElementById('vs-set-tmdb-key');
        if (inp && inp.value.trim()) await _saveCfg({ tmdb: { api_key: inp.value.trim() } }).catch(() => {});
        const d = await _api('/api/videos/tmdb/test');
        if (line) line.textContent = d.message || 'OK';
    } catch (e) {
        if (line) line.textContent = e.message;
    }
};

window._vsTmdbFetchNow = async () => {
    const btn = document.getElementById('vs-tmdb-fetch');
    const line = document.getElementById('vs-tmdb-status-line');
    if (btn) btn.disabled = true;
    if (line) line.textContent = 'Fetching metadata…';
    const d = await _startTmdbRefresh(true);
    if (btn) btn.disabled = false;
    if (d && line) line.textContent = `${d.titles_matched}/${d.titles_checked} titles matched · ${d.files_matched} files`;
    if (_active()) _reloadView();
};

window._vsTmdbRefreshCard = async (ev, path) => {
    if (ev && ev.stopPropagation) ev.stopPropagation();
    try {
        const d = await _api('/api/videos/tmdb/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, force: true }) });
        const m = d.match;
        // Update the item in place so the card re-renders with poster/title.
        for (const arr of [_allVideos, _viewVideos]) {
            const it = arr.find(x => x.path === path);
            if (it) { if (m) it.tmdb = m; else delete it.tmdb; }
        }
        _toast(m ? `Matched: ${m.title}${m.year ? ' (' + m.year + ')' : ''}` : 'No TMDB match found', !m);
        if (_active()) _renderContent();
    } catch (e) { _toast('TMDB refresh failed: ' + e.message, true); }
};

// ── Package entry point ───────────────────────────────────────────────────────
export async function render(container, ctx) {
    _ctx = ctx;
    ctx.log('info', 'Video Station opened');
    await renderVideoStation(container);
}
