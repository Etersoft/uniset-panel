// ============================================================================
// ActiveDashboardWidget — базовый класс для активных (write-capable) виджетов.
//
// Базовый класс предоставляет:
//   - writeValue(value): запись через controlledFetch на /api/objects/.../ionc/set
//   - writeState: 'idle' | 'pending' | 'success' | 'error' (с auto-revert/timeout)
//   - commandValue / feedbackValue: раздельные «команда vs обратная связь» (SCADA)
//   - isInteractive(): false в edit mode и без controlToken
//   - _updateInteractivityClass(): реактивный active-disabled
//   - _recomputeTitle(): единое управление tooltip'ом (приоритет: error > blocked > пусто)
//   - needsConfirmation(): читает config.requireConfirmation
//   - static getConfigForm: рендерит objectName select + sensor input + hidden sensorId +
//     style select (если styles.length > 1) + label + requireConfirmation
//   - static parseConfigForm: парсит base поля + spread parseActiveConfigFields()
//   - static initConfigHandlers: загружает IONC dropdown + setupSensorAutocomplete
//
// Subclass contract (минимальный active widget):
//   - render() — построить DOM, навесить interaction handlers
//   - renderCommand() — отразить commandValue + writeState в DOM
//   - renderFeedback() — отразить feedbackValue + error в DOM
//
// Опциональные override:
//   - static getActiveConfigFields(config) — дополнительные поля формы
//   - static parseActiveConfigFields(form) — парсинг этих полей (return {} merge'ится)
//   - static styles + static defaultStyle — несколько визуальных стилей; base.getConfigForm
//     автоматически рендерит style select когда styles.length > 1
//   - _confirm(value) — заменить window.confirm на красивый dialog
//
// НЕ переопределять (наследуется и достаточно):
//   - getConfigForm, parseConfigForm, initConfigHandlers, writeValue, _doWrite,
//     usesNewSensorAutocomplete, _setWriteState, _recomputeTitle, _updateInteractivityClass.
//
// Persisted base config поля: serverId, sensor, sensorId, objectName, label,
// requireConfirmation, style. Subclass добавляет свои через
// parseActiveConfigFields/getActiveConfigFields — НЕ перекрывай serverId
// и не возвращай его из parseActiveConfigFields.
//
// Конкретные виджеты реализуются в файлах 61-dashboard-active-*.js и регистрируются
// в WIDGET_TYPES (62-dashboard-manager.js).
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
    // Orchestrator: проверяет UI guards (interactive + confirmation), затем
    // делегирует actual fetch в _doWrite().
    async writeValue(value) {
        if (!this.isInteractive()) return false;
        if (this.needsConfirmation() && !await this._confirm(value)) return false;
        return await this._doWrite(value);
    }

    // Actual fetch + writeState handling. БЕЗ interactive/confirm guards.
    // Используется напрямую активными widget'ами для release/OFF path,
    // где critical чтобы second POST дошёл даже если controlToken был
    // отозван между ON и OFF (push-button release, pulse trailing edge).
    // Валидирует только sensorId/serverId/objectName.
    async _doWrite(value) {
        this.commandValue = value;
        this._setWriteState('pending');

        // sensorId — числовой ID, должен быть резолвлен заранее (autocomplete сохраняет
        // его в config). config.sensor (имя) — fallback для smoke TestActiveWidget'а.
        const sensorId = this.config?.sensorId ?? this.config?.sensor;
        if (sensorId === undefined || sensorId === null || sensorId === '') {
            this._setWriteState('error', 'Sensor not configured');
            return false;
        }

        const serverId = this.config?.serverId ?? this._resolveServerId();
        if (!serverId) {
            this._setWriteState('error', 'No server configured');
            return false;
        }
        // Warn один раз на widget lifetime — legacy widget'ы могут писать N раз/сек
        // (generator) или сериями (push-button pulse), spam в console не нужен.
        if (!this.config?.serverId && !this._serverIdFallbackWarned) {
            this._serverIdFallbackWarned = true;
            console.warn(`Active widget ${this.id || '<unknown>'}: serverId missing in config, using fallback ${serverId} — config will be migrated on next dashboard load`);
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
                return false;
            }
            this._setWriteState('success');
            return true;
        } catch (e) {
            this._setWriteState('error', e.message);
            return false;
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
    // Also sets `disabled` attribute on all form controls within this.element —
    // native <input type=range> и <input type=text> игнорировали pointer-events:none
    // (можно было drag'ать slider клавиатурой/keyboard). disabled — гарантия.
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
        if (this.element) {
            const formEls = this.element.querySelectorAll('input, select, button, textarea');
            for (const el of formEls) {
                el.disabled = !interactive;
            }
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
        return getFirstConnectedServerId();
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
                    ${this.styles.map(s => `<option value="${escapeAttr(s)}" ${(config.style || this.defaultStyle) === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
                </select>
            </div>
            `
            : '';

        return `
            ${renderSensorBindingFields(config, { fieldPrefix: '' })}
            ${styleSelect}
            <div class="widget-config-field">
                <label>Label (optional)</label>
                <input type="text" class="widget-input" name="label"
                       value="${escapeAttr(config.label || '')}" placeholder="Leave empty to hide header">
            </div>
            <div class="widget-config-field">
                <label class="widget-checkbox-label">
                    <input type="checkbox" name="requireConfirmation"
                           ${config.requireConfirmation ? 'checked' : ''}>
                    <span>Require confirmation before write</span>
                </label>
            </div>
        ` + (this.getActiveConfigFields ? this.getActiveConfigFields(config) : '');
    }

    static getActiveConfigFields(config = {}) {
        // Override: дополнительные поля специфичные для виджета.
        return '';
    }

    static parseConfigForm(form) {
        const binding = parseSensorBindingFields(form, { fieldPrefix: '' });
        const base = {
            ...binding,
            label:      form.querySelector('[name="label"]')?.value || '',
            requireConfirmation: form.querySelector('[name="requireConfirmation"]')?.checked || false,
        };
        const styleEl = form.querySelector('[name="style"]');
        if (styleEl) base.style = styleEl.value;
        const extra = this.parseActiveConfigFields ? this.parseActiveConfigFields(form) : {};
        return { ...base, ...extra };
    }

    // IMPORTANT для subclass'ов: если переопределяешь — ОБЯЗАТЕЛЬНО вызывай
    // super.initConfigHandlers(form, config) ровно ОДИН РАЗ. Двойной вызов
    // навесит дублирующие listeners на sensor input и change на objectSelect.
    // Idempotency guard ниже защищает от случайного повторного вызова.
    static initConfigHandlers(form, config = {}) {
        if (form.dataset.activeHandlersWired === 'true') return;
        form.dataset.activeHandlersWired = 'true';
        initSensorBindingHandlers(form, config, { fieldPrefix: '' });
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
