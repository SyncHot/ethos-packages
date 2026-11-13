// EthOS native package UI — Domains
// Contract: export function render(container, ctx). Every service call goes
// through ctx.proxy(), so the control plane stays bound to loopback.
//
// Caddy does the proxying and the certificates; this window is the control
// plane. The layout follows the EthOS AntiVirus package: a left rail with the
// sections, one pane per section, and the same panels/pills/tables/forms.

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
    --dm-icon-1: rgba(37, 99, 235, 0.22);
    --dm-icon-2: rgba(37, 99, 235, 0.05);
    display: flex;
    height: 100%;
    overflow: hidden;
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
    --dm-icon-1: rgba(56, 189, 248, 0.5);
    --dm-icon-2: rgba(2, 132, 199, 0.16);
}
.dm-root, .dm-root * { box-sizing: border-box; }
.dm-root [hidden] { display: none !important; }
.dm-root button, .dm-root input, .dm-root select, .dm-root textarea { font-family: inherit; }
.dm-side {
    flex: none; width: 218px; display: flex; flex-direction: column; gap: 16px;
    padding: 20px 14px; border-right: 1px solid var(--dm-border);
    background: var(--dm-side-bg); overflow-y: auto;
}
.dm-brand { display: flex; align-items: center; gap: 10px; padding: 0 8px; }
.dm-brand-icon { font-size: 26px; line-height: 1; }
.dm-brand strong { display: block; font-size: 14px; letter-spacing: -0.01em; }
.dm-brand small { display: block; color: var(--dm-muted); font-size: 10px; }
.dm-nav { display: flex; flex-direction: column; gap: 2px; }
.dm-nav-item {
    display: block; width: 100%; padding: 9px 11px; border: 0; border-radius: 9px;
    background: transparent; color: var(--dm-muted); font-size: 12px; font-weight: 600;
    text-align: left; cursor: pointer;
}
.dm-nav-item:hover { background: var(--dm-hover); color: var(--dm-text); }
.dm-nav-item.is-active { background: var(--dm-accent-soft); color: var(--dm-text); }
.dm-nav-item:focus-visible { outline: 2px solid var(--dm-accent); outline-offset: 1px; }
.dm-side-foot { margin-top: auto; display: flex; flex-direction: column; gap: 8px; padding: 0 8px; }
.dm-side-note { color: var(--dm-muted); font-size: 10px; line-height: 1.6; }
.dm-main { flex: 1; min-width: 0; overflow-y: auto; padding: 24px 28px 32px; }
.dm-main h1 { margin: 0; font-size: clamp(22px, 3.4vw, 30px); letter-spacing: -0.02em; }
.dm-page-sub { margin: 4px 0 0; color: var(--dm-muted); font-size: 12px; line-height: 1.5; }
.dm-pill { align-self: flex-start; padding: 5px 10px; border-radius: 999px; font-size: 10px; font-weight: 700; border: 1px solid var(--dm-border); white-space: nowrap; }
.dm-pill.ready { color: var(--dm-green); border-color: var(--dm-green-border); background: var(--dm-green-soft); }
.dm-pill.starting { color: var(--dm-amber); border-color: var(--dm-amber-border); background: var(--dm-amber-soft); }
.dm-pill.offline { color: var(--dm-red); border-color: var(--dm-red-border); background: var(--dm-red-soft); }
.dm-status { min-height: 18px; margin: 12px 0 0; color: var(--dm-accent); font-size: 12px; font-weight: 600; }
.dm-status.error { color: var(--dm-red); }
.dm-status.warn { color: var(--dm-amber); }
.dm-callout { margin: 10px 0 0; padding: 9px 11px; border: 1px solid var(--dm-amber-border); border-radius: 9px; background: var(--dm-amber-soft); color: var(--dm-muted); font-size: 11px; line-height: 1.55; }
.dm-callout.error { border-color: var(--dm-red-border); background: var(--dm-red-soft); color: var(--dm-red); }
.dm-view { display: flex; flex-direction: column; gap: 14px; margin-top: 16px; }
.dm-view[hidden] { display: none; }
.dm-panel { padding: 17px 18px; border: 1px solid var(--dm-border); border-radius: 15px; background: var(--dm-panel); }
.dm-panel h2 { margin: 0 0 3px; font-size: 13px; }
.dm-muted { margin: 0; color: var(--dm-muted); font-size: 11px; line-height: 1.55; }
.dm-ready { display: flex; align-items: center; gap: 14px; }
.dm-check { flex: none; width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; background: var(--dm-green-soft); color: var(--dm-green); font-size: 17px; font-weight: 700; }
.dm-check.waiting { background: var(--dm-amber-soft); color: var(--dm-amber); }
.dm-check.bad { background: var(--dm-red-soft); color: var(--dm-red); }
.dm-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 11px; }
.dm-card-btn {
    display: flex; flex-direction: column; align-items: center; gap: 9px;
    padding: 20px 12px; border: 1px solid var(--dm-border); border-radius: 14px;
    background: var(--dm-surface); color: var(--dm-text);
    font-size: 12px; font-weight: 600; cursor: pointer;
    transition: transform 0.12s ease, border-color 0.12s ease;
}
.dm-card-btn:hover:not(:disabled) { border-color: var(--dm-accent); transform: translateY(-1px); }
.dm-card-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.dm-card-btn:focus-visible { outline: 2px solid var(--dm-accent); outline-offset: 2px; }
.dm-card-btn small { color: var(--dm-muted); font-size: 10px; font-weight: 400; text-align: center; line-height: 1.4; }
.dm-card-icon { width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center; font-size: 23px; border: 1px solid var(--dm-accent-border); background: radial-gradient(circle at 30% 25%, var(--dm-icon-1), var(--dm-icon-2)); }
.dm-label { display: block; margin-bottom: 7px; font-size: 10px; letter-spacing: 0.09em; text-transform: uppercase; color: var(--dm-muted); }
.dm-row { display: flex; gap: 8px; flex-wrap: wrap; }
.dm-input {
    flex: 1; min-width: 0; padding: 9px 11px;
    border: 1px solid var(--dm-border); border-radius: 9px;
    background: var(--dm-input-bg); color: var(--dm-text);
    font: 12px ui-monospace, SFMono-Regular, Menlo, monospace;
}
.dm-input:focus-visible, .dm-btn:focus-visible, .dm-select:focus-visible { outline: 2px solid var(--dm-accent); outline-offset: 2px; }
.dm-btn {
    padding: 8px 13px; border: 1px solid var(--dm-border); border-radius: 9px;
    background: var(--dm-surface); color: var(--dm-text);
    font-size: 11px; font-weight: 600; cursor: pointer;
}
.dm-btn:hover:not(:disabled) { border-color: var(--dm-accent); }
.dm-btn:disabled { opacity: 0.5; cursor: wait; }
.dm-btn.primary { border-color: var(--dm-accent-border); background: var(--dm-accent-soft); }
.dm-btn.danger { border-color: var(--dm-red-border); color: var(--dm-red); }
.dm-btn.small { padding: 4px 9px; font-size: 10px; font-family: ui-monospace, monospace; }
.dm-hint { margin: 8px 0 0; color: var(--dm-muted); font-size: 10px; line-height: 1.5; }
.dm-root code { color: var(--dm-accent); font-family: ui-monospace, monospace; }
.dm-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 9px; }
.dm-summary div { padding: 11px; border: 1px solid var(--dm-border); border-radius: 10px; background: var(--dm-surface); }
.dm-summary span { display: block; font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--dm-muted); margin-bottom: 4px; }
.dm-summary strong { font-size: 20px; font-variant-numeric: tabular-nums; }
.dm-danger-text { color: var(--dm-red); }
.dm-amber-text { color: var(--dm-amber); }
.dm-toolbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.dm-toolbar > div { min-width: 0; }
.dm-table { width: 100%; border-collapse: collapse; font-size: 11px; }
.dm-table th, .dm-table td { text-align: left; padding: 8px 9px; border-bottom: 1px solid var(--dm-border); vertical-align: top; }
.dm-table th { color: var(--dm-muted); font-size: 9px; letter-spacing: 0.08em; text-transform: uppercase; white-space: nowrap; }
.dm-table tbody tr:last-child td { border-bottom: 0; }
.dm-table td.mono { font-family: ui-monospace, monospace; word-break: break-all; }
.dm-table td.actions { text-align: right; white-space: nowrap; }
.dm-table td.center { text-align: center; }
.dm-domain { font-weight: 600; word-break: break-all; }
.dm-scroll { overflow-x: auto; margin-top: 12px; }
.dm-empty { margin-top: 12px; padding: 24px; text-align: center; color: var(--dm-muted); font-size: 11px; border: 1px dashed var(--dm-border); border-radius: 11px; }
.dm-empty[hidden] { display: none; }
.dm-field { display: flex; flex-direction: column; gap: 6px; margin-top: 14px; }
.dm-field:first-of-type { margin-top: 8px; }
.dm-field > label { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--dm-muted); }
.dm-checkline { display: flex; align-items: flex-start; gap: 9px; margin-top: 12px; font-size: 12px; cursor: pointer; }
.dm-checkline input { margin: 2px 0 0; accent-color: var(--dm-accent); }
.dm-checkline small { display: block; margin-top: 2px; color: var(--dm-muted); font-size: 10px; line-height: 1.45; }
.dm-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.dm-tag { display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 999px; border: 1px solid var(--dm-tag-border); background: var(--dm-tag-bg); color: var(--dm-tag-text); font: 10px ui-monospace, monospace; }
.dm-tag.muted { border-color: var(--dm-border); background: transparent; color: var(--dm-muted); }
.dm-tag.ok { color: var(--dm-green); border-color: var(--dm-green-border); background: var(--dm-green-soft); }
.dm-tag.warn { color: var(--dm-amber); border-color: var(--dm-amber-border); background: var(--dm-amber-soft); }
.dm-tag.bad { color: var(--dm-red); border-color: var(--dm-red-border); background: var(--dm-red-soft); }
.dm-form-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--dm-border); }
.dm-def-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 9px; margin-top: 12px; }
.dm-def-grid div { padding: 11px; border: 1px solid var(--dm-border); border-radius: 10px; background: var(--dm-surface); }
.dm-def-grid span { display: block; margin-bottom: 4px; font-size: 9px; letter-spacing: 0.09em; text-transform: uppercase; color: var(--dm-muted); }
.dm-def-grid strong { font-size: 12px; font-weight: 600; word-break: break-word; }
.dm-advanced { margin-top: 16px; padding: 0 12px; border: 1px solid var(--dm-border); border-radius: 11px; background: var(--dm-surface); }
.dm-advanced > summary { padding: 10px 0; cursor: pointer; font-size: 10px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--dm-muted); }
.dm-advanced > *:last-child { margin-bottom: 12px; }
.dm-pre { margin: 10px 0 0; padding: 11px 12px; border: 1px solid var(--dm-border); border-radius: 10px; background: var(--dm-surface); color: var(--dm-text); font: 11px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; max-height: 260px; overflow: auto; white-space: pre-wrap; word-break: break-word; }
.dm-select { padding: 8px 10px; border: 1px solid var(--dm-border); border-radius: 9px; background: var(--dm-input-bg); color: var(--dm-text); font-size: 11px; }
@media (max-width: 780px) {
    .dm-root { flex-direction: column; }
    .dm-side { width: auto; flex-direction: row; align-items: center; gap: 10px; padding: 10px 12px; border-right: 0; border-bottom: 1px solid var(--dm-border); overflow-x: auto; }
    .dm-brand { padding: 0; }
    .dm-brand small, .dm-side-note { display: none; }
    .dm-nav { flex-direction: row; }
    .dm-nav-item { white-space: nowrap; }
    .dm-side-foot { margin: 0 0 0 auto; padding: 0; }
    .dm-main { padding: 16px; }
    .dm-cards, .dm-summary { grid-template-columns: 1fr; }
}
`;

const VIEWS = {
    overview: ['Overview', 'Proxy health, certificates and shortcuts to the usual tasks.'],
    routes: ['Routes', 'Every domain mapped to a host and port, or redirected.'],
    certificates: ['Certificates', "Issued by Let's Encrypt and renewed automatically before they expire."],
    settings: ['Settings', 'Certificate authority account and package information.'],
    diagnostics: ['Diagnostics', 'DNS preflight, the applied configuration and the proxy log.'],
};

const TARGET_ETHOS = 'host.docker.internal:9000';

function esc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function daysLabel(days) {
    if (days === null || days === undefined) return 'expiry unknown';
    if (days < 0) return 'expired';
    if (days === 0) return 'expires today';
    return `${days} day${days === 1 ? '' : 's'} left`;
}

function certTone(days) {
    if (days === null || days === undefined) return 'muted';
    if (days < 0) return 'bad';
    return days <= 30 ? 'warn' : 'ok';
}

export function render(container, ctx) {
    container.replaceChildren();

    const style = document.createElement('style');
    style.textContent = STYLE;
    const root = document.createElement('div');
    root.className = 'dm-root';
    root.innerHTML = `
        <aside class="dm-side">
            <div class="dm-brand">
                <span class="dm-brand-icon" aria-hidden="true">🌐</span>
                <div><strong>Domains</strong><small data-version>EthOS package</small></div>
            </div>
            <nav class="dm-nav" aria-label="Domains sections">
                <button class="dm-nav-item is-active" type="button" data-tab="overview">Overview</button>
                <button class="dm-nav-item" type="button" data-tab="routes">Routes</button>
                <button class="dm-nav-item" type="button" data-tab="certificates">Certificates</button>
                <button class="dm-nav-item" type="button" data-tab="settings">Settings</button>
                <button class="dm-nav-item" type="button" data-tab="diagnostics">Diagnostics</button>
            </nav>
            <div class="dm-side-foot">
                <span class="dm-pill starting" role="status" aria-live="polite" data-health>Connecting…</span>
                <span class="dm-pill" data-counts>—</span>
                <span class="dm-side-note">Reverse proxy on ports 80 and 443. Caddy keeps certificates renewed on its own.</span>
            </div>
        </aside>
        <main class="dm-main">
            <header>
                <h1 data-page-title>Overview</h1>
                <p class="dm-page-sub" data-page-sub>${esc(VIEWS.overview[1])}</p>
                <p class="dm-status" role="status" aria-live="polite" data-status></p>
                <p class="dm-callout" data-notice hidden></p>
            </header>

            <section class="dm-view" data-panel="overview">
                <div class="dm-panel dm-ready">
                    <span class="dm-check waiting" data-ready-icon aria-hidden="true">•</span>
                    <div>
                        <h2 data-ready-title>Connecting to the proxy…</h2>
                        <p class="dm-muted" data-ready-text>The package service is starting. This page refreshes itself.</p>
                    </div>
                </div>
                <div class="dm-summary">
                    <div><span>Routes</span><strong data-stat-routes>0</strong></div>
                    <div><span>Certificates</span><strong data-stat-certs>0</strong></div>
                    <div><span>Expiring ≤ 30d</span><strong data-stat-expiring>0</strong></div>
                    <div><span>Disabled</span><strong data-stat-disabled>0</strong></div>
                </div>
                <div class="dm-cards">
                    <button class="dm-card-btn" type="button" data-action="add-route" data-testid="dm-add-domain">
                        <span class="dm-card-icon" aria-hidden="true">＋</span>
                        <span>Add a domain</span>
                        <small>Forward it to a host and port</small>
                    </button>
                    <button class="dm-card-btn" type="button" data-action="check-dns">
                        <span class="dm-card-icon" aria-hidden="true">⌁</span>
                        <span>Check DNS</span>
                        <small>See where a name resolves today</small>
                    </button>
                    <button class="dm-card-btn" type="button" data-action="reload-proxy">
                        <span class="dm-card-icon" aria-hidden="true">↻</span>
                        <span>Reload proxy</span>
                        <small>Re-apply the saved configuration</small>
                    </button>
                </div>
                <div data-overview-callouts></div>
            </section>

            <section class="dm-view" data-panel="routes" hidden>
                <div class="dm-panel">
                    <div class="dm-toolbar">
                        <div>
                            <h2>Routes</h2>
                            <p class="dm-muted">A route maps one or more domain names to a target. Certificates are requested for every enabled name.</p>
                        </div>
                        <button class="dm-btn primary" type="button" data-action="add-route" data-testid="dm-add-route">+ Add domain</button>
                    </div>
                </div>
                <section class="dm-panel" data-form-panel hidden>
                    <div class="dm-toolbar">
                        <div>
                            <h2 data-form-title>New route</h2>
                            <p class="dm-muted" data-form-sub>Point a domain at a host and port, or at another URL.</p>
                        </div>
                    </div>
                    <form data-route-form data-testid="dm-route-form" novalidate>
                        <div class="dm-field">
                            <label for="dm-f-domains">Domain(s)</label>
                            <input class="dm-input" id="dm-f-domains" name="domains" placeholder="app.example.com" autocomplete="off" spellcheck="false">
                            <p class="dm-hint">Comma separated. Each name needs an A/AAAA record pointing here before a certificate can be issued.</p>
                        </div>
                        <div class="dm-field">
                            <label for="dm-f-upstream">Forward to</label>
                            <div class="dm-row">
                                <input class="dm-input" id="dm-f-upstream" name="upstream" placeholder="192.168.1.10:8080" autocomplete="off" spellcheck="false">
                                <button class="dm-btn" type="button" data-action="use-ethos">This EthOS NAS</button>
                            </div>
                            <p class="dm-hint">host:port. Use an IP address for LAN devices; <code>172.17.0.1</code> is this host.</p>
                        </div>
                        <div class="dm-field">
                            <label for="dm-f-redirect">Redirect instead (optional)</label>
                            <input class="dm-input" id="dm-f-redirect" name="redirect_to" placeholder="https://example.com" autocomplete="off" spellcheck="false">
                            <p class="dm-hint">Returns a permanent redirect instead of proxying. Leave the target above empty when using it.</p>
                        </div>
                        <div class="dm-field">
                            <label for="dm-f-note">Label (optional)</label>
                            <input class="dm-input" id="dm-f-note" name="note" placeholder="Home Assistant" autocomplete="off">
                        </div>
                        <details class="dm-advanced">
                            <summary>Advanced</summary>
                            <div class="dm-field">
                                <label for="dm-f-headers">Extra response headers</label>
                                <textarea class="dm-input" id="dm-f-headers" name="headers" rows="3" spellcheck="false" placeholder="Strict-Transport-Security: max-age=63072000; includeSubDomains"></textarea>
                                <p class="dm-hint">One <code>Name: value</code> pair per line, applied to every response of this route.</p>
                            </div>
                            <label class="dm-checkline"><input type="checkbox" name="preserve_host">
                                <span>Keep the original Host header
                                    <small>On by default. Turn off to send the target address as Host instead.</small>
                                </span>
                            </label>
                            <label class="dm-checkline"><input type="checkbox" name="stream">
                                <span>Low-latency streaming
                                    <small>Disables response buffering for SSE and live logs. WebSockets work either way.</small>
                                </span>
                            </label>
                        </details>
                        <label class="dm-checkline"><input type="checkbox" name="enabled">
                            <span>Enabled <small>A disabled route stays configured but is removed from the proxy.</small></span>
                        </label>
                        <p class="dm-status error" data-form-error data-testid="dm-form-error"></p>
                        <div class="dm-form-actions">
                            <button class="dm-btn" type="button" data-action="cancel-form">Cancel</button>
                            <button class="dm-btn primary" type="submit" data-testid="dm-save-route">Save route</button>
                        </div>
                    </form>
                </section>
                <section class="dm-panel">
                    <div class="dm-scroll" data-routes-box hidden>
                        <table class="dm-table" data-testid="dm-routes-table">
                            <thead><tr><th>Domain</th><th>Target</th><th>Options</th><th>Certificate</th><th>On</th><th style="text-align:right;">Actions</th></tr></thead>
                            <tbody data-route-rows></tbody>
                        </table>
                    </div>
                    <div class="dm-empty" data-routes-empty data-testid="dm-routes-empty" hidden>No routes yet. Add a domain to forward it to this NAS or another device.</div>
                </section>
            </section>

            <section class="dm-view" data-panel="certificates" hidden>
                <div class="dm-summary">
                    <div><span>Certificates</span><strong data-cert-total>0</strong></div>
                    <div><span>Valid &gt; 30d</span><strong data-cert-valid>0</strong></div>
                    <div><span>Expiring ≤ 30d</span><strong data-cert-expiring>0</strong></div>
                    <div><span>Expired</span><strong data-cert-expired>0</strong></div>
                </div>
                <div class="dm-panel">
                    <div class="dm-toolbar">
                        <div>
                            <h2>Managed certificates</h2>
                            <p class="dm-muted" data-cert-note>Reading certificate storage…</p>
                        </div>
                    </div>
                    <div class="dm-scroll" data-certs-box hidden>
                        <table class="dm-table" data-testid="dm-certs-table">
                            <thead><tr><th>Names</th><th>Issuer</th><th>Expires</th><th>Status</th></tr></thead>
                            <tbody data-cert-rows></tbody>
                        </table>
                    </div>
                    <div class="dm-empty" data-certs-empty hidden>No certificates yet. Caddy requests one as soon as a domain resolves here and ports 80/443 are reachable.</div>
                </div>
            </section>

            <section class="dm-view" data-panel="settings" hidden>
                <section class="dm-panel">
                    <div class="dm-toolbar">
                        <div>
                            <h2>Certificate authority</h2>
                            <p class="dm-muted">Used when requesting and renewing certificates. Let's Encrypt sends expiry notices to this address.</p>
                        </div>
                    </div>
                    <form data-settings-form data-testid="dm-settings-form">
                        <div class="dm-field">
                            <label for="dm-email">ACME email</label>
                            <input class="dm-input" id="dm-email" name="acme_email" placeholder="you@example.com" autocomplete="off" spellcheck="false">
                            <p class="dm-hint">Optional. Without it the account is still created, but nobody is told about problems.</p>
                        </div>
                        <label class="dm-checkline"><input type="checkbox" name="staging">
                            <span>Use the Let's Encrypt staging CA
                                <small>Issues untrusted certificates and has no rate limits — use it while testing a new domain.</small>
                            </span>
                        </label>
                        <p class="dm-callout" data-staging-warning hidden>Staging certificates are not trusted by browsers. Turn this off once the route works; Caddy then re-issues real certificates.</p>
                        <div class="dm-form-actions">
                            <button class="dm-btn primary" type="submit" data-testid="dm-save-settings">Save settings</button>
                        </div>
                    </form>
                </section>
                <section class="dm-panel">
                    <div class="dm-toolbar">
                        <div>
                            <h2>Package</h2>
                            <p class="dm-muted">The proxy keeps serving traffic while EthOS restarts; these numbers come from the control plane.</p>
                        </div>
                        <button class="dm-btn" type="button" data-action="open-diagnostics">Open diagnostics</button>
                    </div>
                    <div class="dm-def-grid">
                        <div><span>Version</span><strong data-pkg-version>—</strong></div>
                        <div><span>Routes</span><strong data-pkg-routes>0</strong></div>
                        <div><span>Certificates</span><strong data-pkg-certs>0</strong></div>
                        <div><span>Proxy</span><strong data-pkg-proxy>—</strong></div>
                    </div>
                </section>
            </section>

            <section class="dm-view" data-panel="diagnostics" hidden>
                <section class="dm-panel">
                    <div class="dm-toolbar">
                        <div>
                            <h2>DNS check</h2>
                            <p class="dm-muted">Resolves a name from inside the NAS. It must point at your public address before a certificate can be issued.</p>
                        </div>
                    </div>
                    <label class="dm-label" for="dm-dns-input">Domain</label>
                    <div class="dm-row">
                        <input class="dm-input" id="dm-dns-input" placeholder="app.example.com" autocomplete="off" spellcheck="false">
                        <button class="dm-btn primary" type="button" data-action="dns">Check DNS</button>
                    </div>
                    <pre class="dm-pre" data-dns-out data-testid="dm-dns-out"></pre>
                </section>
                <section class="dm-panel">
                    <div class="dm-toolbar">
                        <div>
                            <h2>Proxy log</h2>
                            <p class="dm-muted">Certificate issuance and upstream errors appear here.</p>
                        </div>
                        <div class="dm-row">
                            <select class="dm-select" data-log-limit aria-label="Log lines">
                                <option value="120">120 lines</option>
                                <option value="300">300 lines</option>
                                <option value="500">500 lines</option>
                            </select>
                            <button class="dm-btn" type="button" data-action="refresh-log">Refresh</button>
                        </div>
                    </div>
                    <pre class="dm-pre" data-log-out data-testid="dm-log-out"></pre>
                </section>
                <section class="dm-panel">
                    <div class="dm-toolbar">
                        <div>
                            <h2>Configuration</h2>
                            <p class="dm-muted">What Caddy accepted last, and whether the saved routes were rejected.</p>
                        </div>
                        <button class="dm-btn" type="button" data-action="reload-proxy">Reload proxy</button>
                    </div>
                    <div class="dm-def-grid">
                        <div><span>Last applied</span><strong data-apply-at>never</strong></div>
                        <div><span>Warnings</span><strong data-apply-warnings>0</strong></div>
                        <div><span>Error</span><strong data-apply-error>none</strong></div>
                    </div>
                    <div data-apply-detail></div>
                </section>
            </section>
        </main>`;
    container.append(style, root);

    const $ = (selector) => root.querySelector(selector);
    const $$ = (selector) => [...root.querySelectorAll(selector)];
    const healthEl = $('[data-health]');
    const countsEl = $('[data-counts]');
    const statusEl = $('[data-status]');
    const noticeEl = $('[data-notice]');
    const pageTitle = $('[data-page-title]');
    const pageSub = $('[data-page-sub]');
    const routesBox = $('[data-routes-box]');
    const routesEmpty = $('[data-routes-empty]');
    const formPanel = $('[data-form-panel]');
    const form = $('[data-route-form]');
    const formTitle = $('[data-form-title]');
    const formSub = $('[data-form-sub]');
    const formError = $('[data-form-error]');
    const settingsForm = $('[data-settings-form]');
    const dnsInput = $('#dm-dns-input');
    const dnsOut = $('[data-dns-out]');
    const logOut = $('[data-log-out]');

    const state = {
        tab: 'overview',
        data: null,
        editingId: '',
        busy: false,
        notice: null,
        dns: '',
        logLimit: 120,
    };

    // ── Plumbing ────────────────────────────────────────────────────────────
    function notify(message, type) {
        if (typeof ctx.notify === 'function') ctx.notify(message, type);
    }

    function proxyError(err) {
        return (err && (err.detail || err.message)) || 'Request failed';
    }

    function call(path, body) {
        if (body === undefined) return ctx.proxy(path);
        return ctx.proxy(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    }

    function setStatus(text, kind = '') {
        statusEl.textContent = text;
        statusEl.className = 'dm-status' + (kind ? ` ${kind}` : '');
    }

    function showNotice(text, kind = '') {
        state.notice = text ? { text, kind } : null;
        renderNotice();
    }

    function renderNotice() {
        const active = state.notice;
        noticeEl.hidden = !active;
        noticeEl.className = 'dm-callout' + (active && active.kind ? ` ${active.kind}` : '');
        noticeEl.textContent = active ? active.text : '';
    }

    const data = () => state.data || {};
    const routes = () => data().routes || [];
    const certs = () => (data().certs && data().certs.items) || [];
    const proxyUp = () => !!(data().caddy && data().caddy.reachable);

    function certFor(domains) {
        return certs().find((item) => (item.names || []).some((name) => domains.includes(name))) || null;
    }

    // The API stores domains as a list, but stay tolerant of a string so one
    // malformed record cannot break the whole table.
    function domainsOf(route) {
        const value = (route && route.domains) || [];
        if (Array.isArray(value)) return value.filter(Boolean);
        return String(value).split(/[,\s]+/).filter(Boolean);
    }

    function routeFlags(route) {
        const flags = [];
        if (route.redirect_to) flags.push('redirect');
        if (route.preserve_host === false) flags.push('host → target');
        if (route.stream) flags.push('streaming');
        if ((route.headers || []).length) flags.push(`${route.headers.length} header${route.headers.length === 1 ? '' : 's'}`);
        return flags;
    }

    // ── Chrome ──────────────────────────────────────────────────────────────
    function renderChrome() {
        if (!state.data) {
            healthEl.className = 'dm-pill starting';
            healthEl.textContent = 'Connecting…';
            countsEl.textContent = '—';
            return;
        }
        const alive = proxyUp();
        healthEl.className = `dm-pill ${alive ? 'ready' : 'offline'}`;
        healthEl.textContent = alive ? 'Proxy running' : 'Proxy offline';
        healthEl.title = alive ? 'Caddy is serving ports 80 and 443' : 'The proxy container is not answering';

        const total = routes().length;
        const count = certs().length;
        countsEl.textContent = `${total} route${total === 1 ? '' : 's'} · ${count} cert${count === 1 ? '' : 's'}`;

        const version = data().version || ctx?.pkg?.version;
        $('[data-version]').textContent = version ? `v${version}` : 'EthOS package';
        $('[data-pkg-version]').textContent = version ? `v${version}` : '—';
        $('[data-pkg-routes]').textContent = String(total);
        $('[data-pkg-certs]').textContent = String(count);
        $('[data-pkg-proxy]').textContent = alive ? 'Running' : 'Offline';
    }

    function renderOverview() {
        const alive = proxyUp();
        const icon = $('[data-ready-icon]');
        icon.className = `dm-check ${alive ? '' : 'bad'}`;
        icon.textContent = alive ? '✓' : '!';
        $('[data-ready-title]').textContent = alive ? 'Proxy running' : 'Proxy offline';
        $('[data-ready-text]').textContent = alive
            ? `${routes().length} route${routes().length === 1 ? '' : 's'} and ${certs().length} certificate${certs().length === 1 ? '' : 's'} managed by Caddy on ports 80 and 443.`
            : 'The proxy container is not running. Check that ports 80 and 443 are free, then start the package again.';

        const expiring = certs().filter((item) => (item.days_left ?? 999) <= 30).length;
        const disabled = routes().filter((route) => route.enabled === false).length;
        $('[data-stat-routes]').textContent = String(routes().length);
        $('[data-stat-certs]').textContent = String(certs().length);
        $('[data-stat-expiring]').textContent = String(expiring);
        $('[data-stat-disabled]').textContent = String(disabled);
        $('[data-stat-expiring]').className = expiring ? 'dm-amber-text' : '';

        const callouts = [];
        if (data().certs && data().certs.ok === false) {
            callouts.push(['Certificate storage is not readable, so expiry dates are hidden. Reinstall the package to restore the data volume mount.', 'error']);
        }
        if (data().apply && data().apply.error) {
            callouts.push([`The last change was rejected: ${data().apply.error}`, 'error']);
        }
        if (data().settings && data().settings.staging) {
            callouts.push(['Staging certificates are active — browsers will not trust them. Turn staging off in Settings once a new route works.', '']);
        }
        $('[data-overview-callouts]').innerHTML = callouts
            .map(([text, kind]) => `<p class="dm-callout ${kind}">${esc(text)}</p>`)
            .join('');
    }

    function renderRoutes() {
        const list = routes();
        routesEmpty.hidden = list.length > 0;
        routesBox.hidden = list.length === 0;
        if (!list.length) return;

        $('[data-route-rows]').innerHTML = list.map((route) => {
            const names = domainsOf(route);
            const cert = certFor(names);
            const tone = cert ? certTone(cert.days_left) : 'muted';
            const certCell = `<span class="dm-tag ${tone}">${esc(cert ? daysLabel(cert.days_left) : 'pending')}</span>`;
            const flags = routeFlags(route);
            return `<tr data-testid="dm-route-${esc(route.id)}">
                <td>
                    <div class="dm-domain">${esc(names.join(', '))}</div>
                    ${route.note ? `<div class="dm-muted">${esc(route.note)}</div>` : ''}
                </td>
                <td class="mono">${route.redirect_to ? `↪ ${esc(route.redirect_to)}` : esc(route.upstream || '—')}</td>
                <td>${flags.length ? `<div class="dm-tags">${flags.map((flag) => `<span class="dm-tag muted">${esc(flag)}</span>`).join('')}</div>` : '<span class="dm-muted">—</span>'}</td>
                <td>${certCell}</td>
                <td class="center"><input type="checkbox" data-toggle="${esc(route.id)}"${route.enabled === false ? '' : ' checked'} aria-label="Route enabled"></td>
                <td class="actions">
                    <button class="dm-btn small" type="button" data-edit="${esc(route.id)}" data-testid="dm-edit-${esc(route.id)}">Edit</button>
                    <button class="dm-btn small danger" type="button" data-delete="${esc(route.id)}" data-testid="dm-delete-${esc(route.id)}">Delete</button>
                </td>
            </tr>`;
        }).join('');

        $$('[data-route-rows] [data-edit]').forEach((button) => {
            button.addEventListener('click', () => openForm(button.dataset.edit));
        });
        $$('[data-route-rows] [data-delete]').forEach((button) => {
            button.addEventListener('click', () => deleteRoute(button.dataset.delete));
        });
        $$('[data-route-rows] [data-toggle]').forEach((input) => {
            input.addEventListener('change', () => {
                const route = routes().find((item) => item.id === input.dataset.toggle);
                if (!route) return;
                saveRoute({ ...route, enabled: input.checked }, `Route ${input.checked ? 'enabled' : 'disabled'}`);
            });
        });
    }

    function renderCertificates() {
        const items = certs();
        const expiring = items.filter((item) => (item.days_left ?? 999) >= 0 && (item.days_left ?? 999) <= 30).length;
        const expired = items.filter((item) => (item.days_left ?? 0) < 0).length;
        $('[data-cert-total]').textContent = String(items.length);
        $('[data-cert-valid]').textContent = String(items.length - expiring - expired);
        $('[data-cert-expiring]').textContent = String(expiring);
        $('[data-cert-expired]').textContent = String(expired);
        $('[data-cert-expiring]').className = expiring ? 'dm-amber-text' : '';
        $('[data-cert-expired]').className = expired ? 'dm-danger-text' : '';

        $('[data-cert-note]').textContent = data().certs && data().certs.ok === false
            ? 'Certificate storage is not readable, so this list is empty.'
            : `${items.length} certificate${items.length === 1 ? '' : 's'}. Caddy renews each one about 30 days before it expires.`;

        const box = $('[data-certs-box]');
        const empty = $('[data-certs-empty]');
        box.hidden = items.length === 0;
        empty.hidden = items.length > 0;
        if (!items.length) return;

        $('[data-cert-rows]').innerHTML = items.map((item) => {
            const tone = certTone(item.days_left);
            return `<tr>
                <td class="mono">${esc((item.names || []).join(', '))}</td>
                <td>${esc(item.issuer || 'unknown')}${item.source && /staging/.test(item.source) ? ' <span class="dm-tag muted">staging</span>' : ''}</td>
                <td class="mono">${esc(item.not_after || '—')}</td>
                <td><span class="dm-tag ${tone}">${esc(daysLabel(item.days_left))}</span></td>
            </tr>`;
        }).join('');
    }

    function renderSettings() {
        const settings = data().settings || {};
        const email = $('#dm-email');
        // Never fight the user: only fill the field when it is not being edited.
        if (document.activeElement !== email && state.tab === 'settings') {
            email.value = settings.acme_email || '';
        }
        settingsForm.querySelector('[name="staging"]').checked = !!settings.staging;
        $('[data-staging-warning]').hidden = !settings.staging;
    }

    function renderDiagnostics() {
        const apply = data().apply || {};
        $('[data-apply-at]').textContent = apply.at || 'never';
        $('[data-apply-warnings]').textContent = String((apply.warnings || []).length);
        $('[data-apply-error]').textContent = apply.error || 'none';
        $('[data-apply-error]').className = apply.error ? 'dm-danger-text' : '';
        const detail = $('[data-apply-detail]');
        const warnings = (apply.warnings || [])
            .map((item) => (typeof item === 'string' ? item : `${item.file || 'Caddyfile'}:${item.line || '?'} ${item.message || ''}`));
        detail.innerHTML = apply.error
            ? `<p class="dm-callout error">${esc(apply.error)}</p>`
            : warnings.map((line) => `<p class="dm-callout">${esc(line)}</p>`).join('');
    }

    function renderActive() {
        renderChrome();
        renderNotice();
        if (!state.data) return;
        if (state.tab === 'overview') renderOverview();
        else if (state.tab === 'routes') renderRoutes();
        else if (state.tab === 'certificates') renderCertificates();
        else if (state.tab === 'settings') renderSettings();
        else if (state.tab === 'diagnostics') renderDiagnostics();
    }

    // ── Navigation ──────────────────────────────────────────────────────────
    function showTab(name) {
        if (!VIEWS[name]) name = 'overview';
        state.tab = name;
        $$('[data-tab]').forEach((button) => {
            const active = button.dataset.tab === name;
            button.classList.toggle('is-active', active);
            if (active) button.setAttribute('aria-current', 'page');
            else button.removeAttribute('aria-current');
        });
        $$('[data-panel]').forEach((panel) => { panel.hidden = panel.dataset.panel !== name; });
        const [title, subtitle] = VIEWS[name];
        pageTitle.textContent = title;
        pageSub.textContent = subtitle;
        renderActive();
        if (name === 'diagnostics') loadLogs();
        if (name === 'overview' && !state.data) loadState(false);
    }

    $$('[data-tab]').forEach((button) => {
        button.addEventListener('click', () => showTab(button.dataset.tab));
    });

    // ── Route form ──────────────────────────────────────────────────────────
    function openForm(routeId) {
        const route = routeId ? routes().find((item) => item.id === routeId) : null;
        state.editingId = route ? route.id : '';
        formPanel.hidden = false;
        formError.textContent = '';
        formTitle.textContent = route ? `Edit ${domainsOf(route)[0] || 'route'}` : 'New route';
        formSub.textContent = route
            ? 'Saving pushes the whole configuration to Caddy; a rejected route changes nothing.'
            : 'Point a domain at a host and port, or at another URL.';
        form.querySelector('[name="domains"]').value = route ? domainsOf(route).join(', ') : '';
        form.querySelector('[name="upstream"]').value = route ? route.upstream || '' : '';
        form.querySelector('[name="redirect_to"]').value = route ? route.redirect_to || '' : '';
        form.querySelector('[name="note"]').value = route ? route.note || '' : '';
        form.querySelector('[name="headers"]').value = route ? (route.headers || []).join('\n') : '';
        form.querySelector('[name="preserve_host"]').checked = route ? route.preserve_host !== false : true;
        form.querySelector('[name="stream"]').checked = route ? !!route.stream : false;
        form.querySelector('[name="enabled"]').checked = route ? route.enabled !== false : true;
        formPanel.scrollIntoView({ block: 'nearest' });
        form.querySelector('[name="domains"]').focus();
    }

    function closeForm() {
        state.editingId = '';
        formPanel.hidden = true;
        formError.textContent = '';
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (state.busy) return;
        const values = {
            domains: form.querySelector('[name="domains"]').value,
            upstream: form.querySelector('[name="upstream"]').value,
            redirect_to: form.querySelector('[name="redirect_to"]').value,
            note: form.querySelector('[name="note"]').value,
            headers: form.querySelector('[name="headers"]').value,
            preserve_host: form.querySelector('[name="preserve_host"]').checked,
            stream: form.querySelector('[name="stream"]').checked,
            enabled: form.querySelector('[name="enabled"]').checked,
        };
        if (state.editingId) values.id = state.editingId;
        if (!values.domains.trim()) { formError.textContent = 'Enter at least one domain.'; return; }
        if (!values.upstream.trim() && !values.redirect_to.trim()) {
            formError.textContent = 'Enter a target (host:port) or a redirect URL.';
            return;
        }
        const editing = !!state.editingId;
        const ok = await saveRoute(values, editing ? 'Route updated' : 'Route added');
        if (ok) closeForm();
    });

    $$('[data-action="cancel-form"]').forEach((button) => button.addEventListener('click', closeForm));
    $$('[data-action="use-ethos"]').forEach((button) => button.addEventListener('click', () => {
        form.querySelector('[name="upstream"]').value = TARGET_ETHOS;
        const note = form.querySelector('[name="note"]');
        if (!note.value) note.value = 'EthOS';
    }));
    $$('[data-action="add-route"]').forEach((button) => button.addEventListener('click', () => {
        showTab('routes');
        openForm('');
    }));

    // ── Mutations ───────────────────────────────────────────────────────────
    async function saveRoute(payload, successMessage) {
        if (state.busy) return false;
        state.busy = true;
        setStatus('Saving route…');
        try {
            const response = await call('api/routes', payload);
            if (response.state) state.data = response.state;
            showNotice('');
            setStatus(successMessage || 'Saved.');
            notify(successMessage || 'Saved', 'success');
            renderActive();
            return true;
        } catch (err) {
            const message = proxyError(err);
            formError.textContent = message;
            setStatus(message, 'error');
            notify(message, 'error');
            return false;
        } finally {
            state.busy = false;
        }
    }

    async function deleteRoute(routeId) {
        if (state.busy) return;
        const route = routes().find((item) => item.id === routeId);
        const label = domainsOf(route).join(', ') || 'this route';
        if (!window.confirm(`Delete the route for ${label}?`)) return;
        state.busy = true;
        setStatus('Deleting route…');
        try {
            const response = await call('api/routes/delete', { id: routeId });
            if (response.state) state.data = response.state;
            showNotice('');
            setStatus(`Removed ${label}.`);
            notify(`Removed ${label}`, 'success');
            if (state.editingId === routeId) closeForm();
            renderActive();
        } catch (err) {
            showNotice(proxyError(err), 'error');
            setStatus(proxyError(err), 'error');
        } finally {
            state.busy = false;
        }
    }

    settingsForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (state.busy) return;
        state.busy = true;
        setStatus('Saving settings…');
        try {
            const response = await call('api/settings', {
                acme_email: $('#dm-email').value,
                staging: settingsForm.querySelector('[name="staging"]').checked,
            });
            if (response.state) state.data = response.state;
            showNotice('');
            setStatus('Settings saved. Caddy re-issues certificates when the CA changes.');
            notify('Settings saved', 'success');
            renderActive();
        } catch (err) {
            showNotice(proxyError(err), 'error');
            setStatus(proxyError(err), 'error');
            notify(proxyError(err), 'error');
        } finally {
            state.busy = false;
        }
    });

    async function reloadProxy() {
        setStatus('Reloading the proxy configuration…');
        try {
            const response = await call('api/apply', {});
            if (response.state) state.data = response.state;
            showNotice('');
            setStatus('Configuration re-applied.');
            notify('Proxy configuration reloaded', 'success');
            renderActive();
        } catch (err) {
            showNotice(proxyError(err), 'error');
            setStatus(proxyError(err), 'error');
        }
    }

    // ── Diagnostics actions ─────────────────────────────────────────────────
    async function runDns() {
        const domain = (dnsInput.value || '').trim();
        if (!domain) { dnsOut.textContent = 'Enter a domain first.'; return; }
        state.dns = domain;
        dnsOut.textContent = 'Resolving…';
        try {
            const result = await call(`api/dns?domain=${encodeURIComponent(domain)}`);
            const lines = [`${result.domain}: ${(result.addresses || []).join(', ') || 'no records'}`];
            if (result.private) lines.push('This is a private address — Let\'s Encrypt cannot reach it through the internet.');
            if (result.hint) lines.push(result.hint);
            dnsOut.textContent = lines.join('\n');
        } catch (err) {
            dnsOut.textContent = proxyError(err);
        }
    }

    async function loadLogs() {
        try {
            const result = await call(`api/logs?limit=${state.logLimit}`);
            const lines = (result.lines || []).map((line) => {
                try {
                    const entry = JSON.parse(line);
                    const when = entry.ts ? new Date(entry.ts * 1000).toISOString().slice(11, 19) : '';
                    return `${when} ${String(entry.level || 'info').toUpperCase().padEnd(5)} ${entry.msg || line}`;
                } catch (_) {
                    return line;  // not JSON: show it verbatim (Caddy also logs plain text)
                }
            });
            logOut.textContent = lines.length ? lines.join('\n') : 'No log lines yet. Certificate issuance appears here.';
        } catch (err) {
            logOut.textContent = proxyError(err);
        }
    }

    $$('[data-action="dns"]').forEach((button) => button.addEventListener('click', runDns));
    dnsInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') { event.preventDefault(); runDns(); }
    });
    $$('[data-action="refresh-log"]').forEach((button) => button.addEventListener('click', loadLogs));
    $('[data-log-limit]').addEventListener('change', (event) => {
        state.logLimit = Number(event.target.value) || 120;
        loadLogs();
    });
    $$('[data-action="reload-proxy"]').forEach((button) => button.addEventListener('click', reloadProxy));
    $$('[data-action="check-dns"]').forEach((button) => button.addEventListener('click', () => {
        showTab('diagnostics');
        dnsInput.focus();
    }));
    $$('[data-action="open-diagnostics"]').forEach((button) => button.addEventListener('click', () => showTab('diagnostics')));

    // ── Data ────────────────────────────────────────────────────────────────
    async function loadState(quiet) {
        try {
            state.data = await call('api/state');
            if (quiet) renderActive();
            else { setStatus(''); renderActive(); }
        } catch (err) {
            healthEl.className = 'dm-pill offline';
            healthEl.textContent = 'Service unavailable';
            if (!quiet) {
                showNotice(proxyError(err), 'error');
                setStatus(proxyError(err), 'error');
            }
        }
    }

    // ── Boot ────────────────────────────────────────────────────────────────
    renderChrome();
    renderNotice();
    showTab('overview');
    dnsInput.value = state.dns;

    const stateTimer = setInterval(() => {
        if (!document.hidden) loadState(true);
    }, 15000);
    const logTimer = setInterval(() => {
        if (!document.hidden && state.tab === 'diagnostics') loadLogs();
    }, 60000);
    const observer = new MutationObserver(() => {
        if (!document.body.contains(root)) {
            clearInterval(stateTimer);
            clearInterval(logTimer);
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
}
