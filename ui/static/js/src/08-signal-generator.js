// ============================================================================
// SignalGenerator — общий движок генерации сигналов
// (square/sin/cos/linear/random) с lifecycle тиков.
//
// Используется IONC renderer'ом (20-ionc-renderer.js) и активными виджетами
// dashboard'а (61-active-generator.js).
//
// Контракт: pure value-functions + setInterval-менеджер + onTick колбэк.
// ============================================================================

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
            return Math.max(50, Math.floor((this.pulseWidth + this.pause) / 20));
        }
        if (this.type === 'linear' || this.type === 'sin' || this.type === 'cos') {
            return Math.min(this.pause, 50);
        }
        // random
        return Math.max(50, Math.floor(this.period / 20));
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
