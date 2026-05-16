# Dashboard Active Checkbox-style + Base Class Refactor — Design

**Дата:** 2026-04-26
**Ветка:** `story/dashboard-active-controls` (та же, что foundation+toggle)
**Foundation spec:** `2026-04-26-dashboard-active-controls-design.md`
**Toggle spec:** `2026-04-26-dashboard-active-toggle-design.md`
**Статус:** Draft → ожидает review

## Контекст

Foundation + ToggleWidget готовы. Toggle сейчас рисует один визуал — slide-переключатель с handle. По плану его spec'а в Future enhancements намечены ещё несколько визуальных стилей (`button-pair`, `industrial`, `lever`, `pill`, `checkbox`, `radio`). Этот план реализует **checkbox** style как первый из них.

По итогам toggle review также накопились архитектурные TODO для базового класса (`ActiveDashboardWidget`):
- `config.sensorId` / `config.objectName` дублируются в каждом widget'е (`parseConfigForm` override) — должны быть в базовом классе.
- `usesNewSensorAutocomplete = true` — должен быть дефолтом базового класса (а не opt-in флагом).
- I-2: `serverMgr.GetServerObjects(serverID)` вместо итерации всех серверов в `GetObjects`.

Этот план **объединяет** два направления — реализация checkbox-style и refactor базового класса (потому что они касаются одного и того же API surface).

## Цели

- Добавить визуальный стиль **`checkbox`** в существующий `ToggleWidget` (по аналогии с `GaugeWidget.style`).
- Promote `sensorId` / `objectName` / `parseConfigForm` базовый шаблон в `ActiveDashboardWidget` — убрать дубль из ToggleWidget и подготовить для будущих widget'ов.
- Сделать `usesNewSensorAutocomplete = true` дефолтом базового класса (legacy attach в dashboard-manager пропускается для всех ActiveDashboardWidget'ов автоматически).
- Backend: добавить `serverMgr.GetServerObjects(serverID)` чтобы `/api/objects` не итерировал все серверы в multi-server конфиге.
- E2E coverage для нового стиля.

## Не-цели

- НЕ реализуем остальные styles (`button-pair`, `industrial`, `lever`, `pill`, `radio`) — отдельные планы.
- НЕ меняем backend API формы (только внутренняя оптимизация GetServerObjects).
- НЕ меняем семантику `ToggleWidget` — checkbox это **только визуал**, контракт write-flow и feedback тот же.
- НЕ затрагиваем другие активные widget'ы (их пока нет — следующие будут push-button/setpoint/generator).

## Принятые решения

### Дизайн checkbox style

| Решение | Выбор | Обоснование |
|---|---|---|
| Архитектурный паттерн | `static styles` + `config.style: 'slider' (default) \| 'checkbox'` | Аналогично GaugeWidget; меньше дублирования; легко расширять |
| Визуал checkbox | Material flat 24×24 px, border 2px, ✓ при ON, фон зелёный при ON | Современно, читаемо, согласовано с цветовой палитрой UniSet panel |
| Layout | Compact horizontal: `[checkbox] name` | Стандартный checkbox UX, плотный (для столбца чекбоксов) |
| Default size | 2×1 ячейки сетки | Плотный, под несколько checkbox'ов в один столбец dashboard'а |
| Min/Max size | 2×1 / 6×2 | min — компактный, max — достаточно для длинных имён |
| Click area | Весь widget (не только checkbox) | Стандартный UX, больше hit area, удобнее touch |
| Unknown feedback | Dashed border + «?» внутри | Визуально явно отличается от ON/OFF, серый цвет |
| State-text (labelOff/labelOn) | Скрыт в checkbox style | Избыточен при visible checkbox; labels остаются в config — используются slider'ом и Future стилями |

### Foundation refactor

| Решение | Выбор | Обоснование |
|---|---|---|
| `config.sensorId` parsing | Поднять в `ActiveDashboardWidget.parseConfigForm` | Универсально для всех 5 запланированных widget'ов |
| `config.objectName` parsing | То же | Универсально |
| Базовый `parseConfigForm` | Парсит sensor/sensorId/objectName/label/requireConfirmation/style; вызывает `parseActiveConfigFields` для специфичных полей | Унификация: subclasses переопределяют только `parseActiveConfigFields` |
| `usesNewSensorAutocomplete` | Дефолт `true` в `ActiveDashboardWidget` | Все active widgets используют новый autocomplete; ToggleWidget удаляет свой override |
| `getConfigForm` базового | Уже есть; добавляем `objectName` (через select) и `sensorId` (hidden) | sensor input уже есть |
| `initConfigHandlers` | Поднять в base — populate IONC dropdown + setupSensorAutocomplete | Был в ToggleWidget; subclasses переопределяют только если нужно дополнительно |

### Backend

| Решение | Выбор | Обоснование |
|---|---|---|
| `serverMgr.GetServerObjects(serverID)` | Новый method, возвращает `[]string` (имена) или ошибку если сервер не найден | Избегает iteration всех серверов в `GetAllObjectsGrouped` для single-server lookup |
| `GetObjects` handler | Использует новый method, при `serverID != ""` | Микрооптимизация для multi-server; читать read-pathway для одного |

## Архитектура

### Frontend

**Изменяемые файлы:**

| Файл | Изменение |
|---|---|
| `ui/static/js/src/61-dashboard-active-base.js` | (1) `usesNewSensorAutocomplete = true` (статика, дефолт); (2) `parseConfigForm` парсит sensor/sensorId/objectName/label/requireConfirmation/style + spread из `parseActiveConfigFields`; (3) `getConfigForm` теперь рендерит objectName select + sensor input + hidden sensorId + style select (если subclass declarable styles); (4) `initConfigHandlers` загружает IONC objects dropdown и подключает sensor autocomplete |
| `ui/static/js/src/61-dashboard-active-toggle.js` | (1) `static styles = ['slider', 'checkbox']`; (2) `render()` диспатчит на `renderSlider()` / `renderCheckbox()` по `config.style` (default 'slider'); (3) `renderCommand` / `renderFeedback` ветвятся аналогично; (4) `getActiveConfigFields` оставляет valueOff/valueOn/labelOff/labelOn; (5) удалён `parseConfigForm` override (теперь покрывается base); (6) удалён `usesNewSensorAutocomplete = true` (наследуется от base) |
| `ui/static/css/style.css` | Новые стили `.toggle-widget.style-checkbox` (или отдельный селектор; см. ниже) для checkbox layout. Существующие slider стили остаются. |
| `internal/server/manager.go` | Новый method `GetServerObjects(serverID string) ([]string, error)` — wrap текущей логики из `GetAllObjectsGrouped` для одного сервера |
| `internal/api/handlers.go` | `GetObjects` использует `GetServerObjects` вместо `GetAllObjectsGrouped` когда `serverID != ""` |
| `internal/server/manager_test.go` | Тест для `GetServerObjects` |
| `internal/api/handlers_test.go` | Существующие тесты должны продолжать проходить (поведение endpoint не изменилось) |
| `tests/single/dashboard-active-toggle.spec.ts` | Добавить тест с `config.style: 'checkbox'` |

**Новые файлы:** нет (всё в существующем `61-dashboard-active-toggle.js`).

### `ToggleWidget` style switch — контракт

```javascript
class ToggleWidget extends ActiveDashboardWidget {
    static type = 'toggle';
    static styles = ['slider', 'checkbox'];      // публичный список доступных стилей
    static defaultStyle = 'slider';
    // defaultSize зависит от style: для slider — 3×2, для checkbox — 2×1.
    // Реализуется через geometry helper (см. ниже).

    render() {
        const style = this.config?.style || ToggleWidget.defaultStyle;
        if (style === 'checkbox') {
            this.renderCheckbox();
        } else {
            this.renderSlider();  // существующая логика
        }
    }

    renderCheckbox() {
        // <div class="toggle-widget toggle-checkbox" data-test="cb-root">
        //   <div class="toggle-cb" data-test="cb"></div>
        //   <div class="toggle-name" data-test="name">{label || sensor}</div>
        // </div>
        // Click anywhere → onClick (existing).
    }

    renderCommand() {
        if (this._isCheckbox()) {
            this.renderCheckboxCommand();   // .diverge при cmd≠fb
        } else {
            this.renderSliderCommand();      // existing
        }
    }

    renderFeedback() {
        if (this._isCheckbox()) {
            this.renderCheckboxFeedback();   // fb-on/off/unknown classes на .toggle-cb
        } else {
            this.renderSliderFeedback();     // existing
        }
    }

    _isCheckbox() {
        return (this.config?.style || ToggleWidget.defaultStyle) === 'checkbox';
    }

    static getActiveConfigFields(config = {}) {
        // Только valueOff/valueOn + labelOff/labelOn.
        // Style select рендерится базовым getConfigForm (если у subclass'а styles.length > 1).
        return valueFieldsExisting + labelFieldsExisting;
    }
    // parseConfigForm — НЕ override; base покрывает sensor/sensorId/objectName/label/requireConfirmation/style.
    // parseActiveConfigFields — overrides для valueOff/valueOn/labelOff/labelOn.
}
```

### `ActiveDashboardWidget` базовый refactor

```javascript
class ActiveDashboardWidget extends DashboardWidget {
    // ... existing constructor / writeValue / state machine ...

    static usesNewSensorAutocomplete = true;  // ⬅ дефолт (было: только для ToggleWidget)

    static getConfigForm(config = {}) {
        const objectField = `<select name="objectName">…</select>`;
        const sensorField = `<input name="sensor"> <input type="hidden" name="sensorId">`;
        const labelField = `<input name="label">`;
        const reqConfField = `<checkbox name="requireConfirmation">`;
        const styleField = (this.styles && this.styles.length > 1)
            ? `<select name="style">…</select>`
            : '';
        return objectField + sensorField + styleField + labelField + reqConfField
             + (this.getActiveConfigFields ? this.getActiveConfigFields(config) : '');
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
        // Populate IONC objects dropdown from /api/objects?type=IONotifyController
        // Setup sensor autocomplete via setupSensorAutocomplete(...)
        // Subclasses переопределяют для дополнительной логики через super.initConfigHandlers(form, config)
    }
}
```

### Backend `GetServerObjects`

```go
// GetServerObjects возвращает имена объектов на одном сервере без итерации всех.
// Возвращает ошибку если сервер не найден.
func (m *Manager) GetServerObjects(serverID string) ([]string, error) {
    instance, exists := m.GetServer(serverID)
    if !exists {
        return nil, fmt.Errorf("server %q not found", serverID)
    }
    objects, err := instance.GetObjects()
    if err != nil {
        if cached := instance.GetCachedObjects(); cached != nil {
            return cached, nil
        }
        return nil, err
    }
    return objects, nil
}
```

`handlers.go GetObjects` заменяет:
```go
grouped, err := h.serverMgr.GetAllObjectsGrouped()
// ... search through grouped ...
```
на:
```go
names, err := h.serverMgr.GetServerObjects(serverID)
```

### CSS checkbox style

Новые правила в `style.css` (после `.toggle-widget` slider правил):

```css
/* Checkbox style — compact horizontal layout */
.toggle-widget.toggle-style-checkbox {
    flex-direction: row;
    justify-content: flex-start;
    gap: 10px;
    padding: 0 12px;
}
.toggle-widget.toggle-style-checkbox .toggle-name {
    font-size: 13px;
    text-align: left;
    /* nowrap + ellipsis уже на .toggle-name из slider styles — наследуется */
}

.toggle-widget .toggle-cb {
    width: 24px;
    height: 24px;
    border-radius: 4px;
    border: 2px solid #6b7280;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, border-color 0.15s, box-shadow 0.2s;
    flex-shrink: 0;
    background: transparent;
}
.toggle-widget .toggle-cb.fb-on {
    background: #22c55e;
    border-color: #22c55e;
}
.toggle-widget .toggle-cb.fb-on::after {
    content: '✓';
    color: #fff;
    font-weight: bold;
    font-size: 16px;
    line-height: 1;
}
.toggle-widget .toggle-cb.fb-unknown {
    background: #1f2937;
    border-style: dashed;
}
.toggle-widget .toggle-cb.fb-unknown::after {
    content: '?';
    color: #9ca3af;
    font-weight: 600;
    font-size: 14px;
}
.toggle-widget.toggle-style-checkbox.diverge {
    box-shadow: 0 0 0 2px #f59e0b, 0 0 6px rgba(245,158,11,0.5);
}
```

`.diverge` применяется к **корню** widget'а (внешний div с классом `toggle-widget`) — потому что в checkbox style yellow border выглядит лучше вокруг всего widget'а, не только checkbox'а. У slider — диверж на `.toggle-track` (existing). Реализуется в `renderCommand` методе.

## Состояния (визуальный контракт checkbox)

| Состояние | Background | Border | Внутри | Внешняя граница |
|---|---|---|---|---|
| cmd=feedback=OFF | transparent | серый 2px | пусто | нет |
| cmd=feedback=ON | зелёный | зелёный | белый ✓ | нет |
| cmd≠feedback | by feedback | by feedback | by feedback | жёлтая (на root) |
| feedback=unknown | dark grey | dashed серый | серое «?» | (если cmd!=null — жёлтая) |
| pending | (какой был) | (какой был) | (какой был) | opacity 0.7, grayscale 0.3 |
| error | (какой был) | (какой был) | (какой был) | красная 2px |
| disabled | (какой был) | (какой был) | (какой был) | opacity 0.5, grayscale, cursor:not-allowed |

## Тестирование

### Backend
- `internal/server/manager_test.go`: `TestGetServerObjects` — server found / not found / cache fallback case.
- `internal/api/handlers_test.go`: existing `TestGetObjects_TypeFilter` должен продолжать проходить (behavior unchanged).

### Frontend (E2E, Playwright)

`tests/single/dashboard-active-toggle.spec.ts` — добавить тесты:
- Создание widget с `config.style: 'checkbox'` → renders `.toggle-cb` (не `.toggle-track`).
- Click anywhere on widget → triggers writeValue (даже если клик не на checkbox'е напрямую).
- Feedback ON → `.toggle-cb.fb-on` → ✓ visible.
- Feedback unknown → `.toggle-cb.fb-unknown` → «?» visible, dashed border.
- Diverge: `.toggle-widget.diverge` outer (не на cb).

### Regression sweep
Прогнать после изменений:
- `single/dashboard.spec.ts`
- `single/dashboard-sse.spec.ts`
- `single/dashboard-widgets.spec.ts`
- `single/dashboard-active-base.spec.ts`
- `single/dashboard-active-toggle.spec.ts` (включая существующие slider tests + новые checkbox)

## План реализации (high-level steps)

1. **Backend:** `serverMgr.GetServerObjects(serverID)` + unit-тест.
2. **Backend:** `GetObjects` использует новый method.
3. **Foundation refactor:** `ActiveDashboardWidget` — promote `parseConfigForm`/`getConfigForm`/`initConfigHandlers`/`usesNewSensorAutocomplete=true` (default).
4. **ToggleWidget refactor:** удалить дубль `parseConfigForm`/`usesNewSensorAutocomplete`, сохранить override `getActiveConfigFields`/`parseActiveConfigFields` для valueOff/valueOn/labelOff/labelOn.
5. **ToggleWidget style:** `static styles`, `defaultStyle`, `_isCheckbox`, диспатч в `render`/`renderCommand`/`renderFeedback`.
6. **CSS:** добавить `.toggle-style-checkbox`, `.toggle-cb` правила.
7. **Container CSS class:** в `render` ToggleWidget добавлять `toggle-style-{style}` на корневой div для CSS гэйта.
8. **Style selector в config form:** в `getActiveConfigFields` (или в base — если все active widgets могут иметь styles) добавить `<select name="style">` если subclass declarable styles.
9. **E2E:** новые тесты для checkbox style + regression sweep.
10. **Документация:** обновить CLAUDE.md (раздел active widgets — упомянуть styles pattern и checkbox).

## Open questions (на этапе реализации)

- **defaultSize per style.** Как выразить что checkbox-style виджеты лучше создаются с size 2×1, а slider-style 3×2? Опции:
  - (A) `getDefaultSizeForStyle(style)` static method, dashboard-manager в createWidget использует.
  - (B) При `style change` в config form — автоматически suggest reset size (через UI).
  - (C) Не делать ничего — пользователь сам подгоняет.
  Решить в шаге 5 (выбрать B или C для простоты, оставить A на будущее).

- **migration path для old saved dashboards.** Когда user обновит app, его старые toggle widgets будут без `config.style` поля. Default = 'slider' это покрывает (back-compat). OK без миграции.

- **CSS class на корне.** `style-${style}` или `toggle-style-${style}`? Префикс лучше — будет встречаться не только у toggle, но и у будущих widget'ов.

## Future enhancements (не в этом плане)

- Остальные styles (button-pair, industrial, lever, pill) — каждый отдельный brainstorm.
- Radio button style — отдельный план (требует cross-widget coordination, group-id).
- Per-widget `style` change в runtime (без re-create) — сейчас change style требует re-render dashboard.
