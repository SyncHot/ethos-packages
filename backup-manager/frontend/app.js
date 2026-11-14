// EthOS native package UI — EthOS Backup Manager
// Contract: export function render(container, ctx). The engine lives in EthOS
// core; this module only calls /api/backup/* through ctx.apiFetch.
//
// Visual contract: same shell as EthOS AntiVirus / Domains / VMM — 218 px rail,
// tokens from the package-theme skill, panels, summary tiles, tables, tags.

const STYLE = `
.bm-root {
    color-scheme: light;
    --bm-bg: #eef2f7;
    --bm-side-bg: rgba(255, 255, 255, 0.88);
    --bm-panel: #ffffff;
    --bm-surface: #f4f5f7;
    --bm-input-bg: #ffffff;
    --bm-border: #e3e5e8;
    --bm-text: #1f2430;
    --bm-muted: #5b6472;
    --bm-accent: #2563eb;
    --bm-accent-soft: rgba(37, 99, 235, 0.10);
    --bm-accent-border: rgba(37, 99, 235, 0.45);
    --bm-green: #15803d;
    --bm-green-soft: rgba(21, 128, 61, 0.12);
    --bm-green-border: rgba(21, 128, 61, 0.35);
    --bm-red: #b91c1c;
    --bm-red-soft: rgba(185, 28, 28, 0.08);
    --bm-red-border: rgba(185, 28, 28, 0.32);
    --bm-amber: #b45309;
    --bm-amber-soft: rgba(180, 83, 9, 0.10);
    --bm-amber-border: rgba(180, 83, 9, 0.30);
    --bm-hover: rgba(15, 23, 42, 0.06);
    --bm-tag-bg: rgba(37, 99, 235, 0.08);
    --bm-tag-border: rgba(37, 99, 235, 0.28);
    --bm-tag-text: #1e40af;
    --bm-glow-1: rgba(37, 99, 235, 0.08);
    --bm-glow-2: rgba(21, 128, 61, 0.06);
    display: flex;
    height: 100%;
    overflow: hidden;
    background:
        radial-gradient(circle at 8% 4%, var(--bm-glow-1), transparent 40%),
        radial-gradient(circle at 92% 96%, var(--bm-glow-2), transparent 40%),
        var(--bm-bg);
    color: var(--bm-text);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
:root.dark .bm-root {
    color-scheme: dark;
    --bm-bg: #08111d;
    --bm-side-bg: rgba(2, 6, 23, 0.45);
    --bm-panel: rgba(148, 163, 184, 0.07);
    --bm-surface: rgba(15, 23, 42, 0.45);
    --bm-input-bg: rgba(2, 6, 23, 0.55);
    --bm-border: rgba(148, 163, 184, 0.22);
    --bm-text: #e2e8f0;
    --bm-muted: #94a3b8;
    --bm-accent: #38bdf8;
    --bm-accent-soft: rgba(56, 189, 248, 0.14);
    --bm-accent-border: rgba(56, 189, 248, 0.55);
    --bm-green: #4ade80;
    --bm-green-soft: rgba(74, 222, 128, 0.14);
    --bm-green-border: rgba(74, 222, 128, 0.45);
    --bm-red: #f87171;
    --bm-red-soft: rgba(248, 113, 113, 0.12);
    --bm-red-border: rgba(248, 113, 113, 0.45);
    --bm-amber: #fbbf24;
    --bm-amber-soft: rgba(251, 191, 36, 0.10);
    --bm-amber-border: rgba(251, 191, 36, 0.45);
    --bm-hover: rgba(148, 163, 184, 0.09);
    --bm-tag-bg: rgba(56, 189, 248, 0.10);
    --bm-tag-border: rgba(56, 189, 248, 0.25);
    --bm-tag-text: #bae6fd;
    --bm-glow-1: rgba(56, 189, 248, 0.16);
    --bm-glow-2: rgba(74, 222, 128, 0.10);
}
.bm-root, .bm-root * { box-sizing: border-box; }
.bm-root [hidden] { display: none !important; }
.bm-root button, .bm-root input, .bm-root select { font-family: inherit; }
.bm-side {
    flex: none; width: 218px; display: flex; flex-direction: column; gap: 16px;
    padding: 20px 14px; border-right: 1px solid var(--bm-border);
    background: var(--bm-side-bg); overflow-y: auto;
}
.bm-brand { display: flex; align-items: center; gap: 10px; padding: 0 8px; }
.bm-brand-icon { font-size: 26px; line-height: 1; }
.bm-brand strong { display: block; font-size: 14px; letter-spacing: -0.01em; }
.bm-brand small { display: block; color: var(--bm-muted); font-size: 10px; }
.bm-nav { display: flex; flex-direction: column; gap: 2px; }
.bm-nav-item {
    display: block; width: 100%; padding: 9px 11px; border: 0; border-radius: 9px;
    background: transparent; color: var(--bm-muted); font-size: 12px; font-weight: 600;
    text-align: left; cursor: pointer;
}
.bm-nav-item:hover { background: var(--bm-hover); color: var(--bm-text); }
.bm-nav-item.is-active { background: var(--bm-accent-soft); color: var(--bm-text); }
.bm-nav-item:focus-visible { outline: 2px solid var(--bm-accent); outline-offset: 1px; }
.bm-side-foot { margin-top: auto; display: flex; flex-direction: column; gap: 8px; padding: 0 8px; }
.bm-side-note { color: var(--bm-muted); font-size: 10px; line-height: 1.6; }
.bm-main { flex: 1; min-width: 0; overflow-y: auto; padding: 24px 28px 32px; }
.bm-main h1 { margin: 0; font-size: clamp(22px, 3.4vw, 30px); letter-spacing: -0.02em; }
.bm-page-sub { margin: 4px 0 0; color: var(--bm-muted); font-size: 12px; line-height: 1.5; }
.bm-pill { align-self: flex-start; padding: 5px 10px; border-radius: 999px; font-size: 10px; font-weight: 700; border: 1px solid var(--bm-border); white-space: nowrap; }
.bm-pill.ready { color: var(--bm-green); border-color: var(--bm-green-border); background: var(--bm-green-soft); }
.bm-pill.starting { color: var(--bm-amber); border-color: var(--bm-amber-border); background: var(--bm-amber-soft); }
.bm-pill.offline { color: var(--bm-red); border-color: var(--bm-red-border); background: var(--bm-red-soft); }
.bm-status { min-height: 18px; margin: 12px 0 0; color: var(--bm-accent); font-size: 12px; font-weight: 600; }
.bm-status.error { color: var(--bm-red); }
.bm-status.warn { color: var(--bm-amber); }
.bm-startup { margin: 10px 0 0; padding: 9px 11px; border: 1px solid var(--bm-amber-border); border-radius: 9px; background: var(--bm-amber-soft); color: var(--bm-muted); font-size: 11px; line-height: 1.55; }
.bm-startup.error { border-color: var(--bm-red-border); background: var(--bm-red-soft); }
.bm-startup.info { border-color: var(--bm-accent-border); background: var(--bm-accent-soft); }
.bm-view { display: flex; flex-direction: column; gap: 14px; margin-top: 16px; }
.bm-panel { padding: 17px 18px; border: 1px solid var(--bm-border); border-radius: 15px; background: var(--bm-panel); }
.bm-panel h2 { margin: 0 0 3px; font-size: 13px; }
.bm-muted { margin: 0; color: var(--bm-muted); font-size: 11px; line-height: 1.55; }
.bm-ready { display: flex; align-items: center; gap: 14px; }
.bm-check { flex: none; width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; background: var(--bm-green-soft); color: var(--bm-green); font-size: 17px; font-weight: 700; }
.bm-check.waiting { background: var(--bm-amber-soft); color: var(--bm-amber); }
.bm-label { display: block; margin-bottom: 7px; font-size: 10px; letter-spacing: 0.09em; text-transform: uppercase; color: var(--bm-muted); }
.bm-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.bm-input {
    flex: 1; min-width: 0; padding: 9px 11px;
    border: 1px solid var(--bm-border); border-radius: 9px;
    background: var(--bm-input-bg); color: var(--bm-text);
    font: 12px ui-monospace, SFMono-Regular, Menlo, monospace;
}
.bm-input:focus-visible, .bm-btn:focus-visible { outline: 2px solid var(--bm-accent); outline-offset: 2px; }
.bm-btn {
    padding: 8px 13px; border: 1px solid var(--bm-border); border-radius: 9px;
    background: var(--bm-surface); color: var(--bm-text);
    font-size: 11px; font-weight: 600; cursor: pointer;
}
.bm-btn:hover:not(:disabled) { border-color: var(--bm-accent); }
.bm-btn:disabled { opacity: 0.5; cursor: wait; }
.bm-btn.primary { border-color: var(--bm-accent-border); background: var(--bm-accent-soft); }
.bm-btn.danger { border-color: var(--bm-red-border); color: var(--bm-red); }
.bm-btn.small { padding: 4px 9px; font-size: 10px; font-family: ui-monospace, monospace; }
.bm-hint { margin: 8px 0 0; color: var(--bm-muted); font-size: 10px; line-height: 1.5; }
.bm-root code { color: var(--bm-accent); font-family: ui-monospace, monospace; }
.bm-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 9px; }
.bm-summary div { padding: 11px; border: 1px solid var(--bm-border); border-radius: 10px; background: var(--bm-surface); }
.bm-summary span { display: block; font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--bm-muted); margin-bottom: 4px; }
.bm-summary strong { font-size: 20px; font-variant-numeric: tabular-nums; }
.bm-toolbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.bm-toolbar > div { min-width: 0; }
.bm-table { width: 100%; border-collapse: collapse; font-size: 11px; }
.bm-table th, .bm-table td { text-align: left; padding: 8px 9px; border-bottom: 1px solid var(--bm-border); vertical-align: top; }
.bm-table th { color: var(--bm-muted); font-size: 9px; letter-spacing: 0.08em; text-transform: uppercase; white-space: nowrap; }
.bm-table tbody tr:last-child td { border-bottom: 0; }
.bm-table td.path { font-family: ui-monospace, monospace; word-break: break-all; }
.bm-table td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.bm-table td.actions { text-align: right; white-space: nowrap; }
.bm-scroll { overflow-x: auto; margin-top: 12px; }
.bm-empty { margin-top: 12px; padding: 24px; text-align: center; color: var(--bm-muted); font-size: 11px; border: 1px dashed var(--bm-border); border-radius: 11px; }
.bm-empty strong { display: block; color: var(--bm-text); margin-bottom: 4px; }
.bm-field { display: flex; flex-direction: column; gap: 6px; margin-top: 14px; }
.bm-field:first-of-type { margin-top: 8px; }
.bm-field > label { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--bm-muted); }
.bm-field > label.bm-checkline { text-transform: none; letter-spacing: 0; color: var(--bm-text); font-size: 12px; font-weight: 400; }
.bm-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; }
.bm-fields .bm-field.full { grid-column: 1 / -1; }
.bm-radio {
    display: flex; align-items: flex-start; gap: 9px; margin-top: 8px;
    padding: 10px 12px; border: 1px solid var(--bm-border); border-radius: 10px;
    background: var(--bm-surface); font-size: 12px; cursor: pointer;
}
.bm-radio input { margin: 2px 0 0; accent-color: var(--bm-accent); }
.bm-radio small, .bm-checkline small { display: block; margin-top: 2px; color: var(--bm-muted); font-size: 10px; line-height: 1.45; }
.bm-checkline { display: flex; align-items: flex-start; gap: 9px; margin-top: 12px; font-size: 12px; cursor: pointer; }
.bm-checkline input { margin: 2px 0 0; accent-color: var(--bm-accent); }
.bm-tag { display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px; border-radius: 999px; border: 1px solid var(--bm-tag-border); background: var(--bm-tag-bg); color: var(--bm-tag-text); font: 10px ui-monospace, monospace; white-space: nowrap; }
.bm-tag.is-ok { border-color: var(--bm-green-border); background: var(--bm-green-soft); color: var(--bm-green); }
.bm-tag.is-bad { border-color: var(--bm-red-border); background: var(--bm-red-soft); color: var(--bm-red); }
.bm-tag.is-warn { border-color: var(--bm-amber-border); background: var(--bm-amber-soft); color: var(--bm-amber); }
.bm-tag.is-info { border-color: var(--bm-accent-border); background: var(--bm-accent-soft); color: var(--bm-accent); }
.bm-form-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--bm-border); }
.bm-def-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 9px; margin-top: 12px; }
.bm-def-grid div { padding: 11px; border: 1px solid var(--bm-border); border-radius: 10px; background: var(--bm-surface); }
.bm-def-grid span { display: block; margin-bottom: 4px; font-size: 9px; letter-spacing: 0.09em; text-transform: uppercase; color: var(--bm-muted); }
.bm-def-grid strong { font-size: 12px; font-weight: 600; word-break: break-word; }
.bm-error { color: var(--bm-red); font-size: 11px; min-height: 16px; margin-top: 8px; }
.bm-danger { color: var(--bm-red); }
@media (max-width: 780px) {
    .bm-root { flex-direction: column; }
    .bm-side { width: auto; flex-direction: row; align-items: center; gap: 10px; padding: 10px 12px; border-right: 0; border-bottom: 1px solid var(--bm-border); overflow-x: auto; }
    .bm-brand { padding: 0; }
    .bm-brand small, .bm-side-note { display: none; }
    .bm-nav { flex-direction: row; }
    .bm-nav-item { white-space: nowrap; }
    .bm-side-foot { margin: 0 0 0 auto; padding: 0; }
    .bm-main { padding: 16px; }
    .bm-summary, .bm-fields { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) { .bm-root * { transition: none !important; animation: none !important; } }
`;

const VIEWS = {
    overview: ['Overview', 'Health, destinations and recent activity.'],
    schedules: ['Schedules', 'What to protect, where it lands and when it runs.'],
    restore: ['Restore', 'Pick a generation and put the data back.'],
    activity: ['Activity', 'Completed, failed and skipped runs.'],
    settings: ['Settings', 'Defaults, offsite remotes and package info.'],
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
    container.replaceChildren();
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

    const style = document.createElement('style');
    style.textContent = STYLE;
    const root = document.createElement('div');
    root.className = 'bm-root';
    root.innerHTML = `
        <aside class="bm-side">
            <div class="bm-brand">
                <span class="bm-brand-icon" aria-hidden="true">🔄</span>
                <div><strong>Backup Manager</strong><small data-version>EthOS package</small></div>
            </div>
            <nav class="bm-nav" aria-label="Backup sections">
                ${Object.entries(VIEWS).map(([id, view], index) => `<button class="bm-nav-item${index === 0 ? ' is-active' : ''}" type="button" data-view="${id}">${esc(view[0])}</button>`).join('')}
            </nav>
            <div class="bm-side-foot">
                <span class="bm-pill starting" id="bm-pill" role="status" aria-live="polite">Connecting…</span>
                <span class="bm-side-note">Versioned snapshots with rsync hardlinks. Admin only.</span>
            </div>
        </aside>
        <main class="bm-main">
            <header>
                <h1 id="bm-title">Overview</h1>
                <p class="bm-page-sub" id="bm-sub">Health, destinations and recent activity.</p>
                <p class="bm-status" id="bm-job" role="status" aria-live="polite">Ready.</p>
            </header>
            <div id="bm-callout"></div>
            <div class="bm-view" id="bm-view"></div>
        </main>`;
    container.append(style, root);

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
        return text === 'just now' ? text : (diff < 0 ? `${text} ago` : `in ${text}`);
    }
    function fmtTime(value) {
        const date = parseDate(value);
        return date ? date.toLocaleString() : '—';
    }
    function fmtDuration(seconds) {
        if (seconds === null || seconds === undefined) return '—';
        const value = Number(seconds);
        if (value < 60) return `${Math.round(value)}s`;
        return `${Math.floor(value / 60)}m ${Math.round(value % 60)}s`;
    }
    function badge(status) {
        const kind = { success: 'ok', complete: 'ok', failed: 'bad', incomplete: 'bad',
            skipped: 'warn', cancelled: '', legacy: 'info', running: 'info', queued: 'info' }[status] || '';
        return `<span class="bm-tag ${kind ? `is-${kind}` : ''}">${esc(status || 'unknown')}</span>`;
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

    // ── shell ──────────────────────────────────────────────────────────────
    function setPill(text, kind = '') {
        const pill = $('#bm-pill');
        if (!pill) return;
        const cls = { busy: 'starting', bad: 'offline', '': 'ready' }[kind] ?? kind;
        pill.className = `bm-pill ${cls}`.trim();
        pill.textContent = text;
    }
    function notice(html, kind = '') {
        const box = $('#bm-callout');
        if (!box) return;
        const tone = kind === 'bad' ? 'error' : kind === 'info' ? 'info' : '';
        box.innerHTML = html ? `<div class="bm-startup ${tone}">${html}</div>` : '';
    }
    function jobLine(text, kind = '') {
        const line = $('#bm-job');
        if (!line) return;
        line.className = `bm-status ${kind}`.trim();
        line.textContent = text || 'Ready.';
    }

    function setView(name) {
        if (!VIEWS[name]) return;
        state.view = name;
        root.querySelectorAll('.bm-nav-item').forEach((button) => {
            const active = button.dataset.view === name;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-current', active ? 'page' : 'false');
        });
        renderView();
    }

    function renderView() {
        const view = VIEWS[state.view];
        $('#bm-title').textContent = view[0];
        $('#bm-sub').textContent = view[1];
        if (state.fatal) {
            $('#bm-view').innerHTML = `<div class="bm-panel"><h2>Cannot load Backup Manager</h2><p class="bm-muted" style="margin-top:8px">${esc(state.fatal)}</p><div class="bm-row" style="margin-top:12px"><button class="bm-btn primary" data-action="retry">Retry</button></div></div>`;
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
            setPill('Connecting…', 'busy');
            await loadAll();
            setPill('Ready');
            setView('overview');
            scheduleTick(20_000);
        } catch (error) {
            state.fatal = loadErrorText(error);
            setPill('Offline', 'bad');
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
            try { await loadAll(); } catch { /* keep the last good snapshot */ }
            renderView();
        }
        const queued = (status.queue || []).length;
        setPill(queued ? `Queued · ${queued}` : 'Ready', queued ? 'busy' : '');
        jobLine(queued ? `${queued} operation(s) waiting` : 'Ready.');
    }

    function updateTask(op) {
        if (!ctx.progress?.startTask) return;
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
        const end = status === 'success' ? 'done' : status === 'cancelled' ? 'cancelled' : 'failed';
        const detail = entry
            ? `${entry.kind} ${status}${entry.error ? ` — ${entry.error}` : ''}`
            : 'Finished';
        state.task.finish(end, { detail, percent: end === 'done' ? 100 : undefined });
        state.task = null;
    }

    async function confirmDialog(title, message, okText = 'Confirm') {
        if (ctx.modal?.confirm) {
            return new Promise((resolve) => {
                ctx.modal.confirm({ title, message, okText,
                    onConfirm: () => resolve(true), onCancel: () => resolve(false) });
            });
        }
        return Promise.resolve(window.confirm(`${title}\n\n${message}`));
    }

    function notify(message, type = 'info') {
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
        notice('');
        const summary = state.overview?.summary || {};
        const targets = state.overview?.targets || [];
        const recent = state.overview?.recent || [];
        const hasProblem = summary.recent_failures || summary.recent_skips;
        const readyText = hasProblem
            ? `${summary.recent_failures || 0} failed · ${summary.recent_skips || 0} skipped in recent runs.`
            : 'Schedules are healthy. Run a backup now or create a new schedule.';
        const warn = summary.recent_failures
            ? `<div class="bm-startup error">${summary.recent_failures} failed run(s) recorded. Open Activity for details.</div>`
            : summary.recent_skips
                ? `<div class="bm-startup">${summary.recent_skips} run(s) were skipped — a destination may be offline.</div>`
                : '';
        const targetRows = targets.length ? targets.map((target) => `<tr>
                <td>${esc((target.schedules || []).join(', ') || '—')}</td>
                <td class="path">${esc(target.path)}</td>
                <td class="num">${fmtBytes(target.backup_bytes)}</td>
                <td class="num">${fmtBytes(target.free_bytes)}</td>
                <td>${target.online ? '<span class="bm-tag is-ok">online</span>' : '<span class="bm-tag is-bad">offline</span>'}</td>
            </tr>`).join('') : '';
        $('#bm-view').innerHTML = `
            <div class="bm-panel bm-ready">
                <span class="bm-check ${hasProblem ? 'waiting' : ''}" aria-hidden="true">${hasProblem ? '!' : '✓'}</span>
                <div><h2>${hasProblem ? 'Attention needed' : 'Ready to back up'}</h2><p class="bm-muted">${readyText}</p></div>
            </div>
            ${warn}
            <div class="bm-summary">
                <div><span>Schedules</span><strong>${summary.enabled ?? 0}/${summary.schedules ?? 0}</strong></div>
                <div><span>Protected</span><strong>${fmtBytes(summary.backup_bytes)}</strong></div>
                <div><span>Last success</span><strong>${relTime(summary.last_success_at)}</strong></div>
                <div><span>Next run</span><strong>${relTime(summary.next_run_at)}</strong></div>
            </div>
            <div class="bm-panel">
                <div class="bm-toolbar">
                    <div><h2>Destinations</h2><p class="bm-muted">Space used by completed generations and free space on each target.</p></div>
                    <div class="bm-row">
                        <button class="bm-btn" type="button" data-action="refresh">Refresh</button>
                        <button class="bm-btn primary" type="button" data-action="new-schedule">+ New backup</button>
                    </div>
                </div>
                ${targets.length ? `<div class="bm-scroll"><table class="bm-table">
                    <thead><tr><th>Backups</th><th>Destination</th><th>Protected</th><th>Free</th><th>Status</th></tr></thead>
                    <tbody>${targetRows}</tbody></table></div>`
                    : '<div class="bm-empty"><strong>No destinations yet</strong>Create a backup to start protecting data.</div>'}
            </div>
            <div class="bm-panel">
                <h2>Recent activity</h2>
                ${historyTable(recent, true)}
            </div>
            <div class="bm-panel">
                <h2>How it works</h2>
                <p class="bm-muted" style="margin-top:6px">Every run creates a dated snapshot. Unchanged files are hardlinks, so keeping several restore points costs little extra space. Old generations are pruned with the 7 daily / 4 weekly / 6 monthly policy.</p>
                <div class="bm-row" style="margin-top:12px">
                    <button class="bm-btn primary" type="button" data-action="new-schedule">Create your first backup</button>
                </div>
            </div>`;
    }

    // ── schedules ──────────────────────────────────────────────────────────
    function renderSchedules() {
        notice('');
        if (state.form) { renderForm(); return; }
        const rows = state.schedules.map((schedule) => `<tr>
                <td><strong>${esc(schedule.name)}</strong><div class="bm-muted">${schedule.type === 'docker-compose' ? '🐳 Docker projects' : '📁 Folder'} · ${retentionText(schedule.retention)}</div></td>
                <td class="path">${esc(schedule.source)}<div class="bm-muted">→ ${esc(schedule.destination)}</div></td>
                <td>${esc(cronText(schedule.cron))}<div class="bm-muted">next ${relTime(schedule.next_run)}</div></td>
                <td>${badge(schedule.last_status || 'never')}<div class="bm-muted">${relTime(schedule.last_run_at)}</div></td>
                <td class="actions"><div class="bm-row" style="justify-content:flex-end">
                    <button class="bm-btn small" type="button" data-action="run" data-id="${esc(schedule.id)}">Run</button>
                    <button class="bm-btn small" type="button" data-action="gens" data-id="${esc(schedule.id)}">Restore</button>
                    <button class="bm-btn small" type="button" data-action="edit" data-id="${esc(schedule.id)}" aria-label="Edit ${esc(schedule.name)}">Edit</button>
                    <button class="bm-btn small danger" type="button" data-action="delete" data-id="${esc(schedule.id)}" aria-label="Delete ${esc(schedule.name)}">Delete</button>
                </div></td>
            </tr>`).join('');
        $('#bm-view').innerHTML = `<section class="bm-panel">
            <div class="bm-toolbar">
                <div><h2>Backup schedules</h2><p class="bm-muted">One row per protected folder or Docker Compose project set.</p></div>
                <div class="bm-row">
                    <button class="bm-btn" type="button" data-action="refresh">Refresh</button>
                    <button class="bm-btn primary" type="button" data-action="new-schedule">+ New backup</button>
                </div>
            </div>
            ${state.schedules.length ? `<div class="bm-scroll"><table class="bm-table">
                <thead><tr><th>Backup</th><th>Source → destination</th><th>Schedule</th><th>Last run</th><th></th></tr></thead>
                <tbody>${rows}</tbody></table></div>`
                : '<div class="bm-empty"><strong>No backups yet</strong>A new backup takes three short steps: what, where, when.</div>'}
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
        notice('');
        $('#bm-view').innerHTML = `
            <div class="bm-panel">
                <div class="bm-toolbar">
                    <div><h2>${schedule ? 'Edit backup' : 'New backup'}</h2><p class="bm-muted">Three steps: what to protect, where the snapshots land and when the job runs.</p></div>
                    <div class="bm-row"><button class="bm-btn" type="button" data-action="cancel-form">Cancel</button></div>
                </div>
            </div>
            <form class="bm-form" id="bm-form" autocomplete="off">
            <section class="bm-panel">
                <h2>1 · What</h2>
                <p class="bm-muted">Protect a folder, or every running Docker Compose project inside it.</p>
                <div class="bm-fields">
                    <div class="bm-field full"><label for="bm-name">Name</label><input class="bm-input" id="bm-name" value="${esc(schedule?.name || '')}" placeholder="e.g. Drive backup" required></div>
                    <div class="bm-field"><label for="bm-type">Type</label><select class="bm-input" id="bm-type">
                        <option value="folder" ${type === 'folder' ? 'selected' : ''}>Folder</option>
                        <option value="docker-compose" ${type === 'docker-compose' ? 'selected' : ''}>Docker Compose projects</option>
                    </select></div>
                    <div class="bm-field"><label for="bm-source">${type === 'docker-compose' ? 'Folder containing compose projects' : 'Source folder'}</label>
                        <div class="bm-row"><input class="bm-input" id="bm-source" value="${esc(schedule?.source || '')}" placeholder="/home or /mnt/…"><button type="button" class="bm-btn" data-action="browse" data-target="bm-source">Browse…</button></div></div>
                    <div class="bm-field full bm-docker-only" ${type === 'docker-compose' ? '' : 'hidden'}><label for="bm-projects">Projects (blank = auto-detect every project under the folder)</label><input class="bm-input" id="bm-projects" value="${esc((options.projects || []).join(', '))}" placeholder="auto"></div>
                    <div class="bm-field bm-docker-only" ${type === 'docker-compose' ? '' : 'hidden'}><label class="bm-checkline"><input type="checkbox" id="bm-inc-volumes" ${options.include_volumes !== false ? 'checked' : ''}> Snapshot named volumes</label></div>
                    <div class="bm-field bm-docker-only" ${type === 'docker-compose' ? '' : 'hidden'}><label class="bm-checkline"><input type="checkbox" id="bm-inc-images" ${options.include_images !== false ? 'checked' : ''}> Export images (large)</label></div>
                    <div class="bm-field bm-docker-only" ${type === 'docker-compose' ? '' : 'hidden'}><label class="bm-checkline"><input type="checkbox" id="bm-quiesce" ${options.quiesce ? 'checked' : ''}> Stop containers while volumes are archived</label></div>
                </div>
            </section>
            <section class="bm-panel">
                <h2>2 · Where</h2>
                <p class="bm-muted">Snapshots land in <code>&lt;destination&gt;/&lt;folder&gt;/snapshots/</code>.</p>
                <div class="bm-fields">
                    <div class="bm-field full"><label for="bm-dest">Destination root</label>
                        <div class="bm-row"><input class="bm-input" id="bm-dest" value="${esc(schedule?.destination || '')}" placeholder="/mnt/Backup1"><button type="button" class="bm-btn" data-action="browse" data-target="bm-dest">Browse…</button><button type="button" class="bm-btn" data-action="check-dest">Check</button></div>
                        <p class="bm-hint" id="bm-dest-note"></p></div>
                    <div class="bm-field"><label for="bm-min-free">Minimum free space (GB)</label><input class="bm-input" id="bm-min-free" type="number" min="0" value="${Number(options.min_free_gb ?? 5)}"></div>
                    <div class="bm-field"><label class="bm-checkline"><input type="checkbox" id="bm-skip" ${schedule?.skip_if_missing !== false ? 'checked' : ''}> Skip cleanly when the destination is offline (USB unplugged)</label></div>
                </div>
            </section>
            <section class="bm-panel">
                <h2>3 · When</h2>
                <div class="bm-fields">
                    <div class="bm-field"><label for="bm-cron-preset">Schedule</label><select class="bm-input" id="bm-cron-preset">
                        ${CRON_PRESETS.map(([value, label]) => `<option value="${esc(value)}" ${preset === value ? 'selected' : ''}>${esc(label)}</option>`).join('')}
                    </select></div>
                    <div class="bm-field" id="bm-cron-custom-wrap" ${preset === 'custom' ? '' : 'hidden'}><label for="bm-cron-custom">Cron expression</label><input class="bm-input" id="bm-cron-custom" value="${esc(preset === 'custom' ? cron : '')}" placeholder="0 2 * * *"></div>
                </div>
            </section>
            <section class="bm-panel">
                <h2>Advanced</h2>
                <div class="bm-fields">
                    <div class="bm-field full"><label for="bm-exclude">Exclude patterns (comma separated)</label><input class="bm-input" id="bm-exclude" value="${esc((options.exclude || []).join(', '))}" placeholder="*.tmp, cache/"></div>
                    <div class="bm-field"><label class="bm-checkline"><input type="checkbox" id="bm-exclude-defaults" ${options.exclude_defaults !== false ? 'checked' : ''}> Skip system folders (#recycle, @eaDir, lost+found)</label></div>
                    <div class="bm-field"><label class="bm-checkline"><input type="checkbox" id="bm-acls" ${options.preserve_acls !== false ? 'checked' : ''}> Preserve ACLs</label></div>
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
                    <div class="bm-field full"><label class="bm-checkline"><input type="checkbox" id="bm-remote-enabled" ${remote.enabled ? 'checked' : ''}> Copy the newest generation to an rclone remote</label></div>
                    <div class="bm-field bm-remote-only" ${remote.enabled ? '' : 'hidden'}><label for="bm-remote-name">Remote name</label><input class="bm-input" id="bm-remote-name" value="${esc(remote.remote || '')}" placeholder="gdrive"></div>
                    <div class="bm-field bm-remote-only" ${remote.enabled ? '' : 'hidden'}><label for="bm-remote-path">Remote path</label><input class="bm-input" id="bm-remote-path" value="${esc(remote.path || '')}" placeholder="ethos-backups"></div>
                    <div class="bm-field bm-remote-only" ${remote.enabled ? '' : 'hidden'}><label for="bm-remote-keep">Remote history (days)</label><input class="bm-input" id="bm-remote-keep" type="number" min="1" max="3650" value="${Number(remote.keep_days || 30)}"></div>
                    <div class="bm-field bm-remote-only" ${remote.enabled ? '' : 'hidden'}><label for="bm-remote-bw">Bandwidth limit (optional)</label><input class="bm-input" id="bm-remote-bw" value="${esc(remote.bwlimit || '')}" placeholder="10M"></div>
                </div>
            </section>
            <div class="bm-error" id="bm-form-error" role="alert"></div>
            <div class="bm-form-actions">
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
        return {
            name, type, source, destination, cron, enabled: true,
            remote: {
                enabled: Boolean($('#bm-remote-enabled')?.checked),
                remote: $('#bm-remote-name')?.value.trim() || '',
                path: $('#bm-remote-path')?.value.trim() || '',
                keep_days: Number($('#bm-remote-keep')?.value || 30),
                bwlimit: $('#bm-remote-bw')?.value.trim() || '',
            },
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
        notice('');
        if (!state.restoreScheduleId && state.schedules.length) {
            state.restoreScheduleId = state.schedules[0].id;
        }
        const options = state.schedules.map((schedule) => `<option value="${esc(schedule.id)}" ${schedule.id === state.restoreScheduleId ? 'selected' : ''}>${esc(schedule.name)}</option>`).join('');
        const selected = state.schedules.find((schedule) => schedule.id === state.restoreScheduleId);
        const generations = state.generations || [];
        const rows = generations.length ? generations.map((generation) => `<tr data-gen-row="${esc(generation.generation)}">
                <td>${esc(fmtTime(generation.created_at || generation.generation))}<div class="bm-muted">${esc(generation.generation)}</div></td>
                <td>${badge(generation.status)}${generation.legacy ? ' <span class="bm-tag is-info">legacy</span>' : ''}</td>
                <td class="num">${generation.size_bytes == null ? '—' : fmtBytes(generation.size_bytes)}<div class="bm-muted">${generation.files_total ? `${generation.files_total} file(s)` : 'not indexed'}</div></td>
                <td>${generation.verified?.status ? `<span class="bm-tag ${generation.verified.status === 'ok' ? 'is-ok' : 'is-warn'}">${esc(generation.verified.status)}</span>` : '—'}${generation.remote?.status ? `<div class="bm-muted">remote: ${esc(generation.remote.status)}</div>` : ''}</td>
                <td class="actions"><div class="bm-row" style="justify-content:flex-end">
                    <button class="bm-btn small" type="button" data-action="verify" data-id="${esc(state.restoreScheduleId)}" data-gen="${esc(generation.generation)}">Verify</button>
                    <button class="bm-btn small" type="button" data-action="restore-pick" data-gen="${esc(generation.generation)}">Restore…</button>
                    <button class="bm-btn small" type="button" data-action="open-folder" data-path="${esc(state.genTarget)}">Open</button>
                </div></td>
            </tr>`).join('') : '';
        const pick = state.restore.generation;
        const restorePanel = pick ? `<section class="bm-panel">
            <h2>Restore generation ${esc(pick)}</h2>
            <div class="bm-fields">
                <div class="bm-field"><label for="bm-restore-mode">Put the data back</label><select class="bm-input" id="bm-restore-mode">
                    <option value="in_place" ${state.restore.mode === 'in_place' ? 'selected' : ''}>To the original location</option>
                    <option value="to_folder" ${state.restore.mode === 'to_folder' ? 'selected' : ''}>To another folder</option>
                </select></div>
                <div class="bm-field" id="bm-restore-target-wrap" ${state.restore.mode === 'to_folder' ? '' : 'hidden'}><label for="bm-restore-target">Folder</label>
                    <div class="bm-row"><input class="bm-input" id="bm-restore-target" value="${esc(state.restore.target || '')}" placeholder="/mnt/restore-test"><button type="button" class="bm-btn" data-action="browse" data-target="bm-restore-target">Browse…</button></div></div>
                <div class="bm-field full"><label class="bm-checkline"><input type="checkbox" id="bm-restore-delete" ${state.restore.delete_extra ? 'checked' : ''}> Make an exact copy (delete extra files)</label></div>
            </div>
            <p class="bm-hint">In-place restores automatically create a pre-restore snapshot first. Docker projects have their containers stopped and started again.</p>
            <div class="bm-form-actions">
                <button type="button" class="bm-btn" data-action="restore-cancel">Cancel</button>
                <button type="button" class="bm-btn primary" data-action="restore-submit" data-id="${esc(state.restoreScheduleId)}" data-gen="${esc(pick)}">Restore</button>
            </div>
        </section>` : '';

        $('#bm-view').innerHTML = `
            <section class="bm-panel">
                <div class="bm-toolbar">
                    <div><h2>Choose a backup</h2><p class="bm-muted">${selected ? `${esc(selected.source)} → ${esc(selected.destination)}` : 'No schedule selected.'}</p></div>
                    <div class="bm-row"><button class="bm-btn" type="button" data-action="refresh">Refresh</button></div>
                </div>
                <div class="bm-fields"><div class="bm-field full"><label for="bm-restore-schedule">Schedule</label>
                    <select class="bm-input" id="bm-restore-schedule">${options || '<option value="">No schedules</option>'}</select></div></div>
            </section>
            <section class="bm-panel">
                <h2>Generations</h2>
                ${generations.length ? `<div class="bm-scroll"><table class="bm-table">
                    <thead><tr><th>Created</th><th>Status</th><th>Size</th><th>Verified</th><th></th></tr></thead>
                    <tbody>${rows}</tbody></table></div>`
                    : '<div class="bm-empty"><strong>No generations yet</strong>Run the backup once, then it appears here.</div>'}
            </section>
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
        notice('');
        $('#bm-view').innerHTML = `<section class="bm-panel">
            <div class="bm-toolbar">
                <div><h2>Run history</h2><p class="bm-muted">Newest first. Failed and skipped runs include the reason.</p></div>
                <div class="bm-row"><button class="bm-btn" type="button" data-action="refresh">Refresh</button></div>
            </div>
            ${historyTable(state.history, false)}
        </section>`;
    }

    function historyTable(items, compact) {
        if (!items || !items.length) {
            return '<div class="bm-empty"><strong>No runs recorded</strong>Activity appears here after the first backup.</div>';
        }
        const rows = items.map((item) => `<tr>
            <td>${badge(item.status)}<div class="bm-muted">${esc(item.kind || 'backup')} · ${esc(item.trigger || 'manual')}</div></td>
            <td><strong>${esc(item.schedule_name || item.schedule_id)}</strong>${compact ? '' : `<div class="bm-muted">${esc(item.generation || '')}</div>`}</td>
            <td>${relTime(item.finished_at)}<div class="bm-muted">${fmtTime(item.finished_at)}</div></td>
            <td class="num">${fmtDuration(item.duration_seconds)}<div class="bm-muted">${fmtBytes(item.bytes_total)}</div></td>
            ${compact ? '' : `<td class="path">${esc(item.error || item.remote_status || '')}</td>`}
        </tr>`).join('');
        return `<div class="bm-scroll"><table class="bm-table">
            <thead><tr><th>Result</th><th>Backup</th><th>Finished</th><th>Duration / size</th>${compact ? '' : '<th>Details</th>'}</tr></thead>
            <tbody>${rows}</tbody></table></div>`;
    }

    // ── settings ───────────────────────────────────────────────────────────
    function renderSettings() {
        notice('');
        const settings = state.settings || {};
        const retention = settings.default_retention || { keep_last: 0, keep_daily: 7, keep_weekly: 4, keep_monthly: 6 };
        $('#bm-view').innerHTML = `
            <section class="bm-panel">
                <div class="bm-toolbar">
                    <div><h2>New-schedule defaults</h2><p class="bm-muted">Applied when a schedule does not override the value.</p></div>
                    <div class="bm-row"><button class="bm-btn primary" type="button" data-action="save-settings">Save defaults</button></div>
                </div>
                <div class="bm-fields">
                    <div class="bm-field"><label for="bm-def-last">Keep last</label><input class="bm-input" id="bm-def-last" type="number" min="0" max="365" value="${Number(retention.keep_last || 0)}"></div>
                    <div class="bm-field"><label for="bm-def-daily">Keep daily</label><input class="bm-input" id="bm-def-daily" type="number" min="0" max="365" value="${Number(retention.keep_daily || 0)}"></div>
                    <div class="bm-field"><label for="bm-def-weekly">Keep weekly</label><input class="bm-input" id="bm-def-weekly" type="number" min="0" max="365" value="${Number(retention.keep_weekly || 0)}"></div>
                    <div class="bm-field"><label for="bm-def-monthly">Keep monthly</label><input class="bm-input" id="bm-def-monthly" type="number" min="0" max="365" value="${Number(retention.keep_monthly || 0)}"></div>
                    <div class="bm-field"><label for="bm-def-verify">Verify after each run</label><select class="bm-input" id="bm-def-verify">
                        <option value="quick" ${settings.verify_after_run !== 'off' ? 'selected' : ''}>Quick</option>
                        <option value="off" ${settings.verify_after_run === 'off' ? 'selected' : ''}>Off</option>
                    </select></div>
                    <div class="bm-field"><label class="bm-checkline"><input type="checkbox" id="bm-def-digest" ${settings.digest_enabled !== false ? 'checked' : ''}> Weekly health report</label></div>
                    <div class="bm-field"><label for="bm-def-weekday">Report day</label><select class="bm-input" id="bm-def-weekday">
                        ${WEEKDAYS.map((name, index) => `<option value="${index}" ${Number(settings.digest_weekday || 0) === index ? 'selected' : ''}>${name}</option>`).join('')}
                    </select></div>
                    <div class="bm-field"><label for="bm-def-hour">Report hour</label><input class="bm-input" id="bm-def-hour" type="number" min="0" max="23" value="${Number(settings.digest_hour ?? 8)}"></div>
                </div>
            </section>
            <section class="bm-panel">
                <h2>Offsite remotes (rclone)</h2>
                <p class="bm-muted" style="margin-top:6px">Remotes are configured outside EthOS with <code>sudo -u ethos-nas rclone config</code>. Credentials never pass through the API.</p>
                <div id="bm-remotes" style="margin-top:12px"><p class="bm-muted">Loading…</p></div>
            </section>
            <section class="bm-panel">
                <h2>Package</h2>
                <div class="bm-def-grid">
                    <div><span>Package</span><strong>${esc(ctx.pkg?.name || 'EthOS Backup Manager')}</strong></div>
                    <div><span>Version</span><strong>v${esc(ctx.pkg?.version || '1.0.0')}</strong></div>
                    <div><span>API</span><strong>v2 · rsync hardlinks</strong></div>
                </div>
                <p class="bm-hint">The engine and schedules live in EthOS core. Removing the package hides this window; scheduled backups keep running.</p>
            </section>`;
        loadRemotes();
    }

    async function loadRemotes() {
        const box = $('#bm-remotes');
        if (!box) return;
        try {
            const data = await api('/remotes');
            if (!data.available) {
                box.innerHTML = `<div class="bm-startup">${esc(data.detail || 'rclone is not available')}</div>`;
                return;
            }
            if (!(data.remotes || []).length) {
                box.innerHTML = '<p class="bm-muted">No rclone remotes configured yet.</p>';
                return;
            }
            box.innerHTML = `<div class="bm-scroll"><table class="bm-table">
                <thead><tr><th>Remote</th><th>Type</th><th></th></tr></thead>
                <tbody>${data.remotes.map((remote) => `<tr>
                    <td><strong>${esc(remote.name)}</strong></td>
                    <td>${esc(remote.type || 'remote')}</td>
                    <td class="actions"><button class="bm-btn small" type="button" data-action="test-remote" data-remote="${esc(remote.name)}">Test</button></td>
                </tr>`).join('')}</tbody></table></div>`;
        } catch (error) {
            box.innerHTML = `<div class="bm-startup error">${esc(loadErrorText(error))}</div>`;
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
            if (action === 'refresh') { await loadAll(); renderView(); return; }
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
            if (action === 'dry-run-form') {
                const existing = state.form?.schedule;
                if (!existing) { notify('Save the schedule first, then run a dry run', 'info'); return; }
                await runOperation(`/schedules/${encodeURIComponent(existing.id)}/dry-run`);
                notify('Dry run queued', 'info');
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
