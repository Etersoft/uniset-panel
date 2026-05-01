// ============================================================================
// SignalGenerator — общий движок генерации сигналов
// (square/sin/cos/linear/random) с lifecycle тиков.
//
// Используется IONC renderer'ом (20-ionc-renderer.js) и активными виджетами
// dashboard'а (61-active-generator.js).
//
// Контракт: pure value-functions + setInterval-менеджер + onTick колбэк.
// ============================================================================

const SIGNAL_GENERATOR_ALLOWED_TYPES = new Set(['square', 'sin', 'cos', 'linear', 'random']);

function getSignalGeneratorType(rawType) {
    return SIGNAL_GENERATOR_ALLOWED_TYPES.has(rawType) ? rawType : 'square';
}

function readSignalGeneratorNumber(raw, name, fallback) {
    return parseDecimalInputOrDefault(raw[name], fallback);
}

const SIGNAL_GENERATOR_TYPE_RULES = {
    linear: {
        validate({ readNumber, min, max }) {
            const pause = readNumber('pause');
            const step = readNumber('step');
            if (!Number.isFinite(pause) || !Number.isFinite(step)) {
                return 'Пауза и Шаг должны быть числами';
            }
            if (pause < GENERATOR_MIN_WAVE_PAUSE_MS) {
                return `Пауза должна быть не менее ${GENERATOR_MIN_WAVE_PAUSE_MS}мс`;
            }
            if (step === 0) {
                return 'Шаг не может быть равен 0';
            }
            if (Math.abs(step) > (max - min)) {
                return 'Шаг должен быть меньше или равен разности Max - Min';
            }
            return '';
        },
        normalize({ readNumber }) {
            const step = readNumber('step', GENERATOR_DEFAULT_LINEAR_STEP);
            return {
                step: step !== 0 ? step : GENERATOR_DEFAULT_LINEAR_STEP,
                pause: Math.max(GENERATOR_MIN_WAVE_PAUSE_MS, readNumber('pause', GENERATOR_DEFAULT_WAVE_PAUSE_MS)),
            };
        },
    },
    sin: {
        validate: validateWaveSignalGeneratorConfig,
        normalize: normalizeWaveSignalGeneratorConfig,
    },
    cos: {
        validate: validateWaveSignalGeneratorConfig,
        normalize: normalizeWaveSignalGeneratorConfig,
    },
    square: {
        validate({ readNumber }) {
            const pulseWidth = readNumber('pulseWidth');
            const pause = readNumber('pause');
            if (!Number.isFinite(pulseWidth) || !Number.isFinite(pause)) {
                return 'Ширина импульса и Пауза должны быть числами';
            }
            if (pulseWidth < GENERATOR_MIN_PULSE_WIDTH_MS) {
                return 'Ширина импульса должна быть больше 0';
            }
            if (pause < GENERATOR_MIN_PAUSE_MS) {
                return 'Пауза должна быть больше 0';
            }
            return '';
        },
        normalize({ readNumber }) {
            return {
                pulseWidth: Math.max(
                    GENERATOR_MIN_PULSE_WIDTH_MS,
                    readNumber('pulseWidth', GENERATOR_DEFAULT_PULSE_WIDTH_MS)
                ),
                pause: Math.max(GENERATOR_MIN_PAUSE_MS, readNumber('pause', GENERATOR_DEFAULT_SQUARE_PAUSE_MS)),
            };
        },
    },
    random: {
        validate({ readNumber }) {
            const period = readNumber('period');
            if (!Number.isFinite(period)) {
                return 'Период должен быть числом';
            }
            if (period < GENERATOR_MIN_PERIOD_MS) {
                return `Период должен быть не менее ${GENERATOR_MIN_PERIOD_MS}мс`;
            }
            return '';
        },
        normalize({ readNumber }) {
            return {
                period: Math.max(GENERATOR_MIN_PERIOD_MS, readNumber('period', GENERATOR_DEFAULT_RANDOM_PERIOD_MS)),
            };
        },
    },
};

function validateWaveSignalGeneratorConfig({ readNumber }) {
    const pause = readNumber('pause');
    const step = readNumber('step');
    if (!Number.isFinite(pause) || !Number.isFinite(step)) {
        return 'Шаг обновления и Количество точек должны быть числами';
    }
    if (pause < GENERATOR_MIN_WAVE_PAUSE_MS) {
        return `Шаг обновления должен быть не менее ${GENERATOR_MIN_WAVE_PAUSE_MS}мс`;
    }
    if (step < GENERATOR_MIN_WAVE_POINTS) {
        return `Количество точек должно быть не менее ${GENERATOR_MIN_WAVE_POINTS}`;
    }
    return '';
}

function normalizeWaveSignalGeneratorConfig({ readNumber }) {
    const points = Math.floor(Math.abs(readNumber('step', GENERATOR_DEFAULT_WAVE_POINTS)));
    return {
        step: Math.max(GENERATOR_MIN_WAVE_POINTS, points),
        pause: Math.max(GENERATOR_MIN_WAVE_PAUSE_MS, readNumber('pause', GENERATOR_DEFAULT_WAVE_PAUSE_MS)),
    };
}

function validateSignalGeneratorConfig(raw = {}) {
    const type = getSignalGeneratorType(raw.type);
    const readNumber = (name) => readSignalGeneratorNumber(raw, name, NaN);

    const min = readNumber('min');
    const max = readNumber('max');
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
        return 'Min и Max должны быть числами';
    }
    if (min >= max) {
        return 'Min должен быть меньше Max';
    }

    return SIGNAL_GENERATOR_TYPE_RULES[type].validate({ readNumber, min, max });
}

function normalizeSignalGeneratorConfig(raw = {}) {
    const type = getSignalGeneratorType(raw.type);
    const readNumber = (name, fallback) => readSignalGeneratorNumber(raw, name, fallback);

    const minRaw = readNumber('min', GENERATOR_DEFAULT_MIN);
    const maxRaw = readNumber('max', GENERATOR_DEFAULT_MAX);
    const min = Math.min(minRaw, maxRaw);
    let max = Math.max(minRaw, maxRaw);
    if (max === min) max = min + 1;

    return {
        type,
        min,
        max,
        ...SIGNAL_GENERATOR_TYPE_RULES[type].normalize({ readNumber, min, max }),
    };
}

class SignalGenerator {
    /**
     * @param {Object} cfg
     * @param {string} cfg.type   'square' | 'sin' | 'cos' | 'linear' | 'random'
     * @param {number} cfg.min
     * @param {number} cfg.max
     * @param {number} [cfg.step]         для linear/sin/cos
     * @param {number} [cfg.pause]        для linear/sin/cos/square (мс)
     * @param {number} [cfg.pulseWidth]   для square (мс)
     * @param {number} [cfg.period]       для random (мс)
     * @param {Function} cfg.onTick       (value) => void
     */
    constructor(cfg) {
        this.type = cfg.type;
        this.min = cfg.min;
        this.max = cfg.max;
        this.step = cfg.step;
        this.pause = cfg.pause;
        this.pulseWidth = cfg.pulseWidth;
        this.period = cfg.period;
        this.onTick = cfg.onTick;

        this.intervalId = null;
        this.startTime = 0;
    }

    // Интервал обновления подбирается по типу — ~20 обновлений за период.
    computeUpdateInterval() {
        if (this.type === 'square') {
            return Math.max(
                SIGNAL_GENERATOR_MIN_UPDATE_INTERVAL_MS,
                Math.floor((this.pulseWidth + this.pause) / SIGNAL_GENERATOR_TICKS_PER_PERIOD)
            );
        }
        if (this.type === 'linear' || this.type === 'sin' || this.type === 'cos') {
            return Math.max(this.pause, SIGNAL_GENERATOR_MIN_UPDATE_INTERVAL_MS);
        }
        // random
        return Math.max(
            SIGNAL_GENERATOR_MIN_UPDATE_INTERVAL_MS,
            Math.floor(this.period / SIGNAL_GENERATOR_TICKS_PER_PERIOD)
        );
    }

    // Чистая функция — текущее значение по elapsed-ms от startTime.
    computeValue(elapsed) {
        const range = this.max - this.min;
        let value;

        switch (this.type) {
            case 'sin':
            case 'cos': {
                const numPoints = this.step;
                const fullCycle = numPoints * this.pause;
                const positionInCycle = elapsed % fullCycle;
                const pointIndex = Math.floor(positionInCycle / this.pause);
                const phase = (pointIndex / numPoints) * 2 * Math.PI;
                const wave = this.type === 'sin' ? Math.sin(phase) : Math.cos(phase);
                value = Math.round(this.min + (wave + 1) / 2 * range);
                break;
            }
            case 'linear': {
                const absStep = Math.abs(this.step);
                const numStepsFirst = Math.floor(range / absStep) + 1;
                const numStepsSecond = Math.floor(range / absStep) - 1;
                const totalSteps = numStepsFirst + numStepsSecond;
                const fullCycle = totalSteps * this.pause;
                const positionInCycle = elapsed % fullCycle;
                const stepNumber = Math.floor(positionInCycle / this.pause);

                if (this.step > 0) {
                    if (stepNumber < numStepsFirst) {
                        value = this.min + stepNumber * absStep;
                    } else {
                        const downStepNumber = stepNumber - numStepsFirst;
                        value = this.max - (downStepNumber + 1) * absStep;
                    }
                } else {
                    if (stepNumber < numStepsFirst) {
                        value = this.max - stepNumber * absStep;
                    } else {
                        const upStepNumber = stepNumber - numStepsFirst;
                        value = this.min + (upStepNumber + 1) * absStep;
                    }
                }
                break;
            }
            case 'random': {
                value = Math.round(this.min + Math.random() * range);
                break;
            }
            case 'square': {
                const totalPeriod = this.pulseWidth + this.pause;
                const positionInCycle = elapsed % totalPeriod;
                value = positionInCycle < this.pulseWidth ? this.max : this.min;
                break;
            }
            default:
                value = this.min;
        }

        return Math.max(this.min, Math.min(this.max, value));
    }

    start() {
        if (this.intervalId !== null) return; // уже запущен
        this.startTime = Date.now();

        const tick = () => {
            const value = this.computeValue(Date.now() - this.startTime);
            try {
                this.onTick(value);
            } catch (e) {
                console.error('SignalGenerator: onTick error', e);
            }
        };

        this.intervalId = setInterval(tick, this.computeUpdateInterval());
        tick(); // первое значение сразу
    }

    stop() {
        if (this.intervalId !== null) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    isRunning() {
        return this.intervalId !== null;
    }
}

// Экспорт в глобальную область (соответствует style остальных файлов src/)
window.SignalGenerator = SignalGenerator;
window.validateSignalGeneratorConfig = validateSignalGeneratorConfig;
window.normalizeSignalGeneratorConfig = normalizeSignalGeneratorConfig;
