package config

import (
	"crypto/sha256"
	"encoding/hex"
	"flag"
	"log/slog"
	"net/url"
	"sort"
	"strings"
	"time"
)

// Default values for configuration parameters
const (
	DefaultLogStreamBufferSize  = 5000                  // размер буфера LogStream
	DefaultLogStreamBatchSize   = 500                   // макс. строк в батче LogStream
	DefaultLogStreamBatchInterval = 100 * time.Millisecond // интервал отправки батча LogStream
	DefaultControlTimeout       = 60 * time.Second      // таймаут неактивности контроллера
	DefaultSensorBatchSize      = 300                   // макс. датчиков в одном запросе
	DefaultMaxRecords           = int64(1000000)        // макс. записей в циклическом буфере
	DefaultRecordingPath        = "./recording.db"      // путь к файлу записи
	DefaultPollInterval         = time.Second            // интервал опроса серверов
	DefaultAddr                 = ":8181"               // адрес по умолчанию
)

type StorageType string

const (
	StorageMemory StorageType = "memory"
	StorageSQLite StorageType = "sqlite"
)

// ServerConfig описывает конфигурацию одного UniSet2 сервера
type ServerConfig struct {
	ID           string `yaml:"id,omitempty"`           // уникальный идентификатор (генерируется если не указан)
	URL          string `yaml:"url"`                    // URL UniSet2 HTTP API
	Name         string `yaml:"name,omitempty"`         // человекочитаемое имя (опционально)
	UnisetConfig string `yaml:"unisetConfig,omitempty"` // per-server XML config path (опционально)
}

// UIConfig описывает настройки UI
type UIConfig struct {
	// true = клиентская фильтрация (UI), false = серверная фильтрация (default: false)
	IONCUISensorsFilter  *bool `yaml:"ioncUISensorsFilter,omitempty"`
	OPCUAUISensorsFilter *bool `yaml:"opcuaUISensorsFilter,omitempty"`
}

// GetIONCUISensorsFilter возвращает значение с учётом default (false)
func (u *UIConfig) GetIONCUISensorsFilter() bool {
	if u == nil || u.IONCUISensorsFilter == nil {
		return false // default: серверная фильтрация
	}
	return *u.IONCUISensorsFilter
}

// GetOPCUAUISensorsFilter возвращает значение с учётом default (false)
func (u *UIConfig) GetOPCUAUISensorsFilter() bool {
	if u == nil || u.OPCUAUISensorsFilter == nil {
		return false // default: серверная фильтрация
	}
	return *u.OPCUAUISensorsFilter
}

// LogStreamConfig описывает настройки стриминга логов
type LogStreamConfig struct {
	BufferSize    int           `yaml:"bufferSize,omitempty"`    // размер буфера канала (default: 5000)
	BatchSize     int           `yaml:"batchSize,omitempty"`     // макс. строк в батче (default: 500)
	BatchInterval time.Duration `yaml:"batchInterval,omitempty"` // интервал отправки батча (default: 100ms)
}

// GetBufferSize возвращает размер буфера с default
func (l *LogStreamConfig) GetBufferSize() int {
	if l == nil || l.BufferSize <= 0 {
		return DefaultLogStreamBufferSize
	}
	return l.BufferSize
}

// GetBatchSize возвращает размер батча с default
func (l *LogStreamConfig) GetBatchSize() int {
	if l == nil || l.BatchSize <= 0 {
		return DefaultLogStreamBatchSize
	}
	return l.BatchSize
}

// GetBatchInterval возвращает интервал батча с default
func (l *LogStreamConfig) GetBatchInterval() time.Duration {
	if l == nil || l.BatchInterval <= 0 {
		return DefaultLogStreamBatchInterval
	}
	return l.BatchInterval
}

// ControlConfig описывает настройки контроля доступа
type ControlConfig struct {
	Tokens  []string      `yaml:"tokens,omitempty"`  // токены доступа
	Timeout time.Duration `yaml:"timeout,omitempty"` // таймаут неактивности (default: 60s)
}

// stringSlice реализует flag.Value для множественных строковых флагов
type stringSlice []string

func (s *stringSlice) String() string {
	return strings.Join(*s, ",")
}

func (s *stringSlice) Set(value string) error {
	*s = append(*s, value)
	return nil
}

type Config struct {
	// Серверы UniSet2 (новый формат)
	Servers []ServerConfig

	// Launcher'ы
	Launchers []LauncherConfig

	// Настройки UI
	UI *UIConfig

	// Настройки стриминга логов
	LogStream *LogStreamConfig

	Addr            string // адрес для прослушивания (формат: :port или host:port)
	PollInterval    time.Duration
	Storage         StorageType
	SQLitePath      string
	HistoryTTL      time.Duration
	LogFormat       string
	LogLevel        string
	ConFile         string
	ConfigFile      string        // путь к YAML конфигу
	SMURL           string        // URL SharedMemory API (пусто = отключено)
	SMPollInterval  time.Duration // Интервал опроса SM (0 = использовать PollInterval)
	UnisetSupplier  string        // Имя поставщика для операций set/freeze/unfreeze
	SensorBatchSize int           // Макс. количество датчиков в одном запросе (default: 300)
	ControlTokens   []string      // Токены для управления (пусто = управление для всех)
	ControlTimeout  time.Duration // Таймаут неактивности контроллера (default: 60s)

	// Recording settings
	RecordingPath    string // Путь к файлу записи SQLite (default: ./recording.db)
	RecordingEnabled bool   // Запись включена по умолчанию (default: false)
	MaxRecords       int64  // Макс. записей (циклический буфер, default: 1000000)

	// Dashboard settings
	DashboardsDir string // Директория с серверными dashboard'ами (опционально)

	// Journal settings
	JournalURLs []string // URL подключений к журналам (ClickHouse)

	// Sidebar settings
	Sidebar *SidebarConfig // Конфигурация sidebar групп (nil = legacy mode)

	// Overview settings
	Overview *OverviewConfig // Конфигурация System Overview (nil = показать все)

	// Development settings
	JSFile  string // Внешний файл app.js для разработки (вместо встроенного)
	CSSFile string // Внешний файл style.css для разработки (вместо встроенного)
}

// IsControlEnabled возвращает true если контроль токенами включён
func (c *Config) IsControlEnabled() bool {
	return len(c.ControlTokens) > 0
}

// GetControlTimeout возвращает таймаут с default
func (c *Config) GetControlTimeout() time.Duration {
	if c.ControlTimeout <= 0 {
		return DefaultControlTimeout
	}
	return c.ControlTimeout
}

// GetSensorBatchSize возвращает размер батча датчиков с default
func (c *Config) GetSensorBatchSize() int {
	if c.SensorBatchSize <= 0 {
		return DefaultSensorBatchSize
	}
	return c.SensorBatchSize
}

// GetMaxRecords возвращает максимальное количество записей с default
func (c *Config) GetMaxRecords() int64 {
	if c.MaxRecords <= 0 {
		return DefaultMaxRecords
	}
	return c.MaxRecords
}

// GetRecordingPath возвращает путь к файлу записи с default
func (c *Config) GetRecordingPath() string {
	if c.RecordingPath == "" {
		return DefaultRecordingPath
	}
	return c.RecordingPath
}

func Parse() *Config {
	cfg := &Config{}

	var unisetURLs stringSlice
	var launcherURLs stringSlice
	var controlTokens stringSlice
	var journalURLs stringSlice

	flag.Var(&unisetURLs, "uniset-url", "UniSet2 HTTP API URL (can be specified multiple times)")
	flag.Var(&launcherURLs, "launcher-url", "Launcher HTTP API URL (can be specified multiple times)")
	flag.Var(&journalURLs, "journal-url", "Journal ClickHouse URL (can be specified multiple times, format: clickhouse://host:port/db?table=xxx&name=Name)")
	flag.StringVar(&cfg.Addr, "addr", DefaultAddr, "Listen address (e.g. :8181 or 127.0.0.1:8181)")
	flag.DurationVar(&cfg.PollInterval, "poll-interval", DefaultPollInterval, "UniSet2 polling interval")

	var storageStr string
	flag.StringVar(&storageStr, "storage", "memory", "Storage type: memory or sqlite")

	flag.StringVar(&cfg.SQLitePath, "sqlite-path", "./history.db", "SQLite database path")
	flag.DurationVar(&cfg.HistoryTTL, "history-ttl", time.Hour, "History retention time")
	flag.StringVar(&cfg.LogFormat, "log-format", "text", "Log format: text or json")
	flag.StringVar(&cfg.LogLevel, "log-level", "warn", "Log level: debug, info, warn, error")
	flag.StringVar(&cfg.ConFile, "uniset-config", "", "UniSet2 XML configuration file (sensors metadata)")
	flag.StringVar(&cfg.ConfigFile, "config", "", "YAML configuration file for servers")
	flag.StringVar(&cfg.SMURL, "sm-url", "", "SharedMemory HTTP API URL (empty = disabled)")
	flag.DurationVar(&cfg.SMPollInterval, "sm-poll-interval", 0, "SharedMemory polling interval (0 = use poll-interval)")
	flag.StringVar(&cfg.UnisetSupplier, "uniset-supplier", "TestProc", "UniSet2 supplier name for set/freeze/unfreeze operations")
	flag.IntVar(&cfg.SensorBatchSize, "sensor-batch-size", DefaultSensorBatchSize, "Max sensors per request to UniSet2")
	flag.Var(&controlTokens, "control-token", "Control token for write access (can be specified multiple times, empty = allow all)")
	flag.DurationVar(&cfg.ControlTimeout, "control-timeout", DefaultControlTimeout, "Control session timeout")

	// Recording flags
	flag.StringVar(&cfg.RecordingPath, "recording-path", DefaultRecordingPath, "Recording SQLite database path")
	flag.BoolVar(&cfg.RecordingEnabled, "recording-enabled", false, "Start recording on startup")
	flag.Int64Var(&cfg.MaxRecords, "max-records", DefaultMaxRecords, "Max records in recording database (circular buffer)")

	// Dashboard flags
	flag.StringVar(&cfg.DashboardsDir, "dashboards-dir", "", "Directory with server dashboards (optional)")

	// Development flags (hot reload without container rebuild)
	flag.StringVar(&cfg.JSFile, "js", "", "External app.js file (hot reload)")
	flag.StringVar(&cfg.CSSFile, "css", "", "External style.css file (hot reload)")

	flag.Parse()
	cfg.ControlTokens = controlTokens
	cfg.JournalURLs = journalURLs

	cfg.Storage = StorageType(storageStr)
	if cfg.Storage != StorageMemory && cfg.Storage != StorageSQLite {
		cfg.Storage = StorageMemory
	}

	// Загрузка конфига из YAML (если указан)
	if cfg.ConfigFile != "" {
		yamlConfig, err := LoadFromYAML(cfg.ConfigFile)
		if err != nil {
			slog.Error("Failed to load config file", "path", cfg.ConfigFile, "error", err)
		} else {
			cfg.Servers = yamlConfig.Servers
			cfg.Launchers = yamlConfig.Launchers
			cfg.UI = yamlConfig.UI
			cfg.LogStream = yamlConfig.LogStream
			if yamlConfig.SensorBatchSize > 0 {
				cfg.SensorBatchSize = yamlConfig.SensorBatchSize
			}
			// Control settings from YAML
			if yamlConfig.Control != nil {
				cfg.ControlTokens = append(cfg.ControlTokens, yamlConfig.Control.Tokens...)
				if yamlConfig.Control.Timeout > 0 {
					cfg.ControlTimeout = yamlConfig.Control.Timeout
				}
			}
			// Sidebar из YAML
			cfg.Sidebar = yamlConfig.Sidebar
			// Overview из YAML
			cfg.Overview = yamlConfig.Overview
			// Журналы из YAML (конвертируем в URL формат)
			for _, j := range yamlConfig.Journals {
				journalURL := buildJournalURL(j)
				cfg.JournalURLs = append(cfg.JournalURLs, journalURL)
			}
		}
	}

	// Добавление серверов из CLI флагов
	var cliServers []ServerConfig
	for _, url := range unisetURLs {
		cliServers = append(cliServers, ServerConfig{
			URL: url,
		})
	}

	// Объединяем и сортируем серверы
	cfg.Servers = MergeAndSortServers(cfg.Servers, cliServers)

	// Если серверы не указаны, использовать значение по умолчанию
	if len(cfg.Servers) == 0 {
		cfg.Servers = []ServerConfig{
			{URL: "http://localhost:8080"},
		}
	}

	// Генерация ID для серверов без явного ID + подстановка плейсхолдеров в имени
	for i := range cfg.Servers {
		if cfg.Servers[i].ID == "" {
			cfg.Servers[i].ID = generateServerID(cfg.Servers[i].URL)
		}
		if cfg.Servers[i].Name != "" {
			cfg.Servers[i].Name = expandNamePlaceholders(cfg.Servers[i].Name, cfg.Servers[i].URL)
		}
	}

	// Добавление Launcher'ов из CLI флагов
	var cliLaunchers []LauncherConfig
	for _, rawURL := range launcherURLs {
		cleanURL, token := parseLauncherURL(rawURL)
		cliLaunchers = append(cliLaunchers, LauncherConfig{
			URL:          cleanURL,
			ControlToken: token,
		})
	}

	// Объединяем и сортируем Launcher'ы
	cfg.Launchers = MergeAndSortLaunchers(cfg.Launchers, cliLaunchers)

	// Генерация ID для Launcher'ов без явного ID
	for i := range cfg.Launchers {
		if cfg.Launchers[i].ID == "" {
			cfg.Launchers[i].ID = generateServerID(cfg.Launchers[i].URL)
		}
	}

	// Fallback имени Launcher'а на host:port из URL + подстановка плейсхолдеров
	for i := range cfg.Launchers {
		if cfg.Launchers[i].Name == "" {
			if u, err := url.Parse(cfg.Launchers[i].URL); err == nil {
				cfg.Launchers[i].Name = u.Host
			}
		} else {
			cfg.Launchers[i].Name = expandNamePlaceholders(cfg.Launchers[i].Name, cfg.Launchers[i].URL)
		}
	}

	return cfg
}

// expandNamePlaceholders подставляет в name значения из URL:
//   - {server} → полный URL (http://host:port)
//   - {host} → hostname без порта
//   - {port} → порт
//
// Если name не содержит плейсхолдеров, возвращается как есть.
func expandNamePlaceholders(name, rawURL string) string {
	if !strings.Contains(name, "{") {
		return name
	}
	u, err := url.Parse(rawURL)
	if err != nil {
		return name
	}
	host := u.Hostname()
	port := u.Port()

	name = strings.ReplaceAll(name, "{server}", rawURL)
	name = strings.ReplaceAll(name, "{host}", host)
	name = strings.ReplaceAll(name, "{port}", port)
	return name
}

// parseLauncherURL извлекает токен из userinfo части URL.
// Формат: http://token@host:port → cleanURL="http://host:port", token="token"
// Если userinfo отсутствует, возвращает URL как есть и пустой токен.
func parseLauncherURL(rawURL string) (cleanURL, token string) {
	u, err := url.Parse(rawURL)
	if err != nil || u.User == nil {
		return rawURL, ""
	}
	token = u.User.Username()
	u.User = nil
	return u.String(), token
}

// generateServerID генерирует короткий ID на основе URL
func generateServerID(urlStr string) string {
	hash := sha256.Sum256([]byte(urlStr))
	return hex.EncodeToString(hash[:4]) // первые 8 символов hex
}

// MergeAndSortServers объединяет серверы из конфига и CLI с правильной сортировкой:
// - Серверы из конфига сохраняют оригинальный порядок
// - CLI серверы сортируются по алфавиту и добавляются в конец
// - Если нет серверов из конфига, все серверы сортируются по алфавиту
func MergeAndSortServers(configServers, cliServers []ServerConfig) []ServerConfig {
	// Сортируем CLI серверы по алфавиту (по URL)
	sortedCLI := make([]ServerConfig, len(cliServers))
	copy(sortedCLI, cliServers)
	sort.Slice(sortedCLI, func(i, j int) bool {
		return sortedCLI[i].URL < sortedCLI[j].URL
	})

	// Объединяем: сначала конфиг (в оригинальном порядке), потом CLI (отсортированные)
	result := make([]ServerConfig, 0, len(configServers)+len(sortedCLI))
	result = append(result, configServers...)
	result = append(result, sortedCLI...)

	// Если не было серверов из конфига, сортируем весь результат по алфавиту
	if len(configServers) == 0 && len(result) > 1 {
		sort.Slice(result, func(i, j int) bool {
			return result[i].URL < result[j].URL
		})
	}

	return result
}

// MergeAndSortLaunchers объединяет Launcher'ы из конфига и CLI с правильной сортировкой:
// - Launcher'ы из конфига сохраняют оригинальный порядок
// - CLI Launcher'ы сортируются по алфавиту и добавляются в конец
// - Если нет Launcher'ов из конфига, все сортируются по алфавиту
func MergeAndSortLaunchers(configLaunchers, cliLaunchers []LauncherConfig) []LauncherConfig {
	sortedCLI := make([]LauncherConfig, len(cliLaunchers))
	copy(sortedCLI, cliLaunchers)
	sort.Slice(sortedCLI, func(i, j int) bool {
		return sortedCLI[i].URL < sortedCLI[j].URL
	})

	result := make([]LauncherConfig, 0, len(configLaunchers)+len(sortedCLI))
	result = append(result, configLaunchers...)
	result = append(result, sortedCLI...)

	if len(configLaunchers) == 0 && len(result) > 1 {
		sort.Slice(result, func(i, j int) bool {
			return result[i].URL < result[j].URL
		})
	}

	return result
}

// buildJournalURL строит URL для журнала из YAML конфигурации
func buildJournalURL(j JournalConfig) string {
	u, err := url.Parse(j.URL)
	if err != nil {
		return j.URL // возвращаем как есть, если не парсится
	}

	q := u.Query()
	if j.Name != "" {
		q.Set("name", j.Name)
	}
	if j.Table != "" {
		q.Set("table", j.Table)
	}
	if j.Database != "" {
		// Переопределяем базу данных из URL
		u.Path = "/" + j.Database
	}
	u.RawQuery = q.Encode()
	return u.String()
}

// ParseLogLevel converts string log level to slog.Level
func ParseLogLevel(level string) slog.Level {
	switch strings.ToLower(level) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
