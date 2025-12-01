package config

import (
	"flag"
	"time"
)

type StorageType string

const (
	StorageMemory StorageType = "memory"
	StorageSQLite StorageType = "sqlite"
)

type Config struct {
	UnisetURL    string
	Port         int
	PollInterval time.Duration
	Storage      StorageType
	SQLitePath   string
	HistoryTTL   time.Duration
}

func Parse() *Config {
	cfg := &Config{}

	flag.StringVar(&cfg.UnisetURL, "uniset-url", "http://localhost:8080", "UniSet2 HTTP API URL")
	flag.IntVar(&cfg.Port, "port", 8000, "Web server port")
	flag.DurationVar(&cfg.PollInterval, "poll-interval", 5*time.Second, "UniSet2 polling interval")

	var storageStr string
	flag.StringVar(&storageStr, "storage", "memory", "Storage type: memory or sqlite")

	flag.StringVar(&cfg.SQLitePath, "sqlite-path", "./history.db", "SQLite database path")
	flag.DurationVar(&cfg.HistoryTTL, "history-ttl", time.Hour, "History retention time")

	flag.Parse()

	cfg.Storage = StorageType(storageStr)
	if cfg.Storage != StorageMemory && cfg.Storage != StorageSQLite {
		cfg.Storage = StorageMemory
	}

	return cfg
}
