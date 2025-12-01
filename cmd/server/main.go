package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/pv/uniset2-viewer-go/internal/api"
	"github.com/pv/uniset2-viewer-go/internal/config"
	"github.com/pv/uniset2-viewer-go/internal/poller"
	"github.com/pv/uniset2-viewer-go/internal/storage"
	"github.com/pv/uniset2-viewer-go/internal/uniset"
	"github.com/pv/uniset2-viewer-go/ui"
)

func main() {
	cfg := config.Parse()

	// Create uniset client
	client := uniset.NewClient(cfg.UnisetURL)

	// Create storage
	var store storage.Storage
	var err error

	switch cfg.Storage {
	case config.StorageSQLite:
		store, err = storage.NewSQLiteStorage(cfg.SQLitePath)
		if err != nil {
			log.Fatalf("Failed to create SQLite storage: %v", err)
		}
		log.Printf("Using SQLite storage: %s", cfg.SQLitePath)
	default:
		store = storage.NewMemoryStorage()
		log.Println("Using in-memory storage")
	}
	defer store.Close()

	// Create poller
	p := poller.New(client, store, cfg.PollInterval, cfg.HistoryTTL)

	// Create API handlers and server
	handlers := api.NewHandlers(client, store, p)
	server := api.NewServer(handlers, ui.Content)

	// Start poller
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go p.Run(ctx)

	// Start HTTP server
	addr := fmt.Sprintf(":%d", cfg.Port)
	httpServer := &http.Server{
		Addr:    addr,
		Handler: server,
	}

	go func() {
		log.Printf("Starting server on http://localhost%s", addr)
		log.Printf("UniSet2 URL: %s", cfg.UnisetURL)
		log.Printf("Poll interval: %s", cfg.PollInterval)
		log.Printf("History TTL: %s", cfg.HistoryTTL)

		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server failed: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")
	cancel()

	if err := httpServer.Shutdown(context.Background()); err != nil {
		log.Printf("Server shutdown error: %v", err)
	}

	log.Println("Server stopped")
}
