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
        const idx = parseInt(el.dataset.idx, 10);
        if (!Number.isFinite(idx)) return; // skip malformed rows
        const binding = parseSensorBindingFields(form, { fieldPrefix: `item-${idx}-` });
        const extra = parseExtraFields ? parseExtraFields(el, idx) : {};
        items.push({ ...binding, ...extra });
    });
    return items;
}

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

    const flagKey = `sensorItemList_${rowClass}_wired`;
    if (form.dataset[flagKey] === 'true') return;
    form.dataset[flagKey] = 'true';

    const container = form.querySelector(containerSelector);
    const addBtn = form.querySelector(addBtnSelector);

    // Wire each existing row
    form.querySelectorAll(`.${rowClass}`).forEach(el => {
        const idx = parseInt(el.dataset.idx, 10);
        if (!Number.isFinite(idx)) return;
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
    globalThis.renderSensorBindingFields = renderSensorBindingFields;
    globalThis.parseSensorBindingFields  = parseSensorBindingFields;
    globalThis.renderSensorItemRow       = renderSensorItemRow;
    globalThis.parseSensorItemList       = parseSensorItemList;
    globalThis.initSensorBindingHandlers = initSensorBindingHandlers;
    globalThis.initSensorItemListHandlers = initSensorItemListHandlers;
}
