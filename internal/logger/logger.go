package logger

import (
	"log/slog"
	"os"
)

var log *slog.Logger

func init() {
	log = slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
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

	log = slog.New(handler)
	slog.SetDefault(log)
}
