// EthOS NAS — Kanban (Package Center app)
// Boards → columns → cards with drag & drop, labels, due dates and a card editor.
// Backend: this package's own service (server/main.py) through the authenticated
// package proxy: /api/packages/ethos-kanban/proxy/api/kanban/…

// ── Native-module shim ────────────────────────────────────────────────────────
// The module is loaded as a blob, so it cannot import core helpers. Everything
// it needs comes from `ctx` (the loader passes it to render()).

let _ctx = null;
let _helpers = null;

function _ready() {
    if (!_ctx) throw new Error('Kanban is not mounted yet');
    return _helpers;
}

// The UI calls these as plain identifiers; they resolve to the core helpers.
const escapeHtml = (value) => _ready().escapeHtml(value);
const escapeAttr = (value) => _ready().escapeAttr(value);
const jsAttr = (value) => _ready().jsAttr(value);

function apiFetch(path, options) {
    const suffix = String(path || '').replace(/^\/+/, '');
    return _ctx.apiFetch(`/api/packages/${_ctx.pkg.id}/proxy/${suffix}`, options);
}

async function readErrorDetail(resp) {
    try {
        const data = await resp.clone().json();
        if (data && data.detail) return String(data.detail);
        return JSON.stringify(data);
    } catch (_) {
        return `HTTP ${resp.status}`;
    }
}

function showToast(message, kind = 'info') {
    try { _ctx.notifications.toast(String(message), kind); } catch (_) { /* window closing */ }
}

function showConfirm(options) {
    return _ctx.modal.confirm(options);
}

function showPrompt(title, message, defaultValue, callback) {
    // The shared form modal is the only dialog implementation a package may use.
    const inputStyle = 'width:100%;box-sizing:border-box;padding:8px 10px;font-size:13px;border-radius:8px;'
        + 'border:1px solid var(--border);background:var(--surface-0);color:var(--text-1);';
    return _ctx.modal.form({
        title,
        confirmLabel: 'OK',
        bodyHtml: `
            <p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:var(--text-3);">${escapeHtml(message)}</p>
            <input name="value" type="text" data-testid="kanban-prompt-input"
                   value="${escapeAttr(defaultValue || '')}" style="${inputStyle}">`,
        validate: (values) => (String(values.value || '').trim() ? '' : 'Enter a value'),
        onSubmit: async (values) => {
            const value = String(values.value || '').trim();
            if (typeof callback === 'function') await callback(value);
            return value;
        },
        onReady: (bodyEl) => {
            const input = bodyEl.querySelector('input[name="value"]');
            if (input) { input.focus(); input.select(); }
        },
    });
}

// ── Module state ──────────────────────────────────────────────────────────────

const _state = { boards: [], boardId: null };
let _dragCardId = null;      // card id currently being dragged (set on dragstart)
let _dropIndicator = null;   // the visual insertion line element

// Deterministic label colors — same label always gets the same chip color.
// Chip backgrounds carry white 10 px text — every entry is ≥4.9:1 (TODO.md P3-11).
const LABEL_COLORS = ['#2563eb', '#15803d', '#a16207', '#b91c1c', '#7e22ce', '#be185d', '#0f766e', '#c2410c'];
function labelColor(label) {
    let h = 0;
    for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
    return LABEL_COLORS[h % LABEL_COLORS.length];
}

const COLUMN_DOTS = ['#64748b', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ec4899'];
function columnDot(index) { return COLUMN_DOTS[index % COLUMN_DOTS.length]; }

// ── API helpers ───────────────────────────────────────────────────────────────

async function _api(path, options = {}) {
    const resp = await apiFetch(path, options);
    if (!resp.ok) {
        throw new Error(await readErrorDetail(resp));
    }
    return resp.status === 204 ? null : resp.json();
}

const _jsonOpts = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// ── Rendering ─────────────────────────────────────────────────────────────────

export async function renderKanbanPage(body) {
    if (!body) return;

    body.innerHTML = `
        <div id="kanbanApp" data-testid="kanban-app" style="height:100%;display:flex;flex-direction:column;background:var(--bg-primary);font-family:system-ui,sans-serif;color:var(--text-1);">
            <!-- Toolbar -->
            <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border);flex-wrap:wrap;">
                <h2 style="margin:0;font-size:17px;font-weight:700;display:flex;align-items:center;gap:8px;color:var(--text-1);">
                    <span>🗂️</span> Kanban
                </h2>
                <select id="kanbanBoardSelect" data-testid="kanban-board-select" aria-label="Select board"
                        onchange="window._kanbanSwitchBoard(this.value)"
                        style="padding:6px 10px;font-size:13px;border-radius:8px;border:1px solid var(--border);background:var(--surface-2);color:var(--text-1);cursor:pointer;max-width:240px;"></select>
                <button class="btn-ghost" data-testid="kanban-new-board-btn" onclick="window._kanbanNewBoard()" title="Create a new board"
                        style="padding:6px 12px;font-size:12px;border-radius:8px;background:#2563eb;color:white;border:none;cursor:pointer;">+ New Board</button>
                <button class="btn-ghost" data-testid="kanban-delete-board-btn" onclick="window._kanbanDeleteBoard()" title="Delete current board"
                        style="padding:6px 10px;font-size:12px;border-radius:8px;background:none;color:var(--text-3);border:1px solid var(--border);cursor:pointer;">🗑</button>
                <div style="flex:1;"></div>
                <span id="kanbanBoardMeta" data-testid="kanban-board-meta" style="font-size:11px;color:var(--text-3);"></span>
                <button class="btn-ghost" data-testid="kanban-refresh-btn" onclick="window._kanbanLoad()" title="Refresh"
                        style="padding:6px 12px;font-size:12px;border-radius:8px;border:1px solid var(--border);background:var(--surface-2);color:var(--text-2);cursor:pointer;">🔄</button>
            </div>

            <!-- Board area -->
            <div id="kanbanBoardArea" data-testid="kanban-board-area" style="flex:1;overflow:auto;padding:16px;"></div>
        </div>`;

    await window._kanbanLoad();
}

function currentBoard() {
    return _state.boards.find(b => b.id === _state.boardId) || null;
}

async function window_kanbanLoad() {
    const area = document.getElementById('kanbanBoardArea');
    if (!area) return;
    try {
        const data = await _api('/api/kanban');
        _state.boards = data.boards || [];
        // Keep the selected board if it still exists, otherwise pick the first.
        if (!_state.boardId || !_state.boards.some(b => b.id === _state.boardId)) {
            _state.boardId = _state.boards.length ? _state.boards[0].id : null;
        }
        window._kanbanRender();
    } catch (e) {
        area.innerHTML = `<div style="text-align:center;padding:48px;color:#ef4444;font-size:13px;">❌ ${escapeHtml(e.message)}</div>`;
    }
}

function window_kanbanRender() {
    const select = document.getElementById('kanbanBoardSelect');
    const meta = document.getElementById('kanbanBoardMeta');
    const area = document.getElementById('kanbanBoardArea');
    if (!select || !area) return;

    // Board dropdown
    select.innerHTML = _state.boards.map(b =>
        `<option value="${escapeAttr(b.id)}"${b.id === _state.boardId ? ' selected' : ''}>${escapeHtml(b.name)}</option>`).join('');

    const board = currentBoard();
    if (!board) {
        meta.textContent = '';
        area.innerHTML = `
            <div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;color:var(--text-3);">
                <div style="font-size:52px;">🗂️</div>
                <div style="font-size:15px;font-weight:600;color:var(--text-2);">No boards yet</div>
                <button class="btn-ghost" data-testid="kanban-empty-new-board" onclick="window._kanbanNewBoard()"
                        style="padding:8px 18px;font-size:13px;border-radius:8px;background:#2563eb;color:white;border:none;cursor:pointer;">+ Create your first board</button>
            </div>`;
        return;
    }

    const totalCards = board.columns.reduce((n, c) => n + c.cards.length, 0);
    meta.textContent = `${board.columns.length} columns · ${totalCards} cards`;

    area.innerHTML = `
        <div id="kanbanColumns" data-testid="kanban-columns" style="display:flex;gap:12px;align-items:flex-start;height:100%;min-width:min-content;">
            ${board.columns.map((c, i) => _columnHtml(board, c, i)).join('')}
            <button class="btn-ghost" data-testid="kanban-add-column-btn" onclick="window._kanbanAddColumn()" title="Add a column"
                    style="padding:10px 16px;font-size:12px;border-radius:10px;border:1px dashed var(--border);background:transparent;color:var(--text-3);cursor:pointer;white-space:nowrap;">+ Add Column</button>
        </div>`;

    _bindDragAndDrop();
}

function _columnHtml(board, col, index) {
    const dot = columnDot(index);
    const limit = col.wip_limit || null;
    const atLimit = !!(limit && col.cards.length >= limit);
    const countText = limit ? `${col.cards.length}/${limit}` : `${col.cards.length}`;
    const countStyle = atLimit
        ? 'font-size:11px;font-weight:700;color:white;background:#ef4444;padding:1px 8px;border-radius:999px;'
        : `font-size:11px;font-weight:600;color:${limit ? 'var(--text-1)' : 'var(--text-3)'};background:var(--surface-2);padding:1px 8px;border-radius:999px;`;
    const wipTitle = limit ? `WIP limit: ${limit} card(s) — click to change` : 'No WIP limit — click to set one';
    return `
    <div class="kanban-col" data-testid="kanban-col-${escapeAttr(col.id)}" data-column-id="${escapeAttr(col.id)}"
         style="width:280px;min-width:280px;display:flex;flex-direction:column;background:var(--surface-1);border:1px solid var(--border);border-radius:12px;max-height:100%;">
        <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--border);">
            <span data-testid="kanban-col-dot-${escapeAttr(col.id)}" style="width:9px;height:9px;border-radius:50%;background:${dot};flex:none;"></span>
            <span class="kanban-col-title" data-testid="kanban-col-title-${escapeAttr(col.id)}" title="Double-click to rename"
                  ondblclick="window._kanbanRenameColumn('${jsAttr(col.id)}')"
                  style="font-size:13px;font-weight:700;cursor:default;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-1);">${escapeHtml(col.title)}</span>
            <span data-testid="kanban-col-count-${escapeAttr(col.id)}" style="${countStyle}">${countText}</span>
            <button class="btn-ghost" data-testid="kanban-col-wip-${escapeAttr(col.id)}" onclick="window._kanbanSetWipLimit('${jsAttr(col.id)}')" title="${wipTitle}"
                    style="font-size:11px;padding:2px 5px;color:var(--text-3);background:none;border:none;cursor:pointer;">${limit ? '🔒' : '∞'}</button>
            <button class="btn-ghost" data-testid="kanban-col-rename-${escapeAttr(col.id)}" onclick="window._kanbanRenameColumn('${jsAttr(col.id)}')" title="Rename column"
                    style="font-size:11px;padding:2px 5px;color:var(--text-3);background:none;border:none;cursor:pointer;">✏️</button>
            <button class="btn-ghost" data-testid="kanban-col-delete-${escapeAttr(col.id)}" onclick="window._kanbanDeleteColumn('${jsAttr(col.id)}')" title="Delete column"
                    style="font-size:11px;padding:2px 5px;color:var(--text-3);background:none;border:none;cursor:pointer;">🗑</button>
        </div>

        <div class="kanban-col-cards" data-testid="kanban-col-cards-${escapeAttr(col.id)}" data-column-id="${escapeAttr(col.id)}"
             style="flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:8px;min-height:40px;">${col.cards.map(c => _cardHtml(board, col.id, c)).join('')}</div>

        <div style="padding:8px;border-top:1px solid var(--border);">
            <button class="btn-ghost" data-testid="kanban-add-card-btn-${escapeAttr(col.id)}" onclick="window._kanbanShowComposer('${jsAttr(col.id)}')"
                    style="width:100%;padding:7px;font-size:12px;border-radius:8px;background:none;border:none;color:var(--text-3);cursor:pointer;text-align:left;">+ Add a card</button>
            <div id="kanbanComposer${escapeAttr(col.id)}" data-testid="kanban-composer-${escapeAttr(col.id)}" style="display:none;margin-top:6px;"></div>
        </div>
    </div>`;
}

function _cardHtml(board, colId, card) {
    const labels = (card.labels || []).map(l =>
        `<span data-testid="kanban-card-label-${escapeAttr(card.id)}" style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:999px;color:white;background:${labelColor(l)};">${escapeHtml(l)}</span>`).join('');
    const due = _dueBadge(card.due_date);
    return `
    <div class="kanban-card" data-testid="kanban-card-${escapeAttr(card.id)}" data-card-id="${escapeAttr(card.id)}" draggable="true"
         onclick="window._kanbanCardClick('${jsAttr(card.id)}')"
         style="background:var(--surface-0);border:1px solid var(--border);border-radius:9px;padding:10px;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.15);transition:border-color .12s, transform .12s;">
        <div data-testid="kanban-card-title-${escapeAttr(card.id)}" style="font-size:13px;font-weight:600;line-height:1.4;color:var(--text-1);word-break:break-word;">${escapeHtml(card.title)}</div>
        ${(labels || due) ? `<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:8px;align-items:center;">${labels}${due}</div>` : ''}
        ${card.description ? '<div style="margin-top:7px;font-size:11px;color:var(--text-3);">💬 has description</div>' : ''}
    </div>`;
}

function _dueBadge(dueDate) {
    if (!dueDate) return '';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate + 'T00:00:00');
    const overdue = due < today;
    const label = due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `<span data-testid="kanban-card-due" style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:999px;${overdue ? 'background:#b91c1c;color:#ffffff;' : 'background:var(--surface-2);color:var(--text-2);'}">${overdue ? '⚠' : '📅'} ${escapeHtml(label)}</span>`;
}

// ── Drag & drop (HTML5 DnD with insertion indicator) ─────────────────────────

function _bindDragAndDrop() {
    document.querySelectorAll('#kanbanColumns .kanban-card').forEach(el => {
        el.addEventListener('dragstart', e => {
            _dragCardId = el.getAttribute('data-card-id');
            e.dataTransfer.effectAllowed = 'move';
            try { e.dataTransfer.setData('text/plain', _dragCardId); } catch (_) {}
            setTimeout(() => el.classList.add('kanban-dragging'), 0);
        });
        el.addEventListener('dragend', () => {
            _dragCardId = null;
            el.classList.remove('kanban-dragging');
            _clearDropVisuals();
            // Suppress the click event that follows a drag (would open the editor).
            window.__kanbanJustDragged = true;
            setTimeout(() => { window.__kanbanJustDragged = false; }, 200);
        });
    });

    document.querySelectorAll('#kanbanColumns .kanban-col-cards').forEach(zone => {
        zone.addEventListener('dragover', e => {
            if (!_dragCardId) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            _showDropIndicator(zone, e.clientY);
        });
        zone.addEventListener('drop', e => {
            if (!_dragCardId) return;
            e.preventDefault();
            const colId = zone.getAttribute('data-column-id');
            const pos = _insertIndexAt(zone, e.clientY);
            const cardId = _dragCardId;
            _clearDropVisuals();
            window._kanbanMoveCard(cardId, colId, pos).catch(err => {
                if (window.showToast) window.showToast(err.message, 'error');
            });
        });
    });

    // Highlight the column being hovered over.
    document.querySelectorAll('#kanbanColumns .kanban-col').forEach(colEl => {
        colEl.addEventListener('dragover', e => {
            if (_dragCardId) colEl.style.borderColor = '#3b82f6';
        });
        colEl.addEventListener('dragleave', e => {
            if (!colEl.contains(e.relatedTarget)) colEl.style.borderColor = '';
        });
    });
}

function _insertIndexAt(zone, clientY) {
    const cards = Array.from(zone.querySelectorAll('.kanban-card:not(.kanban-dragging)'));
    for (let i = 0; i < cards.length; i++) {
        const r = cards[i].getBoundingClientRect();
        if (clientY < r.top + r.height / 2) return i;
    }
    return cards.length;
}

function _showDropIndicator(zone, clientY) {
    // Highlight the hovered column.
    document.querySelectorAll('#kanbanColumns .kanban-col').forEach(c => c.style.borderColor = '');
    const colEl = zone.closest('.kanban-col');
    if (colEl) colEl.style.borderColor = '#3b82f6';

    if (!_dropIndicator) {
        _dropIndicator = document.createElement('div');
        _dropIndicator.className = 'kanban-drop-indicator';
        Object.assign(_dropIndicator.style, { height: '3px', borderRadius: '2px', background: '#3b82f6', margin: '1px 4px' });
    }
    const cards = Array.from(zone.querySelectorAll('.kanban-card:not(.kanban-dragging)'));
    let inserted = false;
    for (const el of cards) {
        const r = el.getBoundingClientRect();
        if (clientY < r.top + r.height / 2) { zone.insertBefore(_dropIndicator, el); inserted = true; break; }
    }
    if (!inserted) zone.appendChild(_dropIndicator);
}

function _clearDropVisuals() {
    if (_dropIndicator && _dropIndicator.parentNode) _dropIndicator.remove();
    document.querySelectorAll('#kanbanColumns .kanban-col').forEach(c => c.style.borderColor = '');
}

// ── Board actions ─────────────────────────────────────────────────────────────

async function window_kanbanSwitchBoard(boardId) {
    _state.boardId = boardId;
    await window._kanbanLoad();
}

function window_kanbanNewBoard() {
    if (!window.showPrompt) return;
    window.showPrompt('Kanban', 'Name for the new board:', '', async (name) => {
        if (!name || !String(name).trim()) return;
        try {
            const board = await _api('/api/kanban', _jsonOpts('POST', { name: String(name).trim() }));
            _state.boards.push(board);
            _state.boardId = board.id;
            window._kanbanRender();
            if (window.showToast) window.showToast(`Board “${board.name}” created`, 'success');
        } catch (e) {
            if (window.showToast) window.showToast(e.message, 'error');
        }
    });
}

async function window_kanbanDeleteBoard() {
    const board = currentBoard();
    if (!board || !window.showConfirm) return;
    await window.showConfirm({ title: 'Kanban', message: `Delete board “${board.name}” and all its cards?`, onConfirm: async () => {
        try {
            await _api(`/api/kanban/${board.id}`, { method: 'DELETE' });
            _state.boards = _state.boards.filter(b => b.id !== board.id);
            _state.boardId = _state.boards.length ? _state.boards[0].id : null;
            window._kanbanRender();
            if (window.showToast) window.showToast('Board deleted', 'success');
        } catch (e) {
            if (window.showToast) window.showToast(e.message, 'error');
        }
    }});
}

// ── Column actions ────────────────────────────────────────────────────────────

function window_kanbanAddColumn() {
    const board = currentBoard();
    if (!board || !window.showPrompt) return;
    window.showPrompt('Kanban', 'Title for the new column:', '', async (title) => {
        if (!title || !String(title).trim()) return;
        try {
            await _api(`/api/kanban/${board.id}/columns`, _jsonOpts('POST', { title: String(title).trim() }));
            await window._kanbanLoad();
        } catch (e) {
            if (window.showToast) window.showToast(e.message, 'error');
        }
    });
}

function window_kanbanSetWipLimit(colId) {
    const board = currentBoard();
    if (!board || !window.showPrompt) return;
    const col = board.columns.find(c => c.id === colId);
    if (!col) return;
    window.showPrompt('Kanban', `WIP limit for “${col.title}” (max cards in this column; leave empty for unlimited):`, col.wip_limit ? String(col.wip_limit) : '', async (val) => {
        if (val === null || val === undefined) return;
        const raw = String(val).trim();
        let limit = null;
        if (raw !== '') {
            limit = Number.parseInt(raw, 10);
            if (!Number.isInteger(limit) || limit < 1 || limit > 999) {
                if (window.showToast) window.showToast('WIP limit must be a whole number from 1 to 999', 'error');
                return;
            }
        }
        try {
            await _api(`/api/kanban/${board.id}/columns/${colId}`, _jsonOpts('PUT', { wip_limit: limit }));
            await window._kanbanLoad();
        } catch (e) {
            if (window.showToast) window.showToast(e.message, 'error');
        }
    });
}

function window_kanbanRenameColumn(colId) {
    const board = currentBoard();
    if (!board || !window.showPrompt) return;
    const col = board.columns.find(c => c.id === colId);
    if (!col) return;
    window.showPrompt('Kanban', 'New column title:', col.title, async (title) => {
        if (!title || !String(title).trim() || String(title).trim() === col.title) return;
        try {
            await _api(`/api/kanban/${board.id}/columns/${colId}`, _jsonOpts('PUT', { title: String(title).trim() }));
            await window._kanbanLoad();
        } catch (e) {
            if (window.showToast) window.showToast(e.message, 'error');
        }
    });
}

async function window_kanbanDeleteColumn(colId) {
    const board = currentBoard();
    if (!board || !window.showConfirm) return;
    const col = board.columns.find(c => c.id === colId);
    if (!col) return;
    await window.showConfirm({ title: 'Kanban', message: `Delete column “${col.title}” and its ${col.cards.length} card(s)?`, onConfirm: async () => {
        try {
            await _api(`/api/kanban/${board.id}/columns/${colId}`, { method: 'DELETE' });
            await window._kanbanLoad();
            if (window.showToast) window.showToast('Column deleted', 'success');
        } catch (e) {
            if (window.showToast) window.showToast(e.message, 'error');
        }
    }});
}

// ── Card composer (inline "add a card") ───────────────────────────────────────

function window_kanbanShowComposer(colId) {
    const host = document.getElementById(`kanbanComposer${colId}`);
    if (!host) return;
    // Toggle: close if already open.
    if (host.style.display !== 'none') { host.innerHTML = ''; host.style.display = 'none'; return; }

    host.innerHTML = `
        <textarea data-testid="kanban-composer-input-${escapeAttr(colId)}" placeholder="What needs to be done?" rows="2"
                  style="width:100%;box-sizing:border-box;padding:8px;font-size:13px;border-radius:8px;border:1px solid var(--border);background:var(--surface-0);color:var(--text-1);resize:none;"></textarea>
        <div style="display:flex;gap:6px;margin-top:6px;">
            <button class="btn-ghost" data-testid="kanban-composer-save-${escapeAttr(colId)}" onclick="window._kanbanComposerSave('${jsAttr(colId)}')"
                    style="padding:5px 12px;font-size:12px;border-radius:7px;background:#2563eb;color:white;border:none;cursor:pointer;">Add card</button>
            <button class="btn-ghost" data-testid="kanban-composer-cancel-${escapeAttr(colId)}" onclick="window._kanbanShowComposer('${jsAttr(colId)}')"
                    style="padding:5px 12px;font-size:12px;border-radius:7px;background:none;color:var(--text-3);border:1px solid var(--border);cursor:pointer;">Cancel</button>
        </div>`;
    host.style.display = 'block';
    const ta = host.querySelector('textarea');
    setTimeout(() => ta.focus(), 30);
    // Enter (without Shift) submits.
    ta.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window._kanbanComposerSave(colId); }
        if (e.key === 'Escape') window._kanbanShowComposer(colId); // toggles closed
    });
}

async function window_kanbanComposerSave(colId) {
    const input = document.querySelector(`[data-testid="kanban-composer-input-${CSS.escape(colId)}"]`);
    if (!input) return;
    const title = input.value.trim();
    if (!title) { input.focus(); return; }

    const board = currentBoard();
    try {
        await _api(`/api/kanban/${board.id}/columns/${colId}/cards`, _jsonOpts('POST', { title }));
        // Re-open the composer after re-render so users can add several cards quickly.
        await window._kanbanLoad();
        window._kanbanShowComposer(colId);
    } catch (e) {
        if (window.showToast) window.showToast(e.message, 'error');
    }
}

// ── Card move / edit / delete ─────────────────────────────────────────────────

async function window_kanbanMoveCard(cardId, toColumnId, position) {
    const board = currentBoard();
    if (!board) return;
    try {
        await _api(`/api/kanban/${board.id}/move-card`, _jsonOpts('POST', { card_id: cardId, to_column_id: toColumnId, position }));
        await window._kanbanLoad();
    } catch (e) {
        if (window.showToast) window.showToast(e.message, 'error');
        await window._kanbanLoad(); // restore server truth
    }
}

function _findCardEverywhere(board, cardId) {
    for (const col of board.columns) {
        const i = col.cards.findIndex(c => c.id === cardId);
        if (i >= 0) return { col, index: i, card: col.cards[i] };
    }
    return null;
}

function window_kanbanCardClick(cardId) {
    if (window.__kanbanJustDragged) return; // click right after a drag — ignore
    window._kanbanOpenCard(cardId);
}

function window_kanbanOpenCard(cardId) {
    const board = currentBoard();
    if (!board) return;
    const found = _findCardEverywhere(board, cardId);
    if (!found) return;
    _openCardModal(found.card);
}

// ── Card editor (shared EthOS form modal) ───────────────────────────────────

function _openCardModal(card) {
    const board = currentBoard();
    if (!board) return;
    const labelsValue = (card.labels || []).join(', ');
    const inputStyle = 'width:100%;box-sizing:border-box;padding:9px 11px;font-size:13px;border-radius:8px;'
        + 'border:1px solid var(--border);background:var(--surface-2);color:var(--text-1);';
    _ctx.modal.form({
        title: 'Edit card',
        confirmLabel: 'Save',
        bodyHtml: `
            <div style="display:flex;flex-direction:column;gap:12px;">
                <input name="title" data-testid="kanban-modal-title" value="${escapeAttr(card.title)}"
                       placeholder="Card title" style="${inputStyle}">
                <textarea name="description" data-testid="kanban-modal-desc" rows="4" placeholder="Description (optional)"
                          style="${inputStyle}resize:vertical;">${escapeHtml(card.description || '')}</textarea>
                <div style="display:flex;gap:10px;">
                    <input name="labels" data-testid="kanban-modal-labels" value="${escapeAttr(labelsValue)}"
                           placeholder="labels, comma separated" style="flex:2;min-width:0;${inputStyle}">
                    <input name="due_date" data-testid="kanban-modal-due" type="date" value="${escapeAttr(card.due_date || '')}"
                           style="flex:1;min-width:0;${inputStyle}">
                </div>
                <div>
                    <button type="button" data-testid="kanban-modal-delete" class="btn-ghost"
                            style="padding:7px 14px;font-size:12px;border-radius:8px;background:none;color:#ef4444;border:1px solid rgba(239,68,68,.4);cursor:pointer;">🗑 Delete</button>
                </div>
            </div>`,
        validate: (values) => (String(values.title || '').trim() ? '' : 'Card title is required'),
        onSubmit: async (values) => {
            const body = {
                title: String(values.title || '').trim(),
                description: values.description || '',
                labels: String(values.labels || '').split(',').map(s => s.trim()).filter(Boolean),
                due_date: values.due_date || null,
            };
            await _api(`/api/kanban/${board.id}/cards/${card.id}`, _jsonOpts('PUT', body));
            await window._kanbanLoad();
            showToast('Card updated', 'success');
        },
        onReady: (bodyEl, modal) => {
            bodyEl.querySelector('[data-testid="kanban-modal-delete"]')?.addEventListener('click', async () => {
                const ok = await _ctx.modal.confirm('Kanban', `Delete card “${card.title}”?`);
                if (!ok) return;
                try {
                    await _api(`/api/kanban/${board.id}/cards/${card.id}`, { method: 'DELETE' });
                    modal.querySelector('[data-testid="modal-form-cancel"]')?.click();
                    await window._kanbanLoad();
                    showToast('Card deleted', 'success');
                } catch (e) {
                    showToast(e.message, 'error');
                }
            });
            bodyEl.querySelector('input[name="title"]')?.focus();
        },
    });
}

// ── Expose handlers for inline onclick attributes ─────────────────────────────

window._kanbanLoad = window_kanbanLoad;
window._kanbanRender = window_kanbanRender;
window._kanbanSwitchBoard = window_kanbanSwitchBoard;
window._kanbanNewBoard = window_kanbanNewBoard;
window._kanbanDeleteBoard = window_kanbanDeleteBoard;
window._kanbanAddColumn = window_kanbanAddColumn;
window._kanbanSetWipLimit = window_kanbanSetWipLimit;
window._kanbanRenameColumn = window_kanbanRenameColumn;
window._kanbanDeleteColumn = window_kanbanDeleteColumn;
window._kanbanShowComposer = window_kanbanShowComposer;
window._kanbanComposerSave = window_kanbanComposerSave;
window._kanbanMoveCard = window_kanbanMoveCard;
window._kanbanCardClick = window_kanbanCardClick;
window._kanbanOpenCard = window_kanbanOpenCard;

// The shell exposes these globally; keep a ctx-based fallback so the module also
// works if a future shell stops publishing them.
if (typeof window.showToast !== 'function') window.showToast = showToast;
if (typeof window.showConfirm !== 'function') window.showConfirm = showConfirm;
if (typeof window.showPrompt !== 'function') window.showPrompt = showPrompt;

// ── Package entry point ───────────────────────────────────────────────────────

export async function render(container, ctx) {
    _ctx = ctx;
    _helpers = {
        escapeHtml: ctx.escape.html,
        escapeAttr: ctx.escape.attr,
        jsAttr: ctx.escape.js,
    };
    _state.boards = [];
    _state.boardId = null;
    ctx.log('info', 'Kanban opened');
    await renderKanbanPage(container);
}
