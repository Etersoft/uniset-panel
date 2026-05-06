package poller

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/pv/uniset-panel/internal/recording"
)

// BatchUpdateCallback функция обратного вызова для батчевых обновлений
type BatchUpdateCallback[U any] func(updates []U)

// UpdateFactory создаёт Update из элемента
type UpdateFactory[T any, U any] func(objectName string, item T, timestamp time.Time) U

// ToDataRecordFunc конвертирует Update в DataRecord для recording
type ToDataRecordFunc[U any] func(serverID string, update U) recording.DataRecord

// BasePoller - generic базовый poller для опроса датчиков/регистров
type BasePoller[T any, U any] struct {
	interval  time.Duration
	batchSize int
	fetcher   ItemFetcher[T]
	makeUpdate UpdateFactory[T, U]
	callback  BatchUpdateCallback[U]
	logPrefix string

	mu sync.RWMutex
	// subscriptions: objectName -> set of IDs
	subscriptions map[string]map[int64]struct{}
	// lastValues: objectName -> ID -> value hash
	lastValues map[string]map[int64]string
	// lastItems: objectName -> ID -> last fetched item.
	// Используется для replay при Subscribe — новый подписчик получает
	// актуальное значение СРАЗУ, не дожидаясь ближайшего poll-цикла
	// или change-event'а на стабильном датчике.
	lastItems map[string]map[int64]T

	// Recording support
	serverID       string
	recordingMgr   *recording.Manager
	toDataRecord   ToDataRecordFunc[U]

	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

// NewBasePoller создаёт новый базовый poller
func NewBasePoller[T any, U any](
	interval time.Duration,
	batchSize int,
	fetcher ItemFetcher[T],
	makeUpdate UpdateFactory[T, U],
	callback BatchUpdateCallback[U],
	logPrefix string,
) *BasePoller[T, U] {
	ctx, cancel := context.WithCancel(context.Background())

	return &BasePoller[T, U]{
		interval:      interval,
		batchSize:     batchSize,
		fetcher:       fetcher,
		makeUpdate:    makeUpdate,
		callback:      callback,
		logPrefix:     logPrefix,
		subscriptions: make(map[string]map[int64]struct{}),
		lastValues:    make(map[string]map[int64]string),
		lastItems:     make(map[string]map[int64]T),
		ctx:           ctx,
		cancel:        cancel,
	}
}

// Start запускает polling
func (p *BasePoller[T, U]) Start() {
	p.wg.Add(1)
	go p.pollLoop()
	slog.Info(p.logPrefix+" Poller started", "interval", p.interval)
}

// Stop останавливает polling
func (p *BasePoller[T, U]) Stop() {
	p.cancel()
	p.wg.Wait()
	slog.Info(p.logPrefix + " Poller stopped")
}

// SetServerID устанавливает ID сервера для recording
func (p *BasePoller[T, U]) SetServerID(serverID string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.serverID = serverID
}

// SetRecordingManager устанавливает менеджер записи
func (p *BasePoller[T, U]) SetRecordingManager(mgr *recording.Manager) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.recordingMgr = mgr
}

// SetToDataRecord устанавливает функцию конвертации Update -> DataRecord
func (p *BasePoller[T, U]) SetToDataRecord(fn ToDataRecordFunc[U]) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.toDataRecord = fn
}

// saveToRecording сохраняет batch в recording (если настроено)
func (p *BasePoller[T, U]) saveToRecording(batch []U) {
	p.mu.RLock()
	mgr := p.recordingMgr
	serverID := p.serverID
	toDataRecord := p.toDataRecord
	p.mu.RUnlock()

	if mgr == nil || toDataRecord == nil || len(batch) == 0 {
		return
	}

	// Конвертируем batch в DataRecords
	records := make([]recording.DataRecord, 0, len(batch))
	for _, update := range batch {
		records = append(records, toDataRecord(serverID, update))
	}

	// Сохраняем батчем
	if err := mgr.SaveBatch(records); err != nil {
		slog.Error(p.logPrefix+" recording save failed", "error", err, "count", len(records))
	}
}

// Subscribe подписывает на элементы объекта.
//
// Двойная стратегия для гарантии initial-value у нового подписчика:
//
//  1. Replay из кэша lastItems (синхронно): если poller уже видел item раньше
//     (другой объект подписывался, или это re-subscribe нашего объекта),
//     эмитим callback с cached значением сразу — виджет получает initial state
//     без задержки на poll-цикл.
//
//  2. Сброс lastValues для подписываемых ids: следующий poll увидит "новый"
//     hash для этих ids и отправит callback даже если значение не менялось.
//     Покрывает случай когда cache пуст (item ни разу не fetch'ился) и случай
//     когда cached значение могло устареть между прошлым poll'ом и Subscribe.
//
// Issue: dashboard widget'ы оставались на initial OFF при возврате на dashboard
// для sensor'ов чьё значение не менялось — backend dedup hash блокировал SSE.
func (p *BasePoller[T, U]) Subscribe(objectName string, ids []int64) {
	p.mu.Lock()

	if p.subscriptions[objectName] == nil {
		p.subscriptions[objectName] = make(map[int64]struct{})
	}
	if p.lastValues[objectName] == nil {
		p.lastValues[objectName] = make(map[int64]string)
	}

	// Собираем replay-batch внутри Lock'а, callback вызовем после Unlock
	// (callback обычно делает SSE.Broadcast — может блокировать или сам
	// возвращаться через poller'овые методы; держать Lock небезопасно).
	var replay []U
	now := time.Now().UTC()
	itemsForObj := p.lastItems[objectName]
	for _, id := range ids {
		p.subscriptions[objectName][id] = struct{}{}
		delete(p.lastValues[objectName], id)
		if itemsForObj != nil {
			if cached, ok := itemsForObj[id]; ok {
				replay = append(replay, p.makeUpdate(objectName, cached, now))
			}
		}
	}

	// Считаем общее количество подписок
	totalCount := 0
	for _, items := range p.subscriptions {
		totalCount += len(items)
	}
	cb := p.callback
	p.mu.Unlock()

	if len(replay) > 0 && cb != nil {
		cb(replay)
	}

	slog.Info(p.logPrefix+" items subscribed", "object", objectName,
		"count", len(ids), "total_subscriptions", totalCount, "replayed", len(replay))
}

// Unsubscribe отписывает от элементов объекта
func (p *BasePoller[T, U]) Unsubscribe(objectName string, ids []int64) {
	p.mu.Lock()
	defer p.mu.Unlock()

	if items, ok := p.subscriptions[objectName]; ok {
		for _, id := range ids {
			delete(items, id)
			delete(p.lastValues[objectName], id)
			if cached, ok := p.lastItems[objectName]; ok {
				delete(cached, id)
			}
		}
		if len(items) == 0 {
			delete(p.subscriptions, objectName)
			delete(p.lastValues, objectName)
			delete(p.lastItems, objectName)
		}
	}

	slog.Debug(p.logPrefix+" items unsubscribed", "object", objectName, "count", len(ids))
}

// UnsubscribeAll отписывает объект от всех элементов
func (p *BasePoller[T, U]) UnsubscribeAll(objectName string) {
	p.mu.Lock()
	defer p.mu.Unlock()

	delete(p.subscriptions, objectName)
	delete(p.lastValues, objectName)
	delete(p.lastItems, objectName)
	slog.Debug(p.logPrefix+" all items unsubscribed", "object", objectName)
}

// GetSubscriptions возвращает список подписок для объекта
func (p *BasePoller[T, U]) GetSubscriptions(objectName string) []int64 {
	p.mu.RLock()
	defer p.mu.RUnlock()

	items, ok := p.subscriptions[objectName]
	if !ok {
		return nil
	}

	result := make([]int64, 0, len(items))
	for id := range items {
		result = append(result, id)
	}
	return result
}

// GetAllSubscriptions возвращает все подписки
func (p *BasePoller[T, U]) GetAllSubscriptions() map[string][]int64 {
	p.mu.RLock()
	defer p.mu.RUnlock()

	result := make(map[string][]int64)
	for obj, items := range p.subscriptions {
		ids := make([]int64, 0, len(items))
		for id := range items {
			ids = append(ids, id)
		}
		result[obj] = ids
	}
	return result
}

// SubscriptionCount возвращает количество подписок
func (p *BasePoller[T, U]) SubscriptionCount() int {
	p.mu.RLock()
	defer p.mu.RUnlock()

	count := 0
	for _, items := range p.subscriptions {
		count += len(items)
	}
	return count
}

// ForceEmitAll принудительно опрашивает и отправляет все подписанные элементы
// (игнорируя детекцию изменений). Используется для начальной записи при старте recording.
func (p *BasePoller[T, U]) ForceEmitAll() {
	// Копируем подписки под блокировкой
	p.mu.RLock()
	subsSnapshot := make(map[string][]int64)
	for obj, items := range p.subscriptions {
		ids := make([]int64, 0, len(items))
		for id := range items {
			ids = append(ids, id)
		}
		subsSnapshot[obj] = ids
	}
	p.mu.RUnlock()

	if len(subsSnapshot) == 0 {
		return
	}

	slog.Info(p.logPrefix+" ForceEmitAll started", "objects", len(subsSnapshot))

	// Собираем все элементы в batch (без проверки изменений)
	var batch []U
	now := time.Now().UTC()

	for objectName, ids := range subsSnapshot {
		if len(ids) == 0 {
			continue
		}

		items, err := p.pollObject(objectName, ids)
		if err != nil {
			slog.Error(p.logPrefix+" ForceEmitAll poll failed", "object", objectName, "error", err)
			continue
		}

		// Добавляем ВСЕ элементы в batch (без проверки hasValueChanged)
		for _, item := range items {
			batch = append(batch, p.makeUpdate(objectName, item, now))
			// Обновляем lastValues чтобы последующие poll'ы работали корректно
			p.updateLastValue(objectName, item)
		}

		slog.Debug(p.logPrefix+" ForceEmitAll items", "object", objectName, "count", len(items))
	}

	// Отправляем batch
	if len(batch) > 0 {
		if p.callback != nil {
			slog.Info(p.logPrefix+" ForceEmitAll sending batch", "updates_count", len(batch))
			p.callback(batch)
		}
		// Сохраняем в recording
		p.saveToRecording(batch)
	}
}

// updateLastValue обновляет lastValues и lastItems для элемента (без проверки изменения).
// lastItems нужен чтобы Subscribe мог replay'нуть текущее значение новому подписчику.
func (p *BasePoller[T, U]) updateLastValue(objectName string, item T) {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.lastValues[objectName] == nil {
		p.lastValues[objectName] = make(map[int64]string)
	}
	if p.lastItems[objectName] == nil {
		p.lastItems[objectName] = make(map[int64]T)
	}

	itemID := p.fetcher.GetItemID(item)
	p.lastValues[objectName][itemID] = p.fetcher.GetValueHash(item)
	p.lastItems[objectName][itemID] = item
}

func (p *BasePoller[T, U]) pollLoop() {
	defer p.wg.Done()

	ticker := time.NewTicker(p.interval)
	defer ticker.Stop()

	for {
		select {
		case <-p.ctx.Done():
			return
		case <-ticker.C:
			p.poll()
		}
	}
}

func (p *BasePoller[T, U]) poll() {
	// Копируем подписки под блокировкой
	p.mu.RLock()
	subsSnapshot := make(map[string][]int64)
	for obj, items := range p.subscriptions {
		ids := make([]int64, 0, len(items))
		for id := range items {
			ids = append(ids, id)
		}
		subsSnapshot[obj] = ids
	}
	p.mu.RUnlock()

	if len(subsSnapshot) == 0 {
		return
	}

	slog.Debug(p.logPrefix+" poll started", "objects", len(subsSnapshot))

	// Собираем все изменения в batch
	var batch []U
	now := time.Now().UTC()

	// Опрашиваем каждый объект
	for objectName, ids := range subsSnapshot {
		if len(ids) == 0 {
			continue
		}

		items, err := p.pollObject(objectName, ids)
		if err != nil {
			slog.Error(p.logPrefix+" poll failed", "object", objectName, "error", err)
			continue
		}

		slog.Debug(p.logPrefix+" poll result", "object", objectName, "items_count", len(items), "subscribed_count", len(ids))

		// Добавляем изменившиеся значения в batch
		changedCount := 0
		for _, item := range items {
			if p.hasValueChanged(objectName, item) {
				batch = append(batch, p.makeUpdate(objectName, item, now))
				changedCount++
			}
		}

		if changedCount > 0 {
			slog.Debug(p.logPrefix+" values changed", "object", objectName, "changed_count", changedCount)
		}
	}

	// Отправляем batch целиком
	if len(batch) > 0 {
		if p.callback != nil {
			slog.Debug(p.logPrefix+" sending batch", "updates_count", len(batch))
			p.callback(batch)
		}
		// Сохраняем в recording
		p.saveToRecording(batch)
	}
}

func (p *BasePoller[T, U]) pollObject(objectName string, ids []int64) ([]T, error) {
	// Если батчинг включен и элементов больше чем batchSize, разбиваем на батчи
	if p.batchSize > 0 && len(ids) > p.batchSize {
		return p.pollObjectBatched(objectName, ids)
	}

	return p.fetcher.FetchItems(objectName, ids)
}

func (p *BasePoller[T, U]) pollObjectBatched(objectName string, ids []int64) ([]T, error) {
	var allItems []T
	var lastErr error

	// Разбиваем на батчи
	for i := 0; i < len(ids); i += p.batchSize {
		end := i + p.batchSize
		if end > len(ids) {
			end = len(ids)
		}
		batch := ids[i:end]

		items, err := p.fetcher.FetchItems(objectName, batch)
		if err != nil {
			lastErr = err
			slog.Debug(p.logPrefix+" batch poll failed", "object", objectName, "batch", i/p.batchSize, "error", err)
			continue
		}

		allItems = append(allItems, items...)
	}

	// Возвращаем ошибку только если не получили ни одного элемента
	if len(allItems) == 0 && lastErr != nil {
		return nil, lastErr
	}

	return allItems, nil
}

func (p *BasePoller[T, U]) hasValueChanged(objectName string, item T) bool {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.lastValues[objectName] == nil {
		p.lastValues[objectName] = make(map[int64]string)
	}
	if p.lastItems[objectName] == nil {
		p.lastItems[objectName] = make(map[int64]T)
	}

	itemID := p.fetcher.GetItemID(item)
	newHash := p.fetcher.GetValueHash(item)

	// lastItems обновляем всегда — нужен для replay при Subscribe (даже если
	// hash не менялся, мы всё равно хотим иметь текущее значение в кэше для
	// нового подписчика).
	p.lastItems[objectName][itemID] = item

	lastHash, exists := p.lastValues[objectName][itemID]
	if !exists || lastHash != newHash {
		p.lastValues[objectName][itemID] = newHash
		return true
	}
	return false
}
