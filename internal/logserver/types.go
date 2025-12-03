package logserver

import (
	"bytes"
	"encoding/binary"
	"fmt"
)

// MagicNum magic number для протокола LogServer
const MagicNum uint32 = 20201222

// MaxLogNameLen максимальная длина имени лога
const MaxLogNameLen = 120

// MessageSize размер сообщения lsMessage в байтах
const MessageSize = 131 // 1 + 4 + 4 + 1 + 121

// Command команда для LogServer
type Command uint8

const (
	CmdNOP                 Command = 0  // Нет команды
	CmdSetLevel            Command = 1  // Установить уровень вывода
	CmdAddLevel            Command = 2  // Добавить уровень вывода
	CmdDelLevel            Command = 3  // Удалить уровень вывода
	CmdRotate              Command = 4  // Пересоздать файл с логами
	CmdOffLogFile          Command = 5  // Отключить запись файла логов
	CmdOnLogFile           Command = 6  // Включить запись файла логов
	CmdSetVerbosity        Command = 7  // Установить уровень verbose
	CmdSaveLogLevel        Command = 8  // Сохранить текущее состояние логов
	CmdRestoreLogLevel     Command = 9  // Восстановить сохраненное состояние логов
	CmdList                Command = 10 // Вывести список контролируемых логов
	CmdFilterMode          Command = 11 // Режим фильтра по logname (regexp)
	CmdViewDefaultLogLevel Command = 12 // Вывести уровни по умолчанию
	CmdShowLocalTime       Command = 13 // Выводить локальное время
	CmdShowUTCTime         Command = 14 // Выводить UTC время
)

// String возвращает строковое представление команды
func (c Command) String() string {
	switch c {
	case CmdNOP:
		return "NOP"
	case CmdSetLevel:
		return "SetLevel"
	case CmdAddLevel:
		return "AddLevel"
	case CmdDelLevel:
		return "DelLevel"
	case CmdRotate:
		return "Rotate"
	case CmdOffLogFile:
		return "OffLogFile"
	case CmdOnLogFile:
		return "OnLogFile"
	case CmdSetVerbosity:
		return "SetVerbosity"
	case CmdSaveLogLevel:
		return "SaveLogLevel"
	case CmdRestoreLogLevel:
		return "RestoreLogLevel"
	case CmdList:
		return "List"
	case CmdFilterMode:
		return "FilterMode"
	case CmdViewDefaultLogLevel:
		return "ViewDefaultLogLevel"
	case CmdShowLocalTime:
		return "ShowLocalTime"
	case CmdShowUTCTime:
		return "ShowUTCTime"
	default:
		return fmt.Sprintf("Unknown(%d)", c)
	}
}

// LogLevel уровни логирования (битовая маска)
type LogLevel uint32

const (
	LevelNone  LogLevel = 0
	LevelCrit  LogLevel = 1 << 0 // critical
	LevelWarn  LogLevel = 1 << 1 // warning
	LevelInfo  LogLevel = 1 << 2 // info
	LevelLevel1 LogLevel = 1 << 3
	LevelLevel2 LogLevel = 1 << 4
	LevelLevel3 LogLevel = 1 << 5
	LevelLevel4 LogLevel = 1 << 6
	LevelLevel5 LogLevel = 1 << 7
	LevelLevel6 LogLevel = 1 << 8
	LevelLevel7 LogLevel = 1 << 9
	LevelLevel8 LogLevel = 1 << 10
	LevelLevel9 LogLevel = 1 << 11
	LevelAny   LogLevel = 0xFFFFFFFF
)

// Message структура сообщения lsMessage для протокола LogServer
// Соответствует C++ структуре:
//
//	struct lsMessage {
//	    uint8_t _be_order;     // 1=Big-Endian, 0=Little-Endian
//	    uint32_t magic;        // = 20201222
//	    uint32_t data;         // данные команды
//	    uint8_t cmd;           // команда
//	    char logname[121];     // имя лога (regexp)
//	} __attribute__((packed));
type Message struct {
	ByteOrder uint8            // 1=Big-Endian, 0=Little-Endian
	Magic     uint32           // = MagicNum (20201222)
	Data      uint32           // данные команды (уровень лога и т.д.)
	Cmd       Command          // команда
	LogName   [MaxLogNameLen + 1]byte // имя лога (regexp), null-terminated
}

// NewMessage создает новое сообщение с заданными параметрами
func NewMessage(cmd Command, data uint32, logname string) *Message {
	m := &Message{
		ByteOrder: 0, // Little-Endian (x86/x64)
		Magic:     MagicNum,
		Data:      data,
		Cmd:       cmd,
	}
	m.SetLogName(logname)
	return m
}

// SetLogName устанавливает имя лога (обрезает до MaxLogNameLen)
func (m *Message) SetLogName(name string) {
	// Очищаем буфер
	for i := range m.LogName {
		m.LogName[i] = 0
	}
	// Копируем имя (с учетом ограничения длины)
	n := len(name)
	if n > MaxLogNameLen {
		n = MaxLogNameLen
	}
	copy(m.LogName[:n], name)
}

// GetLogName возвращает имя лога как строку
func (m *Message) GetLogName() string {
	// Ищем нулевой байт
	for i, b := range m.LogName {
		if b == 0 {
			return string(m.LogName[:i])
		}
	}
	return string(m.LogName[:])
}

// Marshal сериализует сообщение в байты (Little-Endian)
func (m *Message) Marshal() ([]byte, error) {
	buf := new(bytes.Buffer)

	// Порядок байт
	if err := binary.Write(buf, binary.LittleEndian, m.ByteOrder); err != nil {
		return nil, fmt.Errorf("write byte_order: %w", err)
	}

	// Magic
	if err := binary.Write(buf, binary.LittleEndian, m.Magic); err != nil {
		return nil, fmt.Errorf("write magic: %w", err)
	}

	// Data
	if err := binary.Write(buf, binary.LittleEndian, m.Data); err != nil {
		return nil, fmt.Errorf("write data: %w", err)
	}

	// Cmd
	if err := binary.Write(buf, binary.LittleEndian, m.Cmd); err != nil {
		return nil, fmt.Errorf("write cmd: %w", err)
	}

	// LogName (фиксированный размер 121 байт)
	if _, err := buf.Write(m.LogName[:]); err != nil {
		return nil, fmt.Errorf("write logname: %w", err)
	}

	return buf.Bytes(), nil
}

// Unmarshal десериализует сообщение из байтов
func (m *Message) Unmarshal(data []byte) error {
	if len(data) < MessageSize {
		return fmt.Errorf("data too short: got %d, need %d", len(data), MessageSize)
	}

	buf := bytes.NewReader(data)

	// Порядок байт
	if err := binary.Read(buf, binary.LittleEndian, &m.ByteOrder); err != nil {
		return fmt.Errorf("read byte_order: %w", err)
	}

	// Magic
	if err := binary.Read(buf, binary.LittleEndian, &m.Magic); err != nil {
		return fmt.Errorf("read magic: %w", err)
	}

	// Проверяем magic
	if m.Magic != MagicNum {
		return fmt.Errorf("invalid magic: got %d, expected %d", m.Magic, MagicNum)
	}

	// Data
	if err := binary.Read(buf, binary.LittleEndian, &m.Data); err != nil {
		return fmt.Errorf("read data: %w", err)
	}

	// Cmd
	if err := binary.Read(buf, binary.LittleEndian, &m.Cmd); err != nil {
		return fmt.Errorf("read cmd: %w", err)
	}

	// LogName
	if _, err := buf.Read(m.LogName[:]); err != nil {
		return fmt.Errorf("read logname: %w", err)
	}

	return nil
}

// ClientConfig конфигурация клиента LogServer
type ClientConfig struct {
	Host           string // хост LogServer
	Port           int    // порт LogServer
	ConnectTimeout int    // таймаут подключения (мс)
	ReadTimeout    int    // таймаут чтения (мс)
	WriteTimeout   int    // таймаут записи (мс)
	ReconnectDelay int    // задержка переподключения (мс)
}

// DefaultConfig возвращает конфигурацию по умолчанию
func DefaultConfig() *ClientConfig {
	return &ClientConfig{
		Host:           "localhost",
		Port:           3333,
		ConnectTimeout: 10000,
		ReadTimeout:    10000,
		WriteTimeout:   6000,
		ReconnectDelay: 5000,
	}
}

// LogEntry запись лога
type LogEntry struct {
	Timestamp string `json:"timestamp"`
	Level     string `json:"level"`
	Logger    string `json:"logger"`
	Message   string `json:"message"`
	Raw       string `json:"raw"` // исходная строка
}

// ConnectionStatus статус подключения к LogServer
type ConnectionStatus struct {
	Connected      bool   `json:"connected"`
	Host           string `json:"host"`
	Port           int    `json:"port"`
	LastError      string `json:"lastError,omitempty"`
	ReconnectCount int    `json:"reconnectCount"`
}
