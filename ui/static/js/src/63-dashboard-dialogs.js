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
        const step = parseFloat(input.step) || 1;
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
    const min = parseFloat(minInput?.value) || 0;
    const max = parseFloat(maxInput?.value) || 100;

    const index = zonesList.children.length;
    const zoneHtml = `
        <div class="zone-item">
            <input type="color" class="zone-color" name="zone-color-${index}" value="#ef4444">
            <div class="zone-inputs">
                <input type="number" class="zone-input" name="zone-from-${index}" value="${min}" placeholder="From">
                <span class="zone-separator">→</span>
                <input type="number" class="zone-input" name="zone-to-${index}" value="${max}" placeholder="To">
            </div>
            <button type="button" class="zone-remove-btn" onclick="removeZoneField(this)">×</button>
        </div>
    `;
    zonesList.insertAdjacentHTML('beforeend', zoneHtml);
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
    selectedType: 'gauge'
};

function closeAddToDashboard() {
    document.getElementById('add-to-dashboard-overlay')?.classList.add('hidden');
    addToDashboardState.sensorName = null;
    addToDashboardState.sensorLabel = null;
}

function showAddToDashboardDialog(sensorName, sensorLabel = null) {
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
    addToDashboardState.selectedType = 'gauge';

    // Show sensor name
    sensorNameEl.textContent = sensorLabel || sensorName;

    // Populate dashboard select
    selectEl.innerHTML = '<option value="__new__">+ Create New Dashboard</option>';

    // Add user dashboards (editable)
    for (const [name, dashboard] of dashboardState.dashboards) {
        // Skip server dashboards (they're read-only)
        if (!dashboardState.serverDashboards.some(sd => sd.meta?.name === name)) {
            selectEl.innerHTML += `<option value="${escapeAttr(name)}">${escapeHtml(name)}</option>`;
        }
    }

    // Handle select change
    selectEl.onchange = () => {
        if (selectEl.value === '__new__') {
            newNameField.style.display = 'block';
            newNameInput.focus();
        } else {
            newNameField.style.display = 'none';
        }
    };

    // Populate widget types
    const widgetTypes = [
        { type: 'gauge', name: 'Gauge', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>' },
        { type: 'level', name: 'Level', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="2" width="12" height="20" rx="2"/><rect x="8" y="10" width="8" height="10" fill="currentColor" opacity="0.3"/></svg>' },
        { type: 'led', name: 'LED', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>' },
        { type: 'label', name: 'Label', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><text x="12" y="16" text-anchor="middle" font-size="12" fill="currentColor">Aa</text></svg>' },
        { type: 'divider', name: 'Divider', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="12" x2="20" y2="12"/></svg>' },
        { type: 'statusbar', name: 'Status Bar', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="5" cy="12" r="3" fill="#22c55e"/><circle cx="12" cy="12" r="3" fill="#ef4444"/><circle cx="19" cy="12" r="3" fill="#6b7280"/></svg>' },
        { type: 'bargraph', name: 'Bar Graph', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="14" width="4" height="6" fill="currentColor" opacity="0.7"/><rect x="10" y="8" width="4" height="12" fill="currentColor" opacity="0.5"/><rect x="16" y="4" width="4" height="16" fill="currentColor" opacity="0.3"/></svg>' },
        { type: 'digital', name: 'Digital', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><text x="12" y="15" text-anchor="middle" font-size="8" fill="currentColor">123</text></svg>' }
    ];

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
    okBtn.onclick = () => {
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
            selectEl.value === '__new__'
        );

        closeAddToDashboard();
    };

    // Reset and show
    newNameField.style.display = 'none';
    newNameInput.value = '';
    overlay.classList.remove('hidden');
}

function addSensorToDashboard(sensorName, sensorLabel, dashboardName, widgetType, createNew) {
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
        dashboardManager.updateDashboardList();
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
            min: 0,
            max: 100,
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

    console.log(`Added ${sensorName} as ${widgetType} to dashboard "${dashboardName}"`);
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
