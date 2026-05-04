// ============================================================================
// IONC Test-Signal feature — diagnostic UI to inject periodic test signals
// (sin/cos/square/linear/random) into a SharedMemory sensor through
// /api/objects/{name}/ionc/set. Используется наладчиками на стенде.
//
// Файл — mixin поверх IONotifyControllerRenderer (объявлен в 20-ionc-renderer.js).
// Лексикографически 20-ionc-test-signal.js идёт ПОСЛЕ 20-ionc-renderer.js,
// поэтому класс уже определён к моменту вызова applyMixin.
//
// Public methods (зовутся из row event handlers и destroy):
//   - showSensorTestSignalDialog(sensorId)
//   - startSensorTestSignal(sensorId)         (зовётся внутри dialog OK)
//   - stopSensorTestSignal(sensorId)
//   - stopAllSensorTestSignals()              (destroy)
//   - activeSensorTestSignals                 (Map<sensorId, state>) — UI state
// ============================================================================

const IoncTestSignalMixin = {

    // ===== Defaults / preferences =====

    getDefaultTestSignalParams() {
        return {
            sin: {
                min:   GENERATOR_DEFAULT_WAVE_MIN,
                max:   GENERATOR_DEFAULT_WAVE_MAX,
                pause: GENERATOR_DEFAULT_WAVE_PAUSE_MS,
                step:  GENERATOR_DEFAULT_WAVE_POINTS,
            },
            cos: {
                min:   GENERATOR_DEFAULT_WAVE_MIN,
                max:   GENERATOR_DEFAULT_WAVE_MAX,
                pause: GENERATOR_DEFAULT_WAVE_PAUSE_MS,
                step:  GENERATOR_DEFAULT_WAVE_POINTS,
            },
            linear: {
                min:   GENERATOR_DEFAULT_MIN,
                max:   GENERATOR_DEFAULT_MAX,
                pause: GENERATOR_DEFAULT_WAVE_PAUSE_MS,
                step:  GENERATOR_DEFAULT_LINEAR_STEP,
            },
            random: {
                min:    GENERATOR_DEFAULT_MIN,
                max:    GENERATOR_DEFAULT_MAX,
                period: GENERATOR_DEFAULT_RANDOM_PERIOD_MS,
            },
            square: {
                min:        GENERATOR_DEFAULT_MIN,
                max:        GENERATOR_DEFAULT_MAX,
                pulseWidth: GENERATOR_DEFAULT_IONC_SQUARE_PULSE_WIDTH_MS,
                pause:      GENERATOR_DEFAULT_IONC_SQUARE_PAUSE_MS,
            },
        };
    },

    // localStorage key 'ionc-gen-preferences' оставлен — миграция данных не нужна.
    loadTestSignalPreferences() {
        const newPrefs = localStorage.getItem('ionc-gen-preferences');
        if (newPrefs) {
            try { return JSON.parse(newPrefs); }
            catch (e) { console.error('Failed to parse test-signal preferences:', e); }
        }
        // Миграция со старого формата
        const oldType = localStorage.getItem('ionc-gen-last-type');
        if (oldType) {
            const prefs = { lastType: oldType, params: this.getDefaultTestSignalParams() };
            localStorage.setItem('ionc-gen-preferences', JSON.stringify(prefs));
            localStorage.removeItem('ionc-gen-last-type');
            return prefs;
        }
        return { lastType: 'sin', params: this.getDefaultTestSignalParams() };
    },

    saveTestSignalPreferences(type, params) {
        const prefs = this.loadTestSignalPreferences();
        prefs.lastType = type;
        prefs.params[type] = params;
        localStorage.setItem('ionc-gen-preferences', JSON.stringify(prefs));
    },

    // ===== Form helpers (вызываются из dialog change handlers) =====

    _updateTestSignalCalculatedPeriod() {
        const calcPeriodValue = document.getElementById('ionc-gen-calc-period-value');
        const pauseInput = document.getElementById('ionc-gen-period');
        const pointsInput = document.getElementById('ionc-gen-step');
        if (!calcPeriodValue || !pauseInput || !pointsInput) return;

        const pause = parseIntegerOrDefault(pauseInput.value, 0);
        const points = parseIntegerOrDefault(pointsInput.value, 0);
        const totalPeriod = pause * points;
        if (totalPeriod > 0) {
            const seconds = (totalPeriod / 1000).toFixed(1);
            calcPeriodValue.textContent = `${totalPeriod} мс (${seconds} сек)`;
        } else {
            calcPeriodValue.textContent = '-';
        }
    },

    _updateTestSignalFormFields(type) {
        const periodField = document.getElementById('ionc-gen-period-field');
        const stepField = document.getElementById('ionc-gen-step-field');
        const pulseFields = document.getElementById('ionc-gen-pulse-fields');
        const calcPeriodField = document.getElementById('ionc-gen-calc-period');
        const periodLabel = document.getElementById('ionc-gen-period-label');
        const periodHint = document.getElementById('ionc-gen-period-hint');
        const stepLabel = document.getElementById('ionc-gen-step-label');
        const stepHint = document.getElementById('ionc-gen-step-hint');

        if (!periodField || !stepField || !pulseFields) return;

        // Скрываем все условные поля
        periodField.style.display = 'none';
        stepField.style.display = 'none';
        pulseFields.style.display = 'none';
        if (calcPeriodField) calcPeriodField.style.display = 'none';

        if (type === 'linear') {
            // linear: пилообразный с шагом-инкрементом
            periodField.style.display = 'block';
            stepField.style.display = 'block';
            if (periodLabel) periodLabel.textContent = 'Пауза между шагами (мс)';
            if (periodHint) periodHint.textContent = `Задержка перед следующим шагом. Мин: ${GENERATOR_MIN_WAVE_PAUSE_MS}мс`;
            if (stepLabel) stepLabel.textContent = 'Шаг';
            if (stepHint) stepHint.textContent = 'Размер одного шага изменения значения';
        } else if (type === 'sin' || type === 'cos') {
            periodField.style.display = 'block';
            stepField.style.display = 'block';
            if (calcPeriodField) calcPeriodField.style.display = 'block';
            if (periodLabel) periodLabel.textContent = 'Пауза между точками (мс)';
            if (periodHint) periodHint.textContent = `Задержка между точками синусоиды. Мин: ${GENERATOR_MIN_WAVE_PAUSE_MS}мс`;
            if (stepLabel) stepLabel.textContent = 'Точек в периоде';
            if (stepHint) stepHint.textContent = `Кол-во точек на полный цикл. Мин: ${GENERATOR_MIN_WAVE_POINTS}`;
            this._updateTestSignalCalculatedPeriod();
        } else if (type === 'square') {
            // square: ширина импульса + пауза
            pulseFields.style.display = 'block';
        } else {
            // random
            periodField.style.display = 'block';
            if (periodLabel) periodLabel.textContent = 'Период (мс)';
            if (periodHint) periodHint.textContent = 'Длительность полного цикла. Мин: 100мс';
        }
    },

    // ===== Dialog =====

    showSensorTestSignalDialog(sensorId) {
        const sensor = this.sensorMap.get(sensorId);
        if (!sensor) return;
        const existing = this.activeSensorTestSignals.get(sensorId);

        const body = this._buildTestSignalDialogBody(sensor, sensorId, existing);
        const footer = this._buildTestSignalDialogFooter(existing);

        openIoncDialog({
            title: existing ? 'Тестовый сигнал активен' : 'Тестовый сигнал датчика',
            body,
            footer,
            focusInput: !existing,
        });

        this._wireTestSignalDialogHandlers(sensorId, existing);
    },

    _buildTestSignalDialogBody(sensor, sensorId, existing) {
        const frozenWarning = sensor.frozen
            ? `<div class="ionc-dialog-warning">Датчик заморожен. Значения будут записываться в SM, но не отобразятся до разморозки.</div>`
            : '';
        const sensorInfo = `
            <div class="ionc-dialog-info">
                Датчик: <strong>${escapeHtml(sensor.name)}</strong> (ID: ${sensorId})<br>
                Текущее значение: <strong>${sensor.value}</strong>
            </div>
        `;
        const main = existing
            ? this._renderActiveTestSignalBlock(existing)
            : this._renderTestSignalSetupForm();
        return `${sensorInfo}${frozenWarning}${main}`;
    },

    _renderActiveTestSignalBlock(existing) {
        const info = `${existing.type} (min: ${existing.min}, max: ${existing.max}`;
        const timing = existing.type === 'square'
            ? `, импульс: ${existing.pulseWidth}мс, пауза: ${existing.pause}мс)`
            : (existing.type === 'linear' || existing.type === 'sin' || existing.type === 'cos')
                ? `, пауза: ${existing.pause}мс, шаг: ${existing.step})`
                : `, период: ${existing.period}мс)`;
        return `
            <div class="ionc-dialog-warning ionc-dialog-warning-active">
                <strong>Тестовый сигнал активен:</strong> ${info}${timing}
            </div>
        `;
    },

    _renderTestSignalSetupForm() {
        const prefs = this.loadTestSignalPreferences();
        const lastType = prefs.lastType;
        const params = prefs.params[lastType] || this.getDefaultTestSignalParams()[lastType];

        const typeOptions = [
            { value: 'sin',    label: 'sin(t) - Синусоида' },
            { value: 'cos',    label: 'cos(t) - Косинусоида' },
            { value: 'linear', label: 'linear - Пилообразный' },
            { value: 'random', label: 'random - Случайные значения' },
            { value: 'square', label: 'square - Прямоугольный' },
        ];
        const optionsHtml = typeOptions.map(o =>
            `<option value="${o.value}"${o.value === lastType ? ' selected' : ''}>${o.label}</option>`
        ).join('');

        return `
            <div class="ionc-dialog-field">
                <label for="ionc-gen-type">Тип функции:</label>
                <select id="ionc-gen-type" class="ionc-dialog-select">
                    ${optionsHtml}
                </select>
            </div>
            <div class="ionc-dialog-field-row">
                <div class="ionc-dialog-field ionc-dialog-field-half">
                    <label for="ionc-gen-min">Min:</label>
                    <input type="number" id="ionc-gen-min" value="${params.min}">
                </div>
                <div class="ionc-dialog-field ionc-dialog-field-half">
                    <label for="ionc-gen-max">Max:</label>
                    <input type="number" id="ionc-gen-max" value="${params.max}">
                </div>
            </div>
            <div class="ionc-dialog-field" id="ionc-gen-period-field">
                <label for="ionc-gen-period"><span id="ionc-gen-period-label">Период (мс)</span>:</label>
                <input type="number" id="ionc-gen-period" value="${params.period || params.pause || GENERATOR_DEFAULT_RANDOM_PERIOD_MS}" step="100">
                <div class="ionc-dialog-hint" id="ionc-gen-period-hint">Длительность полного цикла. Мин: ${GENERATOR_MIN_PERIOD_MS}мс</div>
            </div>
            <div class="ionc-dialog-field" id="ionc-gen-step-field" style="display: none;">
                <label for="ionc-gen-step"><span id="ionc-gen-step-label">Шаг</span>:</label>
                <input type="number" id="ionc-gen-step" value="${params.step || GENERATOR_DEFAULT_WAVE_POINTS}" step="1">
                <div class="ionc-dialog-hint" id="ionc-gen-step-hint">Размер одного шага изменения значения</div>
            </div>
            <div class="ionc-dialog-field" id="ionc-gen-calc-period" style="display: none;">
                <div class="ionc-dialog-hint" style="color: #4a9eff; font-weight: 500;">
                    💡 Полный период: <span id="ionc-gen-calc-period-value">-</span>
                </div>
            </div>
            <div id="ionc-gen-pulse-fields" style="display: none;">
                <div class="ionc-dialog-field-row">
                    <div class="ionc-dialog-field ionc-dialog-field-half">
                        <label for="ionc-gen-pulse-width">Ширина импульса (мс):</label>
                        <input type="number" id="ionc-gen-pulse-width" value="${params.pulseWidth || GENERATOR_DEFAULT_IONC_SQUARE_PULSE_WIDTH_MS}" step="100" min="${GENERATOR_MIN_PULSE_WIDTH_MS}">
                    </div>
                    <div class="ionc-dialog-field ionc-dialog-field-half">
                        <label for="ionc-gen-pause">Пауза (мс):</label>
                        <input type="number" id="ionc-gen-pause" value="${params.pause || GENERATOR_DEFAULT_IONC_SQUARE_PAUSE_MS}" step="100" min="${GENERATOR_MIN_PAUSE_MS}">
                    </div>
                </div>
                <div class="ionc-dialog-hint">Период = Ширина импульса + Пауза</div>
            </div>
        `;
    },

    _buildTestSignalDialogFooter(existing) {
        return existing ? `
            <button class="ionc-dialog-btn ionc-dialog-btn-cancel" onclick="closeIoncDialog()">Закрыть</button>
            <button class="ionc-dialog-btn ionc-dialog-btn-danger" id="ionc-gen-stop">Остановить</button>
        ` : `
            <button class="ionc-dialog-btn ionc-dialog-btn-cancel" onclick="closeIoncDialog()">Отмена</button>
            <button class="ionc-dialog-btn ionc-dialog-btn-primary" id="ionc-gen-start">Запустить</button>
        `;
    },

    _wireTestSignalDialogHandlers(sensorId, existing) {
        if (existing) {
            document.getElementById('ionc-gen-stop')?.addEventListener('click', () => {
                this.stopSensorTestSignal(sensorId);
                closeIoncDialog();
            });
            return;
        }

        document.getElementById('ionc-gen-start')?.addEventListener('click', () => {
            this.startSensorTestSignal(sensorId);
        });

        const typeSelect = document.getElementById('ionc-gen-type');
        if (typeSelect) {
            typeSelect.addEventListener('change', (e) => {
                this._updateTestSignalFormFields(e.target.value);
            });
            this._updateTestSignalFormFields(typeSelect.value);
        }

        // Автоматический расчёт периода для sin/cos
        const pauseInput = document.getElementById('ionc-gen-period');
        const pointsInput = document.getElementById('ionc-gen-step');
        if (pauseInput && pointsInput) {
            const updateCalc = () => this._updateTestSignalCalculatedPeriod();
            pauseInput.addEventListener('input', updateCalc);
            pointsInput.addEventListener('input', updateCalc);
        }
    },

    // ===== Start/stop =====

    startSensorTestSignal(sensorId) {
        const sensor = this.sensorMap.get(sensorId);
        if (!sensor) return;

        const selectedType = document.getElementById('ionc-gen-type').value;
        const rawConfig = {
            type: selectedType,
            min: document.getElementById('ionc-gen-min').value,
            max: document.getElementById('ionc-gen-max').value,
            step: document.getElementById('ionc-gen-step')?.value,
            pause: selectedType === 'square'
                ? document.getElementById('ionc-gen-pause')?.value
                : document.getElementById('ionc-gen-period')?.value,
            pulseWidth: document.getElementById('ionc-gen-pulse-width')?.value,
            period: document.getElementById('ionc-gen-period')?.value,
        };
        const validationError = validateSignalGeneratorConfig(rawConfig);
        if (validationError) {
            showIoncDialogError(validationError);
            return;
        }

        const genConfig = normalizeSignalGeneratorConfig(rawConfig);
        const { type, min, max, step, pause, pulseWidth, period } = genConfig;

        // Останавливаем существующий test signal если есть
        this.stopSensorTestSignal(sensorId);

        const generator = new SignalGenerator({
            ...genConfig,
            onTick: (value) => this._writeTestSignalValue(sensorId, value),
        });

        // Минимальное состояние для UI: тип (для setChartStepped), min/max +
        // тип-специфичные параметры (для отображения "active" баннера и
        // сохранения preferences).
        const state = { sensorId, type, min, max, generator };
        if (type === 'linear' || type === 'sin' || type === 'cos') {
            state.pause = pause;
            state.step = step;
        } else if (type === 'square') {
            state.pulseWidth = pulseWidth;
            state.pause = pause;
        } else {
            state.period = period;
        }

        generator.start();
        this.activeSensorTestSignals.set(sensorId, state);

        // Square = меандр → stepped chart.
        if (type === 'square') this._setChartSteppedForTestSignal(sensorId, true);

        this.reRenderSensorRow(sensorId);

        // Save preferences (params без `generator` ссылки).
        let params = { min, max };
        if (type === 'linear' || type === 'sin' || type === 'cos') {
            params.pause = pause;
            params.step = step;
        } else if (type === 'square') {
            params.pulseWidth = pulseWidth;
            params.pause = pause;
        } else {
            params.period = period;
        }
        this.saveTestSignalPreferences(type, params);

        closeIoncDialog();
    },

    async _writeTestSignalValue(sensorId, value) {
        try {
            const url = this.buildUrl(`/api/objects/${encodeURIComponent(this.objectName)}/ionc/set`);
            await controlledFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sensor_id: sensorId, value }),
            });
        } catch (err) {
            console.error('TestSignal: ошибка установки значения', err);
        }
    },

    stopSensorTestSignal(sensorId) {
        const state = this.activeSensorTestSignals.get(sensorId);
        if (!state) return;
        if (state.generator) state.generator.stop();
        if (state.type === 'square') {
            this._setChartSteppedForTestSignal(sensorId, null); // вернуть к isDiscrete
        }
        this.activeSensorTestSignals.delete(sensorId);
        this.reRenderSensorRow(sensorId);
    },

    stopAllSensorTestSignals() {
        this.activeSensorTestSignals.forEach((state) => {
            if (state.generator) state.generator.stop();
        });
        this.activeSensorTestSignals.clear();
    },

    // Установка stepped режима для графика сенсора (для square test signal).
    // stepped: true=включить, false=выключить, null=вернуть к isDiscrete.
    _setChartSteppedForTestSignal(sensorId, stepped) {
        const sensor = this.sensorMap.get(sensorId);
        if (!sensor) return;
        const tabState = state.tabs.get(this.tabKey);
        if (!tabState) return;
        const varName = `io:${sensor.name}`;
        const chartData = tabState.charts.get(varName);
        if (!chartData) return;

        let newStepped;
        if (stepped === null) {
            newStepped = chartData.isDiscrete ? 'before' : false;
        } else {
            newStepped = stepped ? 'before' : false;
        }
        chartData.chart.data.datasets[0].stepped = newStepped;
        chartData.chart.update('none');
    },
};

// Apply mixin к IONotifyControllerRenderer (объявлен в 20-ionc-renderer.js;
// этот файл загружается лексикографически после).
if (typeof IONotifyControllerRenderer !== 'undefined') {
    applyMixin(IONotifyControllerRenderer, IoncTestSignalMixin);
}
