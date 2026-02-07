package config

import (
	"log/slog"
	"testing"
	"time"
)

func TestUIConfigGetIONCUISensorsFilter(t *testing.T) {
	tests := []struct {
		name     string
		ui       *UIConfig
		expected bool
	}{
		{"nil UIConfig", nil, false},
		{"nil pointer", &UIConfig{IONCUISensorsFilter: nil}, false},
		{"false value", &UIConfig{IONCUISensorsFilter: boolPtr(false)}, false},
		{"true value", &UIConfig{IONCUISensorsFilter: boolPtr(true)}, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.ui.GetIONCUISensorsFilter(); got != tt.expected {
				t.Errorf("GetIONCUISensorsFilter() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestUIConfigGetOPCUAUISensorsFilter(t *testing.T) {
	tests := []struct {
		name     string
		ui       *UIConfig
		expected bool
	}{
		{"nil UIConfig", nil, false},
		{"nil pointer", &UIConfig{OPCUAUISensorsFilter: nil}, false},
		{"false value", &UIConfig{OPCUAUISensorsFilter: boolPtr(false)}, false},
		{"true value", &UIConfig{OPCUAUISensorsFilter: boolPtr(true)}, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.ui.GetOPCUAUISensorsFilter(); got != tt.expected {
				t.Errorf("GetOPCUAUISensorsFilter() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func boolPtr(b bool) *bool {
	return &b
}

func TestLogStreamConfigGetBufferSize(t *testing.T) {
	tests := []struct {
		name     string
		config   *LogStreamConfig
		expected int
	}{
		{"nil config", nil, 5000},
		{"zero value", &LogStreamConfig{BufferSize: 0}, 5000},
		{"negative value", &LogStreamConfig{BufferSize: -100}, 5000},
		{"custom value", &LogStreamConfig{BufferSize: 10000}, 10000},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.config.GetBufferSize(); got != tt.expected {
				t.Errorf("GetBufferSize() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestLogStreamConfigGetBatchSize(t *testing.T) {
	tests := []struct {
		name     string
		config   *LogStreamConfig
		expected int
	}{
		{"nil config", nil, 500},
		{"zero value", &LogStreamConfig{BatchSize: 0}, 500},
		{"negative value", &LogStreamConfig{BatchSize: -50}, 500},
		{"custom value", &LogStreamConfig{BatchSize: 1000}, 1000},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.config.GetBatchSize(); got != tt.expected {
				t.Errorf("GetBatchSize() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestLogStreamConfigGetBatchInterval(t *testing.T) {
	tests := []struct {
		name     string
		config   *LogStreamConfig
		expected time.Duration
	}{
		{"nil config", nil, 100 * time.Millisecond},
		{"zero value", &LogStreamConfig{BatchInterval: 0}, 100 * time.Millisecond},
		{"negative value", &LogStreamConfig{BatchInterval: -time.Second}, 100 * time.Millisecond},
		{"custom value", &LogStreamConfig{BatchInterval: 200 * time.Millisecond}, 200 * time.Millisecond},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.config.GetBatchInterval(); got != tt.expected {
				t.Errorf("GetBatchInterval() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestConfigIsControlEnabled(t *testing.T) {
	tests := []struct {
		name     string
		tokens   []string
		expected bool
	}{
		{"no tokens", nil, false},
		{"empty tokens", []string{}, false},
		{"one token", []string{"secret"}, true},
		{"multiple tokens", []string{"admin", "user"}, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := &Config{ControlTokens: tt.tokens}
			if got := cfg.IsControlEnabled(); got != tt.expected {
				t.Errorf("IsControlEnabled() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestConfigGetControlTimeout(t *testing.T) {
	tests := []struct {
		name     string
		timeout  time.Duration
		expected time.Duration
	}{
		{"zero timeout", 0, 60 * time.Second},
		{"negative timeout", -time.Minute, 60 * time.Second},
		{"custom timeout", 120 * time.Second, 120 * time.Second},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := &Config{ControlTimeout: tt.timeout}
			if got := cfg.GetControlTimeout(); got != tt.expected {
				t.Errorf("GetControlTimeout() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestConfigGetSensorBatchSize(t *testing.T) {
	tests := []struct {
		name      string
		batchSize int
		expected  int
	}{
		{"zero", 0, 300},
		{"negative", -100, 300},
		{"custom", 500, 500},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := &Config{SensorBatchSize: tt.batchSize}
			if got := cfg.GetSensorBatchSize(); got != tt.expected {
				t.Errorf("GetSensorBatchSize() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestConfigGetMaxRecords(t *testing.T) {
	tests := []struct {
		name       string
		maxRecords int64
		expected   int64
	}{
		{"zero", 0, 1000000},
		{"negative", -100, 1000000},
		{"custom", 500000, 500000},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := &Config{MaxRecords: tt.maxRecords}
			if got := cfg.GetMaxRecords(); got != tt.expected {
				t.Errorf("GetMaxRecords() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestConfigGetRecordingPath(t *testing.T) {
	tests := []struct {
		name     string
		path     string
		expected string
	}{
		{"empty", "", "./recording.db"},
		{"custom", "/data/recording.db", "/data/recording.db"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := &Config{RecordingPath: tt.path}
			if got := cfg.GetRecordingPath(); got != tt.expected {
				t.Errorf("GetRecordingPath() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestParseLogLevel(t *testing.T) {
	tests := []struct {
		input    string
		expected slog.Level
	}{
		{"debug", slog.LevelDebug},
		{"DEBUG", slog.LevelDebug},
		{"info", slog.LevelInfo},
		{"INFO", slog.LevelInfo},
		{"warn", slog.LevelWarn},
		{"warning", slog.LevelWarn},
		{"WARN", slog.LevelWarn},
		{"error", slog.LevelError},
		{"ERROR", slog.LevelError},
		{"unknown", slog.LevelInfo},
		{"", slog.LevelInfo},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			if got := ParseLogLevel(tt.input); got != tt.expected {
				t.Errorf("ParseLogLevel(%q) = %v, want %v", tt.input, got, tt.expected)
			}
		})
	}
}

func TestGenerateServerID(t *testing.T) {
	// Test that same URL produces same ID
	id1 := generateServerID("http://localhost:8080")
	id2 := generateServerID("http://localhost:8080")
	if id1 != id2 {
		t.Errorf("same URL should produce same ID: %q != %q", id1, id2)
	}

	// Test that different URLs produce different IDs
	id3 := generateServerID("http://localhost:9090")
	if id1 == id3 {
		t.Errorf("different URLs should produce different IDs: %q == %q", id1, id3)
	}

	// Test ID length (8 hex characters)
	if len(id1) != 8 {
		t.Errorf("ID should be 8 characters, got %d: %q", len(id1), id1)
	}
}

func TestStringSlice(t *testing.T) {
	var s stringSlice

	// Test initial String()
	if got := s.String(); got != "" {
		t.Errorf("empty stringSlice.String() = %q, want %q", got, "")
	}

	// Test Set()
	if err := s.Set("value1"); err != nil {
		t.Errorf("Set(value1) returned error: %v", err)
	}
	if err := s.Set("value2"); err != nil {
		t.Errorf("Set(value2) returned error: %v", err)
	}

	// Test String() after Set
	expected := "value1,value2"
	if got := s.String(); got != expected {
		t.Errorf("stringSlice.String() = %q, want %q", got, expected)
	}

	// Test length
	if len(s) != 2 {
		t.Errorf("len(stringSlice) = %d, want 2", len(s))
	}
}

func TestStorageTypeConstants(t *testing.T) {
	if StorageMemory != "memory" {
		t.Errorf("StorageMemory = %q, want %q", StorageMemory, "memory")
	}
	if StorageSQLite != "sqlite" {
		t.Errorf("StorageSQLite = %q, want %q", StorageSQLite, "sqlite")
	}
}

func TestServerConfigFields(t *testing.T) {
	srv := ServerConfig{
		ID:   "test-id",
		URL:  "http://localhost:8080",
		Name: "Test Server",
	}

	if srv.ID != "test-id" {
		t.Errorf("ID = %q, want %q", srv.ID, "test-id")
	}
	if srv.URL != "http://localhost:8080" {
		t.Errorf("URL = %q, want %q", srv.URL, "http://localhost:8080")
	}
	if srv.Name != "Test Server" {
		t.Errorf("Name = %q, want %q", srv.Name, "Test Server")
	}
}

func TestControlConfigFields(t *testing.T) {
	ctrl := ControlConfig{
		Tokens:  []string{"admin", "user"},
		Timeout: 60 * time.Second,
	}

	if len(ctrl.Tokens) != 2 {
		t.Errorf("Tokens length = %d, want 2", len(ctrl.Tokens))
	}
	if ctrl.Timeout != 60*time.Second {
		t.Errorf("Timeout = %v, want 60s", ctrl.Timeout)
	}
}

func TestBuildJournalURL(t *testing.T) {
	tests := []struct {
		name     string
		config   JournalConfig
		contains []string // substrings that should be in the result
	}{
		{
			name: "basic URL",
			config: JournalConfig{
				URL: "clickhouse://localhost:9000/uniset",
			},
			contains: []string{"clickhouse://localhost:9000/uniset"},
		},
		{
			name: "with name",
			config: JournalConfig{
				URL:  "clickhouse://localhost:9000/uniset",
				Name: "Production",
			},
			contains: []string{"name=Production"},
		},
		{
			name: "with table",
			config: JournalConfig{
				URL:   "clickhouse://localhost:9000/uniset",
				Table: "custom_table",
			},
			contains: []string{"table=custom_table"},
		},
		{
			name: "with database override",
			config: JournalConfig{
				URL:      "clickhouse://localhost:9000/default",
				Database: "custom_db",
			},
			contains: []string{"/custom_db"},
		},
		{
			name: "with all options",
			config: JournalConfig{
				URL:      "clickhouse://localhost:9000/default",
				Name:     "Test",
				Table:    "messages",
				Database: "mydb",
			},
			contains: []string{"name=Test", "table=messages", "/mydb"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := buildJournalURL(tt.config)
			for _, substr := range tt.contains {
				if !containsString(result, substr) {
					t.Errorf("buildJournalURL() = %q, should contain %q", result, substr)
				}
			}
		})
	}
}

func TestBuildJournalURL_InvalidURL(t *testing.T) {
	config := JournalConfig{
		URL: "://invalid",
	}
	result := buildJournalURL(config)
	// Should return original URL if parsing fails
	if result != "://invalid" {
		t.Errorf("expected original URL for invalid input, got %q", result)
	}
}

func containsString(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(substr) == 0 ||
		(len(s) > 0 && len(substr) > 0 && stringContains(s, substr)))
}

func stringContains(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

func TestJournalConfigFields(t *testing.T) {
	cfg := JournalConfig{
		URL:      "clickhouse://host:9000/db",
		Name:     "Test",
		Table:    "messages",
		Database: "custom",
	}

	if cfg.URL != "clickhouse://host:9000/db" {
		t.Errorf("URL = %q, want clickhouse://host:9000/db", cfg.URL)
	}
	if cfg.Name != "Test" {
		t.Errorf("Name = %q, want Test", cfg.Name)
	}
	if cfg.Table != "messages" {
		t.Errorf("Table = %q, want messages", cfg.Table)
	}
	if cfg.Database != "custom" {
		t.Errorf("Database = %q, want custom", cfg.Database)
	}
}

func TestMergeAndSortServers(t *testing.T) {
	tests := []struct {
		name          string
		configServers []ServerConfig
		cliServers    []ServerConfig
		expectedURLs  []string // ожидаемый порядок URL
	}{
		{
			name:          "only CLI servers - sorted alphabetically",
			configServers: nil,
			cliServers: []ServerConfig{
				{URL: "http://zebra:8080"},
				{URL: "http://alpha:8080"},
				{URL: "http://beta:8080"},
			},
			expectedURLs: []string{
				"http://alpha:8080",
				"http://beta:8080",
				"http://zebra:8080",
			},
		},
		{
			name: "only config servers - preserve original order",
			configServers: []ServerConfig{
				{URL: "http://zebra:8080"},
				{URL: "http://alpha:8080"},
				{URL: "http://beta:8080"},
			},
			cliServers: nil,
			expectedURLs: []string{
				"http://zebra:8080",
				"http://alpha:8080",
				"http://beta:8080",
			},
		},
		{
			name: "config + CLI - config order preserved, CLI sorted and appended",
			configServers: []ServerConfig{
				{URL: "http://prod-3:8080"},
				{URL: "http://prod-1:8080"},
			},
			cliServers: []ServerConfig{
				{URL: "http://dev-z:8080"},
				{URL: "http://dev-a:8080"},
			},
			expectedURLs: []string{
				"http://prod-3:8080", // config первый (оригинальный порядок)
				"http://prod-1:8080", // config второй (оригинальный порядок)
				"http://dev-a:8080",  // CLI отсортирован
				"http://dev-z:8080",  // CLI отсортирован
			},
		},
		{
			name:          "empty both",
			configServers: nil,
			cliServers:    nil,
			expectedURLs:  []string{},
		},
		{
			name: "single config server",
			configServers: []ServerConfig{
				{URL: "http://single:8080"},
			},
			cliServers:   nil,
			expectedURLs: []string{"http://single:8080"},
		},
		{
			name:          "single CLI server",
			configServers: nil,
			cliServers: []ServerConfig{
				{URL: "http://single:8080"},
			},
			expectedURLs: []string{"http://single:8080"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := MergeAndSortServers(tt.configServers, tt.cliServers)

			if len(result) != len(tt.expectedURLs) {
				t.Fatalf("got %d servers, want %d", len(result), len(tt.expectedURLs))
			}

			for i, expected := range tt.expectedURLs {
				if result[i].URL != expected {
					t.Errorf("server[%d].URL = %q, want %q", i, result[i].URL, expected)
				}
			}
		})
	}
}

// ============================================================================
// Тесты MergeAndSortLaunchers
// ============================================================================

func TestMergeAndSortLaunchers_OnlyCLI_SortedAlphabetically(t *testing.T) {
	cliLaunchers := []LauncherConfig{
		{URL: "http://zebra:8080"},
		{URL: "http://alpha:8080"},
		{URL: "http://beta:8080"},
	}

	result := MergeAndSortLaunchers(nil, cliLaunchers)

	expectedURLs := []string{
		"http://alpha:8080",
		"http://beta:8080",
		"http://zebra:8080",
	}

	if len(result) != len(expectedURLs) {
		t.Fatalf("got %d launchers, want %d", len(result), len(expectedURLs))
	}
	for i, expected := range expectedURLs {
		if result[i].URL != expected {
			t.Errorf("launcher[%d].URL = %q, want %q", i, result[i].URL, expected)
		}
	}
}

func TestMergeAndSortLaunchers_OnlyConfig_PreserveOrder(t *testing.T) {
	configLaunchers := []LauncherConfig{
		{URL: "http://zebra:8080", Name: "Zebra"},
		{URL: "http://alpha:8080", Name: "Alpha"},
		{URL: "http://beta:8080", Name: "Beta"},
	}

	result := MergeAndSortLaunchers(configLaunchers, nil)

	expectedURLs := []string{
		"http://zebra:8080",
		"http://alpha:8080",
		"http://beta:8080",
	}

	if len(result) != len(expectedURLs) {
		t.Fatalf("got %d launchers, want %d", len(result), len(expectedURLs))
	}
	for i, expected := range expectedURLs {
		if result[i].URL != expected {
			t.Errorf("launcher[%d].URL = %q, want %q", i, result[i].URL, expected)
		}
	}
}

func TestMergeAndSortLaunchers_ConfigAndCLI_ConfigFirstThenCLISorted(t *testing.T) {
	configLaunchers := []LauncherConfig{
		{URL: "http://prod-3:8080", Name: "Prod3"},
		{URL: "http://prod-1:8080", Name: "Prod1"},
	}
	cliLaunchers := []LauncherConfig{
		{URL: "http://dev-z:8080"},
		{URL: "http://dev-a:8080"},
	}

	result := MergeAndSortLaunchers(configLaunchers, cliLaunchers)

	expectedURLs := []string{
		"http://prod-3:8080", // config первый (оригинальный порядок)
		"http://prod-1:8080", // config второй (оригинальный порядок)
		"http://dev-a:8080",  // CLI отсортирован
		"http://dev-z:8080",  // CLI отсортирован
	}

	if len(result) != len(expectedURLs) {
		t.Fatalf("got %d launchers, want %d", len(result), len(expectedURLs))
	}
	for i, expected := range expectedURLs {
		if result[i].URL != expected {
			t.Errorf("launcher[%d].URL = %q, want %q", i, result[i].URL, expected)
		}
	}
}

func TestMergeAndSortLaunchers_EmptyBoth(t *testing.T) {
	result := MergeAndSortLaunchers(nil, nil)

	if len(result) != 0 {
		t.Errorf("expected 0 launchers, got %d", len(result))
	}
}

func TestMergeAndSortLaunchers_SingleConfig(t *testing.T) {
	configLaunchers := []LauncherConfig{
		{URL: "http://single:8080", Name: "Single"},
	}

	result := MergeAndSortLaunchers(configLaunchers, nil)

	if len(result) != 1 {
		t.Fatalf("got %d launchers, want 1", len(result))
	}
	if result[0].URL != "http://single:8080" {
		t.Errorf("launcher[0].URL = %q, want http://single:8080", result[0].URL)
	}
}

func TestMergeAndSortLaunchers_SingleCLI(t *testing.T) {
	cliLaunchers := []LauncherConfig{
		{URL: "http://single:8080"},
	}

	result := MergeAndSortLaunchers(nil, cliLaunchers)

	if len(result) != 1 {
		t.Fatalf("got %d launchers, want 1", len(result))
	}
	if result[0].URL != "http://single:8080" {
		t.Errorf("launcher[0].URL = %q, want http://single:8080", result[0].URL)
	}
}

func TestMergeAndSortLaunchers_PreservesFields(t *testing.T) {
	configLaunchers := []LauncherConfig{
		{
			URL:          "http://launcher1:8080",
			Name:         "Launcher1",
			ID:           "l1",
			ReadToken:    "reader",
			ControlToken: "controller",
		},
	}

	result := MergeAndSortLaunchers(configLaunchers, nil)

	if len(result) != 1 {
		t.Fatalf("got %d launchers, want 1", len(result))
	}
	if result[0].Name != "Launcher1" {
		t.Errorf("Name = %q, want Launcher1", result[0].Name)
	}
	if result[0].ID != "l1" {
		t.Errorf("ID = %q, want l1", result[0].ID)
	}
	if result[0].ReadToken != "reader" {
		t.Errorf("ReadToken = %q, want reader", result[0].ReadToken)
	}
	if result[0].ControlToken != "controller" {
		t.Errorf("ControlToken = %q, want controller", result[0].ControlToken)
	}
}

func TestMergeAndSortLaunchers_DoesNotModifyInput(t *testing.T) {
	configLaunchers := []LauncherConfig{
		{URL: "http://b:8080"},
		{URL: "http://a:8080"},
	}
	cliLaunchers := []LauncherConfig{
		{URL: "http://z:8080"},
		{URL: "http://y:8080"},
	}

	// Копируем для сравнения
	origConfig := make([]LauncherConfig, len(configLaunchers))
	copy(origConfig, configLaunchers)
	origCLI := make([]LauncherConfig, len(cliLaunchers))
	copy(origCLI, cliLaunchers)

	_ = MergeAndSortLaunchers(configLaunchers, cliLaunchers)

	// Проверяем что входные данные не изменились
	for i, l := range configLaunchers {
		if l.URL != origConfig[i].URL {
			t.Errorf("configLaunchers was modified: [%d].URL = %q, was %q", i, l.URL, origConfig[i].URL)
		}
	}
	for i, l := range cliLaunchers {
		if l.URL != origCLI[i].URL {
			t.Errorf("cliLaunchers was modified: [%d].URL = %q, was %q", i, l.URL, origCLI[i].URL)
		}
	}
}

func TestMergeAndSortServers_DoesNotModifyInput(t *testing.T) {
	// Проверяем что функция не модифицирует входные слайсы
	configServers := []ServerConfig{
		{URL: "http://b:8080"},
		{URL: "http://a:8080"},
	}
	cliServers := []ServerConfig{
		{URL: "http://z:8080"},
		{URL: "http://y:8080"},
	}

	// Копируем для сравнения
	origConfig := make([]ServerConfig, len(configServers))
	copy(origConfig, configServers)
	origCLI := make([]ServerConfig, len(cliServers))
	copy(origCLI, cliServers)

	_ = MergeAndSortServers(configServers, cliServers)

	// Проверяем что входные данные не изменились
	for i, srv := range configServers {
		if srv.URL != origConfig[i].URL {
			t.Errorf("configServers was modified: [%d].URL = %q, was %q", i, srv.URL, origConfig[i].URL)
		}
	}
	for i, srv := range cliServers {
		if srv.URL != origCLI[i].URL {
			t.Errorf("cliServers was modified: [%d].URL = %q, was %q", i, srv.URL, origCLI[i].URL)
		}
	}
}
