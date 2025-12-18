# TODO: Рефакторинг Pollers через Generics

> **СТАТУС: ✅ ЗАВЕРШЕНО** (2024-12-18, коммит d3a7844)

## Проблема

~80% кода дублируется между тремя pollers:
- `internal/modbus/poller.go` (371 строк)
- `internal/ionc/poller.go` (306 строк)
- `internal/opcua/poller.go` (438 строк)

**Итого:** ~1115 строк, из них ~400 можно убрать через обобщение.

## Анализ различий

### Типы данных

| Poller | Item тип | Update тип | lastValues тип |
|--------|----------|------------|----------------|
| Modbus | `uniset.MBRegister` | `RegisterUpdate` | `map[int64]int64` |
| IONC | `uniset.IONCSensor` | `SensorUpdate` | `map[int64]string` |
| OPCUA | `OPCUASensor` (локальный) | `SensorUpdate` | `map[int64]string` |

### Специфичная логика

| Poller | hasValueChanged | API метод | Особенности |
|--------|-----------------|-----------|-------------|
| Modbus | `value` | `GetMBRegisterValues` | Ручной парсинг JSON |
| IONC | `value\|real_value` | `GetIONCSensorValues` | - |
| OPCUA | `value\|tick` | 2 метода (Exchange/Server) | `objectTypes`, `SubscribeWithType` |

### Общий код (идентичен во всех трёх)

```
✅ Struct fields: client, interval, batchSize, subscriptions, lastValues, ctx, cancel, wg
✅ NewPoller() - конструктор
✅ Start(), Stop() - lifecycle
✅ Subscribe(), Unsubscribe(), UnsubscribeAll() - управление подписками
✅ GetSubscriptions(), GetAllSubscriptions(), SubscriptionCount() - геттеры
✅ pollLoop() - основной цикл
✅ poll() - структура опроса (snapshot, iterate, collect changes)
✅ pollObject() - проверка батчинга
✅ pollObjectBatched() - логика батчинга
✅ buildQuery() - формирование строки id1,id2,id3
```

## Предлагаемое решение

### Новая структура пакетов

```
internal/
├── poller/
│   ├── base.go         # BasePoller[T, U] - generic базовый poller
│   └── interfaces.go   # ItemFetcher[T] interface
├── modbus/
│   └── poller.go       # ModbusPoller - обёртка над BasePoller
├── ionc/
│   └── poller.go       # IONCPoller - обёртка над BasePoller
└── opcua/
    └── poller.go       # OPCUAPoller - обёртка + objectTypes
```

### Интерфейс ItemFetcher

```go
// internal/poller/interfaces.go
package poller

// ItemFetcher определяет специфичные для типа операции
type ItemFetcher[T any] interface {
    // FetchItems получает items по списку ID
    FetchItems(objectName string, ids []int64) ([]T, error)

    // GetItemID возвращает ID элемента
    GetItemID(item T) int64

    // GetValueHash возвращает хеш значения для сравнения
    GetValueHash(item T) string
}
```

### Базовый Poller

```go
// internal/poller/base.go
package poller

type BasePoller[T any, U any] struct {
    client    *uniset.Client
    interval  time.Duration
    batchSize int
    fetcher   ItemFetcher[T]
    makeUpdate func(objectName string, item T, ts time.Time) U
    callback  func(updates []U)
    logPrefix string

    mu            sync.RWMutex
    subscriptions map[string]map[int64]struct{}
    lastValues    map[string]map[int64]string

    ctx    context.Context
    cancel context.CancelFunc
    wg     sync.WaitGroup
}

// Общие методы
func (p *BasePoller[T, U]) Start()
func (p *BasePoller[T, U]) Stop()
func (p *BasePoller[T, U]) Subscribe(objectName string, ids []int64)
func (p *BasePoller[T, U]) Unsubscribe(objectName string, ids []int64)
func (p *BasePoller[T, U]) UnsubscribeAll(objectName string)
func (p *BasePoller[T, U]) GetSubscriptions(objectName string) []int64
func (p *BasePoller[T, U]) GetAllSubscriptions() map[string][]int64
func (p *BasePoller[T, U]) SubscriptionCount() int
func (p *BasePoller[T, U]) pollLoop()
func (p *BasePoller[T, U]) poll()
func (p *BasePoller[T, U]) pollObject(objectName string, ids []int64) ([]T, error)
func (p *BasePoller[T, U]) pollObjectBatched(objectName string, ids []int64) ([]T, error)
func (p *BasePoller[T, U]) hasValueChanged(objectName string, item T) bool
```

### Пример: Modbus Poller

```go
// internal/modbus/poller.go
package modbus

type Poller struct {
    *poller.BasePoller[uniset.MBRegister, RegisterUpdate]
}

type modbusFetcher struct {
    client *uniset.Client
}

func (f *modbusFetcher) FetchItems(objectName string, ids []int64) ([]uniset.MBRegister, error) {
    query := poller.BuildIDQuery(ids)
    resp, err := f.client.GetMBRegisterValues(objectName, query)
    // ... парсинг
    return registers, nil
}

func (f *modbusFetcher) GetItemID(reg uniset.MBRegister) int64 {
    return reg.ID
}

func (f *modbusFetcher) GetValueHash(reg uniset.MBRegister) string {
    return strconv.FormatInt(reg.Value, 10)
}

func NewPoller(client *uniset.Client, interval time.Duration, batchSize int, callback BatchUpdateCallback) *Poller {
    fetcher := &modbusFetcher{client: client}

    base := poller.NewBasePoller(
        client,
        interval,
        batchSize,
        fetcher,
        func(obj string, reg uniset.MBRegister, ts time.Time) RegisterUpdate {
            return RegisterUpdate{ObjectName: obj, Register: reg, Timestamp: ts}
        },
        callback,
        "Modbus",
    )

    return &Poller{BasePoller: base}
}
```

### Пример: OPCUA Poller (с расширением)

```go
// internal/opcua/poller.go
package opcua

type Poller struct {
    *poller.BasePoller[OPCUASensor, SensorUpdate]

    // Дополнительные поля для OPCUA
    objectTypes map[string]string
    typesMu     sync.RWMutex
}

// Дополнительный метод только для OPCUA
func (p *Poller) SubscribeWithType(objectName string, sensorIDs []int64, extensionType string) {
    p.BasePoller.Subscribe(objectName, sensorIDs)

    p.typesMu.Lock()
    if extensionType != "" {
        p.objectTypes[objectName] = extensionType
    }
    p.typesMu.Unlock()
}
```

## План реализации

### Этап 1: Создание базового пакета ✅ DONE
- [x] Создать `internal/poller/interfaces.go`
- [x] Создать `internal/poller/base.go` с BasePoller
- [x] Создать `internal/poller/utils.go` (BuildIDQuery и т.д.)
- [x] Написать тесты для BasePoller

### Этап 2: Миграция Modbus ✅ DONE
- [x] Создать `modbusFetcher` implementing `ItemFetcher`
- [x] Обновить `modbus.Poller` как обёртку над BasePoller
- [x] Обновить тесты
- [x] Проверить совместимость API

### Этап 3: Миграция IONC ✅ DONE
- [x] Создать `ioncFetcher` implementing `ItemFetcher`
- [x] Обновить `ionc.Poller` как обёртку над BasePoller
- [x] Обновить тесты

### Этап 4: Миграция OPCUA ✅ DONE
- [x] Создать `opcuaFetcher` implementing `ItemFetcher`
- [x] Обновить `opcua.Poller` с расширением для objectTypes
- [x] Сохранить `SubscribeWithType` метод
- [x] Обновить тесты

### Этап 5: Cleanup ✅ DONE
- [x] Удалить дублированный код
- [x] Обновить документацию
- [x] Прогнать все тесты (229 E2E tests passed)

## Результат (РЕАЛИЗОВАНО 2024-12-18)

| Метрика | До | После | Изменение |
|---------|-----|-------|-----------|
| modbus/poller.go | 371 строк | 132 строки | -239 |
| ionc/poller.go | 306 строк | 82 строки | -224 |
| opcua/poller.go | 438 строк | 256 строк | -182 |
| **Итого** | **1115 строк** | **470 строк** | **-645** |
| Дублирование | ~80% | ~10% | ✅ |
| Файлов | 3 | 6 (+3 в poller/) | ✅ |

Коммит: `d3a7844` - Refactor pollers using generics to eliminate code duplication

## Риски

1. **Breaking changes в API** - pollers используются в handlers.go и instance.go
2. **OPCUA специфика** - нужно сохранить `SubscribeWithType` и `objectTypes`
3. **Производительность generics** - в Go 1.18+ generics имеют минимальный overhead

## Ссылки

- `internal/modbus/poller.go` - текущая реализация Modbus
- `internal/ionc/poller.go` - текущая реализация IONC
- `internal/opcua/poller.go` - текущая реализация OPCUA
- `internal/server/instance.go:94-108` - создание pollers
- `internal/api/handlers.go` - использование pollers
