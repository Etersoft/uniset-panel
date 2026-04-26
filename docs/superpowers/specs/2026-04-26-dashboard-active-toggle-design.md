# Dashboard Active Toggle Widget — Design

**Дата:** 2026-04-26
**Ветка:** `story/dashboard-active-controls` (та же, что и foundation)
**Foundation spec:** `2026-04-26-dashboard-active-controls-design.md`
**Foundation plan:** `2026-04-26-dashboard-active-controls-foundation.md`
**Статус:** Draft → ожидает review

## Контекст

Foundation для активных dashboard-виджетов готова: базовый класс `ActiveDashboardWidget`, signal-generator engine, CSS состояний, smoke E2E. Это первый из пяти запланированных активных виджетов. По ходу его реализации решаются 4 архитектурных вопроса, оставленных foundation'ом, и фиксируется один реальный баг dashboard'а (hardcoded имя IONC-объекта в read-pathway).

## Цели

- Реализовать `ToggleWidget extends ActiveDashboardWidget` — переключатель между двумя числовыми значениями, привязанный к датчику любого типа (DI/DO/AI/AO).
- Дать пользователю выбор IONC-объекта на сервере через **dropdown** с фильтрацией по типу `IONotifyController`.
- Дать пользователю выбор датчика через **autocomplete** с поиском по выбранному объекту.
- Решить 4 архитектурных вопроса foundation'а (CSS-маркер, active-disabled индикатор, hardcoded `SharedMemory`, sensor_id резолв).
- Починить read-pathway dashboard'а — `62-dashboard-manager.js:422` сейчас захардкожен на имя `"SharedMemory"`, что некорректно (SM может называться иначе, и их может быть несколько).

## Не-цели

- Нет цели реализовать ещё один активный виджет (checkbox/button/setpoint/generator) в этом плане. Они — отдельные планы.
- Нет цели менять backend уровня контроля (controlToken остаётся единственным механизмом авторизации).
- Нет цели валидировать совместимость valueOff/valueOn с iotype датчика (для DI/DO с valueOn=42 пользователь сам отвечает за смысл).
- Нет цели реализовать аналитику расхождения command vs feedback (например, log в журнал) — это другая фича.

## Принятые решения

### Дизайн виджета

| Решение | Выбор | Обоснование |
|---|---|---|
| Композиция | Слитый toggle: цвет = feedback, позиция handle = command | Минимум визуального шума, плотность для маленьких размеров |
| Расхождение command vs feedback | Жёлтая граница `box-shadow: 0 0 0 2px #f59e0b` | Стандарт SCADA для «команда не выполнена» |
| Промежуточный feedback (AI/AO ≠ valueOn ≠ valueOff) | Серый «unknown» цвет + актуальное число в `title` tooltip | Честно показывает что состояние не бинарное |
| Лейблы состояний | `labelOff`/`labelOn` в config, defaults `OFF`/`ON` | Гибкость для «РАБОТА/СТОП», «Open/Closed», «Ручной/Авто» |
| Подтверждение записи | `requireConfirmation` (наследуется от base), default off | Из foundation |

### Архитектура

| Решение | Выбор | Обоснование |
|---|---|---|
| Привязка к датчику | По имени, авто-резолв в `sensor_id` (int64) при выборе из autocomplete + кеш в config | Прозрачно для пользователя, нет двойного fetch при каждом write |
| IONC-объект | Поле `objectName` в config виджета, dropdown в форме конфига, фильтр по `objectType="IONotifyController"` | Корректно для multi-server и кластеров с несколькими SM |
| CSS-маркер активного виджета | `container.dataset.activeWidget = "true"` (выставляется в dashboard manager при `widget instanceof ActiveDashboardWidget`) | Развязка от имени типа, позволяет естественные имена (`toggle`, `checkbox` и т.д.) |
| `active-disabled` индикатор | Базовый класс `_updateInteractivityClass()` отслеживает `isInteractive()` и выставляет `active-disabled` класс + `data-control-blocked="true"` атрибут | Без этого пользователь не видит почему клик не сработал |
| Read-pathway dashboard'а | Рефактор `62-dashboard-manager.js:422`: использовать `objectName` из widget config (пер-виджет, а не глобально) | Согласованность read/write пути; пер-виджет, потому что в одном dashboard могут быть widgets с разных IONC объектов |

## Архитектура

### Backend

**Новый endpoint:**

| Endpoint | Метод | Параметры | Возвращает |
|---|---|---|---|
| `/api/objects` | GET | `server` (req), `type` (опц., напр. `IONotifyController`) | `{ objects: [{ name: string, objectType: string }] }` |

Сейчас `/api/objects` возвращает плоский список имён (`{objects: ["A", "B", ...]}`). Нужно расширить:
- Если `type` параметр **не указан** — возвращать как сейчас (back-compat)
- Если `type` параметр **указан** — для каждого имени получить `objectType` (через существующий `client.GetObjectData(name)`) и отфильтровать. Или — лучше — добавить серверный кеш типов на основе `serverMgr` (если уже есть метаданные после polling'а).

Альтернатива: новый endpoint `/api/objects/by-type?server=...&type=...`. Менее дискомфорт для существующих consumer'ов. Решить при реализации (возможно дешевле второе — расширение текущего endpoint'а потребует или N запросов, или полноценный кеш типов).

**Существующий endpoint, используется как есть:**
- `GET /api/objects/{name}/ionc/sensors?server=...&search=text&limit=N` — для autocomplete sensor'а
- `POST /api/objects/{name}/ionc/set?server=...` — для записи (через `controlledFetch`)

### Frontend

**Новые файлы:**

| Файл | Назначение |
|---|---|
| `ui/static/js/src/61-dashboard-active-toggle.js` | `ToggleWidget extends ActiveDashboardWidget` |
| `ui/static/js/src/41-sensor-autocomplete.js` | Переиспользуемый autocomplete-селектор «выбери sensor из IONC-объекта» — будут использовать setpoint, generator widgets. Размещён рядом с `41-dialogs.js`, потому что это dialog-utility (не расширение `06-utils.js`, чтобы не раздувать общие утилиты). |
| `tests/single/dashboard-active-toggle.spec.ts` | E2E: создание widget'а, конфигурирование (выбор объекта/датчика), все 8 состояний, click → POST, edit-mode disable, controlToken блок |

Имя файла **`61-dashboard-active-toggle.js`** (а не `61-active-toggle.js`) — единый префикс с `61-dashboard-active-base.js` гарантирует, что в lex-order конкатенации база загружается раньше.

**Модифицируемые файлы:**

| Файл | Изменение |
|---|---|
| `ui/static/js/src/61-dashboard-active-base.js` | (1) `_updateInteractivityClass()` метод; (2) `_resolveServerId()` остаётся, но `objectName` берётся из `this.config.objectName` (с fallback на foundation hardcoded `'SharedMemory'` для совместимости с TestActiveWidget) |
| `ui/static/js/src/62-dashboard-manager.js` | (1) После `createWidget()` — если `widget instanceof ActiveDashboardWidget`, выставить `container.dataset.activeWidget = "true"`; (2) В `fetchSensorValues` (строка 422) — использовать widget'овский `objectName` вместо hardcoded `'SharedMemory'`; собирать сенсоры по группам (objectName, serverId), потому что разные widgets могут читать с разных IONC |
| `ui/static/css/style.css` | Заменить `.dashboard-grid.edit-mode .dashboard-widget[data-type^="active-"]` на `[data-active-widget="true"]`. Аналогично для `active-disabled`. Добавить toggle-специфичные классы (`.toggle-widget`, состояния `fb-on/off/unknown`, `diverge`) |
| `internal/api/handlers.go` | Расширить `GetObjects` (или добавить новый handler) для type-фильтра |
| `internal/api/server.go` | Регистрация нового handler'а (если выбран отдельный endpoint) |

### `ToggleWidget` — контракт

```javascript
class ToggleWidget extends ActiveDashboardWidget {
    static type = 'toggle';
    static displayName = 'Toggle';
    static description = 'Two-state switch (write to digital or analog sensor)';
    static defaultSize = { width: 3, height: 2 };

    // === DOM ===
    render() {
        // <div class="toggle-widget">
        //   <div class="toggle-name">{label || sensor}</div>
        //   <div class="toggle-track" data-handle-pos="left|right">
        //     <div class="toggle-handle"></div>
        //   </div>
        //   <div class="toggle-state-text">{labelOff|labelOn}</div>
        // </div>
        // Click on toggle-track → flip command (call writeValue)
    }

    renderCommand() {
        // позиция handle: this.commandValue === valueOn → right, иначе left
        // Если commandValue === null (ещё не нажимали) — позиция = по feedback'у
    }

    renderFeedback() {
        // цвет track:
        //   feedbackValue === valueOn → fb-on (зелёный)
        //   feedbackValue === valueOff → fb-off (серый)
        //   else → fb-unknown (серый-неопределённый, title="actual: <feedbackValue>")
        // Жёлтая граница (.diverge): commandValue !== null И commandValue !== feedbackValue
    }

    onClick() {
        // current = (commandValue !== null ? commandValue : feedbackValue)
        // next = (current === valueOn ? valueOff : valueOn)
        // this.writeValue(next)
    }

    // === Config form ===
    static getActiveConfigFields(config = {}) {
        // - <select> IONC Object — populated from /api/objects?server=...&type=IONotifyController
        // - <input> Sensor — autocomplete (см. ниже)
        // - <input type="number"> valueOff (default 0)
        // - <input type="number"> valueOn  (default 1)
        // - <input> labelOff (placeholder "OFF")
        // - <input> labelOn  (placeholder "ON")
        // (sensor + label + requireConfirmation — поля от base)
    }

    static parseActiveConfigFields(form) {
        return {
            objectName: form.querySelector('[name="objectName"]')?.value || 'SharedMemory',
            sensorId:   parseInt(form.querySelector('[name="sensorId"]')?.value) || null,
            valueOff:   Number(form.querySelector('[name="valueOff"]')?.value ?? 0),
            valueOn:    Number(form.querySelector('[name="valueOn"]')?.value ?? 1),
            labelOff:   form.querySelector('[name="labelOff"]')?.value || '',
            labelOn:    form.querySelector('[name="labelOn"]')?.value || '',
        };
    }
}
```

### Sensor autocomplete

Переиспользуемая утилита `setupSensorAutocomplete(inputEl, hiddenIdEl, getObjectName, getServerId)`:

- При фокусе на `inputEl`: fetch top-10 sensors of objectName.
- При вводе: debounce 150ms → fetch `?search=<text>&limit=20`.
- Отрисовать выпадающий список под input.
- Стрелки ↑↓ навигация, Enter/click — выбор:
  - `inputEl.value = sensor.name`
  - `hiddenIdEl.value = sensor.id` (для парсинга в конфиг)
- Esc — закрыть suggest.
- При смене `objectName` (callback от dropdown) — очистить `inputEl.value`, `hiddenIdEl.value`.

Будет использоваться также в Setpoint widget'е (числовой задатчик), Generator widget'е и т.д. Размещение — `41-sensor-autocomplete.js` (новый файл рядом с `41-dialogs.js`).

### `ActiveDashboardWidget` — изменения foundation

```javascript
// 61-dashboard-active-base.js — diff
class ActiveDashboardWidget extends DashboardWidget {
    constructor(id, config, container) {
        super(id, config, container);
        // ... existing fields ...
        // NEW: подписаться на изменения editMode и controlToken,
        // чтобы _updateInteractivityClass() обновлялся реактивно
        this._interactivityListener = () => this._updateInteractivityClass();
        document.addEventListener('dashboardEditModeChanged', this._interactivityListener);
        document.addEventListener('controlStatusChanged', this._interactivityListener);
    }

    async writeValue(value) {
        // ... existing logic ...
        // CHANGED: URL берёт objectName из config (default 'SharedMemory' для back-compat)
        const objectName = this.config?.objectName || 'SharedMemory';
        const url = `/api/objects/${encodeURIComponent(objectName)}/ionc/set?server=${encodeURIComponent(serverId)}`;
        // ... rest unchanged, sensor_id берётся как this.config.sensorId (int64)
        body: JSON.stringify({ sensor_id: this.config.sensorId, value })
    }

    // NEW
    _updateInteractivityClass() {
        const root = this.container || this.element;
        if (!root) return;
        const interactive = this.isInteractive();
        root.classList.toggle('active-disabled', !interactive);
        if (!interactive) {
            root.dataset.controlBlocked = 'true';
            root.title = root.title || 'Take control to interact';
        } else {
            delete root.dataset.controlBlocked;
            // Не затираем title если там сообщение об ошибке записи
            if (root.title === 'Take control to interact') root.title = '';
        }
    }

    destroy() {
        document.removeEventListener('dashboardEditModeChanged', this._interactivityListener);
        document.removeEventListener('controlStatusChanged', this._interactivityListener);
        // ... existing cleanup ...
    }
}
```

Также нужно ИЗ dashboard-manager диспатчить `dashboardEditModeChanged` event при `editMode` toggle, и из `02-control.js` диспатчить `controlStatusChanged` при `updateControlStatus`. Это две точечные правки.

### Dashboard manager — read pathway fix

```javascript
// 62-dashboard-manager.js — fetchSensorValues + handleSensorUpdate
// CHANGED: вместо hardcoded 'SharedMemory' использовать widget config.objectName

// Сейчас (баг):
//   fetch(`/api/objects/SharedMemory/ionc/sensors?server=${smServerId}&search=...`)

// Будет:
//   Группируем widgets по (serverId, objectName) → один fetch на группу.
//   Для каждой группы идём в её objectName, не в hardcoded SharedMemory.
```

Это касается **всех** виджетов, не только активных. Обратная совместимость: если widget'у не задан `config.objectName`, дефолт — `'SharedMemory'`, чтобы старые сохранённые dashboard'ы продолжали работать.

## Состояния (визуальный контракт)

| Состояние | Цвет track | Позиция handle | Граница |
|---|---|---|---|
| cmd=feedback=OFF | серый (`fb-off`) | слева | нет |
| cmd=feedback=ON | зелёный (`fb-on`) | справа | нет |
| cmd=ON, feedback=OFF | серый | справа | жёлтая (`diverge`) |
| cmd=OFF, feedback=ON | зелёный | слева | жёлтая |
| cmd=*, feedback=unknown | серый-dashed (`fb-unknown`) | по cmd | жёлтая (если есть cmd) |
| pending (POST в полёте) | как cmd; opacity 0.7 | по cmd | — |
| error (POST упал) | как было; красная граница | — | красная |
| disabled (read-only / edit) | как есть; opacity 0.5; grayscale | — | — |

## CSS

Дописываем в `style.css` после foundation-блока активных стилей:

```css
.toggle-widget { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; height:100%; cursor:pointer; }
.toggle-widget .toggle-name { font-size:13px; color:#d8dce2; font-weight:600; }
.toggle-widget .toggle-track { width:72px; height:32px; border-radius:16px; position:relative; transition:background 0.15s, box-shadow 0.2s; }
.toggle-widget .toggle-track .toggle-handle { position:absolute; top:2px; width:28px; height:28px; background:#fff; border-radius:50%; box-shadow:0 1px 3px rgba(0,0,0,.4); transition:left 0.15s; }
.toggle-widget .toggle-track[data-handle-pos="left"] .toggle-handle { left:2px; }
.toggle-widget .toggle-track[data-handle-pos="right"] .toggle-handle { left:42px; }

.toggle-widget .toggle-track.fb-on  { background:#22c55e; }
.toggle-widget .toggle-track.fb-off { background:#374151; border:1px solid #4b5563; }
.toggle-widget .toggle-track.fb-unknown { background:#1f2937; border:1px dashed #6b7280; }

.toggle-widget .toggle-track.diverge { box-shadow: 0 0 0 2px #f59e0b, 0 0 8px rgba(245,158,11,0.4); }

.toggle-widget .toggle-state-text { font-size:11px; color:#9ca3af; text-transform:uppercase; }
```

Также **обновить foundation CSS**:
```css
/* Заменить data-type^="active-" на универсальный data-active-widget */
.dashboard-grid.edit-mode .dashboard-widget[data-active-widget="true"] {
    filter: grayscale(0.5);
    opacity: 0.85;
}
.dashboard-widget[data-active-widget="true"][data-control-blocked="true"],
.dashboard-widget.active-disabled {
    cursor: not-allowed;
    opacity: 0.6;
}
```

## Тестирование

### Backend (Go unit-тесты)

- `handlers_test.go`: `TestGetObjects_TypeFilter` — проверить что `?type=IONotifyController` возвращает только объекты соответствующего типа, а без параметра — все (back-compat).

### Frontend (E2E, Playwright)

`tests/single/dashboard-active-toggle.spec.ts`:

- **Конфигурирование:**
  - Открыть widget picker → выбрать Toggle.
  - В форме конфига появился dropdown «IONC Object» — выпадает список с минимум одним «SharedMemory».
  - Выбрать объект → autocomplete sensor'а активируется. Ввод «AI» → выпадают совпадения.
  - Выбрать sensor → поле заполнено, скрытый sensorId сохранён.
- **Состояния (с моком POST):**
  - cmd=feedback=ON → нет .diverge, цвет fb-on.
  - cmd=ON feedback=OFF → есть .diverge.
  - feedback=42 (unknown) → fb-unknown, title содержит «42».
- **Write-flow:**
  - Click на toggle → POST с `{ sensor_id: <int>, value: <valueOn> }` → state pending → success → idle.
- **Edit mode:**
  - В edit mode click открывает форму конфига, не делает POST.
- **Control token:**
  - Без токена widget'у выставлен `data-control-blocked="true"`, `active-disabled` класс. Click не делает POST.
- **Custom labels:**
  - `labelOff="STOP"`, `labelOn="START"` → отображаются вместо OFF/ON.
- **Read pathway fix:**
  - Создать widget с `objectName: "SharedMemory2"` (не дефолт). Подписка → fetch идёт по правильному адресу.

### Существующие E2E (regression)

Прогнать после изменений:
- `single/dashboard.spec.ts`
- `single/dashboard-sse.spec.ts`
- `single/dashboard-widgets.spec.ts`
- `single/dashboard-active-base.spec.ts` (smoke base — не должен сломаться)

## План реализации (high-level steps)

1. **Backend: расширить `/api/objects` фильтром `?type=`** + unit-тест.
2. **Foundation refactor:** `_updateInteractivityClass`, event'ы (`dashboardEditModeChanged`, `controlStatusChanged`), CSS-маркер `[data-active-widget]`, `objectName`/`sensorId` в base `writeValue`.
3. **Dashboard read-pathway fix:** группировка sensor fetches по `(serverId, objectName)` из widget config, fallback на `'SharedMemory'`.
4. **Sensor autocomplete utility** — `41-sensor-autocomplete.js` (debounce, dropdown, keyboard nav).
5. **`ToggleWidget` класс** — render, renderCommand, renderFeedback, onClick, getActiveConfigFields, parseActiveConfigFields.
6. **CSS toggle widget'а** + обновление foundation CSS.
7. **Регистрация в `WIDGET_TYPES`** (62-dashboard-manager.js).
8. **E2E тест `dashboard-active-toggle.spec.ts`.**
9. **Regression sweep** связанных spec'ов.
10. **Документация:** обновить CLAUDE.md, упомянуть toggle и sensor autocomplete utility.

## Открытые вопросы (на этапе реализации)

- **Реализация type-фильтра в `/api/objects`:** N+1 fetch объектных данных через `client.GetObjectData()` или серверный кеш типов? Если кеш — где он живёт (extending `serverMgr`)? Решить в шаге 1 (backend).
- **Кэш ID датчиков по имени.** При выборе sensor через autocomplete сохраняем оба (`sensor: "PUMP_M1_S"`, `sensorId: 42`). Что делать, если ID на сервере изменится между сохранением и использованием? Низкая вероятность (UniSet ID статичны через uniset-config), но technically может случиться при ребуте с новым XML. Защита: при HTTP 4xx от backend — попробовать резолв заново через `/sensors?search=<name>&limit=1` и retry один раз.
- **`labelOff`/`labelOn` показывать или нет** при размере виджета 2×1 (минимальный)? Возможно скрывать при `width <= 2`. Решить при реализации CSS responsive (или просто всегда показывать — если не помещается, обрезать).

## Visual QA findings (после live demo через Playwright)

- **✓ FIXED: Handle overflow в `fb-on` состоянии.** Track ранее имел
  inconsistent box dimensions (border у fb-off/unknown, без — у fb-on),
  handle вылезал за правую границу в fb-on. Поправлено: добавлены
  `box-sizing: border-box` и `border: 1px solid transparent` на
  `.toggle-track` базовый стиль, теперь все три состояния имеют тот же
  outer size 72×32 px и handle позиции (left:2 / left:42) консистентны.
  Подтверждено визуально через playwright screenshot после фикса.
- **✓ FIXED: Wrap длинного label сжимал track по вертикали.** Длинное
  имя ("TEMP SETPOINT (AI)") wrap'илось в 2 строки, flex-column сжимал
  track до 2px (вместо 32px) — визуально «наезжает по вертикали».
  Поправлено: на `.toggle-name` добавлены `white-space:nowrap`,
  `overflow:hidden`, `text-overflow:ellipsis`, `flex-shrink:0`. На
  `.toggle-track` добавлен `flex-shrink:0` — защита от сжатия в любых
  flex-условиях. Длинный label теперь обрезается ellipsis'ом
  ("TEMP SETPOIN...") вместо ломки layout'а.
- **TODO: Auto-create при программном `loadDashboard`.** При первом
  `loadDashboard()` программно injected dashboard'а (через
  `dashboardState.dashboards.set()`) создаётся «лишний» widget с
  дефолтными config'ами. Видимо `loadDashboard` триггерит config
  dialog/auto-create для каждого widget'а. Не воспроизводится в
  нормальном UI flow «Add Widget»; влияет только на программные
  E2E/demo сценарии. Изучить в первом следующем widget-плане.

## Final code review findings (TODO для следующих widget'ов)

Полное ревью реализации toggle выявило 4 момента, которые работают, но
их стоит улучшить в будущих widget-планах:

- **I-1: dual title ownership.** `ToggleWidget.renderFeedback` устанавливает
  `track.title = "actual: <value>"` напрямую на inner-элементе, а базовый
  `_recomputeTitle` пишет на `this.container`. Не пересекаются (разные
  элементы), но UX непоследователен: пользователь видит `actual:`-tooltip
  на самом track'е и `Take control to interact` вокруг него. **Будущий
  widget**: либо контракт «subclasses contributes _titleHints() → base
  resolves в одном месте», либо прямое перекрытие через subclass-override
  `_recomputeTitle`.
- **I-2: GetObjects iterates всех серверов.** `handlers.go:256` зовёт
  `serverMgr.GetAllObjectsGrouped()` и фильтрует по `serverID`, что
  приводит к N HTTP roundtrips для multi-server конфига при каждом
  открытии config-формы. **Фикс**: добавить `serverMgr.GetServerObjects(serverID)`
  и использовать его. Маленький рефактор, делается в любом widget-плане.
- **I-3: read-pathway тест проверяет write URL.** `dashboard-active-toggle.spec.ts`
  «read-pathway» test асертит `/ionc/set` URL — это write. Реальный
  read-path (fetchSensorValues с правильным objectName) не покрыт.
  **Будущий widget**: добавить отдельный test, мочащий
  `/api/objects/{configured}/ionc/sensors`.
- **I-4: ChartWidget exempt из grouping.** `fetchSensorValues` группирует
  через `sensorSubscriptions`, а ChartWidget использует `chartSubscriptions`
  и может иметь свой read-pathway. **Проверить** в плане для setpoint
  виджета (там тоже может быть свой fetch).

Также reviewer отметил, что **`config.sensorId` и `config.objectName` —
универсальные** для всех 5 запланированных активных виджетов. Стоит
promote их в `ActiveDashboardWidget` базовый класс (вместе с
`usesNewSensorAutocomplete=true` дефолтом). Это убирает дубль `parseConfigForm`
в каждом виджете и делает opt-in поведение ToggleWidget'а дефолтом для
всех активных виджетов. Сделать в первом из следующих planов (checkbox).

## Future enhancements (не в этом плане)

- **Несколько визуальных стилей toggle.** По аналогии с `GaugeWidget` (style: `'semicircle' | 'arc270' | 'speedometer' | 'dual'`), у toggle тоже могут быть разные внешние виды:
  - `slider` (текущий выбранный) — slide-переключатель с handle.
  - `button-pair` — две прямоугольные кнопки [OFF][ON], нажатая = подсветка.
  - `industrial` — большая красно-зелёная «грибная» кнопка SCADA-стиля (один большой круглый элемент с лампочкой).
  - `lever` — рубильник вверх/вниз.
  - `pill` — компактная капсула (для маленьких размеров).
  - `radio` — радио-кнопка из группы (только одна активна). **Семантически отличается** от остальных стилей: требует группу widget'ов с общим group-id, изменение одного снимает остальные. Сложнее (требует cross-widget coordination). Отдельный план.

  Реализация: в config добавить `style: 'slider'` (default), в `render()` диспатч на `renderSlider()/renderButtonPair()/...` (паттерн `GaugeWidget`). В форме конфига — `<select>` с превью.

  Отдельная задача после первой версии toggle. Каждый стиль — отдельный brainstorm дизайна и итерация в spec'е.
