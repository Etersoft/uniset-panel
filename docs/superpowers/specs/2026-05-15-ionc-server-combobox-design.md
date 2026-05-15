# IONC@server Combobox Design

**Date:** 2026-05-15
**Status:** Approved (awaiting user spec review before plan)
**Author:** Claude (Opus 4.7) + Pavel Vaynerman

## Goal

Заменить каскадный выбор `server → IONC object` (два связанных `<select>`) в config-форме активных dashboard widget'ов на одно autocomplete-поле формата `IONC @ Server` с substring-поиском по обеим половинам.

## Background

В текущей реализации `60-widget-sensor-binding.js` рендерит две связанные `<select>`:

1. `serverId` — список connected серверов.
2. `objectName` — заполняется через `GET /api/objects?server=ID&type=IONotifyController` после выбора сервера.

На типичном стенде 1–2 сервера × 1–3 IONC объекта (часто всего 1 SharedMemory). UX излишне многоступенчатый: пользователь делает 2 действия выбора ради 4 комбинаций.

Состояние клиента сегодня:

- `state.servers[id].cachedObjects` — массив **имён** объектов (без типа).
- `/api/sidebar` — отдаёт sidebar entries без `objectType`.
- `/api/all-objects` — список имён, без типа.
- Тип объекта определяется только через `GetObjectData(server, name)` (отдельный uniset запрос на каждое имя).

Поэтому простого in-memory кэша на клиенте не хватает: нужен либо новый backend endpoint, отдающий объекты с типом, либо N параллельных вызовов существующего `/api/objects?type=...`.

## Non-Goals

- Изменение формата хранения config widget'ов. `serverId` + `objectName` остаются раздельными полями. Никаких миграций.
- Сложная связка с `/api/sidebar` или SSE invalidation реестра типов. MVP — TTL + ручной refresh.
- Замена sensor-autocomplete (он уже работает через `setupSensorAutocomplete` в `41-sensor-autocomplete.js`).
- Backend cache типов объектов. На MVP — каждый HTTP вызов `/api/objects-by-type` делает N+M uniset запросов; HTTP вызывается раз в 5 минут с UI, нагрузка приемлема. Backend cache — follow-up если станет hot-path.

## Architecture

```
config-form open → renderObjectPicker(form) → ensureIONCRegistry()
                                        │
                                        ▼ (cache miss / expired / force)
                       fetch('/api/objects-by-type?type=IONotifyController')
                                        │
                                        ▼
                  serverMgr.GetAllObjectsByType(typeFilter)
                       (per-server: list names → GetObjectData → filter type)
                                        │
                                        ▼
                  [{serverId, serverName, connected, objects:[name,...]}]
                                        │
                                        ▼
              state.ioncRegistry (Map<serverId, {serverName,connected,objects}>)
                                        │
                                        ▼
                  combo-input + dropdown (substring filter local)
                                        │
                                        ▼ pickItem
              hidden serverId + objectName populated → 'change' event
                                        │
                                        ▼
                  existing initSensorBindingHandlers cascade:
                    sensor input reset, IONC objects dropdown skipped
                  (контракт parseConfigForm / parseSensorBindingFields НЕ меняется)
```

Хранение в widget config (`{serverId, objectName, sensor, sensorId, ...}`) — без изменений. Combo собирает строку для отображения, парсит обратно при выборе.

## Files

**Backend (Go):**
- *new* — `internal/api/handlers_objects_by_type.go` — handler `GetObjectsByType`
- *modify* — `internal/api/server.go` — регистрация route `GET /api/objects-by-type`
- *new* — `internal/server/manager_objects_by_type.go` — метод `(m *Manager) GetAllObjectsByType(string) ([]ServerObjectsByType, error)` (или дополнить существующий `manager.go` если файл компактен)
- *test* — `internal/api/handlers_objects_by_type_test.go`, `internal/server/manager_test.go` (дополнить)

**Frontend (JS):**
- *modify* — `ui/static/js/src/00-state.js` — `state.ioncRegistry = { fetchedAt:0, isFetching:false, servers:new Map(), fetchPromise:null }`
- *modify* — `ui/static/js/src/00-constants.js` — `IONC_REGISTRY_TTL_MS = 5 * 60 * 1000`, `IONC_COMBO_DEBOUNCE_MS = 100`
- *modify* — `ui/static/js/src/60-widget-sensor-binding.js` — заменить два select'а на combo input + hidden, новые helpers: `ensureIONCRegistry`, `getIONCEntries`, `setupIONCComboAutocomplete`
- *modify* — `ui/static/css/style.css` — стили `.ionc-combo-input`, `.ionc-combo-dropdown`, `.ionc-combo-item`, offline marker, refresh icon spin
- *test* — *new* `tests/unit/ionc-registry.test.ts`, `tests/unit/sensor-binding-combo.test.ts`, `tests/single/dashboard-widget-ionc-combo.spec.ts`

## API Contract

### `GET /api/objects-by-type`

Query parameters:
- `type` (required) — например `IONotifyController`. 400 если отсутствует.

Response 200:

```json
{
  "type": "IONotifyController",
  "servers": [
    {
      "serverId":   "17050",
      "serverName": "Server17050",
      "connected":  true,
      "objects":    ["SharedMemory", "IMIT.MBI_DP"]
    },
    {
      "serverId":   "236-17070",
      "serverName": "Server236-17070",
      "connected":  false,
      "objects":    ["SharedMemory"]
    }
  ]
}
```

Errors:
- 400 — `type` не указан.
- 503 — `serverMgr` не сконфигурирован.

Полу-успехи:
- Если конкретный server недоступен и cache'а имён нет — `objects: []`, `connected: false` (запись server присутствует, чтобы UI знал о его существовании).
- Если `GetObjectData(name)` падает на отдельном объекте — этот объект пропускается, остальные включаются.
- Порядок серверов в `servers` совпадает с `Order` из `/api/all-objects`.

`serverName` — `inst.Config.Name` если задано, иначе пустая строка (frontend fallback на `serverId`).

## Frontend Cache Shape

```javascript
// 00-state.js
state.ioncRegistry = {
    fetchedAt:    0,                  // ms; 0 = never fetched
    isFetching:   false,              // race guard for ↻ during in-flight
    fetchPromise: null,               // shared promise for concurrent waiters
    servers:      new Map(),          // serverId → { serverName, connected, objects: [name,...] }
};
```

API:

```javascript
async function ensureIONCRegistry({ force = false } = {}) {
    const reg = state.ioncRegistry;
    const fresh = (Date.now() - reg.fetchedAt) < IONC_REGISTRY_TTL_MS;
    if (!force && fresh && reg.servers.size > 0) return reg;
    if (reg.fetchPromise) return reg.fetchPromise;
    reg.isFetching = true;
    reg.fetchPromise = fetchAndPopulate()
        .then(() => { reg.fetchedAt = Date.now(); })
        .finally(() => { reg.isFetching = false; reg.fetchPromise = null; });
    return reg.fetchPromise.then(() => reg);
}

function getIONCEntries() {
    const out = [];
    state.ioncRegistry.servers.forEach((srv, serverId) => {
        const sn = srv.serverName || serverId;
        srv.objects.forEach(objectName => {
            out.push({
                serverId, serverName: srv.serverName, connected: srv.connected,
                objectName, displayString: `${objectName} @ ${sn}`,
            });
        });
    });
    // Sort: online first (alphabetical by displayString), then offline
    out.sort((a, b) => {
        if (a.connected !== b.connected) return a.connected ? -1 : 1;
        return a.displayString.localeCompare(b.displayString);
    });
    return out;
}
```

`displayString` собирается один раз для рендера и для substring-match (lowercase).

## UI Behavior

### DOM-структура

Заменяет два select'а в `renderSensorBindingFields`:

```html
<div class="binding-row ionc-combo-row">
  <label>IONC @ Server</label>
  <input type="text" class="ionc-combo-input" autocomplete="off"
         placeholder="введите для поиска…">
  <input type="hidden" name="serverId">
  <input type="hidden" name="objectName">
  <button type="button" class="ionc-combo-refresh" title="Обновить список">↻</button>
</div>
```

Дальше идёт уже существующий sensor-input (без изменений).

### Поведение

| Событие | Поведение |
|---|---|
| Открытие config-формы | `ensureIONCRegistry()`. Preselect: если `(serverId, objectName)` из config есть в registry — input.value = `displayString`, hidden = config. Если нет (orphan) — input.value = `${objectName} @ ${serverId} (offline)`, `data-orphan="true"` на input. |
| Single match (registry entries.length === 1) | input preselected, `disabled = true`, hint "только 1 IONC@server в системе". ↻ остаётся активной. |
| Focus | Открывается dropdown. `★` маркер у preselected. Online — обычный цвет, offline — opacity 0.55 + ⚠ пометка. Online first, alphabetical. |
| Ввод текста | Debounce 100ms. Substring-match по lowercase'нутому `displayString`. Highlighted match'и в items (re-use journal pattern: split raw → escape → wrap). |
| ↑↓/Enter/Esc | Стандартная навигация. Pick → input.value = displayString, hidden inputs заполняются, dropdown закрывается, **`change` event** на hidden objectName и serverId триггерит существующий cascade в `initSensorBindingHandlers` (который сбрасывает sensor). |
| ↻ click | `ensureIONCRegistry({force:true})`. Кнопка крутится (CSS animation), input disabled до завершения. После — re-render открытого dropdown'а. |
| Choose offline entry | Allowed. Hidden filled. Input получает `(offline)` суффикс. Sensor-autocomplete вернёт пусто (server недоступен) — текущее поведение. |
| Manual edit без выбора | Hidden остаются с последнего выбора. Если строка не парсится — `data-invalid="true"` бэйдж на input. Apply config-формы остаётся активной (consistent с сегодняшним free-text). |

### Сохранение существующего контракта

`renderSensorBindingFields` / `parseSensorBindingFields` / `initSensorBindingHandlers` сохраняют публичную сигнатуру. Subclass'ы (`ToggleWidget`, `SetpointWidget` и т.д.) не меняются — их `getConfigForm`/`parseConfigForm`/`initConfigHandlers` по-прежнему делегируют на эти helpers. Меняется только их **внутренняя реализация**.

Существующий каскад `initSensorBindingHandlers` (при смене serverId → fetch IONC objects, при смене objectName → reset sensor) **сохраняется**. Combo-input вместо ручного выбора в select'е делает то же самое: pickItem заполняет hidden serverId + objectName и fires `change` на оба — каскад срабатывает идентично.

## Error Handling

| Сценарий | Поведение |
|---|---|
| `/api/objects-by-type` 5xx или network error | `fetchedAt` НЕ обновляется (cache не помечается fresh), `fetchPromise` cleared. Dropdown показывает "Не удалось загрузить — попробуйте ↻". console.warn. Cached entries (если были) сохраняются и используются. |
| 503 | То же что 5xx. |
| Empty servers / empty objects | Empty state в dropdown "Нет IONC объектов". Input работает как free-text. |
| Concurrent open во время fetch'а | Shared `fetchPromise`, оба waiters получают результат от одного HTTP. |
| ↻ во время in-flight fetch'а | No-op (`if (reg.isFetching) return`). |
| Backend stale (новый IONC появился) | Через 5 мин TTL → auto-refresh при следующем open. Или раньше через ↻. |
| Pre-existing widget с unknown pair (orphan) | Combo показывает `(offline)` суффикс, hidden preserved, save разрешён (можно править label/styles без перепривязки). |
| Manual partial typing → blur без выбора | input value возвращается к displayString последнего выбора (или к orphan-строке). Hidden unchanged. |
| Dashboard import с unknown server | Тот же orphan path. |

## Backend Invariants

- `GET /api/objects-by-type` без `type` → 400.
- `serverMgr == nil` → 503.
- Per-server: `GetServerObjects(serverID)` — если ошибка и нет cached objects → server entry с `objects: []`, не fail весь request (partial success).
- Per-name: `GetObjectData(name)` — если ошибка, объект пропускается. Иначе сравнение `data.Object.ObjectType == typeFilter`.
- Disconnected server с cached objects → cached + `connected: false`.

## Testing Strategy

### Backend (Go)

- `TestGetAllObjectsByType_basic` — 2 mock-сервера, 1 отдаёт 2 объекта (1 IONC + 1 не-IONC), 2-й — 1 IONC. Проверяем фильтрацию + порядок серверов.
- `TestGetAllObjectsByType_disconnectedWithCache` — server не отвечает, manager имеет cached objects → возвращаем cached + `connected: false`.
- `TestGetAllObjectsByType_disconnectedNoCache` — без кэша → `objects: []`, `connected: false`.
- `TestGetAllObjectsByType_emptyTypeFilter` → 400.
- `TestGetAllObjectsByType_noServerMgr` → 503.
- `TestGetAllObjectsByType_partialFailure` — один из 2 серверов 5xx на `GetObjectData(name)` для объекта X → X пропускается, остальные ОК, response 200.

### Frontend Unit

`tests/unit/ionc-registry.test.ts`:
- cache miss → fetch → populates servers Map
- cache hit (within TTL) → no fetch
- cache expired → re-fetch
- force=true → re-fetch even if fresh
- concurrent calls share fetchPromise (single fetch)
- 5xx → fetchedAt unchanged, throws (caller catches)
- `getIONCEntries`: flattened entries with displayString sort online-first

`tests/unit/sensor-binding-combo.test.ts`:
- combo input renders with hidden serverId/objectName preselected from config
- single registry entry → input disabled with hint
- typing filters dropdown by substring (matches both halves of "@")
- pickItem fills hidden inputs and fires `change` event (assert: existing handler resets sensor input)
- ↻ click triggers force fetch and re-renders open dropdown
- orphan binding (config pair not in registry) → input shows "(offline)" suffix, hidden preserved
- escapeHtml + escape regex highlight для match'ей

### E2E

`tests/single/dashboard-widget-ionc-combo.spec.ts`:
- Smoke: открыть config setpoint widget'а на dev-viewer, напечатать `Memory`, выбрать `SharedMemory @ Server-...`, hidden поля сохранились, widget работает после Apply.
- Refresh: создать widget, нажать ↻, fetch перезапускается (network log assertion).
- Backward compat: импортировать существующий dashboard, открыть Configure любого active widget — combo input preselected правильно.

### Регрессия

- Прогнать существующие `dashboard-active-*.spec.ts` (toggle/checkbox/button/setpoint/generator) — не должны сломаться: контракт `parseConfigForm` / `getConfigForm` базы остаётся.

## Persistence Invariants (config-binding survival)

**Принцип:** widget config (`serverId`, `objectName`, `sensor`, `sensorId`) — собственность пользователя. Никакой автоматический code path не имеет права очистить, переписать или авто-перепривязать эти поля. Изменить или удалить привязку может **только** пользователь (через config-форму или удаление widget'а).

Конкретные следствия для всех сценариев:

| Сценарий | Действие с widget config |
|---|---|
| Сервер недоступен в момент открытия dashboard | Config unchanged. Widget рендерится с `(offline)` индикатором, написать/прочитать SSE значения не может (текущее поведение). |
| Сервер не запущен в этой сессии (например, пользователь поднял dashboard локально без всех серверов) | Config unchanged. Widget ждёт когда сервер появится — после первого SSE update начинает работать без перезагрузки dashboard'а. |
| IONC объект исчез на сервере (был, но больше нет в `/api/objects?server=X`) | Config unchanged. Widget остаётся orphan, в Configure показывается `(offline)` суффикс. |
| Сервер или IONC переименован на uniset-стороне | Config unchanged (`serverId` хранится, не `serverName`; `objectName` это id). Если `serverName` поменялось — display string обновится. Если `serverId` или `objectName` поменялись — orphan. |
| ↻ нажат и registry обновлён, orphan'ы остались orphan'ами | Config unchanged. Только UI re-render dropdown'а. |
| Dashboard import / export | Config переезжает as-is. После import — те же rules для orphan'ов. |
| TTL expire → re-fetch → объект больше не возвращается backend'ом | Config unchanged. Widget переходит в orphan-state (на следующем open Configure). |

**Что НЕ делает система автоматически:**
- Не удаляет widget config поля.
- Не перепривязывает к "похожему" объекту по имени.
- Не выкидывает widget из dashboard'а.
- Не показывает диалог "ваш widget сломан, удалить?" — пользователь сам решает что делать.

**UI hints для orphan widget'ов** (visual только, не deletion):
- В dashboard runtime: `data-orphan-binding="true"` на widget container — opacity 0.7, tooltip с указанием на disconnected sensor.
- В Configure dialog: `(offline)` суффикс в combo input + варнинг под полем "Сервер сейчас недоступен. Привязка сохранится без изменений."

## Constants

```javascript
// 00-constants.js
IONC_REGISTRY_TTL_MS    = 5 * 60 * 1000  // 5 minutes
IONC_COMBO_DEBOUNCE_MS  = 100            // короче чем sensor-autocomplete (150ms),
                                          // т.к. фильтрация локальная без fetch
```

## Open Questions

Нет. Все вопросы решены в clarifying-фазе:
- Формат: `IONC @ Server`
- Single match: auto-fill + disabled
- Disconnected: показываем grayed-out с ⚠
- Cache invalidation: TTL 5 минут + ручная ↻ кнопка
- Data source: новый backend endpoint
- Migration: не нужна, orphan widgets просто работают
