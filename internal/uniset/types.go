package uniset

import "encoding/json"

// ObjectInfo представляет информацию об объекте из /api/v01/list
type ObjectInfo struct {
	Name string `json:"name"`
	ID   int64  `json:"id,omitempty"`
}

// ObjectList ответ от /api/v01/list
type ObjectList struct {
	Objects []ObjectInfo `json:"objects"`
}

// Timer информация о таймере
type Timer struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	Msec     int64  `json:"msec"`
	TimeLeft int64  `json:"timeleft"`
	Tick     int64  `json:"tick"`
}

// Sensor информация о сенсоре
type Sensor struct {
	ID    int64  `json:"id"`
	Name  string `json:"name"`
	Count int64  `json:"count"`
}

// LogServer информация о лог-сервере
type LogServer struct {
	Host  string `json:"host"`
	Port  int    `json:"port"`
	State string `json:"state"`
}

// ObjectData данные объекта из /api/v01/{ObjectName}
type ObjectData struct {
	Name      string                     `json:"-"`
	LogServer *LogServer                 `json:"LogServer,omitempty"`
	Timers    map[string]json.RawMessage `json:"Timers,omitempty"`
	Variables map[string]interface{}     `json:"Variables,omitempty"`
	Sensors   map[string]Sensor          `json:"sensors,omitempty"`
}

// HelpCommand команда из справки
type HelpCommand struct {
	Name       string          `json:"name"`
	Desc       string          `json:"desc"`
	Parameters []HelpParameter `json:"parameters,omitempty"`
}

// HelpParameter параметр команды
type HelpParameter struct {
	Name string `json:"name"`
	Desc string `json:"desc"`
}

// HelpResponse ответ от /api/v01/{ObjectName}/help
type HelpResponse struct {
	Help []HelpCommand `json:"help"`
}
