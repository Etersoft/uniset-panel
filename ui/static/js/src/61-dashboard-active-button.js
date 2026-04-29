// ============================================================================
// PushButtonWidget — write-only momentary/pulse кнопка для команд.
//
// Семантика отличается от toggle: нет двух-состоянного латча, нет feedback
// отображения (push-button — fire-and-forget команда). update() override
// в no-op (feedback игнорируется).
//
// Config:
//   sensor      — имя датчика (от base)
//   sensorId    — числовой ID (от base)
//   objectName  — IONC object (default 'SharedMemory', от base)
//   label       — подпись на кнопке (default = sensor name)
//   valueOn     — числовое значение «нажато» (default 1)
//   valueOff    — числовое значение «отпущено» (default 0)
//   mode        — 'pulse' (default) | 'momentary'
//   pulseWidth  — ms, длительность импульса для pulse режима (default 500)
//   style       — 'flat' (default) | 'mushroom' | 'pill'
//   requireConfirmation — bool (от base; в momentary НЕ работает, warning в форме)
// ============================================================================

class PushButtonWidget extends ActiveDashboardWidget {
    static type = 'pushbutton';
    static displayName = 'Push Button';
    static description = 'Momentary/pulse command button (write-only)';
    static icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4" fill="currentColor"/></svg>';
    static styles = ['flat', 'mushroom', 'pill'];
    static defaultStyle = 'flat';
    // Default — для flat (наиболее частый стиль). 2×1 был тесен: текст
    // вроде «STOP/EMERGENCY» налезал на края, оператору неудобно. 3×2 даёт
    // запас под надпись и читается как полноценная command button.
    static defaultSize = { width: 3, height: 2 };
    static minSize = { width: 2, height: 1 };
    static maxSize = { width: 6, height: 3 };

    // Style-aware default size — dashboard-manager.createWidget использует
    // этот helper при размещении нового виджета (если style уже выбран
    // в config), иначе fallback на static defaultSize.
    static getDefaultSizeForStyle(style) {
        if (style === 'mushroom') return { width: 3, height: 3 };
        if (style === 'pill')     return { width: 3, height: 1 };
        return { width: 3, height: 2 }; // flat
    }

    // === SSE feedback override — игнорируем (push-button fire-and-forget) ===
    update(value, error = null) {
        // Сохраняем поля для совместимости с base (writeState handlers могут читать),
        // но НЕ вызываем renderFeedback — push-button не визуализирует feedback своего
        // sensor'а (valueOn пролетает за миллисекунды и не несёт смысла оператору).
        this.feedbackValue = value;
        this.value = value;
        this.error = error;
    }

    _currentStyle() {
        return this.config?.style || PushButtonWidget.defaultStyle;
    }

    _currentMode() {
        return this.config?.mode || 'pulse';
    }

    // === Render ===
    render() {
        const style = this._currentStyle();
        const label = this.config?.label || this.config?.sensor || 'BUTTON';

        this.element = document.createElement('div');
        this.element.className = `widget-content pushbutton-widget pushbutton-style-${style}`;
        this.element.innerHTML = `<button class="pb-btn" data-test="btn">${escapeHtml(label)}</button>`;
        this.container.appendChild(this.element);

        const btn = this.element.querySelector('[data-test="btn"]');
        if (this._currentMode() === 'momentary') {
            this._bindMomentary(btn);
        } else {
            btn.addEventListener('click', () => this._onPulseClick());
        }
    }

    // === Pulse mode handler ===
    _onPulseClick() {
        if (!this.isInteractive()) return;
        const valueOn = this.config?.valueOn ?? 1;
        const valueOff = this.config?.valueOff ?? 0;
        const pulseWidth = this.config?.pulseWidth ?? 500;

        // Visual flash (300ms независимо от pulseWidth — это UI feedback).
        // Timer хранится на instance чтобы destroy() мог его отменить и не
        // снимать класс с уже удалённого DOM-узла.
        const btn = this.element?.querySelector('[data-test="btn"]');
        if (btn) {
            btn.classList.add('pulsing');
            clearTimeout(this._pulseFlashTimer);
            this._pulseFlashTimer = setTimeout(() => {
                this._pulseFlashTimer = null;
                btn?.classList.remove('pulsing');
            }, 300);
        }

        // POST valueOn → wait pulseWidth → POST valueOff.
        // Второй POST через _writeValueRaw чтобы не дублировать confirm dialog.
        // Trailing timer тоже на instance — destroy() отменяет его, чтобы не
        // дёргать _writeValueRaw на удалённом widget'е (safety OFF при destroy
        // оставляем ответственностью владельца, не побочным эффектом).
        this.writeValue(valueOn);
        clearTimeout(this._pulseTrailTimer);
        this._pulseTrailTimer = setTimeout(() => {
            this._pulseTrailTimer = null;
            this._writeValueRaw(valueOff);
        }, pulseWidth);
    }

    destroy() {
        clearTimeout(this._pulseFlashTimer);
        clearTimeout(this._pulseTrailTimer);
        this._pulseFlashTimer = null;
        this._pulseTrailTimer = null;
        super.destroy();
    }

    // === Momentary mode handler ===
    _bindMomentary(btn) {
        const valueOn = this.config?.valueOn ?? 1;
        const valueOff = this.config?.valueOff ?? 0;

        const onDown = (e) => {
            if (!this.isInteractive()) return;
            e.preventDefault();
            btn.classList.add('pressed');
            this.writeValue(valueOn);
            // Window-level listeners — гарантия release даже если мышь ушла за пределы кнопки.
            const onUp = () => {
                btn.classList.remove('pressed');
                this._writeValueRaw(valueOff);
                window.removeEventListener('mouseup', onUp);
                window.removeEventListener('touchend', onUp);
            };
            window.addEventListener('mouseup', onUp);
            window.addEventListener('touchend', onUp);
        };
        btn.addEventListener('mousedown', onDown);
        btn.addEventListener('touchstart', onDown);
    }

    // Release/OFF path для pulse trailing edge и momentary mouseup.
    // Вызывает _doWrite напрямую — пропускает isInteractive() и confirm.
    // Это критично: между нажатием (ON отправлен) и release пользователь мог
    // отдать controlToken, выйти из edit-mode и т.п. Если бы мы прошли через
    // writeValue() с её guard'ами, OFF не отправился бы → actuator завис в ON.
    // Server validation (sensorId/serverId/objectName) сохраняется внутри _doWrite.
    async _writeValueRaw(value) {
        await this._doWrite(value);
    }

    // Push-button doesn't visualize commandValue or feedbackValue — overrides пустые.
    renderCommand() { /* no-op */ }
    renderFeedback() { /* no-op */ }

    // === Config form ===
    static getActiveConfigFields(config = {}) {
        const mode = config.mode || 'pulse';
        return `
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>Mode</label>
                    <select class="widget-input" name="mode" data-test="cfg-mode">
                        <option value="pulse" ${mode === 'pulse' ? 'selected' : ''}>pulse</option>
                        <option value="momentary" ${mode === 'momentary' ? 'selected' : ''}>momentary</option>
                    </select>
                </div>
                <div class="widget-config-field" data-pulse-only style="display:${mode === 'pulse' ? '' : 'none'}">
                    <label>Pulse width (ms)</label>
                    <input type="number" class="widget-input" name="pulseWidth"
                           value="${config.pulseWidth ?? 500}" min="50" data-test="cfg-pulseWidth">
                </div>
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>valueOff</label>
                    <input type="number" class="widget-input" name="valueOff"
                           value="${config.valueOff ?? 0}" data-test="cfg-valueOff">
                </div>
                <div class="widget-config-field">
                    <label>valueOn</label>
                    <input type="number" class="widget-input" name="valueOn"
                           value="${config.valueOn ?? 1}" data-test="cfg-valueOn">
                </div>
            </div>
            <div class="widget-config-field" data-momentary-warning style="display:${mode === 'momentary' ? '' : 'none'}">
                <small style="color:#f59e0b">⚠ В momentary режиме requireConfirmation не работает (POST уйдёт без диалога).</small>
            </div>
        `;
    }

    static initConfigHandlers(form, config = {}) {
        super.initConfigHandlers(form, config);
        // Дополнительно: при смене mode показывать/скрывать pulseWidth field
        // (relevant только для pulse) + momentary warning.
        const modeSel = form.querySelector('[name="mode"]');
        const warning = form.querySelector('[data-momentary-warning]');
        const pulseField = form.querySelector('[data-pulse-only]');
        if (!modeSel) return;
        const update = () => {
            const isMomentary = modeSel.value === 'momentary';
            if (warning)    warning.style.display    = isMomentary ? '' : 'none';
            if (pulseField) pulseField.style.display = isMomentary ? 'none' : '';
        };
        modeSel.addEventListener('change', update);
        update();
    }

    static parseActiveConfigFields(form) {
        const pulseRaw = parseInt(form.querySelector('[name="pulseWidth"]')?.value, 10);
        // pulseWidth: clamp к [50, ∞) — html min=50 это hint, не enforcement.
        // Number.isFinite check вместо `|| 500` — иначе pulseWidth=0 неправильно
        // парсится как 500 (falsy-zero).
        const pulseWidth = Number.isFinite(pulseRaw) ? Math.max(50, pulseRaw) : 500;
        return {
            mode:       form.querySelector('[name="mode"]')?.value || 'pulse',
            pulseWidth,
            valueOff:   Number(form.querySelector('[name="valueOff"]')?.value ?? 0),
            valueOn:    Number(form.querySelector('[name="valueOn"]')?.value ?? 1),
        };
    }
}

window.PushButtonWidget = PushButtonWidget;
