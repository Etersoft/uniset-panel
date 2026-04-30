# Dashboard: multi-IONC support for all widgets — design

> **Status:** approved (ready for writing-plans)
> **Date:** 2026-04-30
> **Branch:** story/dashboard-active-controls (continued)

## Goal

Распространить «full IONC binding» (server select + IONC object dropdown + sensor
autocomplete с резолвом числового `sensorId`), который сейчас реализован только
в `ActiveDashboardWidget`, на **все** dashboard виджеты (Gauge, Level, Led,
Digital, StatusBar, BarGraph, Chart). Multi-sensor виджеты (StatusBar, BarGraph,
Chart) поддерживают **per-item** triplet — каждый item/sensor в виджете может
быть с разного сервера и/или разного IONC объекта.

## Background

- Active widgets (Toggle/Checkbox/PushButton/Setpoint/Generator) уже используют
  unified config form: `serverId` + `objectName` + `sensor` + `sensorId`. См.
  `61-dashboard-active-base.js` `getConfigForm`/`parseConfigForm`/`initConfigHandlers`.
- Read-only widgets (Gauge, Level, Led, Digital) до сих пор имеют только
  `<input name="sensor">` plain text + legacy in-memory autocomplete на основе
  глобального `state.sensorsByName` (без явного выбора сервера/объекта). См.
  `61-dashboard-widgets.js` (различные `static getConfigForm`).
- Multi-sensor widgets (StatusBar `items[].sensor`, BarGraph `items[].sensor`,
  Chart `zones[].sensors[].name`) хранят только `sensor` (имя), без объекта/сервера.
- Backend `BasePoller.poll()` skip'ает объект если subscriptions empty —
  `_subscribeActiveSensorsBackend()` сейчас работает только для виджетов с
  numeric `sensorId` (т.е. active). Legacy widgets пока работают за счёт
  side-effect от других подписчиков (Objects tab).

## Decisions (from brainstorming)

| Q | Choice |
|---|---|
| **Q1.** Scope multi-sensor виджетов | **A.** Per-item server/object/sensor/sensorId. Items в одном виджете могут быть с разных серверов. |
| **Q2.** Migration legacy dashboards | **A.** Lazy resolve через `state.sensorsByName` (берёт первый match), один console.warn на dashboard, без auto-save на сервер. |
| **Q3.** Архитектура | **B.** Helper-функции в `60-widget-sensor-binding.js`. Каждый виджет (включая `ActiveDashboardWidget`) вызывает явно. Без mixins/intermediate classes. |
| **UX detail.** Add item в multi-sensor | server+object pre-fill из last item; sensor input пустой. |

## Architecture

### New module: `ui/static/js/src/60-widget-sensor-binding.js`

Concat (`ui/concat.go`) использует `sort.Strings()` — pure lex sort. Таким
образом порядок будет: `60-dashboard-base.js` → `60-widget-sensor-binding.js`
→ `61-dashboard-active-base.js` → `61-dashboard-active-*.js` → `61-dashboard-widgets.js`
→ `62-dashboard-manager.js`. Helpers загружаются ПОСЛЕ `DashboardWidget`, но
это OK: helpers вызываются только из static методов виджетов (`getConfigForm`,
`parseConfigForm`, `initConfigHandlers`), которые исполняются при открытии
config dialog (после DOMContentLoaded), не при class definition.

Экспортируемые функции (на `window`):

```js
// Render server select + IONC object dropdown + sensor input + hidden sensorId.
// opts: { fieldPrefix='', requireSensor=true, sensorLabel='Sensor',
//         objectNameDefault='SharedMemory', includeStyleSlot=false,
//         includeLabel=true, includeRequireConfirmation=false }
renderSensorBindingFields(config, opts)

// Парсит из form по prefix. Returns { serverId, objectName, sensor, sensorId }.
parseSensorBindingFields(form, opts)

// Wire'ит loadIONCObjects (token-guarded reload при смене server) +
// setupSensorAutocomplete + change handlers.
// Idempotent через form.dataset[`sensorBinding_${prefix}_wired`].
// Возвращает { resetSensor() } для внешнего вызова.
initSensorBindingHandlers(form, config, opts)

// Render одной row для multi-sensor item (server+object+sensor + extraFieldsHtml).
// opts: { idx, item, extraFieldsHtml, removable=true, rowClass='sensor-item' }
renderSensorItemRow(opts)

// Wire add/remove + per-item handlers + pre-fill server/object из last item.
// opts: { addBtnSelector, containerSelector, rowClass, defaultItem,
//         renderRow(item, idx), parseExtraFields(itemEl, idx) }
initSensorItemListHandlers(form, config, opts)

// Парсит items[] из form (rowClass селектором).
// opts: { rowClass, parseExtraFields(itemEl, idx) }
parseSensorItemList(form, opts)
```

`fieldPrefix` контракт:
- `''` (пусто) — single-sensor виджет, поля `name="serverId"` etc.
- `'sensor2-'` — setpoint feedback sensor (serverId2/objectName2/sensor2/sensorId2).
- `'item-${idx}-'` — multi-sensor items.

### `ActiveDashboardWidget` рефакторинг

`getConfigForm` / `parseConfigForm` / `initConfigHandlers` теперь вызывают
helpers (`renderSensorBindingFields` + style + label + requireConfirmation).
Подклассы (Toggle/Checkbox/PushButton/Setpoint/Generator) **не меняются** —
overrides `getActiveConfigFields` / `parseActiveConfigFields` остаются те же.

### Single-sensor read-only widgets

`GaugeWidget`, `LevelWidget`, `LedWidget`, `DigitalWidget` — `getConfigForm`
начинается с `renderSensorBindingFields(config, { includeStyleSlot: false })`
вместо ручного `<input name="sensor">`. `parseConfigForm` начинается с
`{ ...parseSensorBindingFields(form), <existing fields> }`. `initConfigHandlers`
(новый или extended) вызывает `initSensorBindingHandlers`.

`GaugeWidget` style="dual" имеет `sensor2` для target/setpoint reference —
тоже мигрирует на `renderSensorBindingFields(config, { fieldPrefix: 'sensor2-' })`.

### Multi-sensor widgets

`StatusBarWidget`, `BarGraphWidget`:
- `getConfigForm` рендерит widget-level fields (layout/orientation) + container
  для items + `+ Add` кнопка.
- `initConfigHandlers` вызывает `initSensorItemListHandlers(form, config, {
  addBtnSelector, containerSelector, rowClass, defaultItem,
  renderRow, parseExtraFields })`.
- `parseConfigForm` использует `parseSensorItemList(form, { rowClass, parseExtraFields })`
  для `items[]`.

`ChartWidget`:
- Отдельная структура zones[].sensors[]. Используем те же helpers,
  но с `rowClass='chart-sensor-row'` и nesting по zones (внешний loop).
- `+ Add Sensor` в zone — новая строка с pre-filled server+object.
- `+ Add Zone` — новая zone, первый sensor с pre-filled server+object из
  last sensor предыдущей zone.
- Удаляем `ChartWidget.getSensorNames()` (manager напрямую читает zones).
- Удаляем `setupChartWidgetAutocomplete()` global helper (заменён helpers).

### Label / Divider

Не меняются (нет sensor binding).

## Config schema по виджетам

### Single-sensor read-only

```jsonc
{
  "type": "gauge",
  "serverId": "77b5af18",
  "objectName": "SharedMemory",
  "sensor": "AI_Temp_S",
  "sensorId": 1042,
  "label": "Temperature",
  // widget-specific:
  "min": 0, "max": 100, "unit": "°C", "decimals": 1, "style": "default",
  "zones": [...]
}
```

GaugeWidget style="dual" дополнительно:
```jsonc
{
  "serverId2": "77b5af18",
  "objectName2": "SharedMemory",
  "sensor2": "AI_Setpoint",
  "sensorId2": 1043
}
```

### Active widgets (Toggle/Checkbox/PushButton/Setpoint/Generator)

Без изменений — уже используют этот формат. Setpoint feedback sensor (sensor2)
тоже использует prefix `sensor2-` с тем же набором полей.

### Multi-sensor StatusBar / BarGraph

```jsonc
{
  "type": "statusbar",
  "layout": "horizontal",
  "items": [
    {
      "serverId": "77b5af18",
      "objectName": "SharedMemory",
      "sensor": "Pump1_Run",
      "sensorId": 2001,
      "label": "Pump 1",
      "threshold": 0.5,
      "onColor": "#22c55e",
      "offColor": "#6b7280"
    },
    { "serverId": "abc12345", "objectName": "DigitalInputs", "sensor": "Door", "sensorId": 504, ... }
  ]
}
```

### Multi-sensor Chart

```jsonc
{
  "type": "chart",
  "zones": [
    {
      "id": "zone-0",
      "sensors": [
        {
          "serverId": "77b5af18",
          "objectName": "SharedMemory",
          "sensor": "AI_Temp_S",
          "sensorId": 1042,
          "color": "#3274d9",
          "smooth": true, "fill": true, "stepped": false
        }
      ]
    }
  ],
  "timeRange": 900000,
  "showTable": true,
  "useTextname": false,
  "tableHeight": 100
}
```

### Label / Divider — без изменений.

## Migration of legacy dashboards

**Trigger:** в `loadDashboard(name)` перед `createWidget()` для каждого виджета.

**`_migrateLegacyBinding(config, widgetType)`** (метод DashboardManager):

```js
_migrateLegacyBinding(cfg) {
    if (!cfg) return cfg;
    let migrated = 0;

    const resolveBinding = (b) => {
        // b — объект с потенциально неполным { serverId, objectName, sensor, sensorId }.
        if (!b?.sensor) return false;
        if (b.serverId && b.objectName && Number.isFinite(b.sensorId)) return false; // already full
        const info = state.sensorsByName?.get(b.sensor);
        if (!info) return false; // sensorsByName не прогрет — отложим
        if (!b.serverId)   b.serverId   = info.serverId;
        if (!b.objectName) b.objectName = info.objectName;
        if (!Number.isFinite(b.sensorId) && Number.isFinite(info.id)) b.sensorId = info.id;
        return true;
    };

    if (resolveBinding(cfg)) migrated++;
    // sensor2 (setpoint feedback / gauge dual)
    if (cfg.sensor2) {
        const b2 = {
            serverId:   cfg.serverId2   ?? cfg.serverId,
            objectName: cfg.objectName2 ?? cfg.objectName,
            sensor:     cfg.sensor2,
            sensorId:   cfg.sensorId2,
        };
        if (resolveBinding(b2)) {
            cfg.serverId2   = b2.serverId;
            cfg.objectName2 = b2.objectName;
            cfg.sensorId2   = b2.sensorId;
            migrated++;
        }
    }
    // multi-sensor items
    if (Array.isArray(cfg.items)) cfg.items.forEach(it => { if (resolveBinding(it)) migrated++; });
    // chart zones
    if (Array.isArray(cfg.zones)) {
        cfg.zones.forEach(z => (z.sensors || []).forEach(s => { if (resolveBinding(s)) migrated++; }));
    }
    return migrated;
}
```

**Cold-start guard:** при первой `loadDashboard` `state.sensorsByName` может
быть пуст (SSE batch'и не приехали). Решение — re-run миграции через hook в
existing `updateDashboardWidgets()` (вызывается из `04-sse.js` на каждый
`ionc_sensor_batch` / `modbus_register_batch` / `opcua_sensor_batch`):

```js
// В 62-dashboard-manager.js:
class DashboardManager {
    loadDashboard(name) {
        // ... после createWidget() для всех виджетов:
        this._pendingMigration = this._anyLegacyBinding();
    }

    // Helper — проверяет есть ли виджеты с неполным триплетом.
    _anyLegacyBinding() {
        for (const w of dashboardState.widgets.values()) {
            if (this._hasUnresolvedBinding(w.config)) return true;
        }
        return false;
    }

    _hasUnresolvedBinding(cfg) {
        const isUnresolved = (b) => b?.sensor && (!b.serverId || !b.objectName || !Number.isFinite(b.sensorId));
        if (isUnresolved(cfg)) return true;
        if (cfg?.sensor2 && isUnresolved({
            serverId: cfg.serverId2 ?? cfg.serverId,
            objectName: cfg.objectName2 ?? cfg.objectName,
            sensor: cfg.sensor2,
            sensorId: cfg.sensorId2,
        })) return true;
        if (Array.isArray(cfg?.items) && cfg.items.some(isUnresolved)) return true;
        if (Array.isArray(cfg?.zones)) {
            for (const z of cfg.zones) if ((z.sensors || []).some(isUnresolved)) return true;
        }
        return false;
    }

    // Вызывается из updateDashboardWidgets() в 51-dashboard-update.js
    // (или где он определён — найти по grep).
    tryResolvePendingMigration() {
        if (!this._pendingMigration) return;
        let total = 0;
        dashboardState.widgets.forEach(w => { total += this._migrateLegacyBinding(w.config); });
        if (total > 0) {
            this.updateSensorSubscriptions();
            this.initializeWidgetValues();
        }
        if (!this._anyLegacyBinding()) this._pendingMigration = false;
    }
}
```

Hook добавляется в `updateDashboardWidgets(sensors, ctx)` — first line:
`if (window.dashboardManager) window.dashboardManager.tryResolvePendingMigration();`.

**Persistence:** миграция работает в памяти, на сервер автоматически не пишет.
Полный триплет сохраняется когда юзер откроет config dialog → нажмёт Apply
(или явно Export).

**Console output:** один warn per dashboard на load:
`dashboard "X": migrated N legacy widget bindings; re-save to persist`.

## Manager — subscription routing

`updateSensorSubscriptions()` переписывается под per-item triplet:

```js
updateSensorSubscriptions() {
    dashboardState.sensorSubscriptions.clear();
    dashboardState.setpointSubscriptions.clear();
    dashboardState.chartSubscriptions.clear();

    const addSub = (map, key, id) => {
        if (!map.has(key)) map.set(key, new Set());
        map.get(key).add(id);
    };
    const addBinding = (map, b, id) => {
        if (!b?.serverId || !b?.objectName || !b?.sensor) return;
        addSub(map, makeSensorKey(b.serverId, b.objectName, b.sensor), id);
    };

    dashboardState.widgets.forEach((widget, id) => {
        const cfg = widget.config;
        if (!cfg) return;

        addBinding(dashboardState.sensorSubscriptions, cfg, id);

        if (cfg.sensor2) {
            addBinding(dashboardState.setpointSubscriptions, {
                serverId:   cfg.serverId2   || cfg.serverId,
                objectName: cfg.objectName2 || cfg.objectName,
                sensor:     cfg.sensor2,
            }, id);
        }

        if (Array.isArray(cfg.items)) {
            cfg.items.forEach(it => addBinding(dashboardState.sensorSubscriptions, it, id));
        }

        if (widget instanceof ChartWidget && Array.isArray(cfg.zones)) {
            cfg.zones.forEach(z => (z.sensors || []).forEach(s =>
                addBinding(dashboardState.chartSubscriptions, s, id)));
        }
    });

    this._subscribeActiveSensorsBackend();
}
```

**`_subscribeActiveSensorsBackend()`** расширяется аналогично — собирает
`(serverId, objectName, sensorId)` из main config + sensor2 + items[] + zones[].sensors[],
группирует по `serverId|objectName`, шлёт POST `/ionc/subscribe?server=`.
Backend subscribe идёмpotent — повторные вызовы при редактировании безопасны.

**`handleSensorUpdate(sensorKey, ...)` не меняется** — текущий routing уже
работает по полному sensorKey (включает serverId+objectName).

**`ChartWidget.getSensorNames()` — удаляется** (dead code после миграции).

## UX — Add item с pre-fill

При нажатии `+ Add` в multi-sensor виджете:

1. `parseSensorItemList(form, opts)` → берём last item (или первый, если items пуст).
2. Render новой row: `renderSensorItemRow({ idx: nextIdx, item: { serverId: lastItem.serverId, objectName: lastItem.objectName, sensor: '', sensorId: null, ...defaultExtras } })`.
3. Wire'им handlers через `initSensorBindingHandlers` для новой row.
4. Sensor input — пустой; юзер фокусируется и сразу типит.

**Edge cases:**

- items пуст и нет last → fallback: первый connected server из `state.servers`,
  `objectName='SharedMemory'`.
- last item с serverId, которого больше нет в `state.servers` → показываем как
  `(disconnected)` option (consistent с current ActiveDashboardWidget).
- Chart `+ Add Zone` → новая zone с пустым sensors[]; первое нажатие `+ Add Sensor`
  внутри новой zone → fallback на last sensor из last zone.

## Testing

### Unit (vitest, `tests/unit/`)

- `widget-sensor-binding.test.ts` — `parseSensorBindingFields` extracts triplet,
  handles missing fields, prefix variations (`''`, `'sensor2-'`, `'item-3-'`).
- `widget-sensor-item-list.test.ts` — `parseSensorItemList` для items[];
  add/remove rows; pre-fill из last item.
- `legacy-binding-migration.test.ts` — `_migrateLegacyBinding` single-sensor,
  multi-sensor (items[]), chart zones, sensor2, empty `state.sensorsByName` →
  no mutation, repeat after warmup → mutation.

### E2E (playwright, `tests/single/`)

`dashboard-widget-binding-multi-server.spec.ts` (новый, ~6 сценариев):

1. **Single-sensor (Gauge)** — config dialog показывает server+object selectors,
   выбор sensor через autocomplete сохраняет sensorId; Apply → config содержит
   полный триплет.
2. **Multi-sensor (StatusBar) — same server, two objects** — два item'а на разных
   IONC объектах, оба получают SSE updates.
3. **Multi-sensor (Chart) — two servers** — sensors из двух разных серверов,
   обе линии рисуются.
4. **Backend subscribe верификация** — после load dashboard проверяем POST
   `/ionc/subscribe` улетел для каждой `(serverId, objectName)` группы с
   правильным набором `sensor_ids`. Mock-server-2 матрица.
5. **Add item: pre-fill** — добавляем второй item, видим server+object
   pre-filled из первого; sensor пустой.
6. **Legacy dashboard load** — config с `sensor: 'X'` без триплета → миграция
   через `state.sensorsByName` → виджет показывает значение. Console warn
   присутствует.

`dashboard-widget-settings.spec.ts` (existing) — расширить: для каждого
single-sensor виджета (Gauge/Level/Led/Digital) проверить новый sensor
binding form (server select renders, object dropdown loads, sensor autocomplete
works, Apply → config содержит триплет).

**Backward-compat check:** все existing E2E (active widgets, multi-server
isolation) прогоняются без изменений — рефакторинг ActiveDashboardWidget на
helpers не меняет поведения.

## Out of scope

- Auto-save migrated dashboards на сервер (Q2-A explicitly chose lazy).
- Изменение Label/Divider (no sensor binding).
- Bulk-edit multi-sensor items (например paste CSV) — отдельная фича.
- Изменение wire-protocol IONC API (используем существующие endpoint'ы:
  `/api/objects?type=IONotifyController`, `/api/sensors/search`,
  `/api/objects/{name}/ionc/subscribe`, `/api/objects/{name}/ionc/get`).
