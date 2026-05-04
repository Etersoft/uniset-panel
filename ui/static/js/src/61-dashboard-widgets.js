// ============================================================================
// Level Widget (CSS + SVG)
// ============================================================================

class LevelWidget extends DashboardWidget {
    static type = 'level';
    static usesNewSensorAutocomplete = true;
    static displayName = 'Level';
    static description = 'Tank level indicator';
    static icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="2" width="12" height="20" rx="2"/><rect x="8" y="10" width="8" height="10" fill="currentColor" opacity="0.3"/></svg>';
    static defaultSize = { width: 8, height: 8 };

    render() {
        const { orientation = 'vertical', unit = '%' } = this.config;
        const isVertical = orientation === 'vertical';

        this.element = document.createElement('div');
        this.element.className = 'widget-content';
        this.element.innerHTML = `
            <div class="level-container">
                <div class="level-bar-${isVertical ? 'vertical' : 'horizontal'}">
                    <div class="level-fill-${isVertical ? 'vertical' : 'horizontal'}" id="level-fill-${this.id}"></div>
                    <span class="level-text" id="level-text-${this.id}">--%</span>
                </div>
            </div>
        `;
        this.container.appendChild(this.element);

        this.fillEl = this.element.querySelector(`#level-fill-${this.id}`);
        this.textEl = this.element.querySelector(`#level-text-${this.id}`);
    }

    getColorForValue(value) {
        return DashboardWidget.getColorForZones(value, this.config.zones);
    }

    update(value, error = null) {
        super.update(value, error);

        if (!this.fillEl || !this.textEl) return;

        if (error) {
            this.textEl.textContent = 'ERR';
            return;
        }

        const { min = WIDGET_DEFAULT_MIN, max = WIDGET_DEFAULT_MAX, orientation = 'vertical', unit = '%', decimals = 0 } = this.config;
        const numValue = parseNumberOrDefault(value, 0);
        const percent = percentInRange(numValue, min, max, 100);

        const isVertical = orientation === 'vertical';
        if (isVertical) {
            this.fillEl.style.height = `${percent}%`;
        } else {
            this.fillEl.style.width = `${percent}%`;
        }

        this.fillEl.style.backgroundColor = this.getColorForValue(numValue);
        this.textEl.textContent = `${numValue.toFixed(decimals)}${unit}`;
    }

    static getConfigForm(config = {}) {
        const zones = config.zones || [];
        return `
            ${renderSensorBindingFields(config, { fieldPrefix: '' })}
            ${renderLabelField(config)}
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>Min</label>
                    <input type="number" class="widget-input" name="min" value="${config.min ?? WIDGET_DEFAULT_MIN}">
                </div>
                <div class="widget-config-field">
                    <label>Max</label>
                    <input type="number" class="widget-input" name="max" value="${config.max ?? WIDGET_DEFAULT_MAX}">
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
                ${renderColorZonesEditor(zones, '#3b82f6')}
            </div>
        `;
    }

    static parseConfigForm(form) {
        const zones = parseColorZones(form);
        return {
            ...parseSensorBindingFields(form, { fieldPrefix: '' }),
            label: form.querySelector('[name="label"]')?.value || '',
            min: parseNumberOrDefault(form.querySelector('[name="min"]')?.value, WIDGET_DEFAULT_MIN),
            max: parseNumberOrDefault(form.querySelector('[name="max"]')?.value, WIDGET_DEFAULT_MAX),
            orientation: form.querySelector('[name="orientation"]')?.value || 'vertical',
            unit: form.querySelector('[name="unit"]')?.value || '%',
            zones
        };
    }

    static initConfigHandlers(form, config = {}) {
        initSensorBindingHandlers(form, config, { fieldPrefix: '' });
    }
}

// ============================================================================
// LED Widget (CSS)
// ============================================================================

class LedWidget extends DashboardWidget {
    static type = 'led';
    static usesNewSensorAutocomplete = true;
    static displayName = 'LED';
    static description = 'On/Off indicator';
    static icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>';
    static defaultSize = { width: 4, height: 4 };

    render() {
        this.element = document.createElement('div');
        this.element.className = 'widget-content';
        this.element.innerHTML = `
            <div class="led-indicator" id="led-${this.id}"></div>
        `;
        this.container.appendChild(this.element);

        this.ledEl = this.element.querySelector(`#led-${this.id}`);
        this.updateLed(false, false);
    }

    updateLed(isOn, isError) {
        if (!this.ledEl) return;

        const { onColor = '#22c55e', offColor = '#6b7280', errorColor = '#ef4444', blinkOnError = true } = this.config;

        this.ledEl.classList.remove('led-on', 'led-blink');

        if (isError) {
            this.ledEl.style.backgroundColor = errorColor;
            this.ledEl.classList.add('led-on');
            if (blinkOnError) {
                this.ledEl.classList.add('led-blink');
            }
        } else if (isOn) {
            this.ledEl.style.backgroundColor = onColor;
            this.ledEl.style.color = onColor;
            this.ledEl.classList.add('led-on');
        } else {
            this.ledEl.style.backgroundColor = offColor;
            this.ledEl.style.color = offColor;
        }
    }

    update(value, error = null) {
        super.update(value, error);

        const { threshold = 0 } = this.config;
        const numValue = parseNumberOrDefault(value, 0);
        const isOn = numValue > threshold;

        this.updateLed(isOn, !!error);
    }

    static getConfigForm(config = {}) {
        return `
            ${renderSensorBindingFields(config, { fieldPrefix: '' })}
            ${renderLabelField(config)}
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
            threshold: parseNumberOrDefault(form.querySelector('[name="threshold"]')?.value, 0),
            onColor: form.querySelector('[name="onColor"]')?.value || '#22c55e',
            offColor: form.querySelector('[name="offColor"]')?.value || '#6b7280',
            errorColor: form.querySelector('[name="errorColor"]')?.value || '#ef4444',
            blinkOnError: form.querySelector('[name="blinkOnError"]')?.checked !== false
        };
    }

    static initConfigHandlers(form, config = {}) {
        initSensorBindingHandlers(form, config, { fieldPrefix: '' });
    }
}

// ============================================================================
// Label Widget (static text)
// ============================================================================

class LabelWidget extends DashboardWidget {
    static type = 'label';
    static displayName = 'Label';
    static description = 'Static text label or header';
    static icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><text x="12" y="16" text-anchor="middle" font-size="14" fill="currentColor">Aa</text></svg>';
    static defaultSize = { width: 8, height: 2 };

    render() {
        const {
            text = 'Label',
            fontSize = 'medium',
            color = '#d8dce2',
            align = 'center',
            border = false,
            borderColor = '#4b5563',
            borderWidth = 1,
            borderRadius = 4,
            backgroundColor = 'transparent'
        } = this.config;

        // Font size map
        const fontSizeMap = {
            'small': '14px',
            'medium': '18px',
            'large': '24px',
            'xlarge': '32px'
        };

        // Border styles
        const borderStyle = border
            ? `border: ${borderWidth}px solid ${borderColor}; border-radius: ${borderRadius}px; background: ${backgroundColor};`
            : '';

        this.element = document.createElement('div');
        this.element.className = 'widget-content label-widget';
        this.element.innerHTML = `
            <div class="label-text" id="label-${this.id}"
                 style="font-size: ${fontSizeMap[fontSize] || fontSize};
                        color: ${color};
                        text-align: ${align};
                        font-weight: 600;
                        display: flex;
                        align-items: center;
                        justify-content: ${align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center'};
                        height: 100%;
                        padding: ${border ? '4px 12px' : '0 8px'};
                        ${borderStyle}">
                ${escapeHtml(text)}
            </div>
        `;
        this.container.appendChild(this.element);
        this.labelEl = this.element.querySelector(`#label-${this.id}`);
    }

    // Label doesn't need sensor updates, but we need the method for compatibility
    update(value, error = null) {
        // No-op - label is static
    }

    static getConfigForm(config = {}) {
        return `
            <div class="widget-config-field">
                <label>Text</label>
                <input type="text" class="widget-input" name="text"
                       value="${escapeAttr(config.text || '')}" placeholder="Label text">
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>Font Size</label>
                    <select class="widget-select" name="fontSize">
                        <option value="small" ${config.fontSize === 'small' ? 'selected' : ''}>Small (14px)</option>
                        <option value="medium" ${config.fontSize === 'medium' || !config.fontSize ? 'selected' : ''}>Medium (18px)</option>
                        <option value="large" ${config.fontSize === 'large' ? 'selected' : ''}>Large (24px)</option>
                        <option value="xlarge" ${config.fontSize === 'xlarge' ? 'selected' : ''}>X-Large (32px)</option>
                    </select>
                </div>
                <div class="widget-config-field">
                    <label>Alignment</label>
                    <select class="widget-select" name="align">
                        <option value="left" ${config.align === 'left' ? 'selected' : ''}>Left</option>
                        <option value="center" ${config.align === 'center' || !config.align ? 'selected' : ''}>Center</option>
                        <option value="right" ${config.align === 'right' ? 'selected' : ''}>Right</option>
                    </select>
                </div>
                <div class="widget-config-field">
                    <label>Text Color</label>
                    <input type="color" class="widget-input" name="color"
                           value="${config.color || '#d8dce2'}">
                </div>
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label class="widget-checkbox-label">
                        <input type="checkbox" name="border" ${config.border ? 'checked' : ''}>
                        <span>Show border (nameplate)</span>
                    </label>
                </div>
            </div>
            <div class="widget-config-row label-border-options" style="${config.border ? '' : 'display: none;'}">
                <div class="widget-config-field">
                    <label>Border Color</label>
                    <input type="color" class="widget-input" name="borderColor"
                           value="${config.borderColor || '#4b5563'}">
                </div>
                <div class="widget-config-field">
                    <label>Border Width</label>
                    <input type="number" class="widget-input" name="borderWidth"
                           value="${config.borderWidth || 1}" min="1" max="5">
                </div>
                <div class="widget-config-field">
                    <label>Border Radius</label>
                    <input type="number" class="widget-input" name="borderRadius"
                           value="${config.borderRadius ?? 4}" min="0" max="20">
                </div>
                <div class="widget-config-field">
                    <label>Background</label>
                    <input type="color" class="widget-input" name="backgroundColor"
                           value="${config.backgroundColor || '#1f2937'}">
                </div>
            </div>
        `;
    }

    static initConfigHandlers(form, config = {}) {
        const borderCheckbox = form.querySelector('[name="border"]');
        const borderOptions = form.querySelector('.label-border-options');

        borderCheckbox?.addEventListener('change', () => {
            if (borderOptions) {
                borderOptions.style.display = borderCheckbox.checked ? '' : 'none';
            }
        });
    }

    static parseConfigForm(form) {
        return {
            text: form.querySelector('[name="text"]')?.value || 'Label',
            fontSize: form.querySelector('[name="fontSize"]')?.value || 'medium',
            align: form.querySelector('[name="align"]')?.value || 'center',
            color: form.querySelector('[name="color"]')?.value || '#d8dce2',
            border: form.querySelector('[name="border"]')?.checked || false,
            borderColor: form.querySelector('[name="borderColor"]')?.value || '#4b5563',
            borderWidth: parseIntegerOrDefault(form.querySelector('[name="borderWidth"]')?.value, 1),
            borderRadius: parseIntegerOrDefault(form.querySelector('[name="borderRadius"]')?.value, 4),
            backgroundColor: form.querySelector('[name="backgroundColor"]')?.value || '#1f2937'
        };
    }
}

// ============================================================================
// Divider Widget (visual separator)
// ============================================================================

class DividerWidget extends DashboardWidget {
    static type = 'divider';
    static displayName = 'Divider';
    static description = 'Horizontal or vertical separator line';
    static icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="12" x2="20" y2="12"/></svg>';
    static defaultSize = { width: 12, height: 1 };

    render() {
        const {
            orientation = 'horizontal',
            color = '#4b5563',
            thickness = 1,
            style = 'solid',
            margin = 8
        } = this.config;

        const isHorizontal = orientation === 'horizontal';

        this.element = document.createElement('div');
        this.element.className = 'widget-content divider-widget';
        this.element.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            padding: ${isHorizontal ? `${margin}px 0` : `0 ${margin}px`};
        `;

        const line = document.createElement('div');
        line.className = 'divider-line';
        line.style.cssText = isHorizontal
            ? `width: 100%; height: ${thickness}px; border-top: ${thickness}px ${style} ${color};`
            : `height: 100%; width: ${thickness}px; border-left: ${thickness}px ${style} ${color};`;

        this.element.appendChild(line);
        this.container.appendChild(this.element);
    }

    // Divider doesn't need updates
    update(value, error = null) {}

    static getConfigForm(config = {}) {
        return `
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>Orientation</label>
                    <select class="widget-select" name="orientation">
                        <option value="horizontal" ${config.orientation !== 'vertical' ? 'selected' : ''}>Horizontal</option>
                        <option value="vertical" ${config.orientation === 'vertical' ? 'selected' : ''}>Vertical</option>
                    </select>
                </div>
                <div class="widget-config-field">
                    <label>Style</label>
                    <select class="widget-select" name="style">
                        <option value="solid" ${config.style !== 'dashed' && config.style !== 'dotted' ? 'selected' : ''}>Solid</option>
                        <option value="dashed" ${config.style === 'dashed' ? 'selected' : ''}>Dashed</option>
                        <option value="dotted" ${config.style === 'dotted' ? 'selected' : ''}>Dotted</option>
                    </select>
                </div>
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>Thickness (px)</label>
                    <input type="number" class="widget-input" name="thickness"
                           value="${config.thickness || 1}" min="1" max="10">
                </div>
                <div class="widget-config-field">
                    <label>Margin (px)</label>
                    <input type="number" class="widget-input" name="margin"
                           value="${config.margin ?? 8}" min="0" max="50">
                </div>
                <div class="widget-config-field">
                    <label>Color</label>
                    <input type="color" class="widget-input" name="color"
                           value="${config.color || '#4b5563'}">
                </div>
            </div>
        `;
    }

    static parseConfigForm(form) {
        return {
            orientation: form.querySelector('[name="orientation"]')?.value || 'horizontal',
            style: form.querySelector('[name="style"]')?.value || 'solid',
            thickness: parseIntegerOrDefault(form.querySelector('[name="thickness"]')?.value, 1),
            margin: parseIntegerOrDefault(form.querySelector('[name="margin"]')?.value, 8),
            color: form.querySelector('[name="color"]')?.value || '#4b5563'
        };
    }
}

// ============================================================================
// StatusBar Widget (multiple status indicators)
// ============================================================================

class StatusBarWidget extends DashboardWidget {
    static type = 'statusbar';
    static usesNewSensorAutocomplete = true;
    static displayName = 'Status Bar';
    static description = 'Multiple status indicators in a row';
    static icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="5" cy="12" r="3" fill="#22c55e"/><circle cx="12" cy="12" r="3" fill="#ef4444"/><circle cx="19" cy="12" r="3" fill="#6b7280"/></svg>';
    static defaultSize = { width: 12, height: 3 };

    constructor(id, config, container) {
        super(id, config, container);
        this.indicators = new Map();
    }

    render() {
        const { items = [], layout = 'horizontal' } = this.config;

        this.element = document.createElement('div');
        this.element.className = 'widget-content statusbar-widget';
        this.element.style.cssText = `
            display: flex;
            flex-direction: ${layout === 'vertical' ? 'column' : 'row'};
            align-items: center;
            justify-content: space-around;
            gap: 12px;
            padding: 8px 16px;
            height: 100%;
        `;

        items.forEach((item, idx) => {
            const indicator = this.createIndicator(item, idx);
            this.element.appendChild(indicator);
        });

        this.container.appendChild(this.element);
    }

    createIndicator(item, idx) {
        const { label = `Status ${idx + 1}`, onColor = '#22c55e', offColor = '#6b7280' } = item;

        const el = document.createElement('div');
        el.className = 'statusbar-indicator';
        el.style.cssText = `
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
        `;

        const led = document.createElement('div');
        led.className = 'statusbar-led';
        led.style.cssText = `
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: ${offColor};
            box-shadow: 0 0 4px ${offColor};
            transition: all 0.3s ease;
        `;

        const labelEl = document.createElement('div');
        labelEl.className = 'statusbar-label';
        labelEl.style.cssText = `
            font-size: 11px;
            color: #9ca3af;
            text-align: center;
            white-space: nowrap;
        `;
        labelEl.textContent = label;

        el.appendChild(led);
        el.appendChild(labelEl);

        this.indicators.set(idx, { element: el, led, item });

        return el;
    }

    // Update specific indicator by index
    updateIndicator(idx, value, error = null) {
        const indicator = this.indicators.get(idx);
        if (!indicator) return;

        const { item, led } = indicator;
        const {
            threshold = STATUS_WIDGET_DEFAULT_THRESHOLD,
            onColor = '#22c55e',
            offColor = '#6b7280',
            errorColor = '#ef4444'
        } = item;

        if (error) {
            led.style.background = errorColor;
            led.style.boxShadow = `0 0 8px ${errorColor}`;
        } else {
            const isOn = value > threshold;
            const color = isOn ? onColor : offColor;
            led.style.background = color;
            led.style.boxShadow = isOn ? `0 0 8px ${color}` : `0 0 4px ${color}`;
        }
    }

    // Main update - expects object with sensor values by name
    update(values, error = null) {
        if (typeof values === 'object' && values !== null) {
            const { items = [] } = this.config;
            items.forEach((item, idx) => {
                if (item.sensor && values[item.sensor] !== undefined) {
                    this.updateIndicator(idx, values[item.sensor], error);
                }
            });
        }
    }

    // Update by sensor name (called from SSE handler).
    // ctx — { serverId, objectName, sensorName } для отбраковки коллизий имён
    // на разных (server, object) парах. Если у item полный triplet — match
    // строгий; если у item только sensor — соответствие по имени (legacy).
    updateBySensor(sensorName, value, error = null, ctx = null) {
        const { items = [] } = this.config;
        updateSensorItemsByName(items, sensorName, ctx, (item, idx) => {
            this.updateIndicator(idx, value, error);
        });
    }

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
                           value="${item.threshold ?? STATUS_WIDGET_DEFAULT_THRESHOLD}" step="0.1">
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
            defaultExtras: () => ({
                label: '',
                threshold: STATUS_WIDGET_DEFAULT_THRESHOLD,
                onColor: '#22c55e',
                offColor: '#6b7280'
            }),
            renderRow: StatusBarWidget._renderItemRow,
            parseExtraFields: (el, idx) => StatusBarWidget.parseItemExtraFields(form, idx),
        });
    }

    static parseItemExtraFields(form, idx) {
        return {
            label: form.querySelector(`[name="item-${idx}-label"]`)?.value || '',
            threshold: parseNumberOrDefault(
                form.querySelector(`[name="item-${idx}-threshold"]`)?.value,
                STATUS_WIDGET_DEFAULT_THRESHOLD
            ),
            onColor: form.querySelector(`[name="item-${idx}-onColor"]`)?.value || '#22c55e',
            offColor: form.querySelector(`[name="item-${idx}-offColor"]`)?.value || '#6b7280',
        };
    }

    static parseConfigForm(form) {
        const items = parseSensorItemList(form, {
            rowClass: 'statusbar-item',
            parseExtraFields: (el, idx) => StatusBarWidget.parseItemExtraFields(form, idx),
        });
        return {
            layout: form.querySelector('[name="layout"]')?.value || 'horizontal',
            items
        };
    }
}

// ============================================================================
// BarGraph Widget (compare multiple values)
// ============================================================================

class BarGraphWidget extends DashboardWidget {
    static type = 'bargraph';
    static usesNewSensorAutocomplete = true;
    static displayName = 'Bar Graph';
    static description = 'Compare multiple sensor values';
    static icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="14" width="4" height="6" fill="currentColor" opacity="0.7"/><rect x="10" y="8" width="4" height="12" fill="currentColor" opacity="0.5"/><rect x="16" y="4" width="4" height="16" fill="currentColor" opacity="0.3"/></svg>';
    static defaultSize = { width: 10, height: 6 };

    constructor(id, config, container) {
        super(id, config, container);
        this.bars = new Map();
    }

    render() {
        const { orientation = 'vertical', showValues = true, showLabels = true } = this.config;
        const items = this.config.items || [];

        this.element = document.createElement('div');
        this.element.className = 'widget-content bargraph-widget';
        this.element.style.cssText = `
            display: flex;
            flex-direction: ${orientation === 'horizontal' ? 'column' : 'row'};
            align-items: stretch;
            justify-content: space-around;
            gap: 8px;
            padding: 12px;
            height: 100%;
        `;

        items.forEach((item, idx) => {
            const bar = this.createBar(item, idx, orientation, showValues, showLabels);
            this.element.appendChild(bar);
        });

        this.container.appendChild(this.element);
    }

    createBar(item, idx, orientation, showValues, showLabels) {
        const { label = `Bar ${idx + 1}`, color = '#3b82f6', min = WIDGET_DEFAULT_MIN, max = WIDGET_DEFAULT_MAX } = item;
        const isVertical = orientation === 'vertical';

        const barContainer = document.createElement('div');
        barContainer.className = 'bargraph-bar-container';
        barContainer.style.cssText = `
            display: flex;
            flex-direction: ${isVertical ? 'column' : 'row'};
            align-items: center;
            flex: 1;
            gap: 4px;
        `;

        // Label at top/left
        if (showLabels) {
            const labelEl = document.createElement('div');
            labelEl.className = 'bargraph-label';
            labelEl.style.cssText = `
                font-size: 11px;
                color: #9ca3af;
                text-align: center;
                white-space: nowrap;
                ${isVertical ? '' : 'min-width: 50px;'}
            `;
            labelEl.textContent = label;
            barContainer.appendChild(labelEl);
        }

        // Bar track
        const track = document.createElement('div');
        track.className = 'bargraph-track';
        track.style.cssText = `
            ${isVertical ? 'width: 100%; height: 100%;' : 'flex: 1; height: 24px;'}
            background: rgba(255, 255, 255, 0.05);
            border-radius: 4px;
            position: relative;
            overflow: hidden;
            ${isVertical ? 'display: flex; flex-direction: column-reverse;' : ''}
        `;

        // Bar fill
        const fill = document.createElement('div');
        fill.className = 'bargraph-fill';
        fill.style.cssText = `
            background: ${color};
            border-radius: 4px;
            transition: all 0.3s ease;
            ${isVertical ? 'width: 100%; height: 0%;' : 'height: 100%; width: 0%;'}
        `;
        track.appendChild(fill);

        barContainer.appendChild(track);

        // Value at bottom/right
        if (showValues) {
            const valueEl = document.createElement('div');
            valueEl.className = 'bargraph-value';
            valueEl.style.cssText = `
                font-size: 12px;
                font-weight: 500;
                color: #d8dce2;
                text-align: center;
                min-width: 40px;
            `;
            valueEl.textContent = '—';
            barContainer.appendChild(valueEl);
        }

        this.bars.set(idx, { container: barContainer, fill, valueEl: barContainer.querySelector('.bargraph-value'), item });

        return barContainer;
    }

    // Update specific bar by index
    updateBar(idx, value) {
        const bar = this.bars.get(idx);
        if (!bar) return;

        const { item, fill, valueEl } = bar;
        const { min = WIDGET_DEFAULT_MIN, max = WIDGET_DEFAULT_MAX, unit = '', decimals = 0 } = item;
        const orientation = this.config.orientation || 'vertical';
        const isVertical = orientation === 'vertical';

        // Calculate percentage
        const percent = percentInRange(value, min, max, 100);

        // Update fill
        if (isVertical) {
            fill.style.height = `${percent}%`;
        } else {
            fill.style.width = `${percent}%`;
        }

        // Update value text. value может прийти из SSE строкой — без guard'а
        // value.toFixed бросал TypeError. Аналогично сделано в LevelWidget /
        // DigitalWidget.update.
        if (valueEl) {
            const numValue = typeof value === 'number' ? value : parseNumberOrDefault(value, 0);
            const displayValue = numValue.toFixed(decimals);
            valueEl.textContent = unit ? `${displayValue} ${unit}` : displayValue;
        }
    }

    // Main update - expects object with sensor values by name
    update(values, error = null) {
        if (typeof values === 'object' && values !== null) {
            const { items = [] } = this.config;
            items.forEach((item, idx) => {
                if (item.sensor && values[item.sensor] !== undefined) {
                    this.updateBar(idx, values[item.sensor]);
                }
            });
        }
    }

    // Update by sensor name (called from SSE handler).
    // См. StatusBarWidget.updateBySensor — тот же контракт ctx для multi-server.
    updateBySensor(sensorName, value, error = null, ctx = null) {
        const { items = [] } = this.config;
        updateSensorItemsByName(items, sensorName, ctx, (item, idx) => {
            this.updateBar(idx, value);
        });
    }

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
                    <input type="number" class="widget-input" name="item-${idx}-min" value="${item.min ?? WIDGET_DEFAULT_MIN}">
                </div>
                <div class="widget-config-field">
                    <label>Max</label>
                    <input type="number" class="widget-input" name="item-${idx}-max" value="${item.max ?? WIDGET_DEFAULT_MAX}">
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
        const items = config.items || [{ label: 'Bar 1', min: WIDGET_DEFAULT_MIN, max: WIDGET_DEFAULT_MAX, color: '#3b82f6' }];
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
                label: '', min: WIDGET_DEFAULT_MIN, max: WIDGET_DEFAULT_MAX, unit: '',
                color: colors[(colorIdx++) % colors.length],
            }),
            renderRow: BarGraphWidget._renderItemRow,
            parseExtraFields: (el, idx) => BarGraphWidget.parseItemExtraFields(form, idx),
        });
    }

    static parseItemExtraFields(form, idx) {
        return {
            label: form.querySelector(`[name="item-${idx}-label"]`)?.value || '',
            min: parseNumberOrDefault(form.querySelector(`[name="item-${idx}-min"]`)?.value, WIDGET_DEFAULT_MIN),
            max: parseNumberOrDefault(form.querySelector(`[name="item-${idx}-max"]`)?.value, WIDGET_DEFAULT_MAX),
            unit: form.querySelector(`[name="item-${idx}-unit"]`)?.value || '',
            color: form.querySelector(`[name="item-${idx}-color"]`)?.value || '#3b82f6',
        };
    }

    static parseConfigForm(form) {
        const items = parseSensorItemList(form, {
            rowClass: 'bargraph-item',
            parseExtraFields: (el, idx) => BarGraphWidget.parseItemExtraFields(form, idx),
        });
        return {
            orientation: form.querySelector('[name="orientation"]')?.value || 'vertical',
            showValues: form.querySelector('[name="showValues"]')?.checked !== false,
            showLabels: form.querySelector('[name="showLabels"]')?.checked !== false,
            items
        };
    }
}

// ============================================================================
// Digital Widget (CSS)
// ============================================================================

class DigitalWidget extends DashboardWidget {
    static type = 'digital';
    static usesNewSensorAutocomplete = true;
    static displayName = 'Digital';
    static description = 'Digital numeric display';
    static icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><text x="12" y="15" text-anchor="middle" font-size="8" fill="currentColor">123</text></svg>';
    static defaultSize = { width: 8, height: 4 };

    // 7-segment digit patterns: segments a,b,c,d,e,f,g (top, top-right, bottom-right, bottom, bottom-left, top-left, middle)
    static SEGMENT_PATTERNS = {
        '0': [1,1,1,1,1,1,0],
        '1': [0,1,1,0,0,0,0],
        '2': [1,1,0,1,1,0,1],
        '3': [1,1,1,1,0,0,1],
        '4': [0,1,1,0,0,1,1],
        '5': [1,0,1,1,0,1,1],
        '6': [1,0,1,1,1,1,1],
        '7': [1,1,1,0,0,0,0],
        '8': [1,1,1,1,1,1,1],
        '9': [1,1,1,1,0,1,1],
        '-': [0,0,0,0,0,0,1],
        ' ': [0,0,0,0,0,0,0],
        'E': [1,0,0,1,1,1,1],
        'R': [0,0,0,0,1,0,1],
        '.': 'dot',
        ':': 'colon'
    };

    render() {
        const { style = 'default' } = this.config;

        this.element = document.createElement('div');
        this.element.className = 'widget-content';

        switch (style) {
            case 'lcd':
                this.renderLCD();
                break;
            case 'led':
                this.renderLED();
                break;
            default:
                this.renderDefault();
        }

        this.container.appendChild(this.element);
    }

    renderDefault() {
        this.element.innerHTML = `
            <div class="digital-display" id="digital-${this.id}">----</div>
        `;
        this.displayEl = this.element.querySelector(`#digital-${this.id}`);
        const { color = '#22c55e' } = this.config;
        this.displayEl.style.color = color;
    }

    renderLCD() {
        const defs = `
            <linearGradient id="lcd-bg-${this.id}" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color:#c8d4c0"/>
                <stop offset="50%" style="stop-color:#b8c4b0"/>
                <stop offset="100%" style="stop-color:#a8b4a0"/>
            </linearGradient>`;
        this._renderSegmentDisplay({ flavor: 'lcd', defs, bgGradientId: `lcd-bg-${this.id}` });
    }

    renderLED() {
        const defs = `
            <filter id="led-glow-${this.id}" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="1.5" result="blur"/>
                <feMerge>
                    <feMergeNode in="blur"/>
                    <feMergeNode in="blur"/>
                    <feMergeNode in="SourceGraphic"/>
                </feMerge>
            </filter>
            <linearGradient id="led-bg-${this.id}" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color:#2a2a2a"/>
                <stop offset="50%" style="stop-color:#1a1a1a"/>
                <stop offset="100%" style="stop-color:#0a0a0a"/>
            </linearGradient>`;
        this._renderSegmentDisplay({ flavor: 'led', defs, bgGradientId: `led-bg-${this.id}` });
    }

    // Общий каркас 7-segment display: SVG с gradient'ом фоновой панели и
    // <g id="digital-digits-..."> для рендера цифр. Разница LCD vs LED — в
    // <defs> (flavor-specific filter/gradient) и в CSS-классах wrapper'а.
    // updateSegmentDisplay (общий метод) рисует цифры в digitsGroup.
    _renderSegmentDisplay({ flavor, defs, bgGradientId }) {
        const { digits = 6, unit = '' } = this.config;
        const totalDigits = digits + (unit ? 2 : 0);
        const viewBoxW = totalDigits * DIGITAL_DIGIT_SLOT_WIDTH + DIGITAL_VIEWBOX_PADDING;

        this.element.innerHTML = `
            <div class="digital-${flavor}-display" id="digital-${flavor}-${this.id}">
                <div class="digital-${flavor}-screen">
                    <svg class="digital-${flavor}-svg" id="digital-svg-${this.id}" viewBox="0 0 ${viewBoxW} ${DIGITAL_VIEWBOX_HEIGHT}">
                        <defs>${defs}</defs>
                        <rect x="0" y="0" width="100%" height="100%" fill="url(#${bgGradientId})" rx="4"/>
                        <g id="digital-digits-${this.id}" transform="translate(5, 6)"></g>
                    </svg>
                </div>
            </div>
        `;
        this.svgEl = this.element.querySelector(`#digital-svg-${this.id}`);
        this.digitsGroup = this.element.querySelector(`#digital-digits-${this.id}`);
        this.updateSegmentDisplay('----');
    }

    // Render a single 7-segment digit at position x
    renderDigit(char, x, isLCD = true) {
        const pattern = DigitalWidget.SEGMENT_PATTERNS[char];
        if (!pattern) return '';

        const { color = '#22c55e' } = this.config;

        // Handle special characters
        if (pattern === 'dot') {
            const onColor = isLCD ? '#3a4a3a' : color;
            const glowFilter = isLCD ? '' : `filter="url(#led-glow-${this.id})"`;
            return `<circle cx="${x + 4}" cy="33" r="2.5" fill="${onColor}" ${glowFilter}/>`;
        }
        if (pattern === 'colon') {
            const onColor = isLCD ? '#3a4a3a' : color;
            const glowFilter = isLCD ? '' : `filter="url(#led-glow-${this.id})"`;
            return `
                <circle cx="${x + 4}" cy="14" r="2" fill="${onColor}" ${glowFilter}/>
                <circle cx="${x + 4}" cy="26" r="2" fill="${onColor}" ${glowFilter}/>
            `;
        }

        // Segment colors
        const onColor = isLCD ? '#3a4a3a' : color;
        const offColor = isLCD ? 'rgba(58, 74, 58, 0.15)' : 'rgba(255, 255, 255, 0.03)';
        const glowFilter = isLCD ? '' : `filter="url(#led-glow-${this.id})"`;

        // Segment paths (relative to digit position)
        // Each digit is 20px wide, 36px tall
        const w = DIGITAL_SEGMENT_WIDTH;
        const h = DIGITAL_SEGMENT_HEIGHT;
        const t = DIGITAL_SEGMENT_THICKNESS;
        const segments = [
            // a - top horizontal
            `<polygon points="${x+2},0 ${x+w-2},0 ${x+w-4},${t} ${x+4},${t}" fill="${pattern[0] ? onColor : offColor}" ${pattern[0] ? glowFilter : ''}/>`,
            // b - top right vertical
            `<polygon points="${x+w},${2} ${x+w},${h/2-2} ${x+w-t},${h/2-4} ${x+w-t},${4}" fill="${pattern[1] ? onColor : offColor}" ${pattern[1] ? glowFilter : ''}/>`,
            // c - bottom right vertical
            `<polygon points="${x+w},${h/2+2} ${x+w},${h-2} ${x+w-t},${h-4} ${x+w-t},${h/2+4}" fill="${pattern[2] ? onColor : offColor}" ${pattern[2] ? glowFilter : ''}/>`,
            // d - bottom horizontal
            `<polygon points="${x+4},${h-t} ${x+w-4},${h-t} ${x+w-2},${h} ${x+2},${h}" fill="${pattern[3] ? onColor : offColor}" ${pattern[3] ? glowFilter : ''}/>`,
            // e - bottom left vertical
            `<polygon points="${x},${h/2+2} ${x+t},${h/2+4} ${x+t},${h-4} ${x},${h-2}" fill="${pattern[4] ? onColor : offColor}" ${pattern[4] ? glowFilter : ''}/>`,
            // f - top left vertical
            `<polygon points="${x},${2} ${x+t},${4} ${x+t},${h/2-4} ${x},${h/2-2}" fill="${pattern[5] ? onColor : offColor}" ${pattern[5] ? glowFilter : ''}/>`,
            // g - middle horizontal
            `<polygon points="${x+3},${h/2-t/2} ${x+w-3},${h/2-t/2} ${x+w-4},${h/2} ${x+w-3},${h/2+t/2} ${x+3},${h/2+t/2} ${x+4},${h/2}" fill="${pattern[6] ? onColor : offColor}" ${pattern[6] ? glowFilter : ''}/>`,
        ];

        return segments.join('');
    }

    updateSegmentDisplay(text) {
        if (!this.digitsGroup) return;

        const { style = 'default' } = this.config;
        const isLCD = style === 'lcd';

        let html = '';
        let x = 0;
        for (const char of text) {
            if (char === '.' || char === ':') {
                html += this.renderDigit(char, x, isLCD);
                x += DIGITAL_SPECIAL_CHAR_ADVANCE;
            } else {
                html += this.renderDigit(char, x, isLCD);
                x += DIGITAL_DIGIT_ADVANCE;
            }
        }

        this.digitsGroup.innerHTML = html;

        // Update SVG viewBox to fit content
        if (this.svgEl) {
            this.svgEl.setAttribute('viewBox', `0 0 ${x + DIGITAL_VIEWBOX_PADDING} ${DIGITAL_VIEWBOX_HEIGHT}`);
        }
    }

    update(value, error = null) {
        super.update(value, error);

        const { style = 'default', decimals = 0, digits = 6, color = '#22c55e', unit = '' } = this.config;

        if (style === 'default') {
            if (!this.displayEl) return;

            if (error) {
                this.displayEl.textContent = 'ERR';
                this.displayEl.style.color = 'var(--accent-red)';
                return;
            }

            const numValue = parseNumberOrDefault(value, 0);
            let text = numValue.toFixed(decimals);

            // Pad with zeros if needed
            const parts = text.split('.');
            const intPart = parts[0].padStart(digits - (decimals > 0 ? decimals + 1 : 0), '0');
            text = decimals > 0 ? `${intPart}.${parts[1]}` : intPart;

            if (unit) {
                text += ` ${unit}`;
            }

            this.displayEl.textContent = text;
            this.displayEl.style.color = color;
        } else {
            // LCD or LED style
            if (!this.digitsGroup) return;

            if (error) {
                this.updateSegmentDisplay('ERR');
                return;
            }

            const numValue = parseNumberOrDefault(value, 0);
            let text = numValue.toFixed(decimals);

            // Pad with leading spaces/zeros
            const parts = text.split('.');
            const intPart = parts[0].padStart(digits - (decimals > 0 ? decimals + 1 : 0), ' ');
            text = decimals > 0 ? `${intPart}.${parts[1]}` : intPart;

            this.updateSegmentDisplay(text);
        }
    }

    static getConfigForm(config = {}) {
        return `
            ${renderSensorBindingFields(config, { fieldPrefix: '' })}
            ${renderLabelField(config)}
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
            digits: parseIntegerOrDefault(form.querySelector('[name="digits"]')?.value, 6),
            decimals: parseIntegerOrDefault(form.querySelector('[name="decimals"]')?.value, 0),
            color: form.querySelector('[name="color"]')?.value || '#22c55e',
            unit: form.querySelector('[name="unit"]')?.value || ''
        };
    }

    static initConfigHandlers(form, config = {}) {
        initSensorBindingHandlers(form, config, { fieldPrefix: '' });
    }
}

// ============================================================================
// Chart Widget (Chart.js based)
// ============================================================================

class ChartWidget extends DashboardWidget {
    static type = 'chart';
    static usesNewSensorAutocomplete = true;
    static displayName = 'Chart';
    static description = 'Real-time line chart with multiple sensors';
    static icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>';
    static defaultSize = { width: 24, height: 12 };

    // Default colors for sensors внутри ChartWidget. Намеренно отличается от
    // CHART_COLORS в 40-charts.js (палитра для IONC sensor charts) — у каждого
    // контекста своя визуальная стилистика. Не сливать.
    static SENSOR_COLORS = [
        '#3274d9', '#73bf69', '#f2cc0c', '#ff6b6b', '#a855f7',
        '#06b6d4', '#f97316', '#ec4899', '#14b8a6', '#8b5cf6'
    ];

    constructor(id, config, container) {
        super(id, config, container);
        this.charts = new Map();      // zoneId -> Chart.js instance
        this.chartStartTime = Date.now();
        this.updateInterval = null;
        this.visibilityHandler = null;
    }

    render() {
        const { zones = [], showTable = true, tableHeight = CHART_WIDGET_DEFAULT_TABLE_HEIGHT } = this.config;

        this.element = document.createElement('div');
        this.element.className = 'widget-content chart-widget-content';

        // Zones container
        const zonesHtml = zones.map((zone, idx) => `
            <div class="chart-widget-zone" data-zone-id="${ChartWidget.getZoneId(zone, idx)}">
                <canvas id="chart-canvas-${this.id}-${idx}"></canvas>
            </div>
        `).join('');

        // Table container (if enabled) - IONC table style
        const tableHtml = showTable ? `
            <div class="chart-widget-table-container" style="height: ${tableHeight}px;">
                <div class="chart-widget-table-resizer"></div>
                <div class="chart-widget-table-scroll">
                    <table class="chart-widget-table">
                        <thead>
                            <tr>
                                <th class="col-color"></th>
                                <th class="col-id">ID</th>
                                <th class="col-name">Name</th>
                                <th class="col-type">Type</th>
                                <th class="col-value">Value</th>
                                <th class="col-status">Status</th>
                                <th class="col-supplier">Supplier</th>
                            </tr>
                        </thead>
                        <tbody id="chart-table-${this.id}">
                        </tbody>
                    </table>
                </div>
            </div>
        ` : '';

        // Get saved zones height or use default
        const zonesHeight = this.config.zonesHeight ?? CHART_WIDGET_DEFAULT_ZONES_HEIGHT;

        this.element.innerHTML = `
            <div class="chart-widget-zones" style="height: ${zonesHeight}px;">
                ${zonesHtml}
                <div class="chart-widget-zones-resizer"></div>
            </div>
            ${tableHtml}
        `;

        this.container.appendChild(this.element);

        // Initialize charts
        this.initCharts();

        // Initialize zones resizer
        this.initZonesResizer();

        // Initialize table
        if (showTable) {
            this.initTable();
            this.initTableResizer();
        }

        // Load history for all sensors
        this.loadHistory();

        // Start periodic update interval, only when visible.
        this.updateInterval = setInterval(() => {
            if (!document.hidden && this.charts.size > 0) {
                this.syncTimeRange();
            }
        }, CHART_WIDGET_SYNC_INTERVAL_MS);

        // Add visibility change handler
        this.visibilityHandler = () => {
            if (document.visibilityState === 'visible') {
                // Force refresh charts when page becomes visible
                this.syncTimeRange();
            }
        };
        document.addEventListener('visibilitychange', this.visibilityHandler);
    }

    initCharts() {
        const { zones = [], useTextname = false } = this.config;

        zones.forEach((zone, idx) => {
            const canvas = this.element.querySelector(`#chart-canvas-${this.id}-${idx}`);
            if (!canvas) return;

            const ctx = canvas.getContext('2d');
            const datasets = (zone.sensors || []).map((sensor, sensorIdx) => {
                const sensorName = ChartWidget.getSensorName(sensor);
                let label = sensor.label || sensorName;
                if (useTextname && !sensor.label) {
                    const sensorInfo = ChartWidget.getScopedSensorInfo(sensor);
                    if (sensorInfo?.textname) {
                        label = sensorInfo.textname;
                    }
                }
                return {
                    label,
                    data: [],
                    borderColor: sensor.color || ChartWidget.SENSOR_COLORS[sensorIdx % ChartWidget.SENSOR_COLORS.length],
                    backgroundColor: `${sensor.color || ChartWidget.SENSOR_COLORS[sensorIdx % ChartWidget.SENSOR_COLORS.length]}20`,
                    fill: sensor.fill !== false,
                    tension: sensor.stepped ? 0 : (sensor.smooth !== false ? CHART_LINE_TENSION : 0),
                    stepped: sensor.stepped ? 'before' : false,
                    pointRadius: 0,
                    borderWidth: sensor.stepped ? CHART_STEPPED_LINE_BORDER_WIDTH : CHART_LINE_BORDER_WIDTH
                };
            });

            const timeRange = this.getTimeRange();
            const chart = new Chart(ctx, createLineChartConfig({
                datasets,
                timeRange,
                options: {
                    normalized: true,
                    parsing: false,
                    spanGaps: true,
                    interactionMode: 'nearest',
                    xMaxTicksLimit: CHART_WIDGET_X_MAX_TICKS,
                    yMaxTicksLimit: CHART_WIDGET_Y_MAX_TICKS,
                    autoSkip: true,
                    tickSource: 'auto',
                    tooltipEnabled: true,
                    decimation: true
                }
            }));

            this.charts.set(ChartWidget.getZoneId(zone, idx), {
                chart,
                sensors: zone.sensors || []
            });
        });
    }

    initTable() {
        const { zones = [], useTextname = false } = this.config;
        const tbody = this.element.querySelector(`#chart-table-${this.id}`);
        if (!tbody) return;

        // Collect all sensors from all zones with zone index
        const allSensors = [];
        zones.forEach((zone, zoneIdx) => {
            (zone.sensors || []).forEach((sensor, sensorIdx) => {
                const sensorInfo = ChartWidget.getScopedSensorInfo(sensor);
                allSensors.push({
                    ...sensor,
                    zoneIdx,
                    sensorIdx,
                    zoneId: ChartWidget.getZoneId(zone, zoneIdx),
                    color: sensor.color || ChartWidget.SENSOR_COLORS[sensorIdx % ChartWidget.SENSOR_COLORS.length],
                    iotype: sensorInfo?.iotype || '',
                    textname: sensorInfo?.textname || ''
                });
            });
        });

        // IONC-style table rows
        tbody.innerHTML = allSensors.map((sensor, idx) => {
            const sensorName = ChartWidget.getSensorName(sensor);
            const safeId = ChartWidget.getSensorDomKey(sensor);
            const sensorInfo = ChartWidget.getScopedSensorInfo(sensor);
            const sensorId = sensorInfo?.id || '';
            const supplier = sensorInfo?.supplier || '';
            // Use textname if enabled and available
            const displayName = (useTextname && sensor.textname) ? sensor.textname : sensorName;
            return `
            <tr data-sensor="${escapeAttr(sensorName)}" data-zone="${sensor.zoneIdx}" data-idx="${sensor.sensorIdx}">
                <td class="col-color">
                    <span class="color-indicator" style="background: ${sensor.color}"></span>
                </td>
                <td class="col-id">${escapeHtml(String(sensorId))}</td>
                <td class="col-name" title="${escapeAttr(sensorName)}">${escapeHtml(displayName)}</td>
                <td class="col-type">
                    ${sensor.iotype ? `<span class="type-badge type-${sensor.iotype}">${sensor.iotype}</span>` : ''}
                </td>
                <td class="col-value" id="chart-value-${this.id}-${safeId}" style="color: ${sensor.color}">--</td>
                <td class="col-status">—</td>
                <td class="col-supplier">${escapeHtml(supplier)}</td>
            </tr>
        `}).join('');
    }

    initTableResizer() {
        const container = this.element.querySelector('.chart-widget-table-container');
        const resizer = this.element.querySelector('.chart-widget-table-resizer');
        if (!container || !resizer) return;

        setupResizeHandle(
            resizer,
            container,
            CHART_WIDGET_TABLE_MIN_HEIGHT,
            (height) => {
                this.config.tableHeight = height;
                if (window.dashboardManager) dashboardManager.saveDashboard();
            },
            CHART_WIDGET_TABLE_MAX_HEIGHT,
            null,
            { direction: -1, updateMaxHeight: false }
        );
    }

    initZonesResizer() {
        const zones = this.element.querySelector('.chart-widget-zones');
        const resizer = this.element.querySelector('.chart-widget-zones-resizer');
        if (!zones || !resizer) return;

        setupResizeHandle(
            resizer,
            zones,
            CHART_WIDGET_ZONES_MIN_HEIGHT,
            (height) => {
                this.config.zonesHeight = height;
                if (window.dashboardManager) dashboardManager.saveDashboard();
            },
            CHART_WIDGET_ZONES_MAX_HEIGHT,
            () => this.charts.forEach(({ chart }) => chart.resize()),
            { updateMaxHeight: false }
        );
    }

    getTimeRange() {
        // Use widget's own timeRange or default to 15 minutes
        const rangeMs = this.config.timeRange || CHART_WIDGET_DEFAULT_TIME_RANGE_MS;
        const now = Date.now();

        let min = this.chartStartTime;
        let max = min + rangeMs;

        // Shift window if current time exceeds
        if (now >= max) {
            const shiftAmount = rangeMs * CHART_WIDGET_TIME_WINDOW_SHIFT_RATIO;
            this.chartStartTime = min + shiftAmount;
            min = this.chartStartTime;
            max = min + rangeMs;
        }

        return { min, max };
    }

    async loadHistory() {
        const { zones = [] } = this.config;

        for (let zoneIdx = 0; zoneIdx < zones.length; zoneIdx++) {
            const zone = zones[zoneIdx];
            const chartData = this.charts.get(ChartWidget.getZoneId(zone, zoneIdx));
            if (!chartData) continue;

            for (let i = 0; i < (zone.sensors || []).length; i++) {
                const sensor = zone.sensors[i];
                const sensorName = ChartWidget.getSensorName(sensor);
                try {
                    const response = await fetch(ChartWidget.getHistoryUrl(sensor));
                    if (response.ok) {
                        const history = await response.json();
                        if (history.points && history.points.length > 0) {
                            // Use timestamp as number for decimation to work
                            const data = history.points.map(p => ({
                                x: new Date(p.timestamp).getTime(),
                                y: p.value
                            }));
                            chartData.chart.data.datasets[i].data = data;
                        }
                    }
                } catch (e) {
                    console.warn(`Failed to load history for ${sensorName}:`, e);
                }
            }

            chartData.chart.update('none');
        }
    }

    update(value, error = null) {
        // This is called for the main sensor (config.sensor)
        // Chart widget uses updateSensor instead
    }

    // Called from SSE handler for each sensor update.
    // ctx — { serverId, objectName, sensorName }; используется чтобы не апдейтить
    // sensor в zone, когда у этого имени совпадение пришло с другого (server, object).
    //
    // Hot path (срабатывает на каждый ionc_sensor_batch): один проход по zones
    // для table-update + chart-update вместе. Раньше было два независимых прохода.
    updateSensor(sensorName, value, timestamp = null, ctx = null) {
        // Use timestamp as number for decimation to work with parsing: false
        const ts = timestamp ? new Date(timestamp).getTime() : Date.now();

        const { zones = [] } = this.config;
        for (let zoneIdx = 0; zoneIdx < zones.length; zoneIdx++) {
            const zone = zones[zoneIdx];
            const sensors = zone.sensors || [];
            const sensorIdx = sensors.findIndex(s =>
                ChartWidget.sensorMatchesUpdate(s, sensorName, ctx)
            );
            if (sensorIdx === -1) continue;

            const sensor = sensors[sensorIdx];

            // Table value cell.
            const safeId = ChartWidget.getSensorDomKey(sensor);
            const valueEl = this.element?.querySelector(`#chart-value-${this.id}-${safeId}`);
            if (valueEl) {
                valueEl.textContent = typeof value === 'number' ? value.toFixed(2) : value;
            }

            // Chart dataset point.
            const chartData = this.charts.get(ChartWidget.getZoneId(zone, zoneIdx));
            if (!chartData) continue;
            const dataset = chartData.chart.data.datasets[sensorIdx];
            if (!dataset) continue;

            dataset.data.push({ x: ts, y: value });
            if (dataset.data.length > MAX_CHART_POINTS) dataset.data.shift();
        }
        // chart.update() намеренно НЕ вызываем тут — рендер идёт пакетно в
        // syncTimeRange() каждые CHART_WIDGET_SYNC_INTERVAL_MS (по умолчанию 2с).
        // Это снижает CPU при частых SSE (200ms poll) ценой 0–2с задержки кадра.
    }

    // Called periodically to sync time range and update charts
    syncTimeRange() {
        const timeRange = this.getTimeRange();

        this.charts.forEach(({ chart }) => {
            chart.options.scales.x.min = timeRange.min;
            chart.options.scales.x.max = timeRange.max;
            chart.update('none');
        });
    }

    destroy() {
        // Clear update interval
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }

        // Remove visibility handler
        if (this.visibilityHandler) {
            document.removeEventListener('visibilitychange', this.visibilityHandler);
            this.visibilityHandler = null;
        }

        // Destroy all Chart.js instances
        this.charts.forEach(({ chart }) => {
            chart.destroy();
        });
        this.charts.clear();
        super.destroy();
    }

    static getSensorName(sensor = {}) {
        return getSensorNameFromBinding(sensor);
    }

    static getZoneId(zone = {}, idx = 0) {
        return zone.id || `zone-${idx}`;
    }

    static getScopedSensorInfo(sensor = {}) {
        const sensorName = ChartWidget.getSensorName(sensor);
        if (sensor.serverId && sensor.objectName && typeof getSensorInfoByKey === 'function') {
            const scoped = getSensorInfoByKey(sensor.serverId, sensor.objectName, sensorName);
            if (scoped) return scoped;
        }
        return typeof getSensorInfo === 'function' ? getSensorInfo(sensorName) : null;
    }

    static getSensorDomKey(sensor = {}) {
        const sensorName = ChartWidget.getSensorName(sensor);
        const key = sensor.serverId && sensor.objectName && typeof makeSensorKey === 'function'
            ? makeSensorKey(sensor.serverId, sensor.objectName, sensorName)
            : sensorName;
        return String(key).replace(/[^a-zA-Z0-9_-]/g, '_');
    }

    static sensorMatchesUpdate(sensor = {}, sensorName, ctx = null) {
        return sensorItemMatchesUpdate(sensor, sensorName, ctx);
    }

    static getHistoryUrl(sensor = {}) {
        const sensorName = ChartWidget.getSensorName(sensor);
        const objectName = sensor.objectName || 'SharedMemory';
        return buildObjectUrl(
            objectName,
            `/variables/${encodeURIComponent(sensorName)}/history`,
            sensor.serverId || null,
            { count: CHART_WIDGET_HISTORY_LIMIT }
        );
    }

    static TIME_RANGES = CHART_TIME_RANGES_MS;

    // === Single sensor row (renders inside chart-zone-sensors-{zoneIdx}) ===
    static _renderChartSensorRow({ zoneIdx, sensorIdx, sensor }) {
        const color = sensor.color || ChartWidget.SENSOR_COLORS[sensorIdx % ChartWidget.SENSOR_COLORS.length];
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
        const timeRange = config.timeRange || CHART_WIDGET_DEFAULT_TIME_RANGE_MS;
        return `
            <input type="hidden" name="tableHeight" value="${config.tableHeight ?? CHART_WIDGET_DEFAULT_TABLE_HEIGHT}">
            <input type="hidden" name="zonesHeight" value="${config.zonesHeight ?? CHART_WIDGET_DEFAULT_ZONES_HEIGHT}">
            ${renderLabelField(config, 'Chart title')}
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

        // + Add Sensor (per zone), Remove sensor, Remove zone, + Add Zone — все через delegation.
        form.addEventListener('click', (e) => {
            const addSensorBtn = e.target.closest('.chart-zone-add-sensor');
            if (addSensorBtn) {
                const zoneIdx = parseInt(addSensorBtn.dataset.zoneIdx, 10);
                const container = form.querySelector(`[data-zone-container="${zoneIdx}"]`);
                const sensorIdx = container.querySelectorAll('.chart-sensor-row').length;
                const last = getLastSensor();
                const colorIdx = sensorIdx;
                const sensor = {
                    serverId:   last?.serverId   || (typeof state !== 'undefined' && state?.servers ? [...state.servers.entries()].find(([,s]) => s.connected)?.[0] : ''),
                    objectName: last?.objectName || 'SharedMemory',
                    sensor: '', sensorId: null,
                    name: '', // back-compat: runtime читает sensor.name
                    color: ChartWidget.SENSOR_COLORS[colorIdx % ChartWidget.SENSOR_COLORS.length],
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
                    name:    binding.sensor, // back-compat: runtime читает sensor.name
                    color:   form.querySelector(`[name="chart-${zoneIdx}-${sensorIdx}-color"]`)?.value || ChartWidget.SENSOR_COLORS[sensorIdx % ChartWidget.SENSOR_COLORS.length],
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
            timeRange: timeRangeInput
                ? parseIntegerOrDefault(timeRangeInput.value, CHART_WIDGET_DEFAULT_TIME_RANGE_MS)
                : CHART_WIDGET_DEFAULT_TIME_RANGE_MS,
            showTable: form.querySelector('[name="showTable"]')?.checked !== false,
            useTextname: form.querySelector('[name="useTextname"]')?.checked || false,
            tableHeight: parseIntegerOrDefault(
                form.querySelector('[name="tableHeight"]')?.value,
                CHART_WIDGET_DEFAULT_TABLE_HEIGHT
            ),
            zonesHeight: parseIntegerOrDefault(
                form.querySelector('[name="zonesHeight"]')?.value,
                CHART_WIDGET_DEFAULT_ZONES_HEIGHT
            ),
            zones
        };
    }
}
