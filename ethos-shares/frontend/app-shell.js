const STYLE = `
.sh-root{color-scheme:light;--sh-bg:#eef2f7;--sh-side-bg:rgba(255,255,255,.88);--sh-panel:#fff;--sh-surface:#f4f5f7;--sh-input:#fff;--sh-border:#e3e5e8;--sh-text:#1f2430;--sh-muted:#5b6472;--sh-accent:#2563eb;--sh-accent-soft:rgba(37,99,235,.10);--sh-accent-border:rgba(37,99,235,.45);--sh-green:#15803d;--sh-green-soft:rgba(21,128,61,.12);--sh-green-border:rgba(21,128,61,.35);--sh-red:#b91c1c;--sh-red-soft:rgba(185,28,28,.08);--sh-red-border:rgba(185,28,28,.32);--sh-amber:#b45309;--sh-amber-soft:rgba(180,83,9,.10);--sh-amber-border:rgba(180,83,9,.30);--sh-hover:rgba(15,23,42,.06);--sh-glow-1:rgba(37,99,235,.08);--sh-glow-2:rgba(21,128,61,.06);display:flex;height:100%;overflow:hidden;background:radial-gradient(circle at 8% 4%,var(--sh-glow-1),transparent 40%),radial-gradient(circle at 92% 96%,var(--sh-glow-2),transparent 40%),var(--sh-bg);color:var(--sh-text);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
:root.dark .sh-root{color-scheme:dark;--sh-bg:#08111d;--sh-side-bg:rgba(2,6,23,.45);--sh-panel:rgba(148,163,184,.07);--sh-surface:rgba(15,23,42,.45);--sh-input:rgba(2,6,23,.55);--sh-border:rgba(148,163,184,.22);--sh-text:#e2e8f0;--sh-muted:#94a3b8;--sh-accent:#38bdf8;--sh-accent-soft:rgba(56,189,248,.14);--sh-accent-border:rgba(56,189,248,.55);--sh-green:#4ade80;--sh-green-soft:rgba(74,222,128,.14);--sh-green-border:rgba(74,222,128,.45);--sh-red:#f87171;--sh-red-soft:rgba(248,113,113,.12);--sh-red-border:rgba(248,113,113,.45);--sh-amber:#fbbf24;--sh-amber-soft:rgba(251,191,36,.10);--sh-amber-border:rgba(251,191,36,.45);--sh-hover:rgba(148,163,184,.09);--sh-glow-1:rgba(56,189,248,.16);--sh-glow-2:rgba(74,222,128,.10)}
.sh-root,.sh-root *{box-sizing:border-box}.sh-root button,.sh-root input,.sh-root select{font:inherit}.sh-side{flex:none;width:218px;display:flex;flex-direction:column;gap:16px;padding:20px 14px;border-right:1px solid var(--sh-border);background:var(--sh-side-bg);overflow-y:auto}.sh-brand{display:flex;align-items:center;gap:10px;padding:0 8px}.sh-brand-icon{font-size:26px;line-height:1}.sh-brand strong{display:block;font-size:14px}.sh-brand small{display:block;color:var(--sh-muted);font-size:10px}.sh-nav{display:flex;flex-direction:column;gap:2px}.sh-nav-item{display:block;width:100%;padding:9px 11px;border:0;border-radius:9px;background:transparent;color:var(--sh-muted);font-size:12px;font-weight:600;text-align:left;cursor:pointer}.sh-nav-item:hover,.sh-nav-item.is-active{background:var(--sh-accent-soft);color:var(--sh-text)}.sh-nav-item:focus-visible,.sh-btn:focus-visible,.sh-input:focus-visible{outline:2px solid var(--sh-accent);outline-offset:2px}.sh-side-foot{margin-top:auto;display:flex;flex-direction:column;gap:8px;padding:0 8px}.sh-side-note{color:var(--sh-muted);font-size:10px;line-height:1.6}.sh-pill{align-self:flex-start;padding:5px 10px;border:1px solid var(--sh-border);border-radius:999px;font-size:10px;font-weight:700;white-space:nowrap}.sh-pill.ready{color:var(--sh-green);border-color:var(--sh-green-border);background:var(--sh-green-soft)}.sh-pill.starting{color:var(--sh-amber);border-color:var(--sh-amber-border);background:var(--sh-amber-soft)}.sh-pill.offline{color:var(--sh-red);border-color:var(--sh-red-border);background:var(--sh-red-soft)}.sh-main{flex:1;min-width:0;overflow-y:auto;padding:24px 28px 32px}.sh-main h1{margin:0;font-size:clamp(22px,3.4vw,30px)}.sh-sub{margin:4px 0 0;color:var(--sh-muted);font-size:12px;line-height:1.5}.sh-status{min-height:18px;margin:12px 0 0;color:var(--sh-accent);font-size:12px;font-weight:600}.sh-status.error{color:var(--sh-red)}.sh-status.warn{color:var(--sh-amber)}.sh-view{display:flex;flex-direction:column;gap:14px;margin-top:16px}.sh-panel{padding:17px 18px;border:1px solid var(--sh-border);border-radius:15px;background:var(--sh-panel)}.sh-panel h2{margin:0 0 4px;font-size:13px}.sh-muted{margin:0;color:var(--sh-muted);font-size:11px;line-height:1.55}.sh-startup{padding:9px 11px;border:1px solid var(--sh-amber-border);border-radius:9px;background:var(--sh-amber-soft);color:var(--sh-muted);font-size:11px;line-height:1.55}.sh-toolbar{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}.sh-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.sh-btn{padding:8px 13px;border:1px solid var(--sh-border);border-radius:9px;background:var(--sh-surface);color:var(--sh-text);font-size:11px;font-weight:600;cursor:pointer}.sh-btn:hover:not(:disabled){border-color:var(--sh-accent)}.sh-btn:disabled{opacity:.5;cursor:not-allowed}.sh-btn.primary{border-color:var(--sh-accent-border);background:var(--sh-accent-soft)}.sh-btn.danger{border-color:var(--sh-red-border);color:var(--sh-red)}.sh-btn.small{padding:4px 9px;font-size:10px}.sh-label{display:block;margin-bottom:7px;color:var(--sh-muted);font-size:10px;text-transform:uppercase}.sh-input{width:100%;min-width:0;padding:9px 11px;border:1px solid var(--sh-border);border-radius:9px;background:var(--sh-input);color:var(--sh-text);font:12px ui-monospace,SFMono-Regular,Menlo,monospace}.sh-fields{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}.sh-field{display:flex;flex-direction:column;gap:6px;margin-top:14px}.sh-field.full{grid-column:1/-1}.sh-checkline{display:flex;align-items:center;gap:8px;color:var(--sh-text);font-size:12px}.sh-checkline input{accent-color:var(--sh-accent)}.sh-form-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px;padding-top:14px;border-top:1px solid var(--sh-border)}.sh-table{width:100%;border-collapse:collapse;font-size:11px}.sh-table th,.sh-table td{padding:8px 9px;border-bottom:1px solid var(--sh-border);text-align:left;vertical-align:top}.sh-table th{color:var(--sh-muted);font-size:9px;text-transform:uppercase;white-space:nowrap}.sh-table tbody tr:last-child td{border-bottom:0}.sh-table td.path{font:12px ui-monospace,monospace;word-break:break-all}.sh-table td.actions{text-align:right;white-space:nowrap}.sh-scroll{overflow-x:auto;margin-top:12px}.sh-tag{display:inline-flex;padding:3px 8px;border:1px solid var(--sh-accent-border);border-radius:999px;background:var(--sh-accent-soft);color:var(--sh-accent);font:10px ui-monospace,monospace;white-space:nowrap}.sh-tag.ok{border-color:var(--sh-green-border);background:var(--sh-green-soft);color:var(--sh-green)}.sh-tag.warn{border-color:var(--sh-amber-border);background:var(--sh-amber-soft);color:var(--sh-amber)}.sh-tag.bad{border-color:var(--sh-red-border);background:var(--sh-red-soft);color:var(--sh-red)}.sh-empty{padding:24px;border:1px dashed var(--sh-border);border-radius:11px;color:var(--sh-muted);font-size:11px;text-align:center}.sh-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.sh-summary>div{padding:11px;border:1px solid var(--sh-border);border-radius:10px;background:var(--sh-surface)}.sh-summary span{display:block;margin-bottom:4px;color:var(--sh-muted);font-size:9px;text-transform:uppercase}.sh-summary strong{font-size:20px;font-variant-numeric:tabular-nums}.sh-error{min-height:16px;color:var(--sh-red);font-size:11px}.sh-select{min-height:120px}.sh-pathrow{display:flex;gap:8px}.sh-pathrow .sh-input{flex:1}
@media(max-width:780px){.sh-root{flex-direction:column}.sh-side{width:auto;flex-direction:row;align-items:center;gap:10px;padding:10px 12px;border-right:0;border-bottom:1px solid var(--sh-border);overflow-x:auto}.sh-brand{padding:0}.sh-brand small,.sh-side-note{display:none}.sh-nav{flex-direction:row}.sh-nav-item{white-space:nowrap}.sh-side-foot{margin:0 0 0 auto;padding:0}.sh-main{padding:16px}.sh-fields,.sh-summary{grid-template-columns:1fr}}
@media(prefers-reduced-motion:reduce){.sh-root *{transition:none!important;animation:none!important}}
`;

const VIEWS = { shares: 'Shares', accounts: 'Samba users' };
const esc = (ctx, value) => ctx.escape.html(String(value ?? ''));
const attr = (ctx, value) => ctx.escape.attr(String(value ?? ''));

async function api(ctx, path, options = {}) {
    const response = await ctx.apiFetch(path, options);
    if (!response.ok) {
        let detail = `Request failed (${response.status})`;
        try {
            const body = await response.clone().json();
            if (typeof body.detail === 'string') detail = body.detail;
        } catch (_) { /* Keep the status-only error for non-JSON responses. */ }
        throw new Error(detail);
    }
    return response.status === 204 ? null : response.json();
}

export async function render(container, ctx) {
    if (!document.getElementById('ethos-shares-package-style')) {
        const style = document.createElement('style');
        style.id = 'ethos-shares-package-style';
        style.textContent = STYLE;
        document.head.appendChild(style);
    }
    const state = {
        view: 'shares', shares: [], accounts: { users: [], groups: [] },
        status: null, editing: null, busy: false,
    };
    const root = document.createElement('div');
    root.className = 'sh-root';
    root.innerHTML = `<aside class="sh-side">
        <div class="sh-brand"><span class="sh-brand-icon" aria-hidden="true">📁</span><div><strong>Samba Shares</strong><small>EthOS package</small></div></div>
        <nav class="sh-nav" aria-label="Samba sections">${Object.entries(VIEWS).map(([id, label], index) => `<button class="sh-nav-item${index === 0 ? ' is-active' : ''}" type="button" data-action="view" data-view="${id}">${label}</button>`).join('')}</nav>
        <div class="sh-side-foot"><span class="sh-pill starting" data-testid="shares-service-pill" role="status" aria-live="polite">Connecting</span><span class="sh-side-note">Share access and Samba credentials. Admin only.</span></div>
    </aside><main class="sh-main"><header><h1 data-testid="shares-title">Shares</h1><p class="sh-sub" data-testid="shares-subtitle">Folders, access rules, and service health.</p><p class="sh-status" data-testid="shares-status" role="status" aria-live="polite"></p></header><div class="sh-view" data-testid="shares-view"></div></main>`;
    container.replaceChildren(root);
    const $ = (selector) => root.querySelector(selector);
    const viewRoot = $('[data-testid="shares-view"]');
    const notify = (message, kind = 'info') => ctx.notifications.toast(message, kind);
    const confirm = (title, message, okText) => new Promise((resolve) => {
        const dialog = ctx.modal.confirm({
            title,
            message,
            okText,
            onConfirm: () => resolve(true),
            onCancel: () => resolve(false),
        });
        dialog.querySelector('[data-testid="unified-confirm-close"]')?.addEventListener(
            'click', () => resolve(false), { once: true },
        );
    });

    function notice(message = '', kind = '') {
        const status = $('[data-testid="shares-status"]');
        status.textContent = message;
        status.className = `sh-status${kind ? ` ${kind}` : ''}`;
    }

    function servicePill() {
        const pill = $('[data-testid="shares-service-pill"]');
        if (!state.status) return;
        if (state.status.samba_installed === false) {
            pill.className = 'sh-pill offline'; pill.textContent = 'Samba missing';
        } else if (state.status.active) {
            pill.className = 'sh-pill ready'; pill.textContent = `${state.status.service || 'Samba'} active`;
        } else {
            pill.className = 'sh-pill starting'; pill.textContent = 'Samba inactive';
        }
    }

    function header() {
        const sharesView = state.view === 'shares';
        $('[data-testid="shares-title"]').textContent = sharesView ? 'Shares' : 'Samba users';
        $('[data-testid="shares-subtitle"]').textContent = sharesView
            ? 'Folders, access rules, and service health.' : 'Samba credentials for existing Linux accounts.';
        root.querySelectorAll('[data-action="view"]').forEach((button) => {
            button.classList.toggle('is-active', button.dataset.view === state.view);
        });
        servicePill();
    }

    function dependencyBanner() {
        if (state.status?.samba_installed !== false) return '';
        const missing = (state.status.missing_tools || []).map((tool) => esc(ctx, tool)).join(', ');
        const hint = state.status.install_hint ? `<code>${esc(ctx, state.status.install_hint)}</code>` : '';
        return `<div class="sh-startup" data-testid="shares-samba-missing"><strong>Samba is not installed.</strong> Changes cannot be validated or applied.${missing ? ` Missing tools: ${missing}.` : ''}${hint ? `<div>${hint}</div>` : ''}</div>`;
    }

    function renderShareForm(share) {
        const editing = Boolean(share.name);
        const structured = Boolean((share.read_users || []).length || (share.write_users || []).length);
        const principals = [
            ...state.accounts.users.map((user) => [user.username, user.username]),
            ...state.accounts.groups.map((group) => [`@${group.name}`, `@${group.name}`]),
        ];
        const options = (selected) => principals.map(([value, label]) => `<option value="${attr(ctx, value)}" ${selected.includes(value) ? 'selected' : ''}>${esc(ctx, label)}</option>`).join('');
        viewRoot.innerHTML = `${dependencyBanner()}<section class="sh-panel" data-testid="shares-form-panel">
            <div class="sh-toolbar"><div><h2>${editing ? 'Edit share' : 'Create share'}</h2><p class="sh-muted">SMB access applies to the selected directory.</p></div><button class="sh-btn" type="button" data-action="cancel-form">Cancel</button></div>
            <form data-form="share" data-editing="${editing}" data-name="${attr(ctx, share.name || '')}"><div class="sh-fields">
                <div class="sh-field"><label class="sh-label" for="sh-name">Share name</label><input class="sh-input" id="sh-name" name="name" required maxlength="64" pattern="[A-Za-z0-9_.-]+" value="${attr(ctx, share.name || '')}" ${editing ? 'readonly' : ''} data-testid="shares-form-name"></div>
                <div class="sh-field"><label class="sh-label" for="sh-path">Folder</label><div class="sh-pathrow"><input class="sh-input" id="sh-path" name="path" required value="${attr(ctx, share.path || '')}" placeholder="/mnt/shared" data-testid="shares-form-path"><button class="sh-btn" type="button" data-action="pick-folder" data-testid="shares-form-browse">Browse</button></div></div>
                <div class="sh-field full"><label class="sh-label" for="sh-comment">Description</label><input class="sh-input" id="sh-comment" name="comment" maxlength="255" value="${attr(ctx, share.comment || '')}" data-testid="shares-form-comment"></div>
                <div class="sh-field"><label class="sh-label" for="sh-create-mask">New file permissions</label><input class="sh-input" id="sh-create-mask" name="create_mask" inputmode="numeric" pattern="0?[0-7]{3}" value="${attr(ctx, share.create_mask || '0755')}" data-testid="shares-form-create-mask"></div>
                <div class="sh-field"><label class="sh-label" for="sh-directory-mask">New folder permissions</label><input class="sh-input" id="sh-directory-mask" name="directory_mask" inputmode="numeric" pattern="0?[0-7]{3}" value="${attr(ctx, share.directory_mask || '0755')}" data-testid="shares-form-directory-mask"></div>
                <div class="sh-field"><label class="sh-checkline"><input type="checkbox" name="read_only" ${share.read_only ? 'checked' : ''} data-testid="shares-form-readonly"> Read-only share</label><label class="sh-checkline"><input type="checkbox" name="guest_ok" ${share.guest_ok ? 'checked' : ''} data-testid="shares-form-guest"> Allow guest access</label></div>
                <div class="sh-field"><label class="sh-checkline"><input type="checkbox" name="browsable" ${share.browsable !== false ? 'checked' : ''} data-testid="shares-form-browsable"> Show in network browse</label></div>
                <div class="sh-field full"><label class="sh-label" for="sh-valid-users">Allowed users (existing setting)</label><input class="sh-input" id="sh-valid-users" name="valid_users" value="${attr(ctx, share.valid_users || '')}" placeholder="user1 user2 or @group" data-testid="shares-form-valid-users"><p class="sh-muted">Leave unchanged to preserve an existing setting, or enable structured rules below.</p></div>
                <div class="sh-field full"><label class="sh-checkline"><input type="checkbox" name="manage_acl" ${structured ? 'checked' : ''} data-testid="shares-form-manage-acl"> Configure per-user and group access</label></div>
                <div class="sh-field"><label class="sh-label" for="sh-read-users">Read only</label><select class="sh-input sh-select" id="sh-read-users" name="read_users" multiple data-testid="shares-form-read-users" ${structured ? '' : 'disabled'}>${options(share.read_users || [])}</select></div>
                <div class="sh-field"><label class="sh-label" for="sh-write-users">Read and write</label><select class="sh-input sh-select" id="sh-write-users" name="write_users" multiple data-testid="shares-form-write-users" ${structured && !share.read_only ? '' : 'disabled'}>${options(share.write_users || [])}</select></div>
            </div><div class="sh-error" role="alert" data-form-error></div><div class="sh-form-actions"><button class="sh-btn" type="button" data-action="cancel-form">Cancel</button><button class="sh-btn primary" type="submit" data-testid="shares-form-submit">${editing ? 'Save changes' : 'Create share'}</button></div></form>
        </section>`;
    }

    function renderShares() {
        header();
        if (state.editing) return renderShareForm(state.editing);
        const total = state.shares.length;
        const writable = state.shares.filter((share) => !share.read_only).length;
        const guests = state.shares.filter((share) => share.guest_ok).length;
        viewRoot.innerHTML = `${dependencyBanner()}<section class="sh-summary"><div><span>Shares</span><strong>${total}</strong></div><div><span>Writable</span><strong>${writable}</strong></div><div><span>Guest access</span><strong>${guests}</strong></div><div><span>Service</span><strong>${state.status?.active ? 'Active' : 'Inactive'}</strong></div></section>
            <section class="sh-panel"><div class="sh-toolbar"><div><h2>Configured shares</h2><p class="sh-muted">Changes are validated before Samba applies them.</p></div><div class="sh-row"><button class="sh-btn" type="button" data-action="refresh" data-testid="shares-refresh">Refresh</button><button class="sh-btn primary" type="button" data-action="add-share" data-testid="shares-add" ${state.status?.samba_installed === false ? 'disabled' : ''}>Add share</button></div></div>
            ${total ? `<div class="sh-scroll"><table class="sh-table"><thead><tr><th>Name</th><th>Path</th><th>Access</th><th>Rules</th><th>Actions</th></tr></thead><tbody>${state.shares.map((share) => {
                const mode = share.read_only ? 'Read-only' : share.guest_ok ? 'Guest' : 'User access';
                const aclCount = (share.read_users || []).length + (share.write_users || []).length;
                const rules = aclCount ? `${aclCount} ACLs` : share.valid_users || 'Default';
                return `<tr data-testid="shares-row-${attr(ctx, share.name)}"><td><strong>${esc(ctx, share.name)}</strong><div class="sh-muted">${esc(ctx, share.comment || '')}</div></td><td class="path">${esc(ctx, share.path)}</td><td><span class="sh-tag ${share.read_only ? 'warn' : share.guest_ok ? 'bad' : 'ok'}">${mode}</span></td><td>${esc(ctx, rules)}</td><td class="actions"><button class="sh-btn small" type="button" data-action="edit-share" data-name="${attr(ctx, share.name)}" data-testid="shares-edit-${attr(ctx, share.name)}">Edit</button> <button class="sh-btn small danger" type="button" data-action="delete-share" data-name="${attr(ctx, share.name)}" data-testid="shares-delete-${attr(ctx, share.name)}">Delete</button></td></tr>`;
            }).join('')}</tbody></table></div>` : '<div class="sh-empty" data-testid="shares-empty"><strong>No shares configured</strong>Create a share to make a NAS folder available over SMB.</div>'}</section>`;
    }

    function renderAccounts() {
        header();
        if (state.status?.samba_installed === false) {
            viewRoot.innerHTML = `${dependencyBanner()}<div class="sh-empty">Samba account tools are unavailable until the dependency is installed.</div>`;
            return;
        }
        const users = state.accounts.users;
        const enabled = users.filter((user) => user.samba_enabled).length;
        viewRoot.innerHTML = `${dependencyBanner()}<section class="sh-summary"><div><span>Linux users</span><strong>${users.length}</strong></div><div><span>Samba enabled</span><strong>${enabled}</strong></div><div><span>Available groups</span><strong>${state.accounts.groups.length}</strong></div><div><span>Account scope</span><strong>Existing</strong></div></section>
            <section class="sh-panel"><div class="sh-toolbar"><div><h2>Existing Linux accounts</h2><p class="sh-muted">Manage Samba credentials without changing Linux accounts.</p></div><button class="sh-btn" type="button" data-action="refresh" data-testid="accounts-refresh">Refresh</button></div>
            ${users.length ? `<div class="sh-scroll"><table class="sh-table"><thead><tr><th>User</th><th>Samba</th><th>Actions</th></tr></thead><tbody>${users.map((user) => `<tr data-testid="samba-user-${attr(ctx, user.username)}"><td><strong>${esc(ctx, user.username)}</strong></td><td><span class="sh-tag ${user.samba_enabled ? 'ok' : 'warn'}">${user.samba_enabled ? 'Enabled' : 'Not enabled'}</span></td><td class="actions"><button class="sh-btn small" type="button" data-action="set-password" data-name="${attr(ctx, user.username)}" data-testid="samba-password-${attr(ctx, user.username)}">${user.samba_enabled ? 'Reset password' : 'Enable SMB'}</button>${user.samba_enabled ? ` <button class="sh-btn small danger" type="button" data-action="remove-account" data-name="${attr(ctx, user.username)}" data-testid="samba-remove-${attr(ctx, user.username)}">Remove SMB</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="sh-empty">No eligible Linux accounts were found.</div>'}</section>
            <section class="sh-panel"><h2>Available groups</h2><p class="sh-muted">Use <code>@group</code> entries in the share access rules.</p><div class="sh-row sh-groups">${state.accounts.groups.map((group) => `<span class="sh-tag">@${esc(ctx, group.name)}</span>`).join('') || '<span class="sh-muted">No eligible groups found.</span>'}</div></section>`;
    }

    function renderView() {
        if (state.view === 'shares') renderShares();
        else renderAccounts();
    }

    async function loadShares() {
        const [data, status] = await Promise.all([api(ctx, '/api/shares'), api(ctx, '/api/shares/status')]);
        state.shares = Array.isArray(data.shares) ? data.shares : [];
        state.status = status;
    }

    async function loadAccounts() {
        state.accounts = await api(ctx, '/api/shares/accounts');
    }

    async function refresh() {
        if (state.busy) return;
        state.busy = true;
        notice('Refreshing…');
        try {
            await loadShares();
            if (state.view === 'accounts') await loadAccounts();
            notice('Ready.');
        } catch (error) {
            notice(error.message, 'error'); notify(error.message, 'error');
        } finally {
            state.busy = false;
            renderView();
        }
    }

    async function saveShare(form) {
        const data = new FormData(form);
        const editing = form.dataset.editing === 'true';
        const body = {
            path: String(data.get('path') || '').trim(), comment: String(data.get('comment') || '').trim(),
            read_only: data.has('read_only'), browsable: data.has('browsable'), guest_ok: data.has('guest_ok'),
            valid_users: String(data.get('valid_users') || '').trim(),
            create_mask: String(data.get('create_mask') || '').trim(),
            directory_mask: String(data.get('directory_mask') || '').trim(),
        };
        if (!editing) body.name = String(data.get('name') || '').trim();
        if (data.has('manage_acl')) {
            body.read_users = [...form.elements.read_users.selectedOptions].map((option) => option.value);
            body.write_users = data.has('read_only') ? []
                : [...form.elements.write_users.selectedOptions].map((option) => option.value);
        }
        const submit = form.querySelector('[type="submit"]');
        const errorEl = form.querySelector('[data-form-error]');
        submit.disabled = true;
        errorEl.textContent = '';
        try {
            await api(ctx, editing ? `/api/shares/${encodeURIComponent(form.dataset.name)}` : '/api/shares', {
                method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
            });
            state.editing = null;
            await loadShares();
            notice(editing ? 'Share updated.' : 'Share created.');
            notify(editing ? 'Share updated' : 'Share created', 'success');
            renderView();
        } catch (error) {
            errorEl.textContent = error.message;
            notice(error.message, 'error');
        } finally {
            if (submit.isConnected) submit.disabled = false;
        }
    }

    async function setPassword(username) {
        const bodyHtml = `<label for="sh-new-password">New Samba password</label><input class="ethos-modal-input" id="sh-new-password" name="password" type="password" minlength="8" maxlength="128" autocomplete="new-password" required><p class="sh-muted">This changes only the Samba password for ${esc(ctx, username)}.</p>`;
        const result = await ctx.modal.form({
            title: `Samba password: ${username}`, bodyHtml, confirmLabel: 'Save password',
            validate: (values) => String(values.password || '').length < 8 ? 'Use at least 8 characters.' : null,
            onSubmit: async (values, { setError }) => {
                try {
                    await api(ctx, `/api/shares/accounts/${encodeURIComponent(username)}/password`, {
                        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: values.password }),
                    });
                    await loadAccounts();
                    notice(`Samba password updated for ${username}.`);
                    notify(`Samba password updated for ${username}`, 'success');
                } catch (error) { setError(error.message); return false; }
            },
        });
        if (result) renderView();
    }

    root.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-action]');
        if (!button || !root.contains(button)) return;
        const { action, view, name } = button.dataset;
        try {
            if (action === 'view') {
                state.view = view; state.editing = null; notice(''); renderView();
                if (view === 'accounts') { await loadAccounts(); renderView(); }
            } else if (action === 'refresh') await refresh();
            else if (action === 'add-share') {
                if (!state.accounts.users.length) await loadAccounts();
                state.editing = { name: '', path: '', comment: '', read_only: false, browsable: true, guest_ok: false };
                renderView();
            } else if (action === 'edit-share') {
                if (!state.accounts.users.length) await loadAccounts();
                state.editing = state.shares.find((share) => share.name === name) || null;
                if (!state.editing) throw new Error('Share not found');
                renderView();
            } else if (action === 'cancel-form') { state.editing = null; notice(''); renderView(); }
            else if (action === 'pick-folder') {
                const path = await ctx.pickFolder({ title: 'Choose share folder', startPath: '/mnt', roots: ['/home', '/mnt', '/media'], acceptLabel: 'Choose folder' });
                if (path) root.querySelector('[name="path"]').value = path;
            } else if (action === 'delete-share') {
                const confirmed = await confirm('Delete share', `Remove the SMB share “${name}”?`, 'Delete share');
                if (!confirmed) return;
                await api(ctx, `/api/shares/${encodeURIComponent(name)}`, { method: 'DELETE' });
                await loadShares(); notice(`Share ${name} deleted.`); notify(`Share ${name} deleted`, 'success'); renderView();
            } else if (action === 'set-password') await setPassword(name);
            else if (action === 'remove-account') {
                const confirmed = await confirm('Remove Samba account', `Remove SMB credentials for ${name}? The Linux account and its files will remain.`, 'Remove SMB access');
                if (!confirmed) return;
                await api(ctx, `/api/shares/accounts/${encodeURIComponent(name)}`, { method: 'DELETE' });
                await loadAccounts(); notice(`Samba access removed for ${name}.`); notify(`Samba access removed for ${name}`, 'success'); renderView();
            }
        } catch (error) { notice(error.message, 'error'); notify(error.message, 'error'); }
    });

    root.addEventListener('change', (event) => {
        if (!['manage_acl', 'read_only'].includes(event.target.name)) return;
        const form = event.target.closest('form');
        const managed = form.elements.manage_acl.checked;
        form.elements.read_users.disabled = !managed;
        form.elements.write_users.disabled = !managed || form.elements.read_only.checked;
    });
    root.addEventListener('submit', (event) => {
        if (!event.target.matches('form[data-form="share"]')) return;
        event.preventDefault();
        saveShare(event.target);
    });

    ctx.log('info', 'Samba Shares opened');
    renderView();
    await refresh();
}