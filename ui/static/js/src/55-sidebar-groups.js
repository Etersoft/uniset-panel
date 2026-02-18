// Sidebar Groups — рендеринг сгруппированного sidebar
// Загружается между UI-функциями (50-59 диапазон)

const ENTITY_TYPE_BADGE = {
    object: 'Obj',
    launcher: 'Lnc',
    journal: 'Jrn',
    dashboard: 'Dsh',
    server: 'Srv'
};

// Загрузка sidebar конфигурации с сервера
async function loadSidebar() {
    try {
        const response = await fetch('/api/sidebar');
        if (!response.ok) {
            console.warn('Sidebar API error:', response.status);
            state.sidebarGroups = [];
            return;
        }
        const data = await response.json();
        state.sidebarGroups = Array.isArray(data.groups) ? data.groups : [];
        console.log(`Sidebar: ${state.sidebarGroups.length} groups loaded`);
    } catch (err) {
        console.warn('Failed to load sidebar config:', err);
        state.sidebarGroups = [];
    }
}

// Загрузка collapse состояния групп из localStorage
function loadGroupCollapseState() {
    try {
        const saved = localStorage.getItem('uniset-panel-group-collapse');
        if (saved) {
            state.groupCollapseState = JSON.parse(saved);
        }
    } catch (err) {
        state.groupCollapseState = {};
    }
}

// Сохранение collapse состояния групп в localStorage
function saveGroupCollapseState() {
    try {
        localStorage.setItem('uniset-panel-group-collapse', JSON.stringify(state.groupCollapseState));
    } catch (err) {
        // ignore
    }
}

// Основная функция рендеринга всех групп
function renderSidebarGroups() {
    const container = document.getElementById('sidebar-groups');
    if (!container || !state.sidebarGroups) return;

    container.innerHTML = '';
    loadGroupCollapseState();

    for (const group of state.sidebarGroups) {
        renderSidebarGroup(group, container);
    }

    // Пользовательские dashboard'ы из localStorage
    renderUserDashboardsGroup(container);
}

// Рендеринг одной группы
function renderSidebarGroup(group, container) {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'sidebar-group';
    groupDiv.dataset.groupName = group.name || '';

    // Группа без имени — без заголовка (дефолтный режим без конфига)
    if (group.name) {
        const isCollapsed = state.groupCollapseState[group.name] === true;
        if (isCollapsed) {
            groupDiv.classList.add('collapsed');
        }

        const header = document.createElement('div');
        header.className = 'sidebar-group-header';
        header.innerHTML = `
            <svg class="collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 9l6 6 6-6"/>
            </svg>
            <span class="sidebar-group-title">${escapeHtml(group.name)}</span>
            <span class="sidebar-group-count">${group.items ? group.items.length : 0}</span>
        `;
        header.addEventListener('click', () => {
            groupDiv.classList.toggle('collapsed');
            state.groupCollapseState[group.name] = groupDiv.classList.contains('collapsed');
            saveGroupCollapseState();
        });
        groupDiv.appendChild(header);
    }

    // Items — всегда плоский список с бейджами
    const ul = document.createElement('ul');
    ul.className = 'sidebar-group-list';

    if (group.items) {
        for (const item of group.items) {
            ul.appendChild(createSidebarGroupItem(item));
        }
    }

    groupDiv.appendChild(ul);
    container.appendChild(groupDiv);
}

// Создание одного элемента sidebar
function createSidebarGroupItem(item) {
    const li = document.createElement('li');
    li.className = 'sidebar-group-item';
    li.dataset.type = item.type;
    li.dataset.name = item.name;
    if (item.serverId) {
        li.dataset.serverId = item.serverId;
    }

    // Status dot для объектов и серверов
    if (item.type === 'object' || item.type === 'server') {
        const dot = document.createElement('span');
        dot.className = 'sidebar-group-status';
        li.appendChild(dot);
    }

    // Type badge
    const badge = document.createElement('span');
    badge.className = `entity-type-badge entity-type-${item.type}`;
    badge.textContent = ENTITY_TYPE_BADGE[item.type] || item.type;
    li.appendChild(badge);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'sidebar-group-item-name';
    nameSpan.textContent = item.displayName || item.name;
    li.appendChild(nameSpan);

    li.addEventListener('click', () => {
        activateSidebarGroupItem(item.type, item.name, item.serverId);
        // Подсветка активного элемента
        document.querySelectorAll('.sidebar-group-item.active').forEach(el => el.classList.remove('active'));
        li.classList.add('active');
    });

    return li;
}

// Активация элемента sidebar — открытие соответствующего таба
function activateSidebarGroupItem(type, name, serverId) {
    switch (type) {
        case 'object': {
            const serverInfo = state.servers.get(serverId);
            const serverName = serverInfo ? serverInfo.name : (serverId || '');
            openObjectTab(name, serverId, serverName);
            break;
        }
        case 'launcher': {
            for (const [nodeId, node] of state.nodes) {
                if (node.name === name) {
                    openLauncherTab(nodeId, node.name, node.launcherUrl, node.hasControl);
                    return;
                }
            }
            break;
        }
        case 'dashboard': {
            if (dashboardManager) {
                dashboardManager.loadDashboard(name);
            }
            break;
        }
        case 'journal': {
            if (typeof journalManager !== 'undefined' && journalManager) {
                for (const [id, journal] of journalManager.journals) {
                    if (journal.name === name) {
                        journalManager.openJournal(id);
                        return;
                    }
                }
            }
            break;
        }
        case 'server': {
            for (const [serverId, server] of state.servers) {
                if (server.id === name || server.name === name) {
                    const group = document.querySelector(`.server-group[data-server-id="${serverId}"]`);
                    if (group) {
                        group.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                    return;
                }
            }
            break;
        }
    }
}

// Обновление статуса сущности в sidebar группах (вызывается из SSE хуков)
function updateGroupEntityStatus(type, name, connected) {
    const container = document.getElementById('sidebar-groups');
    if (!container) return;

    const selector = `.sidebar-group-item[data-type="${type}"][data-name="${CSS.escape(name)}"]`;
    const items = container.querySelectorAll(selector);
    items.forEach(item => {
        const dot = item.querySelector('.sidebar-group-status');
        if (dot) {
            dot.classList.toggle('connected', connected);
            dot.classList.toggle('disconnected', !connected);
        }
    });

    // Объекты наследуют статус от своего сервера
    if (type === 'server') {
        const objSelector = `.sidebar-group-item[data-type="object"][data-server-id="${CSS.escape(name)}"]`;
        container.querySelectorAll(objSelector).forEach(item => {
            const dot = item.querySelector('.sidebar-group-status');
            if (dot) {
                dot.classList.toggle('connected', connected);
                dot.classList.toggle('disconnected', !connected);
            }
        });
    }
}

// Обновление sidebar при изменении списка объектов
async function refreshSidebarGroups() {
    await loadSidebar();
    renderSidebarGroups();
    applySidebarStatuses();
}

// Применяет текущие статусы из state к точкам в sidebar
function applySidebarStatuses() {
    for (const [serverId, server] of state.servers) {
        if (server.connected !== undefined) {
            updateGroupEntityStatus('server', serverId, server.connected);
        }
    }
    for (const [nodeId, node] of state.nodes) {
        if (node.connected !== undefined) {
            updateGroupEntityStatus('launcher', node.name, node.connected);
        }
    }
}

// Рендеринг пользовательских dashboard'ов в отдельную группу
function renderUserDashboardsGroup(container) {
    try {
        const saved = localStorage.getItem('user-dashboards');
        if (!saved) return;

        const userDashboards = JSON.parse(saved);
        if (!Array.isArray(userDashboards) || userDashboards.length === 0) return;

        const items = userDashboards.map(name => ({
            type: 'dashboard',
            name: name
        }));

        renderSidebarGroup({
            name: 'Custom',
            items: items
        }, container);
    } catch (err) {
        // ignore
    }
}
