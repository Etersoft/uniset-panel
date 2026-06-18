// ============================================================================
// ToggleWidget — переключатель между двумя числовыми значениями (DI/DO/AI/AO).
// Слитая композиция: цвет track = feedback, позиция handle = command.
// Жёлтая граница при расхождении command vs feedback.
//
// Config:
//   sensor      — имя датчика (для отображения, autocomplete сохраняет имя)
//   sensorId    — числовой ID датчика (используется в writeValue)
//   objectName  — имя IONC-объекта (default 'SharedMemory')
//   valueOff    — числовое значение OFF (default 0)
//   valueOn     — числовое значение ON (default 1)
//   labelOff    — текстовая подпись OFF (default 'OFF')
//   labelOn     — текстовая подпись ON (default 'ON')
//   label       — заголовок виджета (default = имя датчика)
//   requireConfirmation — bool, наследуется от base
// ============================================================================

class ToggleWidget extends ActiveDashboardWidget {
    static type = 'toggle';
    static displayName = 'Toggle';
    static description = 'Two-state switch (writes to digital or analog sensor)';
    static icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="10" rx="5"/><circle cx="16" cy="12" r="3" fill="currentColor"/></svg>';
    static defaultSize = { width: 3, height: 2 };
    static minSize = { width: 2, height: 2 };
    static maxSize = { width: 6, height: 3 };

    // Доступные визуальные стили. base.getConfigForm рендерит style select
    // когда length > 1.
    static styles = ['slider', 'checkbox', 'button', 'round'];
    static defaultStyle = 'slider';

    static supportsColorTheme = true;

    // Style-aware default size — для round плотнее (2×2 ≈ touch-friendly icon),
    // для button/slider/checkbox используем static defaultSize (3×2).
    static getDefaultSizeForStyle(style) {
        if (style === 'round') return { width: 2, height: 2 };
        return undefined;
    }

    // === Render ===
    render() {
        const style = this._currentStyle();
        // Inline --awc-led ставим ТОЛЬКО для button и round style с не-дефолтным ledColor.
        // Иначе CSS использует fallback var(--awc-led, #fde047). Нормализуем
        // case + валидируем hex (защита от вручную правленых JSON / legacy
        // экспортов с uppercase).
        const ledRaw = typeof this.config?.ledColor === 'string'
            ? this.config.ledColor.toLowerCase()
            : null;
        if ((style === 'button' || style === 'round')
            && ledRaw
            && HEX_COLOR_REGEX.test(ledRaw)
            && ledRaw !== TOGGLE_BUTTON_LED_DEFAULT) {
            this.container.style.setProperty('--awc-led', ledRaw);
        } else {
            this.container.style.removeProperty('--awc-led');
        }
        if (style === 'checkbox') {
            this.renderCheckbox();
        } else if (style === 'button') {
            this.renderButton();
        } else if (style === 'round') {
            this.renderRound();
        } else {
            this.renderSlider();
        }
        this._applyColorTheme();
    }

    _currentStyle() {
        return this.config?.style || ToggleWidget.defaultStyle;
    }

    renderSlider() {
        // Label опционален: если пустой — НЕ показываем header строку, экономим
        // вертикальный pixel'аж. Fallback на sensor name удалён намеренно
        // (старое поведение «не задал label → имя датчика» путало юзеров,
        // которые специально хотели чистый виджет).
        const label = this.config?.label || '';
        const labelHtml = label
            ? `<div class="toggle-name" data-test="name">${escapeHtml(label)}</div>`
            : '';
        this.element = document.createElement('div');
        this.element.className = 'widget-content toggle-widget toggle-style-slider';
        this.element.innerHTML = `
            ${labelHtml}
            <div class="toggle-track" data-test="track" data-handle-pos="left">
                <div class="toggle-handle"></div>
            </div>
            <div class="toggle-state-text" data-test="state-text">${escapeHtml(this._currentLabel())}</div>
        `;
        this.container.appendChild(this.element);
        this.element.querySelector('[data-test="track"]').addEventListener('click', () => this.onClick());

        // Initial state — отрисовать по текущим feedback/command.
        this.renderFeedback();
        this.renderCommand();
    }

    renderCheckbox() {
        // Label опционален. См. комментарий в renderSlider().
        const label = this.config?.label || '';
        const labelHtml = label
            ? `<div class="toggle-name" data-test="name">${escapeHtml(label)}</div>`
            : '';
        this.element = document.createElement('div');
        this.element.className = 'widget-content toggle-widget toggle-style-checkbox';
        this.element.innerHTML = `
            <div class="toggle-cb" data-test="cb"></div>
            ${labelHtml}
        `;
        this.container.appendChild(this.element);
        // Click anywhere on widget triggers writeValue (standard checkbox UX).
        this.element.addEventListener('click', () => this.onClick());

        this.renderFeedback();
        this.renderCommand();
    }

    // Возвращает labelOn если current value считается ON, иначе labelOff.
    _currentLabel() {
        const labelOff = this.config?.labelOff || 'OFF';
        const labelOn = this.config?.labelOn || 'ON';
        const valueOn = this.config?.valueOn ?? 1;
        const current = this.commandValue ?? this.feedbackValue;
        return current === valueOn ? labelOn : labelOff;
    }

    onClick() {
        // Если widget не интерактивен — клик игнорируется (writeValue сам это знает,
        // но мы ещё не проходим path validation если просто вернём ничего).
        if (!this.isInteractive()) return;
        const valueOff = this.config?.valueOff ?? 0;
        const valueOn = this.config?.valueOn ?? 1;
        const current = this.commandValue ?? this.feedbackValue;
        const next = current === valueOn ? valueOff : valueOn;
        this.writeValue(next);
    }

    renderCommand() {
        const style = this._currentStyle();
        if (style === 'checkbox') {
            this.renderCheckboxCommand();
        } else if (style === 'button') {
            this.renderButtonCommand();
        } else if (style === 'round') {
            this.renderRoundCommand();
        } else {
            this.renderSliderCommand();
        }
    }

    renderSliderCommand() {
        const track = this.element?.querySelector('[data-test="track"]');
        if (!track) return;
        const valueOn = this.config?.valueOn ?? 1;
        const refValue = this.commandValue ?? this.feedbackValue;
        track.dataset.handlePos = refValue === valueOn ? 'right' : 'left';
        const diverges = this.commandValue !== null
            && this.commandValue !== undefined
            && this.commandValue !== this.feedbackValue;
        track.classList.toggle('diverge', !!diverges);
        const stateText = this.element?.querySelector('[data-test="state-text"]');
        if (stateText) stateText.textContent = this._currentLabel();
    }

    renderCheckboxCommand() {
        // diverge применяется к корневому .toggle-widget (yellow box-shadow вокруг
        // всего widget'а лучше читается чем вокруг 24px чекбокса).
        const root = this.element;
        if (!root) return;
        const diverges = this.commandValue !== null
            && this.commandValue !== undefined
            && this.commandValue !== this.feedbackValue;
        root.classList.toggle('diverge', !!diverges);
    }

    renderFeedback() {
        const style = this._currentStyle();
        if (style === 'checkbox') {
            this.renderCheckboxFeedback();
        } else if (style === 'button') {
            this.renderButtonFeedback();
        } else if (style === 'round') {
            this.renderRoundFeedback();
        } else {
            this.renderSliderFeedback();
        }
    }

    renderSliderFeedback() {
        const track = this.element?.querySelector('[data-test="track"]');
        if (!track) return;
        const valueOff = this.config?.valueOff ?? 0;
        const valueOn = this.config?.valueOn ?? 1;
        track.classList.remove('fb-on', 'fb-off', 'fb-unknown');
        if (this.feedbackValue === valueOn) {
            track.classList.add('fb-on');
        } else if (this.feedbackValue === valueOff) {
            track.classList.add('fb-off');
        } else {
            track.classList.add('fb-unknown');
        }
        if (this.feedbackValue !== null && this.feedbackValue !== undefined) {
            track.title = `actual: ${this.feedbackValue}`;
        }
        this.renderCommand();
    }

    renderCheckboxFeedback() {
        const cb = this.element?.querySelector('[data-test="cb"]');
        if (!cb) return;
        const valueOff = this.config?.valueOff ?? 0;
        const valueOn = this.config?.valueOn ?? 1;
        cb.classList.remove('fb-on', 'fb-off', 'fb-unknown');
        if (this.feedbackValue === valueOn) {
            cb.classList.add('fb-on');
        } else if (this.feedbackValue === valueOff) {
            cb.classList.add('fb-off');
        } else {
            cb.classList.add('fb-unknown');
        }
        if (this.feedbackValue !== null && this.feedbackValue !== undefined) {
            cb.title = `actual: ${this.feedbackValue}`;
        }
        this.renderCommand();
    }

    // === Button style ===

    renderButton() {
        const label = this._resolveButtonLabel();
        this.element = document.createElement('div');
        this.element.className = 'widget-content toggle-widget toggle-style-button';
        this.element.innerHTML = `
            <button class="toggle-btn" data-test="btn" data-state="off" type="button">${escapeHtml(label)}</button>
        `;
        this.container.appendChild(this.element);
        const btnEl = this.element.querySelector('[data-test="btn"]');
        btnEl.addEventListener('click', () => this.onClick());

        this.renderFeedback();
        this.renderCommand();
    }

    renderButtonCommand() {
        // diverge применяется к корневому .toggle-widget (рамка вокруг кнопки
        // лучше читается чем border-color на самой кнопке — конфликт с темами).
        const root = this.element;
        if (!root) return;
        const diverges = this.commandValue !== null
            && this.commandValue !== undefined
            && this.commandValue !== this.feedbackValue;
        root.classList.toggle('diverge', !!diverges);

        // Когда оператор кликнул — label должен сразу показать новое состояние
        // (commandValue опережает feedbackValue).
        const btn = root.querySelector('[data-test="btn"]');
        if (btn) btn.textContent = this._resolveButtonLabel();
    }

    renderButtonFeedback() {
        const btn = this.element?.querySelector('[data-test="btn"]');
        if (!btn) return;
        const valueOn = this.config?.valueOn ?? 1;
        btn.dataset.state = (this.feedbackValue === valueOn) ? 'on' : 'off';
        // Перерисовать label — fallback chain зависит от feedbackValue.
        btn.textContent = this._resolveButtonLabel();
        if (this.feedbackValue !== null && this.feedbackValue !== undefined) {
            btn.title = `actual: ${this.feedbackValue}`;
        }
        // Sync divergence — паттерн slider/checkbox feedback. Иначе после
        // внешнего update() (SSE → renderFeedback) .diverge остаётся stale.
        this.renderCommand();
    }

    // === Round style ===

    renderRound() {
        const label = this._resolveButtonLabel();
        this.element = document.createElement('div');
        this.element.className = 'widget-content toggle-widget toggle-style-round';
        this.element.innerHTML = `
            <button class="toggle-btn" data-test="btn" data-state="off" type="button">${escapeHtml(label)}</button>
        `;
        this.container.appendChild(this.element);
        const btnEl = this.element.querySelector('[data-test="btn"]');
        btnEl.addEventListener('click', () => this.onClick());

        this.renderFeedback();
        this.renderCommand();
    }

    renderRoundCommand() {
        // diverge применяется к корневому .toggle-widget (рамка вокруг круга
        // лучше читается чем border на самой кнопке — конфликт с темами).
        const root = this.element;
        if (!root) return;
        const diverges = this.commandValue !== null
            && this.commandValue !== undefined
            && this.commandValue !== this.feedbackValue;
        root.classList.toggle('diverge', !!diverges);

        // Label должен сразу показать новое состояние при click (commandValue
        // опережает feedbackValue в pending window).
        const btn = root.querySelector('[data-test="btn"]');
        if (btn) btn.textContent = this._resolveButtonLabel();
    }

    renderRoundFeedback() {
        const btn = this.element?.querySelector('[data-test="btn"]');
        if (!btn) return;
        const valueOn = this.config?.valueOn ?? 1;
        btn.dataset.state = (this.feedbackValue === valueOn) ? 'on' : 'off';
        btn.textContent = this._resolveButtonLabel();
        if (this.feedbackValue !== null && this.feedbackValue !== undefined) {
            btn.title = `actual: ${this.feedbackValue}`;
        }
        // Sync divergence — иначе после SSE update остаётся stale (паттерн из
        // button feedback'а).
        this.renderCommand();
    }

    _resolveButtonLabel() {
        // Fallback chain:
        // 1) config.label если непустой
        // 2) labelOn/labelOff по текущему value (как в slider style)
        // 3) '—' — никогда полностью пустая кликабельная зона
        if (this.config?.label) return this.config.label;
        const labelOff = this.config?.labelOff || '';
        const labelOn = this.config?.labelOn || '';
        const valueOn = this.config?.valueOn ?? 1;
        const current = this.commandValue ?? this.feedbackValue;
        const stateLabel = current === valueOn ? labelOn : labelOff;
        return stateLabel || '—';
    }

    // === Config form ===

    static getActiveConfigFields(config = {}) {
        const ledColor = config.ledColor || TOGGLE_BUTTON_LED_DEFAULT;
        const style = config.style || ToggleWidget.defaultStyle;
        const usesLed = (style === 'button' || style === 'round');
        const ledRowStyle = usesLed ? '' : 'display: none;';
        return `
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
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>labelOff</label>
                    <input type="text" class="widget-input" name="labelOff"
                           value="${escapeAttr(config.labelOff || '')}" placeholder="OFF" data-test="cfg-labelOff">
                </div>
                <div class="widget-config-field">
                    <label>labelOn</label>
                    <input type="text" class="widget-input" name="labelOn"
                           value="${escapeAttr(config.labelOn || '')}" placeholder="ON" data-test="cfg-labelOn">
                </div>
            </div>
            <div class="widget-config-row" data-button-style-row style="${ledRowStyle}">
                <div class="widget-config-field">
                    <label>LED color (button / round styles)</label>
                    <input type="color" class="widget-input" name="ledColor"
                           value="${ledColor}" data-test="cfg-ledColor">
                </div>
            </div>
        `;
    }

    static initConfigHandlers(form, config) {
        super.initConfigHandlers(form, config);
        if (form.dataset.toggleButtonStyleHandlersWired === 'true') return;
        form.dataset.toggleButtonStyleHandlersWired = 'true';

        const styleSelect = form.querySelector('[name="style"]');
        const ledRow = form.querySelector('[data-button-style-row]');
        if (!styleSelect || !ledRow) return;

        styleSelect.addEventListener('change', () => {
            const v = styleSelect.value;
            ledRow.style.display = (v === 'button' || v === 'round') ? '' : 'none';
        });
    }

    static parseActiveConfigFields(form) {
        const valueOff = Number(form.querySelector('[name="valueOff"]')?.value ?? 0);
        let valueOn = Number(form.querySelector('[name="valueOn"]')?.value ?? 1);
        // Защита от degenerate config: valueOff === valueOn делает click no-op
        // (current===valueOn?valueOff:valueOn возвращает valueOn). Если совпали,
        // принудительно ставим valueOn = valueOff + 1, чтобы toggle хотя бы что-то делал.
        if (valueOn === valueOff) {
            valueOn = valueOff + 1;
        }
        const out = {
            valueOff,
            valueOn,
            labelOff: form.querySelector('[name="labelOff"]')?.value || '',
            labelOn:  form.querySelector('[name="labelOn"]')?.value || '',
        };

        // ledColor: только при style='button' OR 'round', sparse (default не пишем).
        const style = form.querySelector('[name="style"]')?.value || ToggleWidget.defaultStyle;
        if (style === 'button' || style === 'round') {
            const raw = (form.querySelector('[name="ledColor"]')?.value || '').toLowerCase();
            if (HEX_COLOR_REGEX.test(raw) && raw !== TOGGLE_BUTTON_LED_DEFAULT) {
                out.ledColor = raw;
            }
        }
        return out;
    }
}

window.ToggleWidget = ToggleWidget;
