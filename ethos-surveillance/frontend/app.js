// EthOS NAS — Surveillance Station (Package Center app)
//   - Live tab: MJPEG grid (ffmpeg re-mux), status dots, click → big view + snapshot
//   - Cameras tab: CRUD with connection test, motion-detection settings
//   - Events tab: motion events with thumbnails (fed by per-camera frame-diff threads)
//
// The /api/surveillance API and the camera/motion service stay in the EthOS core
// (ffmpeg recording, path scope); this package owns the desktop UI only.

// ── Native-module shim ────────────────────────────────────────────────────────
let _ctx = null;
const escapeHtml = (value) => _ctx.escape.html(value);
const escapeAttr = (value) => _ctx.escape.attr(value);

function getToken() {
    return localStorage.getItem('token') || '';
}

function apiFetch(path, options) {
    return _ctx.apiFetch(path, options);
}

const showFormModal = (options) => _ctx.modal.form(options);
const showConfirm = (title, message, onConfirm, onCancel) =>
    _ctx.modal.confirm(title, message, onConfirm, onCancel);

// Visibility-aware poller with the core/poller.js contract (returns stop()).
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

const API = '/api/surveillance';
const POLL_MS = 10000;

let _body = null;          // .window-body element of this instance
let _tab = 'live';
let _cameras = [];
let _events = [];
let _clips = [];
let _pollStop = null; // shared poller stop handle (core/poller.js)
let _presetCam = null;   // {name, url} prefill for the add-camera modal (from network discovery)

// ── Helpers ────────────────────────────────────────────────────────────────

function _active() { return !!(_body && _body.isConnected); }
function _token() { return encodeURIComponent(getToken() || ''); }
function _liveUrl(id) { return `${API}/cameras/${id}/live?token=${_token()}`; }
function _snapUrl(id, w = 480, refresh = false) {
    return `${API}/cameras/${id}/snapshot?w=${w}${refresh ? '&refresh=1' : ''}&token=${_token()}`;
}
function _eventImgUrl(eid) { return `${API}/events/${eid}/image?token=${_token()}`; }
function _clipUrl(clipId) { return `${API}/clips/${clipId}/download?token=${_token()}`; }

function _fmtBytes(n) {
    if (n == null || isNaN(n)) return '—';
    if (n < 1024) return n + ' B';
    if (n < 1024 ** 2) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1024 ** 3) return (n / 1024 ** 2).toFixed(1) + ' MB';
    return (n / 1024 ** 3).toFixed(2) + ' GB';
}

function _relTime(iso) {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return `${Math.floor(s)}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
}

async function _loadCameras() {
    const r = await apiFetch(`${API}/cameras`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    _cameras = (await r.json()).cameras || [];
}

async function _loadEvents() {
    const r = await apiFetch(`${API}/events?limit=100`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    _events = (await r.json()).events || [];
}

async function _loadClips() {
    const r = await apiFetch(`${API}/clips`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    _clips = (await r.json()).clips || [];
}

// ── Entry point ────────────────────────────────────────────────────────────

export async function renderSurveillancePage(winBody) {
    _body = winBody;
    winBody.innerHTML = `
        <div style="display:flex;gap:4px;border-bottom:1px solid var(--border);padding:0 8px;">
            ${['live', 'cameras', 'clips', 'events'].map(t => `
                <button class="surv-tab" data-tab="${t}" data-testid="surv-tab-${t}"
                    style="flex:none;padding:12px 16px;background:none;border:none;cursor:pointer;font-size:13px;font-weight:600;color:var(--text-2);border-bottom:2px solid transparent;">
                    ${{ live: '📡 Live', cameras: '🎥 Cameras', clips: '🎬 Clips', events: '🚨 Events' }[t]}
                </button>`).join('')}
        </div>
        <div class="surv-content" style="padding:16px;overflow:auto;height:calc(100% - 45px);"></div>`;

    winBody.querySelectorAll('.surv-tab').forEach(b => {
        b.addEventListener('click', () => { _tab = b.dataset.tab; renderTab(); });
    });

    await refreshAll();
    // Shared poller: paused while the tab is hidden, stopped when the window
    // closes (no leaked interval, no requests from a background tab).
    if (_pollStop) _pollStop();
    _pollStop = poll(() => refreshAll(), POLL_MS,
                     { appId: 'surveillance', immediate: false, name: 'surveillance' });
}

function _content() { return _body ? _body.querySelector('.surv-content') : null; }

async function refreshAll() {
    await Promise.all([_loadCameras(), _loadEvents()]);
    renderTab();
}

function renderTab() {
    if (!_active()) return;
    const c = _content();
    if (!c) return;
    if (_tab === 'live') renderLive(c);
    else if (_tab === 'cameras') renderCameras(c);
    else if (_tab === 'clips') renderClips(c);
    else renderEvents(c);
}

// ── Live tab ───────────────────────────────────────────────────────────────

function renderLive(c) {
    const cams = _cameras.filter(x => x.enabled !== false);
    if (!cams.length) {
        c.innerHTML = `<div style="text-align:center;padding:60px 20px;color:var(--text-3);">
            <div style="font-size:40px;margin-bottom:12px;">📹</div>
            No cameras yet — add one in the <b>Cameras</b> tab.</div>`;
        return;
    }
    c.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;">
        ${cams.map(cam => {
            const err = cam.last_error ? 'error' : '';
            return `
            <div class="surv-tile" data-cam="${cam.id}" data-testid="surv-tile-${cam.id}"
                style="border:1px solid var(--border);border-radius:10px;overflow:hidden;background:#000;cursor:pointer;">
                <div style="position:relative;aspect-ratio:16/9;background:#0a0a0a;">
                    <img src="${_liveUrl(cam.id)}" alt="${escapeAttr(cam.name + ' live')}"
                        data-testid="surv-live-${cam.id}"
                        style="width:100%;height:100%;object-fit:contain;display:block;"
                        onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
                    <div class="surv-offline" style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;color:#f87171;font-size:13px;background:#0a0a0a;">⚠ No signal</div>
                </div>
                <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--surface-1);">
                    <span class="surv-dot" data-cam="${cam.id}" style="width:9px;height:9px;border-radius:50%;background:${err ? '#f87171' : '#4ade80'};flex:none;"></span>
                    <span style="font-size:13px;font-weight:600;color:var(--text-1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(cam.name)}</span>
                    ${(cam.motion || {}).enabled ? '<span style="margin-left:auto;font-size:10px;padding:2px 7px;border-radius:8px;background:rgba(91,154,255,.15);color:#5b9aff;">MOTION</span>' : ''}
                </div>
            </div>`;
        }).join('')}
    </div>`;

    c.querySelectorAll('.surv-tile').forEach(tile => {
        tile.addEventListener('click', () => openLiveModal(tile.dataset.cam));
    });
}

async function openLiveModal(camId) {
    const cam = _cameras.find(x => x.id === camId);
    if (!cam) return;
    await showFormModal({
        title: `${cam.name} — live view`,
        confirmLabel: 'Close',
        bodyHtml: `
            <div style="position:relative;aspect-ratio:16/9;background:#000;border-radius:8px;overflow:hidden;">
                <img src="${_liveUrl(cam.id)}" alt="live" style="width:100%;height:100%;object-fit:contain;display:block;"
                    onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
                <div style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;color:#f87171;background:#0a0a0a;">⚠ No signal</div>
            </div>
            <div id="surv-snap-holder" style="margin-top:12px;"></div>`,
    });
}

// ── Cameras tab ────────────────────────────────────────────────────────────

function renderCameras(c) {
    c.innerHTML = `
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:12px;">
            <button id="surv-discover-btn" data-testid="surv-discover"
                style="padding:8px 16px;font-size:13px;border-radius:8px;border:1px solid var(--border);background:none;color:var(--text-2);cursor:pointer;font-weight:600;">🔍 Search network</button>
            <button id="surv-add-cam" data-testid="surv-add-camera"
                style="padding:8px 16px;font-size:13px;border-radius:8px;border:none;background:#5b9aff;color:white;cursor:pointer;font-weight:600;">+ Add camera</button>
        </div>
        <div id="surv-discover"></div>
        ${_cameras.length ? `
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead><tr style="color:var(--text-3);font-size:11px;text-transform:uppercase;letter-spacing:.5px;text-align:left;border-bottom:1px solid var(--border);">
                <th style="padding:8px 10px;">Name</th><th style="padding:8px 10px;">URL</th>
                <th style="padding:8px 10px;width:70px;">Enabled</th><th style="padding:8px 10px;width:340px;"></th>
            </tr></thead>
            <tbody>
            ${_cameras.map(cam => `
                <tr data-cam="${cam.id}" style="border-bottom:1px solid var(--border);">
                    <td style="padding:10px;font-weight:600;color:var(--text-1);">${escapeHtml(cam.name)}${(cam.motion || {}).enabled ? ' <span style="font-size:10px;padding:2px 7px;border-radius:8px;background:rgba(91,154,255,.15);color:#5b9aff;">MOTION</span>' : ''}</td>
                    <td style="padding:10px;font-family:monospace;font-size:11px;color:var(--text-3);word-break:break-all;">${escapeHtml(cam.url)}</td>
                    <td style="padding:10px;"><input type="checkbox" class="surv-enabled" data-cam="${cam.id}" ${cam.enabled !== false ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer;"></td>
                    <td style="padding:10px;">
                        ${cam.last_error ? `<div style="font-size:11px;color:#f87171;margin-bottom:4px;" title="${escapeAttr(cam.last_error)}">⚠ ${escapeHtml(cam.last_error.slice(0, 60))}</div>` : ''}
                        <span style="display:flex;gap:6px;">
                            <button class="surv-test" data-cam="${cam.id}" data-testid="surv-test-${cam.id}" style="padding:4px 10px;font-size:12px;border-radius:6px;border:1px solid var(--border);background:none;color:var(--text-2);cursor:pointer;">Test</button>
                            <button class="surv-motion" data-cam="${cam.id}" style="padding:4px 10px;font-size:12px;border-radius:6px;border:1px solid var(--border);background:none;color:var(--text-2);cursor:pointer;">Motion</button>
                            <button class="surv-rec" data-cam="${cam.id}" data-testid="surv-record-${cam.id}" style="padding:4px 10px;font-size:12px;border-radius:6px;border:1px solid ${cam.recording ? '#f87171' : 'var(--border)'};background:${cam.recording ? 'rgba(248,113,113,.15)' : 'none'};color:${cam.recording ? '#f87171' : 'var(--text-2)'};cursor:pointer;font-weight:600;">${cam.recording ? '■ Stop' : '● Record'}</button>
                            <button class="surv-del" data-cam="${cam.id}" data-testid="surv-delete-${cam.id}" style="padding:4px 10px;font-size:12px;border-radius:6px;border:1px solid var(--border);background:none;color:#f87171;cursor:pointer;">Delete</button>
                        </span>
                    </td>
                </tr>`).join('')}
            </tbody>
        </table>` : `<div style="text-align:center;padding:50px 20px;color:var(--text-3);">No cameras configured.</div>`}`;

    c.querySelector('#surv-add-cam')?.addEventListener('click', () => openCameraModal(null));
    c.querySelector('#surv-discover-btn')?.addEventListener('click', () => _runDiscovery(c));
    c.querySelectorAll('.surv-enabled').forEach(cb => cb.addEventListener('change', async () => {
        const r = await apiFetch(`${API}/cameras/${cb.dataset.cam}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: cb.checked }) });
        if (!r.ok) window.addNotification?.('Failed to update camera', 'error');
    }));
    c.querySelectorAll('.surv-test').forEach(b => b.addEventListener('click', async () => {
        b.disabled = true; b.textContent = 'Testing…';
        const r = await apiFetch(`${API}/cameras/${b.dataset.cam}/test`, { method: 'POST' });
        const d = r.ok ? await r.json() : { ok: false, detail: 'HTTP ' + r.status };
        window.addNotification?.(d.ok ? `Connection OK — ${_cameras.find(x => x.id === b.dataset.cam)?.name}` : (d.detail || 'Connection failed'), d.ok ? 'success' : 'error');
        renderTab();
    }));
    c.querySelectorAll('.surv-motion').forEach(b => b.addEventListener('click', () => openMotionModal(b.dataset.cam)));
    c.querySelectorAll('.surv-rec').forEach(b => b.addEventListener('click', async () => {
        const cam = _cameras.find(x => x.id === b.dataset.cam);
        if (!cam) return;
        if (cam.recording) {
            const r = await apiFetch(`${API}/cameras/${cam.id}/record`, { method: 'DELETE' });
            window.addNotification?.(r.ok ? `Stopped recording ${cam.name}` : 'Failed to stop recording', r.ok ? 'info' : 'error');
        } else {
            const ok = await showConfirm('Start recording', `Record “${cam.name}” to MP4? It keeps going until you press Stop.`);
            if (!ok) return;
            const r = await apiFetch(`${API}/cameras/${cam.id}/record`, { method: 'POST' });
            if (r.ok) {
                window.addNotification?.(`Recording ${cam.name}`, 'success');
            } else {
                let detail = `HTTP ${r.status}`;
                try { detail = (await r.json()).detail || detail; } catch (_) {}
                window.addNotification?.(detail, 'error');
            }
        }
        refreshAll().catch(() => {});
    }));
    c.querySelectorAll('.surv-del').forEach(b => b.addEventListener('click', async () => {
        const cam = _cameras.find(x => x.id === b.dataset.cam);
        const ok = await showConfirm('Delete camera', `Remove “${cam?.name}” and its cached images?`);
        if (!ok) return;
        const r = await apiFetch(`${API}/cameras/${b.dataset.cam}`, { method: 'DELETE' });
        if (r.ok) { window.addNotification?.(`Deleted ${cam?.name}`, 'info'); refreshAll().catch(() => {}); }
    }));
}

// ── Network discovery ──────────────────────────────────────────────────────

async function _runDiscovery(container) {
    const btn = container.querySelector('#surv-discover-btn');
    const box = container.querySelector('#surv-discover');
    if (!btn || !box) return;
    btn.disabled = true; btn.textContent = '🔍 Searching…';
    box.innerHTML = `<div style="font-size:12px;color:var(--text-3);padding:8px 0;">Probing the local network for cameras (ONVIF + RTSP/HTTP scan)…</div>`;
    try {
        const r = await apiFetch(`${API}/discover`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ timeout_s: 3, scan_subnets: true }) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = await r.json();
        const results = d.results || [];
        box.innerHTML = results.length ? `
            <div style="margin-bottom:12px;border:1px solid var(--border);border-radius:8px;overflow:hidden;">
                <div style="padding:8px 12px;font-size:12px;color:var(--text-3);background:var(--surface-1);">Found ${results.length} device(s)${d.scanned?.network ? ` on ${escapeHtml(d.scanned.network)} (${d.duration_s}s)` : ''}</div>
                <table style="width:100%;border-collapse:collapse;font-size:12px;">
                    <thead><tr style="color:var(--text-3);font-size:10px;text-transform:uppercase;letter-spacing:.5px;text-align:left;border-bottom:1px solid var(--border);">
                        <th style="padding:6px 10px;">IP</th><th style="padding:6px 10px;">Type</th>
                        <th style="padding:6px 10px;">Ports</th><th style="padding:6px 10px;">Suggested URL</th><th style="padding:6px 10px;width:80px;"></th>
                    </tr></thead>
                    <tbody>${results.map(row => `
                        <tr data-ip="${row.ip}" style="border-bottom:1px solid var(--border);">
                            <td style="padding:8px 10px;font-family:monospace;">${escapeHtml(row.ip)}</td>
                            <td style="padding:8px 10px;">${[row.onvif ? 'ONVIF' : '', row.rtsp ? 'RTSP' : '', (!row.onvif && !row.rtsp) ? 'HTTP' : ''].filter(Boolean).map(t => `<span data-testid="surv-disc-badge" style="font-size:10px;padding:2px 7px;border-radius:8px;background:rgba(91,154,255,.15);color:#5b9aff;margin-right:4px;">${t}</span>`).join('')}</td>
                            <td style="padding:8px 10px;color:var(--text-3);">${row.ports?.length ? row.ports.join(', ') : '—'}</td>
                            <td style="padding:8px 10px;font-family:monospace;font-size:11px;word-break:break-all;">${escapeHtml(row.suggested_url || '')}</td>
                            <td style="padding:8px 10px;"><button class="surv-disc-add" data-ip="${row.ip}" data-testid="surv-disc-add-${row.ip.replace(/\./g, '-')}" style="padding:4px 10px;font-size:12px;border-radius:6px;border:none;background:#5b9aff;color:white;cursor:pointer;font-weight:600;">Add</button></td>
                        </tr>`).join('')}</tbody>
                </table>
            </div>` : `<div style="font-size:12px;color:var(--text-3);padding:8px 0;">No cameras found${d.scanned?.network ? ` on ${escapeHtml(d.scanned.network)}` : ''}. You can still add one manually with “+ Add camera”.</div>`;
        box.querySelectorAll('.surv-disc-add').forEach(b => b.addEventListener('click', () => {
            const row = results.find(x => x.ip === b.dataset.ip);
            if (!row) return;
            _presetCam = { name: row.ip, url: row.suggested_url || '' };
            openCameraModal(null);
        }));
    } catch (e) {
        box.innerHTML = `<div style="font-size:12px;color:#f87171;padding:8px 0;">Discovery failed: ${escapeHtml(String(e.message || e))}</div>`;
    } finally {
        btn.disabled = false; btn.textContent = '🔍 Search network';
    }
}

async function openCameraModal(camId) {
    const cam = camId ? _cameras.find(x => x.id === camId) : null;
    const preset = !cam && _presetCam ? _presetCam : null;
    const values = await showFormModal({
        title: cam ? `Edit ${cam.name}` : 'Add camera',
        confirmLabel: cam ? 'Save' : 'Add',
        bodyHtml: `
            <div style="font-size:12px;color:var(--modal-text,#cbd5e1);opacity:.75;margin-bottom:0;">Name</div>
            <input class="ethos-modal-input" name="name" maxlength="60" value="${escapeAttr(cam?.name || preset?.name || '')}" placeholder="Front Door" style="margin-top:4px;">
            <div style="font-size:12px;color:var(--modal-text,#cbd5e1);opacity:.75;margin:14px 0 0;">Stream URL (rtsp://, http:// or https://)</div>
            <input class="ethos-modal-input" name="url" value="${escapeAttr(cam?.url || preset?.url || '')}" placeholder="rtsp://user:pass@192.168.1.50:554/stream1" style="margin-top:4px;font-family:monospace;font-size:12px;">
            <div id="surv-test-result" style="margin-top:12px;font-size:12px;"></div>`,
    });
    _presetCam = null;   // one-shot prefill
    if (!values) { _presetCam = null; return; }
    const name = (values.name || '').trim();
    const url = (values.url || '').trim();
    if (!name || !url) { window.addNotification?.('Name and URL are required', 'error'); return; }

    let r;
    if (cam) {
        r = await apiFetch(`${API}/cameras/${cam.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, url }) });
    } else {
        r = await apiFetch(`${API}/cameras`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, url }) });
    }
    if (!r.ok) {
        let detail = `HTTP ${r.status}`;
        try { detail = (await r.json()).detail || detail; } catch (_) {}
        window.addNotification?.(detail, 'error');
        return;
    }
    window.addNotification?.(cam ? `Updated ${name}` : `Added camera “${name}”`, 'success');
    refreshAll().catch(() => {});
}

async function openMotionModal(camId) {
    const cam = _cameras.find(x => x.id === camId);
    if (!cam) return;
    const m = cam.motion || {};
    const values = await showFormModal({
        title: `Motion detection — ${cam.name}`,
        confirmLabel: 'Save',
        bodyHtml: `
            <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-2);cursor:pointer;">
                <input type="checkbox" name="enabled" ${m.enabled ? 'checked' : ''} style="width:16px;height:16px;"> Enable motion detection
            </label>
            <div style="font-size:12px;color:var(--modal-text,#cbd5e1);opacity:.75;margin:14px 0 0;">Check interval (seconds, 1–3600)</div>
            <input class="ethos-modal-input" name="interval_s" type="number" min="1" max="3600" step="1" value="${m.interval_s ?? 5}" style="margin-top:4px;">
            <div style="font-size:12px;color:var(--modal-text,#cbd5e1);opacity:.75;margin:14px 0 0;">Sensitivity (0.05–0.9, higher = less sensitive)</div>
            <input class="ethos-modal-input" name="sensitivity" type="number" min="0.05" max="0.9" step="0.05" value="${m.sensitivity ?? 0.3}" style="margin-top:4px;">`,
    });
    if (!values) return;
    const r = await apiFetch(`${API}/cameras/${camId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motion: { enabled: values.enabled === 'on' || values.enabled === 'true', interval_s: parseFloat(values.interval_s), sensitivity: parseFloat(values.sensitivity) } }),
    });
    if (!r.ok) { window.addNotification?.('Failed to save motion settings', 'error'); return; }
    window.addNotification?.(`Motion settings saved for ${cam.name}`, 'success');
    refreshAll().catch(() => {});
}

// ── Events tab ─────────────────────────────────────────────────────────────

// ── Clips tab ────────────────────────────────────────────────────────────────

async function renderClips(c) {
    if (!_clips.length && !c.querySelector('[data-testid^="surv-clip-"]')) {
        c.innerHTML = '<div style="color:var(--text-3);padding:40px;text-align:center;">Loading clips…</div>';
        try { await _loadClips(); } catch (_) {}
    }
    if (!_active()) return;
    const camName = id => _cameras.find(x => x.id === id)?.name || 'deleted camera';
    c.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <span style="font-size:12px;color:var(--text-3);">${_clips.length} clip(s)</span>
        </div>
        ${_clips.length ? `
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead><tr style="color:var(--text-3);font-size:11px;text-transform:uppercase;letter-spacing:.5px;text-align:left;border-bottom:1px solid var(--border);">
                <th style="padding:8px 10px;">Camera</th><th style="padding:8px 10px;">Started</th>
                <th style="padding:8px 10px;width:90px;">Size</th><th style="padding:8px 10px;width:220px;"></th>
            </tr></thead>
            <tbody>
            ${_clips.map(cl => `
                <tr data-testid="surv-clip-${cl.id}" style="border-bottom:1px solid var(--border);">
                    <td style="padding:10px;font-weight:600;color:var(--text-1);">${escapeHtml(camName(cl.camera_id))}</td>
                    <td style="padding:10px;color:var(--text-2);" title="${escapeAttr(cl.started_at)}">${_relTime(cl.started_at)}</td>
                    <td style="padding:10px;color:var(--text-2);font-family:monospace;font-size:12px;">${_fmtBytes(cl.size_bytes)}</td>
                    <td style="padding:10px;">
                        <span style="display:flex;gap:6px;">
                            <button class="surv-clip-play" data-id="${cl.id}" title="Preview" style="padding:4px 10px;font-size:12px;border-radius:6px;border:1px solid var(--border);background:none;color:var(--text-2);cursor:pointer;">▶ Play</button>
                            <a class="surv-clip-dl" href="${_clipUrl(cl.id)}" download title="Download" style="padding:4px 10px;font-size:12px;border-radius:6px;border:1px solid var(--border);background:none;color:var(--text-2);cursor:pointer;text-decoration:none;">⬇</a>
                            <button class="surv-clip-del" data-id="${cl.id}" title="Delete clip" style="padding:4px 10px;font-size:12px;border-radius:6px;border:1px solid var(--border);background:none;color:#f87171;cursor:pointer;">✕</button>
                        </span>
                    </td>
                </tr>`).join('')}
            </tbody>
        </table>` : `<div style="text-align:center;padding:50px 20px;color:var(--text-3);">No clips yet. Press <b>● Record</b> on a camera in the <b>Cameras</b> tab.</div>`}`;

    c.querySelectorAll('.surv-clip-play').forEach(b => b.addEventListener('click', () => {
        showFormModal({
            title: 'Clip preview',
            confirmLabel: 'Close',
            bodyHtml: `<video controls autoplay style="width:100%;aspect-ratio:16/9;background:#000;border-radius:8px;" src="${_clipUrl(b.dataset.id)}"></video>`,
        }).catch(() => {});
    }));
    c.querySelectorAll('.surv-clip-del').forEach(b => b.addEventListener('click', async () => {
        const ok = await showConfirm('Delete clip', 'Delete this recording? This cannot be undone.');
        if (!ok) return;
        const r = await apiFetch(`${API}/clips/${b.dataset.id}`, { method: 'DELETE' });
        if (r.ok) { _clips = _clips.filter(x => x.id !== b.dataset.id); renderTab(); }
    }));
}

function renderEvents(c) {
    c.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <span style="font-size:12px;color:var(--text-3);">${_events.length} event(s)</span>
            ${_events.length ? `<button id="surv-clear-events" data-testid="surv-clear-events" style="padding:6px 14px;font-size:12px;border-radius:8px;border:1px solid var(--border);background:none;color:#f87171;cursor:pointer;">Clear all</button>` : ''}
        </div>
        ${_events.length ? `<div style="display:flex;flex-direction:column;gap:8px;">
            ${_events.map(e => `
                <div data-testid="surv-event-${e.id}" style="display:flex;align-items:center;gap:12px;padding:8px 12px;border:1px solid var(--border);border-radius:10px;background:var(--surface-1);">
                    ${e.image ? `<img src="${_eventImgUrl(e.id)}" alt="" style="width:96px;height:54px;object-fit:cover;border-radius:6px;background:#000;">` : '<div style="width:96px;height:54px;border-radius:6px;background:#1e293b;display:flex;align-items:center;justify-content:center;color:var(--text-3);font-size:18px;">🚨</div>'}
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:13px;font-weight:600;color:var(--text-1);">Motion — ${escapeHtml(e.camera_name || 'unknown camera')}</div>
                        <div style="font-size:11px;color:var(--text-3);">${_relTime(e.at)}</div>
                    </div>
                    <button class="surv-ev-del" data-id="${e.id}" title="Delete event" style="padding:4px 10px;font-size:12px;border-radius:6px;border:1px solid var(--border);background:none;color:#f87171;cursor:pointer;">✕</button>
                </div>`).join('')}
        </div>` : `<div style="text-align:center;padding:50px 20px;color:var(--text-3);">No motion events yet. Enable motion detection on a camera in the <b>Cameras</b> tab.</div>`}`;

    c.querySelector('#surv-clear-events')?.addEventListener('click', async () => {
        const ok = await showConfirm('Clear events', 'Delete all motion events and their images?');
        if (!ok) return;
        const r = await apiFetch(`${API}/events`, { method: 'DELETE' });
        if (r.ok) { _events = []; renderTab(); }
    });
    c.querySelectorAll('.surv-ev-del').forEach(b => b.addEventListener('click', async () => {
        const r = await apiFetch(`${API}/events/${b.dataset.id}`, { method: 'DELETE' });
        if (r.ok) { _events = _events.filter(e => e.id !== b.dataset.id); renderTab(); }
    }));
}

// ── Package entry point ───────────────────────────────────────────────────────
export async function render(container, ctx) {
    _ctx = ctx;
    ctx.log('info', 'Surveillance opened');
    await renderSurveillancePage(container);
}
