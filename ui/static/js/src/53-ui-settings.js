    const saved = loadStorageMap('uniset-panel-ionc-height');
    const height = saved[tabKey] ?? saved[objectName];
    if (height) {
        const sensorsContainer = getElementInTab(tabKey, `ionc-sensors-container-${objectName}`);
        if (sensorsContainer) {
            sensorsContainer.style.height = `${height}px`;
            sensorsContainer.style.maxHeight = `${height}px`;
        }
    }
}

// Переключение режима отображения IO (горизонтально/вертикально)
function toggleIOLayout(tabKey, objectName) {
    const checkbox = getElementInTab(tabKey, `io-sequential-${objectName}`);
    const ioGrid = getElementInTab(tabKey, `io-grid-${objectName}`);

    if (!checkbox || !ioGrid) return;

    if (checkbox.checked) {
        ioGrid.classList.add('io-sequential');
    } else {
        ioGrid.classList.remove('io-sequential');
    }

    // Сохраняем состояние
    saveIOLayoutState(tabKey, checkbox.checked);
}

function saveIOLayoutState(tabKey, isSequential) {
    updateStorageMap('uniset-panel-io-layout', (saved) => { saved[tabKey] = isSequential; });
}

function loadIOLayoutState(tabKey, objectName) {
    const saved = loadStorageMap('uniset-panel-io-layout');
    if (saved[tabKey] ?? saved[objectName]) {
        const checkbox = getElementInTab(tabKey, `io-sequential-${objectName}`);
        const ioGrid = getElementInTab(tabKey, `io-grid-${objectName}`);
        if (checkbox && ioGrid) {
            checkbox.checked = true;
            ioGrid.classList.add('io-sequential');
        }
    }
}

// === Section Reordering ===

// tabKey - ключ вкладки (serverId:objectName)
function moveSectionUp(tabKey, sectionId) {
    const section = getSectionElement(tabKey, sectionId);
    if (!section) return;

    const prev = getPreviousReorderableSection(section);
    if (prev) {
        section.parentNode.insertBefore(section, prev);
        saveSectionOrder(tabKey);
        updateReorderButtons(tabKey);
    }
}

// tabKey - ключ вкладки (serverId:objectName)
function moveSectionDown(tabKey, sectionId) {
    const section = getSectionElement(tabKey, sectionId);
    if (!section) return;

    const next = getNextReorderableSection(section);
    if (next) {
        section.parentNode.insertBefore(next, section);
        saveSectionOrder(tabKey);
        updateReorderButtons(tabKey);
    }
}

function getSectionElement(tabKey, sectionId) {
    // Ищем секцию по data-section-id внутри панели вкладки
    const panel = getTabPanel(tabKey);
    if (!panel) return null;
    return panel.querySelector(`.reorderable-section[data-section-id="${sectionId}"]`);
}

function getPreviousReorderableSection(element) {
    let prev = element.previousElementSibling;
    while (prev) {
        if (prev.classList.contains('reorderable-section') && prev.style.display !== 'none') {
            return prev;
        }
        prev = prev.previousElementSibling;
    }
    return null;
}

function getNextReorderableSection(element) {
    let next = element.nextElementSibling;
    while (next) {
        if (next.classList.contains('reorderable-section') && next.style.display !== 'none') {
            return next;
        }
        next = next.nextElementSibling;
    }
    return null;
}

// tabKey - ключ вкладки (serverId:objectName)
function saveSectionOrder(tabKey) {
    const panel = getTabPanel(tabKey);
    if (!panel) return;

    const sections = panel.querySelectorAll('.reorderable-section[data-section-id]');
    const order = Array.from(sections).map(s => s.dataset.sectionId);

    updateStorageMap('uniset-panel-section-order', (saved) => { saved[tabKey] = order; });
}

// tabKey - ключ вкладки (serverId:objectName)
function loadSectionOrder(tabKey) {
    const saved = loadStorageMap('uniset-panel-section-order');
    const order = saved[tabKey];
    if (!order || !Array.isArray(order)) return;

    const panel = getTabPanel(tabKey);
    if (!panel) return;

        // Собираем все reorderable секции в Map
        const sections = new Map();
        panel.querySelectorAll('.reorderable-section[data-section-id]').forEach(s => {
            sections.set(s.dataset.sectionId, s);
        });

        if (sections.size === 0) return;

        // Собираем секции в нужном порядке
        const orderedSections = order
            .map(id => sections.get(id))
            .filter(s => s != null);

        if (orderedSections.length < 2) return;

        // Находим первую секцию в DOM (точка привязки)
        const allSections = [...sections.values()];
        allSections.sort((a, b) =>
            a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
        );
        let anchor = allSections[0];

        // Вставляем в обратном порядке перед anchor
        // После каждой вставки новый элемент становится anchor
        for (let i = orderedSections.length - 1; i >= 0; i--) {
            panel.insertBefore(orderedSections[i], anchor);
            anchor = orderedSections[i];
        }

    updateReorderButtons(tabKey);
}

// tabKey - ключ вкладки (serverId:objectName)
function updateReorderButtons(tabKey) {
    const panel = getTabPanel(tabKey);
    if (!panel) return;

    const sections = Array.from(panel.querySelectorAll('.reorderable-section[data-section-id]'))
        .filter(s => s.style.display !== 'none');

    sections.forEach((section, index) => {
        const upBtn = section.querySelector('.section-move-up');
        const downBtn = section.querySelector('.section-move-down');

        if (upBtn) {
            upBtn.disabled = index === 0;
        }
        if (downBtn) {
            downBtn.disabled = index === sections.length - 1;
        }
    });
}

// IO Section resize, filter, and pin functionality
// tabKey - ключ вкладки (serverId:objectName)
function setupIOSections(tabKey) {
    const tabState = state.tabs.get(tabKey);
    if (!tabState) return;
    const objectName = tabState.displayName || tabKey;

    // Setup global filter for all IO sections
    setupIOGlobalFilter(tabKey, objectName);

    ['inputs', 'outputs', 'timers'].forEach(type => {
        setupIOResize(tabKey, objectName, type);
        setupIOUnpinAll(tabKey, objectName, type);
        setupIOCollapse(tabKey, objectName, type);
    });
}

function setupIOCollapse(tabKey, objectName, type) {
    const panel = getTabPanel(tabKey);
    if (!panel) return;

    const toggleEl = panel.querySelector(`.io-section-toggle[data-section="${type}-${objectName}"]`);
    const section = getElementInTab(tabKey, `${type}-section-${objectName}`);

    if (!toggleEl || !section) return;

    // Load saved state
    const savedState = loadIOCollapseState(tabKey, type);
    if (savedState === 'collapsed') {
        section.classList.add('collapsed');
    }

    toggleEl.addEventListener('click', (e) => {
        e.stopPropagation();
        section.classList.toggle('collapsed');
        saveIOCollapseState(tabKey, type, section.classList.contains('collapsed'));
    });
}

function saveIOCollapseState(tabKey, type, collapsed) {
    updateStorageMap('uniset-panel-io-collapse', (saved) => {
        saved[`${tabKey}-${type}`] = collapsed ? 'collapsed' : 'expanded';
    });
}

function loadIOCollapseState(tabKey, type) {
    const saved = loadStorageMap('uniset-panel-io-collapse');
    return saved[`${tabKey}-${type}`] || 'expanded';
}

function setupIOResize(tabKey, objectName, type) {
    setupResizeHandle(
        getElementInTab(tabKey, `io-resize-${type}-${objectName}`),
        getElementInTab(tabKey, `io-container-${type}-${objectName}`),
        MIN_SECTION_HEIGHT,
        (height) => saveIOHeight(tabKey, type, height)
    );

    loadIOHeight(tabKey, objectName, type);
}

function saveIOHeight(tabKey, type, height) {
    updateStorageMap('uniset-panel-io-heights', (saved) => {
        saved[`${tabKey}-${type}`] = height;
    });
}

function loadIOHeight(tabKey, objectName, type) {
    const saved = loadStorageMap('uniset-panel-io-heights');
    const height = saved[`${tabKey}-${type}`];
    if (height) {
        const container = getElementInTab(tabKey, `io-container-${type}-${objectName}`);
        if (container) {
            container.style.height = `${height}px`;
            container.style.maxHeight = `${height}px`;
        }
    }
}

// tabKey - ключ вкладки, objectName - displayName для DOM селекторов
function setupIOGlobalFilter(tabKey, objectName) {
    const filterInput = getElementInTab(tabKey, `io-filter-global-${objectName}`);
    if (!filterInput) return;

    let filterTimeout = null;

    const refilterAll = () => {
        const tabState = state.tabs.get(tabKey);
        if (tabState) {
            if (tabState.ioData?.in) {
                renderIO(tabKey, 'inputs', tabState.ioData.in);
            }
            if (tabState.ioData?.out) {
                renderIO(tabKey, 'outputs', tabState.ioData.out);
            }
            if (tabState.timersData) {
                renderTimers(tabKey, tabState.timersData);
            }
        }
    };

    filterInput.addEventListener('input', (e) => {
        clearTimeout(filterTimeout);
        filterTimeout = setTimeout(refilterAll, SETTINGS_FILTER_DEBOUNCE_DELAY);
    });

    // ESC to clear and blur
    filterInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            filterInput.value = '';
            filterInput.blur();
            refilterAll();
        }
    });
}

// Перерисовка IO секции по типу (inputs/outputs/timers)
function reRenderIOType(tabKey, type) {
    const tabState = state.tabs.get(tabKey);
    if (!tabState) return;
    if (type === 'inputs' && tabState.ioData?.in) renderIO(tabKey, 'inputs', tabState.ioData.in);
    else if (type === 'outputs' && tabState.ioData?.out) renderIO(tabKey, 'outputs', tabState.ioData.out);
    else if (type === 'timers' && tabState.timersData) renderTimers(tabKey, tabState.timersData);
}

// tabKey - ключ вкладки, objectName - displayName для DOM селекторов
function setupIOUnpinAll(tabKey, objectName, type) {
    const unpinBtn = getElementInTab(tabKey, `io-unpin-${type}-${objectName}`);
    if (!unpinBtn) return;

    unpinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        clearIOPinnedRows(tabKey, type);
        reRenderIOType(tabKey, type);
    });
}

// Pinned rows management
function getIOPinnedRows(tabKey, type) {
    const saved = loadStorageMap('uniset-panel-io-pinned');
    return new Set(saved[`${tabKey}-${type}`] || []);
}

function saveIOPinnedRows(tabKey, type, pinnedSet) {
    updateStorageMap('uniset-panel-io-pinned', (saved) => {
        saved[`${tabKey}-${type}`] = Array.from(pinnedSet);
    });
}

function toggleIOPin(tabKey, type, rowKey) {
    const pinned = getIOPinnedRows(tabKey, type);
    const keyStr = String(rowKey);

    if (pinned.has(keyStr)) {
        pinned.delete(keyStr);
    } else {
        pinned.add(keyStr);
    }

    saveIOPinnedRows(tabKey, type, pinned);
    reRenderIOType(tabKey, type);
}

function clearIOPinnedRows(tabKey, type) {
    saveIOPinnedRows(tabKey, type, new Set());
}

// Установка временного диапазона
function setTimeRange(range) {
    // Обновляем active класс на всех кнопках
    document.querySelectorAll('.time-range-btn').forEach(btn => {
        const btnRange = parseInt(btn.dataset.range, 10);
        btn.classList.toggle('active', btnRange === range);
    });

    state.timeRange = range;
    saveSettings();

    // Сбросить начальное время для всех вкладок при изменении интервала
    state.tabs.forEach((tabState, objectName) => {
        if (tabState.charts.size > 0) {
            tabState.chartStartTime = Date.now();
        }
        tabState.charts.forEach((chartData, varName) => {
            updateChart(objectName, varName, chartData.chart);
        });
    });
}


// Сохранение настроек в localStorage
function saveSettings() {
    saveJSON('uniset-panel-settings', {
        timeRange: state.timeRange,
        sidebarCollapsed: state.sidebarCollapsed,
        collapsedServerGroups: Array.from(state.collapsedServerGroups),
        serversSectionCollapsed: state.serversSectionCollapsed,
        launchersSectionCollapsed: state.launchersSectionCollapsed
    });
}

// Loading настроек из localStorage
function loadSettings() {
    const settings = loadJSON('uniset-panel-settings', null);
    if (!settings || typeof settings !== 'object') return;

    try {
        // Восстановить timeRange
        if (settings.timeRange) {
            state.timeRange = settings.timeRange;
            document.querySelectorAll('.time-range-btn').forEach(btn => {
                btn.classList.toggle('active', parseInt(btn.dataset.range, 10) === state.timeRange);
            });
        }

        // Восстановить состояние sidebar
        if (settings.sidebarCollapsed) {
            state.sidebarCollapsed = settings.sidebarCollapsed;
            document.getElementById('sidebar').classList.add('collapsed');
        }

        // Восстановить свёрнутые группы серверов
        if (settings.collapsedServerGroups && Array.isArray(settings.collapsedServerGroups)) {
            state.collapsedServerGroups = new Set(settings.collapsedServerGroups);
        }

        // Восстановить состояние секции "Servers"
        if (settings.serversSectionCollapsed !== undefined) {
            state.serversSectionCollapsed = settings.serversSectionCollapsed;
        }

        // Восстановить состояние секции "Launchers"
        if (settings.launchersSectionCollapsed !== undefined) {
            state.launchersSectionCollapsed = settings.launchersSectionCollapsed;
        }
    } catch (err) {
        console.warn('Failed to apply settings:', err);
    }
}

// Loading конфигурации приложения
async function loadAppConfig() {
    try {
        const response = await fetch('/api/config');
        if (response.ok) {
            const config = await response.json();
            state.config = { ...state.config, ...config };
            debugLog('App config loaded:', state.config);
        }
    } catch (err) {
        console.warn('Failed to load app config:', err);
    }
}
