// EthOS NAS — Docker Manager package UI (engine status + Containers + Images + Volumes)
// ── Native-module shim ────────────────────────────────────────────────────────
// Self-contained: every core helper arrives through `ctx` in render(). The core
// keeps ownership of the window manager, progress rows, the log viewer and the
// Notification Center — this module only renders into the container it is given.
let _ctx = null;
let _windowBody = null;

const escapeHtml = (value) => _ctx.escape.html(value);
const escapeAttr = (value) => _ctx.escape.attr(value);

function fmtBytes(bytes) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n < 0) return '—';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    let i = 0, value = n;
    while (value >= k && i < sizes.length - 1) { value /= k; i++; }
    return `${parseFloat(value.toFixed(1))} ${sizes[i]}`;
}

// Kept in step with core/utils.js formatBytes (this module cannot import it).
const formatBytes = fmtBytes;

function formatPorts(ports) {
    if (!ports) return '—';
    if (typeof ports === 'string') return escapeHtml(ports);
    if (Array.isArray(ports)) {
        return ports.map((p) => {
            if (!p || !p.private_port) return '';
            const ext = `${p.public_port || '—'}`;
            return `<span style="font-family:monospace;font-size:12px;">${ext}</span>→<span style="color: var(--text-2)">${p.private_port}</span>`;
        }).join('<br>') || '—';
    }
    return '—';
}

function skeletonRows(count = 5) {
    const n = Math.max(1, Math.min(50, Number(count) || 5));
    const bar = (w, h = 12) => `<div class="ethos-skel" style="height:${h}px;width:${w};border-radius:6px;
            background:linear-gradient(90deg,var(--surface-2) 25%,var(--surface-1) 50%,var(--surface-2) 75%);
            background-size:200% 100%;animation:ethos-skel-shimmer 1.4s ease-in-out infinite;"></div>`;
    const widths = ['42%', '61%', '35%', '55%', '48%', '66%'];
    const row = (i) => `<div class="ethos-skeleton-row" style="display:flex;align-items:center;gap:14px;padding:9px 4px;border-bottom:1px solid var(--border);">
        ${bar('18px', 18)}${bar(widths[i % widths.length])}${bar('14%', 12)}${bar('22%', 12)}</div>`;
    return `<div class="ethos-skeleton" role="status" aria-label="Loading" aria-busy="true">
        ${Array.from({ length: n }, (_, i) => row(i)).join('')}</div>`;
}

function apiFetch(path, options) { return _ctx.apiFetch(path, options); }
function apiJsonFetch(path, options) { return _ctx.apiJsonFetch(path, options); }

// The global Notification Center is the only toast surface (docs/notifications.md).
// Legacy call sites pass (kind, message) — same auto-swap as core addNotification.
const NOTIFICATION_KINDS = ['success', 'error', 'warning', 'info'];
function addNotification(message, kind = 'info') {
    let text = message;
    let type = kind;
    if (NOTIFICATION_KINDS.includes(message) && !NOTIFICATION_KINDS.includes(kind)) {
        text = kind;
        type = message;
    }
    return _ctx.notifications.toast(String(text), type);
}

function showRestartOverlay(...args) { return _ctx.windows.showRestartOverlay(...args); }
function openLogs(options) { return _ctx.logs.open(options); }
function startTask(...args) { return _ctx.progress.startTask(...args); }

// ctx.modal.confirm is callback-based and returns the dialog element — it is
// not a Promise. Wrap it once so every call site can `await` it; calling
// `.then()` on the element used to throw and silently abort Docker actions.
function confirmAction(title, message) {
    return new Promise((resolve) => {
        _ctx.modal.confirm({
            title,
            message,
            onConfirm: () => resolve(true),
            onCancel: () => resolve(false),
        });
    });
}

// ── Shared package shell (same layout/tokens as AntiVirus, Domains, Backups) ──
const STYLE = `
.dk-root {
    color-scheme: light;
    --dk-bg: #eef2f7;
    --dk-side-bg: rgba(255, 255, 255, 0.88);
    --dk-panel: #ffffff;
    --dk-surface: #f4f5f7;
    --dk-input-bg: #ffffff;
    --dk-border: #e3e5e8;
    --dk-text: #1f2430;
    --dk-muted: #5b6472;
    --dk-accent: #2563eb;
    --dk-accent-soft: rgba(37, 99, 235, 0.10);
    --dk-accent-border: rgba(37, 99, 235, 0.45);
    --dk-green: #15803d;
    --dk-green-soft: rgba(21, 128, 61, 0.12);
    --dk-green-border: rgba(21, 128, 61, 0.35);
    --dk-red: #b91c1c;
    --dk-red-soft: rgba(185, 28, 28, 0.08);
    --dk-red-border: rgba(185, 28, 28, 0.32);
    --dk-amber: #b45309;
    --dk-amber-soft: rgba(180, 83, 9, 0.10);
    --dk-amber-border: rgba(180, 83, 9, 0.30);
    --dk-hover: rgba(15, 23, 42, 0.06);
    display: flex;
    height: 100%;
    overflow: hidden;
    background:
        radial-gradient(circle at 8% 4%, var(--dk-glow-1, rgba(37, 99, 235, 0.08)), transparent 40%),
        radial-gradient(circle at 92% 96%, var(--dk-glow-2, rgba(21, 128, 61, 0.06)), transparent 40%),
        var(--dk-bg);
    color: var(--dk-text);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
:root.dark .dk-root {
    color-scheme: dark;
    --dk-bg: #08111d;
    --dk-side-bg: rgba(2, 6, 23, 0.45);
    --dk-panel: rgba(148, 163, 184, 0.07);
    --dk-surface: rgba(15, 23, 42, 0.45);
    --dk-input-bg: rgba(2, 6, 23, 0.55);
    --dk-border: rgba(148, 163, 184, 0.22);
    --dk-text: #e2e8f0;
    --dk-muted: #94a3b8;
    --dk-accent: #38bdf8;
    --dk-accent-soft: rgba(56, 189, 248, 0.14);
    --dk-accent-border: rgba(56, 189, 248, 0.55);
    --dk-green: #4ade80;
    --dk-green-soft: rgba(74, 222, 128, 0.14);
    --dk-green-border: rgba(74, 222, 128, 0.45);
    --dk-red: #f87171;
    --dk-red-soft: rgba(248, 113, 113, 0.12);
    --dk-red-border: rgba(248, 113, 113, 0.45);
    --dk-amber: #fbbf24;
    --dk-amber-soft: rgba(251, 191, 36, 0.10);
    --dk-amber-border: rgba(251, 191, 36, 0.45);
    --dk-hover: rgba(148, 163, 184, 0.09);
}
.dk-root *, .dk-root *::before, .dk-root *::after { box-sizing: border-box; }
.dk-root button, .dk-root input { font-family: inherit; }
.dk-side { flex: none; width: 218px; padding: 20px 14px; border-right: 1px solid var(--dk-border);
    background: var(--dk-side-bg); display: flex; flex-direction: column; gap: 16px; overflow-y: auto; }
.dk-brand { display: flex; align-items: center; gap: 10px; padding: 0 4px; }
.dk-brand-icon { font-size: 26px; line-height: 1; }
.dk-brand strong { display: block; font-size: 13.5px; }
.dk-brand small { display: block; margin-top: 2px; font-size: 11px; color: var(--dk-muted); }
.dk-nav { display: flex; flex-direction: column; gap: 2px; }
.dk-nav-item { text-align: left; border: 0; background: transparent; color: var(--dk-text);
    padding: 9px 11px; border-radius: 9px; font-size: 12px; font-weight: 600; cursor: pointer; }
.dk-nav-item:hover { background: var(--dk-hover); }
.dk-nav-item:disabled { opacity: 0.45; cursor: not-allowed; }
.dk-nav-item.is-active { background: var(--dk-accent-soft); color: var(--dk-accent); }
.dk-side-foot { margin-top: auto; display: flex; flex-direction: column; gap: 8px; padding: 0 4px; }
.dk-side-note { font-size: 11px; line-height: 1.45; color: var(--dk-muted); }
.dk-pill { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 999px;
    font-size: 10px; font-weight: 700; background: var(--dk-surface); border: 1px solid var(--dk-border); color: var(--dk-muted); }
.dk-pill.ready { background: var(--dk-green-soft); border-color: transparent; color: var(--dk-green); }
.dk-pill.starting { background: var(--dk-amber-soft); border-color: transparent; color: var(--dk-amber); }
.dk-pill.offline { background: var(--dk-red-soft); border-color: transparent; color: var(--dk-red); }
.dk-main { flex: 1; min-width: 0; overflow-y: auto; padding: 24px 28px 32px; }
.dk-main header h1 { margin: 0; font-size: clamp(22px, 3.4vw, 30px); letter-spacing: -0.02em; }
.dk-page-sub { margin: 6px 0 0; font-size: 12px; color: var(--dk-muted); }
.dk-status { margin: 8px 0 0; min-height: 18px; font-size: 12px; font-weight: 600; color: var(--dk-accent); }
.dk-status.error { color: var(--dk-red); }
.dk-status.warn { color: var(--dk-amber); }
.dk-view { display: flex; flex-direction: column; gap: 14px; margin-top: 16px; }
.dk-panel { padding: 17px 18px; border: 1px solid var(--dk-border); border-radius: 15px; background: var(--dk-panel); }
.dk-toolbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.dk-toolbar h2 { margin: 0; font-size: 15px; font-weight: 700; }
.dk-sub { margin: 4px 0 0; font-size: 12px; color: var(--dk-muted); }
.dk-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.dk-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 9px; margin-bottom: 14px; }
.dk-summary div { padding: 11px; border: 1px solid var(--dk-border); border-radius: 10px; background: var(--dk-surface); }
.dk-summary span { display: block; font-size: 9px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--dk-muted); }
.dk-summary strong { display: block; margin-top: 4px; font-size: 20px; font-variant-numeric: tabular-nums; }
.dk-table { width: 100%; border-collapse: collapse; font-size: 11px; }
.dk-table th { padding: 8px 9px; text-align: left; font-size: 9px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.08em; color: var(--dk-muted); border-bottom: 1px solid var(--dk-border); }
.dk-table td { padding: 9px; vertical-align: middle; border-bottom: 1px solid var(--dk-border); }
.dk-table tr:last-child td { border-bottom: 0; }
.dk-name { font-weight: 600; color: var(--dk-text); }
.dk-meta-line { display: block; margin-top: 2px; font-size: 10.5px; font-weight: 400; color: var(--dk-muted); }
.dk-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
.dk-actions { display: flex; justify-content: flex-end; gap: 4px; flex-wrap: wrap; }
.dk-btn { border: 1px solid var(--dk-border); background: var(--dk-surface); color: var(--dk-text);
    border-radius: 9px; padding: 6px 12px; font-size: 11px; font-weight: 600; cursor: pointer; }
.dk-btn:hover { background: var(--dk-hover); }
.dk-btn.primary { background: var(--dk-accent); border-color: var(--dk-accent); color: #fff; }
:root.dark .dk-root .dk-btn.primary { color: #04121f; }
.dk-btn.danger { color: var(--dk-red); border-color: var(--dk-red-border); }
.dk-btn.small { padding: 4px 9px; font-size: 10px; }
.dk-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.dk-input { padding: 7px 10px; border-radius: 9px; border: 1px solid var(--dk-border);
    background: var(--dk-input-bg); color: var(--dk-text); font-size: 12px; }
.dk-tag { display: inline-flex; align-items: center; padding: 3px 8px; border-radius: 999px;
    font-size: 10px; font-weight: 700; background: var(--dk-surface); border: 1px solid var(--dk-border); color: var(--dk-muted); }
.dk-tag.is-ok { background: var(--dk-green-soft); border-color: transparent; color: var(--dk-green); }
.dk-tag.is-bad { background: var(--dk-red-soft); border-color: transparent; color: var(--dk-red); }
.dk-tag.is-warn { background: var(--dk-amber-soft); border-color: transparent; color: var(--dk-amber); }
.dk-tag.is-info { background: var(--dk-accent-soft); border-color: transparent; color: var(--dk-accent); }
.dk-empty { padding: 26px 18px; border: 1px dashed var(--dk-border); border-radius: 12px;
    text-align: center; color: var(--dk-muted); font-size: 11px; line-height: 1.6; }
.dk-empty strong { display: block; margin-bottom: 4px; font-size: 13px; color: var(--dk-text); }
.dk-callout { padding: 10px 12px; margin-bottom: 12px; border-radius: 9px; font-size: 11px; line-height: 1.55;
    background: var(--dk-amber-soft); border: 1px solid var(--dk-amber-border); color: var(--dk-amber); }
.dk-callout.error { background: var(--dk-red-soft); border-color: var(--dk-red-border); color: var(--dk-red); }
.dk-callout.info { background: var(--dk-accent-soft); border-color: var(--dk-accent-border); color: var(--dk-accent); }
.dk-callout strong { display: block; margin-bottom: 3px; font-size: 12px; }
.dk-section { padding: 14px 2px 6px; font-size: 9px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.08em; color: var(--dk-muted); }
.dk-warn { display: block; margin-top: 2px; font-size: 10.5px; }
.dk-warn.error { color: var(--dk-red); }
.dk-warn.warn { color: var(--dk-amber); }
@media (max-width: 780px) {
    .dk-root { flex-direction: column; }
    .dk-side { width: auto; flex: none; flex-direction: row; align-items: center; gap: 10px;
        padding: 10px 12px; overflow-x: auto; border-right: 0; border-bottom: 1px solid var(--dk-border); }
    .dk-nav { flex-direction: row; }
    .dk-side-note { display: none; }
    .dk-side-foot { margin-top: 0; flex-direction: row; align-items: center; }
    .dk-main { padding: 16px; }
    .dk-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
`;

function _ensureStyles() {
    if (document.getElementById('dk-docker-styles')) return;
    const style = document.createElement('style');
    style.id = 'dk-docker-styles';
    style.textContent = STYLE;
    document.head.appendChild(style);
}

/** Update the shared header + panel chrome for the active section. */
function _setChrome(body, { title, sub, panelTitle, panelSub, actions }) {
    if (!body) return;
    const set = (selector, html) => {
        const el = body.querySelector(selector);
        if (el && html != null) el.innerHTML = html;
    };
    const text = (selector, value) => {
        const el = body.querySelector(selector);
        if (el && value != null) el.textContent = value;
    };
    text('[data-page-title]', title);
    text('[data-page-sub]', sub);
    text('[data-panel-title]', panelTitle);
    text('[data-panel-sub]', panelSub);
    set('[data-panel-actions]', actions || '');
}

function _setStatus(body, text, tone = '') {
    const el = body ? body.querySelector('[data-status]') : null;
    if (!el) return;
    el.textContent = text;
    el.className = `dk-status${tone ? ` ${tone}` : ''}`;
}

function _setEnginePill(body, label, tone) {
    const el = body ? body.querySelector('[data-health]') : null;
    if (!el) return;
    el.textContent = label;
    el.className = `dk-pill${tone ? ` ${tone}` : ''}`;
}


let _activeTab = 'containers';
let _pullVisible = false;
let _isAdmin = null;
let _engineJobTimer = null;
let _engineTask = null;   // shared progress row (core/progress.js)
// Every tab load takes a token. A slower request that finishes after a newer
// one (e.g. two actions in a row) must not overwrite the newer view.
let _loadToken = 0;

const ENGINE_STEP_LABELS = {
    queued: 'Queued',
    check: 'Checking the host',
    install: 'Installing Docker Engine',
    verify: 'Verifying the daemon',
    done: 'Complete',
};

const ADMIN_REQUIRED_ACTIONS = new Set([
    'engine-install', 'engine-restart', 'container-action', 'container-remove',
    'compose-action', 'execute-pull', 'delete-image', 'prune-images',
    'delete-volume', 'prune-volumes',
]);

// ── Small helpers ────────────────────────────────────────────────

const STATUS_META = {
    running:    { dot: '#22c55e', badge: 'badge-green',  label: 'Running' },
    exited:     { dot: '#ef4444', badge: 'badge-red',    label: 'Exited' },
    paused:     { dot: '#eab308', badge: 'badge-yellow', label: 'Paused' },
    restarting: { dot: '#eab308', badge: 'badge-yellow', label: 'Restarting' },
    created:    { dot: '#94a3b8', badge: 'badge-blue',   label: 'Created' },
};

function _statusMeta(status) {
    return STATUS_META[status] || { dot: '#94a3b8', badge: 'badge-blue', label: String(status || '?').charAt(0).toUpperCase() + String(status || '').slice(1) };
}

function _cap(s) { return String(s || '?').charAt(0).toUpperCase() + String(s || '').slice(1); }

function _errorCard(e) {
    const msg = String(e.message || '').includes('503')
        ? 'Docker daemon is not running or not accessible.'
        : (e.message || 'Unknown error');
    return `<div class="dk-empty" data-testid="docker-error">
        <strong>Could not load this view</strong>
        <span style="color:var(--dk-red);">${escapeHtml(msg)}</span>
        <div class="dk-row" style="justify-content:center;margin-top:12px;"><button class="dk-btn" data-action="refresh">Try again</button></div>
    </div>`;
}

function _emptyCard(title, hint) {
    return `<div class="dk-empty">
        <strong>${escapeHtml(title)}</strong>
        <span>${hint || ''}</span>
    </div>`;
}

// ════════════════════════════════════════════
// ENGINE STATUS / PROVISIONING
// ════════════════════════════════════════════

async function _adminCheck() {
    if (_isAdmin !== null) return _isAdmin;
    try {
        const me = await apiJsonFetch('/api/auth/me');
        _isAdmin = me?.role === 'admin';
    } catch (_) {
        _isAdmin = false;  // unknown role never unlocks admin-only buttons
    }
    return _isAdmin;
}

async function _engineStatus() {
    try {
        return await apiJsonFetch('/api/docker/engine');
    } catch (_) {
        return null;  // fall back to the normal tabs; they show their own error card
    }
}

function _stopEnginePolling() {
    if (_engineJobTimer) {
        clearTimeout(_engineJobTimer);
        _engineJobTimer = null;
    }
}

function _renderEngineJob(box, job) {
    if (!box) return;
    const status = job.status || 'running';
    const running = status === 'queued' || status === 'running';
    const pct = typeof job.progress === 'number' && Number.isFinite(job.progress)
        ? Math.max(0, Math.min(100, Math.round(job.progress))) : null;
    const step = ENGINE_STEP_LABELS[job.step] || job.step || 'Working';
    const lastLog = Array.isArray(job.log) && job.log.length ? String(job.log[job.log.length - 1]) : '';

    // Shared task row (inline host) — same markup/CSS as uploads and file ops.
    if (!_engineTask) {
        _engineTask = startTask({
            appId: 'docker',
            title: step,
            detail: 'Docker Engine installation',
            log: lastLog,
            host: box,
            testIdPrefix: 'docker-engine',
        });
    }
    if (running) {
        _engineTask.update({ title: step, detail: 'Docker Engine installation', log: lastLog, percent: pct });
    } else {
        _engineTask.finish(status === 'success' ? 'done' : status === 'cancelled' ? 'cancelled' : 'failed', {
            percent: pct == null ? 100 : pct,
            log: lastLog,
            detail: job.error || (status === 'success' ? ENGINE_STEP_LABELS.done : step),
        });
    }
}

function _watchEngineJob(body, jobId) {
    _stopEnginePolling();
    const box = body ? body.querySelector('#engineJobBox') : null;
    if (_engineTask) { _engineTask.dismiss(); _engineTask = null; }
    _renderEngineJob(box, { status: 'queued', step: 'check', progress: 0, log: [] });

    const tick = async () => {
        try {
            const job = await apiJsonFetch(`/api/docker/engine/jobs/${encodeURIComponent(jobId)}`);
            _renderEngineJob(box, job);
            if (['success', 'failed', 'cancelled'].includes(job.status)) {
                if (job.status === 'success') addNotification('success', 'Docker Engine installed');
                else addNotification(`Docker installation failed: ${job.error || job.status}`, 'error');
                setTimeout(() => { if (body && body.isConnected) renderDockerApp(body); }, 1500);
                return;
            }
        } catch (e) {
            if (box) box.innerHTML = `<div style="font-size:12px;color:#ef4444;">${escapeHtml(e.message || 'Lost track of the installation job')}</div>`;
            return;
        }
        _engineJobTimer = setTimeout(tick, 900);
    };
    tick();
}

async function _renderEnginePanel(body, engine) {
    const content = body ? body.querySelector('#dockerContent') : null;
    if (!content) return;

    const isAdmin = await _adminCheck();
    const conflict = engine.conflict || '';
    const restartNeeded = !!engine.restart_required;
    let title;
    let detail;
    let tone = 'info';
    let action = '';

    if (restartNeeded) {
        title = 'Installed — restart EthOS to activate Docker';
        detail = 'EthOS was added to the docker group after it started, so this process cannot open the Docker socket yet. A restart finishes the setup.';
        if (isAdmin) {
            action = `<button class="dk-btn primary" data-testid="docker-engine-restart" data-action="engine-restart">Restart EthOS</button>`;
        }
    } else if (conflict) {
        title = 'Another container engine is installed';
        detail = conflict;
        tone = 'error';
    } else if (!engine.helper) {
        title = 'Docker Engine is not installed';
        detail = 'EthOS needs its privileged installer helper before it can provision Docker. Re-run the service setup on the NAS (as root):';
        tone = 'error';
        action = `<code class="dk-mono" style="background:var(--dk-surface);padding:6px 10px;border-radius:6px;">sudo bash setup_scripts/setup_service.sh</code>`;
    } else if (!engine.install_supported) {
        title = 'Docker Engine cannot be installed automatically';
        detail = `Automatic installation is supported on Ubuntu and Debian. This system reports ${engine.os && engine.os.id ? engine.os.id : 'an unknown distribution'} ${engine.os && engine.os.version ? engine.os.version : ''}.`;
        tone = 'error';
    } else {
        title = 'Docker Engine is not installed';
        detail = 'Install Docker Engine and Compose v2 from Docker’s official apt repository. This needs internet access and takes a few minutes.';
        if (isAdmin) {
            action = `<button class="dk-btn primary" data-testid="docker-engine-install" data-action="engine-install">Install Docker Engine</button>`;
        } else {
            action = `<span class="dk-sub">An administrator can install it from this screen.</span>`;
        }
    }

    _setChrome(body, {
        title: 'Docker Engine',
        sub: 'The host service every container needs.',
        panelTitle: 'Engine status',
        panelSub: 'Host software, not part of this package.',
        actions: '',
    });
    _setStatus(body, restartNeeded ? 'Engine installed — restart required.' : 'Engine unavailable.',
        restartNeeded ? 'warn' : 'error');
    _setEnginePill(body, 'offline', 'offline');
    const note = body.querySelector('[data-engine-note]');
    if (note) note.textContent = 'Docker Engine not available.';
    body.querySelectorAll('.dk-nav-item').forEach((item) => { item.disabled = true; });

    content.innerHTML = `
        <div class="dk-callout ${tone}" data-testid="docker-engine-panel">
            <strong>${escapeHtml(title)}</strong>
            ${escapeHtml(detail)}
            <ul style="margin:10px 0 0;padding-left:16px;line-height:1.7;" data-testid="docker-engine-diagnostics">
                ${[
                    ['Docker CLI', engine.cli ? 'found' : 'not found'],
                    ['Daemon socket', engine.socket && engine.socket.exists ? engine.socket.path : 'missing'],
                    ['Compose plugin', engine.compose || 'not available'],
                    ['docker group', engine.group_member ? 'active'
                        : (engine.group_granted ? 'granted — restart required' : 'not granted')],
                ].map(([key, value]) => `<li>${escapeHtml(key)}: <b>${escapeHtml(value)}</b></li>`).join('')}
            </ul>
            ${action ? `<div class="dk-row" style="margin-top:12px;">${action}</div>` : ''}
            <div id="engineJobBox" data-testid="docker-engine-job" style="margin-top:12px;"></div>
        </div>`;
}

// ════════════════════════════════════════════
// MAIN RENDERER
// ════════════════════════════════════════════

export async function renderDockerApp(body) {
    _stopEnginePolling();
    _loadToken += 1;   // cancel any in-flight tab load from the previous render
    _windowBody = body;
    _ensureStyles();
    body.innerHTML = `
        <div class="dk-root" data-testid="docker-root">
            <aside class="dk-side">
                <div class="dk-brand">
                    <span class="dk-brand-icon" aria-hidden="true">🐳</span>
                    <div><strong>Docker Manager</strong><small>EthOS package</small></div>
                </div>
                <nav class="dk-nav" id="dockerTabs" data-testid="docker-tabs" aria-label="Docker Manager sections">
                    <button class="dk-nav-item${_activeTab === 'containers' ? ' is-active' : ''}" type="button" data-tab="containers" data-testid="docker-tab-containers">Containers</button>
                    <button class="dk-nav-item${_activeTab === 'images' ? ' is-active' : ''}" type="button" data-tab="images" data-testid="docker-tab-images">Images</button>
                    <button class="dk-nav-item${_activeTab === 'volumes' ? ' is-active' : ''}" type="button" data-tab="volumes" data-testid="docker-tab-volumes">Volumes</button>
                </nav>
                <div class="dk-side-foot">
                    <span class="dk-pill starting" data-health role="status" aria-live="polite">Checking engine…</span>
                    <span class="dk-side-note" data-engine-note>Docker Engine and Compose v2.</span>
                </div>
            </aside>
            <main class="dk-main">
                <header>
                    <h1 data-page-title>Containers</h1>
                    <p class="dk-page-sub" data-page-sub>Everything running on this NAS.</p>
                    <p class="dk-status" data-status role="status" aria-live="polite">Reading the Docker engine…</p>
                </header>
                <div class="dk-view">
                    <section class="dk-panel">
                        <div class="dk-toolbar">
                            <div>
                                <h2 data-panel-title>Containers</h2>
                                <p class="dk-sub" data-panel-sub></p>
                            </div>
                            <div class="dk-row" data-panel-actions></div>
                        </div>
                        <div id="dockerContent" data-testid="docker-content">
                            ${skeletonRows(5)}
                        </div>
                    </section>
                </div>
            </main>
        </div>`;

    body.querySelector('.dk-root').addEventListener('click', _handleRootClick);

    // The daemon has to answer before any section makes sense. When it does not,
    // the screen explains why and offers the one-command install instead of tabs
    // that can only fail with "Docker daemon is not running".
    const engine = await _engineStatus();
    if (engine && !engine.daemon) {
        await _renderEnginePanel(body, engine);
        return;
    }

    if (engine && engine.version) {
        _setEnginePill(body, 'ready', 'ready');
        const compose = engine.compose ? ` · Compose ${engine.compose}` : '';
        _setStatus(body, `Docker ${engine.version}${compose} is running.`);
        const note = body.querySelector('[data-engine-note]');
        if (note) note.textContent = `Docker ${engine.version}${compose}`;
    } else {
        _setEnginePill(body, 'unknown', 'starting');
        _setStatus(body, 'Engine status unavailable.', 'warn');
    }

    if (_activeTab === 'containers') await _loadContainersTab();
    else if (_activeTab === 'images') await _loadImagesTab();
    else await _loadVolumesTab();
}

// ════════════════════════════════════════════
// CONTAINERS TAB
// ════════════════════════════════════════════

// Compose projects the user has expanded. Groups start collapsed so a NAS with
// many stacks opens as a scannable list of projects instead of hundreds of
// container rows. Expansion is kept in module scope so it survives refreshes
// (e.g. after an action re-renders the tab) but resets when the window reopens.
const _expandedProjects = new Set();

// Package Center stacks are shown as system apps with the `ethos-` prefix. The
// real compose project name never changes — actions are sent with it.
function _projectLabel(name, info) {
    const managed = !!(info && info.managed);
    return managed && !/^ethos[-_]/i.test(name) ? `ethos-${name}` : name;
}

/** Section divider inside the containers table (System vs user projects). */
function _sectionRow(label, colspan = 5) {
    return `<tr><td colspan="${colspan}" class="dk-section">${escapeHtml(label)}</td></tr>`;
}

function _statusTone(status) {
    if (status === 'running') return 'is-ok';
    if (status === 'exited') return 'is-bad';
    if (status === 'paused' || status === 'restarting') return 'is-warn';
    return 'is-info';
}

function _containerRow(c, project, hidden) {
    const safeName = escapeAttr(c.name || '?');
    const meta = _statusMeta(c.status);
    const isRunning = c.status === 'running';
    // The API refuses to remove a running container (409). Explain that before
    // the click instead of surfacing "is running — stop it first" as an error.
    const removeBtn = isRunning
        ? `<button class="dk-btn small danger" disabled data-testid="container-action-${safeName}-remove" title="Stop the container first">Remove</button>`
        : `<button class="dk-btn small danger" data-testid="container-action-${safeName}-remove" data-action="container-remove" data-name="${safeName}" title="Remove container">Remove</button>`;
    const serviceTag = (project && c.compose_service)
        ? `<span class="dk-meta-line" style="display:inline;margin-left:6px;">· ${escapeHtml(c.compose_service)}</span>`
        : '';
    // Diagnostics: a running container with no network endpoint cannot resolve
    // its peers (EAI_AGAIN), and `restart: no` means a stopped container never
    // comes back on its own — both make a stack look silently half up.
    let warn = '';
    const restarts = Number(c.restart_count || 0);
    if (c.status === 'restarting') {
        warn = `<span class="dk-warn error" data-testid="container-warn-crashloop-${safeName}" title="Docker keeps restarting this container — open the logs to see why">restart loop${restarts ? ` · ${restarts}×` : ''}</span>`;
    } else if (c.network_detached) {
        warn = `<span class="dk-warn error" data-testid="container-warn-network-${safeName}" title="Attached to no Docker network — DNS lookups fail">no network attached</span>`;
    } else if (!isRunning && (c.restart_policy || 'no') === 'no') {
        warn = `<span class="dk-warn warn" data-testid="container-warn-restart-${safeName}" title="Restart policy is 'no' — stays down until started manually">won't auto-restart</span>`;
    } else if (c.health === 'unhealthy') {
        warn = `<span class="dk-warn error" data-testid="container-warn-health-${safeName}">unhealthy</span>`;
    }

    return `<tr${project ? ` data-compose-child="${escapeAttr(project)}"` : ''}${hidden ? ' style="display:none;"' : ''}>
        <td><span class="dk-tag ${_statusTone(c.status)}" data-testid="container-status-${safeName}">${escapeHtml(meta.label)}</span></td>
        <td>
            <span class="dk-name">${escapeHtml(c.name || '?')}</span>${serviceTag}
            <span class="dk-meta-line">${escapeHtml(c.state || c.status || '—')}${warn}</span>
        </td>
        <td class="dk-mono" style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeAttr(c.image || '')}">${escapeHtml(c.image || '—')}</td>
        <td class="dk-mono" style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeAttr(c.ports || '')}">${formatPorts(c.ports)}</td>
        <td>
            <div class="dk-actions">
                ${isRunning
                          ? `<button class="dk-btn small danger" data-testid="container-action-${safeName}-stop" data-action="container-action" data-name="${safeName}" data-verb="stop" title="Stop container">Stop</button>
                              <button class="dk-btn small" data-testid="container-action-${safeName}-restart" data-action="container-action" data-name="${safeName}" data-verb="restart" title="Restart container">Restart</button>`
                          : `<button class="dk-btn small" data-testid="container-action-${safeName}-start" data-action="container-action" data-name="${safeName}" data-verb="start" title="Start container">Start</button>`
                }
                     <button class="dk-btn small" data-testid="container-action-${safeName}-logs" data-action="container-logs" data-name="${safeName}" title="Open the unified log viewer">Logs</button>
                ${removeBtn}
            </div>
        </td>
    </tr>`;
}

function _composeGroupRow(project, members, info) {
    const safe = escapeAttr(project);
    const label = _projectLabel(project, info);
    const running = members.filter(m => m.status === 'running').length;
    const restarting = members.filter(m => m.status === 'restarting').length;
    const expanded = _expandedProjects.has(project);
    const tone = running === members.length ? 'is-ok' : (running > 0 ? 'is-warn' : 'is-bad');
    // A project's compose file can outlive its directory — say so instead of
    // showing buttons that silently fail (that was the "why can't I destroy" case).
    const known = !!info.known_location;
    const problem = info.location_problem || '';
    const upBtn = known
        ? `<button class="dk-btn small" data-testid="compose-action-${safe}-up" data-action="compose-action" data-project="${safe}" data-verb="up" title="docker compose up -d">Up</button>`
        : `<button class="dk-btn small" disabled data-testid="compose-action-${safe}-up" title="${escapeAttr(problem || 'compose file not found')}">Up</button>`;
    // Project-level compose actions. Down/Destroy stay enabled even without a
    // compose file: the backend removes the stack by its Docker labels.
    const actions = `
                <span class="dk-actions" style="margin-left:auto;">
                    ${upBtn}
                    <button class="dk-btn small" data-testid="compose-action-${safe}-down" data-action="compose-action" data-project="${safe}" data-verb="down" title="${known ? 'docker compose down' : 'Compose file unavailable — stops and removes the project by label'}">Down</button>
                    <button class="dk-btn small danger" data-testid="compose-action-${safe}-destroy" data-action="compose-action" data-project="${safe}" data-verb="destroy" title="${known ? 'docker compose down --volumes' : 'Compose file unavailable — removes containers, network and volumes by label'}">Destroy</button>
                </span>`;
    return `<tr class="compose-group-header" data-compose-group="${safe}" style="cursor:pointer;user-select:none;">
        <td colspan="5" style="background:var(--dk-surface);">
            <div class="dk-row" style="gap:8px;padding:2px 0;">
                <span data-chevron style="font-size:9px;color:var(--dk-muted);display:inline-block;transition:transform .15s;${expanded ? 'transform:rotate(90deg);' : ''}">▶</span>
                <span class="dk-name"${label !== project ? ` title="compose project: ${escapeAttr(project)}"` : ''}>${escapeHtml(label)}</span>
                <span class="dk-tag is-info" data-testid="compose-group-count-${safe}">${members.length} service${members.length !== 1 ? 's' : ''}</span>
                <span class="dk-tag ${tone}" data-compose-running>${running}/${members.length} running</span>
                ${restarting ? `<span class="dk-tag is-bad" data-testid="compose-group-restarting-${safe}">${restarting} restarting</span>` : ''}
                ${problem ? `<span class="dk-tag is-warn" data-testid="compose-group-problem-${safe}" title="${escapeAttr(problem)}">compose file unavailable</span>` : ''}
                ${actions}
            </div>
        </td>
    </tr>`;
}

async function _loadContainersTab() {
    const content = _windowBody && _windowBody.querySelector('#dockerContent');
    if (!content) return;
    const token = ++_loadToken;
    content.innerHTML = skeletonRows(6);
    const body = content.closest('.dk-root');
    // Chrome first: the tab must keep its Refresh button even when the API fails.
    _setChrome(body, {
        title: 'Containers',
        sub: 'Containers, Compose stacks and their health.',
        panelTitle: 'All containers',
        panelSub: 'Reading containers…',
        actions: `<button class="dk-btn small" data-action="refresh" data-testid="containers-refresh-btn">Refresh</button>`,
    });

    try {
        // Fetch sequentially: the two endpoints read the daemon independently, so
        // parallel fetches can disagree right after a start/stop (containers gone
        // but compose still reporting the old count) and a project would vanish
        // from both the live and the stopped list. Reading compose second makes
        // its view at least as new as the container list.
        const r = await apiFetch('/api/containers');
        const cr = await apiFetch('/api/compose/projects');
        if (token !== _loadToken) return;   // a newer load owns the view
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = await r.json();
        const cs = d.containers || [];

        // Compose project metadata (working dir / known location) for the group action buttons.
        let composeProjects = [];
        if (cr.ok) {
            const cd = await cr.json().catch(() => ({}));
            composeProjects = cd.projects || [];
        }
        const projectInfo = new Map(composeProjects.map(p => [p.name, p]));

        // Group by docker-compose project; containers without a compose label are standalone.
        const groups = new Map();
        const standalone = [];
        for (const c of cs) {
            if (c.compose_project) {
                if (!groups.has(c.compose_project)) groups.set(c.compose_project, []);
                groups.get(c.compose_project).push(c);
            } else {
                standalone.push(c);
            }
        }

        // Projects remembered by the backend but currently down (no containers) — can be brought back up.
        const stoppedProjects = composeProjects.filter(p => p.container_count === 0 && p.known_location);

        const runningCount = Number(d.running_count || cs.filter(c => c.status === 'running').length);
        const attentionCount = cs.filter(c => c.status === 'restarting'
            || c.network_detached
            || (c.status === 'exited' && (c.restart_policy || 'no') === 'no')).length;
        _setChrome(body, {
            title: 'Containers',
            sub: 'Containers, Compose stacks and their health.',
            panelTitle: 'All containers',
            panelSub: `${cs.length} total · ${runningCount} running · ${groups.size} compose project${groups.size === 1 ? '' : 's'}`,
            actions: `<button class="dk-btn small" data-action="refresh" data-testid="containers-refresh-btn">Refresh</button>`,
        });

        if (cs.length === 0) {
            content.innerHTML = _emptyCard('No containers found', 'Start a container or install a package to see it here.');
            return;
        }

        let html = `<div class="dk-summary">
            <div><span>Containers</span><strong>${cs.length}</strong></div>
            <div><span>Running</span><strong>${runningCount}</strong></div>
            <div><span>Compose projects</span><strong>${groups.size}</strong></div>
            <div><span>Need attention</span><strong style="${attentionCount ? 'color:var(--dk-red);' : ''}">${attentionCount}</strong></div>
        </div>`;

        // Containers that will not recover on their own: crash-looping, stopped
        // with restart=no, or running without a network. Surfacing them is the
        // point of this screen — a "half up" stack should never look healthy.
        const attention = cs.filter(c => c.status === 'restarting'
            || c.network_detached
            || (c.status === 'exited' && (c.restart_policy || 'no') === 'no'));
        const crashLoops = attention.filter(c => c.status === 'restarting');
        if (attention.length) {
            const names = attention.slice(0, 4).map(c => c.name).join(', ');
            html += `<div class="dk-callout error" data-testid="containers-attention-banner">
                <strong>${attention.length} container${attention.length !== 1 ? 's' : ''} need${attention.length === 1 ? 's' : ''} attention${crashLoops.length ? ` — ${crashLoops.length} in a restart loop` : ''}</strong>
                ${escapeHtml(names)}${attention.length > 4 ? ` +${attention.length - 4} more` : ''}. Open Logs to see the reason.
            </div>`;
        }

        // Compose metadata drives the Up buttons and the stopped-project list. If
        // that call failed, say so instead of silently disabling project actions.
        if (!cr.ok) {
            html += `<div class="dk-callout" data-testid="containers-compose-error">
                <strong>Compose project details are unavailable</strong>
                The Docker daemon did not return project information (HTTP ${cr.status}). Project Up and the stopped-project list stay hidden until the next refresh.
            </div>`;
        }

        html += `<table class="dk-table" data-testid="containers-table"><thead><tr>
            <th>Status</th><th>Container</th><th>Image</th><th>Ports</th><th style="width:200px;"></th>
        </tr></thead><tbody>`;

        // Compose projects as collapsible groups (collapsed by default), then standalone containers.
        // Package Center stacks get their own System section, shown with the `ethos-` prefix.
        const projectGroups = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        const _isManaged = ([project]) => !!(projectInfo.get(project) || {}).managed;
        const systemGroups = projectGroups.filter(_isManaged);
        const userGroups = projectGroups.filter(g => !_isManaged(g));
        const _renderGroup = ([project, members]) => {
            const expanded = _expandedProjects.has(project);
            let out = _composeGroupRow(project, members, projectInfo.get(project) || {});
            for (const c of members) out += _containerRow(c, project, !expanded);
            return out;
        };
        if (systemGroups.length) {
            html += _sectionRow('System');
            for (const g of systemGroups) html += _renderGroup(g);
        }
        if (userGroups.length) {
            html += _sectionRow('Compose projects');
            for (const g of userGroups) html += _renderGroup(g);
        }
        if (standalone.length) {
            html += _sectionRow('Standalone containers');
            for (const c of standalone) html += _containerRow(c);
        }

        html += '</tbody></table>';

        // Stopped projects (no containers left) — kept reachable so they can be brought back up.
        if (stoppedProjects.length > 0) {
            html += `<div class="dk-section" style="padding-top:18px;">Stopped projects</div>
                <table class="dk-table" data-testid="stopped-projects-table"><thead><tr>
                    <th>Project</th><th>Location</th><th style="width:90px;"></th>
                </tr></thead><tbody>`;
            const stoppedSystem = stoppedProjects.filter(p => p.managed);
            const stoppedUser = stoppedProjects.filter(p => !p.managed);
            const _stoppedRows = (list) => list.map(p => {
                const safe = escapeAttr(p.name);
                const label = _projectLabel(p.name, p);
                return `<tr>
                    <td class="dk-name"${label !== p.name ? ` title="compose project: ${escapeAttr(p.name)}"` : ''}>${escapeHtml(label)}</td>
                    <td class="dk-mono" style="max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dk-muted);" title="${escapeAttr(p.working_dir || '')}">${escapeHtml(p.working_dir || '—')}</td>
                    <td><div class="dk-actions"><button class="dk-btn small" data-testid="compose-stopped-up-${safe}" data-action="compose-action" data-project="${safe}" data-verb="up" title="docker compose up -d">Up</button></div></td>
                </tr>`;
            }).join('');
            if (stoppedSystem.length) html += _sectionRow('System', 3) + _stoppedRows(stoppedSystem);
            if (stoppedUser.length) html += _sectionRow('Compose projects', 3) + _stoppedRows(stoppedUser);
            html += '</tbody></table>';
        }

        content.innerHTML = html;

    } catch (e) {
        if (token !== _loadToken) return;
        content.innerHTML = _errorCard(e);
    }
}

// ════════════════════════════════════════════
// IMAGES TAB
// ════════════════════════════════════════════

async function _loadImagesTab() {
    const content = _windowBody && _windowBody.querySelector('#dockerContent');
    if (!content) return;
    const token = ++_loadToken;
    content.innerHTML = skeletonRows(6);
    const body = content.closest('.dk-root');
    _setChrome(body, {
        title: 'Images',
        sub: 'Images stored on this NAS.',
        panelTitle: 'Local images',
        panelSub: 'Reading images…',
        actions: `
            <button class="dk-btn primary small" data-action="toggle-pull" data-testid="images-pull-btn">Pull image</button>
            <button class="dk-btn danger small" data-action="prune-images" data-testid="images-prune-btn" title="Remove all unused images">Prune</button>
            <button class="dk-btn small" data-action="refresh" data-testid="images-refresh-btn">Refresh</button>`,
    });

    try {
        const r = await apiFetch('/api/images');
        if (token !== _loadToken) return;
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = await r.json();
        const imgs = d.images || [];

        _setChrome(body, {
            title: 'Images',
            sub: 'Images stored on this NAS.',
            panelTitle: 'Local images',
            panelSub: `${imgs.length} image${imgs.length !== 1 ? 's' : ''}${d.total_size_bytes ? ` · ${formatBytes(d.total_size_bytes)}` : ''}`,
            actions: `
                <button class="dk-btn primary small" data-action="toggle-pull" data-testid="images-pull-btn">Pull image</button>
                <button class="dk-btn danger small" data-action="prune-images" data-testid="images-prune-btn" title="Remove all unused images">Prune</button>
                <button class="dk-btn small" data-action="refresh" data-testid="images-refresh-btn">Refresh</button>`,
        });

        let html = '';
        if (_pullVisible) {
            html += `<div class="dk-row" style="margin-bottom:12px;">
                <input id="imagesPullInput" data-testid="images-pull-input" class="dk-input" type="text"
                       placeholder="e.g. nginx:latest or bitnami/redis:7.2" style="flex:1;min-width:220px;" />
                <button class="dk-btn primary small" data-testid="images-pull-execute-btn" data-action="execute-pull">Pull</button>
                <button class="dk-btn small" data-testid="images-pull-cancel-btn" data-action="cancel-pull">Cancel</button>
            </div>`;
        }

        if (imgs.length === 0) {
            content.innerHTML = html + _emptyCard('No images yet', 'Pull an image from a registry to get started.');
            return;
        }

        html += `<table class="dk-table"><thead><tr>
            <th>Repository</th><th>Size</th><th>Created</th><th>Status</th><th style="width:50px;"></th>
        </tr></thead><tbody>`;

        for (const img of imgs) {
            const isDangling = img.is_dangling;
            const sizeStr = img.size?.raw ? formatBytes(img.size.raw) : '—';
            const createdDate = img.created_at ? new Date(img.created_at).toLocaleDateString() : '—';
            const statusTag = isDangling
                ? '<span class="dk-tag is-warn">Dangling</span>'
                : img.in_use
                    ? '<span class="dk-tag is-ok">In use</span>'
                    : '<span class="dk-tag is-info">Unused</span>';
            const repo = isDangling
                ? '<span class="dk-mono" style="color:var(--dk-muted);">&lt;none&gt;</span>'
                : escapeHtml(img.repository);

            html += `<tr>
                <td>
                    <span class="dk-name">${repo}</span>
                    <span class="dk-meta-line">${img.tag ? `<span class="dk-tag">${escapeHtml(img.tag)}</span>` : ''}
                        <span class="dk-mono" style="margin-left:4px;">${escapeHtml((img.id || '').replace('sha256:', '').slice(0, 12))}</span></span>
                </td>
                <td class="dk-mono">${sizeStr}</td>
                <td style="color:var(--dk-muted);white-space:nowrap;">${createdDate}</td>
                <td>${statusTag}</td>
                <td><div class="dk-actions"><button class="dk-btn small danger" data-testid="image-delete-${escapeAttr(img.id || img.repository)}" data-action="delete-image" data-image="${escapeAttr(img.id || img.repository)}" title="Delete image">Delete</button></div></td>
            </tr>`;
        }
        html += '</tbody></table>';
        content.innerHTML = html;
    } catch (e) {
        if (token !== _loadToken) return;
        content.innerHTML = _errorCard(e);
    }
}

// ════════════════════════════════════════════
// VOLUMES TAB
// ════════════════════════════════════════════

async function _loadVolumesTab() {
    const content = _windowBody && _windowBody.querySelector('#dockerContent');
    if (!content) return;
    const token = ++_loadToken;
    content.innerHTML = skeletonRows(5);
    const body = content.closest('.dk-root');
    _setChrome(body, {
        title: 'Volumes',
        sub: 'Named volumes that hold container data.',
        panelTitle: 'Volumes',
        panelSub: 'Reading volumes…',
        actions: `
            <button class="dk-btn danger small" data-action="prune-volumes" data-testid="volumes-prune-btn" title="Remove all unused volumes">Prune unused</button>
            <button class="dk-btn small" data-action="refresh" data-testid="volumes-refresh-btn">Refresh</button>`,
    });

    try {
        const r = await apiFetch('/api/volumes');
        if (token !== _loadToken) return;
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = await r.json();
        const vols = d.volumes || [];

        _setChrome(body, {
            title: 'Volumes',
            sub: 'Named volumes that hold container data.',
            panelTitle: 'Volumes',
            panelSub: `${vols.length} volume${vols.length !== 1 ? 's' : ''}${d.orphaned_count > 0 ? ` · ${d.orphaned_count} orphaned` : ''}`,
            actions: `
                <button class="dk-btn danger small" data-action="prune-volumes" data-testid="volumes-prune-btn" title="Remove all unused volumes">Prune unused${d.orphaned_count > 0 ? ` (${d.orphaned_count})` : ''}</button>
                <button class="dk-btn small" data-action="refresh" data-testid="volumes-refresh-btn">Refresh</button>`,
        });

        if (vols.length === 0) {
            content.innerHTML = _emptyCard('No volumes yet', 'Volumes appear when a container declares one.');
            return;
        }

        const anySize = vols.some(v => v.size != null);

        let html = `<table class="dk-table"><thead><tr>
            <th>Name</th>${anySize ? '<th>Size</th>' : ''}<th>Status</th><th style="width:50px;"></th>
        </tr></thead><tbody>`;

        for (const v of vols) {
            const isOrphan = v.is_orphaned;
            const heldByExited = (v.held_by_exited || []).length > 0;
            const statusTag = isOrphan
                ? '<span class="dk-tag is-warn">Orphaned</span>'
                : heldByExited
                    ? `<span class="dk-tag is-info" style="cursor:help;" title="Referenced by exited container(s): ${escapeAttr((v.held_by_exited || []).join(', '))}">Held (exited)</span>`
                    : '<span class="dk-tag is-ok">In use</span>';
            html += `<tr>
                <td>
                    <span class="dk-name dk-mono">${escapeHtml(v.name)}</span>
                    <span class="dk-meta-line">${escapeHtml(v.driver || 'local')}${v.mountpoint ? ` · ${escapeHtml(v.mountpoint)}` : ''}</span>
                </td>
                ${anySize ? `<td class="dk-mono">${v.size_human ? escapeHtml(v.size_human) : '—'}</td>` : ''}
                <td>${statusTag}</td>
                <td><div class="dk-actions"><button class="dk-btn small danger" data-testid="volume-delete-${escapeAttr(v.name)}" data-action="delete-volume" data-name="${escapeAttr(v.name)}" title="Delete volume">Delete</button></div></td>
            </tr>`;
        }
        html += '</tbody></table>';
        content.innerHTML = html;
    } catch (e) {
        if (token !== _loadToken) return;
        content.innerHTML = _errorCard(e);
    }
}

// ════════════════════════════════════════════
// WINDOW-SCOPED ACTIONS
// ════════════════════════════════════════════

function _reloadCurrentTab(bodyEl) {
    if (!bodyEl) return;
    renderDockerApp(bodyEl);
}

async function _handleRootClick(event) {
    const root = event.currentTarget;
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const tab = target.closest('[data-tab]');
    if (tab && root.contains(tab)) {
        if (tab.disabled) return;
        _activeTab = tab.dataset.tab;
        root.querySelectorAll('.dk-nav-item').forEach((item) => {
            item.classList.toggle('is-active', item === tab);
        });
        if (_activeTab === 'containers') _loadContainersTab();
        else if (_activeTab === 'images') _loadImagesTab();
        else _loadVolumesTab();
        return;
    }

    const actionElement = target.closest('[data-action]');
    if (actionElement && root.contains(actionElement)) {
        const { action, name, verb, project, image } = actionElement.dataset;
        if (ADMIN_REQUIRED_ACTIONS.has(action) && !await _adminCheck()) {
            const message = 'Administrator access is required for Docker actions.';
            addNotification(message, 'error');
            _setStatus(root, message, 'warn');
            return;
        }
        switch (action) {
            case 'refresh':
                renderDockerApp(_windowBody);
                break;
            case 'engine-install':
                dockerInstallEngine(actionElement);
                break;
            case 'engine-restart':
                dockerRestartEthos();
                break;
            case 'container-action':
                dockerAction(name, verb, actionElement);
                break;
            case 'container-remove':
                dockerRemove(name, actionElement);
                break;
            case 'container-logs':
                openContainerLogs(name);
                break;
            case 'compose-action':
                dockerComposeAction(project, verb, actionElement);
                break;
            case 'toggle-pull':
                _togglePull(_windowBody);
                break;
            case 'execute-pull':
                _executePull(actionElement);
                break;
            case 'cancel-pull':
                _cancelPullImage();
                break;
            case 'delete-image':
                _deleteImage(image);
                break;
            case 'prune-images':
                _pruneImages(actionElement);
                break;
            case 'delete-volume':
                _deleteVolume(name);
                break;
            case 'prune-volumes':
                _pruneVolumes(actionElement);
                break;
            default:
                return;
        }
        event.preventDefault();
        return;
    }

    const groupHeader = target.closest('.compose-group-header');
    if (!groupHeader || !root.contains(groupHeader)) return;
    const projectName = groupHeader.dataset.composeGroup;
    if (_expandedProjects.has(projectName)) _expandedProjects.delete(projectName);
    else _expandedProjects.add(projectName);
    const expanded = _expandedProjects.has(projectName);
    const content = root.querySelector('#dockerContent');
    content.querySelectorAll('tr[data-compose-child]').forEach((row) => {
        if (row.dataset.composeChild === projectName) row.style.display = expanded ? '' : 'none';
    });
    const chevron = groupHeader.querySelector('[data-chevron]');
    if (chevron) chevron.style.transform = expanded ? 'rotate(90deg)' : '';
}

async function dockerInstallEngine(btnEl) {
    const ok = await confirmAction(
        'Install Docker Engine',
        'Install Docker Engine and Compose v2 from Docker’s official apt repository?\n\n' +
        'This downloads packages and takes a few minutes. EthOS keeps running, but a restart is needed afterwards to activate Docker access.'
    );
    if (!ok) return;
    const body = _windowBody;
    if (btnEl) { btnEl.disabled = true; btnEl.style.opacity = '0.6'; }
    try {
        const res = await apiFetch('/api/docker/engine/install', { method: 'POST' });
        if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            throw new Error(d.detail || `HTTP ${res.status}`);
        }
        const data = await res.json();
        if (data.status === 'already_running') {
            renderDockerApp(body);
            return;
        }
        addNotification('Installing Docker Engine…', 'info');
        _watchEngineJob(body, data.job_id);
    } catch (e) {
        addNotification(e.message, 'error');
        if (btnEl) { btnEl.disabled = false; btnEl.style.opacity = '1'; }
    }
};

async function dockerRestartEthos() {
    const ok = await confirmAction(
        'Restart EthOS',
        'Restart EthOS NAS to activate Docker access?\n\nThe web server restarts and this page refreshes automatically.'
    );
    if (!ok) return;
    try {
        const res = await apiFetch('/api/system/restart', { method: 'POST' });
        if (res.ok) showRestartOverlay();
        else addNotification('Restart failed', 'error');
    } catch (_) {
        addNotification('Could not reach the server', 'error');
    }
};

function dockerAction(name, action, btnEl) {
    const verb = action === 'stop' ? 'Stop' : action === 'restart' ? 'Restart' : 'Start';
    confirmAction('Docker Action', `${verb} container "${name}"?`).then(ok => {
        if (!ok) return;

        if (btnEl) { btnEl.disabled = true; btnEl.style.opacity = '0.5'; }

        apiFetch(`/api/containers/${encodeURIComponent(name)}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action })
        })
        .then(async r => {
            if (!r.ok) {
                const d = await r.json().catch(() => ({}));
                throw new Error(d.detail || `HTTP ${r.status}`);
            }
            addNotification('success', `Container "${name}" ${action}ed`);
            _reloadCurrentTab(_windowBody);
        })
        .catch(e => {
            addNotification('error', `Action failed: ${e.message}`);
            if (btnEl) { btnEl.disabled = false; btnEl.style.opacity = '1'; }
        });
    });
};

function dockerComposeAction(project, action, btnEl) {
    const prompts = {
        up:      ['Compose Up', `Run "docker compose up -d" for project "${project}"? Starts stopped services and applies compose file changes (may pull images).`],
        down:    ['Compose Down', `Run "docker compose down" for project "${project}"? Containers and networks are removed. Volumes (data) are kept.`],
        destroy: ['Compose Destroy', `Run "docker compose down --volumes" for project "${project}"? ALL containers, networks AND named volumes are removed — data in those volumes is lost. Images are kept.`],
    };
    const [title, msg] = prompts[action];
    confirmAction(title, msg).then(ok => {
        if (!ok) return;

        if (btnEl) { btnEl.disabled = true; btnEl.style.opacity = '0.5'; }

        apiFetch(`/api/compose/projects/${encodeURIComponent(project)}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action })
        })
        .then(async r => {
            if (!r.ok) {
                const d = await r.json().catch(() => ({}));
                throw new Error((d.detail || `HTTP ${r.status}`).slice(0, 300));
            }
            const verb = action === 'up' ? 'started' : action === 'down' ? 'stopped' : 'destroyed';
            addNotification('success', `Project "${project}" ${verb}`);
            _reloadCurrentTab(_windowBody);
        })
        .catch(e => {
            addNotification('error', `Compose ${action} failed: ${e.message}`);
            if (btnEl) { btnEl.disabled = false; btnEl.style.opacity = '1'; }
        });
    });
};

function dockerRemove(name, btnEl) {
    confirmAction('Remove Container', `Permanently remove container "${name}"? Its data in named volumes is kept.`).then(ok => {
        if (!ok) return;

        apiFetch(`/api/containers/${encodeURIComponent(name)}`, { method: 'DELETE' })
            .then(async r => {
                if (r.status === 409) {
                    addNotification('error', `"${name}" is running — stop it first`);
                    return;
                }
                if (!r.ok) {
                    const d = await r.json().catch(() => ({}));
                    throw new Error(d.detail || `HTTP ${r.status}`);
                }
                addNotification('success', `Container "${name}" removed`);
                _reloadCurrentTab(_windowBody);
            })
            .catch(e => addNotification('error', `Remove failed: ${e.message}`));
    });
};

function openContainerLogs(name) {
    // One viewer for every source (docs/logs.md) — no handoff globals.
    openLogs({ container: name });
};

// Pull controls
function _togglePull(bodyEl) {
    _pullVisible = !_pullVisible;
    if (_activeTab === 'images') _loadImagesTab();
    else if (bodyEl) renderDockerApp(bodyEl);
};

async function _cancelPullImage() {
    _pullVisible = false;
    await _loadImagesTab();
}

async function _runTrackedAction(button, { title, detail, failurePrefix }, work, refresh) {
    const root = _windowBody && _windowBody.querySelector('.dk-root');
    const originalLabel = button ? button.textContent : '';
    if (button) {
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        button.textContent = `${title}…`;
    }
    if (root) _setStatus(root, `${title}…`, 'warn');

    const task = startTask({ appId: 'docker', title, detail, testIdPrefix: 'docker-action' });
    try {
        const message = await work();
        task.finish('done', { detail: message });
        addNotification(message, 'success');
        if (root) _setStatus(root, message);
        await refresh();
    } catch (error) {
        const detailMessage = error.message || 'Unknown error';
        task.finish('failed', { detail: detailMessage });
        const message = `${failurePrefix}: ${detailMessage}`;
        addNotification(message, 'error');
        if (root) _setStatus(root, message, 'error');
    } finally {
        if (button && button.isConnected) {
            button.disabled = false;
            button.removeAttribute('aria-busy');
            button.textContent = originalLabel;
        }
    }
}

async function _executePull(button) {
    const input = _windowBody && _windowBody.querySelector('#imagesPullInput');
    if (!input) return;
    const name = input.value.trim();
    if (!name) {
        const message = 'Please enter an image reference (e.g. nginx:latest)';
        addNotification(message, 'error');
        _setStatus(_windowBody.querySelector('.dk-root'), message, 'error');
        input.focus();
        return;
    }

    await _runTrackedAction(button, {
        title: 'Pulling image',
        detail: name,
        failurePrefix: 'Pull failed',
    }, async () => {
        const r = await apiFetch('/api/images/pull', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: name }),
        });
        if (!r.ok) {
            const d = await r.json().catch(() => ({}));
            throw new Error(d.detail || `HTTP ${r.status}`);
        }
        _pullVisible = false;
        return `Image "${name}" pulled successfully`;
    }, _loadImagesTab);
}

// Delete image
async function _deleteImage(idOrTag) {
    const displayName = idOrTag.split(':')[0] || idOrTag;
    if (!await confirmAction('Delete Image', `Delete Docker image "${displayName}"?`)) return;
    try {
        const r = await apiFetch(`/api/images/${encodeURIComponent(idOrTag)}`, { method: 'DELETE' });
        if (r.status === 409) {
            addNotification('error', `"${displayName}" is in use by a container — remove it first`);
            return;
        }
        if (!r.ok) {
            const d = await r.json().catch(() => ({}));
            throw new Error(d.detail || `HTTP ${r.status}`);
        }
        addNotification('success', `Image "${displayName}" deleted`);
        _loadImagesTab();
    } catch (e) {
        addNotification('error', `Delete failed: ${e.message}`);
    }
}

// Prune images
async function _pruneImages(button) {
    if (!await confirmAction('Prune Images', 'Remove ALL unused Docker images? This cannot be undone.')) return;
    await _runTrackedAction(button, {
        title: 'Pruning images',
        detail: 'Removing images not referenced by any container',
        failurePrefix: 'Image prune failed',
    }, async () => {
        const r = await apiFetch('/api/images/prune', { method: 'POST' });
        if (!r.ok) {
            const d = await r.json().catch(() => ({}));
            throw new Error(d.detail || `HTTP ${r.status}`);
        }
        const data = await r.json();
        return data.message || 'Unused images pruned successfully';
    }, _loadImagesTab);
}

// Delete volume
async function _deleteVolume(name) {
    if (!await confirmAction('Delete Volume', `Delete Docker volume "${name}"? All data in it will be lost.`)) return;
    try {
        const r = await apiFetch(`/api/volumes/${encodeURIComponent(name)}`, { method: 'DELETE' });
        if (r.status === 409) {
            addNotification('error', `"${name}" is in use by a container — remove it first`);
            return;
        }
        if (!r.ok) {
            const d = await r.json().catch(() => ({}));
            throw new Error(d.detail || `HTTP ${r.status}`);
        }
        addNotification('success', `Volume "${name}" deleted`);
        _loadVolumesTab();
    } catch (e) {
        addNotification('error', `Delete failed: ${e.message}`);
    }
}

// Prune volumes
async function _pruneVolumes(button) {
    if (!await confirmAction('Prune Volumes', 'Remove all unused Docker volumes (named + anonymous)? All data in them will be lost.\n\nVolumes still referenced by any container — including stopped ones — are kept.')) return;
    await _runTrackedAction(button, {
        title: 'Pruning volumes',
        detail: 'Removing volumes not referenced by any container',
        failurePrefix: 'Volume prune failed',
    }, async () => {
        const r = await apiFetch('/api/volumes/prune', { method: 'POST' });
        if (!r.ok) {
            const d = await r.json().catch(() => ({}));
            throw new Error(d.detail || `HTTP ${r.status}`);
        }
        const data = await r.json();
        return data.message || 'Unused volumes pruned successfully';
    }, _loadVolumesTab);
}

// ── Package entry point ──────────────────────────────────────────────────────
export async function render(container, ctx) {
    _ctx = ctx;
    ctx.log('info', 'Docker Manager opened');
    await renderDockerApp(container);
}
