# uniset2-viewer-go — Детальное описание проекта

## Обзор

**uniset2-viewer-go** — веб-приложение для мониторинга процессов UniSet2 (промышленная платформа автоматизации). Приложение визуализирует состояния переменных и сигналов с историческими графиками в реальном времени.

## Основные возможности

- Подключение к UniSet2 HTTP API для получения списка объектов и переменных
- Хранение истории значений (в памяти или SQLite)
- Веб-интерфейс с тёмной темой и интерактивными графиками (Chart.js)
- Поддержка типов сигналов: DI (Digital Input), DO (Digital Output), AI (Analog Input), AO (Analog Output)
- Парсинг XML-конфигурации датчиков для расширенных метаданных
- Выбор временного диапазона для графиков (1m, 3m, 5m, 15m, 1h, 3h)
- Расширяемая система рендереров для разных типов объектов (UniSetManager, UniSetObject и др.)
- Collapsible секции с сохранением состояния в localStorage

## Архитектура

### Поток данных

```
Browser (HTML/JS/Charts)
    ↓ (REST API calls)
Go HTTP Server (Port 8000)
    ├→ UniSet Client (polls /api/v2/{object})
    ├→ Poller (periodic data collection)
    ├→ Storage (memory or SQLite)
    └→ API Handlers (JSON responses)
    ↓ (HTTP requests)
UniSet2 Processes (/api/v2/...)
```

### Структура пакетов

| Пакет | Файл | Назначение |
|-------|------|-----------|
| `cmd/server` | `main.go` | Точка входа, инициализация компонентов, graceful shutdown |
| `internal/config` | `config.go` | Парсинг флагов командной строки |
| `internal/uniset` | `client.go`, `types.go` | HTTP-клиент к UniSet2 API |
| `internal/storage` | `storage.go`, `memory.go`, `sqlite.go` | Интерфейс хранилища и реализации |
| `internal/poller` | `poller.go` | Периодический опрос объектов |
| `internal/api` | `server.go`, `handlers.go` | HTTP API и обработчики запросов |
| `internal/sensorconfig` | `sensorconfig.go` | Парсер XML-конфигурации датчиков |
| `internal/logger` | `logger.go` | Структурированное логирование (slog) |
| `ui/` | `embed.go`, `templates/`, `static/` | Встроенный фронтенд |

## Стек технологий

### Backend
- **Go 1.23** — стандартная библиотека `net/http` с паттернами маршрутов Go 1.23+
- **SQLite** — `github.com/mattn/go-sqlite3` (опционально)
- **Логирование** — `log/slog` (JSON/text форматы)

### Frontend
- **Vanilla JavaScript** — без фреймворков
- **Chart.js** — интерактивные графики с адаптером date-fns
- **CSS** — кастомные переменные, тёмная тема в стиле Grafana

### Инфраструктура
- **Docker** — multi-stage build (Alpine, ~20MB образ)
- **Playwright** — E2E тесты
- **Node.js** — mock-сервер для тестирования

## Конфигурация

```
--uniset-url     URL UniSet2 API (default: http://localhost:8080)
--port           Порт веб-сервера (default: 8181)
--poll-interval  Интервал опроса (default: 5s)
--storage        Тип хранилища: memory | sqlite (default: memory)
--sqlite-path    Путь к SQLite базе (default: ./history.db)
--history-ttl    Время жизни истории (default: 1h)
--log-format     Формат логов: text | json (default: text)
--log-level      Уровень логов: debug | info | warn | error (default: info)
--confile        Путь к XML-конфигурации датчиков
```

## API Endpoints

### Управление объектами
- `GET /api/objects` — список доступных объектов
- `GET /api/objects/{name}` — данные объекта (переменные, IO, статистика)
- `POST /api/objects/{name}/watch` — начать мониторинг объекта
- `DELETE /api/objects/{name}/watch` — остановить мониторинг

### История данных
- `GET /api/objects/{name}/variables/{variable}/history?count=100` — последние N точек
- `GET /api/objects/{name}/variables/{variable}/history/range?from=...&to=...` — диапазон времени

### Конфигурация датчиков
- `GET /api/sensors` — список всех датчиков
- `GET /api/sensors/{id}` — датчик по ID
- `GET /api/sensors/by-name/{name}` — датчик по имени

### Статические ресурсы
- `GET /static/...` — CSS/JS файлы
- `GET /` — главная страница (index.html)

## Хранилище данных

### Memory Storage (по умолчанию)
- Map-based: `map[string][]DataPoint`
- Ключ: `"objectName:variableName"`
- Thread-safe: RWMutex
- Данные теряются при перезапуске

### SQLite Storage
- Таблица `history`: id, object_name, variable_name, value (JSON), timestamp
- Индекс на (object_name, variable_name, timestamp)
- Персистентное хранение

## Тестирование

### Unit-тесты (Go)
```bash
make test       # запуск тестов
make coverage   # отчёт покрытия
```

Тестовые файлы:
- `internal/api/handlers_test.go`
- `internal/storage/memory_test.go`
- `internal/uniset/client_test.go`
- `internal/poller/poller_test.go`
- `internal/sensorconfig/sensorconfig_test.go`

### E2E-тесты (Playwright)
```bash
make js-tests   # запуск в Docker
```

Файлы:
- `tests/ui.spec.ts` — ~100 тестов UI
- `tests/mock-server/server.js` — mock UniSet2 API
- `tests/playwright.config.ts` — конфигурация Playwright

## Сборка и запуск

### Локальная сборка
```bash
go build -mod=vendor -o uniset2-viewer ./cmd/server
./uniset2-viewer --uniset-url http://localhost:8080 --port 8000
```

### Docker
```bash
docker build -t uniset2-viewer .
docker run -p 8000:8000 -e UNISET_URL=http://host:8080 uniset2-viewer
```

### Makefile targets
- `make build` — сборка бинарника
- `make test` — unit-тесты
- `make coverage` — покрытие кода
- `make js-tests` — E2E тесты
- `make clean` — очистка артефактов

## Структура файлов

```
uniset2-viewer-go/
├── cmd/server/
│   └── main.go              # точка входа
├── internal/
│   ├── api/
│   │   ├── server.go        # HTTP сервер и роуты
│   │   ├── handlers.go      # обработчики запросов
│   │   └── handlers_test.go
│   ├── config/
│   │   └── config.go        # конфигурация
│   ├── logger/
│   │   └── logger.go        # логирование
│   ├── poller/
│   │   ├── poller.go        # периодический опрос
│   │   └── poller_test.go
│   ├── sensorconfig/
│   │   ├── sensorconfig.go  # парсер XML
│   │   └── sensorconfig_test.go
│   ├── storage/
│   │   ├── storage.go       # интерфейс
│   │   ├── memory.go        # in-memory реализация
│   │   ├── memory_test.go
│   │   └── sqlite.go        # SQLite реализация
│   └── uniset/
│       ├── client.go        # HTTP клиент
│       ├── client_test.go
│       └── types.go         # типы данных
├── ui/
│   ├── embed.go             # go:embed директива
│   ├── static/
│   │   ├── css/style.css    # стили (~533 строк)
│   │   └── js/app.js        # фронтенд (~745 строк)
│   └── templates/
│       └── index.html       # главная страница
├── tests/
│   ├── ui.spec.ts           # Playwright тесты
│   ├── mock-server/
│   │   └── server.js        # mock сервер
│   ├── playwright.config.ts
│   └── package.json
├── config/                   # примеры конфигураций
├── Dockerfile
├── docker-compose.yml
├── Makefile
├── go.mod
├── go.sum
└── vendor/                   # зависимости
```

## Система рендереров (objectType)

Интерфейс автоматически адаптируется под тип объекта (`object.objectType`).

### Архитектура

```javascript
objectRenderers (Map)
  ├── 'UniSetManager' → UniSetManagerRenderer
  ├── 'UniSetObject' → UniSetObjectRenderer
  └── default → DefaultObjectRenderer
```

### Классы рендереров

| Класс | Секции |
|-------|--------|
| **BaseObjectRenderer** | Базовый класс с методами создания секций |
| **UniSetManagerRenderer** | Графики, Входы/Выходы/Таймеры, Переменные, LogServer, Статистика, Информация об объекте |
| **UniSetObjectRenderer** | Графики, Переменные, LogServer, Статистика, Информация об объекте (без IO/Timers) |
| **DefaultObjectRenderer** | Fallback (как UniSetManager) |

### Добавление нового типа

```javascript
class MyRenderer extends BaseObjectRenderer {
    static getTypeName() { return 'MyType'; }
    createPanelHTML() { return `...`; }
    initialize() { /* setup */ }
    update(data) { /* render */ }
}
registerRenderer('MyType', MyRenderer);
```

## История изменений

### Текущая версия
- Расширяемая система рендереров по objectType
- Badge с типом объекта на вкладке
- Подсветка состояния LogServer (RUNNING/STOPPED)
- Таблица сенсоров в статистике (ID, имя, срабатывания) с фильтром
- Шкала времени с динамическим смещением (90%)
- Временные интервалы: 1m, 3m, 5m, 15m, 1h, 3h
- Техно-шрифт Orbitron для заголовка
- Сохранение состояния спойлеров в localStorage

### Коммит c5d1cdf
- Тёмная тема UI в стиле Grafana
- Парсер XML-конфигурации датчиков (`--confile`)
- Ступенчатые графики для дискретных сигналов (DI/DO)
- Линейные графики для аналоговых сигналов (AI/AO)
- Синхронизация временных диапазонов между графиками
- Эндпоинты `/api/sensors`

### Предыдущие коммиты
- **a3f2441**: Тесты poller, graceful shutdown, structured logging
- **cff180a**: Исправления docker-compose для E2E тестов
- **bc28c85**: Playwright E2E тесты с Docker
- **66f00ea**: Unit-тесты для API, storage, uniset client
