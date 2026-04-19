# ADR: Выбор библиотеки для визуализации диаграммы System Overview

## Status

Proposed

## Context

Для фичи "System Overview" необходимо визуализировать межпроцессный поток данных системы UniSet2 в виде blueprint-диаграммы: процессы как узлы с портами входов/выходов, связи между процессами через совпадение имен датчиков. Диаграмма должна поддерживать pan/zoom, отображение значений в реальном времени, подсветку активных связей.

Ключевые требования к библиотеке:
- Рендеринг узлов с именованными портами (inputs/outputs) в стиле blueprint
- Отрисовка ребер (connections) между портами
- Pan/zoom (перемещение и масштабирование)
- Программное обновление значений на портах (SSE realtime)
- Работа без фреймворков (vanilla JS, конкатенация модулей)
- Допустимый размер (vendor-файл, без npm в runtime)
- MIT или аналогичная лицензия

## Decision

Использовать **LiteGraph.js** (jagenjo/litegraph.js, v0.7.15) как vendor-библиотеку для рендеринга blueprint-диаграммы System Overview.

> **Примечание о версии**: Последний релиз jagenjo/litegraph.js -- v0.7.15 (2021). Существует активный fork от Comfy-Org, но он содержит ComfyUI-специфичный код. Для vendor используем оригинальный v0.7.15 -- библиотека самодостаточна и не требует обновлений из upstream. При необходимости исправлений -- создаем собственный fork.

### Decision Details

| Item | Content |
|------|---------|
| **Decision** | Подключить LiteGraph.js (~480KB) как vendor-файл для Canvas2D рендеринга blueprint-диаграммы |
| **Why now** | System Overview -- новая фича, требующая выбора библиотеки визуализации до начала реализации |
| **Why this** | Единственная из рассмотренных библиотек, которая из коробки предоставляет blueprint-стиль узлов с портами, pan/zoom, Canvas2D рендеринг и zero dependencies -- при MIT лицензии и размере ~480KB |
| **Known unknowns** | Степень кастомизации визуального стиля узлов через Canvas2D API (без DOM); поведение при 50+ узлах с 2000+ портами |
| **Kill criteria** | Если LiteGraph.js не позволит отобразить значения на портах или кастомизировать цвета ребер через свой API -- потребуется fork или миграция на альтернативу |

## Rationale

### Options Considered

#### Option 1: Pure SVG (ручная реализация)

- **Overview**: Собственная реализация графового рендерера на SVG с нуля
- **Pros**:
  - Полный контроль над визуальным стилем и поведением
  - Нулевой размер зависимостей
  - DOM-доступ к каждому элементу (удобно для event handling)
- **Cons**:
  - Высокая трудоемкость: pan/zoom, drag, layout, edge routing -- все с нуля (оценка: 3-4 недели)
  - SVG плохо масштабируется при сотнях элементов (перерисовка DOM)
  - Багоемкость собственного графового движка
- **Effort**: 15-20 дней

#### Option 2: Cytoscape.js

- **Overview**: Мощная библиотека для графовой визуализации и анализа
- **Pros**:
  - Богатая экосистема layout-алгоритмов (dagre, cola, elk)
  - Отличная документация и сообщество
  - Поддержка стилизации через CSS-подобный синтаксис
- **Cons**:
  - Не имеет концепции "портов" на узлах -- ребра соединяют узлы, а не порты (критично для blueprint-стиля)
  - Размер: ~600KB (без layout плагинов)
  - Для blueprint-стиля потребуется значительная кастомизация или свой рендерер узлов
- **Effort**: 7-10 дней

#### Option 3: Rete.js

- **Overview**: Фреймворк для визуального программирования с node-based editor
- **Pros**:
  - Развитая система портов и соединений
  - Модульная архитектура с плагинами
  - Активная разработка
- **Cons**:
  - Требует фреймворк (React/Vue/Angular) -- не совместим с vanilla JS архитектурой проекта
  - Тяжелая экосистема: core + render plugin + connection plugin + множество peer dependencies
  - Размер: 200KB+ (только core), реально 500KB+ с плагинами
- **Effort**: 8-12 дней (включая адаптацию к vanilla JS)

#### Option 4: JointJS (Rappid)

- **Overview**: SVG-библиотека для диаграмм с drag-and-drop
- **Pros**:
  - Нативная поддержка портов на элементах
  - Развитый API для создания кастомных элементов
  - SVG-рендеринг с доступом к DOM
- **Cons**:
  - Двойное лицензирование: бесплатная версия (MPL 2.0) с ограничениями, полная версия платная
  - Зависимость от jQuery (устаревшая архитектура)
  - Размер: ~400KB + jQuery ~90KB
- **Effort**: 5-7 дней

#### Option 5: Drawflow

- **Overview**: Легковесный flow-editor с drag-and-drop
- **Pros**:
  - Компактный (~15KB)
  - Простой API
  - Zero dependencies
- **Cons**:
  - Минимальная кастомизация визуального стиля
  - Нет поддержки именованных портов (только numbered inputs/outputs)
  - Нет canvas-рендеринга -- использует HTML/CSS, проблемы масштабируемости
  - Не поддерживает программное обновление значений на портах
- **Effort**: 5-7 дней (с доработками)

#### Option 6: LiteGraph.js (Selected)

- **Overview**: Canvas2D graph node engine в стиле UDK Blueprints, ~480KB, MIT, zero dependencies
- **Pros**:
  - Из коробки blueprint-стиль: узлы с заголовками, именованные порты (inputs/outputs), ребра с цветами
  - Canvas2D рендеринг -- оптимизирован для сотен узлов
  - Встроенный pan/zoom (колесо мыши + drag)
  - Программный API: `node.addInput()`, `node.addOutput()`, `graph.connect()`, custom drawing через `onDrawForeground`
  - Zero dependencies, один файл, MIT лицензия
  - Используется в ComfyUI (подтвержденная масштабируемость)
- **Cons**:
  - Canvas2D: нет DOM-доступа внутри узлов (стилизация только через Canvas API)
  - ~480KB размер (приемлемо как vendor-файл, но не минимален)
  - Ограниченное сообщество по сравнению с Cytoscape.js; основной fork (Comfy-Org) переориентирован на ComfyUI
  - Нет встроенного auto-layout (потребуется собственный простой layout)
- **Effort**: 4-6 дней

## Comparison

| Evaluation Axis | Pure SVG | Cytoscape.js | Rete.js | JointJS | Drawflow | LiteGraph.js |
|-----------------|----------|-------------|---------|---------|----------|-------------|
| Blueprint ports | Manual | No ports | Yes | Yes | No named | Yes |
| Pan/Zoom | Manual | Built-in | Plugin | Built-in | Built-in | Built-in |
| Vanilla JS | Yes | Yes | No (framework) | jQuery dep | Yes | Yes |
| Size | 0KB | ~600KB | 500KB+ | ~490KB | ~15KB | ~480KB |
| License | - | MIT | MIT | MPL/Commercial | MIT | MIT |
| Effort | 15-20d | 7-10d | 8-12d | 5-7d | 5-7d | 4-6d |
| Realtime update | Manual | API | API | API | Limited | API |
| Scalability (50+ nodes) | Low | High | Medium | Medium | Low | High |

## Consequences

### Positive Consequences

- Blueprint-стиль из коробки: минимальная кастомизация для достижения целевого визуала
- Canvas2D обеспечивает 60 FPS pan/zoom даже при десятках узлов
- Vendor-файл без runtime зависимостей -- не усложняет сборку (конкатенация)
- API для программного управления графом позволяет реализовать SSE-обновления значений

### Negative Consequences

- Canvas2D не позволяет использовать CSS для стилизации элементов внутри узлов -- вся визуализация через Canvas API
- ~480KB добавляется к размеру загрузки (одноразово, кешируется браузером)
- Отсутствие встроенного auto-layout потребует реализации простого топологического размещения

### Neutral Consequences

- LiteGraph.js загружается как отдельный `<script>` тег -- не участвует в конкатенации app.js
- При прекращении поддержки upstream: vendor-копия продолжает работать, для исправлений -- fork

## Implementation Guidance

- Подключать LiteGraph.js как vendor-файл `ui/static/js/vendor/litegraph.js`
  (не через CDN, чтобы обеспечить автономность)
- Регистрировать custom node type через `LiteGraph.registerNodeType()` с переопределением `onDrawForeground` для отображения значений
- Использовать `LGraphCanvas` для управления рендерингом (pan/zoom встроен)
- Для realtime-обновлений: хранить ссылки на узлы и обновлять значения портов при SSE событиях
- Для layout: реализовать простую топологическую сортировку (left-to-right) без внешних зависимостей

## Related Information

- PRD: `docs/plans/system-overview-prd.md`
- Design Doc: `docs/plans/system-overview-design.md`
- LiteGraph.js: [GitHub](https://github.com/jagenjo/litegraph.js)
- LiteGraph.js Wiki -- Custom Nodes: [Creating custom Nodes](https://github.com/jagenjo/litegraph.js/wiki/Creating-custom-Nodes)
- LiteGraph.js Guides: [Guides README](https://github.com/jagenjo/litegraph.js/blob/master/guides/README.md)
- Comfy-Org fork (reference for advanced usage): [GitHub](https://github.com/Comfy-Org/litegraph.js)
