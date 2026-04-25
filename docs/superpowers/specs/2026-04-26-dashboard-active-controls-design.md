# Dashboard Active Controls — Design

**Дата:** 2026-04-26
**Ветка:** `story/dashboard-active-controls` (создаётся от `master`)
**Статус:** Draft → ожидает review

## Контекст

В uniset-panel есть полноценная система dashboard'ов (`60-dashboard-base.js`, `61-dashboard-widgets.js`, `62-dashboard-manager.js`) с 9 пассивными виджетами для отображения значений датчиков: gauge, level, led, label, divider, statusbar, bargraph, digital, chart. Все они read-only — берут значение из IONC/SharedMemory через SSE и рисуют.

Запись значений в датчики уже умеют другие части UI (IONC renderer): `POST /api/objects/{name}/ionc/set?server=...` (`internal/api/handlers_ionc.go:95`), защищённый механизмом `controlToken` (`internal/api/control.go`). В IONC renderer уже есть генератор сигналов (square/sin/cos/linear/random) — `ui/static/js/src/20-ionc-renderer.js:1395+`.

Задача: расширить библиотеку dashboard'а активными виджетами, которые умеют записывать значения в привязанные uniset-датчики.

## Цели

- Добавить активные виджеты dashboard'а: **toggle**, **checkbox**, **push button**, **analog setpoint**, **signal generator**.
- Использовать существующий API записи (`POST .../ionc/set`) и существующий controlToken — никаких новых backend endpoint'ов.
- Поддержать «two-way» отображение: каждый активный виджет показывает и команду (что мы хотим выставить), и обратную связь (что фактически вернул сервер).
- Вынести движок генератора сигналов из IONC renderer'а в общий модуль, переиспользуемый dashboard'ом и IONC.
- Сохранить существующий паттерн виджетов (`static type`, `static getConfigForm`, регистрация в `WIDGET_TYPES`).

## Не-цели

- Нет цели поддерживать запись через Modbus/OPCUA/UWSGate напрямую на этом этапе. Запись только через IONC/SharedMemory (как и текущее чтение dashboard'а).
- Нет цели менять механизм controlToken (`internal/api/control.go`).
- Нет цели проектировать визуальные детали каждого виджета здесь — это отдельные шаги в плане реализации.
- Нет цели добавлять role-based ACL (кто может что писать) — controlToken остаётся единственным барьером.

## Принятые решения

| Решение | Выбор | Обоснование |
|---|---|---|
| Набор виджетов | toggle, checkbox, push button, analog setpoint, signal generator | Ответ пользователя |
| Архитектура | `ActiveDashboardWidget extends DashboardWidget` + наследники | Соответствует текущему паттерну (`GaugeWidget`, `LevelWidget` …); чистая граница активный/пассивный |
| Generator engine | Извлечь в общий модуль, рефакторить IONC renderer | Избегаем дубликата логики |
| Two-way binding | Виджет показывает и команду, и обратную связь | Стандарт SCADA; конкретный визуал — отдельные шаги |
| Источник min/max/step setpoint | Из конфига виджета | Просто, без зависимости от IONC-метаданных |
| Подтверждение записи | Опция `requireConfirmation` в конфиге, по умолчанию выкл. | controlToken уже защищает; для опасных выходов включается явно |
| Поведение в edit mode | Активные виджеты неинтерактивны в edit mode | Избежать случайных записей при перетаскивании/настройке |
| Backend изменения | Не требуются | Используется существующий `SetIONCSensorValue` |

## Архитектура

### Backend
Изменений нет. Используются существующие:
- `POST /api/objects/{name}/ionc/set?server=...` (`internal/api/handlers_ionc.go:95`)
- `checkControlAccess()` (`internal/api/handlers_control.go:139`)
- SSE-канал значений датчиков (как в текущем dashboard'е)

Если в ходе реализации генератора выявится нужда в батч-write API (один POST на N значений), это будет отдельный шаг с собственным sub-design.

### Frontend

**Новые файлы:**

| Файл | Назначение |
|---|---|
| `ui/static/js/src/08-signal-generator.js` | Общий движок генератора сигналов (square/sin/cos/linear/random). Извлечён из IONC renderer'а. Префикс `08` — после core utils (06), до renderers (10+); IONC renderer (20+) и dashboard widgets (61+) могут на него ссылаться |
| `ui/static/js/src/61-dashboard-active-base.js` | `ActiveDashboardWidget extends DashboardWidget` — общая логика write/feedback/edit-mode/состояний |
| `ui/static/js/src/61-dashboard-active-toggle.js` | `ToggleWidget extends ActiveDashboardWidget` |
| `ui/static/js/src/61-dashboard-active-checkbox.js` | `CheckboxWidget extends ActiveDashboardWidget` |
| `ui/static/js/src/61-dashboard-active-button.js` | `PushButtonWidget extends ActiveDashboardWidget` |
| `ui/static/js/src/61-dashboard-active-setpoint.js` | `SetpointWidget extends ActiveDashboardWidget` |
| `ui/static/js/src/61-dashboard-active-generator.js` | `GeneratorWidget extends ActiveDashboardWidget` |

Префикс **`61-dashboard-active-*.js`** — единый префикс гарантирует, что в конкатенации (lex-order на имени) `61-dashboard-active-base.js` подгрузится **раньше** наследников. Если использовать укороченные имена (`61-active-toggle.js`), они лексически окажутся до базового класса и сломают загрузку.

**Изменяемые файлы:**

| Файл | Изменение |
|---|---|
| `ui/static/js/src/20-ionc-renderer.js` | Заменить локальный генератор на вызовы общего модуля |
| `ui/static/js/src/62-dashboard-manager.js` | Зарегистрировать новые типы в `WIDGET_TYPES` |
| `ui/static/js/src/00-constants.js` | Добавить константы (цвета индикаторов, времена анимаций состояний) |
| `ui/static/css/style.css` | Стили активных состояний (pending/success/error/disabled) |

**Базовый класс — контракт:**

```
class ActiveDashboardWidget extends DashboardWidget {
    // Состояние
    commandValue       // что пользователь установил
    feedbackValue      // что вернул сервер (= this.value базового класса)
    writeState         // 'idle' | 'pending' | 'success' | 'error'

    // Запись
    async writeValue(value)        // controlledFetch → POST /ionc/set, обновляет writeState
    isInteractive()                // false в edit mode, true в view mode
    needsConfirmation()            // читает config.requireConfirmation

    // Two-way отображение
    renderCommand()                // override в наследнике — показ команды
    renderFeedback()               // override — показ обратной связи
    update(value, error)           // приходит от SSE, обновляет feedbackValue

    // Конфиг
    static getConfigForm(config)   // sensor + label + requireConfirmation + getActiveConfigFields()
    static getActiveConfigFields(config)  // override — поля специфичные для виджета
}
```

### Two-way binding модель

Каждый активный виджет хранит и показывает **две** величины:
- **command** — последняя команда, отправленная пользователем (локально)
- **feedback** — текущее значение датчика от сервера (через SSE)

Расхождение command/feedback визуализируется (например: индикатор-точка «зелёный=совпадает / серый=ожидание / красный=ошибка»). Конкретный дизайн каждого виджета — отдельный шаг в плане реализации (с проработкой и согласованием).

Состояния записи (`writeState`):
- `idle` — нет активной операции
- `pending` — POST в полёте (виджет полупрозрачный / индикатор)
- `success` — последняя запись успешна (показывается короткое время, затем `idle`)
- `error` — последняя запись провалилась (текст ошибки в tooltip)

### Generator engine

Извлекаемая часть из `20-ionc-renderer.js:1395+`:
- Чистые функции вычисления значения по типу (`square`, `sin`, `cos`, `linear`, `random`) с параметрами min/max/step/period/pulseWidth/pause.
- Менеджер тиков (`setInterval` + lifecycle).
- Колбэк `onTick(value)` — куда отправлять (IONC: `setValueForGenerator`; dashboard: `writeValue`).

IONC renderer переключается на новый модуль без изменения внешнего поведения.

Для генератора в dashboard'е `requireConfirmation` принудительно отключён — диалог на каждый тик абсурден.

### Edit mode и взаимодействие

- В **edit mode** (`dashboardState.editMode === true`):
  - Клик по активному виджету не вызывает запись, а открывает форму конфигурации (как у пассивных виджетов)
  - Виджет визуально показан как «inactive» (полупрозрачный/grayscale), чтобы было понятно
  - Запущенные генераторы автоматически останавливаются при переходе в edit
- В **view mode**:
  - Виджет принимает клики/ввод и инициирует запись
  - Если controlToken не активен у этого клиента — виджет показывает блокированное состояние с tooltip «Take control to interact»

### CSS / константы

В `00-constants.js`:
- `WRITE_PENDING_TIMEOUT_MS` — сколько ждать ответ POST до показа ошибки
- `WRITE_SUCCESS_DISPLAY_MS` — сколько показывать «success» индикатор перед возвратом в idle
- Цвета индикаторов состояний (если не вынесены в CSS-переменные)

В `style.css`:
- `.dashboard-widget.active-pending`, `.active-success`, `.active-error`, `.active-disabled`
- Общие стили для индикатора расхождения command/feedback

## Тестирование

**Backend:** изменений нет — существующие тесты `SetIONCSensorValue` покрывают write-path.

**Frontend (E2E, Playwright, `make js-tests`):**
- Per-widget тест: создать dashboard с одним активным виджетом, выполнить взаимодействие, проверить:
  - HTTP-запрос ушёл с правильным телом
  - SSE-feedback обновил отображение
  - Состояния pending/success/error переключаются
- Тест controlToken: без токена — виджет заблокирован; после take control — активен
- Тест edit mode: клик по виджету в edit mode не пишет; в view mode пишет
- Тест generator: запуск/остановка, тики идут с заданным интервалом

Mock-сервер (`tests/mock-server/server.js`) расширяется по необходимости (приём POST .../ionc/set, симуляция SSE feedback).

## План реализации (high-level steps)

1. **Создать ветку** `story/dashboard-active-controls` от `master`.
2. **Generator engine** — вынести в общий модуль (`0X-signal-generator.js`), рефакторить IONC renderer, проверить что IONC e2e тесты проходят.
3. **`ActiveDashboardWidget` базовый класс** — контракт + общие CSS-состояния + edit-mode disable + интеграция с controlToken.
4. **Toggle widget** — отдельная проработка дизайна (команда/feedback), реализация, e2e.
5. **Checkbox widget** — отдельная проработка дизайна, реализация, e2e.
6. **Push button widget** — отдельная проработка дизайна, реализация, e2e.
7. **Analog setpoint widget** — отдельная проработка дизайна (slider/stepper/input/Apply-button), реализация, e2e.
8. **Signal generator widget** — отдельная проработка дизайна (тип сигнала + параметры + start/stop), реализация, e2e.
9. **Документация** — обновить раздел dashboard в CLAUDE.md (если нужно), добавить пример dashboard'а с активными виджетами в `dashboards/`.

Каждый шаг = отдельный коммит / задача beads. Дизайн виджета (шаги 4–8) — это отдельный мини-этап внутри шага: brainstorm визуального решения → согласование → реализация → e2e.

## Открытые вопросы (на этапе реализации)

- **CSS-маркер активного виджета.** В foundation CSS использует селектор `[data-type^="active-"]` (для edit-mode grayscale и `active-disabled`). Это работает только если все типы виджетов начинаются с префикса `active-` — что нарушает естественное именование (`toggle` vs `active-toggle`). Решение для первого widget-плана: сменить маркер на `container.dataset.activeWidget = 'true'` (выставлять в dashboard manager при `widget instanceof ActiveDashboardWidget`) и переписать CSS на `[data-active-widget="true"]`. Это позволит концретным виджетам называться естественно (`toggle`, `checkbox`, ...) и легко мигрировать существующие пассивные виджеты в active при необходимости.
- **`active-disabled` индикатор отсутствует.** CSS-классы `.active-disabled` и `[data-control-blocked="true"]` определены, но базовый класс их не выставляет. `isInteractive()` сейчас просто молча игнорирует клик, без UX-фидбэка ("ничего не произошло"). Фикс на foundation-уровне в первом widget-плане: добавить в `ActiveDashboardWidget` метод `_updateInteractivityClass()`, вызывать при изменениях `editMode`/`controlToken`, выставлять `active-disabled` класс / `data-control-blocked` атрибут.
- **Hardcoded `SharedMemory` в URL.** `61-dashboard-active-base.js:60` строит `/api/objects/SharedMemory/ionc/set?...`. На реальных кластерах IONC-объект может называться по-другому (`SharedMemory1`, `IOC`, etc.). Решение: либо `config.objectName` (default `'SharedMemory'`), либо автодетект через первый IONC-объект первого подключённого сервера. Решить в первом widget-плане.
- **`sensor_id` — тип (резолв имени → ID).** Dashboard'е сейчас привязка к датчикам делается по **имени** (`config.sensor` — строка), а backend `POST /api/objects/{name}/ionc/set` (`internal/api/handlers_ionc.go:95`) ожидает `IONCSetRequest.SensorID` типа `int64`. В foundation смок-тесте это обнаружено (Task 4.2): тест мочит endpoint напрямую, потому что real backend отклоняет строковый `sensor_id`. Решение для concrete widget'ов (toggle/checkbox/etc):
  - Вариант A: хранить в `config.sensorId` (число) рядом с `config.sensor` (строка для UI), резолвить через IONC sensor lookup при сохранении конфига.
  - Вариант B: расширить backend POST API так, чтобы принимал и имя.
  - Вариант C: резолвить на лету в `writeValue()` через `state.sensorsByName` cache.
  Конкретное решение — отдельный шаг в первом widget-плане (toggle).
- **Overlay `.widget-header.hidden-title` перекрывает кликабельные элементы виджета.** Обнаружено в smoke-тесте (Task 4.2): `.widget-header` имеет `position:absolute; z-index:10` и перекрывает верхнюю полосу любого виджета. Real users тоже могут попадать в overlay вместо нужной кнопки. Concrete active widgets должны либо: (a) поднимать interactive elements ниже overlay'я (top padding), (b) подавлять overlay в view mode для active widget'ов, (c) применять `pointer-events: none` к overlay в view mode. Решить в первом widget-плане.
- Возможен ли пакетный write API для генератора (несколько виджетов с одинаковым тиком → один POST). Решается, если возникнет проблема производительности.
- Нужна ли в IONC renderer'е отдельная страховка, что при отключении SSE генераторы тоже останавливаются (возможно, уже есть).
