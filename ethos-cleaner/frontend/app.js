// EthOS native package UI — Disk Cleaner
// Contract: export function render(container, ctx). The scans, protection
// policy and deletes live in EthOS core; this module only calls
// /api/disk-clean/*, /api/files/ops and the storage/system endpoints.
//
// Visual contract: the shared package shell (218 px rail, own palette tokens
// with a dark override, panels, tables, tags, one status line) — the same
// layout as AntiVirus / Backup Manager / VMM. Long actions report through
// ctx.progress, confirms through ctx.modal, diagnostics through ctx.log.

const STYLE = `
.dc-root {
    color-scheme: light;
    --dc-bg: #eef2f7;
    --dc-side-bg: rgba(255, 255, 255, 0.88);
    --dc-panel: #ffffff;
    --dc-surface: #f4f5f7;
    --dc-input-bg: #ffffff;
    --dc-border: #e3e5e8;
    --dc-text: #1f2430;
    --dc-muted: #5b6472;
    --dc-accent: #2563eb;
    --dc-accent-soft: rgba(37, 99, 235, 0.10);
    --dc-accent-border: rgba(37, 99, 235, 0.45);
    --dc-green: #15803d;
    --dc-green-soft: rgba(21, 128, 61, 0.12);
    --dc-green-border: rgba(21, 128, 61, 0.35);
    --dc-red: #b91c1c;
    --dc-red-soft: rgba(185, 28, 28, 0.08);
    --dc-red-border: rgba(185, 28, 28, 0.32);
    --dc-amber: #b45309;
    --dc-amber-soft: rgba(180, 83, 9, 0.10);
    --dc-amber-border: rgba(180, 83, 9, 0.30);
    --dc-hover: rgba(15, 23, 42, 0.06);
    --dc-bar: rgba(37, 99, 235, 0.85);
    --dc-bar-track: rgba(37, 99, 235, 0.12);
    --dc-map-1: #2563eb;
    --dc-map-2: #0e7490;
    --dc-map-3: #15803d;
    --dc-map-4: #b45309;
    --dc-map-5: #7c3aed;
    --dc-map-6: #be123c;
    --dc-glow-1: rgba(37, 99, 235, 0.08);
    --dc-glow-2: rgba(21, 128, 61, 0.06);
    display: flex;
    height: 100%;
    overflow: hidden;
    background:
        radial-gradient(circle at 8% 4%, var(--dc-glow-1), transparent 40%),
        radial-gradient(circle at 92% 96%, var(--dc-glow-2), transparent 40%),
        var(--dc-bg);
    color: var(--dc-text);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
:root.dark .dc-root {
    color-scheme: dark;
    --dc-bg: #08111d;
    --dc-side-bg: rgba(2, 6, 23, 0.45);
    --dc-panel: rgba(148, 163, 184, 0.07);
    --dc-surface: rgba(15, 23, 42, 0.45);
    --dc-input-bg: rgba(2, 6, 23, 0.55);
    --dc-border: rgba(148, 163, 184, 0.22);
    --dc-text: #e2e8f0;
    --dc-muted: #94a3b8;
    --dc-accent: #38bdf8;
    --dc-accent-soft: rgba(56, 189, 248, 0.14);
    --dc-accent-border: rgba(56, 189, 248, 0.55);
    --dc-green: #4ade80;
    --dc-green-soft: rgba(74, 222, 128, 0.14);
    --dc-green-border: rgba(74, 222, 128, 0.45);
    --dc-red: #f87171;
    --dc-red-soft: rgba(248, 113, 113, 0.12);
    --dc-red-border: rgba(248, 113, 113, 0.45);
    --dc-amber: #fbbf24;
    --dc-amber-soft: rgba(251, 191, 36, 0.10);
    --dc-amber-border: rgba(251, 191, 36, 0.45);
    --dc-hover: rgba(148, 163, 184, 0.09);
    --dc-bar: rgba(56, 189, 248, 0.85);
    --dc-bar-track: rgba(56, 189, 248, 0.16);
    --dc-map-1: #38bdf8;
    --dc-map-2: #22d3ee;
    --dc-map-3: #4ade80;
    --dc-map-4: #fbbf24;
    --dc-map-5: #a78bfa;
    --dc-map-6: #fb7185;
    --dc-glow-1: rgba(56, 189, 248, 0.16);
    --dc-glow-2: rgba(74, 222, 128, 0.10);
}
.dc-root, .dc-root * { box-sizing: border-box; }
.dc-root [hidden] { display: none !important; }
.dc-root button, .dc-root input, .dc-root select { font-family: inherit; }
.dc-side {
    flex: none; width: 218px; display: flex; flex-direction: column; gap: 16px;
    padding: 20px 14px; border-right: 1px solid var(--dc-border);
    background: var(--dc-side-bg); overflow-y: auto;
}
.dc-brand { display: flex; align-items: center; gap: 10px; padding: 0 8px; min-width: 0; }
.dc-brand-icon { font-size: 26px; line-height: 1; }
.dc-brand strong { display: block; font-size: 14px; letter-spacing: -0.01em; }
.dc-brand small { display: block; color: var(--dc-muted); font-size: 10px; }
.dc-nav { display: flex; flex-direction: column; gap: 2px; }
.dc-nav-item {
    display: block; width: 100%; padding: 9px 11px; border: 0; border-radius: 9px;
    background: transparent; color: var(--dc-muted); font-size: 12px; font-weight: 600;
    text-align: left; cursor: pointer;
}
.dc-nav-item:hover { background: var(--dc-hover); color: var(--dc-text); }
.dc-nav-item.is-active { background: var(--dc-accent-soft); color: var(--dc-text); }
.dc-nav-item:focus-visible { outline: 2px solid var(--dc-accent); outline-offset: 1px; }
.dc-side-foot { margin-top: auto; display: flex; flex-direction: column; gap: 8px; padding: 0 8px; }
.dc-side-note { color: var(--dc-muted); font-size: 10px; line-height: 1.6; }
.dc-main { flex: 1; min-width: 0; overflow-y: auto; padding: 24px 28px 32px; }
.dc-main h1 { margin: 0; font-size: clamp(22px, 3.4vw, 30px); letter-spacing: -0.02em; }
.dc-page-sub { margin: 4px 0 0; color: var(--dc-muted); font-size: 12px; line-height: 1.5; }
.dc-pill { align-self: flex-start; padding: 5px 10px; border-radius: 999px; font-size: 10px; font-weight: 700; border: 1px solid var(--dc-border); white-space: nowrap; }
.dc-pill.ready { color: var(--dc-green); border-color: var(--dc-green-border); background: var(--dc-green-soft); }
.dc-pill.starting { color: var(--dc-amber); border-color: var(--dc-amber-border); background: var(--dc-amber-soft); }
.dc-pill.offline { color: var(--dc-red); border-color: var(--dc-red-border); background: var(--dc-red-soft); }
.dc-status { min-height: 18px; margin: 12px 0 0; color: var(--dc-accent); font-size: 12px; font-weight: 600; }
.dc-status.error { color: var(--dc-red); }
.dc-status.warn { color: var(--dc-amber); }
.dc-view { display: flex; flex-direction: column; gap: 14px; margin-top: 16px; }
.dc-panel { padding: 17px 18px; border: 1px solid var(--dc-border); border-radius: 15px; background: var(--dc-panel); min-width: 0; }
.dc-panel h2 { margin: 0 0 3px; font-size: 13px; }
.dc-panel h3 { margin: 0 0 3px; font-size: 12px; }
.dc-muted { margin: 0; color: var(--dc-muted); font-size: 11px; line-height: 1.55; }
.dc-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.dc-row-between { justify-content: space-between; }
.dc-row-grow { align-items: stretch; }
.dc-grow { flex: 1; min-width: 160px; }
.dc-inline-label { display: inline-flex; align-items: center; gap: 6px; color: var(--dc-muted); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; }
.dc-btn {
    padding: 8px 13px; border: 1px solid var(--dc-border); border-radius: 9px;
    background: var(--dc-surface); color: var(--dc-text); font-size: 11px; font-weight: 600;
    cursor: pointer; white-space: nowrap;
}
.dc-btn:hover { border-color: var(--dc-accent-border); }
.dc-btn:focus-visible { outline: 2px solid var(--dc-accent); outline-offset: 1px; }
.dc-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.dc-btn.primary { background: var(--dc-accent); border-color: var(--dc-accent); color: #ffffff; }
.dc-btn.danger { background: var(--dc-red-soft); border-color: var(--dc-red-border); color: var(--dc-red); }
.dc-btn.small { padding: 4px 9px; font-size: 10px; }
.dc-btn.ghost { background: transparent; }
.dc-input, .dc-select {
    padding: 9px 11px; border: 1px solid var(--dc-border); border-radius: 9px;
    background: var(--dc-input-bg); color: var(--dc-text); font-size: 12px;
}
.dc-input { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.dc-input:focus-visible, .dc-select:focus-visible { outline: 2px solid var(--dc-accent); outline-offset: 1px; }
.dc-seg { display: inline-flex; border: 1px solid var(--dc-border); border-radius: 9px; overflow: hidden; }
.dc-seg button {
    padding: 7px 12px; border: 0; background: transparent; color: var(--dc-muted);
    font-size: 11px; font-weight: 600; cursor: pointer;
}
.dc-seg button.is-active { background: var(--dc-accent-soft); color: var(--dc-text); }
.dc-seg button:disabled { opacity: 0.4; cursor: not-allowed; }
.dc-check { display: inline-flex; align-items: center; gap: 7px; font-size: 11px; color: var(--dc-muted); cursor: pointer; }
.dc-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.dc-stat { padding: 12px 14px; border: 1px solid var(--dc-border); border-radius: 12px; background: var(--dc-surface); min-width: 0; }
.dc-stat-label { display: block; font-size: 9px; letter-spacing: 0.09em; text-transform: uppercase; color: var(--dc-muted); }
.dc-stat-value { display: block; margin-top: 5px; font-size: 20px; line-height: 1.1; font-variant-numeric: tabular-nums; }
.dc-stat-note { display: block; margin-top: 4px; font-size: 10px; color: var(--dc-muted); }
.dc-usage-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(100px, 1.2fr) max-content; gap: 12px; align-items: center; padding: 9px 0; border-top: 1px solid var(--dc-border); }
.dc-usage-row:first-of-type { border-top: 0; }
.dc-mount { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.dc-mount strong { font-size: 12px; }
.dc-mount small { color: var(--dc-muted); font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dc-bar { display: block; height: 7px; border-radius: 999px; background: var(--dc-bar-track); overflow: hidden; }
.dc-bar > span { display: block; height: 100%; background: var(--dc-bar); }
.dc-bar.is-warn > span { background: var(--dc-amber); }
.dc-bar.is-bad > span { background: var(--dc-red); }
.dc-num { text-align: right; font-variant-numeric: tabular-nums; font-size: 11px; font-weight: 600; white-space: nowrap; }
.dc-table-wrap { overflow-x: auto; }
table.dc-table { width: 100%; border-collapse: collapse; font-size: 11px; }
.dc-table th {
    padding: 7px 8px; border-bottom: 1px solid var(--dc-border); text-align: left;
    font-size: 9px; letter-spacing: 0.09em; text-transform: uppercase; color: var(--dc-muted); font-weight: 700;
}
.dc-table th.num, .dc-table td.num { text-align: right; }
.dc-table th.actions, .dc-table td.actions { text-align: right; white-space: nowrap; }
.dc-table td { padding: 8px; border-bottom: 1px solid var(--dc-border); vertical-align: middle; }
.dc-table tr:last-child td { border-bottom: 0; }
.dc-table tbody tr:hover td { background: var(--dc-hover); }
.dc-table .path { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; color: var(--dc-muted); word-break: break-all; }
.dc-table .name { font-weight: 600; }
.dc-sort { border: 0; background: transparent; color: inherit; font: inherit; letter-spacing: inherit; text-transform: inherit; cursor: pointer; padding: 0; }
.dc-sort:focus-visible { outline: 2px solid var(--dc-accent); outline-offset: 2px; }
.dc-tag { display: inline-block; padding: 3px 8px; border-radius: 999px; border: 1px solid var(--dc-border); font-size: 10px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.dc-tag.is-ok { color: var(--dc-green); border-color: var(--dc-green-border); background: var(--dc-green-soft); }
.dc-tag.is-bad { color: var(--dc-red); border-color: var(--dc-red-border); background: var(--dc-red-soft); }
.dc-tag.is-warn { color: var(--dc-amber); border-color: var(--dc-amber-border); background: var(--dc-amber-soft); }
.dc-tag.is-info { color: var(--dc-accent); border-color: var(--dc-accent-border); background: var(--dc-accent-soft); }
.dc-empty { padding: 24px; border: 1px dashed var(--dc-border); border-radius: 12px; text-align: center; color: var(--dc-muted); font-size: 11px; line-height: 1.6; }
.dc-callout { padding: 10px 12px; border: 1px solid var(--dc-accent-border); border-radius: 9px; background: var(--dc-accent-soft); color: var(--dc-text); font-size: 11px; line-height: 1.55; }
.dc-callout.warn { border-color: var(--dc-amber-border); background: var(--dc-amber-soft); }
.dc-callout.error { border-color: var(--dc-red-border); background: var(--dc-red-soft); }
.dc-toolbar { display: flex; flex-direction: column; gap: 10px; }
.dc-scan-line { margin: 0; color: var(--dc-muted); font-size: 11px; min-height: 16px; }
.dc-crumbs { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.dc-crumb { border: 0; background: transparent; color: var(--dc-accent); font-size: 11px; font-weight: 600; cursor: pointer; padding: 2px 4px; border-radius: 6px; }
.dc-crumb:hover { background: var(--dc-hover); }
.dc-crumb-sep { color: var(--dc-muted); font-size: 10px; }
.dc-share { display: flex; align-items: center; gap: 8px; min-width: 110px; }
.dc-share .dc-bar { flex: 1; }
.dc-share small { color: var(--dc-muted); font-size: 10px; min-width: 34px; text-align: right; font-variant-numeric: tabular-nums; }
.dc-map { display: block; width: 100%; height: auto; border-radius: 12px; border: 1px solid var(--dc-border); background: var(--dc-surface); }
.dc-map-cell rect { stroke: var(--dc-panel); stroke-width: 2; }
.dc-map-cell { cursor: pointer; }
.dc-map-cell text { fill: #ffffff; font-size: 12px; font-weight: 700; pointer-events: none; }
.dc-map-cell text.sub { font-size: 10px; font-weight: 500; opacity: 0.85; }
.dc-cat-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
.dc-cat-head strong { font-size: 12px; }
.dc-cat-head span { color: var(--dc-muted); font-size: 10px; }
.dc-bulk {
    position: sticky; bottom: 0; display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
    padding: 10px 14px; border: 1px solid var(--dc-border); border-radius: 12px;
    background: var(--dc-panel); box-shadow: 0 -6px 20px rgba(15, 23, 42, 0.08);
}
.dc-bulk-info { color: var(--dc-muted); font-size: 11px; }
.dc-kv { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 6px 14px; font-size: 11px; }
.dc-kv dt { color: var(--dc-muted); }
.dc-kv dd { margin: 0; font-variant-numeric: tabular-nums; }
.dc-action-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
.dc-loading { padding: 22px; text-align: center; color: var(--dc-muted); font-size: 11px; }
@media (max-width: 780px) {
    .dc-root { flex-direction: column; }
    .dc-side {
        width: 100%; flex-direction: row; align-items: center; gap: 12px;
        padding: 10px 12px; border-right: 0; border-bottom: 1px solid var(--dc-border);
        overflow-x: auto; overflow-y: hidden;
    }
    .dc-brand { padding: 0; flex: none; }
    .dc-brand small { display: none; }
    .dc-nav { flex-direction: row; gap: 4px; }
    .dc-nav-item { white-space: nowrap; }
    .dc-side-foot { margin: 0 0 0 auto; flex-direction: row; align-items: center; padding: 0; }
    .dc-side-note { display: none; }
    .dc-main { padding: 16px 14px 24px; }
    .dc-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .dc-usage-row { grid-template-columns: minmax(0, 1fr) max-content; }
    .dc-usage-row .dc-bar { display: none; }
}
`;

const VIEWS = {
    overview: ['Overview', 'Disk usage at a glance and the next reclaim step.'],
    analyze: ['Analyze', 'Find the folders and files that use the most space.'],
    cleanup: ['Cleanup', 'Trash, temporary files, caches and rotated logs.'],
    caches: ['Caches & apps', 'EthOS caches, Docker leftovers and the system journal.'],
    activity: ['Activity', 'What the cleaner reclaimed, newest first.'],
};

const CATEGORY_META = {
    trash: { label: 'Trash', note: 'XDG trash folders — emptied for good' },
    temp: { label: 'Temporary files', note: '/tmp and /var/tmp' },
    cache: { label: 'User caches', note: '~/.cache (thumbnails, editor/browser caches)' },
    logs: { label: 'Log files', note: '/var/log — rotated files are safe' },
    var_cache: { label: 'Package caches', note: '/var/cache (apt and friends)' },
};

const CACHE_META = {
    temp_chunks: {
        label: 'Upload staging', note: 'Abandoned chunked uploads', cleanable: true,
        confirm: 'Remove expired upload chunks? Uploads still in progress are preserved.',
    },
    transcodes: {
        label: 'Playback transcodes', note: 'Temporary video transcodes', cleanable: true,
        confirm: 'Remove expired transcodes? Active playback is preserved.',
    },
    trash: {
        label: 'Recycle bin (all users)', note: 'Files deleted by every account', cleanable: true,
        confirm: 'Permanently empty the recycle bin of every account? Restore anything you need first.',
        danger: true,
    },
    thumbnails: {
        label: 'Photo thumbnails', note: 'Regenerated on the next view', cleanable: true,
        confirm: 'Delete all cached photo thumbnails? They regenerate automatically.',
    },
    video_thumbs: {
        label: 'Video thumbnails', note: 'Regenerated on the next view', cleanable: true,
        confirm: 'Delete all cached video thumbnails? They regenerate automatically.',
    },
    video_exports: {
        label: 'Offline video exports', note: 'Owned by Video Station — clean it there', cleanable: false,
    },
};

const ACTION_META = {
    trash: { label: 'Moved to Trash', tone: 'is-info' },
    delete: { label: 'Deleted', tone: 'is-warn' },
    caches: { label: 'Caches cleaned', tone: 'is-ok' },
    vacuum: { label: 'Journal vacuumed', tone: 'is-ok' },
};

const PAGE_SIZE_CHUNK = 50;

export async function render(container, ctx) {
    const esc = (value) => ctx.escape.html(value == null ? '' : String(value));
    const attr = (value) => ctx.escape.attr(value == null ? '' : String(value));

    const state = {
        view: 'overview',
        partitions: [],
        usage: null,
        suggestions: null,
        suggestionsLoading: false,
        suggestionsError: '',
        history: [],
        overviewError: '',
        caches: { usage: null, images: null, volumes: null, orphans: null },
        cachesLoading: false,
        scan: {
            path: '/home', depth: 2, mode: 'folders', view: 'list',
            running: false, cancelling: false, jobId: '', task: null,
            resultPath: '', crumbs: [], tree: null, files: null,
            totalSize: 0, fileCount: 0, truncated: false, entries: 0,
            current: '', error: '', sort: 'size', filter: '',
        },
        cleanup: { filter: 'all', selected: new Set() },
        scanTimer: null,
    };

    const style = document.createElement('style');
    style.textContent = STYLE;
    const root = document.createElement('div');
    root.className = 'dc-root';
    root.innerHTML = `
        <aside class="dc-side">
            <div class="dc-brand">
                <span class="dc-brand-icon" aria-hidden="true">🧹</span>
                <div><strong>Disk Cleaner</strong><small data-version>EthOS package</small></div>
            </div>
            <nav class="dc-nav" aria-label="Disk Cleaner sections">
                ${Object.entries(VIEWS).map(([id, view], index) => `
                    <button class="dc-nav-item${index === 0 ? ' is-active' : ''}" type="button"
                            data-action="view" data-view="${id}" data-testid="cleaner-nav-${id}"
                            aria-current="${index === 0 ? 'page' : 'false'}">${esc(view[0])}</button>`).join('')}
            </nav>
            <div class="dc-side-foot">
                <span class="dc-pill starting" data-pill role="status" aria-live="polite">Starting…</span>
                <span class="dc-side-note">Admin only. Every delete stays inside your account's path scope.</span>
            </div>
        </aside>
        <main class="dc-main">
            <header>
                <h1 data-title>Overview</h1>
                <p class="dc-page-sub" data-sub></p>
                <p class="dc-status" data-status role="status" aria-live="polite">Loading…</p>
            </header>
            <div class="dc-view" data-view-host></div>
        </main>`;
    container.append(style, root);

    const refs = {
        title: root.querySelector('[data-title]'),
        sub: root.querySelector('[data-sub]'),
        status: root.querySelector('[data-status]'),
        pill: root.querySelector('[data-pill]'),
        host: root.querySelector('[data-view-host]'),
    };
    const version = root.querySelector('[data-version]');
    if (version) version.textContent = `v${ctx.pkg?.version || '2.0.0'}`;

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
    function fmtInt(value) {
        return Number(value || 0).toLocaleString('en-US');
    }
    function fmtPercent(value) {
        const number = Number(value || 0);
        return `${number >= 10 ? Math.round(number) : number.toFixed(1)}%`;
    }
    function relTime(iso) {
        if (!iso) return '—';
        const stamp = new Date(iso);
        if (Number.isNaN(stamp.getTime())) return '—';
        const diff = Date.now() - stamp.getTime();
        if (diff < 60_000) return 'just now';
        const minutes = Math.round(diff / 60_000);
        if (minutes < 60) return `${minutes} min ago`;
        const hours = Math.round(minutes / 60);
        if (hours < 48) return `${hours} h ago`;
        return `${Math.round(hours / 24)} d ago`;
    }
    function truncate(text, limit) {
        const value = String(text || '');
        return value.length > limit ? `${value.slice(0, Math.max(1, limit - 1))}…` : value;
    }
    function chunk(items, size) {
        const out = [];
        for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
        return out;
    }
    function dirnameOf(path) {
        const value = String(path || '');
        const cut = value.lastIndexOf('/');
        return cut > 0 ? value.slice(0, cut) : '/';
    }
    function buildCrumbs(path) {
        const value = String(path || '/');
        const crumbs = [{ name: '/', path: '/' }];
        const parts = value.split('/').filter(Boolean);
        let current = '';
        for (const part of parts) {
            current += `/${part}`;
            crumbs.push({ name: part, path: current });
        }
        return crumbs;
    }

    // ── shell helpers ──────────────────────────────────────────────────────
    function setStatus(text, tone = '') {
        if (!refs.status) return;
        refs.status.className = `dc-status ${tone}`.trim();
        refs.status.textContent = text || 'Ready.';
    }
    function setPill(text, kind = '') {
        if (!refs.pill) return;
        const cls = { busy: 'starting', bad: 'offline', '': 'ready' }[kind] ?? kind;
        refs.pill.className = `dc-pill ${cls}`.trim();
        refs.pill.textContent = text;
    }
    function toast(message, kind = 'info') {
        try { ctx.notifications?.toast(String(message), kind); } catch (_) { /* window closing */ }
    }
    function startTask(title, detail) {
        try {
            return ctx.progress?.startTask?.({
                appId: 'pkg-ethos-cleaner', title, detail, testIdPrefix: 'cleaner-task',
            }) || null;
        } catch (_) {
            return null;
        }
    }
    function confirmDialog({ title, message, okText = 'Confirm', cancelText = 'Cancel' }) {
        return new Promise((resolve) => {
            if (!ctx.modal?.confirm) {
                resolve(window.confirm(`${title}\n\n${message}`));
                return;
            }
            ctx.modal.confirm({
                title, message, okText, cancelText,
                onConfirm: () => resolve(true),
                onCancel: () => resolve(false),
            });
        });
    }
    function loadErrorText(error) {
        if (error?.status === 403) return 'Admin access required — sign in with an administrator account.';
        if (error?.status === 404) return 'This EthOS version does not provide the Disk Cleaner API — update EthOS.';
        return error?.detail && typeof error.detail === 'string'
            ? error.detail
            : (error?.message || String(error));
    }

    // ── API ────────────────────────────────────────────────────────────────
    async function api(path, options = {}) {
        const response = await ctx.apiFetch(path, options);
        let body = null;
        try { body = await response.json(); } catch { body = null; }
        if (!response.ok) {
            const detail = body?.detail ?? `HTTP ${response.status}`;
            const error = new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
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

    function waitForOp(opId, onTick) {
        return new Promise((resolve, reject) => {
            const deadline = Date.now() + 6 * 3600 * 1000;
            const tick = async () => {
                if (!root.isConnected) { resolve(null); return; }
                if (Date.now() > deadline) { reject(new Error('The operation timed out')); return; }
                try {
                    const snapshot = await api(`/api/files/ops/${encodeURIComponent(opId)}`);
                    onTick?.(snapshot);
                    if (snapshot.status === 'done') { resolve(snapshot); return; }
                } catch (error) {
                    if (error?.status === 404) { resolve(null); return; }
                    reject(error);
                    return;
                }
                setTimeout(tick, 400);
            };
            tick();
        });
    }

    // ── views ──────────────────────────────────────────────────────────────
    function setView(name) {
        if (!VIEWS[name]) return;
        state.view = name;
        root.querySelectorAll('.dc-nav-item').forEach((button) => {
            const active = button.dataset.view === name;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-current', active ? 'page' : 'false');
        });
        refs.title.textContent = VIEWS[name][0];
        refs.sub.textContent = VIEWS[name][1];
        renderView();
        if (name === 'overview') loadOverview();
        else if (name === 'cleanup') loadSuggestions(false);
        else if (name === 'caches') loadCaches();
        else if (name === 'activity') loadActivity();
    }

    function renderView() {
        if (!refs.host) return;
        if (state.view === 'overview') refs.host.innerHTML = overviewHtml();
        else if (state.view === 'analyze') refs.host.innerHTML = analyzeHtml();
        else if (state.view === 'cleanup') refs.host.innerHTML = cleanupHtml();
        else if (state.view === 'caches') refs.host.innerHTML = cachesHtml();
        else refs.host.innerHTML = activityHtml();
    }

    function realPartitions() {
        // Bind mounts repeat the same device (e.g. /mnt/X and /media/user/X);
        // count each device once, keeping the shortest mountpoint as its label.
        const byDevice = new Map();
        const parts = (state.partitions || [])
            .filter((part) => part && part.mountpoint && Number(part.total) > 0)
            .filter((part) => !/^(tmpfs|devtmpfs|squashfs|overlay|ramfs|proc|sysfs)$/i.test(String(part.fstype || '')))
            // Loop devices are image-build scratch mounts, not storage.
            .filter((part) => !/^\/dev\/loop\d+/.test(String(part.device || '')))
            .sort((a, b) => String(a.mountpoint).length - String(b.mountpoint).length);
        for (const part of parts) {
            const key = part.device || part.mountpoint;
            if (!byDevice.has(key)) byDevice.set(key, part);
        }
        return [...byDevice.values()].sort((a, b) => Number(b.total) - Number(a.total));
    }

    function usageAreas() {
        return state.usage?.areas || {};
    }

    // ── Overview ───────────────────────────────────────────────────────────
    function overviewHtml() {
        const parts = realPartitions();
        const totals = parts.reduce((acc, part) => {
            acc.used += Number(part.used || 0);
            acc.free += Number(part.free || 0);
            return acc;
        }, { used: 0, free: 0 });
        const caches = Number(state.usage?.total_bytes || 0);
        const trash = Number(usageAreas().trash?.bytes || 0);
        const recent = state.history.slice(0, 5);

        const volumeRows = parts.slice(0, 5).map((part) => {
            const percent = Number(part.percent || 0);
            const tone = percent > 90 ? ' is-bad' : percent > 75 ? ' is-warn' : '';
            return `<div class="dc-usage-row">
                <div class="dc-mount">
                    <strong>${esc(part.mountpoint)}</strong>
                    <small>${esc(part.device || '')} · ${esc(part.fstype || '')}</small>
                </div>
                <span class="dc-bar${tone}" title="${attr(percent)}% used"><span style="width:${Math.min(100, Math.max(0, percent))}%"></span></span>
                <span class="dc-num">${esc(part.used_human || fmtBytes(part.used))} / ${esc(part.total_human || fmtBytes(part.total))}</span>
            </div>`;
        }).join('');

        const recentRows = recent.length ? recent.map((row) => {
            const meta = ACTION_META[row.action] || { label: row.action, tone: 'is-info' };
            return `<tr>
                <td><span class="dc-tag ${meta.tone}">${esc(meta.label)}</span></td>
                <td class="num">${esc(fmtBytes(row.bytes))}</td>
                <td>${esc(fmtInt(row.items))} item(s)${row.failed ? ` · ${esc(fmtInt(row.failed))} failed` : ''}</td>
                <td>${esc(relTime(row.at))}</td>
            </tr>`;
        }).join('') : '';

        return `
            <section class="dc-panel">
                <div class="dc-summary">
                    <div class="dc-stat"><span class="dc-stat-label">In use</span>
                        <strong class="dc-stat-value">${esc(fmtBytes(totals.used))}</strong>
                        <span class="dc-stat-note">across ${esc(fmtInt(parts.length))} volume(s)</span></div>
                    <div class="dc-stat"><span class="dc-stat-label">Free</span>
                        <strong class="dc-stat-value">${esc(fmtBytes(totals.free))}</strong>
                        <span class="dc-stat-note">available right now</span></div>
                    <div class="dc-stat"><span class="dc-stat-label">EthOS caches</span>
                        <strong class="dc-stat-value">${esc(fmtBytes(caches))}</strong>
                        <span class="dc-stat-note">thumbnails, transcodes, uploads</span></div>
                    <div class="dc-stat"><span class="dc-stat-label">Recycle bin</span>
                        <strong class="dc-stat-value">${esc(fmtBytes(trash))}</strong>
                        <span class="dc-stat-note">all accounts</span></div>
                </div>
            </section>

            <section class="dc-panel">
                <div class="dc-row dc-row-between">
                    <div><h2>Volumes</h2><p class="dc-muted">Mounted filesystems with the most space in use.</p></div>
                    <button class="dc-btn small" data-action="view" data-view="caches" data-testid="cleaner-overview-caches">Reclaim caches</button>
                </div>
                <div style="margin-top:10px">${volumeRows || '<div class="dc-empty">No mounted volumes were reported.</div>'}</div>
            </section>

            <section class="dc-panel">
                <div class="dc-row dc-row-between">
                    <div><h2>Next step</h2><p class="dc-muted">Pick what to look at; nothing is deleted without a confirmation.</p></div>
                </div>
                <div class="dc-action-grid" style="margin-top:10px">
                    <button class="dc-btn primary" data-action="view" data-view="analyze" data-testid="cleaner-overview-analyze">Analyze a folder</button>
                    <button class="dc-btn" data-action="view" data-view="cleanup" data-testid="cleaner-overview-cleanup">Review cleanup</button>
                    <button class="dc-btn" data-action="view" data-view="caches" data-testid="cleaner-overview-caches-2">Clean app caches</button>
                    <button class="dc-btn" data-action="view" data-view="activity" data-testid="cleaner-overview-activity">Recent activity</button>
                </div>
            </section>

            <section class="dc-panel">
                <div class="dc-row dc-row-between">
                    <div><h2>Recent reclaims</h2><p class="dc-muted">Written to the unified Logs as pkg:ethos-cleaner.</p></div>
                    <button class="dc-btn small" data-action="logs-open" data-testid="cleaner-overview-logs">Open Logs</button>
                </div>
                <div class="dc-table-wrap" style="margin-top:10px">
                    ${recentRows ? `<table class="dc-table" data-testid="cleaner-overview-history">
                        <thead><tr><th>Action</th><th class="num">Freed</th><th>Items</th><th>When</th></tr></thead>
                        <tbody>${recentRows}</tbody></table>`
                        : '<div class="dc-empty">Nothing reclaimed yet.</div>'}
                </div>
            </section>`;
    }

    // ── Analyze ────────────────────────────────────────────────────────────
    function scanLine() {
        const scan = state.scan;
        if (scan.error) return scan.error;
        if (scan.running) {
            return `Scanning ${scan.current || scan.path}… ${fmtInt(scan.entries)} entries${scan.cancelling ? ' · cancelling' : ''}`;
        }
        if (scan.resultPath) {
            return `Scanned ${fmtInt(scan.entries)} entries · ${fmtBytes(scan.totalSize)}${scan.truncated ? ' · partial (entry/time limit reached)' : ''}`;
        }
        return 'Ready. Choose a folder and press Scan.';
    }

    function segButton(action, value, label, active, extra = '') {
        return `<button type="button" data-action="${action}" data-${action === 'analyze-mode' ? 'mode' : 'aview'}="${value}"
            class="${active ? 'is-active' : ''}" ${extra}>${esc(label)}</button>`;
    }

    function analyzeHtml() {
        const scan = state.scan;
        return `
            <section class="dc-panel dc-toolbar">
                <div class="dc-row dc-row-grow">
                    <input class="dc-input dc-grow" data-input="scan-path" data-testid="cleaner-path-input"
                           value="${attr(scan.path)}" placeholder="/home" spellcheck="false" aria-label="Folder to analyze">
                    <button class="dc-btn" data-action="analyze-browse" data-testid="cleaner-browse-btn">Browse…</button>
                    <label class="dc-inline-label">Depth
                        <select class="dc-select" data-input="scan-depth" data-testid="cleaner-depth-select" aria-label="Scan depth">
                            ${[1, 2, 3, 4, 5].map((depth) => `<option value="${depth}"${depth === scan.depth ? ' selected' : ''}>${depth}</option>`).join('')}
                        </select>
                    </label>
                    <button class="dc-btn primary" data-action="analyze-scan" data-testid="cleaner-scan-btn"${scan.running ? ' disabled' : ''}>Scan</button>
                    <button class="dc-btn danger" data-action="analyze-cancel" data-testid="cleaner-cancel-btn"${scan.running && !scan.cancelling ? '' : ' hidden'}>Cancel</button>
                </div>
                <div class="dc-row dc-row-between">
                    <span class="dc-seg" role="group" aria-label="Result type">
                        ${segButton('analyze-mode', 'folders', 'Folders', scan.mode === 'folders')}
                        ${segButton('analyze-mode', 'files', 'Biggest files', scan.mode === 'files')}
                    </span>
                    <span class="dc-seg" role="group" aria-label="Result view">
                        ${segButton('analyze-view', 'list', 'List', scan.view === 'list')}
                        ${segButton('analyze-view', 'map', 'Map', scan.view === 'map', scan.mode === 'files' ? 'disabled' : '')}
                    </span>
                </div>
                <p class="dc-scan-line" data-scan-line role="status" aria-live="polite">${esc(scanLine())}</p>
            </section>
            <div data-analyze-body>${analyzeBodyHtml()}</div>`;
    }

    function analyzeBodyHtml() {
        const scan = state.scan;
        if (scan.error) {
            return `<section class="dc-panel"><div class="dc-callout error">${esc(scan.error)}</div>
                <div class="dc-row" style="margin-top:10px">
                    <button class="dc-btn" data-action="analyze-scan" data-testid="cleaner-retry-scan">Try again</button>
                </div></section>`;
        }
        if (scan.running && !scan.resultPath) {
            return `<section class="dc-panel"><div class="dc-loading">Walking the folder tree… ${esc(fmtInt(scan.entries))} entries so far.</div></section>`;
        }
        if (scan.mode === 'files') {
            if (!scan.resultPath && !(scan.files || []).length) {
                return `<section class="dc-panel"><div class="dc-empty">No files were found in this folder.</div></section>`;
            }
            return `<section class="dc-panel">
                <div class="dc-row dc-row-between">
                    <div><h2>Biggest files</h2>
                        <p class="dc-muted">${esc(fmtInt((scan.files || []).length))} file(s) from ${esc(fmtInt(scan.entries))} entries scanned.</p></div>
                    <button class="dc-btn small" data-action="analyze-scan" data-testid="cleaner-rescan-btn">Rescan</button>
                </div>
                <div class="dc-row" style="margin:8px 0">
                    <input class="dc-input dc-grow" data-input="scan-filter" data-testid="cleaner-files-filter"
                           value="${attr(scan.filter)}" placeholder="Filter by file name" aria-label="Filter files">
                </div>
                <div data-analyze-results>${analyzeResultsHtml()}</div>
            </section>`;
        }
        if (!scan.tree) {
            return `<section class="dc-panel"><div class="dc-empty">Scan a folder to see where the space went.<br>
                The tree opens with the largest entries first; click a folder to drill in.</div></section>`;
        }
        const total = Number(scan.totalSize || 0);
        const crumbs = scan.crumbs.map((crumb, index) => `
            <button class="dc-crumb" data-action="crumb" data-index="${index}" data-testid="cleaner-crumb-${index}">${esc(crumb.name)}</button>`).join('<span class="dc-crumb-sep">/</span>');
        return `
            <section class="dc-panel">
                <div class="dc-row dc-row-between">
                    <div class="dc-crumbs" style="margin-bottom:6px">${crumbs}</div>
                    <span class="dc-muted">${esc(fmtBytes(total))}${scan.truncated ? ' · partial' : ''}</span>
                </div>
                <div class="dc-row" style="margin-bottom:8px">
                    <input class="dc-input dc-grow" data-input="scan-filter" data-testid="cleaner-analyze-filter"
                           value="${attr(scan.filter)}" placeholder="Filter names in this folder" aria-label="Filter results">
                </div>
                <div data-analyze-results>${analyzeResultsHtml()}</div>
            </section>`;
    }

    function analyzeResultsHtml() {
        const scan = state.scan;
        const filter = scan.filter.trim().toLowerCase();
        if (scan.mode === 'files') {
            const files = (scan.files || []).filter((file) => !filter
                || String(file.name || '').toLowerCase().includes(filter));
            return filesTableHtml(files);
        }
        const total = Number(scan.totalSize || 0);
        const children = sortChildren(scan.tree?.children || [])
            .filter((child) => !filter || String(child.name || '').toLowerCase().includes(filter));
        if (scan.view === 'map') {
            return `<div class="dc-map-wrap">${mapSvg(children, total)}</div>`;
        }
        return `<div class="dc-table-wrap"><table class="dc-table" data-testid="cleaner-analyze-table">
            <thead><tr>
                <th><button class="dc-sort" data-action="sort" data-sort="name">Name</button></th>
                <th class="num"><button class="dc-sort" data-action="sort" data-sort="size">Size</button></th>
                <th style="width:150px">Share</th>
                <th class="actions">Actions</th>
            </tr></thead>
            <tbody>${children.length ? children.map((child, index) => treeRowHtml(child, total, index)).join('') : `
                <tr><td colspan="4"><div class="dc-empty">Nothing matches this view.</div></td></tr>`}</tbody>
        </table></div>`;
    }

    function refreshResults() {
        const host = refs.host.querySelector('[data-analyze-results]');
        if (host) host.innerHTML = analyzeResultsHtml();
    }

    function sortChildren(children) {
        const list = [...children];
        const key = state.scan.sort;
        list.sort((a, b) => {
            if (key === 'name') return String(a.name || '').localeCompare(String(b.name || ''));
            return Number(b.size || 0) - Number(a.size || 0);
        });
        return list;
    }

    function treeRowHtml(child, total, index) {
        const percent = total > 0 ? Math.min(100, (Number(child.size || 0) / total) * 100) : 0;
        const name = child.is_dir
            ? `<button class="dc-sort name" data-action="drill" data-path="${attr(child.path)}" data-testid="cleaner-drill-${index}">${esc(child.name)}</button>`
            : `<span class="name">${esc(child.name)}</span>`;
        return `<tr data-testid="cleaner-row-${index}">
            <td>${name}<div class="path">${esc(child.path)}</div></td>
            <td class="num">${esc(fmtBytes(child.size))}</td>
            <td><span class="dc-share"><span class="dc-bar"><span style="width:${percent.toFixed(1)}%"></span></span><small>${esc(fmtPercent(percent))}</small></span></td>
            <td class="actions">
                <button class="dc-btn small" data-action="row-trash" data-path="${attr(child.path)}" data-name="${attr(child.name)}" data-testid="cleaner-trash-${index}">Trash</button>
                <button class="dc-btn small danger" data-action="row-delete" data-path="${attr(child.path)}" data-name="${attr(child.name)}" data-testid="cleaner-delete-${index}">Delete</button>
            </td>
        </tr>`;
    }

    function filesTableHtml(files) {
        const largest = files.reduce((max, file) => Math.max(max, Number(file.size || 0)), 0);
        return `<div class="dc-table-wrap"><table class="dc-table" data-testid="cleaner-files-table">
            <thead><tr><th style="width:36px">#</th><th>Name</th><th>Folder</th>
                <th class="num">Size</th><th style="width:150px">Share</th><th class="actions">Actions</th></tr></thead>
            <tbody>${files.length ? files.map((file, index) => {
                const percent = largest > 0 ? (Number(file.size || 0) / largest) * 100 : 0;
                return `<tr data-testid="cleaner-file-${index}">
                    <td>${index + 1}</td>
                    <td><span class="name">${esc(file.name)}</span></td>
                    <td class="path">${esc(dirnameOf(file.path))}</td>
                    <td class="num">${esc(fmtBytes(file.size))}</td>
                    <td><span class="dc-share"><span class="dc-bar"><span style="width:${percent.toFixed(1)}%"></span></span><small>${esc(fmtPercent(percent))}</small></span></td>
                    <td class="actions">
                        <button class="dc-btn small" data-action="row-trash" data-path="${attr(file.path)}" data-name="${attr(file.name)}" data-testid="cleaner-file-trash-${index}">Trash</button>
                        <button class="dc-btn small danger" data-action="row-delete" data-path="${attr(file.path)}" data-name="${attr(file.name)}" data-testid="cleaner-file-delete-${index}">Delete</button>
                    </td>
                </tr>`;
            }).join('') : '<tr><td colspan="6"><div class="dc-empty">Nothing matches this filter.</div></td></tr>'}</tbody>
        </table></div>`;
    }

    // Squarified treemap — no dependency, no fixed colours (tokens 1…6).
    function squarify(items, width, height) {
        const total = items.reduce((sum, item) => sum + item.value, 0);
        if (!total || width <= 0 || height <= 0) return [];
        const scaled = items.filter((item) => item.value > 0)
            .map((item) => ({ ...item, area: (item.value / total) * width * height }));
        const rects = [];
        let x = 0;
        let y = 0;
        let w = width;
        let h = height;
        let row = [];

        const worst = (candidate, side) => {
            const sum = candidate.reduce((acc, item) => acc + item.area, 0);
            const max = Math.max(...candidate.map((item) => item.area));
            const min = Math.min(...candidate.map((item) => item.area));
            return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
        };
        const layout = () => {
            const sum = row.reduce((acc, item) => acc + item.area, 0);
            if (w >= h) {
                const rowWidth = sum / h;
                let cursor = y;
                for (const item of row) {
                    const rectHeight = rowWidth > 0 ? item.area / rowWidth : 0;
                    rects.push({ item, x, y: cursor, w: rowWidth, h: rectHeight });
                    cursor += rectHeight;
                }
                x += rowWidth;
                w -= rowWidth;
            } else {
                const rowHeight = sum / w;
                let cursor = x;
                for (const item of row) {
                    const rectWidth = rowHeight > 0 ? item.area / rowHeight : 0;
                    rects.push({ item, x: cursor, y, w: rectWidth, h: rowHeight });
                    cursor += rectWidth;
                }
                y += rowHeight;
                h -= rowHeight;
            }
            row = [];
        };

        for (const item of scaled) {
            if (w <= 0.5 || h <= 0.5) break;
            const side = Math.min(w, h);
            if (!row.length) { row = [item]; continue; }
            if (worst([...row, item], side) <= worst(row, side)) row.push(item);
            else { layout(); row = [item]; }
        }
        if (row.length) layout();
        return rects;
    }

    function mapSvg(children, total) {
        const items = children
            .filter((child) => Number(child.size || 0) > 0)
            .map((child, index) => ({
                value: Number(child.size || 0), label: child.name || '/', path: child.path,
                isDir: !!child.is_dir, index,
            }));
        if (!items.length) return '<div class="dc-empty">Nothing to map in this folder.</div>';
        const rects = squarify(items, 1000, 320);
        const cells = rects.map((rect, index) => {
            const fill = `var(--dc-map-${(index % 6) + 1})`;
            const label = rect.w >= 84 && rect.h >= 26;
            const sub = rect.w >= 84 && rect.h >= 46;
            const action = rect.item.isDir
                ? `data-action="drill" data-path="${attr(rect.item.path)}" role="button" tabindex="0"`
                : 'aria-hidden="true"';
            const name = truncate(rect.item.label, Math.max(4, Math.floor(rect.w / 8)));
            return `<g class="dc-map-cell" ${action}>
                <rect x="${rect.x.toFixed(1)}" y="${rect.y.toFixed(1)}" width="${Math.max(0, rect.w - 1).toFixed(1)}"
                      height="${Math.max(0, rect.h - 1).toFixed(1)}" rx="4" fill="${fill}"><title>${esc(rect.item.label)} · ${esc(fmtBytes(rect.item.value))}</title></rect>
                ${label ? `<text x="${(rect.x + 8).toFixed(1)}" y="${(rect.y + 19).toFixed(1)}">${esc(name)}</text>` : ''}
                ${sub ? `<text class="sub" x="${(rect.x + 8).toFixed(1)}" y="${(rect.y + 34).toFixed(1)}">${esc(fmtBytes(rect.item.value))}</text>` : ''}
            </g>`;
        }).join('');
        return `<svg class="dc-map" viewBox="0 0 1000 320" role="img" aria-label="Space map of ${attr(fmtBytes(total))}">${cells}</svg>`;
    }

    // ── Cleanup ────────────────────────────────────────────────────────────
    function allItems() {
        const categories = state.suggestions?.categories || {};
        const out = [];
        for (const [category, items] of Object.entries(categories)) {
            for (const item of items) out.push({ ...item, category });
        }
        return out;
    }

    function itemByPath(path) {
        return allItems().find((item) => item.path === path) || null;
    }

    function selectedItems() {
        return [...state.cleanup.selected].map((path) => itemByPath(path)).filter(Boolean);
    }

    function cleanupHtml() {
        if (state.suggestionsLoading && !state.suggestions) {
            return `<section class="dc-panel"><div class="dc-loading">Scanning trash, temporary files, caches and logs…</div></section>`;
        }
        if (state.suggestionsError) {
            return `<section class="dc-panel"><div class="dc-callout error">${esc(state.suggestionsError)}</div>
                <div class="dc-row" style="margin-top:10px">
                    <button class="dc-btn" data-action="cleanup-refresh" data-testid="cleaner-retry-suggestions">Try again</button>
                </div></section>`;
        }
        const data = state.suggestions;
        if (!data) {
            return `<section class="dc-panel"><div class="dc-empty">Cleanup candidates appear here after the first scan.</div></section>`;
        }
        const summary = data.summary || {};
        const filter = state.cleanup.filter;
        const journal = data.journal || {};
        const categories = Object.keys(CATEGORY_META).filter((category) => (data.categories?.[category] || []).length);

        const journalHtml = journal.available ? `
            <section class="dc-panel" data-testid="cleaner-journal-card">
                <div class="dc-row dc-row-between">
                    <div><h3>Systemd journal — ${esc(journal.human || fmtBytes(journal.size))}</h3>
                        <p class="dc-muted">Kernel and service logs kept by journald.</p></div>
                    <div class="dc-row">
                        <button class="dc-btn small" data-action="vacuum" data-days="7" data-testid="cleaner-vacuum-7">Vacuum &gt; 7 days</button>
                        <button class="dc-btn small" data-action="vacuum" data-days="30" data-testid="cleaner-vacuum-30">Vacuum &gt; 30 days</button>
                    </div>
                </div>
            </section>` : '';

        const categoryHtml = categories.map((category) => {
            const meta = CATEGORY_META[category];
            const items = (data.categories[category] || []).filter((item) => {
                if (filter === 'safe') return item.safety === 'safe';
                if (filter === 'caution') return item.safety !== 'safe';
                return true;
            });
            if (!items.length) return '';
            const bytes = items.reduce((sum, item) => sum + Number(item.size || 0), 0);
            const rows = items.map((item, index) => `
                <tr data-testid="cleaner-sug-${category}-${index}">
                    <td style="width:26px"><input type="checkbox" data-select-path="${attr(item.path)}"
                        aria-label="Select ${attr(item.name)}"${state.cleanup.selected.has(item.path) ? ' checked' : ''}></td>
                    <td><span class="name">${esc(item.name)}</span><div class="path">${esc(item.path)}</div>
                        <div class="dc-muted">${esc(item.description || '')}</div></td>
                    <td>${item.safety === 'safe'
                        ? '<span class="dc-tag is-ok">safe</span>'
                        : '<span class="dc-tag is-warn">caution</span>'}</td>
                    <td class="num">${esc(fmtBytes(item.size))}</td>
                    <td class="actions">
                        <button class="dc-btn small danger" data-action="sug-delete" data-path="${attr(item.path)}"
                                data-name="${attr(item.name)}" data-testid="cleaner-sug-delete-${category}-${index}">Delete</button>
                    </td>
                </tr>`).join('');
            return `<section class="dc-panel" data-testid="cleaner-cat-${category}">
                <div class="dc-cat-head"><strong>${esc(meta.label)}</strong>
                    <span>${esc(meta.note)} · ${esc(fmtInt(items.length))} item(s) · ${esc(fmtBytes(bytes))}</span></div>
                <div class="dc-table-wrap"><table class="dc-table">
                    <thead><tr><th></th><th>Item</th><th>Safety</th><th class="num">Size</th><th class="actions"></th></tr></thead>
                    <tbody>${rows}</tbody></table></div>
            </section>`;
        }).join('');

        const safeItems = allItems().filter((item) => item.safety === 'safe');
        const allSafeSelected = safeItems.length > 0 && safeItems.every((item) => state.cleanup.selected.has(item.path));

        return `
            <section class="dc-panel">
                <div class="dc-row dc-row-between">
                    <div><h2>Cleanup candidates</h2>
                        <p class="dc-muted">${esc(fmtBytes(summary.reclaimable_bytes || 0))} safely reclaimable
                            · ${esc(fmtBytes(summary.total_bytes))} total · updated ${esc(relTime(data.generated_at))}${data.cached ? ' (cached)' : ''}${data.truncated ? ' · partial sweep' : ''}</p></div>
                    <div class="dc-row">
                        <span class="dc-seg" role="group" aria-label="Safety filter">
                            ${['all', 'safe', 'caution'].map((value) => `<button type="button" data-action="cleanup-filter" data-filter="${value}"
                                class="${filter === value ? 'is-active' : ''}" data-testid="cleaner-filter-${value}">${value === 'all' ? 'All' : value === 'safe' ? 'Safe only' : 'Caution only'}</button>`).join('')}
                        </span>
                        <button class="dc-btn" data-action="cleanup-refresh" data-testid="cleaner-refresh-suggestions">Refresh</button>
                    </div>
                </div>
            </section>
            ${journalHtml}
            ${categoryHtml || '<section class="dc-panel"><div class="dc-empty">Nothing to clean up right now.</div></section>'}
            <div class="dc-bulk">
                <label class="dc-check"><input type="checkbox" data-action="select-safe" data-testid="cleaner-select-safe"${allSafeSelected ? ' checked' : ''}> Select all safe items</label>
                <span class="dc-bulk-info" data-bulk-info>${state.cleanup.selected.size
                    ? `${esc(fmtInt(selectedItems().length))} selected · ${esc(fmtBytes(selectedItems().reduce((sum, item) => sum + Number(item.size || 0), 0)))}`
                    : '0 selected · 0 B'}</span>
                <button class="dc-btn primary small" data-action="bulk-delete" data-testid="cleaner-bulk-delete"${state.cleanup.selected.size ? '' : ' disabled'}>Delete selected</button>
            </div>`;
    }

    // ── Caches & apps ──────────────────────────────────────────────────────
    function cachesHtml() {
        if (state.cachesLoading && !state.caches.usage) {
            return `<section class="dc-panel"><div class="dc-loading">Reading EthOS cache usage…</div></section>`;
        }
        const usage = state.caches.usage || state.usage;
        const areas = usage?.areas || {};
        const rows = Object.keys(CACHE_META).map((area) => {
            const meta = CACHE_META[area];
            const info = areas[area] || { files: 0, bytes: 0 };
            return `<tr data-testid="cleaner-cache-${area}">
                <td><span class="name">${esc(meta.label)}</span><div class="dc-muted">${esc(meta.note)}</div></td>
                <td class="num">${esc(fmtInt(info.files))}</td>
                <td class="num">${esc(fmtBytes(info.bytes))}</td>
                <td class="actions">${meta.cleanable
                    ? `<button class="dc-btn small${meta.danger ? ' danger' : ''}" data-action="cache-clean" data-area="${area}"
                        data-testid="cleaner-clean-${area}">Clean</button>`
                    : '<span class="dc-tag">managed</span>'}</td>
            </tr>`;
        }).join('');

        const images = state.caches.images;
        const volumes = state.caches.volumes;
        const orphans = state.caches.orphans;
        const dockerHtml = `
            <section class="dc-panel">
                <h2>Docker</h2>
                <p class="dc-muted">Unused images and volumes are reclaimable; running containers are never touched.</p>
                <div class="dc-table-wrap" style="margin-top:10px"><table class="dc-table">
                    <thead><tr><th>Resource</th><th class="num">Orphaned</th><th class="num">Size</th><th class="actions"></th></tr></thead>
                    <tbody>
                        <tr data-testid="cleaner-docker-images"><td><span class="name">Images</span>
                            <div class="dc-muted">${images ? `${esc(fmtInt(images.total_count))} image(s)` : 'unavailable'}</div></td>
                            <td class="num">${images ? esc(fmtInt((images.images || []).filter((image) => image.is_dangling).length)) : '—'}</td>
                            <td class="num">${images ? esc(fmtBytes(images.total_size_bytes)) : '—'}</td>
                            <td class="actions"><button class="dc-btn small" data-action="docker-prune" data-target="images"
                                data-testid="cleaner-prune-images"${images ? '' : ' disabled'}>Prune unused</button></td></tr>
                        <tr data-testid="cleaner-docker-volumes"><td><span class="name">Volumes</span>
                            <div class="dc-muted">${volumes ? `${esc(fmtInt(volumes.total_count))} volume(s)` : 'unavailable'}</div></td>
                            <td class="num">${volumes ? esc(fmtInt(volumes.orphaned_count)) : '—'}</td>
                            <td class="num">${volumes ? esc(fmtBytes((volumes.volumes || []).reduce((sum, volume) => sum + Number(volume.size || 0), 0))) : '—'}</td>
                            <td class="actions"><button class="dc-btn small" data-action="docker-prune" data-target="volumes"
                                data-testid="cleaner-prune-volumes"${volumes ? '' : ' disabled'}>Prune unused</button></td></tr>
                    </tbody></table></div>
                ${!images && !volumes ? '<div class="dc-callout warn" style="margin-top:10px">The Docker engine is not available on this host.</div>' : ''}
            </section>`;

        const journal = state.suggestions?.journal;
        const journalHtml = `
            <section class="dc-panel">
                <div class="dc-row dc-row-between">
                    <div><h3>Systemd journal</h3>
                        <p class="dc-muted">${journal?.available ? `${esc(journal.human)} kept by journald.` : 'Open Cleanup once to measure the journal size.'}</p></div>
                    <div class="dc-row">
                        <button class="dc-btn small" data-action="vacuum" data-days="7" data-testid="cleaner-caches-vacuum-7">Vacuum &gt; 7 days</button>
                        <button class="dc-btn small" data-action="vacuum" data-days="30" data-testid="cleaner-caches-vacuum-30">Vacuum &gt; 30 days</button>
                    </div>
                </div>
            </section>`;

        const orphanTotal = Number(orphans?.total_bytes || 0);
        const orphanHtml = `
            <section class="dc-panel">
                <h3>Unused package data</h3>
                <p class="dc-muted">${orphans
                    ? `${esc(fmtBytes(orphanTotal))} left by uninstalled packages — kept so a reinstall resumes with its settings. Purge it from Packages → Installed.`
                    : 'Left behind by uninstalled packages; managed by Packages → Installed.'}</p>
            </section>`;

        return `
            <section class="dc-panel">
                <div class="dc-row dc-row-between">
                    <div><h2>EthOS caches</h2>
                        <p class="dc-muted">Total ${esc(fmtBytes(usage?.total_bytes || 0))} · ${esc(fmtInt(usage?.total_files || 0))} file(s). Thumbnail caches regenerate automatically.</p></div>
                    <button class="dc-btn small" data-action="view" data-view="cleanup" data-testid="cleaner-caches-cleanup">Review junk files</button>
                </div>
                <div class="dc-table-wrap" style="margin-top:10px"><table class="dc-table" data-testid="cleaner-cache-table">
                    <thead><tr><th>Area</th><th class="num">Files</th><th class="num">Size</th><th class="actions"></th></tr></thead>
                    <tbody>${rows}</tbody></table></div>
            </section>
            ${dockerHtml}
            ${journalHtml}
            ${orphanHtml}`;
    }

    // ── Activity ───────────────────────────────────────────────────────────
    function activityHtml() {
        const rows = state.history.map((row, index) => {
            const meta = ACTION_META[row.action] || { label: row.action, tone: 'is-info' };
            return `<tr data-testid="cleaner-history-${index}">
                <td><span class="dc-tag ${meta.tone}">${esc(meta.label)}</span></td>
                <td class="num">${esc(fmtBytes(row.bytes))}</td>
                <td class="num">${esc(fmtInt(row.items))}</td>
                <td class="num">${esc(fmtInt(row.failed))}</td>
                <td>${esc(row.scope || '—')}</td>
                <td>${esc(relTime(row.at))}</td>
            </tr>`;
        }).join('');
        return `
            <section class="dc-panel">
                <div class="dc-row dc-row-between">
                    <div><h2>Reclaim history</h2><p class="dc-muted">Newest first, capped at 50 entries in EthOS state.</p></div>
                    <div class="dc-row">
                        <button class="dc-btn small" data-action="activity-refresh" data-testid="cleaner-history-refresh">Refresh</button>
                        <button class="dc-btn small" data-action="logs-open" data-testid="cleaner-history-logs">Open Logs</button>
                    </div>
                </div>
                <div class="dc-table-wrap" style="margin-top:10px">
                    ${rows ? `<table class="dc-table" data-testid="cleaner-history-table">
                        <thead><tr><th>Action</th><th class="num">Freed</th><th class="num">Items</th><th class="num">Failed</th><th>Detail</th><th>When</th></tr></thead>
                        <tbody>${rows}</tbody></table>` : '<div class="dc-empty">Nothing reclaimed yet.</div>'}
                </div>
            </section>`;
    }

    // ── loaders ────────────────────────────────────────────────────────────
    async function loadOverview() {
        setStatus('Reading volumes…');
        try {
            const [partitions, usage, history] = await Promise.all([
                api('/api/storage/partitions').catch(() => ({ partitions: [] })),
                api('/api/system/storage-usage').catch(() => null),
                api('/api/disk-clean/history?limit=5').catch(() => ({ items: [] })),
            ]);
            state.partitions = partitions.partitions || [];
            state.usage = usage;
            state.history = history.items || [];
            state.overviewError = '';
            setPill('Ready');
            setStatus('Ready.');
        } catch (error) {
            state.overviewError = loadErrorText(error);
            setPill('Offline', 'bad');
            setStatus(state.overviewError, 'error');
        }
        if (state.view === 'overview') renderView();
    }

    async function loadSuggestions(force) {
        const slow = !state.suggestions || force;
        const task = slow ? startTask('Reviewing cleanup candidates', 'Walking trash, temp files, caches and logs…') : null;
        state.suggestionsLoading = true;
        state.suggestionsError = '';
        if (state.view === 'cleanup') renderView();
        setStatus(slow ? 'Scanning junk locations…' : 'Refreshing cleanup candidates…');
        try {
            const data = await api(`/api/disk-clean/suggestions${force ? '?refresh=1' : ''}`);
            state.suggestions = data;
            const alive = new Set(allItems().map((item) => item.path));
            for (const path of [...state.cleanup.selected]) {
                if (!alive.has(path)) state.cleanup.selected.delete(path);
            }
            task?.finish('done', {
                percent: 100,
                detail: `${fmtInt(allItems().length)} candidate(s) · ${fmtBytes(data.summary?.reclaimable_bytes || 0)} safe`,
            });
            setPill('Ready');
            setStatus(`Found ${fmtInt(allItems().length)} candidate(s) · ${fmtBytes(data.summary?.reclaimable_bytes || 0)} safely reclaimable.`);
        } catch (error) {
            state.suggestionsError = loadErrorText(error);
            task?.finish('failed', { detail: state.suggestionsError });
            setPill('Offline', 'bad');
            setStatus(state.suggestionsError, 'error');
        } finally {
            state.suggestionsLoading = false;
            if (state.view === 'cleanup') renderView();
        }
    }

    async function loadCaches() {
        state.cachesLoading = true;
        if (state.view === 'caches') renderView();
        setStatus('Reading cache usage…');
        // Render the EthOS caches first: Docker can take seconds (or be absent).
        const [usage, orphans] = await Promise.all([
            api('/api/system/storage-usage').catch(() => state.usage),
            api('/api/packages/orphans').catch(() => null),
        ]);
        state.caches = { ...state.caches, usage, orphans };
        if (usage) state.usage = usage;
        state.cachesLoading = false;
        setPill(usage ? 'Ready' : 'Offline', usage ? '' : 'bad');
        setStatus(usage ? 'Ready.' : 'Could not read the EthOS cache usage.', usage ? '' : 'error');
        if (state.view === 'caches') renderView();
        Promise.all([
            api('/api/images').catch(() => null),
            api('/api/volumes').catch(() => null),
        ]).then(([images, volumes]) => {
            state.caches = { ...state.caches, images, volumes };
            if (state.view === 'caches' && root.isConnected) renderView();
        });
    }

    async function loadActivity() {
        setStatus('Reading history…');
        try {
            const history = await api('/api/disk-clean/history?limit=50');
            state.history = history.items || [];
            setPill('Ready');
            setStatus(`${fmtInt(state.history.length)} action(s) recorded.`);
        } catch (error) {
            setPill('Offline', 'bad');
            setStatus(loadErrorText(error), 'error');
        }
        if (state.view === 'activity') renderView();
    }

    // ── scanning ───────────────────────────────────────────────────────────
    function clearScanTimer() {
        if (state.scanTimer) {
            clearTimeout(state.scanTimer);
            state.scanTimer = null;
        }
    }

    function updateScanLine() {
        const line = refs.host.querySelector('[data-scan-line]');
        if (line) line.textContent = scanLine();
        const cancel = refs.host.querySelector('[data-action="analyze-cancel"]');
        if (cancel) cancel.hidden = !(state.scan.running && !state.scan.cancelling);
        const scanBtn = refs.host.querySelector('[data-action="analyze-scan"]');
        if (scanBtn) scanBtn.disabled = state.scan.running;
    }

    async function runScan(path, { mode = state.scan.mode } = {}) {
        const target = String(path || '').trim();
        if (!target) {
            setStatus('Choose a folder first.', 'warn');
            return;
        }
        clearScanTimer();
        state.scan = {
            ...state.scan,
            path: target, mode, running: true, cancelling: false, jobId: '',
            tree: null, files: null, totalSize: 0, fileCount: 0, truncated: false,
            entries: 0, current: target, error: '', resultPath: '',
            crumbs: buildCrumbs(target),
        };
        setPill('Scanning', 'busy');
        setStatus(`Scanning ${target}…`);
        if (state.view === 'analyze') renderView();
        state.scan.task = startTask(
            mode === 'folders' ? `Analyzing ${target}` : `Finding biggest files in ${target}`,
            mode === 'folders' ? 'Walking the folder tree…' : 'Comparing file sizes…',
        );
        try {
            const started = await post('/api/disk-clean/scans', {
                path: target,
                depth: Number(state.scan.depth) || 2,
                mode: mode === 'folders' ? 'tree' : 'files',
                limit: 25,
            });
            state.scan.jobId = started.job_id || '';
            scheduleScanPoll();
        } catch (error) {
            finishScanError(error);
        }
    }

    function scheduleScanPoll() {
        clearScanTimer();
        state.scanTimer = setTimeout(pollScan, 400);
    }

    async function pollScan() {
        state.scanTimer = null;
        if (!root.isConnected || !state.scan.jobId) return;
        let job;
        try {
            job = await api(`/api/disk-clean/scans/${encodeURIComponent(state.scan.jobId)}`);
        } catch (error) {
            finishScanError(error);
            return;
        }
        if (job.state === 'running') {
            state.scan.entries = Number(job.progress?.entries || 0);
            state.scan.current = job.progress?.current || state.scan.current;
            state.scan.task?.update({
                detail: `${fmtInt(state.scan.entries)} entries · ${state.scan.current || ''}`,
            });
            setStatus(`Scanning… ${fmtInt(state.scan.entries)} entries`);
            if (state.view === 'analyze') {
                updateScanLine();
                const body = refs.host.querySelector('[data-analyze-body]');
                if (body && !state.scan.resultPath) {
                    body.innerHTML = analyzeBodyHtml();
                }
            }
            scheduleScanPoll();
            return;
        }
        if (job.state === 'cancelled') {
            state.scan.running = false;
            state.scan.cancelling = false;
            state.scan.task?.finish('cancelled', { detail: 'Cancelled by the user' });
            state.scan.task = null;
            setPill('Ready');
            setStatus('Scan cancelled.', 'warn');
            if (state.view === 'analyze') renderView();
            return;
        }
        if (job.state === 'failed') {
            finishScanError(new Error(job.error || 'The scan failed'));
            return;
        }
        const result = job.result || {};
        state.scan.running = false;
        state.scan.cancelling = false;
        state.scan.entries = Number(job.progress?.entries || result.file_count || 0);
        state.scan.resultPath = result.path || state.scan.path;
        state.scan.crumbs = buildCrumbs(state.scan.resultPath);
        state.scan.totalSize = Number(result.total_size || 0);
        state.scan.fileCount = Number(result.file_count || result.scanned_entries || 0);
        state.scan.truncated = !!result.truncated;
        if (state.scan.mode === 'files') {
            state.scan.files = result.files || [];
            state.scan.tree = null;
        } else {
            state.scan.tree = result.tree || null;
            state.scan.files = null;
        }
        state.scan.task?.update({ percent: 100 });
        state.scan.task?.finish('done', {
            percent: 100,
            detail: `${fmtBytes(state.scan.totalSize)} · ${fmtInt(state.scan.entries)} entries`,
        });
        state.scan.task = null;
        setPill('Ready');
        setStatus(scanLine());
        if (state.view === 'analyze') renderView();
    }

    function finishScanError(error) {
        state.scan.running = false;
        state.scan.cancelling = false;
        state.scan.error = loadErrorText(error);
        state.scan.task?.finish('failed', { detail: state.scan.error });
        state.scan.task = null;
        clearScanTimer();
        setPill('Offline', 'bad');
        setStatus(state.scan.error, 'error');
        if (state.view === 'analyze') renderView();
    }

    async function cancelScan() {
        if (!state.scan.running || !state.scan.jobId) return;
        state.scan.cancelling = true;
        setStatus('Cancelling the scan…', 'warn');
        if (state.view === 'analyze') updateScanLine();
        try {
            await post(`/api/disk-clean/scans/${encodeURIComponent(state.scan.jobId)}/cancel`, {});
        } catch (error) {
            setStatus(loadErrorText(error), 'error');
        }
    }

    async function scanTo(path) {
        if (!path || state.scan.running) return;
        await runScan(path, { mode: state.scan.mode });
    }

    async function browseFolder() {
        const input = refs.host.querySelector('[data-input="scan-path"]');
        const startPath = (input?.value || state.scan.path || '/home').trim();
        try {
            const picked = await ctx.pickFolder?.({
                title: 'Choose a folder to analyze',
                startPath: startPath || '/home',
                roots: ['/home', '/mnt', '/media'],
                acceptLabel: 'Analyze this folder',
            });
            if (picked) {
                state.scan.path = picked;
                if (input) input.value = picked;
            }
        } catch (error) {
            setStatus(loadErrorText(error), 'error');
        }
    }

    // ── delete ─────────────────────────────────────────────────────────────
    async function deletePaths(paths, { mode, label }) {
        if (!paths.length) return false;
        const task = startTask(label, mode === 'trash' ? 'Moving to Trash…' : 'Deleting…');
        let freed = 0;
        let failed = 0;
        try {
            const chunks = chunk(paths, PAGE_SIZE_CHUNK);
            for (let index = 0; index < chunks.length; index += 1) {
                const part = chunks[index];
                const started = await post('/api/disk-clean/delete', { paths: part, mode, async: true });
                if (!started?.op_id) throw new Error('The server did not start a delete operation');
                const snapshot = await waitForOp(started.op_id, (snap) => {
                    const partPercent = Number(snap?.percent || 0);
                    task?.update({
                        percent: Math.round(((index + partPercent / 100) / chunks.length) * 100),
                        detail: snap?.current || `${index + 1} / ${chunks.length}`,
                    });
                });
                freed += Number(started.estimated_bytes || 0);
                failed += Number(snapshot?.failed || 0);
            }
        } catch (error) {
            task?.finish('failed', { detail: loadErrorText(error) });
            toast(loadErrorText(error), 'error');
            return false;
        }
        const verb = mode === 'trash' ? 'Moved to Trash' : 'Deleted';
        task?.finish(failed ? 'failed' : 'done', {
            percent: 100,
            detail: `${fmtInt(paths.length - failed)} item(s) · ${fmtBytes(freed)}${failed ? ` · ${failed} failed` : ''}`,
        });
        if (failed) toast(`${fmtInt(paths.length - failed)} item(s) ${verb.toLowerCase()}, ${failed} failed`, 'warning');
        else toast(`${verb} ${fmtInt(paths.length)} item(s) · ${fmtBytes(freed)}`, 'success');
        return true;
    }

    async function confirmDeleteMany(paths, names, mode, context) {
        if (!paths.length) return;
        const what = names.length === 1 ? `“${names[0]}”` : `${fmtInt(names.length)} items`;
        const ok = await confirmDialog({
            title: mode === 'trash' ? 'Move to Trash' : 'Permanently delete',
            message: mode === 'trash'
                ? `Move ${what} to the EthOS recycle bin? You can restore it from Files → Trash.`
                : `Permanently delete ${what}? This cannot be undone.`,
            okText: mode === 'trash' ? 'Move to Trash' : 'Delete',
        });
        if (!ok) return;
        const done = await deletePaths(paths, {
            mode, label: mode === 'trash' ? `Moving ${what} to Trash` : `Deleting ${what}`,
        });
        if (!done) return;
        if (context === 'cleanup') {
            await loadSuggestions(true);
            return;
        }
        if (state.view === 'analyze' && !state.scan.running) {
            await runScan(state.scan.resultPath || state.scan.path, { mode: state.scan.mode });
        }
    }

    async function deleteSelected() {
        const items = selectedItems();
        if (!items.length) {
            toast('Nothing selected', 'warning');
            return;
        }
        await confirmDeleteMany(items.map((item) => item.path), items.map((item) => item.name), 'permanent', 'cleanup');
    }

    function syncSelection() {
        const items = selectedItems();
        const bytes = items.reduce((sum, item) => sum + Number(item.size || 0), 0);
        const info = refs.host.querySelector('[data-bulk-info]');
        if (info) info.textContent = `${fmtInt(items.length)} selected · ${fmtBytes(bytes)}`;
        const safeItems = allItems().filter((item) => item.safety === 'safe');
        const selectSafe = refs.host.querySelector('[data-action="select-safe"]');
        if (selectSafe) {
            selectSafe.checked = safeItems.length > 0
                && safeItems.every((item) => state.cleanup.selected.has(item.path));
        }
        const bulk = refs.host.querySelector('[data-action="bulk-delete"]');
        if (bulk) bulk.disabled = items.length === 0;
    }

    function toggleSelectSafe(checked) {
        for (const item of allItems()) {
            if (item.safety !== 'safe') continue;
            if (checked) state.cleanup.selected.add(item.path);
            else state.cleanup.selected.delete(item.path);
        }
        refs.host.querySelectorAll('[data-select-path]').forEach((checkbox) => {
            checkbox.checked = state.cleanup.selected.has(checkbox.dataset.selectPath);
        });
        syncSelection();
    }

    // ── maintenance actions ────────────────────────────────────────────────
    async function vacuum(days) {
        const ok = await confirmDialog({
            title: 'Vacuum the journal',
            message: `Remove systemd journal entries older than ${days} days?`,
            okText: 'Vacuum',
        });
        if (!ok) return;
        const task = startTask(`Vacuuming journal (> ${days} d)`, 'Running journalctl…');
        try {
            const data = await post('/api/disk-clean/vacuum-journal', { days });
            const freed = Number(data.freed_bytes || 0);
            task?.finish('done', { percent: 100, detail: freed ? fmtBytes(freed) : 'Done' });
            toast(`Journal vacuumed${freed ? ` · ${fmtBytes(freed)} freed` : ''}`, 'success');
            state.suggestions = null;
            if (state.view === 'cleanup') await loadSuggestions(true);
            else if (state.view === 'caches') await loadCaches();
            else await loadOverview();
        } catch (error) {
            task?.finish('failed', { detail: loadErrorText(error) });
            toast(loadErrorText(error), 'error');
        }
    }

    async function cleanCache(area) {
        const meta = CACHE_META[area] || { label: area, confirm: `Clean ${area}?` };
        const ok = await confirmDialog({
            title: `Clean ${meta.label}`,
            message: meta.confirm,
            okText: 'Clean',
        });
        if (!ok) return;
        const task = startTask(`Cleaning ${meta.label}`, 'Reclaiming space…');
        try {
            const data = await post('/api/disk-clean/caches/clean', { areas: [area] });
            const freed = Number(data.total_bytes || 0);
            task?.finish('done', { percent: 100, detail: fmtBytes(freed) });
            toast(`${meta.label} cleaned${freed ? ` · ${fmtBytes(freed)} freed` : ''}`, 'success');
            state.suggestions = null;
            await loadCaches();
        } catch (error) {
            task?.finish('failed', { detail: loadErrorText(error) });
            toast(loadErrorText(error), 'error');
        }
    }

    async function pruneDocker(target) {
        const images = target === 'images';
        const ok = await confirmDialog({
            title: images ? 'Prune Docker images' : 'Prune Docker volumes',
            message: images
                ? 'Remove every image not referenced by a container? Running containers stay untouched.'
                : 'Remove every volume not referenced by a container? Data in those volumes is lost.',
            okText: 'Prune',
        });
        if (!ok) return;
        const task = startTask(images ? 'Pruning Docker images' : 'Pruning Docker volumes', 'Talking to the engine…');
        try {
            const data = await post(images ? '/api/images/prune' : '/api/volumes/prune', {});
            const freed = Number(data.freed_bytes || 0);
            task?.finish('done', { percent: 100, detail: fmtBytes(freed) });
            toast(data.message || `Pruned · ${fmtBytes(freed)} freed`, 'success');
            await loadCaches();
        } catch (error) {
            task?.finish('failed', { detail: loadErrorText(error) });
            toast(loadErrorText(error), 'error');
        }
    }

    // ── events ─────────────────────────────────────────────────────────────
    async function onRootClick(event) {
        const trigger = event.target.closest('[data-action]');
        if (!trigger || trigger.disabled) return;
        const action = trigger.dataset.action;
        if (action === 'view') {
            setView(trigger.dataset.view);
        } else if (action === 'analyze-browse') {
            await browseFolder();
        } else if (action === 'analyze-scan') {
            const input = refs.host.querySelector('[data-input="scan-path"]');
            await runScan((input?.value || state.scan.path).trim(), { mode: state.scan.mode });
        } else if (action === 'analyze-cancel') {
            await cancelScan();
        } else if (action === 'analyze-mode') {
            const mode = trigger.dataset.mode;
            if (mode === state.scan.mode) return;
            state.scan.mode = mode;
            if (mode === 'files') state.scan.view = 'list';
            state.scan.tree = null;
            state.scan.files = null;
            state.scan.resultPath = '';
            if (state.view === 'analyze') renderView();
            await runScan(state.scan.path, { mode });
        } else if (action === 'analyze-view') {
            state.scan.view = trigger.dataset.aview;
            refreshResults();
        } else if (action === 'sort') {
            state.scan.sort = state.scan.sort === trigger.dataset.sort
                ? (trigger.dataset.sort === 'size' ? 'name' : 'size')
                : trigger.dataset.sort;
            refreshResults();
        } else if (action === 'crumb') {
            const crumb = state.scan.crumbs[Number(trigger.dataset.index)];
            if (crumb) await scanTo(crumb.path);
        } else if (action === 'drill') {
            await scanTo(trigger.dataset.path);
        } else if (action === 'row-trash') {
            await confirmDeleteMany([trigger.dataset.path], [trigger.dataset.name], 'trash', 'analyze');
        } else if (action === 'row-delete') {
            await confirmDeleteMany([trigger.dataset.path], [trigger.dataset.name], 'permanent', 'analyze');
        } else if (action === 'cleanup-refresh') {
            await loadSuggestions(true);
        } else if (action === 'cleanup-filter') {
            state.cleanup.filter = trigger.dataset.filter;
            renderView();
            syncSelection();
        } else if (action === 'select-safe') {
            toggleSelectSafe(!!trigger.checked);
        } else if (action === 'sug-delete') {
            await confirmDeleteMany([trigger.dataset.path], [trigger.dataset.name], 'permanent', 'cleanup');
        } else if (action === 'bulk-delete') {
            await deleteSelected();
        } else if (action === 'vacuum') {
            await vacuum(Number(trigger.dataset.days) || 7);
        } else if (action === 'cache-clean') {
            await cleanCache(trigger.dataset.area);
        } else if (action === 'docker-prune') {
            await pruneDocker(trigger.dataset.target);
        } else if (action === 'activity-refresh') {
            await loadActivity();
        } else if (action === 'logs-open') {
            try { ctx.logs?.open?.({ app: 'pkg:ethos-cleaner' }); } catch (_) { /* older core */ }
        }
    }

    function onRootChange(event) {
        const target = event.target;
        if (target.matches('[data-input="scan-depth"]')) {
            state.scan.depth = Number(target.value) || 2;
        } else if (target.matches('[data-select-path]')) {
            if (target.checked) state.cleanup.selected.add(target.dataset.selectPath);
            else state.cleanup.selected.delete(target.dataset.selectPath);
            syncSelection();
        }
    }

    function onRootInput(event) {
        const target = event.target;
        if (target.matches('[data-input="scan-path"]')) {
            state.scan.path = target.value;
        } else if (target.matches('[data-input="scan-filter"]')) {
            state.scan.filter = target.value;
            refreshResults();
        }
    }

    function onRootKeydown(event) {
        const target = event.target;
        if (event.key === 'Enter' && target.matches('[data-input="scan-path"]')) {
            event.preventDefault();
            runScan(target.value.trim(), { mode: state.scan.mode });
        } else if ((event.key === 'Enter' || event.key === ' ')
            && target.matches('[data-action="drill"]') && target.tagName !== 'BUTTON') {
            // Treemap cells are focusable <g role="button">, not buttons.
            event.preventDefault();
            scanTo(target.dataset.path);
        }
    }

    root.addEventListener('click', onRootClick);
    root.addEventListener('change', onRootChange);
    root.addEventListener('input', onRootInput);
    root.addEventListener('keydown', onRootKeydown);

    // ── boot ───────────────────────────────────────────────────────────────
    ctx.log('info', 'Disk Cleaner opened');
    setPill('Loading…', 'starting');
    setView('overview');
    syncSelection();
}
