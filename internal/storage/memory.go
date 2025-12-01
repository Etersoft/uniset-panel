package storage

import (
	"sync"
	"time"
)

type memoryStorage struct {
	mu   sync.RWMutex
	data map[string][]DataPoint // key: "objectName:variableName"
}

func NewMemoryStorage() Storage {
	return &memoryStorage{
		data: make(map[string][]DataPoint),
	}
}

func makeKey(objectName, variableName string) string {
	return objectName + ":" + variableName
}

func (m *memoryStorage) Save(objectName, variableName string, value interface{}, timestamp time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	key := makeKey(objectName, variableName)
	m.data[key] = append(m.data[key], DataPoint{
		Timestamp: timestamp,
		Value:     value,
	})

	return nil
}

func (m *memoryStorage) GetHistory(objectName, variableName string, from, to time.Time) (*VariableHistory, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	key := makeKey(objectName, variableName)
	points := m.data[key]

	var filtered []DataPoint
	for _, p := range points {
		if (p.Timestamp.Equal(from) || p.Timestamp.After(from)) &&
			(p.Timestamp.Equal(to) || p.Timestamp.Before(to)) {
			filtered = append(filtered, p)
		}
	}

	return &VariableHistory{
		ObjectName:   objectName,
		VariableName: variableName,
		Points:       filtered,
	}, nil
}

func (m *memoryStorage) GetLatest(objectName, variableName string, count int) (*VariableHistory, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	key := makeKey(objectName, variableName)
	points := m.data[key]

	var result []DataPoint
	if len(points) <= count {
		result = make([]DataPoint, len(points))
		copy(result, points)
	} else {
		result = make([]DataPoint, count)
		copy(result, points[len(points)-count:])
	}

	return &VariableHistory{
		ObjectName:   objectName,
		VariableName: variableName,
		Points:       result,
	}, nil
}

func (m *memoryStorage) Cleanup(olderThan time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	for key, points := range m.data {
		var filtered []DataPoint
		for _, p := range points {
			if p.Timestamp.After(olderThan) {
				filtered = append(filtered, p)
			}
		}
		if len(filtered) == 0 {
			delete(m.data, key)
		} else {
			m.data[key] = filtered
		}
	}

	return nil
}

func (m *memoryStorage) Close() error {
	return nil
}
