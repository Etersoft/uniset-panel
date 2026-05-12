# Color Zones Reuse Picker — Design Document

> **Status:** Approved (brainstorm → spec). Ready for implementation plan.
> **Date:** 2026-05-12
> **Author:** Pavel Vaynerman (with Claude)

## Goal

Дать пользователю быстрый способ переиспользовать ранее введённые наборы цветовых зон в виджетах Setpoint (slider), Gauge и Level — без необходимости перенабирать одни и те же `{from, to, color}` от виджета к виджету.

Целевой use-case: пользователь строит dashboard с многими однотипными виджетами (например, 10 температурных gauge'ев), все из которых должны разделять одну палитру. И/или хочет одним кликом применить только что использованный набор.

## Non-goals

- Именованная библиотека «канонических» палитр (user явно не нужно — preview достаточно для опознания).
- Сложный CRUD-UI для истории (FIFO cap = `ZONES_HISTORY_MAX` чистит сам).
- Cross-device sync (localStorage достаточен, backend-storage — overkill).
- Auto-scaling зон при копировании между виджетами с разными `[min, max]` (другая семантика, неочевидно).

## User experience

Открывая config-форму виджета (Setpoint slider / Gauge / Level), пользователь видит над секцией «Color Zones» новый блок **Reuse zones**:

- Всегда видим (не collapsible) когда есть хоть один источник.
- Сгруппирован по источникам: ★ Recent → [current widget type] → other types.
- Sticky group-headers при прокрутке.
- Каждый item — preview-chip: пропорциональная цветная мини-полоса с подписями `from–to` + источник (sensor name для widget'ов, относительная дата для recent).
- Click на chip → текущее содержимое `.zones-list` заменяется зонами из выбранного набора. Inputs остаются редактируемыми.
- Empty state (нет ни recent, ни widget'ов на dashboard'е): блок скрыт целиком.

Никаких разрушительных действий в UI. История чистится только автоматически через FIFO cap.

Визуально: блок с заголовком «REUSE ZONES · N saved», ниже — scrollable область высотой `ZONES_PICKER_MAX_HEIGHT_PX` со sticky headers секций. Каждый chip — пропорциональная цветная мини-полоса (`flex` сегментов = `to-from`), под ней source-label. Recent-headers и labels подсвечены золотистым (`#fbbf24`); same-class — голубым (`#93c5fd`); прочие — серым.

## Architecture

### Data sources

Два независимых источника, объединённые в один picker:

| Источник | Хранилище | Жизненный цикл |
|---|---|---|
| **From dashboard widgets** | Live-read из `dashboardState.dashboards.get(currentDashboardId).widgets[]`, фильтр `config.zones.length > 0`, исключая текущий редактируемый widget. | Эфемерный, всегда отражает текущее состояние dashboard'а. |
| **Recent (history)** | `localStorage["uniset.zonesHistory"]` — JSON-массив объектов `{ zones, timestamp, sourceWidgetType }`, ограничен `ZONES_HISTORY_MAX` (10). | Persistent per-browser, push после успешного save виджета с непустыми зонами. |

### Deduplication

Для history — dedup по канонизированному ключу:
1. Сортировка `zones` по `from` ascending.
2. Lowercase всех `color` strings.
3. Fixed precision для `from`/`to` (например `Number(v).toFixed(6)` — отбрасывает плавающие хвосты).
4. `JSON.stringify` результата → ключ.

Если канонический ключ уже в history — старый запись не удаляется, новый push в начало (move-to-front). Cap=`ZONES_HISTORY_MAX` отсекает хвост.

### Cross-widget-type policy

Все 3 виджета используют одинаковую структуру `{from, to, color}` — копирование AS-IS работает технически. Если у целевого виджета другой `[min, max]` (например zone 700-1000 в виджете с диапазоном 0-100), некоторые сегменты выйдут за пределы — пользователь увидит это в preview и поправит руками. Никакого автомасштабирования — это другая семантика, неочевидно нужно ли вообще.

## Components

### New code in `06-utils.js`

Центральная инфраструктура зон уже там; расширяем тем же модулем.

| Function | Signature | Responsibility |
|---|---|---|
| `getZonesHistory()` | `() → Array<{zones, timestamp, sourceWidgetType}>` | Читает localStorage, возвращает array (или `[]` если ключ отсутствует / parse-error). |
| `addZonesToHistory(zones, sourceWidgetType)` | `(zones, type) → void` | Канонизирует, dedup move-to-front, cap=`ZONES_HISTORY_MAX`, save в localStorage. No-op для пустого `zones`. |
| `getDashboardZoneSources(currentDashboardId, excludeWidgetId)` | `(dashId, excludeId) → Array<{widgetId, widgetType, sensorLabel, zones}>` | Читает `dashboardState`, фильтрует widget'ы с zones, исключает текущий. Sensor-label = `config.sensor` или `config.label` или widget id. |
| `renderZonesReusePicker(currentWidgetType, currentDashboardId, currentWidgetId)` | `(type, dashId, widgetId) → string \| ''` | Полный HTML блока picker'а. Группировка: Recent → same-type → other types (по `displayName` алфавитно). Возвращает `''` если оба источника пусты. |
| `renderZoneChipBar(zones)` | `(zones) → string` | Рендерит мини-полосу — список `<span style="background:color;flex:weight">from–to</span>`. Weight пропорционален `(to-from)`. |
| `applyZonesToEditor(form, zones)` | `(formEl, zones) → void` | Перерендерить `.zones-list` внутри `form` — удалить старые `.zone-item`, добавить новые через `renderColorZoneItem`. |
| `setupZonesReusePicker(form)` | `(formEl) → void` | Бинарь click delegation на `.zone-chip` элементах внутри picker'а; читает `data-zones-json` атрибут chip'а → `applyZonesToEditor(form, parsed)`. Idempotent через `form.dataset.zonesPickerWired`. |

### Changes to widget config forms

В трёх местах (`61-dashboard-widget-gauge.js`, `61-dashboard-widgets.js` для Level, `61-dashboard-active-setpoint.js`) обернуть существующий `renderColorZonesEditor(...)` блоком picker'а сверху:

```js
// Before
${renderColorZonesEditor(zones, '#3b82f6')}

// After
${renderZonesReusePicker('gauge', currentDashboardId, currentWidgetId)}
${renderColorZonesEditor(zones, '#3b82f6')}
```

И в обработчике открытия config-dialog'а (где он есть в каждом виджете или централизованно в dashboard-manager) — после рендера формы в DOM вызвать:

```js
setupZonesReusePicker(formElement);
```

### Save-time history push

В `62-dashboard-manager.js` (или там где widget config saves) после успешного save виджета:

```js
const zones = newConfig.zones || [];
if (zones.length > 0) {
    addZonesToHistory(zones, widget.constructor.type);
}
```

### New constants in `00-constants.js`

```js
const ZONES_HISTORY_MAX = 10;
const ZONES_PICKER_MAX_HEIGHT_PX = 220;
const ZONES_HISTORY_STORAGE_KEY = 'uniset.zonesHistory';
```

### CSS in `style.css`

Новые селекторы (см. mockup для финального стиля):
- `.reuse-picker`, `.reuse-header`, `.reuse-count`, `.reuse-scroll`
- `.group-label`, `.group-label.group-recent`, `.group-label.group-same-class`, `.group-divider`, `.group-count`
- `.zone-chip`, `.zone-bar`, `.zone-bar > span`, `.chip-source`, `.chip-source.recent-source`
- Кастомный scrollbar на `.reuse-scroll` (webkit-only прозрачный 6px-thumb)
- `max-height: var(--zones-picker-max-height, 220px)` — или inline через JS из константы

## Data flow

```
user opens widget config dialog
    │
    ▼
form HTML built:
  - renderZonesReusePicker(type, dashboardId, widgetId) → HTML
  - renderColorZonesEditor(currentZones)
    │
    ▼
DOM mounted
    │
    ▼
setupZonesReusePicker(form, type):
  - delegated click handler on .zone-chip
    │
    ▼  (user clicks chip)
applyZonesToEditor(form, zones):
  - clear .zones-list
  - render each zone via renderColorZoneItem
    │
    ▼  (user clicks Save)
parseColorZones(form) → zones array
manager.saveWidget(config)
    │
    ▼
addZonesToHistory(zones, widgetType):
  - canonicalize → dedup → move-to-front → cap=ZONES_HISTORY_MAX
  - localStorage.setItem
```

## Edge cases

| Case | Behavior |
|---|---|
| Empty Recent + empty dashboard sources | `renderZonesReusePicker` возвращает `''` — блок не виден. |
| Только Recent (новый dashboard) | Группа Recent рисуется, остальные секции отсутствуют. |
| Только dashboard widgets | Recent-секция отсутствует. |
| User применил zones из Recent и сразу save | Dedup — длина history не растёт (move-to-front). |
| User добавил 11-й уникальный набор | Самый старый вытесняется (FIFO cap). |
| Click chip когда уже есть зоны в editor'е | Replace (без confirm dialog'а). Это явное действие, undo через ручное добавление зон обратно. |
| Cross-type apply (Gauge → Setpoint с разными min/max) | Зоны вставляются AS-IS; пользователь видит несоответствие в preview-chip'е и правит. |
| `localStorage` quota exceeded / parse error | `getZonesHistory()` ловит exception, возвращает `[]`. `addZonesToHistory` ловит exception, silent log в console.warn. |
| Текущий widget исключается из «from dashboard» | По `widgetId` — чтобы не было «копировать в себя». |
| Source widget удалён с dashboard'а после открытия dialog'а | Snapshot на момент открытия (live re-read только при следующем open). |

## Testing

E2E spec `tests/single/dashboard-zones-reuse.spec.ts` — 6 тестов:

1. **Cross-widget reuse from dashboard**
   - Создать Gauge с zones `[0-30 blue, 30-70 green, 70-100 red]` → создать новый Level → config dialog → picker показывает Gauge-zones в группе `Gauge` → click chip → новый Level имеет те же 3 zones.

2. **History push on save**
   - Создать widget с zones → save → закрыть dialog → открыть config другого widget → picker содержит эти zones в группе `★ Recent`.

3. **History dedup**
   - Применить zones из Recent → save без изменений → `localStorage["uniset.zonesHistory"]` длина не выросла (move-to-front проверяется по timestamp).

4. **FIFO cap**
   - Save `ZONES_HISTORY_MAX + 1` уникальных zone-set'ов → длина history ровно `ZONES_HISTORY_MAX`, самый старый отсутствует.

5. **Empty state**
   - Чистый browser (`localStorage.clear()`) + dashboard без widget'ов с zones → создать widget → picker блок не в DOM.

6. **Same-type-first ordering**
   - На dashboard'е есть Gauge-with-zones и Level-with-zones → editing нового Gauge → в picker'е группа `Gauge (same type)` идёт раньше `Level`.

Unit tests (vitest) для `06-utils.js`:
- `addZonesToHistory` — dedup, cap, move-to-front, empty no-op.
- Canonicalization — sort by from, lowercase colors, precision normalization.

## Scope

3 виджета, ~150 строк JS + ~80 CSS, без backend changes, без schema migration. Один implementation plan.

## Open Decisions

Все решения зафиксированы:

| Аспект | Решение |
|---|---|
| Layout | Inline (always visible когда непуст), не collapsible |
| Группировка | Recent → same-class → other widget types (alphabetical by displayName) |
| Scroll | `max-height: ZONES_PICKER_MAX_HEIGHT_PX`, sticky group-headers, custom 6px scrollbar |
| Источник в chip'е | sensor name (тип ясен из заголовка группы); recent — относительная дата |
| Управление history | Auto FIFO cap=`ZONES_HISTORY_MAX`, без manual delete UI |
| Empty state | Весь блок скрыт |
| Cross-widget-type apply | AS-IS (без auto-scaling диапазонов) |
| Магические числа | Именованные константы в `00-constants.js` |
| Replace vs append при click chip | Replace (без confirm) |
