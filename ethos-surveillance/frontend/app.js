// EthOS Cameras 2.0 — Surveillance Station (Package Center app)
//
// Sections: Live · Playback · Events · Cameras · Storage · Settings
// Visual contract: shared package shell (218 px rail, panels, summary tiles,
// tables, tags) — same metrics as Backup Manager / AntiVirus / Domains.
//
// Live and playback use HLS (hls.js, already vendored by the core) fed by the
// camera pipelines in EthOS core. Credentials never reach the browser: the
// API returns masked URLs and the backend injects them for ffmpeg.

const STYLE = `
.sv-root {
    color-scheme: light;
    --sv-bg: #eef2f7; --sv-side: rgba(255,255,255,.88); --sv-panel: #fff;
    --sv-surface: #f4f5f7; --sv-input: #fff; --sv-border: #e3e5e8;
    --sv-text: #1f2430; --sv-muted: #5b6472; --sv-accent: #2563eb;
    --sv-accent-soft: rgba(37,99,235,.10); --sv-accent-border: rgba(37,99,235,.45);
    --sv-green: #15803d; --sv-green-soft: rgba(21,128,61,.12); --sv-green-border: rgba(21,128,61,.35);
    --sv-red: #b91c1c; --sv-red-soft: rgba(185,28,28,.08); --sv-red-border: rgba(185,28,28,.32);
    --sv-amber: #b45309; --sv-amber-soft: rgba(180,83,9,.10); --sv-amber-border: rgba(180,83,9,.30);
    --sv-hover: rgba(15,23,42,.06); --sv-video: #05070b;
    --sv-glow-1: rgba(37,99,235,.08); --sv-glow-2: rgba(21,128,61,.06);
    display:flex; height:100%; overflow:hidden; color:var(--sv-text);
    background: radial-gradient(circle at 8% 4%, var(--sv-glow-1), transparent 40%),
                radial-gradient(circle at 92% 96%, var(--sv-glow-2), transparent 40%), var(--sv-bg);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
:root.dark .sv-root {
    color-scheme: dark;
    --sv-bg: #08111d; --sv-side: rgba(2,6,23,.45); --sv-panel: rgba(148,163,184,.07);
    --sv-surface: rgba(15,23,42,.45); --sv-input: rgba(2,6,23,.55); --sv-border: rgba(148,163,184,.22);
    --sv-text: #e2e8f0; --sv-muted: #94a3b8; --sv-accent: #38bdf8;
    --sv-accent-soft: rgba(56,189,248,.14); --sv-accent-border: rgba(56,189,248,.55);
    --sv-green: #4ade80; --sv-green-soft: rgba(74,222,128,.14); --sv-green-border: rgba(74,222,128,.45);
    --sv-red: #f87171; --sv-red-soft: rgba(248,113,113,.12); --sv-red-border: rgba(248,113,113,.45);
    --sv-amber: #fbbf24; --sv-amber-soft: rgba(251,191,36,.10); --sv-amber-border: rgba(251,191,36,.45);
    --sv-hover: rgba(148,163,184,.09); --sv-video: #000;
    --sv-glow-1: rgba(56,189,248,.16); --sv-glow-2: rgba(74,222,128,.10);
}
.sv-root, .sv-root * { box-sizing: border-box; }
.sv-root [hidden] { display: none !important; }
.sv-root button, .sv-root input, .sv-root select { font-family: inherit; }
.sv-side { flex:none; width:218px; display:flex; flex-direction:column; gap:16px; padding:20px 14px;
    border-right:1px solid var(--sv-border); background:var(--sv-side); overflow-y:auto; }
.sv-brand { display:flex; align-items:center; gap:10px; padding:0 8px; }
.sv-brand-icon { font-size:26px; line-height:1; }
.sv-brand strong { display:block; font-size:14px; letter-spacing:-.01em; }
.sv-brand small { display:block; color:var(--sv-muted); font-size:10px; }
.sv-nav { display:flex; flex-direction:column; gap:2px; }
.sv-nav-item { width:100%; padding:9px 11px; border:0; border-radius:9px; background:transparent;
    color:var(--sv-muted); font-size:12px; font-weight:600; text-align:left; cursor:pointer; }
.sv-nav-item:hover { background:var(--sv-hover); color:var(--sv-text); }
.sv-nav-item.is-active { background:var(--sv-accent-soft); color:var(--sv-text); }
.sv-side-foot { margin-top:auto; display:flex; flex-direction:column; gap:8px; padding:0 8px; }
.sv-pill { align-self:flex-start; padding:5px 10px; border-radius:999px; font-size:10px; font-weight:700;
    border:1px solid var(--sv-border); white-space:nowrap; }
.sv-pill.ready { color:var(--sv-green); border-color:var(--sv-green-border); background:var(--sv-green-soft); }
.sv-side-note { color:var(--sv-muted); font-size:10px; line-height:1.6; }
.sv-main { flex:1; min-width:0; overflow-y:auto; padding:24px 28px 32px; }
.sv-main h1 { margin:0; font-size:clamp(22px,3.4vw,30px); letter-spacing:-.02em; }
.sv-sub { margin:4px 0 0; color:var(--sv-muted); font-size:12px; line-height:1.5; }
.sv-status { min-height:18px; margin:10px 0 0; color:var(--sv-accent); font-size:12px; font-weight:600; }
.sv-status.error { color:var(--sv-red); }
.sv-view { display:flex; flex-direction:column; gap:14px; margin-top:16px; }
.sv-panel { padding:17px 18px; border:1px solid var(--sv-border); border-radius:15px; background:var(--sv-panel); }
.sv-panel h2 { margin:0 0 3px; font-size:13px; }
.sv-muted { margin:0; color:var(--sv-muted); font-size:11px; line-height:1.55; }
.sv-summary { display:grid; grid-template-columns:repeat(4,1fr); gap:9px; }
.sv-tile { padding:11px 13px; border:1px solid var(--sv-border); border-radius:11px; background:var(--sv-surface); }
.sv-tile span { display:block; font-size:9px; letter-spacing:.09em; text-transform:uppercase; color:var(--sv-muted); }
.sv-tile strong { display:block; margin-top:4px; font-size:20px; font-variant-numeric:tabular-nums; }
.sv-row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
.sv-label { display:block; margin-bottom:6px; font-size:10px; letter-spacing:.09em;
    text-transform:uppercase; color:var(--sv-muted); }
.sv-input { flex:1; min-width:0; padding:9px 11px; border:1px solid var(--sv-border); border-radius:9px;
    background:var(--sv-input); color:var(--sv-text); font-size:12px; }
.sv-input.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.sv-btn { padding:8px 13px; border:1px solid var(--sv-border); border-radius:9px; background:var(--sv-surface);
    color:var(--sv-text); font-size:11px; font-weight:600; cursor:pointer; }
.sv-btn:hover:not(:disabled) { border-color:var(--sv-accent); }
.sv-btn:disabled { opacity:.5; cursor:wait; }
.sv-btn.primary { border-color:var(--sv-accent-border); background:var(--sv-accent-soft); color:var(--sv-text); }
.sv-btn.danger { border-color:var(--sv-red-border); color:var(--sv-red); }
.sv-btn.small { padding:4px 9px; font-size:10px; }
.sv-table { width:100%; border-collapse:collapse; font-size:11px; }
.sv-table th { padding:8px 9px; text-align:left; font-size:9px; letter-spacing:.09em;
    text-transform:uppercase; color:var(--sv-muted); border-bottom:1px solid var(--sv-border); }
.sv-table td { padding:9px; border-bottom:1px solid var(--sv-border); vertical-align:middle; }
.sv-tag { display:inline-block; padding:2px 8px; border-radius:999px; font-size:9px; font-weight:700;
    border:1px solid var(--sv-border); background:var(--sv-surface); color:var(--sv-muted); }
.sv-tag.ok { color:var(--sv-green); border-color:var(--sv-green-border); background:var(--sv-green-soft); }
.sv-tag.bad { color:var(--sv-red); border-color:var(--sv-red-border); background:var(--sv-red-soft); }
.sv-tag.warn { color:var(--sv-amber); border-color:var(--sv-amber-border); background:var(--sv-amber-soft); }
.sv-grid { display:grid; gap:10px; }
.sv-grid.c1 { grid-template-columns:1fr; }
.sv-grid.c2 { grid-template-columns:repeat(2,1fr); }
.sv-cam { position:relative; border:1px solid var(--sv-border); border-radius:11px; overflow:hidden;
    background:var(--sv-video); }
.sv-cam video, .sv-cam img { display:block; width:100%; aspect-ratio:16/9; object-fit:contain; background:var(--sv-video); }
.sv-cam-foot { display:flex; align-items:center; gap:8px; padding:7px 10px; background:var(--sv-surface);
    color:var(--sv-text); font-size:11px; }
.sv-dot { width:8px; height:8px; border-radius:50%; background:var(--sv-muted); flex:none; }
.sv-dot.on { background:var(--sv-green); }
.sv-dot.off { background:var(--sv-red); }
.sv-dot.warn { background:var(--sv-amber); }
.sv-empty { padding:46px 20px; text-align:center; color:var(--sv-muted); font-size:12px;
    border:1px dashed var(--sv-border); border-radius:13px; }
.sv-timeline { position:relative; height:64px; border:1px solid var(--sv-border); border-radius:10px;
    background:var(--sv-surface); overflow:hidden; cursor:crosshair; }
.sv-range { position:absolute; top:8px; bottom:8px; background:var(--sv-accent-soft);
    border:1px solid var(--sv-accent-border); border-radius:5px; }
.sv-playhead { position:absolute; top:0; bottom:0; width:2px; background:var(--sv-accent); display:none; }
.sv-hour { position:absolute; top:0; bottom:0; width:1px; background:var(--sv-border); }
.sv-hour span { position:absolute; top:2px; left:3px; font-size:9px; color:var(--sv-muted); }
.sv-events { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:10px; }
.sv-event { border:1px solid var(--sv-border); border-radius:11px; overflow:hidden; background:var(--sv-panel);
    cursor:pointer; text-align:left; padding:0; color:var(--sv-text); }
.sv-event img { display:block; width:100%; aspect-ratio:16/9; object-fit:cover; background:var(--sv-video); }
.sv-event-body { padding:8px 10px; }
.sv-event-body b { font-size:11px; display:block; }
.sv-event-body span { font-size:10px; color:var(--sv-muted); }
.sv-mask { display:grid; gap:2px; padding:8px; border:1px solid var(--sv-border); border-radius:10px;
    background:var(--sv-video); max-width:520px; }
.sv-mask button { border:0; padding:0; aspect-ratio:16/9; background:#1e293b; cursor:pointer; }
.sv-mask button.on { background:var(--sv-green-soft); box-shadow: inset 0 0 0 1px var(--sv-green-border); }
.sv-bar { height:6px; border-radius:999px; background:var(--sv-surface); overflow:hidden; }
.sv-bar span { display:block; height:100%; background:var(--sv-accent); }
.sv-loading { padding:22px; text-align:center; color:var(--sv-muted); font-size:12px; }
@media (max-width: 900px) {
    .sv-side { width:100%; flex-direction:row; align-items:center; gap:8px; padding:10px 12px;
        border-right:0; border-bottom:1px solid var(--sv-border); overflow-x:auto; }
    .sv-brand small, .sv-side-foot { display:none; }
    .sv-nav { flex-direction:row; }
    .sv-main { padding:16px 14px 24px; }
    .sv-summary { grid-template-columns:repeat(2,1fr); }
    .sv-grid.c2 { grid-template-columns:1fr; }
}
`;

const API = '/api/surveillance';
const TOTAL_CELLS = 16 * 9;

let _ctx = null;
let _root = null;
let _section = 'live';
let _cameras = [];
let _events = [];
let _ranges = [];
let _storage = null;
let _settings = null;
let _isAdmin = false;
let _editing = null;          // camera id being edited (inline editor) or 'new'
let _maskDraft = null;        // {camera_id, mask:boolean[]}
let _liveGrid = 4;
let _livePick = new Set();
let _wsStop = null;
let _hlsInstances = new Map();
let _playback = null;         // {camId, date, base, ranges}
let _hlsPromise = null;

const esc = (value) => _ctx.escape.html(value == null ? '' : String(value));
const escAttr = (value) => _ctx.escape.attr(value == null ? '' : String(value));
const token = () => localStorage.getItem('token') || '';

function toast(message, kind = 'info') {
    _ctx.notifications.toast(message, kind);
}

async function apiJson(path, options = {}) {
    const response = await _ctx.apiFetch(path, options);
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!response.ok) {
        const detail = (data && data.detail) || `HTTP ${response.status}`;
        throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
    }
    return data;
}

function fmtBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(0)} MB`;
    return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function relTime(iso) {
    const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (seconds < 60) return `${Math.floor(seconds)}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

function clock(iso) {
    try {
        return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
}

function todayIso() {
    return new Date().toISOString().slice(0, 10);
}

function camName(id) {
    return (_cameras.find((c) => c.id === id) || {}).name || 'camera';
}

function isOnline(cam) {
    return Boolean(cam.status && cam.status.online);
}

// ── HLS ─────────────────────────────────────────────────────────────────────

function loadHls() {
    if (window.Hls) return Promise.resolve(window.Hls);
    if (!_hlsPromise) {
        _hlsPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = '/static/vendor/hls.min.js';
            script.onload = () => (window.Hls ? resolve(window.Hls) : reject(new Error('hls.js unavailable')));
            script.onerror = () => reject(new Error('hls.js failed to load'));
            document.head.appendChild(script);
        });
    }
    return _hlsPromise;
}

function hlsConfig() {
    return {
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
        xhrSetup: (xhr) => {
            const value = token();
            if (value) xhr.setRequestHeader('Authorization', `Bearer ${value}`);
        },
    };
}

function destroyHls(key) {
    const hls = _hlsInstances.get(key);
    if (hls) {
        try { hls.destroy(); } catch { /* already torn down */ }
        _hlsInstances.delete(key);
    }
}

function destroyAllHls() {
    for (const key of [..._hlsInstances.keys()]) destroyHls(key);
}

/** Attach an HLS source; falls back to the legacy MJPEG <img> when HLS fails. */
async function attachHls(key, video, src, fallbackUrl) {
    destroyHls(key);
    try {
        const Hls = await loadHls();
        if (!Hls.isSupported()) throw new Error('HLS unsupported');
        const hls = new Hls(hlsConfig());
        _hlsInstances.set(key, hls);
        hls.on(Hls.Events.ERROR, (_event, data) => {
            if (!data || !data.fatal) return;
            destroyHls(key);
            if (video && video.parentElement) {
                const img = document.createElement('img');
                img.src = fallbackUrl;
                img.alt = 'live';
                video.replaceWith(img);
            }
        });
        hls.loadSource(src);
        hls.attachMedia(video);
        return true;
    } catch {
        if (video && video.parentElement) {
            const img = document.createElement('img');
            img.src = fallbackUrl;
            img.alt = 'live';
            video.replaceWith(img);
        }
        return false;
    }
}

// ── Shell ───────────────────────────────────────────────────────────────────

const SECTIONS = [
    { id: 'live', label: 'Live', title: 'Live view', subtitle: 'Watch every camera in a grid.' },
    { id: 'playback', label: 'Playback', title: 'Playback', subtitle: 'Scrub the archive and export a range.' },
    { id: 'events', label: 'Events', title: 'Events', subtitle: 'Motion alerts with a one-click replay.' },
    { id: 'cameras', label: 'Cameras', title: 'Cameras', subtitle: 'Streams, recording, motion zones and access.' },
    { id: 'storage', label: 'Storage', title: 'Storage', subtitle: 'Where recordings live and how long they stay.' },
    { id: 'settings', label: 'Settings', title: 'Settings', subtitle: 'Notification and recording defaults.' },
];

function mountShell(container) {
    container.classList.add('sv-root');
    container.innerHTML = `
        <style>${STYLE}</style>
        <aside class="sv-side">
            <div class="sv-brand">
                <span class="sv-brand-icon">📹</span>
                <div><strong>Cameras</strong><small>EthOS package</small></div>
            </div>
            <nav class="sv-nav" aria-label="Cameras sections">
                ${SECTIONS.map((s) => `<button class="sv-nav-item" data-testid="sv-tab-${s.id}" data-section="${s.id}">${s.label}</button>`).join('')}
            </nav>
            <div class="sv-side-foot">
                <span class="sv-pill" id="sv-health">starting</span>
                <span class="sv-side-note">Recordings keep running inside EthOS even when this window is closed.</span>
            </div>
        </aside>
        <main class="sv-main">
            <h1 id="sv-title">Live view</h1>
            <p class="sv-sub" id="sv-subtitle"></p>
            <p class="sv-status" id="sv-status" role="status"></p>
            <section class="sv-view" id="sv-view"><div class="sv-loading">Loading…</div></section>
        </main>`;
    container.querySelectorAll('.sv-nav-item').forEach((button) => {
        button.addEventListener('click', () => showSection(button.dataset.section));
    });
    _root = container;
}

function showSection(id) {
    if (!SECTIONS.some((s) => s.id === id)) return;
    _section = id;
    _root.querySelectorAll('.sv-nav-item').forEach((button) => {
        button.classList.toggle('is-active', button.dataset.section === id);
    });
    const meta = SECTIONS.find((s) => s.id === id);
    _root.querySelector('#sv-title').textContent = meta.title;
    _root.querySelector('#sv-subtitle').textContent = meta.subtitle;
    setStatus('');
    renderSection();
}

function setStatus(text, kind = '') {
    const el = _root && _root.querySelector('#sv-status');
    if (!el) return;
    el.textContent = text || '';
    el.className = `sv-status ${kind}`.trim();
}

function viewEl() {
    return _root.querySelector('#sv-view');
}

function renderSection() {
    if (!_root || !_root.isConnected) return;
    destroyAllHls();
    const view = viewEl();
    if (_section === 'live') renderLive(view);
    else if (_section === 'playback') renderPlayback(view);
    else if (_section === 'events') renderEvents(view);
    else if (_section === 'cameras') renderCameras(view);
    else if (_section === 'storage') renderStorage(view);
    else renderSettings(view);
}

// ── Data ────────────────────────────────────────────────────────────────────

async function loadCameras() {
    const data = await apiJson(`${API}/cameras`);
    _cameras = data.cameras || [];
    const enabled = _cameras.filter((c) => c.enabled !== false);
    if (!_livePick.size) enabled.forEach((c) => _livePick.add(c.id));
    const online = enabled.filter(isOnline).length;
    const health = _root.querySelector('#sv-health');
    if (health) {
        health.textContent = enabled.length ? `${online}/${enabled.length} online` : 'no cameras';
        health.className = `sv-pill ${enabled.length && online === enabled.length ? 'ready' : ''}`;
    }
}

async function loadEvents() {
    const data = await apiJson(`${API}/events?limit=200`);
    _events = data.events || [];
}

async function loadAdminViews() {
    try {
        _settings = (await apiJson(`${API}/settings`)).settings;
        _storage = (await apiJson(`${API}/storage`)).storage;
        _isAdmin = true;
    } catch {
        _isAdmin = false;
    }
}

async function refresh(section = _section) {
    try {
        await loadCameras();
        if (section === 'events' || section === 'live') await loadEvents();
        if (section === 'storage' || section === 'settings') await loadAdminViews();
        if (_section === section) renderSection();
    } catch (error) {
        setStatus(error.message, 'error');
    }
}

// ── Live ────────────────────────────────────────────────────────────────────

function summaryHtml(online, total, eventsToday, recording) {
    return `<div class="sv-summary">
        <div class="sv-tile"><span>Cameras</span><strong>${total}</strong></div>
        <div class="sv-tile"><span>Online</span><strong>${online}</strong></div>
        <div class="sv-tile"><span>Events today</span><strong>${eventsToday}</strong></div>
        <div class="sv-tile"><span>Recording</span><strong>${recording}</strong></div>
    </div>`;
}

function renderLive(view) {
    const enabled = _cameras.filter((c) => c.enabled !== false);
    const picked = enabled.filter((c) => _livePick.has(c.id));
    const eventsToday = _events.filter((e) => String(e.at || '').slice(0, 10) === todayIso()).length;
    const recording = _cameras.filter((c) => c.record && c.record.mode !== 'off').length;
    if (!enabled.length) {
        view.innerHTML = `<div class="sv-empty">No cameras yet — add one in the <b>Cameras</b> section.</div>`;
        return;
    }
    view.innerHTML = `
        ${summaryHtml(enabled.filter(isOnline).length, enabled.length, eventsToday, recording)}
        <div class="sv-panel">
            <div class="sv-row" style="justify-content:space-between;">
                <div class="sv-row">
                    <span class="sv-label" style="margin:0;">Grid</span>
                    <select class="sv-input" id="sv-layout" data-testid="sv-layout" style="max-width:120px;">
                        ${[1, 4, 9, 16].map((n) => `<option value="${n}" ${n === _liveGrid ? 'selected' : ''}>${n === 1 ? '1 × 1' : `${Math.sqrt(n)} × ${Math.sqrt(n)}`}</option>`).join('')}
                    </select>
                </div>
                <button class="sv-btn small" id="sv-live-refresh" data-testid="sv-live-refresh">Refresh status</button>
            </div>
            <div class="sv-row" style="margin-top:10px;gap:6px;">
                ${enabled.map((c) => `<label class="sv-tag ${_livePick.has(c.id) ? 'ok' : ''}" style="cursor:pointer;">
                    <input type="checkbox" data-pick="${escAttr(c.id)}" ${_livePick.has(c.id) ? 'checked' : ''} style="margin-right:5px;">${esc(c.name)}
                </label>`).join('')}
            </div>
        </div>
        <div class="sv-grid c${_liveGrid >= 4 ? 2 : 1}" id="sv-live-grid" data-testid="sv-live-grid">
            ${picked.slice(0, _liveGrid).map((cam) => liveTileHtml(cam)).join('') || '<div class="sv-empty">Pick at least one camera.</div>'}
        </div>`;

    view.querySelector('#sv-layout').addEventListener('change', (event) => {
        _liveGrid = Number(event.target.value) || 4;
        renderSection();
    });
    view.querySelector('#sv-live-refresh').addEventListener('click', () => refresh('live'));
    view.querySelectorAll('[data-pick]').forEach((input) => input.addEventListener('change', () => {
        if (input.checked) _livePick.add(input.dataset.pick);
        else _livePick.delete(input.dataset.pick);
        renderSection();
    }));
    for (const cam of picked.slice(0, _liveGrid)) {
        const video = view.querySelector(`video[data-live="${cam.id}"]`);
        if (!video) continue;
        attachHls(`live:${cam.id}`, video,
            `${API}/cameras/${cam.id}/hls/index.m3u8`,
            `${API}/cameras/${cam.id}/live?token=${encodeURIComponent(token())}`);
    }
}

function liveTileHtml(cam) {
    const status = cam.status || {};
    const dot = status.online ? 'on' : (status.last_error ? 'off' : 'warn');
    return `<div class="sv-cam" data-testid="sv-live-tile-${escAttr(cam.id)}">
        <video data-live="${escAttr(cam.id)}" muted autoplay playsinline></video>
        <div class="sv-cam-foot">
            <span class="sv-dot ${dot}"></span>
            <b style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(cam.name)}</b>
            <span class="sv-tag ${cam.record && cam.record.mode !== 'off' ? 'bad' : ''}" style="margin-left:auto;">
                ${cam.record && cam.record.mode !== 'off' ? 'REC' : (status.online ? `${status.bitrate_kbps || 0} kb/s` : 'offline')}
            </span>
            <button class="sv-btn small" data-snap="${escAttr(cam.id)}" title="Snapshot">📷</button>
        </div>
    </div>`;
}

// ── Playback ────────────────────────────────────────────────────────────────

function renderPlayback(view) {
    const camId = _playback ? _playback.camId : (_cameras[0] ? _cameras[0].id : '');
    const date = _playback ? _playback.date : todayIso();
    view.innerHTML = `
        <div class="sv-panel">
            <div class="sv-row">
                <div style="flex:1;min-width:160px;">
                    <span class="sv-label">Camera</span>
                    <select class="sv-input" id="sv-pb-cam" data-testid="sv-pb-cam">
                        ${_cameras.map((c) => `<option value="${escAttr(c.id)}" ${c.id === camId ? 'selected' : ''}>${esc(c.name)}</option>`).join('') || '<option value="">no cameras</option>'}
                    </select>
                </div>
                <div style="flex:1;min-width:140px;">
                    <span class="sv-label">Day</span>
                    <input class="sv-input" type="date" id="sv-pb-date" data-testid="sv-pb-date" value="${escAttr(date)}">
                </div>
                <button class="sv-btn" id="sv-pb-load" data-testid="sv-pb-load" style="align-self:flex-end;">Load</button>
                ${_isAdmin ? '<button class="sv-btn primary" id="sv-pb-export" data-testid="sv-pb-export" style="align-self:flex-end;">Export day</button>' : ''}
            </div>
        </div>
        <div class="sv-panel">
            <div class="sv-timeline" id="sv-timeline" data-testid="sv-timeline">
                ${[...Array(23)].map((_, i) => `<div class="sv-hour" style="left:${((i + 1) / 24) * 100}%"><span>${i + 1}:00</span></div>`).join('')}
                ${_ranges.map((r) => rangeBar(r, date)).join('')}
                <div class="sv-playhead" id="sv-playhead"></div>
            </div>
            <p class="sv-muted" id="sv-pb-info" style="margin-top:8px;">Click the timeline to jump to that moment.</p>
            <video id="sv-pb-video" controls playsinline style="width:100%;aspect-ratio:16/9;background:#000;border-radius:10px;margin-top:10px;"></video>
        </div>`;

    view.querySelector('#sv-pb-load').addEventListener('click', async () => {
        const cam = view.querySelector('#sv-pb-cam').value;
        const day = view.querySelector('#sv-pb-date').value;
        if (cam && day) await loadDay(cam, day);
    });
    view.querySelector('#sv-pb-cam').addEventListener('change', () => {
        const cam = view.querySelector('#sv-pb-cam').value;
        const day = view.querySelector('#sv-pb-date').value;
        if (cam && day) loadDay(cam, day);
    });
    view.querySelector('#sv-timeline').addEventListener('click', (event) => {
        const target = view.querySelector('#sv-timeline');
        if (!target || !_ranges.length) return;
        const box = target.getBoundingClientRect();
        const fraction = Math.min(0.999, Math.max(0, (event.clientX - box.left) / box.width));
        const day = (_playback ? _playback.date : date);
        const midnight = new Date(`${day}T00:00:00Z`).getTime();
        seekTo(midnight + fraction * 86400000);
    });
    const exportBtn = view.querySelector('#sv-pb-export');
    if (exportBtn) exportBtn.addEventListener('click', () => exportDay());

    if (camId && (!_playback || _playback.camId !== camId || _playback.date !== date)) {
        loadDay(camId, date);
    } else if (_ranges.length) {
        attachPlayback();
    }
}

function rangeBar(range, date) {
    const midnight = new Date(`${date}T00:00:00Z`).getTime();
    const start = (new Date(range.start).getTime() - midnight) / 86400000;
    const end = (new Date(range.end).getTime() - midnight) / 86400000;
    const left = Math.max(0, Math.min(1, start)) * 100;
    const width = Math.max(0.4, (Math.min(1, end) - Math.max(0, start)) * 100);
    return `<div class="sv-range" style="left:${left}%;width:${width}%;"
        title="${escAttr(clock(range.start))}–${escAttr(clock(range.end))}"></div>`;
}

async function loadDay(camId, date) {
    _playback = { camId, date, base: 0, ranges: [] };
    setStatus('Loading recordings…');
    try {
        const data = await apiJson(`${API}/cameras/${camId}/recordings?date=${encodeURIComponent(date)}`);
        _ranges = data.ranges || [];
        _playback.ranges = _ranges;
        _playback.base = _ranges.length ? new Date(_ranges[0].start).getTime() : 0;
        setStatus(_ranges.length ? `${Math.round(data.total_s / 60)} min recorded` : 'No recording for that day',
            _ranges.length ? '' : 'error');
        if (_section === 'playback') renderPlayback(viewEl());
    } catch (error) {
        setStatus(error.message, 'error');
    }
}

async function attachPlayback() {
    const video = viewEl().querySelector('#sv-pb-video');
    if (!video || !_playback || !_ranges.length) return;
    const last = _ranges[_ranges.length - 1].end;
    const url = `${API}/playback/${_playback.camId}/index.m3u8?from=${encodeURIComponent(_ranges[0].start)}&to=${encodeURIComponent(last)}`;
    await attachHls('playback', video, url,
        `${API}/cameras/${_playback.camId}/live?token=${encodeURIComponent(token())}`);
}

function seekTo(epochMs) {
    const view = viewEl();
    const video = view.querySelector('#sv-pb-video');
    const head = view.querySelector('#sv-playhead');
    if (!video || !_playback || !_playback.base) return;
    const offset = Math.max(0, (epochMs - _playback.base) / 1000);
    try { video.currentTime = offset; } catch { /* metadata not ready yet */ }
    video.play().catch(() => {});
    const midnight = new Date(`${_playback.date}T00:00:00Z`).getTime();
    if (head) {
        head.style.display = 'block';
        head.style.left = `${Math.min(99.9, Math.max(0, ((epochMs - midnight) / 86400000) * 100))}%`;
    }
    const info = view.querySelector('#sv-pb-info');
    if (info) info.textContent = `Playing from ${new Date(epochMs).toLocaleTimeString()}`;
}

async function exportDay() {
    if (!_ranges.length || !_playback) {
        toast('Nothing recorded to export', 'warning');
        return;
    }
    const task = _ctx.progress.startTask({ appId: 'pkg-ethos-surveillance', title: 'Camera export' });
    try {
        const created = await apiJson(`${API}/exports`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                camera_id: _playback.camId,
                from: _ranges[0].start,
                to: _ranges[_ranges.length - 1].end,
            }),
        });
        const opId = created.op_id;
        let op = created.export;
        for (let i = 0; i < 120 && op.state !== 'done' && op.state !== 'error'; i += 1) {
            task.update({ detail: `Encoding… (${i * 2}s)` });
            await new Promise((resolve) => setTimeout(resolve, 2000));
            op = (await apiJson(`${API}/exports/${opId}`)).export;
        }
        if (op.state !== 'done') throw new Error(op.error || 'Export failed');
        const link = document.createElement('a');
        link.href = `${API}/exports/${opId}/download?token=${encodeURIComponent(token())}`;
        link.download = `${opId}.mp4`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        toast(`Export ready (${fmtBytes(op.size_bytes)})`, 'success');
        task.finish('done', { detail: fmtBytes(op.size_bytes) });
    } catch (error) {
        toast(error.message, 'error');
        task.finish('failed', { detail: error.message });
    }
}

// ── Events ──────────────────────────────────────────────────────────────────

function renderEvents(view) {
    view.innerHTML = `
        <div class="sv-panel">
            <div class="sv-row" style="justify-content:space-between;">
                <span class="sv-muted">${_events.length} event(s) — newest first</span>
                <div class="sv-row">
                    <button class="sv-btn small" id="sv-ev-refresh" data-testid="sv-ev-refresh">Refresh</button>
                    ${_isAdmin && _events.length ? '<button class="sv-btn small danger" id="sv-ev-clear" data-testid="sv-ev-clear">Clear all</button>' : ''}
                </div>
            </div>
        </div>
        ${_events.length ? `<div class="sv-events" data-testid="sv-events">
            ${_events.slice(0, 120).map((event) => `
                <button class="sv-event" data-event="${escAttr(event.id)}" data-testid="sv-event-${escAttr(event.id)}">
                    ${event.image ? `<img src="${API}/events/${event.id}/image?token=${encodeURIComponent(token())}" alt="">` : '<div style="aspect-ratio:16/9;background:#111;"></div>'}
                    <div class="sv-event-body">
                        <b>${esc(event.camera_name || camName(event.camera_id))}</b>
                        <span>${esc(relTime(event.at))}${event.reviewed ? ' · reviewed' : ''}</span>
                    </div>
                </button>`).join('')}
        </div>` : '<div class="sv-empty">No motion events yet. Enable motion detection for a camera.</div>'}`;

    view.querySelector('#sv-ev-refresh').addEventListener('click', () => refresh('events'));
    const clear = view.querySelector('#sv-ev-clear');
    if (clear) clear.addEventListener('click', async () => {
        if (!(await _ctx.modal.confirm('Clear events', 'Delete every motion event and its snapshot?'))) return;
        try {
            await apiJson(`${API}/events`, { method: 'DELETE' });
            await refresh('events');
        } catch (error) { toast(error.message, 'error'); }
    });
    view.querySelectorAll('[data-event]').forEach((button) => button.addEventListener('click', async () => {
        const event = _events.find((e) => e.id === button.dataset.event);
        if (!event) return;
        try { await apiJson(`${API}/events/${event.id}/reviewed`, { method: 'POST' }); } catch { /* best effort */ }
        _playback = { camId: event.camera_id, date: String(event.at).slice(0, 10), base: 0, ranges: [] };
        showSection('playback');
        await loadDay(event.camera_id, _playback.date);
        const start = event.recording && event.recording.from
            ? new Date(event.recording.from).getTime() : new Date(event.at).getTime();
        setTimeout(() => seekTo(start), 1200);
    }));
}

// ── Cameras ─────────────────────────────────────────────────────────────────

function renderCameras(view) {
    const editing = _editing === 'new' ? 'new' : (_editing ? _cameras.find((c) => c.id === _editing) : null);
    view.innerHTML = `
        <div class="sv-panel" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
            <span class="sv-muted">${_cameras.length} camera(s) · management is admin-only, viewing follows each camera's viewer list</span>
            <div class="sv-row">
                ${_isAdmin ? '<button class="sv-btn" id="sv-discover" data-testid="sv-discover">Search network</button>' : ''}
                ${_isAdmin ? '<button class="sv-btn primary" id="sv-add-camera" data-testid="sv-add-camera">+ Add camera</button>' : ''}
            </div>
        </div>
        <div id="sv-discover-result"></div>
        ${editing ? cameraEditorHtml(editing) : ''}
        ${_maskDraft ? maskEditorHtml() : ''}
        <div class="sv-panel">
            ${_cameras.length ? `<table class="sv-table" data-testid="sv-camera-table">
                <thead><tr><th>Camera</th><th>Main stream</th><th>Record</th><th>Motion</th><th>Status</th><th></th></tr></thead>
                <tbody>
                ${_cameras.map((cam) => `
                    <tr data-testid="sv-camera-${escAttr(cam.id)}">
                        <td><b>${esc(cam.name)}</b><br><span class="sv-muted">${esc((cam.viewers || []).length ? cam.viewers.join(', ') : 'admins only')}</span></td>
                        <td style="font-family:ui-monospace,monospace;font-size:10px;">${esc(cam.streams.main)}</td>
                        <td><span class="sv-tag ${cam.record && cam.record.mode !== 'off' ? 'ok' : ''}">${esc((cam.record || {}).mode || 'off')}</span></td>
                        <td><span class="sv-tag ${cam.motion && cam.motion.enabled ? 'ok' : ''}">${cam.motion && cam.motion.enabled ? 'on' : 'off'}</span></td>
                        <td><span class="sv-tag ${isOnline(cam) ? 'ok' : (cam.status && cam.status.last_error ? 'bad' : 'warn')}">${isOnline(cam) ? 'online' : 'offline'}</span></td>
                        <td style="white-space:nowrap;">
                            ${_isAdmin ? `<button class="sv-btn small" data-edit="${escAttr(cam.id)}">Edit</button>
                            <button class="sv-btn small" data-mask="${escAttr(cam.id)}">Zones</button>
                            <button class="sv-btn small" data-test="${escAttr(cam.id)}">Test</button>
                            <button class="sv-btn small danger" data-delete="${escAttr(cam.id)}">Delete</button>` : ''}
                        </td>
                    </tr>`).join('')}
                </tbody></table>` : '<div class="sv-empty">No cameras configured.</div>'}
        </div>`;

    const add = view.querySelector('#sv-add-camera');
    if (add) add.addEventListener('click', () => {
        _editing = 'new';
        _maskDraft = null;
        renderSection();
    });
    const discover = view.querySelector('#sv-discover');
    if (discover) discover.addEventListener('click', runDiscovery);
    view.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
        _editing = b.dataset.edit;
        _maskDraft = null;
        renderSection();
    }));
    view.querySelectorAll('[data-delete]').forEach((b) => b.addEventListener('click', async () => {
        const cam = _cameras.find((c) => c.id === b.dataset.delete);
        if (!(await _ctx.modal.confirm('Delete camera', `Remove “${cam && cam.name}” and all its recordings?`))) return;
        try {
            await apiJson(`${API}/cameras/${cam.id}`, { method: 'DELETE' });
            toast('Camera deleted', 'success');
            await refresh('cameras');
        } catch (error) { toast(error.message, 'error'); }
    }));
    view.querySelectorAll('[data-test]').forEach((b) => b.addEventListener('click', async () => {
        b.disabled = true; b.textContent = '…';
        try {
            const result = await apiJson(`${API}/cameras/${b.dataset.test}/test`, { method: 'POST' });
            toast(result.ok ? 'Connection OK' : (result.detail || 'Connection failed'), result.ok ? 'success' : 'error');
        } catch (error) { toast(error.message, 'error'); }
        b.disabled = false; b.textContent = 'Test';
    }));
    view.querySelectorAll('[data-mask]').forEach((b) => b.addEventListener('click', () => {
        const cam = _cameras.find((c) => c.id === b.dataset.mask);
        const zones = (cam.motion || {}).zones;
        const mask = zones && Array.isArray(zones.mask)
            ? zones.mask.map(Boolean) : new Array(TOTAL_CELLS).fill(true);
        _maskDraft = { camera_id: cam.id, mask };
        _editing = null;
        renderSection();
    }));

    wireCameraEditor(view);
    wireMaskEditor(view);
}

function cameraEditorHtml(cam) {
    const isNew = cam === 'new';
    const data = isNew ? {
        name: '', streams: { main: '', sub: '' }, record: { mode: 'off' },
        viewers: [], auth: {},
    } : cam;
    const record = data.record || {};
    const schedule = record.schedule || { days: [0, 1, 2, 3, 4, 5, 6], from: '00:00', to: '23:59' };
    return `<div class="sv-panel" data-testid="sv-camera-editor">
        <h2>${isNew ? 'Add camera' : `Edit ${esc(data.name)}`}</h2>
        <p class="sv-muted">The main stream is recorded; the sub stream drives the live wall and motion detection. Leave the sub stream empty to reuse the main one.</p>
        <div class="sv-row" style="margin-top:12px;">
            <div style="flex:1;min-width:160px;"><span class="sv-label">Name</span>
                <input class="sv-input" id="sv-edit-name" value="${escAttr(data.name)}" maxlength="60"></div>
            <div style="flex:1;min-width:160px;"><span class="sv-label">Viewers (comma separated)</span>
                <input class="sv-input" id="sv-edit-viewers" value="${escAttr((data.viewers || []).join(', '))}" placeholder="anna, piotr"></div>
        </div>
        <div style="margin-top:10px;"><span class="sv-label">Main stream URL</span>
            <input class="sv-input mono" id="sv-edit-main" value="${escAttr(data.streams.main)}" placeholder="rtsp://192.168.1.50:554/main"></div>
        <div style="margin-top:10px;"><span class="sv-label">Sub stream URL (optional)</span>
            <input class="sv-input mono" id="sv-edit-sub" value="${escAttr(data.streams.sub || '')}" placeholder="rtsp://192.168.1.50:554/sub"></div>
        <div class="sv-row" style="margin-top:10px;">
            <div style="flex:1;min-width:140px;"><span class="sv-label">Username</span>
                <input class="sv-input" id="sv-edit-user" value="${escAttr((data.auth || {}).user || '')}"></div>
            <div style="flex:1;min-width:140px;"><span class="sv-label">Password ${data.auth && data.auth.has_password ? '(saved — leave blank)' : ''}</span>
                <input class="sv-input" id="sv-edit-pass" type="password" autocomplete="new-password"></div>
        </div>
        <div class="sv-row" style="margin-top:10px;">
            <div><span class="sv-label">Recording</span>
                <select class="sv-input" id="sv-edit-mode" data-testid="sv-edit-mode" style="min-width:150px;">
                    ${['off', 'continuous', 'schedule'].map((m) => `<option value="${m}" ${record.mode === m ? 'selected' : ''}>${m}</option>`).join('')}
                </select></div>
            <div><span class="sv-label">Retention days (blank = global)</span>
                <input class="sv-input" id="sv-edit-retention" type="number" min="0" max="365" style="width:120px;"
                    value="${record.retention_days != null ? record.retention_days : ''}"></div>
            <div><span class="sv-label">Schedule days</span>
                <div class="sv-row" style="gap:4px;">
                    ${['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((label, index) =>
                        `<label class="sv-tag ${schedule.days.includes(index) ? 'ok' : ''}" style="cursor:pointer;">
                            <input type="checkbox" data-day="${index}" ${schedule.days.includes(index) ? 'checked' : ''} style="margin-right:3px;">${label}
                        </label>`).join('')}
                </div>
            </div>
            <div><span class="sv-label">From</span><input class="sv-input" id="sv-edit-from" value="${escAttr(schedule.from)}" style="width:80px;"></div>
            <div><span class="sv-label">To</span><input class="sv-input" id="sv-edit-to" value="${escAttr(schedule.to)}" style="width:80px;"></div>
        </div>
        <div class="sv-row" style="margin-top:14px;">
            <button class="sv-btn" id="sv-edit-test" data-testid="sv-edit-test">Test connection</button>
            <button class="sv-btn primary" id="sv-edit-save" data-testid="sv-edit-save">${isNew ? 'Add camera' : 'Save'}</button>
            <button class="sv-btn" id="sv-edit-cancel">Cancel</button>
        </div>
    </div>`;
}

function wireCameraEditor(view) {
    const save = view.querySelector('#sv-edit-save');
    if (!save) return;
    const isNew = _editing === 'new';
    view.querySelector('#sv-edit-cancel').addEventListener('click', () => {
        _editing = null;
        renderSection();
    });
    view.querySelector('#sv-edit-test').addEventListener('click', async (event) => {
        const main = view.querySelector('#sv-edit-main').value.trim();
        if (!main) { toast('Enter the main stream URL first', 'warning'); return; }
        event.target.disabled = true; event.target.textContent = 'Testing…';
        try {
            const result = await apiJson(`${API}/test`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: view.querySelector('#sv-edit-name').value || 'test',
                    url: main,
                    sub_url: view.querySelector('#sv-edit-sub').value.trim() || null,
                    username: view.querySelector('#sv-edit-user').value,
                    password: view.querySelector('#sv-edit-pass').value,
                }),
            });
            toast(result.ok ? 'Connection OK' : (result.detail || 'Connection failed'), result.ok ? 'success' : 'error');
        } catch (error) { toast(error.message, 'error'); }
        event.target.disabled = false; event.target.textContent = 'Test connection';
    });
    save.addEventListener('click', async () => {
        const days = [...view.querySelectorAll('[data-day]')].filter((i) => i.checked)
            .map((i) => Number(i.dataset.day));
        const retention = view.querySelector('#sv-edit-retention').value;
        const payload = {
            name: view.querySelector('#sv-edit-name').value.trim(),
            url: view.querySelector('#sv-edit-main').value.trim(),
            sub_url: view.querySelector('#sv-edit-sub').value.trim() || '',
            username: view.querySelector('#sv-edit-user').value,
            viewers: view.querySelector('#sv-edit-viewers').value.split(',')
                .map((v) => v.trim()).filter(Boolean),
            record: {
                mode: view.querySelector('#sv-edit-mode').value,
                retention_days: retention === '' ? null : Number(retention),
                schedule: {
                    days,
                    from: view.querySelector('#sv-edit-from').value,
                    to: view.querySelector('#sv-edit-to').value,
                },
            },
        };
        const password = view.querySelector('#sv-edit-pass').value;
        if (password) payload.password = password;
        if (!payload.name || !payload.url) {
            toast('Name and main stream URL are required', 'warning');
            return;
        }
        save.disabled = true;
        try {
            if (isNew) {
                await apiJson(`${API}/cameras`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                toast('Camera added', 'success');
            } else {
                await apiJson(`${API}/cameras/${_editing}`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                toast('Camera saved', 'success');
            }
            _editing = null;
            await refresh('cameras');
        } catch (error) {
            toast(error.message, 'error');
            save.disabled = false;
        }
    });
}

function maskEditorHtml() {
    const cam = _cameras.find((c) => c.id === _maskDraft.camera_id);
    return `<div class="sv-panel" data-testid="sv-mask-editor">
        <h2>Motion zones — ${esc(cam ? cam.name : '')}</h2>
        <p class="sv-muted">Green cells are watched, dark cells are ignored. Masking a road or a tree stops false alerts.</p>
        <div class="sv-mask" style="grid-template-columns:repeat(16,1fr);margin-top:10px;">
            ${_maskDraft.mask.map((on, index) => `<button data-cell="${index}" class="${on ? 'on' : ''}" aria-label="cell ${index}"></button>`).join('')}
        </div>
        <div class="sv-row" style="margin-top:12px;">
            <button class="sv-btn primary" id="sv-mask-save" data-testid="sv-mask-save">Save zones</button>
            <button class="sv-btn" id="sv-mask-all">All cells</button>
            <button class="sv-btn" id="sv-mask-cancel">Cancel</button>
        </div>
    </div>`;
}

function wireMaskEditor(view) {
    if (!_maskDraft) return;
    view.querySelectorAll('[data-cell]').forEach((cell) => cell.addEventListener('click', () => {
        const index = Number(cell.dataset.cell);
        _maskDraft.mask[index] = !_maskDraft.mask[index];
        cell.classList.toggle('on', _maskDraft.mask[index]);
    }));
    view.querySelector('#sv-mask-all').addEventListener('click', () => {
        _maskDraft.mask = new Array(TOTAL_CELLS).fill(true);
        renderSection();
    });
    view.querySelector('#sv-mask-cancel').addEventListener('click', () => {
        _maskDraft = null;
        renderSection();
    });
    view.querySelector('#sv-mask-save').addEventListener('click', async () => {
        try {
            await apiJson(`${API}/cameras/${_maskDraft.camera_id}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    motion: {
                        sensitivity: 0.3,
                        zones: { cols: 16, rows: 9, mask: _maskDraft.mask.map((v) => (v ? 1 : 0)) },
                    },
                }),
            });
            toast('Motion zones saved', 'success');
            _maskDraft = null;
            await refresh('cameras');
        } catch (error) { toast(error.message, 'error'); }
    });
}

async function runDiscovery() {
    const box = _root.querySelector('#sv-discover-result');
    if (!box) return;
    box.innerHTML = '<div class="sv-panel sv-muted">Probing the local network (ONVIF + RTSP/HTTP scan)…</div>';
    try {
        const data = await apiJson(`${API}/discover`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timeout_s: 3, scan_subnets: true }),
        });
        const results = data.results || [];
        box.innerHTML = `<div class="sv-panel">
            <p class="sv-muted">${results.length} device(s)${data.scanned && data.scanned.network ? ` on ${esc(data.scanned.network)}` : ''}</p>
            ${results.length ? `<table class="sv-table"><thead><tr><th>IP</th><th>Type</th><th>Ports</th><th>Suggested URL</th><th></th></tr></thead>
                <tbody>${results.map((row) => `<tr>
                    <td style="font-family:monospace;">${esc(row.ip)}</td>
                    <td>${[row.onvif ? 'ONVIF' : '', row.rtsp ? 'RTSP' : '', (!row.onvif && !row.rtsp) ? 'HTTP' : ''].filter(Boolean).map((t) => `<span class="sv-tag">${t}</span>`).join(' ')}</td>
                    <td>${esc((row.ports || []).join(', '))}</td>
                    <td style="font-family:monospace;font-size:10px;">${esc(row.suggested_url || '')}</td>
                    <td><button class="sv-btn small" data-add-url="${escAttr(row.suggested_url || '')}" data-add-ip="${escAttr(row.ip)}">Add</button></td>
                </tr>`).join('')}</tbody></table>` : ''}
        </div>`;
        box.querySelectorAll('[data-add-url]').forEach((button) => button.addEventListener('click', () => {
            _editing = 'new';
            renderSection();
            const main = _root.querySelector('#sv-edit-main');
            const name = _root.querySelector('#sv-edit-name');
            if (main) main.value = button.dataset.addUrl;
            if (name) name.value = button.dataset.addIp;
        }));
    } catch (error) {
        box.innerHTML = `<div class="sv-panel sv-muted">Discovery failed: ${esc(error.message)}</div>`;
    }
}

// ── Storage ─────────────────────────────────────────────────────────────────

function renderStorage(view) {
    if (!_isAdmin) {
        view.innerHTML = '<div class="sv-empty">Storage settings are available to administrators.</div>';
        return;
    }
    if (!_storage) {
        view.innerHTML = '<div class="sv-loading">Loading storage…</div>';
        loadAdminViews().then(() => renderSection());
        return;
    }
    const usedPct = _storage.quota_bytes
        ? Math.min(100, (_storage.recordings_bytes / _storage.quota_bytes) * 100) : 0;
    view.innerHTML = `
        <div class="sv-summary">
            <div class="sv-tile"><span>Recordings</span><strong>${fmtBytes(_storage.recordings_bytes)}</strong></div>
            <div class="sv-tile"><span>Quota</span><strong>${fmtBytes(_storage.quota_bytes)}</strong></div>
            <div class="sv-tile"><span>Disk used</span><strong>${_storage.used_pct}%</strong></div>
            <div class="sv-tile"><span>Live buffers</span><strong>${fmtBytes(_storage.live_bytes)}</strong></div>
        </div>
        <div class="sv-panel">
            <h2>Recordings folder</h2>
            <p class="sv-muted">${esc(_storage.storage_dir)}</p>
            <div class="sv-bar" style="margin-top:10px;"><span style="width:${usedPct}%"></span></div>
            <div class="sv-row" style="margin-top:10px;">
                <button class="sv-btn" id="sv-storage-pick" data-testid="sv-storage-pick">Change folder…</button>
                <button class="sv-btn danger" id="sv-storage-purge" data-testid="sv-storage-purge">Purge expired now</button>
            </div>
        </div>
        <div class="sv-panel">
            <h2>Per camera</h2>
            ${_storage.cameras && _storage.cameras.length ? `<table class="sv-table"><thead><tr><th>Camera</th><th>Recorded</th></tr></thead>
                <tbody>${_storage.cameras.map((row) => `<tr><td>${esc(camName(row.camera_id))}</td><td>${fmtBytes(row.size_bytes)}</td></tr>`).join('')}</tbody></table>`
                : '<p class="sv-muted">Nothing recorded yet.</p>'}
        </div>`;

    view.querySelector('#sv-storage-pick').addEventListener('click', async () => {
        if (typeof _ctx.pickFolder !== 'function') {
            toast('Folder picker unavailable in this EthOS version', 'warning');
            return;
        }
        const picked = await _ctx.pickFolder({
            title: 'Recordings folder', roots: ['/media', '/mnt'],
            startPath: _storage.storage_dir, acceptLabel: 'Use this folder',
        });
        if (!picked) return;
        try {
            await apiJson(`${API}/settings`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ storage_dir: picked }),
            });
            toast('Recordings folder updated', 'success');
            await loadAdminViews();
            renderSection();
        } catch (error) { toast(error.message, 'error'); }
    });
    view.querySelector('#sv-storage-purge').addEventListener('click', async (event) => {
        event.target.disabled = true;
        try {
            const result = await apiJson(`${API}/storage/purge`, { method: 'POST' });
            toast(`Purged ${result.removed_dirs} recording(s)`, 'success');
            await loadAdminViews();
            renderSection();
        } catch (error) { toast(error.message, 'error'); }
        event.target.disabled = false;
    });
}

// ── Settings ────────────────────────────────────────────────────────────────

function renderSettings(view) {
    if (!_isAdmin || !_settings) {
        view.innerHTML = _isAdmin
            ? '<div class="sv-loading">Loading settings…</div>'
            : '<div class="sv-empty">Settings are available to administrators.</div>';
        if (_isAdmin) loadAdminViews().then(() => renderSection());
        return;
    }
    view.innerHTML = `
        <div class="sv-panel" data-testid="sv-settings-panel">
            <h2>Recording defaults</h2>
            <div class="sv-row" style="margin-top:10px;">
                <div><span class="sv-label">Retention (days)</span><input class="sv-input" id="sv-set-retention" type="number" min="0" max="365" value="${_settings.default_retention_days}" style="width:110px;"></div>
                <div><span class="sv-label">Disk quota (%)</span><input class="sv-input" id="sv-set-quota" type="number" min="50" max="95" value="${_settings.quota_pct}" style="width:110px;"></div>
                <div><span class="sv-label">Segment (s)</span><input class="sv-input" id="sv-set-segment" type="number" min="10" max="600" value="${_settings.segment_s}" style="width:110px;"></div>
                <div><span class="sv-label">Clip pre-roll (s)</span><input class="sv-input" id="sv-set-pre" type="number" min="0" max="120" value="${_settings.pre_s}" style="width:110px;"></div>
                <div><span class="sv-label">Clip post-roll (s)</span><input class="sv-input" id="sv-set-post" type="number" min="0" max="300" value="${_settings.post_s}" style="width:110px;"></div>
            </div>
            <div class="sv-row" style="margin-top:14px;">
                <label class="sv-tag ${_settings.notify_motion ? 'ok' : ''}" style="cursor:pointer;">
                    <input type="checkbox" id="sv-set-notify-motion" ${_settings.notify_motion ? 'checked' : ''} style="margin-right:5px;">Motion alerts
                </label>
                <label class="sv-tag ${_settings.notify_offline ? 'ok' : ''}" style="cursor:pointer;">
                    <input type="checkbox" id="sv-set-notify-offline" ${_settings.notify_offline ? 'checked' : ''} style="margin-right:5px;">Camera offline alerts
                </label>
            </div>
            <div class="sv-row" style="margin-top:14px;">
                <button class="sv-btn primary" id="sv-set-save" data-testid="sv-set-save">Save settings</button>
            </div>
        </div>`;
    view.querySelector('#sv-set-save').addEventListener('click', async (event) => {
        const payload = {
            default_retention_days: Number(view.querySelector('#sv-set-retention').value),
            quota_pct: Number(view.querySelector('#sv-set-quota').value),
            segment_s: Number(view.querySelector('#sv-set-segment').value),
            pre_s: Number(view.querySelector('#sv-set-pre').value),
            post_s: Number(view.querySelector('#sv-set-post').value),
            notify_motion: view.querySelector('#sv-set-notify-motion').checked,
            notify_offline: view.querySelector('#sv-set-notify-offline').checked,
        };
        event.target.disabled = true;
        try {
            _settings = (await apiJson(`${API}/settings`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })).settings;
            toast('Settings saved', 'success');
        } catch (error) { toast(error.message, 'error'); }
        event.target.disabled = false;
    });
}

// ── Entry point ─────────────────────────────────────────────────────────────

export async function render(container, ctx) {
    _ctx = ctx;
    ctx.log('info', 'Cameras opened');
    container.style.padding = '0';
    container.style.overflow = 'hidden';
    mountShell(container);
    showSection('live');
    try {
        await loadAdminViews();
        await refresh('live');
    } catch (error) {
        setStatus(error.message, 'error');
    }
    // Live status/events without polling. connectWs appends the JWT itself.
    try {
        _wsStop = ctx.ws.connect('/ws/surveillance', (message) => {
            if (!message || !message.type) return;
            if (message.type === 'status' && Array.isArray(message.cameras)) {
                for (const status of message.cameras) {
                    const cam = _cameras.find((c) => c.id === status.camera_id);
                    if (cam) {
                        cam.status = status;
                        cam.last_error = status.last_error || '';
                    }
                }
                if (_section === 'live' || _section === 'cameras') renderSection();
            } else if (message.type === 'event') {
                _events.unshift(message.event);
                if (_section === 'events') renderSection();
            }
        }, { appId: 'pkg-ethos-surveillance', name: 'surveillance', isJson: true });
    } catch (error) {
        ctx.log('warn', 'Camera status socket unavailable', String(error));
    }
}
