// ============================================================================
// ModbusSlaveRenderer - рендерер для ModbusSlave объектов
// ============================================================================

class ModbusSlaveRenderer extends BaseObjectRenderer {
    static getTypeName() {
        return 'ModbusSlave';
    }

    constructor(objectName, tabKey = null) {
        super(objectName, tabKey);
        this.status = null;
        this.params = {};
        // Параметры ModbusSlave отличаются от ModbusMaster
        this.paramNames = [
            'force',
            'sockTimeout',
            'sessTimeout',
            'updateStatTime'
        ];
        this.registersHeight = this.loadRegistersHeight();

        // SSE подписки (используется subscribedSensorIds из миксина)
        this.subscribedSensorIds = new Set();
        this.pendingUpdates = [];
        this.renderScheduled = false;

        // Virtual scroll properties
        this.allRegisters = [];
        this.devicesDict = {};
        this.registersTotal = 0;
        this.rowHeight = 32;
        this.bufferRows = 10;
        this.startIndex = 0;
        this.endIndex = 0;

        // Infinite scroll properties
        this.chunkSize = 200;
        this.hasMore = true;
        this.isLoadingChunk = false;

        // Filter state
        this.filter = '';
        this.typeFilter = 'all';
        this.filterDebounce = null;

        // Register map for chart support
        this.registerMap = new Map();

        // Инициализация сортировки
        this.initSortProps();
        this.sortColumnDefs = {
            id: { field: 'id', type: 'number' },
            name: { field: 'name', type: 'string' },
            type: { field: 'iotype', type: 'string' },
            value: { field: 'value', type: 'number' },
            mbaddr: { field: 'device', type: 'number' },
            register: { field: 'register', type: 'number', accessor: (item) => {
                const regInfo = item.register || {};
                return regInfo.mbreg !== undefined ? regInfo.mbreg : item.mbreg;
            }},
            func: { field: 'func', type: 'string', accessor: (item) => (item.register || {}).mbfunc },
            access: { field: 'amode', type: 'string' }
        };
    }

    createPanelHTML() {
        return `
            ${this.createChartsSection()}
            ${this.createMBSStatusSection()}
            ${this.createMBSTcpSessionsSection()}
            ${this.createMBSParamsSection()}
            ${this.createMBSRegistersSection()}
            ${this.createLogViewerSection()}
            ${this.createLogServerSection()}
            ${this.createObjectInfoSection()}
        `;
    }

    initialize() {
        this.loadSortState('uniset-panel-mbslave-sort');
        this.bindEvents();
        this.reloadAll();
        setupChartsResize(this.tabKey);
        this.setupRegistersResize();
        this.setupVirtualScroll();
        this.initStatusAutoRefresh();
    }

    destroy() {
        this.stopStatusAutoRefresh();
        this.destroyLogViewer();
        this.unsubscribeFromSSE();
    }

    // ModbusSlave регистры - показываем badge "MB"
    getChartOptions() {
        return { badge: 'MB', prefix: 'mb' };
    }

    async reloadAll() {
        await Promise.allSettled([
            this.loadStatus(),
            this.loadParams(),
            this.loadRegisters()
        ]);
    }

    bindEvents() {
        const refreshParams = document.getElementById(`mbs-params-refresh-${this.objectName}`);
        if (refreshParams) {
            refreshParams.addEventListener('click', () => this.loadParams());
        }

        const saveParams = document.getElementById(`mbs-params-save-${this.objectName}`);
        if (saveParams) {
            saveParams.addEventListener('click', () => this.saveParams());
        }

        // Используем методы из FilterMixin
        this.setupMBSFilterListeners(
            `mbs-registers-filter-${this.objectName}`,
            `mbs-type-filter-${this.objectName}`
        );
    }

    // Настройка фильтров для ModbusSlave
    setupMBSFilterListeners(filterInputId, typeFilterId) {
        const filterInput = document.getElementById(filterInputId);
        const typeFilter = document.getElementById(typeFilterId);

        if (filterInput) {
            filterInput.addEventListener('input', (e) => {
                clearTimeout(this.filterDebounce);
                this.filterDebounce = setTimeout(() => {
                    this.filter = e.target.value.trim();
                    this.renderRegisters(); // Локальная фильтрация по mbreg и имени
                }, 300);
            });

            filterInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    if (filterInput.value) {
                        filterInput.value = '';
                        this.filter = '';
                        this.renderRegisters();
                    }
                    filterInput.blur();
                    e.preventDefault();
                }
            });
        }

        if (typeFilter) {
            typeFilter.addEventListener('change', (e) => {
                this.typeFilter = e.target.value;
                this.loadRegisters();
            });
        }
    }

    createMBSStatusSection() {
        return this.createCollapsibleSection('mbs-status', 'ModbusSlave Status', `
            <div class="mb-actions">
                <span class="mb-note" id="mbs-status-note-${this.objectName}"></span>
            </div>
            <table class="info-table">
                <tbody id="mbs-status-${this.objectName}"></tbody>
            </table>
        `, { sectionId: `mbs-status-section-${this.objectName}`, headerExtra: this.createStatusHeaderExtra() });
    }

    createMBSTcpSessionsSection() {
        return this.createCollapsibleSection('mbs-tcp-sessions', 'TCP Sessions', `
            <table class="sensors-table">
                <thead>
                    <tr>
                        <th>IP</th>
                        <th>Ask Count</th>
                    </tr>
                </thead>
                <tbody id="mbs-tcp-sessions-${this.objectName}"></tbody>
            </table>
            <div class="tcp-sessions-info" id="mbs-tcp-sessions-info-${this.objectName}"></div>
        `, { sectionId: `mbs-tcp-sessions-section-${this.objectName}` });
    }

    createMBSParamsSection() {
        return this.createCollapsibleSection('mbs-params', 'Parameters', `
            <div class="mb-actions">
                <button class="btn" id="mbs-params-refresh-${this.objectName}">Refresh</button>
                <button class="btn primary" id="mbs-params-save-${this.objectName}">Apply</button>
                <span class="mb-note" id="mbs-params-note-${this.objectName}"></span>
            </div>
            <div class="mb-params-table-wrapper">
                <table class="variables-table mb-params-table">
                    <thead>
                        <tr>
                            <th>Parameter</th>
                            <th>Current</th>
                            <th>New value</th>
                        </tr>
                    </thead>
                    <tbody id="mbs-params-${this.objectName}"></tbody>
                </table>
            </div>
        `, { sectionId: `mbs-params-section-${this.objectName}` });
    }

    createMBSRegistersSection() {
        return this.createCollapsibleSection('mbs-registers', 'Registers', `
            <div class="filter-bar mb-actions">
                <input type="text" class="filter-input" id="mbs-registers-filter-${this.objectName}" placeholder="Filter...">
                <select class="type-filter" id="mbs-type-filter-${this.objectName}">
                    <option value="all">All types</option>
                    <option value="AI">AI</option>
                    <option value="AO">AO</option>
                    <option value="DI">DI</option>
                    <option value="DO">DO</option>
                </select>
                <span class="sensor-count" id="mbs-register-count-${this.objectName}">0</span>
                <span class="mb-note" id="mbs-registers-note-${this.objectName}"></span>
            </div>
            <div class="mb-registers-container" id="mbs-registers-container-${this.objectName}" style="height: ${this.registersHeight}px">
                <div class="mb-registers-viewport" id="mbs-registers-viewport-${this.objectName}">
                    <div class="mb-registers-spacer" id="mbs-registers-spacer-${this.objectName}"></div>
                    <table class="sensors-table variables-table mb-registers-table" id="mbs-registers-table-${this.objectName}">
                        <thead>
                            <tr>
                                <th class="col-pin">
                                    <span class="mbs-unpin-all" id="mbs-unpin-${this.objectName}" title="Unpin all" style="display:none">✕</span>
                                </th>
                                <th class="col-add-buttons"></th>
                                ${this.renderSortableHeader('id', 'ID', true, 'col-id')}
                                ${this.renderSortableHeader('name', 'Name', true, 'col-name')}
                                ${this.renderSortableHeader('type', 'Type', true, 'col-type')}
                                ${this.renderSortableHeader('value', 'Value', true, 'col-value')}
                                ${this.renderSortableHeader('mbaddr', 'MB Addr', true, 'col-mbaddr')}
                                ${this.renderSortableHeader('register', 'Register', true, 'col-register')}
                                ${this.renderSortableHeader('func', 'Function', true, 'col-func')}
                                ${this.renderSortableHeader('access', 'Access', true, 'col-access')}
                            </tr>
                        </thead>
                        <tbody id="mbs-registers-tbody-${this.objectName}"></tbody>
                    </table>
                    <div class="mb-loading-more" id="mbs-loading-more-${this.objectName}" style="display: none;">Loading...</div>
                </div>
            </div>
            <div class="resize-handle" id="mbs-registers-resize-${this.objectName}"></div>
        `, { sectionId: `mbs-registers-section-${this.objectName}` });
    }

    async loadStatus() {
        try {
            const data = await this.fetchJSON(`/api/objects/${encodeURIComponent(this.objectName)}/modbus/status`);
            this.status = data.status || null;
            this.renderStatus();
            this.updateParamsAccessibility('mbs');
            this.updateStatusTimestamp();
            this.setNote(`mbs-status-note-${this.objectName}`, '');
        } catch (err) {
            this.setNote(`mbs-status-note-${this.objectName}`, err.message, true);
        }
    }

    renderStatus() {
        const tbody = document.getElementById(`mbs-status-${this.objectName}`);
        if (!tbody) return;

        tbody.innerHTML = '';

        if (!this.status) {
            tbody.innerHTML = '<tr><td colspan="2" class="text-muted">No data</td></tr>';
            this.renderTcpSessions();
            return;
        }

        const status = this.status;
        const rows = [
            { label: 'Name', value: status.name },
            { label: 'TCP', value: status.tcp ? `${status.tcp.ip}:${status.tcp.port}` : null },
            { label: 'force', value: status.force },
            { label: 'sockTimeout', value: status.sockTimeout },
            { label: 'sessTimeout', value: status.sessTimeout },
            { label: 'updateStatTime', value: status.updateStatTime }
        ];

        // Статистика
        if (status.stat) {
            rows.push({ label: 'connectionCount', value: status.stat.connectionCount });
            rows.push({ label: 'smPingOK', value: status.stat.smPingOK });
            rows.push({ label: 'restartTCPServerCount', value: status.stat.restartTCPServerCount });
        }

        // Обслуживаемые адреса
        if (status.myaddr) {
            rows.push({ label: 'MB addresses', value: status.myaddr });
        }

        rows.forEach(row => {
            if (row.value === undefined || row.value === null) return;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="info-label">${row.label}</td>
                <td class="info-value">${formatValue(row.value)}</td>
            `;
            tbody.appendChild(tr);
        });

        this.renderTcpSessions();
    }

    renderTcpSessions() {
        const tbody = document.getElementById(`mbs-tcp-sessions-${this.objectName}`);
        const info = document.getElementById(`mbs-tcp-sessions-info-${this.objectName}`);
        if (!tbody) return;

        tbody.innerHTML = '';

        const sessions = this.status?.tcp_sessions;
        if (!sessions || !sessions.items || sessions.items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="2" class="text-muted">No active sessions</td></tr>';
            if (info) info.innerHTML = '';
            return;
        }

        sessions.items.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.ip}</td>
                <td>${item.askCount}</td>
            `;
            tbody.appendChild(tr);
        });

        if (info) {
            info.innerHTML = `<span class="text-muted">Sessions: ${sessions.count} / ${sessions.max_sessions}</span>`;
        }
    }

    async loadParams() {
        try {
            const query = this.paramNames.map(n => `name=${encodeURIComponent(n)}`).join('&');
            const data = await this.fetchJSON(`/api/objects/${encodeURIComponent(this.objectName)}/modbus/params?${query}`);
            this.params = data.params || {};
            this.renderParams();
            this.updateParamsAccessibility('mbs');
            this.setNote(`mbs-params-note-${this.objectName}`, '');
        } catch (err) {
            this.setNote(`mbs-params-note-${this.objectName}`, err.message, true);
        }
    }

    renderParams() {
        const tbody = document.getElementById(`mbs-params-${this.objectName}`);
        if (!tbody) return;

        tbody.innerHTML = '';

        this.paramNames.forEach(name => {
            const value = this.params[name];
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="param-name">${name}</td>
                <td class="param-value">${value !== undefined ? value : '—'}</td>
                <td class="param-input">
                    <input type="text" class="param-field" data-param="${name}" placeholder="${value !== undefined ? value : ''}" />
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    async saveParams() {
        const inputs = document.querySelectorAll(`#mbs-params-${this.objectName} input.param-field`);
        const params = {};

        inputs.forEach(input => {
            const name = input.dataset.param;
            const val = input.value.trim();
            if (val !== '') {
                params[name] = val;
            }
        });

        if (Object.keys(params).length === 0) {
            this.setNote(`mbs-params-note-${this.objectName}`, 'No changes');
            return;
        }

        try {
            await this.fetchJSON(`/api/objects/${encodeURIComponent(this.objectName)}/modbus/params`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ params })
            });
            this.setNote(`mbs-params-note-${this.objectName}`, 'Saved');
            this.loadParams();
        } catch (err) {
            this.setNote(`mbs-params-note-${this.objectName}`, err.message, true);
        }
    }

    async loadRegisters() {
        this.allRegisters = [];
        this.devicesDict = {};
        this.hasMore = true;
        this.isLoadingChunk = false;
        await this.loadRegisterChunk(0);
    }

    async loadRegisterChunk(offset) {
        if (this.isLoadingChunk || !this.hasMore) return;
        this.isLoadingChunk = true;

        const loadingEl = document.getElementById(`mbs-loading-more-${this.objectName}`);
        if (loadingEl) loadingEl.style.display = 'block';

        try {
            let url = `/api/objects/${encodeURIComponent(this.objectName)}/modbus/registers?offset=${offset}&limit=${this.chunkSize}`;
            if (this.typeFilter && this.typeFilter !== 'all') {
                url += `&iotype=${encodeURIComponent(this.typeFilter)}`;
            }

            const data = await this.fetchJSON(url);
            const registers = data.registers || [];
            this.registersTotal = data.total || 0;

            // Merge devices dictionary
            if (data.devices) {
                Object.assign(this.devicesDict, data.devices);
            }

            if (offset === 0) {
                this.allRegisters = registers;
                this.registerMap.clear();
                registers.forEach(r => this.registerMap.set(r.id, r));

                // Если нет фильтра и есть закреплённые регистры - загрузить их отдельно
                if (!this.filter) {
                    await this.loadPinnedRegisters();
                }
            } else {
                this.allRegisters = this.allRegisters.concat(registers);
                registers.forEach(r => this.registerMap.set(r.id, r));
            }

            this.hasMore = this.allRegisters.length < this.registersTotal;
            this.renderRegisters();
            this.setNote(`mbs-registers-note-${this.objectName}`, '');

            this.updateItemCount(`mbs-register-count-${this.objectName}`, this.allRegisters.length, this.registersTotal);

            // Подписываемся на SSE обновления после загрузки
            this.subscribeToSSE();

            // Обработчики сортировки (только при первой загрузке)
            if (offset === 0) {
                const table = document.getElementById(`mbs-registers-table-${this.objectName}`);
                if (table) {
                    this.attachSortHandlers(table);
                    this.updateSortHeaders();
                }
            }
        } catch (err) {
            this.setNote(`mbs-registers-note-${this.objectName}`, err.message, true);
        } finally {
            this.isLoadingChunk = false;
            if (loadingEl) loadingEl.style.display = 'none';
        }
    }

    // Загружает закреплённые регистры, если они не в текущем списке
    async loadPinnedRegisters() {
        const pinnedIds = this.getPinnedRegisters();
        if (pinnedIds.size === 0) return;

        // Найти ID, которых нет в загруженных регистрах
        const missingIds = [];
        for (const idStr of pinnedIds) {
            const id = parseInt(idStr);
            if (!this.registerMap.has(id)) {
                missingIds.push(id);
            }
        }

        if (missingIds.length === 0) return;

        // Загрузить отсутствующие регистры по ID
        try {
            const idsParam = missingIds.join(',');
            const url = `/api/objects/${encodeURIComponent(this.objectName)}/modbus/get?filter=${idsParam}`;
            const response = await this.fetchJSON(url);
            const pinnedRegisters = response.registers || [];

            // Добавить закреплённые регистры в начало списка
            for (const reg of pinnedRegisters) {
                if (!this.registerMap.has(reg.id)) {
                    this.allRegisters.unshift(reg);
                    this.registerMap.set(reg.id, reg);
                }
            }
        } catch (err) {
            console.warn('Failed to load pinned registers:', err);
        }
    }

    renderRegisters() {
        const tbody = document.getElementById(`mbs-registers-tbody-${this.objectName}`);
        if (!tbody) return;

        // Получаем закрепленные регистры
        const pinnedRegisters = this.getPinnedRegisters();
        const hasPinned = pinnedRegisters.size > 0;

        // Показываем/скрываем кнопку "снять все"
        const unpinBtn = document.getElementById(`mbs-unpin-${this.objectName}`);
        if (unpinBtn) {
            unpinBtn.style.display = hasPinned ? 'inline' : 'none';
        }

        // Фильтруем регистры используя общий метод (по name, id, mbreg)
        // ModbusSlave: mbreg может быть в r.register.mbreg или r.mbreg
        const mbregAccessor = (item, field) => {
            const regInfo = item.register || {};
            return regInfo[field] !== undefined ? regInfo[field] : item[field];
        };
        let registersToShow = this.applyFilters(this.allRegisters, 'name', 'iotype', null, ['mbreg'], mbregAccessor);

        // Если есть закрепленные и нет фильтра — показываем только их
        if (hasPinned && !this.filter) {
            registersToShow = registersToShow.filter(r => pinnedRegisters.has(String(r.id)));
        }

        // Сортировка: pinned всегда вверху, остальные по выбранной колонке
        registersToShow = this.sortItems(registersToShow, pinnedRegisters, this.sortColumnDefs);

        // Обновляем счётчик с учётом фильтрации
        this.updateItemCount(`mbs-register-count-${this.objectName}`, registersToShow.length, this.registersTotal);

        // Update registerMap for chart support
        registersToShow.forEach(reg => {
            if (reg.id) {
                this.registerMap.set(reg.id, reg);
            }
        });

        // ModbusSlave формат: device - это mbaddr, register содержит mbreg/mbfunc, есть amode
        const html = registersToShow.map(reg => {
            const isPinned = pinnedRegisters.has(String(reg.id));
            const pinToggleClass = isPinned ? 'pin-toggle pinned' : 'pin-toggle';
            const pinIcon = isPinned ? '📌' : '○';
            const pinTitle = isPinned ? 'Unpin' : 'Pin';

            const mbAddr = reg.device;
            const regInfo = reg.register || {};
            const mbreg = regInfo.mbreg !== undefined ? regInfo.mbreg : reg.mbreg;
            const mbfunc = regInfo.mbfunc;
            return `
                <tr data-sensor-id="${reg.id}">
                    <td class="col-pin">
                        <span class="${pinToggleClass}" data-id="${reg.id}" title="${pinTitle}">
                            ${pinIcon}
                        </span>
                    </td>
                    ${this.renderAddButtonsCell(reg.id, reg.name, 'mbsreg', reg.textname || reg.name)}
                    <td class="col-id">${reg.id}</td>
                    <td class="col-name" title="${escapeHtml(reg.textname || reg.comment || '')}">${escapeHtml(reg.name || '')}</td>
                    <td class="col-type">${reg.iotype ? `<span class="type-badge type-${reg.iotype}">${reg.iotype}</span>` : ''}</td>
                    <td class="col-value">${reg.value !== undefined ? reg.value : ''}</td>
                    <td class="col-mbaddr">${mbAddr || ''}</td>
                    <td class="col-register">${mbreg !== undefined ? mbreg : ''}</td>
                    <td class="col-func">${mbfunc !== undefined ? mbfunc : ''}</td>
                    <td class="col-access">${reg.amode || ''}</td>
                </tr>
            `;
        }).join('');

        tbody.innerHTML = html;

        // Bind chart toggle events
        this.attachChartToggleListeners(tbody, this.registerMap);

        // Bind dashboard toggle events
        this.attachDashboardToggleListeners(tbody);

        // Bind pin toggle events
        tbody.querySelectorAll('.pin-toggle').forEach(toggle => {
            toggle.addEventListener('click', () => this.toggleRegisterPin(parseInt(toggle.dataset.id)));
        });

        // Обработчик кнопки "снять все"
        if (unpinBtn) {
            unpinBtn.onclick = () => this.unpinAllRegisters();
        }
    }

    // Override to use ModbusSlave SSE subscription
    subscribeToChartSensor(sensorId) {
        // ModbusSlave registers are already subscribed through main SSE
        if (!this.subscribedSensorIds.has(sensorId)) {
            this.subscribedSensorIds.add(sensorId);
        }
    }

    setupVirtualScroll() {
        const viewport = document.getElementById(`mbs-registers-viewport-${this.objectName}`);
        if (!viewport) return;

        viewport.addEventListener('scroll', () => {
            const scrollTop = viewport.scrollTop;
            const viewportHeight = viewport.clientHeight;
            const scrollHeight = viewport.scrollHeight;

            // Загружаем следующий чанк когда остается 100px до конца
            if (scrollHeight - scrollTop - viewportHeight < 100) {
                this.loadRegisterChunk(this.allRegisters.length);
            }
        });
    }

    loadRegistersHeight() {
        return this.loadSectionHeight('uniset-panel-mbs-registers', 320);
    }

    saveRegistersHeight(value) {
        this.registersHeight = value;
        this.saveSectionHeight('uniset-panel-mbs-registers', value);
    }

    setupRegistersResize() {
        this.setupSectionResize(
            `mbs-registers-resize-${this.objectName}`,
            `mbs-registers-container-${this.objectName}`,
            'uniset-panel-mbs-registers',
            'registersHeight',
            { minHeight: 200, maxHeight: 700 }
        );
    }

    // === SSE подписка на обновления регистров (использует SSESubscriptionMixin) ===

    async subscribeToSSE() {
        const registerIds = this.allRegisters.map(r => r.id);
        await this.subscribeToSSEFor('/modbus', registerIds, 'register_ids', 'ModbusSlave SSE');
    }

    async unsubscribeFromSSE() {
        await this.unsubscribeFromSSEFor('/modbus', 'register_ids', 'ModbusSlave SSE');
    }

    handleModbusRegisterUpdates(registers) {
        if (!Array.isArray(registers) || registers.length === 0) return;

        // Добавляем в очередь на обновление
        this.pendingUpdates.push(...registers);

        // Планируем батчевый рендеринг
        if (!this.renderScheduled) {
            this.renderScheduled = true;
            requestAnimationFrame(() => this.batchRenderUpdates());
        }
    }

    batchRenderUpdates() {
        this.renderScheduled = false;

        if (this.pendingUpdates.length === 0) return;

        const updates = this.pendingUpdates;
        this.pendingUpdates = [];

        // Создаём map для быстрого поиска
        const updateMap = new Map();
        updates.forEach(reg => {
            updateMap.set(reg.id, reg);
        });

        // Обновляем данные в allRegisters (все поля)
        this.allRegisters.forEach((reg, index) => {
            const update = updateMap.get(reg.id);
            if (update) {
                this.allRegisters[index] = { ...reg, ...update };
            }
        });

        // Обновляем изменившиеся ячейки в DOM
        const panel = document.querySelector(`.tab-panel[data-name="${this.tabKey}"]`);
        if (!panel) return;

        const tbody = panel.querySelector(`#mbs-registers-tbody-${CSS.escape(this.objectName)}`);
        if (!tbody) return;

        const rows = tbody.querySelectorAll('tr');
        rows.forEach(row => {
            const regId = parseInt(row.dataset.sensorId);
            if (!regId) return;

            const update = updateMap.get(regId);
            if (!update) return;

            // Value
            const valueCell = row.querySelector('.col-value');
            if (valueCell) {
                const newValue = update.value !== undefined ? String(update.value) : '';
                if (valueCell.textContent !== newValue) {
                    valueCell.textContent = newValue;
                    valueCell.classList.remove('value-changed');
                    void valueCell.offsetWidth;
                    valueCell.classList.add('value-changed');
                }
            }

            // Device respond status
            const deviceCell = row.querySelector('.col-device .mb-respond');
            if (deviceCell && update.device !== undefined) {
                const deviceAddr = update.device;
                const deviceInfo = this.devicesDict ? (this.devicesDict[deviceAddr] || {}) : {};
                deviceCell.className = `mb-respond ${deviceInfo.respond ? 'ok' : 'fail'}`;
            }
        });
    }

    update(data) {
        renderObjectInfo(this.tabKey, data.object);
        updateChartLegends(this.tabKey, data);
        this.handleLogServer(data.LogServer);
    }

    // Pin management для регистров
    getPinnedRegisters() {
        return this.getPinnedItems('uniset-panel-mbs-pinned');
    }

    savePinnedRegisters(pinnedSet) {
        this.savePinnedItems('uniset-panel-mbs-pinned', pinnedSet);
    }

    toggleRegisterPin(registerId) {
        this.toggleItemPin('uniset-panel-mbs-pinned', registerId, this.renderRegisters);
    }

    unpinAllRegisters() {
        this.unpinAllItems('uniset-panel-mbs-pinned', this.renderRegisters);
    }

    // Перерисовка после смены сортировки
    renderAfterSort() {
        this.renderRegisters();
        this.updateSortHeaders();
    }

    // Обновление визуальных индикаторов сортировки
    updateSortHeaders() {
        const table = document.getElementById(`mbs-registers-table-${this.objectName}`);
        if (!table) return;

        table.querySelectorAll('th.th-sortable').forEach(th => {
            const column = th.dataset.column;
            th.classList.toggle('th-sorted', column === this.sortColumn);
            const arrow = th.querySelector('.sort-arrow');
            if (arrow) {
                if (column === this.sortColumn) {
                    arrow.textContent = this.sortDirection === 'asc' ? '↑' : '↓';
                } else {
                    arrow.textContent = '';
                }
            }
        });
    }
}

// Apply mixins to ModbusSlaveRenderer
applyMixin(ModbusSlaveRenderer, VirtualScrollMixin);
applyMixin(ModbusSlaveRenderer, SSESubscriptionMixin);
applyMixin(ModbusSlaveRenderer, ResizableSectionMixin);
applyMixin(ModbusSlaveRenderer, FilterMixin);
applyMixin(ModbusSlaveRenderer, ParamsAccessibilityMixin);
applyMixin(ModbusSlaveRenderer, ItemCounterMixin);
applyMixin(ModbusSlaveRenderer, SectionHeightMixin);
applyMixin(ModbusSlaveRenderer, PinManagementMixin);
applyMixin(ModbusSlaveRenderer, TableSortMixin);

// ModbusSlave рендерер (по extensionType)
registerRenderer('ModbusSlave', ModbusSlaveRenderer);

// Fallback для старых версий (по objectType)
registerRenderer('MBSlave', ModbusSlaveRenderer);
registerRenderer('MBSlave1', ModbusSlaveRenderer);

// OPCUAServerRenderer - рендерер для OPCUAServer extensionType
// OPCUAServer - это OPC UA сервер, который предоставляет доступ к переменным через OPC UA протокол

