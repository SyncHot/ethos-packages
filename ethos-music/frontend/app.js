// EthOS NAS — Music app (Spotify-style) — Package Center app
// Visual 1:1 with the ethos-music Android app: bottom nav
// (Start / Szukaj / Podcasty / Biblioteka / Ustawienia), mini-player bar and a
// full-screen player. Light and dark palettes follow the EthOS theme toggle; the
// full-screen player keeps a dark immersion surface. Library state (liked tracks,
// playlists, history, podcast subscriptions) is synced server-side with the
// Android app via /api/music/state.
//
// The /api/music/* API stays in the EthOS core (the Android app uses it); this
// package owns the desktop UI. Search/stream/download need the separate
// `ethos-music-engine` package.

// ── Native-module shim ────────────────────────────────────────────────────────
let _ctx = null;

function getToken() {
    return localStorage.getItem('token') || '';
}

async function apiJsonFetch(path, options = {}) {
    const res = await _ctx.apiFetch(path, options);
    if (!res.ok) {
        let detail = '';
        try {
            const payload = await res.clone().json();
            detail = payload?.detail || payload?.error || '';
        } catch (_) { /* non-JSON error body */ }
        const err = new Error(detail || `HTTP ${res.status}`);
        err.status = res.status;
        err.detail = detail;
        throw err;
    }
    if (res.status === 204) return null;
    return res.json();
}

// ── Palette (ethos-music Theme.kt) ───────────────────────────────────
// Theme-aware tokens: light is the default (matching EthOS), `:root.dark`
// overrides them. The full-screen player keeps its own dark immersion palette.
const C = {
    black: 'var(--em-bg)', nav: 'var(--em-nav)', card: 'var(--em-card)',
    elevated: 'var(--em-elevated)', green: '#1DB954', greenDark: '#169C46',
    secondary: 'var(--em-muted)', white: 'var(--em-text)',
};

// Search category tiles (SearchScreen.kt). Queries are Polish on purpose: the
// NAS re-ranks YouTube results after folding diacritics.
const CATEGORIES = [
    { name: 'Polskie hity', query: 'polskie hity 2025', color: '#E13300' },
    { name: 'Polski rap', query: 'polski rap', color: '#D80073' },
    { name: 'Disco polo', query: 'disco polo klasyki', color: '#8D67AB' },
    { name: 'Rock', query: 'polski rock klasyka', color: '#DA2B60' },
    { name: 'Elektronika', query: 'polska muzyka elektroniczna', color: '#148A08' },
    { name: 'Jazz', query: 'polski jazz', color: '#F5A800' },
    { name: 'Klasyka', query: 'muzyka klasyczna chopin', color: '#537EEC' },
    { name: 'Podcasty', query: 'kryminał', color: '#B0C4DE' },
];

// Podcast discovery is served by the NAS (`/api/music/podcasts/catalog`, built by
// scripts/build_podcast_catalog.py) — the old hardcoded 20-entry list is gone so
// the web and the Android app always see the same catalog.

// ── Icons (Material-style, 24dp viewBox) ────────────────────────────
const ICONS = {
    home: '<path d="M12 3l9 8h-3v9h-5v-6h-2v6H6v-9H3z"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.4"/><line x1="15.5" y1="15.5" x2="21" y2="21" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
    rss: '<circle cx="6" cy="18" r="3"/><path d="M3 9.5a9.5 9.5 0 0 1 9.5 9.5H3z"/><path d="M3 2.5A16.5 16.5 0 0 1 19.5 19V2.5z"/>',
    library: '<rect x="4" y="4" width="3" height="16" rx="1"/><rect x="9.5" y="7" width="3" height="13" rx="1"/><rect x="15" y="10" width="3" height="10" rx="1"/>',
    settings: '<circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="2.6"/>' + [0, 45, 90, 135].map(a => `<rect x="10.7" y="1.5" width="2.6" height="4.4" rx="1.2" transform="rotate(${a} 12 12)"/>`).join(''),
    radio: '<path d="M12 3a9 9 0 0 0-9 9h2a7 7 0 0 1 14 0h2a9 9 0 0 0-9-9zm0 4a5 5 0 0 0-5 5h2a3 3 0 0 1 6 0h2a5 5 0 0 0-5-5zm0 4a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6z"/>',
    play: '<path d="M8 5v14l11-7z"/>',
    pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
    next: '<path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>',
    prev: '<path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>',
    shuffle: '<path d="M10.59 9.17L5.42 4 4 5.42l5.17 5.17 1.42-1.42zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/>',
    repeat: '<path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>',
    more: '<circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>',
    heart: '<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>',
    close: '<line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
    chevronDown: '<polyline points="6,9 12,15 18,9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
    queue: '<path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/>',
    add: '<line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
    del: '<path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>',
    note: '<path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>',
    check: '<polyline points="5,13 9,17 19,7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
    download: '<path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"/>',
    timer: '<path d="M15 1H9v2h6V1zm-4 13h2V8h-2v6zm8.03-6.61l1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42A8.96 8.96 0 0 0 12 4a9 9 0 1 0 9 9c0-2.12-.74-4.07-1.97-5.61z"/>',
};

function icon(name, size = 24) {
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

// ── Scoped styles (injected once into <head>) ────────────────────────
let _stylesInjected = false;
function ensureStyles() {
    if (_stylesInjected) return;
    _stylesInjected = true;
    const st = document.createElement('style');
    st.id = 'em-music-styles';
    st.textContent = `
.em-root, .em-menu {
    --em-bg: #f6f6f6;
    --em-nav: #ffffff;
    --em-card: #ffffff;
    --em-elevated: #ececec;
    --em-elevated-hover: #e2e2e2;
    --em-panel: #ffffff;
    --em-text: #121212;
    --em-muted: #5c5c5c;
    --em-thumb: #e2e2e2;
    --em-hover: rgba(0, 0, 0, 0.07);
    --em-stroke: rgba(0, 0, 0, 0.09);
    --em-track: rgba(0, 0, 0, 0.16);
    --em-chip-active-bg: #121212;
    --em-chip-active-fg: #ffffff;
    --em-play-bg: #121212;
    --em-play-fg: #ffffff;
    --em-shadow: 0 14px 44px rgba(15, 23, 42, 0.18);
}
:root.dark .em-root, :root.dark .em-menu {
    --em-bg: #121212;
    --em-nav: #181818;
    --em-card: #1F1F1F;
    --em-elevated: #2A2A2A;
    --em-elevated-hover: #333333;
    --em-panel: #1a1a1a;
    --em-text: #ffffff;
    --em-muted: #A7A7A7;
    --em-thumb: #3a3a3a;
    --em-hover: rgba(255, 255, 255, 0.1);
    --em-stroke: rgba(255, 255, 255, 0.08);
    --em-track: rgba(255, 255, 255, 0.2);
    --em-chip-active-bg: #ffffff;
    --em-chip-active-fg: #121212;
    --em-play-bg: #ffffff;
    --em-play-fg: #000000;
    --em-shadow: 0 14px 44px rgba(0, 0, 0, 0.55);
}
.em-root{position:relative;display:flex;flex-direction:column;height:100%;background:var(--em-bg);color:var(--em-text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;overflow:hidden;user-select:none;color-scheme:light;}
:root.dark .em-root{color-scheme:dark;}
.em-content{flex:1;overflow-y:auto;padding:24px 28px 16px;scrollbar-width:thin;scrollbar-color:var(--em-thumb) transparent;}
.em-content::-webkit-scrollbar{width:9px}
.em-content::-webkit-scrollbar-thumb{background:var(--em-thumb);border-radius:5px}
.em-h1{font-size:28px;font-weight:700;margin-bottom:20px;letter-spacing:-.3px}
.em-section-title{font-size:16px;font-weight:600;color:${C.white};margin:22px 0 12px}
.em-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(158px,1fr));gap:14px}
.em-card{background:${C.card};border-radius:10px;padding:12px;cursor:pointer;transition:background .15s;min-width:0}
.em-card:hover{background:${C.elevated}}
.em-card-cover{width:100%;aspect-ratio:1/1;border-radius:8px;object-fit:cover;display:block;background:var(--em-thumb);margin-bottom:10px}
.em-card-label{font-size:13.5px;font-weight:600;color:${C.white};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.em-card-sub{font-size:12px;color:${C.secondary};margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.em-tile{border-radius:12px;height:96px;display:flex;align-items:flex-end;padding:14px;font-weight:700;font-size:15px;color:#fff;cursor:pointer;position:relative;overflow:hidden}
.em-tile:hover::after{content:'';position:absolute;inset:0;background:rgba(255,255,255,.08)}
.em-searchfield{width:100%;box-sizing:border-box;background:${C.elevated};border:none;border-radius:999px;padding:14px 22px;font-size:15px;color:${C.white};outline:none;margin-bottom:6px}
.em-searchfield::placeholder{color:${C.secondary}}
.em-chips{display:flex;gap:8px;flex-wrap:wrap;padding:10px 0 4px}
.em-chip{background:${C.elevated};border:none;color:${C.white};border-radius:999px;padding:7px 14px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap}
.em-chip:hover{background:var(--em-elevated-hover)}
.em-chip.active{background:var(--em-chip-active-bg);color:var(--em-chip-active-fg)}
.em-suggest{margin:2px 0 6px;display:flex;flex-direction:column;gap:2px}
.em-suggest-item{display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:8px;cursor:pointer;background:var(--em-hover)}
.em-suggest-item:hover{background:var(--em-elevated-hover)}
.em-suggest-kind{font-size:10.5px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:${C.secondary};width:66px;flex:none}
.em-suggest-thumb{width:30px;height:30px;border-radius:5px;object-fit:cover;background:var(--em-thumb);flex:none;display:block}
.em-suggest-main{min-width:0;flex:1}
.em-suggest-title{font-size:13.5px;font-weight:600;color:${C.white};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.em-suggest-sub{font-size:11.5px;color:${C.secondary};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.em-more{display:block;width:100%;margin:14px 0 4px;background:${C.elevated};border:none;color:${C.white};padding:11px;border-radius:8px;font-size:13.5px;font-weight:600;cursor:pointer;font-family:inherit}
.em-more:hover{background:var(--em-elevated-hover)}
.em-row-logo{width:48px;height:48px;border-radius:6px;object-fit:contain;background:var(--em-thumb);flex:none;padding:5px;box-sizing:border-box}
.em-row{display:flex;align-items:center;gap:14px;padding:7px 10px;border-radius:8px;cursor:pointer;min-width:0}
.em-row:hover{background:var(--em-hover)}
.em-row-idx{width:18px;text-align:center;font-size:13px;color:${C.secondary};flex:none;font-variant-numeric:tabular-nums}
.em-row-thumb{width:48px;height:48px;border-radius:6px;object-fit:cover;background:var(--em-thumb);flex:none;display:block}
.em-row-main{flex:1;min-width:0}
.em-row-title{font-size:14.5px;font-weight:600;color:${C.white};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.em-row-sub{font-size:12.5px;color:${C.secondary};margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.em-row-dur{font-size:12.5px;color:${C.secondary};flex:none;font-variant-numeric:tabular-nums;padding-right:4px}
.em-iconbtn{background:none;border:none;color:${C.white};cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:6px;border-radius:999px;opacity:.85;flex:none}
.em-iconbtn:hover{background:var(--em-hover);opacity:1}
.em-iconbtn.hidden-idx{visibility:hidden}
.em-row:hover .hidden-idx{visibility:visible}
.em-mini{margin:0 10px 6px;background:${C.elevated};border-radius:10px;padding:9px 12px;display:flex;align-items:center;gap:12px;position:relative;overflow:hidden;cursor:pointer;flex:none}
.em-mini:hover{background:var(--em-elevated-hover)}
.em-mini-progress{position:absolute;top:0;left:0;height:2.5px;background:${C.green};width:0%}
.em-mini-thumb{width:42px;height:42px;border-radius:6px;object-fit:cover;background:var(--em-thumb);flex:none;display:block}
.em-mini-main{flex:1;min-width:0}
.em-mini-title{font-size:13.5px;font-weight:600;color:${C.white};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.em-mini-sub{font-size:12px;color:${C.secondary};margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.em-nav{display:flex;background:${C.nav};padding:6px 14px 8px;gap:0;flex:none}
.em-navitem{flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;background:none;border:none;color:${C.secondary};cursor:pointer;padding:4px 0;font-size:11px;font-weight:600;font-family:inherit}
.em-navitem.active{color:${C.white}}
.em-full{position:absolute;inset:0;z-index:40;display:flex;flex-direction:column;background:#121212;color:#fff;overflow:hidden;--em-text:#fff;--em-muted:#A7A7A7;--em-elevated:rgba(255,255,255,.12);--em-elevated-hover:rgba(255,255,255,.18);--em-thumb:#3a3a3a;--em-panel:#1a1a1a;--em-hover:rgba(255,255,255,.12);--em-track:rgba(255,255,255,.2);--em-play-bg:#fff;--em-play-fg:#000;}
.em-full-bg{position:absolute;inset:-60px;background-size:cover;background-position:center;filter:blur(52px) brightness(.5);transform:scale(1.3)}
.em-full-inner{position:relative;z-index:1;display:flex;flex-direction:column;height:100%;padding:14px 28px 26px}
.em-full-head{display:flex;align-items:center;justify-content:space-between;padding-bottom:10px}
.em-full-label{font-size:11.5px;font-weight:700;color:${C.secondary};letter-spacing:.8px;text-transform:uppercase}
.em-art-wrap{flex:1;display:flex;align-items:center;justify-content:center;min-height:0;padding:6px 0}
.em-art{width:min(320px,58%);aspect-ratio:1/1;border-radius:14px;object-fit:cover;background:var(--em-thumb);box-shadow:0 18px 60px rgba(0,0,0,.6)}
.em-trackline{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 4px}
.em-track-title{font-size:19px;font-weight:700;color:${C.white};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.em-track-sub{font-size:13.5px;color:${C.secondary};margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.em-sliderrow{display:flex;align-items:center;gap:10px;padding:2px 4px}
.em-time{font-size:11.5px;color:${C.secondary};width:40px;font-variant-numeric:tabular-nums}
.em-time.right{text-align:right}
input[type=range].em-range{-webkit-appearance:none;appearance:none;flex:1;height:4px;border-radius:2px;background:var(--em-track);outline:none;cursor:pointer}
input[type=range].em-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:12px;height:12px;border-radius:50%;background:var(--em-text);border:none;box-shadow:0 1px 4px rgba(0,0,0,.5)}
input[type=range].em-range::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:var(--em-text);border:none}
.em-controls{display:flex;align-items:center;justify-content:center;gap:26px;padding-top:14px}
.em-ctl{background:none;border:none;color:${C.secondary};cursor:pointer;display:inline-flex;padding:6px;border-radius:999px}
.em-ctl:hover{color:${C.white}}
.em-ctl.on{color:${C.green}}
.em-playbig{width:62px;height:62px;border-radius:50%;background:var(--em-play-bg);border:none;color:var(--em-play-fg);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0}
.em-playbig:hover{transform:scale(1.04)}
.em-queuepanel{position:absolute;top:0;right:0;bottom:0;width:min(360px,85%);background:var(--em-panel);z-index:2;display:flex;flex-direction:column;border-left:1px solid var(--em-stroke)}
.em-queuehead{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;font-weight:700;font-size:15px}
.em-queuelist{flex:1;overflow-y:auto;padding:0 10px 20px}
.em-menu{position:fixed;z-index:9000;background:var(--em-panel);border-radius:10px;padding:6px 0;min-width:210px;box-shadow:var(--em-shadow);border:1px solid var(--em-stroke)}
.em-menuitem{display:flex;align-items:center;gap:10px;width:100%;background:none;border:none;color:var(--em-text);font-size:13.5px;padding:9px 16px;cursor:pointer;text-align:left;font-family:inherit}
.em-menuitem:hover{background:var(--em-hover)}
.em-dialog-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.7);z-index:60;display:flex;align-items:center;justify-content:center}
.em-dialog{background:var(--em-panel);border:1px solid var(--em-stroke);border-radius:14px;width:min(380px,90%);max-height:80%;display:flex;flex-direction:column;padding:20px}
.em-dialog h3{margin:0 0 14px;font-size:16.5px}
.em-dialog input[type=text]{width:100%;box-sizing:border-box;background:${C.card};border:none;border-radius:8px;padding:11px 14px;color:${C.white};font-size:13.5px;outline:none;margin-bottom:12px}
.em-dialog-list{overflow-y:auto;display:flex;flex-direction:column;gap:2px;margin-bottom:14px}
.em-dialog-btnrow{display:flex;justify-content:flex-end;gap:10px}
.em-btn{background:${C.green};color:#fff;border:none;border-radius:999px;padding:10px 22px;font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit}
.em-btn:hover{background:${C.greenDark}}
.em-btn.ghost{background:transparent;color:${C.white}}
.em-btn.ghost:hover{text-decoration:underline;background:transparent}
.em-detail-head{display:flex;align-items:flex-end;gap:20px;margin-bottom:18px}
.em-detail-cover{width:164px;height:164px;border-radius:10px;object-fit:cover;background:var(--em-thumb);flex:none;box-shadow:0 12px 40px rgba(0,0,0,.5)}
.em-detail-label{font-size:11.5px;font-weight:700;color:${C.secondary};letter-spacing:.8px;text-transform:uppercase}
.em-detail-title{font-size:34px;font-weight:800;margin:6px 0 8px;letter-spacing:-.5px;line-height:1.05}
.em-detail-meta{font-size:13px;color:${C.secondary}}
.em-detail-actions{display:flex;align-items:center;gap:14px;margin-bottom:20px}
.em-playcircle{width:48px;height:48px;border-radius:50%;background:${C.green};border:none;color:#fff;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0}
.em-playcircle:hover{background:${C.greenDark};transform:scale(1.03)}
.em-smcircle{width:36px;height:36px;border-radius:50%;background:var(--em-elevated);border:none;color:var(--em-text);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0}
.em-smcircle:hover{background:var(--em-elevated-hover)}
.em-empty{color:${C.secondary};font-size:14px;padding:30px 6px;text-align:center;line-height:1.7}
.em-spin{width:26px;height:26px;border:3px solid var(--em-track);border-top-color:${C.green};border-radius:50%;animation:emrot .8s linear infinite;margin:0 auto}
@keyframes emrot{to{transform:rotate(360deg)}}
.em-settings-card{background:${C.card};border-radius:12px;padding:18px 20px;max-width:560px;margin-bottom:14px}
.em-settings-card h4{margin:0 0 4px;font-size:14.5px}
.em-settings-card p{margin:0 0 12px;font-size:12.5px;color:${C.secondary};line-height:1.6}
.em-settings-inputrow{display:flex;gap:10px}
.em-settings-inputrow input[type=text]{flex:1;background:${C.elevated};border:none;border-radius:8px;padding:10px 13px;color:${C.white};font-size:13px;outline:none;font-family:ui-monospace,Menlo,monospace}
`;
    document.head.appendChild(st);
}

// ── DOM helpers ──────────────────────────────────────────────────────
function el(tag, attrs = {}, ...children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') n.className = v;
        else if (k === 'html') n.innerHTML = v;
        else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
        else if (v === true) n.setAttribute(k, '');
        else n.setAttribute(k, v);
    }
    for (const c of children.flat()) {
        if (c == null || c === false) continue;
        if (typeof c === 'string') {
            // icon() zwraca string SVG — wstawiamy go jako element, nie tekst.
            if (/^<svg viewBox="0 0 24 24"/.test(c)) {
                const tmp = document.createElement('div');
                tmp.innerHTML = c;
                while (tmp.firstChild) n.appendChild(tmp.firstChild);
            } else n.appendChild(document.createTextNode(c));
        } else n.appendChild(c);
    }
    return n;
}

function fmtDur(sec) {
    sec = Math.max(0, Math.floor(Number(sec) || 0));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtDate(epochSec) {
    if (!epochSec) return '';
    const d = new Date(Number(epochSec) * 1000);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
}

function tkey(t) { return `${t.id}|${t.title}`; }

// ── Audio engine (module-level singleton — playback survives re-renders)
class Engine {
    constructor() {
        this.audio = new Audio();
        this.queue = [];
        this.index = -1;
        this.shuffle = false;
        this.repeat = 'off'; // off | all | one
        this._retried = false;
        this._subs = {};
        // Sesja przywrócona z localStorage czeka na pierwsze „play” — nie pobieramy
        // wtedy strumienia (i nie odpalamy yt-dlp na NAS) tylko po to, by pokazać mini-pasek.
        this._restoredPending = false;
        this._restoredPos = 0;
        this._lastSessionSave = 0;
        this.audio.addEventListener('timeupdate', () => {
            this._emit('time', { pos: this.audio.currentTime || 0, dur: this.audio.duration || 0 });
            if (Date.now() - this._lastSessionSave > 5000) {
                this._lastSessionSave = Date.now();
                this.saveSession();
            }
        });
        this.audio.addEventListener('play', () => { this._emit('playing'); this._updateMediaSession(); this.saveSession(); });
        this.audio.addEventListener('pause', () => { this._emit('playing'); this._updateMediaSession(); this.saveSession(); });
        this.audio.addEventListener('ended', () => this._onEnded());
        this.audio.addEventListener('error', () => this._onError());
        this._setupMediaSession();
    }

    /** Media keys / ekran blokady / pilot — to samo, co robi MediaSession w apce Android. */
    _setupMediaSession() {
        if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
        const ms = navigator.mediaSession;
        const set = (action, handler) => {
            try { ms.setActionHandler(action, handler); } catch (e) { /* akcja nieobsługiwana */ }
        };
        set('play', () => { if (this.current) this.toggle(); });
        set('pause', () => this.audio.pause());
        set('previoustrack', () => { if (this.current) this.prev(); });
        set('nexttrack', () => { if (this.current) this.next(); });
        set('seekbackward', (d) => this.seek(Math.max(0, (this.audio.currentTime || 0) - (d?.seekOffset || 10))));
        set('seekforward', (d) => this.seek((this.audio.currentTime || 0) + (d?.seekOffset || 10)));
        set('seekto', (d) => { if (d && Number.isFinite(d.seekTime)) this.seek(d.seekTime); });
        set('stop', () => this.audio.pause());
    }

    _updateMediaSession() {
        if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
        const t = this.current;
        try {
            navigator.mediaSession.metadata = t ? new MediaMetadata({
                title: t.title || 'EthOS Music',
                artist: t.artist || '',
                album: 'EthOS Music',
                artwork: t.thumb ? [{ src: t.thumb, sizes: '512x512', type: 'image/jpeg' }] : [],
            }) : null;
            navigator.mediaSession.playbackState = this.isPlaying ? 'playing' : 'paused';
        } catch (e) { /* MediaMetadata niedostępne (starsza przeglądarka) */ }
    }

    // ── Sesja odtwarzania (przetrwa odświeżenie strony) ──────────────────
    saveSession() {
        if (!this.current) return;
        try {
            localStorage.setItem('ethos.music.session', JSON.stringify({
                queue: this.queue,
                index: this.index,
                pos: Number(this.audio.currentTime) || 0,
                shuffle: this.shuffle,
                repeat: this.repeat,
            }));
        } catch (e) { /* tryb prywatny / brak miejsca */ }
    }

    restoreSession() {
        try {
            if (this.queue.length || this.current) return; // trwa odtwarzanie — nie nadpisujemy
            const raw = JSON.parse(localStorage.getItem('ethos.music.session') || 'null');
            if (!raw || !Array.isArray(raw.queue) || !raw.queue.length) return;
            this.queue = raw.queue;
            this.index = Math.min(Math.max(0, Number(raw.index) || 0), raw.queue.length - 1);
            this.shuffle = !!raw.shuffle;
            this.repeat = raw.repeat || 'off';
            if (!this.current) return;
            this._restoredPending = true;
            this._restoredPos = Number(raw.pos) || 0;
            this._emit('track');
            this._updateMediaSession();
        } catch (e) { /* uszkodzony zapis — start od zera */ }
    }

    get current() { return this.queue[this.index] || null; }
    get isPlaying() { return !this.audio.paused && !this.audio.ended; }

    // Keyed subscriptions: re-adding with the same key replaces the old handler.
    on(evt, fn, key = null) {
        const arr = this._subs[evt] || (this._subs[evt] = []);
        if (key != null) for (let i = arr.length - 1; i >= 0; i--) if (arr[i].key === key) arr.splice(i, 1);
        arr.push({ fn, key });
    }

    off(evt, key) {
        const arr = this._subs[evt] || [];
        for (let i = arr.length - 1; i >= 0; i--) if (arr[i].key === key) arr.splice(i, 1);
    }

    _emit(evt, data) { (this._subs[evt] || []).forEach(s => s.fn(data)); }

    playQueue(tracks, start = 0) {
        if (!tracks.length) return;
        this.queue = tracks.slice();
        this.index = Math.min(start, this.queue.length - 1);
        this._playCurrent();
    }

    _pickNext() {
        const n = this.queue.length;
        if (n <= 1) return this.index;
        if (this.shuffle) {
            let i; do { i = Math.floor(Math.random() * n); } while (i === this.index);
            return i;
        }
        return (this.index + 1) % n;
    }

    _playCurrent() {
        const t = this.current;
        if (!t) return;
        this._retried = false;
        this._restoredPending = false;
        this.audio.src = streamUrl(t);
        this.audio.play().catch(() => {});
        this._emit('track');
        this._updateMediaSession();
        this.saveSession();
        // Playback history (synced with the Android app) — fire and forget.
        // Radio streams are "live" and not part of the history.
        if (!t.is_live) {
            apiJsonFetch('/api/music/history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ track: t }) }).catch(() => {});
        }
    }

    _onEnded() {
        if (this.repeat === 'one') { this.audio.currentTime = 0; this.audio.play().catch(() => {}); return; }
        const n = this.queue.length;
        if (!n) return;
        if (!this.shuffle && this.index === n - 1 && this.repeat !== 'all') { this._emit('playing'); return; }
        this.index = this._pickNext();
        this._playCurrent();
    }

    _onError() {
        // Stream URLs expire — retry once with a fresh load.
        if (this._retried || !this.current) return;
        const wasPlaying = !this.audio.paused;
        this._retried = true;
        setTimeout(() => {
            try { this.audio.load(); } catch (e) { /* noop */ }
            if (wasPlaying) this.audio.play().catch(() => {});
        }, 600);
    }

    next() { if (!this.queue.length) return; this.index = this._pickNext(); this._playCurrent(); }
    prev() {
        if (!this.queue.length) return;
        if ((this.audio.currentTime || 0) > 3) { this.audio.currentTime = 0; return; }
        const n = this.queue.length;
        this.index = (this.index - 1 + n) % n;
        this._playCurrent();
    }

    toggle() {
        if (!this.current) return;
        if (this._restoredPending) {
            // Przywrócona sesja: ładujemy strumień dopiero teraz (patrz restoreSession).
            const t = this.current;
            const pos = this._restoredPos || 0;
            this._restoredPending = false;
            this.audio.src = streamUrl(t);
            if (pos > 1) {
                this.audio.addEventListener('loadedmetadata', () => {
                    try { this.audio.currentTime = pos; } catch (e) { /* live */ }
                }, { once: true });
            }
            this.audio.play().catch(() => {});
            return;
        }
        if (this.isPlaying) this.audio.pause(); else this.audio.play().catch(() => {});
    }

    seek(sec) { try { this.audio.currentTime = sec; } catch (e) { /* noop */ } }

    addToQueue(t) { this.queue.push(t); this._emit('queue'); }
    playNext(t) { this.queue.splice(this.index + 1, 0, t); this._emit('queue'); }
    jumpTo(i) { if (i < 0 || i >= this.queue.length) return; this.index = i; this._playCurrent(); }

    toggleShuffle() { this.shuffle = !this.shuffle; this._emit('mode'); }
    cycleRepeat() { this.repeat = this.repeat === 'off' ? 'all' : this.repeat === 'all' ? 'one' : 'off'; this._emit('mode'); }

    // ── Wyłącznik czasowy (15 → 30 → 60 → wył.) ──────────────────────
    setSleepTimer(minutes) {
        if (this._sleepTimer) { clearTimeout(this._sleepTimer); this._sleepTimer = null; }
        this._sleepMinutes = minutes > 0 ? minutes : 0;
        this._sleepEndsAt = this._sleepMinutes ? Date.now() + this._sleepMinutes * 60_000 : 0;
        if (!this._sleepMinutes) { this._emit('sleep'); return; }
        const tick = () => {
            if (Date.now() >= this._sleepEndsAt) {
                this.audio.pause();
                this._sleepMinutes = 0;
                this._sleepEndsAt = 0;
                this._sleepTimer = null;
                this._emit('sleep');
                return;
            }
            this._emit('sleep');
            this._sleepTimer = setTimeout(tick, 1000);
        };
        this._emit('sleep');
        this._sleepTimer = setTimeout(tick, 1000);
    }

    get sleepMinutes() { return this._sleepMinutes || 0; }
    get sleepLeftMs() { return this._sleepEndsAt ? Math.max(0, this._sleepEndsAt - Date.now()) : 0; }
}

function streamUrl(t) {
    const url = t.file_url || `/api/music/stream?video_id=${encodeURIComponent(t.id)}`;
    if (!url.startsWith('/')) return url; // external podcast enclosure — public URL
    // Local NAS URLs: <audio> can't send an Authorization header, so pass the JWT
    // as a query param (accepted by the auth middleware), like video-station does.
    const token = encodeURIComponent(getToken() || '');
    return `${url}${url.includes('?') ? '&' : '?'}token=${token}`;
}

const engine = new Engine();

// ── Library state (server-synced with the Android app) ───────────────
const store = {
    liked: [], playlists: [], history: [], podcasts: { subscribed: [], episodes: {} },
    sharedPlaylists: [],
    loaded: false,

    async load() {
        try {
            const st = await apiJsonFetch('/api/music/state');
            this.liked = st.liked || [];
            this.playlists = st.playlists || [];
            this.history = st.history || [];
            this.podcasts = st.podcasts || { subscribed: [], episodes: {} };
            this.loaded = true;
        } catch (e) { /* offline — UI works with empty state */ }
        await this.loadShared();
    },

    async loadShared() {
        try {
            const d = await apiJsonFetch('/api/sharing/incoming?kind=playlist');
            this.sharedPlaylists = d.grants || [];
        } catch (e) { this.sharedPlaylists = []; }
    },

    isLiked(t) { return this.liked.some(x => tkey(x) === tkey(t)); },

    async toggleLike(t, toastFn) {
        const liked = this.isLiked(t);
        try {
            if (liked) await apiJsonFetch('/api/music/liked', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: tkey(t) }) });
            else await apiJsonFetch('/api/music/liked', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ track: t }) });
        } catch (e) { toastFn('Polubienia nie zsynchronizowane — brak połączenia'); return; }
        if (liked) this.liked = this.liked.filter(x => tkey(x) !== tkey(t));
        else this.liked.push(t);
    },

    async createPlaylist(name, toastFn) {
        try {
            const pl = await apiJsonFetch('/api/music/playlists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
            this.playlists.push(pl);
            return pl;
        } catch (e) { toastFn('Nie udało się utworzyć playlisty'); return null; }
    },

    async deletePlaylist(pid, toastFn) {
        try { await apiJsonFetch(`/api/music/playlists/${pid}`, { method: 'DELETE' }); }
        catch (e) { toastFn('Nie udało się usunąć playlisty'); return false; }
        this.playlists = this.playlists.filter(p => p.id !== pid);
        return true;
    },

    async addToPlaylist(pid, t, toastFn) {
        try { await apiJsonFetch(`/api/music/playlists/${pid}/tracks`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ track: t }) }); }
        catch (e) { toastFn('Nie udało się dodać do playlisty'); return false; }
        const pl = this.playlists.find(p => p.id === pid);
        if (pl && !pl.tracks.some(x => tkey(x) === tkey(t))) pl.tracks.push(t);
        return true;
    },

    async removeFromPlaylist(pid, key, toastFn) {
        try { await apiJsonFetch(`/api/music/playlists/${pid}/tracks`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) }); }
        catch (e) { toastFn('Nie udało się usunąć z playlisty'); return false; }
        const pl = this.playlists.find(p => p.id === pid);
        if (pl) pl.tracks = pl.tracks.filter(x => tkey(x) !== key);
        return true;
    },

    async subscribe(pod, toastFn) {
        try { await apiJsonFetch('/api/music/podcasts/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ podcast: pod }) }); }
        catch (e) { toastFn('Nie udało się dodać subskrypcji'); return false; }
        if (!this.podcasts.subscribed.some(s => s.rss_url === pod.rss_url)) this.podcasts.subscribed.push(pod);
        return true;
    },

    async unsubscribe(pid, toastFn) {
        try { await apiJsonFetch(`/api/music/podcasts/${pid}`, { method: 'DELETE' }); }
        catch (e) { toastFn('Nie udało się usunąć subskrypcji'); return false; }
        this.podcasts.subscribed = this.podcasts.subscribed.filter(s => s.id !== pid);
        delete this.podcasts.episodes[pid];
        return true;
    },

    async saveEpisodes(pid, episodes) {
        try { await apiJsonFetch(`/api/music/podcasts/${pid}/episodes`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ episodes }) }); }
        catch (e) { return false; }
        if (episodes.length) this.podcasts.episodes[pid] = episodes; else delete this.podcasts.episodes[pid];
        return true;
    },

    async fetchFeed(rssUrl, toastFn) {
        const res = await apiJsonFetch(`/api/music/podcast-feed?url=${encodeURIComponent(rssUrl)}&limit=25`);
        const pod = { id: await sha16(rssUrl), title: res.title || 'Podcast', desc: res.description || '', rss_url: rssUrl, cover: res.cover_url || '' };
        await this.subscribe(pod, toastFn);
        // Adopt the server-authoritative subscription (its id is computed from
        // the RSS URL) so episode storage keys match across clients.
        try {
            const st = await apiJsonFetch('/api/music/state');
            this.podcasts.subscribed = st.podcasts.subscribed || [];
            if (st.podcasts && st.podcasts.episodes) this.podcasts.episodes = st.podcasts.episodes;
        } catch (e) { /* keep local copy */ }
        const sub = this.podcasts.subscribed.find(s => s.rss_url === rssUrl);
        if (sub) {
            pod.id = sub.id; pod.title = sub.title || pod.title; pod.desc = sub.desc || pod.desc;
            if (sub.cover) pod.cover = sub.cover;
        }
        await this.saveEpisodes(pod.id, res.episodes || []);
        return pod;
    },
};

// ── Radio (live stations) — mirror of ethos-music RadioScreen.kt ──────
// Catalog comes from the NAS (`/api/music/radio/stations`) so the browser and
// the phone share one list. Favourites/recently played are stored on the NAS
// per user (`/api/music/radio/state`); localStorage is only an offline cache.
const radioStore = {
    key: 'ethos.music.radio',
    favorites: [],
    recent: [],

    load() {
        try {
            const raw = JSON.parse(localStorage.getItem(this.key) || '{}');
            this.favorites = Array.isArray(raw.favorites) ? raw.favorites : [];
            this.recent = Array.isArray(raw.recent) ? raw.recent : [];
        } catch (e) { this.favorites = []; this.recent = []; }
    },

    save() {
        try {
            localStorage.setItem(this.key, JSON.stringify({ favorites: this.favorites, recent: this.recent }));
        } catch (e) { /* private mode — favourites just won't persist */ }
    },

    isFavorite(id) { return this.favorites.includes(id); },

    toggleFavorite(id) {
        this.favorites = this.isFavorite(id) ? this.favorites.filter(x => x !== id) : [id, ...this.favorites];
        this.save();
        pushRadioState();
    },

    markPlayed(id) {
        this.recent = [id, ...this.recent.filter(x => x !== id)].slice(0, 8);
        this.save();
        pushRadioState();
    },

    /** Merge the server document with the local cache (union, server first). */
    applyServer(state) {
        const favs = Array.isArray(state?.favorites) ? state.favorites : [];
        const recents = Array.isArray(state?.recents) ? state.recents : [];
        this.favorites = [...new Set([...favs, ...this.favorites])];
        this.recent = [...new Set([...recents, ...this.recent])].slice(0, 8);
        this.save();
    },

    async syncFromServer() {
        try {
            const state = await apiJsonFetch('/api/music/radio/state');
            const empty = !(state?.favorites || []).length && !(state?.recents || []).length;
            this.applyServer(state);
            if (empty && (this.favorites.length || this.recent.length)) pushRadioState();
        } catch (e) { /* offline — local cache is enough */ }
    },
};
radioStore.load();

let radioPushTimer = null;
function pushRadioState() {
    clearTimeout(radioPushTimer);
    radioPushTimer = setTimeout(() => {
        apiJsonFetch('/api/music/radio/state', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ favorites: radioStore.favorites, recents: radioStore.recent }),
        }).catch(() => { /* offline — retried on the next change */ });
    }, 700);
}

const radioCatalog = {
    data: null,
    loading: false,
    error: '',

    async ensure(reload = false) {
        if (reload) this.data = null;
        if (this.data || this.loading) return this.data;
        this.loading = true;
        this.error = '';
        try {
            const res = await apiJsonFetch('/api/music/radio/stations');
            this.data = { categories: res.categories || [], stations: res.stations || [] };
        } catch (e) {
            this.error = 'Nie udało się wczytać listy stacji radiowych';
        } finally {
            this.loading = false;
        }
        return this.data;
    },

    station(id) { return (this.data?.stations || []).find(s => s.id === id) || null; },
};

// ── Podcast discovery catalog (served by the NAS) ────────────────────
const podcastCatalog = {
    data: null,
    loading: false,
    error: '',

    async ensure(reload = false) {
        if (reload) this.data = null;
        if (this.data || this.loading) return this.data;
        this.loading = true;
        this.error = '';
        try {
            const res = await apiJsonFetch('/api/music/podcasts/catalog?limit=0');
            this.data = {
                categories: res.categories || [],
                items: res.items || [],
                total: res.total || 0,
                generatedAt: res.generated_at || '',
            };
        } catch (e) {
            this.error = 'Nie udało się wczytać katalogu podcastów';
        } finally {
            this.loading = false;
        }
        return this.data;
    },
};

// Polish folding — must match backend/services/music_search.fold().
function foldPl(value) {
    return String(value || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/ł/g, 'l').replace(/Ł/g, 'l')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

// ── Search history (local, capped) ───────────────────────────────────
const SEARCH_HISTORY_KEY = 'ethos.music.search.history';
const SEARCH_HISTORY_CAP = 8;

function loadSearchHistory() {
    try {
        const raw = JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]');
        return Array.isArray(raw) ? raw.filter(x => typeof x === 'string').slice(0, SEARCH_HISTORY_CAP) : [];
    } catch (e) { return []; }
}

function pushSearchHistory(query) {
    const q = String(query || '').trim();
    if (!q) return;
    const next = [q, ...loadSearchHistory().filter(x => x.toLowerCase() !== q.toLowerCase())]
        .slice(0, SEARCH_HISTORY_CAP);
    try { localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next)); } catch (e) { /* private mode */ }
}

function clearSearchHistory() {
    try { localStorage.removeItem(SEARCH_HISTORY_KEY); } catch (e) { /* private mode */ }
}

async function sha16(s) {    // Stable 16-hex id for a feed URL — mirrors PodcastCatalog.idFor (SHA-256 prefix).
    try {
        if (window.crypto && window.crypto.subtle) {
            const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(s.trim()));
            return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
        }
    } catch (e) { /* insecure context — fall through */ }
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8) + '0000';
}

// ── App instance (per window) ────────────────────────────────────────
export function renderMusicPage(body) {
    ensureStyles();

    const app = {
        tab: 0, // 0 Start | 1 Szukaj | 2 Podcasty | 3 Radio | 4 Biblioteka | 5 Ustawienia
        detail: null, // {type:'playlist',id} | {type:'podcast',id}
        fullPlayer: false,
        queuePanel: false,
        searchQ: '',
        searchData: null,   // /api/music/search?type=all response
        searchFilter: 'all',
        searchError: false,
        searching: false,
        sharedDetail: null,   // payload of /api/music/playlists/shared
    };

    const root = el('div', { class: 'em-root' });
    body.appendChild(root);

    const content = el('div', { class: 'em-content' });
    const miniBar = el('div', { class: 'em-mini', style: 'display:none' });
    const navEl = buildNav();
    root.append(content, miniBar, navEl);

    // Radio favourites are stored per user on the NAS (web + Android share them);
    // localStorage is only the offline cache. Pull once per window.
    radioStore.syncFromServer().then(() => { if (!app.detail && app.tab === 3) renderApp(); });

    // Feedback goes through the global Notification Center (docs/notifications.md);
    // the package must not render its own toast stack.
    function toast(msg, kind = 'info') {
        try { _ctx.notifications.toast(String(msg), kind); } catch (_) { /* window closing */ }
    }

    // ── View rendering ───────────────────────────────────────────────
    function renderApp() {
        content.innerHTML = '';
        if (app.detail) {
            if (app.detail.type === 'playlist') content.appendChild(viewPlaylistDetail(app.detail.id));
            else if (app.detail.type === 'shared-playlist') content.appendChild(viewSharedPlaylist(app.sharedDetail));
            else content.appendChild(viewPodcastDetail(app.detail.id));
        } else {
            [viewHome, viewSearch, viewPodcasts, viewRadio, viewLibrary, viewSettings][app.tab](content);
        }
        renderMiniBar();
    }

    function openDetail(d) { app.detail = d; app.queuePanel = false; renderApp(); }
    function closeDetail() { app.detail = null; renderApp(); }
    function setTab(i) { app.tab = i; app.detail = null; app.queuePanel = false; renderApp(); }

    // ── Shared search/podcast/radio pieces ───────────────────────────
    function playStation(s) {
        radioStore.markPlayed(s.id);
        engine.playQueue([{
            id: 'radio-' + s.id, title: s.name, artist: 'Radio na żywo',
            thumb: s.logo || '', dur: 0, is_live: true, file_url: s.stream_url,
        }], 0);
        toast(`Radio: ${s.name}`);
    }

    function stationRow(s, withFavorite = true) {
        const row = el('div', { class: 'em-row' });
        if (s.logo) {
            const img = el('img', { class: 'em-row-logo', src: s.logo, alt: '', loading: 'lazy' });
            img.addEventListener('error', () => img.replaceWith(stationFallback(s)), { once: true });
            row.appendChild(img);
        } else {
            row.appendChild(stationFallback(s));
        }
        const meta = [s.category, s.city].filter(Boolean).join(' · ');
        row.appendChild(el('div', { class: 'em-row-main' },
            el('div', { class: 'em-row-title' }, s.name),
            el('div', { class: 'em-row-sub' }, `${meta || 'Radio'} · na żywo`)));
        if (withFavorite) {
            const favB = el('button', {
                class: 'em-iconbtn', title: 'Ulubione',
                style: radioStore.isFavorite(s.id) ? `color:${C.green}` : '',
            }, icon('heart', 20));
            favB.addEventListener('click', (e) => { e.stopPropagation(); radioStore.toggleFavorite(s.id); renderApp(); });
            row.appendChild(favB);
        }
        const playB = el('button', { class: 'em-iconbtn', title: 'Odtwórz' }, icon('play', 22));
        playB.addEventListener('click', (e) => { e.stopPropagation(); playStation(s); });
        row.appendChild(playB);
        row.addEventListener('click', () => playStation(s));
        return row;
    }

    function stationFallback(s) {
        return el('div', {
            class: 'em-row-thumb',
            style: `display:flex;align-items:center;justify-content:center;color:#fff;background:${coverGradient(s.name)}`,
        }, icon('radio', 22));
    }

    function podcastCard(entry) {
        const subscribed = store.podcasts.subscribed.find(s => s.rss_url === entry.rss_url);
        const subLabel = subscribed
            ? 'Subskrybowany'
            : [entry.category, entry.episode_count ? `${entry.episode_count} odc.` : ''].filter(Boolean).join(' · ');
        const card = el('div', { class: 'em-card' },
            coverImg(entry.cover_url || '', entry.name),
            el('div', { class: 'em-card-label' }, entry.name),
            el('div', { class: 'em-card-sub' }, subLabel));
        card.addEventListener('click', () => {
            if (subscribed) { openDetail({ type: 'podcast', id: subscribed.id }); return; }
            openCatalogPodcast(entry);
        });
        return card;
    }

    async function openCatalogPodcast(entry) {
        toast('Pobieranie feeda…');
        const pod = await store.fetchFeed(entry.rss_url, toast);
        if (pod) { renderApp(); openDetail({ type: 'podcast', id: pod.id }); }
    }

    function libraryTrack(item) {
        return normalizeTrack({
            id: item.video_id || item.name,
            title: item.title || item.name,
            artist: item.artist || '',
            thumbnail: item.thumbnail || '',
            duration: item.duration || 0,
            file_url: item.url || '',
        });
    }

    // ── Home (HomeScreen.kt) ─────────────────────────────────────────
    function viewHome(parent) {
        const h = new Date().getHours();
        const greet = h < 12 ? 'Dzień dobry' : 'Dobry wieczór';
        parent.appendChild(el('h1', { class: 'em-h1' }, greet));

        if (store.history.length) {
            parent.appendChild(el('div', { class: 'em-section-title' }, 'Ostatnio odtwarzane'));
            const grid = el('div', { class: 'em-grid' });
            store.history.slice(0, 6).forEach(t => grid.appendChild(historyCard(t)));
            parent.appendChild(grid);
        }

        if (store.liked.length || store.playlists.length) {
            parent.appendChild(el('div', { class: 'em-section-title' }, 'Twoja biblioteka'));
            const grid = el('div', { class: 'em-grid' });
            if (store.liked.length) grid.appendChild(likedCard());
            store.playlists.slice(0, 6).forEach(pl => grid.appendChild(playlistCard(pl)));
            parent.appendChild(grid);
        }

        if (!store.history.length && !store.liked.length && !store.playlists.length) {
            parent.appendChild(el('div', { class: 'em-empty' },
                'Twoja biblioteka jest pusta.\nZnajdź muzykę w zakładce „Szukaj” lub zsynchronizuj z aplikacją EthOS Music na telefonie.'));
        }
    }

    function historyCard(t) {
        const card = el('div', { class: 'em-card' }, coverImg(t.thumb, t.title), el('div', { class: 'em-card-label' }, t.title));
        card.addEventListener('click', () => engine.playQueue(store.history.slice(), store.history.indexOf(t)));
        return card;
    }

    function likedCard() {
        const card = el('div', { class: 'em-card' });
        const cover = el('div', { style: `width:100%;aspect-ratio:1/1;border-radius:8px;margin-bottom:10px;background:linear-gradient(135deg,#450af5,#c4efd9);display:flex;align-items:center;justify-content:center;color:#fff` }, icon('heart', 44));
        card.append(cover, el('div', { class: 'em-card-label' }, 'Polubione utwory'));
        card.addEventListener('click', () => openDetail({ type: 'playlist', id: '__liked__' }));
        return card;
    }

    function playlistCard(pl) {
        const cover = pl.tracks.length ? coverImg(pl.tracks[0].thumb, pl.name) : defaultCover(pl.name);
        const card = el('div', { class: 'em-card' }, cover, el('div', { class: 'em-card-label' }, pl.name), el('div', { class: 'em-card-sub' }, `${pl.tracks.length} utworów`));
        card.addEventListener('click', () => openDetail({ type: 'playlist', id: pl.id }));
        return card;
    }

    function sharedPlaylistCard(grant) {
        const label = grant.label || grant.resource;
        const card = el('div', { class: 'em-card' }, defaultCover(label),
            el('div', { class: 'em-card-label' }, label),
            el('div', { class: 'em-card-sub' }, `od ${grant.owner}`));
        card.addEventListener('click', async () => {
            try {
                const data = await apiJsonFetch(`/api/music/playlists/shared?owner=${encodeURIComponent(grant.owner)}&id=${encodeURIComponent(grant.resource)}`);
                app.sharedDetail = data;
                openDetail({ type: 'shared-playlist', id: grant.resource, owner: grant.owner });
            } catch (e) { toast('Nie udało się otworzyć udostępnionej playlisty'); }
        });
        return card;
    }

    function coverImg(src, label) {
        const img = el('img', { class: 'em-card-cover', alt: '' });
        if (src) { img.src = src; img.addEventListener('error', () => { img.replaceWith(defaultCover(label)); }, { once: true }); }
        else return defaultCover(label);
        return img;
    }

    function defaultCover(label) {
        const d = el('div', { class: 'em-card-cover', style: `display:flex;align-items:center;justify-content:center;color:#fff;background:${coverGradient(label)}` }, icon('note', 40));
        return d;
    }

    function coverGradient(s) {
        const hues = ['135deg,#7c3aed,#db2777', '135deg,#0ea5e9,#6366f1', '135deg,#f59e0b,#ef4444', '135deg,#10b981,#0ea5e9', '135deg,#ec4899,#8b5cf6'];
        let h = 0; for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
        return `linear-gradient(${hues[h % hues.length]})`;
    }

    // ── Search (SearchScreen.kt) ─────────────────────────────────────
    let searchTimer = null;
    let suggestTimer = null;
    let searchSeq = 0;

    function viewSearch(parent) {
        const field = el('input', {
            class: 'em-searchfield', type: 'text',
            placeholder: 'Czego chcesz posłuchać? Utwory, podcasty, stacje radiowe…',
            value: app.searchQ,
        });
        parent.appendChild(field);

        const suggestBox = el('div', { class: 'em-suggest' });
        const filterRow = el('div', { class: 'em-chips' });
        const resultsBox = el('div');
        parent.append(suggestBox, filterRow, resultsBox);

        const FILTERS = [
            ['all', 'Wszystko'], ['tracks', 'Utwory'], ['podcasts', 'Podcasty'],
            ['radio', 'Radio'], ['library', 'Biblioteka'], ['playlists', 'Playlisty'],
        ];

        function paintFilters() {
            filterRow.innerHTML = '';
            if (!app.searchQ.trim()) return;
            FILTERS.forEach(([key, label]) => {
                filterRow.appendChild(el('button', {
                    class: 'em-chip' + ((app.searchFilter || 'all') === key ? ' active' : ''),
                    onclick: () => { app.searchFilter = key; paintResults(); },
                }, label));
            });
        }

        function suggestionRow(item) {
            const kind = item.type === 'podcast' ? 'Podcast' : item.type === 'radio' ? 'Radio'
                : item.type === 'playlist' ? 'Playlista' : 'Biblioteka';
            const row = el('div', { class: 'em-suggest-item' });
            if (item.image) {
                const img = el('img', { class: 'em-suggest-thumb', src: item.image, alt: '', loading: 'lazy' });
                img.addEventListener('error', () => img.remove(), { once: true });
                row.appendChild(img);
            }
            row.append(
                el('div', { class: 'em-suggest-kind' }, kind),
                el('div', { class: 'em-suggest-main' },
                    el('div', { class: 'em-suggest-title' }, item.title),
                    el('div', { class: 'em-suggest-sub' }, item.subtitle || '')),
            );
            row.addEventListener('click', () => {
                suggestBox.innerHTML = '';
                if (item.type === 'radio') {
                    playStation({
                        id: item.id, name: item.title, category: item.subtitle || 'Radio',
                        stream_url: item.stream_url, logo: item.image || '',
                    });
                } else if (item.type === 'podcast') {
                    openCatalogPodcast({ rss_url: item.rss_url, name: item.title, cover_url: item.image || '' });
                } else if (item.type === 'playlist') {
                    openDetail({ type: 'playlist', id: item.id });
                } else {
                    const t = normalizeTrack({
                        id: item.id, title: item.title, artist: item.subtitle,
                        file_url: item.file_url,
                    });
                    engine.playQueue([t], 0);
                }
            });
            return row;
        }

        async function runSuggest(q) {
            const query = String(q || '').trim();
            if (query.length < 2) { suggestBox.innerHTML = ''; return; }
            try {
                const res = await apiJsonFetch(`/api/music/search/suggest?q=${encodeURIComponent(query)}&limit=6`);
                if (field.value.trim() !== query) return;
                suggestBox.innerHTML = '';
                (res.items || []).forEach(item => suggestBox.appendChild(suggestionRow(item)));
            } catch (e) { suggestBox.innerHTML = ''; }
        }

        function paintIdle() {
            resultsBox.innerHTML = '';
            const history = loadSearchHistory();
            if (history.length) {
                resultsBox.appendChild(el('div', { class: 'em-section-title' }, 'Ostatnio szukane'));
                const row = el('div', { class: 'em-chips' });
                history.forEach(term => {
                    row.appendChild(el('button', {
                        class: 'em-chip',
                        onclick: () => { field.value = term; onSearch(term); },
                    }, term));
                });
                const clear = el('button', { class: 'em-chip', style: 'opacity:.7' }, 'Wyczyść');
                clear.addEventListener('click', () => { clearSearchHistory(); paintIdle(); });
                row.appendChild(clear);
                resultsBox.appendChild(row);
            }

            resultsBox.appendChild(el('div', { class: 'em-section-title' }, 'Kategorie'));
            const grid = el('div', { class: 'em-grid' });
            CATEGORIES.forEach(cat => {
                const tile = el('div', { class: 'em-tile', style: `background:${cat.color}` }, cat.name);
                tile.addEventListener('click', () => { field.value = cat.query; onSearch(cat.query); field.focus(); });
                grid.appendChild(tile);
            });
            resultsBox.appendChild(grid);
        }

        async function loadMoreTracks(q, btn) {
            btn.disabled = true;
            btn.textContent = 'Wczytywanie…';
            try {
                const offset = (app.searchData.tracks.items || []).length;
                const res = await apiJsonFetch(`/api/music/search?type=all&q=${encodeURIComponent(q)}&limit=25&offset=${offset}`);
                app.searchData.tracks.items = (app.searchData.tracks.items || []).concat(res.tracks?.items || []);
                app.searchData.tracks.has_more = !!res.tracks?.has_more;
                app.searchData.tracks.total = res.tracks?.total ?? app.searchData.tracks.items.length;
                paintResults();
            } catch (e) {
                toast('Nie udało się pobrać kolejnych wyników');
                btn.disabled = false;
                btn.textContent = 'Więcej wyników';
            }
        }

        function paintResults() {
            paintFilters();
            resultsBox.innerHTML = '';
            const q = app.searchQ.trim();
            if (!q) { paintIdle(); return; }
            if (app.searching && !app.searchData) {
                resultsBox.appendChild(el('div', { style: 'padding:40px 0' }, el('div', { class: 'em-spin' })));
                return;
            }
            if (app.searchError) {
                resultsBox.appendChild(el('div', { class: 'em-empty' }, 'Wyszukiwanie nie powiodło się — spróbuj ponownie.'));
                return;
            }
            const data = app.searchData;
            if (!data) return;

            const filter = app.searchFilter || 'all';
            const tracks = data.tracks?.items || [];
            const podcasts = data.podcasts?.items || [];
            const stations = data.radio?.items || [];
            const library = data.library?.items || [];
            const playlists = data.playlists?.items || [];
            if (!(tracks.length || podcasts.length || stations.length || library.length || playlists.length)) {
                resultsBox.appendChild(el('div', { class: 'em-empty' }, `Brak wyników dla „${q}”`));
                return;
            }

            if ((filter === 'all' || filter === 'tracks') && tracks.length) {
                resultsBox.appendChild(el('div', { class: 'em-section-title' },
                    `Utwory${data.tracks.total ? ` (${data.tracks.total})` : ''}`));
                const queue = tracks.map(normalizeTrack);
                const list = el('div');
                queue.forEach((t, i) => list.appendChild(trackRow(t, i + 1, () => engine.playQueue(queue, i), trackMenuItems(t))));
                resultsBox.appendChild(list);
                if (data.tracks.has_more) {
                    const more = el('button', { class: 'em-more' }, 'Więcej wyników');
                    more.addEventListener('click', () => loadMoreTracks(q, more));
                    resultsBox.appendChild(more);
                }
            }

            if ((filter === 'all' || filter === 'podcasts') && podcasts.length) {
                resultsBox.appendChild(el('div', { class: 'em-section-title' }, 'Podcasty'));
                const grid = el('div', { class: 'em-grid' });
                podcasts.forEach(p => grid.appendChild(podcastCard(p)));
                resultsBox.appendChild(grid);
            }

            if ((filter === 'all' || filter === 'radio') && stations.length) {
                resultsBox.appendChild(el('div', { class: 'em-section-title' }, 'Stacje radiowe'));
                const list = el('div');
                stations.forEach(s => list.appendChild(stationRow(s, false)));
                resultsBox.appendChild(list);
            }

            if ((filter === 'all' || filter === 'library') && library.length) {
                resultsBox.appendChild(el('div', { class: 'em-section-title' }, 'W bibliotece'));
                const queue = library.map(libraryTrack);
                const list = el('div');
                queue.forEach((t, i) => list.appendChild(trackRow(t, i + 1, () => engine.playQueue(queue, i), trackMenuItems(t))));
                resultsBox.appendChild(list);
            }

            if ((filter === 'all' || filter === 'playlists') && playlists.length) {
                resultsBox.appendChild(el('div', { class: 'em-section-title' }, 'Playlisty'));
                const list = el('div');
                playlists.forEach(pl => {
                    const row = el('div', { class: 'em-row' },
                        el('div', {
                            class: 'em-row-thumb',
                            style: `display:flex;align-items:center;justify-content:center;color:#fff;background:${coverGradient(pl.name)}`,
                        }, icon('note', 22)),
                        el('div', { class: 'em-row-main' },
                            el('div', { class: 'em-row-title' }, pl.name),
                            el('div', { class: 'em-row-sub' }, `${pl.tracks_count || 0} utworów`)));
                    row.addEventListener('click', () => openDetail({ type: 'playlist', id: pl.id }));
                    list.appendChild(row);
                });
                resultsBox.appendChild(list);
            }
        }

        async function onSearch(q) {
            const query = String(q || '').trim();
            if (!query) return;
            const seq = ++searchSeq;
            app.searchQ = query;
            app.searching = true;
            app.searchError = false;
            suggestBox.innerHTML = '';
            field.value = query;
            paintResults();
            try {
                const res = await apiJsonFetch(`/api/music/search?type=all&q=${encodeURIComponent(query)}&limit=25`);
                if (seq !== searchSeq) return;      // a newer query superseded this one
                app.searchData = res;
                pushSearchHistory(query);
            } catch (e) {
                if (seq !== searchSeq) return;
                app.searchData = null;
                app.searchError = true;
            }
            app.searching = false;
            if (seq === searchSeq) paintResults();
        }

        field.addEventListener('input', () => {
            const q = field.value;
            clearTimeout(searchTimer);
            clearTimeout(suggestTimer);
            if (!q.trim()) {
                searchSeq += 1;                   // ignore any in-flight response
                app.searchQ = '';
                app.searchData = null;
                app.searchError = false;
                app.searching = false;
                paintResults();
                return;
            }
            suggestTimer = setTimeout(() => runSuggest(q), 120);
            searchTimer = setTimeout(() => onSearch(q), 300);
        });
        field.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { clearTimeout(searchTimer); onSearch(field.value); }
        });

        paintResults();
        if (app.searchQ.trim() && !app.searchData && !app.searching) onSearch(app.searchQ);
        field.focus();
    }

    // Accepts both shapes: search results (thumbnail/duration) and state tracks (thumb/dur).
    function normalizeTrack(t) {
        return {
            id: t.id || '', title: t.title || '', artist: t.artist || '',
            thumb: t.thumb || t.thumbnail || '', dur: Number(t.dur ?? t.duration ?? 0),
            file_url: t.file_url || '', date: Number(t.date || 0),
        };
    }

    // ── Track row + context menu (Components.kt) ─────────────────────
    function trackRow(t, idx, onPlay, menuItems) {
        const row = el('div', { class: 'em-row' });
        const idxEl = el('span', { class: 'em-row-idx' }, String(idx));
        const thumb = t.thumb ? el('img', { class: 'em-row-thumb', src: t.thumb, alt: '' }) : defaultRowThumb();
        row.append(idxEl, thumb);
        row.appendChild(el('div', { class: 'em-row-main' },
            el('div', { class: 'em-row-title' }, t.title),
            el('div', { class: 'em-row-sub' }, [t.artist, fmtDate(t.date)].filter(Boolean).join(' · ') || '\u00a0')));
        row.appendChild(el('span', { class: 'em-row-dur' }, t.dur ? fmtDur(t.dur) : ''));

        const more = el('button', { class: 'em-iconbtn hidden-idx', title: 'Opcje' }, icon('more', 20));
        row.appendChild(more);
        row.addEventListener('mouseenter', () => idxEl.style.visibility = 'hidden');
        row.addEventListener('mouseleave', () => idxEl.style.visibility = '');
        more.addEventListener('click', (e) => { e.stopPropagation(); openMenu(e, Array.isArray(menuItems) ? menuItems : menuItems(t)); });
        row.addEventListener('click', onPlay);
        return row;
    }

    function defaultRowThumb() {
        const d = el('div', { class: 'em-row-thumb', style: `display:flex;align-items:center;justify-content:center;color:#fff;background:${coverGradient('x')}` }, icon('note', 20));
        return d;
    }

    function trackMenuItems(t) {
        const items = [
            { label: 'Dodaj do kolejki', act: () => { engine.addToQueue(t); toast('Dodano do kolejki'); } },
            { label: 'Odtwórz następne', act: () => { engine.playNext(t); toast('Zaplanowano następne'); } },
        ];
        items.push(store.isLiked(t)
            ? { label: 'Usuń z polubionych', act: () => store.toggleLike(t, toast).then(renderApp) }
            : { label: 'Polub', act: () => store.toggleLike(t, toast).then(renderApp) });
        items.push({ label: 'Dodaj do playlisty…', act: (e) => openAddToPlaylistDialog(e, t) });        // Pobierz na NAS (m4a) — jak w aplikacji Android (SearchScreen.downloadTrack).
        items.push({ label: 'Pobierz na NAS', act: () => {
            const task = _ctx.progress?.startTask
                ? _ctx.progress.startTask({ appId: 'pkg-ethos-music', title: t.title, detail: 'Pobieranie na NAS…', testIdPrefix: 'music-download' })
                : null;
            apiJsonFetch('/api/music/download', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ video_id: t.id }) })
                .then(() => {
                    task?.finish('done', { percent: 100, detail: 'Zapisano na NAS' });
                    toast('Utwór zapisany na NAS', 'success');
                })
                .catch(() => {
                    task?.finish('failed', { detail: 'Nie udało się pobrać utworu' });
                    toast('Błąd pobierania na NAS', 'error');
                });
        }});
        return items;
    }

    /**
     * Pobiera całą playlistę na NAS (m4a) — odpowiednik przycisku z aplikacji
     * Android. Serwer pobiera 3 utwory równolegle i zwraca od razu, więc postęp
     * odczytujemy z /api/music/downloads/progress.
     */
    async function downloadPlaylistToNas(pl) {
        const ids = pl.tracks
            .map(t => t.id)
            .filter(id => id && !String(id).startsWith('radio-'));
        if (!ids.length) { toast('Brak utworów do pobrania na NAS', 'warning'); return; }
        const task = _ctx.progress?.startTask
            ? _ctx.progress.startTask({
                appId: 'pkg-ethos-music',
                title: `Pobieranie „${pl.name}”`,
                total: ids.length,
                detail: 'Zlecanie…',
                testIdPrefix: 'music-download',
            })
            : null;
        try {
            await apiJsonFetch('/api/music/download-batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ video_ids: ids }),
            });
        } catch (e) {
            task?.finish('failed', { detail: 'Nie udało się zlecić pobierania' });
            toast('Nie udało się zlecić pobierania na NAS', 'error');
            return;
        }
        const deadline = Date.now() + 30 * 60 * 1000;
        while (Date.now() < deadline) {
            await new Promise(r => setTimeout(r, 2000));
            let p;
            try { p = await apiJsonFetch('/api/music/downloads/progress'); } catch (e) { continue; }
            if (!p.running) {
                const failed = Number(p.failed || 0);
                task?.finish(failed ? 'failed' : 'done', {
                    percent: 100,
                    detail: failed ? `${failed} nie udało się` : `${ids.length} utworów zapisane`,
                });
                toast(failed ? `Pobrano na NAS — ${failed} nie udało się` : 'Playlista pobrana na NAS', failed ? 'warning' : 'success');
                return;
            }
            const total = Number(p.total || ids.length) || ids.length;
            task?.update({
                index: Number(p.done || 0),
                percent: total ? Math.round((Number(p.done || 0) / total) * 100) : null,
                detail: `${p.done || 0}/${total}`,
            });
        }
        task?.finish('failed', { detail: 'Przekroczono limit czasu' });
    }

    // ── Context menu popup ───────────────────────────────────────────
    let activeMenu = null;
    function closeMenu() { if (activeMenu) { activeMenu.remove(); activeMenu = null; document.removeEventListener('mousedown', _menuOutside, true); } }
    function _menuOutside(e) { if (activeMenu && !activeMenu.contains(e.target)) closeMenu(); }

    function openMenu(anchorEvt, items) {
        closeMenu();
        const menu = el('div', { class: 'em-menu' });
        items.forEach(it => {
            const b = el('button', { class: 'em-menuitem' }, it.label);
            b.addEventListener('click', (e) => { e.stopPropagation(); closeMenu(); it.act(e); });
            menu.appendChild(b);
        });
        document.body.appendChild(menu);
        const r = anchorEvt.currentTarget.getBoundingClientRect();
        let left = r.left, top = r.bottom + 4;
        const mw = menu.offsetWidth, mh = menu.offsetHeight;
        if (left + mw > window.innerWidth - 8) left = window.innerWidth - mw - 8;
        if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 4);
        menu.style.left = left + 'px'; menu.style.top = top + 'px';
        activeMenu = menu;
        setTimeout(() => document.addEventListener('mousedown', _menuOutside, true), 10);
    }

    // ── Add-to-playlist dialog (AddToPlaylistDialog.kt) ──────────────
    function openAddToPlaylistDialog(anchorEvt, t) {
        const backdrop = el('div', { class: 'em-dialog-backdrop' });
        const dlg = el('div', { class: 'em-dialog' }, el('h3', {}, 'Dodaj do playlisty'));

        const input = el('input', { type: 'text', placeholder: 'Nowa playlista…' });
        dlg.appendChild(input);

        const list = el('div', { class: 'em-dialog-list' });
        function fillList() {
            list.innerHTML = '';
            if (!store.playlists.length) { list.appendChild(el('div', { style: 'color:var(--em-muted);font-size:13px;padding:6px 2px' }, 'Brak playlist — utwórz nową powyżej.')); return; }
            store.playlists.forEach(pl => {
                const b = el('button', { class: 'em-menuitem' }, pl.name, el('span', { style: 'margin-left:auto;color:var(--em-muted);font-size:12px' }, `${pl.tracks.length}`));
                b.addEventListener('click', async () => { await store.addToPlaylist(pl.id, t, toast); backdrop.remove(); renderApp(); });
                list.appendChild(b);
            });
        }
        fillList();
        dlg.appendChild(list);

        const btns = el('div', { class: 'em-dialog-btnrow' },
            el('button', { class: 'em-btn ghost', onclick: () => backdrop.remove() }, 'Anuluj'),
            el('button', { class: 'em-btn', onclick: async () => {
                const name = input.value.trim(); if (!name) return;
                const pl = await store.createPlaylist(name, toast); if (!pl) return;
                await store.addToPlaylist(pl.id, t, toast); backdrop.remove(); renderApp();
            } }, 'Utwórz i dodaj'));
        dlg.appendChild(btns);

        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') btns.lastElementChild.click(); });
        backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) backdrop.remove(); });
        backdrop.appendChild(dlg);
        root.appendChild(backdrop);
        input.focus();
    }

    // ── Podcasts (PodcastsScreen.kt / PodcastDetailScreen.kt) ────────
    let podcastFilter = 'Wszystkie';
    let podcastQuery = '';
    let podcastVisible = 30;

    function viewPodcasts(parent) {
        const subs = store.podcasts.subscribed;
        if (subs.length) {
            parent.appendChild(el('div', { class: 'em-section-title' }, 'Twoje podcasty'));
            const grid = el('div', { class: 'em-grid' });
            subs.forEach(p => {
                const card = el('div', { class: 'em-card' }, coverImg(p.cover, p.title), el('div', { class: 'em-card-label' }, p.title));
                card.addEventListener('click', () => openDetail({ type: 'podcast', id: p.id }));
                grid.appendChild(card);
            });
            parent.appendChild(grid);
        }

        parent.appendChild(el('div', { class: 'em-section-title' }, 'Odkrywaj'));
        const field = el('input', {
            class: 'em-searchfield', type: 'text',
            placeholder: 'Szukaj polskich podcastów…', value: podcastQuery,
        });
        parent.appendChild(field);

        const chips = el('div', { class: 'em-chips' });
        const gridBox = el('div');
        parent.append(chips, gridBox);

        function paint() {
            chips.innerHTML = '';
            gridBox.innerHTML = '';
            const data = podcastCatalog.data;
            if (!data) {
                if (podcastCatalog.error) {
                    gridBox.appendChild(el('div', { class: 'em-empty' }, podcastCatalog.error));
                    gridBox.appendChild(el('button', {
                        class: 'em-btn',
                        onclick: async () => { await podcastCatalog.ensure(true); paint(); },
                    }, 'Spróbuj ponownie'));
                } else {
                    gridBox.appendChild(el('div', { style: 'padding:40px 0' }, el('div', { class: 'em-spin' })));
                }
                return;
            }

            const items = data.items || [];
            const counts = {};
            items.forEach(p => { counts[p.category] = (counts[p.category] || 0) + 1; });
            const categories = (data.categories || []).filter(c => (counts[c] || 0) >= 3);
            ['Wszystkie', ...categories].forEach(cat => {
                chips.appendChild(el('button', {
                    class: 'em-chip' + (podcastFilter === cat ? ' active' : ''),
                    onclick: () => { podcastFilter = cat; podcastVisible = 30; paint(); },
                }, cat));
            });

            const q = foldPl(podcastQuery);
            const filtered = items.filter(p =>
                (podcastFilter === 'Wszystkie' || p.category === podcastFilter) &&
                (!q || foldPl([p.name, p.author, p.category].join(' ')).includes(q)));

            if (!filtered.length) {
                gridBox.appendChild(el('div', { class: 'em-empty' }, 'Brak podcastów dla tych filtrów.'));
                return;
            }

            const grid = el('div', { class: 'em-grid' });
            filtered.slice(0, podcastVisible).forEach(p => grid.appendChild(podcastCard(p)));
            gridBox.appendChild(grid);
            gridBox.appendChild(el('div', { style: 'color:var(--em-muted);font-size:12.5px;padding:10px 2px' },
                `${Math.min(filtered.length, podcastVisible)} z ${filtered.length}`));
            if (filtered.length > podcastVisible) {
                const more = el('button', { class: 'em-more' }, 'Pokaż więcej');
                more.addEventListener('click', () => { podcastVisible += 30; paint(); });
                gridBox.appendChild(more);
            }
        }

        field.addEventListener('input', () => { podcastQuery = field.value; podcastVisible = 30; paint(); });
        paint();
        if (!podcastCatalog.data) {
            podcastCatalog.ensure().then(() => { if (document.contains(gridBox)) paint(); });
        }

        // Add custom feed
        const addBtn = el('button', { class: 'em-btn ghost', style: 'margin-top:18px' }, '+ Dodaj podcast (adres RSS)');
        addBtn.addEventListener('click', () => openAddFeedDialog());
        parent.appendChild(addBtn);
    }

    function openAddFeedDialog() {
        const backdrop = el('div', { class: 'em-dialog-backdrop' });
        const dlg = el('div', { class: 'em-dialog' }, el('h3', {}, 'Dodaj podcast'));
        const input = el('input', { type: 'text', placeholder: 'https://example.com/feed.xml' });
        dlg.appendChild(input);
        const btns = el('div', { class: 'em-dialog-btnrow' },
            el('button', { class: 'em-btn ghost', onclick: () => backdrop.remove() }, 'Anuluj'),
            el('button', { class: 'em-btn', onclick: async () => {
                const url = input.value.trim(); if (!url) return;
                btns.lastElementChild.disabled = true;
                toast('Pobieranie feeda…');
                const pod = await store.fetchFeed(url, toast);
                backdrop.remove();
                if (pod) openDetail({ type: 'podcast', id: pod.id }); else renderApp();
            } }, 'Dodaj'));
        dlg.appendChild(btns);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') btns.lastElementChild.click(); });
        backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) backdrop.remove(); });
        backdrop.appendChild(dlg);
        root.appendChild(backdrop);
        input.focus();
    }

    // ── Create-playlist dialog (prompt for name before creating) ────
    function openCreatePlaylistDialog() {
        const backdrop = el('div', { class: 'em-dialog-backdrop' });
        const dlg = el('div', { class: 'em-dialog' }, el('h3', {}, 'Nowa playlista'));
        const input = el('input', { type: 'text', placeholder: 'Nazwa playlisty…' });
        dlg.appendChild(input);
        const btns = el('div', { class: 'em-dialog-btnrow' },
            el('button', { class: 'em-btn ghost', onclick: () => backdrop.remove() }, 'Anuluj'),
            el('button', { class: 'em-btn', onclick: async () => {
                const name = input.value.trim(); if (!name) return;
                btns.lastElementChild.disabled = true;
                const pl = await store.createPlaylist(name, toast); if (!pl) return;
                backdrop.remove();
                openDetail({ type: 'playlist', id: pl.id });
            } }, 'Utwórz'));
        dlg.appendChild(btns);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') btns.lastElementChild.click(); });
        backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) backdrop.remove(); });
        backdrop.appendChild(dlg);
        root.appendChild(backdrop);
        input.focus();
    }

    function viewPodcastDetail(pid) {
        const p = store.podcasts.subscribed.find(s => s.id === pid);
        const wrap = el('div');
        if (!p) { wrap.appendChild(el('div', { class: 'em-empty' }, 'Subskrypcja nie istnieje')); return wrap; }

        const head = el('div', { class: 'em-detail-head' });
        const backBtn = el('button', { class: 'em-iconbtn', style: 'align-self:flex-start;margin-bottom:auto', title: 'Wstecz' }, icon('close', 20));
        backBtn.addEventListener('click', closeDetail);
        head.appendChild(backBtn);

        const coverBox = el('div');
        if (p.cover) { const img = el('img', { class: 'em-detail-cover', src: p.cover, alt: '' }); img.addEventListener('error', () => img.replaceWith(defaultCover(p.title)), { once: true }); coverBox.appendChild(img); }
        else coverBox.appendChild(el('div', { class: 'em-detail-cover', style: `display:flex;align-items:center;justify-content:center;color:#fff;background:${coverGradient(p.title)}` }, icon('rss', 56)));
        head.appendChild(coverBox);

        const info = el('div', { style: 'min-width:0' });
        info.append(el('div', { class: 'em-detail-label' }, 'Podcast'),
            el('div', { class: 'em-detail-title', style: 'font-size:26px' }, p.title));
        if (p.desc) info.appendChild(el('div', { class: 'em-detail-meta', style: 'line-height:1.5;max-width:480px' }, p.desc));
        head.appendChild(info);
        wrap.appendChild(head);

        const eps = store.podcasts.episodes[pid] || [];
        const actions = el('div', { class: 'em-detail-actions' });
        const playBtn = el('button', { class: 'em-playcircle', title: 'Odtwórz wszystkie' }, icon('play', 26));
        playBtn.addEventListener('click', () => eps.length && engine.playQueue(eps, 0));
        actions.appendChild(playBtn);
        const refreshBtn = el('button', { class: 'em-smcircle', title: 'Odśwież odcinki' }, icon('repeat', 18));
        refreshBtn.addEventListener('click', async () => { toast('Pobieranie feeda…'); await store.fetchFeed(p.rss_url, toast); renderApp(); });
        actions.appendChild(refreshBtn);
        const unsubBtn = el('button', { class: 'em-iconbtn', style: 'margin-left:auto', title: 'Usuń subskrypcję' }, icon('del', 20));
        unsubBtn.addEventListener('click', async () => { if (await store.unsubscribe(pid, toast)) { closeDetail(); } });
        actions.appendChild(unsubBtn);
        wrap.appendChild(actions);

        if (!eps.length) {
            wrap.appendChild(el('div', { class: 'em-empty' }, 'Brak odcinków — naciśnij „Odśwież”, aby pobrać feed.'));
            return wrap;
        }
        eps.forEach((t, i) => wrap.appendChild(trackRow(t, i + 1, () => engine.playQueue(eps, i), trackMenuItems(t))));
        return wrap;
    }

    // ── Radio (RadioScreen.kt) ───────────────────────────────────────
    let radioFilter = 'Wszystkie';
    let radioQuery = '';

    function viewRadio(parent) {
        parent.appendChild(el('h1', { class: 'em-h1' }, 'Radio'));
        parent.appendChild(el('div', { style: 'color:var(--em-muted);font-size:13px;margin:-12px 0 10px' },
            'Polskie stacje na żywo — dotknij, aby słuchać.'));
        const field = el('input', {
            class: 'em-searchfield', type: 'text', placeholder: 'Szukaj stacji…', value: radioQuery,
        });
        parent.appendChild(field);

        const body = el('div');
        parent.appendChild(body);

        function paint() {
            body.innerHTML = '';
            const data = radioCatalog.data;
            if (!data) {
                if (radioCatalog.error) {
                    body.appendChild(el('div', { class: 'em-empty' }, radioCatalog.error));
                    body.appendChild(el('button', {
                        class: 'em-btn',
                        onclick: async () => { await radioCatalog.ensure(true); paint(); },
                    }, 'Spróbuj ponownie'));
                } else {
                    body.appendChild(el('div', { style: 'padding:40px 0' }, el('div', { class: 'em-spin' })));
                }
                return;
            }

            const stations = data.stations || [];
            const favs = stations.filter(s => radioStore.isFavorite(s.id));
            const recent = radioStore.recent.map(id => stations.find(s => s.id === id)).filter(Boolean);

            if (favs.length) {
                body.appendChild(el('div', { class: 'em-section-title' }, 'Ulubione'));
                const list = el('div');
                favs.forEach(s => list.appendChild(stationRow(s)));
                body.appendChild(list);
            }

            if (recent.length) {
                body.appendChild(el('div', { class: 'em-section-title' }, 'Ostatnio słuchane'));
                const list = el('div');
                recent.forEach(s => list.appendChild(stationRow(s)));
                body.appendChild(list);
            }

            body.appendChild(el('div', { class: 'em-section-title' }, 'Wszystkie stacje'));
            const chips = el('div', { class: 'em-chips' });
            ['Wszystkie', ...(data.categories || [])].forEach(cat => {
                chips.appendChild(el('button', {
                    class: 'em-chip' + (radioFilter === cat ? ' active' : ''),
                    onclick: () => { radioFilter = cat; paint(); },
                }, cat));
            });
            body.appendChild(chips);

            const q = foldPl(radioQuery);
            const filtered = stations.filter(s =>
                (radioFilter === 'Wszystkie' || s.category === radioFilter) &&
                (!q || foldPl([s.name, s.city, s.category, ...(s.tags || [])].join(' ')).includes(q)));

            const list = el('div');
            if (!filtered.length) list.appendChild(el('div', { class: 'em-empty' }, 'Brak stacji dla tych filtrów.'));
            filtered.forEach(s => list.appendChild(stationRow(s)));
            body.appendChild(list);
            body.appendChild(el('div', { style: 'color:var(--em-muted);font-size:12.5px;padding:10px 2px' },
                `${filtered.length} z ${stations.length} stacji`));
        }

        field.addEventListener('input', () => { radioQuery = field.value; paint(); });
        paint();
        if (!radioCatalog.data) {
            radioCatalog.ensure().then(() => { if (document.contains(body)) paint(); });
        }
    }

    // ── Library (LibraryScreen.kt) ───────────────────────────────────
    function viewLibrary(parent) {
        const head = el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:4px' },
            el('h1', { class: 'em-h1', style: 'margin-bottom:0' }, 'Twoja biblioteka'));
        const createBtn = el('button', { class: 'em-btn ghost' }, '+ Nowa playlista');
        createBtn.addEventListener('click', () => openCreatePlaylistDialog());
        head.appendChild(createBtn);
        parent.appendChild(head);

        // Jak w aplikacji Android (LibraryScreen): karta „Polubione utwory” jest zawsze
        // widoczna, a pusty stan dotyczy tylko playlist.
        const grid = el('div', { class: 'em-grid' });
        grid.appendChild(likedCard());
        store.playlists.forEach(pl => grid.appendChild(playlistCard(pl)));
        parent.appendChild(grid);
        if (!store.playlists.length) {
            parent.appendChild(el('div', { style: 'color:var(--em-muted);font-size:13.5px;padding:18px 4px' },
                'Jeszcze nie masz playlist. Stwórz pierwszą przyciskiem „+ Nowa playlista”.'));
        }
        if (store.sharedPlaylists.length) {
            parent.appendChild(el('h2', { class: 'em-h1', style: 'margin-top:22px;font-size:18px' }, 'Udostępnione Tobie'));
            const sharedGrid = el('div', { class: 'em-grid' });
            store.sharedPlaylists.forEach(grant => sharedGrid.appendChild(sharedPlaylistCard(grant)));
            parent.appendChild(sharedGrid);
        }
    }

    function viewSharedPlaylist(data) {
        const wrap = el('div');
        if (!data) { wrap.appendChild(el('div', { class: 'em-empty' }, 'Nie udało się wczytać playlisty.')); return wrap; }
        const tracks = data.tracks || [];
        const head = el('div', { class: 'em-detail-head' });
        const backBtn = el('button', { class: 'em-iconbtn', style: 'align-self:flex-start;margin-bottom:auto', title: 'Wstecz' }, icon('close', 20));
        backBtn.addEventListener('click', closeDetail);
        head.appendChild(backBtn);
        head.appendChild(el('div', { class: 'em-detail-cover', style: `display:flex;align-items:center;justify-content:center;color:#fff;background:${coverGradient(data.name || '')}` }, icon('note', 56)));
        const info = el('div', { style: 'min-width:0' });
        info.append(el('div', { class: 'em-detail-label' }, `Udostępniona · ${data.owner}`),
            el('div', { class: 'em-detail-title' }, data.name || 'Playlista'),
            el('div', { class: 'em-detail-meta' }, `${tracks.length} utworów · tylko odtwarzanie`));
        head.appendChild(info);
        wrap.appendChild(head);

        const actions = el('div', { class: 'em-detail-actions' });
        const playBtn = el('button', { class: 'em-playcircle', title: 'Odtwórz wszystkie' }, icon('play', 26));
        playBtn.addEventListener('click', () => tracks.length && engine.playQueue(tracks, 0));
        actions.appendChild(playBtn);
        const shuffleBtn = el('button', { class: 'em-smcircle', title: 'Losowo' }, icon('shuffle', 18));
        shuffleBtn.addEventListener('click', () => { if (!tracks.length) return; engine.shuffle = true; engine.playQueue(tracks, Math.floor(Math.random() * tracks.length)); });
        actions.appendChild(shuffleBtn);
        wrap.appendChild(actions);

        if (!tracks.length) { wrap.appendChild(el('div', { class: 'em-empty' }, 'Ta playlista jest pusta.')); return wrap; }
        tracks.forEach((t, i) => {
            wrap.appendChild(trackRow(t, i + 1, () => engine.playQueue(tracks, i), [
                { label: 'Odtwórz', act: () => engine.playQueue(tracks, i) },
                { label: 'Dodaj do kolejki', act: () => { engine.addToQueue(t); toast('Dodano do kolejki'); } },
            ]));
        });
        return wrap;
    }

    // ── Playlist detail (PlaylistDetailScreen.kt) ────────────────────
    function viewPlaylistDetail(pid) {
        const wrap = el('div');
        if (pid === '__liked__') return viewLikedDetail(wrap);
        const pl = store.playlists.find(p => p.id === pid);
        if (!pl) { wrap.appendChild(el('div', { class: 'em-empty' }, 'Playlista nie istnieje')); return wrap; }

        const head = el('div', { class: 'em-detail-head' });
        const backBtn = el('button', { class: 'em-iconbtn', style: 'align-self:flex-start;margin-bottom:auto', title: 'Wstecz' }, icon('close', 20));
        backBtn.addEventListener('click', closeDetail);
        head.appendChild(backBtn);

        if (pl.tracks.length) {
            const c = coverImg(pl.tracks[0].thumb, pl.name);
            c.className = 'em-detail-cover';
            head.appendChild(c);
        } else {
            head.appendChild(el('div', { class: 'em-detail-cover', style: `display:flex;align-items:center;justify-content:center;color:#fff;background:${coverGradient(pl.name)}` }, icon('note', 56)));
        }

        const info = el('div', { style: 'min-width:0' });
        info.append(el('div', { class: 'em-detail-label' }, 'Playlista'),
            el('div', { class: 'em-detail-title' }, pl.name),
            el('div', { class: 'em-detail-meta' }, `${pl.tracks.length} utworów`));
        head.appendChild(info);
        wrap.appendChild(head);

        const actions = el('div', { class: 'em-detail-actions' });
        const playBtn = el('button', { class: 'em-playcircle', title: 'Odtwórz wszystkie' }, icon('play', 26));
        playBtn.addEventListener('click', () => pl.tracks.length && engine.playQueue(pl.tracks, 0));
        actions.appendChild(playBtn);
        const shuffleBtn = el('button', { class: 'em-smcircle', title: 'Losowo' }, icon('shuffle', 18));
        shuffleBtn.addEventListener('click', () => { if (!pl.tracks.length) return; engine.shuffle = true; engine.playQueue(pl.tracks, Math.floor(Math.random() * pl.tracks.length)); });
        actions.appendChild(shuffleBtn);
        // Odpowiednik „Pobierz całą playlistę” z aplikacji Android — tu na NAS (m4a).
        const nasBtn = el('button', { class: 'em-smcircle', title: 'Pobierz całą playlistę na NAS' }, icon('download', 18));
        nasBtn.addEventListener('click', () => downloadPlaylistToNas(pl));
        actions.appendChild(nasBtn);
        const delBtn = el('button', { class: 'em-iconbtn', style: 'margin-left:auto', title: 'Usuń playlistę' }, icon('del', 20));
        delBtn.addEventListener('click', async () => { if (await store.deletePlaylist(pid, toast)) closeDetail(); });
        actions.appendChild(delBtn);
        wrap.appendChild(actions);

        if (!pl.tracks.length) {
            wrap.appendChild(el('div', { class: 'em-empty' }, 'Ta playlista jest pusta.\nDodaj utwory z wyników wyszukiwania (menu ⋮ → „Dodaj do playlisty”).'));
            return wrap;
        }

        pl.tracks.forEach((t, i) => {
            const items = [
                { label: 'Odtwórz', act: () => engine.playQueue(pl.tracks, i) },
                { label: 'Dodaj do kolejki', act: () => { engine.addToQueue(t); toast('Dodano do kolejki'); } },
                { label: 'Usuń z playlisty', act: () => store.removeFromPlaylist(pid, tkey(t), toast).then(renderApp) },
            ];
            wrap.appendChild(trackRow(t, i + 1, () => engine.playQueue(pl.tracks, i), items));
        });
        return wrap;
    }

    function viewLikedDetail(wrap) {
        const head = el('div', { class: 'em-detail-head' });
        const backBtn = el('button', { class: 'em-iconbtn', style: 'align-self:flex-start;margin-bottom:auto', title: 'Wstecz' }, icon('close', 20));
        backBtn.addEventListener('click', closeDetail);
        head.appendChild(backBtn);
        head.appendChild(el('div', { class: 'em-detail-cover', style: `display:flex;align-items:center;justify-content:center;color:#fff;background:linear-gradient(135deg,#450af5,#c4efd9)` }, icon('heart', 60)));
        const info = el('div', { style: 'min-width:0' });
        info.append(el('div', { class: 'em-detail-label' }, 'Kolekcja'),
            el('div', { class: 'em-detail-title' }, 'Polubione utwory'),
            el('div', { class: 'em-detail-meta' }, `${store.liked.length} utworów`));
        head.appendChild(info);
        wrap.appendChild(head);

        const actions = el('div', { class: 'em-detail-actions' });
        const playBtn = el('button', { class: 'em-playcircle', title: 'Odtwórz wszystkie' }, icon('play', 26));
        playBtn.addEventListener('click', () => store.liked.length && engine.playQueue(store.liked, 0));
        actions.appendChild(playBtn);
        wrap.appendChild(actions);

        if (!store.liked.length) { wrap.appendChild(el('div', { class: 'em-empty' }, 'Brak polubionych utworów.')); return wrap; }
        store.liked.forEach((t, i) => {
            const items = [
                { label: 'Odtwórz', act: () => engine.playQueue(store.liked, i) },
                { label: 'Dodaj do kolejki', act: () => { engine.addToQueue(t); toast('Dodano do kolejki'); } },
                { label: 'Usuń z polubionych', act: () => store.toggleLike(t, toast).then(renderApp) },
            ];
            wrap.appendChild(trackRow(t, i + 1, () => engine.playQueue(store.liked, i), items));
        });
        return wrap;
    }

    // ── Settings (SettingsScreen.kt — NAS variant) ───────────────────
    async function viewSettings(parent) {
        const card = el('div', { class: 'em-settings-card' },
            el('h4', {}, 'Katalog pobierania'),
            el('p', {}, 'Muzyka pobrana z YouTube trafia do tego katalogu (konwersja do m4a przez ffmpeg).'));
        const row = el('div', { class: 'em-settings-inputrow' });
        const input = el('input', { type: 'text', value: '' });
        row.appendChild(input);
        const saveBtn = el('button', { class: 'em-btn' }, 'Zapisz');
        saveBtn.addEventListener('click', async () => {
            try { await apiJsonFetch('/api/music/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ download_dir: input.value.trim() }) }); toast('Zapisano ustawienia'); }
            catch (e) { toast('Nie udało się zapisać — sprawdź ścieżkę'); }
        });
        row.appendChild(saveBtn);
        card.appendChild(row);
        parent.appendChild(card);

        const syncCard = el('div', { class: 'em-settings-card' },
            el('h4', {}, 'Synchronizacja'),
            el('p', {}, 'Polubione utwory, playlisty, historia odtwarzania i subskrypcje podcastów są przechowywane na NAS i synchronizowane z aplikacją EthOS Music na telefonie.'));
        parent.appendChild(syncCard);

        const sharingCard = el('div', { class: 'em-settings-card' },
            el('h4', {}, 'Udostępnianie playlist'),
            el('p', {}, 'Udostępnij playlistę innym kontom — odbiorcy mogą ją odtwarzać, ale nie zmieniać.'));
        if (!store.playlists.length) {
            sharingCard.appendChild(el('div', { style: 'color:var(--em-muted);font-size:13px' }, 'Brak playlist do udostępnienia.'));
        }
        store.playlists.forEach((pl) => {
            const row = el('div', { class: 'em-settings-inputrow', style: 'margin-top:8px' },
                el('span', { style: 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, pl.name));
            const shareBtn = el('button', { class: 'em-btn ghost' }, 'Udostępnij');
            shareBtn.addEventListener('click', async () => {
                if (!_ctx.share) { toast('Ta wersja EthOS nie obsługuje udostępniania'); return; }
                await _ctx.share.open({ kind: 'playlist', resource: pl.id, label: pl.name });
                await store.loadShared();
                renderApp();
            });
            row.appendChild(shareBtn);
            sharingCard.appendChild(row);
        });
        if (store.sharedPlaylists.length) {
            sharingCard.appendChild(el('h4', { style: 'margin-top:14px' }, 'Udostępnione Tobie'));
            store.sharedPlaylists.forEach((grant) => {
                const row = el('div', { class: 'em-settings-inputrow', style: 'margin-top:6px' },
                    el('span', { style: 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, `${grant.label || grant.resource} · ${grant.owner}`));
                const openBtn = el('button', { class: 'em-btn ghost' }, 'Otwórz');
                openBtn.addEventListener('click', () => sharedPlaylistCard(grant).dispatchEvent(new MouseEvent('click')));
                row.appendChild(openBtn);
                sharingCard.appendChild(row);
            });
        }
        parent.appendChild(sharingCard);

        try {
            const cfg = await apiJsonFetch('/api/music/config');
            input.value = cfg.download_dir || '';
            const ff = el('div', { class: 'em-settings-card' },
                el('h4', {}, 'ffmpeg'),
                el('p', {}, cfg.ffmpeg_available ? 'Dostępny — konwersja do m4a działa.' : 'Brak ffmpeg na NAS — pobieranie bez konwersji może nie działać.'));
            parent.appendChild(ff);

            // yt-dlp lives in the `ethos-music-engine` package (its own venv).
            // Without it Music cannot search, stream or download; updates ship
            // through Package Center, so there is no in-app update button.
            const ytdlpDesc = (v) => (v
                ? `Silnik YouTube (pakiet „Music Engine”) — yt-dlp ${v}. Aktualizacje instalujesz w Package Center.`
                : 'Silnik YouTube nie jest zainstalowany — zainstaluj pakiet „Music Engine” w Package Center, aby wyszukiwać i odtwarzać utwory.');
            const ytdlpCard = el('div', { class: 'em-settings-card' },
                el('h4', {}, 'Silnik YouTube'),
                el('p', {}, ytdlpDesc(cfg.ytdlp_version)));
            parent.appendChild(ytdlpCard);
        } catch (e) { /* offline */ }
    }

    // ── Bottom nav (MainActivity.kt) ─────────────────────────────────
    function buildNav() {
        const items = [
            { label: 'Start', ic: 'home' }, { label: 'Szukaj', ic: 'search' },
            { label: 'Podcasty', ic: 'rss' }, { label: 'Radio', ic: 'radio' },
            { label: 'Biblioteka', ic: 'library' }, { label: 'Ustawienia', ic: 'settings' },
        ];
        const nav = el('nav', { class: 'em-nav' });
        items.forEach((it, i) => {
            const b = el('button', { class: 'em-navitem' + (i === 0 ? ' active' : '') },
                el('span', { html: icon(it.ic, 24) }), it.label);
            b.addEventListener('click', () => setTab(i));
            nav.appendChild(b);
        });
        return nav;
    }

    // ── Mini player bar (MiniPlayerBar.kt) ───────────────────────────
    function renderMiniBar() {
        const t = engine.current;
        if (!t || app.fullPlayer) { miniBar.style.display = 'none'; return; }
        miniBar.style.display = 'flex';
        miniBar.innerHTML = '';
        const prog = el('div', { class: 'em-mini-progress' });
        miniBar.appendChild(prog);
        const thumb = t.thumb ? el('img', { class: 'em-mini-thumb', src: t.thumb, alt: '' }) : defaultRowThumb();
        miniBar.append(thumb, el('div', { class: 'em-mini-main' },
            el('div', { class: 'em-mini-title' }, t.title),
            el('div', { class: 'em-mini-sub' }, t.artist || '\u00a0')));
        const prevB = el('button', { class: 'em-iconbtn', title: 'Poprzedni' }, icon('prev', 22));
        prevB.addEventListener('click', (e) => { e.stopPropagation(); engine.prev(); });
        const playB = el('button', { class: 'em-iconbtn', title: 'Odtwórz / wstrzymaj' }, icon(engine.isPlaying ? 'pause' : 'play', 24));
        playB.addEventListener('click', (e) => { e.stopPropagation(); engine.toggle(); });
        const nextB = el('button', { class: 'em-iconbtn', title: 'Następny' }, icon('next', 22));
        nextB.addEventListener('click', (e) => { e.stopPropagation(); engine.next(); });
        miniBar.append(prevB, playB, nextB);
        miniBar.onclick = () => openFullPlayer();
    }

    // ── Full player (FullPlayerScreen.kt) ────────────────────────────
    let fullEl = null;
    function openFullPlayer() { app.fullPlayer = true; renderMiniBar(); buildFullPlayer(); }
    function closeFullPlayer() {
        app.fullPlayer = false;
        if (fullEl) {
            ['track', 'playing', 'time', 'mode', 'sleep'].forEach(e => engine.off(e, 'fp:' + e));
            fullEl.remove(); fullEl = null;
        }
        renderMiniBar();
    }

    function buildFullPlayer() {
        const t = engine.current;
        if (!t) return;
        if (fullEl) fullEl.remove();
        const fp = el('div', { class: 'em-full' });
        const bg = el('div', { class: 'em-full-bg' });
        if (t.thumb) bg.style.backgroundImage = `url("${t.thumb}")`; else bg.style.background = coverGradient(t.title);
        fp.appendChild(bg);

        const inner = el('div', { class: 'em-full-inner' });
        // header
        const head = el('div', { class: 'em-full-head' });
        const collapse = el('button', { class: 'em-iconbtn', title: 'Zwiń' }, icon('chevronDown', 26));
        collapse.addEventListener('click', closeFullPlayer);
        head.appendChild(collapse);
        head.appendChild(el('div', { class: 'em-full-label' }, 'Odtwarzanie teraz'));
        const queueBtn = el('button', { class: 'em-iconbtn', title: 'Kolejka' }, icon('queue', 24));
        queueBtn.addEventListener('click', () => toggleQueuePanel(fp));
        head.appendChild(queueBtn);
        // Wyłącznik czasowy — parity z aplikacją Android (15 → 30 → 60 → wył.).
        const sleepBtn = el('button', { class: 'em-iconbtn', title: 'Wyłącznik czasowy' }, icon('timer', 22));
        const paintSleepBtn = () => { sleepBtn.style.color = engine.sleepMinutes ? C.green : ''; };
        sleepBtn.addEventListener('click', () => {
            const next = engine.sleepMinutes === 0 ? 15 : engine.sleepMinutes === 15 ? 30 : engine.sleepMinutes === 30 ? 60 : 0;
            engine.setSleepTimer(next);
            paintSleepBtn();
            toast(next ? `Wyłącznik: ${next} min` : 'Wyłącznik wyłączony');
        });
        paintSleepBtn();
        head.appendChild(sleepBtn);
        inner.appendChild(head);

        // artwork
        const artWrap = el('div', { class: 'em-art-wrap' });
        if (t.thumb) { const img = el('img', { class: 'em-art', src: t.thumb, alt: '' }); img.addEventListener('error', () => img.replaceWith(defaultArt(t.title)), { once: true }); artWrap.appendChild(img); }
        else artWrap.appendChild(el('div', { class: 'em-art', style: `display:flex;align-items:center;justify-content:center;color:#fff;background:${coverGradient(t.title)}` }, icon('note', 80)));
        inner.appendChild(artWrap);

        // track line + like
        const tline = el('div', { class: 'em-trackline' });
        tline.appendChild(el('div', { style: 'min-width:0;flex:1' },
            el('div', { class: 'em-track-title' }, t.title),
            el('div', { class: 'em-track-sub' }, t.artist || '\u00a0')));
        const likeBtn = el('button', { class: 'em-iconbtn', title: 'Polub', style: store.isLiked(t) ? `color:${C.green}` : '' }, icon('heart', 24));
        likeBtn.addEventListener('click', async () => { await store.toggleLike(t, toast); buildFullPlayer(); });
        tline.appendChild(likeBtn);
        inner.appendChild(tline);

        // slider + times (live radio has no seek bar — like the Android player)
        const srow = el('div', { class: 'em-sliderrow' });
        let timeL = null;
        let range = null;
        let seeking = false;
        if (t.is_live) {
            srow.append(
                el('span', { style: `color:${C.green};font-size:12px;font-weight:800;letter-spacing:.8px` }, '● NA ŻYWO'),
                el('span', { class: 'em-time right', style: 'width:auto;margin-left:auto' }, t.title ? '' : '')
            );
            inner.appendChild(srow);
        } else {
            timeL = el('span', { class: 'em-time' }, '0:00');
            range = el('input', { type: 'range', class: 'em-range', min: '0', max: '1000', value: '0' });
            range.addEventListener('mousedown', () => seeking = true);
            window.addEventListener('mouseup', () => seeking = false);
            range.addEventListener('input', () => { const dur = engine.audio.duration || 0; timeL.textContent = fmtDur((range.value / 1000) * dur); });
            range.addEventListener('change', () => { const dur = engine.audio.duration || 0; engine.seek((range.value / 1000) * dur); });
            srow.append(timeL, range, el('span', { class: 'em-time right' }, t.dur ? fmtDur(t.dur) : ''));
            inner.appendChild(srow);
        }

        // controls
        const ctrls = el('div', { class: 'em-controls' });
        const shufB = el('button', { class: 'em-ctl' + (engine.shuffle ? ' on' : ''), title: 'Losowo' }, icon('shuffle', 20));
        shufB.addEventListener('click', () => engine.toggleShuffle());
        const prevB = el('button', { class: 'em-ctl', title: 'Poprzedni' }, icon('prev', 28));
        prevB.addEventListener('click', () => engine.prev());
        const playB = el('button', { class: 'em-playbig', title: 'Odtwórz / wstrzymaj' }, icon(engine.isPlaying ? 'pause' : 'play', 30));
        playB.addEventListener('click', () => engine.toggle());
        const nextB = el('button', { class: 'em-ctl', title: 'Następny' }, icon('next', 28));
        nextB.addEventListener('click', () => engine.next());
        const repB = el('button', { class: 'em-ctl' + (engine.repeat !== 'off' ? ' on' : ''), title: 'Powtarzaj' }, icon('repeat', 20) + (engine.repeat === 'one' ? '<span style="position:absolute;font-size:9px;font-weight:800;margin-top:-14px">1</span>' : ''));
        repB.addEventListener('click', () => engine.cycleRepeat());
        ctrls.append(shufB, prevB, playB, nextB, repB);
        inner.appendChild(ctrls);

        const sleepLbl = el('div', { style: `text-align:center;color:${C.green};font-size:11.5px;height:14px;margin-top:8px` }, '');
        const paintSleepLbl = () => {
            if (!engine.sleepMinutes) { sleepLbl.textContent = ''; return; }
            const sec = Math.ceil(engine.sleepLeftMs / 1000);
            sleepLbl.textContent = `Wyłącznik: ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
        };
        paintSleepLbl();
        inner.appendChild(sleepLbl);

        fp.appendChild(inner);
        root.appendChild(fp);
        fullEl = fp;

        // live updates (rebuild on track change; light updates otherwise)
        const subs = [];
        const onTrack = () => buildFullPlayer();
        const onPlaying = () => { playB.innerHTML = icon(engine.isPlaying ? 'pause' : 'play', 30); };
        const onTime = ({ pos, dur }) => {
            if (!range || !timeL) return;
            timeL.textContent = fmtDur(pos);
            if (seeking || !Number.isFinite(dur) || dur <= 0) return;
            range.value = Math.round((pos / dur) * 1000);
            paintRange(range);
        };
        const onMode = () => { shufB.classList.toggle('on', engine.shuffle); repB.classList.toggle('on', engine.repeat !== 'off'); };
        engine.on('track', onTrack, 'fp:track');
        engine.on('playing', onPlaying, 'fp:playing');
        engine.on('time', onTime, 'fp:time');
        engine.on('mode', onMode, 'fp:mode');
        engine.on('sleep', () => { paintSleepBtn(); paintSleepLbl(); }, 'fp:sleep');
    }

    function defaultArt(title) {
        return el('div', { class: 'em-art', style: `display:flex;align-items:center;justify-content:center;color:#fff;background:${coverGradient(title)}` }, icon('note', 80));
    }

    function paintRange(range) {
        const v = range.value / 1000 * 100;
        range.style.background = `linear-gradient(to right, ${C.green} ${v}%, var(--em-track) ${v}%)`;
    }

    // ── Queue panel (FullPlayerScreen.kt) ────────────────────────────
    function toggleQueuePanel(fp) {
        const old = fp.querySelector('.em-queuepanel');
        if (old) { old.remove(); return; }
        const panel = el('div', { class: 'em-queuepanel' });
        panel.appendChild(el('div', { class: 'em-queuehead' }, 'Kolejka',
            (() => { const b = el('button', { class: 'em-iconbtn', title: 'Zamknij' }, icon('close', 20)); b.addEventListener('click', () => panel.remove()); return b; })()));
        const list = el('div', { class: 'em-queuelist' });
        if (!engine.queue.length) list.appendChild(el('div', { style: 'color:var(--em-muted);font-size:13px;padding:8px 6px' }, 'Kolejka jest pusta.'));
        engine.queue.forEach((t, i) => {
            const row = el('div', { class: 'em-row', style: i === engine.index ? `background:${C.elevated}` : '' });
            row.append(el('span', { class: 'em-row-idx' }, String(i + 1)), t.thumb ? el('img', { class: 'em-row-thumb', src: t.thumb, alt: '' }) : defaultRowThumb());
            row.appendChild(el('div', { class: 'em-row-main' },
                el('div', { class: 'em-row-title', style: i === engine.index ? `color:${C.green}` : '' }, t.title),
                el('div', { class: 'em-row-sub' }, t.artist || '\u00a0')));
            row.addEventListener('click', () => engine.jumpTo(i));
            list.appendChild(row);
        });
        panel.appendChild(list);
        fp.appendChild(panel);
    }

    // ── Engine → UI wiring (keyed — idempotent across window re-opens) ──
    function wireEngine() {
        engine.on('track', () => { if (app.fullPlayer) buildFullPlayer(); else renderMiniBar(); }, 'ui:track');
        // Persistent mini-bar updates (progress line + play/pause icon).
        engine.on('time', ({ pos, dur }) => {
            const prog = miniBar.querySelector('.em-mini-progress');
            if (prog) prog.style.width = dur ? `${(pos / dur) * 100}%` : '0%';
        }, 'ui:mini-time');
        engine.on('playing', () => {
            const b = miniBar.querySelector('[title="Odtwórz / wstrzymaj"]');
            if (b && miniBar.style.display !== 'none') b.innerHTML = icon(engine.isPlaying ? 'pause' : 'play', 24);
        }, 'ui:mini-playing');
    }

    // ── Boot ─────────────────────────────────────────────────────────
    wireEngine();
    // Przywróć ostatnią kolejkę/pozycję (bez pobierania strumienia, dopóki nie klikniesz play).
    engine.restoreSession();
    store.load().then(() => { renderApp(); });}

// ── Package entry point ───────────────────────────────────────────────────────
export async function render(container, ctx) {
    _ctx = ctx;
    ctx.log('info', 'Music opened');
    renderMusicPage(container);
}
