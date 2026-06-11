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

    // === Color theming ===
    // Opt-in флаг. Subclass переопределяет в true чтобы участвовать в темизации.
    // Используется в следующих местах (по мере реализации):
    //  - _applyColorTheme() — применяет theme class и inline vars к container
    //    (реализовано здесь, Task 3 plan'а).
    //  - getConfigForm — conditional "Color theme" select (Task 7).
    //  - parseConfigForm — normalization colorTheme (Task 8).
    // Subclass'ы без CSS-поддержки --awc-* остаются false → нет нерабочего select'а.
    static supportsColorTheme = false;

    constructor(id, config, container) {
        super(id, config, container);
        this.commandValue = null;
        this.feedbackValue = null;
        this.feedbackMeta = null;  // { frozen, blocked } — статусные флаги датчика
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
    // meta — { frozen, blocked }. Subclass'ы которые игнорируют value (PushButton,
    // Generator) ВСЁ РАВНО должны обработать meta — frozen блокирует запись.
    // Используют _applyFeedbackMeta() без последующего renderFeedback().
    update(value, error = null, meta = null) {
        this.feedbackValue = value;
        this.value = value;
        this.error = error;
        this._applyFeedbackMeta(meta);
        this.renderFeedback();
    }

    // Сохранить meta и реактивно обновить interactivity если frozen-flag менялся.
    // Subclass'ы зовут это из своих override'ов update() (см. PushButton/Generator).
    _applyFeedbackMeta(meta) {
        const wasFrozen = this.isFrozen();
        this.feedbackMeta = meta || null;
        if (wasFrozen !== this.isFrozen()) {
            this._updateInteractivityClass();
        }
    }

    isFrozen() {
        return !!this.feedbackMeta?.frozen;
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
        const result = await this._postIoncSet(value);
        if (result.ok) {
            this._setWriteState('success');
            return true;
        }
        this._setWriteState('error', result.error);
        return false;
    }

    // Silent write — POST на ionc/set без _setWriteState/commandValue логики.
    // Используется генератором (per-tick) и подобными fire-and-forget сценариями,
    // где визуальный pending/success flash не нужен (или мешает). Caller сам
    // решает что делать с результатом (`{ ok, error }`).
    // Все sensorId/serverId/objectName проверки — те же, что в _doWrite.
    async _doWriteSilent(value) {
        return this._postIoncSet(value);
    }

    // Internal: чистый POST + validation (без UI side effects).
    // Возвращает `{ ok: true }` или `{ ok: false, error: string }`.
    async _postIoncSet(value) {
        // sensorId — числовой ID, должен быть резолвлен заранее (autocomplete сохраняет
        // его в config). config.sensor (имя) — fallback для smoke TestActiveWidget'а.
        const sensorId = this.config?.sensorId ?? this.config?.sensor;
        if (sensorId === undefined || sensorId === null || sensorId === '') {
            return { ok: false, error: 'Sensor not configured' };
        }

        const serverId = this.config?.serverId ?? this._resolveServerId();
        if (!serverId) {
            return { ok: false, error: 'No server configured' };
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
                return { ok: false, error: data.error || `HTTP ${resp.status}` };
            }
            return { ok: true };
        } catch (e) {
            return { ok: false, error: e.message };
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

    // ===== Edit-mode / control / frozen gating =====
    // Любой "не могу писать" → false. Источник конкретной причины — это уже
    // _recomputeTitle() и data-* атрибуты в _updateInteractivityClass().
    isInteractive() {
        if (typeof dashboardState !== 'undefined' && dashboardState.editMode) return false;
        if (typeof canControl === 'function' && !canControl()) return false;
        if (this.isFrozen()) return false;
        return true;
    }

    // Единая точка владения title. Приоритет:
    //   1. write error message (пока активен writeState='error')
    //   2. sensor frozen → 'Sensor is frozen — unfreeze to control'
    //   3. control-blocked / edit-mode → 'Take control to interact'
    //   4. пусто
    // Вызывается из _setWriteState и _updateInteractivityClass — так разные
    // источники не затирают друг друга и пользователь видит самое релевантное.
    _recomputeTitle() {
        const root = this.container;
        if (!root) return;
        if (this.writeState === 'error' && this._lastWriteMessage) {
            root.title = this._lastWriteMessage;
            return;
        }
        if (this.isFrozen()) {
            root.title = 'Sensor is frozen — unfreeze to control';
            return;
        }
        if (!this.isInteractive()) {
            root.title = 'Take control to interact';
            return;
        }
        root.removeAttribute('title');
    }

    // Toggles 'active-disabled' class и data-* attrs:
    //   - data-control-blocked="true" — edit mode / no controlToken (нейтральный grey)
    //   - data-frozen="true"          — sensor latched (icy/cyan + ❄ marker, см. CSS)
    // Раздельные attrs позволяют CSS показать причину разным цветом — оператору
    // видно «нет прав» vs «датчик заморожен». Native disabled гарантирует что
    // <input type=range>/<input type=text> не drag'аются клавиатурой.
    _updateInteractivityClass() {
        const root = this.container;
        if (!root) return;
        const interactive = this.isInteractive();
        const frozen = this.isFrozen();
        root.classList.toggle('active-disabled', !interactive);
        // data-frozen ставится независимо от других причин блокировки —
        // оператор должен видеть ❄ даже если ещё и controlToken отозван.
        if (frozen) {
            root.dataset.frozen = 'true';
        } else {
            delete root.dataset.frozen;
        }
        // data-control-blocked — только когда заблокирован НЕ из-за frozen
        // (иначе frozen marker и грей-control marker наслаиваются и сбивают).
        if (!interactive && !frozen) {
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

    // Применяет theme к this.container (а не this.element — для consistency со
    // статус-классами data-active-widget / active-success / active-error и т.п.,
    // которые тоже живут на container).
    //
    // Идемпотентен: чистит прошлое состояние перед установкой нового. Это load-bearing
    // для in-place reconfigure path (если будущая live preview перестанет делать full
    // re-render). При текущем full-rebuild через applyWidgetConfig (62-dashboard-manager.js)
    // container.className wipe'ится — но inline style.--awc-bg НЕ затрагивается,
    // поэтому removeProperty обязателен.
    _applyColorTheme() {
        if (!this.constructor.supportsColorTheme) return;
        const c = this.container;
        if (!c) return;

        // 1. Cleanup previous theme classes.
        Array.from(c.classList)
            .filter(cls => cls.startsWith('awc-theme-'))
            .forEach(cls => c.classList.remove(cls));

        // 2. Cleanup previous inline vars (для случая custom → preset / default).
        c.style.removeProperty('--awc-bg');
        c.style.removeProperty('--awc-fg');

        const theme = this.config?.colorTheme;
        const valid = theme === 'custom'
            || (theme && ACTIVE_WIDGET_THEME_NAMES.includes(theme));

        if (!valid) {
            delete c.dataset.colorTheme;
            return;
        }
        c.dataset.colorTheme = theme;

        if (theme === 'custom') {
            c.classList.add('awc-theme-custom');
            c.style.setProperty('--awc-bg',
                this.config.customBg || ACTIVE_WIDGET_CUSTOM_BG_DEFAULT);
            c.style.setProperty('--awc-fg',
                this.config.customFg || ACTIVE_WIDGET_CUSTOM_FG_DEFAULT);
        } else {
            c.classList.add(`awc-theme-${theme}`);
        }
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
