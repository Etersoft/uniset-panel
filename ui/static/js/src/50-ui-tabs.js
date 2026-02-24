function renderObjectsList(data) {
    const list = document.getElementById('objects-list');
    list.innerHTML = '';

    // Проверяем есть ли хоть что-то для отображения (данные или кеш)
    let hasAnyObjects = false;
    if (data && data.objects) {
        for (const serverData of data.objects) {
            const existingServer = state.servers.get(serverData.serverId);
            const apiObjects = serverData.objects || [];
            const cachedObjects = existingServer?.cachedObjects || [];
            if (apiObjects.length > 0 || cachedObjects.length > 0) {
                hasAnyObjects = true;
                break;
            }
        }
    }

    if (!hasAnyObjects) {
        list.innerHTML = '<li class="loading">No objects found</li>';
        renderServersSection();
        return;
    }

    // data.objects - массив { serverId, serverName, objects: [...] }
    data.objects.forEach(serverData => {
        const serverId = serverData.serverId;
        const serverName = serverData.serverName || serverId;
        const serverConnected = serverData.connected !== false;
        const apiObjects = serverData.objects || [];

        // Получаем существующий сервер из state
        const existingServer = state.servers.get(serverId);

        // Определяем какие объекты отображать
        let objectsToRender;
        if (serverConnected && apiObjects.length > 0) {
            // Сервер подключен и есть объекты - обновляем кеш и используем их
            objectsToRender = apiObjects;
            if (existingServer) {
                existingServer.cachedObjects = [...apiObjects];
            }
        } else if (!serverConnected && existingServer?.cachedObjects?.length > 0) {
            // Сервер отключен - используем кешированные объекты
            objectsToRender = existingServer.cachedObjects;
        } else {
            // Нет ни данных, ни кеша - пропускаем
            objectsToRender = apiObjects;
        }

        const objectCount = objectsToRender.length;

        // Обновляем информацию о сервере в state
        if (existingServer) {
            existingServer.objectCount = objectCount;
        }

        if (objectCount === 0) return;

        // Создаём группу для сервера
        const group = document.createElement('div');
        group.className = 'server-group';
        group.dataset.serverId = serverId;
        if (state.collapsedServerGroups.has(serverId)) {
            group.classList.add('collapsed');
        }

        // Заголовок группы
        const header = document.createElement('div');
        header.className = 'server-group-header';
        header.innerHTML = `
            <svg class="collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 9l6 6 6-6"/>
            </svg>
            <span class="server-status-dot${serverConnected ? '' : ' disconnected'}"></span>
            <span class="server-name">${escapeHtml(serverName)}</span>
            <span class="server-objects-count">${objectCount}</span>
        `;
        header.addEventListener('click', () => toggleServerGroup(serverId));
        group.appendChild(header);

        // Список объектов группы
        const objectsList = document.createElement('ul');
        objectsList.className = 'server-group-objects';

        objectsToRender.forEach(name => {
            const li = document.createElement('li');
            li.dataset.name = name;
            li.dataset.serverId = serverId;
            li.dataset.serverName = serverName;

            // Если сервер отключен - добавляем класс disconnected к объектам
            if (!serverConnected) {
                li.classList.add('disconnected');
            }

            const nameSpan = document.createElement('span');
            nameSpan.className = 'object-name';
            nameSpan.textContent = name;

            li.appendChild(nameSpan);
            li.addEventListener('click', () => openObjectTab(name, serverId, serverName));
            objectsList.appendChild(li);
        });

        group.appendChild(objectsList);
        list.appendChild(group);
    });

    // Рендерим секцию серверов, обновляем objects section
    renderServersSection();
    updateObjectsSectionHeader();
}

// Обновить заголовок секции Objects
function updateObjectsSectionHeader() {
    const section = document.getElementById('objects-section');
    const header = document.getElementById('objects-section-header');
    const countEl = document.getElementById('objects-count');

    if (!section || !header) return;

    // Подсчитываем общее количество объектов
    let totalObjects = 0;
    state.servers.forEach(server => {
        totalObjects += server.objectCount || 0;
    });

    // Обновляем счётчик
    if (countEl) {
        countEl.textContent = totalObjects;
    }

    // Применяем сохранённое состояние свёрнутости
    if (state.objectsSectionCollapsed) {
        section.classList.add('collapsed');
    } else {
        section.classList.remove('collapsed');
    }

    // Обработчик клика на заголовок секции
    if (!header.dataset.listenerAdded) {
        header.addEventListener('click', toggleObjectsSection);
        header.dataset.listenerAdded = 'true';
    }
}

// Переключить свёрнутость секции "Objects"
function toggleObjectsSection() {
    const section = document.getElementById('objects-section');
    if (!section) return;

    state.objectsSectionCollapsed = !state.objectsSectionCollapsed;
    section.classList.toggle('collapsed', state.objectsSectionCollapsed);
    saveSettings();
}

// Переключить свёрнутость группы сервера в списке объектов
function toggleServerGroup(serverId) {
    const group = document.querySelector(`.server-group[data-server-id="${serverId}"]`);
    if (!group) return;

    if (state.collapsedServerGroups.has(serverId)) {
        state.collapsedServerGroups.delete(serverId);
        group.classList.remove('collapsed');
    } else {
        state.collapsedServerGroups.add(serverId);
        group.classList.add('collapsed');
    }
    saveSettings();
}

// Рендеринг секции "Servers" в sidebar
function renderServersSection() {
    const section = document.getElementById('servers-section');
    const list = document.getElementById('servers-list');
    const countEl = document.getElementById('servers-count');
    const header = document.getElementById('servers-section-header');

    if (!section || !list) return;

    // Применяем сохранённое состояние свёрнутости
    if (state.serversSectionCollapsed) {
        section.classList.add('collapsed');
    } else {
        section.classList.remove('collapsed');
    }

    // Обработчик клика на заголовок секции
    if (!header.dataset.listenerAdded) {
        header.addEventListener('click', toggleServersSection);
        header.dataset.listenerAdded = 'true';
    }

    list.innerHTML = '';

    let serverCount = 0;

    state.servers.forEach((server, serverId) => {
        serverCount++;
        const li = document.createElement('li');
        li.className = 'server-item' + (server.connected ? ' connected' : ' disconnected');
        li.dataset.serverId = serverId;

        const objectCount = server.objectCount || 0;
        const connectedCount = server.connected ? objectCount : 0;

        let statsClass = '';
        if (objectCount === 0) {
            statsClass = '';
        } else if (connectedCount === objectCount) {
            statsClass = 'all-connected';
        } else if (connectedCount === 0) {
            statsClass = 'all-disconnected';
        } else {
            statsClass = 'some-disconnected';
        }

        const statusClass = server.connected ? '' : ' disconnected';
        const displayName = server.name || `${server.url.replace(/^https?:\/\//, '')}`;
        const statsText = objectCount > 0 ? `${connectedCount}/${objectCount}` : '-/-';

        li.innerHTML = `
            <span class="server-status-dot${statusClass}"></span>
            <span class="server-name" title="${escapeHtml(server.url)}">${escapeHtml(displayName)}</span>
            <span class="server-stats ${statsClass}">${statsText}</span>
        `;

        // Клик на сервер — развернуть/свернуть его группу в списке объектов
        li.addEventListener('click', () => {
            // Находим группу сервера и прокручиваем к ней
            const group = document.querySelector(`.server-group[data-server-id="${serverId}"]`);
            if (group) {
                // Если группа свёрнута — разворачиваем
                if (state.collapsedServerGroups.has(serverId)) {
                    toggleServerGroup(serverId);
                }
                // Прокручиваем к группе
                group.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });

        list.appendChild(li);
    });

    // Обновляем счётчик (только standalone серверы)
    if (countEl) {
        countEl.textContent = serverCount;
    }
}

// Переключить свёрнутость секции "Servers"
function toggleServersSection() {
    const section = document.getElementById('servers-section');
    if (!section) return;

    state.serversSectionCollapsed = !state.serversSectionCollapsed;
    section.classList.toggle('collapsed', state.serversSectionCollapsed);
    saveSettings();
}

async function openObjectTab(name, serverId, serverName) {
    // Составной ключ для tabs: serverId:objectName
    const tabKey = `${serverId}:${name}`;

    // Переключаемся на Objects view если сейчас на Dashboard
    if (dashboardManager && dashboardState.currentView !== 'objects') {
        dashboardManager.switchView('objects');
    }

    if (state.tabs.has(tabKey)) {
        activateTab(tabKey);
        return;
    }

    // Сначала загружаем данные, чтобы узнать тип объекта
    try {
        const data = await fetchObjectData(name, serverId);
        const rendererInfo = resolveRenderer(data.object || {});

        createTab(tabKey, name, rendererInfo, data, serverId, serverName);
        activateTab(tabKey);

        watchObject(name, serverId).catch(console.error);
    } catch (err) {
        console.error(`Error открытия вкладки ${name}:`, err);
    }
}

function createTab(tabKey, displayName, rendererInfo, initialData, serverId, serverName) {
    const tabsHeader = document.getElementById('tabs-header');
    const tabsContent = document.getElementById('tabs-content');

    const placeholder = tabsContent.querySelector('.placeholder');
    if (placeholder) placeholder.remove();

    // Получаем класс рендерера для данного типа объекта/расширения
    const RendererClass = rendererInfo.RendererClass || DefaultObjectRenderer;
    const renderer = new RendererClass(displayName, tabKey);
    renderer.extensionType = rendererInfo.extensionType;
    renderer.objectType = rendererInfo.objectType;

    // Кнопка вкладки с индикатором типа и сервера
    const serverData = state.servers.get(serverId);
    const serverConnected = serverData?.connected !== false;

    const tabBtn = document.createElement('button');
    tabBtn.className = 'tab-btn' + (serverConnected ? '' : ' server-disconnected');
    tabBtn.dataset.name = tabKey;
    tabBtn.dataset.objectType = rendererInfo.rendererType;
    tabBtn.dataset.serverId = serverId;

    const badgeType = rendererInfo.badgeType || rendererInfo.rendererType || 'Default';

    // Формируем HTML вкладки
    const tabHTML = `
        <span class="tab-type-badge">${badgeType}</span>
        <span class="tab-server-badge${serverConnected ? '' : ' disconnected'}" data-server-id="${serverId}">${serverName}</span>
        ${displayName}
        <span class="close">&times;</span>
    `;
    tabBtn.innerHTML = tabHTML;

    tabBtn.addEventListener('click', (e) => {
        if (e.target.classList.contains('close')) {
            closeTab(tabKey);
        } else {
            activateTab(tabKey);
        }
    });
    tabsHeader.appendChild(tabBtn);

    // Панель содержимого - создаётся рендерером
    const panel = document.createElement('div');
    panel.className = 'tab-panel' + (serverConnected ? '' : ' server-disconnected');
    panel.dataset.name = tabKey;
    panel.dataset.objectType = rendererInfo.rendererType;
    panel.dataset.serverId = serverId;
    panel.innerHTML = renderer.createPanelHTML();
    tabsContent.appendChild(panel);

    // Восстановить состояние спойлеров
    restoreCollapsedSections(displayName);

    // Восстановить порядок секций
    loadSectionOrder(tabKey);

    // Сохраняем состояние вкладки с рендерером
    // Если SSE подключен, не запускаем polling (данные будут приходить через SSE)
    const updateInterval = state.sse.connected
        ? null
        : setInterval(() => loadObjectData(tabKey), state.sse.pollInterval);

    state.tabs.set(tabKey, {
        charts: new Map(),
        variables: {},
        objectType: rendererInfo.rendererType,
        extensionType: rendererInfo.extensionType,
        renderer: renderer,
        updateInterval: updateInterval,
        displayName: displayName,
        serverId: serverId,
        serverName: serverName
    });

    // Инициализация рендерера (настройка обработчиков и т.д.)
    renderer.initialize();

    // Восстанавливаем внешние датчики из localStorage
    restoreExternalSensors(tabKey, displayName);

    // Обновляем состояние кнопок перемещения секций
    updateReorderButtons(tabKey);

    // Отрисовываем начальные данные
    if (initialData) {
        renderer.update(initialData);
    }
}

function activateTab(name) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
    document.querySelectorAll('.objects-list li').forEach(li => li.classList.remove('active'));
    // Снимаем выделение с dashboard items в sidebar
    document.querySelectorAll('.dashboard-item').forEach(item => item.classList.remove('active'));

    document.querySelector(`.tab-btn[data-name="${name}"]`)?.classList.add('active');
    document.querySelector(`.tab-panel[data-name="${name}"]`)?.classList.add('active');
    document.querySelector(`.objects-list li[data-name="${name}"]`)?.classList.add('active');

    state.activeTab = name;
}

function closeTab(name) {
    const tabState = state.tabs.get(name);
    if (tabState) {
        clearInterval(tabState.updateInterval);
        tabState.charts.forEach(chartData => {
            clearInterval(chartData.updateInterval);
            chartData.chart.destroy();
        });
        // Вызываем destroy рендерера
        if (tabState.renderer) {
            tabState.renderer.destroy();
        }
    }

    unwatchObject(name).catch(console.error);

    state.tabs.delete(name);

    document.querySelector(`.tab-btn[data-name="${name}"]`)?.remove();
    document.querySelector(`.tab-panel[data-name="${name}"]`)?.remove();

    if (state.tabs.size === 0) {
        const tabsContent = document.getElementById('tabs-content');
        tabsContent.innerHTML = '<div class="placeholder">Select an object from the list on the left</div>';
        state.activeTab = null;
    } else if (state.activeTab === name) {
        const firstTab = state.tabs.keys().next().value;
        activateTab(firstTab);
    }
}

// ============================================================================
// Launcher вкладки
// ============================================================================

function openLauncherTab(nodeId, nodeName, launcherUrl, hasControl) {
    const tabKey = `launcher:${nodeId}`;

    // Переключаемся на Objects view если сейчас на Dashboard
    if (dashboardManager && dashboardState.currentView !== 'objects') {
        dashboardManager.switchView('objects');
    }

    if (state.tabs.has(tabKey)) {
        activateTab(tabKey);
        return;
    }

    createLauncherTab(tabKey, nodeId, nodeName, launcherUrl, hasControl);
    activateTab(tabKey);
}

function createLauncherTab(tabKey, nodeId, nodeName, launcherUrl, hasControl) {
    const tabsHeader = document.getElementById('tabs-header');
    const tabsContent = document.getElementById('tabs-content');

    const placeholder = tabsContent.querySelector('.placeholder');
    if (placeholder) placeholder.remove();

    const renderer = new LauncherRenderer(nodeName, tabKey, nodeId, launcherUrl, hasControl);

    // Проверяем начальный статус подключения
    const nodeState = state.nodes.get(nodeId);
    const nodeConnected = nodeState?.connected !== false;

    // Кнопка вкладки
    const tabBtn = document.createElement('button');
    tabBtn.className = 'tab-btn' + (nodeConnected ? '' : ' server-disconnected');
    tabBtn.dataset.name = tabKey;
    tabBtn.dataset.objectType = 'Launcher';
    tabBtn.innerHTML = `
        <span class="tab-type-badge tab-badge-launcher">Launcher</span>
        ${escapeHtml(nodeName)}
        <span class="close">&times;</span>
    `;
    tabBtn.addEventListener('click', (e) => {
        if (e.target.classList.contains('close')) {
            closeTab(tabKey);
        } else {
            activateTab(tabKey);
        }
    });
    tabsHeader.appendChild(tabBtn);

    // Панель содержимого
    const panel = document.createElement('div');
    panel.className = 'tab-panel' + (nodeConnected ? '' : ' server-disconnected');
    panel.dataset.name = tabKey;
    panel.dataset.objectType = 'Launcher';
    panel.innerHTML = renderer.createPanelHTML();
    tabsContent.appendChild(panel);

    // Сохраняем состояние
    state.tabs.set(tabKey, {
        charts: new Map(),
        variables: {},
        objectType: 'Launcher',
        renderer: renderer,
        updateInterval: null,
        displayName: nodeName,
        serverId: nodeId,
        serverName: nodeName
    });

    renderer.initialize();
}

// ============================================================================
// Секция Launchers (плоский список Launcher'ов)
// ============================================================================

// Рендеринг секции Launchers в sidebar
function renderLaunchersSection(launchers) {
    const section = document.getElementById('launchers-section');
    if (!section) return;

    if (!launchers || launchers.length === 0) {
        section.style.display = 'none';
        return;
    }
    // В group mode секция скрыта — не показываем
    if (!state.sidebarGroups || state.sidebarGroups.length === 0) {
        section.style.display = '';
    }

    const list = document.getElementById('launchers-list');
    const countEl = document.getElementById('launchers-count');
    const header = document.getElementById('launchers-section-header');

    if (countEl) {
        countEl.textContent = launchers.length;
    }

    // Применяем сохранённое состояние свёрнутости
    if (state.launchersSectionCollapsed) {
        section.classList.add('collapsed');
    } else {
        section.classList.remove('collapsed');
    }

    // Обработчик клика на заголовок
    if (header && !header.dataset.listenerAdded) {
        header.addEventListener('click', toggleLaunchersSection);
        header.dataset.listenerAdded = 'true';
    }

    if (!list) return;
    list.innerHTML = '';

    for (const launcher of launchers) {
        // Сохраняем в state
        state.nodes.set(launcher.id, {
            id: launcher.id,
            name: launcher.name,
            launcherUrl: launcher.launcherUrl,
            connected: launcher.connected ?? false,
            hasControl: launcher.hasControl ?? false
        });

        const displayName = launcher.name || launcher.id;
        const connected = launcher.connected ?? false;

        let statusText = '';
        if (launcher.status && launcher.status.processes) {
            const total = launcher.status.processes.length;
            const running = launcher.status.processes.filter(p => p.state === 'running').length;
            statusText = `${running}/${total}`;
        }

        const li = document.createElement('li');
        li.className = 'launcher-sidebar-item';
        li.dataset.nodeId = launcher.id;
        li.innerHTML = `
            <span class="server-status-dot${connected ? '' : ' disconnected'}"></span>
            <span class="launcher-sidebar-name">${escapeHtml(displayName)}</span>
            ${statusText ? `<span class="launcher-sidebar-stats">${statusText}</span>` : ''}
        `;
        li.addEventListener('click', () => {
            openLauncherTab(launcher.id, launcher.name, launcher.launcherUrl, launcher.hasControl);
        });
        list.appendChild(li);
    }
}

function toggleLaunchersSection() {
    const section = document.getElementById('launchers-section');
    if (!section) return;

    state.launchersSectionCollapsed = !state.launchersSectionCollapsed;
    section.classList.toggle('collapsed', state.launchersSectionCollapsed);
    saveSettings();
}

// Обновить статус Launcher'а в sidebar
function updateLauncherNodeStatus(nodeId, connected) {
    const nodeState = state.nodes.get(nodeId);
    if (nodeState) {
        nodeState.connected = connected;
    }

    const item = document.querySelector(`.launcher-sidebar-item[data-node-id="${nodeId}"]`);
    if (item) {
        const dot = item.querySelector('.server-status-dot');
        if (dot) {
            dot.className = `server-status-dot${connected ? '' : ' disconnected'}`;
        }
    }

    // Обновляем CSS-класс tab-кнопки и панели (аналогично updateServerStatus)
    const tabKey = `launcher:${nodeId}`;
    const tabBtn = document.querySelector(`.tab-btn[data-name="${CSS.escape(tabKey)}"]`);
    if (tabBtn) {
        tabBtn.classList.toggle('server-disconnected', !connected);
    }
    const tabPanel = document.querySelector(`.tab-panel[data-name="${CSS.escape(tabKey)}"]`);
    if (tabPanel) {
        tabPanel.classList.toggle('server-disconnected', !connected);
    }

    // Обновляем статус в sidebar группах (по имени ноды)
    if (typeof updateGroupEntityStatus === 'function' && nodeState) {
        updateGroupEntityStatus('launcher', nodeState.name, connected);
    }
}

// Загрузка списка Launcher'ов (вызывается при инициализации)
async function loadLauncherNodes() {
    try {
        const resp = await fetch('/api/launchers');
        if (!resp.ok) return;
        const data = await resp.json();
        if (data.launchers && data.launchers.length > 0) {
            renderLaunchersSection(data.launchers);
        }
    } catch (err) {
        console.warn('Failed to load launchers:', err);
    }
}

async function loadObjectData(tabKey) {
    try {
        const tabState = state.tabs.get(tabKey);
        if (!tabState) return;

        const data = await fetchObjectData(tabState.displayName, tabState.serverId);

        // Используем рендерер для обновления данных
        if (tabState.renderer) {
            tabState.renderer.update(data);
        }

        // Если работаем в режиме polling - обновляем индикатор
        if (!state.sse.connected) {
            updateSSEStatus('polling', new Date());
        }
    } catch (err) {
        console.error(`Error загрузки ${tabKey}:`, err);
    }
}

