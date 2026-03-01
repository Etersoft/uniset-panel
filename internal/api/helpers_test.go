package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestGetPagination_Defaults(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/test", nil)

	offset, limit := getPagination(r, 100)

	if offset != 0 {
		t.Errorf("expected offset=0, got %d", offset)
	}
	if limit != 100 {
		t.Errorf("expected limit=100, got %d", limit)
	}
}

func TestGetPagination_CustomLimit(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/test?limit=50", nil)

	offset, limit := getPagination(r, 100)

	if offset != 0 {
		t.Errorf("expected offset=0, got %d", offset)
	}
	if limit != 50 {
		t.Errorf("expected limit=50, got %d", limit)
	}
}

func TestGetPagination_CustomOffset(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/test?offset=25", nil)

	offset, limit := getPagination(r, 100)

	if offset != 25 {
		t.Errorf("expected offset=25, got %d", offset)
	}
	if limit != 100 {
		t.Errorf("expected limit=100, got %d", limit)
	}
}

func TestGetPagination_CustomBoth(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/test?offset=10&limit=20", nil)

	offset, limit := getPagination(r, 100)

	if offset != 10 {
		t.Errorf("expected offset=10, got %d", offset)
	}
	if limit != 20 {
		t.Errorf("expected limit=20, got %d", limit)
	}
}

func TestGetPagination_InvalidValues(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/test?offset=abc&limit=xyz", nil)

	offset, limit := getPagination(r, 100)

	// Invalid values should be ignored, defaults used
	if offset != 0 {
		t.Errorf("expected offset=0 for invalid value, got %d", offset)
	}
	if limit != 100 {
		t.Errorf("expected limit=100 for invalid value, got %d", limit)
	}
}

func TestGetPagination_NegativeValues(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/test?offset=-5&limit=-10", nil)

	offset, limit := getPagination(r, 100)

	// Negative values should be ignored (condition requires >= 0)
	if offset != 0 {
		t.Errorf("expected offset=0 for negative value, got %d", offset)
	}
	if limit != 100 {
		t.Errorf("expected limit=100 for negative value, got %d", limit)
	}
}

func TestGetPagination_ZeroValues(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/test?offset=0&limit=0", nil)

	offset, limit := getPagination(r, 100)

	// Zero is a valid value (>= 0)
	if offset != 0 {
		t.Errorf("expected offset=0, got %d", offset)
	}
	if limit != 0 {
		t.Errorf("expected limit=0, got %d", limit)
	}
}

func TestGetPagination_DifferentDefaults(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/test", nil)

	offset, limit := getPagination(r, 500)

	if offset != 0 {
		t.Errorf("expected offset=0, got %d", offset)
	}
	if limit != 500 {
		t.Errorf("expected limit=500, got %d", limit)
	}
}

// --- resolvePoller tests ---

func TestResolvePoller_Fallback(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/test", nil)

	result := resolvePoller(r, nil, "fallback-value")

	if result != "fallback-value" {
		t.Errorf("expected fallback-value, got %s", result)
	}
}

func TestResolvePoller_FallbackWhenNoServerParam(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/test", nil)

	fromManager := func(serverID string) (string, bool) {
		return "from-manager", true
	}

	result := resolvePoller(r, fromManager, "fallback-value")

	// No server param => fallback
	if result != "fallback-value" {
		t.Errorf("expected fallback-value, got %s", result)
	}
}

func TestResolvePoller_FromManager(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/test?server=srv1", nil)

	fromManager := func(serverID string) (string, bool) {
		if serverID == "srv1" {
			return "manager-result", true
		}
		return "", false
	}

	result := resolvePoller(r, fromManager, "fallback-value")

	if result != "manager-result" {
		t.Errorf("expected manager-result, got %s", result)
	}
}

func TestResolvePoller_ManagerServerNotFound(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/test?server=unknown", nil)

	fromManager := func(serverID string) (string, bool) {
		// Only knows about srv1
		if serverID == "srv1" {
			return "manager-result", true
		}
		return "", false
	}

	result := resolvePoller(r, fromManager, "fallback-value")

	// Server not found in manager => fallback
	if result != "fallback-value" {
		t.Errorf("expected fallback-value, got %s", result)
	}
}

func TestResolvePoller_NilManager(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/test?server=srv1", nil)

	result := resolvePoller[string](r, nil, "fallback-value")

	// Nil fromManager => fallback
	if result != "fallback-value" {
		t.Errorf("expected fallback-value, got %s", result)
	}
}

func TestResolvePoller_PointerType(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/test?server=srv1", nil)

	managerVal := 42
	fallbackVal := 99

	fromManager := func(serverID string) (*int, bool) {
		if serverID == "srv1" {
			return &managerVal, true
		}
		return nil, false
	}

	result := resolvePoller(r, fromManager, &fallbackVal)

	if result != &managerVal {
		t.Errorf("expected pointer to managerVal, got %v", result)
	}
	if *result != 42 {
		t.Errorf("expected *result=42, got %d", *result)
	}
}

func TestResolvePoller_PointerTypeFallback(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/test?server=unknown", nil)

	fallbackVal := 99

	fromManager := func(serverID string) (*int, bool) {
		return nil, false
	}

	result := resolvePoller(r, fromManager, &fallbackVal)

	if result != &fallbackVal {
		t.Errorf("expected pointer to fallbackVal, got %v", result)
	}
	if *result != 99 {
		t.Errorf("expected *result=99, got %d", *result)
	}
}
