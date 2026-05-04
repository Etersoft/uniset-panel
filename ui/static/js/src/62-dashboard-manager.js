
// ============================================================================
// Widget Registry
// ============================================================================

const WIDGET_TYPES = {
    'gauge': GaugeWidget,
    'level': LevelWidget,
    'led': LedWidget,
    'label': LabelWidget,
    'divider': DividerWidget,
    'statusbar': StatusBarWidget,
    'bargraph': BarGraphWidget,
    'digital': DigitalWidget,
    'toggle': ToggleWidget,
    'pushbutton': PushButtonWidget,
    'setpoint': SetpointWidget,
    'generator': GeneratorWidget,
    'chart': ChartWidget
};

window.registerDashboardWidgetType = function(type, WidgetClass) {
    WIDGET_TYPES[type] = WidgetClass;
};

// Grid settings используют константы из 00-constants.js:
// DASHBOARD_GRID_COLS, DASHBOARD_GRID_ROW_HEIGHT, DASHBOARD_GRID_GAP

// ============================================================================
// Dashboard Manager
// ============================================================================

class DashboardManager {
    constructor() {
        this.gridEl = document.getElementById('dashboard-grid');
        this.selectEl = document.getElementById('dashboard-select');
        this.actionsEl = document.getElementById('dashboard-actions');

        this.loadDashboards();
        this.bindEvents();
    }

    bindEvents() {
        // View switcher
        document.getElementById('view-objects-btn')?.addEventListener('click', () => this.switchView('objects'));
        document.getElementById('view-dashboard-btn')?.addEventListener('click', () => this.switchView('dashboard'));

        // Dashboard selector
        this.selectEl?.addEventListener('change', (e) => this.loadDashboard(e.target.value));

        // Dashboard actions
        document.getElementById('dashboard-new-btn')?.addEventListener('click', () => this.showNewDashboardDialog());
        document.getElementById('dashboard-add-widget-btn')?.addEventListener('click', () => this.showWidgetPicker());
        document.getElementById('dashboard-edit-btn')?.addEventListener('click', () => this.toggleEditMode());
        document.getElementById('dashboard-import-btn')?.addEventListener('click', () => this.showImportDialog());
        document.getElementById('dashboard-export-btn')?.addEventListener('click', () => this.exportDashboard());
        document.getElementById('dashboard-delete-btn')?.addEventListener('click', () => this.deleteDashboard());

        // Dialog events
        document.getElementById('dashboard-name-confirm')?.addEventListener('click', () => this.createDashboard());
        document.getElementById('widget-config-apply')?.addEventListener('click', () => this.applyWidgetConfig());
        document.getElementById('import-confirm')?.addEventListener('click', () => this.confirmImport());

        // Import dropzone
        this.setupImportDropzone();

        // Dashboards section collapse toggle
        document.getElementById('dashboards-section-header')?.addEventListener('click', () => {
            const section = document.getElementById('dashboards-section');
            section?.classList.toggle('collapsed');
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeWidgetPicker();
                closeWidgetConfig();
                closeDashboardNameDialog();
                closeDashboardImport();
                // Deselect widget
                if (dashboardState.selectedWidgetId) {
                    this.selectWidget(null);
                }
            }

            // Arrow keys for moving selected widget
            // Default: move by grid cell, Shift+Arrow: move by 1px (fine mode)
            if (dashboardState.editMode && dashboardState.selectedWidgetId) {
                const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
                if (arrowKeys.includes(e.key)) {
                    e.preventDefault();
                    this.moveWidgetByKey(e.key, e.shiftKey);
                }
            }
        });

        // Click on grid background deselects widget
        this.gridEl?.addEventListener('click', (e) => {
            if (!dashboardState.editMode) return;
            // Only deselect if clicked directly on grid, not on a widget
            if (e.target === this.gridEl || e.target.classList.contains('dashboard-placeholder')) {
                this.selectWidget(null);
            }
        });
    }

    switchView(view) {
        // Delegate to global switchView function
        if (typeof window.switchView === 'function') {
            window.switchView(view);
        }
        this.saveDashboardSettings();
    }

    // Обновить все виджеты с их текущими значениями. Используется после
    // reconnect / при возврате на dashboard view.
    //
    // Multi-sensor widget'ы (StatusBar, BarGraph, ChartWidget) переопределяют
    // update() так, что он принимает объект {sensorName: value}, а не scalar.
    // Они роутятся через updateBySensor()/updateSensor() и не кешируют scalar
    // в widget.value. Передавать им (widget.value, widget.error) бесполезно —
    // skip и подождём следующего ionc_sensor_batch (max задержка = poll interval).
    refreshAllWidgets() {
        dashboardState.widgets.forEach((widget) => {
            if (typeof widget.updateBySensor === 'function' || typeof widget.updateSensor === 'function') {
                return; // multi-sensor — refresh не применим, придёт через SSE
            }
            if (widget.value !== null) {
                widget.update(widget.value, widget.error);
            }
        });
    }

    getGridMetrics() {
        const gridEl = this.gridEl || document.querySelector('.dashboard-grid');
        if (!gridEl) return null;

        const gridRect = gridEl.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(gridEl);
        const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
        const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
        const gap = DASHBOARD_GRID_GAP;
        const contentWidth = gridRect.width - paddingLeft * 2;
        const columnsGapWidth = gap * (DASHBOARD_GRID_COLS - 1);
        const cellWidth = (contentWidth - columnsGapWidth) / DASHBOARD_GRID_COLS;
        const cellHeight = DASHBOARD_GRID_ROW_HEIGHT;

        return {
            gridEl,
            gridRect,
            paddingLeft,
            paddingTop,
            gap,
            contentWidth,
            cellWidth,
            cellHeight
        };
    }

    loadDashboards() {
        // Load from localStorage
        try {
            const userDashboards = JSON.parse(localStorage.getItem('user-dashboards') || '[]');
            userDashboards.forEach(name => {
                const config = localStorage.getItem(`dashboard:${name}`);
                if (config) {
                    dashboardState.dashboards.set(name, JSON.parse(config));
                }
            });
        } catch (err) {
            console.warn('Failed to load dashboards from localStorage:', err);
        }

        // Load server dashboards
        this.loadServerDashboards();

        // Update selector
        this.updateDashboardSelector();

        // Restore last viewed dashboard
        const lastDashboard = localStorage.getItem('last-dashboard');
        if (lastDashboard && dashboardState.dashboards.has(lastDashboard)) {
            this.loadDashboard(lastDashboard);
        }
    }

    async loadServerDashboards() {
        try {
            const response = await fetch('/api/dashboards');
            if (response.ok) {
                const dashboardInfos = await response.json();
                if (Array.isArray(dashboardInfos) && dashboardInfos.length > 0) {
                    // API returns array of DashboardInfo (name, description, widgetCount, server)
                    for (const info of dashboardInfos) {
                        const name = info.name;
                        if (!name) continue;

                        // Check if dashboard already exists (e.g., from localStorage)
                        const existing = dashboardState.dashboards.get(name);
                        if (existing) {
                            // Mark existing dashboard as server dashboard
                            // (it might have been loaded from localStorage without _server flag)
                            existing._server = true;
                        } else {
                            // Create placeholder - will be loaded on demand
                            dashboardState.dashboards.set(name, {
                                _server: true,
                                _loaded: false,
                                meta: { name, description: info.description || '' }
                            });
                        }
                    }
                    this.updateDashboardSelector();
                }
            }
        } catch (err) {
            debugLog('No server dashboards available');
        }
    }

    // Разбивает dashboardState.dashboards на server/user по флагу config._server.
    // Используется в updateDashboardSelector и updateSidebarDashboards.
    _partitionDashboards() {
        const all = Array.from(dashboardState.dashboards.entries());
        return {
            server: all.filter(([_, c]) => c._server),
            user:   all.filter(([_, c]) => !c._server),
            all,
        };
    }

    updateDashboardSelector() {
        if (!this.selectEl) return;

        const currentValue = this.selectEl.value;
        const { server, user } = this._partitionDashboards();

        let html = '<option value="">Select dashboard...</option>';

        const renderGroup = (label, items) => {
            if (items.length === 0) return '';
            const opts = items.map(([name]) =>
                `<option value="${escapeAttr(name)}">${escapeHtml(name)}</option>`
            ).join('');
            return `<optgroup label="${label}">${opts}</optgroup>`;
        };

        html += renderGroup('Server Dashboards', server);
        html += renderGroup('My Dashboards', user);

        this.selectEl.innerHTML = html;
        this.selectEl.value = currentValue;

        // Also update sidebar dashboards list (legacy hidden section + новые
        // sidebar groups). renderSidebarGroups читает 'user-dashboards' из
        // localStorage — saveDashboard уже обновил key, нужно re-render.
        this.updateSidebarDashboards();
        if (typeof renderSidebarGroups === 'function') {
            renderSidebarGroups();
        }
    }

    updateSidebarDashboards() {
        const listEl = document.getElementById('dashboards-list');
        const countEl = document.getElementById('dashboards-count');
        if (!listEl) return;

        const { server: serverDashboards, user: userDashboards, all: allDashboards } = this._partitionDashboards();

        // Update count
        if (countEl) {
            countEl.textContent = allDashboards.length;
        }

        const dashboardIcon = `
            <svg class="dashboard-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7"/>
                <rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/>
                <rect x="3" y="14" width="7" height="7"/>
            </svg>`;

        const renderItem = (name, isServer) => {
            const isActive = dashboardState.currentDashboard === name;
            const cls = `dashboard-item${isServer ? ' server' : ''}${isActive ? ' active' : ''}`;
            const badge = isServer ? '<span class="dashboard-badge">srv</span>' : '';
            return `
                <li class="${cls}" data-name="${escapeAttr(name)}">
                    ${dashboardIcon}
                    <span class="dashboard-name">${escapeHtml(name)}</span>
                    ${badge}
                </li>
            `;
        };

        // Server dashboards first, then user dashboards
        const html = serverDashboards.map(([name]) => renderItem(name, true)).join('')
                   + userDashboards.map(([name]) => renderItem(name, false)).join('');

        listEl.innerHTML = html;

        // Bind click events
        listEl.querySelectorAll('.dashboard-item').forEach(item => {
            item.addEventListener('click', () => {
                const name = item.dataset.name;
                this.switchView('dashboard');
                this.loadDashboard(name);
                if (this.selectEl) {
                    this.selectEl.value = name;
                }
            });
        });
    }

    // Lazy resolve binding'а из state.sensorsByKey (берёт первый match по sensorName).
    // НЕ сохраняет dashboard на сервер — миграция в памяти; полный triplet
    // персистится только когда юзер сам нажмёт Apply в config dialog или Export.
    _migrateLegacyBinding() {
        if (!state?.sensorsByKey) return 0;
        let total = 0;
        for (const widget of dashboardState.widgets.values()) {
            const cfg = widget?.config;
            if (!cfg) continue;
            const n = _migrateBindingPure(cfg, state.sensorsByKey);
            if (n > 0) total += n;
        }
        if (total > 0) {
            console.info(`dashboard "${dashboardState.currentDashboard}": migrated ${total} legacy widget bindings; re-save to persist`);
        }
        return total;
    }

    // Возвращает true, если хоть один widget имеет неполный binding (sensor без триплета).
    // Chart legacy sensors хранят имя в b.name — учитываем обе формы.
    _anyLegacyBinding() {
        const isUnresolved = (b) => (b?.sensor || b?.name)
            && (!b.serverId || !b.objectName || !Number.isFinite(b.sensorId));
        for (const w of dashboardState.widgets.values()) {
            const cfg = w?.config;
            if (!cfg) continue;
            if (isUnresolved(cfg)) return true;
            if (cfg.sensor2 && isUnresolved({
                serverId: cfg.serverId2 ?? cfg.serverId,
                objectName: cfg.objectName2 ?? cfg.objectName,
                sensor: cfg.sensor2, sensorId: cfg.sensorId2,
            })) return true;
            if (Array.isArray(cfg.items) && cfg.items.some(isUnresolved)) return true;
            if (Array.isArray(cfg.zones)) {
                for (const z of cfg.zones) if ((z.sensors || []).some(isUnresolved)) return true;
            }
        }
        return false;
    }

    // Вызывается из updateDashboardWidgets() в 63-dashboard-dialogs.js на каждый
    // ionc_sensor_batch / modbus_register_batch / opcua_sensor_batch / sensor_data
    // событие SSE. Дешёвый no-op если pending не выставлен.
    tryResolvePendingMigration() {
        if (!this._pendingMigration) return;
        const filled = this._migrateLegacyBinding();
        if (filled > 0) {
            this.updateSensorSubscriptions();
            this.initializeWidgetValues();
        }
        if (!this._anyLegacyBinding()) this._pendingMigration = false;
    }

    // Cold-start bootstrap: для legacy dashboard'ов (только sensor name без триплета),
    // загруженных ДО прогрева state.sensorsByKey через user navigation, прогреваем
    // registry явно — иначе SSE не приходит (нет подписок) → migration retry никогда
    // не срабатывает (chicken-and-egg, см. docs/review/2026-04-30-pre-existing-flaky-tests.md).
    //
    // Стратегия: для каждого connected server'а — fetch IONC objects, для каждого
    // (server, object) — fetch sensors list. Per-server tracking — bool guard ловил
    // race на первой загрузке (state.servers ещё пуст → bootstrap noop → флаг true →
    // следующие dashboards без bootstrap). Set отрабатывает каждый новый connected.
    async _bootstrapSensorRegistry() {
        if (typeof state === 'undefined' || !state?.servers || !state.sensorsByKey) return;
        if (!this._bootstrappedServers) this._bootstrappedServers = new Set();

        const tasks = [];
        for (const [serverId, srv] of state.servers) {
            if (!srv?.connected) continue;
            if (this._bootstrappedServers.has(serverId)) continue;
            this._bootstrappedServers.add(serverId);
            tasks.push(this._bootstrapServerSensors(serverId));
        }
        if (tasks.length === 0) return;
        await Promise.allSettled(tasks);
        // Re-attempt migration с прогретым registry.
        this.tryResolvePendingMigration();
    }

    async _bootstrapServerSensors(serverId) {
        try {
            const objResp = await fetch(`/api/objects?server=${encodeURIComponent(serverId)}&type=IONotifyController`);
            if (!objResp.ok) return;
            const objData = await objResp.json();
            const objects = (objData?.objects || [])
                .map(o => typeof o === 'string' ? o : o?.name)
                .filter(Boolean);

            // Параллельно fetch'аем sensors per object — server'ам обычно ОК с десятком
            // одновременных запросов.
            await Promise.allSettled(objects.map(async (objectName) => {
                const sensorsResp = await fetch(
                    `/api/objects/${encodeURIComponent(objectName)}/ionc/sensors`
                    + `?server=${encodeURIComponent(serverId)}&limit=${DASHBOARD_SENSOR_REGISTRY_FETCH_LIMIT}`
                );
                if (!sensorsResp.ok) return;
                const data = await sensorsResp.json();
                for (const s of (data?.sensors || [])) {
                    if (s?.name && Number.isFinite(s?.id)) {
                        state.sensorsByKey.set(
                            makeSensorKey(serverId, objectName, s.name),
                            { id: s.id, name: s.name, serverId, objectName, type: s.type }
                        );
                    }
                }
            }));
        } catch (e) {
            console.warn(`bootstrap server ${serverId} failed:`, e);
        }
    }

    async loadDashboard(name) {
        if (!name) {
            this.clearDashboard();
            return;
        }

        let config = dashboardState.dashboards.get(name);
        if (!config) {
            console.warn('Dashboard not found:', name);
            this.clearDashboard();
            return;
        }

        // Если уже на этом dashboard и виджеты живы — НЕ пересоздаём их с нуля.
        // sidebar-click + view-toggle теперь не «сбрасывают» layout/values/edit-mode,
        // а лишь освежают подписки и значения (на случай новых SSE-событий или
        // подключившихся серверов). Force-reload — через clearDashboard() либо
        // переключение dashboard'ов.
        if (dashboardState.currentDashboard === name && dashboardState.widgets.size > 0) {
            this._migrateLegacyBinding();
            this.updateSensorSubscriptions();
            this.initializeWidgetValues();
            this._pendingMigration = this._anyLegacyBinding();
            return;
        }

        // Lazy load server dashboard if not yet loaded
        if (config._server && !config._loaded) {
            try {
                const response = await fetch(`/api/dashboards/${encodeURIComponent(name)}`);
                if (response.ok) {
                    const fullConfig = await response.json();
                    fullConfig._server = true;
                    fullConfig._loaded = true;
                    dashboardState.dashboards.set(name, fullConfig);
                    config = fullConfig;
                } else {
                    console.error('Failed to load dashboard:', name, response.status);
                    this.clearDashboard();
                    return;
                }
            } catch (err) {
                console.error('Error loading dashboard:', name, err);
                this.clearDashboard();
                return;
            }
        }

        dashboardState.currentDashboard = name;
        this.actionsEl?.classList.remove('hidden');

        // Update sidebar active state
        this.updateSidebarDashboards();

        // Clear existing widgets
        this.clearWidgets();

        // Render widgets
        this.renderDashboard(config);

        // Save last viewed
        localStorage.setItem('last-dashboard', name);

        // Hide delete button for server dashboards (they are read-only on server)
        // Edit button remains visible - user can modify and export to JSON
        const deleteBtn = document.getElementById('dashboard-delete-btn');
        if (config._server) {
            deleteBtn?.classList.add('hidden');
        } else {
            deleteBtn?.classList.remove('hidden');
        }
    }

    renderDashboard(config) {
        if (!this.gridEl) return;

        this.gridEl.innerHTML = '';

        if (!config.widgets || config.widgets.length === 0) {
            this.gridEl.innerHTML = `
                <div class="dashboard-placeholder">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                        <line x1="12" y1="8" x2="12" y2="16"/>
                        <line x1="8" y1="12" x2="16" y2="12"/>
                    </svg>
                    <p>Dashboard is empty. Click "Add Widget" to get started.</p>
                </div>
            `;
            return;
        }

        config.widgets.forEach(widgetConfig => {
            this.createWidget(widgetConfig);
        });

        // Subscribe to sensor updates
        this._migrateLegacyBinding();
        this.updateSensorSubscriptions();

        // Initialize widgets with cached/fetched values
        this.initializeWidgetValues();

        // Track pending migration for cold-start hook (см. tryResolvePendingMigration)
        this._pendingMigration = this._anyLegacyBinding();

        // Если binding'и не резолвятся из-за пустого sensorsByKey — async-прогреваем
        // его через `/api/objects/...` + `/ionc/sensors`. Не ждём (fire-and-forget):
        // dashboard рендерится сразу, виджеты заполнятся после повторной миграции.
        if (this._pendingMigration) {
            this._bootstrapSensorRegistry().catch(e => console.warn('sensor registry bootstrap:', e));
        }
    }

    // Initialize widgets with current sensor values (from cache or API)
    async initializeWidgetValues() {
        // Collect unique sensorKeys from subscriptions (после Step 2.5 ключи Map'ов
        // — это полные sensorKey, не короткие имена).
        const sensorKeys = new Set();
        for (const k of dashboardState.sensorSubscriptions.keys()) sensorKeys.add(k);
        for (const k of dashboardState.setpointSubscriptions.keys()) sensorKeys.add(k);
        for (const k of dashboardState.chartSubscriptions.keys()) sensorKeys.add(k);

        if (sensorKeys.size === 0) return;

        // First, try to use cached values from SSE events.
        const uncachedKeys = [];
        for (const cacheKey of sensorKeys) {
            const cached = state.sensorValuesCache.get(cacheKey);
            if (cached) {
                if (Date.now() - cached.timestamp < DASHBOARD_SENSOR_CACHE_TTL_MS) {
                    this.handleSensorUpdate(cacheKey, cached.value, cached.error);
                } else {
                    uncachedKeys.push(cacheKey);
                }
            } else {
                uncachedKeys.push(cacheKey);
            }
        }

        // For uncached sensors, try to fetch from API
        if (uncachedKeys.length > 0) {
            this.fetchSensorValues(uncachedKeys);
        }
    }

    // Fetch sensor values from IONC API. Принимает массив sensorKey'ев
    // (каждый ключ уже кодирует serverId|objectName|sensorName — Step 2.6).
    // Группирует по (serverId, objectName), делает один search request
    // на каждый sensorName (текущий API не поддерживает batch search).
    async fetchSensorValues(sensorKeys) {
        // Group by (serverId, objectName) → Map<sensorName, sensorKey>.
        const groups = new Map();

        for (const key of sensorKeys) {
            const parsed = parseSensorKey(key);
            if (!parsed) continue; // legacy / malformed — пропускаем
            const grpKey = makeGroupKey(parsed.serverId, parsed.objectName);
            if (!groups.has(grpKey)) groups.set(grpKey, new Map());
            groups.get(grpKey).set(parsed.sensorName, key);
        }

        for (const [grpKey, nameToKey] of groups) {
            const { serverId, objectName } = parseGroupKey(grpKey);
            for (const [sensorName, sensorKey] of nameToKey) {
                try {
                    const url = `/api/objects/${encodeURIComponent(objectName)}/ionc/sensors`
                        + `?server=${encodeURIComponent(serverId)}`
                        + `&search=${encodeURIComponent(sensorName)}&limit=1`;
                    const response = await fetch(url);
                    if (!response.ok) continue;
                    const data = await response.json();
                    if (!data.sensors || data.sensors.length === 0) continue;
                    const sensor = data.sensors.find(s => s.name === sensorName);
                    if (!sensor) continue;
                    const writeKey = makeSensorKey(serverId, objectName, sensor.name);
                    state.sensorValuesCache.set(writeKey, {
                        value: sensor.value,
                        error: null,
                        timestamp: Date.now()
                    });
                    this.handleSensorUpdate(writeKey, sensor.value, null);
                } catch (err) {
                    console.warn('Failed to fetch sensor value:', sensorKey, err);
                }
            }
        }
    }

    createWidget(widgetConfig) {
        const WidgetClass = WIDGET_TYPES[widgetConfig.type];
        if (!WidgetClass) {
            console.warn('Unknown widget type:', widgetConfig.type);
            return null;
        }

        const { position = {} } = widgetConfig;
        const { col = 0, row = 0, width = 2, height = 1, freePosition } = position;

        // Create widget container
        const container = document.createElement('div');
        container.className = `dashboard-widget widget-${width}x${height}`;
        // Transparent by default for most widgets, but NOT for chart
        const isChart = widgetConfig.type === 'chart';
        const isTransparent = isChart
            ? (widgetConfig.config?.transparent === true)  // chart: explicit true only
            : (widgetConfig.config?.transparent !== false); // others: default true
        if (isTransparent) {
            container.classList.add('transparent');
        }
        container.dataset.widgetId = widgetConfig.id;
        container.dataset.type = widgetConfig.type;
        this.applyWidgetTransform(container, widgetConfig);

        // Free pixel positioning (Shift+drag) or grid snap
        if (freePosition) {
            container.style.position = 'absolute';
            container.style.left = `${freePosition.left}px`;
            container.style.top = `${freePosition.top}px`;
            // Always calculate size from grid cells (width/height are always in cells)
            const gridMetrics = this.getGridMetrics();
            if (gridMetrics) {
                const { gap, cellWidth, cellHeight } = gridMetrics;
                container.style.width = `${width * cellWidth + (width - 1) * gap}px`;
                container.style.height = `${height * cellHeight + (height - 1) * gap}px`;
            }
            container.classList.add('free-position');
        } else {
            container.style.gridColumn = `${col + 1} / span ${width}`;
            container.style.gridRow = `${row + 1} / span ${height}`;
        }

        // Widget header (always hidden, shows action buttons on hover)
        // Title is rendered inside widget-content by the widget
        container.innerHTML = `
            <div class="widget-header hidden-title">
                <span class="widget-title">${escapeHtml(widgetConfig.config?.label || widgetConfig.type)}</span>
                <div class="widget-actions">
                    <button class="widget-action-btn config" title="Configure">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="3"/>
                            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
                        </svg>
                    </button>
                    <button class="widget-action-btn delete" title="Remove">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="widget-resize-handle" title="Drag to resize"></div>
        `;

        // Create widget instance
        const widget = new WidgetClass(widgetConfig.id, widgetConfig.config || {}, container);

        // Маркер для CSS правил (.dashboard-widget[data-active-widget="true"]):
        // используется для edit-mode grayscale и active-disabled индикатора.
        if (widget instanceof ActiveDashboardWidget) {
            container.dataset.activeWidget = 'true';
        }

        this.renderWidgetContent(widget, widgetConfig);

        // Bind widget events
        container.querySelector('.widget-action-btn.config')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showWidgetConfig(widgetConfig.id);
        });

        container.querySelector('.widget-action-btn.delete')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.removeWidget(widgetConfig.id);
        });

        // Resize handle
        const resizeHandle = container.querySelector('.widget-resize-handle');
        if (resizeHandle) {
            resizeHandle.addEventListener('mousedown', (e) => {
                if (!dashboardState.editMode) return;
                e.preventDefault();
                e.stopPropagation();
                this.startResize(widgetConfig.id, container, e);
            });
        }

        // Drag by header
        const header = container.querySelector('.widget-header');
        if (header) {
            header.addEventListener('mousedown', (e) => {
                if (!dashboardState.editMode) return;
                // Ignore clicks on buttons
                if (e.target.closest('.widget-action-btn')) return;
                e.preventDefault();
                this.startDrag(widgetConfig.id, container, e);
            });
        }

        // Select/deselect widget by click in edit mode (toggle)
        container.addEventListener('click', (e) => {
            if (!dashboardState.editMode) return;
            // Ignore clicks on buttons
            if (e.target.closest('.widget-action-btn')) return;
            // Toggle: if already selected, deselect
            if (dashboardState.selectedWidgetId === widgetConfig.id) {
                this.selectWidget(null);
            } else {
                this.selectWidget(widgetConfig.id);
            }
        });

        // Add to grid
        this.gridEl.appendChild(container);

        // Store widget instance
        dashboardState.widgets.set(widgetConfig.id, widget);

        return widget;
    }

    applyWidgetTransform(container, widgetConfig) {
        const rotate = widgetConfig.config?.rotate || 0;
        const offset = widgetConfig.position?.offset;
        const transforms = [];
        if (offset && (offset.x || offset.y)) {
            transforms.push(`translate(${offset.x || 0}px, ${offset.y || 0}px)`);
        }
        if (rotate) {
            transforms.push(`rotate(${rotate}deg)`);
        }
        container.style.transform = transforms.length > 0 ? transforms.join(' ') : '';
    }

    renderWidgetTitle(container, config) {
        const title = config?.title;
        if (!title) return;

        const widgetContent = container.querySelector('.widget-content');
        if (!widgetContent) return;

        const titleEl = document.createElement('div');
        titleEl.className = 'widget-title-label' + (config.titleBorder ? ' title-badge' : '');
        titleEl.textContent = title;
        widgetContent.parentNode.insertBefore(titleEl, widgetContent);
    }

    renderWidgetContent(widget, widgetConfig) {
        widget.render();

        // Initial interactivity sync (без него виджет создаётся в правильном
        // visual state до первого editMode toggle / controlToken event).
        if (typeof widget._updateInteractivityClass === 'function') {
            widget._updateInteractivityClass();
        }

        this.renderWidgetTitle(widget.container, widgetConfig.config || {});
    }

    clearWidgets() {
        // Destroy all widget instances
        dashboardState.widgets.forEach(widget => {
            if (widget && typeof widget.destroy === 'function') {
                widget.destroy();
            }
        });
        dashboardState.widgets.clear();
        // Чистим все три карты подписок одновременно с widgets — иначе stale
        // sensor/setpoint/chart subscriptions будут слать update'ы к destroy'нутым widget'ам
        // до следующего updateSensorSubscriptions.
        dashboardState.sensorSubscriptions.clear();
        dashboardState.setpointSubscriptions.clear();
        dashboardState.chartSubscriptions.clear();
    }

    clearDashboard() {
        dashboardState.currentDashboard = null;
        this.clearWidgets();
        this.actionsEl?.classList.add('hidden');
        this._pendingMigration = false;
        this._bootstrappedServers?.clear();

        // Reset selector to empty value
        if (this.selectEl) {
            this.selectEl.value = '';
        }

        // Update sidebar to remove active state
        this.updateSidebarDashboards();

        // Clear last-dashboard from localStorage
        localStorage.removeItem('last-dashboard');

        if (this.gridEl) {
            this.gridEl.innerHTML = `
                <div class="dashboard-placeholder">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M12 6v6l4 2"/>
                    </svg>
                    <p>Select a dashboard or create a new one</p>
                </div>
            `;
        }
    }

    showNewDashboardDialog() {
        const overlay = document.getElementById('dashboard-name-overlay');
        const input = document.getElementById('dashboard-name-input');
        const title = document.getElementById('dashboard-name-title');

        if (title) title.textContent = 'New Dashboard';
        if (input) input.value = '';
        overlay?.classList.remove('hidden');
        input?.focus();
    }

    createDashboard() {
        const input = document.getElementById('dashboard-name-input');
        const name = input?.value?.trim();

        if (!name) {
            alert('Please enter a dashboard name');
            return;
        }

        if (dashboardState.dashboards.has(name)) {
            alert('A dashboard with this name already exists');
            return;
        }

        const config = {
            version: DASHBOARD_VERSION,
            meta: {
                name,
                created: new Date().toISOString(),
                modified: new Date().toISOString()
            },
            grid: { cols: DASHBOARD_GRID_COLS, rowHeight: DASHBOARD_GRID_ROW_HEIGHT, gap: DASHBOARD_GRID_GAP },
            widgets: []
        };

        dashboardState.dashboards.set(name, config);
        this.saveDashboard(name);
        this.updateDashboardSelector();

        closeDashboardNameDialog();

        // Select the new dashboard
        if (this.selectEl) {
            this.selectEl.value = name;
        }
        this.loadDashboard(name);
    }

    saveDashboard(name = dashboardState.currentDashboard) {
        if (!name) return;

        const config = dashboardState.dashboards.get(name);
        if (!config || config._server) return; // Don't save server dashboards

        config.meta = config.meta || {};
        config.meta.modified = new Date().toISOString();

        // Save to localStorage
        localStorage.setItem(`dashboard:${name}`, JSON.stringify(config));

        // Update user dashboards list
        const userDashboards = Array.from(dashboardState.dashboards.entries())
            .filter(([_, c]) => !c._server)
            .map(([n]) => n);
        localStorage.setItem('user-dashboards', JSON.stringify(userDashboards));
    }

    saveDashboardSettings() {
        localStorage.setItem('dashboard-view', dashboardState.currentView);
    }

    showWidgetPicker() {
        const overlay = document.getElementById('widget-picker-overlay');
        const content = document.getElementById('widget-picker-content');

        if (!content) return;

        content.innerHTML = Object.values(WIDGET_TYPES).map(WidgetClass => `
            <div class="widget-picker-item" data-type="${WidgetClass.type}">
                <div class="widget-picker-icon">${WidgetClass.icon}</div>
                <span class="widget-picker-name">${WidgetClass.displayName}</span>
                <span class="widget-picker-desc">${WidgetClass.description}</span>
            </div>
        `).join('');

        // Bind click events
        content.querySelectorAll('.widget-picker-item').forEach(item => {
            item.addEventListener('click', () => {
                const type = item.dataset.type;
                closeWidgetPicker();
                this.showWidgetConfig(null, type);
            });
        });

        overlay?.classList.remove('hidden');
    }

    showWidgetConfig(widgetId, type = null) {
        const overlay = document.getElementById('widget-config-overlay');
        const title = document.getElementById('widget-config-title');
        const content = document.getElementById('widget-config-content');

        if (!content) return;

        // widget-config-content — persistent <div> (live между открытиями
        // диалога). Сбрасываем все idempotency-флаги, которые initConfigHandlers
        // конкретных виджетов выставляют на этом узле, иначе для второго
        // открытия handler'ы рано-return'ят и autocomplete не работает.
        delete content.dataset.activeHandlersWired;
        delete content.dataset.genHandlersWired;
        delete content.dataset.chartHandlersWired;
        // Helpers из 60-widget-sensor-binding.js используют dataset-флаги
        // sensorBinding_* и sensorItemList_*. content живёт между открытиями
        // диалога, поэтому сбрасываем оба семейства перед новым wiring.
        for (const key of Object.keys(content.dataset)) {
            if (key.startsWith('sensorBinding') || key.startsWith('sensorItemList')) {
                delete content.dataset[key];
            }
        }

        let config = {};
        let position = {};
        let WidgetClass;

        if (widgetId) {
            // Editing existing widget
            const dashboard = dashboardState.dashboards.get(dashboardState.currentDashboard);
            const widgetConfig = dashboard?.widgets?.find(w => w.id === widgetId);
            if (widgetConfig) {
                type = widgetConfig.type;
                config = widgetConfig.config || {};
                position = widgetConfig.position || {};
            }
        }

        WidgetClass = WIDGET_TYPES[type];
        if (!WidgetClass) return;

        if (title) {
            title.textContent = widgetId ? `Configure ${WidgetClass.displayName}` : `Add ${WidgetClass.displayName}`;
        }

        // Chart widget doesn't show transparent option (always opaque)
        const showTransparent = type !== 'chart';
        const transparentHtml = showTransparent ? `
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label class="widget-toggle">
                        <input type="checkbox" name="transparent" ${config.transparent !== false ? 'checked' : ''}>
                        <span class="widget-toggle-track"><span class="widget-toggle-thumb"></span></span>
                        <span class="widget-toggle-label">Transparent background</span>
                    </label>
                </div>
            </div>
        ` : '';

        // Title option (shown above widget content)
        const titleHtml = `
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>Title (optional)</label>
                    <input type="text" class="widget-input" name="title" value="${escapeAttr(config.title || '')}" placeholder="e.g. Engine RPM">
                </div>
                <div class="widget-config-field">
                    <label class="widget-toggle">
                        <input type="checkbox" name="titleBorder" ${config.titleBorder ? 'checked' : ''}>
                        <span class="widget-toggle-track"><span class="widget-toggle-thumb"></span></span>
                        <span class="widget-toggle-label">Badge style</span>
                    </label>
                </div>
            </div>
        `;

        // Rotate option - available for all widget types
        const currentRotate = config.rotate || 0;
        const rotateHtml = `
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>Rotate</label>
                    <div class="rotate-input-group">
                        <input type="number" name="rotate" value="${currentRotate}" min="0" max="360" step="1">
                        <span class="rotate-unit">°</span>
                        <div class="rotate-quick-buttons">
                            <button type="button" class="rotate-quick-btn" data-angle="0">0°</button>
                            <button type="button" class="rotate-quick-btn" data-angle="90">90°</button>
                            <button type="button" class="rotate-quick-btn" data-angle="180">180°</button>
                            <button type="button" class="rotate-quick-btn" data-angle="270">270°</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        content.innerHTML = `
            ${WidgetClass.getConfigForm(config)}
            ${titleHtml}
            ${transparentHtml}
            ${rotateHtml}
        `;

        // Store context for apply
        content.dataset.widgetId = widgetId || '';
        content.dataset.widgetType = type;

        // Setup custom number inputs
        setupNumberInputs(content);

        // Setup rotate quick buttons
        const rotateInput = content.querySelector('[name="rotate"]');
        content.querySelectorAll('.rotate-quick-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (rotateInput) {
                    rotateInput.value = btn.dataset.angle;
                }
            });
        });

        // Call widget-specific config handlers if available
        if (typeof WidgetClass.initConfigHandlers === 'function') {
            WidgetClass.initConfigHandlers(content, config);
        }

        overlay?.classList.remove('hidden');
    }

    applyWidgetConfig() {
        const content = document.getElementById('widget-config-content');
        if (!content) return;

        const widgetId = content.dataset.widgetId;
        const type = content.dataset.widgetType;
        const WidgetClass = WIDGET_TYPES[type];

        if (!WidgetClass) return;

        const config = WidgetClass.parseConfigForm(content);
        const transparent = content.querySelector('[name="transparent"]')?.checked || false;
        config.transparent = transparent;

        // Read title value
        const title = content.querySelector('[name="title"]')?.value?.trim() || '';
        if (title) {
            config.title = title;
        }

        // Read titleBorder value
        const titleBorder = content.querySelector('[name="titleBorder"]')?.checked || false;
        config.titleBorder = titleBorder;

        // Read rotate value
        const rotateInput = content.querySelector('[name="rotate"]');
        const rotate = parseIntegerOrDefault(rotateInput?.value, 0);
        config.rotate = rotate;

        const dashboard = dashboardState.dashboards.get(dashboardState.currentDashboard);
        if (!dashboard) return;

        if (widgetId) {
            // Update existing widget - keep current size
            const widgetConfig = dashboard.widgets.find(w => w.id === widgetId);
            if (widgetConfig) {
                widgetConfig.config = config;
                const width = widgetConfig.position.width;
                const height = widgetConfig.position.height;

                // Re-render widget
                const widget = dashboardState.widgets.get(widgetId);
                if (widget) {
                    widget.config = config;
                    widget.container.className = `dashboard-widget widget-${width}x${height}`;
                    widget.container.classList.toggle('transparent', transparent);
                    // Preserve edit-mode class if active
                    if (dashboardState.editMode) {
                        widget.container.classList.add('edit-mode');
                    }
                    this.applyWidgetTransform(widget.container, widgetConfig);
                    widget.container.querySelector('.widget-title').textContent = config.label || type;
                    // Remove old title and content before re-render
                    widget.container.querySelector('.widget-title-label')?.remove();
                    widget.container.querySelector('.widget-content')?.remove();
                    this.renderWidgetContent(widget, widgetConfig);
                }
            }
        } else {
            // Add new widget with default size. Style-aware override:
            // PushButton mushroom круглый и хочет 3×3, flat 3×2, pill 3×1.
            // Если у класса есть getDefaultSizeForStyle и юзер выбрал style
            // в форме конфига — используем тот размер, иначе static defaultSize.
            const newId = `widget-${Date.now()}`;
            const sizeOverride = (typeof WidgetClass.getDefaultSizeForStyle === 'function' && config.style)
                ? WidgetClass.getDefaultSizeForStyle(config.style)
                : null;
            const width  = sizeOverride?.width  ?? WidgetClass.defaultSize.width;
            const height = sizeOverride?.height ?? WidgetClass.defaultSize.height;
            const position = this.findEmptyPosition(width, height);

            const widgetConfig = {
                id: newId,
                type,
                position: { ...position, width, height },
                config
            };

            dashboard.widgets = dashboard.widgets || [];
            dashboard.widgets.push(widgetConfig);

            this.createWidget(widgetConfig);
        }

        this.saveDashboard();
        this.updateSensorSubscriptions();
        closeWidgetConfig();
    }

    findEmptyPosition(width, height) {
        // Simple algorithm: find first empty position
        const dashboard = dashboardState.dashboards.get(dashboardState.currentDashboard);
        const widgets = dashboard?.widgets || [];
        const cols = DASHBOARD_GRID_COLS;

        // Build occupancy grid
        const occupied = new Set();
        widgets.forEach(w => {
            const { col, row, width: w2, height: h } = w.position || {};
            for (let c = col; c < col + w2; c++) {
                for (let r = row; r < row + h; r++) {
                    occupied.add(`${c},${r}`);
                }
            }
        });

        // Find first empty position
        for (let row = 0; row < DASHBOARD_POSITION_SCAN_ROWS; row++) {
            for (let col = 0; col <= cols - width; col++) {
                let fits = true;
                for (let c = col; c < col + width && fits; c++) {
                    for (let r = row; r < row + height && fits; r++) {
                        if (occupied.has(`${c},${r}`)) {
                            fits = false;
                        }
                    }
                }
                if (fits) {
                    return { col, row };
                }
            }
        }

        return { col: 0, row: 0 };
    }

    async removeWidget(widgetId) {
        const confirmed = await showConfirmDialog(
            'Remove Widget',
            'Are you sure you want to remove this widget?',
            'Remove'
        );
        if (!confirmed) return;

        const dashboard = dashboardState.dashboards.get(dashboardState.currentDashboard);
        if (!dashboard) return;

        // Remove from config
        dashboard.widgets = dashboard.widgets.filter(w => w.id !== widgetId);

        // Remove widget instance
        const widget = dashboardState.widgets.get(widgetId);
        if (widget) {
            if (typeof widget.destroy === 'function') {
                widget.destroy();
            }
            widget.container?.remove();
            dashboardState.widgets.delete(widgetId);
        }

        this.saveDashboard();
        this.updateSensorSubscriptions();
    }

    startResize(widgetId, container, startEvent) {
        const dashboard = dashboardState.dashboards.get(dashboardState.currentDashboard);
        if (!dashboard) return;

        const widgetConfig = dashboard.widgets.find(w => w.id === widgetId);
        if (!widgetConfig) return;

        const startX = startEvent.clientX;
        const startY = startEvent.clientY;
        const startWidth = widgetConfig.position.width || DASHBOARD_DEFAULT_WIDGET_WIDTH;
        const startHeight = widgetConfig.position.height || DASHBOARD_DEFAULT_WIDGET_HEIGHT;

        // Calculate cell size
        const gridMetrics = this.getGridMetrics();
        if (!gridMetrics) return;
        const { gap, cellWidth, cellHeight } = gridMetrics;

        // minSize widget'а — fall back на 1×1 если static minSize не задан.
        // Без этого resize мог сжать любой widget до 1×1, игнорируя задекларированные
        // в классе ограничения (напр. ToggleWidget.minSize = { width: 2, height: 1 }).
        const widget = dashboardState.widgets.get(widgetId);
        const minSize = widget?.constructor?.minSize || { width: 1, height: 1 };
        const minWidth = minSize.width || 1;
        const minHeight = minSize.height || 1;

        container.classList.add('resizing');

        const onMouseMove = (e) => {
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;

            // Calculate new size in cells
            const col = widgetConfig.position.col || 0;
            const maxWidth = DASHBOARD_GRID_COLS - col; // Can't extend beyond grid
            let newWidth = Math.max(minWidth, Math.min(maxWidth, Math.round(startWidth + deltaX / (cellWidth + gap))));
            let newHeight = Math.max(minHeight, Math.min(DASHBOARD_MAX_WIDGET_HEIGHT, Math.round(startHeight + deltaY / (cellHeight + gap))));

            // Update visual preview
            container.style.gridColumn = `${(widgetConfig.position.col || 0) + 1} / span ${newWidth}`;
            container.style.gridRow = `${(widgetConfig.position.row || 0) + 1} / span ${newHeight}`;

            // Store pending size
            container.dataset.pendingWidth = newWidth;
            container.dataset.pendingHeight = newHeight;
        };

        const onMouseUp = () => {
            container.classList.remove('resizing');
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            // Apply new size
            const newWidth = parseIntegerOrDefault(container.dataset.pendingWidth, startWidth);
            const newHeight = parseIntegerOrDefault(container.dataset.pendingHeight, startHeight);

            if (newWidth !== startWidth || newHeight !== startHeight) {
                widgetConfig.position.width = newWidth;
                widgetConfig.position.height = newHeight;

                // Update class
                container.className = container.className.replace(/widget-\d+x\d+/, `widget-${newWidth}x${newHeight}`);

                this.saveDashboard();
            }

            delete container.dataset.pendingWidth;
            delete container.dataset.pendingHeight;
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    startDrag(widgetId, container, startEvent) {
        // Auto-select widget being dragged
        if (dashboardState.selectedWidgetId !== widgetId) {
            this.selectWidget(widgetId);
        }

        const dashboard = dashboardState.dashboards.get(dashboardState.currentDashboard);
        if (!dashboard) return;

        const widgetConfig = dashboard.widgets.find(w => w.id === widgetId);
        if (!widgetConfig) return;

        const gridMetrics = this.getGridMetrics();
        if (!gridMetrics) return;
        const { gridEl, gridRect, paddingLeft, paddingTop, gap, cellWidth, cellHeight } = gridMetrics;
        const containerRect = container.getBoundingClientRect();

        // Offset from mouse to container top-left
        const offsetX = startEvent.clientX - containerRect.left;
        const offsetY = startEvent.clientY - containerRect.top;

        const width = widgetConfig.position.width || DASHBOARD_DEFAULT_WIDGET_WIDTH;
        const height = widgetConfig.position.height || DASHBOARD_DEFAULT_WIDGET_HEIGHT;

        // Switch to absolute positioning for smooth drag
        container.classList.add('dragging');
        container.style.position = 'fixed';
        container.style.width = `${containerRect.width}px`;
        container.style.height = `${containerRect.height}px`;
        container.style.left = `${containerRect.left}px`;
        container.style.top = `${containerRect.top}px`;
        container.style.zIndex = String(DASHBOARD_DRAG_Z_INDEX);
        container.style.gridColumn = '';
        container.style.gridRow = '';

        // Create placeholder with actual widget size (absolute positioning)
        const placeholder = document.createElement('div');
        placeholder.className = 'widget-drag-placeholder';
        placeholder.style.position = 'absolute';
        placeholder.style.width = `${containerRect.width}px`;
        placeholder.style.height = `${containerRect.height}px`;
        // Initial position (use freePosition if available, otherwise calculate from grid)
        const initCol = widgetConfig.position.col || 0;
        const initRow = widgetConfig.position.row || 0;
        const freePos = widgetConfig.position.freePosition;
        if (freePos) {
            placeholder.style.left = `${freePos.left}px`;
            placeholder.style.top = `${freePos.top}px`;
        } else {
            placeholder.style.left = `${initCol * (cellWidth + gap)}px`;
            placeholder.style.top = `${initRow * (cellHeight + gap)}px`;
        }
        gridEl.appendChild(placeholder);

        let pendingCol = initCol;
        let pendingRow = initRow;
        let pendingFreePosition = null;
        let isShiftHeld = startEvent.shiftKey;

        const onMouseMove = (e) => {
            // Move container with mouse
            const widgetLeft = e.clientX - offsetX;
            const widgetTop = e.clientY - offsetY;
            container.style.left = `${widgetLeft}px`;
            container.style.top = `${widgetTop}px`;

            isShiftHeld = e.shiftKey;

            // Calculate position relative to grid content area
            const relativeLeft = widgetLeft - gridRect.left - paddingLeft;
            const relativeTop = widgetTop - gridRect.top - paddingTop;

            if (isShiftHeld) {
                // Free pixel positioning (Shift held)
                // Only store left/top, size comes from width/height (grid cells)
                placeholder.style.display = 'none';
                pendingFreePosition = {
                    left: Math.max(0, relativeLeft),
                    top: Math.max(0, relativeTop)
                };
            } else {
                // Grid snap mode
                placeholder.style.display = '';
                pendingFreePosition = null;

                let newCol = Math.floor(relativeLeft / (cellWidth + gap));
                let newRow = Math.floor(relativeTop / (cellHeight + gap));

                // Clamp to grid bounds
                newCol = Math.max(0, Math.min(DASHBOARD_GRID_COLS - width, newCol));
                newRow = Math.max(0, newRow);

                if (newCol !== pendingCol || newRow !== pendingRow) {
                    pendingCol = newCol;
                    pendingRow = newRow;
                    placeholder.style.left = `${newCol * (cellWidth + gap)}px`;
                    placeholder.style.top = `${newRow * (cellHeight + gap)}px`;
                }
            }
        };

        const onMouseUp = (e) => {
            container.classList.remove('dragging');
            container.classList.remove('free-position');
            container.style.position = '';
            container.style.width = '';
            container.style.height = '';
            container.style.left = '';
            container.style.top = '';
            container.style.zIndex = '';

            placeholder.remove();

            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            const useFreePosition = e.shiftKey && pendingFreePosition;

            if (useFreePosition) {
                // Apply free pixel position with size
                widgetConfig.position.freePosition = pendingFreePosition;
                container.style.position = 'absolute';
                container.style.left = `${pendingFreePosition.left}px`;
                container.style.top = `${pendingFreePosition.top}px`;
                container.style.width = `${containerRect.width}px`;
                container.style.height = `${containerRect.height}px`;
                container.classList.add('free-position');
                this.saveDashboard();
            } else {
                // Clear free position and apply grid snap
                delete widgetConfig.position.freePosition;

                if (pendingCol !== widgetConfig.position.col || pendingRow !== widgetConfig.position.row) {
                    widgetConfig.position.col = pendingCol;
                    widgetConfig.position.row = pendingRow;
                    this.saveDashboard();
                }

                container.style.gridColumn = `${pendingCol + 1} / span ${width}`;
                container.style.gridRow = `${pendingRow + 1} / span ${height}`;
            }
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    toggleEditMode() {
        dashboardState.editMode = !dashboardState.editMode;
        document.dispatchEvent(new CustomEvent('dashboardEditModeChanged', {
            detail: { editMode: dashboardState.editMode }
        }));

        const editBtn = document.getElementById('dashboard-edit-btn');
        editBtn?.classList.toggle('active', dashboardState.editMode);

        this.gridEl?.classList.toggle('edit-mode', dashboardState.editMode);

        dashboardState.widgets.forEach((widget, id) => {
            widget.container.classList.toggle('edit-mode', dashboardState.editMode);
        });

        if (!dashboardState.editMode) {
            // Deselect widget when exiting edit mode
            this.selectWidget(null);
        }
    }

    selectWidget(widgetId) {
        // Deselect previous
        if (dashboardState.selectedWidgetId) {
            const prevWidget = dashboardState.widgets.get(dashboardState.selectedWidgetId);
            prevWidget?.container.classList.remove('selected');
        }

        dashboardState.selectedWidgetId = widgetId;

        // Select new
        if (widgetId) {
            const widget = dashboardState.widgets.get(widgetId);
            widget?.container.classList.add('selected');
        }
    }

    moveWidgetByKey(key, fineMode = false) {
        const widgetId = dashboardState.selectedWidgetId;
        if (!widgetId) return;

        const dashboard = dashboardState.dashboards.get(dashboardState.currentDashboard);
        if (!dashboard) return;

        const widgetConfig = dashboard.widgets.find(w => w.id === widgetId);
        if (!widgetConfig) return;

        const widget = dashboardState.widgets.get(widgetId);
        if (!widget) return;

        const container = widget.container;

        // Calculate grid parameters
        const gridMetrics = this.getGridMetrics();
        if (!gridMetrics) return;
        const { gap, cellWidth, cellHeight } = gridMetrics;

        const width = widgetConfig.position.width || DASHBOARD_DEFAULT_WIDGET_WIDTH;
        const height = widgetConfig.position.height || DASHBOARD_DEFAULT_WIDGET_HEIGHT;

        if (fineMode) {
            // Fine mode (Shift): move by 1px using freePosition
            // freePosition only stores left/top, size comes from width/height (grid cells)
            let freePos = widgetConfig.position.freePosition;
            if (!freePos) {
                // Convert grid position to pixels
                const col = widgetConfig.position.col || 0;
                const row = widgetConfig.position.row || 0;
                freePos = {
                    left: col * (cellWidth + gap),
                    top: row * (cellHeight + gap)
                };
            }

            const step = DASHBOARD_FINE_MOVE_STEP_PX;
            switch (key) {
                case 'ArrowUp':
                    freePos.top = Math.max(0, freePos.top - step);
                    break;
                case 'ArrowDown':
                    freePos.top = freePos.top + step;
                    break;
                case 'ArrowLeft':
                    freePos.left = Math.max(0, freePos.left - step);
                    break;
                case 'ArrowRight':
                    freePos.left = freePos.left + step;
                    break;
            }

            // Apply free position
            widgetConfig.position.freePosition = freePos;
            container.style.position = 'absolute';
            container.style.left = `${freePos.left}px`;
            container.style.top = `${freePos.top}px`;
            container.classList.add('free-position');
            container.style.gridColumn = '';
            container.style.gridRow = '';
        } else {
            // Grid mode (default): move by one grid cell
            let col = widgetConfig.position.col || 0;
            let row = widgetConfig.position.row || 0;

            switch (key) {
                case 'ArrowUp':
                    row = Math.max(0, row - 1);
                    break;
                case 'ArrowDown':
                    row = row + 1;
                    break;
                case 'ArrowLeft':
                    col = Math.max(0, col - 1);
                    break;
                case 'ArrowRight':
                    col = Math.min(DASHBOARD_GRID_COLS - width, col + 1);
                    break;
            }

            // Update grid position
            widgetConfig.position.col = col;
            widgetConfig.position.row = row;

            // Clear free position if was set
            delete widgetConfig.position.freePosition;

            // Apply grid positioning
            container.style.position = '';
            container.style.left = '';
            container.style.top = '';
            container.classList.remove('free-position');
            container.style.gridColumn = `${col + 1} / span ${width}`;
            container.style.gridRow = `${row + 1} / span ${height}`;
        }

        this.saveDashboard();
    }

    updateSensorSubscriptions() {
        dashboardState.sensorSubscriptions.clear();
        dashboardState.setpointSubscriptions.clear();
        dashboardState.chartSubscriptions.clear();

        const addSub = (map, key, id) => {
            if (!map.has(key)) map.set(key, new Set());
            map.get(key).add(id);
        };
        const addBinding = (map, b, id) => {
            const sensorName = b?.sensor || b?.name;
            if (!b?.serverId || !b?.objectName || !sensorName) return;
            addSub(map, makeSensorKey(b.serverId, b.objectName, sensorName), id);
        };

        dashboardState.widgets.forEach((widget, id) => {
            const cfg = widget.config;
            if (!cfg) return;

            // 1. Main sensor
            addBinding(dashboardState.sensorSubscriptions, cfg, id);

            // 2. Setpoint sensor2 (используется в SetpointWidget feedback и Gauge style=dual)
            if (cfg.sensor2) {
                addBinding(dashboardState.setpointSubscriptions, {
                    serverId:   cfg.serverId2   || cfg.serverId,
                    objectName: cfg.objectName2 || cfg.objectName,
                    sensor:     cfg.sensor2,
                }, id);
            }

            // 3. Multi-sensor items (StatusBar, BarGraph)
            if (Array.isArray(cfg.items)) {
                cfg.items.forEach(it => addBinding(dashboardState.sensorSubscriptions, it, id));
            }

            // 4. Chart zones
            if (Array.isArray(cfg.zones)) {
                cfg.zones.forEach(z => (z.sensors || []).forEach(s =>
                    addBinding(dashboardState.chartSubscriptions, s, id)));
            }
        });

        this._subscribeActiveSensorsBackend();
    }

    _subscribeActiveSensorsBackend() {
        // Group key (serverId|objectName) → Set<sensorId>.
        const groups = new Map();

        const addId = (b) => {
            if (!b?.serverId || !b?.objectName) return;
            if (!Number.isFinite(b.sensorId)) return;
            const k = makeGroupKey(b.serverId, b.objectName);
            if (!groups.has(k)) groups.set(k, new Set());
            groups.get(k).add(b.sensorId);
        };

        dashboardState.widgets.forEach(widget => {
            const cfg = widget?.config;
            if (!cfg) return;
            // Main + sensor2 + items + zones
            addId(cfg);
            if (cfg.sensor2) addId({
                serverId:   cfg.serverId2   || cfg.serverId,
                objectName: cfg.objectName2 || cfg.objectName,
                sensorId:   cfg.sensorId2,
            });
            if (Array.isArray(cfg.items)) cfg.items.forEach(addId);
            if (Array.isArray(cfg.zones)) cfg.zones.forEach(z => (z.sensors || []).forEach(addId));
        });

        for (const [grpKey, idSet] of groups) {
            const { serverId, objectName } = parseGroupKey(grpKey);
            const url = `/api/objects/${encodeURIComponent(objectName)}/ionc/subscribe`
                + `?server=${encodeURIComponent(serverId)}`;
            fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sensor_ids: Array.from(idSet) })
            }).catch(err => console.warn('dashboard: subscribe failed', grpKey, err));
        }
    }

    handleSensorUpdate(sensorKey, value, error = null, timestamp = null) {
        // sensorKey = ${serverId}|${objectName}|${sensorName} — canonical identity.
        // ctx передаётся в updateBySensor/updateSensor чтобы multi-sensor widget'ы
        // могли отбраковать совпадающие по имени, но пришедшие с другого (server, object).
        const parsed = (typeof parseSensorKey === 'function') ? parseSensorKey(sensorKey) : null;
        const sensorName = parsed?.sensorName ?? sensorKey;
        const ctx = parsed
            ? { serverId: parsed.serverId, objectName: parsed.objectName, sensorName }
            : null;

        // Main sensor updates
        const widgetIds = dashboardState.sensorSubscriptions.get(sensorKey);
        if (widgetIds) {
            widgetIds.forEach(id => {
                const widget = dashboardState.widgets.get(id);
                if (widget) {
                    // StatusBar widget uses updateBySensor for items
                    if (typeof widget.updateBySensor === 'function') {
                        widget.updateBySensor(sensorName, value, error, ctx);
                    } else {
                        widget.update(value, error);
                    }
                }
            });
        }

        // Setpoint sensor updates
        const setpointWidgetIds = dashboardState.setpointSubscriptions.get(sensorKey);
        if (setpointWidgetIds) {
            setpointWidgetIds.forEach(id => {
                const widget = dashboardState.widgets.get(id);
                if (widget && typeof widget.updateSetpoint === 'function') {
                    widget.updateSetpoint(value, error);
                }
            });
        }

        // Chart widget updates
        const chartWidgetIds = dashboardState.chartSubscriptions.get(sensorKey);
        if (chartWidgetIds) {
            chartWidgetIds.forEach(id => {
                const widget = dashboardState.widgets.get(id);
                if (widget && typeof widget.updateSensor === 'function') {
                    widget.updateSensor(sensorName, value, timestamp, ctx);
                }
            });
        }
    }

    exportDashboard() {
        const name = dashboardState.currentDashboard;
        if (!name) return;

        const config = dashboardState.dashboards.get(name);
        if (!config) return;

        // Create clean export (remove internal flags)
        const exportConfig = JSON.parse(JSON.stringify(config));
        delete exportConfig._server;

        const blob = new Blob([JSON.stringify(exportConfig, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `${name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.json`;
        a.click();

        URL.revokeObjectURL(url);
    }

    setupImportDropzone() {
        const dropzone = document.getElementById('import-dropzone');
        const fileInput = document.getElementById('import-file-input');

        if (!dropzone || !fileInput) return;

        dropzone.addEventListener('click', () => fileInput.click());

        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('drag-over');
        });

        dropzone.addEventListener('dragleave', () => {
            dropzone.classList.remove('drag-over');
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('drag-over');

            const file = e.dataTransfer.files[0];
            if (file) this.handleImportFile(file);
        });

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) this.handleImportFile(file);
        });

        // Import mode toggle
        document.querySelectorAll('[name="import-mode"]').forEach(radio => {
            radio.addEventListener('change', () => {
                const nameField = document.getElementById('import-name-field');
                if (radio.value === 'new') {
                    nameField?.classList.remove('hidden');
                } else {
                    nameField?.classList.add('hidden');
                }
            });
        });
    }

    handleImportFile(file) {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const config = JSON.parse(e.target.result);

                // Validate
                if (!config.widgets || !Array.isArray(config.widgets)) {
                    throw new Error('Invalid dashboard format: missing widgets array');
                }

                // Migrate if needed
                const migrated = migrateDashboard(config);

                dashboardState.pendingImport = migrated;

                // Update UI. Optional chain на classList выше прятал null, но
                // следующая строка всё равно дереференсила — TypeError при
                // отсутствии dropzone'а. Объединяем под одним guard'ом.
                const dropzone = document.getElementById('import-dropzone');
                if (dropzone) {
                    dropzone.classList.add('has-file');
                    const p = dropzone.querySelector('p');
                    if (p) p.textContent = `${file.name} (${config.widgets.length} widgets)`;
                }

                const nameInput = document.getElementById('import-name-input');
                if (nameInput) {
                    nameInput.value = config.meta?.name || file.name.replace('.json', '');
                }

                document.getElementById('import-confirm').disabled = false;
                document.getElementById('import-error')?.classList.add('hidden');

            } catch (err) {
                const errorEl = document.getElementById('import-error');
                if (errorEl) {
                    errorEl.textContent = err.message;
                    errorEl.classList.remove('hidden');
                }
                document.getElementById('import-confirm').disabled = true;
            }
        };

        reader.readAsText(file);
    }

    showImportDialog() {
        const overlay = document.getElementById('dashboard-import-overlay');
        const dropzone = document.getElementById('import-dropzone');

        // Reset state
        dashboardState.pendingImport = null;
        dropzone?.classList.remove('has-file');
        if (dropzone) dropzone.querySelector('p').textContent = 'Drop JSON file here or click to browse';
        document.getElementById('import-confirm').disabled = true;
        document.getElementById('import-error')?.classList.add('hidden');
        document.getElementById('import-file-input').value = '';

        overlay?.classList.remove('hidden');
    }

    confirmImport() {
        if (!dashboardState.pendingImport) return;

        const mode = document.querySelector('[name="import-mode"]:checked')?.value;
        let name;

        if (mode === 'replace' && dashboardState.currentDashboard) {
            name = dashboardState.currentDashboard;
        } else {
            name = document.getElementById('import-name-input')?.value?.trim();
            if (!name) {
                alert('Please enter a dashboard name');
                return;
            }
        }

        const config = dashboardState.pendingImport;
        config.meta = config.meta || {};
        config.meta.name = name;
        config.meta.modified = new Date().toISOString();

        dashboardState.dashboards.set(name, config);
        this.saveDashboard(name);
        this.updateDashboardSelector();

        closeDashboardImport();

        // Load imported dashboard
        if (this.selectEl) {
            this.selectEl.value = name;
        }
        this.loadDashboard(name);
    }

    async deleteDashboard() {
        const name = dashboardState.currentDashboard;
        if (!name) return;

        const config = dashboardState.dashboards.get(name);
        if (config?._server) {
            // TODO: server dashboards — Delete-кнопку лучше дисейблить заранее в UI;
            // пока fallback на alert, чтобы кейс не пропадал тихо.
            alert('Cannot delete server dashboards');
            return;
        }

        // showConfirmDialog (Promise<bool>) вместо нативного confirm — единый
        // стиль модалок проекта, не блокирует event loop.
        const confirmed = await showConfirmDialog(
            'Delete Dashboard',
            `Delete dashboard "${name}"?`,
            'Delete'
        );
        if (!confirmed) return;

        dashboardState.dashboards.delete(name);
        localStorage.removeItem(`dashboard:${name}`);

        // Update user dashboards list
        const userDashboards = Array.from(dashboardState.dashboards.entries())
            .filter(([_, c]) => !c._server)
            .map(([n]) => n);
        localStorage.setItem('user-dashboards', JSON.stringify(userDashboards));

        this.updateDashboardSelector();
        this.clearDashboard();
    }
}
