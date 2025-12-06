package server

import "time"

// Status представляет текущее состояние сервера
type Status struct {
	ID          string    `json:"id"`
	URL         string    `json:"url"`
	Name        string    `json:"name"`
	Connected   bool      `json:"connected"`
	LastPoll    time.Time `json:"lastPoll"`
	LastError   string    `json:"lastError,omitempty"`
	ObjectCount int       `json:"objectCount"`
}
