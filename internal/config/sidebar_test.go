package config

import (
	"testing"

	"gopkg.in/yaml.v3"
)

func TestSidebarConfig_FullParsing(t *testing.T) {
	yamlData := `
servers:
  - url: http://localhost:8080
sidebar:
  groups:
    - name: "Diesel"
      icon: "engine"
      group_by_type: true
      items:
        - "DieselLog"
      patterns:
        - "object:Diesel*@diesel-srv"
        - "launcher:*"
    - name: "HVAC"
      patterns:
        - "*@hvac-srv"
`
	var cfg ConfigFile
	if err := yaml.Unmarshal([]byte(yamlData), &cfg); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	if cfg.Sidebar == nil {
		t.Fatal("expected Sidebar to be non-nil")
	}
	if len(cfg.Sidebar.Groups) != 2 {
		t.Fatalf("expected 2 groups, got %d", len(cfg.Sidebar.Groups))
	}

	g0 := cfg.Sidebar.Groups[0]
	if g0.Name != "Diesel" {
		t.Errorf("group[0].Name = %q, want %q", g0.Name, "Diesel")
	}
	if g0.Icon != "engine" {
		t.Errorf("group[0].Icon = %q, want %q", g0.Icon, "engine")
	}
	if !g0.GroupByType {
		t.Error("group[0].GroupByType should be true")
	}
	if len(g0.Items) != 1 || g0.Items[0] != "DieselLog" {
		t.Errorf("group[0].Items = %v, want [DieselLog]", g0.Items)
	}
	if len(g0.Patterns) != 2 {
		t.Errorf("group[0].Patterns count = %d, want 2", len(g0.Patterns))
	}

	g1 := cfg.Sidebar.Groups[1]
	if g1.Name != "HVAC" {
		t.Errorf("group[1].Name = %q, want %q", g1.Name, "HVAC")
	}
	if g1.GroupByType {
		t.Error("group[1].GroupByType should be false")
	}
	if len(g1.Items) != 0 {
		t.Errorf("group[1].Items should be empty, got %v", g1.Items)
	}
}

func TestSidebarConfig_EmptySidebar(t *testing.T) {
	yamlData := `
servers:
  - url: http://localhost:8080
sidebar:
`
	var cfg ConfigFile
	if err := yaml.Unmarshal([]byte(yamlData), &cfg); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	// sidebar key present but empty -> Sidebar is nil (no content to deserialize)
	if cfg.Sidebar != nil && len(cfg.Sidebar.Groups) != 0 {
		t.Errorf("expected no groups, got %d", len(cfg.Sidebar.Groups))
	}
}

func TestSidebarConfig_NoSidebar(t *testing.T) {
	yamlData := `
servers:
  - url: http://localhost:8080
`
	var cfg ConfigFile
	if err := yaml.Unmarshal([]byte(yamlData), &cfg); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	if cfg.Sidebar != nil {
		t.Errorf("expected Sidebar to be nil, got %+v", cfg.Sidebar)
	}
}

func TestSidebarConfig_PartialGroups(t *testing.T) {
	yamlData := `
servers:
  - url: http://localhost:8080
sidebar:
  groups:
    - name: "ItemsOnly"
      items:
        - "Obj1"
        - "Obj2"
    - name: "PatternsOnly"
      patterns:
        - "object:*"
    - name: "Mixed"
      items:
        - "Dashboard1"
      patterns:
        - "launcher:*"
      group_by_type: true
`
	var cfg ConfigFile
	if err := yaml.Unmarshal([]byte(yamlData), &cfg); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	if cfg.Sidebar == nil {
		t.Fatal("expected Sidebar to be non-nil")
	}
	if len(cfg.Sidebar.Groups) != 3 {
		t.Fatalf("expected 3 groups, got %d", len(cfg.Sidebar.Groups))
	}

	// ItemsOnly: items set, patterns empty
	g0 := cfg.Sidebar.Groups[0]
	if len(g0.Items) != 2 {
		t.Errorf("ItemsOnly: expected 2 items, got %d", len(g0.Items))
	}
	if len(g0.Patterns) != 0 {
		t.Errorf("ItemsOnly: expected 0 patterns, got %d", len(g0.Patterns))
	}

	// PatternsOnly: patterns set, items empty
	g1 := cfg.Sidebar.Groups[1]
	if len(g1.Items) != 0 {
		t.Errorf("PatternsOnly: expected 0 items, got %d", len(g1.Items))
	}
	if len(g1.Patterns) != 1 {
		t.Errorf("PatternsOnly: expected 1 pattern, got %d", len(g1.Patterns))
	}

	// Mixed: both set + group_by_type
	g2 := cfg.Sidebar.Groups[2]
	if len(g2.Items) != 1 || len(g2.Patterns) != 1 {
		t.Errorf("Mixed: expected 1 item + 1 pattern, got %d + %d", len(g2.Items), len(g2.Patterns))
	}
	if !g2.GroupByType {
		t.Error("Mixed: GroupByType should be true")
	}
}
