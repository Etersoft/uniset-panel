function migrateDashboard(dashboard) {
    let version = dashboard.version || 0;

    // Future migrations will be added here
    // if (version < 2) { ... }

    dashboard.version = DASHBOARD_VERSION;
    return dashboard;
}

// Dialog close functions
function closeWidgetPicker() {
    document.getElementById('widget-picker-overlay')?.classList.add('hidden');
}

function closeWidgetConfig() {
    document.getElementById('widget-config-overlay')?.classList.add('hidden');
}

function closeDashboardNameDialog() {
    document.getElementById('dashboard-name-overlay')?.classList.add('hidden');
}

function closeDashboardImport() {
    document.getElementById('dashboard-import-overlay')?.classList.add('hidden');
    dashboardState.pendingImport = null;
}

// Confirm Dialog
function showConfirmDialog(title, message, okText = 'OK') {
    return new Promise((resolve) => {
        const overlay = document.getElementById('confirm-dialog-overlay');
        const titleEl = document.getElementById('confirm-dialog-title');
        const messageEl = document.getElementById('confirm-dialog-message');
        const okBtn = document.getElementById('confirm-dialog-ok');
        const cancelBtn = document.getElementById('confirm-dialog-cancel');

        if (!overlay) {
            resolve(false);
            return;
        }

        titleEl.textContent = title;
        messageEl.textContent = message;
        okBtn.textContent = okText;

        const cleanup = () => {
            overlay.classList.add('hidden');
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            overlay.removeEventListener('click', onOverlayClick);
        };

        const onOk = () => {
            cleanup();
            resolve(true);
        };

        const onCancel = () => {
            cleanup();
            resolve(false);
        };

        const onOverlayClick = (e) => {
            if (e.target === overlay) {
                cleanup();
                resolve(false);
            }
        };

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        overlay.addEventListener('click', onOverlayClick);

        overlay.classList.remove('hidden');
    });
}

// Setup custom number inputs with arrow buttons
function setupNumberInputs(container) {
    const numberInputs = container.querySelectorAll('input[type="number"]');
    numberInputs.forEach(input => {
        // Skip if already wrapped
        if (input.parentElement.classList.contains('widget-number-wrapper')) return;

        // Create wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'widget-number-wrapper';
        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(input);

        // Create arrow buttons
        const arrows = document.createElement('div');
        arrows.className = 'widget-number-arrows';
        arrows.innerHTML = `
            <button type="button" class="widget-number-arrow up">
                <svg viewBox="0 0 10 10"><path d="M2 7 L5 3 L8 7" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
            </button>
            <button type="button" class="widget-number-arrow down">
                <svg viewBox="0 0 10 10"><path d="M2 3 L5 7 L8 3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
            </button>
        `;
        wrapper.appendChild(arrows);

        // Arrow button handlers
        arrows.querySelector('.up').addEventListener('click', (e) => {
            e.preventDefault();
            input.stepUp();
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        arrows.querySelector('.down').addEventListener('click', (e) => {
            e.preventDefault();
            input.stepDown();
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
    });
}

// Toggle dual scale fields visibility based on style selection
function toggleDualScaleFields(select) {
    const dualFields = select.closest('.widget-config-form, #widget-config-content')?.querySelector('.dual-scale-fields');
    if (dualFields) {
        dualFields.style.display = select.value === 'dual' ? 'block' : 'none';
    }
}

// Zone field helpers
function addZoneField(btn) {
    const zonesList = btn.closest('.zones-editor').querySelector('.zones-list');
    if (!zonesList) return;

    // Get min/max from the config form
    const form = btn.closest('.widget-config-form') || btn.closest('#widget-config-content');
    const minInput = form?.querySelector('[name="min"]');
    const maxInput = form?.querySelector('[name="max"]');
    const min = parseNumberOrDefault(minInput?.value, 0);
    const max = parseNumberOrDefault(maxInput?.value, 100);

    const index = zonesList.children.length;
    zonesList.insertAdjacentHTML('beforeend',
        renderColorZoneItem({ from: min, to: max, color: '#ef4444' }, index, '#ef4444'));
}

function removeZoneField(btn) {
    btn.closest('.zone-item')?.remove();
}

// ============================================================================
// Add to Dashboard Dialog
// ============================================================================

// State for add-to-dashboard dialog
let addToDashboardState = {
    sensorName: null,
    sensorLabel: null,
    binding: null,
    selectedType: 'gauge',
    cleanupListeners: null,  // вызывается в closeAddToDashboard, отвязывает onChange/onOk
};

const ADD_TO_DASHBOARD_WIDGET_TYPES = ['gauge', 'level', 'led', 'label', 'divider', 'statusbar', 'bargraph', 'digital'];

function getDashboardBindingFromButton(btn) {
    const rawSensorId = btn?.dataset?.sensorId;
    const sensorId = rawSensorId !== undefined && rawSensorId !== ''
        ? parseIntegerOrDefault(rawSensorId, null)
        : null;
    return {
        serverId: btn?.dataset?.serverId || null,
        objectName: btn?.dataset?.objectName || null,
        sensorId,
    };
}

function closeAddToDashboard() {
    document.getElementById('add-to-dashboard-overlay')?.classList.add('hidden');
    if (typeof addToDashboardState.cleanupListeners === 'function') {
        addToDashboardState.cleanupListeners();
        addToDashboardState.cleanupListeners = null;
    }
    addToDashboardState.sensorName = null;
    addToDashboardState.sensorLabel = null;
    addToDashboardState.binding = null;
}

function showAddToDashboardDialog(sensorName, sensorLabel = null, binding = null) {
    const overlay = document.getElementById('add-to-dashboard-overlay');
    const sensorNameEl = document.getElementById('add-to-dashboard-sensor-name');
    const selectEl = document.getElementById('add-to-dashboard-select');
    const typesEl = document.getElementById('add-to-dashboard-types');
    const newNameField = document.getElementById('new-dashboard-name-field');
    const newNameInput = document.getElementById('add-to-dashboard-new-name');
    const okBtn = document.getElementById('add-to-dashboard-ok');

    if (!overlay || !selectEl || !typesEl) return;

    // Store sensor info
    addToDashboardState.sensorName = sensorName;
    addToDashboardState.sensorLabel = sensorLabel || sensorName;
    addToDashboardState.binding = binding;
    addToDashboardState.selectedType = 'gauge';

    // Show sensor name
    sensorNameEl.textContent = sensorLabel || sensorName;

    // Populate dashboard select
    selectEl.innerHTML = '<option value="__new__">+ Create New Dashboard</option>';

    // Add user dashboards (editable). Серверные дашборды (config._server) — read-only,
    // в "Add to Dashboard" не предлагаем.
    for (const [name, dashboard] of dashboardState.dashboards) {
        if (dashboard._server) continue;
        selectEl.innerHTML += `<option value="${escapeAttr(name)}">${escapeHtml(name)}</option>`;
    }

    // Handle select change. addEventListener (не onchange) + cleanup в close —
    // иначе при повторных открытиях диалога старые handlers оставались бы на
    // overlay-элементах, который не пересоздаётся.
    const onSelectChange = () => {
        if (selectEl.value === '__new__') {
            newNameField.style.display = 'block';
            newNameInput.focus();
        } else {
            newNameField.style.display = 'none';
        }
    };
    selectEl.addEventListener('change', onSelectChange);

    const widgetTypes = ADD_TO_DASHBOARD_WIDGET_TYPES
        .map(type => WIDGET_TYPES[type])
        .filter(Boolean)
        .map(WidgetClass => ({
            type: WidgetClass.type,
            name: WidgetClass.displayName,
            icon: WidgetClass.icon,
        }));

    typesEl.innerHTML = widgetTypes.map(w => `
        <div class="add-to-dashboard-type ${w.type === addToDashboardState.selectedType ? 'selected' : ''}"
             data-type="${w.type}">
            <span class="widget-type-icon">${w.icon}</span>
            <span class="widget-type-name">${w.name}</span>
        </div>
    `).join('');

    // Handle type selection
    typesEl.querySelectorAll('.add-to-dashboard-type').forEach(el => {
        el.addEventListener('click', () => {
            typesEl.querySelectorAll('.add-to-dashboard-type').forEach(e => e.classList.remove('selected'));
            el.classList.add('selected');
            addToDashboardState.selectedType = el.dataset.type;
        });
    });

    // Handle OK button
    const onOkClick = () => {
        const dashboardName = selectEl.value === '__new__'
            ? newNameInput.value.trim()
            : selectEl.value;

        if (!dashboardName) {
            newNameInput.focus();
            return;
        }

        addSensorToDashboard(
            addToDashboardState.sensorName,
            addToDashboardState.sensorLabel,
            dashboardName,
            addToDashboardState.selectedType,
            selectEl.value === '__new__',
            addToDashboardState.binding
        );

        closeAddToDashboard();
    };
    okBtn.addEventListener('click', onOkClick);

    addToDashboardState.cleanupListeners = () => {
        selectEl.removeEventListener('change', onSelectChange);
        okBtn.removeEventListener('click', onOkClick);
    };

    // Reset and show
    newNameField.style.display = 'none';
    newNameInput.value = '';
    overlay.classList.remove('hidden');
}

function addSensorToDashboard(sensorName, sensorLabel, dashboardName, widgetType, createNew, binding = null) {
    if (!dashboardManager) {
        console.warn('Dashboard manager not initialized');
        return;
    }

    // Create new dashboard if needed
    if (createNew) {
        const newDashboard = {
            version: DASHBOARD_VERSION,
            meta: { name: dashboardName, description: '' },
            grid: { cols: DASHBOARD_GRID_COLS, rowHeight: DASHBOARD_GRID_ROW_HEIGHT, gap: DASHBOARD_GRID_GAP },
            widgets: []
        };
        dashboardState.dashboards.set(dashboardName, newDashboard);
        dashboardManager.updateDashboardSelector();
    }

    // Get or set current dashboard
    const prevDashboard = dashboardState.currentDashboard;
    dashboardState.currentDashboard = dashboardName;

    // Get widget default config based on type
    const WidgetClass = WIDGET_TYPES[widgetType];
    const defaultSize = WidgetClass?.defaultSize || { width: 2, height: 1 };

    // Find empty position
    const position = dashboardManager.findEmptyPosition(defaultSize.width, defaultSize.height);

    // Create widget config
    const widgetConfig = {
        id: `widget-${Date.now()}`,
        type: widgetType,
        position: { ...position, width: defaultSize.width, height: defaultSize.height },
        config: {
            sensor: sensorName,
            label: sensorLabel,
            ...(binding?.serverId ? { serverId: binding.serverId } : {}),
            ...(binding?.objectName ? { objectName: binding.objectName } : {}),
            ...(Number.isFinite(binding?.sensorId) ? { sensorId: binding.sensorId } : {}),
            min: WIDGET_DEFAULT_MIN,
            max: WIDGET_DEFAULT_MAX,
            unit: '',
            decimals: 1
        }
    };

    // Add to dashboard
    const dashboard = dashboardState.dashboards.get(dashboardName);
    if (dashboard) {
        dashboard.widgets = dashboard.widgets || [];
        dashboard.widgets.push(widgetConfig);

        // Save dashboard
        dashboardManager.saveDashboard();

        // If we're viewing this dashboard, create the widget
        if (dashboardState.currentView === 'dashboard' && dashboardState.currentDashboard === dashboardName) {
            dashboardManager.createWidget(widgetConfig);
            dashboardManager.updateSensorSubscriptions();
        }
    }

    // Restore previous dashboard if different
    if (prevDashboard && prevDashboard !== dashboardName) {
        dashboardState.currentDashboard = prevDashboard;
    }

    debugLog(`Added ${sensorName} as ${widgetType} to dashboard "${dashboardName}"`);
}

// Global dashboard manager instance (exposed on window for tests)
let dashboardManager = window.dashboardManager = null;

// Helper to update dashboard widgets from SSE events.
// ctx: { serverId, objectName, timestamp } — нужен для построения sensorKey
// (canonical identity sensors во frontend — см. CLAUDE.md "Sensor identity").
function updateDashboardWidgets(sensors, ctx) {
    if (!dashboardManager || !sensors) return;
    if (!ctx || !ctx.serverId || !ctx.objectName) {
        console.warn('updateDashboardWidgets: ctx без serverId/objectName, skip');
        return;
    }

    // Cold-start migration retry: если SSE прилетел ДО первого _migrateLegacyBinding
    // (state.sensorsByKey ещё не прогрет), это была no-op миграция. Сейчас sensors[]
    // приходит с полными triplet'ами — пробуем снова.
    dashboardManager.tryResolvePendingMigration?.();

    for (const sensor of sensors) {
        const name = sensor.name;
        const value = sensor.value;
        const error = sensor.error || null;

        if (name !== undefined && value !== undefined) {
            const key = makeSensorKey(ctx.serverId, ctx.objectName, name);
            dashboardManager.handleSensorUpdate(key, value, error, ctx.timestamp || null);
        }
    }
}
