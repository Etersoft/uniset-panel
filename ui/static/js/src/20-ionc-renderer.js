// ============================================================================
// IONotifyControllerRenderer - рендерер для SharedMemory и подобных объектов
// ============================================================================

class IONotifyControllerRenderer extends BaseObjectRenderer {
    static getTypeName() {
        return 'IONotifyController';
    }
    static loadingIdPrefix = 'ionc';

    constructor(objectName, tabKey = null) {
        super(objectName, tabKey);
        this.sensors = [];
        this.sensorMap = new Map();
        this.filter = '';
        this.typeFilter = 'all';
        this.totalCount = 0;
        this.loading = false;
        this.subscribedSensorIds = new Set();

        // IONC владеет всеми датчиками, добавление через таблицу
        this.showAddSensorButton = false;
        // Для батчевого рендеринга
        this.pendingUpdates = new Map(); // id -> sensor
        this.renderScheduled = false;

        // Virtual scroll properties
        this.allSensors = [];
        this.initVirtualScrollProps();

        // Активные тестовые сигналы (sin/cos/square/...): Map<sensorId, state>.
        // Methods — в 20-ionc-test-signal.js (mixin).
        this.activeSensorTestSignals = new Map();

        // Инициализация сортировки
        this.initSortProps();
        this.sortTableId = `ionc-sensors-table-${objectName}`;
        // Определение колонок для сортировки
        this.sortColumnDefs = {
            id: { field: 'id', type: 'number' },
            name: { field: 'name', type: 'string' },
            type: { field: 'type', type: 'string' },
            value: { field: 'value', type: 'number' }
        };

        // Pin management
        this.pinStorageKey = 'uniset-panel-ionc-pinned';
        this.renderAfterPinChange = this.renderSensorsTable;
    }

    // IONotifyController датчики - показываем badge "IO" и prefix "io"
    getChartOptions() {
        return { badge: 'IO', prefix: 'io' };
    }

    createPanelHTML() {
        return `
            ${this.createChartsSection()}
            ${this.createSensorsSection()}
            ${this.createLogViewerSection()}
            ${this.createLogServerSection()}
            ${this.createLostConsumersSection()}
            ${this.createObjectInfoSection()}
        `;
    }

    initialize() {
        this.loadSortState('uniset-panel-ionc-sort');
        this.setupEventListeners();
        this.loadSensors();
        this.loadLostConsumers();
        setupChartsResize(this.tabKey);
        setupIONCSensorsResize(this.tabKey, this.objectName);
        this.setupFullVirtualScroll({
            viewportId: `ionc-sensors-viewport-${this.objectName}`,
        });
    }

    // Bridge methods for VirtualScrollMixin
    getVScrollItems() { return this.allSensors; }
    vscrollRenderVisible() { this.renderVisibleSensors(); }
    vscrollLoadMore() { this.loadMoreSensors(); }

    createSensorsSection() {
        return `
            <div class="collapsible-section reorderable-section ionc-sensors-section" data-section="ionc-sensors-${this.objectName}" data-section-id="ionc-sensors">
                <div class="collapsible-header">
                    <svg class="collapsible-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M6 9l6 6 6-6"/>
                    </svg>
                    <span class="collapsible-title">Sensors</span>
                    <span class="sensor-count" id="ionc-sensor-count-${this.objectName}">0</span>
                    <div class="filter-bar">
                        <input type="text" class="filter-input" id="ionc-filter-${this.objectName}" placeholder="Filter...">
                        <select class="type-filter" id="ionc-type-filter-${this.objectName}">
                            <option value="all">All</option>
                            <option value="AI">AI</option>
                            <option value="DI">DI</option>
                            <option value="AO">AO</option>
                            <option value="DO">DO</option>
                        </select>
                    </div>
                    <div class="section-reorder-buttons">
                        <button class="section-move-btn section-move-up" data-move-section="ionc-sensors" title="Move up">↑</button>
                        <button class="section-move-btn section-move-down" data-move-section="ionc-sensors" title="Move down">↓</button>
                    </div>
                </div>
                <div class="collapsible-content" id="section-ionc-sensors-${this.objectName}">
                    <div class="ionc-sensors-table-container" id="ionc-sensors-container-${this.objectName}">
                        <div class="ionc-sensors-viewport" id="ionc-sensors-viewport-${this.objectName}">
                            <div class="ionc-sensors-spacer" id="ionc-sensors-spacer-${this.objectName}"></div>
                            <table class="sensors-table ionc-sensors-table" id="ionc-sensors-table-${this.objectName}">
                                <thead>
                                    <tr>
                                        <th class="ionc-col-pin">
                                            <span class="ionc-unpin-all" id="ionc-unpin-${this.objectName}" title="Unpin all" style="display:none">✕</span>
                                        </th>
                                        <th class="ionc-col-add-buttons"></th>
                                        ${this.renderSortableHeader('id', 'ID', true, 'ionc-col-id')}
                                        ${this.renderSortableHeader('name', 'Name', true, 'ionc-col-name')}
                                        ${this.renderSortableHeader('type', 'Type', true, 'ionc-col-type')}
                                        ${this.renderSortableHeader('value', 'Value', true, 'ionc-col-value')}
                                        <th class="ionc-col-flags">Status</th>
                                        <th class="ionc-col-supplier">Supplier</th>
                                        <th class="ionc-col-consumers">Consumers</th>
                                        <th class="ionc-col-actions">Actions</th>
                                    </tr>
                                </thead>
                                <tbody class="ionc-sensors-tbody" id="ionc-sensors-tbody-${this.objectName}">
                                    <tr><td colspan="10" class="ionc-loading">Loading...</td></tr>
                                </tbody>
                            </table>
                            <div class="ionc-loading-more" id="ionc-loading-more-${this.objectName}" style="display: none;">Loading...</div>
                        </div>
                    </div>
                    <div class="resize-handle" id="ionc-resize-${this.objectName}"></div>
                </div>
            </div>
        `;
    }

    createLostConsumersSection() {
        return this.createCollapsibleSection(
            'ionc-lost',
            'Lost consumers',
            `<div class="ionc-lost-list" id="ionc-lost-list-${this.objectName}">
                <span class="ionc-lost-empty">No lost consumers</span>
            </div>`,
            { badge: true }
        );
    }

    setupEventListeners() {
        // Используем методы из FilterMixin
        this.setupFilterListeners(
            `ionc-filter-${this.objectName}`,
            `ionc-type-filter-${this.objectName}`,
            () => this.loadSensors()
        );
        this.setupContainerEscHandler(
            `ionc-sensors-container-${this.objectName}`,
            `ionc-filter-${this.objectName}`,
            () => this.loadSensors()
        );

        // Unpin all (persistent header element — wire'им один раз; в
        // renderVisibleSensors больше не трогаем).
        const unpinBtn = this.getEl(`ionc-unpin-${this.objectName}`);
        if (unpinBtn) {
            unpinBtn.addEventListener('click', () => this.unpinAll());
        }

        // Делегирование событий для кнопки добавления на dashboard
        // устанавливается в setupDashboardClickHandler после загрузки данных
    }

    // Устанавливает делегирование событий для кнопки добавления на dashboard
    setupDashboardClickHandler() {
        const tbody = getElementInTab(this.tabKey, `ionc-sensors-tbody-${this.objectName}`);
        if (tbody && !tbody._dashboardClickHandlerAttached) {
            tbody.addEventListener('click', (e) => {
                const btn = e.target.closest('.dashboard-add-btn');
                if (btn) {
                    e.stopPropagation();
                    showAddToDashboardDialog(
                        btn.dataset.sensorName,
                        btn.dataset.sensorLabel,
                        getDashboardBindingFromButton(btn)
                    );
                }
            });
            tbody._dashboardClickHandlerAttached = true;
        }
    }

    async loadSensors() {
        if (this.loading) return;
        this.loading = true;

        // Reset state
        this.allSensors = [];
        this.hasMore = true;
        this.startIndex = 0;
        this.endIndex = 0;

        const viewport = this.getEl(`ionc-sensors-viewport-${this.objectName}`);
        if (viewport) viewport.scrollTop = 0;

        const tbody = this.getEl(`ionc-sensors-tbody-${this.objectName}`);
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="11" class="ionc-loading">Loading...</td></tr>';
        }

        // Проверяем режим фильтрации: false = серверная (default), true = UI
        const useUIFilter = state.config.ioncUISensorsFilter;

        try {
            let url = this.buildUrl(`/api/objects/${encodeURIComponent(this.objectName)}/ionc/sensors?offset=0&limit=${this.chunkSize}`);

            // Серверная фильтрация (если не включена UI фильтрация)
            if (!useUIFilter) {
                if (this.filter) {
                    url += `&search=${encodeURIComponent(this.filter)}`;
                }
                if (this.typeFilter && this.typeFilter !== 'all') {
                    url += `&iotype=${this.typeFilter}`;
                }
            }

            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to load sensors');

            const data = await response.json();
            this.totalCount = data.size || 0;

            let sensors = data.sensors || [];

            // UI фильтрация (если включена)
            if (useUIFilter) {
                sensors = this.applyLocalFilters(sensors);
            }

            this.allSensors = sensors;
            this.sensors = sensors; // Для совместимости с существующим кодом
            this.sensorMap.clear();
            sensors.forEach(s => this.sensorMap.set(s.id, s));

            // Если нет фильтра и есть закреплённые датчики - загрузить их отдельно
            if (!this.hasActiveFilters()) {
                await this.loadPinnedSensors();
            }

            // hasMore — общий хелпер semantically'ного парсинга backend response.
            this.hasMore = computeSensorChunkPagination(sensors.length, data, this.chunkSize).hasMore;
            this.updateVisibleRows();
            this.updateSensorCount();

            // Подписываемся на SSE обновления для загруженных датчиков
            this.subscribeToSSE();

            // Устанавливаем делегирование для кнопки добавления на dashboard
            this.setupDashboardClickHandler();

            // Привязываем обработчики сортировки
            const table = this.getEl(`ionc-sensors-table-${this.objectName}`);
            this.attachSortHandlers(table);
        } catch (err) {
            console.error('Error loading IONC sensors:', err);
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="9" class="ionc-error">Error загрузки: ${escapeHtml(err.message)}</td></tr>`;
            }
        } finally {
            this.loading = false;
        }
    }

    // Загружает закреплённые датчики, если они не в текущем списке
    loadPinnedSensors() {
        return this.loadMissingPinnedSensors('/ionc/get');
    }

    applyLocalFilters(sensors) {
        let result = sensors;
        if (this.filter) {
            const filterLower = this.filter.toLowerCase();
            result = result.filter(s =>
                s.name.toLowerCase().includes(filterLower) ||
                String(s.id).includes(filterLower)
            );
        }
        if (this.typeFilter !== 'all') {
            result = result.filter(s => s.type === this.typeFilter);
        }
        return result;
    }

    async loadMoreSensors() {
        if (this.isLoadingChunk || !this.hasMore) return;

        this.isLoadingChunk = true;
        this.showLoadingIndicator(true);

        // Проверяем режим фильтрации: false = серверная (default), true = UI
        const useUIFilter = state.config.ioncUISensorsFilter;

        try {
            const nextOffset = this.allSensors.length;
            let url = this.buildUrl(`/api/objects/${encodeURIComponent(this.objectName)}/ionc/sensors?offset=${nextOffset}&limit=${this.chunkSize}`);

            // Серверная фильтрация (если не включена UI фильтрация)
            if (!useUIFilter) {
                if (this.filter) {
                    url += `&search=${encodeURIComponent(this.filter)}`;
                }
                if (this.typeFilter && this.typeFilter !== 'all') {
                    url += `&iotype=${this.typeFilter}`;
                }
            }

            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to load more sensors');

            const data = await response.json();
            let newSensors = data.sensors || [];

            // UI фильтрация (если включена)
            if (useUIFilter) {
                newSensors = this.applyLocalFilters(newSensors);
            }

            // Дедупликация: добавляем только датчики которых еще нет
            const existingIds = new Set(this.allSensors.map(s => s.id));
            const uniqueNewSensors = newSensors.filter(s => !existingIds.has(s.id));

            // Добавить к уже загруженным
            this.allSensors = [...this.allSensors, ...uniqueNewSensors];
            this.sensors = this.allSensors; // Для совместимости
            uniqueNewSensors.forEach(s => this.sensorMap.set(s.id, s));

            this.hasMore = computeSensorChunkPagination(this.allSensors.length, data, this.chunkSize).hasMore;
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
        const tbody = this.getEl(`ionc-sensors-tbody-${this.objectName}`);
        const spacer = this.getEl(`ionc-sensors-spacer-${this.objectName}`);
        if (!tbody || !spacer) return;

        // Set высоту spacer для позиционирования
        spacer.style.height = `${this.startIndex * this.rowHeight}px`;

        // Получаем закреплённые датчики
        const pinnedSensors = this.getPinned();
        const hasPinned = pinnedSensors.size > 0;

        // Показываем/скрываем кнопку "снять все"
        const unpinBtn = this.getEl(`ionc-unpin-${this.objectName}`);
        if (unpinBtn) {
            unpinBtn.style.display = hasPinned ? 'inline' : 'none';
        }

        // Filterуем датчики:
        // - если есть текстовый фильтр — показываем все (для поиска новых датчиков)
        // - иначе если есть закреплённые — показываем только их
        let sensorsToShow = this.allSensors;
        sensorsToShow = this.filterPinnedOnly(sensorsToShow, pinnedSensors);

        // Сортировка: pinned всегда вверху, остальные по выбранной колонке
        sensorsToShow = this.sortItems(sensorsToShow, pinnedSensors, this.sortColumnDefs);

        if (sensorsToShow.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="ionc-empty">No sensors</td></tr>';
            return;
        }

        // Virtual scroll: показываем только видимые строки
        const visibleSensors = sensorsToShow.slice(this.startIndex, this.endIndex);

        tbody.innerHTML = visibleSensors.map(sensor => this.renderSensorRow(sensor, pinnedSensors.has(String(sensor.id)))).join('');

        // Привязать события к строкам
        this.bindRowEvents(tbody);

        // unpinBtn handler — в setupEventListeners() (persistent элемент,
        // не пересоздаётся; раньше тут было .onclick — переехало для consistency
        // с modbus-master/slave).
    }

    bindRowEvents(tbody) {
        // Добавляем обработчики событий
        tbody.querySelectorAll('.ionc-btn-set').forEach(btn => {
            btn.addEventListener('click', () => this.showSetDialog(parseInt(btn.dataset.id, 10)));
        });
        this.bindFreezeToggleButtons(tbody);
        tbody.querySelectorAll('.ionc-btn-consumers').forEach(btn => {
            btn.addEventListener('click', () => this.showConsumersDialog(parseInt(btn.dataset.id, 10)));
        });
        // Кнопки тестового сигнала (диагностика)
        tbody.querySelectorAll('.ionc-btn-gen').forEach(btn => {
            btn.addEventListener('click', () => this.showSensorTestSignalDialog(parseInt(btn.dataset.id, 10)));
        });
        tbody.querySelectorAll('.ionc-btn-gen-stop').forEach(btn => {
            btn.addEventListener('click', () => this.stopSensorTestSignal(parseInt(btn.dataset.id, 10)));
        });
        tbody.querySelectorAll('.pin-toggle').forEach(btn => {
            btn.addEventListener('click', () => this.togglePin(parseInt(btn.dataset.id, 10)));
        });
        tbody.querySelectorAll('.ionc-chart-checkbox').forEach(cb => {
            cb.addEventListener('change', () => this.toggleSensorChartById(parseIntegerOrDefault(cb.dataset.id, null)));
        });
        // Кнопки добавления на dashboard обрабатываются через делегирование в setupDashboardClickHandler
    }

    // Legacy alias for compatibility
    renderSensorsTable() {
        this.renderVisibleSensors();
    }

    // Bridge для TableSortMixin.renderAfterSort()
    sortRenderVisible() { this.renderVisibleSensors(); }

    renderSensorRow(sensor, isPinned) {
        // Multi-server-aware lookup: те же sensor.name могут существовать на
        // разных серверах с разными textname. Берём scoped запись по
        // (serverId, objectName, name); fallback на legacy by-name внутри helper.
        const serverId = state.tabs.get(this.tabKey)?.serverId || '';
        const sensorInfo = getSensorInfoByKey(serverId, this.objectName, sensor.name);
        const textname = sensorInfo?.textname || sensor.textname || '';

        const frozenClass = sensor.frozen ? 'ionc-sensor-frozen' : '';
        const blockedClass = sensor.blocked ? 'ionc-sensor-blocked' : '';
        const readonlyClass = sensor.readonly ? 'ionc-sensor-readonly' : '';

        // Проверяем активный тестовый сигнал
        const hasGenerator = this.activeSensorTestSignals.has(sensor.id);
        const generatorClass = hasGenerator ? 'ionc-sensor-generating' : '';
        const genState = hasGenerator ? this.activeSensorTestSignals.get(sensor.id) : null;

        const flags = [];
        if (hasGenerator) flags.push(`<span class="ionc-flag ionc-flag-generator" title="Тестовый сигнал: ${genState.type} (${genState.min}-${genState.max})">⟳</span>`);
        if (sensor.frozen) flags.push('<span class="ionc-flag ionc-flag-frozen" title="Frozen">❄</span>');
        if (sensor.blocked) flags.push('<span class="ionc-flag ionc-flag-blocked" title="Blocked">🔒</span>');
        if (sensor.readonly) flags.push('<span class="ionc-flag ionc-flag-readonly" title="Read only">👁</span>');
        if (sensor.undefined) flags.push('<span class="ionc-flag ionc-flag-undefined" title="Undefined">?</span>');

        // Проверка возможности управления
        const canCtrl = canControl();
        const ctrlDisabled = !canCtrl ? 'disabled' : '';
        const ctrlTitle = !canCtrl ? 'Read-only mode' : '';

        const freezeBtn = sensor.frozen
            ? `<button class="ionc-btn ionc-btn-unfreeze" data-id="${sensor.id}" title="${ctrlTitle || 'Frozen at: ' + sensor.value + '. Click to unfreeze'}" ${ctrlDisabled}>🔥</button>`
            : `<button class="ionc-btn ionc-btn-freeze" data-id="${sensor.id}" title="${ctrlTitle || 'Freeze'}" ${ctrlDisabled}>❄</button>`;

        // Кнопка генератора
        const genBtn = hasGenerator
            ? `<button class="ionc-btn ionc-btn-gen-stop" data-id="${sensor.id}" title="${ctrlTitle || 'Остановить генератор'}" ${ctrlDisabled}>⏹</button>`
            : `<button class="ionc-btn ionc-btn-gen" data-id="${sensor.id}" title="${ctrlTitle || 'Генератор значений'}" ${sensor.readonly || !canCtrl ? 'disabled' : ''}>⟳</button>`;

        // Checkbox для графика
        const isOnChart = this.isSensorOnChart(sensor.name);
        const varName = `ionc-${sensor.id}`;

        // Supplier с fallback на supplier_id
        const supplierValue = sensor.supplier || (sensor.supplier_id ? String(sensor.supplier_id) : '');

        return `
            <tr class="ionc-sensor-row ${frozenClass} ${blockedClass} ${readonlyClass} ${generatorClass}" data-sensor-id="${sensor.id}">
                ${this.renderPinToggleCell({ id: sensor.id, isPinned, cellClass: 'ionc-col-pin' })}
                <td class="ionc-col-add-buttons add-buttons-col">
                    <span class="chart-toggle">
                        <input type="checkbox"
                               class="ionc-chart-checkbox chart-toggle-input"
                               id="ionc-chart-${this.objectName}-${varName}"
                               data-id="${sensor.id}"
                               data-name="${escapeAttr(sensor.name)}"
                               ${isOnChart ? 'checked' : ''}>
                        <label class="chart-toggle-label" for="ionc-chart-${this.objectName}-${varName}" title="Add to Chart">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 3v18h18"/>
                                <path d="M18 9l-5 5-4-4-3 3"/>
                            </svg>
                        </label>
                    </span>
                    <button class="dashboard-add-btn"
                            data-sensor-name="${escapeAttr(sensor.name)}"
                            data-sensor-label="${escapeAttr(textname || sensor.name)}"
                            data-sensor-id="${escapeAttr(sensor.id)}"
                            data-server-id="${escapeAttr(serverId)}"
                            data-object-name="${escapeAttr(this.objectName)}"
                            title="Add to Dashboard">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="3" width="7" height="7" rx="1"/>
                            <rect x="14" y="3" width="7" height="7" rx="1"/>
                            <rect x="3" y="14" width="7" height="7" rx="1"/>
                            <rect x="14" y="14" width="7" height="7" rx="1"/>
                        </svg>
                    </button>
                </td>
                <td class="ionc-col-id">${escapeHtml(sensor.id ?? '')}</td>
                <td class="ionc-col-name" title="${escapeAttr(textname)}">${escapeHtml(sensor.name)}</td>
                <td class="ionc-col-type"><span class="type-badge type-${escapeAttr(sensor.type || '')}">${escapeHtml(sensor.type || '')}</span></td>
                <td class="ionc-col-value">
                    ${sensor.frozen && sensor.real_value !== undefined && sensor.real_value !== sensor.value
                        ? `<span class="ionc-value ionc-value-frozen" id="ionc-value-${escapeAttr(this.objectName)}-${escapeAttr(sensor.id)}">
                               <span class="ionc-real-value">${formatValueHtml(sensor.real_value)}</span>
                               <span class="ionc-frozen-arrow">→</span>
                               <span class="ionc-frozen-value">${formatValueHtml(sensor.value)}❄</span>
                           </span>`
                        : `<span class="ionc-value" id="ionc-value-${escapeAttr(this.objectName)}-${escapeAttr(sensor.id)}">${formatValueHtml(sensor.value)}</span>`
                    }
                </td>
                <td class="ionc-col-flags">${flags.join(' ') || '—'}</td>
                <td class="ionc-col-supplier" id="ionc-supplier-${this.objectName}-${sensor.id}" title="${escapeAttr(supplierValue)}">${escapeHtml(supplierValue)}</td>
                <td class="ionc-col-consumers">
                    <button class="ionc-btn ionc-btn-consumers" data-id="${sensor.id}" title="Show consumers">👥</button>
                </td>
                <td class="ionc-col-actions">
                    <button class="ionc-btn ionc-btn-set" data-id="${sensor.id}" title="${ctrlTitle || 'Set value'}" ${sensor.readonly || !canCtrl ? 'disabled' : ''}>✎</button>
                    ${genBtn}
                    ${freezeBtn}
                </td>
            </tr>
        `;
    }

    // Используем метод toggleSensorChart из базового класса
    // isSensorOnChart также наследуется из BaseObjectRenderer
    toggleSensorChartById(sensorId) {
        const sensor = this.sensorMap.get(sensorId);
        if (!sensor) return;
        // Приводим к формату базового метода (iotype вместо type)
        const sensorData = { ...sensor, iotype: sensor.type };
        this.toggleSensorChart(sensorData);
    }

    updateSensorCount() {
        this.updateItemCount(`ionc-sensor-count-${this.objectName}`, this.allSensors.length, this.totalCount);
    }

    showSetDialog(sensorId) {
        const sensor = this.sensorMap.get(sensorId);
        if (!sensor) return;

        const objectName = this.objectName;
        const self = this;

        // Предупреждение если датчик заморожен
        const frozenWarning = sensor.frozen
            ? `<div class="ionc-dialog-warning">⚠️ Sensor is frozen. Value will not be changed until you unfreeze the sensor.</div>`
            : '';

        const body = `
            <div class="ionc-dialog-info">
                Sensor: <strong>${escapeHtml(sensor.name)}</strong> (ID: ${sensorId})<br>
                Current value: <strong>${sensor.value}</strong>
            </div>
            ${frozenWarning}
            <div class="ionc-dialog-field">
                <label for="ionc-set-value">New value:</label>
                <input type="number" id="ionc-set-value" value="${sensor.value}">
            </div>
        `;

        const footer = `
            <button class="ionc-dialog-btn ionc-dialog-btn-cancel" onclick="closeIoncDialog()">Cancel</button>
            <button class="ionc-dialog-btn ionc-dialog-btn-primary" id="ionc-set-confirm">Apply</button>
        `;

        const doSetValue = async () => {
            const input = document.getElementById('ionc-set-value');
            const value = parseIntegerOrDefault(input.value, NaN);

            if (Number.isNaN(value)) {
                showIoncDialogError('Enter an integer');
                input.classList.add('error');
                return;
            }

            await self._ioncSensorAction(
                sensorId, 'set', { value },
                (s, body) => {
                    // Если заморожен — обновляем real_value (значение SM), value остаётся замороженным.
                    if (s.frozen) s.real_value = body.value;
                    else          s.value      = body.value;
                },
                { errorPrefix: 'Failed to set value', autoCloseDialog: true }
            );
        };

        openIoncDialog({
            title: 'Set value',
            body,
            footer,
            focusInput: true,
            onConfirm: doSetValue
        });

        // Attach button handler
        document.getElementById('ionc-set-confirm').addEventListener('click', doSetValue);
    }

    // Показать диалог заморозки (одинарный клик на ❄)
    showFreezeDialog(sensorId) {
        const sensor = this.sensorMap.get(sensorId);
        if (!sensor) return;

        const objectName = this.objectName;
        const self = this;

        const body = `
            <div class="ionc-dialog-info">
                Sensor: <strong>${escapeHtml(sensor.name)}</strong> (ID: ${sensorId})<br>
                Current value: <strong>${sensor.value}</strong>
            </div>
            <div class="ionc-dialog-field">
                <label for="ionc-freeze-value">Freeze value:</label>
                <input type="number" id="ionc-freeze-value" value="${sensor.value}">
                <div class="ionc-dialog-hint">Double click on ❄ — quick freeze at current value</div>
            </div>
        `;

        const footer = `
            <button class="ionc-dialog-btn ionc-dialog-btn-cancel" onclick="closeIoncDialog()">Cancel</button>
            <button class="ionc-dialog-btn ionc-dialog-btn-freeze" id="ionc-freeze-confirm">❄ Freeze</button>
        `;

        const doFreeze = async () => {
            const input = document.getElementById('ionc-freeze-value');
            const value = parseIntegerOrDefault(input.value, NaN);

            if (Number.isNaN(value)) {
                showIoncDialogError('Enter an integer');
                input.classList.add('error');
                return;
            }

            await self._ioncSensorAction(
                sensorId, 'freeze', { value },
                (s, body) => {
                    // Локальное обновление для мгновенной обратной связи —
                    // SSE update подтвердит state из API.
                    s.real_value = s.value;
                    s.frozen = true;
                    s.value = body.value;
                },
                { errorPrefix: 'Failed to freeze', autoCloseDialog: true }
            );
        };

        openIoncDialog({
            title: 'Freeze sensor',
            body,
            footer,
            focusInput: true,
            onConfirm: doFreeze
        });

        document.getElementById('ionc-freeze-confirm').addEventListener('click', doFreeze);
    }

    // Internal: общий POST к ionc-эндпоинту с локальным sensor mutate + перерисовкой.
    // endpoint: 'set' | 'freeze' | 'unfreeze'
    // body: payload для POST (sensor_id будет добавлен)
    // mutateSensor(sensor, body): функция локального обновления sensor для мгновенной FB
    // opts.errorPrefix — дефолтный msg если err.error пустой (по умолчанию `Failed to ${endpoint}`)
    // opts.autoCloseDialog — закрыть IONC dialog после успеха (для dialog-driven actions).
    async _ioncSensorAction(sensorId, endpoint, body, mutateSensor, opts = {}) {
        const sensor = this.sensorMap.get(sensorId);
        if (!sensor) return;
        try {
            const url = this.buildUrl(`/api/objects/${encodeURIComponent(this.objectName)}/ionc/${endpoint}`);
            const response = await controlledFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sensor_id: sensorId, ...body })
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || opts.errorPrefix || `Failed to ${endpoint}`);
            }
            mutateSensor(sensor, body);
            this.reRenderSensorRow(sensorId);
            if (opts.autoCloseDialog) closeIoncDialog();
        } catch (err) {
            showIoncDialogError(`Error: ${err.message}`);
        }
    }

    // Быстрая заморозка на текущем значении (двойной клик на ❄)
    async quickFreeze(sensorId) {
        const sensor = this.sensorMap.get(sensorId);
        if (!sensor) return;
        await this._ioncSensorAction(sensorId, 'freeze',
            { value: sensor.value },
            (s) => { s.real_value = s.value; s.frozen = true; },
            { errorPrefix: 'Failed to freeze' });
    }

    // Показать диалог разморозки (клик на 🔥)
    showUnfreezeDialog(sensorId) {
        const sensor = this.sensorMap.get(sensorId);
        if (!sensor) return;

        const objectName = this.objectName;
        const self = this;

        const realValue = sensor.real_value !== undefined ? sensor.real_value : '—';
        const frozenValue = sensor.value;

        const body = `
            <div class="ionc-dialog-info">
                Sensor: <strong>${escapeHtml(sensor.name)}</strong> (ID: ${sensorId})
            </div>
            <div class="ionc-unfreeze-values">
                <div class="ionc-unfreeze-row">
                    <span class="ionc-unfreeze-label">Real value (SM):</span>
                    <span class="ionc-unfreeze-value">${realValue}</span>
                </div>
                <div class="ionc-unfreeze-row">
                    <span class="ionc-unfreeze-label">Frozen value:</span>
                    <span class="ionc-unfreeze-value ionc-unfreeze-frozen">${frozenValue}❄</span>
                </div>
            </div>
            <div class="ionc-dialog-hint">After unfreezing, the sensor will return to its real value</div>
        `;

        const footer = `
            <button class="ionc-dialog-btn ionc-dialog-btn-cancel" onclick="closeIoncDialog()">Cancel</button>
            <button class="ionc-dialog-btn ionc-dialog-btn-unfreeze" id="ionc-unfreeze-confirm">🔥 Unfreeze</button>
        `;

        const doUnfreeze = async () => {
            await self._ioncSensorAction(
                sensorId, 'unfreeze', {},
                (s) => {
                    s.frozen = false;
                    if (s.real_value !== undefined) s.value = s.real_value;
                },
                { errorPrefix: 'Failed to unfreeze', autoCloseDialog: true }
            );
        };

        openIoncDialog({
            title: 'Unfreeze sensor',
            body,
            footer,
            focusInput: false,
            onConfirm: doUnfreeze
        });

        document.getElementById('ionc-unfreeze-confirm').addEventListener('click', doUnfreeze);
    }

    // Быстрая разморозка (двойной клик на 🔥)
    async quickUnfreeze(sensorId) {
        await this._ioncSensorAction(sensorId, 'unfreeze',
            {},
            (s) => {
                s.frozen = false;
                if (s.real_value !== undefined) s.value = s.real_value;
            },
            'Failed to unfreeze');
    }


    // Перерисовка строки датчика и переподключение обработчиков
    reRenderSensorRow(sensorId) {
        const sensor = this.sensorMap.get(sensorId);
        if (!sensor) return;

        // getEls (внутри панели this.tabKey) — а не document.querySelector,
        // иначе при multi-server одинаковый sensorId на разных серверах
        // указывал бы на чужую вкладку.
        const row = this.getEls(`tr[data-sensor-id="${sensorId}"]`)[0];
        if (row) {
            row.outerHTML = this.renderSensorRow(sensor);
            this.attachRowEventListeners(sensorId);
        }
    }

    // Подключение обработчиков к строке датчика
    bindFreezeToggleButtons(root) {
        root.querySelectorAll('.ionc-btn-freeze').forEach(btn => {
            const sensorId = parseInt(btn.dataset.id, 10);
            bindSingleDoubleClick(
                btn,
                () => this.showFreezeDialog(sensorId),
                () => this.quickFreeze(sensorId)
            );
        });

        root.querySelectorAll('.ionc-btn-unfreeze').forEach(btn => {
            const sensorId = parseInt(btn.dataset.id, 10);
            bindSingleDoubleClick(
                btn,
                () => this.showUnfreezeDialog(sensorId),
                () => this.quickUnfreeze(sensorId)
            );
        });
    }

    attachRowEventListeners(sensorId) {
        // getEls внутри панели вкладки — см. reRenderSensorRow.
        const row = this.getEls(`tr[data-sensor-id="${sensorId}"]`)[0];
        if (!row) return;

        row.querySelector('.ionc-btn-set')?.addEventListener('click', () => this.showSetDialog(sensorId));
        row.querySelector('.ionc-btn-consumers')?.addEventListener('click', () => this.showConsumersDialog(sensorId));
        this.bindFreezeToggleButtons(row);

        // Кнопки тестового сигнала (диагностика)
        row.querySelector('.ionc-btn-gen')?.addEventListener('click', () => this.showSensorTestSignalDialog(sensorId));
        row.querySelector('.ionc-btn-gen-stop')?.addEventListener('click', () => this.stopSensorTestSignal(sensorId));

        // Чекбокс графика
        row.querySelector('.ionc-chart-checkbox')?.addEventListener('change', () => this.toggleSensorChartById(sensorId));

        // Кнопка добавления на dashboard
        row.querySelector('.dashboard-add-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const btn = e.currentTarget;
            const sensorName = btn.dataset.sensorName;
            const sensorLabel = btn.dataset.sensorLabel;
            showAddToDashboardDialog(sensorName, sensorLabel, getDashboardBindingFromButton(btn));
        });
    }

    async showConsumersDialog(sensorId) {
        const sensor = this.sensorMap.get(sensorId);
        if (!sensor) return;

        // Показываем диалог с индикатором загрузки
        const loadingBody = `
            <div class="ionc-dialog-info">
                Sensor: <strong>${escapeHtml(sensor.name)}</strong> (ID: ${sensorId})
            </div>
            <div class="ionc-dialog-empty">Loading подписчиков...</div>
        `;

        const footer = `
            <button class="ionc-dialog-btn ionc-dialog-btn-cancel" onclick="closeIoncDialog()">Close</button>
        `;

        openIoncDialog({
            title: 'Sensor consumers',
            body: loadingBody,
            footer,
            focusInput: false
        });

        try {
            const url = this.buildUrl(`/api/objects/${encodeURIComponent(this.objectName)}/ionc/consumers?sensors=${sensorId}`);
            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to load consumers');

            const data = await response.json();
            const sensorData = data.sensors?.[0];
            const consumers = sensorData?.consumers || [];

            let contentHtml;
            if (consumers.length === 0) {
                contentHtml = `
                    <div class="ionc-dialog-info">
                        Sensor: <strong>${escapeHtml(sensor.name)}</strong> (ID: ${sensorId})
                    </div>
                    <div class="ionc-dialog-empty">No consumers</div>
                `;
            } else {
                const rows = consumers.map(c => `
                    <tr>
                        <td>${escapeHtml(c.name)}</td>
                        <td>${escapeHtml(c.node_name || '')}</td>
                        <td>${c.smCount ?? 0}</td>
                        <td>${c.lostEvents ?? 0}</td>
                    </tr>
                `).join('');

                contentHtml = `
                    <div class="ionc-dialog-info">
                        Sensor: <strong>${escapeHtml(sensor.name)}</strong> (ID: ${sensorId})<br>
                        Подписчиков: <strong>${consumers.length}</strong>
                    </div>
                    <div class="ionc-dialog-consumers">
                        <table>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Узел</th>
                                    <th>smCount</th>
                                    <th>lostEvents</th>
                                </tr>
                            </thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                `;
            }

            document.getElementById('ionc-dialog-body').innerHTML = contentHtml;
        } catch (err) {
            showIoncDialogError(`Error: ${err.message}`);
        }
    }

    async loadLostConsumers() {
        try {
            const url = this.buildUrl(`/api/objects/${encodeURIComponent(this.objectName)}/ionc/lost`);
            const response = await fetch(url);
            if (!response.ok) return;

            const data = await response.json();
            const lost = data['lost consumers'] || [];

            const listEl = this.getEl(`ionc-lost-list-${this.objectName}`);
            const countEl = this.getEl(`ionc-lost-count-${this.objectName}`);

            if (countEl) countEl.textContent = lost.length;

            if (listEl) {
                if (lost.length === 0) {
                    listEl.innerHTML = '<span class="ionc-lost-empty">No lost consumers</span>';
                } else {
                    listEl.innerHTML = lost.map(c =>
                        `<div class="ionc-lost-item">${escapeHtml(c.name)} (ID: ${c.id})</div>`
                    ).join('');
                }
            }
        } catch (err) {
            console.error('Error loading lost consumers:', err);
        }
    }

    update(data) {
        // При обновлении объекта обновляем информацию
        renderObjectInfo(this.tabKey, data.object);
        this.handleLogServer(data.LogServer);
    }

    // Обработка SSE обновления датчика (батчевая версия)
    handleIONCSensorUpdate(sensor) {
        // Обновляем в sensorMap
        if (this.sensorMap.has(sensor.id)) {
            const oldSensor = this.sensorMap.get(sensor.id);

            // API возвращает всю информацию:
            // - frozen: флаг заморозки
            // - value: замороженное значение (если frozen) или текущее (если нет)
            // - real_value: реальное значение SM
            Object.assign(oldSensor, sensor);

            // Добавляем в очередь на рендеринг
            this.pendingUpdates.set(sensor.id, oldSensor);
        }

        // Планируем батчевый рендеринг
        if (!this.renderScheduled) {
            this.renderScheduled = true;
            requestAnimationFrame(() => this.batchRenderUpdates());
        }
    }

    // Батчевый рендеринг обновлений DOM
    batchRenderUpdates() {
        this.renderScheduled = false;

        if (this.pendingUpdates.size === 0) return;

        // Обновляем DOM для всех ожидающих датчиков
        for (const [id, sensor] of this.pendingUpdates) {
            // Обновляем значение с учётом формата frozen
            const valueEl = getElementInTab(this.tabKey, `ionc-value-${this.objectName}-${id}`);
            if (valueEl) {
                // Рендерим правильный формат в зависимости от состояния frozen
                if (sensor.frozen && sensor.real_value !== undefined && sensor.real_value !== sensor.value) {
                    // Формат: real_value → frozen_value❄
                    valueEl.className = 'ionc-value ionc-value-frozen ionc-value-updated';
                    valueEl.innerHTML = `
                        <span class="ionc-real-value">${formatValueHtml(sensor.real_value)}</span>
                        <span class="ionc-frozen-arrow">→</span>
                        <span class="ionc-frozen-value">${formatValueHtml(sensor.value)}❄</span>
                    `;
                } else {
                    // Обычный формат
                    valueEl.className = 'ionc-value ionc-value-updated';
                    valueEl.textContent = sensor.value;
                }
            }

            // Обновляем флаги если изменились
            const row = getElementsInTab(this.tabKey, `tr[data-sensor-id="${id}"]`);
            if (row.length > 0) {
                row[0].classList.toggle('ionc-sensor-frozen', sensor.frozen);
                row[0].classList.toggle('ionc-sensor-blocked', sensor.blocked);
                row[0].classList.toggle('ionc-sensor-readonly', sensor.readonly);
            }

            // Обновляем supplier
            const supplierEl = getElementInTab(this.tabKey, `ionc-supplier-${this.objectName}-${id}`);
            if (supplierEl) {
                const supplierValue = sensor.supplier || (sensor.supplier_id ? String(sensor.supplier_id) : '');
                supplierEl.textContent = supplierValue;
                supplierEl.title = supplierValue;
            }
        }

        // Очищаем очередь
        this.pendingUpdates.clear();

        // Убираем анимацию через ANIMATION_REMOVAL_DELAY
        setTimeout(() => {
            const panel = getTabPanel(this.tabKey);
            if (panel) {
                panel.querySelectorAll('.ionc-value-updated').forEach(el => el.classList.remove('ionc-value-updated'));
            }
        }, ANIMATION_REMOVAL_DELAY);
    }

    // Подписка на SSE обновления для видимых датчиков (использует SSESubscriptionMixin)
    async subscribeToSSE() {
        const sensorIds = this.sensors.map(s => s.id);
        await this.subscribeToSSEFor('/ionc', sensorIds, 'sensor_ids', 'IONC');
    }

    // Отписка от SSE обновлений (использует SSESubscriptionMixin)
    async unsubscribeFromSSE() {
        await this.unsubscribeFromSSEFor('/ionc', 'sensor_ids', 'IONC');
    }

    destroy() {
        // Останавливаем все активные тестовые сигналы
        this.stopAllSensorTestSignals();
        // Отписываемся от SSE обновлений при закрытии
        this.unsubscribeFromSSE();
        // Уничтожаем LogViewer
        this.destroyLogViewer();
    }
}

// Apply mixins to IONotifyControllerRenderer
applyMixin(IONotifyControllerRenderer, VirtualScrollMixin);
applyMixin(IONotifyControllerRenderer, SSESubscriptionMixin);
applyMixin(IONotifyControllerRenderer, ResizableSectionMixin);
applyMixin(IONotifyControllerRenderer, FilterMixin);
applyMixin(IONotifyControllerRenderer, ItemCounterMixin);
applyMixin(IONotifyControllerRenderer, PinManagementMixin);
applyMixin(IONotifyControllerRenderer, TableSortMixin);
