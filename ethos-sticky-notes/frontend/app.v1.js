// EthOS Sticky Notes — native Package Center app.
//
// Per-account notes on colored cards behind the package proxy:
//   /api/packages/ethos-sticky-notes/proxy/api/sticky-notes/…
// The module is loaded from a blob URL, so everything it needs arrives through
// `ctx` in render(); it must stay self-contained (no relative imports).
//
// Visual contract: shared package shell (218 px rail, text-only nav, panels,
// summary tiles, tokens for light and dark) — see the packages repo AGENTS.md.

const STYLE = `
.sn-root {
    color-scheme: light;
    --sn-bg: #eef2f7;
    --sn-side-bg: rgba(255, 255, 255, 0.88);
    --sn-panel: #ffffff;
    --sn-surface: #f4f5f7;
    --sn-input-bg: #ffffff;
    --sn-border: #e3e5e8;
    --sn-text: #1f2430;
    --sn-muted: #5b6472;
    --sn-accent: #2563eb;
    --sn-accent-soft: rgba(37, 99, 235, 0.10);
    --sn-accent-border: rgba(37, 99, 235, 0.45);
    --sn-green: #15803d;
    --sn-green-soft: rgba(21, 128, 61, 0.12);
    --sn-green-border: rgba(21, 128, 61, 0.35);
    --sn-red: #b91c1c;
    --sn-red-soft: rgba(185, 28, 28, 0.08);
    --sn-red-border: rgba(185, 28, 28, 0.32);
    --sn-amber: #b45309;
    --sn-amber-soft: rgba(180, 83, 9, 0.10);
    --sn-amber-border: rgba(180, 83, 9, 0.30);
    --sn-hover: rgba(15, 23, 42, 0.06);
    --sn-glow-1: rgba(37, 99, 235, 0.08);
    --sn-glow-2: rgba(250, 204, 21, 0.10);
    --sn-note-yellow-bg: #fef9c3;
    --sn-note-yellow-border: #fde047;
    --sn-note-yellow-text: #854d0e;
    --sn-note-pink-bg: #fce7f3;
    --sn-note-pink-border: #f9a8d4;
    --sn-note-pink-text: #9d174d;
    --sn-note-blue-bg: #dbeafe;
    --sn-note-blue-border: #93c5fd;
    --sn-note-blue-text: #1e40af;
    --sn-note-green-bg: #dcfce7;
    --sn-note-green-border: #86efac;
    --sn-note-green-text: #166534;
    --sn-note-orange-bg: #ffedd5;
    --sn-note-orange-border: #fdba74;
    --sn-note-orange-text: #9a3412;
    display: flex;
    height: 100%;
    overflow: hidden;
    background:
        radial-gradient(circle at 8% 4%, var(--sn-glow-1), transparent 40%),
        radial-gradient(circle at 92% 96%, var(--sn-glow-2), transparent 40%),
        var(--sn-bg);
    color: var(--sn-text);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
:root.dark .sn-root {
    color-scheme: dark;
    --sn-bg: #08111d;
    --sn-side-bg: rgba(2, 6, 23, 0.45);
    --sn-panel: rgba(148, 163, 184, 0.07);
    --sn-surface: rgba(15, 23, 42, 0.45);
    --sn-input-bg: rgba(2, 6, 23, 0.55);
    --sn-border: rgba(148, 163, 184, 0.22);
    --sn-text: #e2e8f0;
    --sn-muted: #94a3b8;
    --sn-accent: #38bdf8;
    --sn-accent-soft: rgba(56, 189, 248, 0.14);
    --sn-accent-border: rgba(56, 189, 248, 0.55);
    --sn-green: #4ade80;
    --sn-green-soft: rgba(74, 222, 128, 0.14);
    --sn-green-border: rgba(74, 222, 128, 0.45);
    --sn-red: #f87171;
    --sn-red-soft: rgba(248, 113, 113, 0.12);
    --sn-red-border: rgba(248, 113, 113, 0.45);
    --sn-amber: #fbbf24;
    --sn-amber-soft: rgba(251, 191, 36, 0.10);
    --sn-amber-border: rgba(251, 191, 36, 0.45);
    --sn-hover: rgba(148, 163, 184, 0.09);
    --sn-glow-1: rgba(56, 189, 248, 0.16);
    --sn-glow-2: rgba(250, 204, 21, 0.10);
}
.sn-root, .sn-root * { box-sizing: border-box; }
.sn-root button, .sn-root input, .sn-root textarea { font-family: inherit; }
.sn-side {
    flex: none; width: 218px; display: flex; flex-direction: column; gap: 16px;
    padding: 20px 14px; border-right: 1px solid var(--sn-border);
    background: var(--sn-side-bg); overflow-y: auto;
}
.sn-brand { display: flex; align-items: center; gap: 10px; padding: 0 8px; }
.sn-brand-icon { font-size: 26px; line-height: 1; }
.sn-brand strong { display: block; font-size: 14px; letter-spacing: -0.01em; }
.sn-brand small { display: block; color: var(--sn-muted); font-size: 10px; }
.sn-nav { display: flex; flex-direction: column; gap: 2px; }
.sn-nav-item {
    display: block; width: 100%; padding: 9px 11px; border: 0; border-radius: 9px;
    background: transparent; color: var(--sn-muted); font-size: 12px; font-weight: 600;
    text-align: left; cursor: pointer;
}
.sn-nav-item:hover { background: var(--sn-hover); color: var(--sn-text); }
.sn-nav-item.is-active { background: var(--sn-accent-soft); color: var(--sn-text); }
.sn-nav-item:focus-visible { outline: 2px solid var(--sn-accent); outline-offset: 1px; }
.sn-side-foot { margin-top: auto; display: flex; flex-direction: column; gap: 8px; padding: 0 8px; }
.sn-side-note { color: var(--sn-muted); font-size: 10px; line-height: 1.6; }
.sn-main { flex: 1; min-width: 0; overflow-y: auto; padding: 24px 28px 32px; }
.sn-main h1 { margin: 0; font-size: clamp(22px, 3.4vw, 30px); letter-spacing: -0.02em; }
.sn-page-sub { margin: 4px 0 0; color: var(--sn-muted); font-size: 12px; line-height: 1.5; }
.sn-pill { align-self: flex-start; padding: 5px 10px; border-radius: 999px; font-size: 10px; font-weight: 700; border: 1px solid var(--sn-border); white-space: nowrap; }
.sn-pill.ready { color: var(--sn-green); border-color: var(--sn-green-border); background: var(--sn-green-soft); }
.sn-pill.starting { color: var(--sn-amber); border-color: var(--sn-amber-border); background: var(--sn-amber-soft); }
.sn-pill.offline { color: var(--sn-red); border-color: var(--sn-red-border); background: var(--sn-red-soft); }
.sn-status { min-height: 18px; margin: 12px 0 0; color: var(--sn-accent); font-size: 12px; font-weight: 600; }
.sn-status.error { color: var(--sn-red); }
.sn-status.warn { color: var(--sn-amber); }
.sn-startup { margin: 10px 0 0; padding: 9px 11px; border: 1px solid var(--sn-amber-border); border-radius: 9px; background: var(--sn-amber-soft); color: var(--sn-muted); font-size: 11px; line-height: 1.55; }
.sn-startup.info { border-color: var(--sn-accent-border); background: var(--sn-accent-soft); }
.sn-view { display: flex; flex-direction: column; gap: 14px; margin-top: 16px; }
.sn-panel { padding: 17px 18px; border: 1px solid var(--sn-border); border-radius: 15px; background: var(--sn-panel); }
.sn-panel h2 { margin: 0 0 3px; font-size: 13px; }
.sn-muted { margin: 0; color: var(--sn-muted); font-size: 11px; line-height: 1.55; }
.sn-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; }
.sn-summary div { padding: 11px; border: 1px solid var(--sn-border); border-radius: 10px; background: var(--sn-surface); }
.sn-summary span { display: block; font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--sn-muted); margin-bottom: 4px; }
.sn-summary strong { font-size: 20px; font-variant-numeric: tabular-nums; }
.sn-toolbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.sn-toolbar > div { min-width: 0; }
.sn-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.sn-btn {
    padding: 8px 13px; border: 1px solid var(--sn-border); border-radius: 9px;
    background: var(--sn-surface); color: var(--sn-text);
    font-size: 11px; font-weight: 600; cursor: pointer;
}
.sn-btn:hover:not(:disabled) { border-color: var(--sn-accent); }
.sn-btn:disabled { opacity: 0.5; cursor: default; }
.sn-btn.primary { border-color: var(--sn-accent-border); background: var(--sn-accent-soft); }
.sn-btn.small { padding: 4px 9px; font-size: 10px; }
.sn-btn.danger { border-color: var(--sn-red-border); color: var(--sn-red); }
.sn-btn:focus-visible { outline: 2px solid var(--sn-accent); outline-offset: 2px; }
.sn-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px; margin-top: 14px; align-items: start; }
.sn-note {
    position: relative; display: flex; flex-direction: column; gap: 8px;
    padding: 12px 12px 9px; border-radius: 12px;
    border: 1.5px solid var(--sn-note-border); background: var(--sn-note-bg); color: var(--sn-note-text);
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.18);
}
.sn-note.c-yellow { --sn-note-bg: var(--sn-note-yellow-bg); --sn-note-border: var(--sn-note-yellow-border); --sn-note-text: var(--sn-note-yellow-text); }
.sn-note.c-pink { --sn-note-bg: var(--sn-note-pink-bg); --sn-note-border: var(--sn-note-pink-border); --sn-note-text: var(--sn-note-pink-text); }
.sn-note.c-blue { --sn-note-bg: var(--sn-note-blue-bg); --sn-note-border: var(--sn-note-blue-border); --sn-note-text: var(--sn-note-blue-text); }
.sn-note.c-green { --sn-note-bg: var(--sn-note-green-bg); --sn-note-border: var(--sn-note-green-border); --sn-note-text: var(--sn-note-green-text); }
.sn-note.c-orange { --sn-note-bg: var(--sn-note-orange-bg); --sn-note-border: var(--sn-note-orange-border); --sn-note-text: var(--sn-note-orange-text); }
.sn-note-text {
    width: 100%; min-height: 80px; max-height: 260px; resize: none; overflow-y: auto;
    padding: 0; border: 0; outline: none; background: transparent;
    color: inherit; caret-color: inherit; font-size: 13px; line-height: 1.5;
}
.sn-note-text::placeholder { opacity: 0.55; }
.sn-note-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.sn-colors { display: flex; gap: 5px; }
.sn-color {
    width: 15px; height: 15px; padding: 0; border-radius: 50%; cursor: pointer;
    border: 1px solid rgba(0, 0, 0, 0.22); background: var(--sn-swatch);
}
.sn-color.c-yellow { --sn-swatch: var(--sn-note-yellow-border); }
.sn-color.c-pink { --sn-swatch: var(--sn-note-pink-border); }
.sn-color.c-blue { --sn-swatch: var(--sn-note-blue-border); }
.sn-color.c-green { --sn-swatch: var(--sn-note-green-border); }
.sn-color.c-orange { --sn-swatch: var(--sn-note-orange-border); }
.sn-color.is-current { box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35); }
.sn-color:focus-visible { outline: 2px solid rgba(0, 0, 0, 0.55); outline-offset: 1px; }
.sn-note-actions { display: flex; gap: 3px; }
.sn-icon-btn {
    width: 22px; height: 22px; padding: 0; border: 0; border-radius: 6px; cursor: pointer;
    background: rgba(0, 0, 0, 0.13); color: inherit; font-size: 12px; line-height: 1;
    display: inline-flex; align-items: center; justify-content: center;
}
.sn-icon-btn:hover:not(:disabled) { background: rgba(0, 0, 0, 0.26); }
.sn-icon-btn:disabled { opacity: 0.3; cursor: default; }
.sn-icon-btn.del:hover { background: rgba(190, 30, 30, 0.55); color: #ffffff; }
.sn-icon-btn:focus-visible { outline: 2px solid rgba(0, 0, 0, 0.55); outline-offset: 1px; }
.sn-empty { margin-top: 14px; padding: 26px 20px; text-align: center; color: var(--sn-muted); font-size: 11px; border: 1px dashed var(--sn-border); border-radius: 11px; }
.sn-empty strong { display: block; color: var(--sn-text); margin-bottom: 4px; }
.sn-def-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 9px; margin-top: 12px; }
.sn-def-grid div { padding: 11px; border: 1px solid var(--sn-border); border-radius: 10px; background: var(--sn-surface); }
.sn-def-grid span { display: block; margin-bottom: 4px; font-size: 9px; letter-spacing: 0.09em; text-transform: uppercase; color: var(--sn-muted); }
.sn-def-grid strong { font-size: 12px; font-weight: 600; word-break: break-word; }
.sn-root code { color: var(--sn-accent); font-family: ui-monospace, monospace; }
@media (max-width: 780px) {
    .sn-root { flex-direction: column; }
    .sn-side { width: auto; flex-direction: row; align-items: center; gap: 10px; padding: 10px 12px; border-right: 0; border-bottom: 1px solid var(--sn-border); overflow-x: auto; }
    .sn-brand { padding: 0; }
    .sn-brand small, .sn-side-note { display: none; }
    .sn-nav { flex-direction: row; }
    .sn-nav-item { white-space: nowrap; }
    .sn-side-foot { margin: 0 0 0 auto; padding: 0; }
    .sn-main { padding: 16px; }
    .sn-summary { grid-template-columns: 1fr; }
    .sn-grid { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) { .sn-root * { transition: none !important; animation: none !important; } }
`;

const VIEWS = {
    notes: ['Notes', 'Your notes, in display order.'],
    about: ['About', 'How this package stores your notes.'],
};

const COLORS = ['yellow', 'pink', 'blue', 'green', 'orange'];
const SAVE_DEBOUNCE_MS = 500;

export async function render(container, ctx) {
    container.replaceChildren();
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const $ = (selector) => root.querySelector(selector);

    const state = {
        view: 'notes',
        notes: [],
        dirty: new Map(),   // note id → latest typed text, pending save
        timers: new Map(),  // note id → debounce handle
    };

    const style = document.createElement('style');
    style.textContent = STYLE;
    const root = document.createElement('div');
    root.className = 'sn-root';
    root.setAttribute('data-testid', 'sn-root');
    root.innerHTML = `
        <aside class="sn-side">
            <div class="sn-brand">
                <span class="sn-brand-icon" aria-hidden="true">🗒️</span>
                <div><strong>Sticky Notes</strong><small data-version>EthOS package</small></div>
            </div>
            <nav class="sn-nav" aria-label="Sticky Notes sections">
                ${Object.entries(VIEWS).map(([id, view], index) => `<button class="sn-nav-item${index === 0 ? ' is-active' : ''}" type="button" data-nav="${id}" data-testid="sn-nav-${id}">${esc(view[0])}</button>`).join('')}
            </nav>
            <div class="sn-side-foot">
                <span class="sn-pill starting" id="sn-pill" role="status" aria-live="polite" data-testid="sn-pill">Connecting…</span>
                <span class="sn-side-note">Private to your EthOS account. Stored on the NAS.</span>
            </div>
        </aside>
        <main class="sn-main">
            <header>
                <h1 id="sn-title">Notes</h1>
                <p class="sn-page-sub" id="sn-sub">${esc(VIEWS.notes[1])}</p>
                <p class="sn-status" id="sn-status" role="status" aria-live="polite">Ready.</p>
            </header>
            <div class="sn-view" id="sn-view"></div>
        </main>`;
    container.append(style, root);

    const version = $('[data-version]');
    if (version) version.textContent = `v${ctx.pkg?.version || '1.0.0'}`;

    // ── API (package proxy; never a core endpoint) ─────────────────────────
    const base = `/api/packages/${encodeURIComponent(ctx.pkg.id)}/proxy/api/sticky-notes`;
    async function api(path = '', options = {}) {
        const response = await ctx.apiFetch(`${base}${path}`, options);
        let body = null;
        try { body = await response.json(); } catch { body = null; }
        if (!response.ok) {
            const detail = body?.detail || `HTTP ${response.status}`;
            const error = new Error(typeof detail === 'string' ? detail : 'Request failed');
            error.status = response.status;
            throw error;
        }
        return body || {};
    }
    const send = (path, method, body) => api(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
    });
    const errorText = (error) => (error?.status === 401
        ? 'Your session expired — sign in again.'
        : (error?.message || 'Request failed'));

    // ── shell helpers ──────────────────────────────────────────────────────
    function setPill(text, kind = '') {
        const pill = $('#sn-pill');
        if (!pill) return;
        const cls = { busy: 'starting', bad: 'offline', '': 'ready' }[kind] ?? kind;
        pill.className = `sn-pill ${cls}`.trim();
        pill.textContent = text;
    }
    function setStatus(text, kind = '') {
        const status = $('#sn-status');
        if (!status) return;
        status.textContent = text || '';
        status.className = `sn-status${kind ? ` ${kind}` : ''}`.trim();
    }
    function notify(message, kind = 'info') {
        try { ctx.notifications.toast(String(message), kind); } catch { /* window closing */ }
    }

    // ── rendering ──────────────────────────────────────────────────────────
    function autoGrowAll() {
        root.querySelectorAll('.sn-note-text').forEach((ta) => {
            ta.style.height = 'auto';
            ta.style.height = `${Math.min(ta.scrollHeight, 260)}px`;
        });
    }

    function summaryHtml() {
        const colors = new Set(state.notes.map((note) => note.color));
        const updated = state.notes.reduce((latest, note) => {
            const stamp = Date.parse(note.updated_at || note.created_at || '') || 0;
            return Math.max(latest, stamp);
        }, 0);
        return `<div class="sn-summary">
            <div><span>Notes</span><strong data-testid="sn-count">${state.notes.length}</strong></div>
            <div><span>Colors in use</span><strong>${colors.size || 0}</strong></div>
            <div><span>Last change</span><strong>${updated ? esc(new Date(updated).toLocaleDateString()) : '—'}</strong></div>
        </div>`;
    }

    function noteHtml(note, index) {
        const color = COLORS.includes(note.color) ? note.color : 'yellow';
        const swatches = COLORS.map((name) => `<button type="button"
            class="sn-color c-${name}${name === color ? ' is-current' : ''}"
            data-action="color" data-note="${esc(note.id)}" data-color="${name}"
            data-testid="sn-color-${esc(note.id)}-${name}"
            title="${name}" aria-label="Set note color to ${name}" aria-pressed="${name === color}"></button>`).join('');
        return `<article class="sn-note c-${color}" data-testid="sn-note-${esc(note.id)}">
            <textarea class="sn-note-text" data-note="${esc(note.id)}"
                data-testid="sn-note-text-${esc(note.id)}" rows="3"
                aria-label="Note text" placeholder="Write something…">${esc(note.text || '')}</textarea>
            <div class="sn-note-foot">
                <div class="sn-colors" role="group" aria-label="Note color">${swatches}</div>
                <div class="sn-note-actions">
                    <button type="button" class="sn-icon-btn" data-action="up" data-note="${esc(note.id)}"
                        data-testid="sn-up-${esc(note.id)}" title="Move up" aria-label="Move note up"
                        ${index === 0 ? 'disabled' : ''}>↑</button>
                    <button type="button" class="sn-icon-btn" data-action="down" data-note="${esc(note.id)}"
                        data-testid="sn-down-${esc(note.id)}" title="Move down" aria-label="Move note down"
                        ${index === state.notes.length - 1 ? 'disabled' : ''}>↓</button>
                    <button type="button" class="sn-icon-btn del" data-action="delete" data-note="${esc(note.id)}"
                        data-testid="sn-delete-${esc(note.id)}" title="Remove note" aria-label="Remove note">×</button>
                </div>
            </div>
        </article>`;
    }

    function notesViewHtml() {
        const cards = state.notes.length
            ? `<div class="sn-grid" data-testid="sn-grid">${state.notes.map(noteHtml).join('')}</div>`
            : `<div class="sn-empty" data-testid="sn-empty"><strong>No notes yet</strong>Click “New note” to pin your first one.</div>`;
        return `${summaryHtml()}
        <section class="sn-panel">
            <div class="sn-toolbar">
                <div>
                    <h2>Your notes</h2>
                    <p class="sn-muted">Notes save automatically and stay in this order until you move them.</p>
                </div>
                <div class="sn-row">
                    <button type="button" class="sn-btn primary" data-action="add" data-testid="sn-add">＋ New note</button>
                </div>
            </div>
            ${cards}
        </section>`;
    }

    function aboutViewHtml() {
        return `<section class="sn-panel">
            <h2>About Sticky Notes</h2>
            <p class="sn-muted">This desktop app is a Package Center package. Notes are private to the
                signed-in EthOS account and live in the package's own data directory, not in the core install.</p>
            <div class="sn-def-grid">
                <div><span>Package id</span><strong><code>ethos-sticky-notes</code></strong></div>
                <div><span>Version</span><strong>${esc(ctx.pkg?.version || '1.0.0')}</strong></div>
                <div><span>Runtime</span><strong>venv · loopback service</strong></div>
                <div><span>Proxy</span><strong><code>/api/packages/ethos-sticky-notes/proxy</code></strong></div>
                <div><span>Accounts</span><strong>Per-user, isolated</strong></div>
                <div><span>Your notes</span><strong data-testid="sn-about-count">${state.notes.length}</strong></div>
            </div>
            <p class="sn-startup info">Upgrading from the built-in widget? Existing notes are imported
                automatically the first time this service starts.</p>
        </section>`;
    }

    function renderView() {
        const viewEl = $('#sn-view');
        if (!viewEl) return;
        const savedFocus = captureFocus();
        viewEl.innerHTML = state.view === 'about' ? aboutViewHtml() : notesViewHtml();
        if (state.view === 'notes') {
            autoGrowAll();
            restoreFocus(savedFocus);
        }
    }

    function captureFocus() {
        const active = document.activeElement;
        if (!active || !active.classList?.contains('sn-note-text')) return null;
        return { id: active.dataset.note, start: active.selectionStart || 0, end: active.selectionEnd || 0 };
    }

    function restoreFocus(saved) {
        if (!saved) return;
        const ta = root.querySelector(`[data-testid="sn-note-text-${CSS.escape(saved.id)}"]`);
        if (!ta) return;
        ta.focus();
        try { ta.setSelectionRange(saved.start, saved.end); } catch { /* detached */ }
    }

    function switchView(view) {
        if (!VIEWS[view] || state.view === view) return;
        state.view = view;
        root.querySelectorAll('[data-nav]').forEach((button) => {
            button.classList.toggle('is-active', button.dataset.nav === view);
        });
        const [title, subtitle] = VIEWS[view];
        $('#sn-title').textContent = title;
        $('#sn-sub').textContent = subtitle;
        renderView();
    }

    // ── data ───────────────────────────────────────────────────────────────
    async function load() {
        try {
            const data = await api();
            state.notes = Array.isArray(data.notes) ? data.notes : [];
            setPill('ready', '');
            setStatus('Ready.');
            renderView();
        } catch (error) {
            setPill('offline', 'bad');
            setStatus(errorText(error), 'error');
            ctx.log('error', 'Could not load sticky notes', String(error?.message || error));
            renderView();
        }
    }

    function updateNotes(next) {
        if (Array.isArray(next)) state.notes = next;
    }

    async function flushSave(id) {
        const timer = state.timers.get(id);
        if (timer) { clearTimeout(timer); state.timers.delete(id); }
        const text = state.dirty.get(id);
        if (text === undefined) return;
        state.dirty.delete(id);
        try {
            const data = await send(`/${encodeURIComponent(id)}`, 'PUT', { text });
            // Never rebuild the DOM here: the debounce fires mid-sentence and a
            // re-render would replace the <textarea> the user is typing in.
            state.notes = Array.isArray(data.notes) ? data.notes : state.notes;
        } catch (error) {
            state.dirty.set(id, text);
            notify(errorText(error), 'error');
            ctx.log('error', `Could not save sticky note ${id}`, String(error?.message || error));
        }
    }

    async function flushAll() {
        const ids = [...state.dirty.keys()];
        for (const id of ids) await flushSave(id);
    }

    function scheduleSave(id, text) {
        const note = state.notes.find((item) => item.id === id);
        if (note) note.text = text;
        state.dirty.set(id, text);
        const previous = state.timers.get(id);
        if (previous) clearTimeout(previous);
        state.timers.set(id, setTimeout(() => { flushSave(id); }, SAVE_DEBOUNCE_MS));
    }

    async function addNote() {
        try {
            await flushAll();
            const data = await send('', 'POST', {});
            updateNotes(data.notes);
            setStatus('Note added.');
            renderView();
            const last = state.notes[state.notes.length - 1];
            if (last) {
                const ta = root.querySelector(`[data-testid="sn-note-text-${CSS.escape(last.id)}"]`);
                if (ta) { ta.focus(); ta.scrollIntoView({ block: 'nearest' }); }
            }
            ctx.log('info', 'Sticky note created');
        } catch (error) {
            notify(errorText(error), 'error');
            ctx.log('error', 'Could not create sticky note', String(error?.message || error));
        }
    }

    async function moveNote(id, direction) {
        try {
            await flushAll();
            const data = await send(`/${encodeURIComponent(id)}/move`, 'POST', { direction });
            updateNotes(data.notes);
            renderView();
            setStatus('Note moved.');
        } catch (error) {
            notify(errorText(error), 'error');
            ctx.log('error', `Could not move sticky note ${id}`, String(error?.message || error));
        }
    }

    async function setColor(id, color) {
        try {
            await flushAll();
            const data = await send(`/${encodeURIComponent(id)}`, 'PUT', { color });
            updateNotes(data.notes);
            renderView();
            setStatus('Color updated.');
        } catch (error) {
            notify(errorText(error), 'error');
            ctx.log('error', `Could not recolor sticky note ${id}`, String(error?.message || error));
        }
    }

    async function deleteNote(id) {
        try {
            await flushAll();
            const data = await api(`/${encodeURIComponent(id)}`, { method: 'DELETE' });
            updateNotes(data.notes);
            renderView();
            setStatus('Note removed.');
        } catch (error) {
            notify(errorText(error), 'error');
            ctx.log('error', `Could not remove sticky note ${id}`, String(error?.message || error));
        }
    }

    // ── events (delegated; the view is re-rendered often) ──────────────────
    async function onClick(event) {
        const nav = event.target.closest('[data-nav]');
        if (nav) {
            await flushAll();
            switchView(nav.dataset.nav);
            return;
        }
        const button = event.target.closest('[data-action]');
        if (!button) return;
        const action = button.dataset.action;
        const id = button.dataset.note;
        if (action === 'add') { await addNote(); return; }
        if (action === 'up') { await moveNote(id, 'up'); return; }
        if (action === 'down') { await moveNote(id, 'down'); return; }
        if (action === 'delete') { await deleteNote(id); return; }
        if (action === 'color') { await setColor(id, button.dataset.color); }
    }

    function onInput(event) {
        const target = event.target;
        if (!target.classList?.contains('sn-note-text')) return;
        target.style.height = 'auto';
        target.style.height = `${Math.min(target.scrollHeight, 260)}px`;
        scheduleSave(target.dataset.note, target.value);
    }

    function onFocusOut(event) {
        const target = event.target;
        if (target.classList?.contains('sn-note-text')) flushSave(target.dataset.note);
    }

    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('focusout', onFocusOut);

    ctx.log('info', 'Sticky Notes opened');
    await load();

    return () => {
        state.timers.forEach((timer) => clearTimeout(timer));
        state.timers.clear();
        root.removeEventListener('click', onClick);
        root.removeEventListener('input', onInput);
        root.removeEventListener('focusout', onFocusOut);
    };
}
