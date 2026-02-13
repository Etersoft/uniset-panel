// ============================================================================
// Session Control - управление сессиями записи
// ============================================================================

// Инициализация токена контроля
function initControlToken() {
    // 1. Проверяем URL параметр
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');

    if (urlToken) {
        state.control.token = urlToken;
        localStorage.setItem('control-token', urlToken);
        // Убираем токен из URL (безопасность)
        urlParams.delete('token');
        const newUrl = urlParams.toString()
            ? `${window.location.pathname}?${urlParams.toString()}`
            : window.location.pathname;
        window.history.replaceState({}, '', newUrl);
        console.log('Control: Token loaded from URL');
    } else {
        // 2. Проверяем localStorage
        state.control.token = localStorage.getItem('control-token');
        if (state.control.token) {
            console.log('Control: Token loaded from localStorage');
        }
    }
}

// Проверка возможности управления
function canControl() {
    // Если контроль отключён - разрешено всем
    if (!state.control.enabled) return true;
    // Иначе только контроллеру
    return state.control.isController;
}

// Обновление статуса контроля из данных сервера
function updateControlStatus(status) {
    state.control.enabled = status.enabled;
    state.control.hasController = status.hasController;
    state.control.isController = status.isController;
    state.control.timeoutSec = status.timeoutSec || 60;

    updateControlUI();
    updateAllControlButtons();
}

// Обновление UI контроля (компактный индикатор в шапке)
function updateControlUI() {
    const statusEl = document.getElementById('control-status');
    if (!statusEl) return;

    // Скрываем если контроль отключён
    if (!state.control.enabled) {
        statusEl.classList.add('hidden');
        return;
    }

    statusEl.classList.remove('hidden');
    statusEl.classList.remove('control-status-readonly', 'control-status-active');

    if (state.control.isController) {
        statusEl.classList.add('control-status-active');
        statusEl.innerHTML = `
            <span class="control-status-icon">✓</span>
            <span class="control-status-text">Control</span>
            <button class="control-status-btn" onclick="releaseControl()">Release</button>
        `;
    } else {
        statusEl.classList.add('control-status-readonly');
        statusEl.innerHTML = `
            <span class="control-status-icon">🔒</span>
            <span class="control-status-text">Read-only</span>
            <button class="control-status-btn" onclick="showControlDialog()">Take</button>
        `;
    }
}

// Обновление всех кнопок управления (disabled состояние)
function updateAllControlButtons() {
    const canCtrl = canControl();

    // IONC кнопки
    document.querySelectorAll('.ionc-btn-set, .ionc-btn-freeze, .ionc-btn-unfreeze, .ionc-btn-gen, .ionc-btn-gen-stop').forEach(btn => {
        // Не трогаем readonly сенсоры - они всегда disabled
        if (btn.closest('tr')?.classList.contains('readonly')) return;
        btn.disabled = !canCtrl;
        if (!canCtrl) {
            btn.title = 'Read-only mode - take control first';
        } else {
            btn.title = '';
        }
    });

    // Modbus/OPCUA control кнопки
    document.querySelectorAll('.btn-take-control, .btn-release-control').forEach(btn => {
        btn.disabled = !canCtrl;
    });

    // Кнопки сохранения параметров (Modbus, OPCUA)
    document.querySelectorAll('[id^="mb-params-save-"], [id^="mbs-params-save-"], [id^="opcua-params-save-"], [id^="opcuasrv-params-save-"]').forEach(btn => {
        btn.disabled = !canCtrl;
        if (!canCtrl) {
            btn.title = 'Read-only mode - take control first';
        } else {
            btn.title = '';
        }
    });

    // Кнопки команд логера
    document.querySelectorAll('.log-command-btn').forEach(btn => {
        btn.disabled = !canCtrl;
        if (!canCtrl) {
            btn.title = 'Read-only mode - take control first';
        } else {
            btn.title = '';
        }
    });

}

// Показать диалог ввода токена
function showControlDialog() {
    const overlay = document.getElementById('control-dialog-overlay');
    if (overlay) {
        overlay.classList.add('visible');
        const input = document.getElementById('control-token-input');
        if (input) {
            input.value = state.control.token || '';
            input.focus();
        }
    }
}

// Закрыть диалог
function closeControlDialog() {
    const overlay = document.getElementById('control-dialog-overlay');
    if (overlay) {
        overlay.classList.remove('visible');
    }
    const error = document.getElementById('control-error');
    if (error) {
        error.textContent = '';
    }
}

// Попытка захвата управления
async function tryTakeControl(token) {
    if (!token) {
        token = document.getElementById('control-token-input')?.value?.trim();
    }
    if (!token) {
        showControlError('Token is required');
        return;
    }

    try {
        const resp = await fetch('/api/control/take', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        });

        const data = await resp.json();

        if (!resp.ok) {
            showControlError(data.error || 'Failed to take control');
            return;
        }

        // Успешно
        state.control.token = token;
        localStorage.setItem('control-token', token);
        updateControlStatus(data);
        closeControlDialog();
        startControlPing();

        // Переподключаем SSE с токеном
        reconnectSSEWithToken();

    } catch (e) {
        showControlError('Network error: ' + e.message);
    }
}

// Освобождение управления
async function releaseControl() {
    if (!state.control.token) return;

    try {
        const resp = await fetch('/api/control/release', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: state.control.token })
        });

        const data = await resp.json();

        if (resp.ok) {
            stopControlPing();
            updateControlStatus(data);
        }
    } catch (e) {
        console.error('Failed to release control:', e);
    }
}

// Показать ошибку в диалоге
function showControlError(message) {
    const error = document.getElementById('control-error');
    if (error) {
        error.textContent = message;
    }
}

// Запуск периодического ping
function startControlPing() {
    stopControlPing();
    if (!state.control.isController || !state.control.token) return;

    // Ping каждые 30 секунд
    state.control.pingIntervalId = setInterval(async () => {
        try {
            await fetch('/api/control/ping', {
                method: 'POST',
                headers: { 'X-Control-Token': state.control.token }
            });
        } catch (e) {
            console.warn('Control ping failed:', e);
        }
    }, 30000);
}

// Остановка ping
function stopControlPing() {
    if (state.control.pingIntervalId) {
        clearInterval(state.control.pingIntervalId);
        state.control.pingIntervalId = null;
    }
}

// Переподключение SSE с токеном
function reconnectSSEWithToken() {
    if (state.sse.eventSource) {
        state.sse.eventSource.close();
    }
    initSSE();
}

// Fetch wrapper с автоматическим добавлением токена контроля
async function controlledFetch(url, options = {}) {
    // Добавляем токен для не-GET запросов
    if (options.method && options.method !== 'GET' && state.control.token) {
        options.headers = {
            ...options.headers,
            'X-Control-Token': state.control.token
        };
    }

    const response = await fetch(url, options);

    // Обработка ошибки контроля
    if (response.status === 403) {
        try {
            const data = await response.clone().json();
            if (data.code === 'CONTROL_REQUIRED') {
                showControlRequiredNotification();
                throw new Error('Control required');
            }
        } catch (e) {
            // Игнорируем ошибку парсинга
        }
    }

    return response;
}

// Показать уведомление о необходимости контроля
function showControlRequiredNotification() {
    // Показываем диалог контроля
    showControlDialog();
}
