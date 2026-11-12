(() => {
    'use strict';

    const healthEl = document.getElementById('health');
    const statusEl = document.getElementById('status');
    const startupEl = document.getElementById('startup');
    const pathEl = document.getElementById('path');
    const scanBtn = document.getElementById('scan');
    const results = document.getElementById('results');
    const cleanEl = document.getElementById('clean-count');
    const threatEl = document.getElementById('threat-count');
    const errorEl = document.getElementById('error-count');
    const threatsBox = document.getElementById('threats');
    const threatRows = document.getElementById('threat-rows');
    const errorsBox = document.getElementById('errors');
    const errorRows = document.getElementById('error-rows');
    const engineEl = document.getElementById('engine');

    let ready = false;
    let scanning = false;

    async function checkHealth() {
        try {
            const response = await fetch('/api/health', { cache: 'no-store' });
            const data = await response.json();
            if (response.ok && data.status === 'ready') {
                if (!ready && !scanning) statusEl.textContent = 'Ready.';
                ready = true;
                healthEl.className = 'pill ready';
                healthEl.textContent = 'Scanner ready';
                healthEl.title = data.engine || '';
                engineEl.textContent = data.engine || '';
                startupEl.hidden = true;
            } else {
                ready = false;
                healthEl.className = 'pill starting';
                healthEl.textContent = 'Starting scanner…';
                healthEl.title = data.detail || 'ClamAV is loading signatures';
                startupEl.hidden = false;
                if (!scanning) {
                    statusEl.textContent = 'ClamAV is starting. The first run downloads signatures and can take a few minutes.';
                }
            }
        } catch (_) {
            ready = false;
            healthEl.className = 'pill offline';
            healthEl.textContent = 'Scanner offline';
            startupEl.hidden = false;
            if (!scanning) statusEl.textContent = 'Waiting for the scanner container…';
        }
        scanBtn.disabled = scanning || !ready;
    }

    function setRows(container, items) {
        container.replaceChildren(...items);
    }

    function render(data) {
        cleanEl.textContent = String(data.clean || 0);
        threatEl.textContent = String((data.infected || []).length);
        errorEl.textContent = String((data.errors || []).length);
        results.hidden = false;

        threatsBox.hidden = !(data.infected || []).length;
        setRows(threatRows, (data.infected || []).map((item) => {
            const row = document.createElement('tr');
            const file = document.createElement('td');
            file.textContent = item.file;
            const signature = document.createElement('td');
            signature.textContent = item.signature;
            row.append(file, signature);
            return row;
        }));

        errorsBox.hidden = !(data.errors || []).length;
        setRows(errorRows, (data.errors || []).map((item) => {
            const entry = document.createElement('li');
            entry.textContent = item;
            return entry;
        }));
        engineEl.textContent = data.engine || '';
    }

    async function scan() {
        if (scanning) return;
        if (!ready) {
            statusEl.textContent = 'Scanner is still starting. Wait for signatures to load.';
            return;
        }
        scanning = true;
        scanBtn.disabled = true;
        statusEl.textContent = `Scanning ${pathEl.value}… this can take a while.`;
        try {
            const response = await fetch('/api/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: pathEl.value }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
            render(data);
            const threats = (data.infected || []).length;
            statusEl.textContent = threats
                ? `Scan finished: ${threats} threat${threats === 1 ? '' : 's'} found.`
                : `Scan finished: ${data.clean || 0} clean file${data.clean === 1 ? '' : 's'} checked.`;
        } catch (error) {
            statusEl.textContent = `Scan failed: ${error.message}`;
        } finally {
            scanning = false;
            scanBtn.disabled = !ready;
        }
    }

    scanBtn.addEventListener('click', scan);
    pathEl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') scan();
    });
    document.querySelectorAll('[data-path]').forEach((button) => {
        button.addEventListener('click', () => {
            pathEl.value = button.dataset.path;
            pathEl.focus();
        });
    });

    checkHealth();
    setInterval(checkHealth, 5000);
})();
