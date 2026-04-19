/*
 * Copyright (c) 2025 Pavel Vainerman.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as
 * published by the Free Software Foundation, version 2.1.
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Lesser Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */
// --------------------------------------------------------------------------
package debug

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"time"
)

// ServerResolver resolves a uniset-panel server ID to a host:port.
type ServerResolver interface {
	GetServerAddress(serverID string) (host string, port int, err error)
}

type Client struct {
	http     *http.Client
	resolver ServerResolver
}

func NewClient(resolver ServerResolver) *Client {
	return &Client{http: &http.Client{Timeout: 5 * time.Second}, resolver: resolver}
}

// rawDump mirrors uniset /<Object>/dump (inner object).
type rawDump struct {
	Timers     map[string]json.RawMessage `json:"Timers"`
	Variables  map[string]any             `json:"Variables"`
	Statistics map[string]any             `json:"Statistics"`
	IO         rawIO                      `json:"io"`
}

type rawIO struct {
	In  map[string]rawPort `json:"in"`
	Out map[string]rawPort `json:"out"`
}

type rawPort struct {
	ID    int64 `json:"id"`
	Value any   `json:"value"`
}

type rawTimer struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	Msec     int64  `json:"msec"`
	TimeLeft int64  `json:"timeleft"`
	Tick     int64  `json:"tick"`
}

// Snapshot fetches uniset /<Object>/dump and flattens the response.
func (c *Client) Snapshot(ctx context.Context, serverID, objectName string) (*Snapshot, error) {
	host, port, err := c.resolver.GetServerAddress(serverID)
	if err != nil {
		return nil, fmt.Errorf("resolve server: %w", err)
	}
	endpoint := fmt.Sprintf("http://%s:%d/%s/dump",
		host, port, url.PathEscape(objectName))

	req, err := http.NewRequestWithContext(ctx, "GET", endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrUpstream, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, ErrObjectNotFound
	}
	if resp.StatusCode != http.StatusOK {
		snip, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return nil, fmt.Errorf("upstream status %d: %s", resp.StatusCode, string(snip))
	}

	const maxSnapshotBody = 8 * 1024 * 1024 // 8 MB sanity cap
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxSnapshotBody+1))
	if err != nil {
		return nil, fmt.Errorf("read: %w", err)
	}
	if int64(len(body)) > maxSnapshotBody {
		return nil, fmt.Errorf("%w: response exceeds %d bytes", ErrUpstream, maxSnapshotBody)
	}
	var wrapper map[string]json.RawMessage
	if err := json.Unmarshal(body, &wrapper); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrUpstream, err)
	}
	inner, ok := wrapper[objectName]
	if !ok {
		return nil, ErrObjectNotFound
	}
	var raw rawDump
	if err := json.Unmarshal(inner, &raw); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrUpstream, err)
	}

	return adaptDump(serverID, objectName, &raw), nil
}

// adaptDump flattens uniset response into Spec 4 Snapshot.
func adaptDump(serverID, objectName string, raw *rawDump) *Snapshot {
	s := &Snapshot{
		Object:     objectName,
		Server:     serverID,
		Variables:  raw.Variables,
		Statistics: raw.Statistics,
		SMObject:   "SharedMemory", // panel-side default
	}
	if s.Variables == nil {
		s.Variables = map[string]any{}
	}
	if s.Statistics == nil {
		s.Statistics = map[string]any{}
	}
	// Initialize slices to non-nil empty slices for deterministic JSON marshaling.
	s.Inputs = make([]Port, 0, len(raw.IO.In))
	s.Outputs = make([]Port, 0, len(raw.IO.Out))
	s.Timers = []Timer{}

	for name, p := range raw.IO.In {
		s.Inputs = append(s.Inputs, Port{ID: p.ID, Name: name, Value: p.Value})
	}
	// Sort inputs by ID for deterministic order (map iteration is non-deterministic).
	sort.Slice(s.Inputs, func(i, j int) bool {
		return s.Inputs[i].ID < s.Inputs[j].ID
	})

	for name, p := range raw.IO.Out {
		s.Outputs = append(s.Outputs, Port{ID: p.ID, Name: name, Value: p.Value})
	}
	// Sort outputs by ID for deterministic order.
	sort.Slice(s.Outputs, func(i, j int) bool {
		return s.Outputs[i].ID < s.Outputs[j].ID
	})

	for key, rawMsg := range raw.Timers {
		if key == "count" {
			continue
		}
		var rt rawTimer
		if err := json.Unmarshal(rawMsg, &rt); err != nil {
			continue
		}
		s.Timers = append(s.Timers, Timer{
			ID:         rt.ID,
			Name:       rt.Name,
			IntervalMS: rt.Msec,
			TimeLeft:   rt.TimeLeft,
			Tick:       rt.Tick,
		})
	}
	// Sort timers by ID for deterministic order.
	sort.Slice(s.Timers, func(i, j int) bool {
		return s.Timers[i].ID < s.Timers[j].ID
	})

	return s
}
