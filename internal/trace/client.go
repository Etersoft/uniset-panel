package trace

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

// ServerResolver resolves uniset-panel server IDs to host:port.
// Duplicated from internal/debug to keep internal/trace dependency-free.
type ServerResolver interface {
	GetServerAddress(serverID string) (host string, port int, err error)
}

var (
	ErrObjectNotFound = errors.New("trace: object not found")
	ErrUpstream       = errors.New("trace: upstream protocol error")
)

// Client calls uniset's /<Object>/dump?trace=1 HTTP endpoint per object.
type Client struct {
	http     *http.Client
	resolver ServerResolver
}

// NewClient builds a Client with default 5s HTTP timeout.
func NewClient(resolver ServerResolver) *Client {
	return &Client{
		http:     &http.Client{Timeout: 5 * time.Second},
		resolver: resolver,
	}
}

// Fetch retrieves the trace envelope for (serverID, objectName). since
// is watermark in time_us (0 = all). limit caps records returned.
func (c *Client) Fetch(ctx context.Context, serverID, objectName string, since int64, limit int) (dumpEnvelope, error) {
	var zero dumpEnvelope
	host, port, err := c.resolver.GetServerAddress(serverID)
	if err != nil {
		return zero, fmt.Errorf("resolve: %w", err)
	}
	q := url.Values{}
	q.Set("trace", "1")
	if since > 0 {
		q.Set("since", fmt.Sprintf("%d", since))
	} else {
		q.Set("since", "0")
	}
	q.Set("limit", fmt.Sprintf("%d", limit))
	endpoint := fmt.Sprintf("http://%s:%d/%s/dump?%s",
		host, port, url.PathEscape(objectName), q.Encode())

	req, err := http.NewRequestWithContext(ctx, "GET", endpoint, nil)
	if err != nil {
		return zero, fmt.Errorf("request: %w", err)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return zero, fmt.Errorf("http: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return zero, ErrObjectNotFound
	}
	if resp.StatusCode != http.StatusOK {
		bodySnip, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return zero, fmt.Errorf("upstream status %d: %s", resp.StatusCode, string(bodySnip))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return zero, fmt.Errorf("read: %w", err)
	}
	var wrapper map[string]json.RawMessage
	if err := json.Unmarshal(body, &wrapper); err != nil {
		return zero, fmt.Errorf("%w: %v", ErrUpstream, err)
	}
	raw, ok := wrapper[objectName]
	if !ok {
		return zero, ErrObjectNotFound
	}
	var env dumpEnvelope
	if err := json.Unmarshal(raw, &env); err != nil {
		return zero, fmt.Errorf("%w: %v", ErrUpstream, err)
	}
	return env, nil
}
