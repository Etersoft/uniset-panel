package poller

import (
	"context"
	"sync"
	"time"

	"github.com/pv/uniset2-viewer-go/internal/logger"
	"github.com/pv/uniset2-viewer-go/internal/storage"
	"github.com/pv/uniset2-viewer-go/internal/uniset"
)

// EventCallback вызывается при получении новых данных объекта
type EventCallback func(objectName string, data *uniset.ObjectData)

type Poller struct {
	client   *uniset.Client
	storage  storage.Storage
	interval time.Duration
	ttl      time.Duration

	mu              sync.RWMutex
	watchedObjects  map[string]bool
	lastObjectData  map[string]*uniset.ObjectData
	lastCleanupTime time.Time

	eventCallback EventCallback
}

func New(client *uniset.Client, store storage.Storage, interval, ttl time.Duration) *Poller {
	return &Poller{
		client:          client,
		storage:         store,
		interval:        interval,
		ttl:             ttl,
		watchedObjects:  make(map[string]bool),
		lastObjectData:  make(map[string]*uniset.ObjectData),
		lastCleanupTime: time.Now(),
	}
}

// SetEventCallback устанавливает callback для уведомления о новых данных
func (p *Poller) SetEventCallback(cb EventCallback) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.eventCallback = cb
}

// Watch добавляет объект в список наблюдения
func (p *Poller) Watch(objectName string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.watchedObjects[objectName] = true
}

// Unwatch удаляет объект из списка наблюдения
func (p *Poller) Unwatch(objectName string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	delete(p.watchedObjects, objectName)
}

// GetLastData возвращает последние полученные данные объекта
func (p *Poller) GetLastData(objectName string) *uniset.ObjectData {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.lastObjectData[objectName]
}

// Run запускает цикл опроса
func (p *Poller) Run(ctx context.Context) {
	ticker := time.NewTicker(p.interval)
	defer ticker.Stop()

	// Первый опрос сразу
	p.poll()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			p.poll()
		}
	}
}

func (p *Poller) poll() {
	p.mu.RLock()
	objects := make([]string, 0, len(p.watchedObjects))
	for obj := range p.watchedObjects {
		objects = append(objects, obj)
	}
	p.mu.RUnlock()

	now := time.Now()

	for _, objectName := range objects {
		data, err := p.client.GetObjectData(objectName)
		if err != nil {
			logger.Warn("Poll failed", "object", objectName, "error", err)
			continue
		}

		p.mu.Lock()
		p.lastObjectData[objectName] = data
		callback := p.eventCallback
		p.mu.Unlock()

		// Уведомляем SSE клиентов о новых данных
		if callback != nil {
			callback(objectName, data)
		}

		// Сохраняем переменные в историю
		if data.Variables != nil {
			for varName, value := range data.Variables {
				if err := p.storage.Save(objectName, varName, value, now); err != nil {
					logger.Warn("Save variable failed", "object", objectName, "var", varName, "error", err)
				}
			}
		}

		// Сохраняем IO данные
		if data.IO != nil {
			if data.IO.In != nil {
				for key, io := range data.IO.In {
					varName := "io.in." + key
					if err := p.storage.Save(objectName, varName, io.Value, now); err != nil {
						logger.Warn("Save IO input failed", "object", objectName, "var", varName, "error", err)
					}
				}
			}
			if data.IO.Out != nil {
				for key, io := range data.IO.Out {
					varName := "io.out." + key
					if err := p.storage.Save(objectName, varName, io.Value, now); err != nil {
						logger.Warn("Save IO output failed", "object", objectName, "var", varName, "error", err)
					}
				}
			}
		}
	}

	// Периодическая очистка старых данных
	if time.Since(p.lastCleanupTime) > time.Minute {
		if err := p.storage.Cleanup(now.Add(-p.ttl)); err != nil {
			logger.Warn("Cleanup failed", "error", err)
		}
		p.lastCleanupTime = now
	}
}
