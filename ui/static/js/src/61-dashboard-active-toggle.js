// ============================================================================
// ToggleWidget — переключатель между двумя числовыми значениями (DI/DO/AI/AO).
// Слитая композиция: цвет track = feedback, позиция handle = command.
// Жёлтая граница при расхождении command vs feedback.
//
// Config:
//   sensor      — имя датчика (для отображения, autocomplete сохраняет имя)
//   sensorId    — числовой ID датчика (используется в writeValue)
//   objectName  — имя IONC-объекта (default 'SharedMemory')
//   valueOff    — числовое значение OFF (default 0)
//   valueOn     — числовое значение ON (default 1)
//   labelOff    — текстовая подпись OFF (default 'OFF')
//   labelOn     — текстовая подпись ON (default 'ON')
//   label       — заголовок виджета (default = имя датчика)
//   requireConfirmation — bool, наследуется от base
// ============================================================================

class ToggleWidget extends ActiveDashboardWidget {
    static type = 'toggle';
    static displayName = 'Toggle';
    static description = 'Two-state switch (writes to digital or analog sensor)';
    static icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="10" rx="5"/><circle cx="16" cy="12" r="3" fill="currentColor"/></svg>';
    static defaultSize = { width: 3, height: 2 };
    static minSize = { width: 2, height: 2 };
    static maxSize = { width: 6, height: 3 };

    // === Render ===
    render() {
        const label = this.config?.label || this.config?.sensor || 'Toggle';

        this.element = document.createElement('div');
        this.element.className = 'widget-content toggle-widget';
        this.element.innerHTML = `
            <div class="toggle-name" data-test="name">${escapeHtml(label)}</div>
            <div class="toggle-track" data-test="track" data-handle-pos="left">
                <div class="toggle-handle"></div>
            </div>
            <div class="toggle-state-text" data-test="state-text">${escapeHtml(this._currentLabel())}</div>
        `;
        this.container.appendChild(this.element);

        this.element.querySelector('[data-test="track"]').addEventListener('click', () => this.onClick());

        // Initial state — отрисовать по текущим feedback/command (могут быть null).
        this.renderFeedback();
        this.renderCommand();
    }

    // Возвращает labelOn если current value считается ON, иначе labelOff.
    _currentLabel() {
        const labelOff = this.config?.labelOff || 'OFF';
        const labelOn = this.config?.labelOn || 'ON';
        const current = this.commandValue ?? this.feedbackValue;
        return current === this.config?.valueOn ? labelOn : labelOff;
    }

    onClick() {
        // Если widget не интерактивен — клик игнорируется (writeValue сам это знает,
        // но мы ещё не проходим path validation если просто вернём ничего).
        if (!this.isInteractive()) return;
        const valueOff = this.config?.valueOff ?? 0;
        const valueOn = this.config?.valueOn ?? 1;
        const current = this.commandValue ?? this.feedbackValue;
        const next = current === valueOn ? valueOff : valueOn;
        this.writeValue(next);
    }

    renderCommand() {
        const track = this.element?.querySelector('[data-test="track"]');
        if (!track) return;
        const valueOn = this.config?.valueOn ?? 1;
        // Position: командная (если есть command) — приоритет; иначе по feedback.
        const refValue = this.commandValue ?? this.feedbackValue;
        track.dataset.handlePos = refValue === valueOn ? 'right' : 'left';

        // diverge: если command есть и НЕ совпадает с feedback (включая unknown).
        const diverges = this.commandValue !== null
            && this.commandValue !== undefined
            && this.commandValue !== this.feedbackValue;
        track.classList.toggle('diverge', !!diverges);

        // Update state text (cmd-side).
        const stateText = this.element?.querySelector('[data-test="state-text"]');
        if (stateText) stateText.textContent = this._currentLabel();
    }

    renderFeedback() {
        const track = this.element?.querySelector('[data-test="track"]');
        if (!track) return;
        const valueOff = this.config?.valueOff ?? 0;
        const valueOn = this.config?.valueOn ?? 1;

        track.classList.remove('fb-on', 'fb-off', 'fb-unknown');
        if (this.feedbackValue === valueOn) {
            track.classList.add('fb-on');
        } else if (this.feedbackValue === valueOff) {
            track.classList.add('fb-off');
        } else {
            track.classList.add('fb-unknown');
        }

        // Tooltip с фактическим числовым значением (для unknown — особенно полезно).
        if (this.feedbackValue !== null && this.feedbackValue !== undefined) {
            track.title = `actual: ${this.feedbackValue}`;
        }

        // Re-evaluate diverge after feedback update.
        this.renderCommand();
    }

    // === Config form ===

    static getActiveConfigFields(config = {}) {
        return `
            <div class="widget-config-field">
                <label>IONC Object</label>
                <select class="widget-input" name="objectName" data-test="cfg-objectName">
                    <option value="${escapeHtml(config.objectName || 'SharedMemory')}" selected>${escapeHtml(config.objectName || 'SharedMemory')}</option>
                </select>
                <small style="color:#6b7280">список загружается из /api/objects?type=IONotifyController</small>
            </div>
            <div class="widget-config-field">
                <label>Sensor (autocomplete)</label>
                <input type="text" class="widget-input" name="sensor" autocomplete="off"
                       value="${escapeHtml(config.sensor || '')}" data-test="cfg-sensor">
                <input type="hidden" name="sensorId" value="${config.sensorId ?? ''}" data-test="cfg-sensorId">
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>valueOff</label>
                    <input type="number" class="widget-input" name="valueOff"
                           value="${config.valueOff ?? 0}" data-test="cfg-valueOff">
                </div>
                <div class="widget-config-field">
                    <label>valueOn</label>
                    <input type="number" class="widget-input" name="valueOn"
                           value="${config.valueOn ?? 1}" data-test="cfg-valueOn">
                </div>
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>labelOff</label>
                    <input type="text" class="widget-input" name="labelOff"
                           value="${escapeHtml(config.labelOff || '')}" placeholder="OFF" data-test="cfg-labelOff">
                </div>
                <div class="widget-config-field">
                    <label>labelOn</label>
                    <input type="text" class="widget-input" name="labelOn"
                           value="${escapeHtml(config.labelOn || '')}" placeholder="ON" data-test="cfg-labelOn">
                </div>
            </div>
        `;
    }

    static initConfigHandlers(form, config = {}) {
        // Populate IONC Object dropdown.
        const objectSelect = form.querySelector('[name="objectName"]');
        const sensorInput = form.querySelector('[name="sensor"]');
        const hiddenIdInput = form.querySelector('[name="sensorId"]');
        if (!objectSelect || !sensorInput || !hiddenIdInput) return;

        // Resolve serverId for the dropdown — use first connected (same default
        // как в _resolveServerId() базового класса).
        let serverId = '';
        for (const [id, srv] of state.servers) {
            if (srv.connected) { serverId = id; break; }
        }

        // Fetch IONC objects list.
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
                    // Если currentValue нет в списке — добавим как disabled
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

        // Setup autocomplete on sensor input.
        const ac = setupSensorAutocomplete(
            sensorInput,
            hiddenIdInput,
            () => objectSelect.value,
            () => serverId
        );

        // Reset sensor when object changes.
        objectSelect.addEventListener('change', () => {
            if (ac && typeof ac.resetOnObjectChange === 'function') {
                ac.resetOnObjectChange();
            }
        });
    }

    static parseConfigForm(form) {
        // Override base parseConfigForm to use sensor name + sensorId field.
        const labelInput = form.querySelector('[name="label"]');
        const requireConfInput = form.querySelector('[name="requireConfirmation"]');
        return {
            sensor:      form.querySelector('[name="sensor"]')?.value || '',
            sensorId:    parseInt(form.querySelector('[name="sensorId"]')?.value, 10) || null,
            objectName:  form.querySelector('[name="objectName"]')?.value || 'SharedMemory',
            valueOff:    Number(form.querySelector('[name="valueOff"]')?.value ?? 0),
            valueOn:     Number(form.querySelector('[name="valueOn"]')?.value ?? 1),
            labelOff:    form.querySelector('[name="labelOff"]')?.value || '',
            labelOn:     form.querySelector('[name="labelOn"]')?.value || '',
            label:       labelInput?.value || '',
            requireConfirmation: requireConfInput?.checked || false,
        };
    }
}

window.ToggleWidget = ToggleWidget;
