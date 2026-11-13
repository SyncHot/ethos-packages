---
name: package-theme
description: "Give an EthOS package UI light and dark themes. Use for new packages, theme bugs (white-on-white, dark-only panels), or when a package ignores the EthOS appearance toggle."
argument-hint: "Which package needs light/dark support?"
---

# Package light & dark themes

Every EthOS package UI must look correct in **both** themes. EthOS never runs OS-only dark mode:
at startup it sets `class="light"` or `class="dark"` on `<html>` and persists the choice in
`localStorage['ethos-theme']`; the topbar toggle flips the class at runtime.

## Contract by UI mode

| `ui.mode` | How the package learns the theme | What it must do |
|---|---|---|
| `native` (module rendered in the EthOS document) | `<html class="dark">` / `<html class="light">` | Define light defaults + `:root.dark` overrides; react to runtime toggles if JS reads colours |
| `window` / `port` (iframe or new tab) | `?theme=light\|dark` appended by EthOS, plus `prefers-color-scheme` as fallback | Apply `data-theme` from the query param; without it, follow the OS preference |

Native modules never get a query string — reading `location.search` there is meaningless.
Port UIs never see the EthOS `<html>` class (different document) — reading `document.documentElement`
there is meaningless.

## Canonical CSS

Scope every variable to the package root, not `:root`, because native modules inject a global
`<style>` into the EthOS document. Light is the base palette; dark overrides it.

```css
.pkg-root {
    color-scheme: light;                 /* native inputs/scrollbars follow the theme */
    --pkg-bg: #eef2f7;
    --pkg-surface: #ffffff;
    --pkg-surface-2: #f4f5f7;
    --pkg-border: #e3e5e8;
    --pkg-text: #1f2430;                 /* ≥ 12:1 on #ffffff */
    --pkg-muted: #5b6472;                /* ≥ 4.5:1 on #ffffff */
    --pkg-accent: #2563eb;               /* 5.17:1 with white text */
    --pkg-accent-soft: rgba(37, 99, 235, 0.10);
    background: var(--pkg-bg);
    color: var(--pkg-text);
}
:root.dark .pkg-root {
    color-scheme: dark;
    --pkg-bg: #0a0f1e;
    --pkg-surface: #111827;
    --pkg-surface-2: #1a2332;
    --pkg-border: rgba(255, 255, 255, 0.08);
    --pkg-text: #e2e8f0;
    --pkg-muted: #8b98a9;                /* ≥ 5.3:1 on #1a2332 */
    --pkg-accent: #60a5fa;
    --pkg-accent-soft: rgba(96, 165, 250, 0.16);
}
```

Rules:

- **No raw colours in component rules.** Backgrounds, borders, text and states use variables.
  Hard-coded `#0b1220`, `rgba(15,23,42,…)` or `color:#fff` is how a package ends up dark-only.
- Set `color-scheme` in both palettes so native controls, scrollbars and date/time pickers match.
- Light mode is the default (matching EthOS). Never rely on `prefers-color-scheme` in native modules.
- Contrast: body/secondary text ≥ 4.5:1, large text ≥ 3:1, focus rings visible on both surfaces.
- Translucency and glow gradients need a lighter variant in light mode; dark radials over a white
  background look like dirt. Put them in variables too (`--pkg-glow-1`, `--pkg-glow-2`).

## Native modules: react to runtime toggles

CSS variables update automatically when `<html>` gains/loses `dark`. JS only needs an observer when
it computes colours itself (canvas, charts, embedded terminals/editors):

```js
const themeObserver = new MutationObserver(() => {
    if (!document.body.contains(root)) { themeObserver.disconnect(); return; }
    chart.setOptions({ theme: isDark() ? 'dark' : 'light' });
});
themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
```

## Port/iframe UIs

```js
const requested = new URLSearchParams(location.search).get('theme');
if (requested === 'dark' || requested === 'light') {
    document.documentElement.dataset.theme = requested;
}
```

```css
:root { color-scheme: light; --bg: #eef2f7; /* … */ }
:root[data-theme="dark"] { color-scheme: dark; --bg: #0a0f1e; /* … */ }
@media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) { color-scheme: dark; --bg: #0a0f1e; /* … */ }
}
```

EthOS appends `?theme=` to package iframe URLs and reloads the frame when the toggle changes.

## Checklist before you ship

1. Open the package window in **light** and **dark** (topbar toggle) and screenshot both.
2. Every panel, table, input, button, chip, badge and empty state is legible — no white-on-white,
   no dark panels on a light window.
3. Focus rings and disabled states are visible in both themes.
4. The package root itself paints the theme background (the EthOS window body is transparent).
5. Port UIs: `?theme=light`, `?theme=dark` and no param (OS fallback) all render correctly.
6. Bump `version`, prepend the changelog (`"2.1.1: light and dark themes."`), rebuild/sign/verify.

## Common failures

| Symptom | Cause |
|---|---|
| Package stays dark after toggling | Palette hard-coded on `.pkg-root` with no `:root.dark` overrides |
| White text on white window | Text colour hard-coded for dark mode |
| Sidebar/panel still dark in light mode | `background: rgba(2,6,23,…)` outside the variable block |
| Inputs/scrollbars don't match | Missing `color-scheme` |
| Iframe ignores the toggle | Page never reads `?theme=`; EthOS host reloads the frame on switch |
