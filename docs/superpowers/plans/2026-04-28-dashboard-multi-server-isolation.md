# Dashboard Multi-Server Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить `sensorName` на canonical `sensorKey` (формат `${serverId}|${objectName}|${sensorName}`) в dashboard cache/subscriptions/SSE update path, добавить `serverId` в active widget config с auto-migration legacy dashboard'ов, ввести vitest для unit-тестов helper'ов.

**Architecture:** `sensorKey` — обычная строка, работает как ключ в существующих Map'ах. SSE handler (`04-sse.js`) уже получает `serverId`/`objectName` в payload — собираем key и передаём через update-цепочку (`updateDashboardWidgets` → `handleSensorUpdate` → подписки). Active widget config form получает Server dropdown первым полем; `parseConfigForm` сохраняет `serverId`; `_doWrite` использует `config.serverId` (с legacy fallback + warning); `loadDashboard` запускает auto-migration для existing widgets без `serverId`.

**Tech Stack:** vanilla JS (concat'ится через `ui/concat.go` в `app.js`), Playwright E2E (existing), vitest 1.6 + jsdom 24 (новое — через `setupFiles` + `globalThis`, без ESM refactor).

---

## File structure

**New files:**
- `ui/static/js/src/09-sensor-key.js` — `makeSensorKey` + `parseSensorKey`, прикрепляются к `globalThis` (работает в browser и в node)
- `tests/unit/package.json` — vitest+jsdom dev deps
- `tests/unit/vitest.config.ts` — jsdom env, setupFiles
- `tests/unit/setup.ts` — загружает `09-sensor-key.js` в `globalThis` через `new Function(src)()`
- `tests/unit/sensor-key.test.ts` — round-trip + edge cases
- `tests/single/dashboard-multi-server-isolation.spec.ts` — 4 E2E сценария

**Modified files:**
- `ui/static/js/src/00-state.js` — комментарий `sensorValuesCache`
- `ui/static/js/src/60-dashboard-base.js` — комментарии 3 subscription map'ов
- `ui/static/js/src/04-sse.js` — `ionc_sensor_batch` handler: cache по sensorKey, передача ctx
- `ui/static/js/src/63-dashboard-dialogs.js` — `updateDashboardWidgets(sensors, ctx)`
- `ui/static/js/src/62-dashboard-manager.js` — `handleSensorUpdate(sensorKey,...)`, `updateSensorSubscriptions` строит keys, `fetchSensorValues` использует sensorKey, `loadDashboard` вызывает `_migrateLegacyServerIds`, два новых helper'а
- `ui/static/js/src/61-dashboard-active-base.js` — Server dropdown в `getConfigForm`, `parseConfigForm.serverId`, Server change handler в `initConfigHandlers`, `_doWrite` использует `config.serverId` с fallback + warning
- `Makefile` — `js-tests-unit` + `js-tests-all` targets
- `tests/single/dashboard-active-toggle.spec.ts` — `serverId` в widget config helpers, проверка `?server=...` в write URL
- `tests/single/dashboard-active-base.spec.ts` — smoke for serverId persist
- `CLAUDE.md` — Sensor identity section
- `docs/naming-conventions.md` — Sensor identity section
- `docs/dashboards.md` — Server dropdown в active widgets section

---

### Task 1: vitest infra + sensor-key helper

**Files:**
- Create: `tests/unit/package.json`, `tests/unit/vitest.config.ts`, `tests/unit/setup.ts`, `tests/unit/sensor-key.test.ts`, `ui/static/js/src/09-sensor-key.js`
- Modify: `Makefile`

**Why first:** Foundation — все остальные задачи будут вызывать `makeSensorKey`. Vitest проверим работу helper'а в изоляции до интеграции.

- [ ] **Step 1.1: Create vitest config infra**

Create `tests/unit/package.json`:
```json
{
  "name": "uniset-panel-unit-tests",
  "private": true,
  "type": "module",
  "devDependencies": {
    "vitest": "^1.6.0",
    "jsdom": "^24.0.0"
  }
}
```

Create `tests/unit/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'jsdom',
        setupFiles: ['./setup.ts'],
        include: ['*.test.ts'],
    },
});
```

Create `tests/unit/setup.ts`:
```ts
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(__dirname, '../../ui/static/js/src');

function loadSource(filename: string) {
    const src = readFileSync(resolve(SRC_DIR, filename), 'utf8');
    new Function(src)();
}

loadSource('09-sensor-key.js');
```

- [ ] **Step 1.2: Write the failing test**

Create `tests/unit/sensor-key.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

declare const makeSensorKey: (serverId: string, objectName: string, sensorName: string) => string;
declare const parseSensorKey: (key: string) => { serverId: string; objectName: string; sensorName: string } | null;

describe('makeSensorKey / parseSensorKey', () => {
    it('round-trip with normal values', () => {
        const key = makeSensorKey('srv1', 'SharedMemory', 'Temp');
        expect(key).toBe('srv1|SharedMemory|Temp');
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
        expect(parseSensorKey('foo|bar|baz|extra')).toBeNull();
    });

    it('returns null for non-string', () => {
        expect(parseSensorKey(null as any)).toBeNull();
        expect(parseSensorKey(undefined as any)).toBeNull();
        expect(parseSensorKey(123 as any)).toBeNull();
    });

    it('keys with same triplet are equal as strings (Map key semantics)', () => {
        expect(makeSensorKey('a', 'b', 'c')).toBe(makeSensorKey('a', 'b', 'c'));
    });
});
```

- [ ] **Step 1.3: Run test, verify it fails**

Run from project root:
```bash
cd tests/unit && npm install && npx vitest run
```
Expected: FAIL — `setup.ts loadSource` throws ENOENT для `09-sensor-key.js` (файл ещё не создан).

- [ ] **Step 1.4: Create 09-sensor-key.js**

Create `ui/static/js/src/09-sensor-key.js`:
```js
// ============================================================================
// Sensor key — canonical identity для датчика во frontend.
// Формат: ${serverId}|${objectName}|${sensorName}
// Разделитель `|` (не `:`), чтобы не путать с tabKey (serverId:objectName).
// Используется как ключ в dashboard cache/subscription Map'ах и SSE update routing.
// См. CLAUDE.md "Sensor identity (multi-server)" + spec
// docs/superpowers/specs/2026-04-28-dashboard-multi-server-isolation-design.md
// ============================================================================

function makeSensorKey(serverId, objectName, sensorName) {
    return `${serverId}|${objectName}|${sensorName}`;
}

function parseSensorKey(key) {
    if (typeof key !== 'string') return null;
    const parts = key.split('|');
    if (parts.length !== 3) return null;
    return { serverId: parts[0], objectName: parts[1], sensorName: parts[2] };
}

// Прикрепляем к globalThis (работает в browser и node test env).
globalThis.makeSensorKey = makeSensorKey;
globalThis.parseSensorKey = parseSensorKey;
```

- [ ] **Step 1.5: Rebuild app.js + run vitest**

Run:
```bash
cd /home/pv/Projects/uniset-panel
make app
cd tests/unit && npx vitest run
```
Expected: `app.js` regenerated, 5 tests PASS.

- [ ] **Step 1.6: Add Makefile target**

Modify `Makefile` — append after the `js-tests-multi` target block:
```makefile
js-tests-unit:
	cd tests/unit && npm install --no-fund --no-audit && npx vitest run

# All E2E + unit tests
js-tests-all: js-tests js-tests-unit
```

В `.PHONY` секцию добавить `js-tests-unit js-tests-all`.

- [ ] **Step 1.7: Verify make target**

Run:
```bash
make js-tests-unit
```
Expected: same 5 tests PASS.

- [ ] **Step 1.8: Commit**

```bash
git add tests/unit/ ui/static/js/src/09-sensor-key.js ui/static/js/app.js Makefile
git commit -m "feat: vitest infra + sensorKey helper

09-sensor-key.js: makeSensorKey/parseSensorKey + globalThis attachment.
tests/unit/: vitest 1.6 + jsdom 24, setupFiles загружает helper через
new Function(src)() (без ESM refactor). 5 unit-тестов зелёные.
make js-tests-unit / js-tests-all targets.

Spec: docs/superpowers/specs/2026-04-28-dashboard-multi-server-isolation-design.md
Task 1.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
"
```

---

### Task 2: Cache + 3 subscriptions переключаются на sensorKey

**Files:**
- Modify: `ui/static/js/src/00-state.js`, `ui/static/js/src/60-dashboard-base.js`, `ui/static/js/src/04-sse.js`, `ui/static/js/src/63-dashboard-dialogs.js`, `ui/static/js/src/62-dashboard-manager.js`

**Why bundle:** Все эти файлы должны измениться atomic — иначе routing порвётся (cache пишется по key, но `handleSensorUpdate` ищет по name).

- [ ] **Step 2.1: Update state + base comments**

Modify `ui/static/js/src/00-state.js`. Replace:
```js
    sensorValuesCache: new Map(), // sensorName -> { value, error, timestamp } - cache for dashboard init
```
with:
```js
    sensorValuesCache: new Map(), // sensorKey -> { value, error, timestamp } — cache for dashboard init. sensorKey = `${serverId}|${objectName}|${sensorName}` (см. 09-sensor-key.js)
```

Modify `ui/static/js/src/60-dashboard-base.js`. Replace 3 lines (subscription Map declarations с комментариями про sensorName):
```js
    sensorSubscriptions: new Map(), // sensorName -> Set of widgetIds
    setpointSubscriptions: new Map(), // sensor2Name -> Set of widgetIds
    chartSubscriptions: new Map(), // sensorName -> Set of widgetIds
```
with:
```js
    sensorSubscriptions: new Map(), // sensorKey -> Set of widgetIds (sensorKey = ${serverId}|${objectName}|${sensorName})
    setpointSubscriptions: new Map(), // sensorKey -> Set of widgetIds (для setpoint sensor2)
    chartSubscriptions: new Map(), // sensorKey -> Set of widgetIds
```

- [ ] **Step 2.2: SSE handler — write cache by key, pass ctx**

Modify `ui/static/js/src/04-sse.js`. В блоке `eventSource.addEventListener('ionc_sensor_batch', ...)` заменить cache loop и вызов `updateDashboardWidgets`.

Find:
```js
            // Cache sensor values for dashboard initialization
            const now = Date.now();
            for (const sensor of sensors) {
                state.sensorValuesCache.set(sensor.name, {
                    value: sensor.value,
                    error: sensor.error || null,
                    timestamp: now
                });
            }

            // Обновляем виджеты на dashboard
            updateDashboardWidgets(sensors, event.timestamp || null);
```

Replace with:
```js
            // Cache sensor values for dashboard initialization (по sensorKey).
            const now = Date.now();
            for (const sensor of sensors) {
                const key = makeSensorKey(serverId, objectName, sensor.name);
                state.sensorValuesCache.set(key, {
                    value: sensor.value,
                    error: sensor.error || null,
                    timestamp: now
                });
            }

            // Обновляем виджеты на dashboard (с контекстом для построения sensorKey).
            updateDashboardWidgets(sensors, { serverId, objectName, timestamp: event.timestamp || null });
```

- [ ] **Step 2.3: updateDashboardWidgets accepts ctx**

Modify `ui/static/js/src/63-dashboard-dialogs.js`. Replace `updateDashboardWidgets`:
```js
// Helper to update dashboard widgets from SSE events
function updateDashboardWidgets(sensors, timestamp = null) {
    if (!dashboardManager || !sensors) return;

    for (const sensor of sensors) {
        const name = sensor.name;
        const value = sensor.value;
        const error = sensor.error || null;

        if (name !== undefined && value !== undefined) {
            dashboardManager.handleSensorUpdate(name, value, error, timestamp);
        }
    }
}
```

with:
```js
// Helper to update dashboard widgets from SSE events.
// ctx: { serverId, objectName, timestamp } — нужен для построения sensorKey
// (canonical identity sensors во frontend — см. CLAUDE.md "Sensor identity").
function updateDashboardWidgets(sensors, ctx) {
    if (!dashboardManager || !sensors) return;
    if (!ctx || !ctx.serverId || !ctx.objectName) {
        console.warn('updateDashboardWidgets: ctx без serverId/objectName, skip');
        return;
    }

    for (const sensor of sensors) {
        const name = sensor.name;
        const value = sensor.value;
        const error = sensor.error || null;

        if (name !== undefined && value !== undefined) {
            const key = makeSensorKey(ctx.serverId, ctx.objectName, name);
            dashboardManager.handleSensorUpdate(key, value, error, ctx.timestamp || null);
        }
    }
}
```

- [ ] **Step 2.4: handleSensorUpdate receives sensorKey**

Modify `ui/static/js/src/62-dashboard-manager.js`. Find `handleSensorUpdate` (метод вокруг line 1710). Replace parameter name and 3 Map lookups:

Find:
```js
    handleSensorUpdate(sensorName, value, error = null, timestamp = null) {
        // Main sensor updates
        const widgetIds = dashboardState.sensorSubscriptions.get(sensorName);
```

Replace with:
```js
    handleSensorUpdate(sensorKey, value, error = null, timestamp = null) {
        // sensorKey = ${serverId}|${objectName}|${sensorName} — canonical identity.
        // Main sensor updates
        const widgetIds = dashboardState.sensorSubscriptions.get(sensorKey);
```

Дальше в этом же методе найти `dashboardState.setpointSubscriptions.get(sensorName)` и `dashboardState.chartSubscriptions.get(sensorName)` — заменить `sensorName` на `sensorKey` в обоих местах.

- [ ] **Step 2.5: updateSensorSubscriptions builds keys from widget config**

Modify `ui/static/js/src/62-dashboard-manager.js`. Найти `updateSensorSubscriptions` (метод около line 1660). Replace весь body:

Find:
```js
    updateSensorSubscriptions() {
        dashboardState.sensorSubscriptions.clear();
        dashboardState.setpointSubscriptions.clear();
        dashboardState.chartSubscriptions.clear();

        dashboardState.widgets.forEach((widget, id) => {
            // Main sensor subscription
            const sensor = widget.config?.sensor;
            if (sensor) {
                if (!dashboardState.sensorSubscriptions.has(sensor)) {
                    dashboardState.sensorSubscriptions.set(sensor, new Set());
                }
                dashboardState.sensorSubscriptions.get(sensor).add(id);
            }

            // Setpoint sensor subscription (for dual scale)
            const sensor2 = widget.config?.sensor2;
            if (sensor2) {
                if (!dashboardState.setpointSubscriptions.has(sensor2)) {
                    dashboardState.setpointSubscriptions.set(sensor2, new Set());
                }
                dashboardState.setpointSubscriptions.get(sensor2).add(id);
            }

            // StatusBar items subscription (multiple sensors in items array)
            const items = widget.config?.items;
            if (Array.isArray(items)) {
                items.forEach(item => {
                    if (item.sensor) {
                        if (!dashboardState.sensorSubscriptions.has(item.sensor)) {
                            dashboardState.sensorSubscriptions.set(item.sensor, new Set());
                        }
                        dashboardState.sensorSubscriptions.get(item.sensor).add(id);
                    }
                });
            }

            // Chart widget subscriptions (multiple sensors from zones)
            if (widget instanceof ChartWidget && typeof widget.getSensorNames === 'function') {
                const sensorNames = widget.getSensorNames();
                for (const sensorName of sensorNames) {
                    if (!dashboardState.chartSubscriptions.has(sensorName)) {
                        dashboardState.chartSubscriptions.set(sensorName, new Set());
                    }
                    dashboardState.chartSubscriptions.get(sensorName).add(id);
                }
            }
        });
    }
```

Replace with:
```js
    updateSensorSubscriptions() {
        dashboardState.sensorSubscriptions.clear();
        dashboardState.setpointSubscriptions.clear();
        dashboardState.chartSubscriptions.clear();

        // Helper: добавить (key, id) в Map<key, Set<id>>
        const addSub = (map, key, id) => {
            if (!map.has(key)) map.set(key, new Set());
            map.get(key).add(id);
        };

        dashboardState.widgets.forEach((widget, id) => {
            const cfg = widget.config;
            if (!cfg) return;
            const serverId = cfg.serverId;
            const objectName = cfg.objectName;

            // Main sensor subscription. Без serverId+objectName ключ не строим
            // (legacy widget — миграция заполнит на следующем load).
            if (cfg.sensor && serverId && objectName) {
                addSub(dashboardState.sensorSubscriptions,
                    makeSensorKey(serverId, objectName, cfg.sensor), id);
            }

            // Setpoint sensor subscription (sensor2 — может иметь свой objectName2).
            if (cfg.sensor2 && serverId) {
                const obj2 = cfg.objectName2 || objectName;
                if (obj2) {
                    addSub(dashboardState.setpointSubscriptions,
                        makeSensorKey(serverId, obj2, cfg.sensor2), id);
                }
            }

            // StatusBar items (multiple sensors).
            if (Array.isArray(cfg.items) && serverId && objectName) {
                cfg.items.forEach(item => {
                    if (item?.sensor) {
                        addSub(dashboardState.sensorSubscriptions,
                            makeSensorKey(serverId, objectName, item.sensor), id);
                    }
                });
            }

            // Chart widget subscriptions (multiple sensors from zones).
            if (widget instanceof ChartWidget && typeof widget.getSensorNames === 'function'
                    && serverId && objectName) {
                const sensorNames = widget.getSensorNames();
                for (const sensorName of sensorNames) {
                    addSub(dashboardState.chartSubscriptions,
                        makeSensorKey(serverId, objectName, sensorName), id);
                }
            }
        });
    }
```

- [ ] **Step 2.6: fetchSensorValues uses sensorKey for cache**

Modify `ui/static/js/src/62-dashboard-manager.js`. Найти `fetchSensorValues` (около line 380-470). Это длинный метод — нужно заменить две точки.

**Точка А (read cache, около line 396):** найти строку:
```js
            const cached = state.sensorValuesCache.get(name);
```
И contextually выше — где находится `widget.config?.sensor`. Заменить эту строку на:
```js
            const cfg = widget.config;
            const cacheKey = (cfg?.serverId && cfg?.objectName)
                ? makeSensorKey(cfg.serverId, cfg.objectName, name)
                : null;
            const cached = cacheKey ? state.sensorValuesCache.get(cacheKey) : null;
```

И найти `this.handleSensorUpdate(name, ...)` ниже в том же блоке — заменить на:
```js
                    this.handleSensorUpdate(cacheKey, cached.value, cached.error);
```

(Если `cacheKey === null` — раньше `cached` тоже null'ом был бы, поведение совместимо.)

**Точка B (write cache, около line 461):** найти строку:
```js
                    state.sensorValuesCache.set(name, {
```
Нужно знать контекст — это внутри loop'а `for (const sensor of grp.sensors)` (или похожее), где `grp.serverId` и `grp.objectName` известны. Заменить на:
```js
                    const writeKey = makeSensorKey(grp.serverId, grp.objectName, sensor.name);
                    state.sensorValuesCache.set(writeKey, {
```

И ниже `this.handleSensorUpdate(sensor.name, sensor.value, null);` (или похожее) — заменить на:
```js
                    this.handleSensorUpdate(writeKey, sensor.value, null);
```

(При отличии имени локальной переменной — engineer должен прочесть код и адаптировать. Suffix `Key` в имени переменной — обязателен, чтобы не путать с `name`.)

- [ ] **Step 2.7: Rebuild app.js + run dashboard E2E specs**

Run:
```bash
make app
docker compose down
docker compose build viewer
docker compose up -d viewer
sleep 8
docker compose run --rm e2e single/dashboard-active-toggle.spec.ts single/dashboard-active-base.spec.ts single/dashboard-widgets.spec.ts
```
Expected: PASS. (Existing single-server specs работают, потому что в SSE event серверId/objectName реальные → sensorKey корректный.)

- [ ] **Step 2.8: Commit**

```bash
git add ui/static/js/src/00-state.js ui/static/js/src/60-dashboard-base.js ui/static/js/src/04-sse.js ui/static/js/src/63-dashboard-dialogs.js ui/static/js/src/62-dashboard-manager.js ui/static/js/app.js
git commit -m "refactor(dashboard): cache + subscriptions используют sensorKey

Все 4 dashboard Map'а (sensorValuesCache, sensorSubscriptions,
setpointSubscriptions, chartSubscriptions) переключены на sensorKey
вместо коротких sensorName. SSE handler ionc_sensor_batch строит key
из event.serverId + event.objectName + sensor.name, передаёт через
updateDashboardWidgets(ctx) → handleSensorUpdate(key, ...).
fetchSensorValues пишет/читает cache по key (через widget.config.serverId/objectName).
updateSensorSubscriptions строит ключи для всех типов (main sensor,
sensor2 setpoint, items array, chart widget zones).

Существующее single-server поведение не меняется (key включает реальный
serverId/objectName, просто становится длиннее). Multi-server isolation
становится корректной.

Spec: docs/superpowers/specs/2026-04-28-dashboard-multi-server-isolation-design.md
Task 2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
"
```

---

### Task 3: Active widget config — Server dropdown + parse + change handler + _doWrite fallback

**Files:**
- Modify: `ui/static/js/src/61-dashboard-active-base.js`

- [ ] **Step 3.1: Add Server dropdown to getConfigForm**

Modify `ui/static/js/src/61-dashboard-active-base.js`. Найти `static getConfigForm(config = {})` (около line 235). Заменить тело метода целиком:

Find:
```js
    static getConfigForm(config = {}) {
        const styleSelect = (this.styles && this.styles.length > 1)
            ? `
            <div class="widget-config-field">
                <label>Style</label>
                <select class="widget-input" name="style" data-test="cfg-style">
                    ${this.styles.map(s => `<option value="${escapeHtml(s)}" ${(config.style || this.defaultStyle) === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
                </select>
            </div>
            `
            : '';

        const baseFields = `
            <div class="widget-config-field">
                <label>IONC Object</label>
                <select class="widget-input" name="objectName" data-test="cfg-objectName">
                    <option value="${escapeHtml(config.objectName || 'SharedMemory')}" selected>${escapeHtml(config.objectName || 'SharedMemory')}</option>
                </select>
                <small style="color:#6b7280">список загружается из /api/objects?type=IONotifyController</small>
            </div>
            <div class="widget-config-field">
                <label>Sensor</label>
                <div class="sensor-select-wrap">
                    <input type="text" class="widget-input sensor-select-input" name="sensor" autocomplete="off"
                           placeholder="Click to select or type to search..."
                           value="${escapeHtml(config.sensor || '')}" data-test="cfg-sensor">
                    <input type="hidden" name="sensorId" value="${config.sensorId ?? ''}" data-test="cfg-sensorId">
                </div>
            </div>
            ${styleSelect}
            <div class="widget-config-field">
                <label>Label</label>
                <input type="text" class="widget-input" name="label"
                       value="${escapeHtml(config.label || '')}" placeholder="Display label">
            </div>
            <div class="widget-config-field">
                <label class="widget-checkbox-label">
                    <input type="checkbox" name="requireConfirmation"
                           ${config.requireConfirmation ? 'checked' : ''}>
                    <span>Require confirmation before write</span>
                </label>
            </div>
        `;
        return baseFields + (this.getActiveConfigFields ? this.getActiveConfigFields(config) : '');
    }
```

Replace with:
```js
    static getConfigForm(config = {}) {
        const styleSelect = (this.styles && this.styles.length > 1)
            ? `
            <div class="widget-config-field">
                <label>Style</label>
                <select class="widget-input" name="style" data-test="cfg-style">
                    ${this.styles.map(s => `<option value="${escapeHtml(s)}" ${(config.style || this.defaultStyle) === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
                </select>
            </div>
            `
            : '';

        // Server dropdown — первое поле, определяет список IONC objects ниже.
        // Показываем connected серверы + текущий config.serverId (даже если disconnected),
        // чтобы юзер видел свой выбор.
        const currentServerId = config.serverId || '';
        let serverOptions = '';
        for (const [id, srv] of state.servers) {
            if (srv.connected || id === currentServerId) {
                const sel = id === currentServerId ? 'selected' : '';
                serverOptions += `<option value="${escapeHtml(id)}" ${sel}>${escapeHtml(srv.name || id)}</option>`;
            }
        }

        const baseFields = `
            <div class="widget-config-field">
                <label>Server</label>
                <select class="widget-input" name="serverId" data-test="cfg-serverId">
                    ${serverOptions}
                </select>
            </div>
            <div class="widget-config-field">
                <label>IONC Object</label>
                <select class="widget-input" name="objectName" data-test="cfg-objectName">
                    <option value="${escapeHtml(config.objectName || 'SharedMemory')}" selected>${escapeHtml(config.objectName || 'SharedMemory')}</option>
                </select>
                <small style="color:#6b7280">список загружается из /api/objects?type=IONotifyController</small>
            </div>
            <div class="widget-config-field">
                <label>Sensor</label>
                <div class="sensor-select-wrap">
                    <input type="text" class="widget-input sensor-select-input" name="sensor" autocomplete="off"
                           placeholder="Click to select or type to search..."
                           value="${escapeHtml(config.sensor || '')}" data-test="cfg-sensor">
                    <input type="hidden" name="sensorId" value="${config.sensorId ?? ''}" data-test="cfg-sensorId">
                </div>
            </div>
            ${styleSelect}
            <div class="widget-config-field">
                <label>Label</label>
                <input type="text" class="widget-input" name="label"
                       value="${escapeHtml(config.label || '')}" placeholder="Display label">
            </div>
            <div class="widget-config-field">
                <label class="widget-checkbox-label">
                    <input type="checkbox" name="requireConfirmation"
                           ${config.requireConfirmation ? 'checked' : ''}>
                    <span>Require confirmation before write</span>
                </label>
            </div>
        `;
        return baseFields + (this.getActiveConfigFields ? this.getActiveConfigFields(config) : '');
    }
```

- [ ] **Step 3.2: parseConfigForm сохраняет serverId**

Modify `ui/static/js/src/61-dashboard-active-base.js`. Найти `static parseConfigForm(form)` (около line 286). Replace:

Find:
```js
        const base = {
            sensor:     form.querySelector('[name="sensor"]')?.value || '',
            sensorId:   (() => {
```

Replace with:
```js
        const base = {
            serverId:   form.querySelector('[name="serverId"]')?.value || null,
            sensor:     form.querySelector('[name="sensor"]')?.value || '',
            sensorId:   (() => {
```

- [ ] **Step 3.3: initConfigHandlers — Server change reloads IONC objects + resets sensor**

Modify `ui/static/js/src/61-dashboard-active-base.js`. Replace целиком метод `static initConfigHandlers(form, config = {})`:

Find:
```js
    static initConfigHandlers(form, config = {}) {
        if (form.dataset.activeHandlersWired === 'true') return;
        form.dataset.activeHandlersWired = 'true';

        const objectSelect = form.querySelector('[name="objectName"]');
        const sensorInput = form.querySelector('[name="sensor"]');
        const hiddenIdInput = form.querySelector('[name="sensorId"]');
        if (!objectSelect || !sensorInput || !hiddenIdInput) return;

        // Resolve serverId — first connected server (как в _resolveServerId).
        let serverId = '';
        for (const [id, srv] of state.servers) {
            if (srv.connected) { serverId = id; break; }
        }

        // Populate IONC objects dropdown.
        if (serverId) {
            fetch(`/api/objects?server=${encodeURIComponent(serverId)}&type=IONotifyController`)
                .then(r => r.ok ? r.json() : { objects: [] })
                .then(data => {
                    const objs = data.objects || [];
                    const currentValue = config.objectName || 'SharedMemory';
                    objectSelect.innerHTML = objs.map(o => {
                        const name = typeof o === 'string' ? o : o.name;
                        return `<option value="${escapeHtml(name)}" ${name === currentValue ? 'selected' : ''}>${escapeHtml(name)}</option>`;
                    }).join('');
                    if (!objs.some(o => (typeof o === 'string' ? o : o.name) === currentValue)) {
                        const opt = document.createElement('option');
                        opt.value = currentValue;
                        opt.textContent = `${currentValue} (текущий, не найден)`;
                        opt.selected = true;
                        objectSelect.prepend(opt);
                    }
                })
                .catch(e => console.warn('Failed to load IONC objects:', e));
        }

        // Setup sensor autocomplete.
        const ac = setupSensorAutocomplete(
            sensorInput,
            hiddenIdInput,
            () => objectSelect.value,
            () => serverId
        );

        // Reset sensor on object change.
        objectSelect.addEventListener('change', () => {
            if (ac && typeof ac.resetOnObjectChange === 'function') {
                ac.resetOnObjectChange();
            }
        });
    }
```

Replace with:
```js
    static initConfigHandlers(form, config = {}) {
        if (form.dataset.activeHandlersWired === 'true') return;
        form.dataset.activeHandlersWired = 'true';

        const serverSelect = form.querySelector('[name="serverId"]');
        const objectSelect = form.querySelector('[name="objectName"]');
        const sensorInput = form.querySelector('[name="sensor"]');
        const hiddenIdInput = form.querySelector('[name="sensorId"]');
        if (!serverSelect || !objectSelect || !sensorInput || !hiddenIdInput) return;

        // Helper: загрузить IONC objects для текущего serverId.
        const loadIONCObjects = (serverId) => {
            if (!serverId) {
                objectSelect.innerHTML = '<option value="" disabled selected>(выберите Server)</option>';
                return;
            }
            fetch(`/api/objects?server=${encodeURIComponent(serverId)}&type=IONotifyController`)
                .then(r => r.ok ? r.json() : { objects: [] })
                .then(data => {
                    const objs = data.objects || [];
                    // При смене сервера preferred = config.objectName, иначе первый из списка.
                    const currentValue = objectSelect.value || config.objectName || 'SharedMemory';
                    objectSelect.innerHTML = objs.map(o => {
                        const name = typeof o === 'string' ? o : o.name;
                        return `<option value="${escapeHtml(name)}" ${name === currentValue ? 'selected' : ''}>${escapeHtml(name)}</option>`;
                    }).join('');
                    if (!objs.some(o => (typeof o === 'string' ? o : o.name) === currentValue)) {
                        const opt = document.createElement('option');
                        opt.value = currentValue;
                        opt.textContent = `${currentValue} (текущий, не найден)`;
                        opt.selected = true;
                        objectSelect.prepend(opt);
                    }
                })
                .catch(e => console.warn('Failed to load IONC objects:', e));
        };

        // Initial load для текущего serverId.
        loadIONCObjects(serverSelect.value);

        // Setup sensor autocomplete (читает текущий serverId из form, не cached).
        const ac = setupSensorAutocomplete(
            sensorInput,
            hiddenIdInput,
            () => objectSelect.value,
            () => serverSelect.value
        );

        // Server change → reload objects + reset sensor.
        serverSelect.addEventListener('change', () => {
            loadIONCObjects(serverSelect.value);
            if (ac && typeof ac.resetOnObjectChange === 'function') {
                ac.resetOnObjectChange();
            }
        });

        // Object change → reset sensor.
        objectSelect.addEventListener('change', () => {
            if (ac && typeof ac.resetOnObjectChange === 'function') {
                ac.resetOnObjectChange();
            }
        });
    }
```

- [ ] **Step 3.4: _doWrite uses config.serverId с fallback + warning**

Modify `ui/static/js/src/61-dashboard-active-base.js`. Найти `_doWrite(value)` (около line 87). Replace block с serverId:

Find:
```js
        const serverId = this._resolveServerId();
        if (!serverId) {
            this._setWriteState('error', 'No connected server');
            return;
        }
```

Replace with:
```js
        const serverId = this.config?.serverId ?? this._resolveServerId();
        if (!serverId) {
            this._setWriteState('error', 'No server configured');
            return;
        }
        if (!this.config?.serverId) {
            console.warn(`Active widget ${this.id || '<unknown>'}: serverId missing in config, using fallback ${serverId} — config will be migrated on next dashboard load`);
        }
```

- [ ] **Step 3.5: Rebuild + run active widget E2E**

Run:
```bash
make app
docker compose build viewer && docker compose up -d viewer && sleep 8
docker compose run --rm e2e single/dashboard-active-toggle.spec.ts single/dashboard-active-base.spec.ts
```
Expected: PASS. Existing tests могут не упоминать `cfg-serverId`, но если widget config содержит правильный serverId через создание — должны работать.

Если падают — проверить, что existing `createToggleDashboard`-helper создаёт widget без `serverId` (тогда инициализация `Server dropdown` показывает «нет connected серверов» и dropdown пуст — может ломать sensor autocomplete). Если это так — fix в Task 7 (обновление существующих specs).

- [ ] **Step 3.6: Commit**

```bash
git add ui/static/js/src/61-dashboard-active-base.js ui/static/js/app.js
git commit -m "feat(dashboard): active widget config persists serverId

Server dropdown в config form (первое поле, перед IONC Object). При смене
serverId IONC Object dropdown перезагружается, sensor input очищается.
parseConfigForm сохраняет serverId в widget.config. _doWrite использует
config.serverId с fallback на _resolveServerId() (legacy + warning).
setupSensorAutocomplete получает getServerId() callback читающий
актуальный select value (поддержка change handler).

Spec: docs/superpowers/specs/2026-04-28-dashboard-multi-server-isolation-design.md
Task 3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
"
```

---

### Task 4: Auto-migration legacy widget configs

**Files:**
- Modify: `ui/static/js/src/62-dashboard-manager.js`

- [ ] **Step 4.1: Add helpers + call from loadDashboard**

Modify `ui/static/js/src/62-dashboard-manager.js`. Add two private methods to `DashboardManager` class. Insert ПЕРЕД `loadDashboard` (около line 287):

```js
    // Resolve первый connected server. Используется для legacy fallback и migration.
    _resolveFirstConnectedServerId() {
        if (typeof state === 'undefined' || !state.servers) return null;
        for (const [id, server] of state.servers) {
            if (server.connected) return id;
        }
        return null;
    }

    // Auto-migrate legacy active widget configs без serverId.
    // Single-shot: на первом load после deploy заполняет serverId первым connected,
    // сохраняет dashboard config обратно. На следующих load'ах no-op (уже есть serverId).
    // Не используем instanceof ActiveDashboardWidget напрямую — проверяем по контракту
    // (config.sensor + sensor отсутствует в pure-display chart widget).
    _migrateLegacyServerIds() {
        let dirty = false;
        for (const widget of dashboardState.widgets.values()) {
            if (widget?.config && !widget.config.serverId
                    && (widget.config.sensor || widget.config.sensorId)) {
                const fallback = this._resolveFirstConnectedServerId();
                if (fallback) {
                    widget.config.serverId = fallback;
                    dirty = true;
                    console.log(`Migrated legacy widget ${widget.id}: serverId=${fallback}`);
                }
            }
        }
        if (dirty && typeof dashboardState.currentDashboard === 'string') {
            this.saveDashboard(dashboardState.currentDashboard);
        }
    }
```

Insert call в `loadDashboard` — ПЕРЕД `this.updateSensorSubscriptions();` (находится около строки 371).

Find (внутри `loadDashboard`):
```js
        this.updateSensorSubscriptions();
```

Replace with:
```js
        this._migrateLegacyServerIds();
        this.updateSensorSubscriptions();
```

- [ ] **Step 4.2: Rebuild + manual smoke**

Run:
```bash
make app
docker compose build viewer && docker compose up -d viewer && sleep 8
```

Open `http://localhost:8000` in browser. В DevTools console:
```js
// Создать legacy dashboard с widget'ом без serverId
window.localStorage.setItem('uniset-panel-dashboards', JSON.stringify({
    'legacy-test': {
        widgets: [{
            id: 'w1',
            type: 'toggle',
            config: { sensor: 'Temp', objectName: 'SharedMemory', sensorId: 1 },
            x: 0, y: 0, width: 3, height: 2
        }]
    }
}));
location.reload();
```

После reload в console:
```js
const stored = JSON.parse(localStorage.getItem('uniset-panel-dashboards'));
console.log('After load, widget config:', stored['legacy-test'].widgets[0].config);
```
Expected: `widget.config.serverId` теперь содержит первый connected server id, в console до этого был лог `Migrated legacy widget w1: serverId=...`.

Cleanup:
```bash
docker compose down
```

- [ ] **Step 4.3: Commit**

```bash
git add ui/static/js/src/62-dashboard-manager.js ui/static/js/app.js
git commit -m "feat(dashboard): auto-migrate legacy widget configs без serverId

При loadDashboard синхронно ДО updateSensorSubscriptions перебираем
widgets, для каждого active widget'а (config.sensor || config.sensorId)
без config.serverId — заполняем первым connected серверу и пересохраняем
dashboard config через saveDashboard. Single-shot upgrade на первом
load после deploy. Дальше — no-op (serverId уже сохранён).

_resolveFirstConnectedServerId helper переиспользуется в _doWrite fallback.

Spec: docs/superpowers/specs/2026-04-28-dashboard-multi-server-isolation-design.md
Task 4.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
"
```

---

### Task 5: Documentation

**Files:**
- Modify: `CLAUDE.md`, `docs/naming-conventions.md`, `docs/dashboards.md`

- [ ] **Step 5.1: Add CLAUDE.md "Sensor identity" section**

Modify `CLAUDE.md`. Add новый раздел ПОСЛЕ раздела "UI Naming Conventions" (примерно перед концом файла). Найти конец секции "UI Naming Conventions" (последняя строка вроде `Полная документация: docs/naming-conventions.md`). После этой строки добавить:

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

- [ ] **Step 5.2: Update docs/naming-conventions.md**

Modify `docs/naming-conventions.md`. Add same section (тот же markdown текст из Step 5.1, начиная с `## Sensor identity (multi-server)`). Insert ПЕРЕД секцией `## SSE Events and Charts` (около line 119).

- [ ] **Step 5.3: Update docs/dashboards.md (active widgets section)**

Modify `docs/dashboards.md`. Найти раздел про active widgets (search "Виджеты — активные" или "Active dashboard widgets"). В подсекции про общий config dialog (рядом с описанием objectName + sensor) добавить:

```markdown
**Server dropdown:** первое поле в config dialog любого активного widget'а.
Определяет, на какой UniSet2 сервер пишется значение. Если у тебя один
сервер — он выбран по умолчанию. Если несколько — выбери конкретный.
Смена сервера в dropdown'е перезагружает список IONC объектов и
очищает выбор датчика.

Если у тебя есть существующие dashboard'ы, созданные до введения этого
поля — они автоматически мигрируют на первом open: widget'ы получают
`serverId` = первый connected сервер, dashboard config пересохраняется
в localStorage. Если миграция выбрала не тот сервер — открой config
dialog widget'а и поменяй вручную.
```

- [ ] **Step 5.4: Commit**

```bash
git add CLAUDE.md docs/naming-conventions.md docs/dashboards.md
git commit -m "docs: Sensor identity (multi-server) — sensorKey + serverId rules

CLAUDE.md и docs/naming-conventions.md получают новый раздел про
sensorKey: формат, правила, запреты. docs/dashboards.md — упоминание
Server dropdown в config диалоге active widget'ов + auto-migration
legacy.

Spec: docs/superpowers/specs/2026-04-28-dashboard-multi-server-isolation-design.md
Task 5.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
"
```

---

### Task 6: New Playwright E2E — multi-server isolation

**Files:**
- Create: `tests/single/dashboard-multi-server-isolation.spec.ts`

- [ ] **Step 6.1: Write the spec**

Create `tests/single/dashboard-multi-server-isolation.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

// 4 сценария multi-server isolation для dashboard.
// Используем page.route mocks — два «сервера» mock1/mock2 с одинаковым
// sensor name `Temp` но разными values.

test.describe('Dashboard multi-server isolation', () => {
    test.beforeEach(async ({ page }) => {
        // Mock /api/control/status → controller (для writeValue)
        await page.route('**/api/control/status', route =>
            route.fulfill({ json: { enabled: true, isController: true, hasController: true, timeoutSec: 60 } })
        );
        // Mock /api/servers — два сервера. Path может варьироваться, mock покрывает оба варианта.
        await page.route('**/api/servers**', route =>
            route.fulfill({ json: { servers: [
                { id: 'mock1', name: 'Mock-1', url: 'http://mock1', connected: true },
                { id: 'mock2', name: 'Mock-2', url: 'http://mock2', connected: true }
            ] } })
        );
        // Mock /ionc/set
        await page.route('**/ionc/set**', route => route.fulfill({ json: { status: 'ok' } }));

        await page.goto('/');
        await page.waitForFunction(() => (window as any).dashboardManager !== null && (window as any).makeSensorKey, { timeout: 10000 });

        // Принудительно ставим state.servers (mock /api/servers может опоздать).
        await page.evaluate(() => {
            const w = window as any;
            w.state.servers.clear();
            w.state.servers.set('mock1', { id: 'mock1', name: 'Mock-1', url: 'http://mock1', connected: true });
            w.state.servers.set('mock2', { id: 'mock2', name: 'Mock-2', url: 'http://mock2', connected: true });
        });
    });

    test('cache isolation: same sensor name на двух серверах не смешивается', async ({ page }) => {
        await page.evaluate(() => {
            const w = window as any;
            w.state.sensorValuesCache.clear();
            const k1 = w.makeSensorKey('mock1', 'SharedMemory', 'Temp');
            const k2 = w.makeSensorKey('mock2', 'SharedMemory', 'Temp');
            w.state.sensorValuesCache.set(k1, { value: 100, timestamp: Date.now() });
            w.state.sensorValuesCache.set(k2, { value: 200, timestamp: Date.now() });
        });
        const result = await page.evaluate(() => {
            const w = window as any;
            return {
                v1: w.state.sensorValuesCache.get(w.makeSensorKey('mock1', 'SharedMemory', 'Temp')).value,
                v2: w.state.sensorValuesCache.get(w.makeSensorKey('mock2', 'SharedMemory', 'Temp')).value
            };
        });
        expect(result.v1).toBe(100);
        expect(result.v2).toBe(200);
    });

    test('subscription routing: SSE на mock1 обновляет только widget с serverId=mock1', async ({ page }) => {
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardManager.clearWidgets();
            w.dashboardManager.createWidget({
                id: 'w-mock1', type: 'toggle',
                config: { serverId: 'mock1', objectName: 'SharedMemory', sensor: 'Temp', sensorId: 1, valueOff: 0, valueOn: 1 },
                x: 0, y: 0, width: 3, height: 2
            });
            w.dashboardManager.createWidget({
                id: 'w-mock2', type: 'toggle',
                config: { serverId: 'mock2', objectName: 'SharedMemory', sensor: 'Temp', sensorId: 1, valueOff: 0, valueOn: 1 },
                x: 3, y: 0, width: 3, height: 2
            });
            w.dashboardManager.updateSensorSubscriptions();
            // Симулируем SSE event с serverId=mock1
            w.updateDashboardWidgets(
                [{ name: 'Temp', value: 100 }],
                { serverId: 'mock1', objectName: 'SharedMemory', timestamp: Date.now() }
            );
        });
        const result = await page.evaluate(() => {
            const w = window as any;
            return {
                w1: w.dashboardState.widgets.get('w-mock1').feedbackValue,
                w2: w.dashboardState.widgets.get('w-mock2').feedbackValue
            };
        });
        expect(result.w1).toBe(100);
        expect(result.w2).toBeNull();
    });

    test('write routing: click по widget с serverId=mock2 → POST на ?server=mock2', async ({ page }) => {
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardManager.clearWidgets();
            w.dashboardManager.createWidget({
                id: 'w-mock2', type: 'toggle',
                config: { serverId: 'mock2', objectName: 'SharedMemory', sensor: 'Temp', sensorId: 1, valueOff: 0, valueOn: 1 },
                x: 0, y: 0, width: 3, height: 2
            });
        });

        const postPromise = page.waitForRequest(req => req.url().includes('/ionc/set') && req.method() === 'POST');
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('w-mock2').writeValue(1);
        });
        const req = await postPromise;
        expect(req.url()).toContain('server=mock2');
        expect(req.url()).not.toContain('server=mock1');
    });

    test('auto-migration: legacy config без serverId → migrated to first connected', async ({ page }) => {
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.dashboards.set('legacy-test', {
                widgets: [{
                    id: 'legacy-w1',
                    type: 'toggle',
                    config: { sensor: 'Temp', objectName: 'SharedMemory', sensorId: 1 },
                    x: 0, y: 0, width: 3, height: 2
                }]
            });
        });
        await page.evaluate(() => (window as any).dashboardManager.loadDashboard('legacy-test'));
        const cfgServerId = await page.evaluate(() => {
            const w = window as any;
            return w.dashboardState.widgets.get('legacy-w1').config.serverId;
        });
        expect(cfgServerId).toBe('mock1');
    });
});
```

- [ ] **Step 6.2: Run new spec**

```bash
docker compose build viewer && docker compose up -d viewer && sleep 8
docker compose run --rm e2e single/dashboard-multi-server-isolation.spec.ts
```
Expected: 4 PASS.

- [ ] **Step 6.3: Commit**

```bash
git add tests/single/dashboard-multi-server-isolation.spec.ts
git commit -m "test(dashboard): E2E multi-server isolation — 4 сценария

- cache isolation: same sensor name на двух серверах не смешивается
- subscription routing: SSE на mock1 обновляет только widget с serverId=mock1
- write routing: click по widget с serverId=mock2 → POST на ?server=mock2
- auto-migration: legacy config без serverId → migrated to first connected

Spec: docs/superpowers/specs/2026-04-28-dashboard-multi-server-isolation-design.md
Task 6.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
"
```

---

### Task 7: Update existing E2E

**Files:**
- Modify: `tests/single/dashboard-active-toggle.spec.ts`, `tests/single/dashboard-active-base.spec.ts`

- [ ] **Step 7.1: Update `createToggleDashboard` helper в dashboard-active-toggle.spec.ts**

Modify `tests/single/dashboard-active-toggle.spec.ts`. Найти helper `createToggleDashboard` (или аналогичный, который создаёт widget'ы напрямую через `dashboardManager.createWidget` или injection в `dashboardState`). Добавить `serverId` в config.

Find pattern (точная строка зависит от helper'а):
```ts
config: { sensor, sensorId, objectName, valueOff: 0, valueOn: 1 }
```

или похожее. Заменить на (явно прокинуть серверы):
```ts
config: {
    serverId: opts.serverId || (await page.evaluate(() => {
        const w = window as any;
        for (const [id, srv] of w.state.servers) if (srv.connected) return id;
        return null;
    })),
    sensor, sensorId, objectName, valueOff: 0, valueOn: 1
}
```

(Альтернатива — pre-set `state.servers` в beforeEach с known mock id, и hard-code `serverId: 'mock1'` в helper. Это короче и стабильнее. Engineer выбирает по контексту существующего кода.)

- [ ] **Step 7.2: Update `read-pathway` test для serverId param в URL**

Modify тот же файл. Найти test 'read-pathway: writes use widget objectName, not hardcoded' (около line 244). Расширить assertion:

Find:
```ts
        const req = await postPromise;
        expect(req.url()).toContain('/api/objects/SharedMemory2/ionc/set');
        const body = JSON.parse(req.postData() || '{}');
        expect(body.sensor_id).toBe(200);
```

Replace with:
```ts
        const req = await postPromise;
        expect(req.url()).toContain('/api/objects/SharedMemory2/ionc/set');
        // Проверяем что POST идёт именно на configured serverId, не fallback.
        const url = new URL(req.url());
        const serverParam = url.searchParams.get('server');
        expect(serverParam).toBeTruthy();
        const body = JSON.parse(req.postData() || '{}');
        expect(body.sensor_id).toBe(200);
```

(Точное значение `serverParam` зависит от того, какой serverId в test setup. Если helper использует первый connected — assertion `toBeTruthy()` достаточно. Если задан явно — `expect(serverParam).toBe('expected-id')`.)

- [ ] **Step 7.3: Add smoke test for serverId persist в dashboard-active-base.spec.ts**

Modify `tests/single/dashboard-active-base.spec.ts`. Add new test внутри describe block:

```ts
test('serverId persists в widget config', async ({ page }) => {
    await page.evaluate(() => {
        const w = window as any;
        w.state.servers.clear();
        w.state.servers.set('srv-test', { id: 'srv-test', name: 'Test', url: 'http://test', connected: true });
        w.dashboardManager.clearWidgets();
        w.dashboardManager.createWidget({
            id: 'sw1', type: 'toggle',
            config: {
                serverId: 'srv-test', objectName: 'SharedMemory',
                sensor: 'X', sensorId: 1, valueOff: 0, valueOn: 1
            },
            x: 0, y: 0, width: 3, height: 2
        });
    });
    const sid = await page.evaluate(() => (window as any).dashboardState.widgets.get('sw1').config.serverId);
    expect(sid).toBe('srv-test');
});
```

- [ ] **Step 7.4: Run updated specs**

```bash
docker compose run --rm e2e single/dashboard-active-toggle.spec.ts single/dashboard-active-base.spec.ts
```
Expected: PASS.

- [ ] **Step 7.5: Commit**

```bash
git add tests/single/dashboard-active-toggle.spec.ts tests/single/dashboard-active-base.spec.ts
git commit -m "test(dashboard): обновление active-toggle + active-base specs под serverId persist

createToggleDashboard helper теперь явно прокидывает serverId.
read-pathway test проверяет наличие server param в POST URL.
Новый smoke test для serverId persist в widget config (active-base).

Spec: docs/superpowers/specs/2026-04-28-dashboard-multi-server-isolation-design.md
Task 7.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
"
```

---

### Task 8: Final verification

**Files:** none (verification only)

- [ ] **Step 8.1: Full test suite**

```bash
docker compose down
make js-tests-all
```
Expected: 0 регрессий помимо известного flaky `control.spec.ts:144`. Если что-то новое падает — расследовать; стабильно flaky control.spec test задокументирован, не блокирует.

- [ ] **Step 8.2: Manual verification checklist**

Рабочий flow в браузере (`docker compose up -d viewer && open http://localhost:8000`):

1. Создать widget A (Server=mock1) и widget B (Server=mock2) на одном dashboard через UI config dialog. Проверить что в обоих dropdown'ах виден список IONC objects соответствующего сервера.
2. Запустить mock data на обоих серверах (например, через `tests/mock-server` и `tests/mock-server-2`) с одинаковым sensor `Temp` но разными values. Проверить что A показывает значение mock1, B — mock2.
3. Изменить value на mock1 → SSE → только A обновился, B не реагирует.
4. Click A (write valueOn) → POST идёт на mock1 (проверить в Network tab DevTools).
5. Reload page → конфиги widget'ов восстановлены (serverId сохранился в localStorage).
6. Создать legacy dashboard config (без serverId) через console (см. Step 4.2 для команды). Reload → миграция выполнилась, configs persisted с serverId.

- [ ] **Step 8.3: Final commit (если нужны post-verification fixes)**

Если все шаги прошли — Task 8 без commit. Если что-то требует правок:
```bash
git add ...
git commit -m "fix(dashboard): post-verification adjustments после multi-server isolation

Fix: <конкретное исправление>.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
"
```

---

## Self-review checklist (after plan completion)

**Spec coverage** — все 15 пунктов Definition of Done из spec покрыты:
1. ✓ `09-sensor-key.js` — Task 1
2. ✓ 4 dashboard Map'а используют sensorKey — Task 2
3. ✓ SSE handler передаёт ctx — Task 2
4. ✓ Server dropdown — Task 3
5. ✓ parseConfigForm.serverId — Task 3
6. ✓ _doWrite использует config.serverId — Task 3
7. ✓ loadDashboard auto-migration — Task 4
8. ✓ CLAUDE.md "Sensor identity" — Task 5
9. ✓ docs/naming-conventions.md — Task 5
10. ✓ docs/dashboards.md — Task 5
11. ✓ vitest setup + js-tests-unit — Task 1
12. ✓ vitest sensor-key.test.ts — Task 1
13. ✓ Playwright multi-server-isolation — Task 6
14. ✓ Updated active-toggle + active-base specs — Task 7
15. ✓ make js-tests + manual checklist — Task 8

**Type/name consistency:**
- `sensorKey` (camelCase) везде ✓
- `makeSensorKey` / `parseSensorKey` ✓
- `_resolveFirstConnectedServerId` / `_migrateLegacyServerIds` ✓
- `serverId` (не serverID) ✓
- `cfg-serverId` data-test selector ✓
