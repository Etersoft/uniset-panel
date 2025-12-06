package storage

import (
	"time"
)

// DataPoint точка данных с временной меткой
type DataPoint struct {
	Timestamp time.Time   `json:"timestamp"`
	Value     interface{} `json:"value"`
}

// VariableHistory история значений переменной
type VariableHistory struct {
	ServerID     string      `json:"serverId,omitempty"`
	ObjectName   string      `json:"objectName"`
	VariableName string      `json:"variableName"`
	Points       []DataPoint `json:"points"`
}

// Storage интерфейс хранилища истории
type Storage interface {
	// Save сохраняет значение переменной
	Save(serverID, objectName, variableName string, value interface{}, timestamp time.Time) error

	// GetHistory возвращает историю переменной за указанный период
	GetHistory(serverID, objectName, variableName string, from, to time.Time) (*VariableHistory, error)

	// GetLatest возвращает последние N точек
	GetLatest(serverID, objectName, variableName string, count int) (*VariableHistory, error)

	// Cleanup удаляет данные старше указанного времени
	Cleanup(olderThan time.Time) error

	// Close закрывает хранилище
	Close() error
}

// DefaultServerID используется когда serverID не указан
const DefaultServerID = "default"
