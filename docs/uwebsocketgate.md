# UWebSocketGate

UWebSocketGate — компонент UniSet2, предоставляющий WebSocket интерфейс для получения real-time изменений датчиков.

## Возможности

- WebSocket подключение для получения обновлений датчиков в реальном времени
- Autocomplete поиск датчиков из sensorconfig
- Подписка/отписка на отдельные датчики
- Сохранение подписок в localStorage
- Интеграция с графиками (prefix `ws:`)
- Автоматическое переподключение при разрыве связи

## Определение типа объекта

Объект определяется как UWebSocketGate по полю `extensionType` в ответе API:

```bash
curl http://localhost:9090/api/v2/UWebSocketGate1/
```

```json
{
  "name": "UWebSocketGate1",
  "id": 5001,
  "extensionType": "UWebSocketGate"
}
```

## WebSocket API (UniSet2)

### Подключение

```
ws://host:port/wsgate/
```

### Команды (строки через WebSocket)

| Команда | Описание | Пример |
|---------|----------|--------|
| `ask:sensor1,sensor2,...` | Подписаться на датчики | `ask:Temperature,Pressure` |
| `del:sensor1,sensor2,...` | Отписаться от датчиков | `del:Temperature` |
| `get:sensor1,sensor2,...` | Получить текущие значения | `get:Temperature,Pressure` |
| `set:sensor1=val1,...` | Установить значения | `set:Temperature=25` |

### Ответ (JSON)

```json
{
  "data": [
    {
      "type": "SensorInfo",
      "id": 10,
      "name": "Temperature",
      "value": 63,
      "error": 0,
      "tv_sec": 1234567890,
      "tv_nsec": 123456789
    },
    {
      "type": "Ping"
    }
  ]
}
```

### Поля SensorInfo

| Поле | Тип | Описание |
|------|-----|----------|
| `type` | string | `"SensorInfo"` или `"Ping"` |
| `id` | int64 | ID датчика |
| `name` | string | Имя датчика |
| `value` | int64 | Текущее значение |
| `error` | int | Код ошибки (0 = OK) |
| `tv_sec` | int64 | Unix timestamp (секунды) |
| `tv_nsec` | int64 | Наносекунды |

## API Endpoints (UniSet Panel)

### Управление подписками

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/api/objects/{name}/uwsgate/subscribe` | POST | Подписаться на датчики |
| `/api/objects/{name}/uwsgate/unsubscribe` | POST | Отписаться от датчиков |
| `/api/objects/{name}/uwsgate/subscriptions` | GET | Получить список подписок |
| `/api/objects/{name}/uwsgate/sensors` | GET | Получить текущие значения подписанных датчиков |

### Примеры запросов

```bash
# Подписаться на датчики
curl -X POST http://localhost:8000/api/objects/UWebSocketGate1/uwsgate/subscribe \
  -H "Content-Type: application/json" \
  -d '{"sensors": ["Temperature", "Pressure"]}'

# Ответ:
{
  "success": true,
  "subscribed": ["Temperature", "Pressure"]
}

# Получить список подписок
curl http://localhost:8000/api/objects/UWebSocketGate1/uwsgate/subscriptions

# Ответ:
{
  "objectName": "UWebSocketGate1",
  "sensors": ["Temperature", "Pressure"]
}

# Получить текущие значения
curl http://localhost:8000/api/objects/UWebSocketGate1/uwsgate/sensors

# Ответ:
{
  "objectName": "UWebSocketGate1",
  "sensors": [
    {"id": 10, "name": "Temperature", "value": 25, "error": 0},
    {"id": 11, "name": "Pressure", "value": 101, "error": 0}
  ]
}

# Отписаться от датчика
curl -X POST http://localhost:8000/api/objects/UWebSocketGate1/uwsgate/unsubscribe \
  -H "Content-Type: application/json" \
  -d '{"sensors": ["Pressure"]}'
```

## SSE События

### uwsgate_sensor_batch

Батчевое обновление значений датчиков:

```json
{
  "objectName": "UWebSocketGate1",
  "serverId": "77b5af18",
  "serverName": "UniSet Server",
  "timestamp": "2025-12-21T10:30:00.123456789Z",
  "data": [
    {"id": 10, "name": "Temperature", "value": 26, "error": 0},
    {"id": 11, "name": "Pressure", "value": 102, "error": 0}
  ]
}
```

## UI Интерфейс

### Панель UWebSocketGate

При открытии объекта с `extensionType: "UWebSocketGate"` отображается специализированная панель:

1. **Charts** — стандартная секция графиков
2. **Sensors** — таблица подписанных датчиков с autocomplete
3. **Log Viewer** — просмотр логов объекта
4. **LogServer** — управление логированием (если доступен)
5. **Object Info** — информация об объекте

### Object Info

Отображает информацию о состоянии объекта:

| Поле | Описание |
|------|----------|
| В очереди / Потеряно / Макс. очередь | Метрики сообщений: msgCount, lostMessages, maxSizeOfMessageQueue |
| Name | Имя объекта |
| ID | Идентификатор объекта |
| Type | Тип объекта (UniSetObject) |
| Extension | Тип расширения (UWebSocketGate) |
| Active | Активен ли объект (isActive) |
| WebSocket Clients | Количество активных WS подключений |

### LogServer

Если объект поддерживает LogServer, отображается секция с информацией:
- **Host** — адрес LogServer
- **Port** — порт LogServer
- **Status** — состояние (RUNNING, STOPPED)

Через LogServer можно подключиться к логам объекта в реальном времени через Log Viewer.

### Autocomplete

Поле ввода с автодополнением для добавления датчиков:

1. Начните вводить имя датчика (минимум 2 символа)
2. Появится выпадающий список с подсказками из sensorconfig
3. Используйте ↑↓ для навигации
4. Enter — добавить выбранный датчик
5. Escape — очистить поле и скрыть подсказки

### Таблица датчиков

| Колонка | Описание |
|---------|----------|
| Chart | Checkbox для добавления на график |
| ID | Идентификатор датчика |
| Name | Имя датчика |
| Value | Текущее значение |
| Status | OK или Error |
| Actions | Кнопка удаления (×) |

### Persistence

Подписки автоматически сохраняются в localStorage:

```javascript
// Ключ: uwsgate-subscriptions-${tabKey}
// Значение: ["Temperature", "Pressure", ...]
```

При повторном открытии вкладки подписки восстанавливаются автоматически.

## Графики

UWebSocketGate использует prefix `ws:` для идентификации переменных на графиках:

| Параметр | Значение |
|----------|----------|
| Prefix | `ws` |
| Badge | `WS` |
| Пример varName | `ws:Temperature` |

### Добавление на график

1. В таблице датчиков поставьте галочку в колонке "Chart"
2. График появится в секции Charts
3. Данные будут обновляться в реальном времени через SSE

## Архитектура

### Backend

```
internal/uwsgate/
├── types.go    # SensorData, SensorUpdate, SubscribeRequest
├── client.go   # WebSocket клиент с auto-reconnect
└── poller.go   # Управление подписками
```

### Frontend

```javascript
// app.js
class UWebSocketGateRenderer extends BaseObjectRenderer {
    static getTypeName() { return 'UWebSocketGate'; }
    getChartOptions() { return { badge: 'WS', prefix: 'ws' }; }
    // ...
}
```

### Поток данных

```
UniSet2 UWebSocketGate
        ↓ WebSocket
    uwsgate.Client
        ↓ callback
    uwsgate.Poller
        ↓ callback
    SSEHub.BroadcastUWSGateSensorBatchWithServer
        ↓ SSE
    Browser (uwsgate_sensor_batch event)
        ↓
    UWebSocketGateRenderer.handleSSEUpdate()
```

## Особенности

### Lazy Creation

UWSGatePoller создаётся "лениво" — только при первой подписке на датчики. Это экономит ресурсы, если UWebSocketGate объекты не используются.

### Auto-Reconnect

WebSocket клиент автоматически переподключается при разрыве связи:
- Exponential backoff: 1s → 2s → 4s → ... → 30s (max)
- При переподключении восстанавливаются все подписки

### Change Detection

Обновления отправляются только при изменении значений датчиков. Используется хэш для отслеживания изменений.

### Recording

При включённой записи (Recording) значения датчиков UWebSocketGate сохраняются в базу данных с prefix `ws:`:

```json
{
  "serverId": "77b5af18",
  "objectName": "UWebSocketGate1",
  "variableName": "ws:Temperature",
  "value": 25,
  "timestamp": "2025-12-21T10:30:00Z"
}
```

## Связанные документы

- [Recording](recording.md) — запись истории датчиков
- [Naming Conventions](naming-conventions.md) — соглашения об именовании
