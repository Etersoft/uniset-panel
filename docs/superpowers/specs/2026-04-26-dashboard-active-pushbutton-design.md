# Dashboard Active Push Button — Design

**Дата:** 2026-04-26
**Ветка:** `story/dashboard-active-controls` (та же, что foundation+toggle+checkbox)
**Foundation spec:** `2026-04-26-dashboard-active-controls-design.md`
**Предшествует:** `2026-04-26-dashboard-active-toggle-design.md`, `2026-04-26-dashboard-active-checkbox-design.md`
**Статус:** Draft → ожидает review

## Контекст

Foundation + ToggleWidget (со styles `slider`/`checkbox`) готовы. Третий active widget — push button. Семантически отличается от toggle (write-only «команда», не двух-состояный латч), поэтому **отдельный класс**, не очередной style toggle'а.

Использует уже доказанный foundation (`ActiveDashboardWidget` с поднятыми `parseConfigForm`/`initConfigHandlers`/`usesNewSensorAutocomplete=true`/`static styles`/`defaultStyle`).

## Цели

- Реализовать `PushButtonWidget extends ActiveDashboardWidget` — write-only momentary/pulse кнопка для команд.
- Поддержать **2 режима** через `config.mode`: `'pulse'` (default — single click → POST valueOn → wait pulseWidth ms → POST valueOff) и `'momentary'` (mousedown → POST valueOn; mouseup → POST valueOff).
- Поддержать **3 визуальных стиля** через `static styles`: `'flat'` (default, Material primary), `'mushroom'` (SCADA круглая), `'pill'` (compact outline).
- Игнорировать SSE feedback от своего sensor'а (push-button — fire-and-forget).
- Использовать готовый foundation refactor — никаких изменений базового класса не требуется.

## Не-цели

- НЕ реализуем style `'industrial'` (зелёная прямоугольная с 3D) — пользователь её не выбрал.
- НЕ реализуем чтение/отображение feedback от sensor'а (push button показывает только команду + writeState).
- НЕ реализуем UI выбор «mode» в форме конфига если нет user demand (пока добавим как dropdown).
- НЕ меняем foundation базовый класс (он уже подготовлен в checkbox plan).

## Принятые решения

### Семантика и поведение

| Решение | Выбор | Обоснование |
|---|---|---|
| Архитектура | Отдельный класс `PushButtonWidget extends ActiveDashboardWidget` | Семантика «команда» отличается от toggle двухсостоянности |
| Режимы | `config.mode: 'pulse' (default) \| 'momentary'` | `'pulse'` безопасный default, `'momentary'` для man-on-button сценариев |
| Pulse width | `config.pulseWidth: number` (ms), default 500 | Достаточно для PLC scan cycle; кастомизируется пользователем |
| Feedback (SSE update) | Игнорируется (`update()` override → no-op) | Push-button — fire-and-forget; valueOn короткое время не информативно |
| writeState (idle/pending/success/error) | Стандарт ActiveDashboardWidget | Включая `error` = красная граница вокруг кнопки |
| momentary + requireConfirmation | НЕ работает (POST уйдёт без диалога) | Predictable behavior; в форме показываем warning |

### Визуал и стили

| Решение | Выбор | Обоснование |
|---|---|---|
| `static styles` | `['flat', 'mushroom', 'pill']` | Достаточно для разных use cases (frequent flat / emergency mushroom / minimal pill) |
| `defaultStyle` | `'flat'` | Самый универсальный, hold-friendly |
| Default size | per-style: flat/pill 2×1, mushroom 2×2 | Через статический helper `getDefaultSizeForStyle(style)` (см. ниже) |
| Цвет | Default по style (flat=blue, mushroom=red, pill=outline-grey); `config.color` override | SCADA convention для семантики |
| Подпись | `config.label` (default = sensor name) | «STOP», «RESET», «START PUMP» |

### Состояния (writeState от base + UI-state)

| Состояние | Внешний вид | Trigger |
|---|---|---|
| `normal` | Default style colors | Idle |
| `pressed` (momentary) | Translate-Y + darker bg | mousedown в momentary режиме |
| `pulsing` (pulse) | Кратковременная yellow flash 300ms | Click в pulse режиме |
| `pending` | opacity 0.7 + grayscale 0.3 | Между POST и success/error (стандарт) |
| `error` | Красная граница `box-shadow 0 0 0 2px #ef4444` | Из base `_setWriteState('error')` (CSS уже есть) |
| `disabled` | opacity 0.5 + grayscale + cursor:not-allowed | Edit mode или нет controlToken (стандарт) |

## Архитектура

### Backend
Никаких изменений. Используется существующий `POST /api/objects/{config.objectName}/ionc/set?server=...` (через base `writeValue`).

### Frontend

**Новые файлы:**

| Файл | Назначение |
|---|---|
| `ui/static/js/src/61-dashboard-active-button.js` | `PushButtonWidget extends ActiveDashboardWidget` |
| `tests/single/dashboard-active-button.spec.ts` | E2E (~7 сценариев: создание, pulse-flow, momentary-flow, 3 стиля рендера, edit-mode block, control-token block) |

**Модифицируемые файлы:**

| Файл | Изменение |
|---|---|
| `ui/static/js/src/62-dashboard-manager.js` | Регистрация в `WIDGET_TYPES`: `'pushbutton': PushButtonWidget` |
| `ui/static/css/style.css` | `.pushbutton-widget`, `.pushbutton-style-flat/mushroom/pill`, `.pulsing` keyframe, `.pressed` state |
| `tests/single/dashboard-widgets.spec.ts` | Обновить widget picker count: 10 → 11 (добавился pushbutton) |

### `PushButtonWidget` — контракт

```javascript
class PushButtonWidget extends ActiveDashboardWidget {
    static type = 'pushbutton';
    static displayName = 'Push Button';
    static description = 'Momentary/pulse command button';
    static icon = '<svg ...>'; // round button icon
    static styles = ['flat', 'mushroom', 'pill'];
    static defaultStyle = 'flat';
    // Default sizes — per style (см. getDefaultSizeForStyle)
    static defaultSize = { width: 2, height: 1 };
    static minSize = { width: 2, height: 1 };
    static maxSize = { width: 6, height: 3 };

    // Helper: default size зависит от style.
    // Используется dashboard-manager при создании widget без position (Add Widget UI).
    static getDefaultSizeForStyle(style) {
        if (style === 'mushroom') return { width: 2, height: 2 };
        return { width: 2, height: 1 }; // flat, pill
    }

    // === SSE feedback override — игнорируем ===
    update(value, error = null) {
        // Push-button не отображает feedback. Сохраняем error для _recomputeTitle через base
        // (writeState handle errors), но не вызываем renderFeedback.
        this.feedbackValue = value;
        this.error = error;
    }

    // === Render dispatch по style ===
    render() {
        const style = this._currentStyle();
        this.element = document.createElement('div');
        this.element.className = `widget-content pushbutton-widget pushbutton-style-${style}`;
        this.element.innerHTML = this._renderButtonHTML(style);
        this.container.appendChild(this.element);

        const btn = this.element.querySelector('[data-test="btn"]');
        const mode = this.config?.mode || 'pulse';
        if (mode === 'momentary') {
            this._bindMomentary(btn);
        } else {
            btn.addEventListener('click', () => this._onPulseClick());
        }
    }

    _renderButtonHTML(style) {
        const label = this.config?.label || this.config?.sensor || 'BUTTON';
        const safeLabel = escapeHtml(label);
        // mushroom — SVG-style круглая, label inside; flat/pill — стандартная button.
        return `<button class="pb-btn" data-test="btn">${safeLabel}</button>`;
    }

    _currentStyle() {
        return this.config?.style || PushButtonWidget.defaultStyle;
    }

    // === Pulse mode ===
    _onPulseClick() {
        if (!this.isInteractive()) return;
        const valueOn = this.config?.valueOn ?? 1;
        const valueOff = this.config?.valueOff ?? 0;
        const pulseWidth = this.config?.pulseWidth ?? 500;

        // Visual flash
        this.element.querySelector('[data-test="btn"]').classList.add('pulsing');
        setTimeout(() => {
            this.element?.querySelector('[data-test="btn"]')?.classList.remove('pulsing');
        }, 300);

        // POST valueOn → wait → POST valueOff
        this.writeValue(valueOn);
        setTimeout(() => {
            // Не writeValue (он создаст ещё одну pending), а direct second POST
            // через тот же базовый flow. Простейшее: вторичный writeValue игнорирует
            // requireConfirmation на втором шаге (это автореверс).
            this._writeValueRaw(valueOff);
        }, pulseWidth);
    }

    // Вспомогательный метод — write без confirm dialog (для второго шага pulse).
    async _writeValueRaw(value) {
        const orig = this.config?.requireConfirmation;
        this.config.requireConfirmation = false;
        try { await this.writeValue(value); }
        finally { this.config.requireConfirmation = orig; }
    }

    // === Momentary mode ===
    _bindMomentary(btn) {
        const valueOn = this.config?.valueOn ?? 1;
        const valueOff = this.config?.valueOff ?? 0;

        const onDown = (e) => {
            if (!this.isInteractive()) return;
            e.preventDefault();
            btn.classList.add('pressed');
            this.writeValue(valueOn);
            // window-level listener на mouseup — гарантирует release
            // даже если мышь ушла за пределы кнопки.
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

    renderCommand() {
        // Push-button doesn't visualize commandValue separately
        // (visual press state handled by mousedown listener).
    }

    renderFeedback() {
        // No-op (override of base — push-button ignores feedback).
    }

    // === Config form ===
    static getActiveConfigFields(config = {}) {
        return `
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>Mode</label>
                    <select class="widget-input" name="mode" data-test="cfg-mode">
                        <option value="pulse" ${(config.mode || 'pulse') === 'pulse' ? 'selected' : ''}>pulse</option>
                        <option value="momentary" ${config.mode === 'momentary' ? 'selected' : ''}>momentary</option>
                    </select>
                </div>
                <div class="widget-config-field">
                    <label>Pulse width (ms)</label>
                    <input type="number" class="widget-input" name="pulseWidth"
                           value="${config.pulseWidth ?? 500}" min="50" data-test="cfg-pulseWidth">
                    <small style="color:#6b7280">Применяется только в pulse mode</small>
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
            <div class="widget-config-field" data-momentary-warning style="display:none">
                <small style="color:#f59e0b">⚠ В momentary режиме requireConfirmation не работает (POST уйдёт без диалога)</small>
            </div>
        `;
    }

    static initConfigHandlers(form, config = {}) {
        super.initConfigHandlers(form, config);
        // Дополнительно: показывать warning при выборе momentary mode
        const modeSel = form.querySelector('[name="mode"]');
        const warning = form.querySelector('[data-momentary-warning]');
        const update = () => { if (warning) warning.style.display = modeSel?.value === 'momentary' ? '' : 'none'; };
        modeSel?.addEventListener('change', update);
        update();
    }

    static parseActiveConfigFields(form) {
        return {
            mode:       form.querySelector('[name="mode"]')?.value || 'pulse',
            pulseWidth: parseInt(form.querySelector('[name="pulseWidth"]')?.value, 10) || 500,
            valueOff:   Number(form.querySelector('[name="valueOff"]')?.value ?? 0),
            valueOn:    Number(form.querySelector('[name="valueOn"]')?.value ?? 1),
        };
    }
}

window.PushButtonWidget = PushButtonWidget;
```

### CSS (`style.css`)

```css
/* ============================================================================
 * PushButtonWidget — base layout
 * ============================================================================ */

.pushbutton-widget {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 10px;
    box-sizing: border-box;
}

.pushbutton-widget .pb-btn {
    cursor: pointer;
    transition: background 0.1s, color 0.1s, border-color 0.1s, box-shadow 0.2s, transform 0.05s;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    user-select: none;
}

/* === flat (default) — Material primary === */
.pushbutton-style-flat .pb-btn {
    padding: 10px 24px;
    background: #3b82f6;
    color: #fff;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    box-shadow: 0 2px 4px rgba(0,0,0,.3);
}
.pushbutton-style-flat .pb-btn.pressed {
    background: #2563eb;
    transform: translateY(1px);
    box-shadow: 0 1px 2px rgba(0,0,0,.3);
}

/* === mushroom — SCADA круглая === */
.pushbutton-style-mushroom .pb-btn {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: radial-gradient(circle at 30% 30%, #ef4444, #b91c1c);
    border: 3px solid #7f1d1d;
    color: #fff;
    font-size: 11px;
    box-shadow: 0 4px 8px rgba(0,0,0,.5), inset 0 -4px 8px rgba(0,0,0,.3);
}
.pushbutton-style-mushroom .pb-btn.pressed {
    box-shadow: 0 1px 3px rgba(0,0,0,.5), inset 0 4px 8px rgba(0,0,0,.4);
    transform: translateY(2px);
}

/* === pill — Compact outline === */
.pushbutton-style-pill .pb-btn {
    padding: 8px 18px;
    background: transparent;
    color: #d8dce2;
    border: 2px solid #6b7280;
    border-radius: 20px;
    font-size: 12px;
}
.pushbutton-style-pill .pb-btn:hover {
    border-color: #22c55e;
    color: #22c55e;
}
.pushbutton-style-pill .pb-btn.pressed {
    background: #22c55e;
    color: #fff;
    border-color: #22c55e;
}

/* === pulsing — кратковременный flash для pulse mode === */
.pb-btn.pulsing {
    animation: pb-pulse-flash 0.3s ease-out;
}
@keyframes pb-pulse-flash {
    0%   { background: #fbbf24; box-shadow: 0 0 8px rgba(251, 191, 36, 0.8); }
    100% { /* возврат к обычному (background каскадом из стиля) */ }
}
```

## Тестирование

### E2E (`dashboard-active-button.spec.ts`)

7 сценариев:

1. **Renders correct style classes** — создать widget с `style: 'flat'`, проверить `.pushbutton-style-flat` присутствует.
2. **Pulse mode click → POST valueOn → wait pulseWidth → POST valueOff** — мочить роут, делать click, проверять что 2 POST'а с правильными values и timing.
3. **Momentary mode mousedown → POST valueOn; mouseup → POST valueOff** — dispatchEvent mousedown/mouseup, проверять 2 POST'а.
4. **Momentary mouseleave освобождает (window-level mouseup)** — mousedown, dispatch mouseleave + window mouseup, проверять что valueOff отправлен.
5. **Edit mode: click does not write** — switch в edit mode, click не вызывает POST.
6. **Control token absent: click does not write** — без controlToken, кнопка disabled.
7. **Custom label, valueOn, valueOff** — config с label='RESET', valueOn=42, проверка что в DOM есть 'RESET' и POST шлёт 42.

### Backend

Никаких изменений — никаких новых тестов.

### Regression sweep

Прогнать после изменений:
- `single/dashboard.spec.ts`
- `single/dashboard-sse.spec.ts`
- `single/dashboard-widgets.spec.ts` (обновлён для счёта 11)
- `single/dashboard-active-base.spec.ts`
- `single/dashboard-active-toggle.spec.ts`
- `single/dashboard-active-button.spec.ts` (new)

## План реализации (high-level steps)

1. **Backend baseline** — verify все existing E2E зелёные.
2. **`PushButtonWidget` класс** — создать `61-dashboard-active-button.js` с render/config form/pulse/momentary логикой.
3. **CSS** — append `.pushbutton-*` правила в `style.css`.
4. **Регистрация в `WIDGET_TYPES`** + обновить test count в `dashboard-widgets.spec.ts` (10 → 11).
5. **E2E тест** `dashboard-active-button.spec.ts` (7 сценариев).
6. **Regression sweep** связанных spec'ов.
7. **Документация:** обновить CLAUDE.md (раздел active widgets — упомянуть PushButtonWidget с тремя стилями и двумя режимами).

## Open questions (на этапе реализации)

- **`update()` override no-op vs `super.update()`.** Если просто игнорировать feedback — push-button никогда не покажет «sensor stuck в valueOn» индикатор (PLC баг). Альтернатива: показывать error state если feedback === valueOn и прошло > X×pulseWidth времени. Не реализуем в этой версии — следить, не появится ли user request.
- **`config.color` override.** В spec'е заявлено, в реализации можно отложить (default-цвета по style должны быть достаточны для первой версии). Решить при реализации (Step 2).
- **`getDefaultSizeForStyle` integration с dashboard-manager `Add Widget` flow.** Менеджер сейчас использует `WidgetClass.defaultSize` напрямую. Чтобы per-style size работал — нужно либо менять manager.createWidget, либо динамически менять `defaultSize` в render() (но это слишком поздно). Проще: в форме config при выборе style — auto-update size инпуты. Решить при реализации (Step 4).

## Future enhancements (не в этом плане)

- Style `'industrial'` — зелёная прямоугольная с 3D эффектом.
- Cluster button group — несколько push-button'ов с общим parent (radio-like behavior).
- Hold-to-confirm — длительное удержание для опасных команд (как iOS «Slide to Power Off»).
- Visual catalog в документации (общее TODO для всех widget'ов после реализации всех 4-х).
