# uniset-panel — Детальное описание проекта

## Обзор

**uniset-panel** — веб-приложение для мониторинга процессов UniSet2 (промышленная платформа автоматизации). Приложение визуализирует состояния переменных и сигналов с историческими графиками в реальном времени.

## Основные возможности

- Подключение к [UniSet2 HTTP API](https://etersoft.github.io/uniset2/) для получения списка объектов и переменных
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
UniSet2 Processes (/api/v2/...) — https://etersoft.github.io/uniset2/
```

### Структура пакетов

| Пакет | Файл | Назначение |
|-------|------|-----------|
| `cmd/server` | `main.go` | Точка входа, инициализация компонентов, graceful shutdown |
| `internal/config` | `config.go`, `yaml.go` | Парсинг CLI + YAML конфигурации |
| `internal/uniset` | `client.go`, `types.go`, `unet.go` | HTTP-клиент к UniSet2 API |
| `internal/server` | `manager.go` | Менеджер мульти-серверных подключений |
| `internal/storage` | `storage.go`, `memory.go`, `sqlite.go` | Интерфейс хранилища и реализации |
| `internal/poller` | `poller.go` | Периодический опрос объектов |
| `internal/api` | `server.go`, `sse.go`, `handlers*.go` | HTTP API, SSE и обработчики запросов |
| `internal/sensorconfig` | `sensorconfig.go` | Парсер XML-конфигурации датчиков |
| `internal/logger` | `logger.go` | Структурированное логирование (slog) |
| `internal/logserver` | `client.go` | TCP клиент к LogServer uniset |
| `internal/recording` | `recording.go` | Система записи истории в SQLite |
| `internal/dashboard` | `dashboard.go` | Серверные дашборды |
| `internal/journal` | `journal.go` | ClickHouse журналы |
| `internal/ionc` | `poller.go` | IONC poller |
| `internal/modbus` | `poller.go` | Modbus poller |
| `internal/opcua` | `poller.go` | OPCUA poller |
| `internal/uwsgate` | `client.go`, `poller.go` | UWebSocketGate WebSocket клиент |
| `internal/sm` | `poller.go` | SharedMemory интеграция |
| `ui/` | `embed.go`, `concat.go`, `templates/`, `static/` | Встроенный фронтенд |

## Стек технологий

### Backend
- **Go 1.25+** — стандартная библиотека `net/http` с паттернами маршрутов
- **SQLite** — `modernc.org/sqlite` (pure Go, без CGO)
- **ClickHouse** — интеграция журналов (github.com/ClickHouse/ch-go)
- **Логирование** — `log/slog` (JSON/text форматы)

### Frontend
- **Vanilla JavaScript** — без фреймворков, модульная архитектура
- **Chart.js** — интерактивные графики с адаптером date-fns
- **CSS** — кастомные переменные, тёмная тема в стиле Grafana

### Инфраструктура
- **Docker** — multi-stage build (Alpine, ~20MB образ)
- **Playwright** — E2E тесты
- **Node.js** — mock-сервер для тестирования

## Конфигурация

```
--uniset-url       URL UniSet2 API (можно указать несколько раз)
--config           YAML файл конфигурации серверов
--addr             Адрес веб-сервера (default: :8181)
--poll-interval    Интервал опроса (default: 1s)
--storage          Тип хранилища: memory | sqlite (default: memory)
--sqlite-path      Путь к SQLite базе (default: ./history.db)
--history-ttl      Время жизни истории (default: 1h)
--log-format       Формат логов: text | json (default: text)
--log-level        Уровень логов: debug | info | warn | error (default: warn)
--uniset-config    Путь к XML-конфигурации датчиков
--dashboards-dir   Директория с серверными дашбордами
--journal-url      ClickHouse URL для журналов (можно несколько раз)
--control-token    Токен доступа для режима управления (можно несколько)
--control-timeout  Таймаут сессии управления (default: 60s)
--recording-path   Путь к файлу записи (default: ./recording.db)
--recording-enabled Запись включена по умолчанию
--max-records      Максимальное количество записей (default: 1000000)
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
make js-tests   # запуск в Docker (single + multi-server)
```

Файлы:
- `tests/single/` — тесты одного сервера (197 тестов)
  - `ui.spec.ts` — базовый UI
  - `ionotifycontroller.spec.ts` — IONotifyController рендерер
  - `opcuaexchange.spec.ts` — OPCUAExchange рендерер
  - `modbusmaster.spec.ts` — ModbusMaster рендерер
  - `modbusslave.spec.ts` — ModbusSlave рендерер
  - `opcuaserver.spec.ts` — OPCUAServer рендерер
  - `base-components.spec.ts` — общие компоненты (filter, resize, chart toggle)
  - `external-sensors.spec.ts` — внешние датчики
- `tests/multi/` — тесты мульти-сервера (15 тестов)
  - `server.spec.ts` — multi-server поддержка
- `tests/mock-server/server.js` — mock UniSet2 API
- `tests/playwright.config.ts` — конфигурация Playwright

## Сборка и запуск

### Локальная сборка
```bash
go build -mod=vendor -o uniset-panel ./cmd/server
./uniset-panel --uniset-url http://localhost:8080 --port 8000
```

### Docker
```bash
docker build -t uniset-panel .
docker run -p 8000:8000 -e UNISET_URL=http://host:8080 uniset-panel
```

### Makefile targets
- `make build` — сборка бинарника
- `make test` — unit-тесты
- `make coverage` — покрытие кода
- `make js-tests` — E2E тесты
- `make clean` — очистка артефактов

## Структура файлов

```
uniset-panel/
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
│   │   ├── css/style.css    # стили (~1400 строк)
│   │   └── js/app.js        # фронтенд (~9150 строк, 5 рендереров + миксины)
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

Интерфейс автоматически адаптируется под тип объекта (`object.objectType` или `object.extensionType`).

### Архитектура

```javascript
objectRenderers (Map)
  ├── 'IONotifyController' → IONCRenderer
  ├── 'OPCUAExchange' → OPCUAExchangeRenderer
  ├── 'ModbusMaster' → ModbusMasterRenderer
  ├── 'ModbusSlave' → ModbusSlaveRenderer
  ├── 'OPCUAServer' → OPCUAServerRenderer
  ├── 'UWebSocketGate' → UWebSocketGateRenderer
  ├── 'UNetExchange' → UNetExchangeRenderer
  └── default → DefaultObjectRenderer
```

### Миксины (переиспользуемый код)

| Миксин | Методы | Назначение |
|--------|--------|------------|
| **VirtualScrollMixin** | `initVirtualScrollProps()`, `setupVirtualScrollFor()`, `updateVisibleRowsFor()` | Виртуальный скролл для больших списков |
| **SSESubscriptionMixin** | `subscribeToSSEFor()`, `unsubscribeFromSSEFor()`, `scheduleBatchRender()` | SSE подписки на обновления значений |
| **ResizableSectionMixin** | `loadSectionHeight()`, `saveSectionHeight()`, `setupSectionResize()` | Изменяемые по высоте секции с сохранением в localStorage |
| **FilterMixin** | `setupFilterListeners()`, `setupContainerEscHandler()`, `applyFilters()` | Фильтрация списков по имени и типу |
| **ParamsAccessibilityMixin** | `updateParamsAccessibility(prefix)` | Управление доступностью секции параметров на основе `httpEnabledSetParams` |

### Классы рендереров

| Класс | Секции |
|-------|--------|
| **BaseObjectRenderer** | Базовый класс с методами создания секций, collapsible sections |
| **IONCRenderer** | Датчики (виртуальный скролл), Графики, LogServer, Потерянные подписчики |
| **OPCUAExchangeRenderer** | Статус OPC UA, Каналы, Датчики, Параметры, Диагностика, Графики |
| **ModbusMasterRenderer** | Статус Modbus, Устройства, Регистры (виртуальный скролл), Параметры, Графики |
| **ModbusSlaveRenderer** | Статус ModbusSlave, Регистры (виртуальный скролл), Параметры, Графики |
| **OPCUAServerRenderer** | Статус OPC UA Server, Endpoints, Config, Переменные, Параметры, Графики |
| **UWebSocketGateRenderer** | WebSocket датчики с autocomplete, Графики, LogServer |
| **UNetExchangeRenderer** | UNet каналы, Входящие/Исходящие датчики, Графики |
| **DefaultObjectRenderer** | Fallback для неизвестных типов |

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
- **Dashboard система** — настраиваемые панели с виджетами (Gauge, Level, LED, Digital, Chart, StatusBar, Label, Divider)
- **Журналы (Journal)** — интеграция с ClickHouse для просмотра сообщений с фильтрацией
- **Режим управления (Control)** — защита write-операций токенами доступа
- **Recording** — запись истории изменений в SQLite с экспортом
- **YAML конфигурация** — альтернатива CLI флагам
- **7 типов рендереров**: IONC, OPCUAExchange, ModbusMaster, ModbusSlave, OPCUAServer, UWebSocketGate, UNetExchange
- **Миксины для переиспользования кода** (~450 строк экономии)
  - FilterMixin: `setupFilterListeners()` для унификации фильтров
  - SSESubscriptionMixin: `subscribeToSSEFor()` для SSE подписок
  - ResizableSectionMixin: `setupSectionResize()` для resize секций
  - ParamsAccessibilityMixin: `updateParamsAccessibility(prefix)` для блокировки параметров
- **httpEnabledSetParams**: автоматическая блокировка секции параметров когда флаг = false
- Chart toggle для всех рендереров (графики по клику на строку)
- Virtual scroll для списков датчиков/регистров
- SSE обновления значений в реальном времени
- Multi-server поддержка с server badges

### Коммит c5d1cdf
- Тёмная тема UI в стиле Grafana
- Парсер XML-конфигурации датчиков (`--uniset-config`)
- Ступенчатые графики для дискретных сигналов (DI/DO)
- Линейные графики для аналоговых сигналов (AI/AO)
- Синхронизация временных диапазонов между графиками
- Эндпоинты `/api/sensors`

### Предыдущие коммиты
- **a3f2441**: Тесты poller, graceful shutdown, structured logging
- **cff180a**: Исправления docker-compose для E2E тестов
- **bc28c85**: Playwright E2E тесты с Docker
- **66f00ea**: Unit-тесты для API, storage, uniset client
