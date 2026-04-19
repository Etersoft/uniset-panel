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
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
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

func TestSnapshot_happy(t *testing.T) {
	body := `{"DG_Control":{` +
		`"Timers":{"count":1,"7":{"id":7,"name":"T1","msec":500,"timeleft":100,"tick":3}},` +
		`"Variables":{"state_main":2,"FB1.State":1},` +
		`"Statistics":{"processingMessageCatchCount":0,"sensors":{}},` +
		`"io":{"in":{"in_Temp":{"id":101,"value":75}},` +
		`"out":{"out_Speed":{"id":205,"value":1500}}}}}`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/DG_Control/dump" {
			t.Errorf("path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(body))
	}))
	defer srv.Close()

	c := newTestClient(srv.URL)
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	s, err := c.Snapshot(ctx, "srv-1", "DG_Control")
	if err != nil {
		t.Fatalf("Snapshot: %v", err)
	}
	if s.Object != "DG_Control" || s.Server != "srv-1" {
		t.Errorf("object/server: %+v", s)
	}
	if len(s.Inputs) != 1 || s.Inputs[0].Name != "in_Temp" || s.Inputs[0].ID != 101 {
		t.Errorf("inputs: %+v", s.Inputs)
	}
	if len(s.Outputs) != 1 || s.Outputs[0].Name != "out_Speed" || s.Outputs[0].ID != 205 {
		t.Errorf("outputs: %+v", s.Outputs)
	}
	if v, ok := s.Variables["state_main"].(float64); !ok || v != 2 {
		t.Errorf("state_main: %v", s.Variables["state_main"])
	}
	if len(s.Timers) != 1 || s.Timers[0].ID != 7 {
		t.Errorf("timers: %+v", s.Timers)
	}
	if s.SMObject != "SharedMemory" {
		t.Errorf("sm_object fallback: %q", s.SMObject)
	}
}

func TestSnapshot_notFound(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(404)
	}))
	defer srv.Close()

	c := newTestClient(srv.URL)
	_, err := c.Snapshot(context.Background(), "srv-1", "X")
	if !errors.Is(err, ErrObjectNotFound) {
		t.Errorf("expected ErrObjectNotFound, got %v", err)
	}
}

func TestSnapshot_objectKeyMissing(t *testing.T) {
	body := `{"OtherObj":{}}`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(body))
	}))
	defer srv.Close()

	c := newTestClient(srv.URL)
	_, err := c.Snapshot(context.Background(), "srv-1", "DG_Control")
	if !errors.Is(err, ErrObjectNotFound) {
		t.Errorf("expected ErrObjectNotFound, got %v", err)
	}
}

func TestSnapshot_malformedJSON(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{bad`))
	}))
	defer srv.Close()

	c := newTestClient(srv.URL)
	_, err := c.Snapshot(context.Background(), "srv-1", "X")
	if !errors.Is(err, ErrUpstream) {
		t.Errorf("expected ErrUpstream, got %v", err)
	}
}

func TestSnapshot_emptyIOStillReturns(t *testing.T) {
	body := `{"X":{"Variables":{"Counter":42},"io":{"in":{},"out":{}}}}`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(body))
	}))
	defer srv.Close()

	c := newTestClient(srv.URL)
	s, err := c.Snapshot(context.Background(), "srv-1", "X")
	if err != nil {
		t.Fatal(err)
	}
	if len(s.Inputs) != 0 || len(s.Outputs) != 0 {
		t.Errorf("expected empty io, got in=%d out=%d", len(s.Inputs), len(s.Outputs))
	}
	if s.Inputs == nil {
		t.Errorf("expected non-nil empty Inputs slice, got nil")
	}
	if s.Outputs == nil {
		t.Errorf("expected non-nil empty Outputs slice, got nil")
	}
	if v, ok := s.Variables["Counter"].(float64); !ok || v != 42 {
		t.Errorf("Counter: %v", s.Variables["Counter"])
	}
}

func TestSnapshot_bodyCap(t *testing.T) {
	// Generate a body > 8 MB (9 MB with 'a' chars inside a valid-looking envelope).
	hugeValue := make([]byte, 9*1024*1024)
	for i := range hugeValue {
		hugeValue[i] = 'a'
	}
	body := `{"X":{"Variables":{"big":"` + string(hugeValue) + `"}}}`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(body))
	}))
	defer srv.Close()

	c := newTestClient(srv.URL)
	_, err := c.Snapshot(context.Background(), "srv-1", "X")
	if !errors.Is(err, ErrUpstream) {
		t.Errorf("expected ErrUpstream (body cap exceeded), got %v", err)
	}
}

func TestSnapshot_deterministicOrder(t *testing.T) {
	body := `{"X":{"io":{"in":{"c":{"id":3,"value":1},"a":{"id":1,"value":1},"b":{"id":2,"value":1}},"out":{}}}}`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(body))
	}))
	defer srv.Close()

	c := newTestClient(srv.URL)
	for i := 0; i < 5; i++ {
		s, err := c.Snapshot(context.Background(), "srv-1", "X")
		if err != nil {
			t.Fatal(err)
		}
		if len(s.Inputs) != 3 {
			t.Fatalf("expected 3 inputs, got %d", len(s.Inputs))
		}
		if s.Inputs[0].ID != 1 || s.Inputs[1].ID != 2 || s.Inputs[2].ID != 3 {
			t.Errorf("not sorted by ID: %+v", s.Inputs)
		}
	}
}
