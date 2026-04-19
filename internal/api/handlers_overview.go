package api

import (
	"log/slog"
	"net/http"
	"path"
	"sort"
	"strings"

	"github.com/pv/uniset-panel/internal/config"
	"github.com/pv/uniset-panel/internal/uniset"
)

// OverviewPort represents a single IO port (input or output) of a process node.
type OverviewPort struct {
	Name  string      `json:"name"`
	Value any `json:"value"`
}

// OverviewNode represents a process in the system overview graph.
type OverviewNode struct {
	Name    string         `json:"name"`
	Inputs  []OverviewPort `json:"inputs"`
	Outputs []OverviewPort `json:"outputs"`
}

// OverviewEdge represents a data flow connection between two process nodes.
type OverviewEdge struct {
	FromNode string `json:"fromNode"`
	FromPort string `json:"fromPort"`
	ToNode   string `json:"toNode"`
	ToPort   string `json:"toPort"`
}

// OverviewResponse is the JSON response for GET /api/servers/{id}/overview.
type OverviewResponse struct {
	ServerName string         `json:"serverName"`
	Nodes      []OverviewNode `json:"nodes"`
	Edges      []OverviewEdge `json:"edges"`
	AllNodes   []OverviewNode `json:"allNodes"` // all eligible nodes with full port data
}

// SetOverviewConfig устанавливает конфигурацию System Overview
func (h *Handlers) SetOverviewConfig(cfg *config.OverviewConfig) {
	h.overviewConfig = cfg
}

// handleServerOverview returns system overview with nodes and edges for a server.
// GET /api/servers/{id}/overview[?selected=name1,name2,...]
func (h *Handlers) handleServerOverview(w http.ResponseWriter, r *http.Request) {
	if h.serverMgr == nil {
		h.writeError(w, http.StatusServiceUnavailable, "server manager not initialized")
		return
	}

	serverID := r.PathValue("id")
	instance, ok := h.serverMgr.GetServer(serverID)
	if !ok {
		h.writeError(w, http.StatusNotFound, "server not found")
		return
	}

	serverName := instance.Config.Name
	if serverName == "" {
		serverName = instance.Config.URL
	}

	objects := instance.GetCachedObjects()

	// Build all eligible nodes (for allNodes field).
	allNodes := make([]OverviewNode, 0, len(objects))
	for _, objName := range objects {
		data := instance.GetLastData(objName)
		if data == nil {
			data, _ = instance.GetObjectData(objName)
		}
		if !isOverviewEligible(data) {
			continue
		}
		allNodes = append(allNodes, buildOverviewNode(objName, data))
	}

	// Sort allNodes by name for stable output.
	sort.Slice(allNodes, func(i, j int) bool {
		return allNodes[i].Name < allNodes[j].Name
	})

	// Determine visible nodes: ?selected= query param > config defaults > all.
	var visibleNames map[string]bool
	if selected := r.URL.Query().Get("selected"); selected != "" {
		// Explicit selection from frontend.
		visibleNames = make(map[string]bool)
		for _, name := range strings.Split(selected, ",") {
			name = strings.TrimSpace(name)
			if name != "" {
				visibleNames[name] = true
			}
		}
	} else if h.overviewConfig != nil && (len(h.overviewConfig.Patterns) > 0 || len(h.overviewConfig.Exclude) > 0) {
		// Config-based filtering.
		visibleNames = make(map[string]bool)
		for _, node := range allNodes {
			if matchOverviewPattern(h.overviewConfig.Patterns, h.overviewConfig.Exclude, node.Name) {
				visibleNames[node.Name] = true
			}
		}
	}
	// If visibleNames is nil — show all (no filtering).

	// Build visible nodes and Watch them.
	nodes := make([]OverviewNode, 0, len(allNodes))
	for _, node := range allNodes {
		if visibleNames != nil && !visibleNames[node.Name] {
			continue
		}
		instance.Watch(node.Name)
		nodes = append(nodes, node)
	}

	edges := computeOverviewEdges(nodes)

	h.writeJSON(w, OverviewResponse{
		ServerName: serverName,
		Nodes:      nodes,
		Edges:      edges,
		AllNodes:   allNodes,
	})
}

// isOverviewEligible checks whether an object should appear on the system overview diagram.
// Only objects without extensionType and with type "UniSetObject" or "UniSetManager" are shown.
// Objects with extensionType set (e.g. ModbusMaster, OPCUAExchange, SharedMemory) are protocol-specific
// and handled by dedicated renderers — they don't represent user business logic processes.
func isOverviewEligible(data *uniset.ObjectData) bool {
	if data == nil || data.Object == nil {
		return false
	}

	// Skip objects that have extensionType set (they are protocol-specific extensions)
	ext := data.Object.ExtensionType
	if ext == "" {
		ext = data.Object.ExtensionsType // some endpoints use alternate field name
	}
	if ext != "" {
		return false
	}

	// Only include UniSetObject and UniSetManager types
	objType := data.Object.ObjectType
	return objType == "UniSetObject" || objType == "UniSetManager"
}

// buildOverviewNode constructs an OverviewNode from object name and its cached data.
func buildOverviewNode(name string, data *uniset.ObjectData) OverviewNode {
	node := OverviewNode{
		Name:    name,
		Inputs:  []OverviewPort{},
		Outputs: []OverviewPort{},
	}

	if data == nil || data.IO == nil {
		return node
	}

	node.Inputs = ioVarsToOverviewPorts(data.IO.In)
	node.Outputs = ioVarsToOverviewPorts(data.IO.Out)

	return node
}

// ioVarsToOverviewPorts converts a map of IOVar to a sorted slice of OverviewPort.
func ioVarsToOverviewPorts(vars map[string]uniset.IOVar) []OverviewPort {
	if len(vars) == 0 {
		return []OverviewPort{}
	}

	ports := make([]OverviewPort, 0, len(vars))
	for _, v := range vars {
		ports = append(ports, OverviewPort{
			Name:  v.Name,
			Value: v.Value,
		})
	}

	sort.Slice(ports, func(i, j int) bool {
		return ports[i].Name < ports[j].Name
	})

	return ports
}

// computeOverviewEdges builds edges by matching output port names to input port names
// across different nodes.
func computeOverviewEdges(nodes []OverviewNode) []OverviewEdge {
	// Build output index: sensorName -> list of node names that output it
	type outputEntry struct {
		nodeName string
	}
	outputIndex := make(map[string][]outputEntry)

	for _, node := range nodes {
		for _, out := range node.Outputs {
			outputIndex[out.Name] = append(outputIndex[out.Name], outputEntry{nodeName: node.Name})
		}
	}

	// Match inputs against outputIndex
	var edges []OverviewEdge
	for _, node := range nodes {
		for _, in := range node.Inputs {
			entries, exists := outputIndex[in.Name]
			if !exists {
				continue
			}
			for _, entry := range entries {
				// Skip self-connections
				if entry.nodeName == node.Name {
					continue
				}
				edges = append(edges, OverviewEdge{
					FromNode: entry.nodeName,
					FromPort: in.Name,
					ToNode:   node.Name,
					ToPort:   in.Name,
				})
			}
		}
	}

	if edges == nil {
		edges = []OverviewEdge{}
	}

	// Sort edges for stable output
	sort.Slice(edges, func(i, j int) bool {
		if edges[i].FromNode != edges[j].FromNode {
			return edges[i].FromNode < edges[j].FromNode
		}
		if edges[i].FromPort != edges[j].FromPort {
			return edges[i].FromPort < edges[j].FromPort
		}
		if edges[i].ToNode != edges[j].ToNode {
			return edges[i].ToNode < edges[j].ToNode
		}
		return edges[i].ToPort < edges[j].ToPort
	})

	return edges
}

// matchOverviewPattern checks whether an object name matches the overview config patterns.
// Empty patterns means include all. Exclude always takes precedence.
func matchOverviewPattern(patterns, exclude []string, name string) bool {
	// Check exclude first — always takes precedence.
	for _, pat := range exclude {
		matched, err := path.Match(pat, name)
		if err != nil {
			slog.Warn("invalid overview exclude pattern", "pattern", pat, "error", err)
			continue
		}
		if matched {
			return false
		}
	}

	// If no include patterns — include all (that passed exclude).
	if len(patterns) == 0 {
		return true
	}

	// Must match at least one include pattern.
	for _, pat := range patterns {
		matched, err := path.Match(pat, name)
		if err != nil {
			slog.Warn("invalid overview pattern", "pattern", pat, "error", err)
			continue
		}
		if matched {
			return true
		}
	}

	return false
}
