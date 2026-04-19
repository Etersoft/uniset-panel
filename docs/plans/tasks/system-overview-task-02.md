# Task 1.2: Добавление констант System Overview

Metadata:
- Dependencies: Нет (foundation задача, параллельна с Task 01)
- Provides: 7 констант в `ui/static/js/src/00-constants.js`
- Size: Small (1 файл)

## Содержание задачи

Добавить именованные константы для System Overview в файл `00-constants.js`. Константы определяют размеры узлов, расстояния, цвета и тайминги для LiteGraph.js диаграммы. Значения взяты из Design Doc.

## Целевые файлы
- [x] `ui/static/js/src/00-constants.js` (Modify)

## Шаги реализации

### 1. Подготовка
- [x] Прочитать текущий `ui/static/js/src/00-constants.js`
- [x] Найти подходящее место для добавления (в конец файла или в логическую секцию)

### 2. Добавление констант
- [x] Добавить блок комментария и 7 констант:
  ```javascript
  // System Overview
  const OVERVIEW_NODE_WIDTH = 250;
  const OVERVIEW_NODE_HORIZONTAL_SPACING = 350;
  const OVERVIEW_NODE_VERTICAL_SPACING = 150;
  const OVERVIEW_ACTIVE_COLOR = '#4CAF50';
  const OVERVIEW_INACTIVE_COLOR = '#666';
  const OVERVIEW_PULSE_DURATION_MS = 800;
  const OVERVIEW_FIT_PADDING = 50;
  ```

### 3. Пересборка app.js
- [x] `make app` для регенерации `ui/static/js/app.js`

## Критерии завершения
- [x] Все 7 констант добавлены в `00-constants.js`
- [x] Именование в `UPPER_CASE` (по CLAUDE.md)
- [x] `make app` успешен
- [x] Верификация: L3 (Build Success)

## Команды верификации
```bash
# Пересборка app.js
make app

# Проверка что константы попали в app.js
grep 'OVERVIEW_NODE_WIDTH' ui/static/js/app.js
grep 'OVERVIEW_ACTIVE_COLOR' ui/static/js/app.js

# Проверка числа констант
grep -c 'OVERVIEW_' ui/static/js/src/00-constants.js
# Ожидается: 7
```

## Заметки
- Область влияния: Только `00-constants.js`, автоматически попадает в `app.js` через `make app`
- Ограничения: Не модифицировать существующие константы
- Все значения соответствуют Design Doc секции "Constants to Add"
