class OPCUAServerRenderer extends BaseObjectRenderer {
    static getTypeName() {
        return 'OPCUAServer';
    }

    constructor(objectName, tabKey = null) {
        super(objectName, tabKey);
        this.status = null;
        this.params = {};
        this.paramsApiPath = 'opcua';
        this.paramsPrefix = 'opcuasrv';
        this.paramNames = [
            'updateTime_msec',
            'httpEnabledSetParams'
        ];
        this.loadingNote = '';
        this.sensorsHeight = this.loadSensorsHeight();

        // SSE подписки
        this.subscribedSensorIds = new Set();
        this.batchTbodyId = `opcuasrv-sensors-${objectName}`;
        this.initBatchRenderProps();

        // Virtual scroll properties
        this.allSensors = [];
        this.sensorsTotal = 0;
        this.initVirtualScrollProps();

        // Filter state
        this.filter = '';
        this.typeFilter = 'all';
        this.filterDebounce = null;

        // Pin management
        this.pinStorageKey = 'uniset-panel-opcuasrv-pinned';
        this.renderAfterPinChange = this.renderVisibleSensors;

        // Sensor map for chart support
        this.sensorMap = new Map();

        // Инициализация сортировки
        this.initSortProps();
        this.sortTableId = `opcuasrv-sensors-table-${objectName}`;
        this.sortColumnDefs = {
            id: { field: 'id', type: 'number' },
            name: { field: 'name', type: 'string' },
            type: { field: 'iotype', type: 'string' },
            value: { field: 'value', type: 'number' },
            vtype: { field: 'vtype', type: 'string' },
            precision: { field: 'precision', type: 'number' }
        };
    }

    createPanelHTML() {
        return `
            ${this.createChartsSection()}
            ${this.createOPCUAServerStatusSection()}
            ${this.createOPCUAServerParamsSection()}
            ${this.createOPCUAServerSensorsSection()}
            ${this.createLogViewerSection()}
            ${this.createLogServerSection()}
            ${this.createObjectInfoSection()}
        `;
    }

    initialize() {
        this.loadSortState('uniset-panel-opcuasrv-sort');
        this.bindEvents();
        this.reloadAll();
        setupChartsResize(this.tabKey);
        this.setupSensorsResize();
        this.setupFullVirtualScroll({
            viewportId: `opcuasrv-sensors-viewport-${this.objectName}`,
            threshold: VIRTUAL_SCROLL_PERCENT_THRESHOLD,
            thresholdType: 'percent',
        });
        this.initStatusAutoRefresh();
    }

    // Bridge methods for VirtualScrollMixin
    getVScrollItems() { return this.allSensors; }
    vscrollRenderVisible() { this.renderVisibleSensors(); }
    vscrollLoadMore() { this.loadMoreSensors(); }

    destroy() {
        this.stopStatusAutoRefresh();
        this.destroyLogViewer();
        this.unsubscribeFromSSE();
    }

    async reloadAll() {
        await Promise.allSettled([
            this.loadStatus(),
            this.loadParams(),
            this.loadSensors()
        ]);
    }

    bindEvents() {
        this.setupParamsListeners();

        // Используем методы из FilterMixin
        this.setupFilterListeners(
            `opcuasrv-sensors-filter-${this.objectName}`,
            `opcuasrv-type-filter-${this.objectName}`,
            () => this.loadSensors()
        );
    }

    createOPCUAServerStatusSection() {
        return this.createCollapsibleSection('opcuasrv-status', 'OPC UA Server Status', `
            <div class="opcua-actions">
                <span class="opcua-note" id="opcuasrv-status-note-${this.objectName}"></span>
            </div>
            <table class="info-table">
                <tbody id="opcuasrv-status-${this.objectName}"></tbody>
            </table>
            <div class="opcuasrv-endpoints" id="opcuasrv-endpoints-${this.objectName}"></div>
            <div class="opcuasrv-config" id="opcuasrv-config-${this.objectName}"></div>
        `, { sectionId: `opcuasrv-status-section-${this.objectName}`, headerExtra: this.createStatusHeaderExtra() });
    }

    createOPCUAServerParamsSection() {
        const headerIndicator = `
            <span class="header-indicator-dot fail" id="opcuasrv-ind-params-${this.objectName}" title="Parameters: loading..."></span>
        `;
        return this.createCollapsibleSection('opcuasrv-params', 'Server Parameters', `
            <div class="opcua-actions">
                <button class="btn" id="opcuasrv-params-refresh-${this.objectName}">Refresh</button>
                <button class="btn primary" id="opcuasrv-params-save-${this.objectName}">Apply</button>
                <span class="opcua-note" id="opcuasrv-params-note-${this.objectName}"></span>
            </div>
            <div class="opcua-params-table-wrapper">
                <table class="variables-table opcua-params-table">
                    <thead>
                        <tr>
                            <th>Parameter</th>
                            <th>Current</th>
                            <th>New value</th>
                        </tr>
                    </thead>
                    <tbody id="opcuasrv-params-${this.objectName}"></tbody>
                </table>
            </div>
        `, { sectionId: `opcuasrv-params-section-${this.objectName}`, headerExtra: headerIndicator });
    }

    createOPCUAServerSensorsSection() {
        return this.createCollapsibleSection('opcuasrv-sensors', 'OPC UA Variables', `
            <div class="filter-bar opcua-actions">
                <input type="text" class="filter-input" id="opcuasrv-sensors-filter-${this.objectName}" placeholder="Filter...">
                <select class="type-filter" id="opcuasrv-type-filter-${this.objectName}">
                    <option value="all">All types</option>
                    <option value="AI">AI</option>
                    <option value="AO">AO</option>
                    <option value="DI">DI</option>
                    <option value="DO">DO</option>
                </select>
                <span class="sensor-count" id="opcuasrv-sensor-count-${this.objectName}">0</span>
                <span class="opcua-note" id="opcuasrv-sensors-note-${this.objectName}"></span>
            </div>
            <div class="opcua-sensors-container" id="opcuasrv-sensors-container-${this.objectName}" style="height: ${this.sensorsHeight}px">
                <div class="opcua-sensors-viewport" id="opcuasrv-sensors-viewport-${this.objectName}">
                    <div class="opcua-sensors-spacer" id="opcuasrv-sensors-spacer-${this.objectName}"></div>
                    <table class="sensors-table variables-table opcua-sensors-table" id="opcuasrv-sensors-table-${this.objectName}">
                        <thead>
                            <tr>
                                <th class="col-pin">
                                    <span class="opcuasrv-unpin-all" id="opcuasrv-unpin-${this.objectName}" title="Unpin all" style="display:none">✕</span>
                                </th>
                                <th class="col-add-buttons"></th>
                                ${this.renderSortableHeader('id', 'ID', true, 'col-id')}
                                ${this.renderSortableHeader('name', 'Name', true, 'col-name')}
                                ${this.renderSortableHeader('type', 'Type', true, 'col-type')}
                                ${this.renderSortableHeader('value', 'Value', true, 'col-value')}
                                ${this.renderSortableHeader('vtype', 'VType', true, 'col-vtype')}
                                ${this.renderSortableHeader('precision', 'Precision', true, 'col-precision')}
                            </tr>
                        </thead>
                        <tbody id="opcuasrv-sensors-${this.objectName}"></tbody>
                    </table>
                    <div class="opcua-loading-more" id="opcuasrv-loading-more-${this.objectName}" style="display: none;">Loading...</div>
                </div>
            </div>
            <div class="resize-handle" id="opcuasrv-sensors-resize-${this.objectName}"></div>
        `, { sectionId: `opcuasrv-sensors-section-${this.objectName}` });
    }

    async loadStatus() {
        try {
            const data = await this.fetchJSON(`/api/objects/${encodeURIComponent(this.objectName)}/opcua/status`);
            this.status = data.status || null;
            this.renderStatus();
            this.updateParamsAccessibility('opcuasrv');
            this.updateStatusTimestamp();
            this.setNote(`opcuasrv-status-note-${this.objectName}`, '');
        } catch (err) {
            this.setNote(`opcuasrv-status-note-${this.objectName}`, err.message, true);
        }
    }

    renderStatus() {
        const tbody = this.getEl(`opcuasrv-status-${this.objectName}`);
        const endpointsContainer = this.getEl(`opcuasrv-endpoints-${this.objectName}`);
        const configContainer = this.getEl(`opcuasrv-config-${this.objectName}`);
        if (!tbody || !endpointsContainer || !configContainer) return;

        tbody.innerHTML = '';
        endpointsContainer.innerHTML = '';
        configContainer.innerHTML = '';

        if (!this.status) {
            tbody.innerHTML = '<tr><td colspan="2" class="text-muted">No data</td></tr>';
            return;
        }

        const status = this.status;

        // Main status rows
        const rows = [
            { label: 'Name', value: status.name },
            { label: 'httpEnabledSetParams', value: status.httpEnabledSetParams }
        ];

        // Variables info
        if (status.variables) {
            rows.push({ label: 'Total variables', value: status.variables.total });
            rows.push({ label: 'Read', value: status.variables.read });
            rows.push({ label: 'Write', value: status.variables.write });
            rows.push({ label: 'Methods', value: status.variables.methods });
        }

        // Params
        if (status.params) {
            rows.push({ label: 'updateTime_msec', value: status.params.updateTime_msec });
        }

        rows.forEach(row => {
            if (row.value === undefined || row.value === null) return;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="info-label">${row.label}</td>
                <td class="info-value">${formatValueHtml(row.value)}</td>
            `;
            tbody.appendChild(tr);
        });

        // Endpoints
        if (Array.isArray(status.endpoints) && status.endpoints.length > 0) {
            endpointsContainer.innerHTML = '<h4 class="opcuasrv-section-title">Endpoints</h4>';
            status.endpoints.forEach(ep => {
                const div = document.createElement('div');
                div.className = 'opcuasrv-endpoint-card';
                div.innerHTML = `
                    <div class="opcuasrv-endpoint-name">${ep.name || 'Endpoint'}</div>
                    <div class="opcuasrv-endpoint-url">${ep.url || '—'}</div>
                `;
                endpointsContainer.appendChild(div);
            });
        }

        // Config
        if (status.config) {
            configContainer.innerHTML = '<h4 class="opcuasrv-section-title">Configuration</h4>';
            const configTable = document.createElement('table');
            configTable.className = 'info-table';
            const configTbody = document.createElement('tbody');

            const configRows = [
                { label: 'maxSubscriptions', value: status.config.maxSubscriptions },
                { label: 'maxSessions', value: status.config.maxSessions },
                { label: 'maxSecureChannels', value: status.config.maxSecureChannels },
                { label: 'maxSessionTimeout', value: status.config.maxSessionTimeout }
            ];

            configRows.forEach(row => {
                if (row.value === undefined || row.value === null) return;
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="info-label">${row.label}</td>
                    <td class="info-value">${formatValueHtml(row.value)}</td>
                `;
                configTbody.appendChild(tr);
            });

            configTable.appendChild(configTbody);
            configContainer.appendChild(configTable);
        }

        // Render LogServer section
        this.handleLogServer(status.LogServer);
    }

    renderParams() {
        const tbody = this.getEl(`opcuasrv-params-${this.objectName}`);
        if (!tbody) return;

        tbody.innerHTML = '';
        if (!this.params || Object.keys(this.params).length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-muted">No data</td></tr>';
            return;
        }

        this.paramNames.forEach(name => {
            const current = this.params[name];
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="variable-name">${name}</td>
                <td class="variable-value">${current !== undefined ? formatValueHtml(current) : '—'}</td>
                <td><input class="opcua-param-input" data-name="${escapeAttr(name)}" value="${escapeAttr(current !== undefined ? current : '')}"></td>
            `;
            tbody.appendChild(tr);
        });
    }

    async loadSensors() {
        // Reset state for fresh load
        this.allSensors = [];
        this.hasMore = true;
        this.startIndex = 0;
        this.endIndex = 0;

        // Reset viewport scroll position
        const viewport = this.getEl(`opcuasrv-sensors-viewport-${this.objectName}`);
        if (viewport) viewport.scrollTop = 0;

        try {
            let url = this.buildPaginatedSensorsUrl('/opcua', 0);

            if (this.filter) {
                url += `&search=${encodeURIComponent(this.filter)}`;
            }
            if (this.typeFilter && this.typeFilter !== 'all') {
                url += `&iotype=${this.typeFilter}`;
            }

            const data = await this.fetchJSON(url);
            let sensors = data.sensors || [];
            this.sensorsTotal = typeof data.total === 'number' ? data.total : sensors.length;

            this.allSensors = sensors;
            this.sensorMap.clear();
            sensors.forEach(s => this.sensorMap.set(s.id, s));

            // Если нет фильтра и есть закреплённые датчики - загрузить их отдельно
            if (!this.hasActiveFilters()) {
                await this.loadPinnedSensors();
            }

            this.hasMore = (data.sensors?.length || 0) === this.chunkSize;
            this.updateVisibleRows();
            this.updateSensorCount();
            this.setNote(`opcuasrv-sensors-note-${this.objectName}`, '');

            // Подписываемся на SSE обновления после загрузки
            this.subscribeToSSE();

            // Обработчики сортировки
            const table = this.getEl(`opcuasrv-sensors-table-${this.objectName}`);
            if (table) {
                this.attachSortHandlers(table);
                this.updateSortHeaders();
            }
        } catch (err) {
            this.setNote(`opcuasrv-sensors-note-${this.objectName}`, err.message, true);
        }
    }

    // Загружает закреплённые датчики, если они не в текущем списке
    loadPinnedSensors() {
        return this.loadMissingPinnedSensors('/opcua/get');
    }

    async loadMoreSensors() {
        if (this.isLoadingChunk || !this.hasMore) return;

        this.isLoadingChunk = true;
        this.showLoadingIndicator(true);

        try {
            const nextOffset = this.allSensors.length;
            let url = this.buildPaginatedSensorsUrl('/opcua', nextOffset);

            if (this.filter) {
                url += `&search=${encodeURIComponent(this.filter)}`;
            }
            if (this.typeFilter && this.typeFilter !== 'all') {
                url += `&iotype=${this.typeFilter}`;
            }

            const data = await this.fetchJSON(url);
            let newSensors = data.sensors || [];

            // Дедупликация: добавляем только датчики которых еще нет
            const existingIds = new Set(this.allSensors.map(s => s.id));
            const uniqueNewSensors = newSensors.filter(s => !existingIds.has(s.id));

            this.allSensors = [...this.allSensors, ...uniqueNewSensors];
            this.hasMore = (data.sensors?.length || 0) === this.chunkSize;
            this.updateVisibleRows();
            this.updateSensorCount();
        } catch (err) {
            console.error('Failed to load more sensors:', err);
        } finally {
            this.isLoadingChunk = false;
            this.showLoadingIndicator(false);
        }
    }

    renderVisibleSensors() {
        const tbody = this.getEl(`opcuasrv-sensors-${this.objectName}`);
        const spacer = this.getEl(`opcuasrv-sensors-spacer-${this.objectName}`);
        if (!tbody || !spacer) return;

        // Получаем закрепленные датчики
        const pinnedSensors = this.getPinned();
        const hasPinned = pinnedSensors.size > 0;

        // Показываем/скрываем кнопку "снять все"
        const unpinBtn = this.getEl(`opcuasrv-unpin-${this.objectName}`);
        if (unpinBtn) {
            unpinBtn.style.display = hasPinned ? 'inline' : 'none';
        }

        // Локальная фильтрация по name и id (серверный search ищет только по name)
        let sensorsToShow = this.applyFilters(this.allSensors, 'name', 'iotype');

        // Если есть закрепленные и нет фильтра — показываем только их
        sensorsToShow = this.filterPinnedOnly(sensorsToShow, pinnedSensors);

        // Set spacer height to position visible rows correctly
        const spacerHeight = this.startIndex * this.rowHeight;
        spacer.style.height = `${spacerHeight}px`;

        // Show empty state if no sensors
        if (sensorsToShow.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="opcua-no-sensors">No variables</td></tr>';
            return;
        }

        // Сортировка: pinned всегда вверху, остальные по выбранной колонке
        sensorsToShow = this.sortItems(sensorsToShow, pinnedSensors, this.sortColumnDefs);

        // Get visible slice
        const visibleSensors = sensorsToShow.slice(this.startIndex, this.endIndex);

        // Update sensorMap for chart support
        visibleSensors.forEach(sensor => {
            if (sensor.id) {
                this.sensorMap.set(sensor.id, sensor);
            }
        });

        // Render visible rows with type badges and chart toggle
        tbody.innerHTML = visibleSensors.map(sensor => {
            const isPinned = pinnedSensors.has(String(sensor.id));
            const pinToggleClass = isPinned ? 'pin-toggle pinned' : 'pin-toggle';
            const pinIcon = isPinned ? '📌' : '○';
            const pinTitle = isPinned ? 'Unpin' : 'Pin';

            const iotype = sensor.iotype || sensor.type || '';
            const typeBadgeClass = iotype ? `type-badge type-${iotype}` : '';
            return `
            <tr data-sensor-id="${sensor.id || ''}">
                <td class="col-pin">
                    <span class="${pinToggleClass}" data-id="${sensor.id}" title="${pinTitle}">
                        ${pinIcon}
                    </span>
                </td>
                ${this.renderAddButtonsCell(sensor.id, sensor.name, 'opcuasrv', sensor.textname || sensor.name)}
                <td>${sensor.id || ''}</td>
                <td class="sensor-name" title="${escapeAttr(sensor.textname || sensor.comment || '')}">${escapeHtml(sensor.name || '')}</td>
                <td><span class="${typeBadgeClass}">${iotype}</span></td>
                <td class="sensor-value">${sensor.value !== undefined ? formatValueHtml(sensor.value) : '—'}</td>
                <td>${sensor.vtype || ''}</td>
                <td>${sensor.precision !== undefined ? sensor.precision : ''}</td>
            </tr>
            `;
        }).join('');

        // Bind chart toggle events
        this.attachChartToggleListeners(tbody, this.sensorMap);

        // Bind dashboard toggle events
        this.attachDashboardToggleListeners(tbody);

        // Bind pin toggle events
        tbody.querySelectorAll('.pin-toggle').forEach(toggle => {
            toggle.addEventListener('click', () => this.togglePin(parseIntegerOrDefault(toggle.dataset.id, null)));
        });

        // Обработчик кнопки "снять все"
        if (unpinBtn) {
            unpinBtn.onclick = () => this.unpinAll();
        }
    }

    // Override to use OPCUAServer SSE subscription
    subscribeToChartSensor(sensorId) {
        // OPCUAServer sensors are already subscribed through main SSE
        if (!this.subscribedSensorIds.has(sensorId)) {
            this.subscribedSensorIds.add(sensorId);
        }
    }

    showLoadingIndicator(show) {
        const indicator = this.getEl(`opcuasrv-loading-more-${this.objectName}`);
        if (indicator) {
            indicator.style.display = show ? 'block' : 'none';
        }
    }

    updateSensorCount() {
        this.updateItemCount(`opcuasrv-sensor-count-${this.objectName}`, this.allSensors.length, this.sensorsTotal);
    }

    loadSensorsHeight() {
        // Используем формат JSON как другие рендереры
        return this.loadSectionHeight('uniset-panel-opcuasrv-sensors', DEFAULT_SECTION_HEIGHT);
    }

    setupSensorsResize() {
        this.setupSectionResize(
            `opcuasrv-sensors-resize-${this.objectName}`,
            `opcuasrv-sensors-container-${this.objectName}`,
            'uniset-panel-opcuasrv-sensors',
            'sensorsHeight',
            { minHeight: SENSORS_CONTAINER_MIN_HEIGHT, maxHeight: DATA_TABLE_MAX_HEIGHT }
        );
    }

    // SSE subscription methods (использует SSESubscriptionMixin)
    async subscribeToSSE() {
        const sensorIds = this.allSensors.map(s => s.id).filter(id => id != null);
        // OPCUAServer использует другой API параметр (id= вместо filter=), указываем extension_type
        await this.subscribeToSSEFor('/opcua', sensorIds, 'sensor_ids', 'OPCUAServer SSE', { extension_type: 'OPCUAServer' });
    }

    async unsubscribeFromSSE() {
        await this.unsubscribeFromSSEFor('/opcua', 'sensor_ids', 'OPCUAServer SSE');
    }

    handleOPCUASensorUpdates(sensors) {
        this.handleBatchUpdates(sensors);
    }

    // Bridge для BatchRenderMixin
    getBatchItems() { return this.allSensors; }

    updateRowCells(row, update) {
        if (update.value !== undefined) {
            this._animateCellValue(row, '.sensor-value', formatValue(update.value), 'value-updated');
        }
    }

    // Pin management: pinStorageKey и renderAfterPinChange заданы в конструкторе

    // Bridge для TableSortMixin.renderAfterSort()
    sortRenderVisible() { this.renderVisibleSensors(); }
}

// Apply mixins to OPCUAServerRenderer
applyMixin(OPCUAServerRenderer, VirtualScrollMixin);
applyMixin(OPCUAServerRenderer, SSESubscriptionMixin);
applyMixin(OPCUAServerRenderer, BatchRenderMixin);
applyMixin(OPCUAServerRenderer, ResizableSectionMixin);
applyMixin(OPCUAServerRenderer, FilterMixin);
applyMixin(OPCUAServerRenderer, ParamsAccessibilityMixin);
applyMixin(OPCUAServerRenderer, ParamsManagerMixin);
applyMixin(OPCUAServerRenderer, ItemCounterMixin);
applyMixin(OPCUAServerRenderer, PinManagementMixin);
applyMixin(OPCUAServerRenderer, TableSortMixin);

// OPCUAServer рендерер (по extensionType)
registerRenderer('OPCUAServer', OPCUAServerRenderer);
