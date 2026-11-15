// EthOS NAS — Disk Cleaner (space analyzer + cleanup suggestions)
// ── Native-module shim ────────────────────────────────────────────────────────
let _ctx = null;
const escapeHtml = (value) => _ctx.escape.html(value);
const escapeAttr = (value) => _ctx.escape.attr(value);

function formatBytes(bytes) {
    if (!bytes && bytes !== 0) return '—';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (bytes >= k && i < sizes.length - 1) { bytes /= k; i++; }
    return parseFloat(bytes.toFixed(1)) + ' ' + sizes[i];
}

function apiFetch(path, options) { return _ctx.apiFetch(path, options); }

// Shared surfaces: one Notification Center, one modal system, one progress panel.
function _toast(message, kind = 'info') {
    try { _ctx.notifications.toast(String(message), kind); } catch (_) { /* window closing */ }
}

function _task(title, detail, testIdPrefix) {
    return _ctx.progress?.startTask
        ? _ctx.progress.startTask({ appId: 'pkg-ethos-cleaner', title, detail, testIdPrefix })
        : null;
}

async function readErrorDetail(res, fallback = '') {
    let payload = null;
    try { payload = await res.clone().json(); } catch (_) { /* non-JSON body */ }
    const detail = payload?.detail ?? payload?.error ?? '';
    const text = typeof detail === 'string' ? detail : JSON.stringify(detail);
    return text || fallback || `HTTP ${res.status}`;
}

// Skeleton rows (core/states.js subset) so loading states match the shell.
function skeletonRows(count = 5, { variant = 'rows', ariaLabel = 'Loading' } = {}) {
    const n = Math.max(1, Math.min(50, Number(count) || 5));
    const bar = (w, h = 12) => `<div class="ethos-skel" style="height:${h}px;width:${w};border-radius:6px;`
        + 'background:linear-gradient(90deg,var(--surface-2) 25%,var(--surface-1) 50%,var(--surface-2) 75%);'
        + 'background-size:200% 100%;animation:ethos-skel-shimmer 1.4s ease-in-out infinite;"></div>';
    if (variant === 'tiles') {
        const tile = `<div style="display:flex;flex-direction:column;gap:8px;">${bar('100%', 96)}${bar('70%')}</div>`;
        return `<div class="ethos-skeleton" role="status" aria-label="${escapeAttr(ariaLabel)}"
            aria-busy="true" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px;padding:4px;">
            ${tile.repeat(n)}</div>`;
    }
    return `<div class="ethos-skeleton" role="status" aria-label="${escapeAttr(ariaLabel)}" aria-busy="true"
        style="display:flex;flex-direction:column;gap:10px;padding:4px;">${bar('100%').repeat(n)}</div>`;
}

let _tab = 'analyzer';          // analyzer | cleanup
let _view = 'folders';          // folders | files  (analyzer sub-view)
let _scanPath = '/home';
let _depth = 2;
let _busy = false;
let _sugData = null;            // last /suggestions payload
const _selectedPaths = new Set();

const CAT_META = {
    trash:     { icon: '🗑️', label: 'Trash' },
    temp:      { icon: '❄️', label: 'Temp files' },
    cache:     { icon: '💾', label: 'Caches' },
    logs:      { icon: '📜', label: 'Logs' },
    var_cache: { icon: '📦', label: 'Package caches' },
};

export async function renderCleanerPage(body) {
    body.innerHTML = `
        <div style="display:flex;flex-direction:column;height:100%;background:var(--surface-0);color: var(--text-1);font-family:system-ui,sans-serif;">
            <div style="display:flex;border-bottom:1px solid var(--border);flex-shrink:0;background:var(--surface-0);" data-testid="cleaner-tabs">
                <button class="cleaner-tab active" data-tab="analyzer" data-testid="cleaner-tab-analyzer" style="padding:12px 18px;background:none;border:none;color:var(--text-1);font-size:13px;font-weight:600;cursor:pointer;border-bottom:2px solid var(--accent);">📊 Analyzer</button>
                <button class="cleaner-tab" data-tab="cleanup" data-testid="cleaner-tab-cleanup" style="padding:12px 18px;background:none;border:none;color: var(--text-2);font-size:13px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;">🧹 Cleanup</button>
                <div id="cleanerFsBar" style="margin-left:auto;display:flex;gap:8px;align-items:center;padding-right:14px;"></div>
            </div>
            <div id="cleanerContent" style="flex:1;overflow-y:auto;padding:16px 20px;">
                ${skeletonRows(7)}
            </div>
        </div>`;

    body.querySelectorAll('.cleaner-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            body.querySelectorAll('.cleaner-tab').forEach(t => {
                t.style.color = 'var(--text-2)';
                t.style.borderBottomColor = 'transparent';
            });
            tab.style.color = 'var(--text-1)';
            tab.style.borderBottomColor = 'var(--accent)';
            _tab = tab.dataset.tab;
            renderTab();
        });
    });

    await loadFsBar(body);
    renderTab();
}

// ── Free-space bar (top mounted partitions) ─────────────────────────────────

async function loadFsBar(body) {
    const el = body.querySelector('#cleanerFsBar');
    if (!el) return;
    try {
        const resp = await apiFetch('/api/storage/partitions');
        if (!resp.ok) return;
        const data = await resp.json();
        const parts = (data.partitions || []).filter(p => p.mountpoint && !/^(tmpfs|devtmpfs|squashfs)$/.test(p.fstype));
        el.innerHTML = parts.slice(0, 4).map(p => {
            const pct = p.percent || 0;
            const color = pct > 85 ? '#ef4444' : pct > 60 ? '#eab308' : '#22c55e';
            return `<span style="display:flex;align-items:center;gap:6px;font-size:11px;color: var(--text-2);">
                <span style="font-family:monospace;">${escapeHtml(p.mountpoint)}</span>
                <span style="width:54px;height:5px;border-radius:3px;background:var(--surface-2);overflow:hidden;display:inline-block;">
                    <span style="display:block;height:100%;width:${Math.min(100, pct)}%;background:${color};"></span>
                </span>
                <span>${pct}%</span>
            </span>`;
        }).join('');
    } catch (_) { /* non-fatal */ }
}

function renderTab() {
    const content = document.getElementById('cleanerContent');
    if (!content) return;
    if (_tab === 'analyzer') renderAnalyzer(content);
    else renderCleanup();
}

// ── Analyzer tab ────────────────────────────────────────────────────────────

function renderAnalyzer(content) {
    content.innerHTML = `
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap;">
            <input id="cleanerPath" data-testid="cleaner-path-input" aria-label="Folder to scan" value="${escapeAttr(_scanPath)}"
                style="flex:1;min-width:200px;padding:7px 10px;border-radius:8px;border:1px solid var(--border);background:var(--surface-2);color:var(--text-1);font-size:13px;font-family:monospace;" />
            <button id="cleanerBrowseBtn" data-testid="cleaner-browse-btn" class="btn-ghost" title="Browse folders"
                style="padding:7px 12px;font-size:12px;white-space:nowrap;">📂 Browse…</button>
            <select aria-label="Scan depth" id="cleanerDepth" data-testid="cleaner-depth-select" style="padding:7px 8px;border-radius:8px;border:1px solid var(--border);background:var(--surface-2);color:var(--text-1);font-size:13px;">
                ${[1, 2, 3, 4].map(d => `<option value="${d}" ${d === _depth ? 'selected' : ''}>Depth ${d}</option>`).join('')}
            </select>
            <button id="cleanerScanBtn" class="btn-primary" data-testid="cleaner-scan-btn">🔍 Scan</button>
            <div style="display:flex;border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-left:auto;">
                <button id="cleanerViewFolders" data-view="folders" style="padding:7px 12px;font-size:12px;background:${_view === 'folders' ? 'var(--accent)' : 'transparent'};color:${_view === 'folders' ? 'white' : 'var(--text-2)'};border:none;cursor:pointer;">📁 Folders</button>
                <button id="cleanerViewFiles" data-view="files" style="padding:7px 12px;font-size:12px;background:${_view === 'files' ? 'var(--accent)' : 'transparent'};color:${_view === 'files' ? 'white' : 'var(--text-2)'};border:none;cursor:pointer;">📄 Biggest files</button>
            </div>
        </div>
        <div id="cleanerResults" style="display:flex;flex-direction:column;gap:8px;"></div>`;

    document.getElementById('cleanerScanBtn').onclick = () => doScan();
    document.getElementById('cleanerBrowseBtn').onclick = async () => {
        const picked = await _ctx.pickFolder({
            title: 'Choose a folder to analyze',
            startPath: _scanPath || '/home',
            roots: ['/home', '/mnt', '/media'],
            acceptLabel: 'Scan this folder',
        });
        if (picked) {
            _scanPath = picked;
            const input = document.getElementById('cleanerPath');
            if (input) input.value = picked;
        }
    };
    document.getElementById('cleanerPath').addEventListener('keydown', e => { if (e.key === 'Enter') doScan(); });
    for (const id of ['cleanerViewFolders', 'cleanerViewFiles']) {
        const btn = document.getElementById(id);
        btn.onclick = () => { _view = btn.dataset.view; renderAnalyzer(document.getElementById('cleanerContent')); };
    }

    if (_view === 'folders') loadFolderTree(); else loadTopFiles();
}

async function doScan() {
    const p = (document.getElementById('cleanerPath')?.value || '').trim();
    const d = parseInt(document.getElementById('cleanerDepth')?.value || '2', 10);
    if (!p) return;
    _scanPath = p; _depth = isNaN(d) ? 2 : d;
    await (_view === 'folders' ? loadFolderTree() : loadTopFiles());
}

function _loading(msg) {
    return `<div style="color: var(--text-3);text-align:center;padding:40px;">${escapeHtml(msg)}…</div>`;
}

async function loadFolderTree() {
    const box = document.getElementById('cleanerResults');
    if (!box) return;
    box.innerHTML = _loading(`Scanning ${_scanPath}`);
    const task = _task(`Analyzing ${_scanPath}`, 'Walking the folder tree…', 'cleaner-scan');
    try {
        const resp = await apiFetch(`/api/disk-clean/scan?path=${encodeURIComponent(_scanPath)}&depth=${_depth}`);
        if (!resp.ok) throw new Error(await readErrorDetail(resp));
        const data = await resp.json();
        renderTree(box, data);
        task?.finish('done', { percent: 100, detail: formatBytes(data.total_size || 0) });
    } catch (e) {
        box.innerHTML = `<div style="color:#ef4444;text-align:center;padding:20px;">❌ ${escapeHtml(e.message)}</div>`;
        task?.finish('failed', { detail: e.message });
    }
}

function _sizeBar(size, total) {
    const pct = total > 0 ? Math.max(0.5, (size / total) * 100) : 0;
    return `<span style="width:120px;height:6px;border-radius:3px;background:var(--surface-2);overflow:hidden;display:inline-block;">
        <span style="display:block;height:100%;width:${Math.min(100, pct)}%;background:linear-gradient(90deg,#3b82f6,#22c55e);"></span></span>`;
}

function renderTree(box, data) {
    const total = data.total_size || 0;
    let html = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">
            <h3 style="margin:0;font-size:15px;color:var(--text-1);font-weight:700;">📁 ${escapeHtml(data.path)}</h3>
            <span style="font-size:12px;color: var(--text-3);">${formatBytes(total)}${data.truncated ? ' · partial (entry cap reached)' : ''}</span>
        </div>`;

    const root = data.tree || {};
    html += `<table class="app-table" style="width:100%;"><thead><tr>
        <th>Name</th><th style="text-align:right;">Size</th><th style="width:140px;"></th><th style="width:70px;text-align:right;">Actions</th>
    </tr></thead><tbody>`;

    const children = root.children || [];
    if (children.length === 0) {
        html += `<tr><td colspan="4" style="color: var(--text-3);text-align:center;padding:20px;">Empty or no permission.</td></tr>`;
    }
    for (const c of children) {
        const icon = c.is_dir ? '📁' : '📄';
        html += `<tr data-testid="cleaner-row-${escapeAttr(c.path)}">
            <td>
                ${c.is_dir
                    ? `<a href="#" class="cleaner-drill" data-path="${escapeAttr(c.path)}" style="color:var(--text-1);font-weight:600;text-decoration:none;">${icon} ${escapeHtml(c.name)}</a>`
                    : `<span style="color: var(--text-2);">${icon} ${escapeHtml(c.name)}</span>`}
                <div style="font-size:10px;color: var(--text-3);font-family:monospace;margin-top:1px;">${escapeHtml(c.path)}</div>
            </td>
            <td style="text-align:right;font-family:monospace;color:var(--text-1);font-weight:600;white-space:nowrap;">${formatBytes(c.size)}</td>
            <td>${_sizeBar(c.size, total)}</td>
            <td style="text-align:right;"><button class="cleaner-del btn-ghost" data-path="${escapeAttr(c.path)}" data-size="${c.size}" data-name="${escapeAttr(c.name)}" title="Delete ${escapeAttr(c.name)}">🗑️</button></td>
        </tr>`;
    }
    html += '</tbody></table>';
    box.innerHTML = html;

    box.querySelectorAll('.cleaner-drill').forEach(a => {
        a.onclick = (e) => { e.preventDefault(); _scanPath = a.dataset.path; loadFolderTree(); };
    });
    box.querySelectorAll('.cleaner-del').forEach(btn => {
        btn.onclick = () => confirmDelete([btn.dataset.path], `${btn.dataset.name}`, 'folders', parseInt(btn.dataset.size || '0', 10));
    });
}

async function loadTopFiles() {
    const box = document.getElementById('cleanerResults');
    if (!box) return;
    box.innerHTML = _loading(`Finding biggest files in ${_scanPath}`);
    const task = _task(`Finding biggest files in ${_scanPath}`, 'Scanning…', 'cleaner-scan');
    try {
        const resp = await apiFetch(`/api/disk-clean/top-files?path=${encodeURIComponent(_scanPath)}&limit=25`);
        if (!resp.ok) throw new Error(await readErrorDetail(resp));
        const data = await resp.json();
        let html = `<h3 style="margin:0 0 8px;font-size:15px;color:var(--text-1);font-weight:700;">📄 Biggest files in ${escapeHtml(data.path)}</h3>
            <table class="app-table" style="width:100%;"><thead><tr>
                <th>#</th><th>Name</th><th>Path</th><th style="text-align:right;">Size</th><th style="width:70px;text-align:right;"></th>
            </tr></thead><tbody>`;
        if (!data.files.length) {
            html += `<tr><td colspan="5" style="color: var(--text-3);text-align:center;padding:20px;">No files found.</td></tr>`;
        }
        data.files.forEach((f, i) => {
            const dir = f.path.substring(0, f.path.length - f.name.length);
            html += `<tr>
                <td style="color: var(--text-3);">${i + 1}</td>
                <td style="color:var(--text-1);font-weight:600;">${escapeHtml(f.name)}</td>
                <td style="font-family:monospace;font-size:11px;color: var(--text-2);">${escapeHtml(dir)}</td>
                <td style="text-align:right;font-family:monospace;color:var(--text-1);font-weight:600;white-space:nowrap;">${formatBytes(f.size)}</td>
                <td style="text-align:right;"><button class="cleaner-del-file btn-ghost" data-path="${escapeAttr(f.path)}" data-size="${f.size}" data-name="${escapeAttr(f.name)}">🗑️</button></td>
            </tr>`;
        });
        html += '</tbody></table>';
        box.innerHTML = html;
        box.querySelectorAll('.cleaner-del-file').forEach(btn => {
            btn.onclick = () => confirmDelete([btn.dataset.path], `${btn.dataset.name}`, 'files', parseInt(btn.dataset.size || '0', 10));
        });
        task?.finish('done', { percent: 100, detail: `${data.files.length} file(s)` });
    } catch (e) {
        box.innerHTML = `<div style="color:#ef4444;text-align:center;padding:20px;">❌ ${escapeHtml(e.message)}</div>`;
        task?.finish('failed', { detail: e.message });
    }
}

// ── Cleanup tab ─────────────────────────────────────────────────────────────

async function renderCleanup() {
    const content = document.getElementById('cleanerContent');
    if (!content) return;
    content.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <h3 style="margin:0;font-size:15px;color:var(--text-1);font-weight:700;">🧹 Cleanup candidates</h3>
            <span id="cleanerSugTotal" style="font-size:12px;color: var(--text-3);"></span>
            <button id="cleanerRefreshSug" class="btn-ghost" data-testid="cleaner-refresh-suggestions" style="margin-left:auto;">↻ Refresh</button>
        </div>
        <div id="cleanerSugList" style="display:flex;flex-direction:column;gap:12px;">${_loading('Scanning for cleanup candidates')}</div>`;

    document.getElementById('cleanerRefreshSug').onclick = () => { _sugData = null; renderCleanup(); };
    if (!_sugData) await fetchSuggestions();
}

async function fetchSuggestions() {
    const list = document.getElementById('cleanerSugList');
    try {
        const resp = await apiFetch('/api/disk-clean/suggestions');
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        _sugData = await resp.json();
        renderSuggestions(list);
    } catch (e) {
        if (list) list.innerHTML = `<div style="color:#ef4444;text-align:center;padding:20px;">❌ ${escapeHtml(e.message)}</div>`;
    }
}

function _safetyBadge(s) {
    return s === 'safe'
        ? '<span class="badge-green" style="padding:1px 8px;border-radius:4px;font-size:10px;font-weight:700;">SAFE</span>'
        : '<span class="badge-yellow" style="padding:1px 8px;border-radius:4px;font-size:10px;font-weight:700;">CAUTION</span>';
}

function renderSuggestions(list) {
    const d = _sugData;
    if (!d) return;
    let html = '';

    // Journal card (has its own vacuum action, not deletable via /delete)
    if (d.journal && d.journal.available) {
        html += `<div class="glass-card" style="padding:14px 16px;display:flex;align-items:center;gap:12px;" data-testid="cleaner-journal-card">
            <span style="font-size:20px;">📜</span>
            <div style="flex:1;">
                <div style="color:var(--text-1);font-weight:700;font-size:13px;">Systemd journal — ${escapeHtml(d.journal.human)}</div>
                <div style="font-size:11px;color: var(--text-3);">Kernel + service logs kept by journald</div>
            </div>
            <button class="cleaner-vacuum btn-ghost" data-days="7">Vacuum &gt; 7d</button>
            <button class="cleaner-vacuum btn-ghost" data-days="30">Vacuum &gt; 30d</button>
        </div>`;
    }

    let totalSafe = 0, itemCount = 0;
    for (const [cat, items] of Object.entries(d.categories || {})) {
        if (!items.length) continue;
        const meta = CAT_META[cat] || { icon: '📁', label: cat };
        const catTotal = items.reduce((s, i) => s + i.size, 0);
        for (const i of items) { if (i.safety === 'safe') totalSafe += i.size; itemCount++; }

        html += `<div class="glass-card" style="padding:14px 16px;" data-testid="cleaner-cat-${cat}">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                <span style="font-size:16px;">${meta.icon}</span>
                <span style="color:var(--text-1);font-weight:700;font-size:13px;">${escapeHtml(meta.label)}</span>
                <span style="font-size:11px;color: var(--text-3);">${items.length} item(s) · ${formatBytes(catTotal)}</span>
            </div>
            <table class="app-table" style="width:100%;"><tbody>`;
        for (const i of items) {
            const checked = _selectedPaths.has(i.path) ? 'checked' : '';
            html += `<tr data-testid="cleaner-sug-${escapeAttr(i.path)}">
                <td style="width:24px;"><input type="checkbox" class="cleaner-sel" data-path="${escapeAttr(i.path)}" ${checked} style="cursor:pointer;"></td>
                <td>
                    <span style="color:var(--text-1);font-weight:600;">${escapeHtml(i.name)}</span>
                    <div style="font-size:10px;color: var(--text-3);font-family:monospace;margin-top:1px;" title="${escapeAttr(i.description)}">${escapeHtml(i.path)}</div>
                </td>
                <td style="width:auto;white-space:nowrap;">${_safetyBadge(i.safety)}</td>
                <td style="text-align:right;font-family:monospace;color:var(--text-1);font-weight:600;white-space:nowrap;width:90px;">${formatBytes(i.size)}</td>
                <td style="width:52px;text-align:right;"><button class="cleaner-sug-del btn-ghost" data-path="${escapeAttr(i.path)}">🗑️</button></td>
            </tr>`;
        }
        html += '</tbody></table></div>';
    }

    if (!html) {
        html = '<div class="glass-card" style="text-align:center;padding:24px;color: var(--text-3);">✨ Nothing to clean up — no candidates above 1 MB found.</div>';
    }

    // Bulk action bar
    html += `<div id="cleanerBulkBar" style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:10px;background:var(--surface-2);border:1px solid var(--border);">
        <label style="font-size:12px;color: var(--text-2);display:flex;align-items:center;gap:6px;cursor:pointer;">
            <input type="checkbox" id="cleanerSelAll" style="cursor:pointer;"> Select all safe items</label>
        <span id="cleanerBulkInfo" style="font-size:12px;color: var(--text-3);">${_selectedPaths.size} selected · ${formatBytes([..._selectedPaths].reduce((s, p) => s + (_sugSize(p) || 0), 0))}</span>
        <button id="cleanerBulkDel" class="btn-primary" data-testid="cleaner-bulk-delete" style="margin-left:auto;background:#ef4444;">🗑️ Delete selected</button>
    </div>`;

    list.innerHTML = html;

    const totalEl = document.getElementById('cleanerSugTotal');
    if (totalEl) totalEl.textContent = `${itemCount} candidate(s) · up to ${formatBytes(totalSafe)} safely reclaimable`;

    // Wire events
    list.querySelectorAll('.cleaner-vacuum').forEach(btn => {
        btn.onclick = () => vacuumJournal(parseInt(btn.dataset.days, 10));
    });
    list.querySelectorAll('.cleaner-sug-del').forEach(btn => {
        btn.onclick = () => confirmDelete([btn.dataset.path], btn.dataset.path, 'cleanup');
    });
    const selAll = document.getElementById('cleanerSelAll');
    if (selAll) selAll.onchange = () => {
        const safePaths = [];
        for (const [cat, items] of Object.entries(d.categories || {}))
            for (const i of items) if (i.safety === 'safe') safePaths.push(i.path);
        if (selAll.checked) safePaths.forEach(p => _selectedPaths.add(p));
        else safePaths.forEach(p => _selectedPaths.delete(p));
        syncSelectionUi(list, d);
    };
    list.querySelectorAll('.cleaner-sel').forEach(cb => {
        cb.onchange = () => {
            if (cb.checked) _selectedPaths.add(cb.dataset.path);
            else _selectedPaths.delete(cb.dataset.path);
            syncSelectionUi(list, d);
        };
    });
    const bulkBtn = document.getElementById('cleanerBulkDel');
    if (bulkBtn) bulkBtn.onclick = () => {
        const paths = [..._selectedPaths];
        if (!paths.length) { _toast('Nothing selected', 'warning'); return; }
        confirmDelete(paths, `${paths.length} item(s)`, 'cleanup');
    };
}

function _sugSize(path) {
    for (const items of Object.values(_sugData?.categories || {}))
        for (const i of items) if (i.path === path) return i.size;
    return 0;
}

function syncSelectionUi(list, d) {
    list.querySelectorAll('.cleaner-sel').forEach(cb => { cb.checked = _selectedPaths.has(cb.dataset.path); });
    const info = document.getElementById('cleanerBulkInfo');
    if (info) {
        const total = [..._selectedPaths].reduce((s, p) => s + (_sugSize(p) || 0), 0);
        info.textContent = `${_selectedPaths.size} selected · ${formatBytes(total)}`;
    }
    const selAll = document.getElementById('cleanerSelAll');
    if (selAll && d) {
        let safeCount = 0, safeSel = 0;
        for (const items of Object.values(d.categories || {}))
            for (const i of items) if (i.safety === 'safe') { safeCount++; if (_selectedPaths.has(i.path)) safeSel++; }
        selAll.checked = safeCount > 0 && safeSel === safeCount;
    }
}

async function vacuumJournal(days) {
    const ok = await new Promise(resolve => {
        _ctx.modal.confirm({
            title: 'Vacuum journal',
            message: `Remove systemd journal entries older than ${days} days?`,
            confirmLabel: 'Vacuum', cancelLabel: 'Cancel',
            onConfirm: () => resolve(true), onCancel: () => resolve(false),
        });
    });
    if (!ok) return;
    const task = _task(`Vacuuming journal (> ${days}d)`, 'Running journalctl…', 'cleaner-vacuum');
    try {
        const resp = await apiFetch('/api/disk-clean/vacuum-journal', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ days }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data.detail || 'HTTP ' + resp.status);
        _toast(`Journal vacuumed (> ${days}d)`, 'success');
        task?.finish('done', { percent: 100 });
        _sugData = null; renderCleanup();
    } catch (e) {
        _toast('Vacuum failed: ' + e.message, 'error');
        task?.finish('failed', { detail: e.message });
    }
}

// ── Shared delete flow ──────────────────────────────────────────────────────

function confirmDelete(paths, label, context, knownTotal = null) {
    const total = knownTotal ?? paths.reduce((s, p) => s + (_sugSize(p) || 0), 0);
    const what = paths.length > 1 ? `${paths.length} items` : label;
    _ctx.modal.confirm({
        title: 'Permanently delete',
        message: `Delete ${what}${total ? ` (~${formatBytes(total)})` : ''}? This cannot be undone.`,
        confirmLabel: 'Delete', cancelLabel: 'Cancel', danger: true,
        onConfirm: async () => { await doDelete(paths, context); },
    });
}

async function doDelete(paths, context) {
    if (_busy) return;
    _busy = true;
    const what = paths.length > 1 ? `${paths.length} items` : (paths[0] || 'item').split('/').pop();
    const task = _task(`Deleting ${what}`, 'Removing files…', 'cleaner-delete');
    try {
        const resp = await apiFetch('/api/disk-clean/delete', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paths }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data.detail || 'HTTP ' + resp.status);

        const freed = data.freed_bytes || 0;
        _toast(`Freed ${formatBytes(freed)}${data.errors?.length ? ` · ${data.errors.length} error(s)` : ''}`, data.errors?.length ? 'warning' : 'success');
        task?.finish(data.errors?.length ? 'failed' : 'done', { percent: 100, detail: `Freed ${formatBytes(freed)}` });

        paths.forEach(p => _selectedPaths.delete(p));
        if (context === 'cleanup') { _sugData = null; renderCleanup(); }
        else if (_view === 'files') loadTopFiles();   // analyzer: refresh current sub-view
        else loadFolderTree();
    } catch (e) {
        _toast('Delete failed: ' + e.message, 'error');
        task?.finish('failed', { detail: e.message });
    } finally {
        _busy = false;
    }
}

// ── Package entry point ───────────────────────────────────────────────────────
export async function render(container, ctx) {
    _ctx = ctx;
    ctx.log('info', 'Disk Cleaner opened');
    await renderCleanerPage(container);
}
