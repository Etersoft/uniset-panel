package config

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

// JournalConfig описывает конфигурацию одного журнала
type JournalConfig struct {
	URL      string `yaml:"url"`                // ClickHouse URL (clickhouse://host:port/db)
	Name     string `yaml:"name,omitempty"`     // Человекочитаемое имя (опционально)
	Table    string `yaml:"table,omitempty"`    // Таблица сообщений (default: main_messages_src)
	Database string `yaml:"database,omitempty"` // База данных (опционально, переопределяет URL)
}

// LauncherConfig описывает конфигурацию одного Launcher'а
type LauncherConfig struct {
	URL          string `yaml:"url"`
	Name         string `yaml:"name,omitempty"`         // человекочитаемое имя (опционально)
	ID           string `yaml:"id,omitempty"`           // уникальный идентификатор (генерируется если не указан)
	ReadToken    string `yaml:"readToken,omitempty"`
	ControlToken string `yaml:"controlToken,omitempty"`
}

// SidebarGroupConfig описывает одну группу в sidebar
type SidebarGroupConfig struct {
	Name        string   `yaml:"name"`
	Icon        string   `yaml:"icon,omitempty"`
	Items       []string `yaml:"items,omitempty"`
	Patterns    []string `yaml:"patterns,omitempty"`
	GroupByType bool     `yaml:"group_by_type,omitempty"`
}

// SidebarConfig описывает конфигурацию sidebar
type SidebarConfig struct {
	Groups []SidebarGroupConfig `yaml:"groups,omitempty"`
}

// ConfigFile представляет структуру YAML файла конфигурации
type ConfigFile struct {
	Servers         []ServerConfig   `yaml:"servers"`
	Launchers       []LauncherConfig `yaml:"launchers,omitempty"`       // Launcher'ы
	UI              *UIConfig        `yaml:"ui,omitempty"`
	LogStream       *LogStreamConfig `yaml:"logStream,omitempty"`
	SensorBatchSize int              `yaml:"sensorBatchSize,omitempty"` // Макс. датчиков в одном запросе (default: 300)
	Control         *ControlConfig   `yaml:"control,omitempty"`         // Настройки контроля доступа
	Journals        []JournalConfig  `yaml:"journals,omitempty"`        // Журналы сообщений (ClickHouse)
	Sidebar         *SidebarConfig   `yaml:"sidebar,omitempty"`         // Конфигурация sidebar групп
}

// LoadFromYAML загружает полную конфигурацию из YAML файла
func LoadFromYAML(path string) (*ConfigFile, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	var configFile ConfigFile
	if err := yaml.Unmarshal(data, &configFile); err != nil {
		return nil, fmt.Errorf("failed to parse YAML: %w", err)
	}

	// Валидация: каждый сервер должен иметь URL
	for i, srv := range configFile.Servers {
		if srv.URL == "" {
			return nil, fmt.Errorf("server at index %d has no URL", i)
		}
	}

	return &configFile, nil
}

// LoadServersFromYAML загружает конфигурацию серверов из YAML файла (для обратной совместимости)
func LoadServersFromYAML(path string) ([]ServerConfig, error) {
	configFile, err := LoadFromYAML(path)
	if err != nil {
		return nil, err
	}
	return configFile.Servers, nil
}
