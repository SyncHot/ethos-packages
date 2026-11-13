// EthOS native package UI — EthOS VM Manager (vmm)
// Contract: export function render(container, ctx). Every API call goes through
// ctx.proxy(), so the control plane stays bound to the NAS loopback.
//
// The browser console is a separate, ticket-gated page on port 8094: EthOS's
// proxy forwards GET/POST only, so the VNC WebSocket cannot travel through it.

const STYLE = `
.vmm-root {
    color-scheme: light;
    --vmm-bg: #eef2f7;
    --vmm-side: rgba(255, 255, 255, 0.88);
    --vmm-panel: #ffffff;
    --vmm-surface: #f4f5f7;
    --vmm-border: #e3e5e8;
    --vmm-text: #1f2430;
    --vmm-muted: #5b6472;
    --vmm-accent: #2563eb;
    --vmm-accent-soft: rgba(37, 99, 235, 0.10);
    --vmm-green: #15803d;
    --vmm-green-soft: rgba(21, 128, 61, 0.12);
    --vmm-red: #b91c1c;
    --vmm-red-soft: rgba(185, 28, 28, 0.08);
    --vmm-amber: #b45309;
    --vmm-amber-soft: rgba(180, 83, 9, 0.10);
    --vmm-hover: rgba(15, 23, 42, 0.06);
    display: flex;
    height: 100%;
    overflow: hidden;
    background: var(--vmm-bg);
    color: var(--vmm-text);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
:root.dark .vmm-root {
    color-scheme: dark;
    --vmm-bg: #08111d;
    --vmm-side: rgba(2, 6, 23, 0.55);
    --vmm-panel: rgba(148, 163, 184, 0.07);
    --vmm-surface: rgba(15, 23, 42, 0.45);
    --vmm-border: rgba(148, 163, 184, 0.22);
    --vmm-text: #e2e8f0;
    --vmm-muted: #94a3b8;
    --vmm-accent: #38bdf8;
    --vmm-accent-soft: rgba(56, 189, 248, 0.14);
    --vmm-green: #4ade80;
    --vmm-green-soft: rgba(74, 222, 128, 0.14);
    --vmm-red: #f87171;
    --vmm-red-soft: rgba(248, 113, 113, 0.14);
    --vmm-amber: #fbbf24;
    --vmm-amber-soft: rgba(251, 191, 36, 0.14);
    --vmm-hover: rgba(148, 163, 184, 0.14);
}
.vmm-root * { box-sizing: border-box; }
/* the hidden attribute must win over the panel/console display rules below */
.vmm-root [hidden] { display: none !important; }
.vmm-side {
    width: 208px; flex: 0 0 208px; padding: 16px 12px; border-right: 1px solid var(--vmm-border);
    background: var(--vmm-side); display: flex; flex-direction: column; gap: 14px;
}
.vmm-brand { display: flex; gap: 10px; align-items: center; padding: 0 4px; }
.vmm-brand .glyph {
    width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center;
    background: var(--vmm-accent-soft); font-size: 17px;
}
.vmm-brand strong { display: block; font-size: 13px; }
.vmm-brand small { color: var(--vmm-muted); font-size: 11px; }
.vmm-nav { display: flex; flex-direction: column; gap: 4px; }
.vmm-nav button {
    text-align: left; border: 0; background: transparent; color: var(--vmm-text);
    padding: 8px 10px; border-radius: 8px; font-size: 13px; cursor: pointer;
}
.vmm-nav button:hover { background: var(--vmm-hover); }
.vmm-nav button.is-active { background: var(--vmm-accent-soft); color: var(--vmm-accent); font-weight: 600; }
.vmm-side-foot { margin-top: auto; display: flex; flex-direction: column; gap: 8px; }
.vmm-note { font-size: 11px; color: var(--vmm-muted); line-height: 1.45; }
.vmm-main { flex: 1; min-width: 0; position: relative; display: flex; flex-direction: column; overflow: hidden; }
.vmm-header { padding: 16px 20px 10px; display: flex; align-items: flex-start; gap: 12px; }
.vmm-header h1 { margin: 0; font-size: 17px; }
.vmm-header p { margin: 4px 0 0; font-size: 12px; color: var(--vmm-muted); }
.vmm-body { flex: 1; overflow: auto; padding: 0 20px 20px; display: flex; flex-direction: column; gap: 12px; }
.vmm-panel { background: var(--vmm-panel); border: 1px solid var(--vmm-border); border-radius: 12px; padding: 14px; }
.vmm-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.vmm-toolbar h2 { margin: 0; font-size: 14px; }
.vmm-toolbar p { margin: 3px 0 0; font-size: 12px; color: var(--vmm-muted); }
.vmm-btn {
    border: 1px solid var(--vmm-border); background: var(--vmm-surface); color: var(--vmm-text);
    border-radius: 8px; padding: 6px 12px; font-size: 12px; cursor: pointer;
}
.vmm-btn:hover { background: var(--vmm-hover); }
.vmm-btn.primary { background: var(--vmm-accent); border-color: var(--vmm-accent); color: #fff; }
:root.dark .vmm-btn.primary { color: #04121f; }
.vmm-btn.danger { color: var(--vmm-red); border-color: var(--vmm-red-soft); }
.vmm-btn:disabled { opacity: .5; cursor: not-allowed; }
.vmm-pill {
    display: inline-flex; align-items: center; gap: 6px; padding: 3px 9px; border-radius: 999px;
    font-size: 11px; background: var(--vmm-surface); border: 1px solid var(--vmm-border);
}
.vmm-pill.running { color: var(--vmm-green); background: var(--vmm-green-soft); border-color: transparent; }
.vmm-pill.stopped { color: var(--vmm-muted); }
.vmm-pill.paused { color: var(--vmm-amber); background: var(--vmm-amber-soft); border-color: transparent; }
.vmm-pill.error { color: var(--vmm-red); background: var(--vmm-red-soft); border-color: transparent; }
.vmm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
.vmm-card { border: 1px solid var(--vmm-border); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.vmm-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.vmm-card-head strong { font-size: 13px; }
.vmm-specs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 12px; font-size: 12px; }
.vmm-specs span { color: var(--vmm-muted); }
.vmm-specs strong { font-weight: 600; }
.vmm-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.vmm-empty { font-size: 12px; color: var(--vmm-muted); padding: 12px; text-align: center; }
.vmm-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
.vmm-field label { font-size: 12px; font-weight: 600; }
.vmm-field small { font-size: 11px; color: var(--vmm-muted); }
.vmm-row { display: flex; gap: 8px; align-items: center; }
.vmm-input {
    width: 100%; padding: 7px 9px; border-radius: 8px; font-size: 12px;
    border: 1px solid var(--vmm-border); background: var(--vmm-surface); color: var(--vmm-text);
}
.vmm-two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.vmm-check { display: flex; gap: 8px; align-items: flex-start; font-size: 12px; margin-bottom: 10px; }
.vmm-check small { display: block; color: var(--vmm-muted); }
.vmm-status { font-size: 12px; margin: 6px 0 0; min-height: 16px; }
.vmm-status.error { color: var(--vmm-red); }
.vmm-status.ok { color: var(--vmm-green); }
.vmm-console { position: absolute; inset: 0; background: var(--vmm-bg); display: flex; flex-direction: column; z-index: 5; }
.vmm-console-bar { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-bottom: 1px solid var(--vmm-border); }
.vmm-console-bar strong { font-size: 13px; }
.vmm-console iframe { flex: 1; border: 0; width: 100%; background: #0b1220; }
.vmm-list { display: flex; flex-direction: column; gap: 2px; max-height: 260px; overflow: auto; }
.vmm-list button {
    text-align: left; border: 0; background: transparent; color: var(--vmm-text);
    padding: 6px 8px; border-radius: 6px; font-size: 12px; cursor: pointer;
}
.vmm-list button:hover { background: var(--vmm-hover); }
.vmm-list .dir { color: var(--vmm-accent); }
.vmm-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
.vmm-defs { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.vmm-defs div span { display: block; font-size: 11px; color: var(--vmm-muted); }
.vmm-defs div strong { font-size: 13px; }
`;

const VIEWS = {
    machines: ['Machines', 'Virtual machines on this NAS. Disks are qcow2 files on your own shares.'],
    storage: ['Storage', 'Image files the manager can boot from. Copy an ISO to a share first, then pick it here.'],
    host: ['Host', 'What the engine sees: hardware acceleration, CPU, memory and free space.'],
};

function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
}

function gb(bytes) {
    if (!bytes) return '—';
    return `${(bytes / (1024 ** 3)).toFixed(bytes > 1024 ** 3 ? 1 : 0)} GB`;
}

export function render(container, ctx) {
    container.replaceChildren();

    const style = document.createElement('style');
    style.textContent = STYLE;
    const root = document.createElement('div');
    root.className = 'vmm-root';
    root.innerHTML = `
        <aside class="vmm-side">
            <div class="vmm-brand">
                <span class="glyph" aria-hidden="true">🖥️</span>
                <div><strong>VM Manager</strong><small data-version>EthOS package</small></div>
            </div>
            <nav class="vmm-nav" aria-label="VM Manager sections">
                <button class="is-active" type="button" data-tab="machines">Machines</button>
                <button type="button" data-tab="storage">Storage</button>
                <button type="button" data-tab="host">Host</button>
            </nav>
            <div class="vmm-side-foot">
                <span class="vmm-pill" data-health role="status" aria-live="polite">Connecting…</span>
                <span class="vmm-note" data-accel-note></span>
            </div>
        </aside>
        <main class="vmm-main">
            <header class="vmm-header">
                <div>
                    <h1 data-page-title>Machines</h1>
                    <p data-page-sub></p>
                    <p class="vmm-status" role="status" aria-live="polite" data-status></p>
                </div>
            </header>
            <div class="vmm-body">
                <section data-panel="machines">
                    <div class="vmm-panel">
                        <div class="vmm-toolbar">
                            <div>
                                <h2>Virtual machines</h2>
                                <p data-machines-sub>Reading the engine…</p>
                            </div>
                            <button class="vmm-btn primary" type="button" data-action="toggle-form">+ New machine</button>
                        </div>
                        <div data-machines></div>
                    </div>
                    <div class="vmm-panel" data-form-panel hidden style="margin-top:12px;">
                        <div class="vmm-toolbar">
                            <div><h2>New machine</h2><p>The disk is created on the share you pick.</p></div>
                        </div>
                        <form data-create-form>
                            <div class="vmm-two">
                                <div class="vmm-field">
                                    <label for="vmm-name">Name</label>
                                    <input class="vmm-input" id="vmm-name" name="name" placeholder="Windows 11" maxlength="60" required>
                                </div>
                                <div class="vmm-field">
                                    <label for="vmm-disk">Disk size (GB)</label>
                                    <input class="vmm-input" id="vmm-disk" name="disk_gb" type="number" min="1" max="4096" value="40">
                                </div>
                            </div>
                            <div class="vmm-two">
                                <div class="vmm-field">
                                    <label for="vmm-cpu">vCPU</label>
                                    <input class="vmm-input" id="vmm-cpu" name="vcpu" type="number" min="1" max="16" value="2">
                                </div>
                                <div class="vmm-field">
                                    <label for="vmm-ram">Memory (MB)</label>
                                    <input class="vmm-input" id="vmm-ram" name="memory_mb" type="number" min="128" step="128" value="2048">
                                </div>
                            </div>
                            <div class="vmm-field">
                                <label for="vmm-root">Storage location</label>
                                <div class="vmm-row">
                                    <input class="vmm-input" id="vmm-root" name="root" placeholder="/vmhost/mnt/..." spellcheck="false">
                                    <button class="vmm-btn" type="button" data-action="pick-root">Browse…</button>
                                </div>
                                <small>An <code>ethos-vm/</code> folder is created inside it.</small>
                            </div>
                            <div class="vmm-field">
                                <label for="vmm-iso">Installation ISO (optional)</label>
                                <div class="vmm-row">
                                    <select class="vmm-input" id="vmm-iso" name="iso"><option value="">None (boot the disk)</option></select>
                                    <button class="vmm-btn" type="button" data-action="pick-iso">Find ISOs…</button>
                                </div>
                                <small data-iso-hint>Pick a folder to list its .iso files, or paste a path.</small>
                            </div>
                            <div class="vmm-two">
                                <div class="vmm-field">
                                    <label for="vmm-firmware">Firmware</label>
                                    <select class="vmm-input" id="vmm-firmware" name="firmware">
                                        <option value="bios">Legacy BIOS</option>
                                        <option value="uefi">UEFI</option>
                                    </select>
                                </div>
                                <div class="vmm-check" style="margin-top:22px;">
                                    <input type="checkbox" name="autostart" checked id="vmm-autostart">
                                    <label for="vmm-autostart">Start with EthOS<small>Also restarts after an update.</small></label>
                                </div>
                            </div>
                            <p class="vmm-status" data-form-error></p>
                            <div class="vmm-actions">
                                <button class="vmm-btn" type="button" data-action="toggle-form">Cancel</button>
                                <button class="vmm-btn primary" type="submit">Create machine</button>
                            </div>
                        </form>
                    </div>
                </section>

                <section data-panel="storage" hidden>
                    <div class="vmm-panel">
                        <div class="vmm-toolbar">
                            <div><h2>Folder</h2><p data-storage-path>/vmhost</p></div>
                            <div class="vmm-row">
                                <button class="vmm-btn" type="button" data-action="storage-up">Up</button>
                                <button class="vmm-btn" type="button" data-action="storage-pick">Browse…</button>
                            </div>
                        </div>
                        <div class="vmm-list" data-storage-list></div>
                    </div>
                </section>

                <section data-panel="host" hidden>
                    <div class="vmm-panel">
                        <div class="vmm-toolbar">
                            <div><h2>Engine</h2><p>Hardware acceleration, resources and version.</p></div>
                            <button class="vmm-btn" type="button" data-action="refresh">Refresh</button>
                        </div>
                        <div class="vmm-defs" data-host-defs></div>
                    </div>
                </section>
            </div>
            <div class="vmm-console" data-console hidden>
                <div class="vmm-console-bar">
                    <strong data-console-title>Console</strong>
                    <span class="vmm-note" data-console-note></span>
                    <span style="flex:1"></span>
                    <a class="vmm-btn" data-console-link target="_blank" rel="noopener" hidden>Open in a tab</a>
                    <button class="vmm-btn" type="button" data-action="close-console">Close</button>
                </div>
                <iframe data-console-frame title="Virtual machine console" allow="clipboard-read; clipboard-write"></iframe>
            </div>
        </main>`;
    container.append(style, root);

    const $ = (selector) => root.querySelector(selector);
    const $$ = (selector) => [...root.querySelectorAll(selector)];
    const statusEl = $('[data-status]');
    const healthEl = $('[data-health]');
    const machinesEl = $('[data-machines]');
    const formPanel = $('[data-form-panel]');
    const formError = $('[data-form-error]');
    const consoleEl = $('[data-console]');
    const consoleFrame = $('[data-console-frame]');

    const state = {
        tab: 'machines',
        host: null,
        vms: [],
        health: null,
        storagePath: '/vmhost',
        busy: '',
        timer: 0,
    };

    // ── plumbing ────────────────────────────────────────────────────────────
    function notify(message, kind) {
        if (typeof ctx.notify === 'function') ctx.notify(message, kind);
    }

    function say(text, kind = '') {
        statusEl.textContent = text || '';
        statusEl.className = 'vmm-status' + (kind ? ` ${kind}` : '');
    }

    async function api(path, body) {
        if (body === undefined) return ctx.proxy(path);
        return ctx.proxy(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    }

    function failure(err) {
        return (err && (err.detail || err.message)) || 'Request failed';
    }

    // EthOS paths (/mnt/nas) become container paths (/vmhost/mnt/nas): the
    // package mounts the three share roots under /vmhost.
    function toContainerPath(path) {
        const text = String(path || '').trim();
        if (!text) return '';
        if (text.startsWith('/vmhost')) return text;
        return `/vmhost${text.startsWith('/') ? '' : '/'}${text}`;
    }

    function toEthosPath(path) {
        return String(path || '').replace(/^\/vmhost/, '') || '/';
    }

    async function pickFolder(options) {
        if (typeof ctx.pickFolder !== 'function') {
            const typed = window.prompt('Folder path (for example /mnt/nas)', state.storagePath);
            return typed ? toContainerPath(typed) : '';
        }
        const result = await ctx.pickFolder(options || {});
        const path = typeof result === 'string' ? result : (result && result.path);
        return path ? toContainerPath(path) : '';
    }

    // ── data ────────────────────────────────────────────────────────────────
    async function refresh(quiet) {
        try {
            const [health, host, vms] = await Promise.all([
                api('api/health'),
                api('api/host'),
                api('api/vms'),
            ]);
            state.health = health;
            state.host = host;
            state.vms = vms.items || [];
            if (!state.defaultsApplied) {
                state.defaultsApplied = true;
                state.storagePath = (host.roots || [])[0] || '/vmhost/mnt';
                const rootInput = $('#vmm-root');
                if (rootInput && !rootInput.value) rootInput.value = state.storagePath;
            }
            renderAll();
            if (!quiet) say('');
        } catch (err) {
            const health = err && (err.detail || err.message) || '';
            healthEl.className = 'vmm-pill error';
            healthEl.textContent = 'Engine unavailable';
            if (/provisioning|503/i.test(String(health))) {
                say('The engine is installing QEMU for the first time. This takes one to three minutes.', '');
            } else {
                say(failure(err), 'error');
            }
        }
    }

    // ── render ──────────────────────────────────────────────────────────────
    function statusKind(vm) {
        if (vm.status === 'running') return 'running';
        if (vm.status === 'paused') return 'paused';
        if (vm.status === 'stopped') return 'stopped';
        return 'error';
    }

    function renderChrome() {
        $('[data-page-title]').textContent = VIEWS[state.tab][0];
        $('[data-page-sub]').textContent = VIEWS[state.tab][1];
        $$('[data-tab]').forEach((button) => {
            button.classList.toggle('is-active', button.dataset.tab === state.tab);
        });
        const version = (ctx && ctx.pkg && ctx.pkg.version) || '';
        $('[data-version]').textContent = version ? `v${version}` : 'EthOS package';

        const host = state.host || {};
        healthEl.className = `vmm-pill ${state.vms.length || state.health ? 'running' : 'stopped'}`;
        healthEl.textContent = host.kvm ? 'KVM ready' : 'Software emulation';
        const accelNote = $('[data-accel-note]');
        accelNote.textContent = host.kvm
            ? 'Hardware acceleration is active.'
            : 'No /dev/kvm — VMs run in slow software emulation.';
        $('[data-machines-sub]').textContent = state.vms.length
            ? `${state.vms.length} machine${state.vms.length === 1 ? '' : 's'}, ${state.vms.filter((vm) => vm.status === 'running').length} running.`
            : 'No machines yet. Create one from an ISO.';
    }

    function renderMachines() {
        if (!state.vms.length) {
            machinesEl.innerHTML = '<div class="vmm-empty">No virtual machines yet.</div>';
            return;
        }
        machinesEl.innerHTML = `<div class="vmm-grid">${state.vms.map((vm) => {
            const disk = (vm.disks || [])[0] || {};
            const running = vm.status === 'running';
            const paused = vm.status === 'paused';
            return `
            <div class="vmm-card" data-vm="${esc(vm.id)}">
                <div class="vmm-card-head">
                    <strong>${esc(vm.name)}</strong>
                    <span class="vmm-pill ${statusKind(vm)}">${esc(vm.status)}</span>
                </div>
                <div class="vmm-specs">
                    <div><span>vCPU</span><br><strong>${esc(vm.vcpu)}</strong></div>
                    <div><span>Memory</span><br><strong>${esc(vm.memory_mb)} MB</strong></div>
                    <div><span>Disk</span><br><strong>${esc(disk.size_gb || '—')} GB</strong></div>
                    <div><span>Firmware</span><br><strong>${esc(vm.firmware)}</strong></div>
                </div>
                <div class="vmm-mono">${esc(vm.mac || '')}</div>
                <div class="vmm-actions">
                    <button class="vmm-btn" type="button" data-action="console" data-vm-id="${esc(vm.id)}"${running ? '' : ' disabled'}>Console</button>
                    ${running || paused
                        ? `<button class="vmm-btn" type="button" data-action="shutdown" data-vm-id="${esc(vm.id)}">Shut down</button>
                           <button class="vmm-btn danger" type="button" data-action="stop" data-vm-id="${esc(vm.id)}">Force stop</button>`
                        : `<button class="vmm-btn primary" type="button" data-action="start" data-vm-id="${esc(vm.id)}">Start</button>`}
                    <button class="vmm-btn danger" type="button" data-action="delete" data-vm-id="${esc(vm.id)}">Delete</button>
                </div>
            </div>`;
        }).join('')}</div>`;
    }

    function renderHost() {
        const host = state.host || {};
        const rows = [
            ['Acceleration', host.kvm ? 'KVM' : 'TCG (software)'],
            ['CPU cores', host.cores || '—'],
            ['Memory', host.memory_mb ? `${host.memory_mb} MB` : '—'],
            ['Free space', host.disk_free_gb ? `${host.disk_free_gb} GB` : '—'],
            ['QEMU', host.qemu || 'provisioning…'],
            ['Machines', `${host.vm_count ?? 0} / ${host.max_vms ?? 0}`],
            ['Roots', (host.roots || []).map(toEthosPath).join(', ') || '—'],
        ];
        $('[data-host-defs]').innerHTML = rows
            .map(([label, value]) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`)
            .join('');
    }

    function renderStorage(payload) {
        $('[data-storage-path]').textContent = payload.path;
        const entries = payload.entries || [];
        $('[data-storage-list]').innerHTML = entries.length
            ? entries.map((entry) => `<button type="button" class="${entry.dir ? 'dir' : ''}"
                data-entry="${esc(entry.path)}" data-dir="${entry.dir ? '1' : '0'}">
                ${entry.dir ? '📁' : '💿'} ${esc(entry.name)}${entry.dir ? '' : ` <span class="vmm-note">${gb(entry.size)}</span>`}
              </button>`).join('')
            : '<div class="vmm-empty">No images or folders here.</div>';
        $$('[data-entry]').forEach((button) => {
            button.addEventListener('click', () => {
                const path = button.dataset.entry;
                if (button.dataset.dir === '1') {
                    loadStorage(path);
                } else {
                    $('#vmm-iso').value = path;
                    $('[data-iso-hint]').textContent = `Selected: ${path}`;
                    say(`ISO selected: ${path}`);
                }
            });
        });

        // Make the ISO dropdown reflect the folder that is on screen, so the
        // create form never needs a hand-typed path.
        const select = $('#vmm-iso');
        const isos = entries.filter((entry) => !entry.dir && /\.iso$/i.test(entry.name));
        const current = select.value;
        select.innerHTML = '<option value="">None (boot the disk)</option>'
            + isos.map((entry) => `<option value="${esc(entry.path)}">${esc(entry.name)}</option>`).join('');
        if (isos.some((entry) => entry.path === current)) select.value = current;
        $('[data-iso-hint]').textContent = isos.length
            ? `${isos.length} ISO file${isos.length === 1 ? '' : 's'} in this folder.`
            : 'No .iso files here — copy an installer image to this folder first.';
    }

    function renderAll() {
        renderChrome();
        renderMachines();
        renderHost();
    }

    async function loadStorage(path) {
        try {
            const payload = await api(`api/storage/list?path=${encodeURIComponent(path)}`);
            state.storagePath = payload.path;
            renderStorage(payload);
        } catch (err) {
            say(failure(err), 'error');
        }
    }

    // ── actions ─────────────────────────────────────────────────────────────
    async function act(vmId, action) {
        if (state.busy) return;
        state.busy = action;
        say(action === 'stop' ? 'Stopping…' : `${action}…`);
        try {
            const result = await api(`api/vms/${encodeURIComponent(vmId)}/action`, { action });
            notify(`${result.item.name}: ${result.item.status}`, 'success');
            await refresh(true);
            say('');
        } catch (err) {
            say(failure(err), 'error');
            notify(failure(err), 'error');
        } finally {
            state.busy = '';
        }
    }

    async function removeVm(vmId, name) {
        if (!window.confirm(`Delete ${name}? The disk is removed from the share.`)) return;
        try {
            await ctx.proxy(`api/vms/${encodeURIComponent(vmId)}`, { method: 'DELETE' });
            notify(`${name} deleted`, 'success');
            await refresh(true);
        } catch (err) {
            say(failure(err), 'error');
        }
    }

    async function openConsole(vmId, name) {
        try {
            const ticket = await api('api/console/ticket', { vm: vmId });
            const host = location.hostname;
            const scheme = location.protocol === 'https:' ? 'https' : 'http';
            const url = `${scheme}://${host}:${ticket.port}${ticket.url}`;
            consoleFrame.src = url;
            $('[data-console-title]').textContent = `${name} — console`;
            const link = $('[data-console-link]');
            link.href = url;
            link.hidden = false;
            $('[data-console-note]').textContent = location.protocol === 'https:'
                ? 'Console uses http on port ' + ticket.port + '; if the frame stays empty, open it in a tab.'
                : '';
            consoleEl.hidden = false;
        } catch (err) {
            say(failure(err), 'error');
        }
    }

    function closeConsole() {
        consoleEl.hidden = true;
        consoleFrame.src = 'about:blank';
    }

    async function createVm(form) {
        formError.textContent = '';
        const values = new FormData(form);
        const payload = {
            name: String(values.get('name') || '').trim(),
            vcpu: Number(values.get('vcpu') || 1),
            memory_mb: Number(values.get('memory_mb') || 2048),
            disk_gb: Number(values.get('disk_gb') || 40),
            root: String(values.get('root') || state.storagePath || '/vmhost/mnt'),
            iso: String(values.get('iso') || ''),
            firmware: String(values.get('firmware') || 'bios'),
            autostart: values.get('autostart') === 'on',
        };
        if (!payload.name) {
            formError.textContent = 'A name is required.';
            return;
        }
        try {
            say('Creating the disk…');
            const result = await api('api/vms', payload);
            notify(`${result.item.name} created`, 'success');
            form.reset();
            formPanel.hidden = true;
            say('');
            await refresh(true);
        } catch (err) {
            formError.textContent = failure(err);
        }
    }

    // ── wiring ──────────────────────────────────────────────────────────────
    $$('[data-tab]').forEach((button) => {
        button.addEventListener('click', () => {
            state.tab = button.dataset.tab;
            $$('[data-panel]').forEach((panel) => {
                panel.hidden = panel.dataset.panel !== state.tab;
            });
            renderChrome();
            if (state.tab === 'storage') loadStorage(state.storagePath);
        });
    });

    root.addEventListener('click', (event) => {
        const button = event.target.closest('[data-action]');
        if (!button) return;
        const action = button.dataset.action;
        const vmId = button.dataset.vmId;
        const vm = state.vms.find((item) => item.id === vmId);
        if (action === 'toggle-form') {
            formPanel.hidden = !formPanel.hidden;
            if (!formPanel.hidden) $('#vmm-name').focus();
        } else if (action === 'refresh') {
            refresh();
            if (state.tab === 'storage') loadStorage(state.storagePath);
        } else if (action === 'start' || action === 'stop' || action === 'shutdown') {
            act(vmId, action);
        } else if (action === 'console') {
            openConsole(vmId, vm ? vm.name : 'VM');
        } else if (action === 'close-console') {
            closeConsole();
        } else if (action === 'delete') {
            removeVm(vmId, vm ? vm.name : vmId);
        } else if (action === 'pick-root') {
            pickFolder({ title: 'Where should the disk live?', startPath: state.storagePath, roots: ['/home', '/mnt', '/media'] })
                .then((path) => { if (path) $('#vmm-root').value = path; })
                .catch((err) => say(failure(err), 'error'));
        } else if (action === 'pick-iso') {
            pickFolder({ title: 'Folder with the ISO', startPath: state.storagePath, roots: ['/home', '/mnt', '/media'] })
                .then((path) => { if (path) loadStorage(path); })
                .catch((err) => say(failure(err), 'error'));
        } else if (action === 'storage-pick') {
            pickFolder({ title: 'Browse images', startPath: state.storagePath, roots: ['/home', '/mnt', '/media'] })
                .then((path) => { if (path) loadStorage(path); })
                .catch((err) => say(failure(err), 'error'));
        } else if (action === 'storage-up') {
            const parent = state.storagePath.replace(/\/[^/]+$/, '') || '/vmhost';
            loadStorage(parent.startsWith('/vmhost') ? parent : '/vmhost');
        }
    });

    $('[data-create-form]').addEventListener('submit', (event) => {
        event.preventDefault();
        createVm(event.currentTarget);
    });

    // Poll while the window is visible; stop polling once it is gone.
    state.timer = setInterval(() => {
        if (!document.body.contains(root)) {
            clearInterval(state.timer);
            return;
        }
        if (document.visibilityState === 'visible' && !state.busy && consoleEl.hidden) refresh(true);
    }, 4000);

    refresh();
}
