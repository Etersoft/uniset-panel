package sidebar

import (
	"testing"

	"github.com/pv/uniset-panel/internal/config"
)

func TestBuildEntityID(t *testing.T) {
	tests := []struct {
		entityType, name, serverID, want string
	}{
		{"object", "DieselGen1", "diesel-srv", "object:DieselGen1@diesel-srv"},
		{"object", "SharedMemory", "", "object:SharedMemory"},
		{"launcher", "MainNode", "", "launcher:MainNode"},
		{"dashboard", "Overview", "", "dashboard:Overview"},
		{"journal", "Production", "", "journal:Production"},
		{"server", "diesel-srv", "", "server:diesel-srv"},
	}
	for _, tt := range tests {
		got := BuildEntityID(tt.entityType, tt.name, tt.serverID)
		if got != tt.want {
			t.Errorf("BuildEntityID(%q, %q, %q) = %q, want %q", tt.entityType, tt.name, tt.serverID, got, tt.want)
		}
	}
}

func TestMatchEntity_GlobPatterns(t *testing.T) {
	tests := []struct {
		pattern, entityID string
		want              bool
	}{
		// Wildcard *
		{"object:*", "object:DieselGen1", true},
		{"object:Diesel*", "object:DieselGen1", true},
		{"object:*Gen1", "object:DieselGen1", true},
		{"object:*sel*", "object:DieselGen1", true},
		{"object:HVAC*", "object:DieselGen1", false},

		// Wildcard ?
		{"object:Diesel???1", "object:DieselGen1", true},
		{"object:Diesel??1", "object:DieselGen1", false},

		// Match all
		{"*", "object:DieselGen1", true},
		{"*:*", "object:DieselGen1", true},
	}
	for _, tt := range tests {
		got := MatchEntity(tt.pattern, tt.entityID)
		if got != tt.want {
			t.Errorf("MatchEntity(%q, %q) = %v, want %v", tt.pattern, tt.entityID, got, tt.want)
		}
	}
}

func TestMatchEntity_ServerIDPatterns(t *testing.T) {
	tests := []struct {
		pattern, entityID string
		want              bool
	}{
		// Pattern with @serverId
		{"object:*@diesel-srv", "object:DieselGen1@diesel-srv", true},
		{"object:*@diesel-srv", "object:DieselGen1@hvac-srv", false},
		{"*@diesel-srv", "object:DieselGen1@diesel-srv", true},
		{"*@diesel-srv", "launcher:Node1", false}, // no @, doesn't match @pattern

		// Pattern without @ — ignores serverId
		{"object:*", "object:DieselGen1@diesel-srv", true},
		{"object:Diesel*", "object:DieselGen1@diesel-srv", true},
		{"launcher:*", "launcher:Node1", true},
	}
	for _, tt := range tests {
		got := MatchEntity(tt.pattern, tt.entityID)
		if got != tt.want {
			t.Errorf("MatchEntity(%q, %q) = %v, want %v", tt.pattern, tt.entityID, got, tt.want)
		}
	}
}

func TestMatchEntity_MalformedPattern(t *testing.T) {
	// path.Match returns error for malformed patterns like unclosed [
	got := MatchEntity("[invalid", "object:Test")
	if got {
		t.Error("malformed pattern should return false")
	}

	got = MatchEntity("[invalid@srv", "object:Test@srv")
	if got {
		t.Error("malformed pattern with @ should return false")
	}
}

func TestResolve_ItemsMatching(t *testing.T) {
	groups := []config.SidebarGroupConfig{
		{Name: "Group1", Items: []string{"DieselGen1", "ProductionLog"}},
	}
	entities := []SidebarItem{
		{Type: "object", Name: "DieselGen1", ServerID: "srv1"},
		{Type: "journal", Name: "ProductionLog"},
		{Type: "object", Name: "HVAC1", ServerID: "srv2"},
	}

	result := Resolve(groups, entities)
	if len(result) != 2 { // Group1 + Прочие
		t.Fatalf("expected 2 groups, got %d", len(result))
	}
	if len(result[0].Items) != 2 {
		t.Errorf("Group1 should have 2 items, got %d", len(result[0].Items))
	}
	if result[1].Name != "Прочие" {
		t.Errorf("second group should be 'Прочие', got %q", result[1].Name)
	}
	if len(result[1].Items) != 1 {
		t.Errorf("Прочие should have 1 item, got %d", len(result[1].Items))
	}
}

func TestResolve_PatternsMatching(t *testing.T) {
	groups := []config.SidebarGroupConfig{
		{Name: "Diesel", Patterns: []string{"object:Diesel*@diesel-srv"}},
		{Name: "AllLaunchers", Patterns: []string{"launcher:*"}},
	}
	entities := []SidebarItem{
		{Type: "object", Name: "DieselGen1", ServerID: "diesel-srv"},
		{Type: "object", Name: "DieselGen2", ServerID: "diesel-srv"},
		{Type: "object", Name: "DieselGen3", ServerID: "hvac-srv"}, // wrong server
		{Type: "launcher", Name: "Node1"},
		{Type: "server", Name: "diesel-srv"},
	}

	result := Resolve(groups, entities)
	if len(result) != 3 { // Diesel + AllLaunchers + Прочие
		t.Fatalf("expected 3 groups, got %d", len(result))
	}
	if len(result[0].Items) != 2 {
		t.Errorf("Diesel should have 2 items (DieselGen1, DieselGen2), got %d", len(result[0].Items))
	}
	if len(result[1].Items) != 1 {
		t.Errorf("AllLaunchers should have 1 item, got %d", len(result[1].Items))
	}
	if len(result[2].Items) != 2 { // DieselGen3@hvac-srv + server:diesel-srv
		t.Errorf("Прочие should have 2 items, got %d", len(result[2].Items))
	}
}

func TestResolve_FirstMatchWins(t *testing.T) {
	groups := []config.SidebarGroupConfig{
		{Name: "First", Patterns: []string{"object:*"}},
		{Name: "Second", Patterns: []string{"object:Diesel*"}},
	}
	entities := []SidebarItem{
		{Type: "object", Name: "DieselGen1", ServerID: "srv1"},
	}

	result := Resolve(groups, entities)
	if len(result) != 2 { // First + Second (no Прочие)
		t.Fatalf("expected 2 groups, got %d", len(result))
	}
	if len(result[0].Items) != 1 {
		t.Errorf("First should have 1 item, got %d", len(result[0].Items))
	}
	if len(result[1].Items) != 0 {
		t.Errorf("Second should have 0 items (first-match-wins), got %d", len(result[1].Items))
	}
}

func TestResolve_OtherGroupOmitted(t *testing.T) {
	groups := []config.SidebarGroupConfig{
		{Name: "All", Patterns: []string{"*"}},
	}
	entities := []SidebarItem{
		{Type: "object", Name: "Obj1"},
		{Type: "launcher", Name: "Node1"},
	}

	result := Resolve(groups, entities)
	if len(result) != 1 { // only All, no Прочие
		t.Fatalf("expected 1 group (no Прочие), got %d", len(result))
	}
	if result[0].Name != "All" {
		t.Errorf("expected group name 'All', got %q", result[0].Name)
	}
	if len(result[0].Items) != 2 {
		t.Errorf("All should have 2 items, got %d", len(result[0].Items))
	}
}

func TestResolve_EmptyConfig(t *testing.T) {
	entities := []SidebarItem{
		{Type: "object", Name: "Obj1"},
		{Type: "launcher", Name: "Node1"},
	}

	// nil config → одна группа без имени со всеми сущностями
	result := Resolve(nil, entities)
	if len(result) != 1 {
		t.Fatalf("nil config should return 1 group, got %d", len(result))
	}
	if result[0].Name != "" {
		t.Errorf("default group should have empty name, got %q", result[0].Name)
	}
	if len(result[0].Items) != 2 {
		t.Errorf("default group should have 2 items, got %d", len(result[0].Items))
	}

	// empty config → одна группа без имени
	result = Resolve([]config.SidebarGroupConfig{}, entities)
	if len(result) != 1 {
		t.Fatalf("empty config should return 1 group, got %d", len(result))
	}

	// nil entities → пустой slice
	result = Resolve(nil, nil)
	if result == nil || len(result) != 0 {
		t.Errorf("nil entities should return empty slice, got %v", result)
	}
}

func TestResolve_MalformedPatternSkipped(t *testing.T) {
	groups := []config.SidebarGroupConfig{
		{Name: "Test", Patterns: []string{"[invalid", "object:*"}},
	}
	entities := []SidebarItem{
		{Type: "object", Name: "Obj1"},
	}

	result := Resolve(groups, entities)
	if len(result) != 1 {
		t.Fatalf("expected 1 group, got %d", len(result))
	}
	// object:* should still match despite malformed first pattern
	if len(result[0].Items) != 1 {
		t.Errorf("expected 1 item (malformed pattern skipped), got %d", len(result[0].Items))
	}
}
