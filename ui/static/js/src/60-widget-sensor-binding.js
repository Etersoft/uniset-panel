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

if (typeof globalThis !== 'undefined') {
    globalThis.renderSensorBindingFields = renderSensorBindingFields;
    globalThis.parseSensorBindingFields  = parseSensorBindingFields;
    globalThis.renderSensorItemRow       = renderSensorItemRow;
    globalThis.parseSensorItemList       = parseSensorItemList;
}
