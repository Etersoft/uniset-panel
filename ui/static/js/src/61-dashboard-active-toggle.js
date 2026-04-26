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
    static styles = ['slider', 'checkbox'];
    static defaultStyle = 'slider';

    // === Render ===
    render() {
        if (this._currentStyle() === 'checkbox') {
            this.renderCheckbox();
        } else {
            this.renderSlider();
        }
    }

    _currentStyle() {
        return this.config?.style || ToggleWidget.defaultStyle;
    }

    renderSlider() {
        const label = this.config?.label || this.config?.sensor || 'Toggle';
        this.element = document.createElement('div');
        this.element.className = 'widget-content toggle-widget toggle-style-slider';
        this.element.innerHTML = `
            <div class="toggle-name" data-test="name">${escapeHtml(label)}</div>
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
        const label = this.config?.label || this.config?.sensor || 'Toggle';
        this.element = document.createElement('div');
        this.element.className = 'widget-content toggle-widget toggle-style-checkbox';
        this.element.innerHTML = `
            <div class="toggle-cb" data-test="cb"></div>
            <div class="toggle-name" data-test="name">${escapeHtml(label)}</div>
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
        const current = this.commandValue ?? this.feedbackValue;
        return current === this.config?.valueOn ? labelOn : labelOff;
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
        if (this._currentStyle() === 'checkbox') {
            this.renderCheckboxCommand();
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
        if (this._currentStyle() === 'checkbox') {
            this.renderCheckboxFeedback();
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

    // === Config form ===

    static getActiveConfigFields(config = {}) {
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
                           value="${escapeHtml(config.labelOff || '')}" placeholder="OFF" data-test="cfg-labelOff">
                </div>
                <div class="widget-config-field">
                    <label>labelOn</label>
                    <input type="text" class="widget-input" name="labelOn"
                           value="${escapeHtml(config.labelOn || '')}" placeholder="ON" data-test="cfg-labelOn">
                </div>
            </div>
        `;
    }

    static parseActiveConfigFields(form) {
        return {
            valueOff: Number(form.querySelector('[name="valueOff"]')?.value ?? 0),
            valueOn:  Number(form.querySelector('[name="valueOn"]')?.value ?? 1),
            labelOff: form.querySelector('[name="labelOff"]')?.value || '',
            labelOn:  form.querySelector('[name="labelOn"]')?.value || '',
        };
    }
}

window.ToggleWidget = ToggleWidget;
