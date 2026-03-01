package logger

import (
	"log/slog"
	"testing"
)

func TestLoggerInit(t *testing.T) {
	// Test that log is initialized by init()
	if log == nil {
		t.Fatal("log should be initialized by init()")
	}
}

func TestInitTextFormat(t *testing.T) {
	Init("text", slog.LevelInfo)
	if log == nil {
		t.Fatal("log is nil after Init(text)")
	}
}

func TestInitJSONFormat(t *testing.T) {
	Init("json", slog.LevelDebug)
	if log == nil {
		t.Fatal("log is nil after Init(json)")
	}
}

func TestInitDefaultFormat(t *testing.T) {
	Init("unknown", slog.LevelWarn)
	if log == nil {
		t.Fatal("log is nil after Init(unknown)")
	}
}

func TestSlogDefaultAfterInit(t *testing.T) {
	Init("text", slog.LevelDebug)
	// After Init(), slog.Default() should use our handler
	// These should not panic
	slog.Info("test info message")
	slog.Error("test error message")
	slog.Warn("test warn message")
	slog.Debug("test debug message")

	slog.Info("test", "key", "value")
}

func TestInitLevels(t *testing.T) {
	levels := []slog.Level{
		slog.LevelDebug,
		slog.LevelInfo,
		slog.LevelWarn,
		slog.LevelError,
	}

	for _, level := range levels {
		Init("text", level)
		if log == nil {
			t.Errorf("log is nil after Init with level %v", level)
		}
	}
}
