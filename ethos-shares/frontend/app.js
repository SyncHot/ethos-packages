// EthOS NAS — Samba Share Management App
// ── Native-module shim ────────────────────────────────────────────────────────
// Self-contained: core helpers arrive through `ctx` in render().
let _ctx = null;
const escapeHtml = (value) => _ctx.escape.html(value);
const escapeAttr = (value) => _ctx.escape.attr(value);
const jsAttr = (value) => _ctx.escape.js(value);

function formatBytes(bytes) {
    if (!bytes && bytes !== 0) return '—';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (bytes >= k && i < sizes.length - 1) { bytes /= k; i++; }
    return parseFloat(bytes.toFixed(1)) + ' ' + sizes[i];
}

function apiFetch(path, options) { return _ctx.apiFetch(path, options); }

async function readErrorDetail(res, fallback = '') {
    let payload = null;
    try { payload = await res.clone().json(); } catch (_) { /* non-JSON body */ }
    const detail = payload?.detail ?? payload?.error ?? '';
    const text = typeof detail === 'string' ? detail : JSON.stringify(detail);
    return text || fallback || `HTTP ${res.status}`;
}

async function apiJsonFetch(path, options = {}) {
    const res = await apiFetch(path, options);
    if (!res.ok) throw new Error(await readErrorDetail(res));
    if (res.status === 204) return null;
    return res.json();
}

const showAlert = (title, message) => _ctx.modal.alert(message === undefined ? title : `${title}\n${message}`);
const showModalConfirm = (title, message, onConfirm, onCancel) =>
    _ctx.modal.confirm(title, message, onConfirm, onCancel);

let _sharesBody = null;

// Samba is host software, not part of this package: when the NAS has no smbd /
// testparm there is nothing the app can validate or apply, so say so instead of
// leaving a dead "Add Share" button (see EthOS docs/packages.md).
const _sambaMissingHtml = (status) => {
    const missing = (status.missing_tools || []).join(', ');
    const hint = status.install_hint
        ? `<div style="margin-top:6px;">Run this on the NAS, then press Refresh: <code style="background:rgba(0,0,0,0.35);padding:1px 6px;border-radius:4px;">${escapeHtml(status.install_hint)}</code></div>`
        : '';
    return `<div data-testid="shares-samba-missing" style="margin-bottom:12px;padding:10px 12px;border:1px solid var(--pkg-amber-border, #b45309);border-radius:8px;background:var(--pkg-amber-soft, rgba(180,83,9,0.10));font-size:12px;line-height:1.55;color:var(--pkg-amber, #b45309);flex-shrink:0;">
        <strong>Samba is not installed on this NAS.</strong>
        Shares cannot be validated or applied until it is.${missing ? `<div style="margin-top:6px;">Missing: <code style="background:var(--surface-1);padding:1px 6px;border-radius:4px;">${escapeHtml(missing)}</code></div>` : ''}${hint}
    </div>`;
};

function _applySambaState(status) {
    const wrap = document.getElementById('sharesTableWrap');
    const existing = document.querySelector('[data-testid="shares-samba-missing"]');
    const missing = status && status.samba_installed === false;
    if (!missing) {
        if (existing) existing.remove();
    } else if (wrap && !existing) {
        wrap.insertAdjacentHTML('beforebegin', _sambaMissingHtml(status));
    }
    const addBtn = document.querySelector('[data-testid="shares-add-btn"]');
    if (addBtn) {
        addBtn.disabled = !!missing;
        addBtn.style.opacity = missing ? '0.45' : '';
        addBtn.style.cursor = missing ? 'not-allowed' : 'pointer';
        addBtn.title = missing ? 'Samba is not installed on this NAS' : '';
    }
}

export async function renderSharesPage(body) {
    _sharesBody = body;
    body.innerHTML = `<div style="padding:20px;display:flex;flex-direction:column;height:100%;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-shrink:0;">
            <h2 style="font-size:18px;font-weight:700;color:var(--text-1);margin:0;">📁 Samba Shares</h2>
            <div style="display:flex;gap:8px;align-items:center;">
                <span id="sharesStatus" data-testid="shares-status" style="font-size:12px;padding:4px 10px;border-radius:6px;"></span>
                <button class="btn-ghost" id="sharesRefreshBtn" data-testid="shares-refresh-btn" style="padding:6px 12px;font-size:12px;">🔄 Refresh</button>
                <button class="btn-primary" data-testid="shares-add-btn" onclick="sharesShowAddForm()" style="padding:6px 14px;font-size:12px;border-radius:6px;background:var(--accent);color:white;border:none;cursor:pointer;">+ Add Share</button>
            </div>
        </div>
        <div id="sharesTableWrap" style="flex:1;overflow-y:auto;min-height:0;"><div style="text-align:center;padding:40px;color: var(--text-3);">Loading…</div></div>
        <div id="sharesFormWrap" style="flex-shrink:0;"></div>
    </div>`;

    // Keep the module self-contained: a package window is `pkg-<id>`, so the
    // old `window-shares` selector never matched.
    body.querySelector('#sharesRefreshBtn')?.addEventListener('click', () => {
        if (body.isConnected) renderSharesPage(body);
    });

    await _loadShares();
}

async function _loadShares() {
    const wrap = document.getElementById('sharesTableWrap');
    if (!wrap) return;
    try {
        const [sharesResp, statusResp] = await Promise.all([
            apiFetch('/api/shares'),
            apiFetch('/api/shares/status'),
        ]);
        if (!sharesResp.ok) throw new Error('HTTP ' + sharesResp.status);
        const data = await sharesResp.json();
        const shares = Array.isArray(data.shares) ? data.shares : [];

        // Update status badge
        const statusEl = document.getElementById('sharesStatus');
        if (statusResp.ok) {
            const s = await statusResp.json();
            _applySambaState(s);
            if (statusEl) {
                const installed = s.samba_installed !== false;
                const active = s.active;
                statusEl.textContent = !installed
                    ? '⚠ Samba not installed'
                    : (active ? '● Active' : '○ Inactive');
                statusEl.style.color = !installed ? '#f59e0b' : (active ? '#22c55e' : '#ef4444');
                statusEl.setAttribute('data-testid', 'shares-status');
            }
        } else if (statusEl) {
            statusEl.textContent = '○ Unknown';
            statusEl.style.color = 'var(--text-3)';
        }

        if (shares.length === 0) {
            wrap.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color: var(--text-3);gap:12px;"><div style="font-size:40px;">📁</div><p>No Samba shares configured.</p><p style="font-size:12px;color: var(--text-3);">Click "+ Add Share" to create one.</p></div>';
            return;
        }

        let html = '<table class="app-table" style="width:100%;"><thead><tr>' +
            '<th data-testid="shares-col-name">Name</th>' +
            '<th data-testid="shares-col-path">Path</th>' +
            '<th data-testid="shares-col-status">Access</th>' +
            '<th data-testid="shares-col-actions" style="width:100px;">Actions</th>' +
            '</tr></thead><tbody>';

        for (const s of shares) {
            const access = s.read_only ? 'Read-only' : (s.guest_ok ? 'Guest' : 'User');
            const accessClass = s.read_only ? 'badge-yellow' : (s.guest_ok ? 'badge-blue' : 'badge-green');
            html += `<tr data-testid="shares-row-${escapeAttr(s.name)}">
                <td style="font-weight:600;color:var(--text-1);">${escapeHtml(s.name)}</td>
                <td style="color: var(--text-2);font-family:monospace;font-size:12px;">${escapeHtml(s.path || '—')}</td>
                <td><span class="${accessClass}" style="padding:2px 8px;border-radius:4px;font-size:11px;">${access}</span></td>
                <td>
                    <button class="btn-ghost" data-testid="shares-edit-${escapeAttr(s.name)}" onclick="sharesShowEditForm('${jsAttr(s.name)}')" style="padding:4px 8px;font-size:11px;">✏️</button>
                    <button class="btn-ghost" data-testid="shares-delete-${escapeAttr(s.name)}" onclick="sharesDelete('${jsAttr(s.name)}')" style="padding:4px 8px;font-size:11px;color:#ef4444;">🗑️</button>
                </td>
            </tr>`;
        }
        html += '</tbody></table>';
        wrap.innerHTML = html;
    } catch (e) {
        wrap.innerHTML = `<div style="color:#ef4444;text-align:center;padding:20px;">❌ ${escapeHtml(e.message)}</div>`;
    }
}

window.sharesShowAddForm = function() {
    _showShareForm(null);
};

window.sharesShowEditForm = async function(name) {
    try {
        const resp = await apiFetch('/api/shares');
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        const shares = Array.isArray(data.shares) ? data.shares : [];
        const share = shares.find(s => s.name === name);
        if (!share) { showAlert('Share not found'); return; }
        _showShareForm(share);
    } catch (e) {
        showAlert('Error loading share: ' + e.message);
    }
};

function _showShareForm(existing) {
    const wrap = document.getElementById('sharesFormWrap');
    if (!wrap) return;
    const isEdit = !!existing;
    const n = existing || { name: '', path: '', comment: '', read_only: false, browsable: true, guest_ok: false, valid_users: '' };

    wrap.innerHTML = `<div style="background:var(--surface-1);border:1px solid var(--border);border-radius:12px;padding:16px;margin-top:8px;" data-testid="shares-form">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <span style="font-weight:600;color:var(--text-1);font-size:14px;">${isEdit ? '✏️ Edit Share' : '➕ Add Share'}</span>
            <button class="btn-ghost" onclick="sharesCancelForm()" style="padding:4px 10px;font-size:12px;">✕ Cancel</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div><label style="display:block;font-size:11px;color: var(--text-3);margin-bottom:3px;">Share Name</label>
                <input data-testid="shares-form-name" value="${escapeAttr(n.name)}" ${isEdit ? 'readonly' : ''} style="width:100%;padding:6px 10px;background:var(--surface-0);border:1px solid var(--border);border-radius:6px;color:var(--text-1);font-size:13px;" id="sharesFormName"></div>
            <div><label style="display:block;font-size:11px;color: var(--text-3);margin-bottom:3px;">Path</label>
                <div style="display:flex;gap:6px;">
                    <input data-testid="shares-form-path" value="${escapeAttr(n.path)}" style="flex:1;min-width:0;padding:6px 10px;background:var(--surface-0);border:1px solid var(--border);border-radius:6px;color:var(--text-1);font-size:13px;font-family:monospace;" id="sharesFormPath" placeholder="/path/to/directory">
                    <button class="btn-ghost" data-testid="shares-form-browse-btn" onclick="sharesShowFolderPicker()" title="Browse filesystem" style="padding:6px 10px;font-size:12px;white-space:nowrap;">📂 Browse…</button>
                </div></div>
            <div style="grid-column:span 2;"><label style="display:block;font-size:11px;color: var(--text-3);margin-bottom:3px;">Comment (description)</label>
                <input data-testid="shares-form-comment" value="${escapeAttr(n.comment)}" style="width:100%;padding:6px 10px;background:var(--surface-0);border:1px solid var(--border);border-radius:6px;color:var(--text-1);font-size:13px;" id="sharesFormComment"></div>
            <div><label style="display:flex;align-items:center;gap:8px;font-size:12px;color: var(--text-2);cursor:pointer;">
                <input type="checkbox" data-testid="shares-form-readonly" ${n.read_only ? 'checked' : ''} id="sharesFormReadOnly"> Read-only</label>
                <label style="display:flex;align-items:center;gap:8px;font-size:12px;color: var(--text-2);cursor:pointer;margin-top:6px;">
                <input type="checkbox" data-testid="shares-form-guest" ${n.guest_ok ? 'checked' : ''} id="sharesFormGuest"> Guest access</label></div>
            <div><label style="display:flex;align-items:center;gap:8px;font-size:12px;color: var(--text-2);cursor:pointer;">
                <input type="checkbox" data-testid="shares-form-browsable" ${n.browsable ? 'checked' : ''} id="sharesFormBrowsable"> Browsable</label>
                <label style="display:flex;align-items:center;gap:8px;font-size:12px;color: var(--text-2);cursor:pointer;margin-top:6px;">
                <input placeholder="Valid users (comma-sep)" value="${escapeAttr(n.valid_users)}" style="width:100%;padding:4px 8px;background:var(--surface-0);border:1px solid var(--border);border-radius:4px;color:var(--text-1);font-size:11px;" id="sharesFormValidUsers"></label></div>
        </div>
        <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end;">
            <button class="btn-ghost" onclick="sharesCancelForm()" style="padding:6px 14px;font-size:12px;">Cancel</button>
            <button class="btn-primary" data-testid="shares-form-submit" onclick="sharesSubmitForm('${jsAttr(n.name)}', ${isEdit})" style="padding:6px 14px;font-size:12px;border-radius:6px;background:var(--accent);color:white;border:none;cursor:pointer;">${isEdit ? 'Update' : 'Create'}</button>
        </div>
    </div>`;
}

window.sharesCancelForm = function() {
    const wrap = document.getElementById('sharesFormWrap');
    if (wrap) wrap.innerHTML = '';
};

window.sharesSubmitForm = async function(origName, isEdit) {
    const name = document.getElementById('sharesFormName')?.value?.trim();
    const path = document.getElementById('sharesFormPath')?.value?.trim();
    if (!name || !path) { showAlert('Share name and path are required.'); return; }

    const body = {
        name: name,
        path: path,
        comment: document.getElementById('sharesFormComment')?.value?.trim() || '',
        read_only: document.getElementById('sharesFormReadOnly')?.checked || false,
        browsable: document.getElementById('sharesFormBrowsable')?.checked ?? true,
        guest_ok: document.getElementById('sharesFormGuest')?.checked || false,
        valid_users: document.getElementById('sharesFormValidUsers')?.value?.trim() || '',
    };

    const opts = {
        method: isEdit ? 'PUT' : 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
    };
    try {
        const resp = await apiFetch(isEdit ? '/api/shares/' + encodeURIComponent(origName) : '/api/shares', opts);
        if (!resp.ok) {
            let detail = `HTTP ${resp.status}`;
            try { const d = await resp.json(); detail = d.detail || detail; } catch (_) {}
            throw new Error(detail);
        }
        sharesCancelForm();
        await _loadShares();
    } catch (e) {
        showAlert('Error: ' + e.message);
    }
};

// ════════════════════════════════════════════
// Folder picker — choose a directory for the share path
// Backed by GET /api/files?path= (no allowlist, same as shares design)
// ════════════════════════════════════════════

let _spPath = '/';
let _spDirs = [];

function _spArg(s) { return JSON.stringify(String(s)).replace(/"/g, '&quot;'); }
const _SP_CHIP_STYLE = 'padding:4px 12px;border-radius:999px;background:var(--surface-1);border:1px solid var(--border);color: var(--text-2);font-size:12px;cursor:pointer;white-space:nowrap;';

window.sharesShowFolderPicker = async function() {
    if (!_sharesBody) return;
    const input = document.getElementById('sharesFormPath');
    const current = input ? input.value.trim() : '';
    // Prefer the shared EthOS picker: it cannot leave the roots the backend
    // allows. The in-window browser below stays as a fallback for older cores.
    if (typeof _ctx.pickFolder === 'function') {
        const picked = await _ctx.pickFolder({
            title: 'Choose share folder',
            startPath: current && current.startsWith('/') ? current : '/home',
            roots: ['/home', '/mnt', '/media'],
            acceptLabel: 'Choose folder',
        });
        if (picked && input) input.value = picked;
        return;
    }
    _spDirs = [];
    if (document.getElementById('shares-picker')) document.getElementById('shares-picker').remove();
    _sharesBody.style.position = 'relative';
    const el = document.createElement('div');
    el.id = 'shares-picker';
    el.setAttribute('data-testid', 'shares-picker');
    el.style.cssText = 'position:absolute;inset:0;z-index:30;background:var(--surface-0);display:flex;flex-direction:column;font-family:system-ui,sans-serif;color: var(--text-1);';
    el.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid var(--border);">
            <span style="font-size:15px;font-weight:700;color: var(--text-1);">📂 Choose Share Folder</span>
            <span style="font-size:12px;color: var(--text-3);">Click a folder to open it, then pick the folder you're in</span>
            <button data-testid="shares-picker-close" onclick="_spHidePicker()" style="margin-left:auto;border:none;background:transparent;color: var(--text-2);font-size:20px;cursor:pointer;">×</button>
        </div>
        <div data-testid="shares-picker-chips" style="display:flex;gap:6px;padding:10px 18px;overflow-x:auto;border-bottom:1px solid var(--border);"></div>
        <div data-testid="shares-picker-bc" style="padding:8px 18px;font-size:13px;color: var(--text-2);background:var(--surface-1);display:flex;align-items:center;gap:2px;flex-wrap:wrap;"></div>
        <div id="sharesPickerList" style="flex:1;overflow-y:auto;padding:14px;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;align-content:start;"></div>
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 18px;border-top:1px solid var(--border);background:var(--surface-1);">
            <span data-testid="shares-picker-selected" style="font-size:13px;color: var(--text-2);font-family:monospace;"></span>
            <div style="display:flex;gap:8px;">
                <button data-testid="shares-picker-cancel" onclick="_spHidePicker()" class="btn-ghost" style="padding:8px 18px;font-size:13px;border-radius:8px;">Cancel</button>
                <button data-testid="shares-picker-confirm" onclick="_spConfirm()" style="padding:8px 20px;font-size:13px;border-radius:8px;background:var(--accent);color:white;border:none;cursor:pointer;">Select Folder</button>
            </div>
        </div>`;
    _sharesBody.appendChild(el);
    _spLoadChips();
    _spBrowseTo(current && current.startsWith('/') ? current : '/home', '/home');
};

// NOTE: these handlers are referenced from inline onclick attributes, so they
// must live on window — module-scoped functions are not visible to them.
window._spHidePicker = function() {
    const el = document.getElementById('shares-picker');
    if (el) el.remove();
};

async function _spLoadChips() {
    const el = document.querySelector('[data-testid="shares-picker-chips"]');
    if (!el) return;
    const chips = [{ name: '/', path: '/' }, { name: 'Home', path: '/home' }];
    try {
        const r = await apiFetch('/api/files?path=/');
        if (r.ok) {
            const data = await r.json();
            const skip = new Set(['proc', 'sys', 'dev', 'run', 'boot', 'efi', 'snap', 'lost+found']);
            for (const f of (data.files || [])) {
                if (!f.is_dir || skip.has(f.name) || f.name.startsWith('.')) continue;
                chips.push({ name: f.name, path: '/' + f.name });
            }
        }
    } catch (e) { /* non-fatal */ }
    el.innerHTML = chips.map(c =>
        `<button data-testid="shares-picker-chip" onclick="_spBrowseTo(${_spArg(c.path)})" style="${_SP_CHIP_STYLE}">${escapeHtml(c.name)}</button>`
    ).join('');
}

function _spParentPath(p) {
    const parts = p.split('/').filter(Boolean);
    if (!parts.length) return null;
    parts.pop();
    return '/' + parts.join('/');
}

window._spBrowseTo = function(path, fallback) {
    _spPath = path || '/';
    _spDirs = [];
    _spLoadDirs(fallback);
};

function _spRenderBc() {
    const el = document.querySelector('[data-testid="shares-picker-bc"]');
    if (!el) return;
    const parts = _spPath.split('/').filter(Boolean);
    let html = `<span onclick="_spBrowseTo(${_spArg('/')})" style="cursor:pointer;color: var(--text-2);">/</span>`;
    let acc = '';
    for (const p of parts) {
        acc += '/' + p;
        html += `<span style="color: var(--text-3);">/</span><span onclick="_spBrowseTo(${_spArg(acc)})" style="cursor:pointer;color:${acc === _spPath ? 'var(--text-1)' : 'var(--text-2)'};">${escapeHtml(p)}</span>`;
    }
    el.innerHTML = html;
}

async function _spLoadDirs(fallback) {
    _spRenderBc();
    const list = document.getElementById('sharesPickerList');
    if (!list) return;
    list.innerHTML = '<div style="grid-column:1/-1;color: var(--text-3);font-size:13px;">Loading…</div>';
    let files = [];
    try {
        const r = await apiFetch('/api/files?path=' + encodeURIComponent(_spPath));
        if (!r.ok) throw new Error(await readErrorDetail(r));
        files = ((await r.json()).files || []).filter(f => f.is_dir);
    } catch (e) {
        if (fallback && _spPath !== fallback) { window._spBrowseTo(fallback); return; }
        list.innerHTML = `<div style="grid-column:1/-1;color:#ef4444;font-size:13px;">❌ ${escapeHtml(e.message)}</div>`;
        _spUpdateFooter();
        return;
    }
    _spDirs = files.map(f => ({ name: f.name, path: _spPath === '/' ? '/' + f.name : _spPath + '/' + f.name }));
    let html = '';
    const parent = _spParentPath(_spPath);
    if (_spPath !== '/' && parent) {
        html += `<div data-testid="shares-picker-up" onclick="_spBrowseTo(${_spArg(parent)})" style="cursor:pointer;border-radius:10px;padding:14px 10px;background:var(--surface-1);border:1px solid var(--border);display:flex;flex-direction:column;align-items:center;gap:6px;">
            <span style="font-size:24px;">⬆️</span><span style="font-size:11px;color: var(--text-2);">.. (parent)</span></div>`;
    }
    for (let i = 0; i < _spDirs.length; i++) {
        html += `<div data-testid="shares-picker-dir-${i}" onclick="_spOpen(${i})" ondblclick="_spOpen(${i})"
            style="cursor:pointer;border-radius:10px;padding:14px 10px;background:var(--surface-1);border:1px solid var(--border);display:flex;flex-direction:column;align-items:center;gap:6px;">
            <span style="font-size:26px;">📁</span>
            <span style="font-size:12px;color: var(--text-1);text-align:center;word-break:break-all;line-height:1.3;">${escapeHtml(_spDirs[i].name)}</span></div>`;
    }
    if (!_spDirs.length) html += '<div style="grid-column:1/-1;color: var(--text-3);font-size:13px;text-align:center;padding:16px;">No subfolders</div>';
    list.innerHTML = html;
    _spUpdateFooter();
}

window._spOpen = function(i) {
    const d = _spDirs[i];
    if (d) window._spBrowseTo(d.path);
};

function _spUpdateFooter() {
    const label = document.querySelector('[data-testid="shares-picker-selected"]');
    if (label) label.textContent = 'Current folder: ' + _spPath;
}

window._spConfirm = function() {
    const input = document.getElementById('sharesFormPath');
    if (input) input.value = _spPath;
    window._spHidePicker();
};

window.sharesDelete = async function(name) {
    if (!await showModalConfirm('Delete Share', `Delete Samba share "${name}"?`)) return;
    try {
        const resp = await apiFetch('/api/shares/' + encodeURIComponent(name), { method: 'DELETE' });
        if (!resp.ok) {
            throw new Error(await readErrorDetail(resp, 'Delete failed'));
        }
        await _loadShares();
    } catch (e) {
        showAlert('Error deleting share: ' + e.message);
    }
};

// ── Package entry point ───────────────────────────────────────────────────────
export async function render(container, ctx) {
    _ctx = ctx;
    ctx.log('info', 'Samba Shares opened');
    await renderSharesPage(container);
}
