// LauncherRenderer — рендерер для вкладки Launcher
// Не наследует BaseObjectRenderer (Launcher не является UniSet2-объектом)
class LauncherRenderer {
    constructor(nodeName, tabKey, nodeId, launcherUrl, hasControl) {
        this.nodeName = nodeName;
        this.tabKey = tabKey;
        this.nodeId = nodeId;
        this.launcherUrl = launcherUrl;
        this.hasControlToken = hasControl || false; // есть ли controlToken на бэкенде
        this.controlActive = false; // пользователь взял управление
        this.processes = [];
        this.groups = [];
        this.filterText = '';
        this.autoRefreshInterval = null;
    }

    createPanelHTML() {
        const takeBtn = this.hasControlToken
            ? `<span class="launcher-control-badge readonly">
                   <span class="launcher-control-icon">&#128274;</span>
                   <button class="launcher-control-btn" id="launcher-take-${this.nodeId}">Take</button>
               </span>`
            : '';

        return `
            <div class="launcher-panel">
                <div class="launcher-header">
                    <div class="launcher-header-left">
                        <h2 class="launcher-title">${escapeHtml(this.nodeName)}</h2>
                        <span class="launcher-status-indicator" id="launcher-status-${this.nodeId}">
                            <span class="launcher-status-dot"></span>
                            <span class="launcher-status-text">Connecting...</span>
                        </span>
                    </div>
                    <div class="launcher-header-right">
                        <span class="launcher-control-info" id="launcher-control-${this.nodeId}">${takeBtn}</span>
                        ${this.launcherUrl ? `<a class="launcher-link" href="${escapeHtml(this.launcherUrl)}" target="_blank" rel="noopener noreferrer">Open Launcher UI</a>` : ''}
                    </div>
                </div>
                <div class="launcher-filter">
                    <input type="text" class="launcher-filter-input" id="launcher-filter-${this.nodeId}"
                           placeholder="Filter processes..." autocomplete="off">
                </div>
                <div class="launcher-content" id="launcher-content-${this.nodeId}">
                    <div class="launcher-loading">Loading processes...</div>
                </div>
            </div>
        `;
    }

    initialize() {
        // Обработчик фильтра
        const filterInput = document.getElementById(`launcher-filter-${this.nodeId}`);
        if (filterInput) {
            filterInput.addEventListener('input', (e) => {
                this.filterText = e.target.value.toLowerCase();
                this.renderProcessTable();
            });
        }

        // Обработчик Take Control
        this.attachTakeHandler();

        // Загружаем начальные данные
        this.loadStatus();

        // Авто-обновление каждые 5 секунд
        this.autoRefreshInterval = setInterval(() => this.loadStatus(), LAUNCHER_AUTO_REFRESH_INTERVAL);
    }

    attachTakeHandler() {
        const takeBtn = document.getElementById(`launcher-take-${this.nodeId}`);
        if (!takeBtn) return;

        takeBtn.addEventListener('click', () => {
            this.controlActive = !this.controlActive;
            this.updateControlUI();
            this.renderProcessTable();
        });
    }

    updateControlUI() {
        const container = document.getElementById(`launcher-control-${this.nodeId}`);
        if (!container) return;

        if (!this.hasControlToken) {
            container.innerHTML = '';
            return;
        }

        if (this.controlActive) {
            container.innerHTML = `
                <span class="launcher-control-badge active">
                    <span class="launcher-control-icon">&#10003;</span>
                    <span class="launcher-control-text">Control</span>
                    <button class="launcher-control-btn" id="launcher-release-${this.nodeId}">Release</button>
                </span>
            `;
            const releaseBtn = document.getElementById(`launcher-release-${this.nodeId}`);
            if (releaseBtn) {
                releaseBtn.addEventListener('click', () => {
                    this.controlActive = false;
                    this.updateControlUI();
                    this.renderProcessTable();
                });
            }
        } else {
            container.innerHTML = `
                <span class="launcher-control-badge readonly">
                    <span class="launcher-control-icon">&#128274;</span>
                    <button class="launcher-control-btn" id="launcher-take-${this.nodeId}">Take</button>
                </span>
            `;
            this.attachTakeHandler();
        }
    }

    async loadStatus() {
        try {
            const resp = await fetch(`/api/launchers/${encodeURIComponent(this.nodeId)}/status`);
            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`);
            }
            const data = await resp.json();
            this.updateStatus(data);
        } catch (err) {
            console.warn(`Launcher ${this.nodeName}: failed to load status:`, err);
            this.updateConnectionStatus(false);
        }
    }

    updateStatus(data) {
        if (!data) return;

        this.processes = data.processes || [];
        this.groups = data.groups || [];
        this.updateConnectionStatus(true);
        this.updateSummary(data);
        this.renderProcessTable();
    }

    updateConnectionStatus(connected) {
        const indicator = document.getElementById(`launcher-status-${this.nodeId}`);
        if (!indicator) return;

        const dot = indicator.querySelector('.launcher-status-dot');
        const text = indicator.querySelector('.launcher-status-text');
        if (dot) {
            dot.className = `launcher-status-dot ${connected ? 'connected' : 'disconnected'}`;
        }
        if (text) {
            text.textContent = connected ? 'Connected' : 'Disconnected';
        }

        // Обновляем state.nodes и CSS-классы вкладки (sidebar dot, tab button, tab panel)
        updateLauncherNodeStatus(this.nodeId, connected);
    }

    updateSummary(data) {
        const indicator = document.getElementById(`launcher-status-${this.nodeId}`);
        if (!indicator) return;

        const text = indicator.querySelector('.launcher-status-text');
        if (!text) return;

        const total = this.processes.length;
        const running = this.processes.filter(p => p.state === 'running').length;

        if (data.allRunning) {
            text.textContent = `All running (${total})`;
        } else if (data.anyCriticalFailed) {
            text.textContent = `Critical failed! ${running}/${total} running`;
        } else {
            text.textContent = `${running}/${total} running`;
        }
    }

    renderProcessTable() {
        const content = document.getElementById(`launcher-content-${this.nodeId}`);
        if (!content) return;

        if (this.processes.length === 0) {
            content.innerHTML = '<div class="launcher-empty">No processes</div>';
            return;
        }

        const showActions = this.controlActive;

        // Группируем процессы
        const grouped = this.groupProcesses();
        let html = '';

        for (const group of grouped) {
            const filteredProcesses = group.processes.filter(p => {
                if (!this.filterText) return true;
                const searchText = `${p.name} ${p.state} ${p.group || ''} ${p.lastError || ''}`.toLowerCase();
                return searchText.includes(this.filterText);
            });

            if (filteredProcesses.length === 0) continue;

            if (group.name) {
                html += `<div class="launcher-group">
                    <div class="launcher-group-header">${escapeHtml(group.name)}</div>`;
            }

            html += `<table class="variables-table launcher-table">
                <thead>
                    <tr>
                        <th>Process</th>
                        <th>State</th>
                        <th>PID</th>
                        <th>Uptime</th>
                        <th>Group</th>
                        <th>Restarts</th>`;

            if (showActions) {
                html += `<th class="launcher-actions-header">Actions
                    <button class="launcher-bulk-btn launcher-bulk-stop" data-node="${this.nodeId}" data-bulk="stop-all" title="Stop all running processes">Stop</button>
                    <button class="launcher-bulk-btn launcher-bulk-start" data-node="${this.nodeId}" data-bulk="start-all" title="Start all stopped processes">Start</button>
                    <button class="launcher-bulk-btn launcher-bulk-restart" data-node="${this.nodeId}" data-bulk="restart-all" title="Restart all processes">Restart</button>
                    <button class="launcher-bulk-btn launcher-bulk-reload" data-node="${this.nodeId}" data-bulk="reload-all" title="Reload all processes">Reload</button>
                </th>`;
            }

            html += `</tr>
                </thead>
                <tbody>`;

            for (const proc of filteredProcesses) {
                const stateClass = this.getStateClass(proc.state);
                const uptime = proc.uptime ? this.formatUptime(proc.uptime) : '-';
                const actions = showActions ? this.getActionsHTML(proc) : '';
                const badges = [];
                if (proc.manual) badges.push('<span class="launcher-badge launcher-badge-manual">manual</span>');
                if (proc.oneshot) badges.push('<span class="launcher-badge launcher-badge-oneshot">oneshot</span>');

                html += `<tr>
                    <td class="variable-name">${escapeHtml(proc.name)} ${badges.join(' ')}</td>
                    <td><span class="launcher-state-badge ${stateClass}"><span class="launcher-state-dot"></span>${escapeHtml(proc.state).toUpperCase()}</span></td>
                    <td>${proc.pid || '-'}</td>
                    <td>${uptime}</td>
                    <td>${escapeHtml(proc.group || '')}</td>
                    <td>${proc.restartCount || 0}</td>`;

                if (showActions) {
                    html += `<td class="launcher-actions-cell">${actions}</td>`;
                }

                html += `</tr>`;
            }

            html += `</tbody></table>`;

            if (group.name) {
                html += `</div>`;
            }
        }

        content.innerHTML = html;

        if (showActions) {
            this.attachControlHandlers();
            this.attachBulkHandlers();
        }
    }

    groupProcesses() {
        if (this.groups.length === 0) {
            // Нет групп — показываем одним списком
            return [{ name: '', processes: this.processes }];
        }

        const result = [];
        const assigned = new Set();

        // Сортируем группы по order
        const sortedGroups = [...this.groups].sort((a, b) => (a.order || 0) - (b.order || 0));

        for (const group of sortedGroups) {
            const procs = this.processes.filter(p => {
                const inGroup = p.group === group.name ||
                    (group.processes && group.processes.includes(p.name));
                if (inGroup) assigned.add(p.name);
                return inGroup;
            });
            if (procs.length > 0) {
                result.push({ name: group.name, processes: procs });
            }
        }

        // Процессы без группы
        const ungrouped = this.processes.filter(p => !assigned.has(p.name));
        if (ungrouped.length > 0) {
            result.push({ name: '', processes: ungrouped });
        }

        return result;
    }

    getStateClass(state) {
        switch (state) {
            case 'running': return 'launcher-state-running';
            case 'failed': return 'launcher-state-failed';
            case 'stopped': return 'launcher-state-stopped';
            case 'starting':
            case 'restarting':
            case 'stopping': return 'launcher-state-transitioning';
            case 'completed': return 'launcher-state-completed';
            default: return 'launcher-state-unknown';
        }
    }

    getActionsHTML(proc) {
        const nodeId = this.nodeId;
        switch (proc.state) {
            case 'running':
                return `
                    <button class="launcher-ctrl-btn launcher-ctrl-restart" data-node="${nodeId}" data-process="${proc.name}" data-action="restart" title="Restart">&#8635;</button>
                    <button class="launcher-ctrl-btn launcher-ctrl-stop" data-node="${nodeId}" data-process="${proc.name}" data-action="stop" title="Stop">&#9632;</button>
                `;
            case 'stopped':
            case 'failed':
                return `
                    <button class="launcher-ctrl-btn launcher-ctrl-start" data-node="${nodeId}" data-process="${proc.name}" data-action="start" title="Start">&#9654;</button>
                `;
            case 'completed':
                return `
                    <button class="launcher-ctrl-btn launcher-ctrl-restart" data-node="${nodeId}" data-process="${proc.name}" data-action="restart" title="Re-run">&#8635;</button>
                `;
            case 'starting':
            case 'stopping':
            case 'restarting':
                return '<span class="launcher-ctrl-loading">...</span>';
            default:
                return '';
        }
    }

    attachControlHandlers() {
        const content = document.getElementById(`launcher-content-${this.nodeId}`);
        if (!content) return;

        content.querySelectorAll('.launcher-ctrl-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const action = e.currentTarget.dataset.action;
                const processName = e.currentTarget.dataset.process;
                const nodeId = e.currentTarget.dataset.node;

                const actionLabels = { restart: 'Restart', stop: 'Stop', start: 'Start' };
                const label = actionLabels[action] || action;

                // Подтверждение для restart и stop
                if (action === 'restart' || action === 'stop') {
                    const confirmed = await showConfirmDialog(
                        `${label} Process`,
                        `${label} process "${processName}"?`,
                        label
                    );
                    if (!confirmed) return;
                }

                btn.disabled = true;
                btn.textContent = '...';

                try {
                    const resp = await fetch(`/api/launchers/${encodeURIComponent(nodeId)}/process/${encodeURIComponent(processName)}/${action}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                    });

                    if (!resp.ok) {
                        const data = await resp.json().catch(() => ({}));
                        await showConfirmDialog('Error', data.error || resp.statusText, 'OK');
                    } else {
                        // Оптимистично обновляем статус процесса для мигающей анимации
                        const transitionStates = { stop: 'stopping', start: 'starting', restart: 'restarting' };
                        const proc = this.processes.find(p => p.name === processName);
                        if (proc && transitionStates[action]) {
                            proc.state = transitionStates[action];
                            this.renderProcessTable();
                        }
                    }

                    setTimeout(() => this.loadStatus(), LAUNCHER_ACTION_REFRESH_DELAY);
                } catch (err) {
                    console.error(`Launcher action ${action} failed:`, err);
                    await showConfirmDialog('Error', err.message, 'OK');
                } finally {
                    btn.disabled = false;
                }
            });
        });
    }

    attachBulkHandlers() {
        const content = document.getElementById(`launcher-content-${this.nodeId}`);
        if (!content) return;

        content.querySelectorAll('.launcher-bulk-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const bulkAction = e.currentTarget.dataset.bulk;
                const nodeId = e.currentTarget.dataset.node;
                const labels = { 'stop-all': 'Stop', 'start-all': 'Start', 'restart-all': 'Restart', 'reload-all': 'Reload' };
                const label = labels[bulkAction] || bulkAction;

                const confirmed = await showConfirmDialog(
                    `${label} All`,
                    `${label} ALL processes on this launcher?`,
                    label
                );
                if (!confirmed) return;

                btn.disabled = true;
                const origText = btn.textContent;
                btn.textContent = '...';

                try {
                    const resp = await fetch(`/api/launchers/${encodeURIComponent(nodeId)}/${bulkAction}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                    });

                    if (!resp.ok) {
                        const data = await resp.json().catch(() => ({}));
                        await showConfirmDialog('Error', `${label} failed: ${data.error || resp.statusText}`, 'OK');
                    } else {
                        // Оптимистично обновляем статусы для мигающей анимации
                        const bulkTransitions = {
                            'stop-all': { from: 'running', to: 'stopping', skipFlags: true },
                            'start-all': { from: null, to: 'starting', skipFlags: true },
                            'restart-all': { from: null, to: 'restarting', skipFlags: false },
                            'reload-all': { from: null, to: 'stopping', skipFlags: false },
                        };
                        const transition = bulkTransitions[bulkAction];
                        if (transition) {
                            for (const proc of this.processes) {
                                if (transition.skipFlags && (proc.manual || proc.oneshot || proc.skip)) continue;
                                if (transition.from && proc.state !== transition.from) continue;
                                if (!transition.from && bulkAction === 'start-all' && proc.state === 'running') continue;
                                proc.state = transition.to;
                            }
                            this.renderProcessTable();
                        }
                    }

                    setTimeout(() => this.loadStatus(), LAUNCHER_BULK_ACTION_REFRESH_DELAY);
                } catch (err) {
                    console.error(`Launcher bulk ${bulkAction} failed:`, err);
                    await showConfirmDialog('Error', `${label} failed: ${err.message}`, 'OK');
                } finally {
                    btn.disabled = false;
                    btn.textContent = origText;
                }
            });
        });
    }

    formatUptime(seconds) {
        if (seconds < 60) return `${seconds}s`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        if (hours < 24) return `${hours}h ${minutes}m`;
        const days = Math.floor(hours / 24);
        return `${days}d ${hours % 24}h`;
    }

    destroy() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
        }
    }
}
