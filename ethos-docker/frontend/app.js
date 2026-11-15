// EthOS NAS — Docker Manager package UI (engine status + Containers + Images + Volumes)
// ── Native-module shim ────────────────────────────────────────────────────────
// Self-contained: every core helper arrives through `ctx` in render(). The core
// keeps ownership of the window manager, progress rows, the log viewer and the
// Notification Center — this module only renders into the container it is given.
let _ctx = null;

const escapeHtml = (value) => _ctx.escape.html(value);
const escapeAttr = (value) => _ctx.escape.attr(value);
const jsAttr = (value) => _ctx.escape.js(value);

function fmtBytes(bytes) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n < 0) return '—';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    let i = 0, value = n;
    while (value >= k && i < sizes.length - 1) { value /= k; i++; }
    return `${parseFloat(value.toFixed(1))} ${sizes[i]}`;
}

// Kept in step with core/utils.js formatBytes (this module cannot import it).
const formatBytes = fmtBytes;

function formatPorts(ports) {
    if (!ports) return '—';
    if (typeof ports === 'string') return escapeHtml(ports);
    if (Array.isArray(ports)) {
        return ports.map((p) => {
            if (!p || !p.private_port) return '';
            const ext = `${p.public_port || '—'}`;
            return `<span style="font-family:monospace;font-size:12px;">${ext}</span>→<span style="color: var(--text-2)">${p.private_port}</span>`;
        }).join('<br>') || '—';
    }
    return '—';
}

function skeletonRows(count = 5) {
    const n = Math.max(1, Math.min(50, Number(count) || 5));
    const bar = (w, h = 12) => `<div class="ethos-skel" style="height:${h}px;width:${w};border-radius:6px;
            background:linear-gradient(90deg,var(--surface-2) 25%,var(--surface-1) 50%,var(--surface-2) 75%);
            background-size:200% 100%;animation:ethos-skel-shimmer 1.4s ease-in-out infinite;"></div>`;
    const widths = ['42%', '61%', '35%', '55%', '48%', '66%'];
    const row = (i) => `<div class="ethos-skeleton-row" style="display:flex;align-items:center;gap:14px;padding:9px 4px;border-bottom:1px solid var(--border);">
        ${bar('18px', 18)}${bar(widths[i % widths.length])}${bar('14%', 12)}${bar('22%', 12)}</div>`;
    return `<div class="ethos-skeleton" role="status" aria-label="Loading" aria-busy="true">
        ${Array.from({ length: n }, (_, i) => row(i)).join('')}</div>`;
}

function apiFetch(path, options) { return _ctx.apiFetch(path, options); }
function apiJsonFetch(path, options) { return _ctx.apiJsonFetch(path, options); }

// The global Notification Center is the only toast surface (docs/notifications.md).
// Legacy call sites pass (kind, message) — same auto-swap as core addNotification.
const NOTIFICATION_KINDS = ['success', 'error', 'warning', 'info'];
function addNotification(message, kind = 'info') {
    let text = message;
    let type = kind;
    if (NOTIFICATION_KINDS.includes(message) && !NOTIFICATION_KINDS.includes(kind)) {
        text = kind;
        type = message;
    }
    return _ctx.notifications.toast(String(text), type);
}

function showRestartOverlay(...args) { return _ctx.windows.showRestartOverlay(...args); }
function openLogs(options) { return _ctx.logs.open(options); }
function startTask(...args) { return _ctx.progress.startTask(...args); }


let _activeTab = 'containers';
let _pullVisible = false;
let _isAdmin = null;
let _engineJobTimer = null;
let _engineTask = null;   // shared progress row (core/progress.js)

const ENGINE_STEP_LABELS = {
    queued: 'Queued',
    check: 'Checking the host',
    install: 'Installing Docker Engine',
    verify: 'Verifying the daemon',
    done: 'Complete',
};

// ── Small helpers ────────────────────────────────────────────────

const STATUS_META = {
    running:    { dot: '#22c55e', badge: 'badge-green',  label: 'Running' },
    exited:     { dot: '#ef4444', badge: 'badge-red',    label: 'Exited' },
    paused:     { dot: '#eab308', badge: 'badge-yellow', label: 'Paused' },
    restarting: { dot: '#eab308', badge: 'badge-yellow', label: 'Restarting' },
    created:    { dot: '#94a3b8', badge: 'badge-blue',   label: 'Created' },
};

function _statusMeta(status) {
    return STATUS_META[status] || { dot: '#94a3b8', badge: 'badge-blue', label: String(status || '?').charAt(0).toUpperCase() + String(status || '').slice(1) };
}

function _cap(s) { return String(s || '?').charAt(0).toUpperCase() + String(s || '').slice(1); }

function _errorCard(e, retryFn) {
    const msg = e.message.includes('503') ? 'Docker daemon is not running or not accessible.' : (e.message || 'Unknown error');
    return `<div class="glass-card" style="text-align:center;padding:40px;">
        <div style="font-size:40px;margin-bottom:12px;opacity:.6;">⚠️</div>
        <p style="color:#ef4444;font-weight:600;margin-bottom:6px;">${escapeHtml(msg)}</p>
        ${retryFn ? `<button class="btn-ghost" onclick="${retryFn}" style="margin-top:12px;">🔄 Try again</button>` : ''}
    </div>`;
}

function _emptyCard(emoji, title, hint) {
    return `<div class="glass-card" style="text-align:center;padding:48px 24px;">
        <div style="font-size:56px;margin-bottom:16px;opacity:.5;">${emoji}</div>
        <p style="font-size:16px;font-weight:600;color: var(--text-2);margin-bottom:4px;">${escapeHtml(title)}</p>
        <p style="font-size:13px;color: var(--text-3);">${hint || ''}</p>
    </div>`;
}

// ════════════════════════════════════════════
// ENGINE STATUS / PROVISIONING
// ════════════════════════════════════════════

async function _adminCheck() {
    if (_isAdmin !== null) return _isAdmin;
    try {
        const me = await apiJsonFetch('/api/auth/me');
        _isAdmin = me?.role === 'admin';
    } catch (_) {
        _isAdmin = false;  // unknown role never unlocks admin-only buttons
    }
    return _isAdmin;
}

async function _engineStatus() {
    try {
        return await apiJsonFetch('/api/docker/engine');
    } catch (_) {
        return null;  // fall back to the normal tabs; they show their own error card
    }
}

function _stopEnginePolling() {
    if (_engineJobTimer) {
        clearTimeout(_engineJobTimer);
        _engineJobTimer = null;
    }
}

function _engineDiagnostics(engine) {
    const rows = [
        ['Docker CLI', engine.cli ? 'found' : 'not found'],
        ['Daemon socket', engine.socket && engine.socket.exists ? engine.socket.path : 'missing'],
        ['Compose plugin', engine.compose || 'not available'],
        ['docker group', engine.group_member ? 'active'
            : (engine.group_granted ? 'granted — restart required' : 'not granted')],
    ];
    return `<ul style="font-size:12px;color:var(--text-2);margin:12px 0 0;padding-left:18px;line-height:1.7;" data-testid="docker-engine-diagnostics">
        ${rows.map(([key, value]) => `<li>${escapeHtml(key)}: <b style="font-weight:600;">${escapeHtml(value)}</b></li>`).join('')}
    </ul>`;
}

function _renderEngineJob(box, job) {
    if (!box) return;
    const status = job.status || 'running';
    const running = status === 'queued' || status === 'running';
    const pct = typeof job.progress === 'number' && Number.isFinite(job.progress)
        ? Math.max(0, Math.min(100, Math.round(job.progress))) : null;
    const step = ENGINE_STEP_LABELS[job.step] || job.step || 'Working';
    const lastLog = Array.isArray(job.log) && job.log.length ? String(job.log[job.log.length - 1]) : '';

    // Shared task row (inline host) — same markup/CSS as uploads and file ops.
    if (!_engineTask) {
        _engineTask = startTask({
            appId: 'docker',
            title: step,
            detail: 'Docker Engine installation',
            log: lastLog,
            host: box,
            testIdPrefix: 'docker-engine',
        });
    }
    if (running) {
        _engineTask.update({ title: step, detail: 'Docker Engine installation', log: lastLog, percent: pct });
    } else {
        _engineTask.finish(status === 'success' ? 'done' : status === 'cancelled' ? 'cancelled' : 'failed', {
            percent: pct == null ? 100 : pct,
            log: lastLog,
            detail: job.error || (status === 'success' ? ENGINE_STEP_LABELS.done : step),
        });
    }
}

function _watchEngineJob(body, jobId) {
    _stopEnginePolling();
    const box = body ? body.querySelector('#engineJobBox') : null;
    if (_engineTask) { _engineTask.dismiss(); _engineTask = null; }
    _renderEngineJob(box, { status: 'queued', step: 'check', progress: 0, log: [] });

    const tick = async () => {
        try {
            const job = await apiJsonFetch(`/api/docker/engine/jobs/${encodeURIComponent(jobId)}`);
            _renderEngineJob(box, job);
            if (['success', 'failed', 'cancelled'].includes(job.status)) {
                if (job.status === 'success') addNotification('success', 'Docker Engine installed');
                else addNotification(`Docker installation failed: ${job.error || job.status}`, 'error');
                setTimeout(() => { if (body && body.isConnected) renderDockerApp(body); }, 1500);
                return;
            }
        } catch (e) {
            if (box) box.innerHTML = `<div style="font-size:12px;color:#ef4444;">${escapeHtml(e.message || 'Lost track of the installation job')}</div>`;
            return;
        }
        _engineJobTimer = setTimeout(tick, 900);
    };
    tick();
}

async function _renderEnginePanel(body, engine) {
    const content = body.querySelector('#dockerContent');
    if (!content) return;
    const meta = body.querySelector('[data-testid="docker-engine-meta"]');
    if (meta) meta.textContent = 'Docker Engine not available';

    const isAdmin = await _adminCheck();
    const conflict = engine.conflict || '';
    const restartNeeded = !!engine.restart_required;
    let title;
    let detail;
    let action = '';

    if (restartNeeded) {
        title = 'Docker Engine is installed — restart EthOS to activate it';
        detail = 'EthOS was added to the docker group after it started, so this process cannot open the Docker socket yet. A restart finishes the setup.';
        if (isAdmin) {
            action = `<button class="btn-primary" data-testid="docker-engine-restart" onclick="dockerRestartEthos()" style="font-size:13px;padding:8px 16px;">♻ Restart EthOS</button>`;
        }
    } else if (conflict) {
        title = 'Another container engine is installed';
        detail = conflict;
    } else if (!engine.helper) {
        title = 'Docker Engine is not installed';
        detail = 'EthOS needs its privileged installer helper before it can provision Docker. Re-run the service setup on the NAS (as root):';
        action = `<code style="display:inline-block;background:var(--surface-2);padding:6px 10px;border-radius:6px;font-size:12px;">sudo bash setup_scripts/setup_service.sh</code>`;
    } else if (!engine.install_supported) {
        title = 'Docker Engine cannot be installed automatically';
        detail = `Automatic installation is supported on Ubuntu and Debian. This system reports ${engine.os && engine.os.id ? engine.os.id : 'an unknown distribution'} ${engine.os && engine.os.version ? engine.os.version : ''}.`;
    } else {
        title = 'Docker Engine is not installed';
        detail = 'Install Docker Engine and Compose v2 from Docker’s official apt repository. This needs internet access and takes a few minutes.';
        if (isAdmin) {
            action = `<button class="btn-primary" data-testid="docker-engine-install" onclick="dockerInstallEngine(this)" style="font-size:13px;padding:8px 16px;">⬇ Install Docker Engine</button>`;
        } else {
            action = '<span style="font-size:12px;color:var(--text-3);">An administrator can install it from this screen.</span>';
        }
    }

    content.innerHTML = `
        <div class="glass-card" data-testid="docker-engine-panel" style="padding:24px;max-width:720px;">
            <div style="display:flex;align-items:flex-start;gap:12px;">
                <div style="font-size:32px;line-height:1;">🐳</div>
                <div style="min-width:0;">
                    <div style="font-size:15px;font-weight:700;color:var(--text-1);">${escapeHtml(title)}</div>
                    <div style="font-size:13px;color:var(--text-2);line-height:1.55;margin-top:6px;">${escapeHtml(detail)}</div>
                    ${_engineDiagnostics(engine)}
                </div>
            </div>
            ${action ? `<div style="display:flex;align-items:center;gap:10px;margin-top:16px;flex-wrap:wrap;">${action}</div>` : ''}
            <div id="engineJobBox" data-testid="docker-engine-job" style="margin-top:14px;"></div>
        </div>`;
}

// ════════════════════════════════════════════
// MAIN RENDERER
// ════════════════════════════════════════════

export async function renderDockerApp(body) {
    _stopEnginePolling();
    body.innerHTML = `
        <div style="display:flex;flex-direction:column;height:100%;background:var(--surface-0);color: var(--text-1);">
            <div style="padding:16px 20px 0;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                    <h2 style="font-size:18px;font-weight:700;color: var(--text-1);margin:0;">🐳 Docker Manager <span data-testid="docker-engine-meta" style="font-size:11px;font-weight:500;color:var(--text-3);margin-left:6px;"></span></h2>
                    <button class="btn-ghost" onclick="renderDockerApp(this.closest('.window-body'))" data-testid="docker-refresh-btn" style="font-size:12px;padding:5px 12px;">🔄 Refresh</button>
                </div>
            </div>
            <div id="dockerTabs" style="display:flex;border-bottom:1px solid var(--border);flex-shrink:0;background:var(--surface-0);padding:8px 20px 0;gap:4px;" data-testid="docker-tabs">
                <button class="docker-tab active" data-tab="containers" data-testid="docker-tab-containers" style="padding:10px 16px;background:none;border:none;color: var(--text-1);font-size:13px;font-weight:600;cursor:pointer;border-bottom:2px solid var(--accent);transition:all .15s;">Containers</button>
                <button class="docker-tab" data-tab="images" data-testid="docker-tab-images" style="padding:10px 16px;background:none;border:none;color: var(--text-3);font-size:13px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;transition:all .15s;">Images</button>
                <button class="docker-tab" data-tab="volumes" data-testid="docker-tab-volumes" style="padding:10px 16px;background:none;border:none;color: var(--text-3);font-size:13px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;transition:all .15s;">Volumes</button>
            </div>
            <div id="dockerContent" style="flex:1;overflow-y:auto;padding:16px 20px;">
                ${skeletonRows(6)}
            </div>
        </div>`;

    // The daemon has to answer before any tab makes sense. When it does not, the
    // screen explains why and offers the one-command install instead of four
    // tabs that can only fail with "Docker daemon is not running".
    const engine = await _engineStatus();
    if (engine && !engine.daemon) {
        const tabs = body.querySelector('#dockerTabs');
        if (tabs) tabs.style.display = 'none';
        await _renderEnginePanel(body, engine);
        return;
    }
    if (engine && engine.version) {
        const meta = body.querySelector('[data-testid="docker-engine-meta"]');
        if (meta) meta.textContent = `v${engine.version}${engine.compose ? ' · compose ' + engine.compose : ''}`;
    }

    body.querySelectorAll('.docker-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            _activeTab = tab.dataset.tab;
            body.querySelectorAll('.docker-tab').forEach(t => {
                t.style.color = 'var(--text-3)';
                t.style.borderBottomColor = 'transparent';
            });
            tab.style.color = 'var(--text-1)';
            tab.style.borderBottomColor = 'var(--accent)';
            if (_activeTab === 'containers') _loadContainersTab();
            else if (_activeTab === 'images') _loadImagesTab();
            else _loadVolumesTab();
        });
    });

    if (_activeTab === 'containers') await _loadContainersTab();
    else if (_activeTab === 'images') await _loadImagesTab();
    else await _loadVolumesTab();
}

// ════════════════════════════════════════════
// CONTAINERS TAB
// ════════════════════════════════════════════

// Compose projects the user has collapsed. Groups start expanded: a collapsed
// project hid every container a package (Package Center) had started, so the
// list looked like it only contained the standalone ones. Kept in module scope
// so the state survives refreshes (e.g. after an action re-renders the tab).
const _collapsedProjects = new Set();

// Package Center stacks are shown as system apps with the `ethos-` prefix. The
// real compose project name never changes — actions are sent with it.
function _projectLabel(name, info) {
    const managed = !!(info && info.managed);
    return managed && !/^ethos[-_]/i.test(name) ? `ethos-${name}` : name;
}

/** Section divider inside the containers table (System vs user projects). */
function _sectionRow(label, colspan = 6) {
    return `<tr class="docker-section-row"><td colspan="${colspan}" style="padding:16px 2px 6px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color: var(--text-3);">${escapeHtml(label)}</td></tr>`;
}

function _containerRow(c, project, hidden) {
    const safeName = escapeAttr(c.name || '?');
    const meta = _statusMeta(c.status);
    const isRunning = c.status === 'running';
    // Inside a compose group, show which service the container belongs to.
    const serviceTag = (project && c.compose_service)
        ? `<span style="color: var(--text-3);font-size:11px;font-weight:400;margin-left:6px;" title="compose service">· ${escapeHtml(c.compose_service)}</span>`
        : '';
    // Diagnostics: a running container with no network endpoint cannot resolve
    // its peers (EAI_AGAIN), and `restart: no` means a stopped container never
    // comes back on its own — both make a stack look silently half up.
    let warn = '';
    const restarts = Number(c.restart_count || 0);
    if (c.status === 'restarting') {
        warn = `<div data-testid="container-warn-crashloop-${safeName}" style="color:#ef4444;font-size:11px;margin-top:3px;" title="Docker keeps restarting this container — open the logs to see why">↻ restart loop${restarts ? ` · ${restarts}× restarts` : ''}</div>`;
    } else if (c.network_detached) {
        warn = `<div data-testid="container-warn-network-${safeName}" style="color:#ef4444;font-size:11px;margin-top:3px;" title="Attached to no Docker network — DNS lookups for other services will fail">⚠ no network attached</div>`;
    } else if (!isRunning && (c.restart_policy || 'no') === 'no') {
        warn = `<div data-testid="container-warn-restart-${safeName}" style="color:#eab308;font-size:11px;margin-top:3px;" title="Restart policy is 'no' — this container stays down until started manually">⚠ won't auto-restart</div>`;
    } else if (c.health === 'unhealthy') {
        warn = `<div data-testid="container-warn-health-${safeName}" style="color:#ef4444;font-size:11px;margin-top:3px;">⚠ unhealthy</div>`;
    }

    return `<tr${project ? ` data-compose-child="${escapeAttr(project)}"` : ''}${hidden ? ' style="display:none;"' : ''}>
        <td>
            <span style="display:inline-flex;align-items:center;gap:7px;">
                <span style="width:8px;height:8px;border-radius:50%;background:${meta.dot};flex-shrink:0;"></span>
                <span class="${meta.badge}" data-testid="container-status-${safeName}" style="padding:2px 9px;border-radius:5px;font-size:11px;font-weight:600;">${escapeHtml(meta.label)}</span>
            </span>
        </td>
        <td style="font-weight:600;color: var(--text-1);">${escapeHtml(c.name || '?')}${serviceTag}</td>
        <td style="font-family:monospace;font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeAttr(c.image || '')}">${escapeHtml(c.image || '—')}</td>
        <td style="color: var(--text-2);font-size:12px;white-space:nowrap;">${escapeHtml(c.state || c.status || '—')}${warn}</td>
        <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:monospace;font-size:12px;" title="${escapeAttr(c.ports || '')}">${formatPorts(c.ports)}</td>
        <td>
            <div style="display:flex;gap:4px;">
                ${isRunning
                    ? `<button class="btn-ghost" data-testid="container-action-${safeName}-stop" onclick="dockerAction('${safeName}','stop',this)" style="font-size:11px;padding:3px 9px;color:#ef4444;" title="Stop container">⏹ Stop</button>
                       <button class="btn-ghost" data-testid="container-action-${safeName}-restart" onclick="dockerAction('${safeName}','restart',this)" style="font-size:11px;padding:3px 9px;color:#eab308;" title="Restart container">↻ Restart</button>`
                    : `<button class="btn-ghost" data-testid="container-action-${safeName}-start" onclick="dockerAction('${safeName}','start',this)" style="font-size:11px;padding:3px 9px;color:#22c55e;" title="Start container">▶ Start</button>`
                }
                <button class="btn-ghost" data-testid="container-action-${safeName}-logs" onclick="openContainerLogs('${safeName}')" style="font-size:11px;padding:3px 9px;color:#3b82f6;" title="View logs">📋 Logs</button>
                <button class="btn-ghost" data-testid="container-action-${safeName}-remove" onclick="dockerRemove('${safeName}',this)" style="font-size:11px;padding:3px 9px;color:#ef4444;" title="Remove container">🗑</button>
            </div>
        </td>
    </tr>`;
}

function _composeGroupRow(project, members, info) {
    const safe = escapeAttr(project);
    const label = _projectLabel(project, info);
    const running = members.filter(m => m.status === 'running').length;
    const restarting = members.filter(m => m.status === 'restarting').length;
    const expanded = !_collapsedProjects.has(project);
    const dot = running === members.length ? '#22c55e' : (running > 0 ? '#eab308' : '#ef4444');
    // A project's compose file can outlive its directory — say so instead of
    // showing buttons that silently fail (that was the "why can't I destroy" case).
    const known = !!info.known_location;
    const problem = info.location_problem || '';
    const upBtn = known
        ? `<button class="btn-ghost" data-testid="compose-action-${safe}-up" onclick="event.stopPropagation();dockerComposeAction('${safe}','up',this)" style="font-size:11px;padding:3px 9px;color:#22c55e;" title="docker compose up -d">⬆ Up</button>`
        : `<button class="btn-ghost" disabled data-testid="compose-action-${safe}-up" style="font-size:11px;padding:3px 9px;color: var(--text-3);opacity:.5;cursor:not-allowed;" title="${escapeAttr(problem || 'compose file not found')}">⬆ Up</button>`;
    // Project-level compose actions. Down/Destroy stay enabled even without a
    // compose file: the backend removes the stack by its Docker labels.
    const actions = `
                <span style="margin-left:auto;display:flex;gap:4px;">
                    ${upBtn}
                    <button class="btn-ghost" data-testid="compose-action-${safe}-down" onclick="event.stopPropagation();dockerComposeAction('${safe}','down',this)" style="font-size:11px;padding:3px 9px;color:#eab308;" title="${known ? 'docker compose down' : 'Compose file unavailable — stops and removes the project by label'}">⬇ Down</button>
                    <button class="btn-ghost" data-testid="compose-action-${safe}-destroy" onclick="event.stopPropagation();dockerComposeAction('${safe}','destroy',this)" style="font-size:11px;padding:3px 9px;color:#ef4444;" title="${known ? 'docker compose down --volumes' : 'Compose file unavailable — removes containers, network and volumes by label'}">💥 Destroy</button>
                </span>`;
    return `<tr class="compose-group-header" data-compose-group="${safe}" style="cursor:pointer;user-select:none;">
        <td colspan="6" style="background:var(--surface-1);">
            <div style="display:flex;align-items:center;gap:8px;padding:2px 0;">
                <span data-chevron style="font-size:9px;color: var(--text-3);display:inline-block;transition:transform .15s;${expanded ? 'transform:rotate(90deg);' : ''}">▶</span>
                <span style="font-weight:700;font-size:13px;color: var(--text-1);"${label !== project ? ` title="compose project: ${escapeAttr(project)}"` : ''}>📁 ${escapeHtml(label)}</span>
                <span class="badge-blue" data-testid="compose-group-count-${safe}" style="padding:2px 8px;border-radius:5px;font-size:11px;font-weight:600;">${members.length} service${members.length !== 1 ? 's' : ''}</span>
                <span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color: var(--text-3);">
                    <span style="width:8px;height:8px;border-radius:50%;background:${dot};"></span>
                    ${running}/${members.length} running
                </span>${restarting ? `<span data-testid="compose-group-restarting-${safe}" style="font-size:12px;font-weight:600;color:#ef4444;">↻ ${restarting} restarting</span>` : ''}${problem ? `<span data-testid="compose-group-problem-${safe}" style="font-size:11px;color:#eab308;" title="${escapeAttr(problem)}">⚠ compose file unavailable</span>` : ''}${actions}
            </div>
        </td>
    </tr>`;
}

async function _loadContainersTab() {
    const content = document.getElementById('dockerContent');
    if (!content) return;
    content.innerHTML = skeletonRows(6);

    try {
        const [r, cr] = await Promise.all([apiFetch('/api/containers'), apiFetch('/api/compose/projects')]);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = await r.json();
        const cs = d.containers || [];

        // Compose project metadata (working dir / known location) for the group action buttons.
        let composeProjects = [];
        if (cr.ok) {
            const cd = await cr.json().catch(() => ({}));
            composeProjects = cd.projects || [];
        }
        const projectInfo = new Map(composeProjects.map(p => [p.name, p]));

        // Group by docker-compose project; containers without a compose label are standalone.
        const groups = new Map();
        const standalone = [];
        for (const c of cs) {
            if (c.compose_project) {
                if (!groups.has(c.compose_project)) groups.set(c.compose_project, []);
                groups.get(c.compose_project).push(c);
            } else {
                standalone.push(c);
            }
        }

        // Projects remembered by the backend but currently down (no containers) — can be brought back up.
        const stoppedProjects = composeProjects.filter(p => p.container_count === 0 && p.known_location);

        let html = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <span style="font-size:13px;color: var(--text-2);">
                    ${cs.length > 0 ? `<span class="badge-green" data-testid="containers-running-badge" style="padding:3px 10px;border-radius:6px;font-size:11px;font-weight:600;">${d.running_count} running</span>` : ''}
                    <span style="margin-left:8px;color: var(--text-3);font-size:12px;">${cs.length} total</span>
                    ${groups.size > 0 ? `<span style="margin-left:8px;color: var(--text-3);font-size:12px;">· ${groups.size} compose project${groups.size !== 1 ? 's' : ''}</span>` : ''}
                    ${stoppedProjects.length > 0 ? `<span style="margin-left:8px;color: var(--text-3);font-size:12px;">· ${stoppedProjects.length} stopped</span>` : ''}
                </span>
                <button class="btn-ghost" onclick="renderDockerApp(this.closest('.window-body'))" data-testid="containers-refresh-btn" style="font-size:12px;padding:5px 12px;">🔄 Refresh</button>
            </div>`;

        if (cs.length === 0) {
            content.innerHTML = html + _emptyCard('🐳', 'No containers found', 'Start a Docker container to see it here');
            return;
        }

        // Containers that will not recover on their own: crash-looping, stopped
        // with restart=no, or running without a network. Surfacing them is the
        // point of this screen — a "half up" stack should never look healthy.
        const attention = cs.filter(c => c.status === 'restarting'
            || c.network_detached
            || (c.status === 'exited' && (c.restart_policy || 'no') === 'no'));
        const crashLoops = attention.filter(c => c.status === 'restarting');
        if (attention.length) {
            const names = attention.slice(0, 4).map(c => c.name).join(', ');
            html += `<div class="glass-card" data-testid="containers-attention-banner" style="border-left:3px solid #ef4444;padding:10px 14px;margin-bottom:12px;display:flex;align-items:flex-start;gap:10px;">
                <span style="font-size:18px;line-height:1;">⚠️</span>
                <div style="font-size:13px;color: var(--text-1);line-height:1.45;">
                    <b>${attention.length} container${attention.length !== 1 ? 's' : ''} need${attention.length === 1 ? 's' : ''} attention</b>${crashLoops.length ? ` — ${crashLoops.length} stuck in a restart loop` : ''}.
                    <div style="color: var(--text-3);font-size:12px;margin-top:2px;">${escapeHtml(names)}${attention.length > 4 ? ` +${attention.length - 4} more` : ''} · open 📋 Logs to see the reason.</div>
                </div>
            </div>`;
        }

        html += `<table class="app-table" data-testid="containers-table"><thead><tr>
            <th>Status</th><th>Name</th><th>Image</th><th>State</th><th>Ports</th><th style="width:190px;">Actions</th>
        </tr></thead><tbody>`;

        // Compose projects as collapsible groups (expanded by default), then standalone containers.
        // Package Center stacks get their own System section, shown with the `ethos-` prefix.
        const projectGroups = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        const _isManaged = ([project]) => !!(projectInfo.get(project) || {}).managed;
        const systemGroups = projectGroups.filter(_isManaged);
        const userGroups = projectGroups.filter(g => !_isManaged(g));
        const _renderGroup = ([project, members]) => {
            const expanded = !_collapsedProjects.has(project);
            let out = _composeGroupRow(project, members, projectInfo.get(project) || {});
            for (const c of members) out += _containerRow(c, project, !expanded);
            return out;
        };
        if (systemGroups.length) {
            html += _sectionRow('System');
            for (const g of systemGroups) html += _renderGroup(g);
        }
        if (userGroups.length) {
            html += _sectionRow('Compose projects');
            for (const g of userGroups) html += _renderGroup(g);
        }
        if (standalone.length) {
            html += _sectionRow('Standalone containers');
            for (const c of standalone) html += _containerRow(c);
        }

        html += '</tbody></table>';

        // Stopped projects (no containers left) — kept reachable so they can be brought back up.
        if (stoppedProjects.length > 0) {
            html += `<div style="margin-top:16px;">
                <div style="font-size:11px;font-weight:600;color: var(--text-3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">⏸ Stopped projects</div>
                <table class="app-table" data-testid="stopped-projects-table"><thead><tr>
                    <th>Project</th><th>Location</th><th style="width:100px;"></th>
                </tr></thead><tbody>`;
            const stoppedSystem = stoppedProjects.filter(p => p.managed);
            const stoppedUser = stoppedProjects.filter(p => !p.managed);
            const _stoppedRows = (list) => list.map(p => {
                const safe = escapeAttr(p.name);
                const label = _projectLabel(p.name, p);
                return `<tr>
                    <td style="font-weight:600;color: var(--text-1);"${label !== p.name ? ` title="compose project: ${escapeAttr(p.name)}"` : ''}>📁 ${escapeHtml(label)}</td>
                    <td style="color: var(--text-3);font-family:monospace;font-size:11px;max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeAttr(p.working_dir || '')}">${escapeHtml(p.working_dir || '—')}</td>
                    <td><button class="btn-ghost" data-testid="compose-stopped-up-${safe}" onclick="dockerComposeAction('${safe}','up',this)" style="font-size:11px;padding:3px 9px;color:#22c55e;" title="docker compose up -d">⬆ Up</button></td>
                </tr>`;
            }).join('');
            if (stoppedSystem.length) html += _sectionRow('System', 3) + _stoppedRows(stoppedSystem);
            if (stoppedUser.length) html += _sectionRow('Compose projects', 3) + _stoppedRows(stoppedUser);
            html += '</tbody></table>';
        }

        content.innerHTML = html;

        // Wire up group expand/collapse.
        content.querySelectorAll('.compose-group-header').forEach(h => {
            h.addEventListener('click', () => {
                const project = h.dataset.composeGroup;
                if (_collapsedProjects.has(project)) _collapsedProjects.delete(project);
                else _collapsedProjects.add(project);
                const expanded = !_collapsedProjects.has(project);
                content.querySelectorAll(`tr[data-compose-child="${CSS.escape(project)}"]`).forEach(row => {
                    row.style.display = expanded ? '' : 'none';
                });
                const chev = h.querySelector('[data-chevron]');
                if (chev) chev.style.transform = expanded ? 'rotate(90deg)' : '';
            });
        });
    } catch (e) {
        content.innerHTML = _errorCard(e, "renderDockerApp(document.getElementById('dockerContent').closest('.window-body'))");
    }
}

// ════════════════════════════════════════════
// IMAGES TAB
// ════════════════════════════════════════════

async function _loadImagesTab() {
    const content = document.getElementById('dockerContent');
    if (!content) return;
    content.innerHTML = skeletonRows(6);

    try {
        const r = await apiFetch('/api/images');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = await r.json();
        const imgs = d.images || [];

        let html = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
                <span style="font-size:13px;color: var(--text-2);">
                    ${imgs.length} image${imgs.length !== 1 ? 's' : ''}${d.total_size_bytes ? ` · ${formatBytes(d.total_size_bytes)}` : ''}
                </span>
                <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                    ${_pullVisible ? `<input id="imagesPullInput" data-testid="images-pull-input" type="text" placeholder="e.g. nginx:latest or bitnami/redis:7.2" style="padding:5px 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface-2);color: var(--text-1);font-size:13px;width:240px;" />
                        <button class="btn-primary" data-testid="images-pull-execute-btn" onclick="_executePull()" style="font-size:12px;padding:5px 14px;border-radius:8px;">⬇ Pull</button>
                        <button class="btn-ghost" data-testid="images-pull-cancel-btn" onclick="_cancelPullImage()">✕</button>` : ''}
                    ${_pullVisible ? '' : `<button class="btn-primary" onclick="_togglePull(this.closest('.window-body'))" data-testid="images-pull-btn" style="font-size:12px;padding:5px 14px;border-radius:8px;">⬇ Pull Image</button>`}
                    <button class="btn-ghost" onclick="_pruneImages()" data-testid="images-prune-btn" style="font-size:12px;padding:5px 12px;color:#ef4444;" title="Remove all unused images">🗑 Prune</button>
                    <button class="btn-ghost" onclick="renderDockerApp(this.closest('.window-body'))" data-testid="images-refresh-btn" style="font-size:12px;padding:5px 12px;">🔄 Refresh</button>
                </div>
            </div>`;

        if (imgs.length === 0) {
            content.innerHTML = html + _emptyCard('🖼️', 'No Docker images found', 'Click "⬇ Pull Image" to pull one from a registry');
            return;
        }

        html += `<table class="app-table"><thead><tr>
            <th>Repository</th><th>Tag</th><th>ID</th><th>Size</th><th>Created</th><th>Status</th><th style="width:50px;"></th>
        </tr></thead><tbody>`;

        for (const img of imgs) {
            const isDangling = img.is_dangling;
            const sizeStr = img.size?.raw ? formatBytes(img.size.raw) : '—';
            const createdDate = img.created_at ? new Date(img.created_at).toLocaleDateString() : '—';
            const statusBadge = isDangling
                ? '<span class="badge-yellow" style="padding:2px 8px;border-radius:5px;font-size:11px;font-weight:600;">Dangling</span>'
                : img.in_use
                    ? '<span class="badge-green" style="padding:2px 8px;border-radius:5px;font-size:11px;font-weight:600;">In use</span>'
                    : '<span class="badge-blue" style="padding:2px 8px;border-radius:5px;font-size:11px;font-weight:600;">Unused</span>';

            html += `<tr>
                <td style="font-weight:600;color: var(--text-1);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeAttr(img.repository || '')}">
                    ${isDangling ? '<span style="color: var(--text-3);font-style:italic;">&lt;none&gt;</span>' : escapeHtml(img.repository)}
                </td>
                <td><span class="badge-blue" style="padding:2px 8px;border-radius:5px;font-size:11px;font-family:monospace;">${escapeHtml(img.tag || 'latest')}</span></td>
                <td style="font-family:monospace;font-size:11px;color: var(--text-3);">${escapeHtml((img.id || '').replace('sha256:', ''))}</td>
                <td style="font-family:monospace;font-size:12px;white-space:nowrap;">${sizeStr}</td>
                <td style="color: var(--text-2);font-size:12px;white-space:nowrap;">${createdDate}</td>
                <td>${statusBadge}</td>
                <td>
                    <button class="btn-ghost" data-testid="image-delete-${escapeAttr(img.id || img.repository)}" onclick="_deleteImage('${jsAttr(img.id || img.repository)}')" title="Delete image" style="font-size:11px;padding:3px 8px;color:#ef4444;">🗑</button>
                </td>
            </tr>`;
        }
        html += '</tbody></table>';
        content.innerHTML = html;
    } catch (e) {
        content.innerHTML = _errorCard(e, "renderDockerApp(document.getElementById('dockerContent').closest('.window-body'))");
    }
}

// ════════════════════════════════════════════
// VOLUMES TAB
// ════════════════════════════════════════════

async function _loadVolumesTab() {
    const content = document.getElementById('dockerContent');
    if (!content) return;
    content.innerHTML = skeletonRows(5);

    try {
        const r = await apiFetch('/api/volumes');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = await r.json();
        const vols = d.volumes || [];

        let html = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <span style="font-size:13px;color: var(--text-2);">
                    ${vols.length} volume${vols.length !== 1 ? 's' : ''}${d.orphaned_count > 0 ? ` · <span style="color:#eab308;">${d.orphaned_count} orphaned</span>` : ''}
                </span>
                <span style="display:flex;gap:6px;align-items:center;">
                    <button class="btn-ghost" onclick="_pruneVolumes()" data-testid="volumes-prune-btn" title="Remove all unused volumes (named + anonymous)" style="font-size:12px;padding:5px 12px;color:#eab308;">🧹 Prune unused${d.orphaned_count > 0 ? ` (${d.orphaned_count})` : ''}</button>
                    <button class="btn-ghost" onclick="renderDockerApp(this.closest('.window-body'))" data-testid="volumes-refresh-btn" style="font-size:12px;padding:5px 12px;">🔄 Refresh</button>
                </span>
            </div>`;

        if (vols.length === 0) {
            content.innerHTML = html + _emptyCard('💾', 'No Docker volumes found', 'Create one with <code style="background:var(--surface-2);padding:2px 6px;border-radius:4px;">docker volume create</code>');
            return;
        }

        const anySize = vols.some(v => v.size != null);

        html += `<table class="app-table"><thead><tr>
            <th>Name</th><th>Driver</th>${anySize ? '<th>Size</th>' : ''}<th>Mountpoint</th><th>Status</th><th style="width:50px;"></th>
        </tr></thead><tbody>`;

        for (const v of vols) {
            const isOrphan = v.is_orphaned;
            const heldByExited = (v.held_by_exited || []).length > 0;
            const statusBadge = isOrphan
                ? '<span class="badge-yellow" style="padding:2px 8px;border-radius:5px;font-size:11px;font-weight:600;">Orphaned</span>'
                : heldByExited
                    ? `<span class="badge-blue" style="padding:2px 8px;border-radius:5px;font-size:11px;font-weight:600;cursor:help;" title="Referenced by exited container(s): ${(v.held_by_exited || []).join(', ')} — remove those containers first to free this volume">Held (exited)</span>`
                    : '<span class="badge-green" style="padding:2px 8px;border-radius:5px;font-size:11px;font-weight:600;">In use</span>';
            html += `<tr>
                <td style="font-weight:600;color: var(--text-1);font-family:monospace;font-size:12px;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeAttr(v.name)}">${escapeHtml(v.name)}</td>
                <td style="color: var(--text-2);font-size:12px;">${escapeHtml(v.driver || 'local')}</td>
                ${anySize ? `<td style="font-family:monospace;font-size:12px;white-space:nowrap;">${v.size_human ? escapeHtml(v.size_human) : '—'}</td>` : ''}
                <td style="color: var(--text-3);font-family:monospace;font-size:11px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeAttr(v.mountpoint || '')}">${escapeHtml(v.mountpoint || '—')}</td>
                <td>${statusBadge}</td>
                <td>
                    <button class="btn-ghost" data-testid="volume-delete-${escapeAttr(v.name)}" onclick="_deleteVolume('${jsAttr(v.name)}')" title="Delete volume" style="font-size:11px;padding:3px 8px;color:#ef4444;">🗑</button>
                </td>
            </tr>`;
        }
        html += '</tbody></table>';
        content.innerHTML = html;
    } catch (e) {
        content.innerHTML = _errorCard(e, "renderDockerApp(document.getElementById('dockerContent').closest('.window-body'))");
    }
}

// ════════════════════════════════════════════
// GLOBAL FUNCTIONS (inline onclick handlers)
// ════════════════════════════════════════════

function _reloadCurrentTab(bodyEl) {
    if (!bodyEl || typeof renderDockerApp !== 'function') return;
    renderDockerApp(bodyEl);
}

window.dockerInstallEngine = async function(btnEl) {
    const ok = await window.showModalConfirm(
        'Install Docker Engine',
        'Install Docker Engine and Compose v2 from Docker’s official apt repository?\n\n' +
        'This downloads packages and takes a few minutes. EthOS keeps running, but a restart is needed afterwards to activate Docker access.'
    );
    if (!ok) return;
    const body = btnEl ? btnEl.closest('.window-body') : document.querySelector('[data-testid="window-pkg-ethos-docker"] .window-body');
    if (btnEl) { btnEl.disabled = true; btnEl.style.opacity = '0.6'; }
    try {
        const res = await apiFetch('/api/docker/engine/install', { method: 'POST' });
        if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            throw new Error(d.detail || `HTTP ${res.status}`);
        }
        const data = await res.json();
        if (data.status === 'already_running') {
            renderDockerApp(body);
            return;
        }
        addNotification('Installing Docker Engine…', 'info');
        _watchEngineJob(body, data.job_id);
    } catch (e) {
        addNotification(e.message, 'error');
        if (btnEl) { btnEl.disabled = false; btnEl.style.opacity = '1'; }
    }
};

window.dockerRestartEthos = async function() {
    const ok = await window.showModalConfirm(
        'Restart EthOS',
        'Restart EthOS NAS to activate Docker access?\n\nThe web server restarts and this page refreshes automatically.'
    );
    if (!ok) return;
    try {
        const res = await apiFetch('/api/system/restart', { method: 'POST' });
        if (res.ok) showRestartOverlay();
        else addNotification('Restart failed', 'error');
    } catch (_) {
        addNotification('Could not reach the server', 'error');
    }
};

window.dockerAction = function(name, action, btnEl) {
    const verb = action === 'stop' ? 'Stop' : action === 'restart' ? 'Restart' : 'Start';
    window.showModalConfirm('Docker Action', `${verb} container "${name}"?`).then(ok => {
        if (!ok) return;

        if (btnEl) { btnEl.disabled = true; btnEl.style.opacity = '0.5'; }

        apiFetch(`/api/containers/${encodeURIComponent(name)}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action })
        })
        .then(async r => {
            if (!r.ok) {
                const d = await r.json().catch(() => ({}));
                throw new Error(d.detail || `HTTP ${r.status}`);
            }
            addNotification('success', `Container "${name}" ${action}ed`);
            _reloadCurrentTab(btnEl ? btnEl.closest('.window-body') : document.querySelector('[data-testid="window-pkg-ethos-docker"] .window-body'));
        })
        .catch(e => {
            addNotification('error', `Action failed: ${e.message}`);
            if (btnEl) { btnEl.disabled = false; btnEl.style.opacity = '1'; }
        });
    });
};

window.dockerComposeAction = function(project, action, btnEl) {
    const prompts = {
        up:      ['Compose Up', `Run "docker compose up -d" for project "${project}"? Starts stopped services and applies compose file changes (may pull images).`],
        down:    ['Compose Down', `Run "docker compose down" for project "${project}"? Containers and networks are removed. Volumes (data) are kept.`],
        destroy: ['Compose Destroy', `Run "docker compose down --volumes" for project "${project}"? ALL containers, networks AND named volumes are removed — data in those volumes is lost. Images are kept.`],
    };
    const [title, msg] = prompts[action];
    window.showModalConfirm(title, msg).then(ok => {
        if (!ok) return;

        if (btnEl) { btnEl.disabled = true; btnEl.style.opacity = '0.5'; }

        apiFetch(`/api/compose/projects/${encodeURIComponent(project)}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action })
        })
        .then(async r => {
            if (!r.ok) {
                const d = await r.json().catch(() => ({}));
                throw new Error((d.detail || `HTTP ${r.status}`).slice(0, 300));
            }
            const verb = action === 'up' ? 'started' : action === 'down' ? 'stopped' : 'destroyed';
            addNotification('success', `Project "${project}" ${verb}`);
            _reloadCurrentTab(btnEl ? btnEl.closest('.window-body') : document.querySelector('[data-testid="window-pkg-ethos-docker"] .window-body'));
        })
        .catch(e => {
            addNotification('error', `Compose ${action} failed: ${e.message}`);
            if (btnEl) { btnEl.disabled = false; btnEl.style.opacity = '1'; }
        });
    });
};

window.dockerRemove = function(name, btnEl) {
    window.showModalConfirm('Remove Container', `Permanently remove container "${name}"? Its data in named volumes is kept.`).then(ok => {
        if (!ok) return;

        apiFetch(`/api/containers/${encodeURIComponent(name)}`, { method: 'DELETE' })
            .then(async r => {
                if (r.status === 409) {
                    addNotification('error', `"${name}" is running — stop it first`);
                    return;
                }
                if (!r.ok) {
                    const d = await r.json().catch(() => ({}));
                    throw new Error(d.detail || `HTTP ${r.status}`);
                }
                addNotification('success', `Container "${name}" removed`);
                _reloadCurrentTab(btnEl ? btnEl.closest('.window-body') : document.querySelector('[data-testid="window-pkg-ethos-docker"] .window-body'));
            })
            .catch(e => addNotification('error', `Remove failed: ${e.message}`));
    });
};

window.openContainerLogs = function(name) {
    // One viewer for every source (docs/logs.md) — no handoff globals.
    openLogs({ container: name });
};

// Pull controls
window._togglePull = function (bodyEl) {
    _pullVisible = !_pullVisible;
    if (_activeTab === 'images') _loadImagesTab();
    else if (bodyEl) renderDockerApp(bodyEl);
};

async function _cancelPullImage() {
    _pullVisible = false;
    await _loadImagesTab();
}
// Inline onclick handlers resolve against the global scope, and this is an ES
// module — without the explicit window assignment the ✕ button did nothing.
window._cancelPullImage = _cancelPullImage;

async function _executePull() {
    const input = document.getElementById('imagesPullInput');
    if (!input) return;
    const name = input.value.trim();
    if (!name) { addNotification('error', 'Please enter an image reference (e.g. nginx:latest)'); return; }

    try {
        const r = await apiFetch('/api/images/pull', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: name }),
        });
        if (!r.ok) {
            const d = await r.json().catch(() => ({}));
            throw new Error(d.detail || `HTTP ${r.status}`);
        }
        addNotification('success', `Image "${name}" pulled successfully`);
        _pullVisible = false;
        await _loadImagesTab();
    } catch (e) {
        addNotification('error', `Pull failed: ${e.message}`);
    }
}

window._executePull = _executePull;

// Delete image
async function _deleteImage(idOrTag) {
    const displayName = idOrTag.split(':')[0] || idOrTag;
    if (!await window.showModalConfirm('Delete Image', `Delete Docker image "${displayName}"?`)) return;
    try {
        const r = await apiFetch(`/api/images/${encodeURIComponent(idOrTag)}`, { method: 'DELETE' });
        if (r.status === 409) {
            addNotification('error', `"${displayName}" is in use by a container — remove it first`);
            return;
        }
        if (!r.ok) {
            const d = await r.json().catch(() => ({}));
            throw new Error(d.detail || `HTTP ${r.status}`);
        }
        addNotification('success', `Image "${displayName}" deleted`);
        _loadImagesTab();
    } catch (e) {
        addNotification('error', `Delete failed: ${e.message}`);
    }
}

window._deleteImage = _deleteImage;

// Prune images
async function _pruneImages() {
    if (!await window.showModalConfirm('Prune Images', 'Remove ALL unused Docker images? This cannot be undone.')) return;
    try {
        const r = await apiFetch('/api/images/prune', { method: 'POST' });
        if (!r.ok) {
            const d = await r.json().catch(() => ({}));
            throw new Error(d.detail || `HTTP ${r.status}`);
        }
        const data = await r.json();
        addNotification('success', data.message || 'Images pruned successfully');
        _loadImagesTab();
    } catch (e) {
        addNotification('error', `Prune failed: ${e.message}`);
    }
}

window._pruneImages = _pruneImages;

// Delete volume
async function _deleteVolume(name) {
    if (!await window.showModalConfirm('Delete Volume', `Delete Docker volume "${name}"? All data in it will be lost.`)) return;
    try {
        const r = await apiFetch(`/api/volumes/${encodeURIComponent(name)}`, { method: 'DELETE' });
        if (r.status === 409) {
            addNotification('error', `"${name}" is in use by a container — remove it first`);
            return;
        }
        if (!r.ok) {
            const d = await r.json().catch(() => ({}));
            throw new Error(d.detail || `HTTP ${r.status}`);
        }
        addNotification('success', `Volume "${name}" deleted`);
        _loadVolumesTab();
    } catch (e) {
        addNotification('error', `Delete failed: ${e.message}`);
    }
}

window._deleteVolume = _deleteVolume;

// Prune volumes
async function _pruneVolumes() {
    if (!await window.showModalConfirm('Prune Volumes', 'Remove all unused Docker volumes (named + anonymous)? All data in them will be lost.\n\nVolumes still referenced by any container — including stopped ones — are kept.')) return;
    try {
        const r = await apiFetch('/api/volumes/prune', { method: 'POST' });
        if (!r.ok) {
            const d = await r.json().catch(() => ({}));
            throw new Error(d.detail || `HTTP ${r.status}`);
        }
        const data = await r.json();
        addNotification('success', data.message || 'Volumes pruned successfully');
        _loadVolumesTab();
    } catch (e) {
        addNotification('error', `Prune failed: ${e.message}`);
    }
}

window._pruneVolumes = _pruneVolumes;

// Expose globally for onclick handlers
window.renderDockerApp = renderDockerApp;

// ── Package entry point ──────────────────────────────────────────────────────
export async function render(container, ctx) {
    _ctx = ctx;
    ctx.log('info', 'Docker Manager opened');
    await renderDockerApp(container);
}
