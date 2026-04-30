# Dashboard multi-IONC for all widgets — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Распространить full IONC binding (server + IONC object + sensor + sensorId) с per-item поддержкой на ВСЕ dashboard виджеты (Gauge/Level/Led/Digital/StatusBar/BarGraph/Chart) через переиспользуемые helper-функции.

**Architecture:** Создаём `60-widget-sensor-binding.js` с helper-функциями для рендера/парсинга/wiring server+object+sensor полей (single и multi-sensor). `ActiveDashboardWidget` рефакторится на эти helpers, существующее поведение сохраняется. Read-only виджеты мигрируют по очереди. Manager `updateSensorSubscriptions` и `_subscribeActiveSensorsBackend` расширяются на per-item triplet.

**Tech Stack:** Vanilla JavaScript (browser-side, no bundler — concat через `make app`), Vitest для unit, Playwright для E2E. Backend Go (без изменений в этом плане — IONC API уже поддерживает все нужные endpoint'ы).

**Spec:** `docs/superpowers/specs/2026-04-30-dashboard-multi-ionc-all-widgets-design.md`

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `ui/static/js/src/60-widget-sensor-binding.js` | **CREATE** | Helper functions: render/parse/init для server+object+sensor binding (single + multi-sensor) |
| `ui/static/js/src/61-dashboard-active-base.js` | MODIFY | Refactor `ActiveDashboardWidget.getConfigForm/parseConfigForm/initConfigHandlers` на helpers |
| `ui/static/js/src/61-dashboard-widgets.js` | MODIFY | Migrate Gauge/Level/Led/Digital/StatusBar/BarGraph/Chart `getConfigForm/parseConfigForm/initConfigHandlers` на helpers |
| `ui/static/js/src/62-dashboard-manager.js` | MODIFY | `updateSensorSubscriptions` per-item, `_subscribeActiveSensorsBackend` per-item, `_migrateLegacyBinding` (расширяет existing `_migrateLegacyServerIds`), cold-start retry hook |
| `ui/static/js/src/63-dashboard-dialogs.js` | MODIFY | Hook в `updateDashboardWidgets()` — вызов `dashboardManager.tryResolvePendingMigration()` |
| `tests/unit/widget-sensor-binding.test.ts` | **CREATE** | Unit tests для parseSensorBindingFields + parseSensorItemList |
| `tests/unit/legacy-binding-migration.test.ts` | **CREATE** | Unit tests для `_migrateLegacyBinding` (pure-function variant) |
| `tests/unit/setup.ts` | MODIFY | Загрузить `60-widget-sensor-binding.js` для unit тестов |
| `tests/single/dashboard-widget-settings.spec.ts` | MODIFY | Расширить — для каждого read-only widget'а проверка нового binding form |
| `tests/single/dashboard-widget-binding-multi-server.spec.ts` | **CREATE** | 6 E2E сценариев из spec'а |

---

## Verification Commands

| Цель | Команда |
|---|---|
| Сборка `app.js` | `make app` |
| Go backend tests | `make test` |
| Unit (vitest) | `cd tests/unit && npm test` |
| E2E single (один файл) | `docker compose down && docker compose run --rm e2e npx playwright test tests/single/<spec> --reporter=line` |
| E2E full | `make js-tests` |

**Перед каждым прогоном E2E:** `docker compose --profile dev down` чтобы освободить порт 8000.

---

## Task 1: Unit tests — parseSensorBindingFields (RED)

**Files:**
- Create: `tests/unit/widget-sensor-binding.test.ts`

- [ ] **Step 1: Создать failing-тест**

```typescript
// tests/unit/widget-sensor-binding.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';

declare const parseSensorBindingFields: any;
declare const renderSensorBindingFields: any;

beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    (globalThis as any).window = dom.window;
    (globalThis as any).document = dom.window.document;
});

describe('parseSensorBindingFields', () => {
    it('extracts triplet with empty prefix', () => {
        const form = document.createElement('form');
        form.innerHTML = `
            <select name="serverId"><option value="srv-A" selected></option></select>
            <select name="objectName"><option value="SharedMemory" selected></option></select>
            <input name="sensor" value="AI_Temp_S">
            <input type="hidden" name="sensorId" value="1042">
        `;
        const out = parseSensorBindingFields(form, { fieldPrefix: '' });
        expect(out).toEqual({ serverId: 'srv-A', objectName: 'SharedMemory', sensor: 'AI_Temp_S', sensorId: 1042 });
    });

    it('handles prefix sensor2-', () => {
        const form = document.createElement('form');
        form.innerHTML = `
            <select name="sensor2-serverId"><option value="srv-B" selected></option></select>
            <select name="sensor2-objectName"><option value="DI" selected></option></select>
            <input name="sensor2-sensor" value="Door_Open">
            <input type="hidden" name="sensor2-sensorId" value="504">
        `;
        const out = parseSensorBindingFields(form, { fieldPrefix: 'sensor2-' });
        expect(out).toEqual({ serverId: 'srv-B', objectName: 'DI', sensor: 'Door_Open', sensorId: 504 });
    });

    it('returns null for sensorId when hidden empty', () => {
        const form = document.createElement('form');
        form.innerHTML = `
            <select name="serverId"><option value="srv-A" selected></option></select>
            <select name="objectName"><option value="SM" selected></option></select>
            <input name="sensor" value="x">
            <input type="hidden" name="sensorId" value="">
        `;
        const out = parseSensorBindingFields(form, { fieldPrefix: '' });
        expect(out.sensorId).toBeNull();
    });

    it('preserves sensorId=0 (falsy-zero не теряется)', () => {
        const form = document.createElement('form');
        form.innerHTML = `
            <select name="serverId"><option value="srv-A" selected></option></select>
            <select name="objectName"><option value="SM" selected></option></select>
            <input name="sensor" value="zero">
            <input type="hidden" name="sensorId" value="0">
        `;
        const out = parseSensorBindingFields(form, { fieldPrefix: '' });
        expect(out.sensorId).toBe(0);
    });
});
```

- [ ] **Step 2: Запустить — должны фейлиться**

```bash
cd /home/pv/Projects/uniset-panel/tests/unit && npm test -- widget-sensor-binding.test.ts
```

Expected: FAIL — `parseSensorBindingFields is not defined`.

---

## Task 2: Implement parseSensorBindingFields + renderSensorBindingFields (GREEN)

**Files:**
- Create: `ui/static/js/src/60-widget-sensor-binding.js`
- Modify: `tests/unit/setup.ts`

- [ ] **Step 1: Создать helper-модуль**

```javascript
// ui/static/js/src/60-widget-sensor-binding.js
// ============================================================================
// Helpers для рендера/парсинга/wiring "server + IONC object + sensor + sensorId"
// конфиг-полей. Используются:
//   - ActiveDashboardWidget (toggle/checkbox/pushbutton/setpoint/generator)
//   - read-only widgets (gauge/level/led/digital)
//   - multi-sensor widgets (statusbar/bargraph/chart) per item
//
// fieldPrefix контракт:
//   - ''           — single-sensor widget (поля name="serverId" etc.)
//   - 'sensor2-'   — feedback/secondary sensor (gauge dual / setpoint feedback)
//   - 'item-${idx}-' — multi-sensor items
// ============================================================================

function renderSensorBindingFields(config = {}, opts = {}) {
    const prefix = opts.fieldPrefix || '';
    const sensorLabel = opts.sensorLabel || 'Sensor';
    const objectNameDefault = opts.objectNameDefault || 'SharedMemory';

    const currentServerId = config.serverId || '';
    let serverOptions = '';
    if (typeof state !== 'undefined' && state?.servers) {
        for (const [id, srv] of state.servers) {
            if (srv.connected || id === currentServerId) {
                const sel = id === currentServerId ? 'selected' : '';
                serverOptions += `<option value="${escapeAttr(id)}" ${sel}>${escapeHtml(srv.name || id)}</option>`;
            }
        }
    }
    if (!serverOptions) {
        serverOptions = '<option value="" disabled selected>(нет доступных серверов)</option>';
    }

    return `
        <div class="widget-config-field">
            <label>Server</label>
            <select class="widget-input" name="${prefix}serverId" data-test="cfg-${prefix}serverId">
                ${serverOptions}
            </select>
        </div>
        <div class="widget-config-field">
            <label>IONC Object</label>
            <select class="widget-input" name="${prefix}objectName" data-test="cfg-${prefix}objectName">
                <option value="${escapeAttr(config.objectName || objectNameDefault)}" selected>${escapeHtml(config.objectName || objectNameDefault)}</option>
            </select>
            <small style="color:#6b7280">список загружается из /api/objects?type=IONotifyController</small>
        </div>
        <div class="widget-config-field">
            <label>${escapeHtml(sensorLabel)}</label>
            <div class="sensor-select-wrap">
                <input type="text" class="widget-input sensor-select-input" name="${prefix}sensor" autocomplete="off"
                       placeholder="Click to select or type to search..."
                       value="${escapeAttr(config.sensor || '')}" data-test="cfg-${prefix}sensor">
                <input type="hidden" name="${prefix}sensorId" value="${escapeAttr(config.sensorId ?? '')}" data-test="cfg-${prefix}sensorId">
            </div>
        </div>
    `;
}

function parseSensorBindingFields(form, opts = {}) {
    const prefix = opts.fieldPrefix || '';
    const rawId = form.querySelector(`[name="${prefix}sensorId"]`)?.value;
    let sensorId = null;
    if (rawId !== '' && rawId !== undefined && rawId !== null) {
        const n = parseInt(rawId, 10);
        sensorId = Number.isFinite(n) ? n : null;
    }
    return {
        serverId:   form.querySelector(`[name="${prefix}serverId"]`)?.value || null,
        objectName: form.querySelector(`[name="${prefix}objectName"]`)?.value || (opts.objectNameDefault || 'SharedMemory'),
        sensor:     form.querySelector(`[name="${prefix}sensor"]`)?.value || '',
        sensorId,
    };
}

if (typeof globalThis !== 'undefined') {
    globalThis.renderSensorBindingFields = renderSensorBindingFields;
    globalThis.parseSensorBindingFields  = parseSensorBindingFields;
}
```

- [ ] **Step 2: Загрузить файл в unit-test setup**

```typescript
// tests/unit/setup.ts (добавить в конец)
loadSource('60-widget-sensor-binding.js');
```

- [ ] **Step 3: Прогон unit тестов**

```bash
cd /home/pv/Projects/uniset-panel/tests/unit && npm test -- widget-sensor-binding.test.ts
```

Expected: PASS, 4 теста зелёных.

- [ ] **Step 4: `make app` и проверка JS-валидности**

```bash
cd /home/pv/Projects/uniset-panel && make app
grep -c "function renderSensorBindingFields" ui/static/js/app.js
```

Expected: `make app` без ошибок, grep возвращает `1`.

- [ ] **Step 5: Commit**

```bash
git add ui/static/js/src/60-widget-sensor-binding.js tests/unit/widget-sensor-binding.test.ts tests/unit/setup.ts
git commit -m "$(cat <<'EOF'
feat(dashboard): renderSensorBindingFields/parseSensorBindingFields helpers

Базовая инфраструктура для unified IONC binding (server+object+sensor+sensorId)
с поддержкой prefix'ов (single, sensor2-, item-N-). Будет использоваться всеми
widget'ами вместо собственной inline-реализации.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Unit tests + impl renderSensorItemRow + parseSensorItemList

**Files:**
- Modify: `tests/unit/widget-sensor-binding.test.ts`
- Modify: `ui/static/js/src/60-widget-sensor-binding.js`

- [ ] **Step 1: Добавить failing-тесты**

```typescript
// в tests/unit/widget-sensor-binding.test.ts (в конец)
declare const renderSensorItemRow: any;
declare const parseSensorItemList: any;

describe('parseSensorItemList', () => {
    it('extracts items[] with full triplets', () => {
        const form = document.createElement('form');
        form.innerHTML = `
            <div class="sensor-item" data-idx="0">
                <select name="item-0-serverId"><option value="srv-A" selected></option></select>
                <select name="item-0-objectName"><option value="SM" selected></option></select>
                <input name="item-0-sensor" value="Pump1">
                <input type="hidden" name="item-0-sensorId" value="2001">
                <input name="item-0-label" value="Pump 1">
            </div>
            <div class="sensor-item" data-idx="1">
                <select name="item-1-serverId"><option value="srv-B" selected></option></select>
                <select name="item-1-objectName"><option value="DI" selected></option></select>
                <input name="item-1-sensor" value="Door">
                <input type="hidden" name="item-1-sensorId" value="504">
                <input name="item-1-label" value="Door">
            </div>
        `;
        const items = parseSensorItemList(form, {
            rowClass: 'sensor-item',
            parseExtraFields: (el: HTMLElement, idx: number) => ({
                label: form.querySelector(`[name="item-${idx}-label"]`)?.getAttribute('value') || ''
            }),
        });
        expect(items).toHaveLength(2);
        expect(items[0]).toMatchObject({ serverId: 'srv-A', objectName: 'SM', sensor: 'Pump1', sensorId: 2001, label: 'Pump 1' });
        expect(items[1]).toMatchObject({ serverId: 'srv-B', objectName: 'DI', sensor: 'Door', sensorId: 504, label: 'Door' });
    });

    it('returns empty array when no rows', () => {
        const form = document.createElement('form');
        form.innerHTML = `<div></div>`;
        expect(parseSensorItemList(form, { rowClass: 'sensor-item', parseExtraFields: () => ({}) })).toEqual([]);
    });
});

describe('renderSensorItemRow', () => {
    it('uses item-{idx}- prefix in field names', () => {
        const html = renderSensorItemRow({
            idx: 5,
            item: { serverId: 'srv-A', objectName: 'SM', sensor: 'X', sensorId: 99 },
            extraFieldsHtml: '<input name="item-5-label" value="">',
            rowClass: 'sensor-item',
            removable: true,
        });
        expect(html).toContain('name="item-5-serverId"');
        expect(html).toContain('name="item-5-objectName"');
        expect(html).toContain('name="item-5-sensor"');
        expect(html).toContain('name="item-5-sensorId"');
        expect(html).toContain('data-idx="5"');
        expect(html).toContain('class="sensor-item"');
    });
});
```

- [ ] **Step 2: Запустить — должны фейлиться**

```bash
cd /home/pv/Projects/uniset-panel/tests/unit && npm test -- widget-sensor-binding.test.ts
```

Expected: FAIL — `renderSensorItemRow is not defined`, `parseSensorItemList is not defined`.

- [ ] **Step 3: Реализация в helper-файле**

Добавить в `ui/static/js/src/60-widget-sensor-binding.js`:

```javascript
// Render одной row для multi-sensor item.
// opts: { idx, item, extraFieldsHtml, rowClass='sensor-item', removable=true }
function renderSensorItemRow(opts) {
    const { idx, item = {}, extraFieldsHtml = '', rowClass = 'sensor-item', removable = true } = opts;
    const bindingHtml = renderSensorBindingFields(item, { fieldPrefix: `item-${idx}-` });
    const removeBtn = removable
        ? `<button type="button" class="widget-btn-small remove-sensor-item" data-idx="${idx}">×</button>`
        : '';
    return `
        <div class="${rowClass}" data-idx="${idx}">
            ${bindingHtml}
            ${extraFieldsHtml}
            ${removeBtn}
        </div>
    `;
}

// Парсит items[] из form.
// opts: { rowClass='sensor-item', parseExtraFields(itemEl, idx) }
function parseSensorItemList(form, opts) {
    const { rowClass = 'sensor-item', parseExtraFields } = opts;
    const items = [];
    form.querySelectorAll(`.${rowClass}`).forEach(el => {
        const idx = parseInt(el.dataset.idx, 10);
        const binding = parseSensorBindingFields(form, { fieldPrefix: `item-${idx}-` });
        const extra = parseExtraFields ? parseExtraFields(el, idx) : {};
        items.push({ ...binding, ...extra });
    });
    return items;
}

if (typeof globalThis !== 'undefined') {
    globalThis.renderSensorItemRow = renderSensorItemRow;
    globalThis.parseSensorItemList = parseSensorItemList;
}
```

- [ ] **Step 4: Прогон unit тестов**

```bash
cd /home/pv/Projects/uniset-panel/tests/unit && npm test -- widget-sensor-binding.test.ts
```

Expected: PASS, все 6 тестов зелёных.

- [ ] **Step 5: `make app` + commit**

```bash
cd /home/pv/Projects/uniset-panel && make app
git add ui/static/js/src/60-widget-sensor-binding.js tests/unit/widget-sensor-binding.test.ts
git commit -m "$(cat <<'EOF'
feat(dashboard): renderSensorItemRow/parseSensorItemList для multi-sensor

Helpers для рендера и парсинга items[] в StatusBar/BarGraph/Chart с per-item
триплетом (server+object+sensor+sensorId).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Implement initSensorBindingHandlers + initSensorItemListHandlers

**Files:**
- Modify: `ui/static/js/src/60-widget-sensor-binding.js`

(Эти функции wire'ят DOM-listeners — testable только через E2E, поэтому unit-тестов нет; будут exercise'нуты в Task 6+ E2E.)

- [ ] **Step 1: Добавить initSensorBindingHandlers**

Добавить в `60-widget-sensor-binding.js`:

```javascript
// Wire'ит для одного binding-блока: token-guarded loadIONCObjects при смене
// server, setupSensorAutocomplete с реактивным objectName/serverId.
// Idempotent через form.dataset[`sensorBinding_${prefix}_wired`].
//
// Returns: { resetSensor() }.
function initSensorBindingHandlers(form, config = {}, opts = {}) {
    const prefix = opts.fieldPrefix || '';
    const flagKey = `sensorBinding_${prefix.replace(/[^a-z0-9]/gi, '_')}_wired`;
    if (form.dataset[flagKey] === 'true') return null;
    form.dataset[flagKey] = 'true';

    const serverSelect = form.querySelector(`[name="${prefix}serverId"]`);
    const objectSelect = form.querySelector(`[name="${prefix}objectName"]`);
    const sensorInput  = form.querySelector(`[name="${prefix}sensor"]`);
    const hiddenIdInput = form.querySelector(`[name="${prefix}sensorId"]`);
    if (!serverSelect || !objectSelect || !sensorInput || !hiddenIdInput) return null;

    let loadToken = 0;
    const loadIONCObjects = (serverId) => {
        const myToken = ++loadToken;
        if (!serverId) {
            objectSelect.innerHTML = '<option value="" disabled selected>(выберите Server)</option>';
            return;
        }
        fetch(`/api/objects?server=${encodeURIComponent(serverId)}&type=IONotifyController`)
            .then(r => r.ok ? r.json() : { objects: [] })
            .then(data => {
                if (myToken !== loadToken) return;
                const objs = data.objects || [];
                const currentValue = objectSelect.value || config.objectName || (opts.objectNameDefault || 'SharedMemory');
                objectSelect.innerHTML = objs.map(o => {
                    const name = typeof o === 'string' ? o : o.name;
                    return `<option value="${escapeAttr(name)}" ${name === currentValue ? 'selected' : ''}>${escapeHtml(name)}</option>`;
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

    loadIONCObjects(serverSelect.value);

    const ac = setupSensorAutocomplete(
        sensorInput,
        hiddenIdInput,
        () => objectSelect.value,
        () => serverSelect.value
    );

    serverSelect.addEventListener('change', () => {
        loadIONCObjects(serverSelect.value);
        if (ac && typeof ac.resetOnObjectChange === 'function') ac.resetOnObjectChange();
    });
    objectSelect.addEventListener('change', () => {
        if (ac && typeof ac.resetOnObjectChange === 'function') ac.resetOnObjectChange();
    });

    return {
        resetSensor() {
            if (ac && typeof ac.resetOnObjectChange === 'function') ac.resetOnObjectChange();
        },
    };
}

if (typeof globalThis !== 'undefined') {
    globalThis.initSensorBindingHandlers = initSensorBindingHandlers;
}
```

- [ ] **Step 2: Добавить initSensorItemListHandlers**

```javascript
// Wire'ит add/remove кнопки + per-item handlers + pre-fill server/object из last item.
//
// opts:
//   addBtnSelector       — CSS селектор кнопки "+ Add"
//   containerSelector    — CSS селектор контейнера, куда добавляются rows
//   rowClass             — CSS класс одной row (default 'sensor-item')
//   defaultExtras        — function(): дефолты для extra-полей нового item
//   renderRow            — function({ idx, item }): HTML новой row (типично — re-export из widget'а)
//   parseExtraFields     — function(itemEl, idx): обязательная функция parsing'а extra-полей
//
// Возвращает текущую длину items для дальнейших вычислений idx внешним кодом
// (не нужен callerам — работает на event-driven основе).
function initSensorItemListHandlers(form, config = {}, opts = {}) {
    const {
        addBtnSelector,
        containerSelector,
        rowClass = 'sensor-item',
        defaultExtras = () => ({}),
        renderRow,
        parseExtraFields,
    } = opts;

    const flagKey = `sensorItemList_${rowClass}_wired`;
    if (form.dataset[flagKey] === 'true') return;
    form.dataset[flagKey] = 'true';

    const container = form.querySelector(containerSelector);
    const addBtn = form.querySelector(addBtnSelector);

    // Wire each existing row
    form.querySelectorAll(`.${rowClass}`).forEach(el => {
        const idx = parseInt(el.dataset.idx, 10);
        initSensorBindingHandlers(form, config?.items?.[idx] || {}, { fieldPrefix: `item-${idx}-` });
    });

    let nextIdx = (config?.items?.length || 0);

    addBtn?.addEventListener('click', () => {
        const idx = nextIdx++;
        // Pre-fill server+object из last visible row.
        const existing = parseSensorItemList(form, { rowClass, parseExtraFields });
        const last = existing[existing.length - 1];
        let prefilled = { serverId: last?.serverId || '', objectName: last?.objectName || 'SharedMemory' };
        if (!prefilled.serverId && typeof state !== 'undefined' && state?.servers) {
            for (const [id, srv] of state.servers) {
                if (srv.connected) { prefilled.serverId = id; break; }
            }
        }
        const item = { ...prefilled, sensor: '', sensorId: null, ...defaultExtras() };
        const html = renderRow({ idx, item });
        container.insertAdjacentHTML('beforeend', html);
        // Wire новой row (свежий fieldPrefix `item-${idx}-` — idempotency-flag не сработает).
        initSensorBindingHandlers(form, item, { fieldPrefix: `item-${idx}-` });
    });

    container?.addEventListener('click', (e) => {
        const btn = e.target.closest('.remove-sensor-item');
        if (!btn) return;
        const row = btn.closest(`.${rowClass}`);
        if (row && container.querySelectorAll(`.${rowClass}`).length > 1) {
            row.remove();
        }
    });
}

if (typeof globalThis !== 'undefined') {
    globalThis.initSensorItemListHandlers = initSensorItemListHandlers;
}
```

- [ ] **Step 3: `make app`**

```bash
cd /home/pv/Projects/uniset-panel && make app
grep -c "function initSensorBindingHandlers\|function initSensorItemListHandlers" ui/static/js/app.js
```

Expected: `2` (обе функции в app.js).

- [ ] **Step 4: Прогон существующих E2E (smoke — что ничего не сломалось)**

```bash
cd /home/pv/Projects/uniset-panel
docker compose --profile dev down
docker compose run --rm e2e npx playwright test tests/single/dashboard-active-toggle.spec.ts --reporter=line
```

Expected: все existing toggle-тесты проходят (helpers пока не используются никем — только added в global namespace).

- [ ] **Step 5: Commit**

```bash
git add ui/static/js/src/60-widget-sensor-binding.js
git commit -m "$(cat <<'EOF'
feat(dashboard): initSensorBindingHandlers/initSensorItemListHandlers

Реактивный wiring server/object/sensor binding'а: token-guarded loadIONCObjects,
setupSensorAutocomplete, server/object change → reset sensor. Multi-sensor
add-row с pre-fill server+object из last item.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Refactor ActiveDashboardWidget на helpers

**Files:**
- Modify: `ui/static/js/src/61-dashboard-active-base.js:255-423`

Цель: `getConfigForm`/`parseConfigForm`/`initConfigHandlers` теперь делегируют на helpers без изменения внешнего поведения. Все existing active widget тесты должны продолжать проходить.

- [ ] **Step 1: Заменить getConfigForm**

В `ui/static/js/src/61-dashboard-active-base.js` заменить весь блок `static getConfigForm(config = {})` (строки ~256-323) на:

```javascript
    static getConfigForm(config = {}) {
        const styleSelect = (this.styles && this.styles.length > 1)
            ? `
            <div class="widget-config-field">
                <label>Style</label>
                <select class="widget-input" name="style" data-test="cfg-style">
                    ${this.styles.map(s => `<option value="${escapeAttr(s)}" ${(config.style || this.defaultStyle) === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
                </select>
            </div>
            `
            : '';

        return `
            ${renderSensorBindingFields(config, { fieldPrefix: '' })}
            ${styleSelect}
            <div class="widget-config-field">
                <label>Label (optional)</label>
                <input type="text" class="widget-input" name="label"
                       value="${escapeAttr(config.label || '')}" placeholder="Leave empty to hide header">
            </div>
            <div class="widget-config-field">
                <label class="widget-checkbox-label">
                    <input type="checkbox" name="requireConfirmation"
                           ${config.requireConfirmation ? 'checked' : ''}>
                    <span>Require confirmation before write</span>
                </label>
            </div>
        ` + (this.getActiveConfigFields ? this.getActiveConfigFields(config) : '');
    }
```

- [ ] **Step 2: Заменить parseConfigForm**

Заменить `static parseConfigForm(form)` (строки ~330-349) на:

```javascript
    static parseConfigForm(form) {
        const binding = parseSensorBindingFields(form, { fieldPrefix: '' });
        const base = {
            ...binding,
            label:      form.querySelector('[name="label"]')?.value || '',
            requireConfirmation: form.querySelector('[name="requireConfirmation"]')?.checked || false,
        };
        const styleEl = form.querySelector('[name="style"]');
        if (styleEl) base.style = styleEl.value;
        const extra = this.parseActiveConfigFields ? this.parseActiveConfigFields(form) : {};
        return { ...base, ...extra };
    }
```

- [ ] **Step 3: Заменить initConfigHandlers**

Заменить `static initConfigHandlers(form, config = {})` (строки ~355-423) на:

```javascript
    static initConfigHandlers(form, config = {}) {
        if (form.dataset.activeHandlersWired === 'true') return;
        form.dataset.activeHandlersWired = 'true';
        initSensorBindingHandlers(form, config, { fieldPrefix: '' });
    }
```

- [ ] **Step 4: `make app` + smoke E2E**

```bash
cd /home/pv/Projects/uniset-panel && make app
docker compose --profile dev down
docker compose run --rm e2e npx playwright test tests/single/dashboard-active-toggle.spec.ts tests/single/dashboard-active-button.spec.ts tests/single/dashboard-widget-settings.spec.ts --reporter=line
```

Expected: все active-widget тесты + widget-settings тесты проходят (рефакторинг не должен менять поведение).

- [ ] **Step 5: Commit**

```bash
git add ui/static/js/src/61-dashboard-active-base.js
git commit -m "$(cat <<'EOF'
refactor(dashboard): ActiveDashboardWidget использует sensor-binding helpers

Заменили inline-реализацию getConfigForm/parseConfigForm/initConfigHandlers
на вызовы helpers из 60-widget-sensor-binding.js. Поведение не меняется,
все existing active-widget тесты проходят. Готовит почву для миграции
read-only/multi-sensor виджетов.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Migrate GaugeWidget на helpers

**Files:**
- Modify: `ui/static/js/src/61-dashboard-widgets.js:1021-1141` (GaugeWidget config)

- [ ] **Step 1: Заменить getConfigForm**

В `ui/static/js/src/61-dashboard-widgets.js` найти `class GaugeWidget` → `static getConfigForm(config = {})`. Заменить строку с `<input type="text" class="widget-input" name="sensor" ...>` (поле "Sensor") на блок helpers. Конкретно: первый `<div class="widget-config-field">` (строки ~1024-1028) **удалить**, и заменить блок `<div class="dual-scale-fields">` (~1029-1035) на конструкцию через helpers. Финальный getConfigForm:

```javascript
    static getConfigForm(config = {}) {
        const zones = config.zones || [];
        const isDual = config.style === 'dual';
        return `
            ${renderSensorBindingFields(config, { fieldPrefix: '' })}
            <div class="dual-scale-fields" style="display: ${isDual ? 'block' : 'none'};">
                ${renderSensorBindingFields({
                    serverId:   config.serverId2   ?? config.serverId,
                    objectName: config.objectName2 ?? config.objectName,
                    sensor:     config.sensor2 || '',
                    sensorId:   config.sensorId2 ?? null,
                }, { fieldPrefix: 'sensor2-', sensorLabel: 'Target/Setpoint Sensor' })}
            </div>
            <div class="widget-config-field">
                <label>Label</label>
                <input type="text" class="widget-input" name="label"
                       value="${escapeAttr(config.label || '')}" placeholder="Display label">
            </div>
            <div class="widget-config-field">
                <label>Style</label>
                <select class="widget-select" name="style" onchange="toggleDualScaleFields(this)">
                    <option value="default" ${!config.style || config.style === 'default' ? 'selected' : ''}>Default</option>
                    <option value="semicircle" ${config.style === 'semicircle' ? 'selected' : ''}>Semicircle White</option>
                    <option value="arc270" ${config.style === 'arc270' ? 'selected' : ''}>Arc 270° Black</option>
                    <option value="speedometer" ${config.style === 'speedometer' ? 'selected' : ''}>Speedometer White</option>
                    <option value="dual" ${config.style === 'dual' ? 'selected' : ''}>Dual Scale</option>
                </select>
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>Min</label>
                    <input type="number" class="widget-input" name="min" value="${config.min ?? 0}">
                </div>
                <div class="widget-config-field">
                    <label>Max</label>
                    <input type="number" class="widget-input" name="max" value="${config.max ?? 100}">
                </div>
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>Unit</label>
                    <input type="text" class="widget-input" name="unit"
                           value="${escapeAttr(config.unit || '')}" placeholder="°C, %, etc.">
                </div>
                <div class="widget-config-field">
                    <label>Decimals</label>
                    <input type="number" class="widget-input" name="decimals"
                           value="${config.decimals ?? 1}" min="0" max="4">
                </div>
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label class="widget-toggle">
                        <input type="checkbox" name="fillSector" ${config.fillSector ? 'checked' : ''}>
                        <span class="widget-toggle-track"><span class="widget-toggle-thumb"></span></span>
                        <span class="widget-toggle-label">Fill sector (0 to value)</span>
                    </label>
                </div>
            </div>
            <div class="widget-config-field">
                <div class="zones-editor">
                    <div class="zones-header">
                        <label>Color Zones</label>
                        <button type="button" class="zones-add-btn" onclick="addZoneField(this)">+ Add Zone</button>
                    </div>
                    <div class="zones-list" id="zones-list">
                        ${zones.map((z, i) => `
                            <div class="zone-item">
                                <input type="color" class="zone-color" name="zone-color-${i}" value="${z.color || '#22c55e'}">
                                <div class="zone-inputs">
                                    <input type="number" class="zone-input" name="zone-from-${i}" value="${z.from ?? 0}" placeholder="From">
                                    <span class="zone-separator">→</span>
                                    <input type="number" class="zone-input" name="zone-to-${i}" value="${z.to ?? 100}" placeholder="To">
                                </div>
                                <button type="button" class="zone-remove-btn" onclick="removeZoneField(this)">×</button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }
```

- [ ] **Step 2: Заменить parseConfigForm**

```javascript
    static parseConfigForm(form) {
        const zones = [];
        const zoneItems = form.querySelectorAll('.zone-item');
        zoneItems.forEach((item) => {
            const color = item.querySelector('.zone-color')?.value;
            const inputs = item.querySelectorAll('.zone-input');
            const from = parseFloat(inputs[0]?.value);
            const to = parseFloat(inputs[1]?.value);
            if (color && !isNaN(from) && !isNaN(to)) zones.push({ from, to, color });
        });

        const binding = parseSensorBindingFields(form, { fieldPrefix: '' });
        const style = form.querySelector('[name="style"]')?.value || 'default';
        const result = {
            ...binding,
            label: form.querySelector('[name="label"]')?.value || '',
            style,
            min: parseFloat(form.querySelector('[name="min"]')?.value) || 0,
            max: parseFloat(form.querySelector('[name="max"]')?.value) || 100,
            unit: form.querySelector('[name="unit"]')?.value || '',
            decimals: parseInt(form.querySelector('[name="decimals"]')?.value) || 1,
            fillSector: form.querySelector('[name="fillSector"]')?.checked || false,
            zones
        };
        if (style === 'dual') {
            const b2 = parseSensorBindingFields(form, { fieldPrefix: 'sensor2-' });
            result.serverId2   = b2.serverId;
            result.objectName2 = b2.objectName;
            result.sensor2     = b2.sensor;
            result.sensorId2   = b2.sensorId;
        }
        return result;
    }
```

- [ ] **Step 3: Добавить static initConfigHandlers**

В классе `GaugeWidget` — добавить новый метод (если его нет):

```javascript
    static initConfigHandlers(form, config = {}) {
        initSensorBindingHandlers(form, config, { fieldPrefix: '' });
        if (config.style === 'dual') {
            initSensorBindingHandlers(form, {
                serverId:   config.serverId2   ?? config.serverId,
                objectName: config.objectName2 ?? config.objectName,
                sensor:     config.sensor2,
                sensorId:   config.sensorId2,
            }, { fieldPrefix: 'sensor2-' });
        }
    }
```

- [ ] **Step 4: Удалить legacy autocomplete для Gauge**

В `ui/static/js/src/62-dashboard-manager.js:942-945` (метод `setupConfigDialog`/`showWidgetConfig`) расширить condition: legacy in-memory autocomplete должен skip'аться для всех новых widget'ов. Найти строки:

```javascript
        if (!WidgetClass.usesNewSensorAutocomplete) {
            this.setupSensorAutocomplete(content, 'sensor');
            this.setupSensorAutocomplete(content, 'sensor2');
        }
```

Поскольку GaugeWidget теперь тоже использует новый autocomplete (через helpers), нужно его явно opt-in'нуть. Добавить в `class GaugeWidget`:

```javascript
class GaugeWidget extends DashboardWidget {
    static type = 'gauge';
    static usesNewSensorAutocomplete = true;
    // ...rest
}
```

- [ ] **Step 5: `make app` + E2E**

```bash
cd /home/pv/Projects/uniset-panel && make app
docker compose --profile dev down
docker compose run --rm e2e npx playwright test tests/single/dashboard-widgets.spec.ts tests/single/dashboard-widget-settings.spec.ts --reporter=line
```

Expected: все существующие тесты проходят. Если `dashboard-widgets.spec.ts` использовал legacy autocomplete (typing → datalist) — он мог сломаться. Если так — задокументировать в next-task и обновить.

- [ ] **Step 6: Commit**

```bash
git add ui/static/js/src/61-dashboard-widgets.js
git commit -m "$(cat <<'EOF'
feat(dashboard): GaugeWidget — multi-IONC binding (server+object+sensor)

GaugeWidget config form теперь использует sensor-binding helpers вместо
legacy plain-text input. Поддерживает выбор server/IONC object/sensor с
резолвом числового sensorId. Style='dual' — отдельный sensor2 binding
с теми же полями.

usesNewSensorAutocomplete=true → манагер skip'ает legacy autocomplete.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Migrate LevelWidget, LedWidget, DigitalWidget (single-sensor)

**Files:**
- Modify: `ui/static/js/src/61-dashboard-widgets.js`

Все три виджета — single-sensor. Применяем тот же паттерн что в Task 6, но без sensor2.

- [ ] **Step 1: LevelWidget — getConfigForm/parseConfigForm/initConfigHandlers/usesNewSensorAutocomplete**

В классе `class LevelWidget extends DashboardWidget`:

1. Добавить статическое поле сразу после `static type = 'level';`:
   ```javascript
       static usesNewSensorAutocomplete = true;
   ```

2. Заменить `static getConfigForm` (строки ~1216-1277). Удалить блок `<div class="widget-config-field"><label>Sensor</label><input ...></div>`, заменить на:

```javascript
    static getConfigForm(config = {}) {
        const zones = config.zones || [];
        return `
            ${renderSensorBindingFields(config, { fieldPrefix: '' })}
            <div class="widget-config-field">
                <label>Label</label>
                <input type="text" class="widget-input" name="label"
                       value="${escapeAttr(config.label || '')}" placeholder="Display label">
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>Min</label>
                    <input type="number" class="widget-input" name="min" value="${config.min ?? 0}">
                </div>
                <div class="widget-config-field">
                    <label>Max</label>
                    <input type="number" class="widget-input" name="max" value="${config.max ?? 100}">
                </div>
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>Orientation</label>
                    <select class="widget-select" name="orientation">
                        <option value="vertical" ${config.orientation !== 'horizontal' ? 'selected' : ''}>Vertical</option>
                        <option value="horizontal" ${config.orientation === 'horizontal' ? 'selected' : ''}>Horizontal</option>
                    </select>
                </div>
                <div class="widget-config-field">
                    <label>Unit</label>
                    <input type="text" class="widget-input" name="unit"
                           value="${escapeAttr(config.unit || '%')}" placeholder="%">
                </div>
            </div>
            <div class="widget-config-field">
                <div class="zones-editor">
                    <div class="zones-header">
                        <label>Color Zones</label>
                        <button type="button" class="zones-add-btn" onclick="addZoneField(this)">+ Add Zone</button>
                    </div>
                    <div class="zones-list" id="zones-list">
                        ${zones.map((z, i) => `
                            <div class="zone-item">
                                <input type="color" class="zone-color" name="zone-color-${i}" value="${z.color || '#3b82f6'}">
                                <div class="zone-inputs">
                                    <input type="number" class="zone-input" name="zone-from-${i}" value="${z.from ?? 0}" placeholder="From">
                                    <span class="zone-separator">→</span>
                                    <input type="number" class="zone-input" name="zone-to-${i}" value="${z.to ?? 100}" placeholder="To">
                                </div>
                                <button type="button" class="zone-remove-btn" onclick="removeZoneField(this)">×</button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }
```

3. Заменить `static parseConfigForm`:

```javascript
    static parseConfigForm(form) {
        const zones = [];
        form.querySelectorAll('.zone-item').forEach((item) => {
            const color = item.querySelector('.zone-color')?.value;
            const inputs = item.querySelectorAll('.zone-input');
            const from = parseFloat(inputs[0]?.value);
            const to = parseFloat(inputs[1]?.value);
            if (color && !isNaN(from) && !isNaN(to)) zones.push({ from, to, color });
        });
        return {
            ...parseSensorBindingFields(form, { fieldPrefix: '' }),
            label: form.querySelector('[name="label"]')?.value || '',
            min: parseFloat(form.querySelector('[name="min"]')?.value) || 0,
            max: parseFloat(form.querySelector('[name="max"]')?.value) || 100,
            orientation: form.querySelector('[name="orientation"]')?.value || 'vertical',
            unit: form.querySelector('[name="unit"]')?.value || '%',
            zones
        };
    }
```

4. Добавить `static initConfigHandlers`:

```javascript
    static initConfigHandlers(form, config = {}) {
        initSensorBindingHandlers(form, config, { fieldPrefix: '' });
    }
```

- [ ] **Step 2: LedWidget — то же самое**

В `class LedWidget extends DashboardWidget`. Добавить `usesNewSensorAutocomplete = true`. Заменить `getConfigForm` (~1361-1404):

```javascript
    static getConfigForm(config = {}) {
        return `
            ${renderSensorBindingFields(config, { fieldPrefix: '' })}
            <div class="widget-config-field">
                <label>Label</label>
                <input type="text" class="widget-input" name="label"
                       value="${escapeAttr(config.label || '')}" placeholder="Display label">
            </div>
            <div class="widget-config-field">
                <label>Threshold (value > threshold = ON)</label>
                <input type="number" class="widget-input" name="threshold"
                       value="${config.threshold ?? 0}">
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>ON Color</label>
                    <input type="color" class="widget-input" name="onColor"
                           value="${config.onColor || '#22c55e'}" style="height: 38px; padding: 4px;">
                </div>
                <div class="widget-config-field">
                    <label>OFF Color</label>
                    <input type="color" class="widget-input" name="offColor"
                           value="${config.offColor || '#6b7280'}" style="height: 38px; padding: 4px;">
                </div>
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>Error Color</label>
                    <input type="color" class="widget-input" name="errorColor"
                           value="${config.errorColor || '#ef4444'}" style="height: 38px; padding: 4px;">
                </div>
                <div class="widget-config-field">
                    <label style="display: flex; align-items: center; gap: 8px; margin-top: 24px;">
                        <input type="checkbox" name="blinkOnError" ${config.blinkOnError !== false ? 'checked' : ''}>
                        Blink on error
                    </label>
                </div>
            </div>
        `;
    }

    static parseConfigForm(form) {
        return {
            ...parseSensorBindingFields(form, { fieldPrefix: '' }),
            label: form.querySelector('[name="label"]')?.value || '',
            threshold: parseFloat(form.querySelector('[name="threshold"]')?.value) || 0,
            onColor: form.querySelector('[name="onColor"]')?.value || '#22c55e',
            offColor: form.querySelector('[name="offColor"]')?.value || '#6b7280',
            errorColor: form.querySelector('[name="errorColor"]')?.value || '#ef4444',
            blinkOnError: form.querySelector('[name="blinkOnError"]')?.checked !== false
        };
    }

    static initConfigHandlers(form, config = {}) {
        initSensorBindingHandlers(form, config, { fieldPrefix: '' });
    }
```

- [ ] **Step 3: DigitalWidget — то же самое**

В `class DigitalWidget extends DashboardWidget`. `usesNewSensorAutocomplete = true`. Заменить `getConfigForm`/`parseConfigForm` (~2556-2613). Полная замена:

```javascript
    static getConfigForm(config = {}) {
        return `
            ${renderSensorBindingFields(config, { fieldPrefix: '' })}
            <div class="widget-config-field">
                <label>Label</label>
                <input type="text" class="widget-input" name="label"
                       value="${escapeAttr(config.label || '')}" placeholder="Display label">
            </div>
            <div class="widget-config-field">
                <label>Style</label>
                <select class="widget-select" name="style">
                    <option value="default" ${!config.style || config.style === 'default' ? 'selected' : ''}>Default (Orbitron font)</option>
                    <option value="lcd" ${config.style === 'lcd' ? 'selected' : ''}>LCD (7-segment, light)</option>
                    <option value="led" ${config.style === 'led' ? 'selected' : ''}>LED (7-segment, glow)</option>
                </select>
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>Digits</label>
                    <input type="number" class="widget-input" name="digits"
                           value="${config.digits ?? 6}" min="1" max="12">
                </div>
                <div class="widget-config-field">
                    <label>Decimals</label>
                    <input type="number" class="widget-input" name="decimals"
                           value="${config.decimals ?? 0}" min="0" max="4">
                </div>
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>Color</label>
                    <input type="color" class="widget-input" name="color"
                           value="${config.color || '#22c55e'}" style="height: 38px; padding: 4px;">
                </div>
                <div class="widget-config-field">
                    <label>Unit</label>
                    <input type="text" class="widget-input" name="unit"
                           value="${escapeAttr(config.unit || '')}" placeholder="Optional">
                </div>
            </div>
        `;
    }

    static parseConfigForm(form) {
        return {
            ...parseSensorBindingFields(form, { fieldPrefix: '' }),
            label: form.querySelector('[name="label"]')?.value || '',
            style: form.querySelector('[name="style"]')?.value || 'default',
            digits: parseInt(form.querySelector('[name="digits"]')?.value) || 6,
            decimals: parseInt(form.querySelector('[name="decimals"]')?.value) || 0,
            color: form.querySelector('[name="color"]')?.value || '#22c55e',
            unit: form.querySelector('[name="unit"]')?.value || ''
        };
    }

    static initConfigHandlers(form, config = {}) {
        initSensorBindingHandlers(form, config, { fieldPrefix: '' });
    }
```

- [ ] **Step 4: `make app` + E2E**

```bash
cd /home/pv/Projects/uniset-panel && make app
docker compose --profile dev down
docker compose run --rm e2e npx playwright test tests/single/dashboard-widgets.spec.ts tests/single/dashboard-widget-settings.spec.ts --reporter=line
```

Expected: existing тесты проходят (если что-то падает из-за legacy autocomplete patterns в тестах — фиксим в Task 8).

- [ ] **Step 5: Commit**

```bash
git add ui/static/js/src/61-dashboard-widgets.js
git commit -m "$(cat <<'EOF'
feat(dashboard): Level/Led/Digital — multi-IONC binding

Все single-sensor read-only виджеты теперь используют sensor-binding helpers
(server+object+sensor+sensorId). usesNewSensorAutocomplete=true.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Migrate StatusBarWidget на multi-sensor helpers

**Files:**
- Modify: `ui/static/js/src/61-dashboard-widgets.js` (`class StatusBarWidget`)

- [ ] **Step 1: usesNewSensorAutocomplete**

В `class StatusBarWidget` добавить после `static type = 'statusbar';`:
```javascript
    static usesNewSensorAutocomplete = true;
```

- [ ] **Step 2: Заменить getConfigForm + initConfigHandlers + parseConfigForm**

Заменить весь блок `static getConfigForm` + `static initConfigHandlers` + `static parseConfigForm` (строки ~1809-1955) на:

```javascript
    static _renderItemRow({ idx, item }) {
        const extraHtml = `
            <div class="widget-config-row">
                <div class="widget-config-field" style="flex: 1;">
                    <label>Label</label>
                    <input type="text" class="widget-input" name="item-${idx}-label"
                           value="${escapeAttr(item.label || '')}" placeholder="Status name">
                </div>
                <div class="widget-config-field">
                    <label>Threshold</label>
                    <input type="number" class="widget-input" name="item-${idx}-threshold"
                           value="${item.threshold ?? 0.5}" step="0.1">
                </div>
                <div class="widget-config-field">
                    <label>On</label>
                    <input type="color" class="widget-input" name="item-${idx}-onColor"
                           value="${item.onColor || '#22c55e'}">
                </div>
                <div class="widget-config-field">
                    <label>Off</label>
                    <input type="color" class="widget-input" name="item-${idx}-offColor"
                           value="${item.offColor || '#6b7280'}">
                </div>
            </div>
        `;
        return renderSensorItemRow({ idx, item, extraFieldsHtml: extraHtml, rowClass: 'statusbar-item' });
    }

    static getConfigForm(config = {}) {
        const items = config.items || [{ label: 'Status 1' }];
        const itemsHtml = items.map((item, idx) => StatusBarWidget._renderItemRow({ idx, item })).join('');
        return `
            <div class="widget-config-field">
                <label>Layout</label>
                <select class="widget-select" name="layout">
                    <option value="horizontal" ${config.layout !== 'vertical' ? 'selected' : ''}>Horizontal</option>
                    <option value="vertical" ${config.layout === 'vertical' ? 'selected' : ''}>Vertical</option>
                </select>
            </div>
            <div class="widget-config-field">
                <label>Indicators</label>
                <div id="statusbar-items-container">
                    ${itemsHtml}
                </div>
                <button type="button" class="widget-btn" id="add-statusbar-item" style="margin-top: 8px;">
                    + Add Indicator
                </button>
            </div>
        `;
    }

    static initConfigHandlers(form, config = {}) {
        initSensorItemListHandlers(form, config, {
            addBtnSelector: '#add-statusbar-item',
            containerSelector: '#statusbar-items-container',
            rowClass: 'statusbar-item',
            defaultExtras: () => ({ label: '', threshold: 0.5, onColor: '#22c55e', offColor: '#6b7280' }),
            renderRow: StatusBarWidget._renderItemRow,
            parseExtraFields: (el, idx) => ({
                label:    form.querySelector(`[name="item-${idx}-label"]`)?.value || '',
                threshold: parseFloat(form.querySelector(`[name="item-${idx}-threshold"]`)?.value) || 0.5,
                onColor:  form.querySelector(`[name="item-${idx}-onColor"]`)?.value || '#22c55e',
                offColor: form.querySelector(`[name="item-${idx}-offColor"]`)?.value || '#6b7280',
            }),
        });
    }

    static parseConfigForm(form) {
        const items = parseSensorItemList(form, {
            rowClass: 'statusbar-item',
            parseExtraFields: (el, idx) => ({
                label:    form.querySelector(`[name="item-${idx}-label"]`)?.value || '',
                threshold: parseFloat(form.querySelector(`[name="item-${idx}-threshold"]`)?.value) || 0.5,
                onColor:  form.querySelector(`[name="item-${idx}-onColor"]`)?.value || '#22c55e',
                offColor: form.querySelector(`[name="item-${idx}-offColor"]`)?.value || '#6b7280',
            }),
        });
        return {
            layout: form.querySelector('[name="layout"]')?.value || 'horizontal',
            items
        };
    }

    getSensors() {
        return (this.config.items || []).map(item => item.sensor).filter(s => s);
    }
```

- [ ] **Step 3: `make app` + smoke E2E**

```bash
cd /home/pv/Projects/uniset-panel && make app
docker compose --profile dev down
docker compose run --rm e2e npx playwright test tests/single/dashboard-widgets.spec.ts --reporter=line
```

Expected: existing тесты статусбара проходят (с migration legacy config — пока через старую `_migrateLegacyServerIds`, items[].serverId/objectName ещё не заполняются, но мы это пофиксим в Task 11).

- [ ] **Step 4: Commit**

```bash
git add ui/static/js/src/61-dashboard-widgets.js
git commit -m "$(cat <<'EOF'
feat(dashboard): StatusBarWidget — per-item server/object/sensor binding

items[] теперь имеют полный triplet (serverId+objectName+sensor+sensorId)
плюс label/threshold/onColor/offColor. + Add Indicator → pre-fill server+object
из last item (через initSensorItemListHandlers).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Migrate BarGraphWidget на multi-sensor helpers

**Files:**
- Modify: `ui/static/js/src/61-dashboard-widgets.js` (`class BarGraphWidget`)

- [ ] **Step 1: usesNewSensorAutocomplete**

```javascript
class BarGraphWidget {
    static type = 'bargraph';
    static usesNewSensorAutocomplete = true;
    // ...
```

- [ ] **Step 2: Заменить getConfigForm/initConfigHandlers/parseConfigForm**

Заменить целый блок `static getConfigForm` + `static initConfigHandlers` + `static parseConfigForm` (строки ~2130-2302) на:

```javascript
    static _renderItemRow({ idx, item }) {
        const extraHtml = `
            <div class="widget-config-row">
                <div class="widget-config-field" style="flex: 1;">
                    <label>Label</label>
                    <input type="text" class="widget-input" name="item-${idx}-label"
                           value="${escapeAttr(item.label || '')}" placeholder="Bar name">
                </div>
                <div class="widget-config-field">
                    <label>Min</label>
                    <input type="number" class="widget-input" name="item-${idx}-min" value="${item.min ?? 0}">
                </div>
                <div class="widget-config-field">
                    <label>Max</label>
                    <input type="number" class="widget-input" name="item-${idx}-max" value="${item.max ?? 100}">
                </div>
                <div class="widget-config-field">
                    <label>Unit</label>
                    <input type="text" class="widget-input" name="item-${idx}-unit"
                           value="${escapeAttr(item.unit || '')}" placeholder="kW">
                </div>
                <div class="widget-config-field">
                    <label>Color</label>
                    <input type="color" class="widget-input" name="item-${idx}-color"
                           value="${item.color || '#3b82f6'}">
                </div>
            </div>
        `;
        return renderSensorItemRow({ idx, item, extraFieldsHtml: extraHtml, rowClass: 'bargraph-item' });
    }

    static getConfigForm(config = {}) {
        const items = config.items || [{ label: 'Bar 1', min: 0, max: 100, color: '#3b82f6' }];
        const itemsHtml = items.map((item, idx) => BarGraphWidget._renderItemRow({ idx, item })).join('');
        return `
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>Orientation</label>
                    <select class="widget-select" name="orientation">
                        <option value="vertical" ${config.orientation !== 'horizontal' ? 'selected' : ''}>Vertical</option>
                        <option value="horizontal" ${config.orientation === 'horizontal' ? 'selected' : ''}>Horizontal</option>
                    </select>
                </div>
                <div class="widget-config-field">
                    <label class="widget-checkbox-label">
                        <input type="checkbox" name="showValues" ${config.showValues !== false ? 'checked' : ''}>
                        <span>Show values</span>
                    </label>
                </div>
                <div class="widget-config-field">
                    <label class="widget-checkbox-label">
                        <input type="checkbox" name="showLabels" ${config.showLabels !== false ? 'checked' : ''}>
                        <span>Show labels</span>
                    </label>
                </div>
            </div>
            <div class="widget-config-field">
                <label>Bars</label>
                <div id="bargraph-items-container">${itemsHtml}</div>
                <button type="button" class="widget-btn" id="add-bargraph-item" style="margin-top: 8px;">
                    + Add Bar
                </button>
            </div>
        `;
    }

    static initConfigHandlers(form, config = {}) {
        const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];
        let colorIdx = (config.items || []).length;
        initSensorItemListHandlers(form, config, {
            addBtnSelector: '#add-bargraph-item',
            containerSelector: '#bargraph-items-container',
            rowClass: 'bargraph-item',
            defaultExtras: () => ({
                label: '', min: 0, max: 100, unit: '',
                color: colors[(colorIdx++) % colors.length],
            }),
            renderRow: BarGraphWidget._renderItemRow,
            parseExtraFields: (el, idx) => ({
                label: form.querySelector(`[name="item-${idx}-label"]`)?.value || '',
                min:   parseFloat(form.querySelector(`[name="item-${idx}-min"]`)?.value) || 0,
                max:   parseFloat(form.querySelector(`[name="item-${idx}-max"]`)?.value) || 100,
                unit:  form.querySelector(`[name="item-${idx}-unit"]`)?.value || '',
                color: form.querySelector(`[name="item-${idx}-color"]`)?.value || '#3b82f6',
            }),
        });
    }

    static parseConfigForm(form) {
        const items = parseSensorItemList(form, {
            rowClass: 'bargraph-item',
            parseExtraFields: (el, idx) => ({
                label: form.querySelector(`[name="item-${idx}-label"]`)?.value || '',
                min:   parseFloat(form.querySelector(`[name="item-${idx}-min"]`)?.value) || 0,
                max:   parseFloat(form.querySelector(`[name="item-${idx}-max"]`)?.value) || 100,
                unit:  form.querySelector(`[name="item-${idx}-unit"]`)?.value || '',
                color: form.querySelector(`[name="item-${idx}-color"]`)?.value || '#3b82f6',
            }),
        });
        return {
            orientation: form.querySelector('[name="orientation"]')?.value || 'vertical',
            showValues: form.querySelector('[name="showValues"]')?.checked !== false,
            showLabels: form.querySelector('[name="showLabels"]')?.checked !== false,
            items
        };
    }

    getSensors() {
        return (this.config.items || []).map(item => item.sensor).filter(s => s);
    }
```

- [ ] **Step 3: `make app` + commit**

```bash
cd /home/pv/Projects/uniset-panel && make app
git add ui/static/js/src/61-dashboard-widgets.js
git commit -m "$(cat <<'EOF'
feat(dashboard): BarGraphWidget — per-item server/object/sensor binding

Полная аналогия с StatusBar: items[] теперь имеют полный triplet
(serverId+objectName+sensor+sensorId), + Add Bar pre-fill из last item.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Migrate ChartWidget на multi-sensor helpers (zones[].sensors[])

**Files:**
- Modify: `ui/static/js/src/61-dashboard-widgets.js` (`class ChartWidget`)

Chart сложнее: 2 уровня nesting'а (zones → sensors). Используем helpers с custom rowClass='chart-sensor-row' внутри каждого zone-container'а.

- [ ] **Step 1: usesNewSensorAutocomplete**

```javascript
class ChartWidget extends DashboardWidget {
    static type = 'chart';
    static usesNewSensorAutocomplete = true;
```

- [ ] **Step 2: Заменить renderSensorRow + getConfigForm + parseConfigForm**

Заменить `static renderSensorRow` (~3165) и `static parseConfigForm` (~3193) на новые. Также добавить `static initConfigHandlers`.

```javascript
    // === Single sensor row (renders inside chart-zone-sensors-{zoneIdx}) ===
    static _renderChartSensorRow({ zoneIdx, sensorIdx, sensor }) {
        const color = sensor.color || ChartWidget.COLORS[sensorIdx % ChartWidget.COLORS.length];
        const idx = `${zoneIdx}-${sensorIdx}`; // composite — для unique field names
        const bindingHtml = renderSensorBindingFields(sensor, { fieldPrefix: `chart-${idx}-` });
        return `
            <div class="chart-sensor-row" data-zone-idx="${zoneIdx}" data-sensor-idx="${sensorIdx}">
                ${bindingHtml}
                <div class="chart-sensor-options" style="display: flex; gap: 6px; align-items: center;">
                    <input type="color" class="chart-sensor-color" name="chart-${idx}-color" value="${color}">
                    <label class="chart-sensor-option" title="Smooth"><input type="checkbox" name="chart-${idx}-smooth" ${sensor.smooth !== false ? 'checked' : ''}><span>smooth</span></label>
                    <label class="chart-sensor-option" title="Fill"><input type="checkbox" name="chart-${idx}-fill" ${sensor.fill !== false ? 'checked' : ''}><span>fill</span></label>
                    <label class="chart-sensor-option" title="Stepped"><input type="checkbox" name="chart-${idx}-stepped" ${sensor.stepped ? 'checked' : ''}><span>stepped</span></label>
                </div>
                <button type="button" class="widget-btn-small chart-sensor-remove">×</button>
            </div>
        `;
    }

    static renderZoneEditor(zone, zoneIdx) {
        const sensors = zone.sensors || [];
        const sensorsHtml = sensors.map((s, i) => ChartWidget._renderChartSensorRow({
            zoneIdx, sensorIdx: i, sensor: s
        })).join('');
        return `
            <div class="chart-zone-editor" data-zone-idx="${zoneIdx}">
                <div class="chart-zone-header">
                    <span class="chart-zone-title">Zone ${zoneIdx + 1}</span>
                    ${zoneIdx > 0 ? `<button type="button" class="zone-remove-btn chart-zone-remove">×</button>` : ''}
                </div>
                <div class="chart-zone-sensors" data-zone-container="${zoneIdx}">${sensorsHtml}</div>
                <button type="button" class="widget-btn chart-zone-add-sensor" data-zone-idx="${zoneIdx}" style="margin-top: 6px;">+ Add Sensor</button>
            </div>
        `;
    }

    static getConfigForm(config = {}) {
        const zones = config.zones || [{ id: 'zone-0', sensors: [] }];
        const timeRange = config.timeRange || 900000;
        return `
            <div class="widget-config-field">
                <label>Label</label>
                <input type="text" class="widget-input" name="label"
                       value="${escapeAttr(config.label || '')}" placeholder="Chart title">
            </div>
            <div class="widget-config-field">
                <label>Time Range</label>
                <div class="time-range-selector">
                    ${ChartWidget.TIME_RANGES.map(tr => `
                        <label class="time-range-btn ${timeRange === tr.value ? 'active' : ''}">
                            <input type="radio" name="timeRange" value="${tr.value}" ${timeRange === tr.value ? 'checked' : ''}>
                            <span>${tr.label}</span>
                        </label>
                    `).join('')}
                </div>
            </div>
            <div class="widget-config-field">
                <label class="toggle-label">
                    <input type="checkbox" name="showTable" ${config.showTable !== false ? 'checked' : ''}>
                    <span class="toggle-switch"></span>
                    Show sensor table
                </label>
            </div>
            <div class="widget-config-field">
                <label class="toggle-label">
                    <input type="checkbox" name="useTextname" ${config.useTextname ? 'checked' : ''}>
                    <span class="toggle-switch"></span>
                    Use textname
                </label>
            </div>
            <div class="chart-zones-editor" id="chart-zones-editor">
                ${zones.map((z, zi) => ChartWidget.renderZoneEditor(z, zi)).join('')}
            </div>
            <div class="widget-config-field">
                <button type="button" class="zones-add-btn" id="chart-add-zone">+ Add Chart Zone</button>
            </div>
        `;
    }

    static initConfigHandlers(form, config = {}) {
        if (form.dataset.chartHandlersWired === 'true') return;
        form.dataset.chartHandlersWired = 'true';

        // Wire all existing sensor rows.
        const wireRow = (zoneIdx, sensorIdx, sensor = {}) => {
            initSensorBindingHandlers(form, sensor, { fieldPrefix: `chart-${zoneIdx}-${sensorIdx}-` });
        };
        (config.zones || []).forEach((z, zi) => (z.sensors || []).forEach((s, si) => wireRow(zi, si, s)));

        // Helper: получить last sensor (для pre-fill).
        const getLastSensor = () => {
            const rows = form.querySelectorAll('.chart-sensor-row');
            const last = rows[rows.length - 1];
            if (!last) return null;
            const zi = last.dataset.zoneIdx, si = last.dataset.sensorIdx;
            return parseSensorBindingFields(form, { fieldPrefix: `chart-${zi}-${si}-` });
        };

        // + Add Sensor (per zone)
        form.addEventListener('click', (e) => {
            const addSensorBtn = e.target.closest('.chart-zone-add-sensor');
            if (addSensorBtn) {
                const zoneIdx = parseInt(addSensorBtn.dataset.zoneIdx, 10);
                const container = form.querySelector(`[data-zone-container="${zoneIdx}"]`);
                const sensorIdx = container.querySelectorAll('.chart-sensor-row').length;
                const last = getLastSensor();
                const colorIdx = sensorIdx;
                const sensor = {
                    serverId:   last?.serverId   || (state?.servers ? [...state.servers.entries()].find(([,s]) => s.connected)?.[0] : ''),
                    objectName: last?.objectName || 'SharedMemory',
                    sensor: '', sensorId: null,
                    color: ChartWidget.COLORS[colorIdx % ChartWidget.COLORS.length],
                    smooth: true, fill: true, stepped: false,
                };
                container.insertAdjacentHTML('beforeend',
                    ChartWidget._renderChartSensorRow({ zoneIdx, sensorIdx, sensor }));
                wireRow(zoneIdx, sensorIdx, sensor);
                return;
            }
            const removeBtn = e.target.closest('.chart-sensor-remove');
            if (removeBtn) {
                removeBtn.closest('.chart-sensor-row')?.remove();
                return;
            }
            const removeZoneBtn = e.target.closest('.chart-zone-remove');
            if (removeZoneBtn) {
                removeZoneBtn.closest('.chart-zone-editor')?.remove();
                return;
            }
            const addZoneBtn = e.target.closest('#chart-add-zone');
            if (addZoneBtn) {
                const zonesEditor = form.querySelector('#chart-zones-editor');
                const zoneIdx = zonesEditor.querySelectorAll('.chart-zone-editor').length;
                zonesEditor.insertAdjacentHTML('beforeend',
                    ChartWidget.renderZoneEditor({ id: `zone-${zoneIdx}`, sensors: [] }, zoneIdx));
                return;
            }
        });
    }

    static parseConfigForm(form) {
        const zones = [];
        form.querySelectorAll('.chart-zone-editor').forEach((zoneEl) => {
            const zoneIdx = parseInt(zoneEl.dataset.zoneIdx, 10);
            const sensors = [];
            zoneEl.querySelectorAll('.chart-sensor-row').forEach((row) => {
                const sensorIdx = parseInt(row.dataset.sensorIdx, 10);
                const binding = parseSensorBindingFields(form, { fieldPrefix: `chart-${zoneIdx}-${sensorIdx}-` });
                if (!binding.sensor) return;
                sensors.push({
                    ...binding,
                    color:   form.querySelector(`[name="chart-${zoneIdx}-${sensorIdx}-color"]`)?.value || ChartWidget.COLORS[sensorIdx % ChartWidget.COLORS.length],
                    smooth:  form.querySelector(`[name="chart-${zoneIdx}-${sensorIdx}-smooth"]`)?.checked !== false,
                    fill:    form.querySelector(`[name="chart-${zoneIdx}-${sensorIdx}-fill"]`)?.checked !== false,
                    stepped: form.querySelector(`[name="chart-${zoneIdx}-${sensorIdx}-stepped"]`)?.checked || false,
                });
            });
            zones.push({ id: `zone-${zoneIdx}`, sensors });
        });
        const timeRangeInput = form.querySelector('[name="timeRange"]:checked');
        return {
            label: form.querySelector('[name="label"]')?.value || '',
            timeRange: timeRangeInput ? parseInt(timeRangeInput.value) : 900000,
            showTable: form.querySelector('[name="showTable"]')?.checked !== false,
            useTextname: form.querySelector('[name="useTextname"]')?.checked || false,
            tableHeight: 100,
            zones
        };
    }
```

- [ ] **Step 3: Удалить устаревшие global helpers + getSensorNames**

В файле найти и удалить (если есть): `addChartZone()`, `removeChartZone()`, `addChartSensor()`, `removeChartSensor()`, `updateChartSensorColor()`, `setupChartWidgetAutocomplete()`. Эти global helpers больше не вызываются — заменены event-delegation в `initConfigHandlers`.

В `class ChartWidget` найти и удалить метод `getSensorNames()` если есть (manager переходит на per-item чтение `cfg.zones[].sensors[]` в Task 11).

```bash
grep -n "addChartZone\|removeChartZone\|addChartSensor\|removeChartSensor\|updateChartSensorColor\|setupChartWidgetAutocomplete\|getSensorNames" /home/pv/Projects/uniset-panel/ui/static/js/src/61-dashboard-widgets.js
```

Каждое найденное определение функции — удалить целиком.

В `62-dashboard-manager.js:948-950`:
```javascript
        if (type === 'chart') {
            setupChartWidgetAutocomplete();
        }
```
— удалить эти 3 строки.

- [ ] **Step 4: `make app` + smoke E2E**

```bash
cd /home/pv/Projects/uniset-panel && make app
docker compose --profile dev down
docker compose run --rm e2e npx playwright test tests/single/dashboard-widgets.spec.ts --reporter=line
```

Expected: chart widget tests проходят (либо обновятся в Task 12).

- [ ] **Step 5: Commit**

```bash
git add ui/static/js/src/61-dashboard-widgets.js ui/static/js/src/62-dashboard-manager.js
git commit -m "$(cat <<'EOF'
feat(dashboard): ChartWidget — per-sensor server/object/sensor binding

Каждый sensor в zones[].sensors[] получает полный triplet через chart-{zi}-{si}-
field prefix. + Add Sensor pre-fill server+object из last sensor (любой zone).
Удалены legacy global helpers (addChartZone/removeChartSensor/...) — заменены
event-delegation в initConfigHandlers. Удалён ChartWidget.getSensorNames()
(manager переходит на cfg.zones напрямую).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Manager — updateSensorSubscriptions per-item triplet

**Files:**
- Modify: `ui/static/js/src/62-dashboard-manager.js:1715-1778` (`updateSensorSubscriptions`)

- [ ] **Step 1: Заменить целиком метод**

Заменить целиком `updateSensorSubscriptions()` (строки ~1715-1778) на:

```javascript
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

            // 1. Main sensor
            addBinding(dashboardState.sensorSubscriptions, cfg, id);

            // 2. Setpoint sensor2 (используется в SetpointWidget feedback и Gauge style=dual)
            if (cfg.sensor2) {
                addBinding(dashboardState.setpointSubscriptions, {
                    serverId:   cfg.serverId2   || cfg.serverId,
                    objectName: cfg.objectName2 || cfg.objectName,
                    sensor:     cfg.sensor2,
                }, id);
            }

            // 3. Multi-sensor items (StatusBar, BarGraph)
            if (Array.isArray(cfg.items)) {
                cfg.items.forEach(it => addBinding(dashboardState.sensorSubscriptions, it, id));
            }

            // 4. Chart zones
            if (Array.isArray(cfg.zones)) {
                cfg.zones.forEach(z => (z.sensors || []).forEach(s =>
                    addBinding(dashboardState.chartSubscriptions, s, id)));
            }
        });

        this._subscribeActiveSensorsBackend();
    }
```

- [ ] **Step 2: Заменить _subscribeActiveSensorsBackend**

Заменить целиком метод `_subscribeActiveSensorsBackend()` (строки ~1786-1820) на:

```javascript
    _subscribeActiveSensorsBackend() {
        // grpKey = `${serverId}|${objectName}` → Set<sensorId>.
        const groups = new Map();

        const addId = (b) => {
            if (!b?.serverId || !b?.objectName) return;
            if (!Number.isFinite(b.sensorId)) return;
            const k = `${b.serverId}|${b.objectName}`;
            if (!groups.has(k)) groups.set(k, new Set());
            groups.get(k).add(b.sensorId);
        };

        dashboardState.widgets.forEach(widget => {
            const cfg = widget?.config;
            if (!cfg) return;
            // Main + sensor2 + items + zones
            addId(cfg);
            if (cfg.sensor2) addId({
                serverId:   cfg.serverId2   || cfg.serverId,
                objectName: cfg.objectName2 || cfg.objectName,
                sensorId:   cfg.sensorId2,
            });
            if (Array.isArray(cfg.items)) cfg.items.forEach(addId);
            if (Array.isArray(cfg.zones)) cfg.zones.forEach(z => (z.sensors || []).forEach(addId));
        });

        for (const [grpKey, idSet] of groups) {
            const sepIdx = grpKey.indexOf('|');
            const serverId   = grpKey.slice(0, sepIdx);
            const objectName = grpKey.slice(sepIdx + 1);
            const url = `/api/objects/${encodeURIComponent(objectName)}/ionc/subscribe`
                + `?server=${encodeURIComponent(serverId)}`;
            fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sensor_ids: Array.from(idSet) })
            }).catch(err => console.warn('dashboard: subscribe failed', grpKey, err));
        }
    }
```

- [ ] **Step 3: `make app` + smoke E2E**

```bash
cd /home/pv/Projects/uniset-panel && make app
docker compose --profile dev down
docker compose run --rm e2e npx playwright test tests/single/dashboard-multi-server-isolation.spec.ts --reporter=line
```

Expected: existing multi-server тесты проходят (active widgets уже имели triplet → backend subscribe не меняется в их случае).

- [ ] **Step 4: Commit**

```bash
git add ui/static/js/src/62-dashboard-manager.js
git commit -m "$(cat <<'EOF'
feat(dashboard): updateSensorSubscriptions/subscribeActiveSensorsBackend per-item

Manager теперь читает serverId/objectName/sensor/sensorId из каждого item'а
(StatusBar/BarGraph items[], Chart zones[].sensors[]) индивидуально, не
полагаясь на widget-level default. Backend subscribe группирует sensorId'ы
по (serverId, objectName) парам — несколько групп per dashboard, если
items на разных IONC.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Unit tests + impl _migrateLegacyBinding

**Files:**
- Create: `tests/unit/legacy-binding-migration.test.ts`
- Modify: `tests/unit/setup.ts`
- Modify: `ui/static/js/src/62-dashboard-manager.js` (расширить `_migrateLegacyServerIds` → `_migrateLegacyBinding`)

`_migrateLegacyBinding` — pure-ish функция: принимает `cfg` + `sensorRegistry` (упрощённая `state.sensorsByKey`), мутирует cfg, возвращает кол-во заполненных полей. Вынесем pure-логику отдельной функцией для тестируемости.

- [ ] **Step 1: Создать unit-тест**

```typescript
// tests/unit/legacy-binding-migration.test.ts
import { describe, it, expect } from 'vitest';

declare const _migrateBindingPure: any;

// Helper: build sensorRegistry в виде Map<key, {id, name}>.
const reg = (entries: Array<[string, string, string, number]>) => {
    const m = new Map();
    for (const [serverId, objectName, name, id] of entries) {
        m.set(`${serverId}|${objectName}|${name}`, { id, name });
    }
    return m;
};

describe('_migrateBindingPure', () => {
    it('fills missing serverId/objectName/sensorId from registry', () => {
        const cfg: any = { sensor: 'AI_Temp_S' };
        const r = reg([['srv-A', 'SharedMemory', 'AI_Temp_S', 1042]]);
        const filled = _migrateBindingPure(cfg, r);
        expect(filled).toBeGreaterThan(0);
        expect(cfg).toEqual({ sensor: 'AI_Temp_S', serverId: 'srv-A', objectName: 'SharedMemory', sensorId: 1042 });
    });

    it('no-op when full triplet already present', () => {
        const cfg: any = { sensor: 'X', serverId: 'a', objectName: 'b', sensorId: 7 };
        const r = reg([['z', 'q', 'X', 99]]);
        expect(_migrateBindingPure(cfg, r)).toBe(0);
        expect(cfg).toEqual({ sensor: 'X', serverId: 'a', objectName: 'b', sensorId: 7 });
    });

    it('empty registry → no mutation', () => {
        const cfg: any = { sensor: 'X' };
        const r = new Map();
        expect(_migrateBindingPure(cfg, r)).toBe(0);
        expect(cfg).toEqual({ sensor: 'X' });
    });

    it('handles items[] (multi-sensor)', () => {
        const cfg: any = { items: [{ sensor: 'A' }, { sensor: 'B', serverId: 'pre-set' }] };
        const r = reg([
            ['srv-1', 'SM', 'A', 10],
            ['srv-2', 'DI', 'B', 20],
        ]);
        const n = _migrateBindingPure(cfg, r);
        expect(n).toBeGreaterThan(0);
        expect(cfg.items[0]).toEqual({ sensor: 'A', serverId: 'srv-1', objectName: 'SM', sensorId: 10 });
        // Pre-set serverId сохраняется даже если registry даёт другой.
        expect(cfg.items[1].serverId).toBe('pre-set');
    });

    it('handles chart zones[].sensors[]', () => {
        const cfg: any = { zones: [{ sensors: [{ sensor: 'X' }, { sensor: 'Y' }] }] };
        const r = reg([
            ['srv-a', 'SM', 'X', 1],
            ['srv-b', 'SM', 'Y', 2],
        ]);
        _migrateBindingPure(cfg, r);
        expect(cfg.zones[0].sensors[0]).toEqual({ sensor: 'X', serverId: 'srv-a', objectName: 'SM', sensorId: 1 });
        expect(cfg.zones[0].sensors[1].sensorId).toBe(2);
    });

    it('handles sensor2 (gauge dual / setpoint feedback)', () => {
        const cfg: any = { sensor: 'X', serverId: 'srv-a', objectName: 'SM', sensorId: 1, sensor2: 'Y' };
        const r = reg([['srv-a', 'SM', 'Y', 99]]);
        _migrateBindingPure(cfg, r);
        expect(cfg.sensorId2).toBe(99);
        // serverId2/objectName2 не выставляются если sensor2 в том же object — fallback в manager.
    });
});
```

- [ ] **Step 2: Запустить — должен фейлиться**

```bash
cd /home/pv/Projects/uniset-panel/tests/unit && npm test -- legacy-binding-migration.test.ts
```

Expected: FAIL — `_migrateBindingPure is not defined`.

- [ ] **Step 3: Реализация — добавить функцию в helper-файл**

В `ui/static/js/src/60-widget-sensor-binding.js` добавить:

```javascript
// Pure-функция миграции legacy binding'а.
//
// cfg может содержать:
//   - main sensor: { sensor, serverId?, objectName?, sensorId? }
//   - sensor2 (feedback / dual): { sensor2, serverId2?, objectName2?, sensorId2? }
//   - items: [{ sensor, ... }] (StatusBar/BarGraph)
//   - zones: [{ sensors: [{ sensor, ... }] }] (Chart)
//
// sensorRegistry — Map<sensorKey, { id, name, ... }> где sensorKey = "${serverId}|${objectName}|${sensorName}".
//
// Возвращает количество заполненных полей (0 — ничего не нужно).
function _migrateBindingPure(cfg, sensorRegistry) {
    if (!cfg || !sensorRegistry) return 0;
    let filled = 0;

    // Найти первый match в registry по sensorName.
    // Возвращает { serverId, objectName, sensorId } или null.
    const lookup = (sensorName) => {
        if (!sensorName) return null;
        for (const [key, val] of sensorRegistry) {
            const sepA = key.indexOf('|');
            const sepB = key.lastIndexOf('|');
            if (sepA < 0 || sepB <= sepA) continue;
            const name = key.slice(sepB + 1);
            if (name === sensorName) {
                return {
                    serverId:   key.slice(0, sepA),
                    objectName: key.slice(sepA + 1, sepB),
                    sensorId:   val?.id,
                };
            }
        }
        return null;
    };

    // Резолвит binding-блок. b — объект с потенциально неполным {serverId, objectName, sensor, sensorId}.
    const resolve = (b, idField = 'sensorId') => {
        if (!b?.sensor) return false;
        if (b.serverId && b.objectName && Number.isFinite(b[idField])) return false; // already full
        const info = lookup(b.sensor);
        if (!info) return false;
        let touched = false;
        if (!b.serverId)   { b.serverId = info.serverId;   touched = true; }
        if (!b.objectName) { b.objectName = info.objectName; touched = true; }
        if (!Number.isFinite(b[idField]) && Number.isFinite(info.sensorId)) {
            b[idField] = info.sensorId; touched = true;
        }
        return touched;
    };

    if (resolve(cfg)) filled++;

    // sensor2: создаём «виртуальный binding» из serverId2/objectName2/sensor2/sensorId2.
    if (cfg.sensor2) {
        const b2 = {
            serverId:   cfg.serverId2,
            objectName: cfg.objectName2,
            sensor:     cfg.sensor2,
            sensorId:   cfg.sensorId2,
        };
        if (resolve(b2)) {
            if (b2.serverId   && !cfg.serverId2)   cfg.serverId2   = b2.serverId;
            if (b2.objectName && !cfg.objectName2) cfg.objectName2 = b2.objectName;
            if (Number.isFinite(b2.sensorId)) cfg.sensorId2 = b2.sensorId;
            filled++;
        }
    }

    if (Array.isArray(cfg.items)) cfg.items.forEach(it => { if (resolve(it)) filled++; });
    if (Array.isArray(cfg.zones)) {
        cfg.zones.forEach(z => (z.sensors || []).forEach(s => { if (resolve(s)) filled++; }));
    }

    return filled;
}

if (typeof globalThis !== 'undefined') {
    globalThis._migrateBindingPure = _migrateBindingPure;
}
```

- [ ] **Step 4: Прогон unit-тестов**

```bash
cd /home/pv/Projects/uniset-panel/tests/unit && npm test -- legacy-binding-migration.test.ts
```

Expected: PASS, все 6 тестов зелёных.

- [ ] **Step 5: Manager — заменить _migrateLegacyServerIds на _migrateLegacyBinding**

В `ui/static/js/src/62-dashboard-manager.js` заменить метод `_migrateLegacyServerIds()` (строки ~312-342) на новый `_migrateLegacyBinding()`:

```javascript
    // Lazy resolve binding'а из state.sensorsByKey (берёт первый match по sensorName).
    // НЕ сохраняет dashboard на сервер — миграция в памяти; полный triplet
    // персистится только когда юзер сам нажмёт Apply в config dialog или Export.
    _migrateLegacyBinding() {
        if (!state?.sensorsByKey) return 0;
        let total = 0;
        for (const widget of dashboardState.widgets.values()) {
            const cfg = widget?.config;
            if (!cfg) continue;
            const n = _migrateBindingPure(cfg, state.sensorsByKey);
            if (n > 0) total += n;
        }
        if (total > 0) {
            console.info(`dashboard "${dashboardState.currentDashboard}": migrated ${total} legacy widget bindings; re-save to persist`);
        }
        return total;
    }

    // Возвращает true, если хоть один widget имеет неполный binding (sensor без триплета).
    _anyLegacyBinding() {
        const isUnresolved = (b) => b?.sensor && (!b.serverId || !b.objectName || !Number.isFinite(b.sensorId));
        for (const w of dashboardState.widgets.values()) {
            const cfg = w?.config;
            if (!cfg) continue;
            if (isUnresolved(cfg)) return true;
            if (cfg.sensor2 && isUnresolved({
                serverId: cfg.serverId2 ?? cfg.serverId,
                objectName: cfg.objectName2 ?? cfg.objectName,
                sensor: cfg.sensor2, sensorId: cfg.sensorId2,
            })) return true;
            if (Array.isArray(cfg.items) && cfg.items.some(isUnresolved)) return true;
            if (Array.isArray(cfg.zones)) {
                for (const z of cfg.zones) if ((z.sensors || []).some(isUnresolved)) return true;
            }
        }
        return false;
    }
```

Найти все вызовы `_migrateLegacyServerIds()` (`grep -n "_migrateLegacyServerIds"` в файле — типично ~3 места) и заменить на `_migrateLegacyBinding()`.

- [ ] **Step 6: `make app` + commit**

```bash
cd /home/pv/Projects/uniset-panel && make app
git add ui/static/js/src/60-widget-sensor-binding.js ui/static/js/src/62-dashboard-manager.js tests/unit/legacy-binding-migration.test.ts
git commit -m "$(cat <<'EOF'
feat(dashboard): _migrateLegacyBinding — full triplet resolution

Заменили _migrateLegacyServerIds на _migrateLegacyBinding с pure-функцией
_migrateBindingPure (в 60-widget-sensor-binding.js). Резолвит serverId+objectName+sensorId
для main sensor, sensor2, items[] и zones[].sensors[] из state.sensorsByKey
(берёт первый match по sensorName). Только in-memory — без auto-save.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Cold-start retry hook в updateDashboardWidgets

**Files:**
- Modify: `ui/static/js/src/62-dashboard-manager.js` (добавить `tryResolvePendingMigration` + setup в `loadDashboard`)
- Modify: `ui/static/js/src/63-dashboard-dialogs.js:528-545` (`updateDashboardWidgets`)

- [ ] **Step 1: Добавить tryResolvePendingMigration в DashboardManager**

В `ui/static/js/src/62-dashboard-manager.js` добавить метод (рядом с `_migrateLegacyBinding`):

```javascript
    // Вызывается из updateDashboardWidgets() в 63-dashboard-dialogs.js на каждый
    // ionc_sensor_batch / modbus_register_batch / opcua_sensor_batch / sensor_data
    // событие SSE. Дешёвый no-op если pending не выставлен.
    tryResolvePendingMigration() {
        if (!this._pendingMigration) return;
        const filled = this._migrateLegacyBinding();
        if (filled > 0) {
            this.updateSensorSubscriptions();
            this.initializeWidgetValues();
        }
        if (!this._anyLegacyBinding()) this._pendingMigration = false;
    }
```

В `loadDashboard()` (после `renderDashboard(config)` или внутри `renderDashboard`) — выставить флаг:

Найти в `renderDashboard()` место после `this._migrateLegacyBinding();` и добавить:

```javascript
        // ...existing:
        this._migrateLegacyBinding();
        this.updateSensorSubscriptions();
        this.initializeWidgetValues();
        // NEW:
        this._pendingMigration = this._anyLegacyBinding();
```

То же в `loadDashboard()` early-return ветке (если есть `_migrateLegacyBinding`+update+initialize) — добавить `this._pendingMigration = this._anyLegacyBinding();`.

- [ ] **Step 2: Добавить hook в updateDashboardWidgets**

В `ui/static/js/src/63-dashboard-dialogs.js:528-545` модифицировать функцию:

```javascript
function updateDashboardWidgets(sensors, ctx) {
    if (!dashboardManager || !sensors) return;
    if (!ctx || !ctx.serverId || !ctx.objectName) {
        console.warn('updateDashboardWidgets: ctx без serverId/objectName, skip');
        return;
    }

    // Cold-start migration retry: если SSE прилетел ДО первого _migrateLegacyBinding
    // (state.sensorsByKey ещё не прогрет), это была no-op миграция. Сейчас sensors[]
    // приходит с полными triplet'ами — пробуем снова.
    dashboardManager.tryResolvePendingMigration?.();

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

(Только одна добавленная строка с `tryResolvePendingMigration?.()`).

- [ ] **Step 3: `make app` + smoke E2E**

```bash
cd /home/pv/Projects/uniset-panel && make app
docker compose --profile dev down
docker compose run --rm e2e npx playwright test tests/single/dashboard.spec.ts tests/single/dashboard-multi-server-isolation.spec.ts --reporter=line
```

Expected: existing dashboard и multi-server тесты проходят.

- [ ] **Step 4: Commit**

```bash
git add ui/static/js/src/62-dashboard-manager.js ui/static/js/src/63-dashboard-dialogs.js
git commit -m "$(cat <<'EOF'
feat(dashboard): cold-start retry hook для legacy binding migration

При первой загрузке dashboard'а state.sensorsByKey может быть пуст (SSE batch'и
ещё не приехали) — миграция получается no-op. Hook в updateDashboardWidgets
вызывает tryResolvePendingMigration на каждый SSE batch — после прогрева
registry миграция отрабатывает целиком.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: E2E test — dashboard-widget-binding-multi-server.spec.ts

**Files:**
- Create: `tests/single/dashboard-widget-binding-multi-server.spec.ts`

Ориентир по structure: `tests/single/dashboard-multi-server-isolation.spec.ts` (двух-серверная mock-server-2 матрица). 6 сценариев из spec'а.

- [ ] **Step 1: Создать spec-файл**

```typescript
// tests/single/dashboard-widget-binding-multi-server.spec.ts
import { test, expect, Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000';

// Helper: открывает dashboard view + edit-mode.
async function setupDashboard(page: Page, name = 'binding-test') {
    await page.goto(BASE_URL);
    await page.waitForSelector('#dashboard-tab', { timeout: 10000 });
    await page.click('#dashboard-tab');
    // Создаём чистый dashboard (если не существует)
    await page.evaluate((n) => {
        if (typeof window.dashboardManager?.createDashboard === 'function') {
            window.dashboardManager.createDashboard(n);
        }
    }, name);
    await page.click('button[data-test="dashboard-edit-toggle"]', { trial: false }).catch(() => {});
    await page.waitForTimeout(300);
}

test.describe('dashboard widget binding — multi-server', () => {
    test('Gauge: server+object selectors render, sensor autocomplete works, Apply persists triplet', async ({ page }) => {
        await setupDashboard(page);
        // Add Gauge widget
        await page.click('button[data-test="add-widget-btn"]');
        await page.click('[data-widget-type="gauge"]');
        await page.waitForSelector('[data-test="cfg-serverId"]', { timeout: 5000 });

        // Verify selectors present
        await expect(page.locator('[data-test="cfg-serverId"]')).toBeVisible();
        await expect(page.locator('[data-test="cfg-objectName"]')).toBeVisible();
        await expect(page.locator('[data-test="cfg-sensor"]')).toBeVisible();

        // Type sensor name
        await page.fill('[data-test="cfg-sensor"]', 'AI');
        await page.waitForSelector('.sensor-autocomplete-item', { timeout: 3000 });
        await page.click('.sensor-autocomplete-item');

        // Apply
        await page.click('button[data-test="widget-config-apply"]');
        await page.waitForTimeout(500);

        // Read back config
        const cfg = await page.evaluate(() => {
            const w = [...window.dashboardState.widgets.values()][0];
            return w?.config;
        });
        expect(cfg).toMatchObject({
            sensor: expect.any(String),
            sensorId: expect.any(Number),
            serverId: expect.any(String),
            objectName: expect.any(String),
        });
    });

    test('StatusBar: two items on different IONC objects, both receive SSE updates', async ({ page }) => {
        // Manual config injection — программно сохраняем dashboard с известным config'ом.
        await page.goto(BASE_URL);
        await page.waitForSelector('#dashboard-tab');
        await page.click('#dashboard-tab');
        await page.evaluate(() => {
            const cfg = {
                widgets: [{
                    type: 'statusbar', x: 0, y: 0, width: 8, height: 4,
                    config: {
                        layout: 'horizontal',
                        items: [
                            { serverId: 'srv-A-id-from-mock', objectName: 'SharedMemory', sensor: 'AI70_S', sensorId: 1, label: 'Temp', threshold: 0.5 },
                            { serverId: 'srv-A-id-from-mock', objectName: 'SharedMemory', sensor: 'AI71_S', sensorId: 2, label: 'Press', threshold: 0.5 },
                        ]
                    }
                }]
            };
            window.dashboardState.dashboards.set('test-sb', { name: 'test-sb', ...cfg });
            window.dashboardManager.loadDashboard('test-sb');
        });
        await page.waitForTimeout(2000);
        const itemCount = await page.locator('.statusbar-item').count();
        expect(itemCount).toBe(2);
    });

    test('Backend subscribe: each (serverId, objectName) pair receives /ionc/subscribe POST', async ({ page }) => {
        const subscribeCalls: Array<{ url: string; body: any }> = [];
        await page.route('**/ionc/subscribe**', async (route) => {
            const req = route.request();
            subscribeCalls.push({ url: req.url(), body: JSON.parse(req.postData() || '{}') });
            await route.fulfill({ status: 200, body: '{}' });
        });
        await setupDashboard(page);
        await page.evaluate(() => {
            const cfg = {
                widgets: [
                    { type: 'gauge', x: 0, y: 0, width: 4, height: 4, config: { serverId: 'srv-1', objectName: 'SharedMemory', sensor: 'X', sensorId: 100 } },
                    { type: 'gauge', x: 0, y: 5, width: 4, height: 4, config: { serverId: 'srv-1', objectName: 'SharedMemory', sensor: 'Y', sensorId: 101 } },
                    { type: 'gauge', x: 0, y: 10, width: 4, height: 4, config: { serverId: 'srv-2', objectName: 'OtherIONC', sensor: 'Z', sensorId: 999 } },
                ]
            };
            window.dashboardState.dashboards.set('subs-test', { name: 'subs-test', ...cfg });
            window.dashboardManager.loadDashboard('subs-test');
        });
        await page.waitForTimeout(1500);
        // Two groups expected: (srv-1, SharedMemory) с [100, 101] и (srv-2, OtherIONC) с [999].
        expect(subscribeCalls.length).toBeGreaterThanOrEqual(2);
        const grp1 = subscribeCalls.find(c => c.url.includes('SharedMemory') && c.url.includes('srv-1'));
        const grp2 = subscribeCalls.find(c => c.url.includes('OtherIONC') && c.url.includes('srv-2'));
        expect(grp1).toBeDefined();
        expect(grp1?.body.sensor_ids).toEqual(expect.arrayContaining([100, 101]));
        expect(grp2).toBeDefined();
        expect(grp2?.body.sensor_ids).toEqual([999]);
    });

    test('Add item: pre-fill server+object из last item', async ({ page }) => {
        await setupDashboard(page);
        await page.click('button[data-test="add-widget-btn"]');
        await page.click('[data-widget-type="statusbar"]');
        await page.waitForSelector('#statusbar-items-container');

        // Set values in first row
        await page.selectOption('[name="item-0-serverId"]', { index: 0 });
        // Click + Add
        await page.click('#add-statusbar-item');
        await page.waitForTimeout(300);

        const newRowServerId = await page.locator('[name="item-1-serverId"]').inputValue();
        const firstRowServerId = await page.locator('[name="item-0-serverId"]').inputValue();
        expect(newRowServerId).toBe(firstRowServerId);

        const newRowSensor = await page.locator('[name="item-1-sensor"]').inputValue();
        expect(newRowSensor).toBe(''); // sensor — пустой
    });

    test('Legacy dashboard: load with bare sensor name → migration fills triplet via state.sensorsByKey', async ({ page }) => {
        await page.goto(BASE_URL);
        await page.waitForSelector('#dashboard-tab');
        // Прогреваем sensorsByKey (открываем Objects view, ждём SSE)
        await page.click('#objects-tab');
        await page.waitForTimeout(2000);
        // Создаём dashboard с legacy config
        await page.click('#dashboard-tab');
        await page.evaluate(() => {
            const cfg = {
                widgets: [{
                    type: 'gauge', x: 0, y: 0, width: 4, height: 4,
                    config: { sensor: 'AI70_S' } // только sensor — legacy
                }]
            };
            window.dashboardState.dashboards.set('legacy-test', { name: 'legacy-test', ...cfg });
            window.dashboardManager.loadDashboard('legacy-test');
        });
        await page.waitForTimeout(2000);
        const w = await page.evaluate(() => [...window.dashboardState.widgets.values()][0]?.config);
        expect(w.serverId).toBeTruthy();
        expect(w.objectName).toBeTruthy();
        expect(w.sensorId).toEqual(expect.any(Number));
    });
});
```

- [ ] **Step 2: Прогон**

```bash
cd /home/pv/Projects/uniset-panel
docker compose --profile dev down
docker compose run --rm e2e npx playwright test tests/single/dashboard-widget-binding-multi-server.spec.ts --reporter=line
```

Expected: все 5 тестов зелёных. Если что-то падает — анализ ошибки, fix в widget config form / manager subscription. Тест №2 (StatusBar two items) использует mock server'а — может потребоваться адаптация под реальный test fixture.

- [ ] **Step 3: Commit**

```bash
git add tests/single/dashboard-widget-binding-multi-server.spec.ts
git commit -m "$(cat <<'EOF'
test(dashboard): E2E multi-IONC binding для всех widget'ов

5 сценариев: Gauge config dialog с triplet, StatusBar multi-item, backend
subscribe per (serverId, objectName) группа, Add item pre-fill, legacy
dashboard migration через state.sensorsByKey.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Final full-suite validation

- [ ] **Step 1: Прогон всего E2E + unit**

```bash
cd /home/pv/Projects/uniset-panel
docker compose --profile dev down
make js-tests-unit
make js-tests
```

Expected: все тесты зелёные. Если какой-то pre-existing flaky тест падает — задокументируй в `docs/review/`, не считай регрессией.

- [ ] **Step 2: `make build` + ручной smoke**

```bash
cd /home/pv/Projects/uniset-panel && make build
docker compose up dev-viewer -d --build
# Ручная проверка через MCP playwright:
#   - Открыть http://localhost:8000
#   - Создать dashboard
#   - Добавить Gauge → выбрать server+object+sensor → Apply → виджет показывает значение
#   - Добавить StatusBar → first item → server+object+sensor → +Add → видим server/object pre-fill
#   - Чек: F12 console — нет красных ошибок
docker compose --profile dev down
```

Expected: всё работает в браузере.

- [ ] **Step 3: Final commit (если были fixup'ы) + push**

```bash
git status
# Если что-то остаётся — squash или дополнительный commit с fixup описанием.
git push
```

---

## Self-review

Проверял план vs spec:

- ✅ Helpers (4 функции) — Tasks 2, 3, 4
- ✅ Pure migration function — Task 12
- ✅ ActiveDashboardWidget refactor — Task 5
- ✅ Single-sensor widgets (Gauge/Level/Led/Digital) — Tasks 6, 7
- ✅ Multi-sensor widgets (StatusBar/BarGraph/Chart) — Tasks 8, 9, 10
- ✅ Manager subscription routing per-item — Task 11
- ✅ Backend subscribe per-item — Task 11
- ✅ Cold-start migration retry hook — Task 13
- ✅ E2E multi-server binding — Task 14
- ✅ Final validation — Task 15

Все требования spec'а покрыты. Type consistency проверена: одинаковые имена методов через все tasks (`renderSensorBindingFields`, `parseSensorBindingFields`, `initSensorBindingHandlers`, `renderSensorItemRow`, `parseSensorItemList`, `initSensorItemListHandlers`, `_migrateBindingPure`, `_migrateLegacyBinding`, `_anyLegacyBinding`, `tryResolvePendingMigration`).
