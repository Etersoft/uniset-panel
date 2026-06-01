// ============================================================================
// StateLabelWidget — passive widget с маппингом value → {text, fg, bg, blink}
// через список диапазонов (first-match wins, открытые границы через
// optional from/to).
//
// Spec: docs/superpowers/specs/2026-06-01-state-label-widget-design.md
// ============================================================================

// resolveStateLabel — чистая функция. Возвращает { source, state }:
//   source: 'match' | 'raw' | 'ignore' | 'default'
//   state:  { text, fg?, bg?, blink? } | null (для 'ignore' без hold)
// prevState нужен только для fallback 'ignore' + hold path.
function resolveStateLabel(value, states, fallbackCfg, prevState) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
        return _applyStateLabelFallback(fallbackCfg, prevState, value);
    }
    const numValue = Number(value);
    if (Array.isArray(states)) {
        for (const s of states) {
            const lo = s.from !== undefined && s.from !== '' && s.from !== null ? Number(s.from) : -Infinity;
            const hi = s.to   !== undefined && s.to   !== '' && s.to   !== null ? Number(s.to)   : +Infinity;
            if (Number.isFinite(lo) === false && lo !== -Infinity) continue;  // garbage skip
            if (Number.isFinite(hi) === false && hi !== +Infinity) continue;
            if (numValue >= lo && numValue <= hi) {
                return { source: 'match', state: s };
            }
        }
    }
    return _applyStateLabelFallback(fallbackCfg, prevState, numValue);
}

function _applyStateLabelFallback(cfg, prevState, value) {
    const policy = cfg && cfg.policy ? cfg.policy : 'raw';
    if (policy === 'raw') {
        return { source: 'raw', state: { text: String(value == null ? '--' : value) } };
    }
    if (policy === 'ignore') {
        if (cfg && cfg.hold && prevState) return { source: 'ignore', state: prevState };
        return { source: 'ignore', state: null };
    }
    if (policy === 'default') {
        return { source: 'default', state: (cfg && cfg.defaultState) ? cfg.defaultState : { text: '--' } };
    }
    return { source: 'raw', state: { text: String(value) } };
}

// findStateOverlaps — возвращает массив [i, j] (i<j) пар индексов перекрывающихся
// state'ов. State #j потенциально никогда не сработает (first-match wins).
function findStateOverlaps(states) {
    const pairs = [];
    if (!Array.isArray(states)) return pairs;
    const norm = states.map(s => {
        const lo = s.from !== undefined && s.from !== '' && s.from !== null ? Number(s.from) : -Infinity;
        const hi = s.to   !== undefined && s.to   !== '' && s.to   !== null ? Number(s.to)   : +Infinity;
        return { lo, hi };
    });
    for (let i = 0; i < norm.length; i++) {
        for (let j = i + 1; j < norm.length; j++) {
            // ranges overlap iff a.lo <= b.hi && b.lo <= a.hi
            if (norm[i].lo <= norm[j].hi && norm[j].lo <= norm[i].hi) {
                pairs.push([i, j]);
            }
        }
    }
    return pairs;
}

// ============================================================================
// StateLabelWidget class
// ============================================================================

class StateLabelWidget extends DashboardWidget {
    static type = 'state-label';
    static usesNewSensorAutocomplete = true;
    static displayName = 'State Label';
    static description = 'Text + color + blink по значению датчика';
    static icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="6" width="18" height="12" rx="2"/><text x="12" y="15" text-anchor="middle" font-size="8" fill="currentColor" stroke="none">STATE</text></svg>';
    static defaultSize = { width: 6, height: 2 };

    constructor(id, config, container) {
        super(id, config, container);
        this._lastValidState = null;
        this._blinkTimer = null;
        this._blinkStopTimer = null;
        this._blinkVisible = true;
    }

    render() {
        const { align = 'center', bold = false, fontSize = 'auto' } = this.config;

        this.element = document.createElement('div');
        this.element.className = 'widget-content state-label-widget';
        this.element.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: ${align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center'};
            height: 100%;
            padding: 4px 8px;
            border-radius: 4px;
            transition: background-color 0.15s;
        `;

        this.textEl = document.createElement('div');
        this.textEl.className = 'state-label-text';
        const fontSizePx = fontSize === 'auto'
            ? ''
            : `font-size: ${parseIntegerOrDefault(fontSize, STATE_LABEL_DEFAULT_FONT_SIZE_PX)}px;`;
        this.textEl.style.cssText = `
            font-weight: ${bold ? 700 : 500};
            ${fontSizePx}
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        `;

        this.element.appendChild(this.textEl);
        this.container.appendChild(this.element);
    }

    update(value, error = null) {
        const v = error ? null : value;
        const { states = [], fallback = 'raw', fallbackHold = false, defaultState } = this.config;
        const fallbackCfg = { policy: fallback, hold: fallbackHold, defaultState };

        const { source, state } = resolveStateLabel(v, states, fallbackCfg, this._lastValidState);

        if (source === 'match' || source === 'default') {
            this._lastValidState = state;
        }
        this._applyState(state, source);
    }

    _applyState(state, source) {
        this._stopBlink();
        if (!state) {  // 'ignore' + no hold
            this.textEl.textContent = '';
            this.element.style.background = '';
            this.textEl.style.color = '';
            return;
        }
        this.textEl.textContent = state.text != null ? String(state.text) : '';
        this.textEl.style.color = state.fg || '';
        this.element.style.background = (source === 'raw') ? '' : (state.bg || '');
        if (state.blink && state.blink !== 'none' && source !== 'raw') {
            this._startBlink(state.blink);
        }
    }

    _startBlink(blinkCfg) {
        if (!blinkCfg || typeof blinkCfg !== 'object') return;
        const interval = parseIntegerOrDefault(blinkCfg.interval, STATE_LABEL_BLINK_DEFAULT_INTERVAL_MS);
        if (interval < STATE_LABEL_BLINK_MIN_INTERVAL_MS) return;
        this._blinkVisible = true;
        this.element.style.opacity = '1';
        this._blinkTimer = setInterval(() => {
            this._blinkVisible = !this._blinkVisible;
            this.element.style.opacity = this._blinkVisible ? '1' : String(STATE_LABEL_BLINK_FADED_OPACITY);
        }, interval);
        if (blinkCfg.duration && blinkCfg.duration > 0) {
            this._blinkStopTimer = setTimeout(() => this._stopBlink(), blinkCfg.duration);
        }
    }

    _stopBlink() {
        if (this._blinkTimer) { clearInterval(this._blinkTimer); this._blinkTimer = null; }
        if (this._blinkStopTimer) { clearTimeout(this._blinkStopTimer); this._blinkStopTimer = null; }
        if (this.element) this.element.style.opacity = '1';
    }

    destroy() {
        this._stopBlink();
        if (super.destroy) super.destroy();
    }

    static getConfigForm(config = {}) {
        const states = Array.isArray(config.states) && config.states.length > 0
            ? config.states
            : [
                { from: 0, to: 0, text: 'OFF', fg: '#ffffff', bg: '#6b7280', blink: 'none' },
                { from: 1, to: 1, text: 'RUN', fg: '#ffffff', bg: '#22c55e', blink: 'none' },
            ];
        const fallback = config.fallback || 'raw';
        const fallbackHold = !!config.fallbackHold;
        const def = config.defaultState || { text: '--', fg: '#9ca3af', bg: '#1f2937', blink: 'none' };
        const fontSize = config.fontSize || 'auto';
        const bold = !!config.bold;
        const align = config.align || 'center';

        return `
            ${renderSensorBindingFields(config)}
            ${renderStateListEditor(states)}
            <div class="widget-config-field">
                <label>Fallback (no match)</label>
                <div class="state-label-fallback-options">
                    <label class="widget-checkbox-label">
                        <input type="radio" name="fallback" value="raw" ${fallback === 'raw' ? 'checked' : ''}>
                        <span>Show raw value</span>
                    </label>
                    <label class="widget-checkbox-label">
                        <input type="radio" name="fallback" value="ignore" ${fallback === 'ignore' ? 'checked' : ''}>
                        <span>Ignore</span>
                        <label class="widget-checkbox-label state-label-hold">
                            <input type="checkbox" name="fallbackHold" ${fallbackHold ? 'checked' : ''}>
                            <span>Hold last state</span>
                        </label>
                    </label>
                    <label class="widget-checkbox-label">
                        <input type="radio" name="fallback" value="default" ${fallback === 'default' ? 'checked' : ''}>
                        <span>Default state</span>
                    </label>
                </div>
                <div class="state-label-default-editor" style="${fallback === 'default' ? '' : 'display:none'}">
                    <input type="text"  name="defaultState-text" placeholder="--"      value="${escapeAttr(def.text || '--')}" class="widget-input">
                    <input type="color" name="defaultState-fg"   value="${escapeAttr(def.fg || '#9ca3af')}">
                    <input type="color" name="defaultState-bg"   value="${escapeAttr(def.bg || '#1f2937')}">
                </div>
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>Font size</label>
                    <select class="widget-select" name="fontSize">
                        <option value="auto" ${fontSize === 'auto' ? 'selected' : ''}>auto</option>
                        <option value="12"   ${fontSize === '12'   ? 'selected' : ''}>12px</option>
                        <option value="14"   ${fontSize === '14'   ? 'selected' : ''}>14px</option>
                        <option value="16"   ${fontSize === '16'   ? 'selected' : ''}>16px</option>
                        <option value="20"   ${fontSize === '20'   ? 'selected' : ''}>20px</option>
                        <option value="24"   ${fontSize === '24'   ? 'selected' : ''}>24px</option>
                        <option value="32"   ${fontSize === '32'   ? 'selected' : ''}>32px</option>
                    </select>
                </div>
                <div class="widget-config-field">
                    <label>Align</label>
                    <select class="widget-select" name="align">
                        <option value="left"   ${align === 'left'   ? 'selected' : ''}>Left</option>
                        <option value="center" ${align === 'center' ? 'selected' : ''}>Center</option>
                        <option value="right"  ${align === 'right'  ? 'selected' : ''}>Right</option>
                    </select>
                </div>
                <div class="widget-config-field">
                    <label class="widget-checkbox-label">
                        <input type="checkbox" name="bold" ${bold ? 'checked' : ''}>
                        <span>Bold</span>
                    </label>
                </div>
            </div>
        `;
    }

    static initConfigHandlers(form, config = {}) {
        if (typeof initSensorBindingHandlers === 'function') initSensorBindingHandlers(form, config);
        if (typeof setupStateListHandlers === 'function')    setupStateListHandlers(form);

        if (form.dataset.stateLabelHandlersWired === '1') return;
        form.dataset.stateLabelHandlersWired = '1';

        const defaultEditor = form.querySelector('.state-label-default-editor');
        form.querySelectorAll('input[name="fallback"]').forEach((radio) => {
            radio.addEventListener('change', () => {
                if (defaultEditor) {
                    defaultEditor.style.display =
                        form.querySelector('input[name="fallback"]:checked')?.value === 'default' ? '' : 'none';
                }
            });
        });
    }

    static parseConfigForm(form) {
        const binding = parseSensorBindingFields(form);
        const states  = parseStateList(form);
        const fallback = form.querySelector('input[name="fallback"]:checked')?.value || 'raw';
        const fallbackHold = form.querySelector('input[name="fallbackHold"]')?.checked || false;
        const defaultState = {
            text: form.querySelector('[name="defaultState-text"]')?.value || '--',
            fg:   form.querySelector('[name="defaultState-fg"]')?.value || '#9ca3af',
            bg:   form.querySelector('[name="defaultState-bg"]')?.value || '#1f2937',
            blink: 'none',
        };
        return {
            ...binding,
            states,
            fallback,
            fallbackHold,
            defaultState,
            fontSize: form.querySelector('[name="fontSize"]')?.value || 'auto',
            align:    form.querySelector('[name="align"]')?.value || 'center',
            bold:     form.querySelector('[name="bold"]')?.checked || false,
        };
    }
}

if (typeof globalThis !== 'undefined') {
    globalThis.resolveStateLabel = resolveStateLabel;
    globalThis.findStateOverlaps = findStateOverlaps;
    globalThis.StateLabelWidget = StateLabelWidget;
}
