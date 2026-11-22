// ─────────────────────────────────────────────────────────────────────────────
// Video Station — EthOS NAS media package (cinema layout, 2.0)
//
// Documented media exception to the shared package shell: a full-bleed top nav,
// backdrop hero, poster shelves and a bottom tab bar on phones. Settings and
// popovers keep the EthOS panel/tag/token vocabulary; both themes are supported.
//
// The /api/videos/* API stays in the EthOS core (the Android app uses it).
// This module owns the desktop UI only and must stay self-contained (the native
// loader imports it as a blob, so relative imports are unavailable).
// ─────────────────────────────────────────────────────────────────────────────

const ICON = {
    play: '<path d="M8 5.2 19 12 8 18.8V5.2Z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    back: '<path d="m15 5-7 7 7 7"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v4h-4"/>',
    folder: '<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h8.5A1.5 1.5 0 0 1 20.5 10v7.5A1.5 1.5 0 0 1 19 19H4.5A1.5 1.5 0 0 1 3 17.5Z"/>',
    film: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M7.5 4.5v15M16.5 4.5v15M3 12h18"/>',
    tv: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="m8 3 4 3 4-3"/>',
    grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1"/>',
    list: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    volume: '<path d="M4 9.5h3.2L12 6v12l-4.8-3.5H4Z"/><path d="M15.5 9.2a4 4 0 0 1 0 5.6"/><path d="M18 6.8a7.5 7.5 0 0 1 0 10.4"/>',
    mute: '<path d="M4 9.5h3.2L12 6v12l-4.8-3.5H4Z"/><path d="m16 9 5 6M21 9l-5 6"/>',
    subtitles: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M6.5 14.5h5M13.5 14.5h4"/>',
    full: '<path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5"/>',
    pip: '<rect x="3" y="5" width="18" height="14" rx="2"/><rect x="12" y="11" width="7" height="6" rx="1"/>',
    stats: '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>',
    check: '<path d="m4.5 12.5 5 5 10-11"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/>',
    alert: '<path d="M12 4.5 2.8 20h18.4L12 4.5Z"/><path d="M12 10v4.5M12 17.2h.01"/>',
    engine: '<path d="M4 8h16v9H4zM7 8V5h10v3M8 17v3M16 17v3M2 12h2M20 12h2"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/>',
    download: '<path d="M12 4v10M8 10.5 12 15l4-4.5"/><path d="M5 19h14"/>',
};

function svg(name, size = 18) {
    const path = ICON[name];
    if (!path) return '';
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" `
        + `stroke="currentColor" stroke-width="1.8" stroke-linecap="round" `
        + `stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmtBytes(n) {
    const v = Number(n) || 0;
    if (v >= 1e12) return `${(v / 1e12).toFixed(2)} TB`;
    if (v >= 1e9) return `${(v / 1e9).toFixed(2)} GB`;
    if (v >= 1e6) return `${(v / 1e6).toFixed(0)} MB`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(0)} KB`;
    return `${v} B`;
}

function fmtTime(seconds) {
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
        : `${m}:${String(sec).padStart(2, '0')}`;
}

function pad2(n) { return String(n ?? 0).padStart(2, '0'); }
function pct(value, total) { return total > 0 ? Math.min(100, Math.max(0, (value / total) * 100)) : 0; }

function basename(path) {
    const parts = String(path || '').split('/').filter(Boolean);
    return parts[parts.length - 1] || '';
}

function dirname(path) {
    const parts = String(path || '').split('/').filter(Boolean);
    parts.pop();
    return '/' + parts.join('/');
}

function jwtPayload() {
    try {
        const tok = localStorage.getItem('token') || '';
        const part = tok.split('.')[1];
        if (!part) return {};
        return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    } catch {
        return {};
    }
}

// ── App ───────────────────────────────────────────────────────────────────────

export async function render(container, ctx) {
    const app = new VideoStation(container, ctx);
    await app.mount();
    return app;
}

class VideoStation {
    constructor(container, ctx) {
        this.container = container;
        this.ctx = ctx;
        this.root = null;
        this.main = null;
        this.view = null;
        this.abort = new AbortController();
        this.keyHandler = null;
        this.onScroll = null;
        this.player = null;
        this.searchTimer = null;
        this._hlsPromise = null;
        this.state = {
            cfg: { roots: [], options: {}, tmdb: {} },
            status: null,
            home: { continue_watching: [], recently_added: [] },
            resume: {},
            list: new Set(),
            shared: [],
            sharedVideos: [],
            sharedAt: 0,
            library: null,
            libraryAt: 0,
            // Offline download queue (shared with the /videos phone PWA).
            downloads: [],
            downloadsAt: 0,
            downloadTimer: null,
            downloadQuality: 'balanced',
            downloadQualities: [],
            selectMode: false,
            selected: new Set(),
            folder: null,
            roots: [],
            folders: [],
            total: 0,
            truncated: false,
            mode: 'home',
            path: null,
            show: null,
            detail: null,
            back: null,
            query: '',
            sort: 'name',
            quality: 'all',
            genre: 'all',
            layout: 'grid',
            visible: 300,
            folderLoading: false,
            errors: [],
            loading: true,
        };
        this.token = localStorage.getItem('token') || '';
        this.esc = (v) => ctx.escape.html(String(v ?? ''));
        this.attr = (v) => ctx.escape.attr(String(v ?? ''));
    }

    // ── Mount / shell ────────────────────────────────────────────────────────

    async mount() {
        this.container.style.padding = '0';
        this.container.style.overflow = 'hidden';
        this.container.innerHTML = this.shellHtml();
        this.root = this.container.querySelector('[data-testid="vd-root"]');
        this.main = this.container.querySelector('[data-testid="vd-main"]');
        this.view = this.container.querySelector('[data-testid="vd-view"]');
        this.bind();
        try {
            this.ctx.windows.registerCloseGuard(this.ctx.pkg.id, () => {
                this.destroy();
                return true;
            });
        } catch { /* older core without close guards */ }
        await this.loadBootstrap();
        this.state.loading = false;
        this.renderView();
        this.ctx.log('info', 'Video Station opened');
    }

    destroy() {
        this.abort.abort();
        this.stopPlayer({ quiet: true });
        if (this.state.downloadTimer) { clearInterval(this.state.downloadTimer); this.state.downloadTimer = null; }
        if (this.keyHandler) document.removeEventListener('keydown', this.keyHandler);
        if (this.onScroll && this.main) this.main.removeEventListener('scroll', this.onScroll);
        if (this.pageHide) window.removeEventListener('pagehide', this.pageHide);
        try { this.ctx.windows.registerCloseGuard(this.ctx.pkg.id, () => true); } catch { /* ignore */ }
    }

    shellHtml() {
        return `<style>${this.css()}</style>
        <div class="vd-root" data-testid="vd-root">
            <header class="vd-top" data-testid="vd-top">
                <button class="vd-brand" type="button" data-action="nav" data-mode="home" aria-label="Video Station home">
                    <span class="vd-brand-mark">${svg('play', 18)}</span>
                    <span class="vd-brand-text"><strong>VIDEO STATION</strong><small>EthOS media</small></span>
                </button>
                <nav class="vd-links" aria-label="Sections">
                    <button type="button" class="vd-link" data-action="nav" data-mode="home" data-testid="vd-nav-home">Home</button>
                    <button type="button" class="vd-link" data-action="nav" data-mode="movies" data-testid="vd-nav-movies">Movies</button>
                    <button type="button" class="vd-link" data-action="nav" data-mode="series" data-testid="vd-nav-series">Series</button>
                    <button type="button" class="vd-link" data-action="nav" data-mode="library" data-testid="vd-nav-library">Library</button>
                    <button type="button" class="vd-link" data-action="nav" data-mode="mylist" data-testid="vd-nav-list">My List</button>
                    <button type="button" class="vd-link" data-action="nav" data-mode="shared" data-testid="vd-nav-shared">Shared</button>
                    <button type="button" class="vd-link" data-action="nav" data-mode="downloads" data-testid="vd-nav-downloads">Downloads</button>
                </nav>
                <div class="vd-actions">
                    <button type="button" class="vd-icon-btn" data-action="nav" data-mode="downloads" title="Downloads" data-testid="vd-downloads-open">${svg('download')}</button>
                    <button type="button" class="vd-icon-btn" data-action="search" title="Search (Ctrl+K)" data-testid="vd-search-open">${svg('search')}</button>
                    <span class="vd-engine" data-testid="vd-engine-chip" title="Media engine"></span>
                    <button type="button" class="vd-icon-btn" data-action="nav" data-mode="settings" title="Settings" data-testid="vd-settings-open">${svg('settings')}</button>
                </div>
            </header>
            <main class="vd-main" data-testid="vd-main">
                <div class="vd-view" data-testid="vd-view"></div>
            </main>
            <nav class="vd-bottom" aria-label="Sections">
                <button type="button" data-action="nav" data-mode="home" data-testid="vd-bottom-home">${svg('play', 20)}<span>Home</span></button>
                <button type="button" data-action="nav" data-mode="movies" data-testid="vd-bottom-movies">${svg('film', 20)}<span>Movies</span></button>
                <button type="button" data-action="nav" data-mode="series" data-testid="vd-bottom-series">${svg('tv', 20)}<span>Series</span></button>
                <button type="button" data-action="nav" data-mode="library" data-testid="vd-bottom-library">${svg('folder', 20)}<span>Library</span></button>
                <button type="button" data-action="nav" data-mode="shared" data-testid="vd-bottom-shared">${svg('share', 20)}<span>Shared</span></button>
                <button type="button" data-action="nav" data-mode="settings" data-testid="vd-bottom-settings">${svg('settings', 20)}<span>More</span></button>
            </nav>
        </div>`;
    }

    css() {
        return `
        .vd-root{color-scheme:light;--vd-bg:var(--surface-0,#f7f6f2);--vd-soft:var(--surface-1,#eeebe5);
            --vd-panel:var(--surface-1,#f1eee8);--vd-solid:var(--surface-0,#fff);
            --vd-text:var(--text-1,#171717);--vd-muted:var(--text-2,#5c5c5c);--vd-faint:var(--text-3,#8a8a8a);
            --vd-border:var(--border,rgba(0,0,0,.12));--vd-accent:var(--ui-accent,#2563eb);
            --vd-gold:#c98f2b;--vd-gold-soft:rgba(201,143,43,.14);--vd-ok:var(--ui-ok,#15803d);
            --vd-bad:var(--ui-bad,#b91c1c);--vd-warn:var(--ui-warn,#b45309);
            --vd-shadow:0 20px 60px rgba(0,0,0,.18);--vd-radius:16px;
            position:absolute;inset:0;overflow:hidden;background:var(--vd-bg);color:var(--vd-text);
            font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;}
        :root.dark .vd-root{color-scheme:dark;--vd-bg:#0b0d10;--vd-soft:#12151a;--vd-panel:rgba(255,255,255,.06);
            --vd-solid:#151820;--vd-text:#f2f0ea;--vd-muted:#a6a6a6;--vd-faint:#7b7b7b;
            --vd-border:rgba(255,255,255,.13);--vd-gold:#e7b35a;--vd-gold-soft:rgba(231,179,90,.16);
            --vd-shadow:0 24px 70px rgba(0,0,0,.55);}
        .vd-root *{box-sizing:border-box}
        .vd-root button{font:inherit;color:inherit}
        .vd-root img{display:block}
        .vd-root :focus-visible{outline:2px solid var(--vd-accent);outline-offset:2px}
        .vd-main{position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;scrollbar-width:thin}
        .vd-main::-webkit-scrollbar{width:10px}.vd-main::-webkit-scrollbar-thumb{background:var(--vd-border);border-radius:8px}
        .vd-view{min-height:100%}

        /* top nav */
        .vd-top{position:absolute;top:0;left:0;right:0;z-index:60;display:flex;align-items:center;gap:26px;
            padding:14px clamp(16px,4vw,54px);color:#fff;background:linear-gradient(180deg,rgba(0,0,0,.72),rgba(0,0,0,0));
            transition:background .3s,color .3s,border-color .3s;border-bottom:1px solid transparent}
        .vd-top.is-solid{background:var(--vd-bg);color:var(--vd-text);border-bottom-color:var(--vd-border)}
        .vd-brand{display:flex;align-items:center;gap:10px;border:0;background:none;cursor:pointer;padding:0;text-align:left}
        .vd-brand-mark{display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:var(--vd-gold);color:#16110a;
            box-shadow:0 0 0 5px var(--vd-gold-soft)}
        .vd-brand-text{display:flex;flex-direction:column;line-height:1.05}
        .vd-brand-text strong{font-size:13px;letter-spacing:3px;font-weight:800;white-space:nowrap}
        .vd-brand-text small{font-size:9px;letter-spacing:2px;opacity:.6;text-transform:uppercase}
        .vd-links{display:flex;align-items:center;gap:4px;flex:1;min-width:0}
        .vd-link{border:0;background:none;cursor:pointer;padding:8px 11px;border-radius:9px;font-size:13px;font-weight:600;
            color:currentColor;opacity:.66;white-space:nowrap;transition:opacity .15s,background .15s}
        .vd-link:hover{opacity:1;background:rgba(128,128,128,.16)}
        .vd-link.is-active{opacity:1;background:var(--vd-gold-soft);color:var(--vd-gold)}
        .vd-top.is-solid .vd-link.is-active{color:var(--vd-gold)}
        .vd-actions{display:flex;align-items:center;gap:8px;margin-left:auto}
        .vd-icon-btn{width:38px;height:38px;display:grid;place-items:center;border:0;border-radius:50%;background:rgba(128,128,128,.16);
            cursor:pointer;transition:background .15s,transform .15s}
        .vd-icon-btn:hover{background:rgba(128,128,128,.3);transform:scale(1.05)}
        .vd-engine{font-size:10px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;padding:6px 9px;border-radius:999px;
            background:rgba(128,128,128,.16);white-space:nowrap}
        .vd-engine[data-tone="ok"]{background:var(--vd-gold-soft);color:var(--vd-gold)}
        .vd-engine[data-tone="warn"]{background:rgba(180,83,9,.16);color:var(--vd-warn)}
        .vd-engine[data-tone="bad"]{background:rgba(185,28,28,.14);color:var(--vd-bad)}

        /* hero */
        .vd-hero{position:relative;min-height:min(62vh,640px);display:flex;align-items:flex-end;overflow:hidden;background:#08090c;color:#fff}
        .vd-hero-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:brightness(.72) saturate(1.04);transform:scale(1.02)}
        .vd-hero::after{content:"";position:absolute;inset:0;pointer-events:none;
            background:linear-gradient(180deg,rgba(8,9,12,.5) 0%,rgba(8,9,12,.05) 35%,rgba(8,9,12,.72) 75%,var(--vd-bg) 100%),
                       linear-gradient(90deg,rgba(8,9,12,.82) 0%,rgba(8,9,12,.28) 48%,rgba(8,9,12,0) 78%)}
        .vd-hero-body{position:relative;z-index:2;max-width:760px;padding:120px clamp(18px,4vw,54px) 64px;display:flex;flex-direction:column;gap:13px}
        .vd-eyebrow{display:flex;align-items:center;gap:9px;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:var(--vd-gold);font-weight:800}
        .vd-hero h1{margin:0;font-size:clamp(30px,4.8vw,60px);line-height:1.02;font-weight:850;letter-spacing:-.03em;text-shadow:0 4px 26px rgba(0,0,0,.55)}
        .vd-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12.5px;font-weight:650;color:rgba(255,255,255,.82)}
        .vd-meta .vd-dot{opacity:.4}
        .vd-overview{margin:0;max-width:620px;font-size:14px;line-height:1.55;color:rgba(255,255,255,.82);
            display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
        .vd-hero-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:6px}
        .vd-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:1px solid var(--vd-border);background:var(--vd-panel);
            color:var(--vd-text);padding:10px 16px;border-radius:10px;font-size:12.5px;font-weight:700;cursor:pointer;
            transition:transform .15s,background .15s,border-color .15s;text-decoration:none}
        .vd-btn:hover{transform:translateY(-1px);border-color:var(--vd-accent)}
        .vd-btn.primary{background:var(--vd-gold);border-color:var(--vd-gold);color:#17110a}
        .vd-btn.danger{color:var(--vd-bad);border-color:rgba(185,28,28,.35)}
        .vd-btn.small{padding:5px 9px;font-size:11px;border-radius:8px}
        .vd-btn:disabled{opacity:.45;cursor:not-allowed;transform:none}
        .vd-hero .vd-btn:not(.primary){background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.22);color:#fff}

        /* stats */
        .vd-stats{position:relative;z-index:3;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;
            margin:-34px clamp(18px,4vw,54px) 0}
        .vd-stat{background:var(--vd-solid);border:1px solid var(--vd-border);border-radius:14px;padding:13px 15px;box-shadow:var(--vd-shadow)}
        .vd-stat b{display:block;font-size:22px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
        .vd-stat span{display:block;margin-top:3px;font-size:9px;letter-spacing:1.4px;text-transform:uppercase;color:var(--vd-faint);font-weight:700}

        /* shelves */
        .vd-shelf{margin-top:30px}
        .vd-shelf-head{display:flex;align-items:baseline;gap:12px;padding:0 clamp(18px,4vw,54px);margin-bottom:10px}
        .vd-shelf-head h2{margin:0;font-size:17px;font-weight:800;letter-spacing:-.01em}
        .vd-shelf-head span{margin-left:auto;font-size:11px;color:var(--vd-faint)}
        .vd-row{display:flex;gap:14px;overflow-x:auto;padding:4px clamp(18px,4vw,54px) 12px;scroll-snap-type:x proximity;scrollbar-width:none}
        .vd-row::-webkit-scrollbar{display:none}
        .vd-card{display:flex;flex-direction:column;align-items:stretch;flex:0 0 clamp(138px,15vw,188px);scroll-snap-align:start;border:0;background:none;padding:0;text-align:left;cursor:pointer;min-width:0}
        .vd-card-art{position:relative;display:block;width:100%;aspect-ratio:2/3;border-radius:13px;overflow:hidden;background:var(--vd-soft);box-shadow:0 10px 28px rgba(0,0,0,.18);
            transition:transform .18s,box-shadow .18s}
        .vd-card-art img{width:100%;height:100%;object-fit:cover}
        .vd-card:hover .vd-card-art{transform:translateY(-3px) scale(1.02);box-shadow:0 18px 38px rgba(0,0,0,.3)}
        .vd-card-title{display:block;margin-top:8px;font-size:12.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .vd-card-sub{display:block;margin-top:2px;font-size:11px;color:var(--vd-faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .vd-card-play{position:absolute;right:8px;bottom:8px;width:32px;height:32px;border-radius:50%;background:rgba(8,9,12,.7);
            color:#fff;display:grid;place-items:center;opacity:0;transition:opacity .15s;backdrop-filter:blur(4px)}
        .vd-card:hover .vd-card-play{opacity:1}
        .vd-card-badge{position:absolute;top:8px;left:8px;max-width:calc(100% - 16px);padding:3px 7px;border-radius:6px;background:rgba(8,9,12,.76);
            color:#fff;font-size:9.5px;font-weight:800;letter-spacing:.8px;text-transform:uppercase}
        /* multi-select */
        .vd-root.is-selecting .vd-card-art::after{content:'';position:absolute;top:8px;right:8px;width:24px;height:24px;border-radius:50%;
            border:2px solid rgba(255,255,255,.85);background:rgba(8,9,12,.55);display:grid;place-items:center;font-size:13px;font-weight:800;color:#fff;z-index:3}
        .vd-root.is-selecting .vd-card.is-selected .vd-card-art{outline:2px solid var(--vd-gold);outline-offset:2px}
        .vd-root.is-selecting .vd-card.is-selected .vd-card-art::after{content:'✓';background:var(--vd-gold);border-color:var(--vd-gold);color:#17110a}
        .vd-select-bar{position:absolute;left:clamp(18px,4vw,54px);right:clamp(18px,4vw,54px);bottom:18px;z-index:55;display:flex;align-items:center;
            gap:8px;padding:10px 14px;border:1px solid var(--vd-border);border-radius:14px;background:var(--vd-solid);
            box-shadow:0 14px 44px rgba(0,0,0,.4);font-size:12.5px}
        .vd-select-bar>span{margin-right:auto;font-weight:700}
        .vd-progress{position:absolute;left:0;right:0;bottom:0;height:4px;background:rgba(255,255,255,.25)}
        .vd-progress i{display:block;height:100%;background:var(--vd-gold)}

        /* page + toolbar */
        .vd-page{padding:104px clamp(18px,4vw,54px) 70px;min-height:100vh}
        .vd-page-head{display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap;margin-bottom:16px}
        .vd-page-head h1{margin:0;font-size:clamp(26px,3.4vw,38px);font-weight:850;letter-spacing:-.03em}
        .vd-page-head p{margin:4px 0 0;font-size:12.5px;color:var(--vd-muted)}
        .vd-page-head .vd-grow{flex:1}
        .vd-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 18px}
        .vd-input,.vd-select{background:var(--vd-solid);border:1px solid var(--vd-border);border-radius:10px;padding:9px 11px;
            font-size:12.5px;color:var(--vd-text);min-height:38px}
        .vd-input:focus,.vd-select:focus{outline:none;border-color:var(--vd-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--vd-accent) 20%,transparent)}
        .vd-search-input{flex:1;min-width:180px}
        .vd-spacer{flex:1}
        .vd-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(146px,1fr));gap:24px 14px}
        .vd-grid .vd-card{width:auto}
        .vd-empty{border:1px dashed var(--vd-border);border-radius:var(--vd-radius);padding:46px 24px;text-align:center;color:var(--vd-muted);font-size:13px}
        .vd-empty b{display:block;color:var(--vd-text);font-size:15px;margin-bottom:5px}
        .vd-error{border:1px solid rgba(185,28,28,.35);background:rgba(185,28,28,.08);color:var(--vd-bad);padding:12px 14px;border-radius:11px;font-size:12px;margin-bottom:14px}

        /* table */
        .vd-table{width:100%;border-collapse:collapse;background:var(--vd-solid);border:1px solid var(--vd-border);border-radius:14px;overflow:hidden}
        .vd-table th{font-size:9px;letter-spacing:1.2px;text-transform:uppercase;color:var(--vd-faint);text-align:left;padding:10px 12px;border-bottom:1px solid var(--vd-border);font-weight:800}
        .vd-table td{padding:8px 12px;border-bottom:1px solid var(--vd-border);font-size:11.5px;vertical-align:middle}
        .vd-table tr:last-child td{border-bottom:0}
        .vd-table tr:hover td{background:var(--vd-soft)}
        .vd-table .vd-thumb{width:64px;height:36px;object-fit:cover;border-radius:6px;background:#000}
        .vd-table .vd-title{font-weight:700;font-size:12px}
        .vd-table .vd-path{font-family:ui-monospace,monospace;font-size:10.5px;color:var(--vd-faint);max-width:520px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .vd-table .vd-num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
        .vd-table .vd-acts{text-align:right;white-space:nowrap}

        /* folders + detail */
        .vd-folders{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px;margin-bottom:22px}
        .vd-folder{display:flex;align-items:center;gap:10px;border:1px solid var(--vd-border);background:var(--vd-solid);border-radius:12px;
            padding:12px 13px;cursor:pointer;text-align:left;min-width:0}
        .vd-folder:hover{border-color:var(--vd-gold)}
        .vd-folder span{font-size:12px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .vd-crumbs{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:11.5px;color:var(--vd-muted);margin-bottom:12px}
        .vd-crumbs button{border:0;background:none;padding:2px 3px;cursor:pointer;color:var(--vd-muted)}
        .vd-crumbs button:hover{color:var(--vd-text)}
        .vd-crumbs b{color:var(--vd-text)}
        .vd-detail-hero{position:relative;min-height:min(54vh,540px);display:flex;align-items:flex-end;color:#fff;background:#08090c}
        .vd-detail-hero .vd-hero-bg{filter:brightness(.62) saturate(1.02)}
        .vd-detail-hero::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(8,9,12,.58),rgba(8,9,12,.16) 35%,var(--vd-bg) 100%)}
        .vd-detail-body{position:relative;z-index:2;display:flex;gap:22px;align-items:flex-end;padding:120px clamp(18px,4vw,54px) 40px;width:100%}
        .vd-detail-poster{flex:0 0 150px;aspect-ratio:2/3;border-radius:13px;overflow:hidden;background:#000;box-shadow:var(--vd-shadow)}
        .vd-detail-poster img{width:100%;height:100%;object-fit:cover}
        .vd-detail-copy{min-width:0;flex:1;display:flex;flex-direction:column;gap:10px}
        .vd-detail-copy h1{margin:0;font-size:clamp(28px,4vw,50px);line-height:1.03;letter-spacing:-.03em;font-weight:850;text-shadow:0 3px 20px rgba(0,0,0,.5)}
        .vd-detail-copy .vd-overview{color:rgba(255,255,255,.86);-webkit-line-clamp:5}
        .vd-tags{display:flex;gap:6px;flex-wrap:wrap}
        .vd-tag{display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border-radius:999px;background:var(--vd-soft);border:1px solid var(--vd-border);
            font-size:10px;font-weight:750;letter-spacing:.4px;color:var(--vd-muted);white-space:nowrap}
        .vd-tag.ok{background:rgba(21,128,61,.12);border-color:rgba(21,128,61,.3);color:var(--vd-ok)}
        .vd-tag.warn{background:rgba(180,83,9,.1);border-color:rgba(180,83,9,.28);color:var(--vd-warn)}
        .vd-tag.bad{background:rgba(185,28,28,.1);border-color:rgba(185,28,28,.3);color:var(--vd-bad)}
        .vd-tag.gold{background:var(--vd-gold-soft);border-color:var(--vd-gold-soft);color:var(--vd-gold)}
        .vd-detail-extra{padding:20px clamp(18px,4vw,54px) 70px;display:grid;grid-template-columns:minmax(0,2fr) minmax(240px,1fr);gap:18px}
        .vd-panel{background:var(--vd-solid);border:1px solid var(--vd-border);border-radius:var(--vd-radius);padding:18px}
        .vd-panel h2{margin:0 0 12px;font-size:12px;text-transform:uppercase;letter-spacing:1.4px;color:var(--vd-faint);font-weight:800}
        .vd-panel p{margin:0 0 10px;font-size:12.5px;line-height:1.6;color:var(--vd-muted)}
        .vd-panel .vd-source{margin:0 0 12px;font-size:11px;letter-spacing:.3px;color:var(--vd-faint)}
        .vd-panel .vd-source a{color:var(--vd-accent);text-decoration:none}
        .vd-panel .vd-help{margin:8px 0 0;font-size:10.5px;line-height:1.55;color:var(--vd-faint)}
        .vd-panel .vd-help a{color:var(--vd-accent);text-decoration:none}
        .vd-kv{display:grid;grid-template-columns:auto 1fr;gap:7px 14px;font-size:11.5px}
        .vd-kv dt{color:var(--vd-faint)}
        .vd-kv dd{margin:0;text-align:right;font-variant-numeric:tabular-nums}

        /* settings */
        .vd-settings{max-width:980px;margin:0 auto;padding:104px clamp(18px,4vw,54px) 90px;display:flex;flex-direction:column;gap:14px}
        .vd-settings-head h1{margin:0;font-size:32px;font-weight:850;letter-spacing:-.03em}
        .vd-settings-head p{margin:5px 0 0;color:var(--vd-muted);font-size:12.5px}
        .vd-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .vd-field{display:flex;flex-direction:column;gap:6px;font-size:11px;font-weight:700;color:var(--vd-muted)}
        .vd-field.full{grid-column:1/-1}
        .vd-field label{letter-spacing:.6px;text-transform:uppercase;font-size:9.5px}
        .vd-check{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--vd-text)}
        .vd-check input{width:16px;height:16px;accent-color:var(--vd-gold)}
        .vd-actionsbar{display:flex;justify-content:flex-end;gap:8px;padding-top:14px;border-top:1px solid var(--vd-border);margin-top:6px}
        .vd-rootrow{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--vd-border);font-size:11.5px}
        .vd-rootrow:last-child{border-bottom:0}
        .vd-rootrow code{font-size:10.5px;color:var(--vd-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
        .vd-engine-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}
        .vd-engine-grid div{background:var(--vd-soft);border:1px solid var(--vd-border);border-radius:10px;padding:10px}
        .vd-engine-grid b{display:block;font-size:13px;letter-spacing:.2px}
        .vd-engine-grid span{display:block;margin-top:2px;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--vd-faint)}

        /* search overlay */
        .vd-searchbar{position:sticky;top:0;z-index:5;display:flex;gap:8px;align-items:center;padding:10px 0 14px;background:var(--vd-bg)}
        .vd-searchbar .vd-search-input{font-size:16px}
        .vd-recent{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:18px}
        .vd-recent button{border:1px solid var(--vd-border);background:var(--vd-solid);border-radius:999px;padding:6px 11px;font-size:11px;cursor:pointer}

        /* bottom nav */
        .vd-bottom{display:none}

        /* player */
        .vd-root.is-player .vd-top,.vd-root.is-player .vd-bottom{display:none}
        .vd-player{position:absolute;inset:0;background:#000;color:#fff;display:flex;flex-direction:column;overflow:hidden}
        .vd-player video{width:100%;height:100%;object-fit:contain;background:#000}
        .vd-player-ui{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:space-between;
            opacity:1;transition:opacity .25s;pointer-events:none}
        .vd-player-ui.hidden{opacity:0}
        .vd-player-ui > *{pointer-events:auto}
        .vd-player-top{display:flex;align-items:center;gap:10px;padding:14px 18px;background:linear-gradient(180deg,rgba(0,0,0,.72),transparent)}
        .vd-player-top .vd-title{font-size:13.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}
        .vd-player-top .vd-tag{color:#fff;background:rgba(255,255,255,.13);border-color:rgba(255,255,255,.2)}
        .vd-player-top .vd-tag.gold{color:var(--vd-gold);background:rgba(231,179,90,.16);border-color:rgba(231,179,90,.3)}
        .vd-player-center{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none}
        .vd-player-center button{pointer-events:auto;width:76px;height:76px;border-radius:50%;border:1px solid rgba(255,255,255,.28);
            background:rgba(0,0,0,.45);display:grid;place-items:center;color:#fff;cursor:pointer;backdrop-filter:blur(8px);opacity:0;transition:opacity .2s}
        .vd-player-center button.show{opacity:1}
        .vd-player-bottom{padding:16px 18px calc(18px + env(safe-area-inset-bottom));background:linear-gradient(transparent,rgba(0,0,0,.82) 38%)}
        .vd-seek-wrap{position:relative;height:22px;display:flex;align-items:center;margin-bottom:8px}
        .vd-seek-buffer{position:absolute;left:0;right:0;height:4px;border-radius:2px;background:rgba(255,255,255,.18);overflow:hidden;pointer-events:none}
        .vd-seek-buffer i{display:block;height:100%;background:rgba(255,255,255,.38)}
        .vd-seek{position:relative;width:100%;height:4px;margin:0;appearance:none;background:transparent;cursor:pointer;z-index:2}
        .vd-seek::-webkit-slider-runnable-track{height:4px;border-radius:2px;background:linear-gradient(90deg,var(--vd-gold) var(--vd-fill,0%),rgba(255,255,255,.18) var(--vd-fill,0%))}
        .vd-seek::-moz-range-track{height:4px;border-radius:2px;background:rgba(255,255,255,.18)}
        .vd-seek::-moz-range-progress{height:4px;border-radius:2px;background:var(--vd-gold)}
        .vd-seek::-webkit-slider-thumb{appearance:none;width:14px;height:14px;margin-top:-5px;border-radius:50%;background:var(--vd-gold);box-shadow:0 0 0 4px rgba(231,179,90,.18)}
        .vd-seek::-moz-range-thumb{width:14px;height:14px;border:0;border-radius:50%;background:var(--vd-gold)}
        .vd-player-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .vd-player-row .vd-time{font-size:11.5px;font-variant-numeric:tabular-nums;min-width:82px;color:rgba(255,255,255,.8)}
        .vd-player-btn{width:38px;height:38px;border-radius:50%;border:0;background:transparent;color:#fff;display:grid;place-items:center;cursor:pointer}
        .vd-player-btn:hover{background:rgba(255,255,255,.12)}
        .vd-player-btn.primary{background:var(--vd-gold);color:#17110a;width:42px;height:42px}
        .vd-player-row select{background:rgba(20,20,20,.7);border:1px solid rgba(255,255,255,.2);color:#fff;border-radius:8px;padding:7px 8px;font-size:11.5px;max-width:170px}
        .vd-player-row .vd-grow{flex:1}
        .vd-player-stats{position:absolute;right:18px;bottom:96px;z-index:5;background:rgba(6,8,12,.86);border:1px solid rgba(255,255,255,.16);
            border-radius:12px;padding:12px 14px;font-size:11px;line-height:1.6;min-width:230px;display:none;backdrop-filter:blur(10px)}
        .vd-player-stats.show{display:block}
        .vd-player-stats b{color:var(--vd-gold)}
        .vd-next{position:absolute;right:18px;bottom:110px;z-index:6;background:rgba(10,12,16,.92);border:1px solid rgba(255,255,255,.18);
            border-radius:14px;padding:14px;display:none;max-width:300px;box-shadow:var(--vd-shadow)}
        .vd-next.show{display:block}
        .vd-next p{margin:0 0 10px;font-size:11.5px;color:rgba(255,255,255,.72)}
        .vd-next strong{display:block;font-size:13px;margin-bottom:10px}

        /* responsive */
        @media (max-width:820px){
            .vd-top{padding:10px 14px;gap:10px}
            .vd-links{display:none}
            .vd-brand-text small{display:none}
            .vd-engine{display:none}
            .vd-main{padding-bottom:70px}
            .vd-hero{min-height:52vh}
            .vd-hero-body{padding:88px 18px 48px}
            .vd-hero h1{font-size:clamp(28px,8vw,40px)}
            .vd-overview{-webkit-line-clamp:3;font-size:13px}
            .vd-stats{grid-template-columns:1fr 1fr;margin:-22px 14px 0;gap:8px}
            .vd-stat{padding:10px 12px}
            .vd-stat b{font-size:18px}
            .vd-shelf{margin-top:22px}
            .vd-shelf-head,.vd-row{padding-left:14px;padding-right:14px}
            .vd-card{flex-basis:132px}
            .vd-page{padding:82px 14px 90px;min-height:calc(100vh - 60px)}
            .vd-grid{grid-template-columns:repeat(auto-fill,minmax(124px,1fr));gap:18px 10px}
            .vd-table .vd-thumb{width:52px;height:30px}
            .vd-table .vd-path{max-width:150px}
            .vd-table .vd-hide-mobile{display:none}
            .vd-detail-body{padding:92px 14px 26px;gap:14px;align-items:flex-end}
            .vd-detail-poster{flex-basis:104px}
            .vd-detail-copy h1{font-size:27px}
            .vd-detail-extra{grid-template-columns:1fr;padding:16px 14px 90px}
            .vd-settings{padding:84px 14px 96px}
            .vd-fields{grid-template-columns:1fr}
            .vd-engine-grid{grid-template-columns:1fr 1fr}
            .vd-bottom{display:flex;position:absolute;bottom:0;left:0;right:0;z-index:60;background:var(--vd-bg);
                border-top:1px solid var(--vd-border);padding:5px 6px calc(5px + env(safe-area-inset-bottom));justify-content:space-around}
            .vd-bottom button{border:0;background:none;color:var(--vd-muted);display:flex;flex-direction:column;align-items:center;gap:3px;
                padding:6px 10px;border-radius:10px;font-size:9.5px;font-weight:700;cursor:pointer;min-width:54px}
            .vd-bottom button.is-active{color:var(--vd-gold);background:var(--vd-gold-soft)}
            .vd-player-top{padding:10px 12px}
            .vd-player-top .vd-tag{display:none}
            .vd-player-bottom{padding:10px 12px calc(14px + env(safe-area-inset-bottom))}
            .vd-player-row{gap:4px}
            .vd-player-row select{max-width:105px;font-size:10.5px;padding:6px}
            .vd-player-btn{width:34px;height:34px}
            .vd-player-stats{right:10px;bottom:120px;left:10px;min-width:0}
            .vd-next{right:10px;left:10px;bottom:130px;max-width:none}
            .vd-search-input{font-size:16px}
        }
        @media (hover:none){
            .vd-card-play{opacity:1}
            .vd-card:hover .vd-card-art{transform:none}
        }
        @media (prefers-reduced-motion:reduce){
            .vd-root *{animation:none!important;transition:none!important}
        }`;
    }

    // ── Data ─────────────────────────────────────────────────────────────────

    async apiJson(path, options = {}) {
        const res = await this.ctx.apiFetch(path, { signal: this.abort.signal, ...options });
        if (!res.ok) {
            let detail = `HTTP ${res.status}`;
            try {
                const payload = await res.clone().json();
                detail = payload?.detail || payload?.error || detail;
                if (typeof detail !== 'string') detail = JSON.stringify(detail);
            } catch { /* non-JSON error */ }
            const err = new Error(detail);
            err.status = res.status;
            throw err;
        }
        return res.json();
    }

    apiPost(path, body) {
        return this.apiJson(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    }

    async loadBootstrap() {
        this.state.errors = [];
        try {
            const data = await this.apiJson('/api/videos/bootstrap?limit=12');
            const s = this.state;
            s.cfg = data.config || s.cfg;
            s.status = data.status || null;
            s.home = data.home || { continue_watching: [], recently_added: [] };
            s.resume = data.resume || {};
            s.list = new Set(data.list || []);
            s.roots = data.roots || [];
            s.folders = data.folders || [];
            s.total = data.total || 0;
            s.truncated = !!data.truncated;
            s.sort = s.cfg?.options?.sort || 'name';
            s.layout = s.cfg?.options?.view === 'list' ? 'list' : 'grid';
            this.loadShared();
            this.loadDownloadSettings();
            this.loadDownloads();
            this.updateChrome();
            this.migrateLocalList();
            // Load the full library in the background for Movies/Series/Search.
            this.ensureLibrary().then(() => {
                if (this.state.mode !== 'player') this.renderView();
            }).catch((err) => this.ctx.logger.warn('Library load failed', String(err)));
        } catch (err) {
            this.state.errors = [err.message || String(err)];
            this.state.loading = false;
            this.renderView();
        }
    }

    async loadShared(force = false) {
        const s = this.state;
        if (!force && s.sharedAt && Date.now() - s.sharedAt < 30_000) return;
        try {
            const data = await this.apiJson('/api/sharing/incoming?kind=path');
            s.shared = data.grants || [];
            // Pull one level from each shared folder so the Home tab can show
            // actual titles (not just a folder list). Deep folders stay
            // reachable through the Shared tab / folder shelf.
            const lists = await Promise.all(s.shared.slice(0, 8).map(async (grant) => {
                try {
                    const folder = await this.apiJson(`/api/videos/library?path=${encodeURIComponent(grant.resource)}`);
                    return (folder.videos || []).map((video) => ({
                        ...video,
                        sharedOwner: grant.owner,
                        sharedRoot: grant.resource,
                    }));
                } catch { return []; }
            }));
            const seen = new Set();
            s.sharedVideos = lists.flat().filter((video) => {
                if (seen.has(video.path)) return false;
                seen.add(video.path);
                return true;
            }).slice(0, 36);
            s.sharedAt = Date.now();
        } catch { /* older core or transient failure — keep the previous list */ }
        if (['home', 'shared', 'settings'].includes(s.mode)) this.renderView();
    }

    async ensureLibrary(force = false) {
        const s = this.state;
        if (!force && s.library && Date.now() - s.libraryAt < 30_000) return s.library;
        const data = await this.apiJson(`/api/videos/library${force ? '?refresh=1' : ''}`);
        s.library = data;
        s.libraryAt = Date.now();
        s.total = (data.videos || []).length;
        s.folders = data.folders || s.folders;
        s.truncated = !!data.truncated;
        return data;
    }

    async migrateLocalList() {
        try {
            const key = `ethos-vs-list:${jwtPayload().username || ''}`;
            const raw = localStorage.getItem(key);
            if (!raw) return;
            const paths = JSON.parse(raw);
            if (!Array.isArray(paths) || !paths.length) { localStorage.removeItem(key); return; }
            const missing = paths.filter((p) => !this.state.list.has(p)).slice(0, 200);
            for (const path of missing) {
                try {
                    await this.apiPost('/api/videos/list', { path, add: true });
                    this.state.list.add(path);
                } catch { /* old path may no longer exist */ }
            }
            localStorage.removeItem(key);
            this.ctx.notifications.toast(`My List moved to your account (${missing.length} titles)`, 'success');
            this.renderView();
        } catch { /* ignore migration problems */ }
    }

    // ── Chrome / navigation ──────────────────────────────────────────────────

    updateChrome() {
        if (!this.root) return;
        const s = this.state;
        const engine = this.root.querySelector('[data-testid="vd-engine-chip"]');
        if (engine) {
            const enc = s.status?.encoder;
            const label = enc === 'vaapi' ? 'VA-API' : enc === 'qsv' ? 'QuickSync'
                : enc === 'libx264' ? 'Software' : (s.status?.ffmpeg ? 'Software' : 'No ffmpeg');
            engine.textContent = label;
            engine.dataset.tone = enc === 'vaapi' || enc === 'qsv' ? 'ok' : s.status?.ffmpeg ? 'warn' : 'bad';
        }
        const active = s.mode === 'detail' ? (s.detail?.kind === 'episode' ? 'series' : 'movies') : s.mode;
        this.root.querySelectorAll('[data-action="nav"]').forEach((btn) => {
            const isNav = btn.classList.contains('vd-link') || btn.closest('.vd-bottom');
            if (!isNav) return;
            btn.classList.toggle('is-active', btn.dataset.mode === active);
        });
        this.root.classList.toggle('is-player', s.mode === 'player');
        const top = this.root.querySelector('[data-testid="vd-top"]');
        if (top) top.classList.toggle('is-solid', s.mode !== 'home' || (this.main?.scrollTop || 0) > 12);
    }

    navigate(mode, extra = {}) {
        if (this.state.mode === 'player') this.stopPlayer();
        // A view change always leaves multi-select (the bar belongs to a grid).
        this.state.selectMode = false;
        this.state.selected.clear();
        this.root?.classList.remove('is-selecting');
        Object.assign(this.state, {
            mode,
            path: extra.path ?? null,
            show: extra.show ?? null,
            detail: extra.detail ?? null,
            back: extra.back ?? this.state.back,
        });
        if (mode !== 'search') this.state.query = '';
        if (mode === 'shared') this.loadShared();
        this.syncDownloadPolling();
        if (mode === 'downloads') this.loadDownloads(true);
        this.main.scrollTop = 0;
        this.updateChrome();
        this.renderView();
    }

    goBack() {
        const back = this.state.back;
        if (!back) return this.navigate('home');
        this.state.back = null;
        this.navigate(back.mode, back);
    }

    // ── Rendering dispatcher ─────────────────────────────────────────────────

    renderView() {
        if (!this.view) return;
        const s = this.state;
        if (s.mode === 'player') return; // player renders its own layer
        if (s.loading) {
            this.view.innerHTML = this.skeletonHtml();
            return;
        }
        const errors = s.errors.length
            ? `<div class="vd-error">${s.errors.map((e) => this.esc(e)).join('<br>')}</div>` : '';
        let html = '';
        switch (s.mode) {
            case 'movies': html = this.moviesHtml(); break;
            case 'series': html = s.show ? this.showDetailHtml(s.show) : this.seriesHtml(); break;
            case 'library': html = this.libraryHtml(); break;
            case 'mylist': html = this.myListHtml(); break;
            case 'shared': html = this.sharedHtml(); break;
            case 'search': html = this.searchHtml(); break;
            case 'downloads': html = this.downloadsHtml(); break;
            case 'settings': html = this.settingsHtml(); break;
            case 'detail': html = this.detailHtml(); break;
            default: html = this.homeHtml();
        }
        this.view.innerHTML = errors + html;
        this.updateChrome();
        this.paintSelection();
        if (s.mode === 'search') {
            requestAnimationFrame(() => this.view.querySelector('[data-role="search-input"]')?.focus());
        }
    }

    skeletonHtml() {
        return `<div class="vd-page"><div class="vd-empty"><b>Loading your library…</b>Reading folders and media metadata.</div></div>`;
    }

    // ── Home ─────────────────────────────────────────────────────────────────

    homeHtml() {
        const s = this.state;
        const cw = s.home.continue_watching || [];
        const recent = s.home.recently_added || [];
        const library = s.library?.videos || [];
        const movies = library.filter((v) => v.kind !== 'episode');
        const shows = this.groupShows(library);
        const sharedVideos = s.sharedVideos || [];
        const sharedFolders = s.shared || [];
        const hero = cw[0] || recent[0] || movies[0] || library[0] || sharedVideos[0] || null;
        const continuePct = cw.length;
        const engine = s.status?.encoder === 'vaapi' ? 'VA-API' : s.status?.encoder === 'qsv' ? 'QuickSync'
            : s.status?.ffmpeg ? 'Software' : '—';
        const stats = `<div class="vd-stats">
            <div class="vd-stat"><b>${s.total || library.length || 0}</b><span>Titles</span></div>
            <div class="vd-stat"><b>${shows.length}</b><span>Series</span></div>
            <div class="vd-stat"><b>${continuePct}</b><span>Continue watching</span></div>
            <div class="vd-stat"><b>${this.esc(engine)}</b><span>Media engine</span></div>
        </div>`;
        if (!hero) {
            if (sharedVideos.length || sharedFolders.length) {
                return `<div class="vd-page" data-testid="vd-home-shared-only">
                    ${this.sharedFolderShelfHtml()}
                    ${this.shelfHtml('Shared with you', sharedVideos.slice(0, 18), 'shared')}
                    <div style="height:50px"></div>
                </div>`;
            }
            return `<div class="vd-page">
                <div class="vd-empty">
                    <b>Your cinema is empty</b>
                    Add a folder with videos in Settings, or pick one now.<br><br>
                    <button class="vd-btn primary" type="button" data-action="add-folder">${svg('plus')} Add a folder</button>
                </div>
            </div>`;
        }
        const genres = this.genreShelves(library);
        return `${this.heroHtml(hero, cw.length > 0)}
            ${stats}
            ${this.sharedFolderShelfHtml()}
            ${this.shelfHtml('Shared with you', sharedVideos.slice(0, 18), 'shared')}
            ${this.shelfHtml('Continue watching', cw, 'cw')}
            ${this.shelfHtml('Recently added', recent)}
            ${this.shelfHtml('Movies', this.sortItems(movies, 'date_desc').slice(0, 18))}
            ${shows.length ? `<section class="vd-shelf">
                <div class="vd-shelf-head"><h2>Series</h2><span>${shows.length} shows</span></div>
                <div class="vd-row">${shows.slice(0, 18).map((g) => this.showCardHtml(g)).join('')}</div>
            </section>` : ''}
            ${genres.map(([genre, items]) => this.shelfHtml(genre, items.slice(0, 18))).join('')}
            <div style="height:50px"></div>`;
    }

    heroHtml(item, resume) {
        const tm = item.tmdb || {};
        const title = this.displayTitle(item);
        const meta = [
            tm.rating != null ? `★ ${tm.rating}` : '',
            this.itemYear(item),
            item.quality,
            tm.runtime ? `${tm.runtime} min` : '',
            item.kind === 'episode' ? this.episodeLabel(item) : '',
        ].filter(Boolean);
        const overview = tm.overview || item.overview || '';
        return `<section class="vd-hero" data-testid="vd-hero">
            <img class="vd-hero-bg" src="${this.attr(this.artUrl(item, 'backdrop'))}" alt="" loading="eager" fetchpriority="high">
            <div class="vd-hero-body">
                <div class="vd-eyebrow"><span>Video Station</span><span>·</span><span>${this.esc(item.kind === 'episode' ? 'Series' : 'Feature')}</span></div>
                <h1>${this.esc(title)}</h1>
                ${meta.length ? `<div class="vd-meta">${meta.map((m, i) => `${i ? '<span class="vd-dot">·</span>' : ''}<span>${this.esc(m)}</span>`).join('')}</div>` : ''}
                ${overview ? `<p class="vd-overview">${this.esc(overview)}</p>` : ''}
                <div class="vd-hero-actions">
                    <button class="vd-btn primary" type="button" data-action="play" data-path="${this.attr(item.path)}" data-testid="vd-hero-play">${svg('play')} ${resume ? 'Resume' : 'Play'}</button>
                    <button class="vd-btn" type="button" data-action="details" data-path="${this.attr(item.path)}" data-testid="vd-hero-details">More info</button>
                </div>
            </div>
        </section>`;
    }

    shelfHtml(title, items, kind = '') {
        if (!items || !items.length) return '';
        return `<section class="vd-shelf">
            <div class="vd-shelf-head"><h2>${this.esc(title)}</h2><span>${items.length} titles</span></div>
            <div class="vd-row">${items.map((item) => this.cardHtml(item, kind)).join('')}</div>
        </section>`;
    }

    sharedFolderShelfHtml() {
        const grants = this.state.shared || [];
        if (!grants.length) return '';
        return `<section class="vd-shelf" data-testid="vd-home-shared-folders">
            <div class="vd-shelf-head"><h2>Shared folders</h2><span>${grants.length} folders</span></div>
            <div class="vd-row">${grants.slice(0, 12).map((grant) => `<button class="vd-card" type="button"
                data-action="open-shared" data-path="${this.attr(grant.resource)}" data-testid="vd-shared-folder-card">
                <span class="vd-card-art" style="display:flex;align-items:center;justify-content:center">${svg('folder', 44)}</span>
                <span class="vd-card-title">${this.esc(basename(grant.resource))}</span>
                <span class="vd-card-sub">Shared by ${this.esc(grant.owner)}</span>
            </button>`).join('')}</div>
        </section>`;
    }

    cardHtml(item, kind = '') {
        const tm = item.tmdb || {};
        const title = this.displayTitle(item);
        const sub = [item.sharedOwner ? `Shared by ${item.sharedOwner}` : '', this.itemYear(item), item.quality,
            item.kind === 'episode' ? this.episodeLabel(item) : '']
            .filter(Boolean).join(' · ');
        const resume = this.state.resume[item.path];
        const progress = resume && resume.duration ? pct(resume.time, resume.duration) : 0;
        return `<button class="vd-card" type="button" data-action="details" data-path="${this.attr(item.path)}"
            data-testid="vd-card" aria-label="${this.attr(title)}">
            <span class="vd-card-art">
                <img src="${this.attr(this.artUrl(item, 'poster'))}" alt="" loading="lazy" decoding="async">
                ${item.quality ? `<span class="vd-card-badge">${this.esc(item.quality)}</span>` : ''}
                <span class="vd-card-play">${svg('play', 16)}</span>
                ${progress > 0 ? `<span class="vd-progress"><i style="width:${progress.toFixed(1)}%"></i></span>` : ''}
            </span>
            <span class="vd-card-title">${this.esc(title)}</span>
            <span class="vd-card-sub">${this.esc(sub || tm.tagline || '')}</span>
        </button>`;
    }

    showCardHtml(group) {
        const item = group.poster || group.items[0];
        const sub = `${group.items.length} episodes`;
        const resume = this.state.resume[group.latest.path];
        const progress = resume && resume.duration ? pct(resume.time, resume.duration) : 0;
        return `<button class="vd-card" type="button" data-action="show" data-show="${this.attr(group.show)}"
            data-testid="vd-show-card" aria-label="${this.attr(group.show)}">
            <span class="vd-card-art">
                <img src="${this.attr(this.artUrl(item, 'poster'))}" alt="" loading="lazy" decoding="async">
                <span class="vd-card-play">${svg('play', 16)}</span>
                ${progress > 0 ? `<span class="vd-progress"><i style="width:${progress.toFixed(1)}%"></i></span>` : ''}
            </span>
            <span class="vd-card-title">${this.esc(group.show)}</span>
            <span class="vd-card-sub">${this.esc(sub)}</span>
        </button>`;
    }

    // ── Movies ───────────────────────────────────────────────────────────────

    moviesHtml() {
        const s = this.state;
        if (!s.library) return this.libraryLoadingHtml('Movies');
        const all = (s.library.videos || []).filter((v) => v.kind !== 'episode');
        const items = this.filterItems(all);
        return `<div class="vd-page" data-testid="vd-movies">
            <div class="vd-page-head">
                <div><h1>Movies</h1><p>${all.length} features in your library.</p></div>
                <div class="vd-grow"></div>
                ${this.toolbarHtml(items)}
            </div>
            ${this.collectionHtml(items, 'movie')}
        </div>`;
    }

    toolbarHtml(source) {
        const s = this.state;
        const genres = [...new Set(source.flatMap((v) => v.tmdb?.genres || []))].sort();
        const qualities = [...new Set(source.map((v) => v.quality).filter(Boolean))].sort();
        return `<div class="vd-toolbar">
            <select class="vd-select" data-action="sort" data-testid="vd-sort">
                ${[['name', 'Title'], ['date_desc', 'Recently added'], ['year_desc', 'Newest year'], ['rating_desc', 'Rating'], ['size_desc', 'Largest']]
                    .map(([v, l]) => `<option value="${v}" ${s.sort === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
            <select class="vd-select" data-action="quality" data-testid="vd-quality-filter">
                <option value="all">All quality</option>
                ${qualities.map((q) => `<option value="${this.attr(q)}" ${s.quality === q ? 'selected' : ''}>${this.esc(q)}</option>`).join('')}
            </select>
            <select class="vd-select" data-action="genre" data-testid="vd-genre-filter">
                <option value="all">All genres</option>
                ${genres.map((g) => `<option value="${this.attr(g)}" ${s.genre === g ? 'selected' : ''}>${this.esc(g)}</option>`).join('')}
            </select>
            <div class="vd-spacer"></div>
            ${s.layout === 'grid' ? `<button class="vd-btn small ${s.selectMode ? 'primary' : ''}" type="button" data-action="select-mode" data-testid="vd-select-mode">
                ${s.selectMode ? `${svg('check', 12)} Done` : `${svg('check', 12)} Select`}
            </button>` : ''}
            <button class="vd-icon-btn" type="button" data-action="layout" data-layout="grid" title="Grid" data-testid="vd-layout-grid">${svg('grid')}</button>
            <button class="vd-icon-btn" type="button" data-action="layout" data-layout="list" title="List" data-testid="vd-layout-list">${svg('list')}</button>
        </div>`;
    }

    filterItems(items) {
        const s = this.state;
        let out = items;
        if (s.quality !== 'all') out = out.filter((v) => v.quality === s.quality);
        if (s.genre !== 'all') out = out.filter((v) => (v.tmdb?.genres || []).includes(s.genre));
        if (s.query.trim()) {
            const q = s.query.trim().toLowerCase();
            out = out.filter((v) => this.searchText(v).includes(q));
        }
        return this.sortItems(out, s.sort);
    }

    sortItems(items, sort) {
        const out = [...items];
        const cmp = {
            name: (a, b) => this.displayTitle(a).localeCompare(this.displayTitle(b)),
            date_desc: (a, b) => (b.modified || 0) - (a.modified || 0),
            year_desc: (a, b) => (Number(this.itemYear(b)) || 0) - (Number(this.itemYear(a)) || 0),
            rating_desc: (a, b) => (b.tmdb?.rating || 0) - (a.tmdb?.rating || 0),
            size_desc: (a, b) => (b.size || 0) - (a.size || 0),
        }[sort] || ((a, b) => this.displayTitle(a).localeCompare(this.displayTitle(b)));
        return out.sort(cmp);
    }

    collectionHtml(items, kind) {
        const s = this.state;
        if (!items.length) return `<div class="vd-empty"><b>Nothing here yet</b>Try a different filter or add a folder.</div>`;
        const shown = items.slice(0, s.visible);
        const bar = this.selectBarHtml();
        if (s.layout === 'list') {
            return `<table class="vd-table" data-testid="vd-list">
                <thead><tr><th></th><th>Title</th><th class="vd-hide-mobile">Quality</th><th class="vd-hide-mobile">Added</th><th class="vd-num">Size</th><th></th></tr></thead>
                <tbody>${shown.map((item) => `<tr>
                    <td><img class="vd-thumb" src="${this.attr(this.artUrl(item, 'poster'))}" alt="" loading="lazy"></td>
                    <td><div class="vd-title">${this.esc(this.displayTitle(item))}</div><div class="vd-path">${this.esc(item.path)}</div></td>
                    <td class="vd-hide-mobile">${item.quality ? `<span class="vd-tag">${this.esc(item.quality)}</span>` : '—'}</td>
                    <td class="vd-hide-mobile">${this.esc(item.modified ? new Date(item.modified * 1000).toLocaleDateString() : '—')}</td>
                    <td class="vd-num">${this.esc(fmtBytes(item.size))}</td>
                    <td class="vd-acts"><button class="vd-btn small primary" type="button" data-action="play" data-path="${this.attr(item.path)}">${svg('play', 12)} Play</button></td>
                </tr>`).join('')}</tbody>
            </table>
            ${items.length > shown.length ? `<div style="text-align:center;margin-top:18px"><button class="vd-btn" type="button" data-action="more">Show more (${items.length - shown.length})</button></div>` : ''}
            ${bar}`;
        }
        return `<div class="vd-grid" data-testid="vd-grid">${shown.map((item) => this.cardHtml(item, kind)).join('')}</div>
            ${items.length > shown.length ? `<div style="text-align:center;margin-top:22px"><button class="vd-btn" type="button" data-action="more">Show more (${items.length - shown.length})</button></div>` : ''}
            ${bar}`;
    }

    // ── Multi-select: queue many films in the default version ───────────────

    selectBarHtml() {
        if (!this.state.selectMode) return '';
        const quality = this.state.downloadQuality || 'balanced';
        const label = (this.state.downloadQualities.find((q) => q.value === quality) || {}).label || quality;
        const count = this.state.selected.size;
        return `<div class="vd-select-bar" data-testid="vd-select-bar">
            <span data-role="select-count">${count} selected</span>
            <button class="vd-btn small" type="button" data-action="select-all">${this.allVisibleSelected() ? 'Clear all' : 'Select all'}</button>
            <button class="vd-btn primary small" type="button" data-action="download-selected" ${count ? '' : 'disabled'} data-testid="vd-download-selected">
                ${svg('download', 12)} Download · ${this.esc(label)}
            </button>
            <button class="vd-icon-btn" type="button" data-action="select-cancel" aria-label="Cancel selection">${svg('close', 14)}</button>
        </div>`;
    }

    toggleSelectMode(on) {
        this.state.selectMode = !!on;
        if (!this.state.selectMode) this.state.selected.clear();
        this.root.classList.toggle('is-selecting', this.state.selectMode);
        this.renderView();
    }

    paintSelection() {
        if (!this.root) return;
        this.root.classList.toggle('is-selecting', this.state.selectMode);
        this.root.querySelectorAll('.vd-card[data-path]').forEach((card) => {
            card.classList.toggle('is-selected', this.state.selected.has(card.dataset.path));
        });
    }

    toggleSelected(path, cardEl) {
        if (this.state.selected.has(path)) this.state.selected.delete(path);
        else this.state.selected.add(path);
        if (cardEl) cardEl.classList.toggle('is-selected', this.state.selected.has(path));
        const bar = this.view.querySelector('[data-testid="vd-select-bar"]');
        if (bar) {
            const count = bar.querySelector('[data-role="select-count"]');
            if (count) count.textContent = `${this.state.selected.size} selected`;
            const download = bar.querySelector('[data-action="download-selected"]');
            if (download) download.disabled = this.state.selected.size === 0;
            const all = bar.querySelector('[data-action="select-all"]');
            if (all) all.textContent = this.allVisibleSelected() ? 'Clear all' : 'Select all';
        }
    }

    visibleSelectable() {
        const seen = new Set();
        const out = [];
        this.view.querySelectorAll('.vd-card[data-path]').forEach((card) => {
            const path = card.dataset.path;
            if (!path || seen.has(path)) return;
            const item = this.findItem(path);
            if (!item) return;
            seen.add(path);
            out.push(item);
        });
        return out;
    }

    allVisibleSelected() {
        const items = this.visibleSelectable();
        return items.length > 0 && items.every((item) => this.state.selected.has(item.path));
    }

    selectAllVisible() {
        const items = this.visibleSelectable();
        if (this.allVisibleSelected()) this.state.selected.clear();
        else items.forEach((item) => this.state.selected.add(item.path));
        this.paintSelection();
        this.renderView();
    }

    async downloadSelected() {
        const quality = this.state.downloadQuality || 'balanced';
        const items = [...this.state.selected].map((path) => this.findItem(path)).filter(Boolean);
        if (!items.length) return;
        this.toggleSelectMode(false);
        let queued = 0;
        let failed = 0;
        for (const item of items) {
            try {
                await this.apiPost('/api/videos/exports', { path: item.path, q: quality, a: 0 });
                queued += 1;
            } catch (err) {
                failed += 1;
                this.ctx.logger.warn('Batch download failed', `${item.path}: ${err.message}`);
            }
        }
        await this.loadDownloads(true);
        const label = (this.state.downloadQualities.find((q) => q.value === quality) || {}).label || quality;
        this.ctx.notifications.toast(
            failed ? `${queued} queued · ${failed} failed` : `${queued} queued · ${label}`,
            failed ? 'warning' : 'success');
    }

    // ── Series ───────────────────────────────────────────────────────────────

    seriesHtml() {
        const s = this.state;
        if (!s.library) return this.libraryLoadingHtml('Series');
        const shows = this.groupShows(s.library.videos || []);
        const filtered = s.query.trim()
            ? shows.filter((g) => g.show.toLowerCase().includes(s.query.trim().toLowerCase()))
            : shows;
        return `<div class="vd-page" data-testid="vd-series">
            <div class="vd-page-head">
                <div><h1>Series</h1><p>${shows.length} shows · ${shows.reduce((n, g) => n + g.items.length, 0)} episodes.</p></div>
                <div class="vd-grow"></div>
                <button class="vd-btn" type="button" data-action="search">${svg('search')} Search</button>
            </div>
            ${filtered.length ? `<div class="vd-grid">${filtered.map((g) => this.showCardHtml(g)).join('')}</div>`
                : `<div class="vd-empty"><b>No series found</b>Episode files are grouped by their SxxEyy name or folder.</div>`}
        </div>`;
    }

    showDetailHtml(show) {
        const s = this.state;
        const group = this.groupShows(s.library?.videos || []).find((g) => g.show === show);
        if (!group) return `<div class="vd-page"><div class="vd-empty"><b>Series not found</b><button class="vd-btn" data-action="back">Back</button></div></div>`;
        const item = group.poster || group.items[0];
        const tm = item.tmdb || {};
        const seasons = [...new Set(group.items.map((v) => v.season ?? 0))].sort((a, b) => a - b);
        return `<div data-testid="vd-detail">
        <div class="vd-detail-hero">
            <img class="vd-hero-bg" src="${this.attr(this.artUrl(item, 'backdrop'))}" alt="">
            <div class="vd-detail-body">
                <div class="vd-detail-poster"><img src="${this.attr(this.artUrl(item, 'poster'))}" alt=""></div>
                <div class="vd-detail-copy">
                    <div class="vd-eyebrow"><span>Series</span><span>·</span><span>${seasons.length} seasons</span></div>
                    <h1>${this.esc(show)}</h1>
                    <div class="vd-tags">
                        ${tm.rating != null ? `<span class="vd-tag gold">★ ${this.esc(tm.rating)}</span>` : ''}
                        <span class="vd-tag">${group.items.length} episodes</span>
                        ${(tm.genres || []).slice(0, 4).map((g) => `<span class="vd-tag">${this.esc(g)}</span>`).join('')}
                    </div>
                    ${tm.overview ? `<p class="vd-overview">${this.esc(tm.overview)}</p>` : ''}
                    <div class="vd-hero-actions">
                        <button class="vd-btn primary" type="button" data-action="play-next" data-show="${this.attr(show)}">${svg('play')} Play next</button>
                        <button class="vd-btn" type="button" data-action="back">${svg('back')} Back</button>
                    </div>
                </div>
            </div>
        </div>
        <div class="vd-detail-extra" style="grid-template-columns:1fr">
            ${seasons.map((season) => {
                const eps = group.items.filter((v) => (v.season ?? 0) === season);
                return `<section class="vd-panel"><h2>Season ${this.esc(season || '—')}</h2>
                    <table class="vd-table"><thead><tr><th></th><th>Episode</th><th class="vd-num">Duration</th><th class="vd-num">Size</th><th></th></tr></thead><tbody>
                    ${eps.map((ep) => {
                        const r = s.resume[ep.path];
                        const p = r && r.duration ? pct(r.time, r.duration) : 0;
                        return `<tr>
                            <td><img class="vd-thumb" src="${this.attr(this.artUrl(ep, 'poster'))}" alt="" loading="lazy"></td>
                            <td><div class="vd-title">${this.esc(this.episodeLabel(ep))}${ep.title ? ` · ${this.esc(ep.title)}` : ''}</div>
                                ${p > 0 ? `<div class="vd-progress" style="position:static;margin-top:5px;width:120px;border-radius:3px"><i style="width:${p.toFixed(1)}%;background:var(--vd-gold)"></i></div>` : ''}</td>
                            <td class="vd-num">${this.esc(fmtTime(ep.tmdb?.runtime ? ep.tmdb.runtime * 60 : 0) || '—')}</td>
                            <td class="vd-num">${this.esc(fmtBytes(ep.size))}</td>
                            <td class="vd-acts"><button class="vd-btn small primary" type="button" data-action="play" data-path="${this.attr(ep.path)}">${svg('play', 12)} Play</button></td>
                        </tr>`;
                    }).join('')}</tbody></table></section>`;
            }).join('')}
        </div>
        </div>`;
    }

    // ── Library / folders ────────────────────────────────────────────────────

    libraryHtml() {
        const s = this.state;
        if (s.path) {
            if (!s.folder || s.folder.path !== s.path) {
                if (!s.folderLoading) {
                    s.folderLoading = true;
                    this.loadFolder(s.path);
                }
                return this.libraryLoadingHtml('Folder');
            }
            return this.folderHtml(s.folder);
        }
        if (!s.library) return this.libraryLoadingHtml('Library');
        const roots = s.roots || [];
        const folders = s.library.folders || s.folders || [];
        return `<div class="vd-page" data-testid="vd-library">
            <div class="vd-page-head">
                <div><h1>Library</h1><p>${s.total} videos · ${roots.length} roots${s.truncated ? ' · listing truncated at the safety cap' : ''}</p></div>
                <div class="vd-grow"></div>
                <button class="vd-btn" type="button" data-action="refresh">${svg('refresh')} Refresh</button>
                <button class="vd-btn primary" type="button" data-action="add-folder">${svg('plus')} Add folder</button>
            </div>
            ${roots.length ? `<section class="vd-panel" style="margin-bottom:16px"><h2>Roots</h2>
                ${roots.map((r) => `<div class="vd-rootrow"><code>${this.esc(r)}</code>
                    <button class="vd-btn small" type="button" data-action="open-folder" data-path="${this.attr(r)}">Open</button>
                </div>`).join('')}</section>` : ''}
            ${folders.length ? `<div class="vd-folders">${folders.map((f) => `<button class="vd-folder" type="button" data-action="open-folder" data-path="${this.attr(f.path)}">
                ${svg('folder', 20)}<span>${this.esc(f.name)}</span></button>`).join('')}</div>` : ''}
            <div class="vd-toolbar">${this.toolbarHtml(s.library.videos || [])}</div>
            ${this.collectionHtml(this.filterItems(s.library.videos || []), 'library')}
        </div>`;
    }

    async loadFolder(path) {
        try {
            const data = await this.apiJson(`/api/videos/library?path=${encodeURIComponent(path)}`);
            this.state.folder = data;
            this.state.errors = [];
            if (this.state.mode === 'library' && this.state.path === path) this.renderView();
        } catch (err) {
            this.state.errors = [err.message || String(err)];
            this.renderView();
        } finally {
            this.state.folderLoading = false;
        }
    }

    folderHtml(folder) {
        const s = this.state;
        const sharedGrant = (s.shared || []).find((g) => folder.path === g.resource || folder.path.startsWith(g.resource + '/'));
        return `<div class="vd-page" data-testid="vd-folder">
            <div class="vd-crumbs">
                <button type="button" data-action="nav" data-mode="library">Library</button>
                <span>/</span><b>${this.esc(basename(folder.path))}</b>
            </div>
            <div class="vd-page-head">
                <div><h1>${this.esc(basename(folder.path))}</h1><p>${(folder.videos || []).length} videos · ${(folder.folders || []).length} folders ${sharedGrant ? `<span class="vd-tag">Read-only · shared by ${this.esc(sharedGrant.owner)}</span>` : ''}</p></div>
                <div class="vd-grow"></div>
                <button class="vd-btn" type="button" data-action="back">${svg('back')} Back</button>
            </div>
            ${folder.folders?.length ? `<div class="vd-folders">${folder.folders.map((f) => `<button class="vd-folder" type="button" data-action="open-folder" data-path="${this.attr(f.path)}">
                ${svg('folder', 20)}<span>${this.esc(f.name)}</span></button>`).join('')}</div>` : ''}
            ${this.collectionHtml((folder.videos || []).map((v) => v), 'library')}
        </div>`;
    }

    // ── Shared with me ───────────────────────────────────────────────────────

    sharedHtml() {
        const grants = this.state.shared || [];
        return `<div class="vd-page" data-testid="vd-shared">
            <div class="vd-page-head"><div><h1>Shared with me</h1><p>Video folders other accounts made available to you — view-only.</p></div></div>
            ${grants.length ? `<section class="vd-panel"><h2>Folders</h2>
                ${grants.map((g) => `<div class="vd-rootrow"><code>${this.esc(g.resource)}</code>
                    <span class="vd-tag">${this.esc(g.owner)}</span>
                    <button class="vd-btn small" type="button" data-action="open-shared" data-path="${this.attr(g.resource)}">Open</button>
                </div>`).join('')}</section>`
                : `<div class="vd-empty"><b>Nothing shared with you</b>When another account shares a video folder, it appears here.</div>`}
        </div>`;
    }

    // ── My List / search ─────────────────────────────────────────────────────

    myListHtml() {
        const s = this.state;
        if (!s.library) return this.libraryLoadingHtml('My List');
        const videos = s.library.videos || [];
        const items = [...s.list].map((path) => videos.find((v) => v.path === path) || { path, name: basename(path), title: basename(path), kind: 'movie' });
        return `<div class="vd-page" data-testid="vd-mylist">
            <div class="vd-page-head"><div><h1>My List</h1><p>${items.length} saved titles · synced with your account.</p></div></div>
            ${items.length ? `<div class="vd-grid">${items.map((item) => this.cardHtml(item, 'mylist')).join('')}</div>`
                : `<div class="vd-empty"><b>Your list is empty</b>Open a title and choose “My List” to save it here.</div>`}
            ${this.selectBarHtml()}
        </div>`;
    }

    searchHtml() {
        const s = this.state;
        const q = s.query.trim();
        const source = s.library?.videos || [];
        const results = q ? source.filter((v) => this.searchText(v).includes(q.toLowerCase())).slice(0, 200) : [];
        const recent = this.recentSearches();
        return `<div class="vd-page" data-testid="vd-search">
            <div class="vd-page-head"><div><h1>Search</h1><p>Find a movie, series or episode across the whole library.</p></div></div>
            <div class="vd-searchbar">
                <input class="vd-input vd-search-input" data-role="search-input" data-action="search-input"
                    placeholder="Title, show, genre…" value="${this.attr(s.query)}" autocomplete="off" data-testid="vd-search-input">
                <button class="vd-btn" type="button" data-action="back">${svg('back')} Close</button>
            </div>
            ${!q && recent.length ? `<div class="vd-recent">${recent.map((r) => `<button type="button" data-action="recent-search" data-q="${this.attr(r)}">${this.esc(r)}</button>`).join('')}</div>` : ''}
            ${q ? (results.length ? `<div class="vd-grid">${results.map((item) => this.cardHtml(item)).join('')}</div>`
                : `<div class="vd-empty"><b>No matches</b>Nothing in the library matches “${this.esc(q)}”.</div>`) : ''}
            ${this.selectBarHtml()}
        </div>`;
    }

    recentSearches() {
        try { return JSON.parse(localStorage.getItem('vd-recent-searches') || '[]').slice(0, 8); }
        catch { return []; }
    }

    rememberSearch(q) {
        if (!q) return;
        const list = [q, ...this.recentSearches().filter((x) => x !== q)].slice(0, 8);
        localStorage.setItem('vd-recent-searches', JSON.stringify(list));
    }

    // ── Detail ───────────────────────────────────────────────────────────────

    detailHtml() {
        const item = this.state.detail;
        if (!item) return `<div class="vd-page"><div class="vd-empty"><b>Title not found</b></div></div>`;
        const tm = item.tmdb || {};
        const resume = this.state.resume[item.path];
        const inList = this.state.list.has(item.path);
        const title = this.displayTitle(item);
        return `<div data-testid="vd-detail">
            <div class="vd-detail-hero">
                <img class="vd-hero-bg" src="${this.attr(this.artUrl(item, 'backdrop'))}" alt="">
                <div class="vd-detail-body">
                    <div class="vd-detail-poster"><img src="${this.attr(this.artUrl(item, 'poster'))}" alt=""></div>
                    <div class="vd-detail-copy">
                        <div class="vd-eyebrow"><span>${item.kind === 'episode' ? 'Episode' : 'Feature'}</span><span>·</span><span>${this.esc(item.quality || 'Video')}</span></div>
                        <h1>${this.esc(title)}</h1>
                        <div class="vd-tags">
                            ${tm.rating != null ? `<span class="vd-tag gold">★ ${this.esc(tm.rating)}</span>` : ''}
                            ${this.itemYear(item) ? `<span class="vd-tag">${this.esc(this.itemYear(item))}</span>` : ''}
                            ${item.quality ? `<span class="vd-tag">${this.esc(item.quality)}</span>` : ''}
                            ${item.kind === 'episode' ? `<span class="vd-tag">${this.esc(this.episodeLabel(item))}</span>` : ''}
                            ${item.sharedOwner ? `<span class="vd-tag">Read-only · shared by ${this.esc(item.sharedOwner)}</span>` : ''}
                            ${(tm.genres || []).slice(0, 5).map((g) => `<span class="vd-tag">${this.esc(g)}</span>`).join('')}
                        </div>
                        ${tm.overview ? `<p class="vd-overview">${this.esc(tm.overview)}</p>` : ''}
                        <div class="vd-hero-actions">
                            <button class="vd-btn primary" type="button" data-action="play" data-path="${this.attr(item.path)}">${svg('play')} ${resume ? `Resume ${fmtTime(resume.time)}` : 'Play'}</button>
                            ${item.sharedOwner ? '' : `<button class="vd-btn" type="button" data-action="toggle-list" data-path="${this.attr(item.path)}">${inList ? `${svg('check')} In My List` : `${svg('plus')} My List`}</button>`}
                            ${item.kind === 'episode' ? `<button class="vd-btn" type="button" data-action="show" data-show="${this.attr(item.show || '')}">${svg('tv')} Series</button>` : ''}
                            ${item.sharedOwner ? '' : `<select class="vd-select" data-role="download-version" title="Download version" data-testid="vd-download-version">
                                ${(this.state.downloadQualities.length ? this.state.downloadQualities : [
                                    { value: 'original', label: 'Original' },
                                    { value: 'balanced', label: '1080p' },
                                    { value: 'fast', label: '720p' },
                                    { value: 'tiny', label: '480p' },
                                ]).map((q) => `<option value="${this.attr(q.value)}" ${this.state.downloadQuality === q.value ? 'selected' : ''}>${this.esc(q.label)}</option>`).join('')}
                            </select>
                            <button class="vd-btn" type="button" data-action="download" data-path="${this.attr(item.path)}" data-testid="vd-download">${svg('download')} Download</button>`}
                            <button class="vd-btn" type="button" data-action="back">${svg('back')} Back</button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="vd-detail-extra">
                <section class="vd-panel"><h2>Details</h2>
                    <p>${tm.overview || 'No synopsis yet. Use “Fetch missing” in Settings → Metadata — keyless sources work without a TMDB key.'}</p>
                    ${tm.source_label ? `<p class="vd-source" data-testid="vd-metadata-source">Metadata: ${tm.source_url ? `<a href="${this.attr(tm.source_url)}" target="_blank" rel="noopener">${this.esc(tm.source_label)}</a>` : this.esc(tm.source_label)}</p>` : ''}
                    <dl class="vd-kv">
                        <dt>File</dt><dd class="vd-path">${this.esc(item.name || basename(item.path))}</dd>
                        <dt>Size</dt><dd>${this.esc(fmtBytes(item.size))}</dd>
                        <dt>Modified</dt><dd>${this.esc(item.modified ? new Date(item.modified * 1000).toLocaleString() : '—')}</dd>
                        <dt>Video</dt><dd>${this.esc((item.video_codec || '').toUpperCase() || '—')}</dd>
                        <dt>Audio</dt><dd>${this.esc((item.audio_codec || '').toUpperCase() || '—')}</dd>
                    </dl>
                </section>
                <section class="vd-panel"><h2>Cast</h2>
                    ${(tm.cast || []).length ? `<div class="vd-tags">${tm.cast.map((c) => `<span class="vd-tag">${this.esc(c)}</span>`).join('')}</div>` : '<p>No cast metadata.</p>'}
                    ${tm.runtime ? `<dl class="vd-kv" style="margin-top:12px"><dt>Runtime</dt><dd>${this.esc(tm.runtime)} min</dd></dl>` : ''}
                    <div style="margin-top:14px"><button class="vd-btn small" type="button" data-action="tmdb-refresh" data-path="${this.attr(item.path)}">${svg('refresh', 12)} Refresh metadata</button></div>
                </section>
            </div>
        </div>`;
    }

    // ── Settings ─────────────────────────────────────────────────────────────

    settingsHtml() {
        const s = this.state;
        const o = s.cfg?.options || {};
        const tm = s.cfg?.tmdb || {};
        const hw = s.status?.hw || {};
        const cand = hw.candidates || {};
        const enc = s.status?.encoder || hw.encoder;
        const encLabel = enc === 'vaapi' ? 'VA-API' : enc === 'qsv' ? 'QuickSync' : 'Software (libx264)';
        return `<div class="vd-settings" data-testid="vd-settings">
            <div class="vd-settings-head"><h1>Settings</h1><p>Library, playback, metadata and the media engine.</p></div>

            <section class="vd-panel"><h2>Library</h2>
                ${(s.roots || []).map((r) => `<div class="vd-rootrow"><code>${this.esc(r)}</code>
                    <button class="vd-btn small" type="button" data-action="share-root" data-path="${this.attr(r)}">${svg('share', 12)} Share</button>
                    <button class="vd-btn small danger" type="button" data-action="remove-root" data-path="${this.attr(r)}">${svg('trash', 12)} Remove</button>
                </div>`).join('') || '<p>No root folders yet.</p>'}
                <div class="vd-actionsbar" style="border-top:0;margin-top:4px;padding-top:4px">
                    <button class="vd-btn primary" type="button" data-action="add-folder">${svg('plus')} Add folder</button>
                </div>
            </section>

            <section class="vd-panel" data-testid="vd-settings-shared"><h2>Shared with me</h2>
                ${(s.shared || []).length ? (s.shared || []).map((g) => `<div class="vd-rootrow"><code>${this.esc(g.resource)}</code>
                    <span class="vd-tag">${this.esc(g.owner)}</span>
                    <button class="vd-btn small" type="button" data-action="open-shared" data-path="${this.attr(g.resource)}">Open</button>
                </div>`).join('') : '<p>Nothing shared with you yet.</p>'}
            </section>

            <section class="vd-panel"><h2>Playback</h2>
                <div class="vd-fields">
                    <div class="vd-field"><label>Transcode quality</label>
                        <select class="vd-select" data-setting="quality" data-testid="vd-setting-quality">
                            ${[['fast', 'Fast · 720p'], ['balanced', 'Balanced · 1080p'], ['high', 'High · source']]
                                .map(([v, l]) => `<option value="${v}" ${o.quality === v ? 'selected' : ''}>${l}</option>`).join('')}
                        </select>
                    </div>
                    <div class="vd-field"><label>AAC bitrate</label>
                        <select class="vd-select" data-setting="audio_bitrate">
                            ${['96k', '128k', '160k', '192k', '256k'].map((b) => `<option value="${b}" ${o.audio_bitrate === b ? 'selected' : ''}>${b}</option>`).join('')}
                        </select>
                    </div>
                    <div class="vd-field"><label>Preferred audio language</label>
                        <input class="vd-input" data-setting="preferred_audio_lang" value="${this.attr(o.preferred_audio_lang || '')}" placeholder="pol, eng…">
                    </div>
                    <div class="vd-field"><label>Playback</label>
                        <label class="vd-check"><input type="checkbox" data-setting="auto_subtitles" ${o.auto_subtitles !== false ? 'checked' : ''}> Auto-load sibling subtitles</label>
                        <label class="vd-check"><input type="checkbox" data-setting="autoplay_next" ${o.autoplay_next !== false ? 'checked' : ''}> Autoplay next episode</label>
                        <label class="vd-check"><input type="checkbox" data-setting="hardware_decode" ${o.hardware_decode !== false ? 'checked' : ''}> Hardware decode when supported</label>                    </div>
                </div>
            </section>

            <section class="vd-panel"><h2>Metadata</h2>
                <div class="vd-fields">
                    <div class="vd-field"><label>Source</label>
                        <select class="vd-select" data-setting="tmdb_provider" data-testid="vd-setting-metadata-provider">
                            ${[
                                ['auto', 'Automatic — TMDB key first, otherwise keyless'],
                                ['keyless', 'Keyless — Cinemeta + TVmaze'],
                                ['cinemeta', 'Cinemeta (Stremio, unofficial)'],
                                ['tvmaze', 'TVmaze (series only)'],
                                ['tmdb', 'TMDB (requires API key)'],
                                ['off', 'Off'],
                            ].map(([v, l]) => `<option value="${v}" ${(tm.provider || 'auto') === v ? 'selected' : ''}>${l}</option>`).join('')}
                        </select>
                    </div>
                    <div class="vd-field"><label>TMDB API key (optional)</label>
                        <input class="vd-input" type="password" data-setting="tmdb_key" data-testid="vd-setting-metadata-key" placeholder="${this.attr(tm.api_key_set ? `Saved (${tm.api_key_masked})` : 'Add a key only for better Polish metadata')}" autocomplete="off">
                    </div>
                    <div class="vd-field"><label>TMDB language</label>
                        <input class="vd-input" data-setting="tmdb_language" value="${this.attr(tm.language || 'pl-PL')}" placeholder="pl-PL">
                        <small class="vd-help">Keyless sources return English text.</small>
                    </div>
                    <div class="vd-field full"><label class="vd-check"><input type="checkbox" data-setting="tmdb_auto" ${tm.auto_fetch !== false ? 'checked' : ''}> Fetch missing metadata after opening (max. 20 titles, once per 6 h)</label></div>
                </div>
                <div class="vd-actionsbar">
                    <button class="vd-btn" type="button" data-action="metadata-test" data-testid="vd-metadata-test">${svg('check')} Test sources</button>
                    ${tm.api_key_set ? '<button class="vd-btn danger" type="button" data-action="metadata-clear-key">Remove key</button>' : ''}
                    <button class="vd-btn primary" type="button" data-action="metadata-refresh-all" data-testid="vd-metadata-refresh">${svg('refresh')} Fetch missing</button>
                    <button class="vd-btn" type="button" data-action="metadata-refresh-all" data-force="1">Re-fetch all</button>
                </div>
                <div class="vd-tags" data-testid="vd-metadata-sources"><span class="vd-tag">Sources not tested yet</span></div>
                <p class="vd-help">Keyless: <a href="https://www.stremio.com/" target="_blank" rel="noopener">Cinemeta (unofficial Stremio addon)</a> and <a href="https://www.tvmaze.com/" target="_blank" rel="noopener">TVmaze (CC BY-SA 4.0)</a>. TMDB is optional and <a href="https://www.themoviedb.org/" target="_blank" rel="noopener">not endorsed or certified by TMDB</a>. Artwork is cached on this NAS; files are never renamed.</p>
            </section>

            <section class="vd-panel" data-testid="vd-settings-downloads"><h2>Downloads</h2>
                <div class="vd-fields">
                    <div class="vd-field"><label>Default version</label>
                        <select class="vd-select" data-setting="download_quality" data-testid="vd-setting-download-quality">
                            ${(this.state.downloadQualities.length ? this.state.downloadQualities : [
                                { value: 'original', label: 'Original · no re-encode' },
                                { value: 'balanced', label: '1080p' },
                                { value: 'fast', label: '720p · small' },
                                { value: 'tiny', label: '480p · tiny' },
                            ]).map((q) => `<option value="${this.attr(q.value)}" ${(o.download_quality || 'balanced') === q.value ? 'selected' : ''}>${this.esc(q.label)}</option>`).join('')}
                        </select>
                        <small class="vd-help">Used by the one-tap Download here and in the Videos phone app. “Original” copies the video instead of re-encoding it whenever the file allows it.</small>
                    </div>
                </div>
                <p class="vd-help">The NAS renders queued films one at a time and keeps a rolling window of prepared files. Each copy is freed as soon as a device stored it — open <b>Downloads</b> to see the queue.</p>
            </section>

            <section class="vd-panel"><h2>Media engine</h2>
                <div class="vd-engine-grid">
                    <div><b>${this.esc(encLabel)}</b><span>Encoder</span></div>
                    <div><b>${this.esc(hw.device || '—')}</b><span>Render node</span></div>
                    <div><b>${hw.decode?.vaapi ? 'VA-API' : hw.decode?.qsv ? 'QSV' : '—'}</b><span>HW decode</span></div>
                    <div><b>${s.status?.active_transcodes?.active ?? 0} / ${s.status?.active_transcodes?.max ?? 2}</b><span>Active streams</span></div>
                </div>
                <p>${this.esc(hw.reason || (s.status?.ffmpeg ? 'Probe has not run yet.' : 'ffmpeg is not installed.'))}</p>
                <table class="vd-table" data-testid="vd-engine-candidates">
                    <thead><tr><th>Encoder</th><th>Status</th><th>Detail</th></tr></thead>
                    <tbody>
                        ${['qsv', 'vaapi', 'libx264'].map((name) => {
                            const c = cand[name] || {};
                            return `<tr><td>${this.esc(name === 'libx264' ? 'libx264 (software)' : name.toUpperCase())}</td>
                                <td>${c.ok ? '<span class="vd-tag ok">Ready</span>' : '<span class="vd-tag bad">Unavailable</span>'}</td>
                                <td class="vd-path">${this.esc((c.reason || '').slice(0, 180) || '—')}</td></tr>`;
                        }).join('')}
                    </tbody>
                </table>
                <div class="vd-actionsbar">
                    <button class="vd-btn" type="button" data-action="engine-test">${svg('engine')} Test hardware encode</button>
                </div>
            </section>

            <div class="vd-actionsbar">
                <button class="vd-btn primary" type="button" data-action="save-settings" data-testid="vd-save-settings">${svg('check')} Save settings</button>
            </div>
            <p style="text-align:center;font-size:10.5px;color:var(--vd-faint)">Video Station ${this.esc(this.ctx.pkg?.version || '')} · API stays in EthOS core</p>
        </div>`;
    }

    async saveSettings() {
        const s = this.state;
        const get = (name) => this.view.querySelector(`[data-setting="${name}"]`);
        const options = {
            ...s.cfg.options,
            quality: get('quality')?.value || 'balanced',
            audio_bitrate: get('audio_bitrate')?.value || '192k',
            preferred_audio_lang: get('preferred_audio_lang')?.value || '',
            auto_subtitles: !!get('auto_subtitles')?.checked,
            autoplay_next: !!get('autoplay_next')?.checked,
            hardware_decode: !!get('hardware_decode')?.checked,
            download_quality: get('download_quality')?.value || s.downloadQuality || 'balanced',
            sort: s.sort,
            view: s.layout,
        };
        const tmdb = {
            provider: get('tmdb_provider')?.value || 'auto',
            auto_fetch: !!get('tmdb_auto')?.checked,
            language: get('tmdb_language')?.value || 'pl-PL',
        };
        const key = get('tmdb_key')?.value?.trim();
        if (key) tmdb.api_key = key;
        try {
            const data = await this.apiPost('/api/videos/config', { roots: s.roots, options, tmdb });
            s.cfg = { ...s.cfg, ...data, options: { ...options, ...(data.options || {}) } };
            this.ctx.notifications.toast('Settings saved', 'success');
            this.renderView();
        } catch (err) {
            this.ctx.notifications.toast(`Could not save settings: ${err.message}`, 'error');
        }
    }

    async removeRoot(path) {
        const ok = await this.ctx.modal.confirm('Remove folder', `Stop showing videos from ${path}? The files stay untouched.`, {
            danger: true, confirmLabel: 'Remove',
        });
        if (!ok) return;
        this.state.roots = this.state.roots.filter((r) => r !== path);
        try {
            await this.apiPost('/api/videos/config', { roots: this.state.roots, options: this.state.cfg.options, tmdb: {} });
            this.state.cfg.roots = this.state.roots;
            this.state.library = null;
            this.ctx.notifications.toast('Folder removed', 'success');
            this.renderView();
        } catch (err) {
            this.ctx.notifications.toast(`Could not remove folder: ${err.message}`, 'error');
        }
    }

    async addFolder() {
        try {
            const path = await this.ctx.pickFolder({
                title: 'Add a video folder', roots: ['/home', '/mnt', '/media'], acceptLabel: 'Add folder',
            });
            if (!path) return;
            if (!this.state.roots.includes(path)) this.state.roots.push(path);
            await this.apiPost('/api/videos/config', { roots: this.state.roots, options: this.state.cfg.options, tmdb: {} });
            this.state.cfg.roots = this.state.roots;
            this.state.library = null;
            this.ctx.notifications.toast('Folder added', 'success');
            this.renderView();
        } catch (err) {
            this.ctx.notifications.toast(`Could not add folder: ${err.message}`, 'error');
        }
    }

    async refreshLibrary() {
        try {
            await this.ensureLibrary(true);
            await this.loadBootstrap();
            this.ctx.notifications.toast('Library refreshed', 'success');
            this.renderView();
        } catch (err) {
            this.ctx.notifications.toast(`Refresh failed: ${err.message}`, 'error');
        }
    }

    // ── Downloads (server queue shared with the /videos phone PWA) ───────────

    async loadDownloadSettings() {
        try {
            const data = await this.apiJson('/api/videos/download-settings');
            this.state.downloadQuality = data.quality || 'balanced';
            this.state.downloadQualities = Array.isArray(data.qualities) ? data.qualities : [];
            if (['detail', 'settings', 'downloads'].includes(this.state.mode)) this.renderView();
        } catch { /* older core without the endpoint — keep the local default */ }
    }

    async loadDownloads(force = false) {
        if (!force && Date.now() - this.state.downloadsAt < 1200) return;
        try {
            const data = await this.apiJson('/api/videos/exports');
            this.state.downloads = Array.isArray(data.jobs) ? data.jobs : [];
            this.state.downloadsAt = Date.now();
            if (data.defaults?.quality) this.state.downloadQuality = data.defaults.quality;
            if (!this.state.downloadQualities.length) this.loadDownloadSettings();
            if (this.state.mode === 'downloads') this.renderView();
        } catch (err) {
            this.ctx.logger.warn('Downloads load failed', String(err));
        }
    }

    syncDownloadPolling() {
        if (this.state.downloadTimer) {
            clearInterval(this.state.downloadTimer);
            this.state.downloadTimer = null;
        }
        if (this.state.mode !== 'downloads') return;
        this.state.downloadTimer = setInterval(() => this.loadDownloads(), 3000);
    }

    downloadStage(job) {
        const pct = Math.round(Number(job.percent) || 0);
        if (job.status === 'queued') {
            return `<span class="vd-tag">Queued${Number(job.queue_position) > 1 ? ` #${job.queue_position}` : ''}</span>`;
        }
        if (job.status === 'rendering') return `<span class="vd-tag gold">Preparing ${pct}%</span>`;
        if (job.status === 'done') return `<span class="vd-tag ok">Ready · ${this.esc(fmtBytes(job.size))}</span>`;
        if (job.status === 'failed') return `<span class="vd-tag bad">Failed</span>`;
        if (job.status === 'consumed') return '<span class="vd-tag">Saved on device</span>';
        return `<span class="vd-tag">${this.esc(job.status)}</span>`;
    }

    downloadsHtml() {
        const jobs = this.state.downloads || [];
        const active = jobs.filter((j) => j.status === 'queued' || j.status === 'rendering');
        const ready = jobs.filter((j) => j.status === 'done');
        const saved = jobs.filter((j) => j.status === 'consumed');
        const failed = jobs.filter((j) => j.status === 'failed');
        const summary = [
            active.length ? `<span class="vd-tag gold">${active.length} preparing</span>` : '',
            ready.length ? `<span class="vd-tag ok">${ready.length} ready</span>` : '',
            saved.length ? `<span class="vd-tag">${saved.length} saved</span>` : '',
            failed.length ? `<span class="vd-tag bad">${failed.length} failed</span>` : '',
        ].filter(Boolean).join(' ');
        const rows = jobs.map((job) => {
            const item = this.findItem(job.path) || { path: job.path, name: job.name, title: job.name };
            const pct = Math.min(100, Number(job.percent) || 0);
            const isActive = job.status === 'queued' || job.status === 'rendering';
            const actions = [
                job.status === 'done' && this.token
                    ? `<a class="vd-btn small" href="/api/videos/exports/${this.attr(job.id)}/download?token=${this.attr(encodeURIComponent(this.token))}" download>${svg('download', 12)} Save</a>`
                    : '',
                isActive ? `<button class="vd-btn small" type="button" data-action="download-cancel" data-id="${this.attr(job.id)}">Cancel</button>` : '',
                !isActive ? `<button class="vd-btn small danger" type="button" data-action="download-delete" data-id="${this.attr(job.id)}">${svg('trash', 12)}</button>` : '',
            ].filter(Boolean).join(' ');
            return `<tr data-testid="vd-download-row">
                <td><img class="vd-thumb" src="${this.attr(this.artUrl(item, 'poster'))}" alt="" loading="lazy"></td>
                <td><div class="vd-title">${this.esc(item.tmdb?.title || item.title || job.name)}</div>
                    <div class="vd-path">${this.esc(job.name || '')}</div>
                    ${job.note ? `<div class="vd-path">${this.esc(job.note)}</div>` : ''}</td>
                <td><span class="vd-tag">${this.esc(job.quality_label || job.quality)}</span></td>
                <td>${this.downloadStage(job)}
                    ${isActive ? `<div class="vd-progress" style="position:static;margin-top:6px;height:4px;background:rgba(128,128,128,.25)"><i style="width:${pct.toFixed(1)}%;background:var(--vd-gold)"></i></div>` : ''}</td>
                <td class="vd-acts">${actions}</td>
            </tr>`;
        }).join('');
        return `<div class="vd-page" data-testid="vd-downloads">
            <div class="vd-page-head">
                <div><h1>Downloads</h1>
                    <p>Films prepared by the NAS for offline viewing. The queue is shared with the Videos phone app; the NAS frees each file once a device stored it.</p></div>
                <div class="vd-grow"></div>
                <button class="vd-btn small" type="button" data-action="download-refresh">${svg('refresh', 12)} Refresh</button>
            </div>
            ${summary ? `<div class="vd-toolbar">${summary}</div>` : ''}
            ${jobs.length ? `<table class="vd-table"><thead><tr><th></th><th>Title</th><th>Version</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
                : `<div class="vd-empty"><b>Nothing queued</b>Open a movie and choose Download to prepare it for offline viewing. You can queue as many as you like — they render one by one.</div>`}
        </div>`;
    }

    async queueDownload(path, quality) {
        const item = this.findItem(path);
        const version = quality || this.state.downloadQuality || 'balanced';
        try {
            const job = await this.apiPost('/api/videos/exports', { path, q: version, a: 0 });
            this.ctx.notifications.toast(`${item ? this.displayTitle(item) : 'Video'} queued · ${job.quality_label || version}`, 'success');
            await this.loadDownloads(true);
        } catch (err) {
            this.ctx.notifications.toast(`Download failed: ${err.message}`, 'error');
        }
    }

    async cancelDownloadJob(id) {
        try {
            await this.ctx.apiFetch(`/api/videos/exports/${encodeURIComponent(id)}`, { method: 'DELETE' });
            await this.loadDownloads(true);
        } catch (err) {
            this.ctx.notifications.toast(`Could not cancel: ${err.message}`, 'error');
        }
    }

    async toggleList(path) {
        const add = !this.state.list.has(path);
        try {
            const data = await this.apiPost('/api/videos/list', { path, add });
            this.state.list = new Set(data.paths || []);
            this.ctx.notifications.toast(add ? 'Added to My List' : 'Removed from My List', 'success');
            this.renderView();
        } catch (err) {
            this.ctx.notifications.toast(`Could not update My List: ${err.message}`, 'error');
        }
    }

    async removeContinue(path) {
        try {
            await this.ctx.apiFetch(`/api/videos/resume?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
            delete this.state.resume[path];
            this.renderView();
        } catch (err) {
            this.ctx.notifications.toast(`Could not remove: ${err.message}`, 'error');
        }
    }

    async metadataTest() {
        try {
            const data = await this.apiJson('/api/videos/metadata/test');
            const box = this.view.querySelector('[data-testid="vd-metadata-sources"]');
            if (box) {
                box.innerHTML = (data.results || []).map((r) => {
                    const msg = r.ok ? (r.latency_ms ? `${r.latency_ms} ms` : 'OK') : (r.message || 'Unavailable');
                    return `<span class="vd-tag ${r.ok ? 'ok' : 'bad'}" data-testid="vd-metadata-source-${this.attr(r.id)}">${this.esc(r.label)}: ${this.esc(msg)}</span>`;
                }).join('') || '<span class="vd-tag bad">No sources configured</span>';
            }
            this.ctx.notifications.toast(data.ok ? 'Metadata sources reachable' : 'Metadata sources unavailable',
                data.ok ? 'success' : 'warning');
        } catch (err) {
            this.ctx.notifications.toast(`Metadata test failed: ${err.message}`, 'error');
        }
    }

    async tmdbTest() { return this.metadataTest(); }

    async metadataRefreshAll(force = false) {
        const task = this.ctx.progress.startTask({
            appId: 'videos',
            title: force ? 'Re-fetching video metadata' : 'Fetching missing video metadata',
            detail: 'Walking the library…',
            testIdPrefix: 'vd-metadata',
        });
        try {
            const data = await this.apiPost('/api/videos/metadata/refresh', { force: !!force });
            const titles = data.titles_matched ?? 0;
            const files = data.files_matched ?? 0;
            const skipped = data.skipped ?? 0;
            const detail = `${titles} titles · ${files} files${skipped ? ` · ${skipped} skipped` : ''}`;
            if (data.aborted) {
                task.finish('failed', { detail: data.aborted });
                this.ctx.notifications.toast(data.aborted, 'warning');
            } else if (!titles && data.errors) {
                task.finish('failed', { detail: `${data.errors} errors` });
                this.ctx.notifications.toast('Metadata refresh finished with errors', 'warning');
            } else {
                task.finish('done', { percent: 100, detail });
                this.ctx.notifications.emit({
                    kind: 'success', title: 'Video metadata updated',
                    message: `${titles} titles and ${files} files updated.`,
                });
            }
            this.state.library = null;
            await this.loadBootstrap();
            this.renderView();
        } catch (err) {
            task.finish('failed', { detail: err.message });
            this.ctx.notifications.toast(`Metadata refresh failed: ${err.message}`, 'error');
        }
    }

    async tmdbRefreshAll() { return this.metadataRefreshAll(false); }

    async clearMetadataKey() {
        const ok = await this.ctx.modal.confirm(
            'Remove TMDB key',
            'Keyless metadata (Cinemeta + TVmaze) will keep working. Existing cached artwork stays.',
            { danger: true, confirmLabel: 'Remove key' },
        );
        if (!ok) return;
        try {
            await this.apiPost('/api/videos/config', {
                roots: this.state.roots,
                options: this.state.cfg.options,
                tmdb: { clear_key: true },
            });
            await this.loadBootstrap();
            this.renderView();
            this.ctx.notifications.toast('TMDB key removed', 'success');
        } catch (err) {
            this.ctx.notifications.toast(`Could not remove key: ${err.message}`, 'error');
        }
    }


    async engineTest() {
        try {
            const data = await this.apiJson('/api/videos/status?refresh=1');
            this.state.status = data;
            this.updateChrome();
            const enc = data.encoder === 'vaapi' ? 'VA-API' : data.encoder === 'qsv' ? 'QuickSync' : 'software libx264';
            this.ctx.notifications.toast(`Hardware probe: ${enc}`, data.encoder ? 'success' : 'warning');
            this.renderView();
        } catch (err) {
            this.ctx.notifications.toast(`Engine probe failed: ${err.message}`, 'error');
        }
    }

    // ── Player ───────────────────────────────────────────────────────────────

    async openPlayer(item, startOverride = null) {
        this.stopPlayer({ quiet: true });
        const state = this.state;
        state.back = state.back || {
            mode: state.mode === 'player' ? 'home' : state.mode,
            path: state.path, show: state.show, detail: state.detail,
        };
        state.detail = item;
        state.mode = 'player';
        this.updateChrome();
        this.view.innerHTML = '';
        const layer = document.createElement('div');
        layer.className = 'vd-player';
        layer.setAttribute('data-testid', 'vd-player');
        layer.innerHTML = `<video playsinline webkit-playsinline preload="metadata"></video>
            <div class="vd-player-ui" data-role="ui">
                <div class="vd-player-top">
                    <button class="vd-player-btn" type="button" data-action="close-player" data-testid="vd-player-back">${svg('back', 20)}</button>
                    <span class="vd-title">${this.esc(this.displayTitle(item))}</span>
                    <span class="vd-tag" data-role="mode-tag">Preparing…</span>
                    <span class="vd-tag gold" data-role="encoder-tag"></span>
                    <button class="vd-player-btn" type="button" data-action="player-stats" title="Playback stats">${svg('stats', 18)}</button>
                </div>
                <div class="vd-player-center"><button type="button" data-action="player-toggle" data-role="big-play">${svg('play', 30)}</button></div>
                <div class="vd-player-bottom">
                    <div class="vd-seek-wrap">
                        <div class="vd-seek-buffer"><i data-role="buffered" style="width:0%"></i></div>
                        <input class="vd-seek" data-role="seek" type="range" min="0" max="100" step="0.1" value="0" data-testid="vd-player-seek">
                    </div>
                    <div class="vd-player-row">
                        <button class="vd-player-btn primary" type="button" data-action="player-toggle" data-role="play-btn">${svg('play', 18)}</button>
                        <button class="vd-player-btn" type="button" data-action="player-seek" data-delta="-10">-10</button>
                        <button class="vd-player-btn" type="button" data-action="player-seek" data-delta="10">+10</button>
                        <span class="vd-time" data-role="time">0:00 / --:--</span>
                        <span class="vd-grow"></span>
                        <select data-role="audio" data-action="player-audio" data-testid="vd-player-audio"></select>
                        <select data-role="sub" data-action="player-sub" data-testid="vd-player-sub"></select>
                        <select data-role="quality" data-action="player-quality" data-testid="vd-player-quality">
                            <option value="fast">720p</option><option value="balanced">1080p</option><option value="high">Source</option>
                        </select>
                        <select data-role="speed" data-action="player-speed" data-testid="vd-player-speed">
                            <option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1" selected>1×</option>
                            <option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option>
                        </select>
                        <button class="vd-player-btn" type="button" data-action="player-pip" title="Picture in picture">${svg('pip', 18)}</button>
                        <button class="vd-player-btn" type="button" data-action="player-fullscreen" title="Fullscreen">${svg('full', 18)}</button>
                    </div>
                </div>
            </div>
            <div class="vd-player-stats" data-role="stats"></div>
            <div class="vd-next" data-role="next"></div>`;
        this.main.appendChild(layer);
        const video = layer.querySelector('video');
        const player = {
            item, layer, video, mode: 'direct', encoder: null, decode: 'sw', live: false,
            base: 0, duration: 0, info: null, audioIdx: 0, audioTracks: [], subs: [], subIdx: -1,
            quality: state.cfg?.options?.quality || 'balanced', hls: null, session: null,
            playWhenReady: true, ended: false, lastSave: 0, wakeLock: null, stats: false,
            opening: true, hideTimer: null, seekReloading: false, hlsRetried: false, lastError: null,
            acodec: null, noAudioNoticed: false,
        };
        this.player = player;
        this.bindPlayer(player);
        const start = startOverride != null ? Number(startOverride) : null;
        await this.loadPlayerInfo(player, start);
    }

    async loadPlayerInfo(player, startOverride) {
        const { item } = player;
        try {
            const [infoData, subsData, resumeData] = await Promise.all([
                this.apiJson(`/api/videos/info?path=${encodeURIComponent(item.path)}`).catch(() => ({ info: {} })),
                this.apiJson(`/api/videos/subtitles?path=${encodeURIComponent(item.path)}`).catch(() => ({ subtitles: [] })),
                this.apiJson(`/api/videos/resume?path=${encodeURIComponent(item.path)}`).catch(() => ({ resume: null })),
            ]);
            if (this.player !== player) return;
            const info = infoData.info || {};
            player.info = info;
            player.audioTracks = info.audio_tracks || [];
            player.subs = subsData.subtitles || [];
            player.audioIdx = this.defaultAudioIdx(player.audioTracks);
            player.duration = Number(info.duration) || 0;
            const resume = startOverride != null ? null : resumeData.resume;
            const resumeTime = resume && resume.time > 5 && (!resume.duration || resume.time < resume.duration * 0.97)
                ? Number(resume.time) : 0;
            let start = startOverride != null ? Number(startOverride) : resumeTime;
            if (player.duration && start >= player.duration - 1) start = 0;
            player.base = Math.max(0, start || 0);

            let mode = info.playback_mode || (info.needs_transcode ? 'transcode' : 'direct');
            // Multiple audio tracks: browsers cannot switch tracks in direct mode.
            if (mode === 'direct' && player.audioTracks.length > 1) mode = 'remux';
            player.mode = mode;
            player.encoder = info.engine?.encoder
                || (mode === 'transcode' ? this.state.status?.encoder : null);
            player.decode = info.engine?.hw_decode_capable ? 'hw' : 'sw';
            player.live = mode !== 'direct';
            this.renderPlayerMeta(player);

            const autoSubs = this.state.cfg?.options?.auto_subtitles !== false;
            const pref = player.subs.find((s) => s.preferred);
            player.subIdx = autoSubs ? (pref ? player.subs.indexOf(pref) : (player.subs.length ? 0 : -1)) : -1;
            this.renderPlayerSelects(player);
            if (player.subIdx >= 0) this.loadSubtitle(player, player.subIdx).catch(() => {});

            if (player.live) {
                await this.startHls(player, player.base, player.audioIdx);
            } else {
                player.video.src = this.streamUrl(item.path);
                player.opening = false;
                if (player.base > 0) player.video.addEventListener('loadedmetadata', () => {
                    try { player.video.currentTime = player.base; } catch { /* ignore */ }
                }, { once: true });
                player.video.play().catch(() => {});
            }
            if (resumeTime) this.toast(`Resumed at ${fmtTime(resumeTime)}`);
            this.setupMediaSession(player);
        } catch (err) {
            this.ctx.logger.error('Player setup failed', String(err));
            player.opening = false;
            this.renderPlayerError(player, err.message || String(err));
        }
    }

    streamUrl(path) {
        return `/api/videos/stream?path=${encodeURIComponent(path)}&token=${encodeURIComponent(this.token)}`;
    }

    transcodeUrl(path, t = 0, a = 0, q = 'balanced') {
        return `/api/videos/transcode?path=${encodeURIComponent(path)}${t > 0 ? `&t=${t.toFixed(3)}` : ''}`
            + `&a=${a}&q=${encodeURIComponent(q)}&acodec=${this.audioCodec()}&token=${encodeURIComponent(this.token)}`;
    }

    audioCodec() {
        // Chromium builds without the proprietary AAC decoder still decode Opus
        // in MP4; if neither works the movie plays without sound instead of
        // failing with "The stream could not be played".
        if (this._audioCodec) return this._audioCodec;
        let hasMse = false;
        try { hasMse = typeof window.MediaSource !== 'undefined'; } catch { hasMse = false; }
        if (!hasMse) { this._audioCodec = 'aac'; return this._audioCodec; }
        const probe = (type) => {
            try { return !!window.MediaSource.isTypeSupported(type); } catch { return false; }
        };
        this._audioCodec = probe('audio/mp4; codecs="mp4a.40.2"') ? 'aac'
            : probe('audio/mp4; codecs="opus"') ? 'opus' : 'none';
        this.ctx.logger.info('Playback audio codec', this._audioCodec);
        return this._audioCodec;
    }

    withToken(url) {
        return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(this.token)}`;
    }

    async startHls(player, start, audioIdx, { allowLegacy = true } = {}) {
        player.seekReloading = true;
        try {
            const data = await this.apiPost('/api/videos/hls', {
                path: player.item.path, t: Math.max(0, start || 0), a: audioIdx || 0,
                q: player.quality, acodec: this.audioCodec(),
            });
            if (this.player !== player) {
                // Spóźniona odpowiedź po zamknięciu odtwarzacza — oddaj sesję,
                // żeby nie blokowała limitu użytkownika przez 2 minuty.
                this.ctx.apiFetch(`/api/videos/hls/${encodeURIComponent(data.session)}/stop`,
                    { method: 'POST' }).catch(() => {});
                return;
            }
            player.session = data.session;
            player.mode = data.mode || player.mode;
            player.encoder = data.encoder || player.encoder;
            player.acodec = data.acodec || player.acodec;
            if (player.acodec === 'none' && !player.noAudioNoticed) {
                player.noAudioNoticed = true;
                this.toast('This browser cannot decode the audio — playing without sound', 'warning');
            }
            player.decode = data.decode || player.decode;
            player.base = Math.max(0, Number(start) || 0);
            player.live = true;
            const url = this.withToken(data.playlist);
            await this.attachPlaylist(player, url);
            this.renderPlayerMeta(player);
            player.video.play().catch(() => {});
        } catch (err) {
            if (this.player !== player) return;
            player.lastError = err?.message || String(err);
            this.ctx.logger.warn('HLS start failed', String(err));
            if (!allowLegacy) throw err;
            player.live = true;
            player.encoder = this.state.status?.encoder || null;
            player.video.src = this.transcodeUrl(player.item.path, player.base, player.audioIdx, player.quality);
            player.video.play().catch(() => {});
            this.toast('HLS unavailable — using the legacy stream');
        } finally {
            player.seekReloading = false;
            player.opening = false;
        }
    }

    async attachPlaylist(player, url) {
        const video = player.video;
        // Prefer hls.js whenever MSE exists: the bounded HLS window is a live
        // stream, and the native path (Safari/Android Chrome) refuses seeks
        // outside the window with a bare media error.
        let hasMse = false;
        try { hasMse = typeof window.MediaSource !== 'undefined'; } catch { hasMse = false; }
        let Hls = null;
        if (hasMse) {
            try { Hls = await this.loadHls(); } catch { Hls = null; }
        }
        if (!Hls) {
            video.src = url;
            return;
        }
        if (this.player !== player) return;
        if (player.hls) {
            player.hls.destroy();
            player.hls = null;
        }
        const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
        player.hls = hls;
        hls.on(Hls.Events.ERROR, (_event, data) => {
            if (!data?.fatal) return;
            const detail = `${data.type}/${data.details}${data.reason ? ` — ${data.reason}` : ''}`;
            // Bez tego wpisu awaria odtwarzania była niewidoczna w logach EthOS.
            this.ctx.logger.error('HLS playback error', detail);
            player.lastError = detail;
            this.recoverPlayback(player);
        });
        hls.loadSource(url);
        hls.attachMedia(video);
    }

    async recoverPlayback(player) {
        if (this.player !== player) return;
        if (player.hls) { try { player.hls.destroy(); } catch { /* ignore */ } player.hls = null; }
        await this.stopHlsSession(player);
        if (this.player !== player) return;
        if (!player.hlsRetried) {
            player.hlsRetried = true;
            this.toast('Retrying the stream…');
            try {
                await this.startHls(player, this.absTime(player), player.audioIdx, { allowLegacy: false });
                return;
            } catch (err) {
                player.lastError = err?.message || String(err);
                this.ctx.logger.error('HLS retry failed', player.lastError);
                if (this.player !== player) return;
            }
        }
        player.live = true;
        player.encoder = this.state.status?.encoder || null;
        player.video.src = this.transcodeUrl(player.item.path, player.base, player.audioIdx, player.quality);
        player.video.play().catch(() => {});
        this.toast('Stream error — switched to the legacy player', 'warning');
    }

    async retryPlayer() {
        const player = this.player;
        if (!player) return;
        player.layer.querySelector('.vd-error')?.remove();
        player.hlsRetried = false;
        player.lastError = null;
        if (player.live) {
            await this.startHls(player, this.absTime(player), player.audioIdx);
            return;
        }
        player.video.src = this.streamUrl(player.item.path);
        player.video.play().catch(() => {});
    }

    loadHls() {
        if (window.Hls) return Promise.resolve(window.Hls);
        if (this._hlsPromise) return this._hlsPromise;
        this._hlsPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            // Script tags cannot send the Authorization header; the query token
            // also covers header/localStorage-only sessions (no auth cookie).
            const asset = '/api/packages/ethos-video/ui/frontend/hls.min.js';
            script.src = this.token ? this.withToken(asset) : asset;
            script.onload = () => window.Hls ? resolve(window.Hls) : reject(new Error('hls.js did not load'));
            script.onerror = () => reject(new Error('Could not load the HLS player'));
            document.head.appendChild(script);
        });
        return this._hlsPromise;
    }

    stopPlayer({ quiet = false } = {}) {
        const p = this.player;
        if (!p) return;
        this.player = null;
        if (!quiet) this.saveResume(true, p);
        try { p.video.pause(); } catch { /* ignore */ }
        if (p.hls) { try { p.hls.destroy(); } catch { /* ignore */ } }
        if (p.session) {
            try {
                fetch(`/api/videos/hls/${encodeURIComponent(p.session)}/stop`, {
                    method: 'POST', keepalive: true,
                    headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
                }).catch(() => {});
            } catch { /* ignore */ }
        }
        if (p.wakeLock) { try { p.wakeLock.release(); } catch { /* ignore */ } }
        if (p.subBlobUrl) { try { URL.revokeObjectURL(p.subBlobUrl); } catch { /* ignore */ } }
        if (p.keyHandler) document.removeEventListener('keydown', p.keyHandler);
        if (p.hideTimer) clearTimeout(p.hideTimer);
        p.layer.remove();
        if (!quiet) {
            this.state.mode = 'detail';
            this.state.detail = p.item;
            this.updateChrome();
            this.renderView();
        }
    }

    bindPlayer(player) {
        const video = player.video;
        const layer = player.layer;
        const ui = layer.querySelector('[data-role="ui"]');
        const seek = layer.querySelector('[data-role="seek"]');
        const time = layer.querySelector('[data-role="time"]');
        const buffered = layer.querySelector('[data-role="buffered"]');
        const playBtns = layer.querySelectorAll('[data-role="play-btn"], [data-role="big-play"]');
        const showUi = () => {
            ui.classList.remove('hidden');
            if (player.hideTimer) clearTimeout(player.hideTimer);
            if (!video.paused) {
                player.hideTimer = setTimeout(() => ui.classList.add('hidden'), 3200);
            }
        };
        layer.addEventListener('mousemove', showUi);
        layer.addEventListener('touchstart', showUi, { passive: true });
        layer.addEventListener('click', (e) => {
            if (e.target.closest('button, select, input')) return;
            showUi();
        });
        const updatePlayIcon = () => {
            const icon = video.paused ? svg('play', 18) : svg('pause', 18);
            const big = video.paused ? svg('play', 30) : svg('pause', 30);
            playBtns.forEach((b) => { b.innerHTML = b.dataset.role === 'big-play' ? big : icon; });
            layer.querySelector('[data-role="big-play"]').classList.toggle('show', video.paused);
        };
        video.addEventListener('play', updatePlayIcon);
        video.addEventListener('pause', () => { updatePlayIcon(); showUi(); });
        video.addEventListener('loadedmetadata', () => {
            if (!player.live && Number.isFinite(video.duration)) player.duration = video.duration;
            this.renderPlayerMeta(player);
        });
        video.addEventListener('timeupdate', () => {
            const abs = this.absTime(player);
            const duration = this.effectiveDuration(player);
            const value = duration > 0 ? Math.min(duration, abs) : 0;
            seek.max = String(Math.max(1, duration || 100));
            seek.value = String(value);
            seek.style.setProperty('--vd-fill', `${duration ? pct(value, duration) : 0}%`);
            time.textContent = `${fmtTime(abs)} / ${duration ? fmtTime(duration) : '--:--'}`;
            try {
                const b = video.buffered;
                if (b.length) {
                    const end = b.end(b.length - 1) + (player.live ? player.base : 0);
                    buffered.style.width = `${duration ? pct(end, duration) : 0}%`;
                }
            } catch { /* ignore */ }
            this.saveResume(false, player);
            if (duration && abs >= duration - 1.2 && !player.ended) this.finishPlayback(player);
        });
        video.addEventListener('ended', () => this.finishPlayback(player));
        video.addEventListener('error', () => {
            if (player.opening) return;
            const err = video.error;
            const detail = `code=${err ? err.code : '?'} message=${err ? err.message : ''} `
                + `mode=${player.mode} src=${String(video.currentSrc || video.src || '').slice(0, 120)}`;
            this.ctx.logger.error('Video element error', detail);
            if (err?.message) player.lastError = err.message;
            if (player.live && !player.seekReloading) {
                this.renderPlayerError(player, 'The stream could not be played. Try a lower quality or the legacy player.');
            }
        });
        seek.addEventListener('input', () => {
            const duration = this.effectiveDuration(player);
            time.textContent = `${fmtTime(seek.value)} / ${duration ? fmtTime(duration) : '--:--'}`;
            seek.style.setProperty('--vd-fill', `${duration ? pct(Number(seek.value), duration) : 0}%`);
        });
        seek.addEventListener('change', () => this.seekTo(player, Number(seek.value)));
        player.keyHandler = (e) => {
            if (this.player !== player) return;
            const tag = (e.target?.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
            if (e.key === ' ' || e.key.toLowerCase() === 'k') { e.preventDefault(); this.togglePlay(player); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); this.seekTo(player, this.absTime(player) - 10); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); this.seekTo(player, this.absTime(player) + 10); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); player.video.volume = Math.min(1, player.video.volume + 0.1); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); player.video.volume = Math.max(0, player.video.volume - 0.1); }
            else if (e.key.toLowerCase() === 'm') { player.video.muted = !player.video.muted; }
            else if (e.key.toLowerCase() === 'f') { this.toggleFullscreen(player); }
            else if (e.key.toLowerCase() === 'p') { this.togglePip(player); }
            else if (e.key.toLowerCase() === 's') { this.toggleStats(player); }
            else if (e.key === 'Escape') { if (!document.fullscreenElement) this.stopPlayer(); }
            showUi();
        };
        document.addEventListener('keydown', player.keyHandler);
        updatePlayIcon();
        showUi();
    }

    togglePlay(player) {
        if (player.video.paused) player.video.play().catch(() => {});
        else player.video.pause();
    }

    absTime(player) {
        const t = Number(player.video.currentTime) || 0;
        return player.live ? player.base + t : t;
    }

    effectiveDuration(player) {
        if (player.live) return player.duration || Number(player.info?.duration) || 0;
        return Number.isFinite(player.video.duration) ? player.video.duration : (player.duration || 0);
    }

    async seekTo(player, target) {
        const t = Math.max(0, Number(target) || 0);
        const duration = this.effectiveDuration(player);
        const clamped = duration ? Math.min(t, Math.max(0, duration - 0.5)) : t;
        if (!player.live) {
            try { player.video.currentTime = clamped; } catch { /* ignore */ }
            return;
        }
        const rel = clamped - player.base;
        const seekable = this.isSeekable(player, rel);
        if (seekable) {
            try { player.video.currentTime = rel; } catch { /* ignore */ }
            return;
        }
        const wasPlaying = !player.video.paused;
        await this.stopHlsSession(player);
        await this.startHls(player, clamped, player.audioIdx);
        if (!wasPlaying) try { player.video.pause(); } catch { /* ignore */ }
    }

    isSeekable(player, rel) {
        if (rel < 0) return false;
        try {
            const ranges = player.video.seekable;
            for (let i = 0; i < ranges.length; i += 1) {
                if (rel >= ranges.start(i) - 0.5 && rel <= ranges.end(i) + 0.5) return true;
            }
        } catch { /* ignore */ }
        return false;
    }

    async stopHlsSession(player) {
        if (player.hls) { try { player.hls.destroy(); } catch { /* ignore */ } player.hls = null; }
        if (player.session) {
            const sid = player.session;
            player.session = null;
            try {
                await this.ctx.apiFetch(`/api/videos/hls/${encodeURIComponent(sid)}/stop`, { method: 'POST' });
            } catch { /* TTL cleanup covers it */ }
        }
    }

    saveResume(force, player = this.player) {
        if (!player || !player.item) return;
        const now = Date.now();
        if (!force && now - player.lastSave < 5000) return;
        player.lastSave = now;
        const abs = this.absTime(player);
        const duration = this.effectiveDuration(player) || player.duration || 0;
        if (abs < 5) return;
        const body = { path: player.item.path, time: abs, duration };
        try {
            this.ctx.apiFetch('/api/videos/resume', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
            }).catch(() => {});
            if (duration && abs < duration * 0.97) this.state.resume[player.item.path] = { time: abs, duration, updated_at: now / 1000 };
        } catch { /* ignore */ }
    }

    finishPlayback(player) {
        if (player.ended) return;
        player.ended = true;
        const duration = this.effectiveDuration(player) || player.duration || 0;
        if (duration) {
            this.ctx.apiFetch('/api/videos/resume', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: player.item.path, time: duration, duration }),
            }).catch(() => {});
        }
        delete this.state.resume[player.item.path];
        const next = this.nextEpisode(player.item);
        if (!next) {
            this.showNext(player, null);
            return;
        }
        const autoplay = this.state.cfg?.options?.autoplay_next !== false;
        this.showNext(player, next, autoplay ? 8 : 0);
    }

    showNext(player, next, countdown = 0) {
        const box = player.layer.querySelector('[data-role="next"]');
        if (!box) return;
        if (!next) {
            box.innerHTML = '<p>Finished.</p><button class="vd-btn small" type="button" data-action="close-player">Back to library</button>';
            box.classList.add('show');
            return;
        }
        let remaining = countdown;
        const render = () => {
            box.innerHTML = `<p>Next up</p><strong>${this.esc(this.displayTitle(next))}</strong>
                <div class="vd-tags"><span class="vd-tag">${this.esc(this.episodeLabel(next))}</span></div>
                <div style="display:flex;gap:8px;margin-top:12px">
                    <button class="vd-btn small primary" type="button" data-action="play-next-now" data-path="${this.attr(next.path)}">Play now</button>
                    <button class="vd-btn small" type="button" data-action="dismiss-next">Stay</button>
                </div>
                ${remaining ? `<p style="margin:10px 0 0">Starting in ${remaining}s…</p>` : ''}`;
        };
        render();
        box.classList.add('show');
        if (remaining > 0) {
            const timer = setInterval(() => {
                remaining -= 1;
                if (this.player !== player) { clearInterval(timer); return; }
                if (remaining <= 0) {
                    clearInterval(timer);
                    this.stopPlayer({ quiet: true });
                    this.openPlayer(next);
                } else render();
            }, 1000);
        }
    }

    nextEpisode(item) {
        if (!item || item.kind !== 'episode') return null;
        const show = item.show || '';
        if (!show) return null;
        const eps = (this.state.library?.videos || []).filter((v) => v.kind === 'episode' && (v.show || '') === show)
            .sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || (a.episode ?? 0) - (b.episode ?? 0));
        const idx = eps.findIndex((v) => v.path === item.path);
        return idx >= 0 ? (eps[idx + 1] || null) : null;
    }

    renderPlayerMeta(player) {
        const mode = player.layer.querySelector('[data-role="mode-tag"]');
        const enc = player.layer.querySelector('[data-role="encoder-tag"]');
        if (mode) mode.textContent = player.live ? (player.mode === 'remux' ? 'Remux · video copy' : 'Transcoding') : 'Direct play';
        if (enc) enc.textContent = player.mode === 'transcode' && player.encoder
            ? `${player.encoder === 'vaapi' ? 'VA-API' : player.encoder === 'qsv' ? 'QuickSync' : 'libx264'}${player.decode === 'hw' ? ' + HW decode' : ''}`
            : (player.mode === 'remux' ? 'No re-encode' : '');
        const quality = player.layer.querySelector('[data-role="quality"]');
        if (quality) quality.value = player.quality;
    }

    renderPlayerSelects(player) {
        const audio = player.layer.querySelector('[data-role="audio"]');
        if (audio) {
            audio.innerHTML = player.audioTracks.length
                ? player.audioTracks.map((t, i) => `<option value="${i}" ${i === player.audioIdx ? 'selected' : ''}>${this.esc(this.trackLabel(t))}</option>`).join('')
                : '<option>Audio</option>';
            audio.disabled = player.audioTracks.length < 2 || this.audioCodec() === 'none';
        }
        const sub = player.layer.querySelector('[data-role="sub"]');
        if (sub) {
            sub.innerHTML = `<option value="-1" ${player.subIdx < 0 ? 'selected' : ''}>Subtitles off</option>`
                + player.subs.map((s, i) => `<option value="${i}" ${i === player.subIdx ? 'selected' : ''}>${this.esc(s.name)}</option>`).join('');
        }
    }

    trackLabel(track) {
        const lang = track.language ? `${track.language.toUpperCase()} · ` : '';
        const channels = track.channels === 2 ? '2.0' : track.channels === 6 ? '5.1' : track.channels === 8 ? '7.1' : '';
        return `${lang}${(track.codec || 'audio').toUpperCase()}${channels ? ` ${channels}` : ''}`;
    }

    defaultAudioIdx(tracks) {
        const pref = (this.state.cfg?.options?.preferred_audio_lang || '').toLowerCase();
        if (pref) {
            const i = tracks.findIndex((t) => (t.language || '').toLowerCase().startsWith(pref));
            if (i >= 0) return i;
        }
        const main = tracks.findIndex((t) => !t.role || t.role === 'main');
        return main >= 0 ? main : 0;
    }

    async changeAudio(player, index) {
        player.audioIdx = Math.max(0, Number(index) || 0);
        const abs = this.absTime(player);
        await this.stopHlsSession(player);
        await this.startHls(player, abs, player.audioIdx);
    }

    async changeQuality(player, quality) {
        player.quality = quality;
        const abs = this.absTime(player);
        await this.stopHlsSession(player);
        await this.startHls(player, abs, player.audioIdx);
        this.toast(`Quality: ${quality === 'fast' ? '720p' : quality === 'balanced' ? '1080p' : 'source'}`);
    }

    async loadSubtitle(player, index) {
        player.subIdx = Number(index);
        player.video.querySelectorAll('track').forEach((t) => t.remove());
        if (player.subBlobUrl) { URL.revokeObjectURL(player.subBlobUrl); player.subBlobUrl = null; }
        if (player.subIdx < 0 || !player.subs[player.subIdx]) return;
        const sub = player.subs[player.subIdx];
        const res = await this.ctx.apiFetch(`/api/files/raw?path=${encodeURIComponent(sub.path)}&token=${encodeURIComponent(this.token)}`);
        if (!res.ok) throw new Error(`Subtitle HTTP ${res.status}`);
        let text = await res.text();
        if (!sub.name.toLowerCase().endsWith('.vtt')) text = this.srtToVtt(text);
        player.subBlobUrl = URL.createObjectURL(new Blob([text], { type: 'text/vtt' }));
        const track = document.createElement('track');
        track.kind = 'subtitles';
        track.label = sub.name;
        track.srclang = 'und';
        track.src = player.subBlobUrl;
        track.default = true;
        player.video.appendChild(track);
        requestAnimationFrame(() => {
            try { track.track.mode = 'showing'; } catch { /* ignore */ }
        });
    }

    srtToVtt(srt) {
        const body = String(srt).replace(/\r/g, '').replace(/^\uFEFF/, '');
        const blocks = body.split('\n\n');
        const out = ['WEBVTT', ''];
        for (const block of blocks) {
            const lines = block.split('\n');
            if (!lines.length) continue;
            let i = 0;
            if (/^\d+$/.test(lines[0].trim())) i = 1;
            if (!lines[i] || !lines[i].includes('-->')) continue;
            const timing = lines[i].replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
            out.push(timing, ...lines.slice(i + 1), '');
        }
        return out.join('\n');
    }

    toggleStats(player) {
        player.stats = !player.stats;
        const box = player.layer.querySelector('[data-role="stats"]');
        if (!box) return;
        if (!player.stats) { box.classList.remove('show'); return; }
        const info = player.info || {};
        const quality = player.video.getVideoPlaybackQuality?.();
        box.innerHTML = `<b>${this.esc(this.displayTitle(player.item))}</b><br>
            Mode: <b>${this.esc(player.mode)}</b><br>
            Encoder: <b>${this.esc(player.encoder || '—')}</b> · decode: <b>${this.esc(player.decode)}</b><br>
            Source: ${this.esc(`${info.width || '?'}×${info.height || '?'} · ${(info.video_codec || '?').toUpperCase()} / ${(info.audio_codec || '?').toUpperCase()}`)}<br>
            Target: ${this.esc(this.state.cfg?.options?.quality || 'balanced')} · audio ${player.audioIdx + 1}/${Math.max(1, player.audioTracks.length)}<br>
            Buffer: ${this.esc(fmtTime(this.bufferedAhead(player)))} · dropped: ${quality ? quality.droppedVideoFrames : '—'}<br>
            ${player.hls ? `HLS level: ${player.hls.currentLevel} · bandwidth ${Math.round((player.hls.bandwidthEstimate || 0) / 1e6)} Mbps` : ''}`;
        box.classList.add('show');
    }

    bufferedAhead(player) {
        try {
            const b = player.video.buffered;
            return b.length ? b.end(b.length - 1) - player.video.currentTime : 0;
        } catch { return 0; }
    }

    toggleFullscreen(player) {
        const el = player.layer;
        if (document.fullscreenElement) {
            document.exitFullscreen?.().catch(() => {});
            return;
        }
        if (el.requestFullscreen) {
            el.requestFullscreen().then(() => {
                if (screen.orientation?.lock) screen.orientation.lock('landscape').catch(() => {});
            }).catch(() => {});
        } else if (player.video.webkitEnterFullscreen) {
            player.video.webkitEnterFullscreen();
        }
    }

    togglePip(player) {
        if (document.pictureInPictureElement) {
            document.exitPictureInPicture?.().catch(() => {});
        } else if (player.video.requestPictureInPicture) {
            player.video.requestPictureInPicture().catch((err) => this.toast(`PiP unavailable: ${err.message}`, 'error'));
        }
    }

    setupMediaSession(player) {
        if (!('mediaSession' in navigator)) return;
        try {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: this.displayTitle(player.item),
                artist: player.item.show || 'Video Station',
                artwork: [{ src: this.artUrl(player.item, 'poster'), sizes: '342x513', type: 'image/jpeg' }],
            });
            navigator.mediaSession.setActionHandler('play', () => player.video.play().catch(() => {}));
            navigator.mediaSession.setActionHandler('pause', () => player.video.pause());
            navigator.mediaSession.setActionHandler('seekbackward', () => this.seekTo(player, this.absTime(player) - 10));
            navigator.mediaSession.setActionHandler('seekforward', () => this.seekTo(player, this.absTime(player) + 10));
        } catch { /* unsupported */ }
        if ('wakeLock' in navigator) {
            navigator.wakeLock.request('screen').then((lock) => { player.wakeLock = lock; }).catch(() => {});
        }
    }

    renderPlayerError(player, message) {
        const ui = player.layer.querySelector('[data-role="ui"]');
        if (!ui) return;
        player.layer.querySelector('.vd-error')?.remove();
        const box = document.createElement('div');
        box.className = 'vd-error';
        box.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:9;max-width:440px;background:rgba(20,10,10,.92)';
        const detail = player.lastError
            ? `<div style="margin-top:8px;font-size:10.5px;line-height:1.45;opacity:.75;word-break:break-word">${this.esc(String(player.lastError).slice(0, 400))}</div>`
            : '';
        box.innerHTML = `${this.esc(message)}${detail}<div style="margin-top:10px;display:flex;gap:8px">
            <button class="vd-btn small" type="button" data-action="player-retry">Try again</button>
            <button class="vd-btn small" type="button" data-action="close-player">Back</button></div>`;
        player.layer.appendChild(box);
    }

    toast(message, kind = 'info') {
        try { this.ctx.notifications.toast(message, kind); }
        catch { this.ctx.logger.info(message); }
    }

    // ── Item helpers ─────────────────────────────────────────────────────────

    artUrl(item, kind = 'poster') {
        const tm = item.tmdb || {};
        const file = kind === 'backdrop'
            ? (tm.backdrop_file || tm.poster_file)
            : (tm.poster_file || tm.backdrop_file);
        if (file) return `/api/videos/metadata/image?file=${encodeURIComponent(file)}&token=${encodeURIComponent(this.token)}`;
        const width = kind === 'backdrop' ? 960 : 342;
        return `/api/videos/thumbnail?path=${encodeURIComponent(item.path)}&w=${width}&token=${encodeURIComponent(this.token)}`;
    }

    displayTitle(item) {
        const tm = item.tmdb || {};
        if (item.kind === 'episode') {
            const show = item.show || tm.title || basename(dirname(item.path)) || item.title || item.name || '';
            const ep = this.episodeLabel(item);
            return ep ? `${show} · ${ep}` : show;
        }
        return tm.title || item.title || item.name || basename(item.path);
    }

    episodeLabel(item) {
        if (item.season == null && item.episode == null) return '';
        return `S${pad2(item.season ?? 0)}E${pad2(item.episode ?? 0)}`;
    }

    itemYear(item) {
        return (item.tmdb?.year || item.year || '').toString();
    }

    searchText(item) {
        const tm = item.tmdb || {};
        return [this.displayTitle(item), item.name, item.title, item.show, tm.title, (tm.genres || []).join(' ')]
            .filter(Boolean).join(' ').toLowerCase();
    }

    groupShows(videos) {
        const map = new Map();
        for (const v of videos) {
            if (v.kind !== 'episode') continue;
            const show = v.show || v.folder || basename(dirname(v.path)) || 'Unknown series';
            const key = show.toLowerCase();
            let group = map.get(key);
            if (!group) { group = { show, items: [], poster: v, latest: v }; map.set(key, group); }
            group.items.push(v);
            if (v.tmdb?.poster_file) group.poster = v;
        }
        for (const group of map.values()) {
            group.items.sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || (a.episode ?? 0) - (b.episode ?? 0));
            group.latest = group.items[group.items.length - 1];
        }
        return [...map.values()].sort((a, b) => a.show.localeCompare(b.show));
    }

    genreShelves(videos) {
        const map = new Map();
        for (const v of videos) {
            for (const g of (v.tmdb?.genres || []).slice(0, 3)) {
                if (!map.has(g)) map.set(g, []);
                map.get(g).push(v);
            }
        }
        return [...map.entries()].filter(([, items]) => items.length >= 4).slice(0, 4);
    }

    libraryLoadingHtml(label) {
        return `<div class="vd-page"><div class="vd-page-head"><div><h1>${this.esc(label)}</h1><p>Reading the library…</p></div></div>
            <div class="vd-empty"><b>Loading…</b>Building the list from your root folders.</div></div>`;
    }

    // ── Events ───────────────────────────────────────────────────────────────

    bind() {
        this.root.addEventListener('click', (e) => this.onClick(e));
        this.root.addEventListener('change', (e) => this.onChange(e));
        this.root.addEventListener('input', (e) => this.onInput(e));
        this.onScroll = () => {
            const top = this.root?.querySelector('[data-testid="vd-top"]');
            if (top) top.classList.toggle('is-solid', this.state.mode !== 'home' || (this.main?.scrollTop || 0) > 12);
        };
        this.pageHide = () => {
            const sid = this.player?.session;
            if (!sid) return;
            try {
                fetch(`/api/videos/hls/${encodeURIComponent(sid)}/stop`, {
                    method: 'POST', keepalive: true,
                    headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
                }).catch(() => {});
            } catch { /* ignore */ }
        };
        window.addEventListener('pagehide', this.pageHide);
        this.main.addEventListener('scroll', this.onScroll, { passive: true });
        this.keyHandler = (e) => {
            if (this.state.mode === 'player') return;
            const tag = (e.target?.tagName || '').toLowerCase();
            const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault(); this.navigate('search'); return;
            }
            if (!typing && e.key === '/') { e.preventDefault(); this.navigate('search'); }
            if (e.key === 'Escape' && this.state.mode === 'search') { e.preventDefault(); this.goBack(); }
        };
        document.addEventListener('keydown', this.keyHandler);
    }

    onClick(e) {
        const el = e.target.closest('[data-action]');
        if (!el) return;
        const action = el.dataset.action;
        const path = el.dataset.path;
        if (action === 'nav') {
            this.navigate(el.dataset.mode || 'home');
        } else if (action === 'details') {
            if (this.state.selectMode) {
                this.toggleSelected(path, el.closest('.vd-card'));
                return;
            }
            const item = this.findItem(path);
            if (!item) return;
            this.state.back = { mode: this.state.mode, path: this.state.path, show: this.state.show, detail: this.state.detail };
            this.navigate('detail', { detail: item, back: this.state.back });
        } else if (action === 'select-mode') {
            this.toggleSelectMode(!this.state.selectMode);
        } else if (action === 'select-all') {
            this.selectAllVisible();
        } else if (action === 'select-cancel') {
            this.toggleSelectMode(false);
        } else if (action === 'download-selected') {
            this.downloadSelected();
        } else if (action === 'show') {
            this.navigate('series', { show: el.dataset.show });
        } else if (action === 'play') {
            const item = this.findItem(path);
            if (item) this.openPlayer(item);
        } else if (action === 'play-next') {
            const group = this.groupShows(this.state.library?.videos || []).find((g) => g.show === el.dataset.show);
            if (group) this.openPlayer(group.items[0]);
        } else if (action === 'play-next-now') {
            const item = this.findItem(path);
            if (item && this.player) { this.stopPlayer({ quiet: true }); this.openPlayer(item); }
        } else if (action === 'dismiss-next') {
            this.player?.layer.querySelector('[data-role="next"]')?.classList.remove('show');
        } else if (action === 'back') {
            this.goBack();
        } else if (action === 'search') {
            this.state.back = { mode: this.state.mode, path: this.state.path, show: this.state.show, detail: this.state.detail };
            this.navigate('search');
        } else if (action === 'open-shared') {
            this.state.path = path;
            this.state.folder = null;
            this.state.folderLoading = false;
            this.state.mode = 'library';
            this.main.scrollTop = 0;
            this.updateChrome();
            this.loadFolder(path);
        } else if (action === 'share-root') {
            this.ctx.share?.open({ kind: 'path', resource: path })
                .then(() => this.loadShared())
                .catch((err) => this.ctx.logger.error('Could not share folder', String(err)));
        } else if (action === 'open-folder') {
            this.state.path = path;
            this.state.folder = null;
            this.state.folderLoading = false;
            this.state.mode = 'library';
            this.main.scrollTop = 0;
            this.updateChrome();
            this.renderView();
        } else if (action === 'add-folder') {
            this.addFolder();
        } else if (action === 'remove-root') {
            this.removeRoot(path);
        } else if (action === 'refresh') {
            this.refreshLibrary();
        } else if (action === 'save-settings') {
            this.saveSettings();
        } else if (action === 'toggle-list') {
            this.toggleList(path);
        } else if (action === 'download') {
            const picker = el.closest('[data-testid="vd-detail"]')?.querySelector('[data-role="download-version"]');
            this.queueDownload(path, picker?.value || undefined);
        } else if (action === 'download-cancel' || action === 'download-delete') {
            this.cancelDownloadJob(el.dataset.id);
        } else if (action === 'download-refresh') {
            this.loadDownloads(true);
        } else if (action === 'tmdb-test' || action === 'metadata-test') {
            this.metadataTest();
        } else if (action === 'tmdb-refresh-all' || action === 'metadata-refresh-all') {
            this.metadataRefreshAll(el.dataset.force === '1');
        } else if (action === 'metadata-clear-key') {
            this.clearMetadataKey();
        } else if (action === 'tmdb-refresh') {
            this.refreshOne(path);
        } else if (action === 'engine-test') {
            this.engineTest();
        } else if (action === 'layout') {
            this.state.layout = el.dataset.layout === 'list' ? 'list' : 'grid';
            if (this.state.layout !== 'grid') this.state.selectMode = false;
            this.renderView();
        } else if (action === 'more') {
            this.state.visible += 300;
            this.renderView();
        } else if (action === 'recent-search') {
            this.state.query = el.dataset.q || '';
            this.renderView();
        } else if (action === 'close-player') {
            this.stopPlayer();
        } else if (action === 'player-retry') {
            this.retryPlayer();
        } else if (action === 'player-toggle') {
            this.togglePlay(this.player);
        } else if (action === 'player-seek') {
            this.seekTo(this.player, this.absTime(this.player) + Number(el.dataset.delta || 0));
        } else if (action === 'player-stats') {
            this.toggleStats(this.player);
        } else if (action === 'player-pip') {
            this.togglePip(this.player);
        } else if (action === 'player-fullscreen') {
            this.toggleFullscreen(this.player);
        }
    }

    onChange(e) {
        const el = e.target.closest('[data-action], [data-setting]');
        if (!el) return;
        const action = el.dataset.action;
        if (action === 'sort') { this.state.sort = el.value; this.renderView(); }
        else if (action === 'quality') { this.state.quality = el.value; this.renderView(); }
        else if (action === 'genre') { this.state.genre = el.value; this.renderView(); }
        else if (action === 'player-audio') this.changeAudio(this.player, el.value);
        else if (action === 'player-sub') this.loadSubtitle(this.player, el.value).catch((err) => this.toast(`Subtitle failed: ${err.message}`, 'error'));
        else if (action === 'player-quality') this.changeQuality(this.player, el.value);
        else if (action === 'player-speed') {
            try { this.player.video.playbackRate = Number(el.value) || 1; } catch { /* ignore */ }
        }
    }

    onInput(e) {
        const el = e.target.closest('[data-action="search-input"]');
        if (!el) return;
        this.state.query = el.value;
        clearTimeout(this.searchTimer);
        this.searchTimer = setTimeout(() => {
            if (this.state.query.trim()) this.rememberSearch(this.state.query.trim());
            this.renderView();
        }, 180);
    }

    async refreshOne(path) {
        try {
            await this.apiPost('/api/videos/metadata/refresh', { path, force: true });
            this.state.library = null;
            await this.ensureLibrary(true);
            this.renderView();
            this.toast('Metadata refreshed', 'success');
        } catch (err) {
            this.toast(`Metadata refresh failed: ${err.message}`, 'error');
        }
    }

    findItem(path) {
        if (!path) return null;
        const videos = this.state.library?.videos || [];
        return videos.find((v) => v.path === path)
            || (this.state.sharedVideos || []).find((v) => v.path === path)
            || (this.state.home.continue_watching || []).find((v) => v.path === path)
            || (this.state.home.recently_added || []).find((v) => v.path === path)
            || (this.state.folder?.videos || []).find((v) => v.path === path)
            || null;
    }
}
