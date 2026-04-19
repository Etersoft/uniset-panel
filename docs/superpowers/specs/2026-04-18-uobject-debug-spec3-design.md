# UObject Debug — Spec 3: frontend core refactor

**Date:** 2026-04-18
**Target branch:** story/uobject-debug-spec3 (from master, after Spec 2 merged)
**Status:** brainstorming-approved, pending implementation plan
**Part of:** UObject debug visualizer (4-spec decomposition, this is Spec 3).

## Goal

Превратить существующий `story/system-overview` (LiteGraph-based блок-схема
процессов) в полноценную отладочную платформу: перенести UX-находки из
`uniset2-debug-ui.html` (navigation, persistent state, hotkeys, minimap,
click-highlight, LOD), заменить палитру на FB Status panel, перейти на
Sugiyama layout через dagre, подготовить hook'и для Спека 4 (UObject detail
panel).

Ключевые границы:
- **Инфраструктура, не контент.** Спек 3 не строит полный log-view для
  trace-событий (это Спек 4's Message Log tab). Здесь — pipeline/subscribe,
  hook'и, navigation UX.
- **Lazy trace.** Подписка на `/api/trace/events` — только когда Спек 4
  активирует её (через API). До этого trace не опрашивается.
- **Reuse.** Существующий `UniSetProcessNode` + pulse + object_data уже
  работают — не переписываем.

## Scope

### В этом спеке
1. **Data pipeline для trace** — API `traceSubscribe(server, object, interval)` /
   `traceUnsubscribe(token)` + управление SSE соединениями.
2. **CustomEvent contract для Спека 4** — `uniset:node-clicked`,
   `uniset:node-double-clicked`, `uniset:schema-opened`, `uniset:schema-closed`.
3. **Navigation UX (11 фич)** — hotkeys + help, minimap, click-highlight,
   persistent view state в localStorage, zoom-around-cursor, LOD, Wires/Values
   toggles + View dropdown, SVG export, double-click edge → signal info,
   search in FB Status panel.
4. **Visual polish** — Sugiyama layout через `dagre.js`, замена text-label
   links на линии с conditional labels, FB Status panel вместо object palette,
   удаление H/V toggle.
5. **File decomposition** — разделение `58-system-overview.js` (1438 строк)
   на 9 модулей по ответственностям.
6. **Testing** — unit (Vitest) + E2E (Playwright) + existing mock server.

### Вне этого спека
- **Спек 4** — UObject detail panel (IO/Timers/Variables/Message Log/Statistics
  tabs). Trace log UI живёт там.
- **Deferred (на 3.5 или позже)** — breadcrumb, mini sparkline on port hover,
  program-group backgrounds.
- **Новые данные** — не добавляются (только trace, но тот уже в Спеке 2).

## Architecture

### Модульная декомпозиция

`ui/static/js/src/` — existing naming convention `NN-prefix.js`, loaded in
order:

```
58-overview-node.js       // UniSetProcessNode (render, pulse, portValues, portConnections)
58-overview-core.js       // orchestration: open/close tab, lifecycle, data fetch
58-overview-layout.js     // dagre Sugiyama + manualPositions preservation
58-overview-navigation.js // hotkeys, minimap, zoom-around-cursor, LOD
58-overview-highlight.js  // click-to-highlight edges + neighbors (Esc clears)
58-overview-state.js      // localStorage persist (debounce 300ms, flush beforeunload)
58-overview-fb-status.js  // FB Status panel (list + search, replaces palette)
58-overview-trace.js      // lazy trace SSE subscription + lifecycle
58-overview-events.js     // CustomEvent emission
```

- Разделение по responsibility, не по технологии (нет «controllers/»,
  «views/»).
- Модули коммуницируют через global scope (проект не использует ES modules).
- Порядок загрузки NN-prefix гарантирует dependencies: `node` базовый →
  `layout` / `navigation` / etc. используют его через globals.

### Data flow

```
┌─────────────────────────────────────────────────────────────┐
│                   System Overview tab                        │
│                                                              │
│  ┌────────────────┐    ┌────────────────┐    ┌────────────┐ │
│  │ FB Status      │    │ LiteGraph      │    │  Minimap   │ │
│  │  Panel         │    │  Canvas        │    │            │ │
│  │ (search/list)  │    │                │    │            │ │
│  └───────┬────────┘    └─────────┬──────┘    └──────┬─────┘ │
│          │                       │                  │       │
│          └──── click (emit uniset:node-clicked) ────┼─┐     │
│                                                     │ │     │
│                                                     ▼ ▼     │
│                                 (Spec 4 listener or noop)   │
└─────────────────────────────────────────────────────────────┘
          ▲                          ▲
          │ object_data (SSE)        │ trace (SSE, lazy)
          │                          │
  /api/events?object=...     /api/trace/events?object=...
```

### CustomEvent contract

```js
// Схема открыта
document.dispatchEvent(new CustomEvent('uniset:schema-opened', {
    detail: { serverId, serverName, objectNames: [...] }
}));

// Клик по ноде
document.dispatchEvent(new CustomEvent('uniset:node-clicked', {
    detail: { serverId, serverName, objectName, nodeId, element }
}));

// Двойной клик (open in new tab / pin detail panel)
document.dispatchEvent(new CustomEvent('uniset:node-double-clicked', { ... }));

// Схема закрыта — cleanup triggers
document.dispatchEvent(new CustomEvent('uniset:schema-closed', {
    detail: { serverId }
}));
```

Слабая связанность: Спек 3 не знает о Спеке 4. Если подписчика нет —
event идёт в dead letter, ничего не ломается.

### Trace subscription API (предоставляется Спеком 3 для Спека 4)

```js
// 58-overview-trace.js exposes:
window.UnisetOverview.trace = {
    subscribe(serverId, objectName, intervalMS, onBatch) {
        // Open EventSource to /api/trace/events?...
        // Parse incoming events, call onBatch(batch) per received.
        // Returns subscription token.
    },
    unsubscribe(token) {
        // Close EventSource.
    },
    enable(serverId, objectName, size) { /* POST proxy */ },
    disable(serverId, objectName) { /* POST proxy */ },
};
```

Спек 4 вызывает `subscribe(...)` при открытии detail panel, `unsubscribe(...)`
при закрытии. EventSource lifecycle управляет sample рядом:
- `autoReconnect: true` (EventSource default).
- При network drop → одна «disabled: false» batch, потом auto-retry.

## Layout — переход на Sugiyama через dagre

`dagre.js` в `ui/static/js/vendor/dagre.min.js` (~20KB gzip). Используется
для вычисления координат; затем координаты передаются в LiteGraph nodes.

```js
// 58-overview-layout.js
function computeSugiyamaPositions(nodes, edges) {
    const g = new dagre.graphlib.Graph().setGraph({
        rankdir: autoOrientation(nodes, edges) // 'LR' or 'TB'
    });
    for (const n of nodes) g.setNode(n.name, { width: 220, height: 140 });
    for (const e of edges) g.setEdge(e.fromNode, e.toNode);
    dagre.layout(g);

    const positions = {};
    for (const name of g.nodes()) {
        const { x, y } = g.node(name);
        positions[name] = { x, y };
    }
    return positions;
}
```

**autoOrientation** — выбирает LR/TB на основе aspect ratio входного графа.
Пользовательский выбор — через View dropdown (заменяет H/V toggle).

**Manual positions**: если пользователь drag'ом переместил ноду, позиция
сохраняется в `viewState.manualPositions[nodeName] = {x, y}` и имеет
приоритет при re-layout.

**Fallback**: если `dagre` не загружен (network error), используется
existing H-layout.

## FB Status panel (replacing palette)

Вместо текущей палитры — панель:

```
┌─────────────────────────┐
│ FB Status (N objects)   │
│                         │
│ [🔍 Filter (type :x)]   │
│                         │
│ ┌─────────────────────┐ │
│ │ DG_Control    (DG)  │ │  click → scrollTo + highlight
│ └─────────────────────┘ │  dblclick → emit node-double-clicked
│ ...                     │
└─────────────────────────┘
```

- Поиск с type-ahead. Префикс `:` — поиск по типу UObject (тип из
  ServerObjects meta, если есть).
- Карточка минимальна: name + optional (type). Status indicator —
  **deferred**, появится когда в Спеке 4 появятся vmon state_* (сейчас
  статус не имеем чем показать).

## Navigation UX

### Hotkeys

| Key | Action |
|---|---|
| `F` | Fit to screen |
| `0` | Reset zoom to 100% |
| `+` / `-` | Zoom in/out |
| `Home` | Scroll to origin |
| `V` | Toggle Values |
| `W` | Toggle Wires |
| `M` | Toggle Minimap |
| `/` | Focus FB Status search |
| `Esc` | Clear highlight; close help |
| `?` | Toggle help overlay |

Все hotkeys ignored если `document.activeElement` — input/textarea. Help
overlay показывает таблицу выше с текущими привязками.

### Minimap

- Плавающая панель ~200×150 в правом нижнем углу.
- Renders scaled-down copy schema (simplified: цветные прямоугольники без
  текста).
- Viewport rectangle → click/drag для pan.
- Toggle via `M` или View dropdown.
- При очень вытянутых схемах (aspect ratio > 4) — auto-resize до 300×80 или
  100×200.

### Click-to-highlight

- Клик по ноде → CSS class `.hi-node` применяется к клицнутой;
  `.hi-edge` — ко всем её input/output edges; `.hi-neighbor` — к нодам
  на обратной стороне edges. Остальные получают `.dim`.
- `Esc` или клик по пустому месту → сбрасывает.
- Работает даже при `Wires off` — есть CSS override:
  `.hi-edge { opacity: 1 !important; stroke-width: 3px; }`.

### Zoom around cursor

- `Ctrl+wheel` — zoom с фиксацией точки под курсором.
- Реализация: до zoom записываем world coords точки под cursor'ом, после
  — восстанавливаем scroll так что та же точка осталась.

### Level-of-detail

- zoom < 50%: `port-label` получает `.lod-hidden` (CSS `display: none`).
- zoom < 25%: блоки упрощаются — LiteGraph `onDrawForeground` рисует
  только цветной прямоугольник с именем, без портов.

### Toggles и View dropdown

Single dropdown button `[View ▾]` с checkboxes:
- `[ ] Wires` (default on)
- `[ ] Values` (default on)
- `[ ] Minimap` (default off)
- `[ ] Backgrounds` (заглушка, для будущего)

Hotkeys дублируют пункты. State persist в localStorage.

### SVG export

- Кнопка `[SVG]` в toolbar.
- Converts LiteGraph canvas state → SVG string (serialize nodes as
  `<g><rect/><text/></g>`, edges как `<path>`).
- Triggers download via `Blob + URL.createObjectURL`.

### Double-click edge → signal info

- `dblclick` handler на edge.
- Открывает маленький tooltip рядом с edge: `{from: "DG_Control.Start",
  to: "GDG1.Start_Out", value: TRUE}`.
- Dismiss по клику вне или Esc.

## Persistent view state

Key: `uniset-panel:overview:<serverId>` (JSON).

```json
{
    "zoom": 1.2,
    "offsetX": 0,
    "offsetY": 0,
    "toggles": {
        "wires": true,
        "values": true,
        "minimap": false,
        "groupBackgrounds": false
    },
    "searchQuery": "",
    "manualPositions": {
        "DG_Control": { "x": 120, "y": 50 }
    }
}
```

- Debounce save: 300ms после изменения.
- Flush on `beforeunload`.
- Try/catch вокруг `localStorage.setItem` — quota/disabled → silent fail,
  `console.warn` once.
- Load at schema open, apply before render.

## Error handling

| Сценарий | Действие |
|---|---|
| `/api/overview` → ошибка | existing `openOverviewErrorTab` |
| `dagre.js` не загружен | fallback на H-layout, `console.warn` |
| `localStorage` quota/disabled | silent fail, state reset к дефолту |
| trace SSE drops | EventSource auto-reconnect; одна `enabled=false` batch в интерим |
| Spec 4 не подключён (event dead letter) | OK, игнорируется |
| `manualPositions` переопределяют авто-layout | не переопределять dragged ноды |
| FB Status search — пустой результат | show "No matches" placeholder |
| minimap canvas fail | hide minimap, warn, остальное работает |

## Testing strategy

### Unit (Vitest или аналог, если в проекте есть; иначе JSDOM-based)

- `layout.spec.js` — dagre output coordinates на фикстурах (3-4 ноды,
  проверка LR vs TB).
- `state.spec.js` — localStorage roundtrip, debounce logic, quota fail.
- `trace.spec.js` — `subscribe` открывает EventSource на правильный URL,
  `unsubscribe` закрывает, reconnect на error.
- `highlight.spec.js` — CSS classes правильно применяются на cascade,
  Esc clears.

### E2E (Playwright, existing)

Новый `tests/overview-spec3.spec.ts` с mock server:
- Открыть схему сервера → проверить всех нод отображено.
- Кликнуть на ноду → проверить `uniset:node-clicked` event fired.
- Hotkey `F` → fit (viewport = bounding box всех нод).
- Type-ahead в FB Status panel → список filtered.
- Minimap click → viewport scrolls.
- Toggle `V` → port values скрыты.
- localStorage reload → state восстановлен.

### Mock server

Существующий из `story/system-overview`. Добавить trace endpoint stub
(возвращает пустой `{trace: {records: []}}`) чтобы E2E могли тестировать
subscribe/unsubscribe.

## Files to create/modify

### New

- `ui/static/js/src/58-overview-node.js` (extracted from current)
- `ui/static/js/src/58-overview-core.js` (extracted orchestration)
- `ui/static/js/src/58-overview-layout.js` (dagre integration)
- `ui/static/js/src/58-overview-navigation.js` (hotkeys + minimap + LOD + zoom)
- `ui/static/js/src/58-overview-highlight.js` (click-to-highlight)
- `ui/static/js/src/58-overview-state.js` (localStorage)
- `ui/static/js/src/58-overview-fb-status.js` (FB Status panel)
- `ui/static/js/src/58-overview-trace.js` (trace SSE API)
- `ui/static/js/src/58-overview-events.js` (CustomEvent emission)
- `ui/static/js/vendor/dagre.min.js` (new vendor)
- `tests/overview-spec3.spec.ts` (Playwright E2E)

### Modified

- `ui/static/js/src/58-system-overview.js` — **deleted** after
  decomposition; history preserved via git.
- Existing CSS (add classes `.hi-node`, `.hi-edge`, `.hi-neighbor`, `.dim`,
  `.lod-hidden`, FB Status styling, minimap).
- HTML template (overview.html или similar) — FB Status panel container,
  View dropdown, help overlay modal.

### Not modified

- `internal/api/` (backend) — Спек 3 чисто фронтенд.
- `internal/trace/` — Спек 2 уже предоставил SSE.
- `UniSetProcessNode` code — оставляем как есть, только extracted в файл.

## Backward compatibility

- Существующие users story/system-overview при merge получат новую UX.
  Visual breaking change: text-labels на рёбрах заменены на линии
  (по согласованию).
- `/api/overview` contract не меняется.
- localStorage migration: если `uniset-panel:overview:<server>` имел
  старый формат, скипаем его (default state) с `console.warn`.

## Implementation order (для плана)

1. Extract `UniSetProcessNode` в `58-overview-node.js` (no logic change).
2. Extract core orchestration в `58-overview-core.js`.
3. `58-overview-state.js` — localStorage persist (с тестами).
4. `58-overview-events.js` — CustomEvent emission.
5. `58-overview-layout.js` — dagre integration + manualPositions.
6. `58-overview-navigation.js` — hotkeys + help overlay.
7. `58-overview-navigation.js` (cont.) — minimap.
8. `58-overview-navigation.js` (cont.) — zoom-around-cursor + LOD.
9. `58-overview-highlight.js` — click-to-highlight + dblclick-edge.
10. `58-overview-fb-status.js` — FB Status panel (replacing palette).
11. `58-overview-trace.js` — lazy trace SSE API.
12. Visual polish — line-wires instead of text-labels, View dropdown.
13. SVG export.
14. Playwright E2E.
15. Cleanup — delete `58-system-overview.js`, update HTML template.

## Open risks

- **dagre performance** на 100+ нодах — вряд ли проблема (~50ms computation),
  но если да — fallback на H-layout + warning.
- **CustomEvent contract** требует совместимой эволюции: если Спек 4
  эволюционирует detail в event, Спек 3 придётся обновлять. Решение —
  keep detail schema минимальным.
- **Extract без логики change** рискованно на 1438-строчном файле:
  легко случайно потерять coupling. Testing strategy должна это поймать
  (E2E smoke до/после extract).
- **SVG export** на canvas-based LiteGraph — нужно re-render в SVG (не
  прямой canvas→SVG конверт). Riskier feature; если block'нет, deferred.
