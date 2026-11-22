// EthOS Sticky Notes — right-edge desktop ribbon.
//
// Mounted by the core `ui.ribbon` host at boot (see core/package-ribbon.js).
// The module is self-contained: it renders its own tab + panel, calls the
// package proxy through `ctx.proxy`, and never builds a second notification
// centre (reminders go through `ctx.notifications.emit`).

const STYLE = `
.sn-ribbon {
    --sn-r-bg: rgba(255, 255, 255, 0.96);
    --sn-r-panel: #ffffff;
    --sn-r-surface: #f4f5f7;
    --sn-r-border: #e3e5e8;
    --sn-r-text: #1f2430;
    --sn-r-muted: #5b6472;
    --sn-r-accent: #2563eb;
    --sn-r-accent-soft: rgba(37, 99, 235, 0.10);
    --sn-r-red: #b91c1c;
    --sn-r-green: #15803d;
    --sn-r-hover: rgba(15, 23, 42, 0.06);
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 0;
    height: 100%;
    pointer-events: none;
    color-scheme: light;
    color: var(--sn-r-text);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
:root.dark .sn-ribbon {
    color-scheme: dark;
    --sn-r-bg: rgba(15, 23, 42, 0.92);
    --sn-r-panel: #111827;
    --sn-r-surface: #1a2332;
    --sn-r-border: rgba(148, 163, 184, 0.22);
    --sn-r-text: #e2e8f0;
    --sn-r-muted: #94a3b8;
    --sn-r-accent: #38bdf8;
    --sn-r-accent-soft: rgba(56, 189, 248, 0.14);
    --sn-r-red: #f87171;
    --sn-r-green: #4ade80;
    --sn-r-hover: rgba(148, 163, 184, 0.10);
}
.sn-ribbon, .sn-ribbon * { box-sizing: border-box; }
.sn-ribbon button, .sn-ribbon input { font-family: inherit; }
.sn-ribbon [hidden] { display: none !important; }
.sn-ribbon-tab {
    position: absolute;
    top: 50%;
    right: 0;
    transform: translateY(-50%);
    width: 38px;
    padding: 12px 0 10px;
    border: 1px solid var(--sn-r-border);
    border-right: 0;
    border-radius: 12px 0 0 12px;
    background: var(--sn-r-bg);
    color: var(--sn-r-text);
    box-shadow: -6px 0 22px rgba(15, 23, 42, 0.16);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 7px;
    cursor: pointer;
    pointer-events: auto;
}
.sn-ribbon-tab:hover { background: var(--sn-r-panel); }
.sn-ribbon-tab:focus-visible { outline: 2px solid var(--sn-r-accent); outline-offset: 2px; }
.sn-ribbon-tab-icon { font-size: 19px; line-height: 1; }
.sn-ribbon-tab-label { writing-mode: vertical-rl; transform: rotate(180deg); font-size: 9px; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; color: var(--sn-r-muted); }
.sn-ribbon-count { min-width: 18px; padding: 2px 4px; border-radius: 999px; background: var(--sn-r-accent-soft); color: var(--sn-r-accent); font-size: 9px; font-weight: 800; font-variant-numeric: tabular-nums; }
.sn-ribbon-panel {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 360px;
    max-width: 92vw;
    display: flex;
    flex-direction: column;
    background: var(--sn-r-panel);
    border-left: 1px solid var(--sn-r-border);
    box-shadow: -16px 0 48px rgba(15, 23, 42, 0.18);
    transform: translateX(100%);
    visibility: hidden;
    transition: transform .2s cubic-bezier(.2, .8, .2, 1), visibility 0s linear .2s;
    pointer-events: auto;
}
.sn-ribbon-panel.is-open { transform: none; visibility: visible; transition-delay: 0s; }
.sn-ribbon-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 14px 14px 10px; border-bottom: 1px solid var(--sn-r-border); }
.sn-ribbon-head strong { display: block; font-size: 13px; letter-spacing: -0.01em; }
.sn-ribbon-head small { display: block; color: var(--sn-r-muted); font-size: 10px; margin-top: 2px; }
.sn-ribbon-head-actions { display: flex; gap: 4px; }
.sn-ribbon-icon-btn { width: 24px; height: 24px; padding: 0; border: 0; border-radius: 7px; background: var(--sn-r-surface); color: var(--sn-r-text); cursor: pointer; font-size: 13px; line-height: 1; display: inline-flex; align-items: center; justify-content: center; }
.sn-ribbon-icon-btn:hover { background: var(--sn-r-hover); }
.sn-ribbon-icon-btn:focus-visible { outline: 2px solid var(--sn-r-accent); outline-offset: 1px; }
.sn-ribbon-composer { padding: 10px 14px; border-bottom: 1px solid var(--sn-r-border); display: flex; flex-direction: column; gap: 7px; }
.sn-ribbon-modes { display: flex; gap: 4px; }
.sn-ribbon-mode { padding: 4px 9px; border: 1px solid var(--sn-r-border); border-radius: 999px; background: transparent; color: var(--sn-r-muted); font-size: 9px; font-weight: 800; cursor: pointer; }
.sn-ribbon-mode.is-active { background: var(--sn-r-accent-soft); border-color: var(--sn-r-accent); color: var(--sn-r-text); }
.sn-ribbon-input-row { display: flex; gap: 6px; }
.sn-ribbon-input-row input { flex: 1; min-width: 0; padding: 8px 10px; border: 1px solid var(--sn-r-border); border-radius: 9px; background: var(--sn-r-surface); color: var(--sn-r-text); font-size: 12px; }
.sn-ribbon-input-row input:focus { outline: 2px solid var(--sn-r-accent); outline-offset: 1px; }
.sn-ribbon-input-row button { padding: 0 13px; border: 1px solid var(--sn-r-accent); border-radius: 9px; background: var(--sn-r-accent-soft); color: var(--sn-r-text); font-size: 11px; font-weight: 700; cursor: pointer; }
.sn-ribbon-scroll { flex: 1; overflow-y: auto; padding: 8px 10px 12px; }
.sn-ribbon-section { margin: 10px 4px 5px; font-size: 9px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: var(--sn-r-muted); }
.sn-ribbon-note { display: flex; align-items: flex-start; gap: 8px; padding: 8px 8px; border-radius: 9px; cursor: pointer; }
.sn-ribbon-note:hover { background: var(--sn-r-hover); }
.sn-ribbon-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 5px; flex: none; background: #fde047; }
.sn-ribbon-dot.c-yellow { background: #fde047; }
.sn-ribbon-dot.c-pink { background: #f9a8d4; }
.sn-ribbon-dot.c-blue { background: #93c5fd; }
.sn-ribbon-dot.c-green { background: #86efac; }
.sn-ribbon-dot.c-orange { background: #fdba74; }
.sn-ribbon-note-main { flex: 1; min-width: 0; }
.sn-ribbon-note-text { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 12px; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; }
.sn-ribbon-note-title { font-size: 12px; font-weight: 700; line-height: 1.4; overflow-wrap: anywhere; }
.sn-ribbon-items { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.sn-ribbon-item { display: flex; align-items: flex-start; gap: 6px; font-size: 11px; line-height: 1.4; }
.sn-ribbon-item input { width: 14px; height: 14px; margin: 0; flex: none; accent-color: var(--sn-r-accent); cursor: pointer; }
.sn-ribbon-item span { overflow-wrap: anywhere; }
.sn-ribbon-item.is-done span { text-decoration: line-through; opacity: 0.55; }
.sn-ribbon-meta { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 3px; font-size: 9px; font-weight: 600; color: var(--sn-r-muted); }
.sn-ribbon-meta .overdue { color: var(--sn-r-red); }
.sn-ribbon-pin { width: 22px; height: 22px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--sn-r-muted); cursor: pointer; font-size: 11px; flex: none; }
.sn-ribbon-pin:hover { background: var(--sn-r-hover); }
.sn-ribbon-empty { padding: 22px 12px; text-align: center; color: var(--sn-r-muted); font-size: 11px; line-height: 1.55; }
.sn-ribbon-error { margin: 10px; padding: 10px; border: 1px solid rgba(185, 28, 28, 0.35); border-radius: 9px; background: rgba(185, 28, 28, 0.08); color: var(--sn-r-red); font-size: 11px; line-height: 1.5; }
.sn-ribbon-foot { padding: 10px 14px 14px; border-top: 1px solid var(--sn-r-border); }
.sn-ribbon-foot button { width: 100%; padding: 8px 12px; border: 1px solid var(--sn-r-border); border-radius: 9px; background: var(--sn-r-surface); color: var(--sn-r-text); font-size: 11px; font-weight: 700; cursor: pointer; }
.sn-ribbon-foot button:hover { border-color: var(--sn-r-accent); }
.sn-ribbon-foot button:focus-visible { outline: 2px solid var(--sn-r-accent); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .sn-ribbon * { transition: none !important; animation: none !important; } }
`;

const CHANNEL_NAME = 'ethos-sticky-notes';
const DEFAULT_SETTINGS = { ribbon_enabled: false, ribbon_show_completed: true };

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

export async function mount(host, ctx) {
    host.replaceChildren();
    if (!ctx?.pkg?.id || typeof ctx.proxy !== 'function') {
        ctx?.log?.('warning', 'Sticky Notes ribbon: host context is incomplete');
        return () => {};
    }

    const state = {
        notes: [],
        settings: { ...DEFAULT_SETTINGS },
        error: '',
        mode: 'note',
        open: false,
        pushSubscription: null,
    };

    const style = document.createElement('style');
    style.textContent = STYLE;
    const root = document.createElement('div');
    root.className = 'sn-ribbon';
    root.setAttribute('data-testid', 'sn-ribbon');
    root.innerHTML = `
        <button type="button" class="sn-ribbon-tab" data-action="toggle" data-testid="sn-ribbon-tab"
            title="Sticky Notes" aria-label="Open Sticky Notes ribbon" aria-expanded="false">
            <span class="sn-ribbon-tab-icon" aria-hidden="true">🗒️</span>
            <span class="sn-ribbon-tab-label">Notes</span>
            <span class="sn-ribbon-count" data-count hidden>0</span>
        </button>
        <aside class="sn-ribbon-panel" data-testid="sn-ribbon-panel" aria-label="Sticky Notes ribbon">
            <header class="sn-ribbon-head">
                <div><strong>Sticky Notes</strong><small>Quick notes &amp; tasks</small></div>
                <div class="sn-ribbon-head-actions">
                    <button type="button" class="sn-ribbon-icon-btn" data-action="open-app" title="Open Sticky Notes" aria-label="Open Sticky Notes">↗</button>
                    <button type="button" class="sn-ribbon-icon-btn" data-action="close" title="Close" aria-label="Close ribbon">×</button>
                </div>
            </header>
            <form class="sn-ribbon-composer" data-testid="sn-ribbon-composer">
                <div class="sn-ribbon-modes" role="group" aria-label="Quick add type">
                    <button type="button" class="sn-ribbon-mode is-active" data-mode="note">Note</button>
                    <button type="button" class="sn-ribbon-mode" data-mode="checklist">Task</button>
                </div>
                <div class="sn-ribbon-input-row">
                    <input type="text" data-composer placeholder="Write a note…" aria-label="Quick add" maxlength="2000">
                    <button type="submit" data-testid="sn-ribbon-add">Add</button>
                </div>
            </form>
            <div class="sn-ribbon-scroll" data-list></div>
            <footer class="sn-ribbon-foot">
                <button type="button" data-action="open-app">Open Sticky Notes</button>
            </footer>
        </aside>`;
    host.append(style, root);

    const tab = root.querySelector('.sn-ribbon-tab');
    const panel = root.querySelector('.sn-ribbon-panel');
    const list = root.querySelector('[data-list]');
    const composer = root.querySelector('[data-composer]');
    const count = root.querySelector('[data-count]');

    // ── API ────────────────────────────────────────────────────────────────
    const api = (path, options) => ctx.proxy(`api/sticky-notes${path}`, options);
    const send = (path, method, body) => api(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
    });
    const errorText = (error) => error?.detail || error?.message || 'Sticky Notes is unavailable';

    // ── rendering ──────────────────────────────────────────────────────────
    function activeNotes() {
        return state.notes.filter((note) => !note.archived);
    }

    function noteRowHtml(note) {
        const color = ['yellow', 'pink', 'blue', 'green', 'orange'].includes(note.color) ? note.color : 'yellow';
        const pinned = Boolean(note.pinned);
        const due = note.due_at ? `<span class="${note.due_at < today() && !isComplete(note) ? 'overdue' : ''}">Due ${escapeHtml(note.due_at)}</span>` : '';
        const reminder = note.reminder_at ? `<span>⏰ ${escapeHtml(new Date(note.reminder_at).toLocaleString())}</span>` : '';
        const meta = due || reminder ? `<div class="sn-ribbon-meta">${due}${reminder}</div>` : '';
        const pinButton = `<button type="button" class="sn-ribbon-pin" data-action="pin" data-note="${escapeHtml(note.id)}"
            title="${pinned ? 'Unpin' : 'Pin'}" aria-label="${pinned ? 'Unpin note' : 'Pin note'}">${pinned ? '📌' : '📍'}</button>`;
        if (note.kind === 'checklist') {
            const items = (note.items || [])
                .filter((item) => state.settings.ribbon_show_completed || !item.done)
                .map((item) => `<li class="sn-ribbon-item${item.done ? ' is-done' : ''}">
                    <input type="checkbox" data-action="toggle-item" data-note="${escapeHtml(note.id)}"
                        data-item="${escapeHtml(item.id)}" ${item.done ? 'checked' : ''} aria-label="Toggle item">
                    <span>${escapeHtml(item.text)}</span>
                </li>`).join('');
            const title = note.text ? `<div class="sn-ribbon-note-title">${escapeHtml(note.text)}</div>` : '';
            return `<div class="sn-ribbon-note" data-open="${escapeHtml(note.id)}" role="button" tabindex="0">
                <span class="sn-ribbon-dot c-${color}" aria-hidden="true"></span>
                <div class="sn-ribbon-note-main">${title}
                    ${items ? `<ul class="sn-ribbon-items">${items}</ul>` : ''}
                    ${meta}
                </div>
                ${pinButton}
            </div>`;
        }
        return `<div class="sn-ribbon-note" data-open="${escapeHtml(note.id)}" role="button" tabindex="0">
            <span class="sn-ribbon-dot c-${color}" aria-hidden="true"></span>
            <div class="sn-ribbon-note-main">
                <div class="sn-ribbon-note-text">${escapeHtml(note.text || 'Empty note')}</div>
                ${meta}
            </div>
            ${pinButton}
        </div>`;
    }

    function render() {
        const notes = activeNotes();
        count.textContent = String(notes.length);
        count.hidden = notes.length === 0;
        if (state.error && state.settings.ribbon_enabled) {
            list.innerHTML = `<div class="sn-ribbon-error">${escapeHtml(state.error)}</div>`;
            return;
        }
        if (!notes.length) {
            list.innerHTML = '<div class="sn-ribbon-empty"><strong>No notes yet.</strong><br>Add one above — it is saved on the NAS.</div>';
            return;
        }
        const pinned = notes.filter((note) => note.pinned);
        const rest = notes.filter((note) => !note.pinned);
        list.innerHTML = `
            ${pinned.length ? `<div class="sn-ribbon-section">Pinned</div>${pinned.map(noteRowHtml).join('')}` : ''}
            ${rest.length ? `<div class="sn-ribbon-section">Notes &amp; tasks</div>${rest.map(noteRowHtml).join('')}` : ''}`;
    }

    function today() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function isComplete(note) {
        const items = note.items || [];
        return items.length > 0 && !items.some((item) => !item.done);
    }

    // ── data ───────────────────────────────────────────────────────────────
    async function loadSettings() {
        try {
            const data = await api('/settings');
            state.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
            applyEnabled();
        } catch (error) {
            ctx.log?.('warning', 'Sticky Notes ribbon: settings unavailable', String(error?.message || error));
            applyEnabled();
        }
    }

    async function refresh() {
        if (!state.settings.ribbon_enabled) return;
        try {
            const data = await api('');
            state.notes = Array.isArray(data.notes) ? data.notes : [];
            state.error = '';
        } catch (error) {
            state.error = errorText(error);
            ctx.log?.('warning', 'Sticky Notes ribbon: notes unavailable', String(error?.message || error));
        }
        render();
    }

    function applyEnabled() {
        const enabled = Boolean(state.settings.ribbon_enabled);
        tab.hidden = !enabled;
        if (!enabled) closePanel();
        try { ctx.setDesktopGutter?.(enabled ? 44 : 0); } catch { /* older core */ }
        if (enabled) refresh();
        else render();
    }

    // ── open / close ──────────────────────────────────────────────────────
    function openPanel() {
        if (!state.settings.ribbon_enabled) return;
        state.open = true;
        panel.classList.add('is-open');
        tab.setAttribute('aria-expanded', 'true');
        refresh();
        setTimeout(() => composer?.focus(), 50);
    }

    function closePanel() {
        state.open = false;
        panel.classList.remove('is-open');
        tab.setAttribute('aria-expanded', 'false');
    }

    function togglePanel() {
        if (state.open) closePanel();
        else openPanel();
    }

    function openApp() {
        try { ctx.openApp?.(`pkg-${ctx.pkg.id}`); } catch { /* window may be closing */ }
        closePanel();
    }

    function broadcast(type) {
        try { channel?.postMessage({ type, at: Date.now() }); } catch { /* closed */ }
    }

    // ── reminders (fallback when this browser has no push subscription) ───
    async function refreshPushSubscription() {
        state.pushSubscription = null;
        try {
            if (!window.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
            const registration = await Promise.race([
                navigator.serviceWorker.ready,
                new Promise((_, reject) => setTimeout(() => reject(new Error('no service worker')), 2500)),
            ]);
            state.pushSubscription = await registration.pushManager.getSubscription();
        } catch {
            state.pushSubscription = null;
        }
    }

    async function pollReminders() {
        if (document.visibilityState !== 'visible' || state.pushSubscription) return;
        try {
            const data = await api('/reminders/due');
            for (const reminder of data.reminders || []) {
                try {
                    ctx.notifications?.emit?.({
                        kind: 'info',
                        title: 'Sticky Notes',
                        message: reminder.body || 'Reminder',
                        action: { appId: `pkg-${ctx.pkg.id}`, label: 'Open notes' },
                        dedupe_key: reminder.tag,
                    });
                } catch { /* notification centre unavailable */ }
            }
        } catch { /* best-effort */ }
    }

    // ── actions ────────────────────────────────────────────────────────────
    async function quickAdd(text) {
        const value = String(text || '').trim();
        if (!value) return;
        try {
            const body = state.mode === 'checklist'
                ? { kind: 'checklist', text: '', items: [{ text: value }] }
                : { kind: 'note', text: value };
            const data = await send('', 'POST', body);
            state.notes = Array.isArray(data.notes) ? data.notes : state.notes;
            state.error = '';
            render();
            broadcast('notes');
            composer.value = '';
            composer.focus();
        } catch (error) {
            ctx.notifications?.toast?.(errorText(error), 'error');
            ctx.log?.('error', 'Sticky Notes ribbon: quick add failed', String(error?.message || error));
        }
    }

    async function toggleItem(noteId, itemId, done) {
        try {
            const data = await send(`/${encodeURIComponent(noteId)}/items/${encodeURIComponent(itemId)}`, 'PUT', { done });
            state.notes = Array.isArray(data.notes) ? data.notes : state.notes;
            render();
            broadcast('notes');
        } catch (error) {
            ctx.log?.('error', 'Sticky Notes ribbon: could not toggle item', String(error?.message || error));
        }
    }

    async function togglePin(noteId) {
        const note = state.notes.find((item) => item.id === noteId);
        if (!note) return;
        try {
            const data = await send(`/${encodeURIComponent(noteId)}`, 'PUT', { pinned: !note.pinned });
            state.notes = Array.isArray(data.notes) ? data.notes : state.notes;
            render();
            broadcast('notes');
        } catch (error) {
            ctx.log?.('error', 'Sticky Notes ribbon: could not pin note', String(error?.message || error));
        }
    }

    // ── events ─────────────────────────────────────────────────────────────
    function onClick(event) {
        const mode = event.target.closest('[data-mode]');
        if (mode) {
            state.mode = mode.dataset.mode === 'checklist' ? 'checklist' : 'note';
            root.querySelectorAll('[data-mode]').forEach((button) => {
                button.classList.toggle('is-active', button.dataset.mode === state.mode);
            });
            composer.placeholder = state.mode === 'checklist' ? 'Add a task…' : 'Write a note…';
            composer.focus();
            return;
        }
        const action = event.target.closest('[data-action]');
        if (!action) {
            const row = event.target.closest('[data-open]');
            if (row) openApp();
            return;
        }
        const name = action.dataset.action;
        if (name === 'toggle') { togglePanel(); return; }
        if (name === 'close') { closePanel(); return; }
        if (name === 'open-app') { openApp(); return; }
        if (name === 'pin') { event.stopPropagation(); togglePin(action.dataset.note); return; }
        if (name === 'toggle-item') { event.stopPropagation(); return; }
        event.stopPropagation();
    }

    function onChange(event) {
        const target = event.target;
        if (target.dataset?.action === 'toggle-item') {
            event.stopPropagation();
            toggleItem(target.dataset.note, target.dataset.item, target.checked);
        }
    }

    function onSubmit(event) {
        event.preventDefault();
        quickAdd(composer.value);
    }

    function onKeydown(event) {
        if (event.key === 'Escape' && state.open) {
            event.stopPropagation();
            closePanel();
        }
        if (event.key === 'Enter' && event.target.matches?.('[data-open]')) {
            openApp();
        }
    }

    function onOutsidePointer(event) {
        if (!state.open) return;
        if (!root.contains(event.target)) closePanel();
    }

    async function onChannelMessage(event) {
        const data = event.data || {};
        if (data.type === 'settings') {
            await loadSettings();
            return;
        }
        if (data.type === 'notes' && state.settings.ribbon_enabled) await refresh();
    }

    let channel = null;
    try { channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL_NAME) : null; } catch { channel = null; }
    channel?.addEventListener('message', onChannelMessage);

    // The Notification Center owns the right edge; close when its sheet opens.
    const drawer = document.getElementById('notificationDrawer');
    const observer = drawer && typeof MutationObserver === 'function'
        ? new MutationObserver(() => {
            if (drawer.classList.contains('open')) closePanel();
        })
        : null;
    observer?.observe(drawer, { attributes: true, attributeFilter: ['class'] });

    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    root.addEventListener('submit', onSubmit);
    root.addEventListener('keydown', onKeydown);
    document.addEventListener('pointerdown', onOutsidePointer, true);

    const reminderTimer = setInterval(pollReminders, 60000);
    const refreshTimer = setInterval(() => {
        if (state.open && document.visibilityState === 'visible') refresh();
    }, 60000);
    const pushTimer = setInterval(refreshPushSubscription, 5 * 60000);

    await refreshPushSubscription();
    await loadSettings();
    if (state.settings.ribbon_enabled) refresh();
    pollReminders();

    return () => {
        clearInterval(reminderTimer);
        clearInterval(refreshTimer);
        clearInterval(pushTimer);
        observer?.disconnect();
        channel?.removeEventListener('message', onChannelMessage);
        try { channel?.close(); } catch { /* already closed */ }
        root.removeEventListener('click', onClick);
        root.removeEventListener('change', onChange);
        root.removeEventListener('submit', onSubmit);
        root.removeEventListener('keydown', onKeydown);
        document.removeEventListener('pointerdown', onOutsidePointer, true);
        try { ctx.setDesktopGutter?.(0); } catch { /* older core */ }
        host.replaceChildren();
    };
}
