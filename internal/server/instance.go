package server

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/pv/uniset2-viewer-go/internal/config"
	"github.com/pv/uniset2-viewer-go/internal/ionc"
	"github.com/pv/uniset2-viewer-go/internal/poller"
	"github.com/pv/uniset2-viewer-go/internal/storage"
	"github.com/pv/uniset2-viewer-go/internal/uniset"
)

// ObjectEventCallback вызывается при получении данных объекта
type ObjectEventCallback func(serverID, serverName, objectName string, data *uniset.ObjectData)

// IONCEventCallback вызывается при обновлении IONC датчиков
type IONCEventCallback func(serverID, serverName string, updates []ionc.SensorUpdate)

// Instance представляет подключение к одному UniSet2 серверу
type Instance struct {
	Config     config.ServerConfig
	Client     *uniset.Client
	Poller     *poller.Poller
	IONCPoller *ionc.Poller

	mu          sync.RWMutex
	connected   bool
	lastPoll    time.Time
	lastError   string
	objectCount int

	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

// NewInstance создаёт новый экземпляр сервера
func NewInstance(
	cfg config.ServerConfig,
	store storage.Storage,
	pollInterval time.Duration,
	historyTTL time.Duration,
	objectCallback ObjectEventCallback,
	ioncCallback IONCEventCallback,
) *Instance {
	client := uniset.NewClient(cfg.URL)

	// Создаём poller
	p := poller.New(client, store, pollInterval, historyTTL)
	p.SetServerID(cfg.ID)

	// Устанавливаем callback с информацией о сервере
	serverID := cfg.ID
	serverName := cfg.Name
	if serverName == "" {
		serverName = cfg.URL
	}

	p.SetEventCallback(func(objectName string, data *uniset.ObjectData) {
		if objectCallback != nil {
			objectCallback(serverID, serverName, objectName, data)
		}
	})

	// Создаём IONC poller
	ioncPoller := ionc.NewPoller(client, pollInterval, func(updates []ionc.SensorUpdate) {
		if ioncCallback != nil {
			ioncCallback(serverID, serverName, updates)
		}
	})

	ctx, cancel := context.WithCancel(context.Background())

	return &Instance{
		Config:     cfg,
		Client:     client,
		Poller:     p,
		IONCPoller: ioncPoller,
		ctx:        ctx,
		cancel:     cancel,
	}
}

// Start запускает все pollers
func (i *Instance) Start() {
	i.wg.Add(1)
	go func() {
		defer i.wg.Done()
		i.Poller.Run(i.ctx)
	}()

	i.IONCPoller.Start()

	slog.Info("Server instance started", "id", i.Config.ID, "url", i.Config.URL)
}

// Stop останавливает все pollers
func (i *Instance) Stop() {
	i.cancel()
	i.IONCPoller.Stop()
	i.wg.Wait()

	slog.Info("Server instance stopped", "id", i.Config.ID)
}

// GetStatus возвращает текущий статус сервера
func (i *Instance) GetStatus() Status {
	i.mu.RLock()
	defer i.mu.RUnlock()

	name := i.Config.Name
	if name == "" {
		name = i.Config.URL
	}

	return Status{
		ID:          i.Config.ID,
		URL:         i.Config.URL,
		Name:        name,
		Connected:   i.connected,
		LastPoll:    i.lastPoll,
		LastError:   i.lastError,
		ObjectCount: i.objectCount,
	}
}

// UpdateStatus обновляет статус подключения
func (i *Instance) UpdateStatus(connected bool, err error) {
	i.mu.Lock()
	defer i.mu.Unlock()

	i.connected = connected
	i.lastPoll = time.Now()
	if err != nil {
		i.lastError = err.Error()
	} else {
		i.lastError = ""
	}
}

// SetObjectCount устанавливает количество объектов
func (i *Instance) SetObjectCount(count int) {
	i.mu.Lock()
	defer i.mu.Unlock()
	i.objectCount = count
}

// GetObjects возвращает список объектов сервера
func (i *Instance) GetObjects() ([]string, error) {
	objects, err := i.Client.GetObjectList()
	if err != nil {
		i.UpdateStatus(false, err)
		return nil, err
	}

	i.UpdateStatus(true, nil)
	i.SetObjectCount(len(objects))
	return objects, nil
}

// GetObjectData возвращает данные объекта
func (i *Instance) GetObjectData(objectName string) (*uniset.ObjectData, error) {
	data, err := i.Client.GetObjectData(objectName)
	if err != nil {
		i.UpdateStatus(false, err)
		return nil, err
	}

	i.UpdateStatus(true, nil)
	return data, nil
}

// Watch добавляет объект в наблюдение
func (i *Instance) Watch(objectName string) {
	i.Poller.Watch(objectName)
}

// Unwatch удаляет объект из наблюдения
func (i *Instance) Unwatch(objectName string) {
	i.Poller.Unwatch(objectName)
}

// GetLastData возвращает последние данные объекта
func (i *Instance) GetLastData(objectName string) *uniset.ObjectData {
	return i.Poller.GetLastData(objectName)
}
