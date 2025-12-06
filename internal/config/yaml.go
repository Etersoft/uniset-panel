package config

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

// ServersConfigFile представляет структуру YAML файла конфигурации
type ServersConfigFile struct {
	Servers []ServerConfig `yaml:"servers"`
}

// LoadServersFromYAML загружает конфигурацию серверов из YAML файла
func LoadServersFromYAML(path string) ([]ServerConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	var configFile ServersConfigFile
	if err := yaml.Unmarshal(data, &configFile); err != nil {
		return nil, fmt.Errorf("failed to parse YAML: %w", err)
	}

	// Валидация: каждый сервер должен иметь URL
	for i, srv := range configFile.Servers {
		if srv.URL == "" {
			return nil, fmt.Errorf("server at index %d has no URL", i)
		}
	}

	return configFile.Servers, nil
}
