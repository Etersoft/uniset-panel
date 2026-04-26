# Dashboard Active Setpoint — Design

**Дата:** 2026-04-26
**Ветка:** `story/dashboard-active-controls` (та же, что foundation+toggle+checkbox+pushbutton)
**Foundation spec:** `2026-04-26-dashboard-active-controls-design.md`
**Предшествуют:** toggle, checkbox-style, push-button design'ы
**Статус:** Draft → ожидает review

## Контекст

Foundation + ToggleWidget (+ checkbox style) + PushButtonWidget готовы. Четвёртый active widget — **SetpointWidget**: числовой задатчик для AI/AO датчиков. Семантически отличается от toggle (не двух-состоянное переключение, а произвольное число в диапазоне) и от push-button (две-direction read+write). Использует уже доказанный foundation.

## Цели

- Реализовать `SetpointWidget extends ActiveDashboardWidget` — числовой задатчик с произвольным значением в `[min, max]` с шагом `step`.
- Поддержать **3 визуальных стиля** через `static styles`:
  - `'input'` (default) — текстовый input + Apply кнопка
  - `'slider'` — slider + value-label с inline edit + min/max подписи
  - `'stepper'` — кнопки `−` / `+` со стажем + value-label с inline edit
- Поддержать **2 apply mode** через `config.applyMode`:
  - `'manual'` (default) — пользователь явно жмёт Apply (или Enter); до того value «dirty» (жёлтая граница)
  - `'auto'` — debounce 500ms на change → автоотправка
- Реализовать **inline-edit value** (общий helper) — двойной клик на любом display'e value превращает его в input на месте; Enter apply, Esc cancel.
- **Two-way binding**: показывать `feedbackValue` (что вернул сервер) **и** `commandValue` (что пользователь установил, до Apply); расхождение визуализируется dirty-state.
- Использовать готовый foundation базовый класс — никаких изменений base не требуется.

## Не-цели

- НЕ реализуем style `'knob'` (поворотная ручка) — отдельная future задача.
- НЕ реализуем style `'combo'` (slider + input одновременно из вариант D исходного брейнсторма) — пользователь явно выбрал «B+D объединить» в виде single slider style с inline-edit.
- НЕ менять base class (он уже подготовлен).
- НЕ показывать units pickup из IONC sensor metadata автоматически — `config.unit` опционально пользовательский (например «°C», «%», «Pa»).

## Принятые решения

### Стили и Apply

| Решение | Выбор | Обоснование |
|---|---|---|
| Архитектура | Отдельный класс `SetpointWidget extends ActiveDashboardWidget` | Семантика «непрерывное число» отличается от toggle/pushbutton |
| `static styles` | `['input', 'slider', 'stepper']` | Базовый набор; покрывает 90% use cases (точный ввод / визуальная шкала / discrete steps) |
| `defaultStyle` | `'input'` | Минимально-инвазивный, безопасный для precision values |
| Apply mode | `config.applyMode: 'manual' (default) \| 'auto'` | Manual safer для пользователя, auto для real-time tuning |
| Apply manual UI | Apply button + Cancel (×) рядом с input/value, видимы только когда dirty | Compact, не загромождает widget когда нет изменений |
| Apply auto debounce | 500ms | Достаточно для пользовательского typing pause; быстрее даёт ложные intermediate sends |
| Inline-edit | Общий helper для всех стилей: double-click → input → Enter/Esc | Consistency между стилями, точный ввод доступен везде |
| Validation source | `config.min`, `config.max`, `config.step` | Из конфига widget'а (как у toggle valueOff/valueOn) — не зависит от IONC iolimit |
| Validation behavior | Out-of-range значения **обрезаются** (clamp) до min/max | Безопаснее чем reject (пользователь видит почему) |

### Состояния

| Состояние | Внешний вид |
|---|---|
| `idle` | Display feedbackValue (или valueOff если null), no dirty highlight |
| `dirty` (cmd != fb, Apply ещё не нажат / debounce ещё не истёк) | Жёлтая граница вокруг input/value, видны Apply + Cancel |
| `pending` | opacity 0.7 + grayscale (стандарт base) |
| `error` | Красная граница (стандарт base) + tooltip с error message |
| `disabled` | opacity 0.6, cursor:not-allowed, content pointer-events:none (стандарт base) |
| Inline edit active | Inline input с жёлтой границей, фокус, value pre-selected |

### Inline-edit helper

Единая функция-фабрика, превращающая любой `<span>` в редактируемое поле:

```javascript
makeInlineEditable(spanEl, {
    initialValue,         // current display value
    min, max, step,       // validation
    onApply(numericValue) // callback after Enter / blur (если автоapply)
})
```

Применяется на:
- Stepper: `.setpoint-stepper-value`
- Slider: `.setpoint-slider-value`
- Input style — **не нужен** (уже input)

Helper кладём в **сам файл setpoint widget** (не в base, потому что только setpoint её использует). Если потребуется setpoint-style для toggle/checkbox в будущем — поднимем.

### Two-way visualization

| Случай | Display |
|---|---|
| `commandValue === null` (не редактировал) | Показываем `feedbackValue`. Никаких dirty highlights. |
| `commandValue !== null` && `commandValue === feedbackValue` | Показываем `commandValue`. Не dirty (apply прошёл и feedback подтянулся). |
| `commandValue !== null` && `commandValue !== feedbackValue` | Показываем `commandValue` + dirty highlight + (для manual) кнопка Apply / Cancel. |
| `feedbackValue === null` (datasensor не успел ответить) | Показываем `commandValue ?? config.valueOff ?? config.min` |

После успешного `writeValue` (writeState=success), `commandValue` остаётся равной отправленному. Когда SSE feedback догоняет (feedback=command) — dirty снимается автоматически. Если feedback так и не пришёл (PLC не ответил) — `_pendingTimeoutTimer` (5s) переведёт в error state.

## Архитектура

### Frontend

**Новые файлы:**

| Файл | Назначение |
|---|---|
| `ui/static/js/src/61-dashboard-active-setpoint.js` | `SetpointWidget extends ActiveDashboardWidget` + inline-edit helper |
| `tests/single/dashboard-active-setpoint.spec.ts` | E2E (~8 сценариев: 3 стиля × render, manual Apply, auto debounce, inline edit, validation clamp, custom unit, edit-mode block) |

**Модифицируемые файлы:**

| Файл | Изменение |
|---|---|
| `ui/static/js/src/62-dashboard-manager.js` | Регистрация `'setpoint': SetpointWidget` в WIDGET_TYPES (count 11 → 12) |
| `ui/static/css/style.css` | `.setpoint-widget` + `.setpoint-style-input/slider/stepper` + `.dirty` state + inline-edit styles |
| `tests/single/dashboard-widgets.spec.ts` | Update widget picker count: 11 → 12; добавить `'setpoint'` в WIDGET_TYPES const |
| `CLAUDE.md` | Active widgets section — добавить параграф про SetpointWidget |

### `SetpointWidget` — контракт

```javascript
class SetpointWidget extends ActiveDashboardWidget {
    static type = 'setpoint';
    static displayName = 'Setpoint';
    static description = 'Numeric setpoint (analog write) with input/slider/stepper styles';
    static icon = '<svg ...>'; // numeric input or slider
    static styles = ['input', 'slider', 'stepper'];
    static defaultStyle = 'input';
    static defaultSize = { width: 3, height: 2 };
    static minSize = { width: 2, height: 1 };
    static maxSize = { width: 6, height: 3 };

    constructor(id, config, container) {
        super(id, config, container);
        this._autoApplyTimer = null;  // debounce timer для applyMode='auto'
    }

    _currentStyle() {
        return this.config?.style || SetpointWidget.defaultStyle;
    }

    _applyMode() {
        return this.config?.applyMode || 'manual';
    }

    // ===== Render dispatch =====
    render() {
        const style = this._currentStyle();
        this.element = document.createElement('div');
        this.element.className = `widget-content setpoint-widget setpoint-style-${style}`;

        if (style === 'slider') this._renderSlider();
        else if (style === 'stepper') this._renderStepper();
        else this._renderInput();  // default

        this.container.appendChild(this.element);
        this.renderFeedback();  // initial state
    }

    // ===== Style: input =====
    _renderInput() {
        // <div class="setpoint-input-wrap">
        //   <div class="setpoint-feedback" data-test="feedback">--</div>
        //   <div class="setpoint-input-row">
        //     <input class="setpoint-input" data-test="value-input" type="number" min={min} max={max} step={step}>
        //     <span class="setpoint-unit">{config.unit || ''}</span>
        //     <button class="setpoint-apply-btn" data-test="apply-btn">Apply</button>
        //     <button class="setpoint-cancel-btn" data-test="cancel-btn">×</button>
        //   </div>
        // </div>
        // Listeners:
        //   input.onchange → mark dirty + (auto: debounce → apply)
        //   apply.onclick / Enter → apply
        //   cancel.onclick / Esc → reset to feedback
    }

    // ===== Style: slider =====
    _renderSlider() {
        // <div class="setpoint-slider-wrap">
        //   <div class="setpoint-slider-value-row">
        //     <span class="setpoint-slider-value" data-test="value">--</span>
        //     <span class="setpoint-unit">{config.unit || ''}</span>
        //   </div>
        //   <input type="range" class="setpoint-slider" data-test="slider" min={min} max={max} step={step}>
        //   <div class="setpoint-slider-labels"><span>{min}</span><span>{max}</span></div>
        // </div>
        // Listeners:
        //   slider.oninput → command update + dirty highlight + (auto: debounce → apply)
        //   makeInlineEditable(value-span, ...) → enables double-click → inline input
    }

    // ===== Style: stepper =====
    _renderStepper() {
        // <div class="setpoint-stepper-wrap">
        //   <div class="setpoint-feedback" data-test="feedback">--</div>
        //   <div class="setpoint-stepper-row">
        //     <button class="setpoint-step-btn" data-test="step-down">−</button>
        //     <span class="setpoint-stepper-value" data-test="value">--</span>
        //     <button class="setpoint-step-btn" data-test="step-up">+</button>
        //   </div>
        //   <span class="setpoint-unit">{config.unit || ''}</span>
        // </div>
        // Listeners:
        //   step-down.onclick → command -= step → apply
        //   step-up.onclick → command += step → apply
        //   makeInlineEditable(value-span, ...) → enables double-click → inline input
        // NOTE: stepper всегда auto-apply (нет «dirty» state — каждое нажатие сразу шлёт).
    }

    // ===== Common: feedback rendering =====
    renderFeedback() {
        // Update data-test=feedback span с feedbackValue (если есть).
        // Если commandValue !== null && commandValue !== feedbackValue → пометить dirty.
        // Если совпало (apply догнал) — снять dirty + reset commandValue=null.
    }

    renderCommand() {
        // No-op для setpoint (commandValue отображается через дисплей-элемент,
        // в renderFeedback логика).
    }

    // ===== Apply flow =====
    _setCommand(value) {
        const clamped = this._clamp(value);
        this.commandValue = clamped;
        this._updateDirty(true);
        if (this._applyMode() === 'auto') {
            clearTimeout(this._autoApplyTimer);
            this._autoApplyTimer = setTimeout(() => this._applyNow(), 500);
        }
    }

    _applyNow() {
        clearTimeout(this._autoApplyTimer);
        if (this.commandValue === null || this.commandValue === undefined) return;
        this.writeValue(this.commandValue);
        // dirty снимется в renderFeedback когда придёт SSE.
    }

    _cancel() {
        clearTimeout(this._autoApplyTimer);
        this.commandValue = null;
        this._updateDirty(false);
        this.renderFeedback();
    }

    _clamp(value) {
        const min = this.config?.min ?? -Infinity;
        const max = this.config?.max ?? Infinity;
        return Math.max(min, Math.min(max, value));
    }

    _updateDirty(isDirty) {
        const root = this.element;
        if (!root) return;
        root.classList.toggle('dirty', !!isDirty);
    }

    // ===== Inline-edit helper (используется slider + stepper) =====
    _makeInlineEditable(spanEl) {
        spanEl.addEventListener('dblclick', (e) => {
            const currentValue = spanEl.textContent.trim();
            const input = document.createElement('input');
            input.type = 'number';
            input.className = 'setpoint-inline-edit';
            input.value = currentValue;
            input.min = this.config?.min ?? '';
            input.max = this.config?.max ?? '';
            input.step = this.config?.step ?? '1';
            spanEl.replaceWith(input);
            input.select();
            const finish = (apply) => {
                if (apply) {
                    const num = Number(input.value);
                    if (!Number.isFinite(num)) return cancel();
                    this._setCommand(num);
                    if (this._applyMode() === 'manual') {
                        // Manual: устанавливаем dirty, ждём explicit Apply
                    } else {
                        this._applyNow();
                    }
                }
                input.replaceWith(spanEl);
                this.renderFeedback();
            };
            const cancel = () => { input.replaceWith(spanEl); };
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); finish(true); }
                else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
            });
            input.addEventListener('blur', () => finish(true));
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
                           value="${config.min ?? 0}" data-test="cfg-min">
                </div>
                <div class="widget-config-field">
                    <label>max</label>
                    <input type="number" class="widget-input" name="max"
                           value="${config.max ?? 100}" data-test="cfg-max">
                </div>
                <div class="widget-config-field">
                    <label>step</label>
                    <input type="number" class="widget-input" name="step"
                           value="${config.step ?? 1}" min="0" data-test="cfg-step">
                </div>
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>Unit</label>
                    <input type="text" class="widget-input" name="unit"
                           value="${escapeHtml(config.unit || '')}" placeholder="°C, %, Pa..." data-test="cfg-unit">
                </div>
                <div class="widget-config-field">
                    <label>Apply mode</label>
                    <select class="widget-input" name="applyMode" data-test="cfg-applyMode">
                        <option value="manual" ${applyMode === 'manual' ? 'selected' : ''}>manual (Apply button)</option>
                        <option value="auto" ${applyMode === 'auto' ? 'selected' : ''}>auto (debounce 500ms)</option>
                    </select>
                </div>
            </div>
        `;
    }

    static parseActiveConfigFields(form) {
        return {
            min:       Number(form.querySelector('[name="min"]')?.value ?? 0),
            max:       Number(form.querySelector('[name="max"]')?.value ?? 100),
            step:      Number(form.querySelector('[name="step"]')?.value ?? 1),
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
```

## CSS

Append after pushbutton styles:

```css
/* ============================================================================
 * SetpointWidget — base layout
 * ============================================================================ */

.setpoint-widget {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 10px;
    box-sizing: border-box;
    gap: 8px;
}

.setpoint-widget .setpoint-feedback {
    font-size: 11px;
    color: #6b7280;
}
.setpoint-widget .setpoint-feedback strong {
    color: #22c55e;
    font-family: monospace;
}

.setpoint-widget .setpoint-unit {
    font-size: 11px;
    color: #9ca3af;
    margin-left: 4px;
}

/* === Style: input === */
.setpoint-style-input .setpoint-input-row {
    display: flex;
    gap: 6px;
    align-items: center;
}
.setpoint-style-input .setpoint-input {
    width: 100px;
    padding: 8px 10px;
    background: #0f172a;
    border: 2px solid #6b7280;
    border-radius: 4px;
    color: #d8dce2;
    text-align: right;
    font-family: monospace;
    font-size: 14px;
    font-weight: 600;
    box-sizing: border-box;
}
.setpoint-widget.dirty .setpoint-input {
    border-color: #fbbf24;
    background: #1e293b;
}

.setpoint-apply-btn {
    padding: 6px 12px;
    background: #3b82f6;
    color: #fff;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
    font-size: 12px;
    display: none;
}
.setpoint-cancel-btn {
    padding: 6px 8px;
    background: transparent;
    color: #9ca3af;
    border: 1px solid #4b5563;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    display: none;
}
.setpoint-widget.dirty .setpoint-apply-btn,
.setpoint-widget.dirty .setpoint-cancel-btn {
    display: inline-block;
}

/* === Style: slider === */
.setpoint-style-slider {
    width: 100%;
    padding: 8px 14px;
}
.setpoint-style-slider .setpoint-slider-wrap {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: center;
}
.setpoint-style-slider .setpoint-slider-value-row {
    display: flex;
    align-items: baseline;
    gap: 6px;
}
.setpoint-style-slider .setpoint-slider-value {
    font-size: 18px;
    font-weight: 600;
    color: #d8dce2;
    font-family: monospace;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 3px;
    transition: background 0.1s;
}
.setpoint-style-slider .setpoint-slider-value:hover {
    background: #374151;
}
.setpoint-widget.dirty .setpoint-slider-value {
    color: #fbbf24;
}
.setpoint-style-slider .setpoint-slider {
    width: 100%;
    -webkit-appearance: none;
    appearance: none;
    height: 6px;
    background: #374151;
    border-radius: 3px;
    outline: none;
}
.setpoint-style-slider .setpoint-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 18px;
    height: 18px;
    background: #3b82f6;
    border-radius: 50%;
    cursor: pointer;
    border: 2px solid #fff;
}
.setpoint-style-slider .setpoint-slider-labels {
    display: flex;
    justify-content: space-between;
    width: 100%;
    font-size: 10px;
    color: #6b7280;
}

/* === Style: stepper === */
.setpoint-style-stepper .setpoint-stepper-row {
    display: flex;
    align-items: center;
    background: #0f172a;
    border-radius: 6px;
    overflow: hidden;
}
.setpoint-style-stepper .setpoint-step-btn {
    width: 32px;
    height: 32px;
    background: #374151;
    color: #fff;
    border: none;
    cursor: pointer;
    font-size: 16px;
    font-weight: bold;
    transition: background 0.1s;
}
.setpoint-style-stepper .setpoint-step-btn:hover {
    background: #4b5563;
}
.setpoint-style-stepper .setpoint-stepper-value {
    padding: 0 14px;
    min-width: 70px;
    text-align: center;
    color: #d8dce2;
    font-family: monospace;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    line-height: 32px;
    transition: background 0.1s;
}
.setpoint-style-stepper .setpoint-stepper-value:hover {
    background: #1e293b;
}
.setpoint-widget.dirty .setpoint-stepper-value {
    color: #fbbf24;
}

/* === Inline edit (общий для slider + stepper) === */
.setpoint-inline-edit {
    padding: 4px 8px;
    background: #0f172a;
    border: 2px solid #fbbf24;
    border-radius: 4px;
    color: #d8dce2;
    font-family: monospace;
    font-size: 14px;
    width: 70px;
    text-align: right;
    outline: none;
}
```

## Тестирование

### E2E (`dashboard-active-setpoint.spec.ts`) — 8 сценариев

1. **Renders style 'input'** — default, проверить `.setpoint-style-input` + input + не видны Apply/Cancel при clean.
2. **Renders style 'slider'** — `.setpoint-style-slider` + `<input type="range">` + min/max labels.
3. **Renders style 'stepper'** — `.setpoint-style-stepper` + `−`/`+` buttons + value span.
4. **Manual apply: input change → dirty → Apply click → POST** — проверить flow + dirty class + Apply button visibility.
5. **Auto apply: input change → wait 500ms → POST** — debounce verification.
6. **Inline edit (stepper): double-click value → input → Enter → POST** — double-click pattern.
7. **Validation clamp: input value > max → POST'нится `max`** — boundary check.
8. **Custom unit displayed** — `config.unit: '°C'` → отображается рядом с value.

### Backend
Никаких изменений.

### Regression sweep
- `single/dashboard.spec.ts`
- `single/dashboard-sse.spec.ts`
- `single/dashboard-widgets.spec.ts` (count 12)
- `single/dashboard-active-base.spec.ts`
- `single/dashboard-active-toggle.spec.ts`
- `single/dashboard-active-button.spec.ts`
- `single/dashboard-active-setpoint.spec.ts` (new)

## План реализации (high-level steps)

1. **Backend baseline** — verify все existing E2E зелёные.
2. **`SetpointWidget` класс** — создать `61-dashboard-active-setpoint.js`: render dispatch (3 styles), inline-edit helper, apply mode (manual/auto + debounce), config form.
3. **CSS** — append `.setpoint-*` правила в `style.css`.
4. **Регистрация в `WIDGET_TYPES`** + обновить test count в `dashboard-widgets.spec.ts` (11 → 12).
5. **E2E тест** `dashboard-active-setpoint.spec.ts` (8 сценариев).
6. **Regression sweep**.
7. **Документация:** обновить CLAUDE.md (раздел active widgets — упомянуть SetpointWidget с тремя стилями и двумя apply mode).

## Open questions (на этапе реализации)

- **Inline edit position для slider value.** value — abs над slider'ом; при превращении в input — может conflict с slider выше/ниже. Решить (вероятно, replaceWith работает корректно потому что layout reflow'ится). Если проблема — добавить fixed-width для inline input.
- **Stepper hold для повторения.** Удержание `+`/`−` для быстрого изменения большой дельты — добавлять или нет? YAGNI: пока не добавляем, click = single step.
- **Кнопки Apply/Cancel в stepper-style.** Сейчас stepper auto-apply (нет «dirty» state). Но если applyMode='manual' выбран — должны ли кнопки появляться? Решение: для stepper applyMode игнорируется, всегда auto. Документировать в form (small note рядом со style select когда выбран stepper).

## Future enhancements (не в этом плане)

- **`'knob'` style** — поворотная ручка (rotary input). Отдельный план — требует SVG + drag math, сложный.
- **`'combo'` style** — slider + input одновременно (исходный D вариант). Если slider style с inline-edit окажется не достаточно.
- **`config.precision`** — кол-во знаков после запятой при отображении. Сейчас по умолчанию int.
- **Hold-to-step** в stepper — удержание `+` для быстрых ±step.
- **Acceptance ranges** — цветовые зоны на slider (green: 20-80, yellow: 80-90, red: 90-100). SCADA convention для tuning.
- **Touch/swipe support** для stepper.
