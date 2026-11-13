// EthOS native package UI — EthOS AntiVirus
// Contract: export function render(container, ctx). All service calls go through
// ctx.proxy(), so the ClamAV container stays bound to loopback only.

const STYLE = `
.av-root {
    --av-bg: #08111d;
    --av-panel: rgba(148, 163, 184, 0.07);
    --av-border: rgba(148, 163, 184, 0.22);
    --av-text: #e2e8f0;
    --av-muted: #94a3b8;
    --av-accent: #38bdf8;
    --av-green: #4ade80;
    --av-red: #f87171;
    --av-amber: #fbbf24;
    display: flex;
    height: 100%;
    overflow: hidden;
    background:
        radial-gradient(circle at 8% 4%, rgba(56, 189, 248, 0.14), transparent 40%),
        radial-gradient(circle at 92% 96%, rgba(74, 222, 128, 0.09), transparent 40%),
        var(--av-bg);
    color: var(--av-text);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
.av-root, .av-root * { box-sizing: border-box; }
.av-root [hidden] { display: none !important; }
.av-root button, .av-root input, .av-root select { font-family: inherit; }
.av-side {
    flex: none; width: 218px; display: flex; flex-direction: column; gap: 16px;
    padding: 20px 14px; border-right: 1px solid var(--av-border);
    background: rgba(2, 6, 23, 0.45); overflow-y: auto;
}
.av-brand { display: flex; align-items: center; gap: 10px; padding: 0 8px; }
.av-brand-icon { font-size: 26px; line-height: 1; }
.av-brand strong { display: block; font-size: 14px; letter-spacing: -0.01em; }
.av-brand small { display: block; color: var(--av-muted); font-size: 10px; }
.av-nav { display: flex; flex-direction: column; gap: 2px; }
.av-nav-item {
    display: block; width: 100%; padding: 9px 11px; border: 0; border-radius: 9px;
    background: transparent; color: var(--av-muted); font-size: 12px; font-weight: 600;
    text-align: left; cursor: pointer;
}
.av-nav-item:hover { background: rgba(148, 163, 184, 0.09); color: var(--av-text); }
.av-nav-item.is-active { background: rgba(56, 189, 248, 0.16); color: #e0f2fe; }
.av-nav-item:focus-visible { outline: 2px solid var(--av-accent); outline-offset: 1px; }
.av-side-foot { margin-top: auto; display: flex; flex-direction: column; gap: 8px; padding: 0 8px; }
.av-side-note { color: var(--av-muted); font-size: 10px; line-height: 1.6; }
.av-main { flex: 1; min-width: 0; overflow-y: auto; padding: 24px 28px 32px; }
.av-main h1 { margin: 0; font-size: clamp(22px, 3.4vw, 30px); letter-spacing: -0.02em; }
.av-page-sub { margin: 4px 0 0; color: var(--av-muted); font-size: 12px; line-height: 1.5; }
.av-pill { align-self: flex-start; padding: 5px 10px; border-radius: 999px; font-size: 10px; font-weight: 700; border: 1px solid var(--av-border); white-space: nowrap; }
.av-pill.ready { color: var(--av-green); border-color: rgba(74, 222, 128, 0.45); background: rgba(74, 222, 128, 0.10); }
.av-pill.starting { color: var(--av-amber); border-color: rgba(251, 191, 36, 0.45); background: rgba(251, 191, 36, 0.10); }
.av-pill.offline { color: var(--av-red); border-color: rgba(248, 113, 113, 0.45); background: rgba(248, 113, 113, 0.10); }
.av-status { min-height: 18px; margin: 12px 0 0; color: var(--av-accent); font-size: 12px; font-weight: 600; }
.av-status.error { color: var(--av-red); }
.av-status.warn { color: var(--av-amber); }
.av-startup { margin: 10px 0 0; padding: 9px 11px; border: 1px solid rgba(251, 191, 36, 0.3); border-radius: 9px; background: rgba(251, 191, 36, 0.08); color: var(--av-muted); font-size: 11px; line-height: 1.55; }
.av-view { display: flex; flex-direction: column; gap: 14px; margin-top: 16px; }
.av-view[hidden] { display: none; }
.av-panel { padding: 17px 18px; border: 1px solid var(--av-border); border-radius: 15px; background: var(--av-panel); }
.av-panel h2 { margin: 0 0 3px; font-size: 13px; }
.av-muted { margin: 0; color: var(--av-muted); font-size: 11px; line-height: 1.55; }
.av-ready { display: flex; align-items: center; gap: 14px; }
.av-check { flex: none; width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; background: rgba(74, 222, 128, 0.14); color: var(--av-green); font-size: 17px; font-weight: 700; }
.av-check.waiting { background: rgba(251, 191, 36, 0.14); color: var(--av-amber); }
.av-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 11px; }
.av-scan-card {
    display: flex; flex-direction: column; align-items: center; gap: 9px;
    padding: 20px 12px; border: 1px solid var(--av-border); border-radius: 14px;
    background: rgba(15, 23, 42, 0.35); color: var(--av-text);
    font-size: 12px; font-weight: 600; cursor: pointer;
    transition: transform 0.12s ease, border-color 0.12s ease;
}
.av-scan-card:hover:not(:disabled) { border-color: var(--av-accent); transform: translateY(-1px); }
.av-scan-card:disabled { opacity: 0.5; cursor: not-allowed; }
.av-scan-card:focus-visible { outline: 2px solid var(--av-accent); outline-offset: 2px; }
.av-scan-card small { color: var(--av-muted); font-size: 10px; font-weight: 400; text-align: center; line-height: 1.4; }
.av-scan-icon { width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center; font-size: 23px; border: 1px solid rgba(56, 189, 248, 0.45); background: radial-gradient(circle at 30% 25%, rgba(56, 189, 248, 0.5), rgba(2, 132, 199, 0.16)); }
.av-label { display: block; margin-bottom: 7px; font-size: 10px; letter-spacing: 0.09em; text-transform: uppercase; color: var(--av-muted); }
.av-row { display: flex; gap: 8px; flex-wrap: wrap; }
.av-input {
    flex: 1; min-width: 0; padding: 9px 11px;
    border: 1px solid var(--av-border); border-radius: 9px;
    background: rgba(2, 6, 23, 0.55); color: var(--av-text);
    font: 12px ui-monospace, SFMono-Regular, Menlo, monospace;
}
.av-input:focus-visible, .av-btn:focus-visible { outline: 2px solid var(--av-accent); outline-offset: 2px; }
.av-btn {
    padding: 8px 13px; border: 1px solid var(--av-border); border-radius: 9px;
    background: rgba(15, 23, 42, 0.65); color: var(--av-text);
    font-size: 11px; font-weight: 600; cursor: pointer;
}
.av-btn:hover:not(:disabled) { border-color: var(--av-accent); }
.av-btn:disabled { opacity: 0.5; cursor: wait; }
.av-btn.primary { border-color: rgba(56, 189, 248, 0.55); background: rgba(56, 189, 248, 0.14); }
.av-btn.danger { border-color: rgba(248, 113, 113, 0.4); color: #fecaca; }
.av-btn.small { padding: 4px 9px; font-size: 10px; font-family: ui-monospace, monospace; }
.av-hint { margin: 8px 0 0; color: var(--av-muted); font-size: 10px; line-height: 1.5; }
.av-root code { color: var(--av-accent); font-family: ui-monospace, monospace; }
.av-chips { display: flex; gap: 6px; margin-top: 9px; flex-wrap: wrap; }
.av-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 9px; }
.av-summary div { padding: 11px; border: 1px solid var(--av-border); border-radius: 10px; background: rgba(15, 23, 42, 0.35); }
.av-summary span { display: block; font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--av-muted); margin-bottom: 4px; }
.av-summary strong { font-size: 20px; font-variant-numeric: tabular-nums; }
.av-danger { color: var(--av-red); }
.av-amber { color: var(--av-amber); }
.av-results-box { margin-top: 15px; }
.av-results-box h2 { margin-bottom: 8px; }
.av-errors ul { margin: 0; padding-left: 18px; color: var(--av-amber); font-size: 11px; line-height: 1.6; }
.av-engine { margin: 12px 0 0; }
.av-toolbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.av-toolbar > div { min-width: 0; }
.av-table { width: 100%; border-collapse: collapse; font-size: 11px; }
.av-table th, .av-table td { text-align: left; padding: 8px 9px; border-bottom: 1px solid var(--av-border); vertical-align: top; }
.av-table th { color: var(--av-muted); font-size: 9px; letter-spacing: 0.08em; text-transform: uppercase; white-space: nowrap; }
.av-table tbody tr:last-child td { border-bottom: 0; }
.av-table td.path { font-family: ui-monospace, monospace; word-break: break-all; }
.av-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
.av-table td.actions { text-align: right; white-space: nowrap; }
.av-scroll { overflow-x: auto; margin-top: 12px; }
.av-empty { margin-top: 12px; padding: 24px; text-align: center; color: var(--av-muted); font-size: 11px; border: 1px dashed var(--av-border); border-radius: 11px; }
.av-empty[hidden] { display: none; }
.av-field { display: flex; flex-direction: column; gap: 6px; margin-top: 14px; }
.av-field:first-of-type { margin-top: 8px; }
.av-field > label { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--av-muted); }
.av-radio {
    display: flex; align-items: flex-start; gap: 9px; margin-top: 8px;
    padding: 10px 12px; border: 1px solid var(--av-border); border-radius: 10px;
    background: rgba(15, 23, 42, 0.3); font-size: 12px; cursor: pointer;
}
.av-radio input { margin: 2px 0 0; accent-color: var(--av-accent); }
.av-radio small, .av-checkline small { display: block; margin-top: 2px; color: var(--av-muted); font-size: 10px; line-height: 1.45; }
.av-checkline { display: flex; align-items: flex-start; gap: 9px; margin-top: 12px; font-size: 12px; cursor: pointer; }
.av-checkline input { margin: 2px 0 0; accent-color: var(--av-accent); }
.av-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.av-tag { display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 999px; border: 1px solid var(--av-border); background: rgba(56, 189, 248, 0.1); color: #bae6fd; font: 10px ui-monospace, monospace; }
.av-tag button { border: 0; padding: 0; background: transparent; color: #bae6fd; font-size: 13px; line-height: 1; cursor: pointer; }
.av-form-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--av-border); }
.av-sched-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.av-def-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 9px; margin-top: 12px; }
.av-def-grid div { padding: 11px; border: 1px solid var(--av-border); border-radius: 10px; background: rgba(15, 23, 42, 0.35); }
.av-def-grid span { display: block; margin-bottom: 4px; font-size: 9px; letter-spacing: 0.09em; text-transform: uppercase; color: var(--av-muted); }
.av-def-grid strong { font-size: 12px; font-weight: 600; word-break: break-word; }
.av-warn { color: var(--av-amber); }
@media (max-width: 780px) {
    .av-root { flex-direction: column; }
    .av-side { width: auto; flex-direction: row; align-items: center; gap: 10px; padding: 10px 12px; border-right: 0; border-bottom: 1px solid var(--av-border); overflow-x: auto; }
    .av-brand { padding: 0; }
    .av-brand small, .av-side-note { display: none; }
    .av-nav { flex-direction: row; }
    .av-nav-item { white-space: nowrap; }
    .av-side-foot { margin: 0 0 0 auto; padding: 0; }
    .av-main { padding: 16px; }
    .av-cards, .av-summary, .av-sched-grid { grid-template-columns: 1fr; }
}
`;

const VIEWS = {
    overview: ['Overview', 'Scan now, review results and keep an eye on definitions.'],
    quarantine: ['Quarantine', 'Detected files copied by the scanner. The originals are never modified.'],
    logs: ['Logs', 'Completed scans with results and durations.'],
    settings: ['Settings', 'Defaults applied to every manual and scheduled scan.'],
    schedule: ['Scheduled scan', 'Recurring scans executed by the package service.'],
    update: ['Update', 'ClamAV engine and signature database status.'],
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function errorText(err) {
    return err?.detail || err?.message || String(err);
}

function formatTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function formatDuration(seconds) {
    const total = Number(seconds) || 0;
    if (total < 60) return `${total.toFixed(total < 10 ? 1 : 0)}s`;
    const minutes = Math.floor(total / 60);
    return `${minutes}m ${Math.round(total % 60)}s`;
}

function scheduleLabel(schedule) {
    if (schedule.frequency === 'weekly') {
        return `Weekly · ${WEEKDAYS[Number(schedule.weekday) || 0]} · ${schedule.time}`;
    }
    return `Daily · ${schedule.time}`;
}

export function render(container, ctx) {
    container.replaceChildren();
    const style = document.createElement('style');
    style.textContent = STYLE;
    const root = document.createElement('div');
    root.className = 'av-root';
    root.innerHTML = `
        <aside class="av-side">
            <div class="av-brand">
                <span class="av-brand-icon" aria-hidden="true">🛡️</span>
                <div><strong>AntiVirus</strong><small data-version>EthOS package</small></div>
            </div>
            <nav class="av-nav" aria-label="AntiVirus sections">
                <button class="av-nav-item is-active" type="button" data-tab="overview">Overview</button>
                <button class="av-nav-item" type="button" data-tab="quarantine">Quarantine</button>
                <button class="av-nav-item" type="button" data-tab="logs">Logs</button>
                <button class="av-nav-item" type="button" data-tab="settings">Settings</button>
                <button class="av-nav-item" type="button" data-tab="schedule">Scheduled scan</button>
                <button class="av-nav-item" type="button" data-tab="update">Update</button>
            </nav>
            <div class="av-side-foot">
                <span class="av-pill starting" role="status" aria-live="polite" data-health>Connecting…</span>
                <span class="av-side-note">Read-only scans of <code>/home</code>, <code>/mnt</code> and <code>/media</code>.</span>
            </div>
        </aside>
        <main class="av-main">
            <header>
                <h1 data-page-title>Overview</h1>
                <p class="av-page-sub" data-page-sub>Scan now, review results and keep an eye on definitions.</p>
                <p class="av-status" role="status" aria-live="polite" data-status>Ready.</p>
                <p class="av-startup" data-startup>First start downloads the ClamAV signature database. This can take a few minutes; the status retries automatically.</p>
            </header>

            <section class="av-view" data-panel="overview">
                <div class="av-panel av-ready">
                    <span class="av-check" data-ready-icon aria-hidden="true">✓</span>
                    <div>
                        <h2 data-ready-title>Ready to scan</h2>
                        <p class="av-muted">Pick a target below. The scanner starts as soon as ClamAV finishes loading signatures.</p>
                    </div>
                </div>
                <div class="av-cards">
                    <button class="av-scan-card" type="button" data-scan="full" disabled>
                        <span class="av-scan-icon" aria-hidden="true">🛡️</span>
                        <span>Full scan</span>
                        <small data-full-hint>/home, /mnt, /media</small>
                    </button>
                    <button class="av-scan-card" type="button" data-scan="custom" disabled>
                        <span class="av-scan-icon" aria-hidden="true">📁</span>
                        <span>Custom scan</span>
                        <small>Choose any folder or file</small>
                    </button>
                    <button class="av-scan-card" type="button" data-scan="quick" disabled>
                        <span class="av-scan-icon" aria-hidden="true">🏠</span>
                        <span>Quick scan</span>
                        <small>/home</small>
                    </button>
                </div>
                <div class="av-panel">
                    <label class="av-label" for="av-path">Custom scan target</label>
                    <div class="av-row">
                        <input id="av-path" class="av-input" type="text" value="/home" spellcheck="false">
                        <button class="av-btn primary" type="button" data-scan-custom disabled>Scan target</button>
                    </div>
                    <p class="av-hint">Allowed roots: <code>/home</code>, <code>/mnt</code>, <code>/media</code>. Start with a subfolder for a faster first scan.</p>
                    <div class="av-chips" data-quick-paths aria-label="Quick paths"></div>
                </div>
                <div class="av-panel" data-results hidden>
                    <div class="av-summary">
                        <div><span>Clean files</span><strong data-clean>0</strong></div>
                        <div><span>Threats</span><strong class="av-danger" data-threats>0</strong></div>
                        <div><span>Skipped</span><strong data-skipped>0</strong></div>
                        <div><span>Errors</span><strong data-errors>0</strong></div>
                    </div>
                    <div class="av-results-box" data-threat-box hidden>
                        <h2>Detected threats</h2>
                        <div class="av-scroll">
                            <table class="av-table">
                                <thead><tr><th>File</th><th>Signature</th></tr></thead>
                                <tbody data-threat-rows></tbody>
                            </table>
                        </div>
                        <p class="av-hint" data-quarantine-note></p>
                    </div>
                    <div class="av-results-box av-errors" data-error-box hidden>
                        <h2>Scan errors</h2>
                        <ul data-error-rows></ul>
                    </div>
                    <p class="av-engine av-muted" data-engine></p>
                </div>
                <div class="av-panel">
                    <p class="av-muted">Current virus definitions: <strong data-defs-inline>—</strong></p>
                    <p class="av-muted" style="margin-top:4px"><strong data-quarantine-count>0</strong> file(s) in quarantine.</p>
                </div>
            </section>

            <section class="av-view" data-panel="quarantine" hidden>
                <div class="av-panel">
                    <div class="av-toolbar">
                        <div>
                            <h2>Quarantine</h2>
                            <p class="av-muted">Copies of detected files, stored inside the package data volume. Delete a copy here when you no longer need it.</p>
                        </div>
                        <button class="av-btn danger" type="button" data-quarantine-clear disabled>Delete all</button>
                    </div>
                    <div class="av-empty" data-quarantine-empty>Nothing in quarantine.</div>
                    <div class="av-scroll" data-quarantine-table-box hidden>
                        <table class="av-table">
                            <thead><tr><th>File</th><th>Signature</th><th>Detected</th><th>Size</th><th></th></tr></thead>
                            <tbody data-quarantine-rows></tbody>
                        </table>
                    </div>
                </div>
            </section>

            <section class="av-view" data-panel="logs" hidden>
                <div class="av-panel">
                    <div class="av-toolbar">
                        <div>
                            <h2>Scan log</h2>
                            <p class="av-muted">The last 200 scans, newest first.</p>
                        </div>
                        <button class="av-btn danger" type="button" data-logs-clear disabled>Clear log</button>
                    </div>
                    <div class="av-empty" data-logs-empty>No scans yet.</div>
                    <div class="av-scroll" data-logs-table-box hidden>
                        <table class="av-table">
                            <thead><tr><th>Started</th><th>Trigger</th><th>Target</th><th>Clean</th><th>Threats</th><th>Errors</th><th>Duration</th></tr></thead>
                            <tbody data-log-rows></tbody>
                        </table>
                    </div>
                </div>
            </section>

            <section class="av-view" data-panel="settings" hidden>
                <form class="av-panel" data-settings-form>
                    <h2>Default processing method</h2>
                    <label class="av-radio">
                        <input type="radio" name="processing" value="quarantine">
                        <span>Copy detected files to quarantine
                            <small>Scanned files are never modified; the original stays where it is.</small>
                        </span>
                    </label>
                    <label class="av-radio">
                        <input type="radio" name="processing" value="report">
                        <span>Report only
                            <small>Detections are listed in the scan results and the log.</small>
                        </span>
                    </label>

                    <div class="av-field">
                        <label for="av-whitelist">Whitelisted paths (skipped by scans)</label>
                        <div class="av-tags" data-whitelist-tags></div>
                        <div class="av-row">
                            <input id="av-whitelist" class="av-input" data-whitelist-input placeholder="/home/user/backup" spellcheck="false">
                            <button class="av-btn" type="button" data-whitelist-add>Add path</button>
                        </div>
                    </div>
                    <div class="av-field">
                        <label for="av-extensions">Only scan these file types</label>
                        <input id="av-extensions" class="av-input" data-extensions placeholder="empty = every type, e.g. jpg, pdf, zip" spellcheck="false">
                    </div>
                    <div class="av-field">
                        <label for="av-max-file">Skip files larger than (MB, 0 = no limit)</label>
                        <input id="av-max-file" class="av-input" data-max-file type="number" min="0" step="1" value="0">
                    </div>
                    <div class="av-field">
                        <label for="av-max-quarantine">Quarantine copy limit (MB, 0 = unlimited)</label>
                        <input id="av-max-quarantine" class="av-input" data-max-quarantine type="number" min="0" step="1" value="512">
                    </div>
                    <label class="av-checkline">
                        <input type="checkbox" data-smart>
                        <span>Enable smart scan
                            <small>Skip files that have not changed since the previous scan of the same path.</small>
                        </span>
                    </label>
                    <label class="av-checkline">
                        <input type="checkbox" data-reload-signatures>
                        <span>Reload virus definitions before scanning
                            <small>Ask clamd to reload the signature database before every scan.</small>
                        </span>
                    </label>
                    <div class="av-form-actions">
                        <button class="av-btn" type="button" data-settings-reset>Reset defaults</button>
                        <button class="av-btn primary" type="submit" data-settings-save>Apply</button>
                    </div>
                </form>
            </section>

            <section class="av-view" data-panel="schedule" hidden>
                <form class="av-panel" data-schedule-form>
                    <h2>Add a scheduled scan</h2>
                    <p class="av-muted">Schedules run inside the package service; EthOS does not need to stay open.</p>
                    <div class="av-field">
                        <label for="av-sched-path">Folder to scan</label>
                        <input id="av-sched-path" class="av-input" data-sched-path value="/home" spellcheck="false">
                    </div>
                    <div class="av-sched-grid">
                        <div class="av-field">
                            <label for="av-sched-frequency">Frequency</label>
                            <select id="av-sched-frequency" class="av-input" data-sched-frequency>
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                            </select>
                        </div>
                        <div class="av-field" data-sched-weekday-wrap hidden>
                            <label for="av-sched-weekday">Weekday</label>
                            <select id="av-sched-weekday" class="av-input" data-sched-weekday>
                                ${WEEKDAYS.map((day, index) => `<option value="${index}">${day}</option>`).join('')}
                            </select>
                        </div>
                        <div class="av-field">
                            <label for="av-sched-time">Time</label>
                            <input id="av-sched-time" class="av-input" type="time" data-sched-time value="03:00">
                        </div>
                    </div>
                    <div class="av-form-actions">
                        <button class="av-btn primary" type="submit" data-sched-add>Add schedule</button>
                    </div>
                </form>
                <div class="av-panel">
                    <div class="av-toolbar">
                        <div>
                            <h2>Scheduled scans</h2>
                            <p class="av-muted">Times use the NAS local timezone.</p>
                        </div>
                    </div>
                    <div class="av-empty" data-schedules-empty>No scheduled scans.</div>
                    <div class="av-scroll" data-schedules-table-box hidden>
                        <table class="av-table">
                            <thead><tr><th>Target</th><th>Schedule</th><th>Next run</th><th>Last run</th><th>Status</th><th></th></tr></thead>
                            <tbody data-schedule-rows></tbody>
                        </table>
                    </div>
                </div>
            </section>

            <section class="av-view" data-panel="update" hidden>
                <div class="av-panel">
                    <div class="av-toolbar">
                        <div>
                            <h2>Virus definitions</h2>
                            <p class="av-muted">freshclam refreshes signatures automatically inside the ClamAV container. Reload asks clamd to pick up the current database.</p>
                        </div>
                        <button class="av-btn" type="button" data-defs-reload>Reload database</button>
                    </div>
                    <div class="av-def-grid">
                        <div><span>Engine</span><strong data-def-engine>—</strong></div>
                        <div><span>Signature set</span><strong data-def-signature>—</strong></div>
                        <div><span>Released</span><strong data-def-released>—</strong></div>
                        <div><span>Status</span><strong data-def-status>—</strong></div>
                    </div>
                    <p class="av-hint">Scans are read-only. Quarantine entries are copies stored under the package data volume, not the original files.</p>
                </div>
            </section>
        </main>`;
    container.append(style, root);

    const $ = (selector) => root.querySelector(selector);
    const healthEl = $('[data-health]');
    const statusEl = $('[data-status]');
    const startupEl = $('[data-startup]');
    const pageTitle = $('[data-page-title]');
    const pageSub = $('[data-page-sub]');
    const versionEl = $('[data-version]');
    const readyIcon = $('[data-ready-icon]');
    const readyTitle = $('[data-ready-title]');
    const fullHint = $('[data-full-hint]');
    const pathEl = $('#av-path');
    const customBtn = $('[data-scan-custom]');
    const quickPaths = $('[data-quick-paths]');
    const results = $('[data-results]');
    const cleanEl = $('[data-clean]');
    const threatEl = $('[data-threats]');
    const skippedEl = $('[data-skipped]');
    const errorEl = $('[data-errors]');
    const threatBox = $('[data-threat-box]');
    const threatRows = $('[data-threat-rows]');
    const quarantineNote = $('[data-quarantine-note]');
    const errorBox = $('[data-error-box]');
    const errorRows = $('[data-error-rows]');
    const engineEl = $('[data-engine]');
    const defsInline = $('[data-defs-inline]');
    const defEngine = $('[data-def-engine]');
    const defSignature = $('[data-def-signature]');
    const defReleased = $('[data-def-released]');
    const defStatus = $('[data-def-status]');
    const quarantineCount = $('[data-quarantine-count]');
    const quarantineEmpty = $('[data-quarantine-empty]');
    const quarantineBox = $('[data-quarantine-table-box]');
    const quarantineRows = $('[data-quarantine-rows]');
    const quarantineClear = $('[data-quarantine-clear]');
    const logsEmpty = $('[data-logs-empty]');
    const logsBox = $('[data-logs-table-box]');
    const logRows = $('[data-log-rows]');
    const logsClear = $('[data-logs-clear]');
    const settingsForm = $('[data-settings-form]');
    const whitelistTags = $('[data-whitelist-tags]');
    const whitelistInput = $('[data-whitelist-input]');
    const extensionsInput = $('[data-extensions]');
    const maxFileInput = $('[data-max-file]');
    const maxQuarantineInput = $('[data-max-quarantine]');
    const smartInput = $('[data-smart]');
    const reloadSignaturesInput = $('[data-reload-signatures]');
    const scheduleForm = $('[data-schedule-form]');
    const schedPath = $('[data-sched-path]');
    const schedFrequency = $('[data-sched-frequency]');
    const schedWeekdayWrap = $('[data-sched-weekday-wrap]');
    const schedWeekday = $('[data-sched-weekday]');
    const schedTime = $('[data-sched-time]');
    const schedulesEmpty = $('[data-schedules-empty]');
    const schedulesBox = $('[data-schedules-table-box]');
    const scheduleRows = $('[data-schedule-rows]');

    const state = {
        tab: 'overview',
        ready: false,
        scanning: false,
        allowedRoots: ['/home', '/mnt', '/media'],
        settings: null,
        defaults: null,
        quarantine: [],
        logs: [],
        schedules: [],
    };

    function notify(message, type) {
        if (typeof ctx.notify === 'function') ctx.notify(message, type);
    }

    function setStatus(text, kind = '') {
        statusEl.textContent = text;
        statusEl.className = 'av-status' + (kind ? ` ${kind}` : '');
    }

    function updateBusy() {
        const disabled = state.scanning || !state.ready;
        root.querySelectorAll('[data-scan], [data-scan-custom]').forEach((button) => {
            button.disabled = disabled;
        });
    }

    function renderQuickPaths() {
        quickPaths.replaceChildren(...state.allowedRoots.map((path) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'av-btn small';
            button.textContent = path;
            button.addEventListener('click', () => {
                pathEl.value = path;
                pathEl.focus();
            });
            return button;
        }));
        fullHint.textContent = state.allowedRoots.join(', ');
    }

    function renderDefinitions(definitions) {
        const available = Boolean(definitions?.available);
        const released = available ? (definitions.released || definitions.raw || '—') : 'Unavailable';
        defsInline.textContent = available ? released : 'scanner offline';
        defReleased.textContent = released;
        defEngine.textContent = available ? (definitions.engine || '—') : '—';
        defSignature.textContent = available ? (definitions.signature || '—') : '—';
        defStatus.textContent = available ? 'Database loaded' : 'Not reachable';
        defStatus.className = available ? '' : 'av-warn';
    }

    async function pollHealth() {
        try {
            const data = await ctx.proxy('api/health');
            state.ready = data.status === 'ready';
            healthEl.className = 'av-pill ready';
            healthEl.textContent = 'Scanner ready';
            healthEl.title = data.engine || '';
            startupEl.hidden = true;
            readyIcon.className = 'av-check';
            readyIcon.textContent = '✓';
            readyTitle.textContent = 'Ready to scan';
            if (!state.scanning) setStatus('Ready.');
        } catch (err) {
            state.ready = false;
            const starting = err?.status === 503;
            healthEl.className = `av-pill ${starting ? 'starting' : 'offline'}`;
            healthEl.textContent = starting ? 'Starting scanner…' : 'Scanner offline';
            healthEl.title = '';
            startupEl.hidden = false;
            readyIcon.className = 'av-check waiting';
            readyIcon.textContent = '…';
            readyTitle.textContent = 'Waiting for ClamAV';
            if (!state.scanning) {
                setStatus(starting
                    ? (err?.detail || 'ClamAV is starting. The first run downloads signatures and can take a few minutes.')
                    : `Waiting for the scanner: ${errorText(err)}`, starting ? 'warn' : 'error');
            }
        }
        updateBusy();
    }

    async function loadStatus() {
        try {
            const data = await ctx.proxy('api/status');
            if (Array.isArray(data.allowed_roots) && data.allowed_roots.length) {
                state.allowedRoots = data.allowed_roots;
            }
            quarantineCount.textContent = String(data.quarantine_count || 0);
            renderDefinitions(data.definitions || {});
        } catch {
            /* pollHealth already surfaces connectivity problems */
        }
    }

    function renderResults(data) {
        const infected = data.infected || [];
        const errors = data.errors || [];
        const stored = (data.quarantined || []).filter((item) => item.stored).length;
        cleanEl.textContent = String(data.clean || 0);
        threatEl.textContent = String(infected.length);
        skippedEl.textContent = String(data.skipped || 0);
        errorEl.textContent = String(errors.length);
        results.hidden = false;
        threatBox.hidden = infected.length === 0;
        threatRows.replaceChildren(...infected.map((item) => {
            const row = document.createElement('tr');
            const file = document.createElement('td');
            file.className = 'path';
            file.textContent = item.file;
            const signature = document.createElement('td');
            signature.className = 'av-danger';
            signature.textContent = item.signature;
            row.append(file, signature);
            return row;
        }));
        quarantineNote.textContent = infected.length
            ? (stored ? `${stored} file(s) copied to quarantine.` : 'No copies stored (check the processing method or size limit).')
            : '';
        errorBox.hidden = errors.length === 0;
        errorRows.replaceChildren(...errors.map((item) => {
            const entry = document.createElement('li');
            entry.textContent = item;
            return entry;
        }));
        engineEl.textContent = data.engine || '';
    }

    function mergeResults(target, data) {
        target.clean += data.clean || 0;
        target.skipped += data.skipped || 0;
        target.infected.push(...(data.infected || []));
        target.errors.push(...(data.errors || []));
        target.quarantined.push(...(data.quarantined || []));
        target.engine = data.engine || target.engine;
        return target;
    }

    async function runScan(paths, label, options = {}) {
        if (state.scanning) return;
        if (!state.ready) {
            setStatus('Scanner is not ready yet — wait for ClamAV to finish starting.', 'warn');
            return;
        }
        const targets = (Array.isArray(paths) ? paths : [paths])
            .map((path) => String(path || '').trim())
            .filter(Boolean);
        if (!targets.length) {
            setStatus('Enter a folder or file to scan.', 'warn');
            return;
        }
        const groups = options.sequential ? targets.map((path) => [path]) : [targets];
        const merged = { clean: 0, skipped: 0, infected: [], errors: [], quarantined: [], engine: '' };
        state.scanning = true;
        updateBusy();
        setStatus(`${label}: scanning ${targets.join(', ')}… this can take a while.`);
        try {
            for (let index = 0; index < groups.length; index += 1) {
                if (options.sequential) {
                    setStatus(`${label}: scanning ${groups[index][0]}… (${index + 1}/${groups.length})`);
                }
                const data = await ctx.proxy('api/scan', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ paths: groups[index], trigger: 'manual' }),
                });
                renderResults(mergeResults(merged, data));
            }
            const threats = merged.infected.length;
            setStatus(threats
                ? `${label} finished: ${threats} threat${threats === 1 ? '' : 's'} found.`
                : `${label} finished: ${merged.clean} clean file${merged.clean === 1 ? '' : 's'} checked${merged.skipped ? `, ${merged.skipped} skipped` : ''}.`,
                threats ? 'error' : '');
            if (threats) {
                notify(`AntiVirus: ${threats} threat${threats === 1 ? '' : 's'} found`, 'error');
            }
            await Promise.all([loadStatus(), loadLogs(), loadQuarantine()]);
        } catch (err) {
            setStatus(`${label} failed: ${errorText(err)}`, 'error');
        } finally {
            state.scanning = false;
            updateBusy();
        }
    }

    function renderQuarantine() {
        const items = state.quarantine;
        quarantineCount.textContent = String(items.length);
        quarantineEmpty.hidden = items.length > 0;
        quarantineBox.hidden = items.length === 0;
        quarantineClear.disabled = items.length === 0;
        quarantineRows.replaceChildren(...items.map((item) => {
            const row = document.createElement('tr');
            const file = document.createElement('td');
            file.className = 'path';
            file.textContent = item.file;
            const signature = document.createElement('td');
            signature.textContent = item.signature || '—';
            const detected = document.createElement('td');
            detected.textContent = formatTime(item.detected_at);
            const size = document.createElement('td');
            size.className = 'num';
            size.textContent = item.stored ? `${Math.max(1, Math.round((item.size || 0) / 1024))} KB` : 'not stored';
            const actions = document.createElement('td');
            actions.className = 'actions';
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'av-btn danger small';
            remove.textContent = 'Delete';
            remove.addEventListener('click', () => deleteQuarantine(item.id));
            actions.append(remove);
            row.append(file, signature, detected, size, actions);
            return row;
        }));
    }

    async function loadQuarantine() {
        try {
            const data = await ctx.proxy('api/quarantine');
            state.quarantine = data.items || [];
            renderQuarantine();
        } catch {
            /* keep the previous list */
        }
    }

    async function deleteQuarantine(id) {
        try {
            await ctx.proxy(`api/quarantine/${encodeURIComponent(id)}/delete`, { method: 'POST' });
            await Promise.all([loadQuarantine(), loadStatus()]);
        } catch (err) {
            setStatus(`Could not delete the quarantined file: ${errorText(err)}`, 'error');
        }
    }

    function renderLogs() {
        const items = state.logs;
        logsEmpty.hidden = items.length > 0;
        logsBox.hidden = items.length === 0;
        logsClear.disabled = items.length === 0;
        logRows.replaceChildren(...items.map((entry) => {
            const row = document.createElement('tr');
            const started = document.createElement('td');
            started.textContent = formatTime(entry.started_at);
            const trigger = document.createElement('td');
            trigger.textContent = entry.trigger === 'schedule' ? 'Scheduled' : 'Manual';
            const target = document.createElement('td');
            target.className = 'path';
            target.textContent = (entry.paths || []).join(', ') || '—';
            const clean = document.createElement('td');
            clean.className = 'num';
            clean.textContent = String(entry.clean || 0);
            const threats = document.createElement('td');
            threats.className = `num${entry.threats ? ' av-danger' : ''}`;
            threats.textContent = String(entry.threats || 0);
            const errors = document.createElement('td');
            errors.className = `num${entry.errors ? ' av-warn' : ''}`;
            errors.textContent = String(entry.errors || 0);
            const duration = document.createElement('td');
            duration.className = 'num';
            duration.textContent = formatDuration(entry.duration_s);
            row.append(started, trigger, target, clean, threats, errors, duration);
            return row;
        }));
    }

    async function loadLogs() {
        try {
            const data = await ctx.proxy('api/logs?limit=50');
            state.logs = data.items || [];
            renderLogs();
        } catch {
            /* keep the previous list */
        }
    }

    function fillSettingsForm(settings) {
        const current = settings || {};
        settingsForm.querySelectorAll('input[name="processing"]').forEach((radio) => {
            radio.checked = radio.value === (current.processing || 'quarantine');
        });
        whitelistTags.replaceChildren(...(current.whitelist || []).map((path) => {
            const tag = document.createElement('span');
            tag.className = 'av-tag';
            tag.append(document.createTextNode(path));
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.textContent = '×';
            remove.title = 'Remove';
            remove.setAttribute('aria-label', `Remove ${path}`);
            remove.addEventListener('click', () => {
                state.settings.whitelist = (state.settings.whitelist || []).filter((entry) => entry !== path);
                fillSettingsForm(state.settings);
            });
            tag.append(remove);
            return tag;
        }));
        extensionsInput.value = (current.only_extensions || []).join(', ');
        maxFileInput.value = String(current.max_file_mb ?? 0);
        maxQuarantineInput.value = String(current.max_quarantine_mb ?? 512);
        smartInput.checked = Boolean(current.smart_scan);
        reloadSignaturesInput.checked = Boolean(current.reload_signatures);
    }

    async function loadSettings() {
        try {
            const data = await ctx.proxy('api/settings');
            state.settings = data.settings || data;
            state.defaults = data.defaults || null;
            fillSettingsForm(state.settings);
        } catch (err) {
            setStatus(`Could not load settings: ${errorText(err)}`, 'error');
        }
    }

    function readSettingsForm() {
        const processing = settingsForm.querySelector('input[name="processing"]:checked');
        return {
            processing: processing ? processing.value : 'report',
            whitelist: (state.settings && state.settings.whitelist) || [],
            only_extensions: extensionsInput.value.split(',').map((item) => item.trim()).filter(Boolean),
            max_file_mb: Number(maxFileInput.value) || 0,
            max_quarantine_mb: Number(maxQuarantineInput.value) || 0,
            smart_scan: smartInput.checked,
            reload_signatures: reloadSignaturesInput.checked,
        };
    }

    async function saveSettings() {
        try {
            const data = await ctx.proxy('api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ settings: readSettingsForm() }),
            });
            state.settings = data.settings;
            fillSettingsForm(state.settings);
            setStatus('Settings applied.');
            notify('AntiVirus: settings saved', 'success');
        } catch (err) {
            setStatus(`Could not save settings: ${errorText(err)}`, 'error');
        }
    }

    async function resetSettings() {
        try {
            const data = await ctx.proxy('api/settings/reset', { method: 'POST' });
            state.settings = data.settings;
            fillSettingsForm(state.settings);
            setStatus('Settings reset to defaults.');
            notify('AntiVirus: settings reset', 'success');
        } catch (err) {
            setStatus(`Could not reset settings: ${errorText(err)}`, 'error');
        }
    }

    function renderSchedules() {
        const items = state.schedules;
        schedulesEmpty.hidden = items.length > 0;
        schedulesBox.hidden = items.length === 0;
        scheduleRows.replaceChildren(...items.map((schedule) => {
            const row = document.createElement('tr');
            const target = document.createElement('td');
            target.className = 'path';
            target.textContent = (schedule.paths || [schedule.path]).join(', ');
            const label = document.createElement('td');
            label.textContent = scheduleLabel(schedule);
            const next = document.createElement('td');
            next.textContent = schedule.enabled ? formatTime(schedule.next_run) : '—';
            const last = document.createElement('td');
            last.textContent = formatTime(schedule.last_run);
            const status = document.createElement('td');
            status.textContent = schedule.enabled ? 'Enabled' : 'Disabled';
            status.className = schedule.enabled ? '' : 'av-muted';
            const actions = document.createElement('td');
            actions.className = 'actions';
            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'av-btn small';
            toggle.textContent = schedule.enabled ? 'Disable' : 'Enable';
            toggle.addEventListener('click', () => toggleSchedule(schedule.id));
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'av-btn danger small';
            remove.textContent = 'Delete';
            remove.style.marginLeft = '6px';
            remove.addEventListener('click', () => deleteSchedule(schedule.id));
            actions.append(toggle, remove);
            row.append(target, label, next, last, status, actions);
            return row;
        }));
    }

    async function loadSchedules() {
        try {
            const data = await ctx.proxy('api/schedules');
            state.schedules = data.items || [];
            renderSchedules();
        } catch {
            /* keep the previous list */
        }
    }

    async function addSchedule(event) {
        event.preventDefault();
        try {
            const payload = {
                path: schedPath.value,
                frequency: schedFrequency.value,
                weekday: Number(schedWeekday.value) || 0,
                time: schedTime.value,
                enabled: true,
            };
            await ctx.proxy('api/schedules', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            await loadSchedules();
            setStatus('Schedule added.');
            notify('AntiVirus: schedule added', 'success');
        } catch (err) {
            setStatus(`Could not add the schedule: ${errorText(err)}`, 'error');
        }
    }

    async function toggleSchedule(id) {
        try {
            await ctx.proxy(`api/schedules/${encodeURIComponent(id)}/toggle`, { method: 'POST' });
            await loadSchedules();
        } catch (err) {
            setStatus(`Could not update the schedule: ${errorText(err)}`, 'error');
        }
    }

    async function deleteSchedule(id) {
        try {
            await ctx.proxy(`api/schedules/${encodeURIComponent(id)}/delete`, { method: 'POST' });
            await loadSchedules();
        } catch (err) {
            setStatus(`Could not delete the schedule: ${errorText(err)}`, 'error');
        }
    }

    async function reloadDefinitions() {
        setStatus('Reloading virus definitions…');
        try {
            const data = await ctx.proxy('api/definitions/reload', { method: 'POST' });
            renderDefinitions(data.definitions || {});
            setStatus('Virus definitions reloaded.');
        } catch (err) {
            setStatus(`Definition reload failed: ${errorText(err)}`, 'error');
        }
    }

    function showTab(name) {
        if (!VIEWS[name]) name = 'overview';
        state.tab = name;
        root.querySelectorAll('[data-tab]').forEach((button) => {
            const active = button.dataset.tab === name;
            button.classList.toggle('is-active', active);
            if (active) button.setAttribute('aria-current', 'page');
            else button.removeAttribute('aria-current');
        });
        root.querySelectorAll('[data-panel]').forEach((panel) => {
            panel.hidden = panel.dataset.panel !== name;
        });
        const [title, subtitle] = VIEWS[name];
        pageTitle.textContent = title;
        pageSub.textContent = subtitle;
        if (name === 'quarantine') loadQuarantine();
        else if (name === 'logs') loadLogs();
        else if (name === 'settings') loadSettings();
        else if (name === 'schedule') loadSchedules();
        else if (name === 'update') loadStatus();
    }

    root.querySelectorAll('[data-tab]').forEach((button) => {
        button.addEventListener('click', () => showTab(button.dataset.tab));
    });

    root.querySelectorAll('[data-scan]').forEach((button) => {
        button.addEventListener('click', () => {
            if (button.dataset.scan === 'full') runScan(state.allowedRoots, 'Full scan', { sequential: true });
            else if (button.dataset.scan === 'quick') {
                const home = state.allowedRoots.includes('/home') ? '/home' : state.allowedRoots[0];
                runScan([home], 'Quick scan');
            } else {
                pathEl.focus();
                pathEl.select();
                setStatus('Enter a folder or file and choose “Scan target”.');
            }
        });
    });
    customBtn.addEventListener('click', () => runScan([pathEl.value], 'Custom scan'));
    pathEl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') runScan([pathEl.value], 'Custom scan');
    });
    quarantineClear.addEventListener('click', async () => {
        if (!window.confirm('Delete every quarantined copy?')) return;
        try {
            await ctx.proxy('api/quarantine/clear', { method: 'POST' });
            await Promise.all([loadQuarantine(), loadStatus()]);
            setStatus('Quarantine emptied.');
        } catch (err) {
            setStatus(`Could not empty quarantine: ${errorText(err)}`, 'error');
        }
    });
    logsClear.addEventListener('click', async () => {
        if (!window.confirm('Clear the scan log?')) return;
        try {
            await ctx.proxy('api/logs/clear', { method: 'POST' });
            await loadLogs();
            setStatus('Log cleared.');
        } catch (err) {
            setStatus(`Could not clear the log: ${errorText(err)}`, 'error');
        }
    });
    settingsForm.addEventListener('submit', (event) => {
        event.preventDefault();
        saveSettings();
    });
    $('[data-settings-reset]').addEventListener('click', resetSettings);
    $('[data-whitelist-add]').addEventListener('click', () => {
        const value = whitelistInput.value.trim();
        if (!value) return;
        const current = state.settings || {};
        current.whitelist = Array.from(new Set([...(current.whitelist || []), value]));
        state.settings = current;
        whitelistInput.value = '';
        fillSettingsForm(current);
    });
    schedFrequency.addEventListener('change', () => {
        schedWeekdayWrap.hidden = schedFrequency.value !== 'weekly';
    });
    scheduleForm.addEventListener('submit', addSchedule);
    $('[data-defs-reload]').addEventListener('click', reloadDefinitions);

    versionEl.textContent = `v${String(ctx?.pkg?.version || '2.1.0')}`;
    renderQuickPaths();
    showTab('overview');

    (async () => {
        try {
            const info = await ctx.proxy('api/info');
            if (Array.isArray(info.allowed_roots) && info.allowed_roots.length) {
                state.allowedRoots = info.allowed_roots;
                renderQuickPaths();
            }
        } catch {
            /* keep the default roots */
        }
        await Promise.allSettled([
            pollHealth(), loadStatus(), loadSettings(),
            loadQuarantine(), loadLogs(), loadSchedules(),
        ]);
    })();

    const healthTimer = setInterval(pollHealth, 5000);
    const statusTimer = setInterval(loadStatus, 20000);
    const observer = new MutationObserver(() => {
        if (!document.body.contains(root)) {
            clearInterval(healthTimer);
            clearInterval(statusTimer);
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
}
