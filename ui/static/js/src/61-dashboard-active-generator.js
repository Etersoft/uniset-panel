// ============================================================================
// GeneratorWidget — обёртка вокруг SignalGenerator engine для dashboard.
//
// Запускает математический генератор (square/sin/cos/linear/random),
// каждый тик пишет в датчик через _doWriteSilent (fire-and-forget). Параметры
// настраиваются только через config dialog, на widget'е — Start/Stop toggle
// + текущее значение.
//
// Один стиль 'compact' (default 3×1). Сетpoint feedback игнорируется
// (update() no-op, как PushButton) — UI показывает что генератор послал.
//
// Config:
//   sensor      — имя датчика (от base)
//   sensorId    — числовой ID (от base)
//   objectName  — IONC object (default 'SharedMemory', от base)
//   label       — подпись виджета (default = имя датчика)
//   requireConfirmation — bool, спрашивать ли confirm при Start (от base)
//   type        — 'square' (default) | 'sin' | 'cos' | 'linear' | 'random'
//   min, max    — диапазон значений
//   step        — для linear/sin/cos (число точек на полуцикл)
//   pause       — для linear/sin/cos/square (ms между шагами)
//   pulseWidth  — для square (ms ширина импульса)
//   period      — для random (ms между генерациями)
// ============================================================================

class GeneratorWidget extends ActiveDashboardWidget {
    static type = 'generator';
    static displayName = 'Signal Generator';
    static description = 'Writes generated signal (square/sin/cos/linear/random) to a sensor';
    static icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12 L6 12 L6 4 L10 4 L10 20 L14 20 L14 4 L18 4 L18 12 L22 12"/></svg>';
    static defaultSize = { width: 3, height: 1 };
    static minSize = { width: 2, height: 1 };
    static maxSize = { width: 6, height: 2 };
    // Один стиль — base.getConfigForm НЕ рендерит style select когда styles.length <= 1.
    static styles = [];
    static defaultStyle = '';

    constructor(id, config, container) {
        super(id, config, container);
        this._signalGen = null;
    }

    // === Render ===
    render() {
        // Label опционален: пустой → header не рисуется. Fallback на sensor name
        // удалён намеренно (см. комментарий в ToggleWidget.renderSlider).
        const label = this.config?.label || '';
        const labelHtml = label
            ? `<div class="gen-label" data-test="label">${escapeHtml(label)}</div>`
            : '';
        this.element = document.createElement('div');
        this.element.className = 'widget-content generator-widget';
        this.element.innerHTML = `
            ${labelHtml}
            <div class="gen-value" data-test="value">--</div>
            <div class="gen-toggle" data-test="toggle" role="switch" aria-checked="false">
                <div class="gen-handle"></div>
            </div>
        `;
        this.container.appendChild(this.element);

        const toggle = this.element.querySelector('[data-test="toggle"]');
        toggle.addEventListener('click', (e) => { e.stopPropagation(); this._onToggle(); });
        // mousedown.preventDefault — toggle не должен забирать фокус на click
        toggle.addEventListener('mousedown', (e) => e.preventDefault());
    }

    // === SSE feedback override — игнорируем (как PushButton) ===
    update(value, error = null) {
        this.feedbackValue = value;
        this.value = value;
        this.error = error;
        // НЕ вызываем renderFeedback — UI показывает значение от генератора
        // через _updateValueDisplay в _onTick.
    }

    // === Toggle handler ===
    async _onToggle() {
        if (!this.isInteractive()) return;
        if (this._isRunning()) {
            this._stop();
        } else {
            if (this.needsConfirmation() && !await this._confirm(this.config?.sensor || 'sensor')) return;
            this._start();
        }
    }

    async _confirm(sensorName) {
        return window.confirm(`Start generator on "${sensorName}"? It will write each tick.`);
    }

    // === Start/Stop ===
    _start() {
        // S-3: guard against double-start (rapid double-toggle leak).
        if (this._signalGen) return;
        this._signalGen = new SignalGenerator({
            type: this.config?.type || 'square',
            min: this.config?.min ?? GENERATOR_DEFAULT_MIN,
            max: this.config?.max ?? GENERATOR_DEFAULT_MAX,
            step: this.config?.step,
            pause: this.config?.pause,
            pulseWidth: this.config?.pulseWidth,
            period: this.config?.period,
            onTick: (value) => this._onTick(value),
        });
        this._signalGen.start();
        this._updateRunningUI(true);
    }

    _stop() {
        if (this._signalGen) {
            this._signalGen.stop();
            this._signalGen = null;
        }
        this._updateValueDisplay(null);
        this._updateRunningUI(false);
    }

    _isRunning() {
        return !!this._signalGen?.isRunning();
    }

    async _onTick(value) {
        this._updateValueDisplay(value);
        // Fire-and-forget: per-tick без UI flash. На ошибке — стоп с error state.
        // Validation (sensorId/serverId/objectName) происходит внутри _doWriteSilent.
        const result = await this._doWriteSilent(value);
        if (!result.ok) {
            console.warn('Generator write failed:', result.error);
            this._stop();
            this._setWriteState('error', result.error);
        }
    }

    // === UI update helpers ===
    _updateValueDisplay(value) {
        if (!this.element) return;
        const valueEl = this.element.querySelector('[data-test="value"]');
        if (valueEl) {
            valueEl.textContent = (value !== null && value !== undefined) ? String(value) : '--';
            valueEl.classList.toggle('running', value !== null && value !== undefined);
        }
    }

    _updateRunningUI(isRunning) {
        if (!this.element) return;
        const toggle = this.element.querySelector('[data-test="toggle"]');
        if (toggle) {
            toggle.classList.toggle('running', isRunning);
            toggle.setAttribute('aria-checked', isRunning ? 'true' : 'false');
        }
    }

    // === ControlToken released во время работы → стоп ===
    _updateInteractivityClass() {
        super._updateInteractivityClass();
        if (this._isRunning() && !this.isInteractive()) {
            this._stop();
        }
    }

    // === Render hooks (не используются для Generator) ===
    renderFeedback() { /* no-op */ }
    renderCommand() { /* no-op */ }

    // === Cleanup ===
    destroy() {
        this._stop();
        super.destroy();
    }

    // === Config form ===
    static getActiveConfigFields(config = {}) {
        const type = config.type || 'square';
        const showLinSinCos = (type === 'linear' || type === 'sin' || type === 'cos');
        const showSquare = (type === 'square');
        const showRandom = (type === 'random');

        return `
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>Type</label>
                    <select class="widget-input" name="type" data-test="cfg-type">
                        <option value="square" ${type==='square'?'selected':''}>square</option>
                        <option value="sin"    ${type==='sin'?'selected':''}>sin</option>
                        <option value="cos"    ${type==='cos'?'selected':''}>cos</option>
                        <option value="linear" ${type==='linear'?'selected':''}>linear</option>
                        <option value="random" ${type==='random'?'selected':''}>random</option>
                    </select>
                </div>
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>min</label>
                    <input type="number" class="widget-input" name="min" value="${config.min ?? GENERATOR_DEFAULT_MIN}" data-test="cfg-min">
                </div>
                <div class="widget-config-field">
                    <label>max</label>
                    <input type="number" class="widget-input" name="max" value="${config.max ?? GENERATOR_DEFAULT_MAX}" data-test="cfg-max">
                </div>
            </div>
            <div class="widget-config-row gen-cfg-lin-sin-cos" data-test="cfg-row-step-pause" style="display:${showLinSinCos?'flex':'none'}">
                <div class="widget-config-field">
                    <label>step</label>
                    <input type="number" class="widget-input" name="step" value="${config.step ?? GENERATOR_DEFAULT_STEP}" data-test="cfg-step">
                </div>
                <div class="widget-config-field">
                    <label>pause (ms)</label>
                    <input type="number" class="widget-input" name="pause" value="${config.pause ?? GENERATOR_DEFAULT_PAUSE_MS}" min="${GENERATOR_MIN_PAUSE_MS}" data-test="cfg-pause">
                </div>
            </div>
            <div class="widget-config-row gen-cfg-square" data-test="cfg-row-square" style="display:${showSquare?'flex':'none'}">
                <div class="widget-config-field">
                    <label>pulseWidth (ms)</label>
                    <input type="number" class="widget-input" name="pulseWidth" value="${config.pulseWidth ?? GENERATOR_DEFAULT_PULSE_WIDTH_MS}" min="${GENERATOR_MIN_PULSE_WIDTH_MS}" data-test="cfg-pulseWidth">
                </div>
                <div class="widget-config-field">
                    <label>pause (ms)</label>
                    <input type="number" class="widget-input" name="pause-square" value="${config.pause ?? GENERATOR_DEFAULT_SQUARE_PAUSE_MS}" min="${GENERATOR_MIN_PAUSE_MS}" data-test="cfg-pause-square">
                </div>
            </div>
            <div class="widget-config-row gen-cfg-random" data-test="cfg-row-random" style="display:${showRandom?'flex':'none'}">
                <div class="widget-config-field">
                    <label>period (ms)</label>
                    <input type="number" class="widget-input" name="period" value="${config.period ?? GENERATOR_DEFAULT_PERIOD_MS}" min="${GENERATOR_MIN_PERIOD_MS}" data-test="cfg-period">
                </div>
            </div>
        `;
    }

    // initConfigHandlers ОВЕРРАЙДИМ для conditional полей по type.
    // ОБЯЗАТЕЛЬНО зовём super.initConfigHandlers (для autocomplete + IONC dropdown).
    static initConfigHandlers(form, config = {}) {
        super.initConfigHandlers(form, config);
        // Idempotency для нашего type listener'а
        if (form.dataset.genHandlersWired === 'true') return;
        form.dataset.genHandlersWired = 'true';

        const typeSelect = form.querySelector('[name="type"]');
        const rowLinSinCos = form.querySelector('[data-test="cfg-row-step-pause"]');
        const rowSquare    = form.querySelector('[data-test="cfg-row-square"]');
        const rowRandom    = form.querySelector('[data-test="cfg-row-random"]');
        if (!typeSelect) return;

        const updateConditional = () => {
            const t = typeSelect.value;
            if (rowLinSinCos) rowLinSinCos.style.display = (t === 'linear' || t === 'sin' || t === 'cos') ? 'flex' : 'none';
            if (rowSquare)    rowSquare.style.display    = (t === 'square') ? 'flex' : 'none';
            if (rowRandom)    rowRandom.style.display    = (t === 'random') ? 'flex' : 'none';
        };
        typeSelect.addEventListener('change', updateConditional);
        // Не вызываем сразу — initial display уже установлен через template style attr.
    }

    static parseActiveConfigFields(form) {
        const type = form.querySelector('[name="type"]')?.value || 'square';
        return normalizeSignalGeneratorConfig({
            type,
            min: form.querySelector('[name="min"]')?.value,
            max: form.querySelector('[name="max"]')?.value,
            step: form.querySelector('[name="step"]')?.value,
            pause: type === 'square'
                ? form.querySelector('[name="pause-square"]')?.value
                : form.querySelector('[name="pause"]')?.value,
            pulseWidth: form.querySelector('[name="pulseWidth"]')?.value,
            period: form.querySelector('[name="period"]')?.value,
        });
    }
}

window.GeneratorWidget = GeneratorWidget;
