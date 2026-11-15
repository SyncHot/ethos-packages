// EthOS NAS — Git Diff app (IntelliJ-style side-by-side diff, selectable changes)
//
// Three panes: changed-file list (Staged / Changes) | OLD | NEW.
//   • Changes group compares index (old) vs worktree (new)
//   • Staged  group compares HEAD (old) vs index (new)
// Click any changed line to select its whole hunk (blue), then:
//   • Changes → "Stage selected"  (partial staging, like git add -p)
//   • Staged  → "Unstage selected" (reject the selected hunks)
// Backend: /api/editor/git/* (diff-view, stage-hunks, unstage-hunks).
// See docs/git-diff-tool.md.

// ── Native-module shim ────────────────────────────────────────────────────────
let _ctx = null;

function apiFetch(path, options) { return _ctx.apiFetch(path, options); }

function addNotification(message, kind = 'info') {
    try { _ctx.notifications.toast(String(message), kind); } catch (_) { /* window closing */ }
}

async function postJson(path, body, options = {}) {
    const res = await apiFetch(path, {
        ...options, method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        let detail = '';
        try {
            const payload = await res.clone().json();
            detail = payload?.detail || payload?.error || '';
        } catch (_) { /* non-JSON error body */ }
        throw new Error(detail || `HTTP ${res.status}`);
    }
    if (res.status === 204) return null;
    return res.json();
}

const API = '/api/editor/git';
const REPO_STORAGE_KEY = 'ethos-git-diff-repo';

const state = {
    repo: '',
    branch: null,
    status: null,          // last /git/status payload
    file: null,            // { path, side } currently shown
    data: null,            // last /git/diff-view payload
    rows: [],              // parsed side-by-side rows
    hunkCount: 0,
    selected: new Set(),   // selected hunk indices
    busy: false,
};

let els = {};              // cached DOM refs
let rowEls = { old: [], new: [] };  // per-row elements for class updates
let liveApi = null;        // set once the app is rendered (window already open)
let pendingOpen = null;    // consumed by renderGitDiffPage on fresh boot

// ── Styles ──────────────────────────────────────────────────────────────────

let _stylesInjected = false;

function injectStyles() {
    if (_stylesInjected) return;
    _stylesInjected = true;
    const style = document.createElement('style');
    style.id = 'git-diff-styles';
    style.textContent = `
        #gdApp { display: flex; flex-direction: column; height: 100%; background: var(--bg-primary);
                 font-family: system-ui, sans-serif; color: var(--text-1); }
        .gd-toolbar { display: flex; align-items: center; gap: 8px; padding: 10px 12px;
                      border-bottom: 1px solid var(--border); flex-wrap: wrap; }
        .gd-title { font-size: 15px; font-weight: 700; display: flex; align-items: center; gap: 7px; }
        .gd-repo-input { flex: 1; min-width: 220px; max-width: 460px; padding: 6px 10px; font-size: 12px;
                         font-family: ui-monospace, monospace; border-radius: 8px; border: 1px solid var(--border);
                         background: var(--surface-2); color: var(--text-1); }
        .gd-btn { padding: 6px 12px; font-size: 12px; border-radius: 8px; border: 1px solid var(--border);
                 background: var(--surface-2); color: var(--text-1); cursor: pointer; white-space: nowrap; }
        .gd-btn:hover:not(:disabled) { filter: brightness(1.15); }
        .gd-btn:disabled { opacity: .45; cursor: default; }
        .gd-btn-primary { background: #2563eb; border-color: #2563eb; color: #fff; }
        .gd-branch { font-size: 11px; color: var(--text-3); font-family: ui-monospace, monospace; }
        .gd-main { display: flex; flex: 1; min-height: 0; }
        .gd-files { width: 264px; min-width: 200px; border-right: 1px solid var(--border);
                    overflow-y: auto; background: var(--surface-1); }
        .gd-group { padding: 8px 10px 4px; font-size: 10px; font-weight: 700; letter-spacing: .8px;
                    text-transform: uppercase; color: var(--text-3); display: flex; gap: 6px; align-items: center; }
        .gd-file { display: flex; align-items: center; gap: 7px; padding: 4px 10px; font-size: 12px;
                   cursor: pointer; font-family: ui-monospace, monospace; }
        .gd-file:hover { background: rgba(127,127,127,.12); }
        .gd-file.active { background: rgba(88,101,242,.22); }
        .gd-file .gd-letter { width: 14px; text-align: center; font-weight: 700; font-size: 11px; }
        .gd-file .gd-letter.M { color: #eab308; } .gd-file .gd-letter.A { color: #22c55e; }
        .gd-file .gd-letter.D { color: #ef4444; } .gd-file .gd-letter.U { color: #38bdf8; }
        .gd-file .gd-letter.R { color: #a78bfa; }
        .gd-file .gd-dir { color: var(--text-3); }
        .gd-file .gd-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .gd-empty { padding: 18px 12px; font-size: 12px; color: var(--text-3); text-align: center; }
        .gd-pane { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .gd-pane + .gd-pane { border-left: 1px solid var(--border); }
        .gd-pane-head { padding: 6px 12px; font-size: 11px; font-weight: 700; letter-spacing: .5px;
                        border-bottom: 1px solid var(--border); color: var(--text-2);
                        display: flex; justify-content: space-between; align-items: center; background: var(--surface-1); }
        .gd-pane-head .gd-hint { font-weight: 400; font-size: 10px; color: var(--text-3); }
        .gd-scroll { flex: 1; overflow: auto; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
                     font-size: 12px; line-height: 18px; }
        .gd-line { display: flex; min-height: 18px; }
        .gd-ln { width: 46px; min-width: 46px; text-align: right; padding-right: 8px; color: var(--text-3);
                 user-select: none; border-right: 1px solid var(--border); opacity: .7; }
        .gd-tx { white-space: pre; padding-left: 8px; flex: 1; }
        .gd-line.gd-del .gd-tx, .gd-line.gd-both .gd-tx { background: rgba(239, 68, 68, .16); }
        .gd-line.gd-add .gd-tx, .gd-line.gd-both .gd-tx { background: rgba(34, 197, 94, .14); }
        .gd-line.gd-gap .gd-tx { background: rgba(127,127,127,.06); }
        .gd-line.gd-sel .gd-tx { background: rgba(88, 101, 242, .32); }
        .gd-line.gd-sel .gd-ln { background: rgba(88, 101, 242, .18); opacity: 1; }
        .gd-line.gd-hunk-start { border-top: 1px dashed rgba(127,127,127,.35); }
        .gd-line[data-hunk] { cursor: pointer; }
        .gd-statusbar { display: flex; align-items: center; gap: 8px; padding: 7px 12px;
                        border-top: 1px solid var(--border); background: var(--surface-1); flex-wrap: wrap; }
        .gd-statusbar .gd-path { font-size: 11px; font-family: ui-monospace, monospace; color: var(--text-2);
                                 overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 34%; }
        .gd-statusbar .gd-info { font-size: 11px; color: var(--text-3); white-space: nowrap; }
        .gd-statusbar .gd-spacer { flex: 1; }
    `;
    document.head.appendChild(style);
}

// ── DOM helpers ─────────────────────────────────────────────────────────────

function _el(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
}

// ── Unified diff → side-by-side rows ───────────────────────────────────────
// row = { old: {n,t}|null, new: {n,t}|null, hunk: number|null, kind: 'ctx'|'del'|'add'|'both' }
// Deletion/addition runs inside a hunk are aligned side by side (IntelliJ style).

function _splitLines(text) {
    if (!text) return [];
    const lines = text.split('\n');
    if (lines[lines.length - 1] === '') lines.pop();   // trailing newline
    return lines;
}

function _parseUnified(data) {
    const rows = [];
    if (data.untracked) {
        // No HEAD/index version: the whole file is one added "hunk".
        const newLines = _splitLines(data.new);
        for (let i = 0; i < newLines.length; i++) {
            rows.push({ old: null, new: { n: i + 1, t: newLines[i] }, hunk: 0, kind: 'add' });
        }
        return { rows, hunkCount: rows.length ? 1 : 0 };
    }
    if (!data.unified) return { rows, hunkCount: 0 };

    let hunk = -1, inHunk = false, oldN = 0, newN = 0;
    let dels = [], adds = [];
    const flush = () => {
        const n = Math.max(dels.length, adds.length);
        for (let k = 0; k < n; k++) {
            const o = dels[k] ? { n: dels[k].n, t: dels[k].t } : null;
            const nw = adds[k] ? { n: adds[k].n, t: adds[k].t } : null;
            let kind;
            if (o && nw) kind = 'both';
            else if (o) kind = 'del';
            else kind = 'add';
            rows.push({ old: o, new: nw, hunk, kind });
        }
        dels = []; adds = [];
    };
    for (const line of data.unified.split('\n')) {
        if (line.startsWith('@@')) {
            flush();
            hunk++; inHunk = true;
            const m = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
            if (m) { oldN = +m[1]; newN = +m[2]; }
        } else if (!inHunk) {
            // file header lines (diff --git / index / --- / +++ / mode) — skip
        } else if (line.startsWith('-')) {
            dels.push({ n: oldN++, t: line.slice(1) });
        } else if (line.startsWith('+')) {
            adds.push({ n: newN++, t: line.slice(1) });
        } else if (line.startsWith('\\') || line === '') {
            // "\ No newline at end of file" / trailing empty split artifact
        } else {
            flush();
            const t = line.startsWith(' ') ? line.slice(1) : line;
            rows.push({ old: { n: oldN, t }, new: { n: newN, t }, hunk: null, kind: 'ctx' });
            oldN++; newN++;
        }
    }
    flush();
    return { rows, hunkCount: hunk + 1 };
}

// ── API ─────────────────────────────────────────────────────────────────────

async function _get(path) {
    const resp = await apiFetch(path);
    if (!resp.ok) {
        let detail = `HTTP ${resp.status}`;
        try { const j = await resp.json(); if (j.detail) detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail); } catch {}
        throw new Error(detail);
    }
    return resp.json();
}

function _post(path, body) { return postJson(path, body); } // shared helper (TODO.md P3-01)

// ── Loading ─────────────────────────────────────────────────────────────────

async function _loadRecents() {
    try {
        const r = await _get('/api/editor/projects/recent');
        els.recents.replaceChildren(...(r.recents || []).map(rec => {
            const opt = document.createElement('option');
            opt.value = rec.path;
            return opt;
        }));
    } catch { /* recents are optional */ }
}

async function _loadRepo(repo) {
    state.repo = repo;
    try { localStorage.setItem(REPO_STORAGE_KEY, repo); } catch {}
    els.repoInput.value = repo;
    try {
        state.status = await _get(`${API}/status?repo=${encodeURIComponent(repo)}`);
    } catch (e) {
        state.status = null;
        _renderFilesError(e.message);
        _setPanesEmpty(`Could not load repo: ${e.message}`);
        return;
    }
    if (!state.status.is_repo) {
        _renderFilesError(`${repo} is not a git repository`);
        _setPanesEmpty('Not a git repository');
        return;
    }
    state.branch = state.status.branch;
    _updateBranchBadge();
    _renderFiles();
    _setPanesEmpty('Select a file to compare');
    state.file = null;
    state.data = null;
    _updateStatusBar();
}

async function _refresh() {
    if (!state.repo) return;
    await _loadRepo(state.repo);
    if (state.file && state.status?.is_repo) await _loadDiff(state.file.path, state.file.side);
}

async function _loadDiff(path, side) {
    if (!state.repo) return;
    state.selected.clear();
    state.file = { path, side };
    try {
        state.data = await _get(`${API}/diff-view?repo=${encodeURIComponent(state.repo)}&path=${encodeURIComponent(path)}&side=${side}`);
    } catch (e) {
        addNotification(`Diff failed: ${e.message}`, 'error');
        _renderFiles();
        _setPanesEmpty(`Diff failed: ${e.message}`);
        return;
    }
    const parsed = _parseUnified(state.data);
    state.rows = parsed.rows;
    state.hunkCount = parsed.hunkCount;
    _renderFiles();   // refresh active highlight
    _renderPanes();
    _updateStatusBar();
}

// ── File list ───────────────────────────────────────────────────────────────

function _renderFiles() {
    const box = els.files;
    box.replaceChildren();
    const status = state.status;
    if (!status || !status.is_repo) { box.replaceChildren(_el('div', 'gd-empty', 'No repository loaded')); return; }
    const staged = status.files.filter(f => f.status[0] !== ' ');
    const changes = status.files.filter(f => f.status[1] !== ' ');
    if (!staged.length && !changes.length) {
        box.replaceChildren(_el('div', 'gd-empty', 'No changes 🎉'));
        return;
    }
    box.appendChild(_renderFileGroup('Staged', staged.length, staged, 'staged'));
    box.appendChild(_renderFileGroup('Changes', changes.length, changes, 'changes'));
}

function _renderFileGroup(label, count, files, side) {
    const wrap = _el('div');
    const head = _el('div', 'gd-group');
    head.appendChild(_el('span', null, label));
    head.appendChild(_el('span', null, `(${count})`));
    wrap.appendChild(head);
    if (!count) {
        wrap.appendChild(_el('div', 'gd-empty', 'none'));
        return wrap;
    }
    for (const f of files) wrap.appendChild(_renderFileRow(f, side));
    return wrap;
}

function _renderFileRow(f, side) {
    const letter = (side === 'staged' ? f.status[0] : f.status[1]) || 'U'; // M/A/D/R/?, 'U' for untracked
    const idx = f.path.lastIndexOf('/');
    const dir = idx >= 0 ? f.path.slice(0, idx + 1) : '';
    const name = f.path.slice(idx + 1);
    const row = _el('div', 'gd-file');
    if (state.file && state.file.path === f.path && state.file.side === side) row.classList.add('active');
    row.appendChild(_el('span', `gd-letter ${letter}`, letter));
    const pathEl = _el('span', 'gd-name');
    if (dir) pathEl.appendChild(_el('span', 'gd-dir', dir));
    pathEl.appendChild(document.createTextNode(name));
    pathEl.title = f.path;
    row.appendChild(pathEl);
    row.onclick = () => _loadDiff(f.path, side);
    return row;
}

function _renderFilesError(msg) {
    els.files.replaceChildren(_el('div', 'gd-empty', msg));
    els.branch.textContent = '';
}

function _updateBranchBadge() {
    if (!state.branch) { els.branch.textContent = ''; return; }
    let txt = `⎇ ${state.branch}`;
    if (state.status?.ahead != null && state.status?.behind != null) {
        const bits = [];
        if (state.status.ahead) bits.push(`↑${state.status.ahead}`);
        if (state.status.behind) bits.push(`↓${state.status.behind}`);
        if (bits.length) txt += ` (${bits.join(' ')})`;
    }
    els.branch.textContent = txt;
}

// ── Diff panes ──────────────────────────────────────────────────────────────

function _setPanesEmpty(msg) {
    state.rows = [];
    state.data = null;
    rowEls = { old: [], new: [] };
    for (const s of [els.oldScroll, els.newScroll]) s.replaceChildren(_el('div', 'gd-empty', msg));
    _updatePaneHeads();
}

function _updatePaneHeads() {
    const d = state.data;
    const side = state.file?.side;
    if (!d || !state.file) {
        els.oldHead.textContent = 'OLD';
        els.newHead.textContent = 'NEW';
        return;
    }
    els.oldHead.textContent = side === 'changes' ? 'OLD — index' : 'OLD — HEAD';
    els.newHead.textContent = side === 'changes' ? 'NEW — worktree' : 'NEW — index';
}

function _renderPanes() {
    const d = state.data;
    if (!d) return;
    if (d.binary) {
        _setPanesEmpty('Binary file — diff not shown. Use Stage/Unstage file below.');
        return;
    }
    if (d.too_large) {
        _setPanesEmpty('File too large for the diff view (>200 KB). Use Stage/Unstage file below.');
        return;
    }
    if (!state.rows.length) {
        _setPanesEmpty('No changes');
        return;
    }
    const fragOld = document.createDocumentFragment();
    const fragNew = document.createDocumentFragment();
    rowEls = { old: [], new: [] };
    let prevHunk = null;
    for (const row of state.rows) {
        const hunkStart = row.hunk != null && row.hunk !== prevHunk;
        if (row.hunk != null) prevHunk = row.hunk;
        fragOld.appendChild(_buildLine(row, 'old', hunkStart));
        fragNew.appendChild(_buildLine(row, 'new', hunkStart));
    }
    els.oldScroll.replaceChildren(fragOld);
    els.newScroll.replaceChildren(fragNew);
    _updatePaneHeads();
    _updateStatusBar();
}

function _buildLine(row, which, hunkStart) {
    const side = which === 'old' ? row.old : row.new;
    const cls = ['gd-line'];
    if (hunkStart) cls.push('gd-hunk-start');
    if (which === 'old') {
        if (row.kind === 'del' || row.kind === 'both') cls.push('gd-del');
    } else {
        if (row.kind === 'add' || row.kind === 'both') cls.push('gd-add');
    }
    if (!side) cls.push('gd-gap');
    const el = _el('div', cls.join(' '));
    if (row.hunk != null) {
        el.dataset.hunk = String(row.hunk);
        if (state.selected.has(row.hunk)) el.classList.add('gd-sel');
    }
    el.appendChild(_el('span', 'gd-ln', side ? String(side.n) : ''));
    el.appendChild(_el('span', 'gd-tx', side ? side.t : ''));
    (which === 'old' ? rowEls.old : rowEls.new).push(el);
    return el;
}

function _toggleHunk(hunk) {
    if (state.selected.has(hunk)) state.selected.delete(hunk);
    else state.selected.add(hunk);
    for (const arr of [rowEls.old, rowEls.new]) {
        for (const el of arr) {
            if (el.dataset.hunk === String(hunk)) el.classList.toggle('gd-sel', state.selected.has(hunk));
        }
    }
    _updateStatusBar();
}

function _setAllSelected(select) {
    state.selected.clear();
    if (select) for (let i = 0; i < state.hunkCount; i++) state.selected.add(i);
    for (const arr of [rowEls.old, rowEls.new]) {
        for (const el of arr) {
            if (el.dataset.hunk != null) el.classList.toggle('gd-sel', select);
        }
    }
    _updateStatusBar();
}

// ── Actions ─────────────────────────────────────────────────────────────────

async function _hunkAction(action) {
    // action: 'stage' (changes side) or 'unstage' (staged side)
    if (!state.file || !state.repo || state.busy) return;
    if (!state.selected.size) { addNotification('Select changes first (click a highlighted block)', 'warning'); return; }
    state.busy = true;
    _updateStatusBar();
    try {
        await _post(`${API}/${action}-hunks`, {
            repo: state.repo,
            path: state.file.path,
            hunks: [...state.selected].sort((a, b) => a - b),
            total: state.hunkCount,
        });
        addNotification(`${action === 'stage' ? 'Staged' : 'Unstaged'} ${state.selected.size} hunk(s) in ${state.file.path}`, 'success');
    } catch (e) {
        addNotification(`${e.message}`, 'error');
    } finally {
        state.busy = false;
        await _refresh();
    }
}

async function _fileAction(action) {
    // action: 'stage' | 'unstage' — whole file
    if (!state.file || !state.repo || state.busy) return;
    state.busy = true;
    _updateStatusBar();
    try {
        await _post(`${API}/${action}`, { repo: state.repo, paths: [state.file.path] });
        addNotification(`${action === 'stage' ? 'Staged' : 'Unstaged'} ${state.file.path}`, 'success');
    } catch (e) {
        addNotification(`${e.message}`, 'error');
    } finally {
        state.busy = false;
        await _refresh();
    }
}

// ── Status bar ──────────────────────────────────────────────────────────────

function _updateStatusBar() {
    const f = state.file;
    els.pathInfo.textContent = f ? `${f.path}  ·  ${f.side === 'changes' ? 'index → worktree' : 'HEAD → index'}` : '';
    let info = '';
    if (f) {
        if (state.hunkCount) {
            info = `${state.hunkCount} hunk${state.hunkCount > 1 ? 's' : ''} · ${state.selected.size} selected`;
        } else if (state.data?.untracked) {
            info = 'new file — whole file selectable';
        } else {
            info = 'no changes';
        }
    }
    els.hunkInfo.textContent = info;

    const side = f?.side;
    const hasHunks = (f && (state.hunkCount > 0 || state.data?.untracked));
    const sel = state.selected.size;
    const busy = state.busy;
    // Select all / clear — for untracked files the single implicit hunk is index 0
    els.selectAllBtn.disabled = !hasHunks || busy;
    els.clearBtn.disabled = !sel || busy;
    // Primary hunk action (depends on which side we are viewing)
    if (side === 'changes') {
        els.primaryBtn.textContent = sel ? `⊕ Stage selected (${sel})` : '⊕ Stage selected';
        els.primaryBtn.disabled = !sel || busy;
        els.primaryBtn.onclick = () => _hunkAction('stage');
        els.allBtn.textContent = '⊞ Stage all';
        els.allBtn.disabled = !hasHunks || busy;
        els.allBtn.onclick = () => { _setAllSelected(true); _hunkAction('stage'); };
        els.fileBtn.textContent = 'Stage file';
        els.fileBtn.disabled = busy || !f;
        els.fileBtn.onclick = () => _fileAction('stage');
    } else if (side === 'staged') {
        els.primaryBtn.textContent = sel ? `⊖ Unstage selected (${sel})` : '⊖ Unstage selected';
        els.primaryBtn.disabled = !sel || busy;
        els.primaryBtn.onclick = () => _hunkAction('unstage');
        els.allBtn.textContent = '⊟ Unstage all';
        els.allBtn.disabled = !hasHunks || busy;
        els.allBtn.onclick = () => { _setAllSelected(true); _hunkAction('unstage'); };
        els.fileBtn.textContent = 'Unstage file';
        els.fileBtn.disabled = busy || !f;
        els.fileBtn.onclick = () => _fileAction('unstage');
    } else {
        els.primaryBtn.textContent = '⊕ Stage selected';
        els.primaryBtn.disabled = true;
        els.allBtn.textContent = '⊞ Stage all';
        els.allBtn.disabled = true;
        els.fileBtn.textContent = 'Stage file';
        els.fileBtn.disabled = true;
    }
    els.openBtn.disabled = !f || busy;
}

// ── Boot ────────────────────────────────────────────────────────────────────

export async function renderGitDiffPage(body) {
    if (!body) return;
    injectStyles();
    body.innerHTML = `
        <div id="gdApp" data-testid="git-diff-app">
            <div class="gd-toolbar">
                <span class="gd-title">⎇ Git Diff</span>
                <input id="gdRepo" class="gd-repo-input" data-testid="gd-repo" list="gdRecents"
                       placeholder="/path/to/repo  (Enter to load)" spellcheck="false">
                <datalist id="gdRecents"></datalist>
                <button class="gd-btn gd-btn-primary" data-testid="gd-load">Load</button>
                <button class="gd-btn" data-testid="gd-refresh" title="Refresh status + current diff">🔄</button>
                <span class="gd-branch" data-testid="gd-branch"></span>
            </div>
            <div class="gd-main">
                <div class="gd-files" data-testid="gd-files"><div class="gd-empty">No repository loaded</div></div>
                <div class="gd-pane">
                    <div class="gd-pane-head"><span data-testid="gd-old-head">OLD</span><span class="gd-hint">click a changed block to select</span></div>
                    <div class="gd-scroll" data-testid="gd-old"><div class="gd-empty">Load a repository to compare</div></div>
                </div>
                <div class="gd-pane">
                    <div class="gd-pane-head"><span data-testid="gd-new-head">NEW</span><span class="gd-hint"></span></div>
                    <div class="gd-scroll" data-testid="gd-new"><div class="gd-empty"></div></div>
                </div>
            </div>
            <div class="gd-statusbar">
                <span class="gd-path" data-testid="gd-path-info"></span>
                <span class="gd-info" data-testid="gd-hunk-info"></span>
                <span class="gd-spacer"></span>
                <button class="gd-btn" data-testid="gd-select-all">Select all</button>
                <button class="gd-btn" data-testid="gd-clear">Clear</button>
                <button class="gd-btn" data-testid="gd-all"></button>
                <button class="gd-btn" data-testid="gd-file-action"></button>
                <button class="gd-btn gd-btn-primary" data-testid="gd-primary"></button>
                <button class="gd-btn" data-testid="gd-open-editor" title="Open file in Code Editor">✎ Editor</button>
            </div>
        </div>`;

    els = {
        repoInput: body.querySelector('#gdRepo'),
        recents: body.querySelector('#gdRecents'),
        loadBtn: body.querySelector('[data-testid="gd-load"]'),
        refreshBtn: body.querySelector('[data-testid="gd-refresh"]'),
        branch: body.querySelector('[data-testid="gd-branch"]'),
        files: body.querySelector('[data-testid="gd-files"]'),
        oldHead: body.querySelector('[data-testid="gd-old-head"]'),
        newHead: body.querySelector('[data-testid="gd-new-head"]'),
        oldScroll: body.querySelector('[data-testid="gd-old"]'),
        newScroll: body.querySelector('[data-testid="gd-new"]'),
        pathInfo: body.querySelector('[data-testid="gd-path-info"]'),
        hunkInfo: body.querySelector('[data-testid="gd-hunk-info"]'),
        selectAllBtn: body.querySelector('[data-testid="gd-select-all"]'),
        clearBtn: body.querySelector('[data-testid="gd-clear"]'),
        allBtn: body.querySelector('[data-testid="gd-all"]'),
        fileBtn: body.querySelector('[data-testid="gd-file-action"]'),
        primaryBtn: body.querySelector('[data-testid="gd-primary"]'),
        openBtn: body.querySelector('[data-testid="gd-open-editor"]'),
    };

    els.loadBtn.onclick = () => {
        const repo = els.repoInput.value.trim();
        if (!repo) { addNotification('Enter a repository path', 'warning'); return; }
        _loadRepo(repo);
    };
    els.repoInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') els.loadBtn.click();
    });
    els.refreshBtn.onclick = () => _refresh();
    els.selectAllBtn.onclick = () => _setAllSelected(true);
    els.clearBtn.onclick = () => _setAllSelected(false);
    els.openBtn.onclick = () => {
        if (!state.file) return;
        const root = state.repo.replace(/\/+$/, '');
        if (typeof window.openEditorForPath === 'function') window.openEditorForPath(`${root}/${state.file.path}`);
        else addNotification('Code Editor is not available', 'warning');
    };

    // Hunk selection — delegated clicks on either pane.
    for (const scroll of [els.oldScroll, els.newScroll]) {
        scroll.addEventListener('click', (e) => {
            const line = e.target.closest('.gd-line[data-hunk]');
            if (line) _toggleHunk(Number(line.dataset.hunk));
        });
        // Scroll sync (both panes always have the same row count).
        scroll.addEventListener('scroll', () => {
            const other = scroll === els.oldScroll ? els.newScroll : els.oldScroll;
            if (Math.abs(other.scrollTop - scroll.scrollTop) > 1) other.scrollTop = scroll.scrollTop;
            if (Math.abs(other.scrollLeft - scroll.scrollLeft) > 1) other.scrollLeft = scroll.scrollLeft;
        });
    }

    liveApi = {
        open: (repo, path, side) => {
            els.repoInput.value = repo;
            _loadRepo(repo).then(() => { if (path) return _loadDiff(path, side); });
        },
    };
    _updateStatusBar();
    await _loadRecents();
    if (pendingOpen) {
        const p = pendingOpen; pendingOpen = null;
        els.repoInput.value = p.repo;
        await _loadRepo(p.repo);
        if (p.path) await _loadDiff(p.path, p.side);
    } else {
        let lastRepo = '';
        try { lastRepo = localStorage.getItem(REPO_STORAGE_KEY) || ''; } catch {}
        if (lastRepo) {
            els.repoInput.value = lastRepo;
            await _loadRepo(lastRepo);
        }
    }
}

/**
 * Open (or focus) the Git Diff app on a specific file.
 * Called from the Code Editor's Source Control panel: window.openGitDiffFor(repo, path, side).
 */
export function openGitDiffFor(repo, path, side = 'changes') {
    if (!repo) return;
    if (liveApi) { liveApi.open(repo, path, side); return; }
    pendingOpen = { repo, path, side };
    window.openApp('git-diff');
}

// ── Package entry point ───────────────────────────────────────────────────────
export async function render(container, ctx) {
    _ctx = ctx;
    ctx.log('info', 'Git Diff opened');
    // The Code Editor (or anything else) requests a specific file through this
    // global, because it cannot import the module.
    const request = window.__gitDiffRequest || null;
    window.__gitDiffRequest = null;
    await renderGitDiffPage(container);
    if (request && liveApi) {
        try { liveApi.open(request.repo, request.path, request.side); }
        catch (err) { addNotification(`Could not open the diff: ${err?.message || err}`, 'error'); }
    }
}

// The Code Editor cannot import this module; it calls back through this global.
window.__ethosGitDiffOpen = (repo, path, side) => openGitDiffFor(repo, path, side);
