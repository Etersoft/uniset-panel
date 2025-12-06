package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadServersFromYAML(t *testing.T) {
	tests := []struct {
		name        string
		content     string
		wantCount   int
		wantErr     bool
		checkServer func(t *testing.T, servers []ServerConfig)
	}{
		{
			name: "valid config with all fields",
			content: `servers:
  - url: http://server1:8080
    id: srv1
    name: "Server One"
  - url: http://server2:8080
    name: "Server Two"
`,
			wantCount: 2,
			wantErr:   false,
			checkServer: func(t *testing.T, servers []ServerConfig) {
				if servers[0].ID != "srv1" {
					t.Errorf("expected ID 'srv1', got %q", servers[0].ID)
				}
				if servers[0].Name != "Server One" {
					t.Errorf("expected Name 'Server One', got %q", servers[0].Name)
				}
				if servers[1].URL != "http://server2:8080" {
					t.Errorf("expected URL 'http://server2:8080', got %q", servers[1].URL)
				}
			},
		},
		{
			name: "minimal config",
			content: `servers:
  - url: http://localhost:8080
`,
			wantCount: 1,
			wantErr:   false,
		},
		{
			name: "empty servers list",
			content: `servers: []
`,
			wantCount: 0,
			wantErr:   false,
		},
		{
			name: "missing url",
			content: `servers:
  - name: "No URL server"
`,
			wantErr: true,
		},
		{
			name:    "invalid yaml",
			content: `servers: [invalid`,
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Создаем временный файл
			tmpDir := t.TempDir()
			tmpFile := filepath.Join(tmpDir, "config.yaml")
			if err := os.WriteFile(tmpFile, []byte(tt.content), 0644); err != nil {
				t.Fatalf("failed to write temp file: %v", err)
			}

			servers, err := LoadServersFromYAML(tmpFile)

			if tt.wantErr {
				if err == nil {
					t.Error("expected error, got nil")
				}
				return
			}

			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			if len(servers) != tt.wantCount {
				t.Errorf("expected %d servers, got %d", tt.wantCount, len(servers))
			}

			if tt.checkServer != nil {
				tt.checkServer(t, servers)
			}
		})
	}
}

func TestLoadServersFromYAML_FileNotFound(t *testing.T) {
	_, err := LoadServersFromYAML("/nonexistent/path/config.yaml")
	if err == nil {
		t.Error("expected error for non-existent file")
	}
}
