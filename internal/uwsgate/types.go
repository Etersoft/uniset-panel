package uwsgate

import "time"

// SensorData данные датчика из WebSocket сообщения UWebSocketGate
type SensorData struct {
	Type       string      `json:"type"`        // "SensorInfo", "ShortSensorInfo", или "Ping"
	ID         int64       `json:"id"`          // ID датчика
	Name       string      `json:"name"`        // Имя датчика
	Value      int64       `json:"value"`       // Текущее значение
	Error      interface{} `json:"error"`       // Код ошибки (может быть int или string "")
	TVSec      int64       `json:"tv_sec"`      // Время изменения (секунды)
	TVNsec     int64       `json:"tv_nsec"`     // Время изменения (наносекунды)
	IOType     string      `json:"iotype"`      // Тип датчика (AI, DI, AO, DO)
	Node       int64       `json:"node"`        // Узел
	SMTVSec    int64       `json:"sm_tv_sec"`   // Время в SM (секунды)
	SMTVNsec   int64       `json:"sm_tv_nsec"`  // Время в SM (наносекунды)
	SupplierID int64       `json:"supplier_id"` // ID поставщика значения
	Supplier   string      `json:"supplier"`    // Имя поставщика значения
}

// HasError проверяет, есть ли ошибка у датчика
func (s *SensorData) HasError() bool {
	if s.Error == nil {
		return false
	}
	switch v := s.Error.(type) {
	case int:
		return v != 0
	case float64:
		return v != 0
	case string:
		return v != "" && v != "0"
	default:
		return false
	}
}

// ErrorCode возвращает код ошибки как int
func (s *SensorData) ErrorCode() int {
	if s.Error == nil {
		return 0
	}
	switch v := s.Error.(type) {
	case int:
		return v
	case float64:
		return int(v)
	case string:
		return 0 // пустая строка = нет ошибки
	default:
		return 0
	}
}

// Response ответ от UWebSocketGate (JSON обёртка)
type Response struct {
	Data []SensorData `json:"data"`
}

// SensorUpdate обновление датчика для SSE broadcast
type SensorUpdate struct {
	ObjectName string     `json:"object"`
	Sensor     SensorData `json:"sensor"`
	Timestamp  time.Time  `json:"timestamp"`
}

// Sensor информация о датчике для UI (совместим с sensorconfig.SensorInfo)
type Sensor struct {
	ID         int64  `json:"id"`
	Name       string `json:"name"`
	IOType     string `json:"iotype"`
	TextName   string `json:"textname"`
	Value      int64  `json:"value"`
	Error      int    `json:"error"`
	Timestamp  int64  `json:"timestamp"`
	IsDiscrete bool   `json:"isDiscrete"`
	IsInput    bool   `json:"isInput"`
	SupplierID int64  `json:"supplier_id"`
	Supplier   string `json:"supplier"`
}

// SubscribeRequest запрос на подписку/отписку
type SubscribeRequest struct {
	Sensors []string `json:"sensors"`
}

// SensorsResponse ответ со списком подписанных датчиков
type SensorsResponse struct {
	Sensors []Sensor `json:"sensors"`
}
