// EthOS native package UI — EthOS AntiVirus
// Contract: export function render(container, ctx). All service calls go through
// ctx.proxy(), so the ClamAV container stays bound to loopback only.

const STYLE = `
.av-root {
    --av-bg: #08111d;
    --av-panel: rgba(148, 163, 184, 0.07);
    --av-border: rgba(148, 163, 184, 0.22);
    --av-text: #e2e8f0;
    --av-muted: #94a3b8;
    --av-accent: #38bdf8;
    --av-green: #4ade80;
    --av-red: #f87171;
    height: 100%;
    overflow: auto;
    box-sizing: border-box;
    padding: 28px;
    background:
        radial-gradient(circle at 10% 5%, rgba(56, 189, 248, 0.16), transparent 42%),
        radial-gradient(circle at 90% 95%, rgba(74, 222, 128, 0.10), transparent 42%),
        var(--av-bg);
    color: var(--av-text);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
.av-card {
    width: min(860px, 100%);
    margin: 0 auto;
    padding: 28px;
    border: 1px solid var(--av-border);
    border-radius: 22px;
    background: var(--av-panel);
}
.av-head { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 24px; }
.av-shield { font-size: 40px; line-height: 1; }
.av-head-main { flex: 1; min-width: 0; }
.av-root h1 { margin: 0 0 6px; font-size: clamp(26px, 5vw, 36px); letter-spacing: -0.03em; }
.av-lead { margin: 0; color: var(--av-muted); font-size: 13px; line-height: 1.55; }
.av-pill { flex: none; padding: 7px 12px; border-radius: 999px; font-size: 11px; font-weight: 700; border: 1px solid var(--av-border); white-space: nowrap; }
.av-pill.ready { color: var(--av-green); border-color: rgba(74, 222, 128, 0.45); background: rgba(74, 222, 128, 0.10); }
.av-pill.starting { color: #fbbf24; border-color: rgba(251, 191, 36, 0.45); background: rgba(251, 191, 36, 0.10); }
.av-pill.offline { color: var(--av-red); border-color: rgba(248, 113, 113, 0.45); background: rgba(248, 113, 113, 0.10); }
.av-scanbox { padding: 18px; border: 1px solid var(--av-border); border-radius: 14px; background: rgba(15, 23, 42, 0.35); }
.av-label { display: block; margin-bottom: 8px; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--av-muted); }
.av-row { display: flex; gap: 10px; }
.av-input {
    flex: 1; min-width: 0; padding: 11px 12px;
    border: 1px solid var(--av-border); border-radius: 10px;
    background: rgba(2, 6, 23, 0.55); color: var(--av-text);
    font: 13px ui-monospace, SFMono-Regular, Menlo, monospace;
}
.av-input:focus-visible, .av-btn:focus-visible { outline: 2px solid var(--av-accent); outline-offset: 2px; }
.av-btn {
    padding: 9px 15px; border: 1px solid var(--av-border); border-radius: 10px;
    background: rgba(15, 23, 42, 0.65); color: var(--av-text);
    font-size: 12px; font-weight: 600; cursor: pointer;
}
.av-btn:hover:not(:disabled) { border-color: var(--av-accent); }
.av-btn:disabled { opacity: 0.55; cursor: wait; }
.av-btn.primary { border-color: rgba(56, 189, 248, 0.55); background: rgba(56, 189, 248, 0.14); }
.av-hint { margin: 10px 0 0; color: var(--av-muted); font-size: 11px; line-height: 1.5; }
.av-root code { color: var(--av-accent); }
.av-chips { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; }
.av-chips button { padding: 5px 10px; font: 11px ui-monospace, monospace; }
.av-status { min-height: 20px; margin: 18px 0; color: var(--av-accent); font-size: 13px; font-weight: 600; }
.av-startup { margin: -6px 0 18px; padding: 10px 12px; border: 1px solid rgba(251, 191, 36, 0.3); border-radius: 10px; background: rgba(251, 191, 36, 0.08); color: var(--av-muted); font-size: 12px; line-height: 1.55; }
.av-results { border-top: 1px solid var(--av-border); padding-top: 18px; }
.av-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 18px; }
.av-summary div { padding: 12px; border: 1px solid var(--av-border); border-radius: 10px; background: rgba(15, 23, 42, 0.35); }
.av-summary span { display: block; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--av-muted); margin-bottom: 4px; }
.av-summary strong { font-size: 22px; font-variant-numeric: tabular-nums; }
.av-danger { color: var(--av-red); }
.av-root h2 { margin: 0 0 10px; font-size: 14px; }
.av-threats { margin-bottom: 16px; }
.av-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.av-table th, .av-table td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--av-border); }
.av-table th { color: var(--av-muted); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; }
.av-table td:first-child { font-family: ui-monospace, monospace; word-break: break-all; }
.av-table td:last-child { color: var(--av-red); white-space: nowrap; }
.av-errors ul { margin: 0; padding-left: 18px; color: #fbbf24; font-size: 12px; line-height: 1.6; }
.av-engine { margin: 0; color: var(--av-muted); font-size: 11px; }
.av-foot { display: flex; gap: 12px; flex-wrap: wrap; justify-content: space-between; margin-top: 22px; padding-top: 14px; border-top: 1px solid var(--av-border); color: var(--av-muted); font-size: 11px; }
.av-warn { color: #fbbf24; }
@media (max-width: 620px) { .av-root { padding: 14px; } .av-card { padding: 20px; } .av-head { flex-wrap: wrap; } .av-row { flex-direction: column; } .av-summary { grid-template-columns: 1fr; } }
`;

export function render(container, ctx) {
    container.replaceChildren();
    const style = document.createElement('style');
    style.textContent = STYLE;
    const root = document.createElement('div');
    root.className = 'av-root';
    root.innerHTML = `
        <div class="av-card">
            <div class="av-head">
                <div class="av-shield" aria-hidden="true">🛡️</div>
                <div class="av-head-main">
                    <h1>EthOS AntiVirus</h1>
                    <p class="av-lead">On-demand ClamAV scans for your NAS shares. Read-only: files are never modified.</p>
                </div>
                <span class="av-pill starting" role="status" aria-live="polite" data-health>Connecting…</span>
            </div>
            <section class="av-scanbox">
                <label class="av-label" for="av-path">Folder or file to scan</label>
                <div class="av-row">
                    <input id="av-path" class="av-input" type="text" value="/home" spellcheck="false">
                    <button class="av-btn primary" type="button" data-scan disabled>Scan now</button>
                </div>
                <p class="av-hint">Allowed roots: <code>/home</code>, <code>/mnt</code>, <code>/media</code>. Start with a subfolder for a faster first scan.</p>
                <div class="av-chips" aria-label="Quick paths">
                    <button class="av-btn" type="button" data-path="/home">/home</button>
                    <button class="av-btn" type="button" data-path="/mnt">/mnt</button>
                    <button class="av-btn" type="button" data-path="/media">/media</button>
                </div>
            </section>
            <p class="av-status" role="status" aria-live="polite" data-status>Ready.</p>
            <p class="av-startup" data-startup>First start downloads the ClamAV signature database. This can take a few minutes; the status retries automatically.</p>
            <section class="av-results" data-results hidden>
                <div class="av-summary">
                    <div><span>Clean files</span><strong data-clean>0</strong></div>
                    <div><span>Threats</span><strong class="av-danger" data-threats>0</strong></div>
                    <div><span>Errors</span><strong data-errors>0</strong></div>
                </div>
                <div class="av-threats" data-threat-box hidden>
                    <h2>Detected threats</h2>
                    <table class="av-table">
                        <thead><tr><th>File</th><th>Signature</th></tr></thead>
                        <tbody data-threat-rows></tbody>
                    </table>
                </div>
                <div class="av-errors" data-error-box hidden>
                    <h2>Scan errors</h2>
                    <ul data-error-rows></ul>
                </div>
                <p class="av-engine" data-engine></p>
            </section>
            <div class="av-foot">
                <span>Native EthOS package UI · v${String(ctx?.pkg?.version || '2.0.0')}</span>
                <span class="av-warn">Admin-only scan panel. Signatures update on container start.</span>
            </div>
        </div>`;
    container.append(style, root);

    const healthEl = root.querySelector('[data-health]');
    const statusEl = root.querySelector('[data-status]');
    const pathEl = root.querySelector('#av-path');
    const scanBtn = root.querySelector('[data-scan]');
    const results = root.querySelector('[data-results]');
    const cleanEl = root.querySelector('[data-clean]');
    const threatEl = root.querySelector('[data-threats]');
    const errorEl = root.querySelector('[data-errors]');
    const threatBox = root.querySelector('[data-threat-box]');
    const threatRows = root.querySelector('[data-threat-rows]');
    const errorBox = root.querySelector('[data-error-box]');
    const errorRows = root.querySelector('[data-error-rows]');
    const engineEl = root.querySelector('[data-engine]');
    const startupEl = root.querySelector('[data-startup]');
    let ready = false;
    let scanning = false;

    async function checkHealth() {
        try {
            const data = await ctx.proxy('api/health');
            if (data.status === 'ready') {
                if (!ready && !scanning) statusEl.textContent = 'Ready.';
                ready = true;
                healthEl.className = 'av-pill ready';
                healthEl.textContent = 'Scanner ready';
                healthEl.title = data.engine || '';
                engineEl.textContent = data.engine || '';
                startupEl.hidden = true;
            } else {
                ready = false;
                healthEl.className = 'av-pill starting';
                healthEl.textContent = 'Starting scanner…';
                startupEl.hidden = false;
                if (!scanning) statusEl.textContent = 'ClamAV is starting. The first run downloads signatures and can take a few minutes.';
            }
        } catch (err) {
            ready = false;
            healthEl.className = 'av-pill offline';
            healthEl.textContent = 'Scanner offline';
            startupEl.hidden = false;
            if (!scanning) statusEl.textContent = `Waiting for the scanner: ${err?.detail || err?.message || err}`;
        }
        scanBtn.disabled = scanning || !ready;
    }

    function renderResults(data) {
        cleanEl.textContent = String(data.clean || 0);
        threatEl.textContent = String((data.infected || []).length);
        errorEl.textContent = String((data.errors || []).length);
        results.hidden = false;
        threatBox.hidden = !(data.infected || []).length;
        threatRows.replaceChildren(...(data.infected || []).map((item) => {
            const row = document.createElement('tr');
            const file = document.createElement('td');
            file.textContent = item.file;
            const signature = document.createElement('td');
            signature.textContent = item.signature;
            row.append(file, signature);
            return row;
        }));
        errorBox.hidden = !(data.errors || []).length;
        errorRows.replaceChildren(...(data.errors || []).map((item) => {
            const entry = document.createElement('li');
            entry.textContent = item;
            return entry;
        }));
        engineEl.textContent = data.engine || '';
    }

    async function scan() {
        if (scanning || !ready) return;
        scanning = true;
        scanBtn.disabled = true;
        statusEl.textContent = `Scanning ${pathEl.value}… this can take a while.`;
        try {
            const data = await ctx.proxy('api/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: pathEl.value }),
            });
            renderResults(data);
            const threats = (data.infected || []).length;
            statusEl.textContent = threats
                ? `Scan finished: ${threats} threat${threats === 1 ? '' : 's'} found.`
                : `Scan finished: ${data.clean || 0} clean file${data.clean === 1 ? '' : 's'} checked.`;
            if (threats && typeof ctx.notify === 'function') {
                ctx.notify(`AntiVirus: ${threats} threat${threats === 1 ? '' : 's'} found`, 'error');
            }
        } catch (err) {
            statusEl.textContent = `Scan failed: ${err?.detail || err?.message || err}`;
        } finally {
            scanning = false;
            scanBtn.disabled = !ready;
        }
    }

    scanBtn.addEventListener('click', scan);
    pathEl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') scan();
    });
    root.querySelectorAll('[data-path]').forEach((button) => {
        button.addEventListener('click', () => {
            pathEl.value = button.dataset.path;
            pathEl.focus();
        });
    });

    checkHealth();
    const timer = setInterval(checkHealth, 5000);
    const observer = new MutationObserver(() => {
        if (!document.body.contains(root)) {
            clearInterval(timer);
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
}
