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
        this.paramsApiPath = 'modbus';
        this.paramsPrefix = 'mbs';
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
        this.batchTbodyId = `mbs-registers-tbody-${objectName}`;
        this.initBatchRenderProps();

        // Virtual scroll properties
        this.allRegisters = [];
        this.devicesDict = {};
        this.registersTotal = 0;
        this.initVirtualScrollProps();

        // Filter state
        this.filter = '';
        this.typeFilter = 'all';
        this.filterDebounce = null;

        // Pin management
        this.pinStorageKey = 'uniset-panel-mbs-pinned';
        this.renderAfterPinChange = this.renderRegisters;

        // Register map for chart support
        this.registerMap = new Map();

        // Инициализация сортировки
        this.initSortProps();
        this.sortTableId = `mbs-registers-table-${objectName}`;
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
        this.setupSimpleInfiniteScroll({
            viewportId: `mbs-registers-viewport-${this.objectName}`,
            threshold: 100,
        });
        this.initStatusAutoRefresh();
    }

    // Bridge methods for VirtualScrollMixin
    getVScrollItems() { return this.allRegisters; }
    vscrollLoadMore() { this.loadRegisterChunk(this.allRegisters.length); }

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
        this.setupParamsListeners();

        // Используем методы из FilterMixin
        this.setupFilterListeners(
            `mbs-registers-filter-${this.objectName}`,
            `mbs-type-filter-${this.objectName}`,
            () => this.loadRegisters(),       // type filter → серверная фильтрация
            FILTER_DEBOUNCE_DELAY, null,
            () => this.renderRegisters()      // text filter → локальная фильтрация
        );
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
        const tbody = this.getEl(`mbs-status-${this.objectName}`);
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
        const tbody = this.getEl(`mbs-tcp-sessions-${this.objectName}`);
        const info = this.getEl(`mbs-tcp-sessions-info-${this.objectName}`);
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

    renderParams() {
        const tbody = this.getEl(`mbs-params-${this.objectName}`);
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

    async loadRegisters() {
        this.allRegisters = [];
        this.devicesDict = {};
        this.hasMore = true;
        this.isLoadingChunk = false;
        await this.loadRegisterChunk(0);
    }

    renderRegisters() {
        const tbody = this.getEl(`mbs-registers-tbody-${this.objectName}`);
        if (!tbody) return;

        // Получаем закрепленные регистры
        const pinnedRegisters = this.getPinned();
        const hasPinned = pinnedRegisters.size > 0;

        // Показываем/скрываем кнопку "снять все"
        const unpinBtn = this.getEl(`mbs-unpin-${this.objectName}`);
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
            toggle.addEventListener('click', () => this.togglePin(parseInt(toggle.dataset.id)));
        });

        // Обработчик кнопки "снять все"
        if (unpinBtn) {
            unpinBtn.onclick = () => this.unpinAll();
        }
    }

    // Override to use ModbusSlave SSE subscription
    subscribeToChartSensor(sensorId) {
        // ModbusSlave registers are already subscribed through main SSE
        if (!this.subscribedSensorIds.has(sensorId)) {
            this.subscribedSensorIds.add(sensorId);
        }
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
        this.handleBatchUpdates(registers);
    }

    // Bridge для BatchRenderMixin
    getBatchItems() { return this.allRegisters; }

    updateRowCells(row, update) {
        // Value
        if (update.value !== undefined) {
            this._animateCellValue(row, '.col-value', String(update.value), 'value-changed');
        }
        // Device respond status
        const deviceCell = row.querySelector('.col-device .mb-respond');
        if (deviceCell && update.device !== undefined) {
            const deviceAddr = update.device;
            const deviceInfo = this.devicesDict ? (this.devicesDict[deviceAddr] || {}) : {};
            deviceCell.className = `mb-respond ${deviceInfo.respond ? 'ok' : 'fail'}`;
        }
    }

    // update(data) наследуется из BaseObjectRenderer

    // Pin management: pinStorageKey и renderAfterPinChange заданы в конструкторе

    // Bridge для TableSortMixin.renderAfterSort()
    sortRenderVisible() { this.renderRegisters(); }
}

// Apply mixins to ModbusSlaveRenderer
applyMixin(ModbusSlaveRenderer, VirtualScrollMixin);
applyMixin(ModbusSlaveRenderer, SSESubscriptionMixin);
applyMixin(ModbusSlaveRenderer, BatchRenderMixin);
applyMixin(ModbusSlaveRenderer, ResizableSectionMixin);
applyMixin(ModbusSlaveRenderer, FilterMixin);
applyMixin(ModbusSlaveRenderer, ParamsAccessibilityMixin);
applyMixin(ModbusSlaveRenderer, ParamsManagerMixin);
applyMixin(ModbusSlaveRenderer, ItemCounterMixin);
applyMixin(ModbusSlaveRenderer, PinManagementMixin);
applyMixin(ModbusSlaveRenderer, TableSortMixin);
applyMixin(ModbusSlaveRenderer, ModbusRegistersMixin);

// ModbusSlave рендерер (по extensionType)
registerRenderer('ModbusSlave', ModbusSlaveRenderer);

// Fallback для старых версий (по objectType)
registerRenderer('MBSlave', ModbusSlaveRenderer);
registerRenderer('MBSlave1', ModbusSlaveRenderer);

// OPCUAServerRenderer - рендерер для OPCUAServer extensionType
// OPCUAServer - это OPC UA сервер, который предоставляет доступ к переменным через OPC UA протокол

