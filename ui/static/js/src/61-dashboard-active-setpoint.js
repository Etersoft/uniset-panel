// ============================================================================
// SetpointWidget — числовой задатчик для AI/AO датчиков.
//
// Семантика: пользователь вводит число в [min, max] с шагом step, посылается
// через POST .../ionc/set. Two-way: feedbackValue (от сервера) vs commandValue
// (что пользователь установил), расхождение → dirty state (жёлтая граница).
//
// Config:
//   sensor      — имя датчика (от base)
//   sensorId    — числовой ID (от base)
//   objectName  — IONC object (default 'SharedMemory', от base)
//   label       — заголовок виджета (от base)
//   min         — нижняя граница диапазона (default 0)
//   max         — верхняя граница (default 100)
//   step        — шаг изменения (default 1; влияет на stepper buttons и slider step)
//   unit        — текстовая подпись после value ("°C", "%", "Pa"; default '')
//   applyMode   — 'manual' (default) | 'auto'
//   style       — 'input' (default) | 'slider' | 'stepper'
//   requireConfirmation — bool (от base)
//
// Стили:
//   - 'input': текстовый input + Apply button (visible только в dirty state)
//   - 'slider': horizontal slider + value-label (с inline-edit) + min/max подписи
//   - 'stepper': '−' [value] '+' (auto-apply on click; inline-edit на value)
// ============================================================================

// SETPOINT_* константы — в 00-constants.js (общие дефолты, могут use'аться
// тестами и сторонним кодом).

class SetpointWidget extends ActiveDashboardWidget {
    static type = 'setpoint';
    static displayName = 'Setpoint';
    static description = 'Numeric setpoint (analog write) with input/slider/stepper styles';
    static icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="9" width="18" height="6" rx="1"/><path d="M7 9v6M12 9v6M17 9v6"/></svg>';
    static styles = ['input', 'slider', 'stepper'];
    static defaultStyle = 'input';
    static defaultSize = { width: 3, height: 2 };
    static minSize = { width: 2, height: 1 };
    static maxSize = { width: 6, height: 3 };

    constructor(id, config, container) {
        super(id, config, container);
        this._autoApplyTimer = null;
        // True после первого ручного ввода/clicka на +/- — после этого
        // renderFeedback больше не перезаписывает input.value на feedbackValue
        // (иначе после blur значение возвращалось бы на старое feedback).
        // Сбрасывается в _cancel() (Esc) — для resync с актуальным feedback.
        this._userHasEdited = false;
    }

    // Filter keydown в numeric input'ах: только цифры/знак/точка/запятая, плюс
    // пропуск Ctrl/Meta/Alt (Ctrl+C/V/A) и многосимвольных ключей (Backspace,
    // ArrowLeft и т.п.). Используется в _renderInput и в inline-edit (_makeInlineEditable).
    _filterNumericKey(e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key.length !== 1) return;
        if (!/[0-9.,\-]/.test(e.key)) e.preventDefault();
    }

    _currentStyle() {
        return this.config?.style || SetpointWidget.defaultStyle;
    }

    _applyMode() {
        return this.config?.applyMode || 'manual';
    }

    _clamp(value) {
        const min = this.config?.min ?? -Infinity;
        const max = this.config?.max ?? Infinity;
        return Math.max(min, Math.min(max, value));
    }

    // ===== Render dispatch =====
    render() {
        const style = this._currentStyle();
        this.element = document.createElement('div');
        this.element.className = `widget-content setpoint-widget setpoint-style-${style}`;
        // Tabindex=-1 чтобы widget мог принимать keyboard events (Esc), но не
        // попадал в Tab navigation. Esc на любом элементе виджета bubble'ится
        // и вызывает _cancel — работает для всех стилей (input/slider/stepper).
        this.element.tabIndex = -1;
        this.element.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.commandValue !== null) {
                e.preventDefault();
                e.stopPropagation();
                this._cancel();
            }
        });

        if (style === 'slider') {
            this._renderSlider();
        } else if (style === 'stepper') {
            this._renderStepper();
        } else {
            this._renderInput();
        }

        this.container.appendChild(this.element);
        // Initial display sync
        this.renderFeedback();
    }

    // ===== Style: input =====
    _renderInput() {
        const unit = escapeHtml(this.config?.unit || '');
        const min = this.config?.min ?? '';
        const max = this.config?.max ?? '';
        const step = this.config?.step ?? 1;
        // type="text" + inputmode=decimal — нативно нет spin buttons, нет
        // password-popup, и selection API работает (для select-on-focus).
        // Валидация только цифр — через keydown filter ниже + _clamp в JS.
        // autocomplete=off + data-form-type + data-lpignore — отключают browser
        // autocomplete и password manager хинты.
        this.element.innerHTML = `
            ${this._labelHtml()}
            <div class="setpoint-feedback" data-test="feedback"><strong data-test="feedback-value">--</strong>${unit ? '<span class="setpoint-unit">' + unit + '</span>' : ''}</div>
            <div class="setpoint-input-row">
                <input type="text" class="setpoint-input" data-test="value-input"
                       autocomplete="off" autocorrect="off" autocapitalize="off"
                       spellcheck="false" data-form-type="other" data-lpignore="true"
                       inputmode="decimal"
                       data-min="${escapeAttr(String(min))}" data-max="${escapeAttr(String(max))}" data-step="${escapeAttr(String(step))}">
                ${unit ? '<span class="setpoint-unit">' + unit + '</span>' : ''}
                <button class="setpoint-apply-btn" data-test="apply-btn" tabindex="-1">Apply</button>
                <button class="setpoint-cancel-btn" data-test="cancel-btn" title="Cancel" tabindex="-1">×</button>
            </div>
        `;

        const input = this.element.querySelector('[data-test="value-input"]');
        const applyBtn = this.element.querySelector('[data-test="apply-btn"]');
        const cancelBtn = this.element.querySelector('[data-test="cancel-btn"]');

        // Commit gesture: применить + снять focus + оптимистично убрать dirty
        // (если write fails — _setWriteState('error') покажет purple border).
        const commit = () => {
            this._applyNow();
            this.commandValue = null;
            this._updateDirty(false);
            input.blur();
        };

        // При получении фокуса (клик/Tab/программно) — выделить текущее значение,
        // чтобы новый ввод сразу его заменял. setTimeout(0) — после нативного
        // позиционирования cursor'а от mousedown'а.
        input.addEventListener('focus', () => {
            setTimeout(() => { try { input.select(); } catch {} }, 0);
        });
        input.addEventListener('input', () => {
            this._userHasEdited = true;
            const num = parseDecimalInputOrDefault(input.value, NaN);
            if (!Number.isFinite(num)) return;
            this._setCommand(num);
        });
        // Не пропускать буквы / 'e' (scientific) / '+' — оставлять только цифры,
        // знак минус, точку, запятую и навигационные клавиши.
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); commit(); return; }
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); input.blur(); this._cancel(); return; }
            this._filterNumericKey(e);
        });
        applyBtn.addEventListener('mousedown', (e) => e.preventDefault());
        cancelBtn.addEventListener('mousedown', (e) => e.preventDefault());
        applyBtn.addEventListener('click', (e) => { e.stopPropagation(); commit(); });
        cancelBtn.addEventListener('click', (e) => { e.stopPropagation(); input.blur(); this._cancel(); });
    }

    // ===== Style: slider =====
    _renderSlider() {
        const unit = escapeHtml(this.config?.unit || '');
        const min = this.config?.min ?? SETPOINT_DEFAULT_MIN;
        const max = this.config?.max ?? SETPOINT_DEFAULT_MAX;
        const step = this.config?.step ?? SETPOINT_DEFAULT_STEP;
        this.element.innerHTML = `
            ${this._labelHtml()}
            <div class="setpoint-slider-wrap">
                <div class="setpoint-slider-value-row">
                    <span class="setpoint-slider-value" data-test="value" title="Двойной клик — точный ввод">--</span>
                    ${unit ? '<span class="setpoint-unit">' + unit + '</span>' : ''}
                </div>
                <input type="range" class="setpoint-slider" data-test="slider"
                       min="${escapeHtml(String(min))}" max="${escapeHtml(String(max))}" step="${escapeHtml(String(step))}">
                <div class="setpoint-slider-labels">
                    <span>${escapeHtml(String(min))}</span>
                    <span>${escapeHtml(String(max))}</span>
                </div>
            </div>
        `;

        const slider = this.element.querySelector('[data-test="slider"]');
        const valueSpan = this.element.querySelector('[data-test="value"]');

        slider.addEventListener('input', () => {
            const num = Number(slider.value);
            this._setCommand(num);
            valueSpan.textContent = String(num);
        });
        // Manual mode: change (release) = trigger apply
        slider.addEventListener('change', () => {
            if (this._applyMode() === 'manual') {
                // В manual mode для slider apply при release (change event).
                // (Apply button + Cancel также видны для consistency с input style.)
                this._applyNow();
            }
        });
        this._makeInlineEditable(valueSpan);
    }

    // ===== Style: stepper =====
    _renderStepper() {
        const unit = escapeHtml(this.config?.unit || '');
        // Stepper не имеет Apply/Cancel кнопок — auto-apply on click +/- сразу
        // отправляет POST. × cancel был добавлен раньше но оказался лишним:
        // commandValue не «pending», команда уже ушла. Если оператор хочет
        // вернуться — кликает обратное направление +/-. Esc на widget element
        // всё ещё работает (через _cancel) — для случая когда юзер передумал
        // через keyboard.
        this.element.innerHTML = `
            ${this._labelHtml()}
            <div class="setpoint-feedback" data-test="feedback"><strong data-test="feedback-value">--</strong>${unit ? '<span class="setpoint-unit">' + unit + '</span>' : ''}</div>
            <div class="setpoint-stepper-row">
                <button class="setpoint-step-btn" data-test="step-down" tabindex="-1">−</button>
                <span class="setpoint-stepper-value" data-test="value" title="Двойной клик — точный ввод">--</span>
                <button class="setpoint-step-btn" data-test="step-up" tabindex="-1">+</button>
            </div>
        `;

        const stepDown = this.element.querySelector('[data-test="step-down"]');
        const stepUp = this.element.querySelector('[data-test="step-up"]');
        const valueSpan = this.element.querySelector('[data-test="value"]');
        const step = this.config?.step ?? 1;

        const stepBy = (delta, ev) => {
            if (ev) { ev.stopPropagation(); ev.preventDefault(); }
            if (!this.isInteractive()) return;
            const current = this.commandValue ?? this.feedbackValue ?? this.config?.min ?? SETPOINT_DEFAULT_MIN;
            const next = this._clamp(current + delta);
            this._setCommand(next);
            // Stepper всегда auto-apply (нет explicit Apply кнопки).
            this._applyNow();
        };
        // mousedown.preventDefault — не передавать фокус на button при клике
        // (focus border мерцал после каждого клика). Дополнительно blur() в click
        // — на Linux/Chrome preventDefault иногда пропускает фокус на 1 frame.
        stepDown.addEventListener('mousedown', (e) => e.preventDefault());
        stepUp.addEventListener('mousedown', (e) => e.preventDefault());
        stepDown.addEventListener('click', (e) => { stepBy(-step, e); stepDown.blur(); });
        stepUp.addEventListener('click', (e) => { stepBy(step, e); stepUp.blur(); });

        this._makeInlineEditable(valueSpan);
    }

    // Label header — рендерится сверху виджета, если config.label задан.
    _labelHtml() {
        const label = this.config?.label;
        if (!label) return '';
        return `<div class="setpoint-label" data-test="label">${escapeHtml(label)}</div>`;
    }

    // ===== Common: feedback rendering =====
    // Pure DOM update — НЕ делает auto-snap dirty (это в update() от SSE).
    // Иначе во время typing значение совпавшее с feedback автоматически
    // снимало dirty без Enter.
    renderFeedback() {
        if (!this.element) return;
        const fbValueEl = this.element.querySelector('[data-test="feedback-value"]');
        if (fbValueEl) {
            fbValueEl.textContent = (this.feedbackValue !== null && this.feedbackValue !== undefined)
                ? String(this.feedbackValue) : '--';
        }

        const style = this._currentStyle();
        if (style === 'input') {
            const input = this.element.querySelector('[data-test="value-input"]');
            // Initial sync: пока юзер ничего не вводил, input.value tracks feedback.
            // После первого ручного ввода — input.value под контролем юзера, feedback
            // отображается отдельно через [data-test="feedback-value"].
            if (input && !this._userHasEdited && document.activeElement !== input) {
                input.value = this.feedbackValue ?? '';
            }
        } else if (style === 'slider') {
            const slider = this.element.querySelector('[data-test="slider"]');
            const valueSpan = this.element.querySelector('[data-test="value"]');
            const display = this.commandValue ?? this.feedbackValue;
            if (slider && display !== null && display !== undefined && document.activeElement !== slider) {
                slider.value = display;
            }
            if (valueSpan) {
                valueSpan.textContent = (display !== null && display !== undefined) ? String(display) : '--';
            }
        } else { // stepper
            const valueSpan = this.element.querySelector('[data-test="value"]');
            const display = this.commandValue ?? this.feedbackValue;
            if (valueSpan) {
                valueSpan.textContent = (display !== null && display !== undefined) ? String(display) : '--';
            }
        }
    }

    // ===== SSE feedback override =====
    // Auto-snap dirty: если feedback догнал command (с tolerance step/2) → снять.
    // Делается ТОЛЬКО здесь (в update от SSE), не в renderFeedback — иначе во
    // время typing совпавшее с feedback значение автоматически апплаилось.
    update(value, error = null) {
        this.feedbackValue = value;
        this.value = value;
        this.error = error;
        if (this.commandValue !== null && this.commandValue !== undefined &&
            value !== null && value !== undefined) {
            const tolerance = Math.abs(this.config?.step ?? 1) / 2;
            if (Math.abs(this.commandValue - value) <= tolerance) {
                this.commandValue = null;
                this._updateDirty(false);
            }
        }
        this.renderFeedback();
    }

    renderCommand() {
        // No-op для setpoint (commandValue отображается через renderFeedback).
    }

    // ===== Apply flow =====
    _setCommand(value) {
        const clamped = this._clamp(value);
        this.commandValue = clamped;
        this._updateDirty(true);
        // Сразу обновить отображение (особенно для stepper — иначе value-span ждёт SSE).
        this.renderFeedback();
        if (this._applyMode() === 'auto') {
            clearTimeout(this._autoApplyTimer);
            this._autoApplyTimer = setTimeout(() => this._applyNow(), SETPOINT_AUTO_APPLY_DEBOUNCE_MS);
        }
    }

    _applyNow() {
        clearTimeout(this._autoApplyTimer);
        if (this.commandValue === null || this.commandValue === undefined) return;
        this.writeValue(this.commandValue);
    }

    _cancel() {
        clearTimeout(this._autoApplyTimer);
        this.commandValue = null;
        this._userHasEdited = false;  // resync с feedback
        this._updateDirty(false);
        this.renderFeedback();
    }

    _updateDirty(isDirty) {
        const root = this.element;
        if (!root) return;
        root.classList.toggle('dirty', !!isDirty);
    }

    // ===== Inline-edit helper =====
    _makeInlineEditable(spanEl) {
        spanEl.addEventListener('dblclick', () => {
            const currentValue = spanEl.textContent.trim();
            const input = document.createElement('input');
            input.type = 'text';  // type=text + inputmode=decimal — см. _renderInput
            input.className = 'setpoint-inline-edit';
            input.dataset.test = 'inline-input';
            input.autocomplete = 'off';
            input.autocorrect = 'off';
            input.autocapitalize = 'off';
            input.spellcheck = false;
            input.setAttribute('data-form-type', 'other');
            input.setAttribute('data-lpignore', 'true');
            input.setAttribute('inputmode', 'decimal');
            input.value = currentValue === '--' ? '' : currentValue;
            spanEl.replaceWith(input);
            input.select();

            let finished = false;
            const finish = (apply) => {
                if (finished) return;
                finished = true;
                if (apply) {
                    const num = parseDecimalInputOrDefault(input.value, NaN);
                    if (Number.isFinite(num)) {
                        this._setCommand(num);
                        // Inline-edit Enter/blur — explicit commit gesture; всегда apply
                        // независимо от applyMode (иначе slider+manual+inline → soft-lock).
                        this._applyNow();
                    }
                }
                input.replaceWith(spanEl);
                this.renderFeedback();  // обновить display
            };

            input.addEventListener('keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Enter') { e.preventDefault(); finish(true); return; }
                if (e.key === 'Escape') { e.preventDefault(); finish(false); return; }
                this._filterNumericKey(e);
            });
            input.addEventListener('blur', () => finish(true));
            // Stop click propagation, чтобы не открыть widget config dialog
            // через bubble на родителя.
            input.addEventListener('click', (e) => e.stopPropagation());
            input.addEventListener('dblclick', (e) => e.stopPropagation());
        });
    }

    // ===== Config form =====
    static getActiveConfigFields(config = {}) {
        const applyMode = config.applyMode || 'manual';
        return `
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>min</label>
                    <input type="number" class="widget-input" name="min"
                           value="${config.min ?? SETPOINT_DEFAULT_MIN}" data-test="cfg-min">
                </div>
                <div class="widget-config-field">
                    <label>max</label>
                    <input type="number" class="widget-input" name="max"
                           value="${config.max ?? SETPOINT_DEFAULT_MAX}" data-test="cfg-max">
                </div>
                <div class="widget-config-field">
                    <label>step</label>
                    <input type="number" class="widget-input" name="step"
                           value="${config.step ?? SETPOINT_DEFAULT_STEP}" min="0" data-test="cfg-step">
                </div>
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>Unit</label>
                    <input type="text" class="widget-input" name="unit"
                           value="${escapeAttr(config.unit || '')}" placeholder="°C, %, Pa..." data-test="cfg-unit">
                </div>
                <div class="widget-config-field">
                    <label>Apply mode</label>
                    <select class="widget-input" name="applyMode" data-test="cfg-applyMode">
                        <option value="manual" ${applyMode === 'manual' ? 'selected' : ''}>manual (Apply button)</option>
                        <option value="auto" ${applyMode === 'auto' ? 'selected' : ''}>auto (debounce ${SETPOINT_AUTO_APPLY_DEBOUNCE_MS}ms)</option>
                    </select>
                </div>
            </div>
        `;
    }

    static parseActiveConfigFields(form) {
        const min = parseDecimalInputOrDefault(form.querySelector('[name="min"]')?.value, SETPOINT_DEFAULT_MIN);
        const max = parseDecimalInputOrDefault(form.querySelector('[name="max"]')?.value, SETPOINT_DEFAULT_MAX);
        const stepRaw = parseDecimalInputOrDefault(form.querySelector('[name="step"]')?.value, SETPOINT_DEFAULT_STEP);
        const step = stepRaw > 0 ? stepRaw : SETPOINT_DEFAULT_STEP;
        return {
            min: Math.min(min, max),
            max: Math.max(min, max),
            step,
            unit:      form.querySelector('[name="unit"]')?.value || '',
            applyMode: form.querySelector('[name="applyMode"]')?.value || 'manual',
        };
    }

    destroy() {
        clearTimeout(this._autoApplyTimer);
        super.destroy();
    }
}

window.SetpointWidget = SetpointWidget;
