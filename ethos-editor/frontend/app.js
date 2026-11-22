// T-ED — Code Editor (VS Code Dark+ workbench)
//
// Two modes:
//  • Single file — opened via the Files app or the desktop: breadcrumbs,
//    editor, status bar. No sidebar.
//  • Project — opened via "Open Folder": VS Code workbench with activity bar
//    (Explorer / Search / Source Control), a dynamic sidebar, a tabbed editor
//    with breadcrumbs, a bottom panel (split terminals, Output, Problems) and a
//    blue status bar. Source Control shows staged + unstaged changes, a commit
//    box, pull/push, recent history, and the open editor gets inline git diff
//    gutter markers (green = added line, red = deleted line).
//
// CodeMirror 5 + xterm.js come from the CDN scripts in index.html.

// ── Native-module shim ────────────────────────────────────────────────────────
// The module is loaded as a blob, so shell services arrive through `ctx`.
let _ctx = null;

const _windowId = () => `pkg-${_ctx.pkg.id}`;

// ── Stylesheet (this module owns it; the core copy is legacy) ────────────────
// The window is styled by this text, injected once per page. Keeping it here
// makes the package self-contained: a host that does not ship the legacy
// `.ed-*` rules in index.html still renders the workbench correctly.
const _EDITOR_CSS = "        /* \u2500\u2500 Code Editor App (VS Code Dark+ look & feel) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n        /* Palette: editor #1E1E1E \u00b7 sidebar #252526 \u00b7 activity bar #333333 \u00b7\n           status bar #007ACC \u00b7 tabs #252526/#2D2D2D \u00b7 accent #007ACC. */\n        .ed-shell {\n            display:flex; flex-direction:column; height:100%; min-height:0;\n            --vs-editor:#1E1E1E; --vs-sidebar:#252526; --vs-activitybar:#333333;\n            --vs-panel:#1E1E1E; --vs-statusbar:#007ACC; --vs-tabbar:#252526;\n            --vs-tab-inactive:#2D2D2D; --vs-text:#CCCCCC; --vs-text-dim:#858585; --vs-text-bright:#FFFFFF;\n            --vs-border:rgba(128,128,128,.25); --vs-hover:rgba(90,93,94,.35);\n            --vs-active:#04395E; --vs-focus:#007FD4;\n            --vs-btn:#0E639C; --vs-btn-hover:#1177BB;\n            --vs-input:#3C3C3C;\n            --vs-git-mod:#E2C089; --vs-git-add:#81B88B; --vs-git-del:#E06C75;\n            --vs-diff-add:rgba(60,151,105,.22); --vs-diff-del:rgba(245,120,120,.25);\n            --vs-diff-gutter-add:#357A3F; --vs-diff-gutter-del:#5A1D1D;\n            --vs-font-ui:\"Segoe UI\",system-ui,-apple-system,\"Helvetica Neue\",sans-serif;\n            --vs-font-mono:\"Cascadia Code\",\"JetBrains Mono\",Consolas,Menlo,\"Courier New\",monospace;\n            background:var(--vs-editor);\n            font-family:var(--vs-font-ui);\n        }\n        .ed-content { flex:1; min-height:0; display:flex; flex-direction:column; }\n        .ed-root { flex:1; min-height:0; display:flex; flex-direction:column; background:var(--vs-editor); }\n\n        /* \u2500\u2500 Menu bar (File / Edit / View / Terminal / Help) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n        .ed-menubar {\n            flex:none; height:27px; display:flex; align-items:center; gap:1px;\n            background:#3C3C3C; border-bottom:1px solid var(--vs-border);\n            padding:0 4px; font-family:var(--vs-font-ui);\n        }\n        .ed-menu-btn {\n            border:none; background:none; color:var(--vs-text); font-size:12.5px;\n            font-family:var(--vs-font-ui); padding:4px 8px; cursor:pointer; border-radius:3px;\n        }\n        .ed-menu-btn:hover, .ed-menu-btn.open { background:var(--vs-hover); color:var(--vs-text-bright); }\n        .ed-menu {\n            position:fixed; min-width:240px; max-height:70vh; overflow-y:auto;\n            background:#2D2D2D; border:1px solid var(--vs-border);\n            box-shadow:0 4px 14px rgba(0,0,0,.5); padding:4px 0; z-index:990;\n        }\n        .ed-menu-item {\n            display:flex; align-items:center; justify-content:space-between; gap:28px;\n            padding:5px 16px 5px 20px; font-size:12.5px; color:var(--vs-text);\n            cursor:pointer; white-space:nowrap; font-family:var(--vs-font-ui);\n        }\n        .ed-menu-item:hover, .ed-menu-item.hl { background:var(--vs-active); color:var(--vs-text-bright); }\n        .ed-menu-item[disabled] { color:var(--vs-text-dim); opacity:.55; cursor:default; }\n        .ed-menu-item[disabled]:hover, .ed-menu-item[disabled].hl { background:none; color:var(--vs-text-dim); }\n        .ed-menu-hint { color:var(--vs-text-dim); font-size:11px; }\n        .ed-menu-item:hover .ed-menu-hint, .ed-menu-item.hl .ed-menu-hint { color:#B9B9B9; }\n\n        /* In-file find / replace widget (Ctrl+F, Ctrl+Shift+F) */\n        .ed-findbar {\n            position:absolute; top:6px; right:12px; z-index:40;\n            display:flex; align-items:center; gap:6px; flex-wrap:wrap;\n            background:#252526; border:1px solid rgba(128,128,128,.35); border-radius:4px;\n            box-shadow:0 4px 14px rgba(0,0,0,.45); padding:5px 8px;\n            font-family:var(--vs-font-ui); max-width:calc(100% - 24px);\n        }\n        .ed-findbar[hidden] { display:none; }\n        .ed-findbar-input {\n            background:#3C3C3C; border:1px solid transparent; border-radius:3px;\n            color:var(--vs-text); font-size:12px; padding:3px 8px; width:180px; outline:none;\n        }\n        .ed-findbar-input:focus { border-color:var(--vs-focus); }\n        .ed-findbar-count { color:var(--vs-text-dim); font-size:11px; min-width:44px; text-align:center; }\n        .ed-findbar-opt { font-size:12px; color:var(--vs-text-dim); cursor:pointer; user-select:none; }\n        .ed-findbar-opt.on { color:var(--vs-text-bright); }\n        .ed-findbar-replace-row { width:100%; display:flex; align-items:center; gap:6px; margin-top:2px; }\n        .ed-findbar-replace-row[hidden] { display:none; }\n        .ed-findbar-row { display:flex; align-items:center; gap:4px; width:100%; }\n        .ed-findbar .ed-tb-btn[data-find] { min-width:22px; text-align:center; }\n        .ed-findbar .ed-findbar-opt {\n            border:1px solid transparent; background:none; border-radius:3px;\n            padding:2px 5px; color:var(--vs-text-dim); cursor:pointer;\n            font-size:11px; font-weight:600; font-family:var(--vs-font-ui); line-height:1.2;\n        }\n        .ed-findbar .ed-findbar-opt:hover { background:var(--vs-hover); color:var(--vs-text); }\n        .ed-findbar .ed-findbar-opt.on {\n            color:var(--vs-text-bright); border-color:var(--vs-focus);\n            background:rgba(0,122,204,.18);\n        }\n        .ed-findbar-count.bad { color:#F48771; }\n        .ed-crumb-actions .ed-tb-btn {\n            border:1px solid var(--vs-border); border-radius:3px; padding:1px 8px;\n            color:var(--vs-text); background:rgba(255,255,255,.03);\n        }\n        .ed-crumb-actions .ed-tb-btn:hover { background:var(--vs-hover); color:var(--vs-text-bright); }\n        .ed-editors-empty-keys {\n            display:flex; flex-wrap:wrap; gap:14px; margin-top:14px;\n            font-size:11.5px; color:var(--vs-text-dim);\n        }\n        .ed-editors-empty-keys kbd {\n            background:var(--vs-input); border:1px solid var(--vs-border); border-bottom-width:2px;\n            border-radius:3px; padding:1px 6px; margin-right:5px;\n            font-family:var(--vs-font-mono); font-size:10.5px; color:var(--vs-text);\n        }\n        .ed-menu-sep { height:1px; background:var(--vs-border); margin:4px 10px; }\n        .ed-kbd-table { display:flex; flex-direction:column; gap:7px; min-width:320px; }\n        .ed-kbd-row { display:flex; align-items:center; justify-content:space-between; gap:24px; font-size:13px; color:var(--vs-text); }\n        .ed-kbd-row kbd {\n            background:var(--vs-input); border:1px solid var(--vs-border); border-bottom-width:2px;\n            border-radius:3px; padding:2px 7px; font-size:11.5px; font-family:var(--vs-font-mono);\n            color:var(--vs-text-bright); white-space:nowrap;\n        }\n        .ed-about { display:flex; flex-direction:column; gap:10px; min-width:340px; }\n        .ed-about-name { font-size:16px; font-weight:700; color:var(--vs-text-bright); }\n        .ed-about-desc { font-size:13px; line-height:1.55; color:var(--vs-text); }\n\n        /* \u2500\u2500 Workbench: activity bar + sidebar + editor column \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n        .ed-workbench { flex:1; display:flex; min-height:0; }\n        .ed-activitybar {\n            width:48px; flex:none; background:var(--vs-activitybar);\n            display:flex; flex-direction:column; align-items:center; padding-top:2px;\n        }\n        .ed-ab-item {\n            position:relative; width:48px; height:44px; border:none; background:none;\n            color:#858585; cursor:pointer; display:flex; align-items:center; justify-content:center;\n            border-left:2px solid transparent;\n        }\n        .ed-ab-item svg { width:24px; height:24px; fill:currentColor; }\n        .ed-ab-item:hover { color:#ffffff; }\n        .ed-ab-item.active { color:#ffffff; border-left-color:#ffffff; }\n        .ed-ab-badge {\n            position:absolute; right:5px; bottom:4px; min-width:15px; height:15px; padding:0 3px;\n            border-radius:8px; background:var(--vs-focus); color:#fff; font-size:9.5px; font-weight:600;\n            display:flex; align-items:center; justify-content:center;\n        }\n        .ed-sidebar {\n            width:264px; flex:none; background:var(--vs-sidebar);\n            border-right:1px solid var(--vs-border); display:flex; flex-direction:column; min-height:0;\n        }\n        .ed-sidebar.collapsed { display:none; }\n        .ed-side-resize { flex:none; width:4px; cursor:col-resize; z-index:2; background:transparent; }\n        .ed-side-resize:hover, .ed-side-resize.active { background:var(--vs-focus); }\n        .ed-sidebar.collapsed + .ed-side-resize { display:none; }\n        body.ed-side-dragging, body.ed-side-dragging * { cursor:col-resize !important; user-select:none !important; }\n        .ed-side-view { flex:1; min-height:0; display:flex; flex-direction:column; }\n        .ed-side-view[hidden] { display:none; }\n        .ed-side-header {\n            flex:none; height:32px; display:flex; align-items:center; justify-content:space-between;\n            padding:0 14px 0 18px; font-size:11px; letter-spacing:.08em; color:var(--vs-text-dim);\n        }\n        .ed-side-empty {\n            flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center;\n            gap:8px; padding:20px; text-align:center; color:var(--vs-text-dim); font-size:12.5px; line-height:1.5;\n        }\n        .ed-side-empty-icon { font-size:28px; opacity:.6; }\n\n        /* Explorer */\n        .ed-explorer-section {\n            flex:none; display:flex; align-items:center; gap:4px;\n            padding:3px 8px 3px 14px; font-size:11px; font-weight:700; letter-spacing:.05em;\n        }\n        .ed-explorer-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }\n        .ed-explorer-actions { margin-left:auto; display:flex; gap:2px; }\n        .ed-tree { flex:1; min-height:0; overflow-y:auto; padding:2px 0; font-size:13px; }\n        .ed-tree-row {\n            display:flex; align-items:center; gap:5px; padding:3px 10px 3px 14px;\n            cursor:pointer; white-space:nowrap; color:var(--vs-text); user-select:none;\n        }\n        .ed-tree-row:hover { background:var(--vs-hover); }\n        .ed-tree-row.selected { background:var(--vs-active); }\n        .ed-tree-caret { flex:none; width:12px; font-size:9px; color:var(--vs-text-dim); text-align:center; }\n        .ed-tree-kids .ed-tree-row { padding-left:30px; }\n        .ed-tree-kids .ed-tree-kids .ed-tree-row { padding-left:46px; }\n        .ed-tree-kids .ed-tree-kids .ed-tree-kids .ed-tree-row { padding-left:62px; }\n        .ed-tree-icon {\n            flex:none; width:16px; height:16px; display:flex; align-items:center; justify-content:center;\n            color:var(--vs-text-dim);\n        }\n        .ed-tree-icon.dir { color:#dcb67a; }\n        .ed-tree-icon svg { width:14px; height:14px; fill:currentColor; }\n        .ed-file-badge {\n            flex:none; width:16px; height:16px; border-radius:3px;\n            display:flex; align-items:center; justify-content:center;\n            color:#fff; font-size:7px; font-weight:800; letter-spacing:-.02em;\n            font-family:var(--vs-font-ui); line-height:1; user-select:none;\n        }\n        .ed-tab .ed-file-badge, .ed-search-row .ed-file-badge,\n        .ed-search-file .ed-file-badge, .ed-quickopen-row .ed-file-badge {\n            width:14px; height:14px; font-size:6.5px; border-radius:2px;\n        }\n        .ed-explorer-section { cursor:pointer; }\n        .ed-explorer-section:hover { background:var(--vs-hover); }\n        .ed-explorer-actions .ed-icon-btn { padding:2px 4px; }\n        .ed-explorer-actions .ed-icon-btn svg { width:15px; height:15px; fill:currentColor; display:block; }\n        .ed-tree-name { overflow:hidden; text-overflow:ellipsis; }\n        .ed-tree-empty, .ed-tree-error { padding:8px 16px; font-size:12px; color:var(--vs-text-dim); }\n\n        /* Search view */\n        .ed-search-wrap { flex:none; padding:0 10px 8px; }\n        .ed-search-input {\n            width:100%; box-sizing:border-box; background:var(--vs-input);\n            border:1px solid transparent; border-radius:2px; padding:5px 8px;\n            font-size:12.5px; color:var(--vs-text); outline:none; font-family:var(--vs-font-ui);\n        }\n        .ed-search-input:focus { border-color:var(--vs-focus); }\n        .ed-search-results { flex:1; min-height:0; overflow-y:auto; }\n        .ed-search-row {\n            display:flex; align-items:center; gap:6px; padding:3px 14px 3px 22px;\n            font-size:12.5px; color:var(--vs-text); cursor:pointer;\n        }\n        .ed-search-row:hover { background:var(--vs-hover); }\n        .ed-search-name { flex:none; max-width:45%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }\n        .ed-search-dir {\n            flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;\n            direction:rtl; text-align:left; color:var(--vs-text-dim); font-size:11px;\n        }\n        .ed-search-count { padding:6px 14px; font-size:11.5px; color:var(--vs-text-dim); }\n\n        /* Search \u2014 mode toggles + content matches */\n        .ed-search-opts {\n            display:flex; align-items:center; gap:6px; margin-top:6px;\n            font-size:11px; color:var(--vs-text-dim);\n        }\n        .ed-search-mode { opacity:.65; }\n        .ed-search-mode.active {\n            opacity:1; background:var(--vs-active); color:var(--vs-text-bright);\n            box-shadow:inset 0 0 0 1px var(--vs-focus);\n        }\n        .ed-search-opt { display:flex; align-items:center; gap:3px; cursor:pointer; user-select:none; }\n        .ed-search-opt input { accent-color:var(--vs-focus); margin:0; }\n        .ed-search-file {\n            display:flex; align-items:baseline; gap:6px; padding:4px 14px;\n            font-size:12.5px; color:var(--vs-text-bright); cursor:pointer;\n            background:rgba(255,255,255,.03); border-top:1px solid var(--vs-border);\n        }\n        .ed-search-file:hover { background:var(--vs-hover); }\n        .ed-search-line {\n            display:flex; align-items:baseline; gap:8px; padding:2px 14px 2px 28px;\n            font-size:12px; font-family:var(--vs-font-mono); color:var(--vs-text);\n            cursor:pointer; white-space:nowrap; overflow:hidden;\n        }\n        .ed-search-line:hover { background:var(--vs-hover); }\n        .ed-search-ln { flex:none; width:34px; text-align:right; color:var(--vs-text-dim); font-size:11px; }\n        .ed-search-text { overflow:hidden; text-overflow:ellipsis; }\n\n        /* Inline rename / new entry input in the Explorer */\n        .ed-tree-row.ed-tree-inline { background:var(--vs-active); }\n        .ed-tree-input {\n            flex:1; min-width:0; background:var(--vs-input); color:var(--vs-text-bright);\n            border:1px solid var(--vs-focus); border-radius:2px; padding:1px 4px;\n            font-size:12.5px; font-family:var(--vs-font-ui); outline:none;\n        }\n        .ed-tree-row.ed-flash { animation:ed-flash-row .9s ease-out; }\n        @keyframes ed-flash-row {\n            0% { background:rgba(0,122,204,.45); }\n            100% { background:transparent; }\n        }\n\n        /* Quick Open overlay (Ctrl+P) */\n        .ed-quickopen {\n            position:fixed; inset:0; z-index:9998; background:rgba(0,0,0,.35);\n            display:flex; align-items:flex-start; justify-content:center; padding-top:12vh;\n        }\n        .ed-quickopen-box {\n            width:min(620px, 92vw); max-height:60vh; display:flex; flex-direction:column;\n            background:var(--vs-sidebar); border:1px solid var(--vs-focus); border-radius:4px;\n            box-shadow:0 24px 80px rgba(0,0,0,.65); overflow:hidden;\n        }\n        .ed-quickopen-input {\n            width:100%; box-sizing:border-box; background:var(--vs-input); color:var(--vs-text-bright);\n            border:none; border-bottom:1px solid var(--vs-border); padding:10px 12px;\n            font-size:14px; font-family:var(--vs-font-ui); outline:none;\n        }\n        .ed-quickopen-list { overflow-y:auto; min-height:0; }\n        .ed-quickopen-row {\n            display:flex; align-items:baseline; gap:10px; padding:6px 12px;\n            font-size:12.5px; color:var(--vs-text); cursor:pointer;\n        }\n        .ed-quickopen-row.active, .ed-quickopen-row:hover { background:var(--vs-focus); color:#fff; }\n        .ed-quickopen-name { flex:none; color:inherit; }\n        .ed-quickopen-path {\n            flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;\n            color:var(--vs-text-dim); font-size:11px;\n        }\n        .ed-quickopen-row.active .ed-quickopen-path { color:rgba(255,255,255,.8); }\n        .ed-quickopen-empty { padding:10px 12px; font-size:12px; color:var(--vs-text-dim); }\n        .ed-quickopen-hint {\n            margin-left:auto; flex:none; font-size:11px; color:var(--vs-text-dim);\n            font-family:var(--vs-font-mono);\n        }\n        .ed-quickopen-row.active .ed-quickopen-hint { color:rgba(255,255,255,.8); }\n\n        /* Outline view */\n        .ed-outline { flex:1; min-height:0; overflow-y:auto; padding:4px 0; }\n        .ed-outline-row {\n            display:flex; align-items:center; gap:6px; padding:3px 12px;\n            font-size:12.5px; color:var(--vs-text); cursor:pointer;\n            white-space:nowrap; user-select:none;\n        }\n        .ed-outline-row:hover { background:var(--vs-hover); }\n        .ed-outline-kind {\n            flex:none; width:16px; height:16px; border-radius:3px;\n            display:flex; align-items:center; justify-content:center;\n            font-size:10px; font-weight:700; font-family:var(--vs-font-mono);\n            background:rgba(255,255,255,.06); color:var(--vs-text-dim);\n        }\n        .ed-outline-kind.k-function, .ed-outline-kind.k-method { color:#DCDCAA; }\n        .ed-outline-kind.k-class { color:#4EC9B0; }\n        .ed-outline-kind.k-type { color:#4EC9B0; }\n        .ed-outline-kind.k-heading { color:#569CD6; }\n        .ed-outline-kind.k-property { color:#9CDCFE; }\n        .ed-outline-name { overflow:hidden; text-overflow:ellipsis; }\n        .ed-outline-empty { padding:12px 16px; font-size:12px; color:var(--vs-text-dim); }\n\n        /* Markdown preview */\n        .ed-md-preview {\n            position:absolute; inset:0; overflow:auto; background:var(--vs-editor);\n            color:var(--vs-text); padding:18px 28px 60px; z-index:2;\n        }\n        .ed-md-body { max-width:900px; margin:0 auto; font-size:14px; line-height:1.65; }\n        .ed-md-body h1, .ed-md-body h2, .ed-md-body h3,\n        .ed-md-body h4, .ed-md-body h5, .ed-md-body h6 {\n            color:var(--vs-text-bright); margin:1.2em 0 .5em; line-height:1.25;\n        }\n        .ed-md-body h1 { font-size:1.9em; border-bottom:1px solid var(--vs-border); padding-bottom:.3em; }\n        .ed-md-body h2 { font-size:1.45em; border-bottom:1px solid var(--vs-border); padding-bottom:.25em; }\n        .ed-md-body a { color:#4daafc; }\n        .ed-md-body code {\n            background:rgba(255,255,255,.08); padding:1px 5px; border-radius:3px;\n            font-family:var(--vs-font-mono); font-size:.92em;\n        }\n        .ed-md-body pre {\n            background:#252526; border:1px solid var(--vs-border); border-radius:4px;\n            padding:12px 14px; overflow-x:auto;\n        }\n        .ed-md-body pre code { background:none; padding:0; }\n        .ed-md-body blockquote {\n            margin:.8em 0; padding:.2em 0 .2em 14px; border-left:3px solid var(--vs-focus);\n            color:var(--vs-text-dim);\n        }\n        .ed-md-body table { border-collapse:collapse; margin:.8em 0; }\n        .ed-md-body th, .ed-md-body td { border:1px solid var(--vs-border); padding:6px 10px; }\n        .ed-md-body img { max-width:100%; }\n        .ed-md-body hr { border:none; border-top:1px solid var(--vs-border); margin:1.4em 0; }\n\n        /* CodeMirror search / jump dialogs (Ctrl+F / Ctrl+H / Ctrl+G) */\n        .ed-cm .CodeMirror-dialog {\n            background:#252526; color:var(--vs-text-bright); border-bottom:1px solid var(--vs-border);\n            font-family:var(--vs-font-ui); font-size:12.5px; padding:4px 8px;\n        }\n        .ed-cm .CodeMirror-dialog-top { border-top:1px solid var(--vs-border); border-bottom:none; }\n        .ed-cm .CodeMirror-dialog input {\n            background:var(--vs-input); color:var(--vs-text-bright); border:1px solid var(--vs-focus);\n            border-radius:2px; padding:2px 6px; font-family:var(--vs-font-mono); font-size:12.5px;\n            outline:none;\n        }\n        .ed-cm .CodeMirror-dialog button {\n            background:var(--vs-btn); color:#fff; border:none; border-radius:2px;\n            padding:3px 8px; font-size:12px; cursor:pointer; margin-left:4px;\n        }\n        .ed-cm .CodeMirror-search-hint { color:var(--vs-text-dim); }\n        .ed-cm .CodeMirror-search-field { width:220px; }\n\n        /* Source Control view */\n        .ed-scm-commit { flex:none; padding:0 10px 8px; display:flex; flex-direction:column; gap:6px; }\n        .ed-scm-msg {\n            width:100%; box-sizing:border-box; background:var(--vs-input);\n            border:1px solid transparent; border-radius:2px; padding:6px 8px;\n            font-size:12.5px; color:var(--vs-text); outline:none; font-family:var(--vs-font-ui);\n            resize:none; line-height:1.4;\n        }\n        .ed-scm-msg:focus { border-color:var(--vs-focus); }\n        .ed-scm-commit-btn {\n            display:flex; align-items:center; justify-content:center; gap:6px;\n            background:var(--vs-btn); border:none; border-radius:2px; color:#fff;\n            font-size:12.5px; padding:6px 10px; cursor:pointer; font-family:var(--vs-font-ui);\n        }\n        .ed-scm-commit-btn:hover { background:var(--vs-btn-hover); }\n        .ed-scm-commit-btn:disabled { opacity:.5; cursor:default; }\n        .ed-scm-body { flex:1; min-height:0; overflow-y:auto; display:flex; flex-direction:column; }\n        .ed-scm-section {\n            flex:none; display:flex; align-items:center; gap:6px;\n            padding:7px 14px 3px; font-size:11px; font-weight:700; letter-spacing:.05em;\n        }\n        .ed-scm-count { color:var(--vs-text-dim); font-weight:400; }\n        .ed-scm-files { flex:none; }\n        .ed-scm-file {\n            display:flex; align-items:center; gap:6px; padding:3px 14px 3px 26px;\n            font-size:12.5px; color:var(--vs-text); cursor:pointer;\n        }\n        .ed-scm-file:hover { background:var(--vs-hover); }\n        .ed-scm-file.selected { background:var(--vs-active); }\n        .ed-scm-letter {\n            flex:none; width:14px; text-align:center; font-size:11px; font-weight:700;\n            font-family:var(--vs-font-mono);\n        }\n        .ed-scm-letter.M, .ed-scm-letter.R { color:var(--vs-git-mod); }\n        .ed-scm-letter.A, .ed-scm-letter.U { color:var(--vs-git-add); }\n        .ed-scm-letter.D, .ed-scm-letter.C { color:var(--vs-git-del); }\n        .ed-scm-path { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }\n        .ed-scm-dir { color:var(--vs-text-dim); }\n        .ed-scm-file-actions { display:none; gap:2px; }\n        .ed-scm-file:hover .ed-scm-file-actions { display:flex; }\n        .ed-scm-history { flex:1; min-height:40px; }\n        .ed-scm-log { display:flex; flex-direction:column; gap:2px; padding:5px 14px; cursor:pointer; }\n        .ed-scm-log:hover { background:var(--vs-hover); }\n        .ed-scm-log-subject {\n            font-size:12px; color:var(--vs-text);\n            white-space:nowrap; overflow:hidden; text-overflow:ellipsis;\n        }\n        .ed-scm-log-meta { font-size:10.5px; color:var(--vs-text-dim); display:flex; gap:8px; }\n\n        /* Pro sections: BRANCHES / REMOTES / STASH */\n        .ed-scm-sec { cursor:pointer; user-select:none; }\n        .ed-scm-sec:hover { background:var(--vs-hover); }\n        .ed-scm-caret { font-size:9px; color:var(--vs-text-dim); width:10px; flex:none; }\n        .ed-scm-sec-actions { margin-left:auto; display:flex; gap:2px; }\n        .ed-scm-sec-actions .ed-tb-btn { padding:2px 5px; font-size:11px; }\n        .ed-scm-sublabel { padding:6px 14px 2px 26px; font-size:10px; font-weight:700; letter-spacing:.08em; color:var(--vs-text-dim); }\n        .ed-scm-file-current .ed-scm-file-label { color:var(--vs-git-add); }\n        .ed-scm-row-btn { font-size:11px; padding:2px 5px; opacity:0; }\n        .ed-scm-file:hover .ed-scm-row-btn { opacity:1; }\n        .ed-scm-url { font-family:var(--vs-font-mono); font-size:11.5px; color:var(--vs-text-dim); }\n        .ed-scm-stash-clear { color:var(--vs-text-dim); font-size:11.5px; font-style:italic; }\n        .ed-scm-merge-warn {\n            flex:none; display:flex; align-items:center; gap:6px; padding:6px 12px;\n            font-size:11.5px; color:#CCA700; background:rgba(204,167,0,.12);\n            border-bottom:1px solid rgba(204,167,0,.3);\n        }\n\n        /* Clone / new-project form inside modals */\n        .ed-np-form { display:flex; flex-direction:column; gap:6px; }\n        .ed-np-form label { font-size:11.5px; color:var(--text-2, #64748b); margin-top:4px; }\n        .ed-np-parent-row { display:flex; gap:6px; align-items:center; }\n        .ed-np-parent-row .ethos-modal-input { flex:1; min-width:0; }\n\n        /* Editor column: tabs + breadcrumbs + editor surface */\n        .ed-maincol { flex:1; min-width:0; display:flex; flex-direction:column; min-height:0; }\n        .ed-tabs {\n            flex:none; display:flex; align-items:stretch; background:var(--vs-tabbar);\n            height:34px; overflow-x:auto; overflow-y:hidden; scrollbar-width:thin;\n        }\n        .ed-tabs::-webkit-scrollbar { height:3px; }\n        .ed-tab {\n            display:flex; align-items:center; gap:6px; padding:0 8px 0 12px; min-width:0; max-width:220px;\n            background:var(--vs-tab-inactive); color:var(--vs-text-dim);\n            border-right:1px solid rgba(0,0,0,.35); cursor:pointer; font-size:12.5px;\n            position:relative; flex:none;\n        }\n        .ed-tab:hover { color:var(--vs-text); }\n        .ed-tab.active { background:var(--vs-editor); color:var(--vs-text-bright); }\n        .ed-tab.active::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; background:var(--vs-focus); }\n        .ed-tab-icon { flex:none; width:14px; height:14px; display:flex; align-items:center; justify-content:center; color:var(--vs-text-dim); }\n        .ed-tab-icon svg { width:13px; height:13px; fill:currentColor; }\n        .ed-tab-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }\n        .ed-tab-dot {\n            width:8px; height:8px; border-radius:50%; background:#CCCCCC; flex:none;\n        }\n        .ed-tab-close {\n            border:none; background:none; color:var(--vs-text-dim); font-size:14px; line-height:1;\n            padding:2px 4px; border-radius:4px; cursor:pointer; flex:none;\n        }\n        .ed-tab-close:hover { background:rgba(255,255,255,.18); color:#fff; }\n        .ed-tabs .ed-tab-save {\n            margin-left:auto; margin-right:8px; align-self:center; flex:none;\n            border:1px solid var(--vs-border); border-radius:3px;\n            padding:2px 9px; color:var(--vs-text); background:rgba(255,255,255,.03);\n            font-size:11.5px;\n        }\n        .ed-tabs .ed-tab-save:hover { background:var(--vs-hover); color:var(--vs-text-bright); }\n\n        .ed-breadcrumbs {\n            flex:none; min-height:22px; display:flex; align-items:center; gap:0; padding:0 10px;\n            background:var(--vs-editor); border-bottom:1px solid var(--vs-border);\n            font-size:11.5px; color:var(--vs-text-dim); overflow:hidden; white-space:nowrap;\n        }\n        .ed-breadcrumbs[hidden] { display:none; }\n        .ed-crumb { padding:2px 4px; border-radius:3px; cursor:pointer; }\n        .ed-crumb:hover { background:var(--vs-hover); color:var(--vs-text); }\n        .ed-crumb.current { color:var(--vs-text); cursor:default; }\n        .ed-crumb-sep { margin:0 1px; opacity:.7; }\n        .ed-crumb-actions { margin-left:auto; display:flex; gap:2px; }\n\n        .ed-editors { flex:1; min-height:0; position:relative; overflow:hidden; background:var(--vs-editor); }\n        .ed-editor-pane { position:absolute; inset:0; display:flex; flex-direction:column; }\n        .ed-editor-pane[hidden] { display:none; }\n        .ed-editor-pane .ed-cm { flex:1; min-height:0; }\n        .ed-pane-loading { margin:auto; color:var(--vs-text-dim); font-size:12.5px; }\n        .ed-pane-error {\n            position:absolute; inset:0; display:flex; flex-direction:column;\n            align-items:center; justify-content:center; gap:10px;\n            text-align:center; padding:24px;\n        }\n        .ed-editors-empty {\n            position:absolute; inset:0; display:flex; flex-direction:column;\n            align-items:center; justify-content:center; gap:6px; color:var(--vs-text-dim);\n        }\n        .ed-editors-empty-icon { font-size:44px; opacity:.35; }\n        .ed-editors-empty-hint { font-size:12px; opacity:.8; }\n        .ed-main { flex:1; position:relative; min-height:0; overflow:hidden; }\n        .ed-main .ed-cm, .ed-main .ed-textarea-fb { position:absolute; inset:0; }\n\n        /* CodeMirror (VS Code Dark+) */\n        .ed-cm .CodeMirror {\n            height:100%; background:transparent; color:#D4D4D4;\n            font-family:var(--vs-font-mono); font-size:13.5px; line-height:1.5;\n        }\n        .ed-cm .CodeMirror-gutters { background:transparent; border-right:1px solid var(--vs-border); width:auto; }\n        .ed-cm .CodeMirror-linenumber { color:#858585; }\n        .ed-cm .CodeMirror-cursor { border-left:2px solid #AEAFAD; }\n        .ed-cm .CodeMirror-activeline-background { background:rgba(255,255,255,.045); }\n        .ed-cm .CodeMirror-selected { background:#264F78; }\n        .ed-cm .CodeMirror-matchingbracket { color:#FFD700; }\n        .ed-cm .CodeMirror-foldGutter { border-right:none; }\n        /* VS Code Dark+ token colors \u2014 the editor mounts with theme:'ed-vscode',\n           which makes CodeMirror add the .cm-s-ed-vscode class; CM5 themes are\n           plain CSS (there is no CodeMirror.defineTheme API). */\n        .ed-cm .cm-s-ed-vscode .cm-comment { color:#6A9955; }\n        .ed-cm .cm-s-ed-vscode .cm-string { color:#CE9178; }\n        .ed-cm .cm-s-ed-vscode .cm-number { color:#B5CEA8; }\n        .ed-cm .cm-s-ed-vscode .cm-atom { color:#569CD6; }\n        .ed-cm .cm-s-ed-vscode .cm-keyword { color:#569CD6; }\n        .ed-cm .cm-s-ed-vscode .cm-builtin { color:#4EC9B0; }\n        .ed-cm .cm-s-ed-vscode .cm-variable,\n        .ed-cm .cm-s-ed-vscode .cm-variable-2,\n        .ed-cm .cm-s-ed-vscode .cm-def,\n        .ed-cm .cm-s-ed-vscode .cm-property { color:#9CDCFE; }\n        .ed-cm .cm-s-ed-vscode .cm-function { color:#DCDCAA; }\n        .ed-cm .cm-s-ed-vscode .cm-qualifier { color:#D4D4D4; }\n        .ed-cm .cm-s-ed-vscode .cm-operator { color:#D4D4D4; }\n        .ed-cm .cm-s-ed-vscode .cm-tag { color:#569CD6; }\n        .ed-cm .cm-s-ed-vscode .cm-attribute { color:#9CDCFE; }\n        .ed-cm .cm-s-ed-vscode .cm-bracket { color:#FF00FF; }\n        .ed-cm .cm-s-ed-vscode .cm-punctuation { color:#D4D4D4; }\n        .ed-cm .cm-s-ed-vscode .cm-meta { color:#D4D4D4; }\n        .ed-cm .cm-s-ed-vscode .cm-error { color:#F44747; }\n        .ed-cm .cm-s-ed-vscode .CodeMirror-selectedtext { background:#264F78; }\n        .ed-cm .cm-s-ed-vscode ::selection,\n        .ed-cm .cm-s-ed-vscode ::-moz-selection { background:#264F78; color:inherit; }\n        .ed-textarea-fb {\n            width:100%; height:100%; box-sizing:border-box; resize:none; border:none; outline:none;\n            background:transparent; color:#D4D4D4; font-family:var(--vs-font-mono);\n            font-size:13.5px; line-height:1.5; padding:4px 8px;\n        }\n\n        /* Git diff gutter + line backgrounds */\n        .ed-cm .CodeMirror-gutter-wrapper .ed-diff-gutter { width:auto; }\n        .ed-diff-mark { display:block; width:4px; height:100%; }\n        .ed-diff-mark.add { background:var(--vs-diff-gutter-add); }\n        .ed-diff-mark.del { background:var(--vs-diff-gutter-del); }\n        .ed-diff-line-add { background:var(--vs-diff-add); }\n        .ed-diff-line-del { background:var(--vs-diff-del); }\n\n        /* Bottom panel (tabs on top, body below) */\n        .ed-panel {\n            flex:none; display:flex; flex-direction:column;\n            border-top:1px solid var(--vs-border); background:var(--vs-panel);\n            position:relative; min-height:0;\n        }\n        /* Closed panel takes no space at all (the tab strip is part of the panel). */\n        .ed-panel[hidden] { display:none; }\n        /* Maximized: the panel fills the workbench and the editor area is hidden. */\n        .ed-panel.ed-panel-max { flex:1 1 auto; height:auto; min-height:0; border-top:none; }\n        .ed-panel-max .ed-panel-resize { display:none; }\n        .ed-content[hidden] { display:none; }\n        .ed-panel-resize { flex:none; height:4px; margin-top:-2px; cursor:row-resize; z-index:2; }\n        .ed-panel-tabs {\n            flex:none; display:flex; align-items:center; gap:0; height:32px; padding:0 6px;\n            border-bottom:1px solid var(--vs-border); background:var(--vs-panel);\n        }\n        .ed-panel-tab {\n            height:100%; border:none; background:none; color:var(--vs-text-dim);\n            font-size:11px; font-weight:600; letter-spacing:.06em; padding:0 10px;\n            cursor:pointer; border-bottom:2px solid transparent; font-family:var(--vs-font-ui);\n            display:flex; align-items:center; gap:6px;\n        }\n        .ed-panel-tab:hover { color:var(--vs-text); }\n        .ed-panel-tab.active { color:var(--vs-text-bright); border-bottom-color:var(--vs-focus); }\n        .ed-panel-tab-dot {\n            width:7px; height:7px; border-radius:50%; background:#4EC9B0; flex:none;\n        }\n        .ed-panel-tab-dot[data-kind=\"connecting\"] { background:#E2C089; }\n        .ed-panel-tab-dot[data-kind=\"reconnecting\"] { background:#E2C089; }\n        .ed-panel-tab-dot[data-kind=\"disconnected\"] { background:#858585; }\n        .ed-panel-tab-dot[data-kind=\"error\"] { background:#E06C75; }\n        .ed-panel-status { font-size:11px; color:var(--vs-text-dim); margin-left:4px; white-space:nowrap; }\n        .ed-panel-status[data-kind=\"error\"] { color:#E06C75; }\n        .ed-panel-cwd {\n            font-size:11px; color:var(--vs-text-dim); margin-left:8px;\n            overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:220px;\n        }\n        .ed-panel-body { flex:1; min-height:0; overflow:hidden; background:var(--vs-editor); }\n        .ed-panel-body[hidden] { display:none; }\n        .ed-panel-view { width:100%; height:100%; }\n        .ed-panel-view[hidden] { display:none; }\n\n        /* Terminal (split panes) */\n        .ed-term-splits { display:flex; width:100%; height:100%; }\n        .ed-term-pane { flex:1; min-width:0; position:relative; display:flex; flex-direction:column; }\n        .ed-term-pane + .ed-term-pane { border-left:1px solid var(--vs-border); }\n        .ed-term-body { flex:1; min-height:0; width:100%; }\n        .ed-term-body .xterm { padding:4px 8px; }\n        .ed-term-body .xterm-viewport { background:var(--vs-editor) !important; }\n        .ed-term-panebar {\n            position:absolute; top:0; right:0; display:none; align-items:center; gap:4px;\n            padding:2px 6px; background:rgba(37,37,38,.92); border-bottom-left-radius:4px; z-index:5;\n        }\n        .ed-term-pane:hover .ed-term-panebar { display:flex; }\n        .ed-term-pane-label { font-size:10.5px; color:var(--vs-text-dim); font-family:var(--vs-font-mono); }\n        .ed-term-pane-kill {\n            border:none; background:none; color:var(--vs-text-dim); cursor:pointer;\n            font-size:12px; padding:1px 4px; border-radius:3px; line-height:1;\n        }\n        .ed-term-pane-kill:hover { color:#fff; background:rgba(255,255,255,.18); }\n        .ed-term-error { padding:10px 14px; font-size:12.5px; color:#E06C75; }\n\n        /* Problems view (real per-file diagnostics) */\n        .ed-out-scroll { width:100%; height:100%; overflow-y:auto; padding:6px 12px; font-family:var(--vs-font-mono); font-size:12px; }\n        .ed-out-row { display:flex; gap:10px; padding:2px 0; align-items:baseline; }\n        .ed-out-msg { color:var(--vs-text); white-space:pre-wrap; word-break:break-word; }\n        .ed-out-src { color:var(--vs-text-dim); font-size:11px; flex:none; }\n        .ed-out-empty { color:var(--vs-text-dim); font-size:12.5px; padding:10px 4px; font-family:var(--vs-font-ui); }\n        .ed-prob-row {\n            display:flex; gap:8px; padding:2px 4px; align-items:baseline;\n            cursor:pointer; border-radius:3px;\n        }\n        .ed-prob-row:hover { background:rgba(255,255,255,.07); }\n        .ed-prob-icon { flex:none; width:12px; text-align:center; font-size:11px; }\n        .ed-prob-icon.error { color:#F48771; }\n        .ed-prob-icon.warning { color:#CCA700; }\n        .ed-prob-msg { color:var(--vs-text); white-space:pre-wrap; word-break:break-word; }\n        .ed-prob-loc { color:var(--vs-text-dim); font-size:11px; flex:none; margin-left:auto; }\n        .ed-prob-src { color:var(--vs-text-dim); font-size:11px; flex:none; }\n        .ed-problem-line { background:rgba(244,135,113,.10) !important; }\n        .ed-problem-line.warn { background:rgba(204,167,0,.10) !important; }\n        .ed-sb-item.has-errors { color:#F48771; }\n        .ed-sb-item.has-warnings { color:#CCA700; }\n\n        /* Status bar (VS Code blue) */\n        .ed-statusbar {\n            flex:none; height:22px; background:var(--vs-statusbar); color:#fff;\n            display:flex; align-items:center; justify-content:space-between;\n            padding:0 6px; font-size:11.5px; font-family:var(--vs-font-ui);\n        }\n        .ed-sb-left, .ed-sb-right { display:flex; align-items:center; height:100%; min-width:0; }\n        .ed-sb-item {\n            display:inline-flex; align-items:center; gap:4px; padding:0 6px; height:100%;\n            cursor:default; white-space:nowrap;\n        }\n        .ed-sb-item:hover { background:rgba(255,255,255,.14); }\n        .ed-sb-item.clickable { cursor:pointer; }\n        .ed-sb-branch { font-family:var(--vs-font-mono); }\n\n        /* Shared small buttons */\n        .ed-tb-btn {\n            flex:none; border:none; background:none; color:var(--vs-text-dim); font-size:12px;\n            padding:3px 7px; border-radius:4px; cursor:pointer; line-height:1; font-family:var(--vs-font-ui);\n        }\n        .ed-tb-btn:hover { color:var(--vs-text-bright); background:var(--vs-hover); }\n        .ed-tb-btn.active { color:var(--vs-focus); }\n        .ed-tb-btn:disabled { opacity:.5; cursor:default; }\n\n        /* Loading / error states */\n        .ed-root > .ed-loading { margin:auto; color:var(--vs-text-dim); font-size:13px; }\n        .ed-root[data-testid=\"editor-error\"] { align-items:center; justify-content:center; gap:10px; text-align:center; }\n\n        /* Welcome screen */\n        .ed-welcome {\n            align-items:center; justify-content:flex-start; text-align:center;\n            gap:10px; padding:28px 24px; overflow-y:auto;\n        }\n        .ed-prompt-icon { font-size:36px; line-height:1; }\n        .ed-prompt-title { font-weight:600; font-size:16px; color:var(--vs-text-bright); }\n        .ed-welcome-actions { display:flex; gap:8px; margin-top:4px; }\n        .ed-welcome-divider {\n            display:flex; align-items:center; gap:10px; width:100%; max-width:460px;\n            color:var(--vs-text-dim); font-size:11.5px; margin-top:8px;\n        }\n        .ed-welcome-divider::before, .ed-welcome-divider::after { content:''; flex:1; height:1px; background:var(--vs-border); }\n        .ed-prompt-form { display:flex; gap:8px; width:100%; max-width:460px; }\n        .ed-prompt-input {\n            flex:1; min-width:0; background:var(--vs-input); border:1px solid transparent;\n            border-radius:2px; padding:8px 12px; font-family:var(--vs-font-mono);\n            font-size:13px; color:var(--vs-text); outline:none;\n        }\n        .ed-prompt-input:focus { border-color:var(--vs-focus); }\n        .ed-recents { width:100%; max-width:460px; text-align:left; }\n        .ed-recents-title { font-size:11px; letter-spacing:.08em; color:var(--vs-text-dim); margin-bottom:6px; }\n        .ed-recent-row {\n            display:flex; align-items:center; gap:8px; padding:6px 10px;\n            border-radius:3px; cursor:pointer; font-size:13px; color:var(--vs-text);\n        }\n        .ed-recent-row:hover { background:var(--vs-hover); }\n        .ed-recent-empty { font-size:12px; color:var(--vs-text-dim); padding:4px 10px; }\n        .ed-recent-name { flex:none; font-weight:600; }\n        .ed-recent-path { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--vs-text-dim); font-size:11.5px; }\n        .ed-recent-x { border:none; background:none; color:var(--vs-text-dim); font-size:14px; cursor:pointer; padding:2px 5px; border-radius:3px; }\n        .ed-recent-x:hover { color:#fff; background:rgba(255,255,255,.18); }\n\n        /* Binary / too-large states */\n        .ed-root[data-testid=\"editor-binary\"], .ed-root[data-testid=\"editor-toolarge\"] {\n            align-items:center; justify-content:center; gap:10px; text-align:center; padding:24px;\n        }\n        .ed-bin-icon { font-size:36px; line-height:1; }\n        .ed-bin-title { font-weight:600; font-size:15px; color:var(--vs-text-bright); }\n        .ed-bin-msg { font-size:13px; color:var(--vs-text-dim); line-height:1.5; max-width:420px; }\n\n        /* Buttons inside the editor (VS Code style) */\n        .ed-shell .btn-primary { background:var(--vs-btn); border:1px solid transparent; color:#fff; border-radius:2px; }\n        .ed-shell .btn-primary:hover { background:var(--vs-btn-hover); }\n        .ed-shell .btn-primary:disabled { opacity:.5; }\n        .ed-shell .btn-ghost { background:transparent; border:1px solid var(--vs-border); color:var(--vs-text); border-radius:2px; }\n        .ed-shell .btn-ghost:hover { background:var(--vs-hover); }\n\n        /* Unsaved-changes dialog */\n        .ed-unsaved-overlay {\n            position:fixed; inset:0; z-index:9500; background:rgba(0,0,0,.45);\n            display:flex; align-items:center; justify-content:center;\n        }\n        .ed-unsaved-box {\n            background:#252526; border:1px solid rgba(128,128,128,.35); border-radius:6px;\n            padding:18px 20px; min-width:340px; max-width:460px;\n            box-shadow:0 24px 64px rgba(0,0,0,.5); font-family:var(--vs-font-ui);\n        }\n        .ed-unsaved-title { font-weight:600; font-size:14px; color:#fff; margin-bottom:6px; }\n        .ed-unsaved-msg { font-size:13px; color:var(--vs-text-dim); margin-bottom:14px; word-break:break-word; }\n        .ed-unsaved-actions { display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap; }\n        .ed-unsaved-actions .ed-ask-saveclose {\n            background:var(--vs-btn); color:#fff; border:none; border-radius:2px;\n            padding:6px 14px; font-size:12.5px; cursor:pointer;\n        }\n        .ed-unsaved-actions .ed-ask-saveclose:hover { background:var(--vs-btn-hover); }\n        .ed-unsaved-actions .ed-ask-discard, .ed-unsaved-actions .ed-ask-cancel {\n            background:transparent; color:var(--vs-text); border:1px solid var(--vs-border);\n            border-radius:2px; padding:6px 14px; font-size:12.5px; cursor:pointer;\n        }\n        .ed-unsaved-actions .ed-ask-discard:hover, .ed-unsaved-actions .ed-ask-cancel:hover { background:var(--vs-hover); }\n\n        /* Context menus (tree, terminal target) */\n        .ed-tree-menu {\n            position:fixed; z-index:9600; background:#2D2D2D;\n            border:1px solid rgba(128,128,128,.35); border-radius:5px;\n            box-shadow:0 8px 24px rgba(0,0,0,.5); padding:4px; min-width:170px;\n            font-family:var(--vs-font-ui);\n        }\n        .ed-tree-menu-item {\n            display:block; width:100%; text-align:left; border:none; background:none;\n            color:var(--vs-text); font-size:12.5px; padding:5px 10px; border-radius:3px;\n            cursor:pointer; white-space:nowrap;\n        }\n        .ed-tree-menu-item:hover { background:var(--vs-focus); color:#fff; }\n        .ed-tree-menu-item.danger { color:#F48771; }\n        .ed-tree-menu-item.danger:hover { background:#F48771; color:#fff; }\n        .ed-tree-menu-item.disabled { opacity:.45; cursor:default; }\n        .ed-tree-menu-item.disabled:hover { background:none; color:var(--vs-text); }\n        .ed-tree-menu-sep { height:1px; background:var(--vs-border); margin:4px 6px; }\n\n        /* \u2500\u2500 Code Editor \u2014 light theme (VS Code Light+) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n           The editor moved to the `ethos-editor` package, but its stylesheet\n           still lives here (see docs/apps.md). Light is the EthOS default, so\n           every surface and token needs a light variant. */\n        :root.light .ed-shell {\n            --vs-editor:#ffffff; --vs-sidebar:#f3f3f3; --vs-activitybar:#ececec;\n            --vs-panel:#ffffff; --vs-tabbar:#f3f3f3; --vs-tab-inactive:#ececec;\n            --vs-text:#333333; --vs-text-dim:#6b7280; --vs-text-bright:#111827;\n            --vs-border:rgba(0,0,0,.12); --vs-hover:rgba(0,0,0,.06);\n            --vs-active:#dbeafe; --vs-focus:#007FD4;\n            --vs-input:#ffffff;\n            --vs-diff-add:rgba(46,160,67,.15); --vs-diff-del:rgba(248,81,73,.15);\n            --vs-diff-gutter-add:#2ea043; --vs-diff-gutter-del:#d1242f;\n        }\n        :root.light .ed-menubar { background:#ececec; }\n        :root.light .ed-menu { background:#ffffff; box-shadow:0 6px 18px rgba(15,23,42,.18); }\n        :root.light .ed-findbar { background:#f3f3f3; border-color:rgba(0,0,0,.15); }\n        :root.light .ed-findbar-input { background:#ffffff; color:#333333; }\n        :root.light .ed-md-body code { background:rgba(0,0,0,.05); }\n        :root.light .ed-md-body pre { background:#f3f3f3; }\n        :root.light .ed-cm .CodeMirror-dialog { background:#f3f3f3; color:#111827; }\n        :root.light .ed-unsaved-box { background:#ffffff; box-shadow:0 24px 64px rgba(15,23,42,.25); }\n        :root.light .ed-unsaved-title { color:#111827; }\n        :root.light .ed-tree-menu { background:#ffffff; box-shadow:0 8px 24px rgba(15,23,42,.2); }\n        :root.light .ed-cm .CodeMirror { color:#1f2430; }\n        :root.light .ed-cm .CodeMirror-linenumber { color:#8a8f98; }\n        :root.light .ed-cm .CodeMirror-cursor { border-left-color:#1f2430; }\n        :root.light .ed-cm .CodeMirror-activeline-background { background:rgba(0,0,0,.04); }\n        :root.light .ed-cm .CodeMirror-selected { background:#b3d4fc; }\n        :root.light .ed-cm .CodeMirror-matchingbracket { color:#0b6e99; }\n        :root.light .ed-textarea-fb { color:#1f2430; }\n        :root.light .ed-cm .cm-s-ed-vscode .cm-comment { color:#008000; }\n        :root.light .ed-cm .cm-s-ed-vscode .cm-string { color:#a31515; }\n        :root.light .ed-cm .cm-s-ed-vscode .cm-number { color:#098658; }\n        :root.light .ed-cm .cm-s-ed-vscode .cm-atom,\n        :root.light .ed-cm .cm-s-ed-vscode .cm-keyword,\n        :root.light .ed-cm .cm-s-ed-vscode .cm-tag { color:#0000ff; }\n        :root.light .ed-cm .cm-s-ed-vscode .cm-builtin { color:#267f99; }\n        :root.light .ed-cm .cm-s-ed-vscode .cm-variable,\n        :root.light .ed-cm .cm-s-ed-vscode .cm-variable-2,\n        :root.light .ed-cm .cm-s-ed-vscode .cm-def,\n        :root.light .ed-cm .cm-s-ed-vscode .cm-property,\n        :root.light .ed-cm .cm-s-ed-vscode .cm-attribute { color:#001080; }\n        :root.light .ed-cm .cm-s-ed-vscode .cm-function { color:#795e26; }\n        :root.light .ed-cm .cm-s-ed-vscode .cm-qualifier,\n        :root.light .ed-cm .cm-s-ed-vscode .cm-operator,\n        :root.light .ed-cm .cm-s-ed-vscode .cm-punctuation,\n        :root.light .ed-cm .cm-s-ed-vscode .cm-meta { color:#1f2430; }\n        :root.light .ed-cm .cm-s-ed-vscode .cm-bracket { color:#af00db; }\n        :root.light .ed-cm .cm-s-ed-vscode .cm-error { color:#cd3131; }\n        :root.light .ed-cm .cm-s-ed-vscode .CodeMirror-selectedtext,\n        :root.light .ed-cm .cm-s-ed-vscode ::selection,\n        :root.light .ed-cm .cm-s-ed-vscode ::-moz-selection { background:#b3d4fc; }\n\n    \n";

function _ensureStyles() {
    if (document.getElementById('ethos-editor-styles')) return;
    const tag = document.createElement('style');
    tag.id = 'ethos-editor-styles';
    tag.textContent = _EDITOR_CSS;
    document.head.appendChild(tag);
}

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
const pickFile = (options) => _ctx.pickFile(options);
const pickFolder = (options) => _ctx.pickFolder(options);
function addNotification(message, kind = 'info') {
    try { _ctx.notifications.toast(String(message), kind); } catch (_) { /* window closing */ }
}
const showFormModal = (options) => _ctx.modal.form(options);
const connectWs = (url, onMessage, onStatus) => _ctx.ws.connect(url, onMessage, onStatus);
const resolveDefaultTerminalTarget = () => _ctx.terminal.resolveDefaultTarget();
const fetchLogs = (options) => _ctx.logs.fetch(options);
const focusWindow = (element) => _ctx.windows.focusWindow(element);
const renderTaskbar = () => _ctx.windows.renderTaskbar();
// The core registers close guards per app id; a package window is `pkg-<id>`.
// The module registers its guard while being evaluated, before render() mounts
// the ctx, so queue it and flush on mount.
const _pendingGuards = [];
const registerCloseGuard = (_id, callback) => {
    if (_ctx) { _ctx.windows.registerCloseGuard(_windowId(), callback); return; }
    _pendingGuards.push(callback);
};
const openWindows = {
    entries: () => _ctx.windows.list.entries(),
    get: (key) => _ctx.windows.list.get(key),
};
// ── Constants ──────────────────────────────────────────────────────────────
const BINARY_SNIFF_BYTES = 8192;
const MAX_EDIT_SIZE = 5 * 1024 * 1024;
const TAB_SPACES = '    ';
const WRAP_STORAGE_KEY = 'ethos_editor_wrap';
const SIDEBAR_WIDTH_KEY = 'ethos_editor_sidebar_width';
const SIDEBAR_MIN_W = 180;
const TERM_HEIGHT_KEY = 'ethos_editor_term_height';
const TERM_MIN_H = 120;
const TERM_DEFAULT_H = 240;
const TERM_MAX_SPLITS = 4;
const SETTINGS_KEY = 'ethos_editor_settings';
const DEFAULT_SETTINGS = {
    fontSize: 13,
    tabSize: 4,
    autoCloseBrackets: true,
    autoSave: false,
    wrap: false,
};

function _loadSettings() {
    try {
        const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {};
        const merged = { ...DEFAULT_SETTINGS, ...raw };
        // Migrate the legacy per-session wrap flag when settings never stored it.
        if (!Object.prototype.hasOwnProperty.call(raw, 'wrap')
            && localStorage.getItem(WRAP_STORAGE_KEY) === '1') {
            merged.wrap = true;
        }
        return merged;
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
}

function _persistSettings(patch = {}) {
    Object.assign(_editorSettings, patch);
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(_editorSettings)); } catch {}
}

let _editorSettings = _loadSettings();

/** Decode a file buffer, preserving the dominant line ending. */
function _decodeBuffer(buf) {
    let text;
    let encoding;
    try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
        encoding = 'utf-8';
    } catch {
        text = new TextDecoder('iso-8859-1').decode(buf);
        encoding = 'latin-1';
    }
    const eol = text.includes('\r\n') ? 'crlf' : 'lf';
    // Normalize mixed endings to the dominant style so CodeMirror works with
    // a single separator and saves round-trip exactly what was loaded.
    text = eol === 'crlf'
        ? text.replace(/\r\n|\r|\n/g, '\r\n')
        : text.replace(/\r\n?/g, '\n');
    return { text, encoding, eol };
}

/** Move the bottom panel back under `.ed-shell` before its parent is replaced. */
function _parkPanel(shell) {
    if (!shell) return null;
    const panel = shell.querySelector('[data-testid="ed-panel"]');
    if (panel && panel.parentElement !== shell) shell.appendChild(panel);
    return panel;
}

/** Release editor state held by a project that is being closed/replaced. */
function _teardownProject(content) {
    const proj = content ? content.querySelector('.ed-proj') : null;
    if (!proj) return;
    for (const t of proj.__tabs || []) {
        const st = _states.get(t.el);
        if (st) { _releaseEditorState(st); _states.delete(t.el); }
    }
    proj.__tabs = [];
}


// ── DOM construction helpers (XSS-safe) ──────────────────────────────────────────
// Dynamic values are built with createElement + textContent (no string parsing).
// Static markup is parsed once via createContextualFragment — a standard DOM
// fragment parser used in place of innerHTML assignments.
function _frag(html) {
    return document.createRange().createContextualFragment(html);
}
function _el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text != null) e.textContent = text;
    return e;
}
function _loading(el, msg) { el.replaceChildren(_el('div', 'ed-loading', msg)); }

// ── Language detection ─────────────────────────────────────────────────────
const LANG_BY_EXT = {
    js: { mode: 'javascript', label: 'JavaScript' },
    mjs: { mode: 'javascript', label: 'JavaScript' },
    cjs: { mode: 'javascript', label: 'JavaScript' },
    jsx: { mode: 'text/jsx', label: 'JavaScript (JSX)' },
    ts: { mode: 'text/typescript', label: 'TypeScript' },
    tsx: { mode: 'text/typescript', label: 'TypeScript (TSX)' },
    json: { mode: 'application/json', label: 'JSON' },
    jsonc: { mode: 'application/json', label: 'JSONC' },
    html: { mode: 'text/html', label: 'HTML' },
    htm: { mode: 'text/html', label: 'HTML' },
    htmx: { mode: 'text/html', label: 'HTML' },
    xml: { mode: 'application/xml', label: 'XML' },
    svg: { mode: 'application/xml', label: 'SVG' },
    css: { mode: 'text/css', label: 'CSS' },
    scss: { mode: 'text/x-scss', label: 'SCSS' },
    less: { mode: 'text/x-less', label: 'Less' },
    py: { mode: 'text/x-python', label: 'Python' },
    rb: { mode: 'text/x-ruby', label: 'Ruby' },
    php: { mode: 'text/x-php', label: 'PHP' },
    java: { mode: 'text/x-java', label: 'Java' },
    kt: { mode: 'text/x-kotlin', label: 'Kotlin' },
    kts: { mode: 'text/x-kotlin', label: 'Kotlin' },
    c: { mode: 'text/x-csrc', label: 'C' },
    h: { mode: 'text/x-csrc', label: 'C' },
    cc: { mode: 'text/x-csrc', label: 'C++' },
    cpp: { mode: 'text/x-csrc', label: 'C++' },
    hpp: { mode: 'text/x-csrc', label: 'C++' },
    cs: { mode: 'text/x-csharp', label: 'C#' },
    go: { mode: 'text/x-go', label: 'Go' },
    rs: { mode: 'text/x-rustsrc', label: 'Rust' },
    sh: { mode: 'text/x-sh', label: 'Shell' },
    bash: { mode: 'text/x-sh', label: 'Shell' },
    zsh: { mode: 'text/x-sh', label: 'Shell' },
    fish: { mode: 'text/x-sh', label: 'Shell' },
    sql: { mode: 'text/x-sql', label: 'SQL' },
    md: { mode: 'gfm', label: 'Markdown' },
    markdown: { mode: 'gfm', label: 'Markdown' },
    yaml: { mode: 'yaml', label: 'YAML' },
    yml: { mode: 'yaml', label: 'YAML' },
    toml: { mode: 'text/x-toml', label: 'TOML' },
    // CodeMirror 5 has no ini/graphql/gitignore modes — plain text.
    ini: { mode: null, label: 'INI' },
    conf: { mode: null, label: 'Config' },
    cfg: { mode: null, label: 'Config' },
    env: { mode: null, label: 'Env' },
    dockerfile: { mode: 'text/x-dockerfile', label: 'Dockerfile' },
    lua: { mode: 'text/x-lua', label: 'Lua' },
    pl: { mode: 'text/x-perl', label: 'Perl' },
    pm: { mode: 'text/x-perl', label: 'Perl' },
    r: { mode: 'text/x-rsrc', label: 'R' },
    swift: { mode: 'text/x-swift', label: 'Swift' },
    dart: { mode: 'application/dart', label: 'Dart' },
    graphql: { mode: null, label: 'GraphQL' },
    gql: { mode: null, label: 'GraphQL' },
    vue: { mode: 'text/html', label: 'Vue' },
    svelte: { mode: 'text/html', label: 'Svelte' },
    docker: { mode: 'text/x-dockerfile', label: 'Dockerfile' },
    gitignore: { mode: null, label: 'Git Ignore' },
    log: { mode: null, label: 'Log' },
    txt: { mode: null, label: 'Plain Text' },
};

function _detectMode(path) {
    const base = path.split('/').pop().toLowerCase();
    if (base === 'dockerfile') return LANG_BY_EXT.dockerfile;
    if (base === '.gitignore' || base === '.dockerignore') return LANG_BY_EXT.gitignore;
    const dot = base.lastIndexOf('.');
    if (dot < 0) return null;
    return LANG_BY_EXT[base.slice(dot + 1)] || null;
}

// ── Shared helpers ─────────────────────────────────────────────────────────
function _nameOf(path) { return path.replace(/\/+$/, '').split('/').pop() || path; }

// ── File-type badges (Explorer / tabs / quick open) ────────────────────────
// Compact monogram badges are far more scannable than one generic file icon.
const _FILE_BADGES = {
    py: ['PY', '#3572A5'], pyw: ['PY', '#3572A5'],
    js: ['JS', '#F1E05A', '#1E1E1E'], mjs: ['JS', '#F1E05A', '#1E1E1E'], cjs: ['JS', '#F1E05A', '#1E1E1E'],
    jsx: ['JSX', '#61DAFB', '#1E1E1E'], ts: ['TS', '#3178C6'], tsx: ['TSX', '#3178C6'],
    json: ['{}', '#CBCB41', '#1E1E1E'], jsonc: ['{}', '#CBCB41', '#1E1E1E'],
    md: ['MD', '#519ABA'], markdown: ['MD', '#519ABA'],
    html: ['<>', '#E34C26'], htm: ['<>', '#E34C26'], xml: ['XML', '#8CB4DB'], svg: ['SVG', '#FFB13B', '#1E1E1E'],
    css: ['CSS', '#563D7C'], scss: ['SC', '#C6538C'], less: ['LS', '#1D365D'],
    yml: ['YML', '#CB171E'], yaml: ['YML', '#CB171E'], toml: ['TML', '#9C4221'],
    sh: ['SH', '#89E051', '#1E1E1E'], bash: ['SH', '#89E051', '#1E1E1E'], zsh: ['SH', '#89E051', '#1E1E1E'],
    go: ['GO', '#00ADD8'], rs: ['RS', '#DEA584', '#1E1E1E'], java: ['JV', '#B07219'],
    kt: ['KT', '#A97BFF'], kts: ['KT', '#A97BFF'], c: ['C', '#777777'], h: ['H', '#777777'],
    cc: ['C++', '#F34B7D'], cpp: ['C++', '#F34B7D'], hpp: ['C++', '#F34B7D'], cs: ['C#', '#178600'],
    rb: ['RB', '#CC342D'], php: ['PHP', '#4F5D95'], sql: ['SQL', '#E38C00'], lua: ['LUA', '#4B4B99'],
    r: ['R', '#276DC3'], swift: ['SW', '#F05138'], dart: ['DT', '#00B4AB'],
    vue: ['V', '#41B883'], svelte: ['SV', '#FF3E00'], dockerfile: ['DK', '#2496ED'],
    png: ['IMG', '#A074C4'], jpg: ['IMG', '#A074C4'], jpeg: ['IMG', '#A074C4'], gif: ['IMG', '#A074C4'],
    webp: ['IMG', '#A074C4'], bmp: ['IMG', '#A074C4'], ico: ['IMG', '#A074C4'], avif: ['IMG', '#A074C4'],
    tiff: ['IMG', '#A074C4'], heic: ['IMG', '#A074C4'],
    bin: ['BIN', '#6E7681'], exe: ['EXE', '#4B5563'], dll: ['DLL', '#4B5563'], so: ['SO', '#4B5563'],
    iso: ['ISO', '#8B5CF6'], dmg: ['DMG', '#8B5CF6'], apk: ['APK', '#3DDC84', '#1E1E1E'],
    pem: ['KEY', '#D97706'], key: ['KEY', '#D97706'], crt: ['CRT', '#D97706'],
    csv: ['CSV', '#237346'], tsv: ['CSV', '#237346'],
    zip: ['ZIP', '#AF7E2E'], tar: ['ZIP', '#AF7E2E'], gz: ['GZ', '#AF7E2E'], tgz: ['GZ', '#AF7E2E'],
    bz2: ['BZ2', '#AF7E2E'], xz: ['XZ', '#AF7E2E'], '7z': ['7Z', '#AF7E2E'], rar: ['RAR', '#AF7E2E'],
    pdf: ['PDF', '#EC1C24'], txt: ['TXT', '#6E7681'], log: ['LOG', '#6E7681'],
    env: ['ENV', '#ECD53F', '#1E1E1E'], lock: ['🔒', '#8A8A8A'], ini: ['INI', '#6E7681'],
    cfg: ['CFG', '#6E7681'], conf: ['CFG', '#6E7681'], graphql: ['GQL', '#E10098'], gql: ['GQL', '#E10098'],
};

function _fileBadge(name) {
    const lower = name.toLowerCase();
    if (lower === 'dockerfile') return _FILE_BADGES.dockerfile;
    if (lower === 'makefile' || lower === 'gnumakefile') return ['MK', '#427819'];
    if (lower === 'license' || lower === 'licence') return ['©', '#CBCB41', '#1E1E1E'];
    if (lower === '.gitignore' || lower === '.dockerignore') return ['GIT', '#F54D27'];
    if (lower === 'readme.md' || lower.startsWith('readme')) {
        if (lower.endsWith('.md')) return _FILE_BADGES.md;
    }
    const dot = lower.lastIndexOf('.');
    if (dot < 0) return ['FILE', '#5A5A5A'];
    return _FILE_BADGES[lower.slice(dot + 1)] || ['FILE', '#5A5A5A'];
}

function _fileIconEl(path) {
    const [label, bg, fg] = _fileBadge(_nameOf(path));
    const span = _el('span', 'ed-file-badge', label);
    span.style.background = bg;
    if (fg) span.style.color = fg;
    span.dataset.extLabel = label;
    return span;
}

// ── Toolbar SVG icons ──────────────────────────────────────────────────────
function _tbIcon(kind) {
    const icons = {
        newFile: '<svg viewBox="0 0 16 16"><path d="M9 1.5H4.5A1.5 1.5 0 0 0 3 3v10a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 13 13V5.5L9 1.5Zm-.5 1.7L11.8 5H8.5V3.2ZM7 8v1.5H5.5v1H7V12h1v-1.5h1.5v-1H8V8H7Z"/></svg>',
        newFolder: '<svg viewBox="0 0 16 16"><path d="M1.5 3h4.2l1.3 1.5h7.5v8.2H1.5V3Zm6.3 1.7H2.5v7h11v-6.2H7.8V4.7ZM7 6.5h1v1.6h1.6v1H8v1.6H7V8.9H5.4v-1H7V6.5Z"/></svg>',
        refresh: '<svg viewBox="0 0 16 16"><path d="M8 2.2a5.8 5.8 0 0 1 5.6 4.3h-1.6A4.3 4.3 0 1 0 12 10.5l1.3 1A5.8 5.8 0 1 1 8 2.2Zm4.4.6h1.2v3.2H10.4l2-2.1V2.8Z"/></svg>',
        collapseAll: '<svg viewBox="0 0 16 16"><path d="M8 1.5 4.4 5.1l.9.9L8 3.3l2.7 2.7.9-.9L8 1.5Zm0 13-3.6-3.6.9-.9L8 12.7l2.7-2.7.9.9L8 14.5Z"/></svg>',
        reveal: '<svg viewBox="0 0 16 16"><path d="M8 1.5a6.5 6.5 0 1 0 3.9 11.7l2.3 2.3 1-1-2.3-2.3A6.5 6.5 0 0 0 8 1.5ZM8 3a5 5 0 1 1 0 10A5 5 0 0 1 8 3Zm0 2.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Z"/></svg>',
    };
    return icons[kind] || '';
}

/** Per-container editor state (single-file container or editor pane). */
const _states = new WeakMap();

/**
 * Per-shell cleanup registry. Editor init attaches window-level listeners
 * (menubar mousedown/keydown, shortcuts, terminal toggle, sidebar resize);
 * none of them belong to the shell's DOM, so closing the window must detach
 * them explicitly or they accumulate for the whole session.
 */
const _shellCleanups = new WeakMap(); // shellEl → [fn]

function _shellOnDispose(shell, fn) {
    if (!shell) return;
    const arr = _shellCleanups.get(shell) || [];
    arr.push(fn);
    _shellCleanups.set(shell, arr);
}

function _disposeShellCleanups(shell) {
    const arr = _shellCleanups.get(shell);
    if (!arr) return;
    for (const fn of arr) { try { fn(); } catch {} }
    _shellCleanups.delete(shell);
}

/** Drop editor state references (CodeMirror + resize observer) on tab/window close. */
function _releaseEditorState(st) {
    if (!st) return;
    if (st.__autosaveTimer) { clearTimeout(st.__autosaveTimer); delete st.__autosaveTimer; }
    if (st.__findTimer) { clearTimeout(st.__findTimer); delete st.__findTimer; }
    if (st.__outlineHandler && st.cm) {
        try { st.cm.off('change', st.__outlineHandler); } catch {}
        delete st.__outlineHandler;
    }
    if (st.__findChange && st.cm) {
        try { st.cm.off('change', st.__findChange); } catch {}
        delete st.__findChange;
    }
    if (st.__previewHandler && st.cm) {
        try { st.cm.off('change', st.__previewHandler); } catch {}
        delete st.__previewHandler;
    }
    if (st.resizeObserver) { try { st.resizeObserver.disconnect(); } catch {} delete st.resizeObserver; }
    delete st.cm;
}

// ── Entry point ────────────────────────────────────────────────────────────
/**
 * Focus an existing editor window that already has this exact path open and
 * unmodified; otherwise open a new one in single-file mode.
 */
export function openEditorForPath(path) {
    if (!path) return;
    for (const [, v] of openWindows.entries()) {
        if (v.appId !== _windowId() || !v.element) continue;
        const body = v.element.querySelector('.ed-content');
        if (!body) continue;
        if (body.dataset.editorPath === path) {
            const st = _states.get(body);
            if (st && !st.dirty && !st.binary) { _focusEditorWindow(v.element); return; }
        }
        const proj = body.querySelector('.ed-proj');
        if (proj) {
            const tab = (proj.__tabs || []).find(t => t.path === path);
            if (tab && !tab.dirty) {
                _focusEditorWindow(v.element);
                _activateTab(proj, tab);
                return;
            }
        }
    }
    window.__fmEditorCtx = { path };
    window.openApp('editor');
}

function _focusEditorWindow(el) {
    if (el.classList.contains('minimized')) restoreWindowWin(el);
    else focusWindow(el);
}

// ── Render entry ───────────────────────────────────────────────────────────
export function renderEditor(winBody) {
    winBody.replaceChildren(_frag(`
        <div class="ed-shell">
            <div class="ed-menubar" data-testid="ed-menubar">
                <button class="ed-menu-btn" data-menu="file">File</button>
                <button class="ed-menu-btn" data-menu="edit">Edit</button>
                <button class="ed-menu-btn" data-menu="view">View</button>
                <button class="ed-menu-btn" data-menu="terminal">Terminal</button>
                <button class="ed-menu-btn" data-menu="help">Help</button>
            </div>
            <div class="ed-content" data-testid="ed-content"></div>
            <div class="ed-panel" data-testid="ed-panel">
                <div class="ed-panel-resize" data-testid="ed-panel-resize"></div>
                <div class="ed-panel-tabs" data-testid="ed-panel-tabs">
                    <button class="ed-panel-tab active" data-view="terminal" data-testid="ed-panel-view-terminal">TERMINAL<span class="ed-panel-tab-dot" data-kind="disconnected"></span></button>
                    <button class="ed-panel-tab" data-view="problems" data-testid="ed-panel-view-problems">PROBLEMS</button>
                    <button class="ed-panel-tab" data-view="output" data-testid="ed-panel-view-output">OUTPUT</button>
                    <span class="ed-panel-status" data-testid="ed-panel-status"></span>
                    <span class="ed-panel-cwd" data-testid="ed-panel-cwd"></span>
                    <button class="ed-tb-btn" data-testid="ed-term-new" title="New terminal pane (split)">＋</button>
                    <button class="ed-tb-btn" data-testid="ed-term-restart" title="Restart all terminals">⟳</button>
                    <button class="ed-tb-btn" data-testid="ed-term-target" title="Shell target">host</button>
                    <button class="ed-tb-btn" data-testid="ed-panel-toggle" title="Hide panel (Ctrl+\`)">✕</button>
                </div>
                <div class="ed-panel-body" data-testid="ed-panel-body">
                    <div class="ed-panel-view" data-view="terminal" data-testid="ed-term-body" style="display:block">
                        <div class="ed-term-splits" data-testid="ed-term-splits"></div>
                    </div>
                    <div class="ed-panel-view" data-view="problems" data-testid="ed-problems-body" hidden></div>
                    <div class="ed-panel-view" data-view="output" data-testid="ed-out-body" hidden></div>
                </div>
            </div>
        </div>`));

    _initTermPanel(winBody);
    const shell = winBody.querySelector('.ed-shell');
    _initMenubar(shell);
    _initEditorShortcuts(shell);

    const ctx = window.__fmEditorCtx || null;
    window.__fmEditorCtx = null;
    const pctx = window.__fmProjectCtx || null;
    window.__fmProjectCtx = null;
    const content = winBody.querySelector('.ed-content');
    if (ctx?.path) _loadFile(content, ctx.path);
    else if (pctx?.path) _openProject(content, pctx.path);
    else _renderWelcome(content);
}

// ── Welcome screen ─────────────────────────────────────────────────────────
/** "New Project" dialog — shared by the welcome screen and the File menu. */
async function _newProjectModal(content) {
    // showFormModal renders synchronously — wire the Browse button before awaiting.
    const pending = showFormModal({
        title: 'New Project',
        confirmLabel: 'Create & Open',
        bodyHtml: `
            <div class="ed-np-form">
                <label>Project name</label>
                <input class="ethos-modal-input" name="name" placeholder="my-project" spellcheck="false" autocomplete="off">
                <label>Parent folder</label>
                <div class="ed-np-parent-row">
                    <input class="ethos-modal-input" name="parent" value="/home" spellcheck="false" autocomplete="off">
                    <button type="button" class="ethos-modal-btn ethos-modal-btn-ghost" data-testid="ed-np-browse">Browse…</button>
                </div>
                <label class="ed-np-check"><input type="checkbox" name="git_init" checked> Initialize git repository</label>
            </div>`,
    });
    const browseBtn = document.querySelector('[data-testid="ed-np-browse"]');
    if (browseBtn) {
        browseBtn.onclick = async () => {
            const p = await pickFolder({ title: 'Select parent folder' });
            if (p) { const inp = document.querySelector('.ethos-modal-input[name="parent"]'); if (inp) inp.value = p; };
        };
    }
    const values = await pending;
    if (!values) return;
    const name = (values.name || '').trim();
    const parent = (values.parent || '/home').trim() || '/';
    if (!name) { addNotification('Project name is required', 'warning'); return; }
    if (name.includes('/') || name === '.' || name === '..') { addNotification('Invalid project name', 'error'); return; }
    const path = `${parent.replace(/\/+$/, '')}/${name}`;
    try {
        const resp = await apiFetch('/api/editor/projects/new', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, git_init: !!values.git_init }),
        });
        if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).detail || `HTTP ${resp.status}`);
        const r = await resp.json();
        addNotification(`Project created at ${r.path}`, 'success');
        _openProject(content, r.path);
    } catch (e) { addNotification(e.message, 'error'); }
}

/** "Clone Repository" dialog — shared by the welcome screen and the File menu. */
async function _cloneRepoModal(content) {
    const pending = showFormModal({
        title: 'Clone Repository',
        confirmLabel: 'Clone',
        bodyHtml: `
            <div class="ed-np-form">
                <label>Repository URL</label>
                <input class="ethos-modal-input" name="url" placeholder="https://github.com/user/repo.git or /path/to/repo.git" spellcheck="false" autocomplete="off">
                <label>Clone into folder</label>
                <div class="ed-np-parent-row">
                    <input class="ethos-modal-input" name="parent" value="/home" spellcheck="false" autocomplete="off">
                    <button type="button" class="ethos-modal-btn ethos-modal-btn-ghost" data-testid="ed-clone-browse">Browse…</button>
                </div>
                <label>Branch (optional)</label>
                <input class="ethos-modal-input" name="branch" placeholder="main" spellcheck="false" autocomplete="off">
            </div>`,
    });
    const browseBtn = document.querySelector('[data-testid="ed-clone-browse"]');
    if (browseBtn) {
        browseBtn.onclick = async () => {
            const p = await pickFolder({ title: 'Select parent folder' });
            if (p) { const inp = document.querySelector('.ethos-modal-input[name="parent"]'); if (inp) inp.value = p; };
        };
    }
    const values = await pending;
    if (!values) return;
    const url = (values.url || '').trim();
    const parent = (values.parent || '/home').trim() || '/';
    const branch = (values.branch || '').trim();
    if (!url) { addNotification('Repository URL is required', 'warning'); return; }
    const name = url.replace(/\.git$/i, '').split('/').pop().replace(/[?#:].*$/, '') || 'clone';
    const path = `${parent.replace(/\/+$/, '')}/${name}`;
    addNotification(`Cloning ${url} → ${path}…`, 'info');
    try {
        const resp = await apiFetch('/api/editor/git/clone', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, path, branch }),
        });
        const r = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(r.detail || `HTTP ${resp.status}`);
        if (!r.ok) throw new Error(r.detail || 'clone failed');
        addNotification(`Cloned ${r.path}`, 'success');
        _openProject(content, r.path);
    } catch (e) { addNotification(e.message, 'error'); }
}

async function _renderWelcome(content) {
    _parkPanel(content.closest('.ed-shell'));
    _teardownProject(content);
    content.replaceChildren(_frag(`
        <div class="ed-root ed-welcome" data-testid="editor-welcome">
            <div class="ed-prompt-icon">⌨</div>
            <div class="ed-prompt-title">Code Editor</div>
            <div class="ed-welcome-actions">
                <button class="btn-primary" data-testid="ed-open-file">Open File…</button>
                <button class="btn-ghost" data-testid="ed-open-folder">Open Folder…</button>
                <button class="btn-ghost" data-testid="ed-new-project">✦ New Project…</button>
                <button class="btn-ghost" data-testid="ed-clone">⧉ Clone Repository…</button>
            </div>
            <div class="ed-welcome-divider">or pick a recent project</div>
            <div class="ed-recents" data-testid="ed-recents">
                <div class="ed-recents-title">RECENT</div>
                <div class="ed-recent-list" data-testid="ed-recent-list"><div class="ed-recent-empty">Loading…</div></div>
            </div>
        </div>`));

    content.querySelector('[data-testid="ed-open-file"]').onclick = async () => {
        const p = await pickFile();
        if (p) _loadFile(content, p);
    };
    content.querySelector('[data-testid="ed-open-folder"]').onclick = async () => {
        const p = await pickFolder();
        if (p) _openProject(content, p);
    };

    content.querySelector('[data-testid="ed-new-project"]').onclick = () => _newProjectModal(content);

    content.querySelector('[data-testid="ed-clone"]').onclick = () => _cloneRepoModal(content);
    _updateWindowTitle(content);

    try {
        const resp = await apiFetch('/api/editor/projects/recent');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const recents = (await resp.json()).recents || [];
        const list = content.querySelector('[data-testid="ed-recent-list"]');
        if (!recents.length) {
            list.replaceChildren(_el('div', 'ed-recent-empty', 'No recent projects yet.'));
            return;
        }
        list.replaceChildren();
        for (const p of recents.slice(0, 8)) {
            const row = _el('div', 'ed-recent-row');
            row.dataset.path = p.path;
            const name = p.path.replace(/\/+$/, '').split('/').pop() || p.path;
            row.appendChild(_el('span', 'ed-recent-name', name));
            const pathEl = _el('span', 'ed-recent-path', p.path);
            pathEl.title = p.path;
            row.appendChild(pathEl);
            const x = _el('button', 'ed-recent-x', '×');
            x.title = 'Forget';
            row.appendChild(x);
            row.onclick = () => _openProject(content, p.path);
            x.onclick = async (e) => {
                e.stopPropagation();
                try {
                    await apiFetch(`/api/editor/projects/recent?path=${encodeURIComponent(p.path)}`, { method: 'DELETE' });
                } catch {}
                _renderWelcome(content);
            };
            list.appendChild(row);
        }
    } catch (e) {
        content.querySelector('[data-testid="ed-recent-list"]').replaceChildren(
            _el('div', 'ed-recent-empty', `Could not load recents (${e.message}).`));
    }
}

// ── Single-file mode ───────────────────────────────────────────────────────
async function _loadFile(content, path) {
    const st = { path, encoding: 'utf-8', eol: 'lf', mtime: null, original: null,
        dirty: false, saving: false, binary: false, sizeBytes: 0, wrap: _editorSettings.wrap };
    _states.set(content, st);
    content.dataset.editorPath = path;
    _loading(content, `Loading ${_nameOf(path)}…`);

    try {
        const statResp = await apiFetch(`/api/files/stat?path=${encodeURIComponent(path)}`);
        if (!statResp.ok) {
            let d; try { d = await statResp.json(); } catch {}
            throw new Error(d?.detail || `HTTP ${statResp.status}`);
        }
        const info = await statResp.json();
        st.sizeBytes = info.size || 0;
        st.mtime = typeof info.modified === 'number' ? info.modified : null;
        if (st.sizeBytes > MAX_EDIT_SIZE) {
            _renderSingleError(content, '🐘', 'File Too Large',
                `${_nameOf(path)} is ${formatBytes(st.sizeBytes)} — larger than the ${formatBytes(MAX_EDIT_SIZE)} editing limit.`);
            return;
        }

        const resp = await apiFetch(`/api/files/raw?path=${encodeURIComponent(path)}`);
        if (!resp.ok) {
            let d; try { d = await resp.json(); } catch {}
            throw new Error(d?.detail || `HTTP ${resp.status}`);
        }
        const buf = await resp.arrayBuffer();

        let isBinary = false;
        for (const b of new Uint8Array(buf.slice(0, BINARY_SNIFF_BYTES))) {
            if (b === 0) { isBinary = true; break; }
        }
        if (isBinary) {
            st.binary = true;
            _renderSingleError(content, '🚫', 'Binary File',
                `${_nameOf(path)} appears to be a binary file (${formatBytes(st.sizeBytes)}). The Code Editor can only edit plain-text files.`);
            return;
        }

        const decoded = _decodeBuffer(buf);
        st.original = decoded.text;
        st.encoding = decoded.encoding;
        st.eol = decoded.eol;

        _renderSingle(content, st);
        _updateWindowTitle(content);
        _termSyncCwd(content);
    } catch (e) {
        _renderSingleError(content, '⚠️', 'Could Not Load File', e.message);
    }
}

function _renderSingle(content, st) {
    const name = _nameOf(st.path);
    const lang = _detectMode(st.path);
    const isMd = _isMarkdown(st.path);
    const parts = st.path.replace(/\/+$/, '').split('/').filter(Boolean);
    const crumbs = parts.slice(0, -1).map(p =>
        `<span class="ed-crumb">${escapeHtml(p)}</span><span class="ed-crumb-sep">›</span>`).join('');

    content.replaceChildren(_frag(`
        <div class="ed-root ed-single" data-testid="editor-root">
            <div class="ed-breadcrumbs" data-testid="ed-breadcrumbs">
                ${crumbs}<span class="ed-crumb current">${escapeHtml(name)}</span>
                <span class="ed-crumb-actions">
                    ${isMd ? '<button class="ed-tb-btn" data-testid="ed-preview">Preview</button>' : ''}
                    <button class="ed-tb-btn" data-testid="ed-wrap">Wrap: ${st.wrap ? 'On' : 'Off'}</button>
                    <button class="ed-tb-btn" data-testid="ed-save" title="Save (Ctrl+S)">Save</button>
                </span>
            </div>
            <div class="ed-main"></div>
            <div class="ed-statusbar" data-testid="ed-statusbar">
                <span class="ed-sb-left">
                    <span class="ed-sb-item" data-testid="ed-sb-problems">⊘ 0  ⚠ 0</span>
                </span>
                <span class="ed-sb-right">
                    <span class="ed-sb-item" data-testid="ed-pos">Ln 1, Col 1</span>
                    <span class="ed-sb-item" data-testid="ed-sel" hidden></span>
                    <span class="ed-sb-item" data-testid="ed-spaces">Spaces: ${_editorSettings.tabSize}</span>
                    <span class="ed-sb-item" data-testid="ed-enc">${st.encoding === 'utf-8' ? 'UTF-8' : 'Latin-1'}</span>
                    <span class="ed-sb-item" data-testid="ed-eol">${st.eol === 'crlf' ? 'CRLF' : 'LF'}</span>
                    <span class="ed-sb-item" data-testid="ed-lang">${lang ? escapeHtml(lang.label) : 'Plain Text'}</span>
                </span>
            </div>
        </div>`));

    const main = content.querySelector('.ed-main');
    _mountEditor(main, st, {
        onDirty: (dirty) => {
            if (dirty) content.dataset.editorDirty = '1';
            else delete content.dataset.editorDirty;
            _updateWindowTitle(content);
        },
        onCursor: () => _updateSingleStatusBar(content),
        onSave: () => _save(content),
        onWrap: () => {
            _toggleWrap(main, st);
            const b = content.querySelector('[data-testid="ed-wrap"]');
            if (b) b.textContent = `Wrap: ${st.wrap ? 'On' : 'Off'}`;
        },
    });
    content.querySelector('[data-testid="ed-wrap"]').onclick = () => {
        _toggleWrap(main, st);
        content.querySelector('[data-testid="ed-wrap"]').textContent = `Wrap: ${st.wrap ? 'On' : 'Off'}`;
    };
    content.querySelector('[data-testid="ed-save"]').onclick = () => _save(content);
    const previewBtn = content.querySelector('[data-testid="ed-preview"]');
    if (previewBtn) previewBtn.onclick = () => _togglePreview(main, st, previewBtn);
    const langEl = content.querySelector('[data-testid="ed-lang"]');
    if (langEl) {
        langEl.classList.add('clickable');
        langEl.title = 'Change language mode';
        langEl.onclick = () => _showLanguageMenu(st, langEl, () => _updateSingleStatusBar(content));
    }
    _updateSingleStatusBar(content);
}

function _isMarkdown(path) {
    const base = path.split('/').pop().toLowerCase();
    return base.endsWith('.md') || base.endsWith('.markdown');
}

function _renderSingleError(content, icon, title, msg) {
    const root = _el('div', 'ed-root');
    root.dataset.testid = 'editor-error';
    root.appendChild(_el('div', 'ed-bin-icon', icon));
    root.appendChild(_el('div', 'ed-bin-title', title));
    root.appendChild(_el('div', 'ed-bin-msg', msg));
    content.replaceChildren(root);
}

function _updateSingleStatusBar(content) {
    const st = _states.get(content);
    if (!st) return;
    const posEl = content.querySelector('[data-testid="ed-pos"]');
    const selEl = content.querySelector('[data-testid="ed-sel"]');
    if (!posEl) return;
    if (st.cm) {
        const cur = st.cm.getCursor();
        const sel = st.cm.getSelection();
        posEl.textContent = `Ln ${cur.line + 1}, Col ${cur.ch + 1}`;
        if (sel) {
            selEl.hidden = false;
            selEl.textContent = `Sel ${sel.length}`;
        } else selEl.hidden = true;
    }
    const langEl = content.querySelector('[data-testid="ed-lang"]');
    if (langEl) {
        const l = st.langOverride || _detectMode(st.path);
        langEl.textContent = l ? l.label : 'Plain Text';
    }
}

// ── Project workbench ──────────────────────────────────────────────────────
async function _openProject(content, root) {
    const shell = content.closest('.ed-shell');
    // Keep the bottom panel alive across project switches: it lives under the
    // project DOM while a project is open, so re-parent it first.
    _parkPanel(shell);
    _teardownProject(content);
    _loading(content, `Opening ${root}…`);

    // A recent entry can point at a folder that no longer exists — say so
    // instead of rendering a half-broken workbench.
    try {
        const statResp = await apiFetch(`/api/files/stat?path=${encodeURIComponent(root)}`);
        if (!statResp.ok) {
            addNotification(`Folder not found: ${root}`, 'error');
            try {
                await apiFetch(`/api/editor/projects/recent?path=${encodeURIComponent(root)}`, { method: 'DELETE' });
            } catch {}
            _renderWelcome(content);
            return;
        }
        const info = await statResp.json();
        if (!info.is_dir) {
            addNotification(`Not a folder: ${root}`, 'error');
            _renderWelcome(content);
            return;
        }
    } catch {
        _renderWelcome(content);
        return;
    }

    try {
        await apiFetch('/api/editor/projects/recent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: root }),
        });
    } catch {}

    const name = root.replace(/\/+$/, '').split('/').pop() || '/';
    content.replaceChildren(_frag(`
        <div class="ed-root ed-proj" data-testid="ed-project" data-root="${escapeAttr(root)}">
            <div class="ed-workbench">
                <div class="ed-activitybar" data-testid="ed-activitybar">
                    <button class="ed-ab-item active" data-view="explorer" data-testid="ed-ab-explorer" title="Explorer">${_abIcon('explorer')}</button>
                    <button class="ed-ab-item" data-view="search" data-testid="ed-ab-search" title="Search">${_abIcon('search')}</button>
                    <button class="ed-ab-item" data-view="outline" data-testid="ed-ab-outline" title="Outline">${_abIcon('outline')}</button>
                    <button class="ed-ab-item" data-view="scm" data-testid="ed-ab-scm" title="Source Control">${_abIcon('scm')}<span class="ed-ab-badge" data-testid="ed-scm-badge" hidden>0</span></button>
                </div>
                <div class="ed-sidebar" data-testid="ed-sidebar">
                    <div class="ed-side-view" data-view="explorer" data-testid="ed-side-explorer">
                        <div class="ed-side-header">
                            <span>EXPLORER</span>
                            <span class="ed-explorer-actions">
                                <button class="ed-tb-btn ed-icon-btn" data-testid="ed-new-file" title="New File">${_tbIcon('newFile')}</button>
                                <button class="ed-tb-btn ed-icon-btn" data-testid="ed-new-folder" title="New Folder">${_tbIcon('newFolder')}</button>
                                <button class="ed-tb-btn ed-icon-btn" data-testid="ed-tree-refresh" title="Refresh">${_tbIcon('refresh')}</button>
                                <button class="ed-tb-btn ed-icon-btn" data-testid="ed-collapse-all" title="Collapse All Folders">${_tbIcon('collapseAll')}</button>
                                <button class="ed-tb-btn ed-icon-btn" data-testid="ed-reveal-active" title="Reveal Active File">${_tbIcon('reveal')}</button>
                            </span>
                        </div>
                        <div class="ed-explorer-section" data-testid="ed-explorer-section">
                            <span class="ed-tree-caret">▾</span>
                            <span class="ed-tree-icon dir">${_treeIconSvg(true, true)}</span>
                            <span class="ed-explorer-name" data-testid="ed-explorer-name">${escapeHtml(name)}</span>
                        </div>
                        <div class="ed-tree" data-testid="ed-tree" data-dir="${escapeAttr(root)}"></div>
                    </div>
                    <div class="ed-side-view" data-view="search" data-testid="ed-side-search" hidden>
                        <div class="ed-side-header"><span>SEARCH</span></div>
                        <div class="ed-search-wrap">
                            <input class="ed-search-input" data-testid="ed-search-input" type="text"
                                placeholder="Search in project" spellcheck="false" autocomplete="off">
                            <div class="ed-search-opts">
                                <button class="ed-tb-btn ed-search-mode active" data-mode="content" data-testid="ed-search-mode-content" title="Search file contents">Content</button>
                                <button class="ed-tb-btn ed-search-mode" data-mode="name" data-testid="ed-search-mode-name" title="Search file names">Names</button>
                                <label class="ed-search-opt" title="Case sensitive"><input type="checkbox" data-testid="ed-search-case"> Aa</label>
                                <label class="ed-search-opt" title="Use regular expression"><input type="checkbox" data-testid="ed-search-regex"> .*</label>
                            </div>
                        </div>
                        <div class="ed-search-results" data-testid="ed-search-results">
                            <div class="ed-out-empty">Type to search the project.</div>
                        </div>
                    </div>
                    <div class="ed-side-view" data-view="outline" data-testid="ed-side-outline" hidden>
                        <div class="ed-side-header"><span>OUTLINE</span></div>
                        <div class="ed-outline" data-testid="ed-outline">
                            <div class="ed-outline-empty">Open a file to see its symbols.</div>
                        </div>
                    </div>
                    <div class="ed-side-view" data-view="scm" data-testid="ed-side-scm" hidden>
                        <div class="ed-side-header">
                            <span>SOURCE CONTROL</span>
                            <span class="ed-explorer-actions">
                                <button class="ed-tb-btn" data-testid="ed-stage-all" title="Stage all changes">⊞</button>
                                <button class="ed-tb-btn" data-testid="ed-pull" title="Pull">↓</button>
                                <button class="ed-tb-btn" data-testid="ed-push" title="Push">↑</button>
                                <button class="ed-tb-btn" data-testid="ed-fetch" title="Fetch all remotes">⤓</button>
                                <button class="ed-tb-btn" data-testid="ed-scm-refresh" title="Refresh">⟳</button>
                                <button class="ed-tb-btn" data-testid="ed-scm-more" title="More">⋯</button>
                            </span>
                        </div>
                        <div class="ed-scm-commit">
                            <textarea class="ed-scm-msg" data-testid="ed-commit-msg" rows="2"
                                placeholder="Message (Ctrl+Enter to commit)" spellcheck="false"></textarea>
                            <button class="ed-scm-commit-btn" data-testid="ed-commit" disabled>✓ Commit</button>
                        </div>
                        <div class="ed-scm-body">
                            <div class="ed-scm-merge-warn" data-testid="ed-scm-merge-warn" hidden></div>
                            <div class="ed-scm-section">STAGED <span class="ed-scm-count" data-testid="ed-scm-staged-count"></span></div>
                            <div class="ed-scm-files" data-testid="ed-scm-staged"></div>
                            <div class="ed-scm-section">CHANGES <span class="ed-scm-count" data-testid="ed-scm-changes-count"></span></div>
                            <div class="ed-scm-files" data-testid="ed-scm-changes"></div>
                            <div class="ed-scm-section ed-scm-sec" data-sec="branches" data-testid="ed-scm-branches-head">
                                <span class="ed-scm-caret">▸</span>BRANCHES <span class="ed-scm-count" data-testid="ed-scm-branches-count"></span>
                                <span class="ed-scm-sec-actions"><button class="ed-tb-btn" data-testid="ed-branch-new" title="Create new branch">＋</button></span>
                            </div>
                            <div class="ed-scm-files ed-scm-sec-body" data-testid="ed-scm-branches" hidden></div>
                            <div class="ed-scm-section ed-scm-sec" data-sec="remotes" data-testid="ed-scm-remotes-head">
                                <span class="ed-scm-caret">▸</span>REMOTES <span class="ed-scm-count" data-testid="ed-scm-remotes-count"></span>
                                <span class="ed-scm-sec-actions"><button class="ed-tb-btn" data-testid="ed-remote-add" title="Add remote">＋</button></span>
                            </div>
                            <div class="ed-scm-files ed-scm-sec-body" data-testid="ed-scm-remotes" hidden></div>
                            <div class="ed-scm-section ed-scm-sec" data-sec="stash" data-testid="ed-scm-stash-head">
                                <span class="ed-scm-caret">▸</span>STASH <span class="ed-scm-count" data-testid="ed-scm-stash-count"></span>
                                <span class="ed-scm-sec-actions"><button class="ed-tb-btn" data-testid="ed-stash-save" title="Stash current changes">Save</button></span>
                            </div>
                            <div class="ed-scm-files ed-scm-sec-body" data-testid="ed-scm-stash" hidden></div>
                            <div class="ed-scm-section">HISTORY</div>
                            <div class="ed-scm-history" data-testid="ed-scm-history"></div>
                        </div>
                    </div>
                </div>
                <div class="ed-side-resize" data-testid="ed-side-resize" title="Drag to resize the sidebar"></div>
                <div class="ed-maincol" data-testid="ed-maincol">
                    <div class="ed-tabs" data-testid="ed-tabs"></div>
                    <div class="ed-breadcrumbs" data-testid="ed-breadcrumbs" hidden></div>
                    <div class="ed-editors" data-testid="ed-editors">
                        <div class="ed-editors-empty" data-testid="ed-editors-empty">
                            <div class="ed-editors-empty-icon">⌨</div>
                            <div>No file active</div>
                            <div class="ed-editors-empty-hint">Pick a file from the Explorer to start editing.</div>
                            <div class="ed-editors-empty-keys">
                                <span><kbd>Ctrl+P</kbd> Quick Open</span>
                                <span><kbd>Ctrl+F</kbd> Find</span>
                                <span><kbd>Ctrl+\`</kbd> Terminal</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="ed-statusbar" data-testid="ed-statusbar">
                <span class="ed-sb-left">
                    <span class="ed-sb-item ed-sb-branch" data-testid="ed-sb-branch" hidden></span>
                    <span class="ed-sb-item" data-testid="ed-sb-problems">⊘ 0  ⚠ 0</span>
                </span>
                <span class="ed-sb-right">
                    <span class="ed-sb-item" data-testid="ed-pos">Ln 1, Col 1</span>
                    <span class="ed-sb-item" data-testid="ed-sel" hidden></span>
                    <span class="ed-sb-item" data-testid="ed-spaces">Spaces: 4</span>
                    <span class="ed-sb-item" data-testid="ed-enc">UTF-8</span>
                    <span class="ed-sb-item" data-testid="ed-eol">LF</span>
                    <span class="ed-sb-item" data-testid="ed-lang">Plain Text</span>
                </span>
            </div>
        </div>`));

    const proj = content.querySelector('.ed-proj');
    proj.__tabs = [];
    proj.__active = null;
    proj.__git = null;
    proj.__sideView = 'explorer';

    // Move the shell-level terminal panel into the editor column (VS Code layout).
    const panel = shell ? shell.querySelector('[data-testid="ed-panel"]') : null;
    if (panel) proj.querySelector('[data-testid="ed-maincol"]').appendChild(panel);

    const treeEl = proj.querySelector('[data-testid="ed-tree"]');
    treeEl.dataset.dir = root;
    _renderTree(treeEl, root);
    proj.querySelector('[data-testid="ed-new-file"]').onclick = () => _treeNewItem(proj, root, 'file');
    proj.querySelector('[data-testid="ed-new-folder"]').onclick = () => _treeNewItem(proj, root, 'folder');
    proj.querySelector('[data-testid="ed-tree-refresh"]').onclick = () => {
        const dir = treeEl.dataset.dir;
        if (dir) _renderTree(treeEl, dir);
    };
    proj.querySelector('[data-testid="ed-collapse-all"]').onclick = () => {
        const dir = treeEl.dataset.dir;
        if (dir) _renderTree(treeEl, dir);
    };
    proj.querySelector('[data-testid="ed-reveal-active"]').onclick = () => {
        const active = proj.__active;
        if (active) _revealInTree(proj, active.path);
    };
    const rootSection = proj.querySelector('[data-testid="ed-explorer-section"]');
    if (rootSection) {
        rootSection.onclick = () => {
            const collapsed = treeEl.hidden;
            treeEl.hidden = !collapsed;
            rootSection.querySelector('.ed-tree-caret').textContent = collapsed ? '▾' : '▸';
        };
    }

    _initSearchView(proj);
    _initOutlineView(proj);
    _initSideResize(proj);
    for (const btn of proj.querySelectorAll('.ed-ab-item')) {
        btn.onclick = () => _setSideView(proj, btn.dataset.view);
    }
    _initScmView(proj);

    const problemsEl = proj.querySelector('[data-testid="ed-sb-problems"]');
    if (problemsEl) {
        problemsEl.classList.add('clickable');
        problemsEl.title = 'Show Problems panel';
        problemsEl.onclick = () => {
            const ts = _termStates.get(shell);
            if (ts) _termSetView(ts, 'problems');
        };
    }

    await _refreshGit(proj);
    _termSyncCwd(content);
    _updateWindowTitle(proj);
}

function _abIcon(kind) {
    const icons = {
        explorer: '<svg viewBox="0 0 24 24"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9h-9v8H6V5h8V3Zm1 1.4 5 5V3h-5v1.4Z"/></svg>',
        search: '<svg viewBox="0 0 24 24"><path d="M10.5 2a8.5 8.5 0 1 0 5.2 15.2l5 5 1.4-1.4-5-5A8.5 8.5 0 0 0 10.5 2Zm0 2a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13Z"/></svg>',
        outline: '<svg viewBox="0 0 24 24"><path d="M4 4h3v2H4V4Zm5 0h11v2H9V4ZM4 11h3v2H4v-2Zm5 0h11v2H9v-2ZM4 18h3v2H4v-2Zm5 0h11v2H9v-2Z"/></svg>',
        scm: '<svg viewBox="0 0 24 24"><circle cx="6" cy="6" r="2.6"/><circle cx="6" cy="18" r="2.6"/><circle cx="18" cy="8" r="2.6"/><path d="M6 8.6v6.8M15.6 9.4c-.4 3.4-7 3.2-8.9 5.6" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
        debug: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5-11-6.5Z"/></svg>',
        extensions: '<svg viewBox="0 0 24 24"><path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 3.5h7V24h-7v-7.5Z"/></svg>',
    };
    return icons[kind] || '';
}

function _setSideView(proj, view) {
    const bar = proj.querySelector('.ed-activitybar');
    const sidebar = proj.querySelector('[data-testid="ed-sidebar"]');
    if (proj.__sideView === view) { sidebar.classList.toggle('collapsed'); return; }
    proj.__sideView = view;
    sidebar.classList.remove('collapsed');
    for (const b of bar.querySelectorAll('.ed-ab-item')) b.classList.toggle('active', b.dataset.view === view);
    for (const v of sidebar.querySelectorAll('.ed-side-view')) v.hidden = (v.dataset.view !== view);
    if (view === 'scm') _refreshGit(proj);
    if (view === 'outline') _refreshOutline(proj);
    if (view === 'search') {
        const i = sidebar.querySelector('[data-testid="ed-search-input"]');
        if (i) setTimeout(() => i.focus(), 30);
    }
}

/** Drag-to-resize grip between the sidebar and the editor column. */
function _initSideResize(proj) {
    const sidebar = proj.querySelector('[data-testid="ed-sidebar"]');
    const grip = proj.querySelector('[data-testid="ed-side-resize"]');
    const workbench = proj.querySelector('.ed-workbench');
    if (!sidebar || !grip || !workbench) return;

    const maxW = () => Math.max(SIDEBAR_MIN_W + 40, Math.floor(workbench.getBoundingClientRect().width * 0.5));
    const applyWidth = (w) => { sidebar.style.width = `${Math.round(w)}px`; };
    const refreshEditors = () => {
        for (const t of proj.__tabs || []) { try { t.st?.cm?.refresh(); } catch {} }
    };

    try {
        const v = parseInt(localStorage.getItem(SIDEBAR_WIDTH_KEY) || '', 10);
        if (v >= SIDEBAR_MIN_W) applyWidth(Math.min(v, maxW()));
    } catch {}

    // Keep the sidebar within bounds when the window itself is resized.
    const onWinResize = () => {
        if (sidebar.classList.contains('collapsed')) return;
        const w = sidebar.getBoundingClientRect().width;
        if (w > maxW()) applyWidth(maxW());
    };
    window.addEventListener('resize', onWinResize);
    _shellOnDispose(proj.closest('.ed-shell'), () => window.removeEventListener('resize', onWinResize));

    grip.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const startW = sidebar.getBoundingClientRect().width;
        document.body.classList.add('ed-side-dragging');
        grip.classList.add('active');
        const onMove = (ev) => {
            applyWidth(Math.max(SIDEBAR_MIN_W, Math.min(maxW(), startW + (ev.clientX - e.clientX))));
            requestAnimationFrame(refreshEditors);
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.classList.remove('ed-side-dragging');
            grip.classList.remove('active');
            refreshEditors();
            try { localStorage.setItem(SIDEBAR_WIDTH_KEY, String(Math.round(sidebar.getBoundingClientRect().width))); } catch {}
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
}

// ── File tree (Explorer) ───────────────────────────────────────────────────
const _treeDirs = new WeakMap();

async function _renderTreeInto(treeEl, dir) {
    treeEl.dataset.dir = dir;
    treeEl.replaceChildren(_el('div', 'ed-tree-empty', 'Loading…'));
    let entries;
    try {
        const resp = await apiFetch(`/api/files?path=${encodeURIComponent(dir)}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        entries = (await resp.json()).files || [];
    } catch (e) {
        treeEl.replaceChildren(_el('div', 'ed-tree-error', `Could not load: ${e.message}`));
        return;
    }
    entries = entries.filter(e => !e.name.startsWith('.git'));
    entries.sort((a, b) => (b.is_dir - a.is_dir) || a.name.localeCompare(b.name, undefined, { numeric: true }));

    treeEl.replaceChildren();
    // Arbitrary nesting: indent by the number of ancestor `.ed-tree-kids`
    // containers (the CSS cascade only covers three levels).
    let depth = 0;
    for (let p = treeEl; p; p = p.parentElement) {
        if (p.classList && p.classList.contains('ed-tree-kids')) depth++;
    }
    const indent = `${14 + depth * 16}px`;
    if (!entries.length) {
        treeEl.replaceChildren(_el('div', 'ed-tree-empty', 'Empty folder'));
        _treeDirs.set(treeEl, []);
        return;
    }
    const dirs = [];
    for (const e of entries) {
        const row = _el('div', 'ed-tree-row');
        row.dataset.path = e.path;
        row.dataset.name = e.name;
        row.style.paddingLeft = indent;
        if (e.is_dir) {
            row.dataset.isDir = '1';
            row.appendChild(_el('span', 'ed-tree-caret', '▸'));
            const icon = _el('span', 'ed-tree-icon dir');
            icon.replaceChildren(_frag(_treeIconSvg(true, false)));
            row.appendChild(icon);
            row.appendChild(_el('span', 'ed-tree-name', e.name));
            const kids = document.createElement('div');
            kids.className = 'ed-tree-kids';
            kids.hidden = true;
            row.onclick = () => _toggleDir(row);
            row.oncontextmenu = (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                _showTreeMenu(ev.clientX, ev.clientY, [
                    { label: 'New File', action: () => _treeNewItem(row.closest('.ed-proj'), e.path, 'file') },
                    { label: 'New Folder', action: () => _treeNewItem(row.closest('.ed-proj'), e.path, 'folder') },
                    { label: 'Rename…', action: () => _treeRename(row, e.path) },
                    { label: 'Delete', danger: true, action: () => _treeDelete(row, e.path) },
                ]);
            };
            treeEl.appendChild(row);
            treeEl.appendChild(kids);
            dirs.push({ row, kids, dir: e.path });
        } else {
            row.appendChild(_el('span', 'ed-tree-caret'));
            row.appendChild(_fileIconEl(e.path));
            row.appendChild(_el('span', 'ed-tree-name', e.name));
            row.onclick = () => {
                const proj = treeEl.closest('.ed-proj');
                if (proj) _openTab(proj, e.path);
            };
            row.oncontextmenu = (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                _showTreeMenu(ev.clientX, ev.clientY, [
                    { label: 'Open', action: () => { const p = treeEl.closest('.ed-proj'); if (p) _openTab(p, e.path); } },
                    { label: 'Rename…', action: () => _treeRename(row, e.path) },
                    { label: 'Delete', danger: true, action: () => _treeDelete(row, e.path) },
                ]);
            };
            treeEl.appendChild(row);
        }
    }
    _treeDirs.set(treeEl, dirs);
    const proj = treeEl.closest('.ed-proj');
    if (proj && proj.__active) _syncTreeSelection(proj, proj.__active);
}

/** Highlight the Explorer row that belongs to the active tab. */
function _syncTreeSelection(proj, tab) {
    if (!proj) return;
    for (const r of proj.querySelectorAll('.ed-tree-row.selected')) r.classList.remove('selected');
    if (!tab) return;
    const row = [...proj.querySelectorAll('.ed-tree-row')].find(r => r.dataset.path === tab.path);
    if (!row) return;
    row.classList.add('selected');
    row.scrollIntoView({ block: 'nearest' });
}

/** Unsaved indicator: the EthOS host owns the window title and taskbar label,
 *  so the editor reports dirty state in its own status bar instead. */
function _updateWindowTitle(ref) {
    const winEl = ref && ref.closest ? ref.closest('.app-window') : null;
    if (!winEl) return;
    const content = winEl.querySelector('.ed-content');
    if (!content) return;
    const proj = content.querySelector('.ed-proj');
    const single = _states.get(content);
    const dirty = proj
        ? (proj.__tabs || []).some(t => t.dirty)
        : !!(single && single.dirty);
    const bar = content.querySelector('[data-testid="ed-statusbar"] .ed-sb-left');
    if (!bar) return;
    let dot = bar.querySelector('[data-testid="ed-dirty"]');
    if (!dirty) {
        if (dot) dot.remove();
        return;
    }
    if (!dot) {
        dot = document.createElement('span');
        dot.className = 'ed-sb-item';
        dot.setAttribute('data-testid', 'ed-dirty');
        dot.title = 'Unsaved changes';
        bar.appendChild(dot);
    }
    dot.textContent = '● Unsaved';
}

/** Language choices for the status-bar picker. */
function _languageChoices() {
    const seen = new Map();
    for (const v of Object.values(LANG_BY_EXT)) {
        if (v && !seen.has(v.label)) seen.set(v.label, v);
    }
    const list = [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
    return [{ mode: null, label: 'Plain Text' }, ...list];
}

function _showLanguageMenu(st, anchor, sync) {
    if (!st) return;
    const current = st.langOverride || _detectMode(st.path);
    const items = _languageChoices().map(l => ({
        label: (current && current.label === l.label ? '✓ ' : '') + l.label,
        action: () => {
            st.langOverride = l;
            if (st.cm) {
                try { st.cm.setOption('mode', l.mode || 'text/plain'); st.cm.refresh(); } catch {}
            }
            sync();
        },
    }));
    const r = anchor.getBoundingClientRect();
    _showTreeMenu(r.left, r.top - 4, items, { up: true });
}

function _renderTree(treeEl, dir) { _renderTreeInto(treeEl, dir); }

function _treeIconSvg(isDir, open) {
    if (isDir) {
        return open
            ? '<svg viewBox="0 0 16 16"><path d="M1.5 3h4.2l1.3 1.5h7.5v2H1.5V3Zm0 3.5h13l-1.8 6H3.3L1.5 6.5Z"/></svg>'
            : '<svg viewBox="0 0 16 16"><path d="M1.5 3h4.2l1.3 1.5h7.5v8H1.5V3Z"/></svg>';
    }
    return '<svg viewBox="0 0 16 16"><path d="M4 1.5h5.2L12.5 5v9.5h-8.5V1.5Zm5 .9v2.8H11L9 2.4Z"/></svg>';
}

async function _toggleDir(row) {
    const treeEl = row.parentElement;
    const dirs = _treeDirs.get(treeEl) || [];
    const entry = dirs.find(d => d.row === row);
    if (!entry) return;
    const caret = row.querySelector('.ed-tree-caret');
    if (entry.kids.hidden) {
        entry.kids.hidden = false;
        caret.textContent = '▾';
        row.querySelector('.ed-tree-icon').replaceChildren(_frag(_treeIconSvg(true, true)));
        if (!entry.kids.dataset.loaded) {
            entry.kids.dataset.loaded = '1';
            await _renderTreeInto(entry.kids, entry.dir);
        }
    } else {
        entry.kids.hidden = true;
        caret.textContent = '▸';
        row.querySelector('.ed-tree-icon').replaceChildren(_frag(_treeIconSvg(true, false)));
    }
}

/** A file/folder name that is safe to append to a directory path. */
function _validEntryName(name) {
    return !!name && name !== '.' && name !== '..' && !/[/\\\x00]/.test(name);
}

/**
 * VS Code-style inline input at the top of a tree container.
 * Resolves the trimmed name, or null when cancelled.
 */
function _inlineTreeInput(container, { value = '', placeholder = 'Name', isDir = false } = {}) {
    return new Promise((resolve) => {
        const row = _el('div', 'ed-tree-row ed-tree-inline');
        row.appendChild(_el('span', 'ed-tree-caret', isDir ? '▸' : ''));
        const icon = _el('span', 'ed-tree-icon');
        icon.replaceChildren(_frag(_treeIconSvg(isDir, false)));
        row.appendChild(icon);
        const input = document.createElement('input');
        input.className = 'ed-tree-input';
        input.value = value;
        input.placeholder = placeholder;
        input.spellcheck = false;
        row.appendChild(input);
        container.prepend(row);
        let done = false;
        const finish = (val) => {
            if (done) return;
            done = true;
            const name = (val ?? '').trim();
            row.remove();
            resolve(name || null);
        };
        for (const ev of ['click', 'mousedown', 'dblclick']) {
            input.addEventListener(ev, (e) => e.stopPropagation());
        }
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); finish(input.value); }
            else if (e.key === 'Escape') { e.preventDefault(); finish(null); }
            e.stopPropagation();
        });
        input.addEventListener('blur', () => finish(input.value));
        setTimeout(() => { input.focus(); input.select(); }, 0);
    });
}

async function _treeNewItem(proj, dirPath, kind) {
    if (!proj) return;
    const root = proj.dataset.root.replace(/\/+$/, '') || '/';
    const dir = (dirPath || root).replace(/\/+$/, '') || '/';
    let container = null;
    if (dir === root) {
        container = proj.querySelector('[data-testid="ed-tree"]');
    } else {
        const row = [...proj.querySelectorAll('.ed-tree-row')].find(
            r => r.dataset.path === dir && r.dataset.isDir === '1');
        if (!row) { addNotification('Folder is not visible in the Explorer', 'warning'); return; }
        const kids = row.nextElementSibling;
        if (kids && kids.classList.contains('ed-tree-kids')) {
            if (kids.hidden) await _toggleDir(row);
            container = kids;
        }
    }
    if (!container) return;
    const name = await _inlineTreeInput(container, {
        value: kind === 'folder' ? 'new-folder' : 'untitled',
        placeholder: kind === 'folder' ? 'Folder name' : 'File name',
        isDir: kind === 'folder',
    });
    if (!name) return;
    if (!_validEntryName(name)) { addNotification('Invalid name', 'error'); return; }
    const full = `${dir.replace(/\/+$/, '')}/${name}`;
    try {
        const endpoint = kind === 'folder' ? '/api/files/mkdir' : '/api/files/touch';
        const resp = await apiFetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: full }),
        });
        if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).detail || `HTTP ${resp.status}`);
        await _renderTreeInto(container, dir);
        if (kind === 'file') _openTab(proj, full);
        await _refreshGit(proj);
    } catch (e) {
        addNotification(e.message || 'Could not create', 'error');
    }
}

/** Point open tabs at their new path after a rename (file or folder). */
function _retargetTabs(proj, oldPath, newPath) {
    if (!newPath) return;
    const setPath = (tab, p) => {
        tab.path = p;
        tab.el.dataset.path = p;
        tab.el.dataset.editorPath = p;
        if (tab.st) tab.st.path = p;
    };
    for (const tab of proj.__tabs || []) {
        if (tab.path === oldPath) setPath(tab, newPath);
        else if (tab.path.startsWith(`${oldPath}/`)) setPath(tab, newPath + tab.path.slice(oldPath.length));
    }
    _renderTabs(proj);
    if (proj.__active) _renderBreadcrumbs(proj, proj.__active);
    _updateStatusBar(proj);
}

async function _treeRename(row, path) {
    const proj = row.closest('.ed-proj');
    const treeEl = row.closest('.ed-tree-kids') || row.closest('.ed-tree');
    const nameEl = row.querySelector('.ed-tree-name');
    if (!nameEl) return;
    const current = _nameOf(path);
    const input = document.createElement('input');
    input.className = 'ed-tree-input';
    input.value = current;
    input.spellcheck = false;
    nameEl.replaceWith(input);
    row.classList.add('ed-tree-inline');
    setTimeout(() => { input.focus(); input.select(); }, 0);

    let done = false;
    const finish = async (commit) => {
        if (done) return;
        done = true;
        const name = input.value.trim();
        if (commit && name && name !== current) {
            if (!_validEntryName(name)) {
                addNotification('Invalid name', 'error');
            } else {
                try {
                    const resp = await apiFetch('/api/files/rename', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ path, new_name: name }),
                    });
                    if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).detail || `HTTP ${resp.status}`);
                    const r = await resp.json().catch(() => ({}));
                    if (proj) _retargetTabs(proj, path, r.path || path.replace(/[^/]+$/, name));
                } catch (e) {
                    addNotification(e.message, 'error');
                }
            }
        }
        if (treeEl && treeEl.dataset.dir) await _renderTreeInto(treeEl, treeEl.dataset.dir);
        if (proj) await _refreshGit(proj);
    };
    for (const ev of ['click', 'mousedown', 'dblclick']) {
        input.addEventListener(ev, (e) => e.stopPropagation());
    }
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        e.stopPropagation();
    });
    input.addEventListener('blur', () => finish(true));
}

async function _treeDelete(row, path) {
    if (!confirm(`Delete ${_nameOf(path)}?`)) return;
    try {
        const resp = await apiFetch('/api/files/delete', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paths: [path] }),
        });
        if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).detail || `HTTP ${resp.status}`);
        const { op_id } = await resp.json();
        // Hard delete runs in a background op — wait for it to finish before
        // re-rendering the tree (single file/dir: well under 10 s).
        for (let i = 0; i < 50; i++) {
            await new Promise(r => setTimeout(r, 200));
            try {
                const opResp = await apiFetch(`/api/files/ops/${op_id}`);
                if (!opResp.ok) break;
                if ((await opResp.json()).status !== 'running') break;
            } catch { break; }
        }
    } catch (e) {
        addNotification(e.message, 'error');
        return;
    }
    const treeEl = row.closest('.ed-tree-kids') || row.closest('.ed-tree');
    if (treeEl && treeEl.dataset.dir) _renderTreeInto(treeEl, treeEl.dataset.dir);
    const proj = row.closest('.ed-proj');
    if (proj) {
        for (const t of [...(proj.__tabs || [])]) {
            if (t.path === path || t.path.startsWith(`${path}/`)) _reallyCloseTab(proj, t);
        }
        await _refreshGit(proj);
    }
}

// ── Search view ────────────────────────────────────────────────────────────
function _initSearchView(proj) {
    const input = proj.querySelector('[data-testid="ed-search-input"]');
    const caseCb = proj.querySelector('[data-testid="ed-search-case"]');
    const regexCb = proj.querySelector('[data-testid="ed-search-regex"]');
    proj.__searchMode = 'content';
    let timer = 0;
    const schedule = () => {
        clearTimeout(timer);
        timer = setTimeout(() => _runSearch(proj, input.value.trim()), 280);
    };
    input.addEventListener('input', schedule);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); clearTimeout(timer); _runSearch(proj, input.value.trim()); }
    });
    for (const cb of [caseCb, regexCb]) cb.addEventListener('change', schedule);
    for (const btn of proj.querySelectorAll('.ed-search-mode')) {
        btn.onclick = () => {
            proj.__searchMode = btn.dataset.mode;
            for (const b of proj.querySelectorAll('.ed-search-mode')) b.classList.toggle('active', b === btn);
            schedule();
        };
    }
}

function _searchOpts(proj) {
    return {
        caseSensitive: !!proj.querySelector('[data-testid="ed-search-case"]')?.checked,
        regex: !!proj.querySelector('[data-testid="ed-search-regex"]')?.checked,
    };
}

async function _runSearch(proj, q) {
    const box = proj.querySelector('[data-testid="ed-search-results"]');
    proj.__searchSeq = (proj.__searchSeq || 0) + 1;
    const my = proj.__searchSeq;
    if (!q) {
        box.replaceChildren(_el('div', 'ed-out-empty', 'Type to search the project.'));
        return;
    }
    box.replaceChildren(_el('div', 'ed-pane-loading', 'Searching…'));
    const mode = proj.__searchMode || 'content';
    const root = proj.dataset.root;
    try {
        if (mode === 'name') {
            const resp = await apiFetch(
                `/api/files/search?q=${encodeURIComponent(q)}&path=${encodeURIComponent(root)}&limit=300`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const d = await resp.json();
            if (my !== proj.__searchSeq) return;
            const results = (d.results || []).filter(r => !r.is_dir);
            box.replaceChildren();
            box.appendChild(_el('div', 'ed-search-count',
                `${results.length} file${results.length === 1 ? '' : 's'}${d.truncated ? ' (more…)' : ''} matching “${q}”`));
            if (!results.length) box.appendChild(_el('div', 'ed-out-empty', 'No files found.'));
            for (const r of results) {
                const row = _el('div', 'ed-search-row');
                row.appendChild(_fileIconEl(r.path));
                const dir = r.path.slice(0, r.path.length - r.name.length).replace(/\/$/, '');
                const nameEl = _el('span', 'ed-search-name', r.name);
                nameEl.title = r.name;
                row.appendChild(nameEl);
                const dirEl = _el('span', 'ed-search-dir', dir);
                dirEl.title = dir;
                row.appendChild(dirEl);
                row.onclick = () => _openTab(proj, r.path);
                box.appendChild(row);
            }
            return;
        }

        const opts = _searchOpts(proj);
        const resp = await apiFetch(
            `/api/editor/search?repo=${encodeURIComponent(root)}&q=${encodeURIComponent(q)}`
            + `&regex=${opts.regex}&case_sensitive=${opts.caseSensitive}&max_results=300`);
        if (!resp.ok) {
            let detail = `HTTP ${resp.status}`;
            try { detail = (await resp.json()).detail || detail; } catch {}
            throw new Error(detail);
        }
        const d = await resp.json();
        if (my !== proj.__searchSeq) return;
        const results = d.results || [];
        const files = new Set(results.map(r => r.path)).size;
        box.replaceChildren();
        box.appendChild(_el('div', 'ed-search-count',
            `${results.length} match${results.length === 1 ? '' : 'es'} in ${files} file${files === 1 ? '' : 's'}`
            + `${d.truncated ? ' (more…)' : ''} · ${d.files_scanned ?? 0} scanned`));
        if (!results.length) box.appendChild(_el('div', 'ed-out-empty', 'No matches found.'));

        const groups = new Map();
        for (const r of results) {
            if (!groups.has(r.path)) groups.set(r.path, []);
            groups.get(r.path).push(r);
        }
        for (const [p, rows] of groups) {
            const dir = p.slice(0, p.length - _nameOf(p).length).replace(/\/$/, '');
            const head = _el('div', 'ed-search-file');
            head.title = p;
            head.appendChild(_fileIconEl(p));
            head.appendChild(_el('span', 'ed-search-name', _nameOf(p)));
            if (dir) head.appendChild(_el('span', 'ed-search-dir', dir));
            head.onclick = () => _openTab(proj, `${root.replace(/\/+$/, '')}/${p}`,
                { line: rows[0].line - 1, column: rows[0].column - 1 });
            box.appendChild(head);
            for (const r of rows) {
                const lineRow = _el('div', 'ed-search-line');
                lineRow.appendChild(_el('span', 'ed-search-ln', String(r.line)));
                lineRow.appendChild(_el('span', 'ed-search-text', (r.text || '').trim()));
                lineRow.onclick = () => _openTab(proj, `${root.replace(/\/+$/, '')}/${p}`,
                    { line: r.line - 1, column: r.column - 1 });
                box.appendChild(lineRow);
            }
        }
    } catch (e) {
        if (my !== proj.__searchSeq) return;
        box.replaceChildren(_el('div', 'ed-out-empty', e.message));
    }
}

// ── Outline view (symbols of the active file) ──────────────────────────────
const OUTLINE_GLYPHS = {
    function: 'ƒ', method: 'ƒ', class: '◆', type: 'T',
    heading: '#', property: '{}',
};

function _outlineDepth(indent, divisor = 2) {
    return Math.min(8, Math.floor(indent.replace(/\t/g, '    ').length / divisor));
}

/** Lightweight per-language symbol extraction (no parser/dependency). */
function _outlineSymbols(path, text) {
    const base = _nameOf(path).toLowerCase();
    const ext = base.includes('.') ? base.split('.').pop() : base;
    const lines = text.split('\n');
    const out = [];
    const add = (line, kind, name, depth = 0) => {
        if (!name) return;
        out.push({ line, kind, name: name.trim(), depth: Math.max(0, Math.min(8, depth)) });
    };

    if (ext === 'md' || ext === 'markdown') {
        for (let i = 0; i < lines.length; i++) {
            const m = lines[i].match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
            if (m) add(i, 'heading', m[2], m[1].length - 1);
        }
        return out;
    }
    if (ext === 'json' || ext === 'jsonc') {
        for (let i = 0; i < lines.length; i++) {
            const m = lines[i].match(/^\s{2}"([^"]+)"\s*:/) || lines[i].match(/^\s{2}'([^']+)'\s*:/);
            if (m) add(i, 'property', m[1], 0);
        }
        return out;
    }

    const jsLike = new Set(['js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'vue', 'svelte']);
    const pyLike = new Set(['py', 'pyw']);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('*')) continue;
        let m;
        if (pyLike.has(ext)) {
            if ((m = line.match(/^(\s*)(?:async\s+)?def\s+([A-Za-z_]\w*)/))) { add(i, 'function', m[2], _outlineDepth(m[1], 4)); continue; }
            if ((m = line.match(/^(\s*)class\s+([A-Za-z_]\w*)/))) { add(i, 'class', m[2], _outlineDepth(m[1], 4)); continue; }
        } else if (jsLike.has(ext)) {
            if ((m = line.match(/^(\s*)(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/))) { add(i, 'function', m[2], _outlineDepth(m[1])); continue; }
            if ((m = line.match(/^(\s*)(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/))) { add(i, 'class', m[2], _outlineDepth(m[1])); continue; }
            if ((m = line.match(/^(\s*)(?:export\s+)?(?:declare\s+)?(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/))) { add(i, 'type', m[2], _outlineDepth(m[1])); continue; }
            if ((m = line.match(/^(\s*)(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/))) { add(i, 'function', m[2], _outlineDepth(m[1])); continue; }
        } else if (ext === 'go') {
            if ((m = line.match(/^(\s*)(func|type)\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/))) {
                add(i, m[2] === 'type' ? 'type' : 'function', m[3], _outlineDepth(m[1], 4));
                continue;
            }
        } else if (ext === 'rs') {
            if ((m = line.match(/^(\s*)(?:pub\s+)?(?:async\s+)?(fn|struct|enum|trait|impl)\s+([A-Za-z_]\w*)/))) {
                add(i, m[2] === 'fn' ? 'function' : 'class', m[3], _outlineDepth(m[1], 4));
                continue;
            }
        } else if (['java', 'kt', 'kts', 'cs', 'swift', 'dart', 'php'].includes(ext)) {
            if ((m = line.match(/^(\s*)(?:(?:public|private|protected|internal|static|final|abstract|open|data|sealed|export)\s+)*(?:class|interface|enum|struct)\s+([A-Za-z_]\w*)/))) {
                add(i, 'class', m[2], _outlineDepth(m[1], 4));
                continue;
            }
            if ((m = line.match(/^(\s*)(?:(?:public|private|protected|internal|static|final|async|override|suspend)\s+)*(?:fun|void|[A-Za-z_]\w*(?:<[^>]*>)?)\s+([A-Za-z_]\w*)\s*\(/))) {
                add(i, 'method', m[2], _outlineDepth(m[1], 4));
                continue;
            }
        } else if (ext === 'css' || ext === 'scss' || ext === 'less') {
            if ((m = line.match(/^(\s*)([.#][\w-][^{,]*)\s*\{/))) { add(i, 'class', m[2], 0); continue; }
        } else if ((m = line.match(/^(\s*)(?:def|function|class|struct|func|fn|interface)\s+([A-Za-z_]\w*)/))) {
            add(i, /class|struct|interface/.test(m[0]) ? 'class' : 'function', m[2], _outlineDepth(m[1], 4));
            continue;
        }
    }
    return out;
}

function _initOutlineView(proj) {
    _refreshOutline(proj);
}

function _refreshOutline(proj) {
    if (!proj || !proj.dataset) return;
    const box = proj.querySelector('[data-testid="ed-outline"]');
    if (!box) return;
    const tab = proj.__active;
    if (!tab || !tab.st || typeof tab.st.getValue !== 'function') {
        box.replaceChildren(_el('div', 'ed-outline-empty', 'Open a file to see its symbols.'));
        return;
    }
    let symbols = [];
    try { symbols = _outlineSymbols(tab.path, tab.st.getValue() || ''); } catch { symbols = []; }
    if (!symbols.length) {
        box.replaceChildren(_el('div', 'ed-outline-empty', 'No symbols found.'));
        return;
    }
    box.replaceChildren();
    for (const s of symbols) {
        const row = _el('div', 'ed-outline-row');
        row.style.paddingLeft = `${10 + s.depth * 13}px`;
        row.title = `Line ${s.line + 1} — ${s.name}`;
        row.appendChild(_el('span', `ed-outline-kind k-${s.kind}`, OUTLINE_GLYPHS[s.kind] || '•'));
        row.appendChild(_el('span', 'ed-outline-name', s.name));
        row.onclick = () => _revealLine(tab, s.line, 0);
        box.appendChild(row);
    }
}

// ── Source Control view ────────────────────────────────────────────────────
function _initScmView(proj) {
    const msg = proj.querySelector('[data-testid="ed-commit-msg"]');
    msg.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            _scmCommit(proj);
        }
    });
    proj.querySelector('[data-testid="ed-commit"]').onclick = () => _scmCommit(proj);
    proj.querySelector('[data-testid="ed-stage-all"]').onclick = () => _scmStageAll(proj);
    proj.querySelector('[data-testid="ed-pull"]').onclick = () => _scmSync(proj, 'pull', 'Pull');
    proj.querySelector('[data-testid="ed-push"]').onclick = () => _scmSync(proj, 'push', 'Push');
    proj.querySelector('[data-testid="ed-fetch"]').onclick = () => _scmSync(proj, 'fetch', 'Fetch');
    proj.querySelector('[data-testid="ed-scm-refresh"]').onclick = () => _refreshGit(proj);
    proj.querySelector('[data-testid="ed-scm-more"]').onclick = (e) => {
        e.stopPropagation();
        const status = proj.__git;
        const items = [
            { label: '⤓ Fetch all remotes', action: () => _scmSync(proj, 'fetch', 'Fetch') },
            { label: '⎇ Merge branch…', action: () => _scmMergeBranch(proj) },
        ];
        if (status && status.merging) items.push({ label: '✕ Abort merge', action: () => _scmMergeAbort(proj) });
        items.push({ separator: true });
        items.push({ label: 'Stash current changes…', action: () => _scmStashSave(proj) });
        items.push({ label: 'Clear all stashes…', action: () => _scmStashClear(proj) });
        const rect = e.currentTarget.getBoundingClientRect();
        _showTreeMenu(rect.left, rect.bottom + 2, items);
    };
    proj.querySelector('[data-testid="ed-branch-new"]').onclick = (e) => { e.stopPropagation(); _scmNewBranch(proj); };
    proj.querySelector('[data-testid="ed-remote-add"]').onclick = (e) => { e.stopPropagation(); _scmAddRemote(proj); };
    proj.querySelector('[data-testid="ed-stash-save"]').onclick = (e) => { e.stopPropagation(); _scmStashSave(proj); };

    // Collapsible pro sections (state survives re-renders)
    proj.__scmSecs = proj.__scmSecs || { branches: false, remotes: false, stash: false };
    for (const sec of ['branches', 'remotes', 'stash']) {
        const head = proj.querySelector(`[data-testid="ed-scm-${sec}-head"]`);
        const body = proj.querySelector(`[data-testid="ed-scm-${sec}"]`);
        const caret = head.querySelector('.ed-scm-caret');
        const apply = () => {
            body.hidden = !proj.__scmSecs[sec];
            caret.textContent = proj.__scmSecs[sec] ? '▾' : '▸';
        };
        apply();
        head.onclick = (e) => {
            if (e.target.closest('button')) return;
            proj.__scmSecs[sec] = !proj.__scmSecs[sec];
            apply();
            if (proj.__scmSecs[sec]) _renderSecData(proj, sec);
        };
    }

    // Status-bar branch chip → branch picker dropdown
    const branchEl = proj.querySelector('[data-testid="ed-sb-branch"]');
    if (branchEl) {
        branchEl.classList.add('clickable');
        branchEl.title = 'Switch branch…';
        branchEl.onclick = () => _showBranchMenu(proj, branchEl);
    }
}

async function _scmStageAll(proj) {
    const root = proj.dataset.root;
    const status = proj.__git;
    if (!status || !status.is_repo) { addNotification('Not a git repository', 'warning'); return; }
    const paths = status.files.filter(f => f.status[1] !== ' ').map(f => f.path);
    if (!paths.length) { addNotification('No changes to stage', 'info'); return; }
    const btn = proj.querySelector('[data-testid="ed-stage-all"]');
    if (btn) btn.disabled = true;
    try {
        const resp = await apiFetch('/api/editor/git/stage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repo: root, paths }),
        });
        if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).detail || `HTTP ${resp.status}`);
        addNotification(`Staged ${paths.length} file(s)`, 'success');
    } catch (e) {
        addNotification(e.message, 'error');
    } finally {
        if (btn) btn.disabled = false;
        await _refreshGit(proj);
    }
}

async function _scmCommit(proj) {
    const msg = proj.querySelector('[data-testid="ed-commit-msg"]').value.trim();
    const root = proj.dataset.root;
    if (!msg) { addNotification('Enter a commit message', 'warning'); return; }
    try {
        const resp = await apiFetch('/api/editor/git/commit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repo: root, message: msg }),
        });
        if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).detail || `HTTP ${resp.status}`);
        const r = await resp.json();
        addNotification(`Committed ${r.hash || ''} — ${msg}`, 'success');
        proj.querySelector('[data-testid="ed-commit-msg"]').value = '';
    } catch (e) {
        addNotification(e.message, 'error');
        return;
    }
    await _refreshGit(proj);
}

async function _scmSync(proj, endpoint, label) {
    const root = proj.dataset.root;
    let sel = '[data-testid="ed-fetch"]';
    if (endpoint === 'pull') sel = '[data-testid="ed-pull"]';
    else if (endpoint === 'push') sel = '[data-testid="ed-push"]';
    const btn = proj.querySelector(sel);
    if (btn) btn.disabled = true;
    try {
        const resp = await apiFetch(`/api/editor/git/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repo: root }),
        });
        if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).detail || `HTTP ${resp.status}`);
        const r = await resp.json();
        addNotification(`${label}: ${r.detail || (r.ok ? 'ok' : 'failed')}`, r.ok ? 'success' : 'error');
    } catch (e) {
        addNotification(e.message, 'error');
    } finally {
        if (btn) btn.disabled = false;
        await _refreshGit(proj);
    }
}

async function _refreshGit(proj) {
    if (!proj || !proj.dataset?.root) return;
    const root = proj.dataset.root;
    let status;
    try {
        const resp = await apiFetch(`/api/editor/git/status?repo=${encodeURIComponent(root)}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        status = await resp.json();
    } catch {
        return;
    }
    proj.__git = status;

    const badge = proj.querySelector('[data-testid="ed-scm-badge"]');
    if (badge) {
        const n = status.files.length;
        badge.hidden = !n;
        badge.textContent = n > 99 ? '99+' : String(n);
    }
    _updateStatusBar(proj);
    _renderScmView(proj, status);
    for (const tab of proj.__tabs || []) _applyDiffMarkers(proj, tab);
    await _reloadCleanTabs(proj);
}

/**
 * Re-read clean tabs whose file changed on disk (git checkout/pull/discard,
 * edits from the terminal, external tools). Dirty buffers are left alone —
 * saving them surfaces the conflict dialog instead of silently clobbering.
 */
async function _reloadCleanTabs(proj) {
    if (proj.__reloading) return;
    proj.__reloading = true;
    try {
        for (const tab of [...(proj.__tabs || [])]) {
            const st = tab.st;
            if (!st || st.binary || st.dirty || st.saving || !st.cm) continue;
            let info;
            try {
                const resp = await apiFetch(`/api/files/stat?path=${encodeURIComponent(tab.path)}`);
                if (!resp.ok) continue;
                info = await resp.json();
            } catch { continue; }
            if (typeof st.mtime !== 'number' || typeof info.modified !== 'number'
                || Math.abs(st.mtime - info.modified) < 0.001) continue;
            tab.el.replaceChildren(_el('div', 'ed-pane-loading', 'Reloading…'));
            _releaseEditorState(st);
            _states.delete(tab.el);
            tab.st = null;
            tab.dirty = false;
            await _loadTab(proj, tab);
            addNotification(`${_nameOf(tab.path)} reloaded (changed on disk)`, 'info');
        }
    } finally {
        proj.__reloading = false;
    }
}

async function _renderScmView(proj, status) {
    const root = proj.dataset.root;
    const stagedBox = proj.querySelector('[data-testid="ed-scm-staged"]');
    const changesBox = proj.querySelector('[data-testid="ed-scm-changes"]');
    const historyBox = proj.querySelector('[data-testid="ed-scm-history"]');
    const stagedCount = proj.querySelector('[data-testid="ed-scm-staged-count"]');
    const changesCount = proj.querySelector('[data-testid="ed-scm-changes-count"]');
    const commitBtn = proj.querySelector('[data-testid="ed-commit"]');
    const commitMsg = proj.querySelector('[data-testid="ed-commit-msg"]');

    // Merge-in-progress banner (with Abort)
    const warn = proj.querySelector('[data-testid="ed-scm-merge-warn"]');
    if (warn) {
        if (status.is_repo && status.merging) {
            warn.hidden = false;
            warn.replaceChildren(_el('span', null, 'Merge in progress — resolve conflicts, then Commit.'));
            const abortBtn = _el('button', 'ed-tb-btn', 'Abort');
            abortBtn.style.marginLeft = 'auto';
            abortBtn.onclick = () => _scmMergeAbort(proj);
            warn.appendChild(abortBtn);
        } else {
            warn.hidden = true;
        }
    }

    if (!status.is_repo) {
        const msg = status.inside_repo
            ? `This folder is not a git repository — it is inside the parent repo ${status.inside_repo}.`
            : 'This folder is not a git repository.';
        stagedBox.replaceChildren(_el('div', 'ed-out-empty', msg));
        changesBox.replaceChildren();
        historyBox.replaceChildren();
        stagedCount.textContent = '';
        changesCount.textContent = '';
        commitBtn.disabled = true;
        commitMsg.disabled = true;
        return;
    }
    commitBtn.disabled = false;
    commitMsg.disabled = false;

    const staged = status.files.filter(f => f.status[0] !== ' ');
    const unstaged = status.files.filter(f => f.status[1] !== ' ');
    stagedCount.textContent = staged.length ? `(${staged.length})` : '';
    changesCount.textContent = unstaged.length ? `(${unstaged.length})` : '';
    commitBtn.textContent = `✓ Commit${staged.length ? ` (${staged.length})` : ''}`;

    if (staged.length) stagedBox.replaceChildren();
    else stagedBox.replaceChildren(_el('div', 'ed-out-empty', 'No staged changes'));
    for (const f of staged) stagedBox.appendChild(_scmFileRow(proj, f, true));
    if (unstaged.length) changesBox.replaceChildren();
    else changesBox.replaceChildren(_el('div', 'ed-out-empty', 'No changes'));
    for (const f of unstaged) changesBox.appendChild(_scmFileRow(proj, f, false));

    let log = [];
    try {
        const resp = await apiFetch(`/api/editor/git/log?repo=${encodeURIComponent(root)}&limit=10`);
        if (resp.ok) log = (await resp.json()).commits || [];
    } catch {}
    if (log.length) {
        historyBox.replaceChildren();
        for (const c of log) {
            const row = _el('div', 'ed-scm-log');
            row.title = c.subject;
            row.appendChild(_el('span', 'ed-scm-log-subject', c.subject));
            const meta = _el('span', 'ed-scm-log-meta');
            meta.appendChild(_el('span', null, c.hash));
            meta.appendChild(_el('span', null, c.author || ''));
            row.appendChild(meta);
            historyBox.appendChild(row);
        }
    } else {
        historyBox.replaceChildren(_el('div', 'ed-out-empty', 'No commits'));
    }
}

function _gitLetter(ch) {
    return (ch && ch !== ' ') ? ch : ' ';
}

function _scmFileRow(proj, f, staged) {
    const root = proj.dataset.root;
    const letter = _gitLetter(staged ? f.status[0] : f.status[1]);
    const idx = f.path.lastIndexOf('/');
    const dir = idx >= 0 ? f.path.slice(0, idx + 1) : '';
    const name = f.path.slice(idx + 1);
    const row = _el('div', 'ed-scm-file');
    row.dataset.path = f.path;
    row.appendChild(_el('span', `ed-scm-letter ${letter}`, letter));
    const pathEl = _el('span', 'ed-scm-path');
    pathEl.title = f.path;
    if (dir) pathEl.appendChild(_el('span', 'ed-scm-dir', dir));
    pathEl.appendChild(document.createTextNode(name));
    row.appendChild(pathEl);
    const actions = _el('span', 'ed-scm-file-actions');
    const toggleBtn = _el('button', 'ed-tb-btn', staged ? '↩' : '+');
    toggleBtn.title = staged ? 'Unstage' : 'Stage';
    actions.appendChild(toggleBtn);
    const diffBtn = _el('button', 'ed-tb-btn', '⧉');
    diffBtn.title = 'Open in Git Diff';
    actions.appendChild(diffBtn);
    const discardBtn = _el('button', 'ed-tb-btn', '🗑');
    discardBtn.title = 'Discard changes';
    actions.appendChild(discardBtn);
    row.appendChild(actions);
    row.onclick = () => {
        _openTab(proj, `${root.replace(/\/+$/, '')}/${f.path}`);
    };
    diffBtn.onclick = (e) => {
        e.stopPropagation();
        if (typeof window.openGitDiffFor === 'function') {
            window.openGitDiffFor(root, f.path, staged ? 'staged' : 'changes');
        } else {
            addNotification('Git Diff app is not available', 'warning');
        }
    };
    toggleBtn.onclick = async (e) => {
        e.stopPropagation();
        try {
            const resp = await apiFetch(`/api/editor/git/${staged ? 'unstage' : 'stage'}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ repo: root, paths: [f.path] }),
            });
            if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).detail || `HTTP ${resp.status}`);
        } catch (err) {
            addNotification(err.message, 'error');
            return;
        }
        await _refreshGit(proj);
    };
    discardBtn.onclick = (e) => {
        e.stopPropagation();
        _scmDiscard(proj, f.path);
    };
    return row;
}

async function _scmDiscard(proj, path) {
    const root = proj.dataset.root;
    if (!confirm(`Discard changes to ${path}?\nThis cannot be undone (untracked files are deleted).`)) return;
    try {
        const resp = await apiFetch('/api/editor/git/discard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repo: root, paths: [path] }),
        });
        const r = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(r.detail || `HTTP ${resp.status}`);
        addNotification(`Discarded ${r.discarded ?? 1} path(s)`, 'success');
        await _refreshGit(proj);
    } catch (e) { addNotification(e.message, 'error'); }
}

// ── Pro git: branches / remotes / stash / merge ───────────────────────────

function _secAction(icon, title, fn) {
    const b = _el('button', 'ed-tb-btn ed-scm-row-btn', icon);
    b.title = title;
    b.onclick = (e) => { e.stopPropagation(); fn(); };
    return b;
}

async function _scmGitApi(proj, path, body, okMsg) {
    const resp = await apiFetch(`/api/editor/git/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: proj.dataset.root, ...body }),
    });
    const r = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(r.detail || `HTTP ${resp.status}`);
    if (okMsg) addNotification(okMsg, 'success');
    return r;
}

function _refreshBranchSections(proj) {
    for (const sec of ['branches', 'remotes', 'stash']) {
        if (proj.__scmSecs && proj.__scmSecs[sec]) _renderSecData(proj, sec);
    }
}

function _renderSecData(proj, sec) {
    if (sec === 'branches') _renderBranchSection(proj);
    else if (sec === 'remotes') _renderRemotesSection(proj);
    else _renderStashSection(proj);
}

async function _renderBranchSection(proj) {
    const box = proj.querySelector('[data-testid="ed-scm-branches"]');
    const count = proj.querySelector('[data-testid="ed-scm-branches-count"]');
    if (!box) return;
    let d;
    try {
        const resp = await apiFetch(`/api/editor/git/branches?repo=${encodeURIComponent(proj.dataset.root)}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        d = await resp.json();
    } catch (e) {
        box.replaceChildren(_el('div', 'ed-out-empty', e.message));
        return;
    }
    if (count) count.textContent = d.branches.length ? `(${d.branches.length})` : '';
    box.replaceChildren();
    for (const b of d.branches) {
        const row = _el('div', `ed-scm-file${b.name === d.current ? ' ed-scm-file-current' : ''}`);
        const name = _el('span', 'ed-scm-path', (b.name === d.current ? '✓ ' : '') + b.name);
        name.title = b.subject || b.name;
        row.appendChild(name);
        const actions = _el('span', 'ed-scm-file-actions');
        actions.appendChild(_secAction('⎇', 'Checkout', () => _scmCheckout(proj, b.name)));
        actions.appendChild(_secAction('✎', 'Rename', () => _scmRenameBranch(proj, b.name)));
        if (b.name !== d.current) actions.appendChild(_secAction('🗑', 'Delete', () => _scmDeleteBranch(proj, b.name)));
        row.appendChild(actions);
        box.appendChild(row);
    }
    if (d.remote_branches.length) {
        box.appendChild(_el('div', 'ed-scm-sublabel', 'REMOTE'));
        for (const r of d.remote_branches) {
            const row = _el('div', 'ed-scm-file');
            row.appendChild(_el('span', 'ed-scm-path', r));
            const actions = _el('span', 'ed-scm-file-actions');
            actions.appendChild(_secAction('⎇', 'Checkout', () => _scmCheckout(proj, r)));
            row.appendChild(actions);
            box.appendChild(row);
        }
    }
    if (!d.branches.length && !d.remote_branches.length) {
        box.appendChild(_el('div', 'ed-out-empty', 'No branches'));
    }
}

async function _scmCheckout(proj, ref) {
    try {
        const r = await _scmGitApi(proj, 'checkout', { ref });
        addNotification(`Switched to ${r.branch || ref}`, 'success');
        await _refreshGit(proj);
        _refreshBranchSections(proj);
    } catch (e) { addNotification(e.message, 'error'); }
}

async function _scmNewBranch(proj) {
    const name = prompt('New branch name (created from current):', 'new-branch');
    if (!name || !name.trim()) return;
    try {
        const r = await _scmGitApi(proj, 'branch', { name: name.trim(), check_out: true });
        addNotification(`Created and switched to ${r.branch || name.trim()}`, 'success');
        await _refreshGit(proj);
        _refreshBranchSections(proj);
    } catch (e) { addNotification(e.message, 'error'); }
}

async function _scmRenameBranch(proj, name) {
    const newName = prompt(`Rename branch ${name}:`, name);
    if (!newName || !newName.trim() || newName.trim() === name) return;
    try {
        const r = await _scmGitApi(proj, 'branch/rename', { name, new_name: newName.trim() });
        addNotification(`Renamed to ${r.branch || newName.trim()}`, 'success');
        _refreshBranchSections(proj);
    } catch (e) { addNotification(e.message, 'error'); }
}

async function _scmDeleteBranch(proj, name) {
    if (!confirm(`Delete branch '${name}'?\n(git branch -d — unmerged branches are refused)`)) return;
    try {
        await _scmGitApi(proj, 'branch/delete', { name }, `Deleted branch ${name}`);
        _refreshBranchSections(proj);
    } catch (e) { addNotification(e.message, 'error'); }
}

async function _renderRemotesSection(proj) {
    const box = proj.querySelector('[data-testid="ed-scm-remotes"]');
    const count = proj.querySelector('[data-testid="ed-scm-remotes-count"]');
    if (!box) return;
    let d;
    try {
        const resp = await apiFetch(`/api/editor/git/remotes?repo=${encodeURIComponent(proj.dataset.root)}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        d = await resp.json();
    } catch (e) {
        box.replaceChildren(_el('div', 'ed-out-empty', e.message));
        return;
    }
    if (count) count.textContent = d.remotes.length ? `(${d.remotes.length})` : '';
    box.replaceChildren();
    for (const r of d.remotes) {
        const row = _el('div', 'ed-scm-file');
        const label = _el('span', 'ed-scm-path ed-scm-url', `${r.name}  ·  ${r.fetch_url || r.push_url || ''}`);
        label.title = r.fetch_url || r.push_url || '';
        row.appendChild(label);
        const actions = _el('span', 'ed-scm-file-actions');
        actions.appendChild(_secAction('✎', 'Change URL', () => _scmSetRemoteUrl(proj, r.name)));
        actions.appendChild(_secAction('🗑', 'Remove', () => _scmRemoveRemote(proj, r.name)));
        row.appendChild(actions);
        box.appendChild(row);
    }
    const status = proj.__git;
    if (status && status.is_repo && status.branch && status.ahead == null && status.behind == null && d.remotes.length) {
        const row = _el('div', 'ed-scm-file');
        row.appendChild(_el('span', 'ed-scm-path', `Track upstream for ${status.branch}…`));
        row.onclick = () => _scmSetUpstream(proj);
        box.appendChild(row);
    }
    if (!d.remotes.length) box.appendChild(_el('div', 'ed-out-empty', 'No remotes configured'));
}

async function _scmAddRemote(proj) {
    const pending = showFormModal({
        title: 'Add Remote',
        confirmLabel: 'Add',
        bodyHtml: `
            <div class="ed-np-form">
                <label>Name</label>
                <input class="ethos-modal-input" name="name" value="origin" spellcheck="false" autocomplete="off">
                <label>URL</label>
                <input class="ethos-modal-input" name="url" placeholder="/path/to/remote.git or https://…" spellcheck="false" autocomplete="off">
            </div>`,
    });
    const values = await pending;
    if (!values) return;
    try {
        await _scmGitApi(proj, 'remote/add', { name: (values.name || '').trim(), url: (values.url || '').trim() }, 'Remote added');
        _refreshBranchSections(proj);
    } catch (e) { addNotification(e.message, 'error'); }
}

async function _scmSetRemoteUrl(proj, name) {
    const url = prompt(`Set fetch URL for remote '${name}':`);
    if (!url || !url.trim()) return;
    try {
        await _scmGitApi(proj, 'remote/set-url', { name, url: url.trim() }, 'Remote URL updated');
        _refreshBranchSections(proj);
    } catch (e) { addNotification(e.message, 'error'); }
}

async function _scmRemoveRemote(proj, name) {
    if (!confirm(`Remove remote '${name}'?`)) return;
    try {
        await _scmGitApi(proj, 'remote/remove', { name }, `Removed remote ${name}`);
        _refreshBranchSections(proj);
    } catch (e) { addNotification(e.message, 'error'); }
}

async function _scmSetUpstream(proj) {
    let names = [];
    try {
        const resp = await apiFetch(`/api/editor/git/remotes?repo=${encodeURIComponent(proj.dataset.root)}`);
        if (resp.ok) names = ((await resp.json()).remotes || []).map(r => r.name);
    } catch {}
    const def = names.includes('origin') ? 'origin' : (names[0] || '');
    const remote = prompt('Track upstream — remote name:', def);
    if (!remote || !remote.trim()) return;
    try {
        await _scmGitApi(proj, 'upstream', { remote: remote.trim() }, 'Upstream tracking set');
        await _refreshGit(proj);
        _refreshBranchSections(proj);
    } catch (e) { addNotification(e.message, 'error'); }
}

async function _renderStashSection(proj) {
    const box = proj.querySelector('[data-testid="ed-scm-stash"]');
    const count = proj.querySelector('[data-testid="ed-scm-stash-count"]');
    if (!box) return;
    let d;
    try {
        const resp = await apiFetch(`/api/editor/git/stash?repo=${encodeURIComponent(proj.dataset.root)}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        d = await resp.json();
    } catch (e) {
        box.replaceChildren(_el('div', 'ed-out-empty', e.message));
        return;
    }
    if (count) count.textContent = d.stashes.length ? `(${d.stashes.length})` : '';
    box.replaceChildren();
    for (const s of d.stashes) {
        const row = _el('div', 'ed-scm-file');
        row.appendChild(_el('span', 'ed-scm-path', `#${s.index}  ${s.message}`));
        const actions = _el('span', 'ed-scm-file-actions');
        actions.appendChild(_secAction('Apply', 'Apply (keep)', () => _scmStashOp(proj, 'apply', s.index)));
        actions.appendChild(_secAction('Pop', 'Pop (drop after)', () => _scmStashOp(proj, 'pop', s.index)));
        actions.appendChild(_secAction('🗑', 'Drop', () => _scmStashDrop(proj, s.index)));
        row.appendChild(actions);
        box.appendChild(row);
    }
    if (d.stashes.length) {
        const clearRow = _el('div', 'ed-scm-file ed-scm-stash-clear', 'Clear all stashes…');
        clearRow.onclick = () => _scmStashClear(proj);
        box.appendChild(clearRow);
    } else {
        box.appendChild(_el('div', 'ed-out-empty', 'No stashes'));
    }
}

async function _scmStashSave(proj) {
    const message = prompt('Stash current changes — message (optional):', '');
    if (message === null) return;
    const untracked = confirm('Include untracked files in the stash?');
    try {
        const r = await _scmGitApi(proj, 'stash', { message: message.trim(), include_untracked: untracked });
        addNotification(r.detail || 'Stashed', 'success');
        await _refreshGit(proj);
        _refreshBranchSections(proj);
    } catch (e) { addNotification(e.message, 'error'); }
}

async function _scmStashOp(proj, op, index) {
    try {
        await _scmGitApi(proj, `stash/${op}`, { index }, `Stash ${op}ped`);
        await _refreshGit(proj);
        _refreshBranchSections(proj);
    } catch (e) { addNotification(e.message, 'error'); }
}

async function _scmStashDrop(proj, index) {
    if (!confirm(`Drop stash #${index}?`)) return;
    try {
        await _scmGitApi(proj, 'stash/drop', { index }, `Dropped stash #${index}`);
        _refreshBranchSections(proj);
    } catch (e) { addNotification(e.message, 'error'); }
}

async function _scmStashClear(proj) {
    if (!confirm('Drop ALL stashes? This cannot be undone.')) return;
    try {
        await _scmGitApi(proj, 'stash/clear', {}, 'All stashes cleared');
        _refreshBranchSections(proj);
    } catch (e) { addNotification(e.message, 'error'); }
}

async function _scmMergeBranch(proj) {
    let d;
    try {
        const resp = await apiFetch(`/api/editor/git/branches?repo=${encodeURIComponent(proj.dataset.root)}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        d = await resp.json();
    } catch (e) { addNotification(e.message, 'error'); return; }
    const others = d.branches.filter(b => b.name !== d.current);
    if (!others.length) { addNotification('No other branches to merge', 'warning'); return; }
    const name = prompt(`Merge which branch into ${d.current}?`, others[0].name);
    if (!name || !name.trim()) return;
    try {
        const r = await _scmGitApi(proj, 'merge', { branch: name.trim() });
        addNotification(r.ok ? `Merged ${name.trim()}: ${r.detail}` : `Merge conflict: ${r.detail}`, r.ok ? 'success' : 'warning');
        await _refreshGit(proj);
    } catch (e) { addNotification(e.message, 'error'); }
}

async function _scmMergeAbort(proj) {
    if (!confirm('Abort the in-progress merge?')) return;
    try {
        const r = await _scmGitApi(proj, 'merge/abort', {});
        addNotification(r.ok ? 'Merge aborted' : r.detail, r.ok ? 'success' : 'error');
        await _refreshGit(proj);
    } catch (e) { addNotification(e.message, 'error'); }
}

async function _showBranchMenu(proj, anchor) {
    let d = { current: proj.__git?.branch, branches: [], remote_branches: [] };
    try {
        const resp = await apiFetch(`/api/editor/git/branches?repo=${encodeURIComponent(proj.dataset.root)}`);
        if (resp.ok) d = await resp.json();
    } catch {}
    const items = [];
    for (const b of d.branches) {
        items.push({ label: `${b.name === d.current ? '✓ ' : ''}${b.name}`, action: () => _scmCheckout(proj, b.name) });
    }
    if (d.remote_branches.length) items.push({ separator: true });
    for (const r of d.remote_branches) items.push({ label: r, action: () => _scmCheckout(proj, r) });
    items.push({ separator: true });
    items.push({ label: '＋ Create new branch…', action: () => _scmNewBranch(proj) });
    const rect = anchor.getBoundingClientRect();
    _showTreeMenu(rect.left, rect.top - 4, items, { up: true });
}

// ── Tabs ───────────────────────────────────────────────────────────────────
function _openTab(proj, path, opts = {}) {
    if (!proj.__tabs) proj.__tabs = [];
    const tabs = proj.__tabs;
    const existing = tabs.find(t => t.path === path);
    if (existing) {
        _activateTab(proj, existing);
        if (typeof opts.line === 'number') {
            if (existing.st && existing.st.cm) _revealLine(existing, opts.line, opts.column);
            else { existing.revealLine = opts.line; existing.revealColumn = opts.column; }
        }
        return;
    }

    const tab = { path, el: null, st: null, dirty: false,
        revealLine: typeof opts.line === 'number' ? opts.line : undefined,
        revealColumn: typeof opts.column === 'number' ? opts.column : undefined };
    tab.el = document.createElement('div');
    tab.el.className = 'ed-editor-pane';
    tab.el.dataset.path = path;
    tab.el.replaceChildren(_el('div', 'ed-pane-loading', 'Loading…'));
    const editors = proj.querySelector('[data-testid="ed-editors"]');
    const empty = editors.querySelector('[data-testid="ed-editors-empty"]');
    if (empty) empty.remove();
    editors.appendChild(tab.el);
    tabs.push(tab);
    _renderTabs(proj);
    _activateTab(proj, tab);
    _loadTab(proj, tab);
}

/** Move the cursor to a 0-based line/column in an already open tab. */
function _revealLine(tab, line, column = 0) {
    const cm = tab.st && tab.st.cm;
    if (!cm) return;
    const l = Math.max(0, Math.min(line, cm.lineCount() - 1));
    const ch = Math.max(0, Math.min(column, cm.getLine(l)?.length || 0));
    cm.setCursor({ line: l, ch });
    cm.scrollIntoView({ line: l, ch }, 120);
    try { cm.focus(); } catch {}
}

async function _loadTab(proj, tab) {
    const path = tab.path;
    const st = { path, encoding: 'utf-8', eol: 'lf', mtime: null, original: null,
        dirty: false, saving: false, binary: false, sizeBytes: 0, wrap: _editorSettings.wrap };
    _states.set(tab.el, st);
    tab.st = st;
    tab.el.dataset.editorPath = path;

    try {
        const statResp = await apiFetch(`/api/files/stat?path=${encodeURIComponent(path)}`);
        if (!statResp.ok) {
            let d; try { d = await statResp.json(); } catch {}
            throw new Error(d?.detail || `HTTP ${statResp.status}`);
        }
        const info = await statResp.json();
        st.sizeBytes = info.size || 0;
        st.mtime = typeof info.modified === 'number' ? info.modified : null;
        if (st.sizeBytes > MAX_EDIT_SIZE) {
            _renderPaneError(tab, '🐘', 'File Too Large',
                `${_nameOf(path)} is ${formatBytes(st.sizeBytes)} — larger than the ${formatBytes(MAX_EDIT_SIZE)} editing limit.`);
            return;
        }

        const resp = await apiFetch(`/api/files/raw?path=${encodeURIComponent(path)}`);
        if (!resp.ok) {
            let d; try { d = await resp.json(); } catch {}
            throw new Error(d?.detail || `HTTP ${resp.status}`);
        }
        const buf = await resp.arrayBuffer();

        let isBinary = false;
        for (const b of new Uint8Array(buf.slice(0, BINARY_SNIFF_BYTES))) {
            if (b === 0) { isBinary = true; break; }
        }
        if (isBinary) {
            st.binary = true;
            _renderPaneError(tab, '🚫', 'Binary File',
                `${_nameOf(path)} appears to be a binary file (${formatBytes(st.sizeBytes)}). The Code Editor can only edit plain-text files.`);
            return;
        }

        const decoded = _decodeBuffer(buf);
        st.original = decoded.text;
        st.encoding = decoded.encoding;
        st.eol = decoded.eol;

        _mountEditor(tab.el, st, {
            onDirty: (dirty) => { tab.dirty = dirty; _renderTabs(proj); _updateWindowTitle(proj); },
            onCursor: () => _updateStatusBarCursor(proj),
            onSave: () => _save(tab.el),
            onWrap: () => _toggleWrap(tab.el, st),
        });
        if (st.cm) {
            let outlineTimer = 0;
            st.__outlineHandler = () => {
                clearTimeout(outlineTimer);
                outlineTimer = setTimeout(() => {
                    if (proj.__sideView === 'outline' && proj.__active === tab) _refreshOutline(proj);
                }, 400);
            };
            st.cm.on('change', st.__outlineHandler);
        }
        // Jump to the requested line (content-search / quick-open result).
        if (typeof tab.revealLine === 'number' && st.cm) {
            const line = Math.max(0, Math.min(tab.revealLine, st.cm.lineCount() - 1));
            const ch = Math.max(0, Math.min(tab.revealColumn || 0, st.cm.getLine(line)?.length || 0));
            st.cm.setCursor({ line, ch });
            st.cm.scrollIntoView({ line, ch }, 120);
            try { st.cm.focus(); } catch {}
            delete tab.revealLine;
            delete tab.revealColumn;
        }
        if (proj.__active === tab) {
            _renderBreadcrumbs(proj, tab);
            _updateStatusBar(proj);
        }
        _refreshOutline(proj);
        _applyDiffMarkers(proj, tab);
    } catch (e) {
        _renderPaneError(tab, '⚠️', 'Could Not Load File', e.message);
    }
}

function _renderPaneError(tab, icon, title, msg) {
    const wrap = _el('div', 'ed-pane-error');
    wrap.appendChild(_el('div', 'ed-bin-icon', icon));
    wrap.appendChild(_el('div', 'ed-bin-title', title));
    wrap.appendChild(_el('div', 'ed-bin-msg', msg));
    tab.el.replaceChildren(wrap);
}

function _renderTabs(proj) {
    const bar = proj.querySelector('[data-testid="ed-tabs"]');
    if (!bar) return;
    const tabs = proj.__tabs || [];
    bar.replaceChildren();
    for (const t of tabs) {
        const el = _el('div', `ed-tab${proj.__active === t ? ' active' : ''}`);
        el.dataset.path = t.path;
        el.appendChild(_fileIconEl(t.path));
        const nameEl = _el('span', 'ed-tab-name', _nameOf(t.path));
        nameEl.title = t.path;
        el.appendChild(nameEl);
        const dot = _el('span', 'ed-tab-dot');
        if (!t.dirty) dot.hidden = true;
        el.appendChild(dot);
        const close = _el('button', 'ed-tab-close', '×');
        close.title = 'Close';
        el.appendChild(close);
        el.onclick = () => _activateTab(proj, t);
        el.oncontextmenu = (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            _showTreeMenu(ev.clientX, ev.clientY, [
                { label: 'Save', disabled: !t.dirty, action: () => _save(t.el) },
                { label: 'Copy Path', action: () => _copyText(t.path) },
                { label: 'Reveal in Explorer', action: () => _revealInTree(proj, t.path) },
                { label: 'Compare with HEAD', disabled: !(proj.__git && proj.__git.is_repo), action: () => _compareWithHead(proj, t.path) },
                { separator: true },
                { label: 'Close', action: () => _closeTab(proj, t) },
                { label: 'Close Others', action: () => _closeTabsExcept(proj, t) },
                { label: 'Close All', action: () => _closeAllTabs(proj) },
            ]);
        };
        el.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
        el.addEventListener('auxclick', (e) => {
            if (e.button === 1) { e.preventDefault(); _closeTab(proj, t); }
        });
        close.onclick = (e) => {
            e.stopPropagation();
            _closeTab(proj, t);
        };
        bar.appendChild(el);
    }
    const saveBtn = document.createElement('button');
    saveBtn.className = 'ed-tb-btn ed-tab-save';
    saveBtn.textContent = 'Save';
    saveBtn.title = 'Save active file (Ctrl+S)';
    saveBtn.onclick = () => {
        const t = proj.__active;
        if (t && t.st) _save(t.el);
    };
    bar.appendChild(saveBtn);
    // Keep the active tab visible when the tab strip overflows.
    const activeEl = bar.querySelector('.ed-tab.active');
    if (activeEl) {
        const left = activeEl.offsetLeft;
        const right = left + activeEl.offsetWidth;
        if (left < bar.scrollLeft) bar.scrollLeft = left;
        else if (right > bar.scrollLeft + bar.clientWidth - 60) {
            bar.scrollLeft = right - bar.clientWidth + 60;
        }
    }
}

function _activateTab(proj, tab) {
    proj.__active = tab;
    for (const t of proj.__tabs) t.el.hidden = (t !== tab);
    _renderTabs(proj);
    _renderBreadcrumbs(proj, tab);
    _updateStatusBar(proj);
    _syncTreeSelection(proj, tab);
    _refreshOutline(proj);
    if (tab.st && tab.st.cm) { try { tab.st.cm.focus(); } catch {} }
}

function _closeTab(proj, tab) {
    if (tab.dirty && tab.st && !tab.st.binary) {
        _askUnsavedChanges(tab.el, tab.st, () => _reallyCloseTab(proj, tab));
        return;
    }
    _reallyCloseTab(proj, tab);
}

async function _copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        addNotification('Path copied to clipboard', 'success');
    } catch {
        addNotification('Could not copy to clipboard', 'error');
    }
}

/** Open the Git Diff app for a project file (worktree vs HEAD). */
function _compareWithHead(proj, path) {
    if (!proj) return;
    const root = proj.dataset.root.replace(/\/+$/, '');
    if (!path.startsWith(`${root}/`)) {
        addNotification('Not a project file', 'warning');
        return;
    }
    if (typeof window.openGitDiffFor !== 'function') {
        addNotification('Git Diff app is not available', 'warning');
        return;
    }
    window.openGitDiffFor(root, path.slice(root.length + 1), 'changes');
}

function _closeTabsExcept(proj, keep) {
    _closeTabsSequential(proj, (proj.__tabs || []).filter(t => t !== keep));
}

function _closeAllTabs(proj) {
    _closeTabsSequential(proj, [...(proj.__tabs || [])]);
}

function _closeTabsSequential(proj, list) {
    const tab = list.shift();
    if (!tab) return;
    if (tab.dirty && tab.st && !tab.st.binary) {
        _askUnsavedChanges(tab.el, tab.st, () => {
            _reallyCloseTab(proj, tab);
            _closeTabsSequential(proj, list);
        });
        return;
    }
    _reallyCloseTab(proj, tab);
    _closeTabsSequential(proj, list);
}

function _reallyCloseTab(proj, tab) {
    const tabs = proj.__tabs || [];
    const idx = tabs.indexOf(tab);
    if (idx === -1) return;
    const st = _states.get(tab.el);
    _releaseEditorState(st);
    _states.delete(tab.el);
    tab.el.remove();
    tabs.splice(idx, 1);
    if (proj.__active === tab) {
        const next = tabs[idx] || tabs[idx - 1] || null;
        if (next) {
            _activateTab(proj, next);
        } else {
            proj.__active = null;
            const editors = proj.querySelector('[data-testid="ed-editors"]');
            const empty = _el('div', 'ed-editors-empty');
            empty.dataset.testid = 'ed-editors-empty';
            empty.appendChild(_el('div', 'ed-editors-empty-icon', '⌨'));
            empty.appendChild(_el('div', null, 'No file active'));
            empty.appendChild(_el('div', 'ed-editors-empty-hint', 'Pick a file from the Explorer to start editing.'));
            editors.appendChild(empty);
            _renderTabs(proj);
            _updateStatusBar(proj);
            _syncTreeSelection(proj, null);
        }
    } else {
        _renderTabs(proj);
    }
}

function _renderBreadcrumbs(proj, tab) {
    const bc = proj.querySelector('[data-testid="ed-breadcrumbs"]');
    if (!bc) return;
    if (!tab) { bc.hidden = true; return; }
    bc.hidden = false;
    const root = proj.dataset.root.replace(/\/+$/, '');
    const rel = tab.path.startsWith(`${root}/`) ? tab.path.slice(root.length + 1) : tab.path;
    const parts = rel.split('/').filter(Boolean);
    const rootName = root.split('/').pop() || '/';
    bc.replaceChildren();
    const addCrumb = (label, fullPath, current) => {
        const span = _el('span', `ed-crumb${current ? ' current' : ''}`, label);
        span.title = fullPath;
        if (!current) span.onclick = () => _revealInTree(proj, fullPath);
        bc.appendChild(span);
    };
    let cur = root;
    addCrumb(rootName, root, parts.length === 0);
    for (let i = 0; i < parts.length - 1; i++) {
        bc.appendChild(_el('span', 'ed-crumb-sep', '›'));
        cur = `${cur}/${parts[i]}`;
        addCrumb(parts[i], cur, false);
    }
    if (parts.length) {
        bc.appendChild(_el('span', 'ed-crumb-sep', '›'));
        addCrumb(parts[parts.length - 1], tab.path, true);
    }
    if (tab.st && _isMarkdown(tab.path)) {
        const actions = _el('span', 'ed-crumb-actions');
        const btn = _el('button', 'ed-tb-btn', tab.__preview ? 'Editor' : 'Preview');
        btn.dataset.testid = 'ed-preview';
        btn.onclick = () => _togglePreview(tab.el, tab.st, btn);
        actions.appendChild(btn);
        bc.appendChild(actions);
    }
}

/** Expand the Explorer tree down to `targetPath` and flash the row. */
async function _revealInTree(proj, targetPath) {
    const rootEl = proj.querySelector('[data-testid="ed-tree"]');
    const root = proj.dataset.root.replace(/\/+$/, '');
    if (!rootEl) return;
    if (proj.__sideView !== 'explorer') _setSideView(proj, 'explorer');
    const rel = targetPath === root ? '' : targetPath.slice(root.length).replace(/^\/+/, '');
    let treeEl = rootEl;
    let cur = root;
    if (!rel) { rootEl.scrollTop = 0; return; }
    for (const part of rel.split('/')) {
        cur = `${cur}/${part}`;
        const row = [...treeEl.children].find(el =>
            el.classList.contains('ed-tree-row') && el.dataset.path === cur);
        if (!row) return;
        if (row.dataset.isDir === '1') {
            const kids = row.nextElementSibling;
            if (kids && kids.classList.contains('ed-tree-kids')) {
                if (kids.hidden) await _toggleDir(row);
                treeEl = kids;
            }
        } else {
            row.scrollIntoView({ block: 'nearest' });
            row.classList.add('ed-flash');
            setTimeout(() => row.classList.remove('ed-flash'), 900);
            return;
        }
    }
}

/** Toggle a rendered Markdown preview for the given editor. */
function _togglePreview(containerEl, st, btn) {
    const existing = containerEl.querySelector('.ed-md-preview');
    if (existing) {
        existing.remove();
        st.__preview = false;
        if (st.cm && st.__previewHandler) {
            try { st.cm.off('change', st.__previewHandler); } catch {}
            delete st.__previewHandler;
        }
        if (st.cm) { try { st.cm.refresh(); } catch {} }
        if (btn) btn.textContent = 'Preview';
        return;
    }
    if (!st.cm) return;
    const wrap = _el('div', 'ed-md-preview');
    const body = _el('div', 'ed-md-body');
    wrap.appendChild(body);
    const render = () => {
        if (window.marked && window.DOMPurify) {
            try {
                body.innerHTML = window.DOMPurify.sanitize(
                    window.marked.parse(st.getValue(), { gfm: true, breaks: false }));
            } catch (e) {
                body.textContent = `Markdown render failed: ${e.message}`;
            }
        } else {
            body.textContent = 'Markdown preview library failed to load from the CDN.';
        }
    };
    render();
    containerEl.appendChild(wrap);
    st.__preview = true;
    let timer = 0;
    st.__previewHandler = () => { clearTimeout(timer); timer = setTimeout(render, 200); };
    st.cm.on('change', st.__previewHandler);
    if (btn) btn.textContent = 'Editor';
}

// ── Editor mounting (CodeMirror + fallback) ────────────────────────────────
function _mountEditor(containerEl, st, handlers) {
    const lang = _detectMode(st.path);
    const useCM = typeof CodeMirror !== 'undefined';
    if (useCM) {
        const d = _el('div', 'ed-cm');
        d.dataset.testid = 'ed-textarea';
        containerEl.replaceChildren(d);
    } else {
        const ta = document.createElement('textarea');
        ta.className = 'ed-textarea-fb';
        ta.dataset.testid = 'ed-textarea';
        ta.spellcheck = false;
        containerEl.replaceChildren(ta);
    }

    let cm = null, ta = null;
    st.wrap = _editorSettings.wrap;

    if (useCM) {
        const crlf = st.eol === 'crlf';
        cm = CodeMirror(containerEl.querySelector('.ed-cm'), {
            value: st.original,
            mode: lang ? lang.mode : 'text/plain',
            lineNumbers: true,
            theme: 'ed-vscode',
            matchBrackets: true,
            autoCloseBrackets: _editorSettings.autoCloseBrackets,
            foldGutter: true,
            gutters: ['CodeMirror-linenumbers', 'ed-diff-gutter', 'CodeMirror-foldgutter'],
            styleActiveLine: true,
            lineWrapping: st.wrap,
            indentUnit: _editorSettings.tabSize,
            tabSize: _editorSettings.tabSize,
            indentWithTabs: false,
            lineSeparator: crlf ? '\r\n' : '\n',
        });
        try { cm.getWrapperElement().style.fontSize = `${_editorSettings.fontSize}px`; } catch {}
    } else {
        ta = containerEl.querySelector('.ed-textarea-fb');
        ta.value = st.original;
        ta.wrap = st.wrap ? 'soft' : 'off';
    }
    st.cm = cm;
    st.__container = containerEl;
    st.getValue = () => (cm ? cm.getValue() : ta.value);

    const updateDirty = () => {
        const dirty = st.original !== null && st.getValue() !== st.original;
        if (dirty === st.dirty) return;
        st.dirty = dirty;
        if (handlers.onDirty) handlers.onDirty(dirty);
        clearTimeout(st.__autosaveTimer);
        if (dirty && _editorSettings.autoSave && handlers.onSave) {
            st.__autosaveTimer = setTimeout(() => {
                if (st.dirty && !st.saving && !st.binary) handlers.onSave();
            }, 1200);
        }
    };

    const updateCursor = () => { if (handlers.onCursor) handlers.onCursor(); };

    if (cm) {
        cm.on('change', updateDirty);
        cm.on('cursorActivity', updateCursor);
        st.__findChange = () => {
            const f = st.__find;
            if (!f || !f.open) return;
            clearTimeout(st.__findTimer);
            st.__findTimer = setTimeout(() => _findRefresh(st, false), 120);
        };
        cm.on('change', st.__findChange);
        cm.setOption('extraKeys', {
            'Ctrl-S': () => handlers.onSave(),
            'Cmd-S': () => handlers.onSave(),
            'Alt-Z': () => handlers.onWrap(),
            'Ctrl-F': () => _findOpen(st, false),
            'Cmd-F': () => _findOpen(st, false),
            'Ctrl-H': () => _findOpen(st, true),
            'Cmd-H': () => _findOpen(st, true),
            'F3': () => _findStep(st, 1),
            'Shift-F3': () => _findStep(st, -1),
            'Esc': () => {
                if (st.__find && st.__find.open) { _findClose(st); return; }
                return CodeMirror.Pass;
            },
            'Ctrl-G': () => { if (CodeMirror.commands.jumpToLine) CodeMirror.commands.jumpToLine(cm); },
            'Alt-G': () => { if (CodeMirror.commands.jumpToLine) CodeMirror.commands.jumpToLine(cm); },
        });
        // CM5 does not re-layout when its container resizes (window drag,
        // maximize, snap) — refresh on size change, rAF-throttled.
        if (typeof ResizeObserver !== 'undefined') {
            const d = containerEl.querySelector('.ed-cm');
            let lastW = 0, lastH = 0, raf = 0;
            const ro = new ResizeObserver(() => {
                const w = d.offsetWidth, h = d.offsetHeight;
                if (w === lastW && h === lastH) return;
                lastW = w; lastH = h;
                if (raf) return;
                raf = requestAnimationFrame(() => {
                    raf = 0;
                    try { if (st.cm) st.cm.refresh(); } catch {}
                });
            });
            ro.observe(d);
            st.resizeObserver = ro;
        }
    } else {
        ta.addEventListener('input', updateDirty);
        ta.addEventListener('keyup', updateCursor);
        ta.addEventListener('click', updateCursor);
        ta.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                handlers.onSave();
                return;
            }
            if (e.altKey && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                handlers.onWrap();
                return;
            }
            if (e.key === 'Tab' && !e.shiftKey) {
                e.preventDefault();
                const s = ta.selectionStart, en = ta.selectionEnd;
                ta.value = ta.value.slice(0, s) + TAB_SPACES + ta.value.slice(en);
                ta.selectionStart = ta.selectionEnd = s + TAB_SPACES.length;
                updateDirty();
                updateCursor();
            }
        });
    }
}

function _toggleWrap(containerEl, st) {
    if (!st) return;
    st.wrap = !st.wrap;
    _persistSettings({ wrap: st.wrap });
    try { localStorage.setItem(WRAP_STORAGE_KEY, st.wrap ? '1' : '0'); } catch {}
    if (st.cm) {
        st.cm.setOption('lineWrapping', st.wrap);
    } else {
        const ta = containerEl.querySelector('.ed-textarea-fb');
        if (ta) ta.wrap = st.wrap ? 'soft' : 'off';
    }
}

// ── In-file Find / Replace bar ─────────────────────────────────────────────
// Our own VS Code-style widget (the CodeMirror dialog is functional but
// visually inconsistent and has no match counter).
const FIND_MAX_MATCHES = 10000;

function _findState(st) {
    if (!st.__find) {
        st.__find = { open: false, replace: false, caseSensitive: false, regex: false, matches: [], index: -1 };
    }
    return st.__find;
}

function _findBuildBar(st) {
    if (st.__findBar && st.__findBar.isConnected) return st.__findBar;
    const bar = _el('div', 'ed-findbar');
    bar.dataset.testid = 'ed-findbar';
    bar.hidden = true;
    bar.appendChild(_frag(`
        <div class="ed-findbar-row">
            <input class="ed-findbar-input ed-findbar-query" placeholder="Find" spellcheck="false" autocomplete="off">
            <span class="ed-findbar-count" data-testid="ed-findbar-count"></span>
            <button class="ed-tb-btn" data-find="prev" title="Previous match (Shift+F3)">↑</button>
            <button class="ed-tb-btn" data-find="next" title="Next match (F3)">↓</button>
            <button class="ed-findbar-opt" data-opt="case" title="Match Case">Aa</button>
            <button class="ed-findbar-opt" data-opt="regex" title="Use Regular Expression">.*</button>
            <button class="ed-tb-btn" data-find="toggle-replace" title="Toggle Replace (Ctrl+H)">↔</button>
            <button class="ed-tb-btn" data-find="close" title="Close (Esc)">×</button>
        </div>
        <div class="ed-findbar-replace-row" hidden>
            <input class="ed-findbar-input ed-findbar-replace" placeholder="Replace" spellcheck="false" autocomplete="off">
            <button class="ed-tb-btn" data-find="replace" title="Replace">Replace</button>
            <button class="ed-tb-btn" data-find="replace-all" title="Replace All">All</button>
        </div>`));
    st.__container.appendChild(bar);
    st.__findBar = bar;

    const query = bar.querySelector('.ed-findbar-query');
    const replaceInp = bar.querySelector('.ed-findbar-replace');
    query.addEventListener('input', () => { _findState(st).index = -1; _findRefresh(st, true); });
    query.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); _findStep(st, e.shiftKey ? -1 : 1); }
        else if (e.key === 'Escape') { e.preventDefault(); _findClose(st); }
    });
    replaceInp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); _findReplace(st); }
        else if (e.key === 'Escape') { e.preventDefault(); _findClose(st); }
    });
    bar.querySelector('[data-find="prev"]').onclick = () => _findStep(st, -1);
    bar.querySelector('[data-find="next"]').onclick = () => _findStep(st, 1);
    bar.querySelector('[data-find="close"]').onclick = () => _findClose(st);
    bar.querySelector('[data-find="toggle-replace"]').onclick = () => _findToggleReplace(st);
    bar.querySelector('[data-find="replace"]').onclick = () => _findReplace(st);
    bar.querySelector('[data-find="replace-all"]').onclick = () => _findReplaceAll(st);
    for (const opt of bar.querySelectorAll('.ed-findbar-opt')) {
        opt.onclick = () => {
            const f = _findState(st);
            if (opt.dataset.opt === 'case') f.caseSensitive = !f.caseSensitive;
            else f.regex = !f.regex;
            opt.classList.toggle('on', opt.dataset.opt === 'case' ? f.caseSensitive : f.regex);
            f.index = -1;
            _findRefresh(st, true);
            query.focus();
        };
    }
    return bar;
}

function _findOpen(st, replace = false) {
    if (!st || !st.cm) return;
    const bar = _findBuildBar(st);
    const f = _findState(st);
    f.open = true;
    if (replace) f.replace = true;
    bar.hidden = false;
    bar.querySelector('.ed-findbar-replace-row').hidden = !f.replace;
    const query = bar.querySelector('.ed-findbar-query');
    const sel = st.cm.getSelection();
    if (sel && !sel.includes('\n') && document.activeElement !== query) {
        query.value = sel;
        f.index = -1;
    }
    _findRefresh(st, true);
    query.focus();
    query.select();
}

function _findClose(st) {
    if (!st || !st.__findBar) return;
    st.__findBar.hidden = true;
    _findState(st).open = false;
    if (st.cm) { try { st.cm.focus(); } catch {} }
}

function _findToggleReplace(st) {
    const f = _findState(st);
    f.replace = !f.replace;
    st.__findBar.querySelector('.ed-findbar-replace-row').hidden = !f.replace;
    if (f.replace) st.__findBar.querySelector('.ed-findbar-replace').focus();
}

/** Recompute matches; jump to the nearest one. Returns null on a bad regex. */
function _findMatches(st) {
    const f = _findState(st);
    const query = st.__findBar.querySelector('.ed-findbar-query').value;
    f.matches = [];
    if (!query) return f.matches;
    let cursor;
    try {
        cursor = st.cm.getSearchCursor(query, { line: 0, ch: 0 },
            { caseFold: !f.caseSensitive, regex: f.regex });
    } catch {
        return null;
    }
    while (cursor.findNext()) {
        f.matches.push({ from: cursor.from(), to: cursor.to() });
        if (f.matches.length >= FIND_MAX_MATCHES) break;
    }
    return f.matches;
}

function _findRefresh(st, jump = false) {
    const bar = st.__findBar;
    if (!bar || bar.hidden) return;
    const f = _findState(st);
    const countEl = bar.querySelector('.ed-findbar-count');
    const matches = _findMatches(st);
    if (matches === null) {
        f.index = -1;
        countEl.textContent = 'Bad regex';
        countEl.classList.add('bad');
        return;
    }
    countEl.classList.remove('bad');
    if (!matches.length) {
        f.index = -1;
        countEl.textContent = bar.querySelector('.ed-findbar-query').value ? 'No results' : '';
        return;
    }
    if (f.index < 0 || f.index >= matches.length) {
        const cur = st.cm.getCursor();
        let i = matches.findIndex(m =>
            CodeMirror.cmpPos(m.from, cur) >= 0 || CodeMirror.cmpPos(m.to, cur) >= 0);
        if (i < 0) i = 0;
        f.index = i;
    }
    countEl.textContent = `${f.index + 1} of ${matches.length}`;
    if (jump) _findSelect(st, f.index);
}

function _findSelect(st, index) {
    const m = _findState(st).matches[index];
    if (!m) return;
    st.cm.setSelection(m.from, m.to);
    st.cm.scrollIntoView({ from: m.from, to: m.to }, 80);
}

function _findStep(st, dir) {
    if (!st || !st.cm) return;
    if (!st.__findBar || st.__findBar.hidden) { _findOpen(st, false); return; }
    const f = _findState(st);
    if (!f.matches.length) _findRefresh(st, false);
    if (!f.matches.length) return;
    f.index = (f.index + dir + f.matches.length) % f.matches.length;
    st.__findBar.querySelector('.ed-findbar-count').textContent = `${f.index + 1} of ${f.matches.length}`;
    _findSelect(st, f.index);
}

function _findReplace(st) {
    const f = _findState(st);
    if (!f.matches.length) return;
    const replacement = st.__findBar.querySelector('.ed-findbar-replace').value;
    if (f.index < 0 || f.index >= f.matches.length) f.index = 0;
    const m = f.matches[f.index];
    st.cm.replaceRange(replacement, m.from, m.to);
    _findRefresh(st, false);
    if (f.matches.length) _findSelect(st, Math.min(f.index, f.matches.length - 1));
    setTimeout(() => _findRefresh(st, false), 0);
}

function _findReplaceAll(st) {
    const f = _findState(st);
    if (!f.matches.length) { _findRefresh(st, false); return; }
    const replacement = st.__findBar.querySelector('.ed-findbar-replace').value;
    const total = f.matches.length;
    st.cm.operation(() => {
        for (let i = f.matches.length - 1; i >= 0; i--) {
            st.cm.replaceRange(replacement, f.matches[i].from, f.matches[i].to);
        }
    });
    addNotification(`Replaced ${total} occurrence(s)`, 'success');
    _findRefresh(st, false);
    setTimeout(() => _findRefresh(st, false), 0);
}

// ── Save ───────────────────────────────────────────────────────────────────
async function _save(containerEl, opts = {}) {
    const st = _states.get(containerEl);
    if (!st || st.binary || st.saving || typeof st.getValue !== 'function') return false;
    st.saving = true;
    try {
        const payload = { path: st.path, content: st.getValue(), encoding: st.encoding };
        // Conflict detection: only send the baseline mtime when we actually
        // have one (files created after opening a tab report null).
        if (!opts.force && st.mtime != null) payload.mtime = st.mtime;
        const resp = await apiFetch('/api/files/content', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (resp.status === 409) {
            _askFileConflict(containerEl, st);
            return false;
        }
        if (!resp.ok) {
            let d; try { d = await resp.json(); } catch {}
            throw new Error(d?.detail || `HTTP ${resp.status}`);
        }
        const r = await resp.json().catch(() => ({}));
        if (typeof r.mtime === 'number') st.mtime = r.mtime;
        st.original = st.getValue();
        st.dirty = false;
        addNotification(`Saved ${_nameOf(st.path)}`, 'success');
        _updateWindowTitle(containerEl);
        const proj = containerEl.closest ? containerEl.closest('.ed-proj') : null;
        if (proj && proj.dataset?.root) {
            const tab = (proj.__tabs || []).find(t => t.el === containerEl);
            if (tab) { tab.dirty = false; _renderTabs(proj); }
            await _refreshGit(proj);
        }
        return true;
    } catch (e) {
        addNotification(e.message || 'Save failed', 'error');
        return false;
    } finally {
        st.saving = false;
    }
}

/** Reload an editor from disk (used by the conflict dialog and manual reload). */
function _reloadEditor(containerEl) {
    const st = _states.get(containerEl);
    if (!st) return;
    const proj = containerEl.closest ? containerEl.closest('.ed-proj') : null;
    if (proj) {
        const tab = (proj.__tabs || []).find(t => t.el === containerEl);
        if (!tab) return;
        _releaseEditorState(st);
        _states.delete(tab.el);
        tab.st = null;
        tab.dirty = false;
        tab.el.replaceChildren(_el('div', 'ed-pane-loading', 'Reloading…'));
        _renderTabs(proj);
        _loadTab(proj, tab);
    } else {
        _releaseEditorState(st);
        _loadFile(containerEl, st.path);
    }
}

/** "File changed on disk" dialog: Reload (discard buffer) / Overwrite / Cancel. */
function _askFileConflict(containerEl, st) {
    for (const el of document.querySelectorAll('.ed-conflict-overlay')) el.remove();
    const overlay = _el('div', 'ed-unsaved-overlay ed-conflict-overlay');
    const box = _el('div', 'ed-unsaved-box');
    box.appendChild(_el('div', 'ed-unsaved-title', 'File Changed on Disk'));
    box.appendChild(_el('div', 'ed-unsaved-msg',
        `${_nameOf(st.path)} was modified outside the editor after it was opened. Saving now would overwrite those changes.`));
    const actions = _el('div', 'ed-unsaved-actions');
    const reload = _el('button', 'ed-ask-saveclose', 'Reload from Disk');
    reload.dataset.testid = 'ed-conflict-reload';
    const overwrite = _el('button', 'ed-ask-discard', 'Overwrite');
    overwrite.dataset.testid = 'ed-conflict-overwrite';
    const cancel = _el('button', 'ed-ask-cancel', 'Cancel');
    cancel.dataset.testid = 'ed-conflict-cancel';
    actions.append(reload, overwrite, cancel);
    box.appendChild(actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    reload.onclick = () => { overlay.remove(); _reloadEditor(containerEl); };
    overwrite.onclick = async () => {
        overlay.remove();
        await _save(containerEl, { force: true });
    };
    cancel.onclick = () => overlay.remove();
}

// ── Status bar ─────────────────────────────────────────────────────────────
function _updateStatusBar(proj) {
    if (!proj || !proj.dataset) return;
    const git = proj.__git;
    const branchEl = proj.querySelector('[data-testid="ed-sb-branch"]');
    if (branchEl) {
        if (git && git.is_repo) {
            let txt = `⎇ ${git.branch || 'HEAD'}`;
            if (git.ahead != null && git.behind != null) {
                const bits = [];
                if (git.ahead) bits.push(`↑${git.ahead}`);
                if (git.behind) bits.push(`↓${git.behind}`);
                if (bits.length) txt += ` ${bits.join(' ')}`;
            }
            branchEl.textContent = txt;
            branchEl.hidden = false;
        } else {
            branchEl.hidden = true;
        }
    }
    const tab = proj.__active;
    if (!tab || !tab.st) return;
    const st = tab.st;
    const encEl = proj.querySelector('[data-testid="ed-enc"]');
    if (encEl) encEl.textContent = st.encoding === 'utf-8' ? 'UTF-8' : 'Latin-1';
    const eolEl = proj.querySelector('[data-testid="ed-eol"]');
    if (eolEl) eolEl.textContent = st.eol === 'crlf' ? 'CRLF' : 'LF';
    const spacesEl = proj.querySelector('[data-testid="ed-spaces"]');
    if (spacesEl) spacesEl.textContent = `Spaces: ${_editorSettings.tabSize}`;
    const langEl = proj.querySelector('[data-testid="ed-lang"]');
    if (langEl) {
        const l = st.langOverride || _detectMode(st.path);
        langEl.textContent = l ? l.label : 'Plain Text';
        langEl.title = 'Change language mode';
        langEl.classList.add('clickable');
        langEl.onclick = () => _showLanguageMenu(st, langEl, () => _updateStatusBar(proj));
    }
    _updateStatusBarCursor(proj);
}

function _updateStatusBarCursor(proj) {
    const tab = proj.__active;
    const posEl = proj.querySelector('[data-testid="ed-pos"]');
    const selEl = proj.querySelector('[data-testid="ed-sel"]');
    if (!tab || !tab.st || !tab.st.cm || !posEl) return;
    const cm = tab.st.cm;
    const cur = cm.getCursor();
    posEl.textContent = `Ln ${cur.line + 1}, Col ${cur.ch + 1}`;
    const sel = cm.getSelection();
    if (sel) {
        selEl.hidden = false;
        selEl.textContent = `Sel ${sel.length}`;
    } else {
        selEl.hidden = true;
    }
}

// ── Git diff gutter markers ────────────────────────────────────────────────
/**
 * Parse a unified diff into 0-indexed NEW-file line numbers:
 *  added   — lines that exist in the working tree but not in HEAD
 *  deleted — the line just before each deleted line (where the red mark sits)
 */
function _parseUnifiedDiff(text) {
    const added = new Set();
    const deleted = new Set();
    let newLine = 1; // 1-based new-file line number of the next line
    for (const line of text.split('\n')) {
        const h = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (h) { newLine = parseInt(h[1], 10); continue; }
        if (line.startsWith('+')) {
            added.add(newLine - 1);
            newLine++;
        } else if (line.startsWith('-')) {
            if (newLine > 1) deleted.add(newLine - 2);
        } else if (line.startsWith(' ')) {
            newLine++;
        }
    }
    return { added, deleted };
}

async function _applyDiffMarkers(proj, tab) {
    const cm = tab.st && tab.st.cm;
    if (!cm || !tab.el.isConnected) return;
    _clearDiffMarkers(tab);
    const git = proj.__git;
    if (!git || !git.is_repo) return;
    const root = proj.dataset.root.replace(/\/+$/, '');
    if (!tab.path.startsWith(`${root}/`)) return;
    const rel = tab.path.slice(root.length + 1);
    if (!git.files.some(f => f.path === rel)) return;

    let added = new Set();
    let deleted = new Set();
    try {
        const resp = await apiFetch(
            `/api/editor/git/diff?repo=${encodeURIComponent(proj.dataset.root)}&path=${encodeURIComponent(rel)}`);
        if (!resp.ok) return;
        const d = await resp.json();
        if (d.untracked) {
            // Untracked files would otherwise light up every line — VS Code
            // only decorates the gutter, so mark the first line as a hint.
            added = new Set([0]);
        } else {
            const parsed = _parseUnifiedDiff(d.diff || '');
            added = parsed.added;
            deleted = parsed.deleted;
        }
    } catch {
        return;
    }

    const marks = { added: [], deleted: [] };
    const mk = (cls) => {
        const s = document.createElement('span');
        s.className = `ed-diff-mark ${cls}`;
        return s;
    };
    for (const l of added) {
        if (l < 0 || l >= cm.lineCount()) continue;
        cm.setGutterMarker(l, 'ed-diff-gutter', mk('add'));
        marks.added.push(l);
    }
    for (const l of deleted) {
        if (l < 0 || l >= cm.lineCount()) continue;
        if (added.has(l + 1)) continue; // replaced line — the addition gets the green mark
        cm.setGutterMarker(l, 'ed-diff-gutter', mk('del'));
        marks.deleted.push(l);
    }
    tab.__diff = marks;
}

function _clearDiffMarkers(tab) {
    const cm = tab.st && tab.st.cm;
    if (!cm || !tab.__diff) return;
    for (const l of tab.__diff.added) {
        try {
            cm.removeLineClass(l, 'background', 'ed-diff-line-add');
            cm.setGutterMarker(l, 'ed-diff-gutter', null);
        } catch {}
    }
    for (const l of tab.__diff.deleted) {
        try {
            cm.removeLineClass(l, 'background', 'ed-diff-line-del');
            cm.setGutterMarker(l, 'ed-diff-gutter', null);
        } catch {}
    }
    tab.__diff = null;
}

// ── Bottom panel (terminal splits, Output, Problems, Debug Console) ────────
const _termStates = new WeakMap();

function _initTermPanel(winBody) {
    const shell = winBody.querySelector('.ed-shell');
    if (!shell) return;
    const panel = shell.querySelector('[data-testid="ed-panel"]');
    if (!panel) return;
    const st = {
        shell,
        panel,
        sessions: [],
        disposed: false,
        cwd: '',
        target: 'host',
        view: 'terminal',
    };
    _termStates.set(shell, st);

    for (const btn of panel.querySelectorAll('.ed-panel-tab')) {
        btn.onclick = () => _termSetView(st, btn.dataset.view);
    }
    panel.querySelector('[data-testid="ed-panel-toggle"]').onclick = () => _termToggle(st);
    panel.querySelector('[data-testid="ed-term-restart"]').onclick = () => _termRestartAll(st);
    panel.querySelector('[data-testid="ed-term-new"]').onclick = () => _termAddSession(st);
    panel.querySelector('[data-testid="ed-term-target"]').onclick = (e) => {
        e.stopPropagation();
        _termShowTargetMenu(st, e.currentTarget);
    };

    const grip = panel.querySelector('.ed-panel-resize');
    grip.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const startY = e.clientY;
        // Baseline must be the panel's *current* height — localStorage may hold a
        // stale value, which would snap the panel back on the first drag.
        const startH = panel.getBoundingClientRect().height;
        const onMove = (ev) => {
            const h = Math.max(TERM_MIN_H, Math.min(1.5 * window.innerHeight, startH + (startY - ev.clientY)));
            panel.style.height = `${h}px`;
            requestAnimationFrame(() => {
                if (st.disposed) return;
                for (const s of st.sessions) { try { s.fit.fit(); } catch {} _termSendResize(s); }
            });
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            // Persist the height actually reached (only while the body is open —
            // a collapsed panel reports just the tab-row height).
            const body = panel.querySelector('[data-testid="ed-panel-body"]');
            if (!body.hasAttribute('hidden')) {
                try { localStorage.setItem(TERM_HEIGHT_KEY, String(Math.round(panel.getBoundingClientRect().height))); } catch {}
            }
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });

    // Ctrl+` toggles the bottom panel from anywhere in the shell (mirrors VS Code).
    const onToggleKey = (e) => {
        if (e.key !== '`' || !(e.ctrlKey || e.metaKey) || e.altKey) return;
        const winEl = shell.closest('.app-window');
        if (!winEl || !winEl.classList.contains('focused')) return;
        e.preventDefault();
        _termToggle(st);
    };
    document.addEventListener('keydown', onToggleKey);
    _shellOnDispose(shell, () => document.removeEventListener('keydown', onToggleKey));

    st.panel.style.height = `${_termHeight()}px`;
    // Always start with the 'host' shell (the server account) — no password
    // prompt on login/project open. Switching to a user account via `su` is an
    // explicit choice in the target picker.
    resolveDefaultTerminalTarget().then((target) => {
        if (st.disposed) return;
        st.target = target;
        _termSyncTargetBtn(st);
        _termAddSession(st);
    });
    // Server account label (e.g. ethos-nas in production) for host targets.
    apiFetch('/api/terminal/options').then((r) => (r.ok ? r.json() : null)).then((opts) => {
        if (st.disposed || !opts) return;
        st.serverUser = opts.server_user || '';
        _termSyncTargetBtn(st);
    }).catch(() => {});
}

function _termSyncTargetBtn(st) {
    const btn = st.panel.querySelector('[data-testid="ed-term-target"]');
    if (btn) {
        let label = st.target;
        if (st.target === 'host') label = st.serverUser || 'host';
        else if (st.target.startsWith('container:')) label = st.target.slice(10);
        else if (st.target.startsWith('user:')) label = st.target.slice(5);
        btn.textContent = label;
        btn.title = `Shell target: ${st.target} — click to change`;
    }
    for (const sess of st.sessions || []) {
        const labelEl = sess.paneEl && sess.paneEl.querySelector('.ed-term-pane-label');
        if (labelEl) labelEl.textContent = _termTargetLabel(st.target, st.serverUser);
    }
}

function _termHeight() {
    try {
        const v = parseInt(localStorage.getItem(TERM_HEIGHT_KEY) || '', 10);
        if (v >= TERM_MIN_H) return v;
    } catch {}
    return TERM_DEFAULT_H;
}

function _termToggle(st) {
    const body = st.panel.querySelector('[data-testid="ed-panel-body"]');
    if (body.hasAttribute('hidden')) {
        if (!st.sessions.length) _termAddSession(st);
        body.removeAttribute('hidden');
        st.panel.style.height = `${_termHeight()}px`;
        requestAnimationFrame(() => {
            if (st.disposed) return;
            for (const s of st.sessions) { try { s.fit.fit(); } catch {} _termSendResize(s); }
            const last = st.sessions[st.sessions.length - 1];
            if (last && last.term) last.term.focus();
        });
    } else {
        // Collapse to just the tab row (VS Code behavior).
        body.setAttribute('hidden', '');
        st.panel.style.height = '';
    }
}

function _termSetView(st, view) {
    if (st.view === view) return;
    st.view = view;
    const body = st.panel.querySelector('[data-testid="ed-panel-body"]');
    if (body.hasAttribute('hidden')) {
        body.removeAttribute('hidden');
        st.panel.style.height = `${_termHeight()}px`;
    }
    for (const b of st.panel.querySelectorAll('.ed-panel-tab')) b.classList.toggle('active', b.dataset.view === view);
    // Opening the panel from a collapsed state needs a re-fit.
    requestAnimationFrame(() => {
        if (st.disposed) return;
        for (const s of st.sessions) { try { s.fit.fit(); } catch {} _termSendResize(s); }
    });
    for (const v of st.panel.querySelectorAll('.ed-panel-view')) v.hidden = (v.dataset.view !== view);
    if (view === 'terminal' && !st.sessions.length) _termAddSession(st);
    if (view === 'output') _loadPanelData(st, 'output');
    if (view === 'problems') _loadPanelData(st, 'problems');
}

function _termTheme() {
    if (!document.documentElement.classList.contains('dark')) {
        // VS Code Light+ terminal palette
        return {
            background: '#ffffff',
            foreground: '#333333',
            cursor: '#1f2430',
            selectionBackground: '#b3d4fc',
            black: '#000000', red: '#cd3131', green: '#00bc00', yellow: '#949800',
            blue: '#0451a5', magenta: '#bc05bc', cyan: '#0598bc', white: '#555555',
            brightBlack: '#666666', brightRed: '#cd3131', brightGreen: '#14ce14',
            brightYellow: '#b5ba00', brightBlue: '#0451a5', brightMagenta: '#bc05bc',
            brightCyan: '#0598bc', brightWhite: '#a5a5a5',
        };
    }
    return {
        background: '#1E1E1E',
        foreground: '#CCCCCC',
        cursor: '#AEAFAD',
        selectionBackground: '#264F78',
        black: '#000000', red: '#CD3131', green: '#0DBC79', yellow: '#E5E510',
        blue: '#3B75FF', magenta: '#BC3FBC', cyan: '#11A8CD', white: '#E5E5E5',
        brightBlack: '#666666', brightRed: '#F14C4C', brightGreen: '#23D18B',
        brightYellow: '#F5F543', brightBlue: '#3B75FF', brightMagenta: '#B4009E',
        brightCyan: '#61D6D6', brightWhite: '#FFFFFF',
    };
}

// xterm keeps its palette in JS, so it needs an explicit update when the
// topbar toggle flips `<html class="light|dark">` at runtime.
const _termInstances = new Set();
let _termThemeObserver = null;
function _watchThemeChanges() {
    if (_termThemeObserver) return;
    _termThemeObserver = new MutationObserver(() => {
        if (!document.body) return;
        for (const term of _termInstances) {
            try { term.options.theme = _termTheme(); } catch (_) { /* disposed */ }
        }
    });
    _termThemeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
}

function _termTargetLabel(target, serverUser = '') {
    if (target === 'host') return serverUser ? `${serverUser} (server)` : 'host terminal';
    if (target === 'sudo') return 'sudo terminal';
    if (target.startsWith('container:')) return `container "${target.slice(10)}"`;
    if (target.startsWith('user:')) return `${target.slice(5)} (password)`;
    return target;
}

function _termAddSession(st) {
    if (typeof window.Terminal === 'undefined' || typeof window.FitAddon === 'undefined') {
        const splits = st.panel.querySelector('[data-testid="ed-term-splits"]');
        splits.replaceChildren(_el('div', 'ed-term-error',
            'xterm.js failed to load from the CDN — check the internet connection.'));
        return;
    }
    if (st.sessions.length >= TERM_MAX_SPLITS) {
        addNotification(`Maximum ${TERM_MAX_SPLITS} terminal panes`, 'warning');
        return;
    }

    const cwd = _currentCwdFor(st.shell);
    st.cwd = cwd;
    _termShowCwd(st);

    const splits = st.panel.querySelector('[data-testid="ed-term-splits"]');
    const paneEl = _el('div', 'ed-term-pane');
    paneEl.appendChild(_el('div', 'ed-term-body'));
    const panebar = _el('div', 'ed-term-panebar');
    panebar.appendChild(_el('span', 'ed-term-pane-label', _termTargetLabel(st.target, st.serverUser)));
    const kill = _el('button', 'ed-term-pane-kill', '✕');
    kill.title = 'Kill terminal';
    panebar.appendChild(kill);
    paneEl.appendChild(panebar);
    splits.appendChild(paneEl);

    const bodyEl = paneEl.querySelector('.ed-term-body');
    const container = document.createElement('div');
    container.style.cssText = 'width:100%;height:100%;';
    bodyEl.appendChild(container);

    const sess = {
        st, paneEl, bodyEl,
        term: null, fit: null, ws: null,
        disposed: false, ended: false, intentionalClose: false,
        reconnectTimer: 0, attempts: 0,
        encoder: new TextEncoder(),
        cwd,
    };
    st.sessions.push(sess);

    const term = new window.Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: "'Cascadia Code','JetBrains Mono',Consolas,'Courier New',monospace",
        scrollback: 1000,
        theme: _termTheme(),
    });
    const fit = new window.FitAddon.FitAddon();
    term.loadAddon(fit);
    term.open(container);
    _termInstances.add(term);
    _watchThemeChanges();
    term.attachCustomKeyEventHandler((ev) => {
        // Ctrl/Cmd+V: xterm's default handling sends \x16 to the PTY and cancels the keydown,
        // suppressing the browser's native paste event — so clipboard text never reaches
        // xterm's own `paste` listener. Returning false lets the browser run its default
        // action; the resulting `paste` event is handled by xterm itself.
        if (ev.type === 'keydown' && ev.key.toLowerCase() === 'v' && (ev.ctrlKey || ev.metaKey) && !ev.altKey) return false;
        // Ctrl/Cmd+C with a selection: xterm's default handler sends ^C to the PTY and
        // preventDefaults the keydown, so the browser's native `copy` event never fires and
        // the clipboard is never updated. Returning false lets the browser dispatch the
        // `copy` event; xterm's built-in copy listener then fills the clipboard with the
        // selected text. Without a selection, ^C still reaches the shell as usual.
        if (ev.type === 'keydown' && ev.key.toLowerCase() === 'c' && (ev.ctrlKey || ev.metaKey) && !ev.altKey && term.hasSelection()) return false;
        return true;
    });
    sess.term = term;
    sess.fit = fit;

    const body = st.panel.querySelector('[data-testid="ed-panel-body"]');
    if (!body.hasAttribute('hidden')) { try { fit.fit(); } catch {} }

    kill.onclick = () => _termKillSession(st, sess);
    container.addEventListener('mousedown', () => term.focus());
    term.onData((data) => {
        if (sess.ws && sess.ws.readyState === WebSocket.OPEN) sess.ws.send(sess.encoder.encode(data));
    });

    const ro = new ResizeObserver(() => {
        if (sess.disposed || !sess.term) return;
        try { sess.fit.fit(); } catch {}
        _termSendResize(sess);
    });
    ro.observe(bodyEl);
    sess.ro = ro;

    term.write(cwd
        ? `\x1b[90mStarting ${_termTargetLabel(st.target, st.serverUser)} in ${cwd}…\x1b[0m\r\n`
        : `\x1b[90mStarting ${_termTargetLabel(st.target, st.serverUser)}…\x1b[0m\r\n`);
    _termConnectWs(sess);
}

function _termKillSession(st, sess) {
    sess.disposed = true;
    sess.intentionalClose = true;
    if (sess.reconnectTimer) { clearTimeout(sess.reconnectTimer); sess.reconnectTimer = 0; }
    if (sess.ws) { try { sess.ws.close(); } catch {} sess.ws = null; }
    if (sess.term) { try { sess.term.dispose(); } catch {} sess.term = null; }
    if (sess.ro) { try { sess.ro.disconnect(); } catch {} }
    sess.paneEl.remove();
    st.sessions = st.sessions.filter(s => s !== sess);
    _termInstances.delete(sess.term);
    if (!st.sessions.length) {
        st.cwd = '';
        _termShowCwd(st);
        _termStatus(st, 'disconnected', '');
    }
}

function _termRestartAll(st) {
    const n = st.sessions.length;
    for (const s of [...st.sessions]) _termKillSession(st, s);
    for (let i = 0; i < Math.max(1, n); i++) _termAddSession(st);
}

function _termConnectWs(sess) {
    const st = sess.st;
    if (sess.disposed) return;
    let url = `/ws/terminal/${encodeURIComponent(st.target)}`;
    if (sess.cwd) url += `?cwd=${encodeURIComponent(sess.cwd)}`;
    _termStatus(st, 'connecting', 'Connecting…');

    // Shared controller: token attachment, backoff/jitter, auth-close handling
    // and window-close teardown live in core/ws.js (TODO.md P3-08).
    const ctl = connectWs(url, (data) => {
        if (sess.disposed || sess.ws !== ctl || !sess.term) return;
        if (typeof data === 'string') sess.term.write(data);
        else sess.term.write(new Uint8Array(data));
    }, {
        appId: 'editor',
        name: 'editor-terminal',
        isJson: false,
        binaryType: 'arraybuffer',
        stopOnCodes: [4002],
        onOpen: () => {
            if (sess.disposed || sess.ws !== ctl) return;
            _termStatus(st, 'connected', '');
            try { sess.fit.fit(); } catch {}
            _termSendResize(sess);
            // Do not steal focus: the terminal is created in the background and
            // the user is typing in the code editor. Focus happens on click.
        },
        onClose: (ev) => {
            if (sess.disposed || sess.ws !== ctl) return;
            if (sess.intentionalClose) { _termStatus(st, 'disconnected', 'disconnected'); return; }
            if (ev.code === 4001) { _termStatus(st, 'error', 'authentication failed — reload the page'); return; }
            if (ev.code === 4002) { _termStatus(st, 'error', 'target rejected — pick another target'); return; }
            if (ev.code === 4003) { _termStatus(st, 'error', 'invalid working directory'); return; }
            _termStatus(st, 'disconnected', 'disconnected — reconnecting…');
        },
        onReconnectScheduled: (delay) => {
            if (sess.disposed) return;
            _termStatus(st, 'disconnected', `reconnecting in ${Math.ceil(delay / 1000)}s…`);
        },
    });
    sess.ws = ctl;
}

function _termSendResize(sess) {
    if (!sess.ws || sess.ws.readyState !== WebSocket.OPEN || !sess.term) return;
    try {
        // `type: "resize"` is mandatory — the backend treats any other text
        // frame as literal PTY input (it would type the JSON into the shell).
        sess.ws.send(JSON.stringify({ type: 'resize', cols: sess.term.cols, rows: sess.term.rows }));
    } catch {}
}

function _termStatus(st, kind, text) {
    const el = st.panel.querySelector('[data-testid="ed-panel-status"]');
    if (el) {
        el.dataset.kind = kind;
        el.textContent = text;
    }
    const dot = st.panel.querySelector('[data-testid="ed-panel-view-terminal"] .ed-panel-tab-dot');
    if (dot) dot.dataset.kind = kind;
}

function _termShowCwd(st) {
    const el = st.panel.querySelector('[data-testid="ed-panel-cwd"]');
    if (el) {
        el.textContent = st.cwd ? `⌂ ${st.cwd}` : '';
        el.title = st.cwd || '';
    }
}

function _currentCwdFor(shellOrEl) {
    if (!shellOrEl) return '';
    const content = shellOrEl.classList && shellOrEl.classList.contains('ed-shell')
        ? shellOrEl.querySelector('.ed-content')
        : shellOrEl.closest('.ed-content');
    const proj = content ? content.querySelector('.ed-proj') : null;
    if (proj && proj.dataset.root) return proj.dataset.root;
    const single = content ? content.querySelector('[data-testid="editor-root"]') : null;
    if (single && content.dataset.editorPath) return content.dataset.editorPath.replace(/\/[^/]*$/, '') || '/';
    return '';
}

function _termSyncCwd(shellOrEl) {
    const shell = shellOrEl.closest ? shellOrEl.closest('.ed-shell') : null;
    if (!shell) return;
    const st = _termStates.get(shell);
    if (!st || !st.sessions.length) return;
    const cwd = _currentCwdFor(shell);
    if (cwd === st.cwd) return;
    _termRestartAll(st);
}

function _disposeTermState(st) {
    if (st.disposed) return;
    st.disposed = true;
    for (const s of [...st.sessions]) _termKillSession(st, s);
}

// Terminal target menu
async function _termShowTargetMenu(st, anchor) {
    _termHideTargetMenu();
    const menu = document.createElement('div');
    menu.className = 'ed-tree-menu';
    menu.dataset.termMenu = '1';

    const targets = ['host', 'sudo'];
    let serverUser = st.serverUser || '';
    try {
        const resp = await apiFetch('/api/terminal/options');
        if (resp.ok) {
            const opts = await resp.json();
            serverUser = opts.server_user || serverUser;
            st.serverUser = serverUser;
            if (!opts.sudo_available) targets.splice(1, 1);
            for (const u of (opts.users || [])) targets.push(`user:${u.username}`);
        }
    } catch {}
    try {
        const resp = await apiFetch('/api/docker/containers');
        if (resp.ok) {
            const data = await resp.json();
            for (const c of (data.containers || []).filter(c => c.status === 'running').slice(0, 8)) {
                targets.push(`container:${c.name}`);
            }
        }
    } catch {}

    for (const t of targets) {
        const item = document.createElement('button');
        item.className = `ed-tree-menu-item${t === st.target ? ' active' : ''}`;
        let label = t;
        if (t === 'host') label = serverUser ? `host — ${serverUser}` : 'host';
        else if (t === 'sudo') label = 'sudo';
        else if (t.startsWith('container:')) label = t.slice(10);
        else if (t.startsWith('user:')) {
            const name = t.slice(5);
            label = name === serverUser ? `${name} (server)` : `${name} (password)`;
        }
        item.textContent = label + (t === st.target ? '  ✓' : '');
        item.onclick = () => { _termHideTargetMenu(); _termSetTarget(st, t); };
        menu.appendChild(item);
    }
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect();
    menu.style.left = `${Math.max(4, r.left - 130)}px`;
    menu.style.top = `${r.bottom + 4}px`;
    setTimeout(() => {
        const onDoc = (e) => {
            if (!menu.contains(e.target)) { _termHideTargetMenu(); document.removeEventListener('mousedown', onDoc, true); }
        };
        document.addEventListener('mousedown', onDoc, true);
    }, 0);
}

function _termHideTargetMenu() {
    for (const el of document.querySelectorAll('[data-term-menu="1"]')) el.remove();
}

function _termSetTarget(st, target) {
    if (st.disposed || st.target === target) return;
    st.target = target;
    _termSyncTargetBtn(st);
    _termRestartAll(st);
}

// Output / Problems panel data (App Events store)
async function _loadPanelData(st, view) {
    const body = st.panel.querySelector(view === 'output' ? '[data-testid="ed-out-body"]' : '[data-testid="ed-problems-body"]');
    if (!body) return;
    body.replaceChildren(_el('div', 'ed-pane-loading', 'Loading…'));
    let events = [];
    try {
        events = (await fetchLogs({ limit: 100 })).entries || [];
    } catch (_) { /* the panel keeps its empty state when logs are unavailable */ }
    const scroll = _el('div', 'ed-out-scroll');
    if (view === 'problems') {
        const probs = events.filter(e => e.level === 'error' || e.level === 'warning');
        const errs = probs.filter(e => e.level === 'error').length;
        const warns = probs.length - errs;
        const sb = st.shell.querySelector('[data-testid="ed-sb-problems"]');
        if (sb) sb.textContent = `⊘ ${errs}  ⚠ ${warns}`;
        if (probs.length) for (const e of probs) scroll.appendChild(_eventRow(e));
        else scroll.appendChild(_el('div', 'ed-out-empty', 'No problems detected.'));
    } else {
        if (events.length) for (const e of events) scroll.appendChild(_eventRow(e));
        else scroll.appendChild(_el('div', 'ed-out-empty', 'No output yet.'));
    }
    body.replaceChildren(scroll);
}

function _eventRow(e) {
    const ts = e.ts ? new Date(e.ts * 1000).toLocaleTimeString() : '';
    const level = (e.level || 'info').toLowerCase();
    const row = _el('div', 'ed-out-row');
    row.appendChild(_el('span', 'ed-out-time', ts));
    row.appendChild(_el('span', `ed-out-level ${level}`, level.toUpperCase()));
    row.appendChild(_el('span', 'ed-out-msg', e.message || ''));
    if (e.source) row.appendChild(_el('span', 'ed-out-src', e.source));
    return row;
}

// ── Tree context menu ──────────────────────────────────────────────────────
let _treeMenuKeyCleanup = null;

function _showTreeMenu(x, y, items, opts = {}) {
    _closeTreeMenu();
    const menu = document.createElement('div');
    menu.className = 'ed-tree-menu';
    for (const item of items) {
        if (item.separator) {
            const sep = document.createElement('div');
            sep.className = 'ed-tree-menu-sep';
            menu.appendChild(sep);
            continue;
        }
        const btn = document.createElement('button');
        btn.className = `ed-tree-menu-item${item.danger ? ' danger' : ''}${item.disabled ? ' disabled' : ''}`;
        btn.textContent = item.label;
        if (!item.disabled) {
            btn.onclick = () => { _closeTreeMenu(); item.action(); };
        }
        menu.appendChild(btn);
    }
    document.body.appendChild(menu);
    const w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = `${Math.min(x, window.innerWidth - w - 6)}px`;
    menu.style.top = opts.up
        ? `${Math.max(6, y - h)}px`
        : `${Math.min(y, window.innerHeight - h - 6)}px`;
    setTimeout(() => {
        const onDoc = (e) => {
            if (!menu.contains(e.target)) {
                _closeTreeMenu();
                document.removeEventListener('mousedown', onDoc, true);
            }
        };
        document.addEventListener('mousedown', onDoc, true);
    }, 0);
    const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); _closeTreeMenu(); }
    };
    document.addEventListener('keydown', onKey, true);
    _treeMenuKeyCleanup = () => document.removeEventListener('keydown', onKey, true);
}

function _closeTreeMenu() {
    for (const el of document.querySelectorAll('.ed-tree-menu')) el.remove();
    if (_treeMenuKeyCleanup) {
        try { _treeMenuKeyCleanup(); } catch {}
        _treeMenuKeyCleanup = null;
    }
}

// ── Unsaved-changes dialog ─────────────────────────────────────────────────
function _askUnsavedChanges(containerEl, st, onProceed) {
    for (const el of document.querySelectorAll('.ed-unsaved-overlay')) el.remove();
    const overlay = _el('div', 'ed-unsaved-overlay');
    const box = _el('div', 'ed-unsaved-box');
    box.appendChild(_el('div', 'ed-unsaved-title', 'Unsaved Changes'));
    box.appendChild(_el('div', 'ed-unsaved-msg', `${_nameOf(st.path)} has unsaved changes.`));
    const actions = _el('div', 'ed-unsaved-actions');
    const saveClose = _el('button', 'ed-ask-saveclose', 'Save & Close');
    saveClose.dataset.testid = 'ed-ask-save-close';
    const discard = _el('button', 'ed-ask-discard', 'Discard Changes');
    discard.dataset.testid = 'ed-ask-discard';
    const cancel = _el('button', 'ed-ask-cancel', 'Cancel');
    cancel.dataset.testid = 'ed-ask-cancel';
    actions.append(saveClose, discard, cancel);
    box.appendChild(actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const proceed = () => { overlay.remove(); onProceed(); };
    overlay.querySelector('.ed-ask-saveclose').onclick = async () => {
        overlay.querySelector('.ed-unsaved-actions').style.visibility = 'hidden';
        const ok = await _save(containerEl);
        if (ok) proceed();
        else overlay.querySelector('.ed-unsaved-actions').style.visibility = '';
    };
    overlay.querySelector('.ed-ask-discard').onclick = () => { st.dirty = false; proceed(); };
    overlay.querySelector('.ed-ask-cancel').onclick = () => overlay.remove();
}

// ── Menu bar (File / Edit / View / Terminal / Help) ─────────────────────────

/** Current view context for menu actions, resolved at action time. */
function _menuCtx(shell) {
    const content = shell.querySelector('.ed-content');
    return {
        shell,
        content,
        proj: content ? content.querySelector('.ed-proj') : null,
        term: _termStates.get(shell),
    };
}

/** Active editor state: the active tab's st in project mode, the file's st in single-file mode. */
function _activeSt(ctx) {
    if (ctx.proj) {
        const t = ctx.proj.__active;
        return t && t.st ? t.st : null;
    }
    return _states.get(ctx.content) || null;
}

function _saveActive(ctx) {
    if (ctx.proj) {
        const t = ctx.proj.__active;
        if (t && t.st) _save(t.el);
    } else {
        const st = _states.get(ctx.content);
        if (st) _save(ctx.content);
    }
}

function _reloadActive(ctx) {
    if (ctx.proj) {
        const t = ctx.proj.__active;
        if (t && t.st) _reloadEditor(t.el);
    } else if (_states.get(ctx.content)) {
        _reloadEditor(ctx.content);
    }
}

async function _saveAll(ctx) {
    if (ctx.proj) {
        for (const t of ctx.proj.__tabs || []) {
            if (t.dirty && t.st && !t.st.binary) await _save(t.el);
        }
    } else {
        _saveActive(ctx);
    }
}

function _closeActive(ctx) {
    if (ctx.proj) {
        const t = ctx.proj.__active;
        if (t) _closeTab(ctx.proj, t);
        return;
    }
    const st = _states.get(ctx.content);
    const close = () => {
        if (st) { _releaseEditorState(st); _states.delete(ctx.content); }
        _renderWelcome(ctx.content);
    };
    if (st && st.dirty && !st.binary) _askUnsavedChanges(ctx.content, st, close);
    else close();
}

function _closeProject(ctx) {
    const proj = ctx.proj;
    if (!proj) return;
    const dirty = (proj.__tabs || []).find(t => t.dirty && t.st && !t.st.binary);
    const doClose = () => _renderWelcome(ctx.content);
    if (dirty) _askUnsavedChanges(dirty.el, dirty.st, doClose);
    else doClose();
}

function _cmCommand(ctx, cmd) {
    const st = _activeSt(ctx);
    if (!st || !st.cm) return;
    try { st.cm.focus(); st.cm.execCommand(cmd); } catch {}
}

function _toggleWrapActive(ctx) {
    if (ctx.proj) {
        const t = ctx.proj.__active;
        if (t && t.st) _toggleWrap(t.el, t.st);
    } else {
        const st = _states.get(ctx.content);
        if (st) _toggleWrap(ctx.content, st);
    }
}

function _openSearchView(proj) {
    const sidebar = proj.querySelector('[data-testid="ed-sidebar"]');
    if (proj.__sideView !== 'search') { _setSideView(proj, 'search'); return; }
    sidebar.classList.remove('collapsed');
    const i = sidebar.querySelector('[data-testid="ed-search-input"]');
    if (i) setTimeout(() => i.focus(), 30);
}

function _hasDirtyEditors(ctx) {
    if (ctx.proj) return (ctx.proj.__tabs || []).some(t => t.dirty && t.st && !t.st.binary);
    const st = _states.get(ctx.content);
    return !!(st && st.dirty && !st.binary);
}

// ── Quick Open (Ctrl+P) ────────────────────────────────────────────────────
function _quickOpen(proj) {
    if (!proj) { addNotification('Open a folder to use Quick Open', 'info'); return; }
    for (const el of document.querySelectorAll('.ed-quickopen')) el.remove();
    const root = proj.dataset.root.replace(/\/+$/, '');
    const overlay = _el('div', 'ed-quickopen');
    const box = _el('div', 'ed-quickopen-box');
    const input = document.createElement('input');
    input.className = 'ed-quickopen-input';
    input.placeholder = 'Search files by name…';
    input.spellcheck = false;
    input.dataset.testid = 'ed-quickopen-input';
    const list = _el('div', 'ed-quickopen-list');
    box.append(input, list);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    let items = [];
    let sel = 0;
    let seq = 0;
    let timer = 0;
    const render = () => {
        list.replaceChildren();
        if (!input.value.trim()) {
            list.appendChild(_el('div', 'ed-quickopen-empty', 'Type to search files…'));
            return;
        }
        if (!items.length) { list.appendChild(_el('div', 'ed-quickopen-empty', 'No matching files')); return; }
        items.forEach((it, i) => {
            const row = _el('div', `ed-quickopen-row${i === sel ? ' active' : ''}`);
            row.appendChild(_fileIconEl(it.path));
            row.appendChild(_el('span', 'ed-quickopen-name', it.name));
            row.appendChild(_el('span', 'ed-quickopen-path',
                it.path.startsWith(`${root}/`) ? it.path.slice(root.length + 1) : it.path));
            row.onclick = () => choose(it);
            list.appendChild(row);
        });
    };
    const close = () => {
        overlay.remove();
        document.removeEventListener('keydown', onKey, true);
    };
    const choose = (it) => { close(); _openTab(proj, it.path); };
    const load = async () => {
        const my = ++seq;
        const q = input.value.trim();
        if (!q) { items = []; render(); return; }
        try {
            const resp = await apiFetch(
                `/api/files/search?q=${encodeURIComponent(q)}&path=${encodeURIComponent(root)}&limit=60`);
            if (!resp.ok || my !== seq) return;
            const d = await resp.json();
            if (my !== seq) return;
            items = (d.results || []).filter(r => !r.is_dir);
            sel = 0;
            render();
        } catch {}
    };
    const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); close(); }
        else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (items.length) { sel = (sel + 1) % items.length; render(); }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (items.length) { sel = (sel - 1 + items.length) % items.length; render(); }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (items[sel]) choose(items[sel]);
        }
    };
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 150); });
    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
    render();
    setTimeout(() => input.focus(), 20);
}

// ── Command Palette (Ctrl+Shift+P) ─────────────────────────────────────────
function _commandPaletteItems(ctx) {
    const items = [];
    for (const menu of _menuDefs(ctx)) {
        for (const it of menu.items) {
            if (!it || it.sep || it.separator) continue;
            if (it.enabled === false) continue;
            items.push({ label: `${menu.label} › ${it.label}`, hint: it.hint || '', action: it.action });
        }
    }
    const proj = ctx.proj;
    const st = _activeSt(ctx);
    if (proj) {
        items.push({ label: 'File › Quick Open…', hint: 'Ctrl+P', action: () => _quickOpen(proj) });
        items.push({
            label: 'Git › Compare Active File with HEAD',
            action: () => { if (proj.__active) _compareWithHead(proj, proj.__active.path); },
        });
    }
    if (st) {
        items.push({ label: 'Editor › Find in File', hint: 'Ctrl+F', action: () => _findOpen(st, false) });
        items.push({ label: 'Editor › Replace in File', hint: 'Ctrl+H', action: () => _findOpen(st, true) });
    }
    return items;
}

function _showCommandPalette(ctx) {
    for (const el of document.querySelectorAll('.ed-quickopen')) el.remove();
    const overlay = _el('div', 'ed-quickopen');
    const box = _el('div', 'ed-quickopen-box');
    const input = document.createElement('input');
    input.className = 'ed-quickopen-input';
    input.placeholder = 'Type a command…';
    input.spellcheck = false;
    input.dataset.testid = 'ed-command-input';
    const list = _el('div', 'ed-quickopen-list');
    box.append(input, list);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const all = _commandPaletteItems(ctx);
    let items = all;
    let sel = 0;

    const render = () => {
        list.replaceChildren();
        if (!items.length) {
            list.appendChild(_el('div', 'ed-quickopen-empty', 'No matching commands'));
            return;
        }
        items.forEach((it, i) => {
            const row = _el('div', `ed-quickopen-row${i === sel ? ' active' : ''}`);
            row.appendChild(_el('span', 'ed-quickopen-name', it.label));
            if (it.hint) row.appendChild(_el('span', 'ed-quickopen-hint', it.hint));
            row.onclick = () => choose(it);
            list.appendChild(row);
        });
    };
    const close = () => {
        overlay.remove();
        input.removeEventListener('keydown', onKey);
    };
    const choose = (it) => { close(); it.action(); };
    const filter = () => {
        const q = input.value.trim().toLowerCase();
        items = q ? all.filter(it => it.label.toLowerCase().includes(q)) : all;
        sel = 0;
        render();
    };
    const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); close(); }
        else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (items.length) { sel = (sel + 1) % items.length; render(); }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (items.length) { sel = (sel - 1 + items.length) % items.length; render(); }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (items[sel]) choose(items[sel]);
        }
    };
    input.addEventListener('input', filter);
    input.addEventListener('keydown', onKey);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
    render();
    setTimeout(() => input.focus(), 20);
}

// ── Editor settings ────────────────────────────────────────────────────────
async function _showEditorSettings() {
    const pending = showFormModal({
        title: 'Editor Settings',
        confirmLabel: 'Apply',
        bodyHtml: `
            <div class="ed-np-form">
                <label>Font size (px)</label>
                <input class="ethos-modal-input" type="number" name="fontSize" min="10" max="24" value="${_editorSettings.fontSize}">
                <label>Tab size (spaces)</label>
                <select class="ethos-modal-input" name="tabSize" aria-label="Tab size (spaces)">
                    ${[2, 4, 8].map(n => `<option value="${n}"${_editorSettings.tabSize === n ? ' selected' : ''}>${n}</option>`).join('')}
                </select>
                <label class="ed-np-check"><input type="checkbox" name="autoCloseBrackets"${_editorSettings.autoCloseBrackets ? ' checked' : ''}> Auto-close brackets</label>
                <label class="ed-np-check"><input type="checkbox" name="autoSave"${_editorSettings.autoSave ? ' checked' : ''}> Auto-save after 1.2 s of inactivity</label>
                <label class="ed-np-check"><input type="checkbox" name="wrap"${_editorSettings.wrap ? ' checked' : ''}> Word wrap</label>
            </div>`,
    });
    const values = await pending;
    if (!values) return;
    const fontSize = Math.max(10, Math.min(24, parseInt(values.fontSize, 10) || DEFAULT_SETTINGS.fontSize));
    const tabSize = parseInt(values.tabSize, 10) || DEFAULT_SETTINGS.tabSize;
    _persistSettings({
        fontSize,
        tabSize,
        autoCloseBrackets: !!values.autoCloseBrackets,
        autoSave: !!values.autoSave,
        wrap: !!values.wrap,
    });
    try { localStorage.setItem(WRAP_STORAGE_KEY, _editorSettings.wrap ? '1' : '0'); } catch {}
    _applySettingsToOpenEditors();
    addNotification('Editor settings applied', 'success');
}

function _applySettingsToOpenEditors() {
    for (const shell of document.querySelectorAll('.ed-shell')) {        const content = shell.querySelector('.ed-content');
        const containers = [content, ...shell.querySelectorAll('.ed-editor-pane')].filter(Boolean);
        for (const el of containers) {
            const st = _states.get(el);
            if (!st || !st.cm) continue;
            try {
                st.cm.setOption('tabSize', _editorSettings.tabSize);
                st.cm.setOption('indentUnit', _editorSettings.tabSize);
                st.cm.setOption('autoCloseBrackets', _editorSettings.autoCloseBrackets);
                st.cm.setOption('lineWrapping', _editorSettings.wrap);
                st.wrap = _editorSettings.wrap;
                st.cm.getWrapperElement().style.fontSize = `${_editorSettings.fontSize}px`;
                st.cm.refresh();
            } catch {}
        }
        const spacesEl = shell.querySelector('[data-testid="ed-spaces"]');
        if (spacesEl) spacesEl.textContent = `Spaces: ${_editorSettings.tabSize}`;
        const wrapBtn = shell.querySelector('[data-testid="ed-wrap"]');
        if (wrapBtn) wrapBtn.textContent = `Wrap: ${_editorSettings.wrap ? 'On' : 'Off'}`;
    }
}

/** Ctrl+= / Ctrl+- / Ctrl+0 font zoom. */
function _zoomFont(delta) {
    const next = delta === 'reset'
        ? DEFAULT_SETTINGS.fontSize
        : Math.max(10, Math.min(24, _editorSettings.fontSize + delta));
    _persistSettings({ fontSize: next });
    _applySettingsToOpenEditors();
    addNotification(`Editor font size: ${next}px`, 'info');
}

/** Menu definitions, evaluated when a menu is opened so enabled-state is live. */
function _menuDefs(ctx) {
    const st = _activeSt(ctx);
    const proj = ctx.proj;
    return [
        { label: 'File', items: [
            { label: 'New File', enabled: !!proj, action: () => _treeNewItem(proj, proj.dataset.root, 'file') },
            { label: 'Open File…', action: async () => { const p = await pickFile(); if (p) _loadFile(ctx.content, p); } },
            { label: 'Open Folder…', action: async () => { const p = await pickFolder(); if (p) _openProject(ctx.content, p); } },
            { label: 'New Project…', action: () => _newProjectModal(ctx.content) },
            { label: 'Clone Repository…', action: () => _cloneRepoModal(ctx.content) },
            { sep: true },
            { label: 'Save', hint: 'Ctrl+S', enabled: !!(st && st.dirty && !st.binary), action: () => _saveActive(ctx) },
            { label: 'Save All', enabled: _hasDirtyEditors(ctx), action: () => _saveAll(ctx) },
            { label: 'Reload from Disk', enabled: !!st, action: () => _reloadActive(ctx) },
            { label: 'Close Tab', hint: 'Ctrl+W', enabled: !!(proj ? proj.__active : st), action: () => _closeActive(ctx) },
            { sep: true },
            { label: 'Quick Open…', hint: 'Ctrl+P', enabled: !!proj, action: () => _quickOpen(proj) },
            { label: 'Close Project', enabled: !!proj, action: () => _closeProject(ctx) },
        ] },
        { label: 'Edit', items: [
            { label: 'Undo', hint: 'Ctrl+Z', enabled: !!(st && st.cm), action: () => _cmCommand(ctx, 'undo') },
            { label: 'Redo', hint: 'Ctrl+Shift+Z', enabled: !!(st && st.cm), action: () => _cmCommand(ctx, 'redo') },
            { sep: true },
            { label: 'Cut', hint: 'Ctrl+X', enabled: !!(st && st.cm), action: () => _cmCommand(ctx, 'cut') },
            { label: 'Copy', hint: 'Ctrl+C', enabled: !!(st && st.cm), action: () => _cmCommand(ctx, 'copy') },
            { label: 'Paste', hint: 'Ctrl+V', enabled: !!(st && st.cm), action: () => _cmCommand(ctx, 'paste') },
            { label: 'Select All', hint: 'Ctrl+A', enabled: !!(st && st.cm), action: () => _cmCommand(ctx, 'selectAll') },
            { sep: true },
            { label: 'Find', hint: 'Ctrl+F', enabled: !!(st && st.cm), action: () => _findOpen(st, false) },
            { label: 'Replace', hint: 'Ctrl+H', enabled: !!(st && st.cm), action: () => _findOpen(st, true) },
            { label: 'Find in Files', enabled: !!proj, action: () => _openSearchView(proj) },
            { label: 'Toggle Word Wrap', hint: 'Alt+Z', enabled: !!st, action: () => _toggleWrapActive(ctx) },
        ] },
        { label: 'View', items: [
            { label: 'Toggle Sidebar', hint: 'Ctrl+B', enabled: !!proj, action: () => _setSideView(proj, proj.__sideView) },
            { label: 'Toggle Bottom Panel', hint: 'Ctrl+`', action: () => { if (ctx.term) _termToggle(ctx.term); } },
            { label: 'Toggle Word Wrap', hint: 'Alt+Z', enabled: !!st, action: () => _toggleWrapActive(ctx) },
            { sep: true },
            { label: 'Command Palette…', hint: 'Ctrl+Shift+P', action: () => _showCommandPalette(ctx) },
            { label: 'Editor Settings…', action: () => _showEditorSettings() },
        ] },
        { label: 'Terminal', items: [
            { label: 'New Terminal (Split)', action: () => { if (ctx.term) _termAddSession(ctx.term); } },
            { label: 'Restart Terminals', action: () => { if (ctx.term) _termRestartAll(ctx.term); } },
            { label: 'Shell Target…', action: () => {
                const btn = ctx.shell.querySelector('[data-testid="ed-term-target"]');
                if (ctx.term && btn) _termShowTargetMenu(ctx.term, btn);
            } },
            { sep: true },
            { label: 'Hide / Show Panel', hint: 'Ctrl+`', action: () => { if (ctx.term) _termToggle(ctx.term); } },
        ] },
        { label: 'Help', items: [
            { label: 'Keyboard Shortcuts', action: () => _showShortcutsModal() },
            { label: 'About Code Editor', action: () => _showAboutModal() },
        ] },
    ];
}

function _initMenubar(shell) {
    const bar = shell.querySelector('[data-testid="ed-menubar"]');
    if (!bar) return;
    let dropdown = null;
    let openLabel = null;
    let enabledItems = [];   // [{ el, action }] for the open dropdown
    let hlIndex = -1;

    const closeMenu = () => {
        if (dropdown) dropdown.remove();
        dropdown = null;
        openLabel = null;
        enabledItems = [];
        hlIndex = -1;
        for (const b of bar.querySelectorAll('.ed-menu-btn')) b.classList.remove('open');
    };

    const setHl = () => {
        enabledItems.forEach((it, i) => { it.el.classList.toggle('hl', i === hlIndex); });
        if (hlIndex >= 0 && enabledItems[hlIndex]) enabledItems[hlIndex].el.scrollIntoView({ block: 'nearest' });
    };

    const openMenu = (key) => {
        closeMenu();
        const def = _menuDefs(_menuCtx(shell)).find(m => m.label.toLowerCase() === key);
        const btn = bar.querySelector(`.ed-menu-btn[data-menu="${key}"]`);
        if (!def || !btn) return;
        enabledItems = [];
        dropdown = _el('div', 'ed-menu');
        for (const item of def.items) {
            if (item.sep) { dropdown.appendChild(_el('div', 'ed-menu-sep')); continue; }
            const row = _el('div', 'ed-menu-item');
            row.appendChild(_el('span', null, item.label));
            if (item.hint) row.appendChild(_el('span', 'ed-menu-hint', item.hint));
            if (item.enabled === false) {
                row.setAttribute('disabled', '');
            } else {
                enabledItems.push({ el: row, action: item.action });
                row.onclick = () => { closeMenu(); item.action(); };
            }
            dropdown.appendChild(row);
        }
        document.body.appendChild(dropdown);
        const r = btn.getBoundingClientRect();
        const maxLeft = window.innerWidth - dropdown.offsetWidth - 8;
        dropdown.style.left = `${Math.max(4, Math.min(r.left, maxLeft))}px`;
        dropdown.style.top = `${r.bottom}px`;
        btn.classList.add('open');
        openLabel = key;
    };

    for (const b of bar.querySelectorAll('.ed-menu-btn')) {
        b.addEventListener('click', (e) => {
            e.stopPropagation();
            if (openLabel === b.dataset.menu) closeMenu();
            else openMenu(b.dataset.menu);
        });
    }

    const onDocMouseDown = (e) => {
        if (!dropdown) return;
        if (dropdown.contains(e.target) || bar.contains(e.target)) return;
        closeMenu();
    };
    document.addEventListener('mousedown', onDocMouseDown);

    const onKey = (e) => {
        if (!openLabel) return;
        const n = enabledItems.length;
        if (e.key === 'Escape') { e.preventDefault(); closeMenu(); return; }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!n) return;
            const dir = e.key === 'ArrowDown' ? 1 : -1;
            hlIndex = (hlIndex + dir + n) % n;
            setHl();
            return;
        }
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (hlIndex >= 0 && enabledItems[hlIndex]) {
                const act = enabledItems[hlIndex].action;
                closeMenu();
                act();
            }
            return;
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            const keys = [...bar.querySelectorAll('.ed-menu-btn')].map(b => b.dataset.menu);
            const i = keys.indexOf(openLabel);
            const d = e.key === 'ArrowRight' ? 1 : -1;
            openMenu(keys[(i + d + keys.length) % keys.length]);
            return;
        }
        closeMenu();
    };
    document.addEventListener('keydown', onKey);
    _shellOnDispose(shell, () => {
        document.removeEventListener('mousedown', onDocMouseDown);
        document.removeEventListener('keydown', onKey);
    });
}

/** Window-scoped shortcuts: Ctrl+B sidebar, Ctrl+W close tab, Alt+Z wrap, Ctrl+S fallback. */
function _initEditorShortcuts(shell) {
    const onKey = (e) => {
        const winEl = shell.closest('.app-window');
        if (!winEl || !winEl.classList.contains('focused')) return;
        if (e.defaultPrevented) return;
        const ctx = _menuCtx(shell);
        const mod = e.ctrlKey || e.metaKey;
        const k = e.key.toLowerCase();
        const activeSt = _activeSt(ctx);
        const ae = document.activeElement;
        const typingElsewhere = ae && /^(INPUT|TEXTAREA)$/.test(ae.tagName)
            && !ae.closest('.CodeMirror') && !ae.closest('.ed-findbar');
        if (typingElsewhere) return;
        if (mod && !e.altKey && !e.shiftKey && (k === 'f' || k === 'h')) {
            if (activeSt && activeSt.cm) { e.preventDefault(); _findOpen(activeSt, k === 'h'); }
            return;
        }
        if (mod && !e.altKey && !e.shiftKey && (k === '=' || k === '+')) { e.preventDefault(); _zoomFont(1); return; }
        if (mod && !e.altKey && k === '-') { e.preventDefault(); _zoomFont(-1); return; }
        if (mod && !e.altKey && k === '0') { e.preventDefault(); _zoomFont('reset'); return; }
        if (mod && e.shiftKey && !e.altKey && k === 'e' && ctx.proj) { e.preventDefault(); _setSideView(ctx.proj, 'explorer'); return; }
        if (mod && e.shiftKey && !e.altKey && k === 'p') { e.preventDefault(); _showCommandPalette(ctx); return; }
        if (mod && e.shiftKey && !e.altKey && k === 'f' && ctx.proj) { e.preventDefault(); _openSearchView(ctx.proj); return; }
        if (mod && e.shiftKey && !e.altKey && k === 'g' && ctx.proj) { e.preventDefault(); _setSideView(ctx.proj, 'scm'); return; }
        if (!mod && !e.altKey && e.key === 'F3') {
            if (activeSt && activeSt.cm) { e.preventDefault(); _findStep(activeSt, e.shiftKey ? -1 : 1); }
            return;
        }
        if (mod && !e.altKey && !e.shiftKey && k === 'b') {
            if (ctx.proj) { e.preventDefault(); _setSideView(ctx.proj, ctx.proj.__sideView); }
            return;
        }
        if (mod && !e.altKey && !e.shiftKey && k === 'w') {
            const has = ctx.proj ? ctx.proj.__active : _states.get(ctx.content);
            if (has) { e.preventDefault(); _closeActive(ctx); }
            return;
        }
        if (mod && !e.altKey && !e.shiftKey && k === 'p') {
            if (ctx.proj) { e.preventDefault(); _quickOpen(ctx.proj); }
            return;
        }
        if (e.altKey && !mod && k === 'z') {
            if (_activeSt(ctx)) { e.preventDefault(); _toggleWrapActive(ctx); }
            return;
        }
        if (mod && !e.shiftKey && !e.altKey && k === 's') {
            // CodeMirror handles Ctrl+S itself while focused; this covers the rest of the window.
            const st = _activeSt(ctx);
            if (st && st.dirty && !st.binary) { e.preventDefault(); _saveActive(ctx); }
        }
    };
    document.addEventListener('keydown', onKey);
    _shellOnDispose(shell, () => document.removeEventListener('keydown', onKey));
}

function _showShortcutsModal() {
    const rows = [
        ['Save', 'Ctrl+S'],
        ['Close Tab', 'Ctrl+W'],
        ['Quick Open (file by name)', 'Ctrl+P'],
        ['Find / Replace in file', 'Ctrl+F / Ctrl+H'],
        ['Next / previous match', 'F3 / Shift+F3'],
        ['Go to line', 'Ctrl+G'],
        ['Explorer / Search / Source Control', 'Ctrl+Shift+E / F / G'],
        ['Command Palette', 'Ctrl+Shift+P'],
        ['Zoom font in / out / reset', 'Ctrl+= / Ctrl+- / Ctrl+0'],
        ['Toggle Sidebar', 'Ctrl+B'],
        ['Toggle Bottom Panel', 'Ctrl+`'],
        ['Toggle Word Wrap', 'Alt+Z'],
        ['Undo / Redo', 'Ctrl+Z / Ctrl+Shift+Z'],
        ['Cut / Copy / Paste', 'Ctrl+X / Ctrl+C / Ctrl+V'],
        ['New Terminal (split)', '＋ in the Terminal panel'],
    ];
    const bodyHtml = `
        <div class="ed-kbd-table">
            ${rows.map(([l, k]) => `<div class="ed-kbd-row"><span>${l}</span><kbd>${k}</kbd></div>`).join('')}
        </div>`;
    showFormModal({ title: 'Keyboard Shortcuts', bodyHtml });
}

function _showAboutModal() {
    showFormModal({
        title: 'About Code Editor',
        bodyHtml: `
            <div class="ed-about">
                <div class="ed-about-name">⌨ EthOS NAS — Code Editor</div>
                <div class="ed-about-desc">
                    VS Code-style workbench: resizable Explorer sidebar, tabbed CodeMirror 5 editor
                    with git diff gutter, Source Control panel, split terminals, and a
                    File / Edit / View / Terminal / Help menu bar.
                </div>
            </div>`,
    });
}

// ── Page-level unsaved-changes guard ────────────────────────────────────
// The close guard below only covers in-SPA window closes. A page unload
// (browser refresh / tab close, the server-restart auto-refresh, the JWT-401
// reload in core/api.js) would otherwise discard dirty edits silently.
window.addEventListener('beforeunload', (e) => {
    for (const el of document.querySelectorAll('.ed-content, .ed-editor-pane')) {
        const st = _states.get(el);
        if (st && st.dirty && !st.binary) {
            e.preventDefault();
            e.returnValue = ''; // required for the browser to show the dialog
            return;
        }
    }
});

// ── Window close guard ─────────────────────────────────────────────────────
registerCloseGuard('editor', (winEl) => {
    const containers = [winEl.querySelector('.ed-content'),
        ...winEl.querySelectorAll('.ed-editor-pane')].filter(Boolean);
    let dirtyPair = null;
    for (const c of containers) {
        const st = _states.get(c);
        if (st && st.dirty && !st.binary) { dirtyPair = [c, st]; break; }
    }
    if (dirtyPair) {
        const [c, st] = dirtyPair;
        _askUnsavedChanges(c, st, () => { winEl.querySelector('.close-btn')?.click(); });
        return false;
    }
    for (const c of containers) {
        const st = _states.get(c);
        if (!st) continue;
        _releaseEditorState(st);
        _states.delete(c);
    }
    const shell = winEl.querySelector('.ed-shell');
    if (shell) {
        const ts = _termStates.get(shell);
        if (ts) _disposeTermState(ts);
        // Detach window-level listeners registered by editor init (menubar,
        // shortcuts, terminal toggle, sidebar resize) — they outlive the DOM.
        _disposeShellCleanups(shell);
    }
    return true;
});

// ── Package entry point ───────────────────────────────────────────────────────
export async function render(container, ctx) {
    _ctx = ctx;
    _ensureStyles();
    while (_pendingGuards.length) ctx.windows.registerCloseGuard(_windowId(), _pendingGuards.shift());
    ctx.log('info', 'Code Editor opened');
    // File Station / the desktop hand a path over via `window.__fmEditorCtx`,
    // which renderEditor() consumes and clears itself.
    renderEditor(container);
}

// The core cannot import this module, so it calls back through this global to
// focus/reuse an open editor instead of spawning windows blindly.
window.__ethosEditorOpen = (path) => openEditorForPath(path);
