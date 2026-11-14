---
name: package-ui
description: "Build or restyle an EthOS Package Center app window. Use for new native packages, UI redesigns, or when a package does not look like AntiVirus / Backup Manager."
argument-hint: "Which package window needs the shared shell?"
---

# Shared package window shell

Package Center is one product. Every native package window must look and behave like the reference
implementations — **`backup-manager/frontend/app.js`** (newest) and
**`ethos-antivirus/frontend/app.js`** (canonical). `domains` and `vmm` follow the same shell.

Do not invent a second visual language: same rail width, same tokens, same panels, same table and
button sizes. Only the content and the product emoji change.

## Contract

| Part | Rule |
|---|---|
| `ui.mode` | `native` (files-only module, `export function render(container, ctx)`) |
| Theme | Light palette on the root; `:root.dark .<prefix>-root` overrides. `color-scheme` in both. |
| Rail | `flex:none; width:218px; padding:20px 14px; border-right:1px solid var(--border); overflow-y:auto` |
| Brand | 26 px emoji + human product name + `EthOS package` / version line |
| Nav | Text-only buttons, 12 px / 600, `padding:9px 11px`, `border-radius:9px`, active `.is-active` |
| Foot | `margin-top:auto`; status pill (`ready` / `starting` / `offline`) + one short note |
| Main | `flex:1; min-width:0; overflow-y:auto; padding:24px 28px 32px` |
| Header | `<h1>` `clamp(22px, 3.4vw, 30px)`; 12 px muted subtitle; one `role="status"` line |
| Views | `display:flex; flex-direction:column; gap:14px; margin-top:16px` |
| Responsive | ≤780 px: rail becomes a horizontal strip, foot note hides, grids collapse to one column |
| Progress | `ctx.progress.startTask(...).update(...)/.finish(...)`; never a hand-rolled progress bar |
| Dialogs | `ctx.modal.confirm/alert/form`; never a second modal implementation |

## Skeleton

Copy this and replace `<prefix>`/`<Product>`; keep the class names and values identical.

### Tokens

```css
.<prefix>-root {
    color-scheme: light;
    --pkg-bg: #eef2f7;
    --pkg-side-bg: rgba(255, 255, 255, 0.88);
    --pkg-panel: #ffffff;
    --pkg-surface: #f4f5f7;
    --pkg-input-bg: #ffffff;
    --pkg-border: #e3e5e8;
    --pkg-text: #1f2430;
    --pkg-muted: #5b6472;
    --pkg-accent: #2563eb;
    --pkg-accent-soft: rgba(37, 99, 235, 0.10);
    --pkg-accent-border: rgba(37, 99, 235, 0.45);
    --pkg-green: #15803d;
    --pkg-green-soft: rgba(21, 128, 61, 0.12);
    --pkg-green-border: rgba(21, 128, 61, 0.35);
    --pkg-red: #b91c1c;
    --pkg-red-soft: rgba(185, 28, 28, 0.08);
    --pkg-red-border: rgba(185, 28, 28, 0.32);
    --pkg-amber: #b45309;
    --pkg-amber-soft: rgba(180, 83, 9, 0.10);
    --pkg-amber-border: rgba(180, 83, 9, 0.30);
    --pkg-hover: rgba(15, 23, 42, 0.06);
    display: flex;
    height: 100%;
    overflow: hidden;
    background:
        radial-gradient(circle at 8% 4%, var(--pkg-glow-1, rgba(37, 99, 235, 0.08)), transparent 40%),
        radial-gradient(circle at 92% 96%, var(--pkg-glow-2, rgba(21, 128, 61, 0.06)), transparent 40%),
        var(--pkg-bg);
    color: var(--pkg-text);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
:root.dark .<prefix>-root {
    color-scheme: dark;
    --pkg-bg: #08111d;
    --pkg-side-bg: rgba(2, 6, 23, 0.45);
    --pkg-panel: rgba(148, 163, 184, 0.07);
    --pkg-surface: rgba(15, 23, 42, 0.45);
    --pkg-input-bg: rgba(2, 6, 23, 0.55);
    --pkg-border: rgba(148, 163, 184, 0.22);
    --pkg-text: #e2e8f0;
    --pkg-muted: #94a3b8;
    --pkg-accent: #38bdf8;
    --pkg-accent-soft: rgba(56, 189, 248, 0.14);
    --pkg-accent-border: rgba(56, 189, 248, 0.55);
    --pkg-green: #4ade80;
    --pkg-green-soft: rgba(74, 222, 128, 0.14);
    --pkg-green-border: rgba(74, 222, 128, 0.45);
    --pkg-red: #f87171;
    --pkg-red-soft: rgba(248, 113, 113, 0.12);
    --pkg-red-border: rgba(248, 113, 113, 0.45);
    --pkg-amber: #fbbf24;
    --pkg-amber-soft: rgba(251, 191, 36, 0.10);
    --pkg-amber-border: rgba(251, 191, 36, 0.45);
    --pkg-hover: rgba(148, 163, 184, 0.09);
}
```

### Markup

```html
<div class="<prefix>-root">
  <aside class="<prefix>-side">
    <div class="<prefix>-brand">
      <span class="<prefix>-brand-icon" aria-hidden="true">🧩</span>
      <div><strong>Product name</strong><small>EthOS package</small></div>
    </div>
    <nav class="<prefix>-nav" aria-label="Product sections">
      <button class="<prefix>-nav-item is-active" type="button">Overview</button>
      <!-- one text-only button per section -->
    </nav>
    <div class="<prefix>-side-foot">
      <span class="<prefix>-pill starting" role="status" aria-live="polite">Connecting…</span>
      <span class="<prefix>-side-note">One short sentence about the data.</span>
    </div>
  </aside>
  <main class="<prefix>-main">
    <header>
      <h1>Overview</h1>
      <p class="<prefix>-page-sub">One-line description.</p>
      <p class="<prefix>-status" role="status" aria-live="polite">Ready.</p>
    </header>
    <div class="<prefix>-view">
      <section class="<prefix>-panel"> … </section>
    </div>
  </main>
</div>
```

## Required class inventory

Use these names (prefix them consistently, e.g. `bm-`, `av-`, `dm-`, `vm-`). Values are part of the
contract, not suggestions.

| Class | Purpose / key values |
|---|---|
| `.sidebar` family | `218px`, `20px 14px`, `border-right`, brand/nav/foot |
| `.nav-item` | `padding:9px 11px`, `radius 9px`, `12px/600`, `.is-active` = accent-soft |
| `.pill` | `5px 10px`, `radius 999px`, `10px/700`; tones `ready/starting/offline` |
| `.status` | `min-height:18px`, `12px/600`, accent; `.error` red, `.warn` amber |
| `.panel` | `padding:17px 18px`, `radius 15px`, `border 1px`, panel background |
| `.summary` | 4 equal tiles; `9px` uppercase labels, `20px` tabular values |
| `.toolbar` | title block left, `.row` of `.btn`s right, wraps |
| `.table` | `11px`; `8px 9px` cells; `9px` uppercase headers; `.path` mono, `.num` right, `.actions` right |
| `.btn` | `8px 13px`, `radius 9px`, `11px/600`; `.primary`, `.danger`, `.small` (`4px 9px`, `10px`) |
| `.input` | `9px 11px`, `radius 9px`, `12px` monospace |
| `.field` | label uppercase `10px`; 6 px gap; `.fields` 2-column grid, `.full` spans |
| `.tag` | `3px 8px`, `radius 999px`, `10px` mono; `is-ok/is-bad/is-warn/is-info` |
| `.empty` | dashed border, `24px` padding, centered `11px` muted |
| `.startup` | amber callout (`9px 11px`, `radius 9px`); `.error` red, `.info` blue |
| `.def-grid` | auto-fit cards (label + value) for read-only facts |
| `.form-actions` | right-aligned buttons, top border |

## Definition of done

- [ ] Native module renders with no iframe and no page errors.
- [ ] Rail is 218 px, text-only nav, active item, status pill + note in the foot.
- [ ] Content uses panels/summary/tables/tags; no custom cards with different radii or fonts.
- [ ] Long actions use `ctx.progress`; confirms use `ctx.modal`.
- [ ] Light **and** dark screenshots match AntiVirus/Backup Manager.
- [ ] ≤780 px renders as a horizontal strip with one-column grids.
- [ ] Every interactive element has a `data-testid` (or a stable action attribute) for tests.
- [ ] Version + changelog bumped; `ethos-pack build/sign/verify` passes.

## Do not

- Do not hard-code surface/text colours outside the token block.
- Do not use teal/purple gradients, glassmorphism, or a different accent.
- Do not add a second progress component or modal system.
- Do not put emoji icons in the nav (brand emoji only).
- Do not copy another package's *content*; copy only the layout and tokens.

## Legacy exceptions

`ethos-welcome` (static welcome page) and `tic-tac-toe` (single-card game) predate the shell and may
keep their layout. Any **new** native package or redesign must follow this skill; do not extend the
exception.
