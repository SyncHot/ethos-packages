// EthOS Backup Manager — native Package Center UI.
// Self-contained module: no relative imports (EthOS loads it from a blob URL).
// Backend: /api/backup/* (admin-only, API v2).

const STYLE = `
.bm-root{display:flex;height:100%;overflow:hidden;background:radial-gradient(1200px 600px at 0% 0%,rgba(13,148,136,.10),transparent 55%),radial-gradient(900px 500px at 100% 100%,rgba(59,130,246,.08),transparent 50%),var(--bm-bg);color:var(--bm-text);font:13px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color-scheme:light;--bm-bg:#f6f8fb;--bm-panel:#fff;--bm-panel-2:#f1f5f9;--bm-border:#dce3ee;--bm-text:#0f172a;--bm-text-2:#475569;--bm-text-3:#64748b;--bm-accent:#0d9488;--bm-accent-2:#0f766e;--bm-danger:#dc2626;--bm-warn:#b45309;--bm-ok:#15803d;--bm-info:#1d4ed8}
:root.dark .bm-root{color-scheme:dark;--bm-bg:#0a111d;--bm-panel:#111a2b;--bm-panel-2:#182338;--bm-border:#243047;--bm-text:#e6edf7;--bm-text-2:#a9b7cc;--bm-text-3:#7f90a8;--bm-accent:#2dd4bf;--bm-accent-2:#14b8a6;--bm-danger:#f87171;--bm-warn:#fbbf24;--bm-ok:#4ade80;--bm-info:#93c5fd}
.bm-root *{box-sizing:border-box}
.bm-side{width:218px;flex:0 0 218px;display:flex;flex-direction:column;gap:16px;padding:20px 14px;border-right:1px solid var(--bm-border);overflow-y:auto;background:color-mix(in srgb,var(--bm-panel) 72%,transparent)}
.bm-brand{display:flex;align-items:center;gap:10px;padding:2px 6px}
.bm-brand span{font-size:22px}
.bm-brand strong{display:block;font-size:13px;letter-spacing:.01em}
.bm-brand small{color:var(--bm-text-3);font-size:11px}
.bm-nav{display:flex;flex-direction:column;gap:4px}
.bm-nav-item{display:flex;align-items:center;gap:9px;width:100%;padding:8px 10px;border:0;border-radius:9px;background:transparent;color:var(--bm-text-2);font:inherit;text-align:left;cursor:pointer}
.bm-nav-item:hover{background:var(--bm-panel-2);color:var(--bm-text)}
.bm-nav-item[aria-current="page"]{background:color-mix(in srgb,var(--bm-accent) 14%,transparent);color:var(--bm-text);font-weight:600}
.bm-side-foot{margin-top:auto;display:flex;flex-direction:column;gap:6px;padding:0 6px}
.bm-side-foot small{color:var(--bm-text-3);font-size:11px;line-height:1.45}
.bm-main{flex:1;min-width:0;overflow-y:auto;padding:22px 26px 34px}
.bm-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:6px}
.bm-head h1{margin:0;font-size:20px;letter-spacing:-.01em}
.bm-head p{margin:3px 0 0;color:var(--bm-text-3);font-size:12px}
.bm-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.bm-pill{display:inline-flex;align-items:center;gap:7px;align-self:flex-start;padding:5px 10px;border-radius:999px;background:var(--bm-panel-2);border:1px solid var(--bm-border);color:var(--bm-text-2);font-size:11px;max-width:100%}
.bm-pill i{width:7px;height:7px;border-radius:50%;background:var(--bm-ok);display:inline-block}
.bm-pill.busy i{background:var(--bm-accent);animation:bm-pulse 1s infinite}
.bm-pill.bad i{background:var(--bm-danger)}
@keyframes bm-pulse{50%{opacity:.25}}
.bm-jobline{min-height:18px;margin:2px 0 12px;color:var(--bm-text-2);font-size:12px}
.bm-callout{margin:12px 0;padding:11px 13px;border-radius:11px;border:1px solid color-mix(in srgb,var(--bm-warn) 35%,var(--bm-border));background:color-mix(in srgb,var(--bm-warn) 10%,transparent);color:var(--bm-text);font-size:12px}
.bm-callout.bad{border-color:color-mix(in srgb,var(--bm-danger) 40%,var(--bm-border));background:color-mix(in srgb,var(--bm-danger) 10%,transparent)}
.bm-callout.info{border-color:color-mix(in srgb,var(--bm-info) 35%,var(--bm-border));background:color-mix(in srgb,var(--bm-info) 8%,transparent)}
.bm-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:14px 0 16px}
.bm-tile{padding:13px 14px;border:1px solid var(--bm-border);border-radius:13px;background:var(--bm-panel)}
.bm-tile span{display:block;color:var(--bm-text-3);font-size:11px;text-transform:uppercase;letter-spacing:.05em}
.bm-tile strong{display:block;font-size:19px;margin-top:5px;letter-spacing:-.02em}
.bm-tile small{color:var(--bm-text-3);font-size:11px}
.bm-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:14px;align-items:start}
.bm-panel{padding:15px 16px;border:1px solid var(--bm-border);border-radius:14px;background:var(--bm-panel);margin-bottom:14px}
.bm-panel h2{margin:0 0 10px;font-size:13px;letter-spacing:.01em}
.bm-panel p{margin:0 0 10px;color:var(--bm-text-2)}
.bm-target{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px dashed var(--bm-border)}
.bm-target:first-of-type{border-top:0}
.bm-target .name{font-weight:600;font-size:12px}
.bm-target .path{color:var(--bm-text-3);font-size:11px;word-break:break-all}
.bm-target .meter{height:6px;border-radius:999px;background:var(--bm-panel-2);overflow:hidden;margin-top:6px;min-width:150px}
.bm-target .meter i{display:block;height:100%;background:linear-gradient(90deg,var(--bm-accent),var(--bm-accent-2))}
.bm-table{width:100%;border-collapse:collapse;font-size:12px}
.bm-table th{text-align:left;color:var(--bm-text-3);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.04em;padding:6px 8px;border-bottom:1px solid var(--bm-border)}
.bm-table td{padding:8px;border-bottom:1px solid color-mix(in srgb,var(--bm-border) 60%,transparent);vertical-align:top}
.bm-table tr:last-child td{border-bottom:0}
.bm-table .muted{color:var(--bm-text-3)}
.bm-badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:600;letter-spacing:.02em;background:var(--bm-panel-2);color:var(--bm-text-2);border:1px solid var(--bm-border)}
.bm-badge.ok{background:color-mix(in srgb,var(--bm-ok) 14%,transparent);color:var(--bm-ok);border-color:transparent}
.bm-badge.bad{background:color-mix(in srgb,var(--bm-danger) 14%,transparent);color:var(--bm-danger);border-color:transparent}
.bm-badge.warn{background:color-mix(in srgb,var(--bm-warn) 15%,transparent);color:var(--bm-warn);border-color:transparent}
.bm-badge.info{background:color-mix(in srgb,var(--bm-info) 14%,transparent);color:var(--bm-info);border-color:transparent}
.bm-btn{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:9px;border:1px solid var(--bm-border);background:var(--bm-panel);color:var(--bm-text);font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}
.bm-btn:hover{border-color:var(--bm-accent);color:var(--bm-accent-2)}
.bm-btn.primary{background:var(--bm-accent);border-color:var(--bm-accent);color:#04201d;font-weight:600}
:root.dark .bm-btn.primary{color:#03211f}
.bm-btn.primary:hover{background:var(--bm-accent-2);border-color:var(--bm-accent-2);color:#fff}
.bm-btn.danger{border-color:color-mix(in srgb,var(--bm-danger) 45%,var(--bm-border));color:var(--bm-danger)}
.bm-btn.small{padding:4px 8px;font-size:11px;border-radius:7px}
.bm-btn:disabled{opacity:.5;cursor:not-allowed}
.bm-row-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.bm-empty{padding:22px 12px;text-align:center;color:var(--bm-text-3)}
.bm-empty strong{display:block;color:var(--bm-text);margin-bottom:4px}
.bm-form{display:grid;gap:14px}
.bm-step{border:1px solid var(--bm-border);border-radius:13px;padding:14px;background:var(--bm-panel)}
.bm-step h3{margin:0 0 4px;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--bm-text-3)}
.bm-step .hint{margin:0 0 10px;color:var(--bm-text-3);font-size:11px}
.bm-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.bm-field{display:flex;flex-direction:column;gap:4px}
.bm-field.full{grid-column:1/-1}
.bm-field label{color:var(--bm-text-2);font-size:11px;font-weight:600}
.bm-field .row{display:flex;gap:6px}
.bm-input,select.bm-input,textarea.bm-input{width:100%;padding:7px 9px;border-radius:8px;border:1px solid var(--bm-border);background:var(--bm-bg);color:var(--bm-text);font:inherit;font-size:12px}
.bm-input:focus-visible,.bm-btn:focus-visible,.bm-nav-item:focus-visible{outline:2px solid var(--bm-accent);outline-offset:2px}
.bm-check{display:flex;align-items:center;gap:7px;color:var(--bm-text-2);font-size:12px}
.bm-checks{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.bm-error{color:var(--bm-danger);font-size:12px;min-height:16px}
.bm-gen{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;padding:10px 0;border-top:1px dashed var(--bm-border)}
.bm-gen:first-of-type{border-top:0}
.bm-gen .when{font-weight:600}
.bm-gen .meta{color:var(--bm-text-3);font-size:11px}
.bm-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:var(--bm-text-2);word-break:break-all}
.bm-foot{margin-top:10px;padding-top:10px;border-top:1px solid var(--bm-border);display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
@media (max-width:900px){.bm-tiles{grid-template-columns:1fr 1fr}.bm-grid{grid-template-columns:1fr}.bm-fields,.bm-checks{grid-template-columns:1fr}}
@media (max-width:780px){.bm-root{flex-direction:column}.bm-side{width:auto;flex:0 0 auto;flex-direction:row;align-items:center;overflow-x:auto;border-right:0;border-bottom:1px solid var(--bm-border);padding:10px}.bm-brand{display:none}.bm-nav{flex-direction:row}.bm-nav-item{white-space:nowrap}.bm-side-foot{display:none}.bm-main{padding:16px}}
@media (prefers-reduced-motion:reduce){.bm-pill.busy i{animation:none}}
`;

const VIEWS = {
    overview: { title: 'Overview', sub: 'Health, destinations and recent activity' },
    schedules: { title: 'Schedules', sub: 'What to protect, where and when' },
    restore: { title: 'Restore', sub: 'Pick a generation and put the data back' },
    activity: { title: 'Activity', sub: 'Completed, failed and skipped runs' },
    settings: { title: 'Settings', sub: 'Defaults, offsite remotes and package info' },
};

const CRON_PRESETS = [
    ['0 2 * * *', 'Every day at 02:00'],
    ['0 3 * * *', 'Every day at 03:00'],
    ['30 1 * * *', 'Every day at 01:30'],
    ['0 3 * * 0', 'Every Sunday at 03:00'],
    ['0 3 1 * *', 'Monthly, 1st at 03:00'],
    ['@hourly', 'Every hour'],
    ['custom', 'Custom cron expression…'],
];

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export async function render(container, ctx) {
    container.style.height = '100%';
    container.style.overflow = 'hidden';

    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const $ = (selector) => root.querySelector(selector);

    const state = {
        view: 'overview',
        schedules: [],
        overview: null,
        history: [],
        settings: null,
        generations: [],
        genTarget: '',
        genLoadedFor: '',
        restoreScheduleId: '',
        restore: { generation: '', mode: 'in_place', target: '', delete_extra: false },
        form: null,
        status: null,
        lastOpId: null,
        timer: null,
        task: null,
        fatal: '',
    };

    const root = document.createElement('div');
    root.className = 'bm-root';
    root.innerHTML = `<style>${STYLE}</style>
        <aside class="bm-side">
            <div class="bm-brand"><span aria-hidden="true">🔄</span><div><strong>Backup Manager</strong><small data-version></small></div></div>
            <nav class="bm-nav" aria-label="Backup sections">
                ${Object.entries(VIEWS).map(([id, view]) => `<button class="bm-nav-item" data-view="${id}" type="button">${navIcon(id)} ${esc(view.title)}</button>`).join('')}
            </nav>
            <div class="bm-side-foot">
                <span class="bm-pill" id="bm-pill" role="status" aria-live="polite"><i></i><span>Loading…</span></span>
                <small id="bm-side-note"></small>
            </div>
        </aside>
        <main class="bm-main">
            <header class="bm-head">
                <div><h1 id="bm-title"></h1><p id="bm-sub"></p></div>
                <div class="bm-actions" id="bm-head-actions"></div>
            </header>
            <div class="bm-jobline" id="bm-job" role="status" aria-live="polite"></div>
            <div id="bm-callout"></div>
            <div id="bm-view"></div>
        </main>`;
    container.replaceChildren(root);

    const version = $('[data-version]');
    if (version) version.textContent = `v${ctx.pkg?.version || '1.0.0'}`;

    // ── API ────────────────────────────────────────────────────────────────
    async function api(path, options = {}) {
        const response = await ctx.apiFetch(`/api/backup${path}`, options);
        let body = null;
        try { body = await response.json(); } catch { body = null; }
        if (!response.ok) {
            const detail = body?.detail || `HTTP ${response.status}`;
            const error = new Error(typeof detail === 'string' ? detail : 'Request failed');
            error.status = response.status;
            error.detail = detail;
            throw error;
        }
        return body;
    }
    const post = (path, body) => api(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
    });

    // ── formatting ─────────────────────────────────────────────────────────
    function fmtBytes(value) {
        const bytes = Number(value || 0);
        if (!bytes) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
        let index = 0;
        let size = bytes;
        while (size >= 1024 && index < units.length - 1) { size /= 1024; index += 1; }
        return `${size >= 10 || index === 0 ? Math.round(size) : size.toFixed(1)} ${units[index]}`;
    }
    function parseDate(value) {
        if (!value) return null;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }
    function relTime(value) {
        const date = parseDate(value);
        if (!date) return '—';
        const diff = date.getTime() - Date.now();
        const abs = Math.abs(diff);
        const minute = 60_000;
        const hour = 60 * minute;
        const day = 24 * hour;
        const format = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'}`;
        let text;
        if (abs < minute) text = 'just now';
        else if (abs < hour) text = format(Math.round(abs / minute), 'min');
        else if (abs < day) text = format(Math.round(abs / hour), 'hour');
        else text = format(Math.round(abs / day), 'day');
        if (text === 'just now') return text;
        return diff < 0 ? `${text} ago` : `in ${text}`;
    }
    function fmtTime(value) {
        const date = parseDate(value);
        return date ? date.toLocaleString() : '—';
    }
    function fmtDuration(seconds) {
        if (seconds === null || seconds === undefined) return '—';
        const value = Number(seconds);
        if (value < 60) return `${Math.round(value)} s`;
        if (value < 3600) return `${Math.floor(value / 60)} min ${Math.round(value % 60)} s`;
        return `${Math.floor(value / 3600)} h ${Math.round((value % 3600) / 60)} min`;
    }
    function badge(status) {
        const kind = {
            success: 'ok', complete: 'ok', failed: 'bad', incomplete: 'bad',
            skipped: 'warn', cancelled: '', legacy: 'info', running: 'info', queued: 'info',
        }[status] || '';
        return `<span class="bm-badge ${kind}">${esc(status || 'unknown')}</span>`;
    }
    function retentionText(retention) {
        const value = retention || {};
        const parts = [];
        if (value.keep_last) parts.push(`${value.keep_last} last`);
        if (value.keep_daily) parts.push(`${value.keep_daily} daily`);
        if (value.keep_weekly) parts.push(`${value.keep_weekly} weekly`);
        if (value.keep_monthly) parts.push(`${value.keep_monthly} monthly`);
        return parts.join(' · ') || 'keep newest only';
    }
    function cronText(cron) {
        const preset = CRON_PRESETS.find(([value]) => value === cron);
        return preset && preset[0] !== 'custom' ? preset[1] : cron;
    }
    function navIcon(id) {
        return { overview: '📊', schedules: '🗓️', restore: '↩️', activity: '📜', settings: '⚙️' }[id] || '•';
    }

    // ── shell ──────────────────────────────────────────────────────────────
    function setPill(text, kind = '') {
        const pill = $('#bm-pill');
        if (!pill) return;
        pill.className = `bm-pill ${kind}`.trim();
        pill.querySelector('span').textContent = text;
    }
    function notice(html, kind = '') {
        const box = $('#bm-callout');
        if (box) box.innerHTML = html ? `<div class="bm-callout ${kind}">${html}</div>` : '';
    }
    function headActions(html) {
        const box = $('#bm-head-actions');
        if (box) box.innerHTML = html;
    }
    function jobLine(text) {
        const line = $('#bm-job');
        if (line) line.textContent = text || '';
    }

    function setView(name) {
        if (!VIEWS[name]) return;
        state.view = name;
        root.querySelectorAll('.bm-nav-item').forEach((button) => {
            button.setAttribute('aria-current', button.dataset.view === name ? 'page' : 'false');
        });
        renderView();
    }

    function renderView() {
        const view = VIEWS[state.view];
        $('#bm-title').textContent = view.title;
        $('#bm-sub').textContent = view.sub;
        if (state.fatal) {
            headActions('');
            $('#bm-view').innerHTML = `<div class="bm-panel"><h2>Cannot load Backup Manager</h2><p>${esc(state.fatal)}</p><button class="bm-btn primary" data-action="retry">Retry</button></div>`;
            return;
        }
        if (state.view === 'overview') renderOverview();
        else if (state.view === 'schedules') renderSchedules();
        else if (state.view === 'restore') renderRestore();
        else if (state.view === 'activity') renderActivity();
        else renderSettings();
    }

    // ── data ───────────────────────────────────────────────────────────────
    async function loadAll() {
        const [overview, schedules, history, settings] = await Promise.all([
            api('/overview'),
            api('/schedules'),
            api('/history?limit=50'),
            api('/settings'),
        ]);
        state.overview = overview;
        state.schedules = schedules.schedules || [];
        state.history = history.items || [];
        state.settings = settings;
        state.status = overview.status || null;
        state.fatal = '';
    }

    async function boot() {
        try {
            setPill('Loading…', 'busy');
            await loadAll();
            setPill('Ready');
            setView('overview');
            scheduleTick(20_000);
        } catch (error) {
            state.fatal = loadErrorText(error);
            setPill('Unavailable', 'bad');
            renderView();
        }
    }

    function loadErrorText(error) {
        if (error?.status === 403) return 'Admin access required. Sign in with an administrator account.';
        if (error?.status === 404) return 'This EthOS version does not provide Backup Manager API v2. Update EthOS and reinstall the package.';
        return error?.detail || error?.message || String(error);
    }

    function scheduleTick(delay) {
        clearTimeout(state.timer);
        state.timer = setTimeout(tick, delay);
    }

    async function tick() {
        if (!root.isConnected) return;
        try {
            const status = await api('/status');
            await applyStatus(status);
            const busy = status.running || (status.queue || []).length > 0;
            scheduleTick(busy ? 1_500 : 20_000);
        } catch {
            scheduleTick(20_000);
        }
    }

    async function applyStatus(status) {
        state.status = status;
        const op = status.op;
        if (op) {
            state.lastOpId = op.op_id;
            const percent = typeof op.percent === 'number' ? ` · ${Math.round(op.percent)}%` : '';
            setPill(`${op.kind}${percent}`, 'busy');
            jobLine(`${op.schedule_name || ''} — ${op.detail || op.phase || 'working'}`);
            updateTask(op);
            return;
        }
        if (state.lastOpId) {
            const finished = state.lastOpId;
            state.lastOpId = null;
            let entry = null;
            try {
                const recent = await api('/history?limit=10');
                entry = (recent.items || []).find((item) => item.op_id === finished) || null;
            } catch { /* history is best-effort */ }
            finishTask(entry);
            jobLine('');
            try { await loadAll(); } catch { /* keep the last good snapshot */ }
            renderView();
        }
        const queued = (status.queue || []).length;
        setPill(queued ? `queued · ${queued}` : 'Ready', queued ? 'busy' : '');
    }

    function updateTask(op) {
        if (!ctx.progress?.startTask) {
            jobLine(`${op.schedule_name || ''} — ${op.detail || op.phase || 'working'}`);
            return;
        }
        if (!state.task) {
            state.task = ctx.progress.startTask({
                appId: 'backup-manager',
                title: 'Backup Manager',
                testIdPrefix: 'bm-job',
            });
        }
        state.task.update({
            percent: typeof op.percent === 'number' ? op.percent : null,
            detail: `${op.kind} · ${op.schedule_name || ''} — ${op.detail || op.phase || 'working'}`,
            bytesDone: op.bytes_done || 0,
            bytesTotal: op.bytes_total || 0,
            filesDone: op.files_done || 0,
            filesTotal: op.files_total || 0,
        });
    }

    function finishTask(entry) {
        if (!state.task) return;
        const status = entry?.status;
        const end = status === 'success' ? 'done'
            : status === 'cancelled' ? 'cancelled' : 'failed';
        const detail = entry
            ? `${entry.kind} ${status}${entry.error ? ` — ${entry.error}` : ''}`
            : 'Finished';
        state.task.finish(end, { detail, percent: end === 'done' ? 100 : undefined });
        state.task = null;
    }

    async function confirmDialog(title, message, okText = 'Confirm') {
        if (ctx.modal?.confirm) {
            return new Promise((resolve) => {
                ctx.modal.confirm({ title, message, okText, onConfirm: () => resolve(true), onCancel: () => resolve(false) });
            });
        }
        return Promise.resolve(window.confirm(`${title}\n\n${message}`));
    }

    async function notify(message, type = 'info') {
        if (ctx.notify) ctx.notify(message, type);
    }

    async function runOperation(path, body) {
        const response = await post(path, body);
        state.lastOpId = response.op_id || null;
        setPill('Starting…', 'busy');
        scheduleTick(1_000);
        return response;
    }

    // ── overview ───────────────────────────────────────────────────────────
    function renderOverview() {
        headActions(`<button class="bm-btn" data-action="refresh">⟳ Refresh</button>
            <button class="bm-btn primary" data-action="new-schedule">+ New backup</button>`);
        notice('');
        const summary = state.overview?.summary || {};
        const targets = state.overview?.targets || [];
        const recent = state.overview?.recent || [];
        const warn = (summary.recent_failures || summary.recent_skips)
            ? `<div class="bm-callout ${summary.recent_failures ? 'bad' : ''}">${summary.recent_failures
                ? `${summary.recent_failures} failed run(s) recorded. Open Activity for details.`
                : `${summary.recent_skips} run(s) were skipped — a destination may be offline.`}</div>`
            : '';
        const targetHtml = targets.length ? targets.map((target) => {
            const used = Number(target.backup_bytes || 0);
            const free = Number(target.free_bytes || 0);
            const total = Number(target.total_bytes || 0);
            const pct = total ? Math.min(100, Math.round(((total - free) / total) * 100)) : 0;
            return `<div class="bm-target">
                <div style="min-width:0">
                    <div class="name">${esc((target.schedules || []).join(', ') || target.path)} ${target.online ? '' : '<span class="bm-badge bad">offline</span>'}</div>
                    <div class="path">${esc(target.path)}</div>
                    <div class="meter" role="img" aria-label="${pct}% used"><i style="width:${pct}%"></i></div>
                </div>
                <div class="muted" style="text-align:right;white-space:nowrap">
                    <div>${fmtBytes(used)} protected</div>
                    <div>${fmtBytes(free)} free</div>
                </div>
            </div>`;
        }).join('') : `<div class="bm-empty"><strong>No destinations yet</strong>Create a backup to start protecting data.</div>`;

        $('#bm-view').innerHTML = `
            ${warn}
            <div class="bm-tiles">
                <div class="bm-tile"><span>Schedules</span><strong>${summary.enabled ?? 0}/${summary.schedules ?? 0}</strong><small>enabled</small></div>
                <div class="bm-tile"><span>Protected data</span><strong>${fmtBytes(summary.backup_bytes)}</strong><small>in completed snapshots</small></div>
                <div class="bm-tile"><span>Last success</span><strong>${relTime(summary.last_success_at)}</strong><small>${fmtTime(summary.last_success_at)}</small></div>
                <div class="bm-tile"><span>Next run</span><strong>${relTime(summary.next_run_at)}</strong><small>${fmtTime(summary.next_run_at)}</small></div>
            </div>
            <div class="bm-grid">
                <section class="bm-panel"><h2>Destinations</h2>${targetHtml}</section>
                <section class="bm-panel"><h2>Recent activity</h2>${historyTable(recent, true)}</section>
            </div>
            <section class="bm-panel">
                <h2>How it works</h2>
                <p>Every run creates a dated snapshot. Unchanged files are hardlinks, so keeping several restore points costs little extra space. Old generations are pruned with the 7&nbsp;daily / 4&nbsp;weekly / 6&nbsp;monthly policy.</p>
                <button class="bm-btn" data-action="new-schedule">Create your first backup</button>
            </section>`;
    }

    // ── schedules ──────────────────────────────────────────────────────────
    function renderSchedules() {
        headActions(`<button class="bm-btn" data-action="refresh">⟳ Refresh</button>
            <button class="bm-btn primary" data-action="new-schedule">+ New backup</button>`);
        notice('');
        if (state.form) { renderForm(); return; }
        const rows = state.schedules.map((schedule) => `
            <tr>
                <td><strong>${esc(schedule.name)}</strong><div class="muted">${schedule.type === 'docker-compose' ? '🐳 Docker projects' : '📁 Folder'} · ${retentionText(schedule.retention)}</div></td>
                <td><div class="bm-code">${esc(schedule.source)}</div><div class="muted">→ ${esc(schedule.destination)}</div></td>
                <td>${esc(cronText(schedule.cron))}<div class="muted">next ${relTime(schedule.next_run)}</div></td>
                <td>${badge(schedule.last_status || 'never')}<div class="muted">${relTime(schedule.last_run_at)}</div></td>
                <td><div class="bm-row-actions">
                    <button class="bm-btn small" data-action="run" data-id="${esc(schedule.id)}">▶ Run</button>
                    <button class="bm-btn small" data-action="gens" data-id="${esc(schedule.id)}">↩ Restore</button>
                    <button class="bm-btn small" data-action="edit" data-id="${esc(schedule.id)}">✎</button>
                    <button class="bm-btn small danger" data-action="delete" data-id="${esc(schedule.id)}" aria-label="Delete ${esc(schedule.name)}">🗑</button>
                </div></td>
            </tr>`).join('');
        $('#bm-view').innerHTML = `<section class="bm-panel">
            <h2>Backup schedules</h2>
            ${state.schedules.length ? `<table class="bm-table">
                <thead><tr><th>Backup</th><th>Source → destination</th><th>Schedule</th><th>Last run</th><th></th></tr></thead>
                <tbody>${rows}</tbody>
            </table>` : `<div class="bm-empty"><strong>No backups yet</strong>A new backup takes three short steps: what, where, when.</div>`}
        </section>`;
    }

    function renderForm() {
        const schedule = state.form?.schedule || null;
        const defaults = state.settings || {};
        const retention = schedule?.retention || defaults.default_retention || { keep_last: 0, keep_daily: 7, keep_weekly: 4, keep_monthly: 6 };
        const options = schedule?.options || {};
        const remote = schedule?.remote || {};
        const type = schedule?.type || 'folder';
        const cron = schedule?.cron || '0 2 * * *';
        const preset = CRON_PRESETS.some(([value]) => value === cron) ? cron : 'custom';
        headActions(`<button class="bm-btn" data-action="cancel-form">Cancel</button>
            <button class="bm-btn primary" data-action="save-schedule">${schedule ? 'Save changes' : 'Create backup'}</button>`);
        notice('');
        $('#bm-view').innerHTML = `<form class="bm-form" id="bm-form" autocomplete="off">
            <section class="bm-step">
                <h3>1 · What</h3>
                <p class="hint">Protect a folder, or every running Docker Compose project inside it.</p>
                <div class="bm-fields">
                    <div class="bm-field full"><label for="bm-name">Name</label><input class="bm-input" id="bm-name" value="${esc(schedule?.name || '')}" placeholder="e.g. Drive backup" required></div>
                    <div class="bm-field"><label for="bm-type">Type</label><select class="bm-input" id="bm-type">
                        <option value="folder" ${type === 'folder' ? 'selected' : ''}>Folder</option>
                        <option value="docker-compose" ${type === 'docker-compose' ? 'selected' : ''}>Docker Compose projects</option>
                    </select></div>
                    <div class="bm-field"><label for="bm-source">${type === 'docker-compose' ? 'Folder containing compose projects' : 'Source folder'}</label>
                        <div class="row"><input class="bm-input" id="bm-source" value="${esc(schedule?.source || '')}" placeholder="/home or /mnt/…"><button type="button" class="bm-btn small" data-action="browse" data-target="bm-source">Browse…</button></div></div>
                    <div class="bm-field full bm-docker-only" ${type === 'docker-compose' ? '' : 'hidden'}><label for="bm-projects">Projects (blank = auto-detect every project under the folder)</label><input class="bm-input" id="bm-projects" value="${esc((options.projects || []).join(', '))}" placeholder="auto"></div>
                    <div class="bm-field bm-docker-only" ${type === 'docker-compose' ? '' : 'hidden'}><label for="bm-inc-volumes"><input type="checkbox" id="bm-inc-volumes" ${options.include_volumes !== false ? 'checked' : ''}> Snapshot named volumes</label></div>
                    <div class="bm-field bm-docker-only" ${type === 'docker-compose' ? '' : 'hidden'}><label for="bm-inc-images"><input type="checkbox" id="bm-inc-images" ${options.include_images !== false ? 'checked' : ''}> Export images (large)</label></div>
                    <div class="bm-field bm-docker-only" ${type === 'docker-compose' ? '' : 'hidden'}><label for="bm-quiesce"><input type="checkbox" id="bm-quiesce" ${options.quiesce ? 'checked' : ''}> Stop containers while volumes are archived</label></div>
                </div>
            </section>
            <section class="bm-step">
                <h3>2 · Where</h3>
                <p class="hint">Snapshots land in <span class="bm-code">&lt;destination&gt;/&lt;folder&gt;/snapshots/</span>.</p>
                <div class="bm-fields">
                    <div class="bm-field full"><label for="bm-dest">Destination root</label>
                        <div class="row"><input class="bm-input" id="bm-dest" value="${esc(schedule?.destination || '')}" placeholder="/mnt/Backup1"><button type="button" class="bm-btn small" data-action="browse" data-target="bm-dest">Browse…</button><button type="button" class="bm-btn small" data-action="check-dest">Check</button></div>
                        <div class="muted" id="bm-dest-note"></div></div>
                    <div class="bm-field"><label for="bm-min-free">Minimum free space (GB)</label><input class="bm-input" id="bm-min-free" type="number" min="0" value="${Number(options.min_free_gb ?? 5)}"></div>
                    <div class="bm-field"><label for="bm-skip"><input type="checkbox" id="bm-skip" ${schedule?.skip_if_missing !== false ? 'checked' : ''}> Skip cleanly when the destination is offline (USB unplugged)</label></div>
                </div>
            </section>
            <section class="bm-step">
                <h3>3 · When</h3>
                <div class="bm-fields">
                    <div class="bm-field"><label for="bm-cron-preset">Schedule</label><select class="bm-input" id="bm-cron-preset">
                        ${CRON_PRESETS.map(([value, label]) => `<option value="${esc(value)}" ${preset === value ? 'selected' : ''}>${esc(label)}</option>`).join('')}
                    </select></div>
                    <div class="bm-field" id="bm-cron-custom-wrap" ${preset === 'custom' ? '' : 'hidden'}><label for="bm-cron-custom">Cron expression</label><input class="bm-input" id="bm-cron-custom" value="${esc(preset === 'custom' ? cron : '')}" placeholder="0 2 * * *"></div>
                </div>
            </section>
            <section class="bm-step">
                <h3>Advanced</h3>
                <div class="bm-fields">
                    <div class="bm-field full"><label for="bm-exclude">Exclude patterns (comma separated)</label><input class="bm-input" id="bm-exclude" value="${esc((options.exclude || []).join(', '))}" placeholder="*.tmp, cache/"></div>
                    <div class="bm-field"><label for="bm-exclude-defaults"><input type="checkbox" id="bm-exclude-defaults" ${options.exclude_defaults !== false ? 'checked' : ''}> Skip system folders (#recycle, @eaDir, lost+found)</label></div>
                    <div class="bm-field"><label for="bm-acls"><input type="checkbox" id="bm-acls" ${options.preserve_acls !== false ? 'checked' : ''}> Preserve ACLs</label></div>
                    <div class="bm-field"><label for="bm-verify">Verify after each run</label><select class="bm-input" id="bm-verify">
                        <option value="quick" ${schedule?.verify_after_run !== 'off' ? 'selected' : ''}>Quick (size + mtime)</option>
                        <option value="off" ${schedule?.verify_after_run === 'off' ? 'selected' : ''}>Off</option>
                    </select></div>
                    <div class="bm-field full"><label>Retention</label><div class="bm-fields">
                        <div class="bm-field"><label for="bm-keep-last">Keep last</label><input class="bm-input" id="bm-keep-last" type="number" min="0" max="365" value="${Number(retention.keep_last || 0)}"></div>
                        <div class="bm-field"><label for="bm-keep-daily">Keep daily</label><input class="bm-input" id="bm-keep-daily" type="number" min="0" max="365" value="${Number(retention.keep_daily || 0)}"></div>
                        <div class="bm-field"><label for="bm-keep-weekly">Keep weekly</label><input class="bm-input" id="bm-keep-weekly" type="number" min="0" max="365" value="${Number(retention.keep_weekly || 0)}"></div>
                        <div class="bm-field"><label for="bm-keep-monthly">Keep monthly</label><input class="bm-input" id="bm-keep-monthly" type="number" min="0" max="365" value="${Number(retention.keep_monthly || 0)}"></div>
                    </div></div>
                    <div class="bm-field full"><label for="bm-remote-enabled"><input type="checkbox" id="bm-remote-enabled" ${remote.enabled ? 'checked' : ''}> Copy the newest generation to an rclone remote</label></div>
                    <div class="bm-field bm-remote-only" ${remote.enabled ? '' : 'hidden'}><label for="bm-remote-name">Remote name</label><input class="bm-input" id="bm-remote-name" value="${esc(remote.remote || '')}" placeholder="gdrive"></div>
                    <div class="bm-field bm-remote-only" ${remote.enabled ? '' : 'hidden'}><label for="bm-remote-path">Remote path</label><input class="bm-input" id="bm-remote-path" value="${esc(remote.path || '')}" placeholder="ethos-backups"></div>
                    <div class="bm-field bm-remote-only" ${remote.enabled ? '' : 'hidden'}><label for="bm-remote-keep">Remote history (days)</label><input class="bm-input" id="bm-remote-keep" type="number" min="1" max="3650" value="${Number(remote.keep_days || 30)}"></div>
                    <div class="bm-field bm-remote-only" ${remote.enabled ? '' : 'hidden'}><label for="bm-remote-bw">Bandwidth limit (optional)</label><input class="bm-input" id="bm-remote-bw" value="${esc(remote.bwlimit || '')}" placeholder="10M"></div>
                </div>
            </section>
            <div class="bm-error" id="bm-form-error" role="alert"></div>
            <div class="bm-foot">
                <button type="button" class="bm-btn" data-action="dry-run-form">Dry run</button>
                <button type="button" class="bm-btn" data-action="cancel-form">Cancel</button>
                <button type="button" class="bm-btn primary" data-action="save-schedule">${schedule ? 'Save changes' : 'Create backup'}</button>
            </div>
        </form>`;
    }

    function readForm() {
        const name = $('#bm-name')?.value.trim() || '';
        const type = $('#bm-type')?.value || 'folder';
        const source = $('#bm-source')?.value.trim() || '';
        const destination = $('#bm-dest')?.value.trim() || '';
        const preset = $('#bm-cron-preset')?.value || '0 2 * * *';
        const cron = preset === 'custom' ? ($('#bm-cron-custom')?.value.trim() || '') : preset;
        const projectsText = $('#bm-projects')?.value.trim() || '';
        const excludeText = $('#bm-exclude')?.value.trim() || '';
        const remote = {
            enabled: Boolean($('#bm-remote-enabled')?.checked),
            remote: $('#bm-remote-name')?.value.trim() || '',
            path: $('#bm-remote-path')?.value.trim() || '',
            keep_days: Number($('#bm-remote-keep')?.value || 30),
            bwlimit: $('#bm-remote-bw')?.value.trim() || '',
        };
        return {
            name, type, source, destination, cron, remote,
            enabled: true,
            options: {
                exclude: excludeText ? excludeText.split(',').map((item) => item.trim()).filter(Boolean) : [],
                exclude_defaults: Boolean($('#bm-exclude-defaults')?.checked),
                preserve_acls: Boolean($('#bm-acls')?.checked),
                min_free_gb: Number($('#bm-min-free')?.value || 0),
                projects: projectsText ? projectsText.split(',').map((item) => item.trim()).filter(Boolean) : null,
                include_volumes: Boolean($('#bm-inc-volumes')?.checked),
                include_images: Boolean($('#bm-inc-images')?.checked),
                quiesce: Boolean($('#bm-quiesce')?.checked),
            },
            retention: {
                keep_last: Number($('#bm-keep-last')?.value || 0),
                keep_daily: Number($('#bm-keep-daily')?.value || 0),
                keep_weekly: Number($('#bm-keep-weekly')?.value || 0),
                keep_monthly: Number($('#bm-keep-monthly')?.value || 0),
            },
            verify_after_run: $('#bm-verify')?.value || 'quick',
            skip_if_missing: Boolean($('#bm-skip')?.checked),
        };
    }

    async function saveSchedule() {
        const errorBox = $('#bm-form-error');
        try {
            const payload = readForm();
            if (!payload.name) throw new Error('Name is required');
            if (!payload.source) throw new Error('Choose what to protect');
            if (!payload.destination) throw new Error('Choose a destination folder');
            if (!payload.cron) throw new Error('Choose a schedule');
            const existing = state.form?.schedule;
            if (existing) await api(`/schedules/${encodeURIComponent(existing.id)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            else await post('/schedules', payload);
            state.form = null;
            await loadAll();
            setView('schedules');
            notify(existing ? 'Backup schedule updated' : 'Backup schedule created', 'success');
        } catch (error) {
            if (errorBox) errorBox.textContent = error?.detail && typeof error.detail === 'string'
                ? error.detail : (error?.message || String(error));
        }
    }

    // ── restore ────────────────────────────────────────────────────────────
    function renderRestore() {
        headActions(`<button class="bm-btn" data-action="refresh">⟳ Refresh</button>`);
        notice('');
        if (!state.restoreScheduleId && state.schedules.length) {
            state.restoreScheduleId = state.schedules[0].id;
        }
        const options = state.schedules.map((schedule) => `<option value="${esc(schedule.id)}" ${schedule.id === state.restoreScheduleId ? 'selected' : ''}>${esc(schedule.name)}</option>`).join('');
        const selected = state.schedules.find((schedule) => schedule.id === state.restoreScheduleId);
        const generations = state.generations || [];
        const list = generations.length ? generations.map((generation) => {
            const when = generation.created_at || generation.generation;
            return `<div class="bm-gen">
                <div>${generation.status === 'complete' || generation.status === 'legacy' ? '🗂️' : '⚠️'}</div>
                <div>
                    <div class="when">${esc(fmtTime(when))} ${badge(generation.status)}${generation.legacy ? ' <span class="bm-badge info">legacy</span>' : ''}</div>
                    <div class="meta">${esc(generation.generation)} · ${fmtBytes(generation.size_bytes)} · ${generation.files_total || 0} file(s)${generation.verified?.status ? ` · verified: ${esc(generation.verified.status)}` : ''}${generation.remote?.status ? ` · remote: ${esc(generation.remote.status)}` : ''}</div>
                </div>
                <div class="bm-row-actions">
                    <button class="bm-btn small" data-action="verify" data-id="${esc(state.restoreScheduleId)}" data-gen="${esc(generation.generation)}">Verify</button>
                    <button class="bm-btn small" data-action="restore-pick" data-gen="${esc(generation.generation)}">Restore…</button>
                    <button class="bm-btn small" data-action="open-folder" data-path="${esc(state.genTarget)}">Open</button>
                </div>
            </div>`;
        }).join('') : `<div class="bm-empty"><strong>No generations yet</strong>Run the backup once, then it appears here.</div>`;

        const pick = state.restore.generation;
        const restorePanel = pick ? `<section class="bm-panel">
            <h2>Restore generation ${esc(pick)}</h2>
            <div class="bm-fields">
                <div class="bm-field"><label for="bm-restore-mode">Put the data back</label><select class="bm-input" id="bm-restore-mode">
                    <option value="in_place" ${state.restore.mode === 'in_place' ? 'selected' : ''}>To the original location</option>
                    <option value="to_folder" ${state.restore.mode === 'to_folder' ? 'selected' : ''}>To another folder</option>
                </select></div>
                <div class="bm-field" id="bm-restore-target-wrap" ${state.restore.mode === 'to_folder' ? '' : 'hidden'}><label for="bm-restore-target">Folder</label>
                    <div class="row"><input class="bm-input" id="bm-restore-target" value="${esc(state.restore.target || '')}" placeholder="/mnt/restore-test"><button type="button" class="bm-btn small" data-action="browse" data-target="bm-restore-target">Browse…</button></div></div>
                <div class="bm-field"><label for="bm-restore-delete"><input type="checkbox" id="bm-restore-delete" ${state.restore.delete_extra ? 'checked' : ''}> Make an exact copy (delete extra files)</label></div>
            </div>
            <p class="muted">In-place restores automatically create a <em>pre-restore</em> snapshot first. Docker projects have their containers stopped and started again.</p>
            <div class="bm-foot">
                <button class="bm-btn" data-action="restore-cancel">Cancel</button>
                <button class="bm-btn primary" data-action="restore-submit" data-id="${esc(state.restoreScheduleId)}" data-gen="${esc(pick)}">Restore</button>
            </div>
        </section>` : '';

        $('#bm-view').innerHTML = `
            <section class="bm-panel">
                <h2>Choose a backup</h2>
                <div class="bm-fields">
                    <div class="bm-field full"><label for="bm-restore-schedule">Schedule</label>
                        <select class="bm-input" id="bm-restore-schedule">${options || '<option value="">No schedules</option>'}</select></div>
                </div>
                <p class="muted">${selected ? esc(selected.source) + ' → ' + esc(selected.destination) : ''}</p>
            </section>
            <section class="bm-panel"><h2>Generations</h2>${list}</section>
            ${restorePanel}`;
        if (state.restoreScheduleId && state.genLoadedFor !== state.restoreScheduleId) {
            state.genLoadedFor = state.restoreScheduleId;
            window.setTimeout(() => loadGenerations(state.restoreScheduleId), 0);
        }
    }

    async function loadGenerations(scheduleId) {
        if (!scheduleId) return;
        state.restoreScheduleId = scheduleId;
        state.genLoadedFor = scheduleId;
        state.restore.generation = '';
        try {
            const data = await api(`/schedules/${encodeURIComponent(scheduleId)}/generations`);
            state.generations = data.generations || [];
            state.genTarget = data.target || '';
            if (data.migrated) notify(`Migrated the old backup layout into generation ${data.migrated}`, 'info');
        } catch (error) {
            state.generations = [];
            state.genTarget = '';
            notify(loadErrorText(error), 'error');
        }
        renderView();
    }

    // ── activity ───────────────────────────────────────────────────────────
    function renderActivity() {
        headActions(`<button class="bm-btn" data-action="refresh">⟳ Refresh</button>`);
        notice('');
        $('#bm-view').innerHTML = `<section class="bm-panel">
            <h2>Run history</h2>
            ${historyTable(state.history, false)}
        </section>`;
    }

    function historyTable(items, compact) {
        if (!items || !items.length) {
            return `<div class="bm-empty"><strong>No runs recorded</strong>Activity appears here after the first backup.</div>`;
        }
        const rows = items.map((item) => `<tr>
            <td>${badge(item.status)}<div class="muted">${esc(item.kind || 'backup')} · ${esc(item.trigger || 'manual')}</div></td>
            <td><strong>${esc(item.schedule_name || item.schedule_id)}</strong>${compact ? '' : `<div class="muted bm-code">${esc(item.generation || '')}</div>`}</td>
            <td>${relTime(item.finished_at)}<div class="muted">${fmtTime(item.finished_at)}</div></td>
            <td>${fmtDuration(item.duration_seconds)}<div class="muted">${fmtBytes(item.bytes_total)}</div></td>
            ${compact ? '' : `<td class="muted">${esc(item.error || item.remote_status || '')}</td>`}
        </tr>`).join('');
        return `<table class="bm-table">
            <thead><tr><th>Result</th><th>Backup</th><th>Finished</th><th>Duration / size</th>${compact ? '' : '<th>Details</th>'}</tr></thead>
            <tbody>${rows}</tbody>
        </table>`;
    }

    // ── settings ───────────────────────────────────────────────────────────
    function renderSettings() {
        headActions(`<button class="bm-btn primary" data-action="save-settings">Save defaults</button>`);
        notice('');
        const settings = state.settings || {};
        const retention = settings.default_retention || { keep_last: 0, keep_daily: 7, keep_weekly: 4, keep_monthly: 6 };
        $('#bm-view').innerHTML = `
            <section class="bm-panel">
                <h2>New-schedule defaults</h2>
                <div class="bm-fields">
                    <div class="bm-field"><label for="bm-def-last">Keep last</label><input class="bm-input" id="bm-def-last" type="number" min="0" max="365" value="${Number(retention.keep_last || 0)}"></div>
                    <div class="bm-field"><label for="bm-def-daily">Keep daily</label><input class="bm-input" id="bm-def-daily" type="number" min="0" max="365" value="${Number(retention.keep_daily || 0)}"></div>
                    <div class="bm-field"><label for="bm-def-weekly">Keep weekly</label><input class="bm-input" id="bm-def-weekly" type="number" min="0" max="365" value="${Number(retention.keep_weekly || 0)}"></div>
                    <div class="bm-field"><label for="bm-def-monthly">Keep monthly</label><input class="bm-input" id="bm-def-monthly" type="number" min="0" max="365" value="${Number(retention.keep_monthly || 0)}"></div>
                    <div class="bm-field"><label for="bm-def-verify">Verify after each run</label><select class="bm-input" id="bm-def-verify">
                        <option value="quick" ${settings.verify_after_run !== 'off' ? 'selected' : ''}>Quick</option>
                        <option value="off" ${settings.verify_after_run === 'off' ? 'selected' : ''}>Off</option>
                    </select></div>
                    <div class="bm-field"><label for="bm-def-digest"><input type="checkbox" id="bm-def-digest" ${settings.digest_enabled !== false ? 'checked' : ''}> Weekly health report</label></div>
                    <div class="bm-field"><label for="bm-def-weekday">Report day</label><select class="bm-input" id="bm-def-weekday">
                        ${WEEKDAYS.map((name, index) => `<option value="${index}" ${Number(settings.digest_weekday || 0) === index ? 'selected' : ''}>${name}</option>`).join('')}
                    </select></div>
                    <div class="bm-field"><label for="bm-def-hour">Report hour</label><input class="bm-input" id="bm-def-hour" type="number" min="0" max="23" value="${Number(settings.digest_hour ?? 8)}"></div>
                </div>
            </section>
            <section class="bm-panel">
                <h2>Offsite remotes (rclone)</h2>
                <p>Remotes are configured outside EthOS with <span class="bm-code">sudo -u ethos-nas rclone config</span>. Credentials never pass through the API.</p>
                <div id="bm-remotes" class="muted">Loading…</div>
            </section>
            <section class="bm-panel">
                <h2>Package</h2>
                <p><strong>${esc(ctx.pkg?.name || 'EthOS Backup Manager')}</strong> v${esc(ctx.pkg?.version || '1.0.0')} · API v2 · rsync hardlink engine</p>
                <p class="muted">The engine and schedules live in EthOS core. Removing the package hides this window; scheduled backups keep running.</p>
            </section>`;
        loadRemotes();
    }

    async function loadRemotes() {
        const box = $('#bm-remotes');
        if (!box) return;
        try {
            const data = await api('/remotes');
            if (!data.available) {
                box.innerHTML = `<div class="bm-callout">${esc(data.detail || 'rclone is not available')}</div>`;
                return;
            }
            if (!(data.remotes || []).length) {
                box.innerHTML = '<p>No rclone remotes configured yet.</p>';
                return;
            }
            box.innerHTML = data.remotes.map((remote) => `<div class="bm-target">
                <div><div class="name">${esc(remote.name)}: <span class="bm-badge">${esc(remote.type || 'remote')}</span></div></div>
                <button class="bm-btn small" data-action="test-remote" data-remote="${esc(remote.name)}">Test</button>
            </div>`).join('');
        } catch (error) {
            box.innerHTML = `<div class="bm-callout bad">${esc(loadErrorText(error))}</div>`;
        }
    }

    async function saveSettings() {
        try {
            const payload = {
                default_retention: {
                    keep_last: Number($('#bm-def-last')?.value || 0),
                    keep_daily: Number($('#bm-def-daily')?.value || 0),
                    keep_weekly: Number($('#bm-def-weekly')?.value || 0),
                    keep_monthly: Number($('#bm-def-monthly')?.value || 0),
                },
                verify_after_run: $('#bm-def-verify')?.value || 'quick',
                digest_enabled: Boolean($('#bm-def-digest')?.checked),
                digest_weekday: Number($('#bm-def-weekday')?.value || 0),
                digest_hour: Number($('#bm-def-hour')?.value || 8),
            };
            const result = await api('/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            state.settings = result.settings;
            notify('Defaults saved', 'success');
        } catch (error) {
            notify(loadErrorText(error), 'error');
        }
    }

    function openFolder(path) {
        if (!path) return;
        try {
            if (typeof window.openApp === 'function') window.openApp('files');
            if (typeof window.fmNavigateTo === 'function') {
                window.setTimeout(() => { try { window.fmNavigateTo(path); } catch { /* best effort */ } }, 300);
            }
        } catch {
            notify(`Open File Station and go to ${path}`, 'info');
        }
    }

    // ── events ─────────────────────────────────────────────────────────────
    async function onClick(event) {
        const nav = event.target.closest('[data-view]');
        if (nav) {
            setView(nav.dataset.view);
            return;
        }
        const button = event.target.closest('[data-action]');
        if (!button) return;
        const action = button.dataset.action;
        const scheduleId = button.dataset.id;
        try {
            if (action === 'retry') { await boot(); return; }
            if (action === 'refresh') {
                await loadAll();
                renderView();
                return;
            }
            if (action === 'new-schedule') { state.form = { schedule: null }; setView('schedules'); return; }
            if (action === 'edit') {
                const schedule = state.schedules.find((item) => item.id === scheduleId);
                if (schedule) { state.form = { schedule }; setView('schedules'); }
                return;
            }
            if (action === 'cancel-form') { state.form = null; renderView(); return; }
            if (action === 'save-schedule') { await saveSchedule(); return; }
            if (action === 'run') {
                await runOperation(`/schedules/${encodeURIComponent(scheduleId)}/run`);
                notify('Backup queued', 'success');
                return;
            }
            if (action === 'gens') {
                state.view = 'restore';
                setView('restore');
                await loadGenerations(scheduleId);
                return;
            }
            if (action === 'delete') {
                const schedule = state.schedules.find((item) => item.id === scheduleId);
                const ok = await confirmDialog('Delete backup schedule?',
                    `“${schedule?.name || scheduleId}” will stop running. Existing snapshots stay on disk.`, 'Delete');
                if (!ok) return;
                await api(`/schedules/${encodeURIComponent(scheduleId)}`, { method: 'DELETE' });
                await loadAll();
                renderView();
                notify('Backup schedule deleted', 'success');
                return;
            }
            if (action === 'browse') {
                const targetId = button.dataset.target;
                const input = root.querySelector(`#${targetId}`);
                const picked = await srcPick(input?.value || '');
                if (picked && input) input.value = picked;
                return;
            }
            if (action === 'dry-run-form') {
                const existing = state.form?.schedule;
                if (!existing) { notify('Save the schedule first, then run a dry run', 'info'); return; }
                await runOperation(`/schedules/${encodeURIComponent(existing.id)}/dry-run`);
                notify('Dry run queued', 'info');
                return;
            }
            if (action === 'check-dest') {
                const path = $('#bm-dest')?.value.trim();
                const note = $('#bm-dest-note');
                if (!path || !note) return;
                const check = await api(`/destinations/check?path=${encodeURIComponent(path)}`);
                note.textContent = check.exists
                    ? `${check.writable ? 'Writable' : 'Not writable'} · ${fmtBytes(check.free_bytes)} free of ${fmtBytes(check.total_bytes)}${check.is_mount ? ' · mounted' : ''}${check.hardlinks ? ' · snapshots supported' : ' · hardlinks unavailable'}`
                    : (check.error || 'Folder does not exist');
                return;
            }
            if (action === 'cancel-op') {
                await post('/cancel', {});
                notify('Cancellation requested', 'info');
                return;
            }
            if (action === 'verify') {
                const generation = button.dataset.gen;
                await post(`/schedules/${encodeURIComponent(scheduleId)}/generations/${encodeURIComponent(generation)}/verify`, { deep: false });
                notify('Verify queued', 'info');
                return;
            }
            if (action === 'restore-pick') {
                state.restore.generation = button.dataset.gen;
                state.restore.mode = 'in_place';
                renderView();
                return;
            }
            if (action === 'restore-cancel') {
                state.restore.generation = '';
                renderView();
                return;
            }
            if (action === 'restore-submit') {
                const mode = $('#bm-restore-mode')?.value || 'in_place';
                const target = $('#bm-restore-target')?.value.trim() || '';
                const deleteExtra = Boolean($('#bm-restore-delete')?.checked);
                if (mode === 'to_folder' && !target) throw new Error('Choose a restore folder');
                const message = mode === 'in_place'
                    ? 'The current data is snapshotted first, then overwritten with this generation. Continue?'
                    : `The generation will be copied into ${target}. Continue?`;
                const ok = await confirmDialog('Restore backup?', message, 'Restore');
                if (!ok) return;
                await runOperation(`/schedules/${encodeURIComponent(scheduleId)}/restore`, {
                    generation: button.dataset.gen,
                    mode,
                    target: mode === 'to_folder' ? target : null,
                    delete_extra: deleteExtra,
                });
                notify('Restore queued', 'info');
                return;
            }
            if (action === 'open-folder') { openFolder(button.dataset.path || state.genTarget); return; }
            if (action === 'test-remote') {
                const remote = button.dataset.remote;
                const result = await post('/remotes/test', { remote });
                notify(result.ok ? `${remote}: reachable` : `${remote}: ${result.detail}`, result.ok ? 'success' : 'error');
                return;
            }
            if (action === 'save-settings') { await saveSettings(); return; }
        } catch (error) {
            notify(loadErrorText(error), 'error');
        }
    }

    function srcPick(startPath) {
        if (typeof ctx.pickFolder !== 'function') return Promise.resolve('');
        return ctx.pickFolder({
            title: 'Choose folder',
            startPath: startPath || '/mnt',
            roots: ['/home', '/mnt', '/media'],
            acceptLabel: 'Use this folder',
        }).catch(() => '');
    }

    function onChange(event) {
        const target = event.target;
        if (target.id === 'bm-type') {
            const docker = target.value === 'docker-compose';
            root.querySelectorAll('.bm-docker-only').forEach((element) => { element.hidden = !docker; });
            const label = root.querySelector('label[for="bm-source"]');
            if (label) label.textContent = docker ? 'Folder containing compose projects' : 'Source folder';
            return;
        }
        if (target.id === 'bm-cron-preset') {
            const wrap = $('#bm-cron-custom-wrap');
            if (wrap) wrap.hidden = target.value !== 'custom';
            return;
        }
        if (target.id === 'bm-remote-enabled') {
            root.querySelectorAll('.bm-remote-only').forEach((element) => { element.hidden = !target.checked; });
            return;
        }
        if (target.id === 'bm-restore-schedule') {
            loadGenerations(target.value);
            return;
        }
        if (target.id === 'bm-restore-mode') {
            const wrap = $('#bm-restore-target-wrap');
            if (wrap) wrap.hidden = target.value !== 'to_folder';
        }
    }

    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    await boot();
    return () => {
        clearTimeout(state.timer);
        root.removeEventListener('click', onClick);
        root.removeEventListener('change', onChange);
    };
}
