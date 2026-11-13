// EthOS native package UI — Domains
// Contract: export function render(container, ctx). Every service call goes
// through ctx.proxy(), so the control plane stays bound to loopback.
//
// Caddy does the proxying and the certificates; this window is the control
// plane: routes (domain -> host:port), ACME settings and diagnostics.

const STYLE = `
.dom-root {
    color-scheme: light;
    --dom-bg: #eef2f7;
    --dom-surface: #ffffff;
    --dom-surface-2: #f4f6fa;
    --dom-border: #d8dee9;
    --dom-text: #101828;
    --dom-muted: #667085;
    --dom-accent: #2563eb;
    --dom-accent-soft: #dbeafe;
    --dom-ok: #047857;
    --dom-ok-soft: #d1fae5;
    --dom-warn: #b45309;
    --dom-warn-soft: #fef3c7;
    --dom-danger: #b91c1c;
    --dom-danger-soft: #fee2e2;
    background: var(--dom-bg);
    color: var(--dom-text);
    font: 13px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    height: 100%;
    overflow: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
}
:root.dark .dom-root {
    color-scheme: dark;
    --dom-bg: #0b1220;
    --dom-surface: #131c2e;
    --dom-surface-2: #1a2438;
    --dom-border: #26314a;
    --dom-text: #e6ebf5;
    --dom-muted: #93a0b8;
    --dom-accent: #60a5fa;
    --dom-accent-soft: #1e3a6f;
    --dom-ok: #34d399;
    --dom-ok-soft: #0f3d31;
    --dom-warn: #fbbf24;
    --dom-warn-soft: #4a3410;
    --dom-danger: #f87171;
    --dom-danger-soft: #4a1d1d;
}
.dom-root * { box-sizing: border-box; }
.dom-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.dom-title { margin: 0; font-size: 18px; font-weight: 700; }
.dom-sub { margin: 2px 0 0; font-size: 12px; color: var(--dom-muted); }
.dom-pills { display: flex; gap: 6px; flex-wrap: wrap; }
.dom-pill { font-size: 11px; padding: 3px 9px; border-radius: 999px; border: 1px solid var(--dom-border); background: var(--dom-surface); color: var(--dom-muted); white-space: nowrap; }
.dom-pill.ok { background: var(--dom-ok-soft); color: var(--dom-ok); border-color: transparent; }
.dom-pill.warn { background: var(--dom-warn-soft); color: var(--dom-warn); border-color: transparent; }
.dom-pill.bad { background: var(--dom-danger-soft); color: var(--dom-danger); border-color: transparent; }
.dom-banner { border-radius: 10px; padding: 10px 12px; font-size: 12px; line-height: 1.55; border: 1px solid var(--dom-border); background: var(--dom-surface); }
.dom-banner.error { background: var(--dom-danger-soft); color: var(--dom-danger); border-color: transparent; }
.dom-banner.warn { background: var(--dom-warn-soft); color: var(--dom-warn); border-color: transparent; }
.dom-banner[hidden] { display: none; }
.dom-card { background: var(--dom-surface); border: 1px solid var(--dom-border); border-radius: 12px; padding: 14px; }
.dom-card-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
.dom-card h2 { margin: 0; font-size: 13px; font-weight: 700; letter-spacing: .02em; text-transform: uppercase; color: var(--dom-muted); }
.dom-btn { font: inherit; font-size: 12px; border-radius: 8px; border: 1px solid var(--dom-border); background: var(--dom-surface-2); color: var(--dom-text); padding: 6px 11px; cursor: pointer; }
.dom-btn:hover { border-color: var(--dom-accent); }
.dom-btn.primary { background: var(--dom-accent); border-color: var(--dom-accent); color: #fff; font-weight: 600; }
.dom-btn.danger { color: var(--dom-danger); }
.dom-btn.danger.armed { background: var(--dom-danger); border-color: var(--dom-danger); color: #fff; }
.dom-btn.link { background: none; border: none; color: var(--dom-accent); padding: 4px 6px; }
.dom-btn[disabled] { opacity: .5; cursor: not-allowed; }
.dom-table { width: 100%; border-collapse: collapse; }
.dom-table th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .03em; color: var(--dom-muted); font-weight: 600; padding: 0 8px 6px; border-bottom: 1px solid var(--dom-border); }
.dom-table td { padding: 9px 8px; border-bottom: 1px solid var(--dom-border); vertical-align: middle; }
.dom-table tr:last-child td { border-bottom: none; }
.dom-domain { font-weight: 600; word-break: break-all; }
.dom-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; word-break: break-all; }
.dom-muted { color: var(--dom-muted); }
.dom-row-actions { display: flex; gap: 4px; justify-content: flex-end; flex-wrap: wrap; }
.dom-empty { padding: 18px 8px; text-align: center; color: var(--dom-muted); font-size: 12px; }
.dom-form { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); background: var(--dom-surface-2); border: 1px solid var(--dom-border); border-radius: 10px; padding: 12px; margin-bottom: 12px; }
.dom-form[hidden] { display: none; }
.dom-field { display: flex; flex-direction: column; gap: 4px; }
.dom-field.full { grid-column: 1 / -1; }
.dom-field label { font-size: 11px; font-weight: 600; color: var(--dom-muted); text-transform: uppercase; letter-spacing: .03em; }
.dom-input { font: inherit; font-size: 13px; padding: 7px 9px; border-radius: 8px; border: 1px solid var(--dom-border); background: var(--dom-surface); color: var(--dom-text); }
.dom-input:focus { outline: 2px solid var(--dom-accent-soft); border-color: var(--dom-accent); }
.dom-checks { display: flex; gap: 16px; flex-wrap: wrap; font-size: 12px; }
.dom-checks label { display: flex; gap: 6px; align-items: center; text-transform: none; letter-spacing: 0; font-weight: 500; color: var(--dom-text); }
.dom-form-actions { grid-column: 1 / -1; display: flex; gap: 8px; justify-content: flex-end; }
.dom-pre { margin: 8px 0 0; padding: 10px; border-radius: 10px; background: var(--dom-surface-2); border: 1px solid var(--dom-border); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; line-height: 1.55; max-height: 220px; overflow: auto; white-space: pre-wrap; word-break: break-word; }
.dom-hint { font-size: 11px; color: var(--dom-muted); }
.dom-error { font-size: 12px; color: var(--dom-danger); min-height: 16px; }
.dom-toggle { width: 34px; height: 18px; accent-color: var(--dom-accent); cursor: pointer; }
`;

function esc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function daysLabel(days) {
    if (days === null || days === undefined) return 'expiry unknown';
    if (days < 0) return 'expired';
    if (days === 0) return 'expires today';
    return `${days} day${days === 1 ? '' : 's'} left`;
}

export function render(container, ctx) {
    container.replaceChildren();

    const style = document.createElement('style');
    style.textContent = STYLE;
    const root = document.createElement('div');
    root.className = 'dom-root';
    root.innerHTML = `
        <div class="dom-head">
            <div>
                <h1 class="dom-title">Domains</h1>
                <p class="dom-sub">Point a domain here and forward it to any host and port. Certificates are issued and renewed automatically.</p>
            </div>
            <div class="dom-pills">
                <span class="dom-pill" data-testid="dom-pill-proxy">Proxy …</span>
                <span class="dom-pill" data-testid="dom-pill-certs">Certificates …</span>
            </div>
        </div>
        <div class="dom-banner" data-testid="dom-banner" hidden></div>

        <section class="dom-card">
            <div class="dom-card-head">
                <h2>Routes</h2>
                <button class="dom-btn primary" data-testid="dom-add-route" id="dom-add">+ Add domain</button>
            </div>
            <form class="dom-form" id="dom-form" hidden data-testid="dom-route-form">
                <div class="dom-field">
                    <label for="dom-f-domains">Domain(s)</label>
                    <input class="dom-input" id="dom-f-domains" name="domains" placeholder="app.example.com" autocomplete="off">
                    <span class="dom-hint">Comma separated. Each name needs a DNS record pointing here.</span>
                </div>
                <div class="dom-field">
                    <label for="dom-f-upstream">Forward to</label>
                    <input class="dom-input" id="dom-f-upstream" name="upstream" placeholder="192.168.1.10:8080" autocomplete="off">
                    <span class="dom-hint">host:port · <button type="button" class="dom-btn link" id="dom-ethos">use this NAS</button></span>
                </div>
                <div class="dom-field">
                    <label for="dom-f-redirect">Redirect instead (optional)</label>
                    <input class="dom-input" id="dom-f-redirect" name="redirect_to" placeholder="https://example.com" autocomplete="off">
                    <span class="dom-hint">Returns a permanent redirect instead of proxying; leave the target above empty.</span>
                </div>
                <div class="dom-field full">
                    <label for="dom-f-note">Label (optional)</label>
                    <input class="dom-input" id="dom-f-note" name="note" placeholder="Home Assistant" autocomplete="off">
                </div>
                <div class="dom-field full">
                    <label for="dom-f-headers">Extra response headers (one per line)</label>
                    <textarea class="dom-input" id="dom-f-headers" name="headers" rows="3" placeholder="Strict-Transport-Security: max-age=63072000; includeSubDomains"></textarea>
                    <span class="dom-hint">Name: value pairs, applied to every response of this route.</span>
                </div>
                <div class="dom-field full">
                    <div class="dom-checks">
                        <label><input type="checkbox" name="preserve_host" checked> Keep the original Host header</label>
                        <label><input type="checkbox" name="stream"> Low-latency streaming (SSE, live logs)</label>
                        <label><input type="checkbox" name="enabled" checked> Enabled</label>
                    </div>
                </div>
                <div class="dom-error" id="dom-form-error" data-testid="dom-form-error"></div>
                <div class="dom-form-actions">
                    <button type="button" class="dom-btn" id="dom-cancel">Cancel</button>
                    <button type="submit" class="dom-btn primary" data-testid="dom-save-route">Save route</button>
                </div>
            </form>
            <div id="dom-routes"></div>
        </section>

        <section class="dom-card">
            <div class="dom-card-head"><h2>Certificates</h2><span class="dom-hint" id="dom-cert-note"></span></div>
            <div id="dom-certs"></div>
        </section>

        <section class="dom-card">
            <div class="dom-card-head"><h2>Certificate authority</h2></div>
            <form class="dom-form" id="dom-settings">
                <div class="dom-field">
                    <label for="dom-email">ACME email</label>
                    <input class="dom-input" id="dom-email" name="acme_email" placeholder="you@example.com" autocomplete="off">
                    <span class="dom-hint">Used by Let's Encrypt for expiry notices.</span>
                </div>
                <div class="dom-field">
                    <label>Challenge</label>
                    <div class="dom-checks">
                        <label><input type="checkbox" name="staging"> Use the Let's Encrypt staging CA (testing)</label>
                    </div>
                    <span class="dom-hint">Staging issues untrusted certificates but has no rate limits.</span>
                </div>
                <div class="dom-form-actions">
                    <button type="submit" class="dom-btn primary" data-testid="dom-save-settings">Save settings</button>
                </div>
            </form>
        </section>

        <section class="dom-card">
            <div class="dom-card-head"><h2>Diagnostics</h2><button class="dom-btn" id="dom-apply">Reload proxy</button></div>
            <div class="dom-checks" style="margin-bottom:8px;">
                <input class="dom-input" id="dom-dns-input" placeholder="app.example.com" style="flex:1;min-width:200px;">
                <button class="dom-btn" id="dom-dns-btn">Check DNS</button>
            </div>
            <pre class="dom-pre" id="dom-dns-out" data-testid="dom-dns-out"></pre>
            <div class="dom-checks" style="margin:10px 0 0;justify-content:space-between;">
                <span class="dom-hint">Recent proxy log</span>
                <button class="dom-btn" id="dom-log-btn">Refresh log</button>
            </div>
            <pre class="dom-pre" id="dom-log-out" data-testid="dom-log-out"></pre>
        </section>`;
    container.append(style, root);

    const $ = (selector) => root.querySelector(selector);
    const pillProxy = $('[data-testid="dom-pill-proxy"]');
    const pillCerts = $('[data-testid="dom-pill-certs"]');
    const banner = $('[data-testid="dom-banner"]');
    const routesWrap = $('#dom-routes');
    const certsWrap = $('#dom-certs');
    const form = $('#dom-form');
    const formError = $('#dom-form-error');
    const settingsForm = $('#dom-settings');
    const dnsOut = $('#dom-dns-out');
    const logOut = $('#dom-log-out');

    const state = { data: null, editingId: '', busy: false };

    function notify(message, type) {
        if (typeof ctx.notify === 'function') ctx.notify(message, type);
    }

    function proxyError(err) {
        return (err && (err.detail || err.message)) || 'Request failed';
    }

    async function call(path, body) {
        const options = body === undefined
            ? undefined
            : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
        return ctx.proxy(path, options);
    }

    function showBanner(message, kind) {
        banner.hidden = !message;
        banner.className = `dom-banner ${kind || ''}`;
        banner.textContent = message || '';
    }

    function certFor(domains) {
        const items = (state.data && state.data.certs && state.data.certs.items) || [];
        return items.find((item) => (item.names || []).some((name) => domains.includes(name))) || null;
    }

    function renderRoutes() {
        const routes = (state.data && state.data.routes) || [];
        if (!routes.length) {
            routesWrap.innerHTML = '<div class="dom-empty" data-testid="dom-routes-empty">No routes yet. Add a domain to forward it to this NAS or another device.</div>';
            return;
        }
        routesWrap.innerHTML = `
            <table class="dom-table" data-testid="dom-routes-table">
                <thead><tr><th>Domain</th><th>Forward to</th><th>Certificate</th><th>On</th><th style="text-align:right;">Actions</th></tr></thead>
                <tbody>${routes.map((route) => {
                    const cert = certFor(route.domains || []);
                    const certCell = !cert
                        ? '<span class="dom-pill warn">pending</span>'
                        : `<span class="dom-pill ${(cert.days_left ?? 0) > 14 ? 'ok' : 'warn'}">${esc(daysLabel(cert.days_left))}</span>`;
                    return `<tr data-testid="dom-route-${esc(route.id)}">
                        <td><div class="dom-domain">${esc((route.domains || []).join(', '))}</div>${route.note ? `<div class="dom-hint">${esc(route.note)}</div>` : ''}</td>
                        <td class="dom-mono">${route.redirect_to ? `↪ ${esc(route.redirect_to)}` : esc(route.upstream)}</td>
                        <td>${certCell}</td>
                        <td><input type="checkbox" class="dom-toggle" data-toggle="${esc(route.id)}"${route.enabled ? ' checked' : ''} aria-label="Enabled"></td>
                        <td><div class="dom-row-actions">
                            <button class="dom-btn" data-edit="${esc(route.id)}" data-testid="dom-edit-${esc(route.id)}">Edit</button>
                            <button class="dom-btn danger" data-delete="${esc(route.id)}" data-testid="dom-delete-${esc(route.id)}">Delete</button>
                        </div></td>
                    </tr>`;
                }).join('')}</tbody>
            </table>`;

        routesWrap.querySelectorAll('[data-edit]').forEach((button) => {
            button.addEventListener('click', () => openForm(button.dataset.edit));
        });
        routesWrap.querySelectorAll('[data-delete]').forEach((button) => {
            button.addEventListener('click', () => armDelete(button));
        });
        routesWrap.querySelectorAll('[data-toggle]').forEach((input) => {
            input.addEventListener('change', () => {
                const route = (state.data.routes || []).find((item) => item.id === input.dataset.toggle);
                if (!route) return;
                saveRoute({ ...route, enabled: input.checked }, `Route ${input.checked ? 'enabled' : 'disabled'}`);
            });
        });
    }

    function armDelete(button) {
        if (button.dataset.armed === '1') {
            const route = (state.data.routes || []).find((item) => item.id === button.dataset.delete);
            deleteRoute(button.dataset.delete, route ? (route.domains || []).join(', ') : '');
            return;
        }
        button.dataset.armed = '1';
        button.classList.add('armed');
        button.textContent = 'Confirm delete';
        setTimeout(() => {
            if (!button.isConnected) return;
            button.dataset.armed = '';
            button.classList.remove('armed');
            button.textContent = 'Delete';
        }, 5000);
    }

    function renderCerts() {
        const info = (state.data && state.data.certs) || { ok: false, items: [] };
        $('#dom-cert-note').textContent = info.ok
            ? `${(info.items || []).length} certificate${(info.items || []).length === 1 ? '' : 's'}, renewed automatically about 30 days before expiry`
            : 'certificate storage is not readable';
        if (!info.items || !info.items.length) {
            certsWrap.innerHTML = '<div class="dom-empty">No certificates yet. Caddy requests one as soon as a domain resolves here and ports 80/443 are reachable.</div>';
            return;
        }
        certsWrap.innerHTML = `
            <table class="dom-table" data-testid="dom-certs-table">
                <thead><tr><th>Names</th><th>Issuer</th><th>Expires</th></tr></thead>
                <tbody>${info.items.map((item) => `<tr>
                    <td class="dom-mono">${esc((item.names || []).join(', '))}</td>
                    <td>${esc(item.issuer || 'unknown')}${item.source && /staging/.test(item.source) ? ' <span class="dom-pill warn">staging</span>' : ''}</td>
                    <td>${esc(daysLabel(item.days_left))}<div class="dom-hint">${esc(item.not_after || '')}</div></td>
                </tr>`).join('')}</tbody>
            </table>`;
    }

    function renderPills() {
        const data = state.data || {};
        const alive = !!(data.caddy && data.caddy.reachable);
        pillProxy.textContent = alive ? 'Proxy running' : 'Proxy offline';
        pillProxy.className = `dom-pill ${alive ? 'ok' : 'bad'}`;
        const certsInfo = data.certs || { items: [] };
        const count = (certsInfo.items || []).length;
        const expiring = (certsInfo.items || []).filter((item) => (item.days_left ?? 99) <= 14).length;
        pillCerts.textContent = expiring ? `${count} certs · ${expiring} expiring` : `${count} certificate${count === 1 ? '' : 's'}`;
        pillCerts.className = `dom-pill ${expiring ? 'warn' : 'ok'}`;

        if (!alive) {
            showBanner('The proxy container is not running. Check that ports 80 and 443 are free, then start the package again.', 'error');
        } else if (data.apply && data.apply.error) {
            showBanner(`Last change was rejected: ${data.apply.error}`, 'warn');
        } else {
            showBanner('', '');
        }
    }

    function renderSettings() {
        const settings = (state.data && state.data.settings) || {};
        $('#dom-email').value = settings.acme_email || '';
        settingsForm.querySelector('[name="staging"]').checked = !!settings.staging;
    }

    function openForm(routeId) {
        state.editingId = routeId || '';
        const route = routeId ? (state.data.routes || []).find((item) => item.id === routeId) : null;
        form.hidden = false;
        formError.textContent = '';
        form.querySelector('[name="domains"]').value = route ? (route.domains || []).join(', ') : '';
        form.querySelector('[name="upstream"]').value = route ? route.upstream || '' : '';
        form.querySelector('[name="redirect_to"]').value = route ? route.redirect_to || '' : '';
        form.querySelector('[name="headers"]').value = route ? (route.headers || []).join('\n') : '';
        form.querySelector('[name="note"]').value = route ? route.note || '' : '';
        form.querySelector('[name="preserve_host"]').checked = route ? route.preserve_host !== false : true;
        form.querySelector('[name="stream"]').checked = route ? !!route.stream : false;
        form.querySelector('[name="enabled"]').checked = route ? route.enabled !== false : true;
        form.querySelector('[name="domains"]').focus();
    }

    function closeForm() {
        state.editingId = '';
        form.hidden = true;
        formError.textContent = '';
    }

    async function saveRoute(payload, successMessage) {
        if (state.busy) return;
        state.busy = true;
        try {
            const response = await call('api/routes', payload);
            state.data = response.state || state.data;
            renderAll();
            notify(successMessage || 'Route saved', 'success');
        } catch (err) {
            const message = proxyError(err);
            if (!form.hidden) formError.textContent = message;
            else showBanner(message, 'error');
            notify(message, 'error');
        } finally {
            state.busy = false;
        }
    }

    async function deleteRoute(routeId, label) {
        if (state.busy) return;
        state.busy = true;
        try {
            const response = await call('api/routes/delete', { id: routeId });
            state.data = response.state || state.data;
            renderAll();
            notify(`Removed ${label || 'route'}`, 'success');
        } catch (err) {
            showBanner(proxyError(err), 'error');
        } finally {
            state.busy = false;
        }
    }

    function renderAll() {
        renderPills();
        renderRoutes();
        renderCerts();
        renderSettings();
    }

    async function loadState(quiet) {
        try {
            state.data = await call('api/state');
            renderAll();
        } catch (err) {
            if (!quiet) showBanner(proxyError(err), 'error');
            pillProxy.textContent = 'Service unavailable';
            pillProxy.className = 'dom-pill bad';
        }
    }

    $('#dom-add').addEventListener('click', () => openForm(''));
    $('#dom-cancel').addEventListener('click', closeForm);
    $('#dom-ethos').addEventListener('click', () => {
        form.querySelector('[name="upstream"]').value = 'host.docker.internal:9000';
        form.querySelector('[name="note"]').value = form.querySelector('[name="note"]').value || 'EthOS';
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const values = {
            domains: form.querySelector('[name="domains"]').value,
            upstream: form.querySelector('[name="upstream"]').value,
            redirect_to: form.querySelector('[name="redirect_to"]').value,
            headers: form.querySelector('[name="headers"]').value,
            note: form.querySelector('[name="note"]').value,
            preserve_host: form.querySelector('[name="preserve_host"]').checked,
            stream: form.querySelector('[name="stream"]').checked,
            enabled: form.querySelector('[name="enabled"]').checked,
        };
        if (state.editingId) values.id = state.editingId;
        if (!values.domains.trim()) { formError.textContent = 'Enter at least one domain.'; return; }
        if (!values.upstream.trim() && !values.redirect_to.trim()) {
            formError.textContent = 'Enter a target (host:port) or a redirect URL.';
            return;
        }
        const wasEditing = !!state.editingId;
        await saveRoute(values, wasEditing ? 'Route updated' : 'Route added');
        if (!formError.textContent) closeForm();
    });

    settingsForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (state.busy) return;
        state.busy = true;
        try {
            const response = await call('api/settings', {
                acme_email: $('#dom-email').value,
                staging: settingsForm.querySelector('[name="staging"]').checked,
            });
            state.data = response.state || state.data;
            renderAll();
            notify('Settings saved', 'success');
        } catch (err) {
            showBanner(proxyError(err), 'error');
            notify(proxyError(err), 'error');
        } finally {
            state.busy = false;
        }
    });

    $('#dom-apply').addEventListener('click', async () => {
        try {
            const response = await call('api/apply', {});
            state.data = response.state || state.data;
            renderAll();
            notify('Proxy configuration reloaded', 'success');
        } catch (err) {
            showBanner(proxyError(err), 'error');
        }
    });

    $('#dom-dns-btn').addEventListener('click', async () => {
        const domain = $('#dom-dns-input').value.trim();
        if (!domain) { dnsOut.textContent = 'Enter a domain first.'; return; }
        dnsOut.textContent = 'Resolving…';
        try {
            const result = await call(`api/dns?domain=${encodeURIComponent(domain)}`);
            const lines = [`${result.domain}: ${(result.addresses || []).join(', ') || 'no records'}`];
            if (result.hint) lines.push(result.hint);
            dnsOut.textContent = lines.join('\n');
        } catch (err) {
            dnsOut.textContent = proxyError(err);
        }
    });

    async function loadLog() {
        try {
            const result = await call('api/logs?limit=120');
            const lines = result.lines || [];
            logOut.textContent = lines.length ? lines.join('\n') : 'No log lines yet. Certificate issuance appears here.';
        } catch (err) {
            logOut.textContent = proxyError(err);
        }
    }
    $('#dom-log-btn').addEventListener('click', loadLog);

    loadState(false);
    loadLog();

    const poll = setInterval(() => { if (!document.hidden) loadState(true); }, 15000);
    const logPoll = setInterval(() => { if (!document.hidden) loadLog(); }, 60000);
    const observer = new MutationObserver(() => {
        if (!document.body.contains(root)) {
            clearInterval(poll);
            clearInterval(logPoll);
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
}
