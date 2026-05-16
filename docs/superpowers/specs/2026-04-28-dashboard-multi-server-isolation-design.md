# Dashboard Multi-Server Isolation — Design

**Дата:** 2026-04-28
**Ветка:** `story/dashboard-active-controls` (продолжение)
**Reviews:** `docs/review/2026-04-27-code-review-{js-naming-conventions,js-modules,dashboard-active-toggle-design}.md`
**Статус:** Draft → ожидает review

## Контекст

Текущая dashboard-инфраструктура frontend'а использует короткое `sensorName`
как ключ для четырёх Map'ов (`sensorValuesCache`, `sensorSubscriptions`,
`setpointSubscriptions`, `chartSubscriptions`) и для роутинга SSE-обновлений.
В multi-server сценарии, где один и тот же `sensorName` может существовать на
разных серверах или в разных IONC-объектах, dashboard widget может получить
чужое значение. Active widgets дополнительно не сохраняют `serverId` в config —
`writeValue` использует первый connected server, что в multi-server среде
может писать на «не тот» сервер.

Проблема описана в трёх ревью одновременно: Doc 1.1, 1.2 (toggle-design),
Doc 2.2 (js-modules), Doc 3.1, 3.2, 3.3 (naming-conventions). Все указывают
на одну системную причину — отсутствие canonical sensor identity на frontend.

Формально юзер сейчас не использует multi-server dashboard'ы с пересекающимися
именами (сценарий C из brainstorm'а), но архитектурно хочется закрыть проблему
полностью и зафиксировать правило в `CLAUDE.md`, чтобы будущие изменения не
наступали на эти грабли.

## Цели

- Ввести canonical `sensorKey = ${serverId}|${objectName}|${sensorName}` для
  всех dashboard cache/subscription/SSE update path'ов.
- Сохранять `serverId` в config активных widget'ов (`writeValue` использует
  именно его, не «первый connected»).
- Auto-migrate существующих legacy dashboard'ов без `serverId` в widget configs.
- Зафиксировать правило в `CLAUDE.md` и `docs/naming-conventions.md`.
- Ввести vitest для unit-тестирования helper'ов (минимальный setup, без
  переделки concat.go под ESM).

## Не-цели

- Замена `state.sensorsByName` (chart autocomplete dedup) — отдельный spec.
- Замена `state.sensors` keyed by sensorId — отдельный spec.
- Переделка `BaseObjectRenderer` per-tab sensor lookups — они уже scoped
  через `tabKey`/renderer-context.
- Полная миграция всех Playwright тестов на vitest — vitest вводится
  только для helper'ов в этом spec'е, остальное остаётся Playwright.
- ESM-ификация всего src/ — concat.go продолжает склеивать globals.
- HTML escaping в attribute context — отдельный refactor.

## Принятые решения

| # | Решение | Выбор | Обоснование |
|---|---|---|---|
| 1 | Use case scope | Полное архитектурное решение | Зафиксировать правило в CLAUDE.md, чтобы будущие фичи не плодили проблему |
| 2 | Migration legacy widgets | Auto-migrate at load (вариант A) | Юзер не замечает, single-shot upgrade. Trade-off — может «угадать» не тот сервер при дубликатах objectName, но это same risk как текущее `_resolveServerId` |
| 3 | Scope spec'а | Только dashboard layer (вариант A) | `state.sensorsByName` затрагивает не-dashboard renderer'ы (charts, IONC) и меняет UI semantics — отдельный spec |
| 4 | Формат key | Pure string (вариант 1) | `${serverId}\|${objectName}\|${sensorName}`. Минимум изменений сигнатур, нативный JS pattern, идиоматично с `tabKey`. Разделитель `\|` (не `:`) чтобы не путать с `tabKey` |
| 5 | Test framework | Hybrid (вариант 2) | Vitest для pure helpers (`makeSensorKey`/`parseSensorKey`), Playwright для flow. Минимальный vitest setup через globalSetup + globalThis (без ESM refactor) |

## Архитектура

### Sensor key

```js
sensorKey = `${serverId}|${objectName}|${sensorName}`
```

**Helper модуль `ui/static/js/src/09-sensor-key.js`** (новый файл, единый
короткий модуль):

```js
function makeSensorKey(serverId, objectName, sensorName) {
    return `${serverId}|${objectName}|${sensorName}`;
}

function parseSensorKey(key) {
    const parts = key.split('|');
    if (parts.length !== 3) return null;
    return { serverId: parts[0], objectName: parts[1], sensorName: parts[2] };
}

window.makeSensorKey = makeSensorKey;
window.parseSensorKey = parseSensorKey;
```

Имя файла `09-sensor-key.js` — попадает в core диапазон 00-09, перед base
renderer'ом и SSE handler'ом, чтобы быть доступным везде.

### Что становится scoped по `sensorKey`

| Map | Было | Станет |
|---|---|---|
| `state.sensorValuesCache` | `Map<sensorName, {value, error, timestamp}>` | `Map<sensorKey, {value, error, timestamp}>` |
| `dashboardState.sensorSubscriptions` | `Map<sensorName, Set<widgetId>>` | `Map<sensorKey, Set<widgetId>>` |
| `dashboardState.setpointSubscriptions` | то же | то же |
| `dashboardState.chartSubscriptions` | то же | то же |

### Data flow

**SSE handler (`04-sse.js`):**

```js
eventSource.addEventListener('ionc_sensor_batch', (e) => {
    const event = JSON.parse(e.data);
    const { objectName, serverId } = event;     // уже есть в payload
    const now = Date.now();
    for (const sensor of event.data) {
        const key = makeSensorKey(serverId, objectName, sensor.name);
        state.sensorValuesCache.set(key, {
            value: sensor.value,
            error: sensor.error || null,
            timestamp: now
        });
    }
    updateDashboardWidgets(event.data, { serverId, objectName, timestamp: event.timestamp });
    // ... остальной existing path для tab renderer без изменений
});
```

**`updateDashboardWidgets` (`63-dashboard-dialogs.js`):**

```js
function updateDashboardWidgets(sensors, ctx) {
    if (!dashboardManager || !sensors) return;
    for (const sensor of sensors) {
        if (sensor.name === undefined || sensor.value === undefined) continue;
        const key = makeSensorKey(ctx.serverId, ctx.objectName, sensor.name);
        dashboardManager.handleSensorUpdate(key, sensor.value, sensor.error || null, ctx.timestamp);
    }
}
```

**`handleSensorUpdate` (`62-dashboard-manager.js`):**

```js
handleSensorUpdate(sensorKey, value, error, timestamp) {
    const widgetIds = dashboardState.sensorSubscriptions.get(sensorKey);
    // ... routing к widget.update() как раньше
    const setpointWidgetIds = dashboardState.setpointSubscriptions.get(sensorKey);
    const chartWidgetIds = dashboardState.chartSubscriptions.get(sensorKey);
    // ... остальное как было, только аргумент стал key вместо name
}
```

**`updateSensorSubscriptions` (`62-dashboard-manager.js`):**

```js
for (const [id, widget] of dashboardState.widgets) {
    const cfg = widget.config;
    if (cfg?.sensor && cfg?.serverId && cfg?.objectName) {
        const key = makeSensorKey(cfg.serverId, cfg.objectName, cfg.sensor);
        if (!subs.has(key)) subs.set(key, new Set());
        subs.get(key).add(id);
    }
    // setpoint: cfg.sensor2 + cfg.serverId + cfg.objectName2 (если есть, иначе cfg.objectName)
    // chart: каждый item.sensor → key с widget.config.serverId/objectName
}
```

**`fetchSensorValues` (`62-dashboard-manager.js`):**
- Группировка по `(serverId, objectName)` уже сделана.
- Запись в кэш по `makeSensorKey(serverId, objectName, sensor.name)`.
- Initial widget value lookup: `state.sensorValuesCache.get(makeSensorKey(cfg.serverId, cfg.objectName, cfg.sensor))`.

**`writeValue` (`61-dashboard-active-base.js`):**

```js
async _doWrite(value) {
    // ... validation как раньше
    const serverId = this.config?.serverId ?? this._resolveServerId();
    if (!serverId) {
        this._setWriteState('error', 'No server configured');
        return;
    }
    if (!this.config?.serverId) {
        console.warn(`Active widget ${this.id}: serverId missing in config, falling back to first connected (will be migrated on next load)`);
    }
    // ... fetch как раньше
}
```

### Active widget config form

**Form (`61-dashboard-active-base.js` `getConfigForm`):**

Добавляется dropdown «Server» **сверху** перед «IONC Object», заполняется
из `state.servers` (только connected или равные `config.serverId`).

```html
<div class="widget-config-field">
    <label>Server</label>
    <select class="widget-input" name="serverId" data-test="cfg-serverId">
        <!-- option для каждого state.servers, где server.connected || server.id === config.serverId -->
    </select>
</div>
```

**Server change handler (`initConfigHandlers`):**
- При смене serverId — перезагружается IONC Object dropdown
  (`fetch(/api/objects?server=${serverId}&type=IONotifyController)`).
- Sensor input очищается (`autocomplete.resetOnObjectChange`).

**Parse (`parseConfigForm`):**

```js
serverId: form.querySelector('[name="serverId"]')?.value || null,
```

**`setupSensorAutocomplete`** (`41-sensor-autocomplete.js`) принимает
`() => form.querySelector('[name="serverId"]').value` вместо текущего
«первый connected».

### Migration legacy widget configs

В `DashboardManager.loadDashboard` (synchronous, ДО `updateSensorSubscriptions`),
добавляется приватный helper `_migrateLegacyServerIds` и вызов после
`createWidget` цикла:

```js
// Helper рядом с loadDashboard (приватный метод DashboardManager).
_resolveFirstConnectedServerId() {
    for (const [id, server] of state.servers) {
        if (server.connected) return id;
    }
    return null;
}

_migrateLegacyServerIds() {
    let dirty = false;
    for (const widget of dashboardState.widgets.values()) {
        if (widget instanceof ActiveDashboardWidget && !widget.config.serverId) {
            const fallback = this._resolveFirstConnectedServerId();
            if (fallback) {
                widget.config.serverId = fallback;
                dirty = true;
            }
        }
    }
    if (dirty) {
        this.saveDashboard();  // pushes update to localStorage
    }
}

// В loadDashboard после widget creation:
this._migrateLegacyServerIds();
this.updateSensorSubscriptions();
```

Single-shot: на первом load после deploy миграция выполняется один раз, дальше
configs уже содержат `serverId`. Если connected серверов нет — миграция
откладывается до следующего load. Active widget без `serverId` будет работать
через legacy fallback в `_doWrite` (warning в консоли).

## Backend

Изменений нет. Вся работа frontend.

## Frontend — модифицируемые файлы

| Файл | Изменение |
|---|---|
| `ui/static/js/src/09-sensor-key.js` | **Новый.** `makeSensorKey`, `parseSensorKey` helpers + window-export |
| `ui/static/js/src/00-state.js` | Комментарий `sensorValuesCache` обновить: ключ — `sensorKey` (был `sensorName`) |
| `ui/static/js/src/60-dashboard-base.js` | Комментарии `sensorSubscriptions`/`setpointSubscriptions`/`chartSubscriptions` обновить: ключ — `sensorKey` |
| `ui/static/js/src/04-sse.js` | `ionc_sensor_batch` handler: cache write по sensorKey, передача `{serverId, objectName, timestamp}` в `updateDashboardWidgets` |
| `ui/static/js/src/63-dashboard-dialogs.js` | `updateDashboardWidgets(sensors, ctx)` — собирает sensorKey, передаёт в `handleSensorUpdate(key, ...)` |
| `ui/static/js/src/62-dashboard-manager.js` | `handleSensorUpdate` принимает sensorKey; `updateSensorSubscriptions` строит ключи; `fetchSensorValues` использует sensorKey для cache; `loadDashboard` запускает auto-migration |
| `ui/static/js/src/61-dashboard-active-base.js` | `getConfigForm` добавляет Server select; `parseConfigForm` сохраняет serverId; `initConfigHandlers` навешивает Server change handler; `_doWrite` использует `config.serverId` (с legacy fallback + warning) |
| `ui/static/js/src/41-sensor-autocomplete.js` | Принимает `getServerId()` getter, использует его (уже есть, проверить что callers передают) |

## Documentation

| Файл | Что добавить |
|---|---|
| `CLAUDE.md` | Новый раздел "Sensor identity (multi-server)" с правилами sensorKey, ссылками на helper, табличкой «когда что использовать», запретами |
| `docs/naming-conventions.md` | Раздел "Sensor identity" с тем же содержанием. В localStorage таблице упомянуть, что dashboard widget configs persist `serverId` |
| `docs/dashboards.md` | В разделе про active widgets — упомянуть Server dropdown в config dialog |

**Текст для `CLAUDE.md`:**

```markdown
## Sensor identity (multi-server)

Для уникальной идентификации датчика во frontend используется
**`sensorKey`** — строка формата `${serverId}|${objectName}|${sensorName}`
(разделитель `|`, чтобы не путать с `:` в `tabKey`).

Helper: `makeSensorKey(serverId, objectName, sensorName)` /
`parseSensorKey(key)` в `09-sensor-key.js`.

**Правила:**

| Сценарий | Ключ |
|---|---|
| Подписка / cache в dashboard | `sensorKey` |
| API path | `objectName` (path) + `serverId` (query) |
| UI display label | `sensorName` (короткое имя) |
| Active widget config | сохранять `serverId` + `objectName` + `sensor` (имя) + `sensorId` (числовой) |

**Запрещено:**
- `Map<sensorName, ...>` для dashboard-wide state (cache, подписки, routing)
- `_resolveServerId()` как primary source — только legacy fallback с warning
- Передавать sensors в dashboard update path без `(serverId, objectName)` контекста

SSE handler `ionc_sensor_batch` уже получает `serverId` и `objectName` в
payload — используй их для построения `sensorKey` при cache/routing.

Когда добавляешь новую активную widget'у — base class уже сохраняет
`serverId` через unified `getConfigForm`/`parseConfigForm`. Subclass этим
не занимается.
```

## Backward compatibility

**Legacy widget configs (без serverId):**
- Auto-migrate at load: `_resolveFirstConnectedServerId()` → fill + `saveDashboard()`.
- Если connected серверов нет — миграция откладывается. `_doWrite` использует
  legacy fallback `_resolveServerId()` + warning в консоли.

**Legacy `sensorValuesCache`:**
- In-memory Map, пересоздаётся на reload — старых ключей нет. Никакой
  персистентности нет.

**Legacy `sensorSubscriptions`/`setpointSubscriptions`/`chartSubscriptions`:**
- Все callers внутри `62-dashboard-manager.js` и `04-sse.js`. Внешних
  потребителей нет (grep подтверждает). Меняем сигнатуры внутренне.

**Race миграция vs SSE:**
- Миграция в `loadDashboard` синхронная, ДО `updateSensorSubscriptions`. SSE
  update arriving до миграции — попадает в `sensorValuesCache`, но widget
  ещё не subscribed. На следующем poll (1-2s) будет subscribed → получит update.
  Acceptable.

## Testing

### Vitest setup (новое)

| Файл | Назначение |
|---|---|
| `tests/unit/package.json` | dev deps: `vitest`, `jsdom` |
| `tests/unit/vitest.config.js` | environment: jsdom, globalSetup путь |
| `tests/unit/globalSetup.ts` | Загружает `ui/static/js/app.js` через `fs.readFileSync` + `vm.runInThisContext` чтобы `globalThis.makeSensorKey` стал доступен |
| `tests/unit/sensor-key.test.ts` | Round-trip и edge case тесты helper'ов |
| `Makefile` | Новый target `js-tests-unit: cd tests/unit && npm install && npx vitest run` |

**Vitest тесты для sensor-key:**

```ts
import { describe, it, expect } from 'vitest';

describe('makeSensorKey / parseSensorKey', () => {
    it('round-trip with normal values', () => {
        const key = makeSensorKey('srv1', 'SharedMemory', 'Temp');
        expect(parseSensorKey(key)).toEqual({
            serverId: 'srv1', objectName: 'SharedMemory', sensorName: 'Temp'
        });
    });

    it('preserves empty serverId (edge)', () => {
        const key = makeSensorKey('', 'SharedMemory', 'Temp');
        expect(parseSensorKey(key)).toEqual({
            serverId: '', objectName: 'SharedMemory', sensorName: 'Temp'
        });
    });

    it('returns null for malformed key', () => {
        expect(parseSensorKey('foo')).toBeNull();
        expect(parseSensorKey('foo|bar')).toBeNull();
    });

    it('keys with same triplet are equal as strings', () => {
        expect(makeSensorKey('a', 'b', 'c')).toBe(makeSensorKey('a', 'b', 'c'));
    });
});
```

### Playwright tests

**Новый: `tests/single/dashboard-multi-server-isolation.spec.ts`** (4 сценария)

1. **Cache isolation** — mock 2 серверов с одинаковым `sensorName=Temp`
   но разными values. Создаём 2 active widget'а (по одному на сервер).
   Проверяем, что каждый получает значение со своего сервера.

2. **Subscription routing** — SSE event `ionc_sensor_batch` с
   `serverId=A`, `sensor.name=Temp` обновляет только widget с
   `config.serverId=A`. Widget с `serverId=B` не реагирует.

3. **Write routing** — click по widget с `config.serverId=B` → POST идёт
   на `/api/objects/{obj}/ionc/set?server=B`, не на A.

4. **Auto-migration** — pre-fill localStorage dashboard config без
   `serverId` в widget configs → load page → assert widget.config.serverId =
   первый connected, и dashboard config в localStorage уже содержит serverId.

**Обновить `tests/single/dashboard-active-toggle.spec.ts`:**
- Добавить `cfg-serverId` selector в config flow тестах
- `read-pathway` test расширить: проверить, что POST URL содержит
  правильный `?server=...` (именно `config.serverId`, не «первый connected»)

**Обновить `tests/single/dashboard-active-base.spec.ts`:**
- Smoke: проверить что `widget.config.serverId` сохраняется через config dialog flow

### Manual verification (pre-merge checklist)

- Создать widget A (serverId=mock1) и widget B (serverId=mock2) на одном dashboard
- Оба отдают sensor `Temp` с разными значениями → A показывает mock1, B mock2
- Изменить value на mock1 → SSE → только A обновился
- Click A (write valueOn) → POST идёт на mock1
- Reload page → конфиги widget'ов восстановлены (serverId сохранился)
- Создать legacy dashboard config (без serverId), load → миграция выполнилась,
  configs persisted

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Auto-migration пристёгивает widget к не тому серверу при дубликатах objectName | Widget читает/пишет не туда | Same risk как текущее `_resolveServerId`. Юзер увидит Server dropdown в config → может исправить вручную |
| Vitest setup ломает CI | js-tests-unit fail | Setup за отдельным Makefile target; не включается в `make js-tests` (Playwright) автоматически — добавляется как `make js-tests-all: js-tests js-tests-unit` |
| Legacy fallback маскирует баги | Warning ignored | Console warning при использовании fallback, легко найти в логах |
| Race между SSE и migration | Один SSE event miss'ится | Acceptable (на следующем poll widget получит). Миграция synchronously ДО subscribe. |

## Definition of Done

- [ ] `09-sensor-key.js` создан и подключен (concat.go видит)
- [ ] Все 4 dashboard Map'ы используют `sensorKey`
- [ ] SSE `ionc_sensor_batch` handler передаёт `(serverId, objectName)` в dashboard update path
- [ ] Active widget config form содержит Server dropdown
- [ ] `parseConfigForm` сохраняет `serverId`
- [ ] `_doWrite` использует `config.serverId` (с legacy fallback + warning)
- [ ] `loadDashboard` выполняет auto-migration
- [ ] CLAUDE.md "Sensor identity" раздел добавлен
- [ ] `docs/naming-conventions.md` обновлён
- [ ] `docs/dashboards.md` обновлён
- [ ] vitest setup в `tests/unit/`, `make js-tests-unit` работает
- [ ] vitest тесты `sensor-key.test.ts` зелёные
- [ ] Playwright `dashboard-multi-server-isolation.spec.ts` зелёный (4 сценария)
- [ ] Обновлённые `dashboard-active-toggle.spec.ts` и `dashboard-active-base.spec.ts` зелёные
- [ ] Полный прогон `make js-tests` без новых регрессий (control.spec.ts:144 flaky — pre-existing)
- [ ] Manual verification checklist пройден
