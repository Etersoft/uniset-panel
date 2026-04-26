# Dashboard Active Controls — Foundation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-04-26-dashboard-active-controls-design.md`

**Goal:** Заложить инфраструктуру для активных виджетов dashboard'а: вынести signal-generator engine из IONC renderer'а в общий модуль и создать базовый класс `ActiveDashboardWidget` с поддержкой write/feedback/edit-mode/состояний.

**Architecture:** Чистый extract-refactor для генератора (без изменения внешнего поведения IONC) + новый базовый класс по существующему паттерну (`DashboardWidget` → наследники с `static type`). Backend изменений нет. Тесты — Playwright E2E, проверяемые через `make js-tests`.

**Tech Stack:** ES6-классы, существующие глобалы (`controlledFetch`, `dashboardState`, `state.control`), Playwright + Docker для E2E, `go run ui/concat.go` для сборки `app.js`.

**E2E command note:** Сервис `e2e` в `docker-compose.yml` принимает аргументы (после фикса entrypoint в Phase 1.0): `docker compose run --rm e2e <spec...>` запустит только указанные spec'ы. Без аргументов — запускает всю suite (`single/` + `integration/`), как при `docker compose up e2e`.

**Scope notes:**
- Этот план НЕ реализует конкретные активные виджеты (toggle/checkbox/button/setpoint/generator) — для каждого будет свой план после согласования дизайна.
- `WIDGET_TYPES` в `62-dashboard-manager.js` НЕ модифицируется в этом плане (нет регистрируемых типов).
- Smoke-тестирование базового класса делается через минимальный test-only widget, регистрируемый только в e2e-страницах через `window.__DEBUG_REGISTER_TEST_WIDGET()`.

---

## File Structure

| Файл | Действие | Ответственность |
|---|---|---|
| `ui/static/js/src/08-signal-generator.js` | **Create** | Класс `SignalGenerator` — функции вычисления (square/sin/cos/linear/random) + lifecycle тиков + колбэк `onTick` |
| `ui/static/js/src/00-constants.js` | **Modify** | Добавить `WRITE_PENDING_TIMEOUT_MS`, `WRITE_SUCCESS_DISPLAY_MS` |
| `ui/static/js/src/20-ionc-renderer.js` | **Modify** | Заменить локальные `startGenerator/generateValue/stopGenerator` на использование `SignalGenerator`. Поведение наблюдаемо неизменно |
| `ui/static/js/src/61-dashboard-active-base.js` | **Create** | Класс `ActiveDashboardWidget extends DashboardWidget` — write/feedback/edit-mode/состояния/getConfigForm extension |
| `ui/static/js/src/62-dashboard-manager.js` | **Modify** | Добавить хук `window.__DEBUG_REGISTER_TEST_WIDGET()` для e2e (в самом конце файла) |
| `ui/static/css/style.css` | **Modify** | Стили `.dashboard-widget.active-pending|success|error|disabled` + индикатор расхождения command/feedback |
| `tests/single/dashboard-active-base.spec.ts` | **Create** | Smoke E2E: создать dashboard с test-only виджетом, проверить write→feedback→state cycle, edit-mode disable, controlToken interaction |
| `tests/mock-server/server.js` | **Modify (по необходимости)** | Если приём POST .../ionc/set ещё не симулирует SSE feedback — добавить |
| `CLAUDE.md` | **Modify** | Раздел про dashboard widgets — упомянуть `ActiveDashboardWidget` и где он живёт |

`ui/concat.go` уже подхватывает все `*.js` в `src/` через Glob+sort, поэтому новые файлы попадают в `app.js` без правки `concat.go` или `Makefile`.

---

# Phase 1 — Generator Engine Extraction

Цель фазы: вынести логику генератора сигналов в `08-signal-generator.js`, рефакторить `20-ionc-renderer.js` так, чтобы поведение IONC генератора оставалось наблюдаемо неизменным (`tests/single/generator.spec.ts` продолжает проходить).

### Task 1.1: Baseline — IONC generator e2e зелёный до изменений

**Files:**
- Read: `tests/single/generator.spec.ts`

- [ ] **Step 1: Убедиться что мы на ветке `story/dashboard-active-controls`**

Run: `git branch --show-current`
Expected: `story/dashboard-active-controls`

Если нет — `git checkout story/dashboard-active-controls`.

- [ ] **Step 2: Запустить baseline E2E генератора**

Сначала остановить dev-профиль:

Run: `docker compose --profile dev down`

Затем запустить только generator e2e тест:

Run: `docker compose run --rm e2e single/generator.spec.ts`
Expected: PASS (все assertions зелёные)

Если упали — выяснить, чинятся ли они до начала рефакторинга (фиксить **до** Task 1.2). Не идти дальше с красным baseline'ом.

- [ ] **Step 3: Зафиксировать baseline-результат**

Заметить (для самопроверки в Task 1.5) количество прошедших assertions и время выполнения генераторных тестов. Никаких файловых изменений на этом шаге.

---

### Task 1.2: Создать `08-signal-generator.js` с классом `SignalGenerator`

**Files:**
- Create: `ui/static/js/src/08-signal-generator.js`

- [ ] **Step 1: Создать файл `08-signal-generator.js`**

Содержимое:

```javascript
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
```

- [ ] **Step 2: Проверить что concat подхватывает новый файл**

Run: `cd ui && go run concat.go && cd ..`
Expected: вывод `Generated static/js/app.js from N files` — N увеличилось на 1 vs предыдущей сборки.

- [ ] **Step 3: Проверить что `SignalGenerator` доступен в браузере**

Запустить dev-сервер:

Run: `docker compose up dev-viewer -d --build`

Открыть `http://localhost:8000`, в DevTools console:

```javascript
typeof SignalGenerator
```

Expected: `"function"`.

Останавливаем dev-viewer перед e2e:

Run: `docker compose down`

- [ ] **Step 4: Commit**

```bash
git add ui/static/js/src/08-signal-generator.js ui/static/js/app.js
git commit -m "feat(dashboard): add SignalGenerator engine module

Чистая extract-фаза: новый файл с классом SignalGenerator
(вычисление значений + lifecycle тиков). Пока никем не используется.
Следующий шаг — рефактор IONC renderer'а на этот класс.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 1.3: Рефактор IONC renderer'а — переключить на `SignalGenerator`

**Files:**
- Modify: `ui/static/js/src/20-ionc-renderer.js:1189-1470` (методы `startGenerator`, `generateValue` (inline), `stopGenerator`, и связанная логика `setValueForGenerator`/`activeGenerators`)

- [ ] **Step 1: Прочитать текущую реализацию `startGenerator` и `stopGenerator`**

Прочитать `ui/static/js/src/20-ionc-renderer.js` строки 1189-1470 целиком, чтобы понимать что не должно потеряться: валидация параметров, `saveGeneratorPreferences`, `setChartStepped`, `reRenderSensorRow`, `closeIoncDialog`.

- [ ] **Step 2: Заменить inline `generateValue` + `setInterval` на `SignalGenerator`**

В `startGenerator(sensorId)` после блока валидации параметров (после `this.stopGenerator(sensorId)` около строки 1278), заменить блок построения `genState` + inline `generateValue` + `setInterval` (строки ~1280-1417) на:

```javascript
const sensorIdLocal = sensorId;
const objectName = this.objectName;
const self = this;

const generator = new SignalGenerator({
    type, min, max, step, pause, pulseWidth, period,
    onTick: (value) => {
        self.setValueForGenerator(sensorIdLocal, value);
    }
});

// Сохраняем минимальное состояние для UI (start time для отладки, тип для setChartStepped)
const genState = {
    sensorId: sensorIdLocal,
    type,
    min,
    max,
    startTime: Date.now(),
    generator,        // ссылка на SignalGenerator
};

// Тип-специфичные параметры — для отображения и сохранения preferences
if (type === 'linear' || type === 'sin' || type === 'cos') {
    genState.pause = pause;
    genState.step = step;
} else if (type === 'square') {
    genState.pulseWidth = pulseWidth;
    genState.pause = pause;
} else {
    genState.period = period;
}

generator.start();
this.activeGenerators.set(sensorIdLocal, genState);

if (type === 'square') {
    this.setChartStepped(sensorIdLocal, true);
}

this.reRenderSensorRow(sensorIdLocal);
```

(Сохранения preferences, `closeIoncDialog()` — оставить как есть, после этого блока.)

- [ ] **Step 3: Обновить `stopGenerator(sensorId)`**

В методе `stopGenerator(sensorId)` (строки ~1449-1462) заменить `clearInterval(genState.intervalId)` на `genState.generator.stop()`:

```javascript
stopGenerator(sensorId) {
    const genState = this.activeGenerators.get(sensorId);
    if (genState) {
        if (genState.generator) {
            genState.generator.stop();
        }
        if (genState.type === 'square') {
            this.setChartStepped(sensorId, null);
        }
        this.activeGenerators.delete(sensorId);
        this.reRenderSensorRow(sensorId);
    }
}
```

(Точный текущий код вокруг — прочитать на Step 1; убрать только строку с `clearInterval(genState.intervalId)`, остальное сохранить.)

- [ ] **Step 4: Обновить общий `stopAllGenerators` (если есть)**

Около строки 1465 — массовая остановка генераторов. Проверить и заменить аналогично:

```javascript
this.activeGenerators.forEach((genState) => {
    if (genState.generator) genState.generator.stop();
});
this.activeGenerators.clear();
```

- [ ] **Step 5: Пересобрать `app.js`**

Run: `make app`
Expected: вывод `Generated static/js/app.js from N files`.

- [ ] **Step 6: Прогнать generator E2E**

Run: `docker compose run --rm e2e single/generator.spec.ts`
Expected: PASS — все те же assertions, что в Task 1.1 baseline.

Если упало — починить (наиболее вероятно: пропущенный параметр в SignalGenerator-конструкторе или забытый side-effect, который был в inline-версии). Не двигаться дальше с красным.

- [ ] **Step 7: Прогнать также `ionotifycontroller.spec.ts` для уверенности**

Run: `docker compose run --rm e2e single/ionotifycontroller.spec.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add ui/static/js/src/20-ionc-renderer.js ui/static/js/app.js
git commit -m "refactor(ionc): use SignalGenerator engine for generator UI

Заменяем inline генератор в startGenerator/stopGenerator на общий
класс SignalGenerator. Поведение наблюдаемо неизменно — generator e2e
и ionotifycontroller e2e продолжают проходить.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

# Phase 2 — ActiveDashboardWidget Base Class

Цель: создать базовый класс с контрактом write/feedback/edit-mode/состояний; никаких регистраций в `WIDGET_TYPES` (виджеты — отдельные планы).

### Task 2.1: Константы для состояний записи

**Files:**
- Modify: `ui/static/js/src/00-constants.js`

- [ ] **Step 1: Прочитать текущий `00-constants.js`**

Run: открыть файл, найти подходящее место для новой группы (например, в конце файла или в секции «UI timeouts»).

- [ ] **Step 2: Добавить константы**

В `00-constants.js`, в подходящей секции (или в конце файла), добавить:

```javascript
// ============================================================================
// Active dashboard widgets — состояния записи
// ============================================================================

// Сколько ждать ответа от POST /ionc/set до показа состояния error.
const WRITE_PENDING_TIMEOUT_MS = 5000;

// Сколько отображать состояние "success" (зелёный индикатор) после удачной записи,
// прежде чем вернуться в idle.
const WRITE_SUCCESS_DISPLAY_MS = 1500;
```

- [ ] **Step 3: Пересобрать `app.js`**

Run: `make app`
Expected: успешная сборка.

- [ ] **Step 4: Commit**

```bash
git add ui/static/js/src/00-constants.js ui/static/js/app.js
git commit -m "feat(dashboard): add WRITE_* constants for active widget states

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.2: Каркас `ActiveDashboardWidget`

**Files:**
- Create: `ui/static/js/src/61-dashboard-active-base.js`

- [ ] **Step 1: Создать файл с минимальным каркасом класса**

```javascript
// ============================================================================
// ActiveDashboardWidget — базовый класс для активных (write-capable) виджетов.
//
// Наследуется от DashboardWidget. Добавляет:
//   - writeValue(value): запись через controlledFetch на /api/objects/.../ionc/set
//   - writeState: 'idle' | 'pending' | 'success' | 'error'
//   - commandValue: последняя команда, отправленная пользователем
//   - feedbackValue: текущее значение датчика от сервера (= this.value базового класса)
//   - isInteractive(): false в edit mode
//   - needsConfirmation(): читает config.requireConfirmation
//   - getConfigForm()/parseConfigForm(): расширяемые через
//     getActiveConfigFields()/parseActiveConfigFields() в наследниках
//
// Конкретные виджеты (toggle/checkbox/button/setpoint/generator) реализуются
// в отдельных файлах 61-active-*.js и регистрируются в WIDGET_TYPES.
// ============================================================================

class ActiveDashboardWidget extends DashboardWidget {
    static type = 'active-base';
    static displayName = 'Active Widget (base)';
    static description = 'Base class for write-capable widgets';

    constructor(id, config, container) {
        super(id, config, container);
        this.commandValue = null;
        this.feedbackValue = null;
        this.writeState = 'idle';
        this._writeStateTimer = null;
        this._pendingTimeoutTimer = null;
    }

    // ===== SSE feedback =====
    update(value, error = null) {
        this.feedbackValue = value;
        this.value = value;
        this.error = error;
        this.renderFeedback();
    }

    // ===== Write =====
    async writeValue(value) {
        if (!this.isInteractive()) return;
        if (this.needsConfirmation() && !await this._confirm(value)) return;

        this.commandValue = value;
        this._setWriteState('pending');

        const sensor = this.config?.sensor;
        if (!sensor) {
            this._setWriteState('error', 'Sensor not configured');
            return;
        }

        const serverId = this._resolveServerId();
        if (!serverId) {
            this._setWriteState('error', 'No connected server');
            return;
        }

        const url = `/api/objects/SharedMemory/ionc/set?server=${encodeURIComponent(serverId)}`;
        try {
            const resp = await controlledFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sensor_id: sensor, value })
            });
            if (!resp.ok) {
                const data = await resp.json().catch(() => ({}));
                this._setWriteState('error', data.error || `HTTP ${resp.status}`);
                return;
            }
            this._setWriteState('success');
        } catch (e) {
            this._setWriteState('error', e.message);
        }
    }

    // ===== State helpers =====
    _setWriteState(state, message = '') {
        this.writeState = state;
        this._lastWriteMessage = message;

        // Обновить CSS-классы контейнера виджета
        const root = this.container || this.element;
        if (root) {
            root.classList.remove('active-pending', 'active-success', 'active-error');
            if (state !== 'idle') {
                root.classList.add(`active-${state}`);
            }
            root.title = message;
        }

        // Очистить предыдущие таймеры
        clearTimeout(this._writeStateTimer);
        clearTimeout(this._pendingTimeoutTimer);
        this._writeStateTimer = null;
        this._pendingTimeoutTimer = null;

        if (state === 'pending') {
            // Защитный таймаут — если сервер молчит, переводим в error.
            this._pendingTimeoutTimer = setTimeout(() => {
                if (this.writeState === 'pending') {
                    this._setWriteState('error', 'Write timed out');
                }
            }, WRITE_PENDING_TIMEOUT_MS);
        } else if (state === 'success') {
            // Через WRITE_SUCCESS_DISPLAY_MS возвращаемся в idle.
            this._writeStateTimer = setTimeout(() => {
                if (this.writeState === 'success') {
                    this._setWriteState('idle');
                }
            }, WRITE_SUCCESS_DISPLAY_MS);
        }

        this.renderCommand(); // command может зависеть от state (например opacity)
    }

    // ===== Edit-mode / control gating =====
    isInteractive() {
        if (typeof dashboardState !== 'undefined' && dashboardState.editMode) return false;
        if (typeof canControl === 'function' && !canControl()) return false;
        return true;
    }

    needsConfirmation() {
        return !!this.config?.requireConfirmation;
    }

    async _confirm(value) {
        // Простой confirm — конкретные виджеты могут override на красивый dialog.
        return window.confirm(`Set ${this.config?.sensor || 'sensor'} = ${value}?`);
    }

    _resolveServerId() {
        // Берём первый подключённый сервер (как делает dashboard для чтения).
        if (typeof state === 'undefined' || !state.servers) return null;
        for (const [id, server] of state.servers) {
            if (server.connected) return id;
        }
        return null;
    }

    // ===== Render hooks (override в наследниках) =====
    renderCommand() {
        // Override: показать commandValue в DOM.
    }

    renderFeedback() {
        // Override: показать feedbackValue в DOM.
    }

    // ===== Config form extension =====
    static getConfigForm(config = {}) {
        const baseFields = `
            <div class="widget-config-field">
                <label>Sensor</label>
                <input type="text" class="widget-input" name="sensor"
                       value="${escapeHtml(config.sensor || '')}"
                       placeholder="Type to search..." autocomplete="off">
            </div>
            <div class="widget-config-field">
                <label>Label</label>
                <input type="text" class="widget-input" name="label"
                       value="${escapeHtml(config.label || '')}" placeholder="Display label">
            </div>
            <div class="widget-config-field">
                <label class="widget-checkbox-label">
                    <input type="checkbox" name="requireConfirmation"
                           ${config.requireConfirmation ? 'checked' : ''}>
                    <span>Require confirmation before write</span>
                </label>
            </div>
        `;
        return baseFields + (this.getActiveConfigFields ? this.getActiveConfigFields(config) : '');
    }

    static getActiveConfigFields(config = {}) {
        // Override: дополнительные поля специфичные для виджета.
        return '';
    }

    static parseConfigForm(form) {
        const base = {
            sensor: form.querySelector('[name="sensor"]')?.value || '',
            label: form.querySelector('[name="label"]')?.value || '',
            requireConfirmation: form.querySelector('[name="requireConfirmation"]')?.checked || false,
        };
        const extra = this.parseActiveConfigFields ? this.parseActiveConfigFields(form) : {};
        return { ...base, ...extra };
    }

    static parseActiveConfigFields(form) {
        // Override: разобрать поля из getActiveConfigFields().
        return {};
    }

    destroy() {
        clearTimeout(this._writeStateTimer);
        clearTimeout(this._pendingTimeoutTimer);
        super.destroy();
    }
}

window.ActiveDashboardWidget = ActiveDashboardWidget;
```

- [ ] **Step 2: Пересобрать app.js**

Run: `make app`
Expected: успешная сборка.

- [ ] **Step 3: Sanity-check в браузере**

Run: `docker compose up dev-viewer -d --build`

В консоли браузера на `http://localhost:8000`:

```javascript
typeof ActiveDashboardWidget       // "function"
ActiveDashboardWidget.prototype instanceof DashboardWidget  // true
```

Останавливаем:

Run: `docker compose down`

- [ ] **Step 4: Commit**

```bash
git add ui/static/js/src/61-dashboard-active-base.js ui/static/js/app.js
git commit -m "feat(dashboard): add ActiveDashboardWidget base class

Базовый класс для будущих write-capable виджетов: writeValue через
controlledFetch, writeState (idle/pending/success/error), edit-mode
disable, requireConfirmation. Конкретные виджеты будут отдельными
файлами 61-active-*.js в следующих планах.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

# Phase 3 — CSS состояний

### Task 3.1: Стили активных состояний

**Files:**
- Modify: `ui/static/css/style.css`

- [ ] **Step 1: Найти секцию dashboard-widget стилей**

Run: `grep -n "dashboard-widget" ui/static/css/style.css | head -10`

Найти подходящее место для добавления (после существующих `.dashboard-widget` rules).

- [ ] **Step 2: Добавить стили**

В конец секции dashboard-widget (или в новую секцию `/* Active widgets */` в конце файла) добавить:

```css
/* ============================================================================
 * Active dashboard widgets — состояния записи
 * ============================================================================ */

.dashboard-widget.active-pending {
    /* Полупрозрачность во время POST */
    opacity: 0.7;
    filter: grayscale(0.3);
    transition: opacity 0.15s, filter 0.15s;
}

.dashboard-widget.active-success {
    /* Кратковременная зелёная подсветка границы */
    box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.6);
    transition: box-shadow 0.2s;
}

.dashboard-widget.active-error {
    /* Постоянная красная подсветка до следующей попытки */
    box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.8);
    transition: box-shadow 0.2s;
}

/* В edit mode активные виджеты обесцвечиваются — пользователь видит,
   что клики не записывают, а открывают конфиг. */
.dashboard-grid.edit-mode .dashboard-widget[data-type^="active-"]:not(.label-widget):not(.divider-widget) {
    filter: grayscale(0.5);
    opacity: 0.85;
}

/* Когда controlToken не активен — визуально блокированный виджет с курсором. */
.dashboard-widget.active-disabled,
.dashboard-widget[data-type^="active-"][data-control-blocked="true"] {
    cursor: not-allowed;
    opacity: 0.6;
}

/* Индикатор расхождения command vs feedback (точка в углу виджета).
   Конкретные виджеты могут позиционировать .command-feedback-dot внутри
   через свой layout. По умолчанию — справа сверху. */
.command-feedback-dot {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #6b7280;          /* серый — нет команды / совпадает */
    pointer-events: none;
}
.command-feedback-dot.match    { background: #22c55e; }   /* зелёный — feedback совпал с command */
.command-feedback-dot.diverge  { background: #f59e0b; }   /* жёлтый — расхождение */
.command-feedback-dot.errored  { background: #ef4444; }   /* красный — последняя запись с ошибкой */
```

- [ ] **Step 3: Smoke-проверка отсутствия CSS-ошибок**

Run: `docker compose up dev-viewer -d --build`

Открыть `http://localhost:8000`, в DevTools → Elements убедиться, что страница рендерится без визуальных regression'ов на пассивных виджетах. Закрыть.

Run: `docker compose down`

- [ ] **Step 4: Commit**

```bash
git add ui/static/css/style.css
git commit -m "feat(dashboard): add CSS for active widget states

active-pending/success/error/disabled + .command-feedback-dot.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

# Phase 4 — Smoke E2E через test-only widget

### Task 4.1: Хук для регистрации test-only виджета

**Files:**
- Modify: `ui/static/js/src/62-dashboard-manager.js` (в самый конец файла)

- [ ] **Step 1: Добавить debug-хук в конец файла**

В самый конец `62-dashboard-manager.js` (после всех существующих `class`/`function` определений и любых init-блоков) добавить:

```javascript
// ============================================================================
// DEBUG: регистрация test-only виджета для e2e тестов базового класса.
// Только Playwright-тесты вызывают это. Не использовать в production.
// ============================================================================
window.__DEBUG_REGISTER_TEST_WIDGET = function () {
    if (WIDGET_TYPES['test-active']) return;

    class TestActiveWidget extends ActiveDashboardWidget {
        static type = 'test-active';
        static displayName = 'TEST Active';
        static description = 'TEST-ONLY: smoke widget for ActiveDashboardWidget base';
        static icon = '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16"/></svg>';
        static defaultSize = { width: 4, height: 2 };

        render() {
            this.element = document.createElement('div');
            this.element.className = 'widget-content test-active-widget';
            this.element.innerHTML = `
                <button class="test-active-btn" data-test="write-btn">SET 42</button>
                <div class="test-active-feedback" data-test="feedback">--</div>
                <div class="test-active-command" data-test="command">--</div>
                <div class="test-active-state" data-test="state">idle</div>
            `;
            this.container.appendChild(this.element);

            this.element.querySelector('[data-test="write-btn"]').addEventListener('click', () => {
                this.writeValue(42);
            });
        }

        renderCommand() {
            const el = this.element?.querySelector('[data-test="command"]');
            if (el) el.textContent = String(this.commandValue ?? '--');
            const stateEl = this.element?.querySelector('[data-test="state"]');
            if (stateEl) stateEl.textContent = this.writeState;
        }

        renderFeedback() {
            const el = this.element?.querySelector('[data-test="feedback"]');
            if (el) el.textContent = String(this.feedbackValue ?? '--');
        }

        static getActiveConfigFields() { return ''; }
        static parseActiveConfigFields() { return {}; }
    }

    WIDGET_TYPES['test-active'] = TestActiveWidget;
};
```

- [ ] **Step 2: Пересобрать app.js**

Run: `make app`
Expected: успешная сборка.

- [ ] **Step 3: Sanity-check**

Run: `docker compose up dev-viewer -d --build`

В консоли браузера:

```javascript
window.__DEBUG_REGISTER_TEST_WIDGET();
typeof WIDGET_TYPES['test-active']    // "function"
```

Run: `docker compose down`

- [ ] **Step 4: Commit**

```bash
git add ui/static/js/src/62-dashboard-manager.js ui/static/js/app.js
git commit -m "feat(dashboard): add __DEBUG_REGISTER_TEST_WIDGET hook

E2E-only хук для регистрации TestActiveWidget — позволяет smoke-тестам
проверять поведение ActiveDashboardWidget без необходимости реального
производственного виджета.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.2: Smoke E2E для базового класса

**Files:**
- Create: `tests/single/dashboard-active-base.spec.ts`
- Read (для образца): `tests/single/dashboard.spec.ts`, `tests/single/dashboard-sse.spec.ts`

- [ ] **Step 1: Изучить существующие dashboard-тесты для образца**

Run: `head -60 tests/single/dashboard.spec.ts`

Заметить: как открывается страница, как ждётся загрузка, как создаётся dashboard.

- [ ] **Step 2: Написать test файл (FAIL — виджет не зарегистрирован пока тест не вызовет хук)**

Создать `tests/single/dashboard-active-base.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

const APP_URL = process.env.APP_URL || 'http://viewer:8000';

test.describe('ActiveDashboardWidget — base class smoke', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(APP_URL);
        await page.waitForFunction(() => typeof window.dashboardState !== 'undefined');
        // Регистрируем test-only widget
        await page.evaluate(() => window.__DEBUG_REGISTER_TEST_WIDGET());
    });

    test('writeValue: POST → pending → success → idle', async ({ page }) => {
        // Перехватываем POST /ionc/set
        const postPromise = page.waitForRequest(req =>
            req.url().includes('/ionc/set') && req.method() === 'POST'
        );

        // Создаём dashboard через manager API + ставим test-active виджет
        await page.evaluate(() => {
            const dm = window.dashboardManagerInstance || (window.dashboardManager = new DashboardManager());
            // Создаём дашборд напрямую через state
            const cfg = {
                meta: { name: 'TEST_BASE', description: '' },
                widgets: [{
                    id: 'test-1',
                    type: 'test-active',
                    config: { sensor: 'AI_Test_S' },
                    position: { col: 0, row: 0, width: 4, height: 2 },
                }],
            };
            window.dashboardState.dashboards.set('TEST_BASE', cfg);
            dm.loadDashboard('TEST_BASE');
        });

        // Переключиться на view dashboard
        await page.evaluate(() => window.switchView('dashboard'));

        // Найти кнопку и нажать
        const widgetBtn = page.locator('[data-test="write-btn"]').first();
        await expect(widgetBtn).toBeVisible();
        await widgetBtn.click();

        // Проверить POST ушёл с правильным телом
        const req = await postPromise;
        const body = JSON.parse(req.postData() || '{}');
        expect(body.sensor_id).toBe('AI_Test_S');
        expect(body.value).toBe(42);

        // Проверить состояние state переходит pending → success → idle
        await expect(page.locator('[data-test="state"]').first()).toHaveText('pending');
        await expect(page.locator('[data-test="state"]').first()).toHaveText('success', { timeout: 3000 });
        await expect(page.locator('[data-test="state"]').first()).toHaveText('idle', { timeout: 3000 });
    });

    test('edit mode: клик не вызывает write', async ({ page }) => {
        // Регистрируем виджет (как в beforeEach уже сделано)
        await page.evaluate(() => {
            const dm = window.dashboardManagerInstance || (window.dashboardManager = new DashboardManager());
            const cfg = {
                meta: { name: 'TEST_EDIT', description: '' },
                widgets: [{
                    id: 'test-1',
                    type: 'test-active',
                    config: { sensor: 'AI_Test_S' },
                    position: { col: 0, row: 0, width: 4, height: 2 },
                }],
            };
            window.dashboardState.dashboards.set('TEST_EDIT', cfg);
            dm.loadDashboard('TEST_EDIT');
            window.switchView('dashboard');
            window.dashboardState.editMode = true; // включить edit
        });

        // Перехват не должен сработать
        let requestSent = false;
        page.on('request', req => {
            if (req.url().includes('/ionc/set')) requestSent = true;
        });

        await page.locator('[data-test="write-btn"]').first().click();
        await page.waitForTimeout(500);

        expect(requestSent).toBe(false);
    });
});
```

- [ ] **Step 3: Запустить тест — должен FAIL (без `__DEBUG_REGISTER_TEST_WIDGET` или CSS-классов могут быть проблемы)**

Run: `docker compose run --rm e2e single/dashboard-active-base.spec.ts`
Expected: FAIL — на каком-то assertion'е (либо POST не той структуры, либо state не переключается, либо selectors не совпадают). Это ОК — это RED фаза TDD.

- [ ] **Step 4: Починить под реальное поведение**

Прочитать output упавшего теста. Возможные расхождения:
- `dashboardManagerInstance` имя глобала может отличаться — проверить в `62-dashboard-manager.js` как singleton выставлен. Если он не глобален — использовать `new DashboardManager()` каждый раз НЕ ПОДОЙДЁТ (повторное навешивание событий). Использовать существующий: смотреть в `99-init.js` как создаётся менеджер.
- URL `/ionc/set` может требовать `?server=...` — это уже есть в `writeValue` (`_resolveServerId`).
- Кнопка может быть невидимой если widget не отрендерился — проверить, что dashboard switched into view mode и виджет создался.

Применить точечные правки в test'е до зелёного.

- [ ] **Step 5: Запустить тест ещё раз — PASS**

Run: `docker compose run --rm e2e single/dashboard-active-base.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/single/dashboard-active-base.spec.ts
git commit -m "test(dashboard): smoke E2E for ActiveDashboardWidget base class

Через test-only TestActiveWidget проверяем write-flow (POST/state cycle)
и edit-mode disable.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

# Phase 5 — Документация

### Task 5.1: Дополнить CLAUDE.md разделом об активных виджетах

**Files:**
- Modify: `CLAUDE.md` (раздел про JavaScript модули или новый раздел Dashboard)

- [ ] **Step 1: Найти подходящее место в CLAUDE.md**

Run: `grep -n "Dashboard\|61-dashboard\|WIDGET_TYPES" CLAUDE.md | head -10`

Найти подходящую секцию. Если её нет — добавить новую секцию `## Dashboard widgets` после секции «JavaScript модули».

- [ ] **Step 2: Добавить параграф**

Вставить:

```markdown
### Active dashboard widgets

Для записи значений в датчики (toggle/checkbox/button/setpoint/generator)
используется базовый класс `ActiveDashboardWidget` (`61-dashboard-active-base.js`).
Наследники реализуются в файлах `61-active-*.js` и регистрируются в
`WIDGET_TYPES` (`62-dashboard-manager.js`).

**Контракт:**
- `writeValue(value)` — POST через `controlledFetch` на `/api/objects/SharedMemory/ionc/set?server=...`
- `update(value, error)` — приходит от SSE (handler в dashboard-manager), обновляет `feedbackValue`
- `commandValue` / `feedbackValue` — раздельное хранение «команда vs обратная связь»
- `writeState`: `idle | pending | success | error` — отображается через CSS-классы `active-*` на контейнере
- `isInteractive()` — `false` в edit mode и при отсутствии controlToken
- `requireConfirmation` — опция в конфиге, по умолчанию выкл.

**Generator engine:** общий движок генерации сигналов (`SignalGenerator`,
файл `08-signal-generator.js`) переиспользуется IONC renderer'ом
(`20-ionc-renderer.js`) и активным generator-виджетом dashboard'а.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document ActiveDashboardWidget and SignalGenerator

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

# Phase 6 — Финальная проверка

### Task 6.1: Полный прогон затронутых E2E тестов

- [ ] **Step 1: Прогнать связанные spec'ы**

Run:
```bash
docker compose run --rm e2e \
  single/generator.spec.ts \
  single/ionotifycontroller.spec.ts \
  single/dashboard.spec.ts \
  single/dashboard-sse.spec.ts \
  single/dashboard-widgets.spec.ts \
  single/dashboard-active-base.spec.ts
```
Expected: все PASS.

- [ ] **Step 2: Если что-то упало — починить, не ломая контракт**

Анализировать output, чинить точечно. Не двигаться дальше с красным.

- [ ] **Step 3: Полный прогон (опционально — если есть время)**

Run: `make js-tests`
Expected: PASS.

(Этот шаг тяжёлый по времени. Если в Step 1 всё зелёное — можно отложить полный прогон до момента слияния в master.)

---

## Закрытие плана

После Phase 6 этот план завершён. Дальше — отдельные планы для каждого виджета:

- `2026-04-XX-dashboard-active-toggle.md` (после согласования визуала toggle)
- `2026-04-XX-dashboard-active-checkbox.md`
- `2026-04-XX-dashboard-active-button.md`
- `2026-04-XX-dashboard-active-setpoint.md`
- `2026-04-XX-dashboard-active-generator.md`

Каждый из них:
1. Brainstorm дизайна (с visual companion при необходимости)
2. Согласование с пользователем
3. Свой writing-plan
4. Реализация по plan'у

В каждом widget-плане:
- Конкретный класс `XxxWidget extends ActiveDashboardWidget`
- Override `render()` / `renderCommand()` / `renderFeedback()`
- Override `static getActiveConfigFields()` / `static parseActiveConfigFields()`
- Регистрация в `WIDGET_TYPES`
- E2E-тест per виджет

---

## Self-Review

**Spec coverage:**
- ✅ Generator engine extract — Phase 1
- ✅ ActiveDashboardWidget base class — Phase 2 (Task 2.2)
- ✅ writeValue через controlledFetch — Task 2.2
- ✅ writeState (idle/pending/success/error) — Task 2.2 + 3.1
- ✅ Two-way binding (commandValue/feedbackValue + render hooks) — Task 2.2
- ✅ requireConfirmation (опция, по умолчанию выкл.) — Task 2.2
- ✅ Edit mode disable — Task 2.2 (`isInteractive()`) + 3.1 (CSS)
- ✅ controlToken integration — Task 2.2 (`canControl()`)
- ✅ CSS состояний — Phase 3
- ✅ Smoke E2E — Phase 4
- ✅ Документация — Phase 5
- ⚠️ Реализация конкретных виджетов (toggle/checkbox/etc.) — НЕ в этом плане, по дизайну (отдельные планы)
- ⚠️ Mock-сервер расширение — упомянуто как «по необходимости»; конкретные правки появятся, когда первый виджет потребует SSE-feedback симуляции

**Placeholder scan:** одно «по необходимости» в File Structure (для mock-сервера) — оправдано: для smoke-теста базового класса SSE-feedback не обязателен (тесты Phase 4 проверяют write-flow, а feedback-flow тестируется отдельно с реальным виджетом).

**Type consistency:** `commandValue`, `feedbackValue`, `writeState`, `_setWriteState`, `_resolveServerId`, `getActiveConfigFields`, `parseActiveConfigFields`, `renderCommand`, `renderFeedback`, `__DEBUG_REGISTER_TEST_WIDGET` — везде используются единообразно.
