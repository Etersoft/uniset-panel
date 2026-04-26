// ============================================================================
// ActiveDashboardWidget — базовый класс для активных (write-capable) виджетов.
//
// Наследуется от DashboardWidget. Добавляет:
//   - writeValue(value): запись через controlledFetch на /api/objects/.../ionc/set
//   - writeState: 'idle' | 'pending' | 'success' | 'error'
//   - commandValue: последняя команда, отправленная пользователем
//   - feedbackValue: текущее значение датчика от сервера (= this.value базового класса)
//   - isInteractive(): false в edit mode
//   - needsConfirmation(): читает config.requireConfirmation
//   - getConfigForm()/parseConfigForm(): расширяемые через
//     getActiveConfigFields()/parseActiveConfigFields() в наследниках
//
// Конкретные виджеты (toggle/checkbox/button/setpoint/generator) реализуются
// в отдельных файлах 61-active-*.js и регистрируются в WIDGET_TYPES.
// ============================================================================

class ActiveDashboardWidget extends DashboardWidget {
    static type = 'active-base';
    static displayName = 'Active Widget (base)';
    static description = 'Base class for write-capable widgets';
    // Active widgets всегда используют setupSensorAutocomplete (41-sensor-autocomplete.js).
    // dashboard-manager skip'ает legacy in-memory sensor autocomplete для widget'ов
    // c этим флагом. См. 62-dashboard-manager.js setupConfigDialog.
    static usesNewSensorAutocomplete = true;
    // Subclasses с несколькими стилями (toggle: ['slider','checkbox']) задают список;
    // base getConfigForm рендерит style select когда length > 1.
    static styles = [];
    static defaultStyle = '';

    constructor(id, config, container) {
        super(id, config, container);
        this.commandValue = null;
        this.feedbackValue = null;
        this.writeState = 'idle';
        this._writeStateTimer = null;
        this._pendingTimeoutTimer = null;

        // Reactive interactivity: refresh active-disabled класс when edit mode
        // or controlToken state changes.
        this._interactivityListener = () => this._updateInteractivityClass();
        document.addEventListener('dashboardEditModeChanged', this._interactivityListener);
        document.addEventListener('controlStatusChanged', this._interactivityListener);
    }

    // ===== SSE feedback =====
    update(value, error = null) {
        this.feedbackValue = value;
        this.value = value;
        this.error = error;
        this.renderFeedback();
    }

    // ===== Write =====
    async writeValue(value) {
        if (!this.isInteractive()) return;
        if (this.needsConfirmation() && !await this._confirm(value)) return;

        this.commandValue = value;
        this._setWriteState('pending');

        // sensorId — числовой ID, должен быть резолвлен заранее (autocomplete сохраняет
        // его в config). config.sensor (имя) — fallback для smoke TestActiveWidget'а.
        const sensorId = this.config?.sensorId ?? this.config?.sensor;
        if (sensorId === undefined || sensorId === null || sensorId === '') {
            this._setWriteState('error', 'Sensor not configured');
            return;
        }

        const serverId = this._resolveServerId();
        if (!serverId) {
            this._setWriteState('error', 'No connected server');
            return;
        }

        const objectName = this.config?.objectName || 'SharedMemory';
        const url = `/api/objects/${encodeURIComponent(objectName)}/ionc/set?server=${encodeURIComponent(serverId)}`;
        try {
            const resp = await controlledFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sensor_id: sensorId, value })
            });
            if (!resp.ok) {
                const data = await resp.json().catch(() => ({}));
                this._setWriteState('error', data.error || `HTTP ${resp.status}`);
                return;
            }
            this._setWriteState('success');
        } catch (e) {
            this._setWriteState('error', e.message);
        }
    }

    // ===== State helpers =====
    _setWriteState(state, message = '') {
        this.writeState = state;
        this._lastWriteMessage = message;

        // Обновить CSS-классы контейнера виджета
        const root = this.container;
        if (root) {
            root.classList.remove('active-pending', 'active-success', 'active-error');
            if (state !== 'idle') {
                root.classList.add(`active-${state}`);
            }
            this._recomputeTitle();
        }

        // Очистить предыдущие таймеры
        clearTimeout(this._writeStateTimer);
        clearTimeout(this._pendingTimeoutTimer);
        this._writeStateTimer = null;
        this._pendingTimeoutTimer = null;

        if (state === 'pending') {
            // Защитный таймаут — если сервер молчит, переводим в error.
            this._pendingTimeoutTimer = setTimeout(() => {
                if (this.writeState === 'pending') {
                    this._setWriteState('error', 'Write timed out');
                }
            }, WRITE_PENDING_TIMEOUT_MS);
        } else if (state === 'success') {
            // Через WRITE_SUCCESS_DISPLAY_MS возвращаемся в idle.
            this._writeStateTimer = setTimeout(() => {
                if (this.writeState === 'success') {
                    this._setWriteState('idle');
                }
            }, WRITE_SUCCESS_DISPLAY_MS);
        }

        // command может зависеть от state (например opacity).
        // Guard: _setWriteState может вызываться до render() (writeValue может фейлиться синхронно).
        if (this.element) this.renderCommand();
    }

    // ===== Edit-mode / control gating =====
    isInteractive() {
        if (typeof dashboardState !== 'undefined' && dashboardState.editMode) return false;
        if (typeof canControl === 'function' && !canControl()) return false;
        return true;
    }

    // Единая точка владения title. Приоритет:
    //   1. write error message (пока активен writeState='error')
    //   2. control-blocked / edit-mode → 'Take control to interact'
    //   3. пусто
    // Вызывается из _setWriteState и _updateInteractivityClass — так оба источника
    // не затирают друг друга и пользователь видит самую релевантную информацию.
    _recomputeTitle() {
        const root = this.container;
        if (!root) return;
        if (this.writeState === 'error' && this._lastWriteMessage) {
            root.title = this._lastWriteMessage;
            return;
        }
        if (!this.isInteractive()) {
            root.title = 'Take control to interact';
            return;
        }
        root.removeAttribute('title');
    }

    // Toggles 'active-disabled' class and 'data-control-blocked' attr on the
    // widget container so CSS can show "click does nothing right now" state.
    _updateInteractivityClass() {
        const root = this.container;
        if (!root) return;
        const interactive = this.isInteractive();
        root.classList.toggle('active-disabled', !interactive);
        if (!interactive) {
            root.dataset.controlBlocked = 'true';
        } else {
            delete root.dataset.controlBlocked;
        }
        this._recomputeTitle();
    }

    needsConfirmation() {
        return !!this.config?.requireConfirmation;
    }

    async _confirm(value) {
        // Простой confirm — конкретные виджеты могут override на красивый dialog.
        return window.confirm(`Set ${this.config?.sensor || 'sensor'} = ${value}?`);
    }

    _resolveServerId() {
        // Берём первый подключённый сервер (как делает dashboard для чтения).
        if (typeof state === 'undefined' || !state.servers) return null;
        for (const [id, server] of state.servers) {
            if (server.connected) return id;
        }
        return null;
    }

    // ===== Render hooks (override в наследниках) =====
    renderCommand() {
        // Override: показать commandValue в DOM.
    }

    renderFeedback() {
        // Override: показать feedbackValue в DOM.
    }

    // ===== Config form extension =====
    static getConfigForm(config = {}) {
        const styleSelect = (this.styles && this.styles.length > 1)
            ? `
            <div class="widget-config-field">
                <label>Style</label>
                <select class="widget-input" name="style" data-test="cfg-style">
                    ${this.styles.map(s => `<option value="${escapeHtml(s)}" ${(config.style || this.defaultStyle) === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
                </select>
            </div>
            `
            : '';

        const baseFields = `
            <div class="widget-config-field">
                <label>IONC Object</label>
                <select class="widget-input" name="objectName" data-test="cfg-objectName">
                    <option value="${escapeHtml(config.objectName || 'SharedMemory')}" selected>${escapeHtml(config.objectName || 'SharedMemory')}</option>
                </select>
                <small style="color:#6b7280">список загружается из /api/objects?type=IONotifyController</small>
            </div>
            <div class="widget-config-field">
                <label>Sensor (autocomplete)</label>
                <input type="text" class="widget-input" name="sensor" autocomplete="off"
                       value="${escapeHtml(config.sensor || '')}" data-test="cfg-sensor">
                <input type="hidden" name="sensorId" value="${config.sensorId ?? ''}" data-test="cfg-sensorId">
            </div>
            ${styleSelect}
            <div class="widget-config-field">
                <label>Label</label>
                <input type="text" class="widget-input" name="label"
                       value="${escapeHtml(config.label || '')}" placeholder="Display label">
            </div>
            <div class="widget-config-field">
                <label class="widget-checkbox-label">
                    <input type="checkbox" name="requireConfirmation"
                           ${config.requireConfirmation ? 'checked' : ''}>
                    <span>Require confirmation before write</span>
                </label>
            </div>
        `;
        return baseFields + (this.getActiveConfigFields ? this.getActiveConfigFields(config) : '');
    }

    static getActiveConfigFields(config = {}) {
        // Override: дополнительные поля специфичные для виджета.
        return '';
    }

    static parseConfigForm(form) {
        const base = {
            sensor:     form.querySelector('[name="sensor"]')?.value || '',
            sensorId:   parseInt(form.querySelector('[name="sensorId"]')?.value, 10) || null,
            objectName: form.querySelector('[name="objectName"]')?.value || 'SharedMemory',
            label:      form.querySelector('[name="label"]')?.value || '',
            requireConfirmation: form.querySelector('[name="requireConfirmation"]')?.checked || false,
        };
        const styleEl = form.querySelector('[name="style"]');
        if (styleEl) base.style = styleEl.value;
        const extra = this.parseActiveConfigFields ? this.parseActiveConfigFields(form) : {};
        return { ...base, ...extra };
    }

    static initConfigHandlers(form, config = {}) {
        const objectSelect = form.querySelector('[name="objectName"]');
        const sensorInput = form.querySelector('[name="sensor"]');
        const hiddenIdInput = form.querySelector('[name="sensorId"]');
        if (!objectSelect || !sensorInput || !hiddenIdInput) return;

        // Resolve serverId — first connected server (как в _resolveServerId).
        let serverId = '';
        for (const [id, srv] of state.servers) {
            if (srv.connected) { serverId = id; break; }
        }

        // Populate IONC objects dropdown.
        if (serverId) {
            fetch(`/api/objects?server=${encodeURIComponent(serverId)}&type=IONotifyController`)
                .then(r => r.ok ? r.json() : { objects: [] })
                .then(data => {
                    const objs = data.objects || [];
                    const currentValue = config.objectName || 'SharedMemory';
                    objectSelect.innerHTML = objs.map(o => {
                        const name = typeof o === 'string' ? o : o.name;
                        return `<option value="${escapeHtml(name)}" ${name === currentValue ? 'selected' : ''}>${escapeHtml(name)}</option>`;
                    }).join('');
                    if (!objs.some(o => (typeof o === 'string' ? o : o.name) === currentValue)) {
                        const opt = document.createElement('option');
                        opt.value = currentValue;
                        opt.textContent = `${currentValue} (текущий, не найден)`;
                        opt.selected = true;
                        objectSelect.prepend(opt);
                    }
                })
                .catch(e => console.warn('Failed to load IONC objects:', e));
        }

        // Setup sensor autocomplete.
        const ac = setupSensorAutocomplete(
            sensorInput,
            hiddenIdInput,
            () => objectSelect.value,
            () => serverId
        );

        // Reset sensor on object change.
        objectSelect.addEventListener('change', () => {
            if (ac && typeof ac.resetOnObjectChange === 'function') {
                ac.resetOnObjectChange();
            }
        });
    }

    static parseActiveConfigFields(form) {
        // Override: разобрать поля из getActiveConfigFields().
        return {};
    }

    destroy() {
        clearTimeout(this._writeStateTimer);
        clearTimeout(this._pendingTimeoutTimer);
        document.removeEventListener('dashboardEditModeChanged', this._interactivityListener);
        document.removeEventListener('controlStatusChanged', this._interactivityListener);
        super.destroy();
    }
}

window.ActiveDashboardWidget = ActiveDashboardWidget;
