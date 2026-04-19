# Task 4.2: SSE realtime-обновление

Metadata:
- Dependencies: Task 05 (основной модуль `58-system-overview.js` должен существовать)
- Provides: SSE callback для обновления значений на портах в реальном времени
- Size: Small (1 файл -- модификация)

## Содержание задачи

Добавить обработку SSE событий `object_data` для обновления значений на портах диаграммы System Overview в реальном времени. При получении SSE события обновляются значения на портах соответствующего узла, пересчитываются цвета ребер (active/inactive), запускается pulse-анимация при изменении значения.

## Целевые файлы
- [ ] `ui/static/js/src/58-system-overview.js` (Modify)

## Шаги реализации

### 1. Подготовка
- [ ] Прочитать существующий `04-sse.js` для понимания формата SSE событий
- [ ] Изучить формат `object_data` события:
  ```javascript
  // event.data содержит:
  {
      serverID: "...",
      objectName: "...",
      data: {
          io: {
              in: { "sensorName": { id: N, name: "sensorName", value: V }, ... },
              out: { "sensorName": { id: N, name: "sensorName", value: V }, ... }
          }
      }
  }
  ```

### 2. Хранение состояния overview-графов
- [ ] Добавить Map для хранения активных overview-графов:
  ```javascript
  // В модуле 58-system-overview.js
  const overviewGraphs = new Map(); // serverId -> { graph, nodeMap, canvas }
  ```
- [ ] При создании overview-вкладки сохранять ссылки в `overviewGraphs`
- [ ] При закрытии вкладки удалять из `overviewGraphs`

### 3. SSE callback для обновления портов
- [ ] Реализовать функцию `updateOverviewFromSSE(serverID, objectName, ioData)`:
  1. Проверить: есть ли открытая overview-вкладка для данного `serverID`
  2. Найти узел с именем `objectName` в `nodeMap`
  3. Для каждого input/output в `ioData`:
     - Сравнить новое значение с `prevValues[portName]`
     - Обновить `portValues[portName]`
     - Если значение изменилось -- запустить pulse
  4. `graph.setDirtyCanvas(true)` для перерисовки

### 4. Pulse-анимация
- [ ] При изменении значения:
  ```javascript
  // Установить pulse-флаг
  node.pulseTimers[portName] = setTimeout(() => {
      delete node.pulseTimers[portName];
      graph.setDirtyCanvas(true);
  }, OVERVIEW_PULSE_DURATION_MS);
  ```
- [ ] В `onDrawForeground`: если `pulseTimers[portName]` существует, рисовать с увеличенной яркостью/толщиной

### 5. Обновление цветов ребер
- [ ] Пересчитать цвета ребер после обновления значений:
  - Ребро активно (зеленое) если значение на source-порту ненулевое
  - Ребро неактивно (серое) если значение нулевое
- [ ] Использовать LiteGraph.js API для установки цвета link:
  ```javascript
  link.color = isActive ? OVERVIEW_ACTIVE_COLOR : OVERVIEW_INACTIVE_COLOR;
  ```

### 6. Интеграция с SSE обработчиком
- [ ] Зарегистрировать callback для SSE событий `object_data`:
  - Вариант A: Добавить вызов `updateOverviewFromSSE()` в существующий обработчик `object_data` в `04-sse.js`
  - Вариант B: Подписаться на события через существующий механизм (если есть event bus)
  - Предпочтительно: вызов из обработчика SSE в `04-sse.js` или регистрация callback при создании overview
- [ ] Callback должен проверять `overviewGraphs.has(serverID)` перед обработкой

### 7. Пересборка
- [ ] `make app` для регенерации `app.js`

## Критерии завершения
- [ ] SSE обновления отражаются на canvas (AC F4)
- [ ] Пульсация видна при изменении значения (AC F5)
- [ ] Цвета ребер корректно переключаются: active (зеленый) / inactive (серый) (AC F5)
- [ ] Задержка обновления не более poll interval + 1s
- [ ] `make app` успешен
- [ ] Верификация: L1 (Functional Operation -- проверка через dev-сервер с живым UniSet2)

## Команды верификации
```bash
# Пересборка JS
make app

# Полная сборка
make build

# Проверка что callback зарегистрирован
grep 'updateOverviewFromSSE\|overviewGraphs' ui/static/js/app.js

# Визуальная проверка через dev-сервер
docker compose up dev-viewer -d --build
# Открыть System Overview, наблюдать обновление значений в реальном времени
```

## Заметки
- Область влияния: `58-system-overview.js` + возможно `04-sse.js` (если требуется добавить вызов callback'а)
- Ограничения: Не менять логику существующих SSE обработчиков
- Watch для объектов сервера уже вызывается backend'ом при GET overview (Task 03), поэтому SSE события `object_data` уже приходят
- При закрытии вкладки overview НЕ вызывать unwatch (по Design Doc -- нет reference counting)
- `prevValues` сохраняются на узле для сравнения при следующем обновлении
- LiteGraph.js автоматически перерисовывает canvas через requestAnimationFrame, достаточно вызвать `setDirtyCanvas(true)`
