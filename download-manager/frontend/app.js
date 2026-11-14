// EthOS native package UI — Download Manager
// Contract: export async function render(container, ctx).
//
// The engine is the Download Station backend in EthOS core; this module is a
// first-class window for it and calls /api/downloads/* through ctx.apiFetch.
// Visual contract: the shared package shell (218 px rail, tokens, panels,
// summary tiles, tables, tags, ctx.progress/ctx.modal/ctx.notifications).

const STYLE = `
.dm-root {
    color-scheme: light;
    --dm-bg: #eef2f7;
    --dm-side-bg: rgba(255, 255, 255, 0.88);
    --dm-panel: #ffffff;
    --dm-surface: #f4f5f7;
    --dm-input-bg: #ffffff;
    --dm-border: #e3e5e8;
    --dm-text: #1f2430;
    --dm-muted: #5b6472;
    --dm-accent: #2563eb;
    --dm-accent-soft: rgba(37, 99, 235, 0.10);
    --dm-accent-border: rgba(37, 99, 235, 0.45);
    --dm-green: #15803d;
    --dm-green-soft: rgba(21, 128, 61, 0.12);
    --dm-green-border: rgba(21, 128, 61, 0.35);
    --dm-red: #b91c1c;
    --dm-red-soft: rgba(185, 28, 28, 0.08);
    --dm-red-border: rgba(185, 28, 28, 0.32);
    --dm-amber: #b45309;
    --dm-amber-soft: rgba(180, 83, 9, 0.10);
    --dm-amber-border: rgba(180, 83, 9, 0.30);
    --dm-hover: rgba(15, 23, 42, 0.06);
    --dm-tag-bg: rgba(37, 99, 235, 0.08);
    --dm-tag-border: rgba(37, 99, 235, 0.28);
    --dm-tag-text: #1e40af;
    --dm-glow-1: rgba(37, 99, 235, 0.08);
    --dm-glow-2: rgba(21, 128, 61, 0.06);
    display: flex; height: 100%; overflow: hidden;
    background:
        radial-gradient(circle at 8% 4%, var(--dm-glow-1), transparent 40%),
        radial-gradient(circle at 92% 96%, var(--dm-glow-2), transparent 40%),
        var(--dm-bg);
    color: var(--dm-text);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
:root.dark .dm-root {
    color-scheme: dark;
    --dm-bg: #08111d;
    --dm-side-bg: rgba(2, 6, 23, 0.45);
    --dm-panel: rgba(148, 163, 184, 0.07);
    --dm-surface: rgba(15, 23, 42, 0.45);
    --dm-input-bg: rgba(2, 6, 23, 0.55);
    --dm-border: rgba(148, 163, 184, 0.22);
    --dm-text: #e2e8f0;
    --dm-muted: #94a3b8;
    --dm-accent: #38bdf8;
    --dm-accent-soft: rgba(56, 189, 248, 0.14);
    --dm-accent-border: rgba(56, 189, 248, 0.55);
    --dm-green: #4ade80;
    --dm-green-soft: rgba(74, 222, 128, 0.14);
    --dm-green-border: rgba(74, 222, 128, 0.45);
    --dm-red: #f87171;
    --dm-red-soft: rgba(248, 113, 113, 0.12);
    --dm-red-border: rgba(248, 113, 113, 0.45);
    --dm-amber: #fbbf24;
    --dm-amber-soft: rgba(251, 191, 36, 0.10);
    --dm-amber-border: rgba(251, 191, 36, 0.45);
    --dm-hover: rgba(148, 163, 184, 0.09);
    --dm-tag-bg: rgba(56, 189, 248, 0.10);
    --dm-tag-border: rgba(56, 189, 248, 0.25);
    --dm-tag-text: #bae6fd;
    --dm-glow-1: rgba(56, 189, 248, 0.16);
    --dm-glow-2: rgba(74, 222, 128, 0.10);
}
.dm-root, .dm-root * { box-sizing: border-box; }
.dm-root [hidden] { display: none !important; }
.dm-root button, .dm-root input, .dm-root select { font-family: inherit; }
.dm-side { flex: none; width: 218px; display: flex; flex-direction: column; gap: 16px; padding: 20px 14px; border-right: 1px solid var(--dm-border); background: var(--dm-side-bg); overflow-y: auto; }
.dm-brand { display: flex; align-items: center; gap: 10px; padding: 0 8px; }
.dm-brand-icon { font-size: 26px; line-height: 1; }
.dm-brand strong { display: block; font-size: 14px; letter-spacing: -0.01em; }
.dm-brand small { display: block; color: var(--dm-muted); font-size: 10px; }
.dm-nav { display: flex; flex-direction: column; gap: 2px; }
.dm-nav-item { display: block; width: 100%; padding: 9px 11px; border: 0; border-radius: 9px; background: transparent; color: var(--dm-muted); font-size: 12px; font-weight: 600; text-align: left; cursor: pointer; }
.dm-nav-item:hover { background: var(--dm-hover); color: var(--dm-text); }
.dm-nav-item.is-active { background: var(--dm-accent-soft); color: var(--dm-text); }
.dm-nav-item:focus-visible { outline: 2px solid var(--dm-accent); outline-offset: 1px; }
.dm-side-foot { margin-top: auto; display: flex; flex-direction: column; gap: 8px; padding: 0 8px; }
.dm-side-note { color: var(--dm-muted); font-size: 10px; line-height: 1.6; }
.dm-main { flex: 1; min-width: 0; overflow-y: auto; padding: 24px 28px 32px; }
.dm-main h1 { margin: 0; font-size: clamp(22px, 3.4vw, 30px); letter-spacing: -0.02em; }
.dm-page-sub { margin: 4px 0 0; color: var(--dm-muted); font-size: 12px; line-height: 1.5; }
.dm-status { min-height: 18px; margin: 12px 0 0; color: var(--dm-accent); font-size: 12px; font-weight: 600; }
.dm-status.error { color: var(--dm-red); }
.dm-status.warn { color: var(--dm-amber); }
.dm-pill { align-self: flex-start; padding: 5px 10px; border-radius: 999px; font-size: 10px; font-weight: 700; border: 1px solid var(--dm-border); white-space: nowrap; }
.dm-pill.ready { color: var(--dm-green); border-color: var(--dm-green-border); background: var(--dm-green-soft); }
.dm-pill.starting { color: var(--dm-amber); border-color: var(--dm-amber-border); background: var(--dm-amber-soft); }
.dm-pill.offline { color: var(--dm-red); border-color: var(--dm-red-border); background: var(--dm-red-soft); }
.dm-view { display: flex; flex-direction: column; gap: 14px; margin-top: 16px; }
.dm-panel { padding: 17px 18px; border: 1px solid var(--dm-border); border-radius: 15px; background: var(--dm-panel); }
.dm-panel h2 { margin: 0 0 3px; font-size: 13px; }
.dm-muted { margin: 0; color: var(--dm-muted); font-size: 11px; line-height: 1.55; }
.dm-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 9px; }
.dm-summary div { padding: 11px; border: 1px solid var(--dm-border); border-radius: 10px; background: var(--dm-surface); }
.dm-summary span { display: block; font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--dm-muted); margin-bottom: 4px; }
.dm-summary strong { font-size: 20px; font-variant-numeric: tabular-nums; }
.dm-toolbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.dm-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.dm-btn { padding: 8px 13px; border: 1px solid var(--dm-border); border-radius: 9px; background: var(--dm-surface); color: var(--dm-text); font-size: 11px; font-weight: 600; cursor: pointer; }
.dm-btn:hover:not(:disabled) { border-color: var(--dm-accent); }
.dm-btn:disabled { opacity: 0.5; cursor: wait; }
.dm-btn.primary { border-color: var(--dm-accent-border); background: var(--dm-accent-soft); }
.dm-btn.danger { border-color: var(--dm-red-border); color: var(--dm-red); }
.dm-btn.small { padding: 4px 9px; font-size: 10px; font-family: ui-monospace, monospace; }
.dm-btn:focus-visible, .dm-input:focus-visible, .dm-root select:focus-visible { outline: 2px solid var(--dm-accent); outline-offset: 2px; }
.dm-input { flex: 1; min-width: 0; padding: 9px 11px; border: 1px solid var(--dm-border); border-radius: 9px; background: var(--dm-input-bg); color: var(--dm-text); font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
.dm-root select { padding: 8px 10px; border: 1px solid var(--dm-border); border-radius: 9px; background: var(--dm-input-bg); color: var(--dm-text); font-size: 11px; }
.dm-tabs { display: flex; gap: 2px; flex-wrap: wrap; }
.dm-tab { padding: 6px 11px; border: 0; border-radius: 8px; background: transparent; color: var(--dm-muted); font-size: 11px; font-weight: 600; cursor: pointer; }
.dm-tab.is-active { background: var(--dm-accent-soft); color: var(--dm-text); }
.dm-table { width: 100%; border-collapse: collapse; font-size: 11px; }
.dm-table th, .dm-table td { text-align: left; padding: 8px 9px; border-bottom: 1px solid var(--dm-border); vertical-align: middle; }
.dm-table th { color: var(--dm-muted); font-size: 9px; letter-spacing: 0.08em; text-transform: uppercase; white-space: nowrap; }
.dm-table tbody tr:last-child td { border-bottom: 0; }
.dm-table tr.is-drag-source { opacity: 0.45; }
.dm-table tr.is-drop-target { box-shadow: inset 0 0 0 2px var(--dm-accent); }
.dm-table td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.dm-table td.actions { text-align: right; white-space: nowrap; }
.dm-handle { width: 22px; text-align: center; color: var(--dm-muted); cursor: grab; user-select: none; }
.dm-handle:active { cursor: grabbing; }
.dm-name { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-weight: 600; color: var(--dm-text); word-break: break-word; }
.dm-bar { height: 5px; margin-top: 6px; border-radius: 999px; background: var(--dm-hover); overflow: hidden; }
.dm-bar > i { display: block; height: 100%; border-radius: 999px; background: var(--dm-accent); transition: width 0.3s ease; }
.dm-bar.is-done > i { background: var(--dm-green); }
.dm-bar.is-error > i { background: var(--dm-red); }
.dm-meta { margin-top: 4px; color: var(--dm-muted); font-size: 10px; }
.dm-tag { display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px; border-radius: 999px; border: 1px solid var(--dm-tag-border); background: var(--dm-tag-bg); color: var(--dm-tag-text); font: 10px ui-monospace, monospace; white-space: nowrap; }
.dm-tag.is-ok { border-color: var(--dm-green-border); background: var(--dm-green-soft); color: var(--dm-green); }
.dm-tag.is-bad { border-color: var(--dm-red-border); background: var(--dm-red-soft); color: var(--dm-red); }
.dm-tag.is-warn { border-color: var(--dm-amber-border); background: var(--dm-amber-soft); color: var(--dm-amber); }
.dm-empty { margin-top: 12px; padding: 24px; text-align: center; color: var(--dm-muted); font-size: 11px; border: 1px dashed var(--dm-border); border-radius: 11px; }
.dm-empty strong { display: block; color: var(--dm-text); margin-bottom: 4px; }
.dm-field { display: flex; flex-direction: column; gap: 6px; margin-top: 14px; }
.dm-field:first-of-type { margin-top: 8px; }
.dm-field > label { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--dm-muted); }
.dm-field > label.dm-checkline { text-transform: none; letter-spacing: 0; color: var(--dm-text); font-size: 12px; font-weight: 400; display: flex; align-items: center; gap: 9px; }
.dm-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; }
.dm-fields .full { grid-column: 1 / -1; }
.dm-checkline input { accent-color: var(--dm-accent); }
.dm-form-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; padding-top: 13px; border-top: 1px solid var(--dm-border); flex-wrap: wrap; }
.dm-editor-row { display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; align-items: center; margin-top: 8px; }
.dm-editor-row.wide { grid-template-columns: auto 2fr 1fr 1fr 1fr 1fr 80px auto; }
.dm-hint { margin: 8px 0 0; color: var(--dm-muted); font-size: 10px; line-height: 1.5; }
.dm-root code { color: var(--dm-accent); font-family: ui-monospace, monospace; }
.dm-def-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 9px; margin-top: 12px; }
.dm-def-grid div { padding: 11px; border: 1px solid var(--dm-border); border-radius: 10px; background: var(--dm-surface); }
.dm-def-grid span { display: block; margin-bottom: 4px; font-size: 9px; letter-spacing: 0.09em; text-transform: uppercase; color: var(--dm-muted); }
.dm-def-grid strong { font-size: 12px; font-weight: 600; word-break: break-word; }
@media (max-width: 780px) {
    .dm-root { flex-direction: column; }
    .dm-side { width: auto; flex-direction: row; align-items: center; gap: 8px; padding: 10px 12px; border-right: 0; border-bottom: 1px solid var(--dm-border); overflow-x: auto; }
    .dm-brand { padding: 0; }
    .dm-brand small, .dm-side-foot { display: none; }
    .dm-nav { flex-direction: row; }
    .dm-nav-item { white-space: nowrap; }
    .dm-main { padding: 16px; }
    .dm-summary, .dm-fields { grid-template-columns: 1fr; }
    .dm-editor-row, .dm-editor-row.wide { grid-template-columns: 1fr; }
}
`;

const VIEWS = {
    overview: ['Overview', 'Live queue, speed and recent activity.'],
    downloads: ['Downloads', 'Order the queue, inspect progress and act on tasks.'],
    add: ['Add download', 'URL, magnet link or .torrent files.'],
    settings: ['Settings', 'Destination, schedule, debrid, categories and RSS.'],
};

const STATUS = {
    waiting: ['Waiting', ''], downloading: ['Downloading', 'is-ok'],
    debrid_downloading: ['Debrid', 'is-ok'], paused: ['Paused', 'is-warn'],
    completed: ['Completed', 'is-ok'], error: ['Error', 'is-bad'], canceled: ['Canceled', ''],
};
const ACTIVE = new Set(['waiting', 'downloading', 'debrid_downloading']);
const DEBRID_FIELD = { realdebrid: 'realdebrid_api_token', alldebrid: 'alldebrid_api_key', torbox: 'torbox_api_key' };

export async function render(container, ctx) {
    container.replaceChildren();
    const escHtml = ctx.escape?.html || ((v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
    const escAttr = ctx.escape?.attr || escHtml;
    const notify = (message, kind = 'info') => {
        if (ctx.notifications?.toast) ctx.notifications.toast(message, kind);
        else if (ctx.notify) ctx.notify(message, kind);
    };
    // ctx.modal.confirm is callback-based and returns the dialog element, so it must
    // be wrapped in a promise; ctx.modal.alert takes (title, message).
    const confirmDialog = (title, message, okText = 'Confirm') => {
        if (ctx.modal?.confirm) {
            return new Promise((resolve) => {
                ctx.modal.confirm({ title, message, okText,
                    onConfirm: () => resolve(true), onCancel: () => resolve(false) });
            });
        }
        return Promise.resolve(window.confirm(`${title}\n\n${message}`));
    };
    const $ = (selector) => root.querySelector(selector);

    const state = {
        view: 'overview', tasks: [], config: null, filter: 'all', search: '',
        sort: 'newest', dragId: '', timer: null, fatal: '', busy: false, loaded: false,
    };

    const style = document.createElement('style');
    style.textContent = STYLE;
    const root = document.createElement('div');
    root.className = 'dm-root';
    root.innerHTML = `
        <aside class="dm-side">
            <div class="dm-brand">
                <span class="dm-brand-icon" aria-hidden="true">⬇️</span>
                <div><strong>Download Manager</strong><small data-version>EthOS package</small></div>
            </div>
            <nav class="dm-nav" aria-label="Download sections">
                ${Object.entries(VIEWS).map(([id, v], i) => `<button class="dm-nav-item${i === 0 ? ' is-active' : ''}" type="button" data-view="${id}">${escHtml(v[0])}</button>`).join('')}
            </nav>
            <div class="dm-side-foot">
                <span class="dm-pill starting" id="dm-pill" role="status" aria-live="polite">Connecting…</span>
                <span class="dm-side-note">HTTP, magnet and debrid downloads with a priority queue.</span>
            </div>
        </aside>
        <main class="dm-main">
            <header>
                <h1 id="dm-title">Overview</h1>
                <p class="dm-page-sub" id="dm-sub"></p>
                <p class="dm-status" id="dm-status" role="status" aria-live="polite">Loading…</p>
            </header>
            <div class="dm-view" id="dm-view"></div>
        </main>`;
    container.append(style, root);
    const version = $('[data-version]');
    if (version) version.textContent = `v${ctx.pkg?.version || '1.0.0'}`;

    // ── API ────────────────────────────────────────────────────────────────
    async function api(path, options = {}) {
        const response = await ctx.apiFetch(`/api/downloads${path}`, options);
        let body = null;
        try { body = await response.json(); } catch { body = null; }
        if (!response.ok) {
            const detail = body?.detail || `HTTP ${response.status}`;
            const error = new Error(typeof detail === 'string' ? detail : 'Request failed');
            error.status = response.status;
            throw error;
        }
        return body;
    }
    const postJson = (path, body) => api(path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
    });

    // ── Formatting ─────────────────────────────────────────────────────────
    const fmtBytes = (v) => {
        const n = Number(v || 0);
        if (!n) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let i = 0; let s = n;
        while (s >= 1024 && i < units.length - 1) { s /= 1024; i++; }
        return `${parseFloat(s.toFixed(1))} ${units[i]}`;
    };
    const fmtSpeed = (v) => (Number(v || 0) > 0 ? `${fmtBytes(v)}/s` : '—');
    const fmtTime = (ts) => {
        if (!ts) return '—';
        try { return new Date(ts * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
        catch { return '—'; }
    };
    const fmtEta = (seconds) => {
        if (!Number.isFinite(seconds) || seconds <= 0) return '—';
        if (seconds < 60) return `${Math.round(seconds)}s`;
        const m = Math.floor(seconds / 60);
        if (m < 60) return `${m}m`;
        return `${Math.floor(m / 60)}h ${m % 60}m`;
    };
    const pct = (task) => Math.round(Number(task.progress || 0) * 100);
    const groupOf = (task) => {
        if (ACTIVE.has(task.status)) return 'active';
        if (task.status === 'completed') return 'completed';
        if (task.status === 'paused') return 'paused';
        if (task.status === 'error') return 'errors';
        return 'all';
    };
    const queueOrder = () => state.tasks
        .filter((t) => t.status === 'waiting')
        .sort((a, b) => (b.priority || 0) - (a.priority || 0) || a.created_at - b.created_at);
    const visibleTasks = () => {
        let tasks = state.tasks.slice();
        if (state.filter !== 'all') tasks = tasks.filter((t) => groupOf(t) === state.filter);
        const needle = state.search.trim().toLowerCase();
        if (needle) {
            tasks = tasks.filter((t) => [t.name, t.url, t.category].some((v) => String(v || '').toLowerCase().includes(needle)));
        }
        const rank = { downloading: 0, debrid_downloading: 0, waiting: 1, paused: 2, error: 3, completed: 4, canceled: 5 };
        const cmp = {
            newest: (a, b) => b.created_at - a.created_at,
            oldest: (a, b) => a.created_at - b.created_at,
            name: (a, b) => String(a.name).localeCompare(String(b.name)),
            size: (a, b) => (b.size || 0) - (a.size || 0),
            progress: (a, b) => (b.progress || 0) - (a.progress || 0),
            status: (a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9),
        };
        return tasks.sort(cmp[state.sort] || cmp.newest);
    };

    // ── Data ───────────────────────────────────────────────────────────────
    async function loadConfig() {
        state.config = await api('/config');
    }
    async function loadTasks() {
        const data = await api('/tasks');
        state.tasks = Array.isArray(data?.tasks) ? data.tasks : [];
    }
    async function refresh(quiet = false) {
        try {
            await loadTasks();
            if (!state.config) await loadConfig();
            state.fatal = '';
            setPill('ready', 'Ready');
            // Do not rebuild the list while the user is typing in the search box.
            const searching = document.activeElement?.dataset?.role === 'search';
            if (!searching && (state.view === 'overview' || state.view === 'downloads')) renderView();
            if (!quiet) await loadConfig();
        } catch (error) {
            state.fatal = error.message || 'Download engine unavailable';
            setPill('offline', 'Offline');
            if (!quiet) renderView();
        }
    }
    function setPill(kind, label) {
        const pill = $('#dm-pill');
        if (!pill) return;
        pill.className = `dm-pill ${kind}`;
        pill.textContent = label;
    }
    function statusLine(text, tone = '') {
        const el = $('#dm-status');
        if (!el) return;
        el.className = `dm-status ${tone}`;
        el.textContent = text || '';
    }

    // ── Views ──────────────────────────────────────────────────────────────
    const summary = () => {
        const active = state.tasks.filter((t) => ACTIVE.has(t.status) && t.status !== 'waiting');
        const speed = state.tasks.reduce((sum, t) => sum + (ACTIVE.has(t.status) ? Number(t.speed || 0) : 0), 0);
        const queued = queueOrder().length;
        const completed = state.tasks.filter((t) => t.status === 'completed').length;
        return `<div class="dm-summary">
            <div><span>Active</span><strong>${active.length}</strong></div>
            <div><span>Speed</span><strong>${fmtSpeed(speed)}</strong></div>
            <div><span>Queued</span><strong>${queued}</strong></div>
            <div><span>Completed</span><strong>${completed}</strong></div>
        </div>`;
    };

    const taskRow = (task) => {
        const [label, tone] = STATUS[task.status] || [task.status, ''];
        const percent = pct(task);
        const waiting = task.status === 'waiting';
        const eta = task.speed > 0 && task.size > task.downloaded
            ? fmtEta((task.size - task.downloaded) / task.speed) : '—';
        const canPause = ACTIVE.has(task.status);
        const canResume = task.status === 'paused' || task.status === 'error';
        return `<tr data-task-id="${escAttr(task.id)}" data-status="${escAttr(task.status)}">
            <td class="dm-handle">${waiting ? '<span draggable="true" data-drag-handle title="Drag to reorder">⣿</span>' : ''}</td>
            <td>
                <div class="dm-name">${escHtml(task.name)}
                    <span class="dm-tag ${tone}">${escHtml(label)}</span>
                    ${waiting && task.queue_position ? `<span class="dm-tag">#${task.queue_position}</span>` : ''}
                    ${task.category ? `<span class="dm-tag">${escHtml(task.category)}</span>` : ''}
                </div>
                <div class="dm-bar ${task.status === 'completed' ? 'is-done' : task.status === 'error' ? 'is-error' : ''}"><i style="width:${percent}%"></i></div>
                <div class="dm-meta">${percent}% · ${fmtBytes(task.downloaded)} / ${fmtBytes(task.size)} · ${fmtSpeed(task.speed)} · ETA ${eta}${task.error ? ` · <span style="color:var(--dm-red)">${escHtml(task.error)}</span>` : ''}</div>
            </td>
            <td class="num">${fmtTime(task.created_at)}</td>
            <td class="actions">
                ${canPause ? `<button class="dm-btn small" data-action="pause" data-id="${escAttr(task.id)}">Pause</button>` : ''}
                ${canResume ? `<button class="dm-btn small" data-action="resume" data-id="${escAttr(task.id)}">Resume</button>` : ''}
                <button class="dm-btn small" data-action="details" data-id="${escAttr(task.id)}">Details</button>
                <button class="dm-btn small" data-action="reset" data-id="${escAttr(task.id)}">Reset</button>
                <button class="dm-btn small danger" data-action="delete" data-id="${escAttr(task.id)}">Delete</button>
            </td>
        </tr>`;
    };

    const tasksPanel = () => {
        const tasks = visibleTasks();
        const counts = { all: state.tasks.length, active: 0, completed: 0, paused: 0, errors: 0 };
        for (const task of state.tasks) { const group = groupOf(task); if (group in counts) counts[group]++; }
        const tabs = [['all', 'All'], ['active', 'Active'], ['completed', 'Completed'], ['paused', 'Paused'], ['errors', 'Errors']];
        return `<section class="dm-panel">
            <div class="dm-toolbar">
                <div><h2>Tasks</h2><p class="dm-muted">Drag ⣿ on a waiting row to change the queue order.</p></div>
                <div class="dm-row">
                    <input class="dm-input" id="dm-search" data-role="search" placeholder="Search name, URL or category…" value="${escAttr(state.search)}" aria-label="Search downloads" style="width:220px">
                    <select data-role="sort" aria-label="Sort downloads">
                        ${[['newest', 'Newest'], ['oldest', 'Oldest'], ['name', 'Name'], ['size', 'Size'], ['progress', 'Progress'], ['status', 'Status']]
                            .map(([v, l]) => `<option value="${v}"${state.sort === v ? ' selected' : ''}>${l}</option>`).join('')}
                    </select>
                    <button class="dm-btn primary" data-action="refresh">Refresh</button>
                </div>
            </div>
            <div class="dm-tabs" style="margin-top:10px">
                ${tabs.map(([id, label]) => `<button class="dm-tab${state.filter === id ? ' is-active' : ''}" type="button" data-filter="${id}">${label} ${counts[id]}</button>`).join('')}
            </div>
            ${tasks.length ? `<div style="overflow-x:auto;margin-top:10px"><table class="dm-table">
                <thead><tr><th></th><th>Name</th><th style="text-align:right">Added</th><th style="text-align:right">Actions</th></tr></thead>
                <tbody>${tasks.map(taskRow).join('')}</tbody>
            </table></div>` : `<div class="dm-empty"><strong>Nothing here</strong>No downloads match this view.</div>`}
        </section>`;
    };

    const overviewView = () => {
        const recent = state.tasks.slice().sort((a, b) => b.created_at - a.created_at).slice(0, 6);
        return `${summary()}
            <section class="dm-panel">
                <h2>Quick add</h2>
                <p class="dm-muted">Paste an http(s) URL, a magnet link or a premium hoster link.</p>
                <div class="dm-row" style="margin-top:10px">
                    <input class="dm-input" id="dm-quick-url" placeholder="https://… or magnet:?xt=urn:btih:…" aria-label="Download URL">
                    <button class="dm-btn primary" data-action="quick-add">Download</button>
                </div>
            </section>
            ${recent.length ? `<section class="dm-panel">
                <h2>Recent activity</h2>
                <div style="overflow-x:auto;margin-top:10px"><table class="dm-table">
                    <thead><tr><th></th><th>Name</th><th style="text-align:right">Added</th><th></th></tr></thead>
                    <tbody>${recent.map(taskRow).join('')}</tbody>
                </table></div>
            </section>` : ''}`;
    };

    const addView = () => {
        const categories = state.config?.categories || [];
        return `<section class="dm-panel">
            <h2>Add a download</h2>
            <p class="dm-muted">A category destination wins over the default folder; an explicit folder wins over both.</p>
            <form data-form="add" autocomplete="off">
                <div class="dm-field"><label for="dm-add-url">URL or magnet</label>
                    <input class="dm-input" id="dm-add-url" name="url" placeholder="https://example.com/file.iso or magnet:?xt=urn:btih:…" required></div>
                <div class="dm-fields">
                    <div class="dm-field"><label for="dm-add-name">Display name (optional)</label>
                        <input class="dm-input" id="dm-add-name" name="name" maxlength="255"></div>
                    <div class="dm-field"><label for="dm-add-category">Category</label>
                        <select id="dm-add-category" name="category"><option value="">— None —</option>
                            ${categories.map((c) => `<option value="${escAttr(c.name)}">${escHtml(c.name)}${c.save_path ? ` — ${escHtml(c.save_path)}` : ''}</option>`).join('')}
                        </select></div>
                    <div class="dm-field full"><label for="dm-add-folder">Folder (optional)</label>
                        <div class="dm-row"><input class="dm-input" id="dm-add-folder" name="folder" placeholder="Leave blank for the default folder">
                            <button type="button" class="dm-btn" data-action="pick-folder" data-target="dm-add-folder">Browse…</button></div></div>
                </div>
                <div class="dm-form-actions"><button class="dm-btn primary" type="submit">Start download</button></div>
            </form>
        </section>
        <section class="dm-panel">
            <h2>Torrent files</h2>
            <p class="dm-muted">Upload one or more .torrent files; they are queued through the debrid provider.</p>
            <div class="dm-row" style="margin-top:10px">
                <input type="file" id="dm-add-torrents" accept=".torrent" multiple aria-label="Torrent files">
                <button class="dm-btn primary" data-action="upload-torrents">Queue torrents</button>
            </div>
        </section>`;
    };

    const categoryRows = (categories) => categories.map((c, i) => `<div class="dm-editor-row" data-cat-row="${i}">
        <input class="dm-input" data-cat-name value="${escAttr(c.name || '')}" placeholder="Name" aria-label="Category name">
        <input class="dm-input" data-cat-path value="${escAttr(c.save_path || '')}" placeholder="Destination (blank = download dir/name)" aria-label="Category destination">
        <button class="dm-btn small danger" type="button" data-action="remove-cat" data-index="${i}">Remove</button>
    </div>`).join('');

    const rssRows = (feeds) => feeds.map((f, i) => `<div class="dm-editor-row wide" data-rss-row="${i}" data-feed-id="${escAttr(f.id || '')}">
        <input type="checkbox" ${f.enabled ? 'checked' : ''} aria-label="Feed enabled">
        <input class="dm-input" data-rss-url value="${escAttr(f.url || '')}" placeholder="https://indexer/rss" aria-label="Feed URL">
        <input class="dm-input" data-rss-pattern value="${escAttr(f.pattern || '')}" placeholder="Include regex" aria-label="Include pattern">
        <input class="dm-input" data-rss-exclude value="${escAttr(f.exclude || '')}" placeholder="Exclude regex" aria-label="Exclude pattern">
        <input class="dm-input" data-rss-category value="${escAttr(f.category || '')}" placeholder="Category" aria-label="Feed category">
        <input class="dm-input" data-rss-dest value="${escAttr(f.destination || '')}" placeholder="Destination" aria-label="Feed destination">
        <input class="dm-input" data-rss-interval type="number" min="5" max="1440" value="${Number(f.interval_minutes || 15)}" title="Check interval (minutes)" aria-label="Check interval in minutes" style="max-width:80px">
        <div class="dm-row"><button class="dm-btn small" type="button" data-action="run-rss" data-id="${escAttr(f.id || '')}">Run</button>
            <button class="dm-btn small danger" type="button" data-action="remove-rss">×</button></div>
    </div>`).join('');

    const watchRows = (folders) => folders.map((e, i) => `<div class="dm-editor-row" data-watch-row="${i}" style="grid-template-columns:1fr 1fr 1fr auto;align-items:center">
        <input class="dm-input" data-watch-name value="${escAttr(e.name || '')}" placeholder="Name" aria-label="Watch folder name">
        <input class="dm-input" id="watch-${i}" data-watch-folder value="${escAttr(e.folder || '')}" placeholder="/path/to/torrents" aria-label="Watched folder">
        <input class="dm-input" data-watch-dest value="${escAttr(e.destination || '')}" placeholder="Destination (blank = same folder)" aria-label="Watch destination">
        <div class="dm-row"><button class="dm-btn small" type="button" data-action="pick-folder" data-target="watch-${i}">Browse…</button>
            <button class="dm-btn small danger" type="button" data-action="remove-watch">×</button></div>
    </div>`).join('');

    const settingsView = () => {
        const cfg = state.config || {};
        const sched = cfg.schedule || {};
        const limits = cfg.speed_limit || {};
        const db = cfg.debrid || {};
        const provider = db.provider || '';
        const keyField = DEBRID_FIELD[provider] || '';
        const apiKey = keyField ? (db[keyField] || '') : '';
        const canSeeKey = typeof cfg.qb_api_key === 'string' && cfg.qb_api_key.startsWith('ethos_');
        return `<section class="dm-panel">
            <h2>General</h2>
            <form data-form="settings">
                <div class="dm-field"><label for="dm-set-dir">Download folder</label>
                    <div class="dm-row"><input class="dm-input" id="dm-set-dir" value="${escAttr(cfg.download_dir || '')}">
                        <button class="dm-btn" type="button" data-action="pick-folder" data-target="dm-set-dir">Browse…</button></div></div>
                <div class="dm-fields">
                    <div class="dm-field"><label for="dm-set-concurrent">Max concurrent</label>
                        <input class="dm-input" id="dm-set-concurrent" type="number" min="1" max="16" value="${Number(cfg.max_concurrent || 3)}"></div>
                    <div class="dm-field"><label class="dm-checkline"><input type="checkbox" id="dm-set-schedule" ${sched.enabled ? 'checked' : ''}> Only start inside a daily window</label></div>
                    <div class="dm-field"><label for="dm-set-start">Window start</label><input class="dm-input" id="dm-set-start" type="time" value="${escAttr(sched.start || '01:00')}"></div>
                    <div class="dm-field"><label for="dm-set-end">Window end</label><input class="dm-input" id="dm-set-end" type="time" value="${escAttr(sched.end || '06:00')}"></div>
                    <div class="dm-field"><label for="dm-set-global">Global speed limit (KB/s, 0 = ∞)</label><input class="dm-input" id="dm-set-global" type="number" min="0" value="${Math.round(Number(limits.global_bps || 0) / 1024)}"></div>
                    <div class="dm-field"><label for="dm-set-task">Per-task limit (KB/s)</label><input class="dm-input" id="dm-set-task" type="number" min="0" value="${Math.round(Number(limits.per_task_bps || 0) / 1024)}"></div>
                </div>
                <div class="dm-form-actions"><button class="dm-btn primary" type="submit">Save settings</button></div>
            </form>
        </section>
        <section class="dm-panel">
            <h2>Debrid</h2>
            <form data-form="debrid">
                <div class="dm-fields">
                    <div class="dm-field"><label for="dm-set-provider">Provider</label>
                        <select id="dm-set-provider">${[['', '— None —'], ['realdebrid', 'Real-Debrid'], ['alldebrid', 'AllDebrid'], ['torbox', 'TorBox']]
                            .map(([v, l]) => `<option value="${v}"${provider === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
                    <div class="dm-field"><label for="dm-set-key">API key</label>
                        <input class="dm-input" id="dm-set-key" type="password" value="${escAttr(apiKey)}" placeholder="Paste the provider key"></div>
                </div>
                <div class="dm-form-actions">
                    <button class="dm-btn" type="button" data-action="verify-debrid">Verify</button>
                    <button class="dm-btn primary" type="submit">Save debrid</button>
                </div>
            </form>
        </section>
        <section class="dm-panel">
            <h2>qBittorrent / Sonarr / Radarr</h2>
            <p class="dm-muted">Point *arr at this NAS as a qBittorrent client: host gateway, port 9000, URL base /api/downloads/qb, password = the key below.</p>
            <div class="dm-def-grid">
                <div><span>API key</span><strong>${canSeeKey ? `<code>${escHtml(cfg.qb_api_key)}</code>` : (cfg.qb_api_key_set ? '•••• admin only' : '—')}</strong></div>
                <div><span>Key state</span><strong>${cfg.qb_api_key_set ? 'configured' : 'not generated'}</strong></div>
            </div>
            ${canSeeKey ? `<div class="dm-form-actions"><button class="dm-btn" type="button" data-action="copy-key">Copy key</button>
                <button class="dm-btn danger" type="button" data-action="rotate-key">Rotate key</button></div>` : ''}
        </section>
        <section class="dm-panel">
            <h2>Categories</h2>
            <p class="dm-muted">A category sets where its downloads land; blank path = &lt;download dir&gt;/&lt;name&gt;.</p>
            <div id="dm-cat-list">${categoryRows(cfg.categories || [])}</div>
            <div class="dm-form-actions"><button class="dm-btn" type="button" data-action="add-cat">+ Add category</button>
                <button class="dm-btn primary" type="button" data-action="save-cats">Save categories</button></div>
        </section>
        <section class="dm-panel">
            <h2>RSS rules</h2>
            <p class="dm-muted">Items matching the include regex (and not the exclude regex) are queued automatically.</p>
            <div id="dm-rss-list">${rssRows(cfg.rss_feeds || [])}</div>
            <div class="dm-form-actions"><button class="dm-btn" type="button" data-action="add-rss">+ Add feed</button>
                <button class="dm-btn primary" type="button" data-action="save-rss">Save RSS</button></div>
        </section>
        <section class="dm-panel">
            <h2>Watch folders</h2>
            <p class="dm-muted">New .torrent files dropped here are queued and moved to .processed/.</p>
            <label class="dm-checkline"><input type="checkbox" id="dm-watch-enabled" ${cfg.watch_enabled ? 'checked' : ''}> Enable the watch folders</label>
            <div id="dm-watch-list">${watchRows(cfg.watch_folders || [])}</div>
            <div class="dm-form-actions"><button class="dm-btn" type="button" data-action="add-watch">+ Add folder</button>
                <button class="dm-btn primary" type="button" data-action="save-watch">Save watch folders</button></div>
        </section>`;
    };

    function renderView() {
        const [title, sub] = VIEWS[state.view] || VIEWS.overview;
        $('#dm-title').textContent = title;
        $('#dm-sub').textContent = sub;
        if (state.fatal) statusLine(state.fatal, 'error');
        else statusLine('Ready.', '');
        const view = $('#dm-view');
        if (state.fatal && state.view !== 'settings') {
            view.innerHTML = `<div class="dm-panel"><p class="dm-muted">${escHtml(state.fatal)}</p>
                <div class="dm-form-actions"><button class="dm-btn primary" data-action="retry">Retry</button></div></div>`;
            return;
        }
        if (state.view === 'overview') view.innerHTML = overviewView();
        else if (state.view === 'downloads') view.innerHTML = tasksPanel();
        else if (state.view === 'add') view.innerHTML = addView();
        else view.innerHTML = settingsView();
        root.querySelectorAll('[data-view]').forEach((btn) => btn.classList.toggle('is-active', btn.dataset.view === state.view));
    }

    // ── Actions ────────────────────────────────────────────────────────────
    async function taskById(id) { return state.tasks.find((t) => t.id === id); }

    async function taskAction(action, id) {
        const task = await taskById(id);
        if (!task) return;
        if (action === 'details') {
            const lines = [
                `Status: ${STATUS[task.status]?.[0] || task.status}`,
                `Category: ${task.category || '—'}`,
                `Priority: ${task.priority || 0}`,
                `Progress: ${pct(task)}%`,
                `Size: ${fmtBytes(task.downloaded)} / ${fmtBytes(task.size)}`,
                `Speed: ${fmtSpeed(task.speed)}`,
                `Provider: ${task.provider || '—'}${task.debrid_status ? ` (${task.debrid_status})` : ''}`,
                `Created: ${fmtTime(task.created_at)}`,
                `Finished: ${fmtTime(task.finished_at)}`,
                `Destination: ${task.path || '—'}`,
                `Source: ${task.url || '—'}`,
            ];
            if (task.error) lines.push(`Error: ${task.error}`);
            if (Array.isArray(task.files) && task.files.length) {
                lines.push('', `Files (${task.files.filter((f) => f.downloaded_to_nas).length}/${task.files.length} on NAS):`);
                for (const f of task.files.slice(0, 30)) lines.push(`  ${f.downloaded_to_nas ? '✓' : '·'} ${f.name} (${fmtBytes(f.size)})`);
            }
            if (ctx.modal?.alert) await ctx.modal.alert(task.name, lines.join('\n'));
            else notify(task.name, 'info');
            return;
        }
        if (action === 'delete') {
            const ok = await confirmDialog('Delete download?', `"${task.name}" and its downloaded files will be removed.`, 'Delete');
            if (!ok) return;
        }
        if (action === 'reset') {
            const ok = await confirmDialog('Reset download?', `Partial data for "${task.name}" is deleted and the download restarts.`, 'Reset');
            if (!ok) return;
        }
        const job = (action === 'delete' || action === 'reset') && ctx.progress?.startTask
            ? ctx.progress.startTask({ title: action === 'delete' ? `Deleting ${task.name}` : `Resetting ${task.name}`, detail: 'Working…' })
            : null;
        state.busy = true;
        try {
            if (action === 'pause') await postJson(`/tasks/${encodeURIComponent(id)}/pause`);
            else if (action === 'resume') await postJson(`/tasks/${encodeURIComponent(id)}/resume`);
            else if (action === 'reset') await postJson(`/tasks/${encodeURIComponent(id)}/reset`);
            else if (action === 'delete') await api(`/tasks/${encodeURIComponent(id)}/cancel?delete_file=true`, { method: 'POST' });
            job?.finish?.('done', { percent: 100 });
            notify(action === 'delete' ? 'Download deleted' : action === 'reset' ? 'Download reset' : action === 'pause' ? 'Paused' : 'Resumed', 'success');
            await refresh(true);
        } catch (error) {
            job?.finish?.('failed', { detail: error.message });
            notify(error.message || 'Action failed', 'error');
        } finally {
            state.busy = false;
        }
    }

    async function quickAdd() {
        const input = $('#dm-quick-url');
        const url = input?.value.trim();
        if (!url) return notify('Paste a URL or magnet link', 'error');
        try {
            await postJson('/tasks', { url });
            input.value = '';
            notify('Download started', 'success');
            await refresh();
        } catch (error) { notify(error.message || 'Could not start the download', 'error'); }
    }

    async function submitAdd(form) {
        const url = form.querySelector('[name="url"]').value.trim();
        if (!url) return notify('URL is required', 'error');
        const body = { url, name: form.querySelector('[name="name"]').value.trim() || null,
            folder: form.querySelector('[name="folder"]').value.trim() || null,
            category: form.querySelector('[name="category"]').value || null };
        try {
            await postJson('/tasks', body);
            notify('Download started', 'success');
            form.reset();
            state.view = 'downloads';
            await refresh();
        } catch (error) { notify(error.message || 'Could not start the download', 'error'); }
    }

    async function uploadTorrents() {
        const input = $('#dm-add-torrents');
        const files = Array.from(input?.files || []);
        if (!files.length) return notify('Choose at least one .torrent file', 'error');
        const folder = $('#dm-add-folder')?.value.trim() || '';
        const job = ctx.progress?.startTask
            ? ctx.progress.startTask({ title: files.length === 1 ? files[0].name : `${files.length} torrents`, total: files.length, detail: 'Uploading…' })
            : null;
        try {
            const formData = new FormData();
            for (const file of files) formData.append('files', file);
            if (folder) formData.append('folder', folder);
            const response = await ctx.apiFetch('/api/downloads/tasks/torrent', { method: 'POST', body: formData });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(body?.detail || `HTTP ${response.status}`);
            const failed = Array.isArray(body.errors) ? body.errors.length : 0;
            job?.finish?.(failed ? 'failed' : 'done', { percent: 100, detail: failed ? `${failed} failed` : 'Queued' });
            notify(failed ? `${body.queued?.length || 0} queued, ${failed} failed` : 'Torrents queued', failed ? 'warning' : 'success');
            input.value = '';
            await refresh();
        } catch (error) {
            job?.finish?.('failed', { detail: error.message });
            notify(error.message || 'Upload failed', 'error');
        }
    }

    function settingsPayload() {
        const dir = $('#dm-set-dir')?.value.trim();
        const concurrent = Number($('#dm-set-concurrent')?.value || 3);
        const scheduled = Boolean($('#dm-set-schedule')?.checked);
        const start = $('#dm-set-start')?.value || '01:00';
        const end = $('#dm-set-end')?.value || '06:00';
        const globalKb = Number($('#dm-set-global')?.value || 0);
        const taskKb = Number($('#dm-set-task')?.value || 0);
        return {
            download_dir: dir,
            max_concurrent: concurrent,
            schedule: { enabled: scheduled, start, end },
            speed_limit: { global_bps: globalKb * 1024, per_task_bps: taskKb * 1024 },
        };
    }

    async function saveSettings() {
        try {
            await postJson('/config', settingsPayload());
            notify('Settings saved', 'success');
            await loadConfig();
            renderView();
        } catch (error) { notify(error.message || 'Could not save settings', 'error'); }
    }

    async function saveDebrid() {
        const provider = $('#dm-set-provider')?.value || '';
        const key = $('#dm-set-key')?.value.trim() || '';
        const body = { debrid: { provider } };
        const field = DEBRID_FIELD[provider];
        if (field && key && !key.includes('****')) body.debrid[field] = key;
        try {
            await postJson('/config', body);
            notify('Debrid settings saved', 'success');
            await loadConfig();
            renderView();
        } catch (error) { notify(error.message || 'Could not save debrid settings', 'error'); }
    }

    async function verifyDebrid() {
        const provider = $('#dm-set-provider')?.value || '';
        const key = $('#dm-set-key')?.value.trim() || '';
        if (!provider) return notify('Choose a provider first', 'error');
        if (!key || key.includes('****')) return notify('Re-enter the API key to verify it', 'error');
        try {
            await postJson('/verify', { provider, key });
            notify('Provider key verified', 'success');
        } catch (error) { notify(error.message || 'Verification failed', 'error'); }
    }

    async function saveCategories() {
        const rows = [...root.querySelectorAll('[data-cat-row]')];
        const categories = rows.map((row) => ({
            name: row.querySelector('[data-cat-name]').value.trim(),
            save_path: row.querySelector('[data-cat-path]').value.trim(),
        })).filter((c) => c.name);
        try {
            await postJson('/config', { categories });
            notify('Categories saved', 'success');
            await loadConfig();
            renderView();
        } catch (error) { notify(error.message || 'Could not save categories', 'error'); }
    }

    function readRssRows() {
        return [...root.querySelectorAll('[data-rss-row]')].map((row, index) => ({
            id: row.dataset.feedId || `rss${index + 1}`,
            enabled: row.querySelector('input[type="checkbox"]').checked,
            url: row.querySelector('[data-rss-url]').value.trim(),
            pattern: row.querySelector('[data-rss-pattern]').value.trim(),
            exclude: row.querySelector('[data-rss-exclude]').value.trim(),
            category: row.querySelector('[data-rss-category]').value.trim(),
            destination: row.querySelector('[data-rss-dest]').value.trim(),
            interval_minutes: Number(row.querySelector('[data-rss-interval]')?.value || 15),
        }));
    }

    async function saveRss() {
        const rss_feeds = readRssRows().filter((f) => f.url);
        try {
            await postJson('/config', { rss_feeds });
            notify('RSS rules saved', 'success');
            await loadConfig();
            renderView();
        } catch (error) { notify(error.message || 'Could not save RSS rules', 'error'); }
    }

    async function runRss(id) {
        if (!id) return notify('Save the feed first', 'error');
        try {
            const out = await postJson(`/rss/${encodeURIComponent(id)}/run`);
            notify(`RSS run: ${out?.queued || 0} queued`, 'success');
            await refresh(true);
        } catch (error) { notify(error.message || 'RSS run failed', 'error'); }
    }

    async function saveWatch() {
        const rows = [...root.querySelectorAll('[data-watch-row]')];
        const watch_folders = rows.map((row, index) => ({
            name: row.querySelector('[data-watch-name]').value.trim() || `Watch ${index + 1}`,
            folder: row.querySelector('[data-watch-folder]').value.trim(),
            destination: row.querySelector('[data-watch-dest]').value.trim(),
        })).filter((entry) => entry.folder);
        try {
            await postJson('/config', {
                watch_enabled: Boolean($('#dm-watch-enabled')?.checked),
                watch_folders: watch_folders.length ? watch_folders : [{ name: 'Default', folder: '', destination: '' }],
            });
            notify('Watch folders saved', 'success');
            await loadConfig();
            renderView();
        } catch (error) { notify(error.message || 'Could not save watch folders', 'error'); }
    }

    async function copyKey() {
        const key = state.config?.qb_api_key || '';
        if (!key.startsWith('ethos_')) return notify('Only an admin can view the key', 'error');
        try { await navigator.clipboard.writeText(key); notify('API key copied', 'success'); }
        catch { notify('Could not copy the key', 'error'); }
    }

    async function rotateKey() {
        const ok = await confirmDialog('Rotate API key?', 'Radarr/Sonarr will stop working until you update their download-client password.', 'Rotate');
        if (!ok) return;
        try {
            await postJson('/config/qb-key/rotate');
            await loadConfig();
            notify('API key rotated — update Radarr/Sonarr', 'success');
            renderView();
        } catch (error) { notify(error.message || 'Could not rotate the key', 'error'); }
    }

    async function pickFolder(targetId) {
        if (typeof ctx.pickFolder !== 'function') return;
        const input = document.getElementById(targetId);
        const current = input?.value || '';
        try {
            const path = await ctx.pickFolder({
                title: 'Choose folder', startPath: current || '/mnt',
                roots: ['/home', '/mnt', '/media'], acceptLabel: 'Use this folder',
            });
            if (path && input) input.value = path;
        } catch { /* cancelled */ }
    }

    async function reorderQueue(movingId, targetId) {
        if (!movingId || !targetId || movingId === targetId) return;
        const order = queueOrder().map((t) => t.id);
        const from = order.indexOf(movingId);
        const to = order.indexOf(targetId);
        if (from < 0 || to < 0) return;
        order.splice(from, 1);
        order.splice(to, 0, movingId);
        try {
            await postJson('/tasks/reorder', { order });
            await refresh(true);
        } catch (error) { notify(error.message || 'Could not reorder the queue', 'error'); }
    }

    // ── Events ─────────────────────────────────────────────────────────────
    function rowFromEvent(event) {
        return event.target?.closest?.('tr[data-task-id]') || null;
    }

    function onClick(event) {
        const action = event.target.closest('[data-action]');
        if (action) {
            const { action: name, id, target, index } = action.dataset;
            if (name === 'refresh' || name === 'retry') { refresh(); return; }
            if (name === 'quick-add') { quickAdd(); return; }
            if (name === 'pause' || name === 'resume' || name === 'reset' || name === 'delete' || name === 'details') { taskAction(name, id); return; }
            if (name === 'pick-folder') { pickFolder(target || id); return; }
            if (name === 'upload-torrents') { uploadTorrents(); return; }
            if (name === 'verify-debrid') { verifyDebrid(); return; }
            if (name === 'save-cats') { saveCategories(); return; }
            if (name === 'add-cat') {
                const list = $('#dm-cat-list');
                if (list) list.insertAdjacentHTML('beforeend', categoryRows([{ name: '', save_path: '' }]).replace('data-cat-row="0"', `data-cat-row="${list.children.length}"`));
                return;
            }
            if (name === 'remove-cat') { action.closest('[data-cat-row]')?.remove(); return; }
            if (name === 'add-rss') {
                const list = $('#dm-rss-list');
                if (list) list.insertAdjacentHTML('beforeend', rssRows([{ id: `rss${Date.now().toString(36)}`, enabled: true }]));
                return;
            }
            if (name === 'remove-rss') { action.closest('[data-rss-row]')?.remove(); return; }
            if (name === 'run-rss') { runRss(id); return; }
            if (name === 'save-rss') { saveRss(); return; }
            if (name === 'add-watch') {
                const list = $('#dm-watch-list');
                if (list) list.insertAdjacentHTML('beforeend', watchRows([{ name: '', folder: '' }]).replace('data-watch-row="0"', `data-watch-row="${list.children.length}"`));
                return;
            }
            if (name === 'save-watch') { saveWatch(); return; }
            if (name === 'remove-watch') { action.closest('[data-watch-row]')?.remove(); return; }
            if (name === 'copy-key') { copyKey(); return; }
            if (name === 'rotate-key') { rotateKey(); return; }
        }
        const view = event.target.closest('[data-view]');
        if (view) { state.view = view.dataset.view; renderView(); return; }
        const filter = event.target.closest('[data-filter]');
        if (filter) { state.filter = filter.dataset.filter; renderView(); }
    }

    function onChange(event) {
        if (event.target.dataset.role === 'sort') { state.sort = event.target.value; renderView(); return; }
        // A masked key belongs to the previous provider; make the user paste the new one.
        if (event.target.id === 'dm-set-provider') {
            const keyInput = $('#dm-set-key');
            if (keyInput && keyInput.value.includes('****')) keyInput.value = '';
        }
    }

    function onInput(event) {
        if (event.target.dataset.role !== 'search') return;
        state.search = event.target.value;
        const rows = root.querySelectorAll('tbody tr[data-task-id]');
        const needle = state.search.trim().toLowerCase();
        for (const row of rows) {
            const task = state.tasks.find((t) => t.id === row.dataset.taskId);
            const haystack = [task?.name, task?.url, task?.category].map((v) => String(v || '').toLowerCase()).join(' ');
            row.hidden = Boolean(needle) && !haystack.includes(needle);
        }
    }

    function onSubmit(event) {
        const form = event.target.closest('form[data-form]');
        if (!form) return;
        event.preventDefault();
        if (form.dataset.form === 'add') submitAdd(form);
        else if (form.dataset.form === 'settings') saveSettings();
        else if (form.dataset.form === 'debrid') saveDebrid();
    }

    function onDragStart(event) {
        const handle = event.target.closest?.('[data-drag-handle]');
        if (!handle) { event.preventDefault(); return; }
        const row = rowFromEvent(event);
        if (!row) { event.preventDefault(); return; }
        state.dragId = row.dataset.taskId;
        try { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', state.dragId); } catch { /* ignore */ }
        row.classList.add('is-drag-source');
    }

    function onDragOver(event) {
        if (!state.dragId) return;
        const row = rowFromEvent(event);
        if (!row || row.dataset.status !== 'waiting') return;
        event.preventDefault();
        for (const other of root.querySelectorAll('tbody tr[data-task-id]')) other.classList.remove('is-drop-target');
        row.classList.add('is-drop-target');
    }

    function onDrop(event) {
        if (!state.dragId) return;
        const row = rowFromEvent(event);
        if (!row || row.dataset.status !== 'waiting') return;
        event.preventDefault();
        const moving = state.dragId;
        const target = row.dataset.taskId;
        clearDrag();
        reorderQueue(moving, target);
    }

    function clearDrag() {
        state.dragId = '';
        for (const row of root.querySelectorAll('tbody tr[data-task-id]')) row.classList.remove('is-drag-source', 'is-drop-target');
    }

    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    root.addEventListener('input', onInput);
    root.addEventListener('submit', onSubmit);
    root.addEventListener('dragstart', onDragStart);
    root.addEventListener('dragover', onDragOver);
    root.addEventListener('drop', onDrop);
    root.addEventListener('dragend', clearDrag);

    function startPolling() {
        clearInterval(state.timer);
        state.timer = setInterval(() => {
            if (document.hidden) return;
            if (state.view === 'overview' || state.view === 'downloads') refresh(true);
        }, 2000);
    }

    try {
        await Promise.all([loadTasks(), loadConfig()]);
        state.loaded = true;
        setPill('ready', 'Ready');
    } catch (error) {
        state.fatal = error.message || 'Could not load downloads';
        setPill('offline', 'Offline');
    }
    renderView();
    startPolling();

    return () => {
        clearInterval(state.timer);
        root.removeEventListener('click', onClick);
        root.removeEventListener('change', onChange);
        root.removeEventListener('input', onInput);
        root.removeEventListener('submit', onSubmit);
        root.removeEventListener('dragstart', onDragStart);
        root.removeEventListener('dragover', onDragOver);
        root.removeEventListener('drop', onDrop);
        root.removeEventListener('dragend', clearDrag);
    };
}
