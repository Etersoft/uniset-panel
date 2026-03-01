package launcher

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Client — HTTP-клиент для Launcher API v2
type Client struct {
	baseURL      string
	readToken    string
	controlToken string
	httpClient   *http.Client
}

// NewClient создаёт новый клиент Launcher
func NewClient(baseURL, readToken, controlToken string) *Client {
	return &Client{
		baseURL:      baseURL,
		readToken:    readToken,
		controlToken: controlToken,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// GetStatus возвращает полный статус Launcher'а
// GET /api/v2/launcher
func (c *Client) GetStatus(ctx context.Context) (*LauncherStatus, error) {
	var status LauncherStatus
	if err := c.doGet(ctx, "/api/v2/launcher", &status); err != nil {
		return nil, err
	}
	return &status, nil
}

// GetProcesses возвращает список процессов
// GET /api/v2/launcher/processes
func (c *Client) GetProcesses(ctx context.Context) ([]Process, error) {
	var resp struct {
		Processes []Process `json:"processes"`
	}
	if err := c.doGet(ctx, "/api/v2/launcher/processes", &resp); err != nil {
		return nil, err
	}
	return resp.Processes, nil
}

// GetGroups возвращает группы процессов
// GET /api/v2/launcher/groups
func (c *Client) GetGroups(ctx context.Context) ([]ProcessGroup, error) {
	var resp struct {
		Groups []ProcessGroup `json:"groups"`
	}
	if err := c.doGet(ctx, "/api/v2/launcher/groups", &resp); err != nil {
		return nil, err
	}
	return resp.Groups, nil
}

// Health возвращает статус здоровья
// GET /api/v2/launcher/health
func (c *Client) Health(ctx context.Context) (*HealthStatus, error) {
	var health HealthStatus
	if err := c.doGet(ctx, "/api/v2/launcher/health", &health); err != nil {
		return nil, err
	}
	return &health, nil
}

// RestartProcess перезапускает процесс
// POST /api/v2/launcher/process/{name}/restart
func (c *Client) RestartProcess(ctx context.Context, name string) error {
	return c.doPost(ctx, fmt.Sprintf("/api/v2/launcher/process/%s/restart", name))
}

// StopProcess останавливает процесс
// POST /api/v2/launcher/process/{name}/stop
func (c *Client) StopProcess(ctx context.Context, name string) error {
	return c.doPost(ctx, fmt.Sprintf("/api/v2/launcher/process/%s/stop", name))
}

// StartProcess запускает процесс
// POST /api/v2/launcher/process/{name}/start
func (c *Client) StartProcess(ctx context.Context, name string) error {
	return c.doPost(ctx, fmt.Sprintf("/api/v2/launcher/process/%s/start", name))
}

// StopAll останавливает указанные процессы по одному
func (c *Client) StopAll(ctx context.Context, names []string) error {
	var errs []error
	for _, name := range names {
		if err := c.StopProcess(ctx, name); err != nil {
			errs = append(errs, fmt.Errorf("%s: %w", name, err))
		}
	}
	return errors.Join(errs...)
}

// StartAll запускает указанные процессы по одному
func (c *Client) StartAll(ctx context.Context, names []string) error {
	var errs []error
	for _, name := range names {
		if err := c.StartProcess(ctx, name); err != nil {
			errs = append(errs, fmt.Errorf("%s: %w", name, err))
		}
	}
	return errors.Join(errs...)
}

// RestartAll перезапускает все запущенные процессы
// POST /api/v2/launcher/restart-all
func (c *Client) RestartAll(ctx context.Context) error {
	return c.doPost(ctx, "/api/v2/launcher/restart-all")
}

// ReloadAll останавливает и перезапускает все процессы
// POST /api/v2/launcher/reload-all
func (c *Client) ReloadAll(ctx context.Context) error {
	return c.doPost(ctx, "/api/v2/launcher/reload-all")
}

// doGet выполняет GET запрос с readToken
func (c *Client) doGet(ctx context.Context, path string, result interface{}) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	if c.readToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.readToken)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(body))
	}

	if err := json.NewDecoder(resp.Body).Decode(result); err != nil {
		return fmt.Errorf("decode response: %w", err)
	}
	return nil
}

// doPost выполняет POST запрос с controlToken
func (c *Client) doPost(ctx context.Context, path string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, bytes.NewReader([]byte("{}")))
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if c.controlToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.controlToken)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(body))
	}
	return nil
}
