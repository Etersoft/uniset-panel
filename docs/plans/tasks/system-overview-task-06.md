# Task 4.1: Sidebar интеграция

Metadata:
- Dependencies: Task 05 (функция `openSystemOverview()` должна существовать)
- Provides: Секция "System Overview" в sidebar для каждого сервера
- Size: Small (1 файл)

## Содержание задачи

Добавить обработку типа `'overview'` в функцию `activateSidebarGroupItem()` файла `55-sidebar-groups.js`. При клике на пункт "System Overview" в sidebar должна открываться вкладка с диаграммой для соответствующего сервера.

Секция "System Overview" в sidebar уже рендерится backend'ом для каждого сервера с `type: 'overview'`. Нужно только добавить обработку клика.

## Целевые файлы
- [ ] `ui/static/js/src/55-sidebar-groups.js` (Modify)

## Шаги реализации

### 1. Подготовка
- [ ] Прочитать `ui/static/js/src/55-sidebar-groups.js`
- [ ] Найти функцию `activateSidebarGroupItem()` и switch-case блок
- [ ] Изучить существующие case'ы (`'object'`, `'launcher'`, `'dashboard'`, `'journal'`, `'server'`)

### 2. Добавление case 'overview'
- [ ] Добавить новый case в switch-блок `activateSidebarGroupItem()`:
  ```javascript
  case 'overview': {
      const serverInfo = state.servers.get(serverId);
      const serverName = serverInfo ? serverInfo.name : (serverId || '');
      openSystemOverview(serverId, serverName);
      break;
  }
  ```
- [ ] Разместить case перед `default` или после существующих case'ов

### 3. Пересборка
- [ ] `make app` для регенерации `app.js`

## Критерии завершения
- [ ] Case `'overview'` добавлен в `activateSidebarGroupItem()` (AC F7)
- [ ] Клик на "System Overview" в sidebar открывает вкладку с диаграммой
- [ ] Повторный клик переключает на существующую вкладку (не дублирует)
- [ ] `make app` успешен
- [ ] Верификация: L1 (Functional Operation -- клик в sidebar через dev-сервер)

## Команды верификации
```bash
# Пересборка JS
make app

# Полная сборка
make build

# Проверка что case добавлен
grep "overview" ui/static/js/src/55-sidebar-groups.js

# Визуальная проверка
docker compose up dev-viewer -d --build
# Кликнуть "System Overview" в sidebar
```

## Заметки
- Область влияния: Одна функция в `55-sidebar-groups.js` -- добавление case
- Ограничения: Не менять существующие case'ы
- Паттерн полностью аналогичен case `'object'` -- получить serverName из `state.servers`, вызвать функцию открытия
- Backend отправляет sidebar items с `type: 'overview'` через конфигурацию сервера (уже должно быть настроено, либо будет добавлено как часть конфигурации)
