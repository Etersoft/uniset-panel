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

// ============================================================================
// IONC@server registry — session-cache для combobox'а в config-форме widget'ов.
// TTL 5 минут (IONC_REGISTRY_TTL_MS) + ручной refresh через кнопку ↻.
// fetchPromise shared между concurrent open вызовами.
// 5xx / network error: fetchedAt НЕ обновляется (cache не помечается fresh),
// существующие данные сохраняются для fallback.
// ============================================================================

// formatIONCComboValue — единственный источник истины для display-string'а
// combo input'а и его dropdown items. Формат: `${objectName} @ ${serverName||serverId}`.
// `(offline)` суффикс добавляется когда либо явно через opts.showOffline=true,
// либо когда entry.connected === false и opts.autoOfflineSuffix !== false.
//
// Передавать можно либо registry-entry ({serverId, objectName, serverName, connected}),
// либо «orphan-binding» из config'а (serverId+objectName, без serverName/connected → showOffline:true).
function formatIONCComboValue(entry, opts = {}) {
    if (!entry || !entry.objectName) return '';
    const serverNameOrId = entry.serverName || entry.serverId || '';
    const base = `${entry.objectName} @ ${serverNameOrId}`;
    const explicitShow = opts.showOffline === true;
    const auto = opts.autoOfflineSuffix !== false && entry.connected === false;
    return (explicitShow || auto) ? `${base} (offline)` : base;
}

async function ensureIONCRegistry({ force = false } = {}) {
    const reg = state.ioncRegistry;
    const fresh = (Date.now() - reg.fetchedAt) < IONC_REGISTRY_TTL_MS;
    if (!force && fresh && reg.servers.size > 0) return reg;
    if (reg.fetchPromise) return reg.fetchPromise;
    reg.isFetching = true;
    reg.fetchPromise = (async () => {
        const resp = await fetch('/api/objects-by-type?type=IONotifyController');
        if (!resp.ok) throw new Error(`/api/objects-by-type: HTTP ${resp.status}`);
        const data = await resp.json();
        reg.servers.clear();
        (data.servers || []).forEach(s => {
            reg.servers.set(s.serverId, {
                serverName: s.serverName || '',
                connected:  !!s.connected,
                objects:    Array.isArray(s.objects) ? s.objects : [],
            });
        });
        reg.fetchedAt = Date.now();
        return reg;
    })().finally(() => {
        reg.isFetching = false;
        reg.fetchPromise = null;
    });
    return reg.fetchPromise;
}

function getIONCEntries() {
    const out = [];
    state.ioncRegistry.servers.forEach((srv, serverId) => {
        srv.objects.forEach(objectName => {
            const entry = {
                serverId,
                serverName: srv.serverName,
                connected:  srv.connected,
                objectName,
            };
            // displayString — канонический ключ для filter/sort (БЕЗ offline-суффикса,
            // чтобы поиск "SharedMemory" находил и offline pair'ы). Для input value
            // используется formatIONCComboValue с autoOfflineSuffix.
            entry.displayString = formatIONCComboValue(entry, { autoOfflineSuffix: false });
            out.push(entry);
        });
    });
    out.sort((a, b) => {
        if (a.connected !== b.connected) return a.connected ? -1 : 1;
        return a.displayString.localeCompare(b.displayString);
    });
    return out;
}

function findIONCEntry(serverId, objectName) {
    const srv = state.ioncRegistry.servers.get(serverId);
    if (!srv) return null;
    if (!srv.objects.includes(objectName)) return null;
    const entry = {
        serverId, serverName: srv.serverName, connected: srv.connected, objectName,
    };
    entry.displayString = formatIONCComboValue(entry, { autoOfflineSuffix: false });
    return entry;
}

// setupIONCComboAutocomplete — wiring combobox'а IONC@server.
// Привязывает к input/hidden/refresh-кнопке. Идемпотентен через
// form.dataset[`ioncCombo_${prefix}_wired`].
function setupIONCComboAutocomplete(form, prefix = '') {
    const flagKey = `ioncCombo_${prefix.replace(/[^a-z0-9]/gi, '_')}_wired`;
    if (form.dataset[flagKey] === 'true') return;
    form.dataset[flagKey] = 'true';

    const input        = form.querySelector(`[name="${prefix}ioncCombo"]`);
    const hiddenServer = form.querySelector(`[name="${prefix}serverId"]`);
    const hiddenObject = form.querySelector(`[name="${prefix}objectName"]`);
    const refreshBtn   = input?.closest('.ionc-combo-wrap')?.querySelector('.ionc-combo-refresh');
    if (!input || !hiddenServer || !hiddenObject) return;

    let dropdown = null;
    let debounceTimer = null;
    let activeIndex = -1;
    let currentItems = [];
    let currentFilter = '';

    function destroyDropdown() {
        if (dropdown) { dropdown.remove(); dropdown = null; }
        activeIndex = -1;
        currentItems = [];
    }

    function highlightMatch(text, filterLower) {
        if (!filterLower) return escapeHtml(text);
        const lower = text.toLowerCase();
        const idx = lower.indexOf(filterLower);
        if (idx < 0) return escapeHtml(text);
        return `${escapeHtml(text.slice(0, idx))}<mark>${escapeHtml(text.slice(idx, idx + filterLower.length))}</mark>${escapeHtml(text.slice(idx + filterLower.length))}`;
    }

    function renderItems() {
        if (!dropdown) return;
        if (currentItems.length === 0) {
            dropdown.innerHTML = '<div class="ionc-combo-empty">Нет совпадений</div>';
            return;
        }
        const filterLower = currentFilter.toLowerCase();
        const itemsHtml = currentItems.map((entry, idx) => {
            const isPreselected = hiddenServer.value === entry.serverId && hiddenObject.value === entry.objectName;
            const cls = [
                'ionc-combo-item',
                idx === activeIndex ? 'active' : '',
                entry.connected ? '' : 'offline',
                isPreselected ? 'preselected' : '',
            ].filter(Boolean).join(' ');
            const offlineMark = entry.connected ? '' : '<span class="ionc-combo-offline-mark">⚠ offline</span>';
            const star = isPreselected ? '<span class="ionc-combo-star">★</span>' : '';
            return `<div class="${cls}" data-idx="${idx}">
                ${star}<span class="ionc-combo-display">${highlightMatch(entry.displayString, filterLower)}</span>${offlineMark}
            </div>`;
        }).join('');
        dropdown.innerHTML = itemsHtml;
        dropdown.querySelectorAll('.ionc-combo-item').forEach(el => {
            el.addEventListener('mousedown', (e) => {
                e.preventDefault();
                pickItem(parseInt(el.dataset.idx, 10));
            });
        });
    }

    function buildDropdown() {
        if (dropdown) return;
        dropdown = document.createElement('div');
        dropdown.className = 'ionc-combo-dropdown';
        const rect = input.getBoundingClientRect();
        dropdown.style.position = 'fixed';
        dropdown.style.left = `${rect.left}px`;
        dropdown.style.top = `${rect.bottom + IONC_COMBO_DROPDOWN_TOP_OFFSET_PX}px`;
        dropdown.style.width = `${rect.width}px`;
        dropdown.style.zIndex = String(SENSOR_AUTOCOMPLETE_DROPDOWN_Z_INDEX);
        document.body.appendChild(dropdown);
    }

    function applyFilter(text) {
        currentFilter = text;
        const all = getIONCEntries();
        let filtered;
        if (!text) {
            filtered = all;
        } else {
            const t = text.toLowerCase();
            filtered = all.filter(it => it.displayString.toLowerCase().includes(t));
        }
        // Preselected item (current binding) sorts first for quick re-selection.
        const currentServerId = hiddenServer.value;
        const currentObjectName = hiddenObject.value;
        if (currentServerId && currentObjectName) {
            filtered = filtered.slice().sort((a, b) => {
                const aMatch = (a.serverId === currentServerId && a.objectName === currentObjectName) ? -1 : 0;
                const bMatch = (b.serverId === currentServerId && b.objectName === currentObjectName) ? -1 : 0;
                if (aMatch !== bMatch) return aMatch - bMatch;
                return 0; // preserve existing order (online-first + alpha from getIONCEntries)
            });
        }
        currentItems = filtered;
        activeIndex = -1;
        renderItems();
    }

    function pickItem(idx) {
        const item = currentItems[idx];
        if (!item) return;
        // Offline pick: input показывает (offline) суффикс + orphan-маркер сохраняется
        // (UI sign'ал что выбранный target недоступен). Online pick: чистый display.
        input.value = formatIONCComboValue(item, { autoOfflineSuffix: true });
        if (item.connected) {
            delete input.dataset.orphan;
        } else {
            input.dataset.orphan = 'true';
        }
        hiddenServer.value = item.serverId;
        hiddenObject.value = item.objectName;
        hiddenServer.dispatchEvent(new Event('change', { bubbles: true }));
        hiddenObject.dispatchEvent(new Event('change', { bubbles: true }));
        destroyDropdown();
    }

    function preselectFromConfig() {
        const sid = hiddenServer.value;
        const oname = hiddenObject.value;
        if (!sid || !oname) return;
        const entry = findIONCEntry(sid, oname);
        if (entry) {
            // Если entry online — обычный display. Если offline — с суффиксом + orphan.
            input.value = formatIONCComboValue(entry, { autoOfflineSuffix: true });
            if (entry.connected) {
                delete input.dataset.orphan;
            } else {
                input.dataset.orphan = 'true';
            }
        } else {
            // Pair не в registry → orphan: показываем raw serverId/objectName + offline.
            input.value = formatIONCComboValue({ serverId: sid, objectName: oname }, { showOffline: true });
            input.dataset.orphan = 'true';
        }
    }

    function applySingleMatchOrPreselect() {
        const all = getIONCEntries();
        if (all.length === 1) {
            // Persistence Invariant: existing binding is user property — never overwrite automatically.
            // Single-match auto-fill только когда config пустой (новый widget без серверной привязки).
            // serverId — достаточный discriminator: новый widget не имеет serverId,
            // а существующий (даже orphan) всегда имеет сохранённый serverId.
            if (hiddenServer.value) {
                input.disabled = false;
                input.title = '';
                preselectFromConfig();
                return;
            }
            const entry = all[0];
            input.value = formatIONCComboValue(entry, { autoOfflineSuffix: true });
            if (!entry.connected) input.dataset.orphan = 'true';
            input.disabled = true;
            input.title = 'Только 1 IONC@server в системе';
            hiddenServer.value = entry.serverId;
            hiddenObject.value = entry.objectName;
            hiddenServer.dispatchEvent(new Event('change', { bubbles: true }));
            hiddenObject.dispatchEvent(new Event('change', { bubbles: true }));
            return;
        }
        input.disabled = false;
        input.title = '';
        preselectFromConfig();
    }

    if (state.ioncRegistry.servers.size > 0) {
        applySingleMatchOrPreselect();
    } else {
        ensureIONCRegistry().then(applySingleMatchOrPreselect).catch(() => {
            preselectFromConfig();
        });
    }

    input.addEventListener('focus', () => {
        if (input.disabled) return;
        buildDropdown();
        applyFilter('');
    });

    input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            buildDropdown();
            applyFilter(input.value || '');
        }, IONC_COMBO_DEBOUNCE_MS);
    });

    input.addEventListener('keydown', (e) => {
        if (!dropdown || currentItems.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIndex = Math.min(activeIndex + 1, currentItems.length - 1);
            renderItems();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIndex = Math.max(activeIndex - 1, 0);
            renderItems();
        } else if (e.key === 'Enter') {
            if (activeIndex >= 0) {
                e.preventDefault();
                pickItem(activeIndex);
            }
        } else if (e.key === 'Escape') {
            destroyDropdown();
        }
    });

    input.addEventListener('blur', () => {
        setTimeout(destroyDropdown, SENSOR_AUTOCOMPLETE_BLUR_DELAY_MS);
    });

    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            if (state.ioncRegistry.isFetching) return;
            refreshBtn.classList.add('spinning');
            try {
                await ensureIONCRegistry({ force: true });
                applySingleMatchOrPreselect();
                if (dropdown) applyFilter(input.value || '');
            } catch (err) {
                console.warn('IONC registry refresh failed:', err);
            } finally {
                refreshBtn.classList.remove('spinning');
            }
        });
    }
}

function renderSensorBindingFields(config = {}, opts = {}) {
    const prefix = opts.fieldPrefix || '';
    const sensorLabel = opts.sensorLabel || 'Sensor';
    const objectNameDefault = opts.objectNameDefault || 'SharedMemory';

    const serverId = config.serverId || '';
    const objectName = config.objectName || objectNameDefault;
    // initialDisplay — orphan fallback (без serverName, registry ещё не загружена).
    // setupIONCComboAutocomplete переписывает после ensureIONCRegistry, если pair найден.
    const initialDisplay = serverId && objectName
        ? formatIONCComboValue({ serverId, objectName }, { autoOfflineSuffix: false })
        : '';

    return `
        <div class="widget-config-field ionc-combo-row">
            <label>IONC @ Server</label>
            <div class="ionc-combo-wrap">
                <input type="text" class="widget-input ionc-combo-input"
                       name="${prefix}ioncCombo" autocomplete="off"
                       placeholder="введите для поиска…"
                       value="${escapeAttr(initialDisplay)}"
                       data-test="cfg-${prefix}ioncCombo">
                <button type="button" class="ionc-combo-refresh"
                        title="Обновить список"
                        data-test="cfg-${prefix}ioncRefresh">↻</button>
                <input type="hidden" name="${prefix}serverId" value="${escapeAttr(serverId)}"
                       data-test="cfg-${prefix}serverId">
                <input type="hidden" name="${prefix}objectName" value="${escapeAttr(objectName)}"
                       data-test="cfg-${prefix}objectName">
            </div>
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

// Стандартный label-field, который в widget config dialog'е почти везде одинаковый:
// `<label>Label</label> + <input name="label">`. Используется в passive widget'ах
// (gauge, level, digital, ...). Active widget'ы рендерят свой через base.getConfigForm.
function renderLabelField(config = {}, placeholder = 'Display label') {
    return `
        <div class="widget-config-field">
            <label>Label</label>
            <input type="text" class="widget-input" name="label"
                   value="${escapeAttr(config.label || '')}" placeholder="${escapeAttr(placeholder)}">
        </div>
    `;
}

// Парсит значение label-поля. Возвращает строку или ''.
function parseLabelField(form) {
    return form.querySelector('[name="label"]')?.value || '';
}

function parseSensorBindingFields(form, opts = {}) {
    const prefix = opts.fieldPrefix || '';
    const rawId = form.querySelector(`[name="${prefix}sensorId"]`)?.value;
    const sensorId = parseIntegerOrDefault(rawId, null);
    return {
        serverId:   form.querySelector(`[name="${prefix}serverId"]`)?.value || null,
        objectName: form.querySelector(`[name="${prefix}objectName"]`)?.value || (opts.objectNameDefault || 'SharedMemory'),
        sensor:     form.querySelector(`[name="${prefix}sensor"]`)?.value || '',
        sensorId,
    };
}

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
function parseSensorItemList(form, opts = {}) {
    const { rowClass = 'sensor-item', parseExtraFields } = opts;
    const items = [];
    form.querySelectorAll(`.${rowClass}`).forEach(el => {
        const idx = parseIntegerOrDefault(el.dataset.idx, NaN);
        if (!Number.isFinite(idx)) return; // skip malformed rows
        const binding = parseSensorBindingFields(form, { fieldPrefix: `item-${idx}-` });
        const extra = parseExtraFields ? parseExtraFields(el, idx) : {};
        items.push({ ...binding, ...extra });
    });
    return items;
}

function getSensorNameFromBinding(binding = {}) {
    return binding.sensor || binding.name || '';
}

function sensorItemMatchesUpdate(item = {}, sensorName, ctx = null) {
    if (getSensorNameFromBinding(item) !== sensorName) return false;
    if (ctx?.serverId && item.serverId && ctx.serverId !== item.serverId) return false;
    if (ctx?.objectName && item.objectName && ctx.objectName !== item.objectName) return false;
    return true;
}

function updateSensorItemsByName(items = [], sensorName, ctx = null, updateItem) {
    items.forEach((item, idx) => {
        if (sensorItemMatchesUpdate(item, sensorName, ctx)) {
            updateItem(item, idx);
        }
    });
}

function getSensorNamesFromItems(items = []) {
    return items.map(getSensorNameFromBinding).filter(Boolean);
}

// initSensorBindingHandlers — wires combobox IONC@server + sensor autocomplete.
// Идемпотентен через form.dataset[flagKey].
//
// При смене hidden objectName/serverId (через pickItem combo'а) — sensor input
// сбрасывается через ac.resetOnObjectChange() (контракт сохранён).
function initSensorBindingHandlers(form, config = {}, opts = {}) {
    const prefix = opts.fieldPrefix || '';
    const flagKey = `sensorBinding_${prefix.replace(/[^a-z0-9]/gi, '_')}_wired`;
    if (form.dataset[flagKey] === 'true') return null;
    form.dataset[flagKey] = 'true';

    const hiddenServer = form.querySelector(`[name="${prefix}serverId"]`);
    const hiddenObject = form.querySelector(`[name="${prefix}objectName"]`);
    const sensorInput  = form.querySelector(`[name="${prefix}sensor"]`);
    const hiddenIdInput = form.querySelector(`[name="${prefix}sensorId"]`);
    if (!hiddenServer || !hiddenObject || !sensorInput || !hiddenIdInput) return null;

    setupIONCComboAutocomplete(form, prefix);

    const ac = setupSensorAutocomplete(
        sensorInput,
        hiddenIdInput,
        () => hiddenObject.value,
        () => hiddenServer.value
    );

    hiddenServer.addEventListener('change', () => {
        if (ac && typeof ac.resetOnObjectChange === 'function') ac.resetOnObjectChange();
    });
    hiddenObject.addEventListener('change', () => {
        if (ac && typeof ac.resetOnObjectChange === 'function') ac.resetOnObjectChange();
    });

    return {
        resetSensor() {
            if (ac && typeof ac.resetOnObjectChange === 'function') ac.resetOnObjectChange();
        },
    };
}

// Wire'ит add/remove кнопки + per-item handlers + pre-fill server/object из last item.
//
// opts:
//   addBtnSelector       — CSS селектор кнопки "+ Add"
//   containerSelector    — CSS селектор контейнера, куда добавляются rows
//   rowClass             — CSS класс одной row (default 'sensor-item')
//   defaultExtras        — function(): дефолты для extra-полей нового item
//   renderRow            — function({ idx, item }): HTML новой row (типично — re-export из widget'а)
//   parseExtraFields     — function(itemEl, idx): обязательная функция parsing'а extra-полей
function initSensorItemListHandlers(form, config = {}, opts = {}) {
    const {
        addBtnSelector,
        containerSelector,
        rowClass = 'sensor-item',
        defaultExtras = () => ({}),
        renderRow,
        parseExtraFields,
    } = opts;

    // dataset.* нормализует hyphens в camelCase, но прямой [key]= с hyphen
    // выкидывает 'is not a valid property name' — sanitize до alnum/underscore.
    const flagKey = `sensorItemList_${rowClass.replace(/[^a-z0-9]/gi, '_')}_wired`;
    if (form.dataset[flagKey] === 'true') return;
    form.dataset[flagKey] = 'true';

    const container = form.querySelector(containerSelector);
    const addBtn = form.querySelector(addBtnSelector);

    // Wire each existing row
    form.querySelectorAll(`.${rowClass}`).forEach(el => {
        const idx = parseIntegerOrDefault(el.dataset.idx, NaN);
        if (!Number.isFinite(idx)) return;
        initSensorBindingHandlers(form, config?.items?.[idx] || {}, { fieldPrefix: `item-${idx}-` });
    });

    // nextIdx — max(existing data-idx) + 1. Берём из DOM, а не из config.items.length:
    // для новых widget'ов (showWidgetConfig(null, type)) config = {}, но getConfigForm
    // дефолтит первую row → counted from DOM iff config.items пуст.
    let nextIdx = 0;
    container?.querySelectorAll(`.${rowClass}`).forEach(el => {
        const i = parseIntegerOrDefault(el.dataset.idx, NaN);
        if (Number.isFinite(i) && i + 1 > nextIdx) nextIdx = i + 1;
    });

    addBtn?.addEventListener('click', () => {
        const idx = nextIdx++;
        // Pre-fill server+object из last visible row.
        const existing = parseSensorItemList(form, { rowClass, parseExtraFields });
        const last = existing[existing.length - 1];
        let prefilled = { serverId: last?.serverId || '', objectName: last?.objectName || 'SharedMemory' };
        if (!prefilled.serverId) {
            prefilled.serverId = getFirstConnectedServerId() || '';
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
    // Legacy chart configs хранят имя в b.name (см. config/dashboards/system-overview.json),
    // современные — в b.sensor. Читаем из любого поля; пишем в b.sensor (canonical) и
    // зеркалим в b.name (back-compat: ChartWidget runtime читает sensor.name).
    const resolve = (b, idField = 'sensorId') => {
        const sensorName = b?.sensor || b?.name;
        if (!sensorName) return false;
        if (b.serverId && b.objectName && Number.isFinite(b[idField])) return false; // already full
        const info = lookup(sensorName);
        if (!info) return false;
        let touched = false;
        if (!b.serverId)   { b.serverId = info.serverId;   touched = true; }
        if (!b.objectName) { b.objectName = info.objectName; touched = true; }
        if (!Number.isFinite(b[idField]) && Number.isFinite(info.sensorId)) {
            b[idField] = info.sensorId; touched = true;
        }
        // Normalize: гарантируем оба поля для downstream consumers.
        if (!b.sensor) { b.sensor = sensorName; touched = true; }
        if (!b.name)   { b.name   = sensorName; touched = true; }
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
    globalThis.setupIONCComboAutocomplete = setupIONCComboAutocomplete;
    globalThis.renderSensorBindingFields = renderSensorBindingFields;
    globalThis.parseSensorBindingFields  = parseSensorBindingFields;
    globalThis.renderLabelField          = renderLabelField;
    globalThis.parseLabelField           = parseLabelField;
    globalThis.renderSensorItemRow       = renderSensorItemRow;
    globalThis.parseSensorItemList       = parseSensorItemList;
    globalThis.sensorItemMatchesUpdate   = sensorItemMatchesUpdate;
    globalThis.updateSensorItemsByName   = updateSensorItemsByName;
    globalThis.getSensorNameFromBinding  = getSensorNameFromBinding;
    globalThis.getSensorNamesFromItems   = getSensorNamesFromItems;
    globalThis.initSensorBindingHandlers = initSensorBindingHandlers;
    globalThis.initSensorItemListHandlers = initSensorItemListHandlers;
    globalThis._migrateBindingPure       = _migrateBindingPure;
    globalThis.ensureIONCRegistry = ensureIONCRegistry;
    globalThis.getIONCEntries     = getIONCEntries;
    globalThis.findIONCEntry      = findIONCEntry;
    globalThis.formatIONCComboValue = formatIONCComboValue;
}
