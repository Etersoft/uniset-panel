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
package trace

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

type resolverFn func(string) (string, int, error)

func (f resolverFn) GetServerAddress(s string) (string, int, error) { return f(s) }

func newTestClient(urlStr string) *Client {
	return &Client{
		http: &http.Client{Timeout: time.Second},
		resolver: resolverFn(func(_ string) (string, int, error) {
			u, _ := url.Parse(urlStr)
			p := 0
			fmt.Sscanf(u.Port(), "%d", &p)
			return u.Hostname(), p, nil
		}),
	}
}

func TestFetch_enabledWithRecords(t *testing.T) {
	body := `{"DG_Control":{"trace":{"enabled":true,"overflow":false,"records":[{"time_us":1000,"event_time_us":500,"id":101,"value":75,"supplier_id":42,"type":"sensorInfo"}]}}}`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/DG_Control/dump" {
			t.Errorf("path: %s", r.URL.Path)
		}
		if r.URL.Query().Get("trace") != "1" {
			t.Errorf("trace query: %s", r.URL.Query().Get("trace"))
		}
		if r.URL.Query().Get("since") != "500" {
			t.Errorf("since query: %s", r.URL.Query().Get("since"))
		}
		if r.URL.Query().Get("limit") != "1024" {
			t.Errorf("limit query: %s", r.URL.Query().Get("limit"))
		}
		_, _ = w.Write([]byte(body))
	}))
	defer srv.Close()

	c := newTestClient(srv.URL)
	env, err := c.Fetch(context.Background(), "srv-1", "DG_Control", 500, 1024)
	if err != nil {
		t.Fatal(err)
	}
	if env.Trace == nil || !env.Trace.Enabled {
		t.Errorf("enabled: %+v", env.Trace)
	}
	if len(env.Trace.Records) != 1 {
		t.Errorf("records: got %d", len(env.Trace.Records))
	}
	var rec map[string]any
	if err := json.Unmarshal(env.Trace.Records[0], &rec); err != nil {
		t.Fatal(err)
	}
	if rec["id"].(float64) != 101 {
		t.Errorf("id: %v", rec["id"])
	}
}

func TestFetch_objectNotFound(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(404)
	}))
	defer srv.Close()

	c := newTestClient(srv.URL)
	_, err := c.Fetch(context.Background(), "srv-1", "X", 0, 1024)
	if !errors.Is(err, ErrObjectNotFound) {
		t.Errorf("expected ErrObjectNotFound, got %v", err)
	}
}

func TestFetch_traceDisabled(t *testing.T) {
	body := `{"X":{"trace":{"enabled":false,"overflow":false,"records":[]}}}`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(body))
	}))
	defer srv.Close()

	c := newTestClient(srv.URL)
	env, err := c.Fetch(context.Background(), "srv-1", "X", 0, 1024)
	if err != nil {
		t.Fatal(err)
	}
	if env.Trace == nil || env.Trace.Enabled {
		t.Errorf("expected Trace.Enabled=false, got %+v", env.Trace)
	}
}

func TestFetch_malformed(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{bad`))
	}))
	defer srv.Close()

	c := newTestClient(srv.URL)
	_, err := c.Fetch(context.Background(), "srv-1", "X", 0, 1024)
	if !strings.Contains(err.Error(), "upstream") && !errors.Is(err, ErrUpstream) {
		t.Errorf("expected upstream error, got %v", err)
	}
}
