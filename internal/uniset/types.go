package uniset

import "encoding/json"

// ObjectList список имён объектов из /api/v2/list
type ObjectList []string

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

// LogServerInfo детальная информация о лог-сервере
type LogServerInfo struct {
	Host         string        `json:"host"`
	Name         string        `json:"name"`
	Port         int           `json:"port"`
	SessMaxCount int           `json:"sessMaxCount"`
	Sessions     []interface{} `json:"sessions"`
}

// LogServer информация о лог-сервере
type LogServer struct {
	Host  string         `json:"host"`
	Port  int            `json:"port"`
	State string         `json:"state"`
	Info  *LogServerInfo `json:"info,omitempty"`
}

// IOVar переменная ввода/вывода
type IOVar struct {
	ID      int64       `json:"id"`
	Name    string      `json:"name"`
	Value   interface{} `json:"value"`
	Comment string      `json:"comment,omitempty"`
	VarType string      `json:"vartype,omitempty"`
}

// IOData входы и выходы объекта
type IOData struct {
	In  map[string]IOVar `json:"in,omitempty"`
	Out map[string]IOVar `json:"out,omitempty"`
}

// ObjectInfo информация об объекте
type ObjectInfo struct {
	ID                    int64  `json:"id"`
	Name                  string `json:"name"`
	IsActive              bool   `json:"isActive"`
	LostMessages          int64  `json:"lostMessages"`
	MaxSizeOfMessageQueue int64  `json:"maxSizeOfMessageQueue"`
	MsgCount              int64  `json:"msgCount"`
	ObjectType            string `json:"objectType"`
	ExtensionType         string `json:"extensionType,omitempty"`
	ExtensionsType        string `json:"extensionsType,omitempty"` // some endpoints return extensionsType
}

// ObjectData данные объекта из /api/v2/{ObjectName}
// Гибридный подход: сервер парсит только то, что ему нужно для своей логики,
// остальное передаётся как raw данные на UI
type ObjectData struct {
	Name string `json:"-"`

	// === Поля, нужные серверу (парсятся) ===
	// Object - для определения типа объекта, ID
	Object *ObjectInfo `json:"object,omitempty"`
	// LogServer - для подключения к LogServer
	LogServer *LogServer `json:"LogServer,omitempty"`
	// Variables - для сохранения истории
	Variables map[string]interface{} `json:"Variables,omitempty"`
	// IO - для сохранения истории входов/выходов
	IO *IOData `json:"io,omitempty"`

	// === Raw данные для UI (не парсятся сервером) ===
	// Все поля из JSON ответа объекта
	RawData map[string]json.RawMessage `json:"-"`
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

// HelpResponse ответ от /api/v2/{ObjectName}/help
type HelpResponse struct {
	Help []HelpCommand `json:"help"`
}
