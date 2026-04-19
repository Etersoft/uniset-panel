# Task 5.1: E2E тесты и финальная проверка качества

Metadata:
- Dependencies: Task 06, Task 07 (все предыдущие задачи завершены)
- Provides: `tests/tests/single/system-overview.spec.ts` -- E2E тесты
- Size: Medium (1 файл)

## Содержание задачи

Написать E2E тесты для System Overview с использованием Playwright. Тесты проверяют полный пользовательский сценарий: открытие вкладки из sidebar, отображение узлов на canvas, работу Fit to Screen и обновление значений через SSE. Также выполнить финальную проверку качества всех AC (F1-F8).

## Целевые файлы
- [ ] `tests/tests/single/system-overview.spec.ts` (Create)

## Шаги реализации

### 1. Подготовка
- [ ] Изучить существующие E2E тесты в `tests/tests/single/` для понимания паттернов
- [ ] Определить доступные mock-серверы и их конфигурацию
- [ ] Убедиться что mock-сервер поддерживает endpoint `/api/servers/{id}/overview`

### 2. E2E тесты

#### Test 1: Открытие вкладки System Overview из sidebar
- [ ] Навигация на главную страницу
- [ ] Клик на "System Overview" в sidebar (для первого доступного сервера)
- [ ] Проверка: вкладка создана (`.tab-panel` с соответствующим `data-name`)
- [ ] Проверка: canvas элемент присутствует внутри вкладки

#### Test 2: Отображение узлов и связей на canvas
- [ ] Открыть System Overview
- [ ] Дождаться загрузки данных (fetch завершен)
- [ ] Проверка: canvas не пустой (через JavaScript evaluation -- наличие узлов в графе)
  ```javascript
  await page.evaluate(() => {
      // Проверить что в графе есть узлы
      const graphs = overviewGraphs; // или через state
      return graphs.size > 0;
  });
  ```

#### Test 3: Кнопка Fit to Screen
- [ ] Открыть System Overview
- [ ] Дождаться загрузки
- [ ] Кликнуть кнопку "Fit to Screen"
- [ ] Проверка: кнопка существует и кликабельна (нет ошибок)

#### Test 4: Обновление значений через SSE
- [ ] Открыть System Overview
- [ ] Дождаться загрузки
- [ ] Дождаться SSE события (через mock-server данные должны обновляться)
- [ ] Проверка: значения на портах обновились (через JavaScript evaluation)

### 3. Финальная проверка AC (F1-F8)

- [ ] **F1**: Backend endpoint возвращает корректный JSON (nodes + edges)
  ```bash
  # Проверка через curl (если dev-сервер запущен)
  curl -s http://localhost:8000/api/servers/{id}/overview | jq .
  ```
- [ ] **F2**: Blueprint-диаграмма отображается (canvas с темным фоном, сеткой)
- [ ] **F3**: Ребра между совпадающими портами видны
- [ ] **F4**: Значения обновляются через SSE
- [ ] **F5**: Активные/неактивные связи визуально различимы
- [ ] **F6**: Pan/zoom/fit-to-screen работают
- [ ] **F7**: Sidebar секция для каждого сервера
- [ ] **F8**: Только объекты выбранного сервера на диаграмме

### 4. Performance проверки

- [ ] Backend endpoint отвечает < 500ms для 20 процессов
- [ ] Рендеринг диаграммы < 1s для 20 процессов

### 5. Запуск всех тестов

- [ ] `go test ./...` -- все backend тесты
- [ ] `make js-tests` -- все E2E тесты (включая новый)
- [ ] `make build` -- сборка

## Критерии завершения
- [ ] Все E2E тесты проходят (`make js-tests`)
- [ ] Все backend тесты проходят (`go test ./...`)
- [ ] Все AC (F1-F8) выполнены и верифицированы
- [ ] Performance: backend < 500ms, рендеринг < 1s для 20 процессов
- [ ] `make build` успешен
- [ ] Верификация: L1 (Functional Operation) + L2 (Test Operation)

## Команды верификации
```bash
# Backend тесты
go test ./... -v

# E2E тесты (через docker compose)
# ВАЖНО: сначала остановить dev-профиль
docker compose --profile dev down
make js-tests

# Запуск только нового теста (для отладки)
# Через docker compose с фильтрацией -- см. Makefile

# Полная сборка
make build
```

## Заметки
- Область влияния: Новый файл E2E тестов, не затрагивает production код
- Ограничения: Тесты запускаются через `make js-tests` (docker compose), не напрямую через npx (по CLAUDE.md)
- Canvas-based тестирование ограничено: содержимое canvas нельзя проверить через DOM. Используем JavaScript evaluation для проверки состояния графа
- Mock-сервер должен:
  - Возвращать данные для `/api/servers/{id}/overview`
  - Отправлять SSE события `object_data`
- Если mock-сервер не поддерживает overview endpoint -- нужно его расширить
