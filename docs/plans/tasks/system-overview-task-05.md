# Task 3.1: Frontend модуль System Overview

Metadata:
- Dependencies: Task 01 (LiteGraph.js vendor), Task 02 (константы), Task 03+04 (backend endpoint)
- Provides: `ui/static/js/src/58-system-overview.js` -- основной модуль System Overview
- Size: Large (1 файл, но значительный объем кода ~300-400 строк)

## Содержание задачи

Реализовать основной frontend модуль System Overview: функцию `openSystemOverview()` для создания вкладки с LiteGraph.js canvas, кастомный тип узла `UniSetProcessNode`, fetch данных с backend, layout-алгоритм (топологическая сортировка) и кнопку Fit to Screen.

Это самая крупная задача проекта. Модуль включает:
1. Управление вкладкой (создание, переключение, закрытие)
2. Кастомный LiteGraph.js node type с отображением значений
3. Fetch данных и построение графа
4. Layout-алгоритм (topological sort left-to-right)
5. Кнопка Fit to Screen
6. ResizeObserver для адаптации canvas

## Целевые файлы
- [x] `ui/static/js/src/58-system-overview.js` (Create)

## Шаги реализации

### 1. Регистрация кастомного типа узла

- [x] Реализовать конструктор `UniSetProcessNode`:
  ```javascript
  function UniSetProcessNode() {
      this.portValues = {};    // name -> value
      this.prevValues = {};    // name -> previous value (для пульсации)
      this.pulseTimers = {};   // name -> timer id
  }
  UniSetProcessNode.title = "Process";
  ```
- [x] Реализовать `UniSetProcessNode.prototype.onDrawForeground(ctx)`:
  - Для каждого input/output порта рисовать текущее значение рядом с портом
  - Использовать `OVERVIEW_ACTIVE_COLOR` для ненулевых, `OVERVIEW_INACTIVE_COLOR` для нулевых
  - Форматировать числовые значения (целые без десятичных, дробные с точностью 2)
- [x] Зарегистрировать: `LiteGraph.registerNodeType("uniset/process", UniSetProcessNode)`
- [x] Обернуть регистрацию в проверку: `if (typeof LiteGraph !== 'undefined')`

### 2. Функция openSystemOverview(serverId, serverName)

- [x] Проверить наличие LiteGraph.js: если нет -- показать ошибку в tab content
- [x] Tab key: `${serverId}:overview`
- [x] Проверить существующую вкладку -- если есть, переключиться на неё
- [x] Создать новую вкладку через существующий API tab management (`50-ui-tabs.js`)
- [x] Создать DOM-структуру вкладки:
  ```html
  <div class="overview-container" style="width:100%;height:100%;position:relative;">
    <div class="overview-toolbar">
      <button class="overview-fit-btn">Fit to Screen</button>
    </div>
    <canvas id="overview-canvas-{serverId}"></canvas>
  </div>
  ```
- [x] Инициализировать `LGraph` и `LGraphCanvas`:
  ```javascript
  const graph = new LGraph();
  const canvas = new LGraphCanvas(canvasElement, graph);
  ```
- [x] Настроить canvas: темный фон, отключить редактирование (read-only)
- [x] Fetch данных: `GET /api/servers/${serverId}/overview`
- [x] Построить граф из ответа (buildGraph)
- [x] Применить layout
- [x] Запустить рендеринг: `graph.start()`

### 3. Построение графа из backend-данных (buildGraph)

- [x] Для каждого `node` из ответа:
  - Создать `LiteGraph.createNode("uniset/process")`
  - Установить `node.title = name`
  - Установить `node.size[0] = OVERVIEW_NODE_WIDTH`
  - Добавить inputs: `lgNode.addInput(port.name, "sensor")`
  - Добавить outputs: `lgNode.addOutput(port.name, "sensor")`
  - Установить начальные значения: `lgNode.portValues[port.name] = port.value`
  - Добавить в граф: `graph.add(lgNode)`
- [x] Для каждого `edge` из ответа:
  - Найти исходный узел и выходной слот по имени
  - Найти целевой узел и входной слот по имени
  - Создать соединение: `sourceNode.connect(outputSlot, targetNode, inputSlot)`

### 4. Layout-алгоритм (topological sort)

- [x] Реализовать алгоритм Кана для топологической сортировки:
  1. Построить directed graph из edges
  2. Вычислить in-degree для каждого узла
  3. Начать с узлов с in-degree == 0
  4. BFS: при удалении узла уменьшить in-degree соседей
  5. При цикле (не все узлы обработаны): fallback на алфавитный порядок
- [x] Назначить слои (layers): узлы без входящих -> layer 0, далее по BFS
- [x] Расположить узлы:
  ```javascript
  node.pos[0] = layer * OVERVIEW_NODE_HORIZONTAL_SPACING;
  node.pos[1] = indexInLayer * OVERVIEW_NODE_VERTICAL_SPACING;
  ```

### 5. Кнопка Fit to Screen

- [x] Реализовать функцию `fitToScreen(canvas, graph)`:
  - Вычислить bounding box всех узлов
  - Установить canvas offset и scale чтобы все узлы были видны
  - Добавить padding: `OVERVIEW_FIT_PADDING`
- [x] Привязать к кнопке в toolbar
- [x] Вызвать автоматически после первой загрузки

### 6. ResizeObserver

- [x] Добавить `ResizeObserver` на контейнер overview:
  ```javascript
  new ResizeObserver(() => {
      canvasElement.width = container.clientWidth;
      canvasElement.height = container.clientHeight;
      canvas.resize();
  }).observe(container);
  ```

### 7. Обработка ошибок

- [x] LiteGraph.js не загружен: показать сообщение "LiteGraph.js not loaded" в tab content
- [x] Fetch ошибка: показать сообщение об ошибке в tab content
- [x] Пустой ответ (0 nodes): показать информационное сообщение

### 8. Пересборка

- [x] `make app` для регенерации `app.js`
- [x] `make build` для полной сборки

## Критерии завершения
- [x] `openSystemOverview()` создает вкладку с canvas (AC F2)
- [x] Узлы и ребра рендерятся на основе backend-данных (AC F2, F3)
- [x] Значения отображаются на портах (AC F4 -- начальная загрузка)
- [x] Активные/неактивные порты визуально различимы (AC F5)
- [x] Layout размещает узлы left-to-right по слоям
- [x] Fit to Screen работает (AC F6)
- [x] Pan/zoom работают через LiteGraph.js (AC F6)
- [x] Повторный вызов переключает на существующую вкладку (не дублирует)
- [x] `make app` + `make build` успешны
- [ ] Верификация: L1 (Functional Operation -- визуальная проверка через dev-сервер)

## Команды верификации
```bash
# Пересборка JS
make app

# Полная сборка
make build

# Проверка что модуль попал в app.js
grep 'openSystemOverview' ui/static/js/app.js
grep 'UniSetProcessNode' ui/static/js/app.js

# Визуальная проверка через dev-сервер
docker compose up dev-viewer -d --build
# Открыть http://localhost:8000, проверить создание вкладки System Overview
```

## Заметки
- Область влияния: Новый файл `58-system-overview.js`, автоматически попадает в `app.js`
- Ограничения: Не модифицировать существующие JS модули в этой задаче
- Номер файла `58` -- в диапазоне 50-59 (UI functions) по CLAUDE.md
- Tab key формат: `${serverId}:overview` -- следует паттерну `${serverId}:${objectName}`
- LiteGraph.js API ключевые методы:
  - `new LGraph()` -- создание графа
  - `new LGraphCanvas(canvas, graph)` -- привязка к canvas
  - `LiteGraph.createNode("uniset/process")` -- создание узла
  - `node.addInput(name, type)` / `node.addOutput(name, type)` -- добавление портов
  - `sourceNode.connect(outputSlot, targetNode, inputSlot)` -- соединение
  - `graph.start()` -- запуск рендеринга
- Canvas должен быть read-only: `canvas.allow_interaction = true` но `canvas.allow_searchbox = false`
