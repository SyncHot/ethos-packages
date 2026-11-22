// EthOS Sticky Notes — native Package Center app (v2).
//
// Per-account notes and checklist tasks behind the package proxy:
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
.sn-search-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.sn-search { flex: 1; min-width: 180px; padding: 8px 11px; border: 1px solid var(--sn-border); border-radius: 9px; background: var(--sn-input-bg); color: var(--sn-text); font-size: 12px; }
.sn-search:focus { outline: 2px solid var(--sn-accent); outline-offset: 1px; }
.sn-chips { display: flex; gap: 5px; flex-wrap: wrap; }
.sn-chip { padding: 6px 10px; border: 1px solid var(--sn-border); border-radius: 999px; background: transparent; color: var(--sn-muted); font-size: 10px; font-weight: 700; cursor: pointer; }
.sn-chip:hover { border-color: var(--sn-accent); color: var(--sn-text); }
.sn-chip.is-active { background: var(--sn-accent-soft); border-color: var(--sn-accent-border); color: var(--sn-text); }
.sn-note-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.sn-badges { display: flex; flex-wrap: wrap; gap: 4px; min-height: 16px; }
.sn-badge { display: inline-flex; align-items: center; gap: 3px; padding: 2px 6px; border-radius: 999px; font-size: 9px; font-weight: 700; background: rgba(255, 255, 255, 0.55); border: 1px solid rgba(0, 0, 0, 0.12); color: inherit; }
.sn-badge.overdue { background: rgba(190, 30, 30, 0.18); border-color: rgba(190, 30, 30, 0.45); }
.sn-badge.done { background: rgba(21, 128, 61, 0.16); border-color: rgba(21, 128, 61, 0.4); }
.sn-note.is-pinned { outline: 2px solid rgba(0, 0, 0, 0.18); outline-offset: -2px; }
.sn-note-title { width: 100%; padding: 0; border: 0; outline: none; background: transparent; color: inherit; font-size: 13px; font-weight: 700; line-height: 1.4; }
.sn-note-title::placeholder { opacity: 0.55; font-weight: 600; }
.sn-items { list-style: none; display: flex; flex-direction: column; gap: 5px; margin: 2px 0 0; padding: 0; }
.sn-item { display: flex; align-items: center; gap: 6px; }
.sn-item input[type="checkbox"] { width: 15px; height: 15px; accent-color: var(--sn-accent); flex: none; cursor: pointer; }
.sn-item-text { flex: 1; min-width: 0; padding: 2px 0; border: 0; outline: none; background: transparent; color: inherit; font-size: 12px; line-height: 1.4; }
.sn-item.is-done .sn-item-text { text-decoration: line-through; opacity: 0.55; }
.sn-item-add { display: flex; gap: 6px; align-items: center; }
.sn-item-add input { flex: 1; min-width: 0; padding: 5px 8px; border: 1px solid rgba(0, 0, 0, 0.14); border-radius: 7px; background: rgba(255, 255, 255, 0.5); color: inherit; font-size: 11px; }
.sn-item-add input::placeholder { opacity: 0.55; }
.sn-meta { display: flex; flex-wrap: wrap; gap: 8px; }
.sn-meta label { display: flex; align-items: center; gap: 4px; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.75; }
.sn-meta input { padding: 3px 5px; border: 1px solid rgba(0, 0, 0, 0.16); border-radius: 6px; background: rgba(255, 255, 255, 0.55); color: inherit; font-size: 10px; }
.sn-setting-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 10px 0; border-top: 1px solid var(--sn-border); }
.sn-setting-row:first-of-type { border-top: 0; }
.sn-setting-row strong { display: block; font-size: 12px; }
.sn-setting-row .sn-muted { margin-top: 2px; }
.sn-switch { position: relative; display: inline-flex; width: 38px; height: 21px; flex: none; cursor: pointer; }
.sn-switch input { position: absolute; opacity: 0; width: 0; height: 0; }
.sn-switch span { position: absolute; inset: 0; border-radius: 999px; background: var(--sn-border); transition: background .15s; }
.sn-switch span::after { content: ''; position: absolute; top: 3px; left: 3px; width: 15px; height: 15px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3); transition: transform .15s; }
.sn-switch input:checked + span { background: var(--sn-accent); }
.sn-switch input:checked + span::after { transform: translateX(17px); }
.sn-switch input:focus-visible + span { outline: 2px solid var(--sn-accent); outline-offset: 2px; }
.sn-link { color: var(--sn-accent); font-weight: 600; }
.sn-kv { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; margin-top: 10px; }
.sn-kv div { padding: 10px; border: 1px solid var(--sn-border); border-radius: 9px; background: var(--sn-surface); }
.sn-kv span { display: block; font-size: 9px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--sn-muted); margin-bottom: 3px; }
.sn-kv strong { font-size: 14px; }
:root.dark .sn-badge { background: rgba(15, 23, 42, 0.45); border-color: rgba(148, 163, 184, 0.25); }
:root.dark .sn-item-add input, :root.dark .sn-meta input { background: rgba(2, 6, 23, 0.45); border-color: rgba(148, 163, 184, 0.25); }
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
    .sn-search-row { flex-direction: column; align-items: stretch; }
    .sn-setting-row { flex-direction: column; align-items: flex-start; }
}
@media (prefers-reduced-motion: reduce) { .sn-root * { transition: none !important; animation: none !important; } }
`;

const VIEWS = {
    notes: ['Notes', 'Notes and tasks, pinned first.'],
    archive: ['Archive', 'Hidden notes and tasks.'],
    settings: ['Settings', 'Ribbon and notification preferences.'],
    about: ['About', 'How this package stores your notes.'],
};

const COLORS = ['yellow', 'pink', 'blue', 'green', 'orange'];
const SAVE_DEBOUNCE_MS = 500;
const CHANNEL_NAME = 'ethos-sticky-notes';
const DEFAULT_SETTINGS = { ribbon_enabled: false, ribbon_show_completed: true };

function urlBase64ToUint8Array(value) {
    const padded = (String(value || '') + '='.repeat((4 - String(value || '').length % 4) % 4))
        .replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(padded);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
    return bytes;
}

export async function render(container, ctx) {
    container.replaceChildren();
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const $ = (selector) => root.querySelector(selector);

    const state = {
        view: 'notes',
        notes: [],
        settings: { ...DEFAULT_SETTINGS },
        search: '',
        filter: 'all',
        dirty: new Map(),
        timers: new Map(),
        push: { supported: false, subscription: null },
        busy: false,
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
    if (version) version.textContent = `v${ctx.pkg?.version || '2.0.0'}`;

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

    // ── cross-window sync ──────────────────────────────────────────────────
    let channel = null;
    try { channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL_NAME) : null; } catch { channel = null; }
    function broadcast(type) {
        try { channel?.postMessage({ type, at: Date.now() }); } catch { /* closed */ }
    }

    // ── derived data ───────────────────────────────────────────────────────
    const noteById = (id) => state.notes.find((note) => note.id === id) || null;
    const openItems = (note) => (note.items || []).filter((item) => !item.done).length;
    const isComplete = (note) => note.kind === 'checklist' && Boolean(note.items?.length)
        && !(note.items || []).some((item) => !item.done);
    const today = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const isOverdue = (note) => Boolean(note.due_at) && note.due_at < today() && !isComplete(note);
    function toLocalInput(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '';
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
            + `T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    function visibleNotes() {
        const query = state.search.trim().toLowerCase();
        return state.notes
            .filter((note) => (state.view === 'archive' ? note.archived : !note.archived))
            .filter((note) => state.filter === 'all'
                || (state.filter === 'tasks' ? note.kind === 'checklist' : note.kind === 'note'))
            .filter((note) => !query || `${note.text || ''} ${(note.items || []).map((item) => item.text).join(' ')}`
                .toLowerCase().includes(query))
            .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
    }

    // ── rendering ──────────────────────────────────────────────────────────
    function autoGrowAll() {
        root.querySelectorAll('.sn-note-text').forEach((ta) => {
            ta.style.height = 'auto';
            ta.style.height = `${Math.min(ta.scrollHeight, 260)}px`;
        });
    }

    function summaryHtml() {
        const active = state.notes.filter((note) => !note.archived);
        const openTasks = active.reduce((total, note) => total + (note.kind === 'checklist' ? openItems(note) : 0), 0);
        const overdue = active.filter(isOverdue).length;
        const archived = state.notes.filter((note) => note.archived).length;
        if (state.view === 'archive') {
            const doneTasks = state.notes.filter((note) => note.archived && note.kind === 'checklist')
                .reduce((total, note) => total + (note.items || []).filter((item) => item.done).length, 0);
            return `<div class="sn-summary" id="sn-summary" data-testid="sn-summary">
                <div><span>Archived</span><strong data-testid="sn-archived-count">${archived}</strong></div>
                <div><span>Notes</span><strong>${active.length}</strong></div>
                <div><span>Tasks done</span><strong>${doneTasks}</strong></div>
            </div>`;
        }
        return `<div class="sn-summary" id="sn-summary" data-testid="sn-summary">
            <div><span>Notes</span><strong data-testid="sn-count">${active.length}</strong></div>
            <div><span>Open tasks</span><strong data-testid="sn-open-tasks">${openTasks}</strong></div>
            <div><span>Overdue</span><strong data-testid="sn-overdue">${overdue}</strong></div>
        </div>`;
    }

    function badgesHtml(note) {
        const badges = [];
        if (note.pinned) badges.push('<span class="sn-badge">📌 Pinned</span>');
        if (note.due_at) {
            badges.push(`<span class="sn-badge${isOverdue(note) ? ' overdue' : ''}">Due ${esc(note.due_at)}</span>`);
        }
        if (note.reminder_at) badges.push(`<span class="sn-badge">⏰ ${esc(new Date(note.reminder_at).toLocaleString())}</span>`);
        if (isComplete(note)) badges.push('<span class="sn-badge done">✓ Done</span>');
        return badges.join('');
    }

    function noteMetaHtml(note) {
        return `<div class="sn-meta">
            <label>Due <input type="date" data-field="due" data-note="${esc(note.id)}" value="${esc(note.due_at || '')}"></label>
            <label>Remind <input type="datetime-local" data-field="reminder" data-note="${esc(note.id)}" value="${esc(toLocalInput(note.reminder_at))}"></label>
        </div>`;
    }

    function colorsHtml(note) {
        return `<div class="sn-colors" role="group" aria-label="Note color">${COLORS.map((name) => `<button type="button"
            class="sn-color c-${name}${name === note.color ? ' is-current' : ''}"
            data-action="color" data-note="${esc(note.id)}" data-color="${name}"
            data-testid="sn-color-${esc(note.id)}-${name}"
            title="${name}" aria-label="Set note color to ${name}" aria-pressed="${name === note.color}"></button>`).join('')}</div>`;
    }

    function moveButtonsHtml(note) {
        if (state.search || state.filter !== 'all') return '';
        const index = state.notes.findIndex((item) => item.id === note.id);
        return `<button type="button" class="sn-icon-btn" data-action="up" data-note="${esc(note.id)}"
                data-testid="sn-up-${esc(note.id)}" title="Move up" aria-label="Move note up"
                ${index <= 0 ? 'disabled' : ''}>↑</button>
            <button type="button" class="sn-icon-btn" data-action="down" data-note="${esc(note.id)}"
                data-testid="sn-down-${esc(note.id)}" title="Move down" aria-label="Move note down"
                ${index === state.notes.length - 1 ? 'disabled' : ''}>↓</button>`;
    }

    function noteBodyHtml(note) {
        if (note.kind === 'checklist') {
            const items = (note.items || []).map((item) => `<li class="sn-item${item.done ? ' is-done' : ''}">
                <input type="checkbox" data-action="toggle-item" data-note="${esc(note.id)}" data-item="${esc(item.id)}"
                    ${item.done ? 'checked' : ''} aria-label="Toggle item">
                <input class="sn-item-text" data-testid="sn-item-text-${esc(note.id)}-${esc(item.id)}"
                    data-field="item-text" data-note="${esc(note.id)}" data-item="${esc(item.id)}"
                    value="${esc(item.text)}" aria-label="Item text" maxlength="500">
                <button type="button" class="sn-icon-btn del" data-action="delete-item" data-note="${esc(note.id)}"
                    data-item="${esc(item.id)}" title="Remove item" aria-label="Remove item">×</button>
            </li>`).join('');
            return `<input class="sn-note-title" data-testid="sn-note-title-${esc(note.id)}"
                    data-field="title" data-note="${esc(note.id)}" value="${esc(note.text || '')}"
                    placeholder="Task list title" aria-label="Task list title" maxlength="2000">
                <ul class="sn-items">${items}</ul>
                <form class="sn-item-add" data-note="${esc(note.id)}">
                    <input type="text" placeholder="Add item…" aria-label="Add checklist item" maxlength="500">
                    <button type="submit" class="sn-btn small">＋</button>
                </form>`;
        }
        return `<textarea class="sn-note-text" data-testid="sn-note-text-${esc(note.id)}"
            data-note="${esc(note.id)}" rows="3" aria-label="Note text"
            placeholder="Write something…">${esc(note.text || '')}</textarea>`;
    }

    function noteCardHtml(note) {
        const color = COLORS.includes(note.color) ? note.color : 'yellow';
        const action = note.archived ? 'restore' : 'archive';
        const actionLabel = note.archived ? 'Restore' : 'Archive';
        return `<article class="sn-note c-${color}${note.pinned ? ' is-pinned' : ''}" data-testid="sn-note-${esc(note.id)}">
            <div class="sn-note-top">
                <div class="sn-badges">${badgesHtml(note)}</div>
                <div class="sn-note-actions">
                    <button type="button" class="sn-icon-btn" data-action="pin" data-note="${esc(note.id)}"
                        data-testid="sn-pin-${esc(note.id)}" title="${note.pinned ? 'Unpin' : 'Pin'}"
                        aria-label="${note.pinned ? 'Unpin note' : 'Pin note'}">${note.pinned ? '📌' : '📍'}</button>
                    <button type="button" class="sn-icon-btn" data-action="${action}" data-note="${esc(note.id)}"
                        data-testid="sn-${action}-${esc(note.id)}" title="${actionLabel}" aria-label="${actionLabel} note">${note.archived ? '↩' : '🗄'}</button>
                    ${moveButtonsHtml(note)}
                    <button type="button" class="sn-icon-btn del" data-action="delete" data-note="${esc(note.id)}"
                        data-testid="sn-delete-${esc(note.id)}" title="Remove note" aria-label="Remove note">×</button>
                </div>
            </div>
            ${noteBodyHtml(note)}
            ${noteMetaHtml(note)}
            <div class="sn-note-foot">${colorsHtml(note)}</div>
        </article>`;
    }

    function emptyHtml() {
        if (state.search || state.filter !== 'all') {
            return `<div class="sn-empty" data-testid="sn-empty"><strong>Nothing matches</strong>Clear the search or switch the filter.</div>`;
        }
        if (state.view === 'archive') {
            return `<div class="sn-empty" data-testid="sn-empty"><strong>Archive is empty</strong>Archived notes and tasks appear here.</div>`;
        }
        return `<div class="sn-empty" data-testid="sn-empty"><strong>No notes yet</strong>Click “New note” or “New task” to pin your first one.</div>`;
    }

    function listHtml() {
        const notes = visibleNotes();
        return notes.length
            ? `<div class="sn-grid" data-testid="sn-grid">${notes.map(noteCardHtml).join('')}</div>`
            : emptyHtml();
    }

    function toolbarHtml() {
        return `<div class="sn-toolbar">
            <div class="sn-search-row">
                <input class="sn-search" type="search" data-search data-testid="sn-search"
                    placeholder="Search notes and tasks…" value="${esc(state.search)}" aria-label="Search notes">
                <div class="sn-chips" role="group" aria-label="Filter notes">
                    <button type="button" class="sn-chip${state.filter === 'all' ? ' is-active' : ''}" data-filter="all" data-testid="sn-filter-all">All</button>
                    <button type="button" class="sn-chip${state.filter === 'notes' ? ' is-active' : ''}" data-filter="notes" data-testid="sn-filter-notes">Notes</button>
                    <button type="button" class="sn-chip${state.filter === 'tasks' ? ' is-active' : ''}" data-filter="tasks" data-testid="sn-filter-tasks">Tasks</button>
                </div>
            </div>
            ${state.view === 'notes' ? `<div class="sn-row">
                <button type="button" class="sn-btn primary" data-action="add-note" data-testid="sn-add">＋ New note</button>
                <button type="button" class="sn-btn" data-action="add-task" data-testid="sn-add-task">＋ New task</button>
            </div>` : ''}
        </div>`;
    }

    function notesViewHtml() {
        return `${summaryHtml()}
        <section class="sn-panel">
            ${toolbarHtml()}
            <div id="sn-list">${listHtml()}</div>
        </section>`;
    }

    function archiveViewHtml() {
        return `${summaryHtml()}
        <section class="sn-panel">
            ${toolbarHtml()}
            <div id="sn-list">${listHtml()}</div>
        </section>`;
    }

    function settingsViewHtml() {
        const push = state.push;
        const pushLabel = !push.supported
            ? 'Not supported in this browser'
            : (push.subscription ? 'Enabled on this device' : 'Not enabled on this device');
        return `<section class="sn-panel">
            <h2>Desktop ribbon</h2>
            <p class="sn-muted">A narrow Sticky Notes tab on the right edge of the desktop. Click it to expand a quick note and task list.</p>
            <div class="sn-setting-row">
                <div><strong>Show ribbon</strong><span class="sn-muted">Applies to your desktop in this account.</span></div>
                <label class="sn-switch"><input type="checkbox" data-setting="ribbon_enabled" ${state.settings.ribbon_enabled ? 'checked' : ''} aria-label="Show ribbon"><span></span></label>
            </div>
            <div class="sn-setting-row">
                <div><strong>Show completed tasks</strong><span class="sn-muted">Include checked-off items in the ribbon list.</span></div>
                <label class="sn-switch"><input type="checkbox" data-setting="ribbon_show_completed" ${state.settings.ribbon_show_completed ? 'checked' : ''} aria-label="Show completed tasks in ribbon"><span></span></label>
            </div>
        </section>
        <section class="sn-panel">
            <h2>Notifications</h2>
            <p class="sn-muted">Reminders use the browser push service. Push requires HTTPS and notification permission on each device.</p>
            <div class="sn-setting-row">
                <div><strong>This device</strong><span class="sn-muted" data-testid="sn-push-state">${esc(pushLabel)}</span></div>
                <div class="sn-row">
                    ${push.subscription
                        ? '<button type="button" class="sn-btn small" data-action="push-disable" data-testid="sn-push-disable">Disable</button>'
                        : `<button type="button" class="sn-btn primary small" data-action="push-enable" data-testid="sn-push-enable" ${!push.supported ? 'disabled' : ''}>Enable</button>`}
                    <button type="button" class="sn-btn small" data-action="push-test" data-testid="sn-push-test" ${!push.subscription ? 'disabled' : ''}>Send test</button>
                </div>
            </div>
            <p class="sn-startup info">On Android, open <a class="sn-link" href="/notes" target="_blank" rel="noopener">/notes</a> in Chrome and use “Add to Home screen”. Long-press the icon for “New note” and “New task”. The page works over HTTPS — <code>https://nas.myserver.pl/notes</code>.</p>
        </section>
        <section class="sn-panel">
            <h2>Your data</h2>
            <div class="sn-kv">
                <div><span>Notes</span><strong>${state.notes.filter((note) => !note.archived && note.kind === 'note').length}</strong></div>
                <div><span>Task lists</span><strong>${state.notes.filter((note) => !note.archived && note.kind === 'checklist').length}</strong></div>
                <div><span>Archived</span><strong>${state.notes.filter((note) => note.archived).length}</strong></div>
                <div><span>Pinned</span><strong>${state.notes.filter((note) => note.pinned).length}</strong></div>
            </div>
            <p class="sn-startup">Notes stay in the package's private data directory on the NAS. Uninstalling the package keeps them.</p>
        </section>`;
    }

    function aboutViewHtml() {
        return `<section class="sn-panel">
            <h2>About Sticky Notes</h2>
            <p class="sn-muted">A Package Center app for notes and checklist tasks. Notes are private to the
                signed-in EthOS account and live in the package's own data directory, not in the core install.</p>
            <div class="sn-def-grid">
                <div><span>Package id</span><strong><code>ethos-sticky-notes</code></strong></div>
                <div><span>Version</span><strong>${esc(ctx.pkg?.version || '2.0.0')}</strong></div>
                <div><span>Runtime</span><strong>venv · loopback service</strong></div>
                <div><span>Proxy</span><strong><code>/api/packages/ethos-sticky-notes/proxy</code></strong></div>
                <div><span>Accounts</span><strong>Per-user, isolated</strong></div>
                <div><span>Ribbon</span><strong>${state.settings.ribbon_enabled ? 'enabled' : 'disabled'}</strong></div>
            </div>
            <p class="sn-startup info">Checklists, pinning, archive, due dates, reminders and the right-edge ribbon are new in 2.0.
                Existing notes from 1.x are migrated automatically.</p>
        </section>`;
    }

    function viewHtml() {
        if (state.view === 'archive') return archiveViewHtml();
        if (state.view === 'settings') return settingsViewHtml();
        if (state.view === 'about') return aboutViewHtml();
        return notesViewHtml();
    }

    function captureFocus() {
        const active = document.activeElement;
        if (!active || !root.contains(active) || !active.dataset?.note) return null;
        return {
            note: active.dataset.note,
            item: active.dataset.item || '',
            field: active.dataset.field || '',
            start: active.selectionStart ?? null,
            end: active.selectionEnd ?? null,
        };
    }

    function restoreFocus(saved) {
        if (!saved) return;
        let el = null;
        if (saved.item) {
            el = root.querySelector(`[data-testid="sn-item-text-${CSS.escape(saved.note)}-${CSS.escape(saved.item)}"]`);
        }
        if (!el && saved.field) {
            el = root.querySelector(`[data-field="${saved.field}"][data-note="${CSS.escape(saved.note)}"]`);
        }
        if (!el) {
            el = root.querySelector(`[data-testid="sn-note-text-${CSS.escape(saved.note)}"]`)
                || root.querySelector(`[data-testid="sn-note-title-${CSS.escape(saved.note)}"]`);
        }
        if (!el) return;
        el.focus();
        if (saved.start != null && el.setSelectionRange) {
            try { el.setSelectionRange(saved.start, saved.end); } catch { /* detached */ }
        }
    }

    function updateFilterChips() {
        root.querySelectorAll('[data-filter]').forEach((button) => {
            button.classList.toggle('is-active', button.dataset.filter === state.filter);
        });
    }

    function renderList() {
        const list = $('#sn-list');
        if (list) list.innerHTML = listHtml();
        const summary = $('#sn-summary');
        if (summary) summary.outerHTML = summaryHtml();
        autoGrowAll();
        updateFilterChips();
    }

    function renderView() {
        const viewEl = $('#sn-view');
        if (!viewEl) return;
        const savedFocus = captureFocus();
        viewEl.innerHTML = viewHtml();
        autoGrowAll();
        updateFilterChips();
        restoreFocus(savedFocus);
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
        setStatus('Ready.');
        renderView();
        if (view === 'settings') refreshPushState().then(() => {
            if (state.view === 'settings') renderView();
        });
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

    async function loadSettings() {
        try {
            const data = await api('/settings');
            state.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
        } catch (error) {
            ctx.log('warning', 'Could not load sticky notes settings', String(error?.message || error));
        }
    }

    function updateNotes(next, { silent = false } = {}) {
        if (Array.isArray(next)) state.notes = next;
        if (!silent) broadcast('notes');
    }

    function focusNote(noteId) {
        const el = root.querySelector(`[data-testid="sn-note-title-${CSS.escape(noteId)}"]`)
            || root.querySelector(`[data-testid="sn-note-text-${CSS.escape(noteId)}"]`);
        if (el) { el.focus(); el.scrollIntoView({ block: 'nearest' }); }
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
            updateNotes(data.notes);
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
        const note = noteById(id);
        if (note) note.text = text;
        state.dirty.set(id, text);
        const previous = state.timers.get(id);
        if (previous) clearTimeout(previous);
        state.timers.set(id, setTimeout(() => { flushSave(id); }, SAVE_DEBOUNCE_MS));
    }

    async function createNote(kind) {
        try {
            await flushAll();
            const payload = kind === 'checklist'
                ? { kind: 'checklist', text: '', items: [] }
                : { kind: 'note', text: '' };
            const data = await send('', 'POST', payload);
            updateNotes(data.notes);
            setStatus(kind === 'checklist' ? 'Task list added.' : 'Note added.');
            renderView();
            if (data.note) focusNote(data.note.id);
            ctx.log('info', kind === 'checklist' ? 'Task list created' : 'Sticky note created');
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

    async function patchNote(id, patch, message = 'Note updated.') {
        try {
            await flushAll();
            const data = await send(`/${encodeURIComponent(id)}`, 'PUT', patch);
            updateNotes(data.notes);
            renderView();
            setStatus(message);
        } catch (error) {
            notify(errorText(error), 'error');
            ctx.log('error', `Could not update sticky note ${id}`, String(error?.message || error));
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

    async function addItem(noteId, text) {
        try {
            await flushAll();
            const data = await send(`/${encodeURIComponent(noteId)}/items`, 'POST', { text });
            updateNotes(data.notes);
            renderView();
            const form = root.querySelector(`.sn-item-add[data-note="${CSS.escape(noteId)}"]`);
            form?.querySelector('input')?.focus();
            setStatus('Item added.');
        } catch (error) {
            notify(errorText(error), 'error');
            ctx.log('error', `Could not add checklist item to ${noteId}`, String(error?.message || error));
        }
    }

    async function toggleItem(noteId, itemId, done) {
        try {
            const data = await send(`/${encodeURIComponent(noteId)}/items/${encodeURIComponent(itemId)}`, 'PUT', { done });
            updateNotes(data.notes);
            renderView();
        } catch (error) {
            notify(errorText(error), 'error');
            ctx.log('error', `Could not toggle item ${itemId}`, String(error?.message || error));
        }
    }

    async function updateItemText(noteId, itemId, text) {
        try {
            const data = await send(`/${encodeURIComponent(noteId)}/items/${encodeURIComponent(itemId)}`, 'PUT', { text });
            updateNotes(data.notes);
        } catch (error) {
            notify(errorText(error), 'error');
            ctx.log('error', `Could not update item ${itemId}`, String(error?.message || error));
        }
    }

    async function deleteItem(noteId, itemId) {
        try {
            const data = await api(`/${encodeURIComponent(noteId)}/items/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
            updateNotes(data.notes);
            renderView();
        } catch (error) {
            notify(errorText(error), 'error');
            ctx.log('error', `Could not remove item ${itemId}`, String(error?.message || error));
        }
    }

    async function saveTitle(noteId, text) {
        const note = noteById(noteId);
        if (!note || note.text === text) return;
        note.text = text;
        try {
            const data = await send(`/${encodeURIComponent(noteId)}`, 'PUT', { text });
            updateNotes(data.notes);
        } catch (error) {
            notify(errorText(error), 'error');
            ctx.log('error', `Could not save task title ${noteId}`, String(error?.message || error));
        }
    }

    async function updateSettings(patch) {
        const previous = { ...state.settings };
        state.settings = { ...state.settings, ...patch };
        try {
            const data = await send('/settings', 'PUT', patch);
            state.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
            broadcast('settings');
            setStatus('Settings saved.');
        } catch (error) {
            state.settings = previous;
            renderView();
            notify(errorText(error), 'error');
            ctx.log('error', 'Could not save sticky notes settings', String(error?.message || error));
        }
    }

    // ── push ───────────────────────────────────────────────────────────────
    function pushSupported() {
        return Boolean(window.isSecureContext && 'serviceWorker' in navigator
            && 'PushManager' in window && 'Notification' in window);
    }

    async function serviceWorkerRegistration() {
        return Promise.race([
            navigator.serviceWorker.ready,
            new Promise((_, reject) => setTimeout(() => reject(new Error('no service worker')), 2500)),
        ]);
    }

    async function refreshPushState() {
        state.push.supported = pushSupported();
        state.push.subscription = null;
        if (!state.push.supported) return;
        try {
            const registration = await serviceWorkerRegistration();
            state.push.subscription = await registration.pushManager.getSubscription();
        } catch {
            state.push.subscription = null;
        }
    }

    async function enablePush() {
        if (!state.push.supported) {
            notify('Push notifications require HTTPS and a browser with service workers.', 'warning');
            return;
        }
        try {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                notify('Notification permission was not granted.', 'warning');
                return;
            }
            const keyData = await api('/push/key');
            if (!keyData.public_key) throw new Error('Push key is unavailable');
            const registration = await serviceWorkerRegistration();
            let subscription = await registration.pushManager.getSubscription();
            if (!subscription) {
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(keyData.public_key),
                });
            }
            await send('/push/subscribe', 'POST', { subscription: subscription.toJSON() });
            await refreshPushState();
            renderView();
            notify('Notifications enabled on this device.', 'success');
        } catch (error) {
            notify(errorText(error), 'error');
            ctx.log('error', 'Could not enable push notifications', String(error?.message || error));
        }
    }

    async function disablePush() {
        try {
            const subscription = state.push.subscription;
            if (subscription) {
                await send('/push/unsubscribe', 'POST', { endpoint: subscription.endpoint }).catch(() => {});
                await subscription.unsubscribe().catch(() => {});
            }
            await refreshPushState();
            renderView();
            notify('Notifications disabled on this device.', 'info');
        } catch (error) {
            notify(errorText(error), 'error');
            ctx.log('error', 'Could not disable push notifications', String(error?.message || error));
        }
    }

    async function testPush() {
        try {
            const result = await send('/push/test', 'POST', {});
            if (result.sent) notify('Test notification sent.', 'success');
            else notify('No device accepted the test notification.', 'warning');
        } catch (error) {
            notify(errorText(error), 'error');
            ctx.log('error', 'Could not send a test notification', String(error?.message || error));
        }
    }

    // ── reminders (in-app fallback when this device has no push) ───────────
    async function pollReminders() {
        if (document.visibilityState !== 'visible') return;
        if (state.push.subscription) return;
        try {
            const data = await api('/reminders/due');
            for (const reminder of data.reminders || []) {
                try {
                    ctx.notifications.emit({
                        kind: 'info',
                        title: 'Sticky Notes',
                        message: reminder.body || 'Reminder',
                        action: { appId: `pkg-${ctx.pkg.id}`, label: 'Open notes' },
                        dedupe_key: reminder.tag,
                    });
                } catch { /* notification centre unavailable */ }
            }
        } catch { /* best-effort: reminders are optional */ }
    }

    let reminderTimer = 0;
    function scheduleReminderPolling() {
        clearInterval(reminderTimer);
        reminderTimer = setInterval(pollReminders, 60000);
        pollReminders();
    }

    // ── events (delegated; the view is re-rendered often) ──────────────────
    async function onClick(event) {
        const nav = event.target.closest('[data-nav]');
        if (nav) {
            await flushAll();
            switchView(nav.dataset.nav);
            return;
        }
        const chip = event.target.closest('[data-filter]');
        if (chip) {
            state.filter = chip.dataset.filter;
            renderList();
            return;
        }
        const button = event.target.closest('[data-action]');
        if (!button) return;
        const action = button.dataset.action;
        const id = button.dataset.note;
        if (action === 'add-note') { await createNote('note'); return; }
        if (action === 'add-task') { await createNote('checklist'); return; }
        if (action === 'up') { await moveNote(id, 'up'); return; }
        if (action === 'down') { await moveNote(id, 'down'); return; }
        if (action === 'delete') { await deleteNote(id); return; }
        if (action === 'color') { await setColor(id, button.dataset.color); return; }
        if (action === 'pin') {
            const note = noteById(id);
            await patchNote(id, { pinned: !note?.pinned }, note?.pinned ? 'Note unpinned.' : 'Note pinned.');
            return;
        }
        if (action === 'archive') { await patchNote(id, { archived: true }, 'Moved to archive.'); return; }
        if (action === 'restore') { await patchNote(id, { archived: false }, 'Restored.'); return; }
        if (action === 'delete-item') { await deleteItem(id, button.dataset.item); return; }
        if (action === 'push-enable') { await enablePush(); return; }
        if (action === 'push-disable') { await disablePush(); return; }
        if (action === 'push-test') { await testPush(); }
    }

    function onInput(event) {
        const target = event.target;
        if (target.hasAttribute?.('data-search')) {
            state.search = target.value;
            renderList();
            return;
        }
        if (target.classList?.contains('sn-note-text')) {
            target.style.height = 'auto';
            target.style.height = `${Math.min(target.scrollHeight, 260)}px`;
            scheduleSave(target.dataset.note, target.value);
            return;
        }
        const note = target.dataset?.note ? noteById(target.dataset.note) : null;
        if (!note) return;
        if (target.dataset.field === 'title') {
            note.text = target.value;
        } else if (target.dataset.field === 'item-text') {
            const item = (note.items || []).find((entry) => entry.id === target.dataset.item);
            if (item) item.text = target.value;
        }
    }

    async function onChange(event) {
        const target = event.target;
        const id = target.dataset?.note;
        if (!id) {
            if (target.dataset.setting) {
                await updateSettings({ [target.dataset.setting]: target.checked });
            }
            return;
        }
        const field = target.dataset.field;
        if (target.dataset.action === 'toggle-item') {
            await toggleItem(id, target.dataset.item, target.checked);
            return;
        }
        if (field === 'due') {
            await patchNote(id, { due_at: target.value || null }, 'Due date saved.');
            return;
        }
        if (field === 'reminder') {
            await patchNote(id, { reminder_at: target.value ? new Date(target.value).toISOString() : null }, 'Reminder saved.');
            return;
        }
        if (field === 'title') {
            await saveTitle(id, target.value);
            return;
        }
        if (field === 'item-text') {
            await updateItemText(id, target.dataset.item, target.value);
        }
    }

    async function onSubmit(event) {
        const form = event.target.closest('.sn-item-add');
        if (!form) return;
        event.preventDefault();
        const input = form.querySelector('input');
        const text = input?.value.trim();
        if (!text) return;
        input.value = '';
        await addItem(form.dataset.note, text);
    }

    function onFocusOut(event) {
        const target = event.target;
        if (target.classList?.contains('sn-note-text')) flushSave(target.dataset.note);
    }

    function onKeydown(event) {
        if (event.key === 'Escape' && event.target.hasAttribute?.('data-search')) {
            event.target.value = '';
            state.search = '';
            renderList();
        }
    }

    async function onChannelMessage(event) {
        const data = event.data || {};
        if (data.type === 'settings') {
            await loadSettings();
            if (state.view === 'settings' || state.view === 'about') renderView();
            return;
        }
        if (data.type === 'notes') {
            if (state.dirty.size || state.timers.size) return;
            await load();
        }
    }

    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    root.addEventListener('submit', onSubmit);
    root.addEventListener('focusout', onFocusOut);
    root.addEventListener('keydown', onKeydown);
    channel?.addEventListener('message', onChannelMessage);

    ctx.log('info', 'Sticky Notes opened');
    await loadSettings();
    await load();
    await refreshPushState();
    scheduleReminderPolling();

    return () => {
        state.timers.forEach((timer) => clearTimeout(timer));
        state.timers.clear();
        clearInterval(reminderTimer);
        root.removeEventListener('click', onClick);
        root.removeEventListener('input', onInput);
        root.removeEventListener('change', onChange);
        root.removeEventListener('submit', onSubmit);
        root.removeEventListener('focusout', onFocusOut);
        root.removeEventListener('keydown', onKeydown);
        channel?.removeEventListener('message', onChannelMessage);
        try { channel?.close(); } catch { /* already closed */ }
    };
}
