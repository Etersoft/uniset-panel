// Загрузка версии приложения
async function loadAppVersion() {
    try {
        const response = await fetch('/api/version');
        if (response.ok) {
            const data = await response.json();
            const versionEl = document.getElementById('app-version');
            if (versionEl && data.version) {
                versionEl.textContent = `v${data.version}`;
            }
        }
    } catch (err) {
        console.warn('Failed to load app version:', err);
    }
}

// Инициализация
document.addEventListener('DOMContentLoaded', async () => {
    // Загружаем версию приложения
    loadAppVersion();

    // Инициализация токена контроля (из URL или localStorage)
    initControlToken();

    // Загружаем конфигурацию приложения (не блокируем загрузку объектов)
    loadAppConfig();

    // Инициализация SSE для realtime обновлений (получаем capabilities при подключении)
    initSSE();

    // Загружаем sidebar конфигурацию (группы)
    await loadSidebar();

    // Загружаем список объектов (заполняет state.servers)
    fetchObjects()
        .then(data => {
            renderObjectsList(data);
            // Загружаем конфигурацию сенсоров per-server (после того как state.servers заполнен)
            loadSensorsConfig().catch(err => {
                console.warn('Не удалось загрузить конфигурацию сенсоров:', err);
            });
        })
        .catch(err => {
            console.error('Error загрузки объектов:', err);
            document.getElementById('objects-list').innerHTML =
                '<li class="alert alert-error">Error loading objects</li>';
        });

    // Кнопка обновления
    document.getElementById('refresh-objects').addEventListener('click', () => {
        fetchObjects()
            .then(renderObjectsList)
            .catch(console.error);
    });

    // Кнопка очистки кэша
    document.getElementById('clear-cache').addEventListener('click', () => {
        if (confirm('Clear all saved settings?\n\nWill be deleted:\n- user dashboards\n- pinned sensors\n- selected charts\n- section order and heights\n- filter settings\n- LogViewer settings\n- control session token')) {
            localStorage.clear();
            location.reload();
        }
    });

    // Кнопка сворачивания боковой панели
    document.getElementById('toggle-sidebar').addEventListener('click', () => {
        const sidebar = document.getElementById('sidebar');
        sidebar.classList.toggle('collapsed');
        state.sidebarCollapsed = sidebar.classList.contains('collapsed');
        saveSettings();
    });

    // Инициализация селектора poll interval
    initPollIntervalSelector();

    // Инициализация UI записи
    initRecordingUI();

    // Loading сохранённых настроек
    loadSettings();

    // Инициализация Dashboard Manager
    dashboardManager = window.dashboardManager = new DashboardManager();

    // Загрузка Launcher нод (не блокируем)
    loadLauncherNodes().catch(err => {
        console.warn('Failed to load launcher nodes:', err);
    });

    // Инициализация Journals (не блокируем)
    initJournals().catch(err => {
        console.warn('Failed to initialize journals:', err);
    });

    // Показываем sidebar группы, скрываем hardcoded секции
    const groupsContainer = document.getElementById('sidebar-groups');
    if (groupsContainer) {
        groupsContainer.style.display = '';
    }
    const legacySections = ['launchers-section', 'objects-section', 'journals-section', 'dashboards-section', 'servers-section'];
    for (const id of legacySections) {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    }
    renderSidebarGroups();
    applySidebarStatuses();
    // SSE статусы серверов приходят асинхронно, повторно применяем после стабилизации
    setTimeout(applySidebarStatuses, SIDEBAR_STATUS_REAPPLY_DELAY);
});

// Инициализация селектора интервала опроса
function initPollIntervalSelector() {
    const buttons = document.querySelectorAll('.poll-btn');
    const savedInterval = localStorage.getItem('pollInterval');

    // Set активную кнопку
    const setActive = (interval) => {
        buttons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.interval === String(interval));
        });
    };

    // Восстановить из localStorage или использовать значение с сервера
    if (savedInterval) {
        setActive(savedInterval);
    } else {
        // По умолчанию 1s
        setActive(1000);
    }

    // Обработчики кликов
    buttons.forEach(btn => {
        btn.addEventListener('click', async () => {
            const interval = parseInt(btn.dataset.interval);
            setActive(interval);
            localStorage.setItem('pollInterval', interval);

            // Обновляем глобальный интервал и перезапускаем автообновление статуса
            state.sse.pollInterval = interval;
            restartAllStatusAutoRefresh();

            // Отправляем на сервер
            try {
                const headers = { 'Content-Type': 'application/json' };
                if (state.control.token) {
                    headers['X-Control-Token'] = state.control.token;
                }
                const response = await fetch('/api/settings/poll-interval', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ interval })
                });
                if (response.ok) {
                    console.log(`Poll interval изменён на ${interval}ms`);
                } else {
                    console.warn('Не удалось изменить poll interval');
                }
            } catch (err) {
                console.error('Error изменения poll interval:', err);
            }
        });
    });
}

// Перезапуск автообновления статуса для всех активных табов
function restartAllStatusAutoRefresh() {
    state.tabs.forEach((tab) => {
        if (tab.renderer && typeof tab.renderer.startStatusAutoRefresh === 'function') {
            tab.renderer.startStatusAutoRefresh();
        }
    });
}
