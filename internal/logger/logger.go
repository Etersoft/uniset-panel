package logger

import (
	"log/slog"
	"os"
)

var Log *slog.Logger

func init() {
	Log = slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
}

// Init initializes the logger with the specified format
func Init(format string, level slog.Level) {
	opts := &slog.HandlerOptions{Level: level}

	var handler slog.Handler
	switch format {
	case "json":
		handler = slog.NewJSONHandler(os.Stderr, opts)
	default:
		handler = slog.NewTextHandler(os.Stderr, opts)
	}

	Log = slog.New(handler)
	slog.SetDefault(Log)
}

// Convenience functions
func Info(msg string, args ...any)  { Log.Info(msg, args...) }
func Error(msg string, args ...any) { Log.Error(msg, args...) }
func Warn(msg string, args ...any)  { Log.Warn(msg, args...) }
func Debug(msg string, args ...any) { Log.Debug(msg, args...) }
