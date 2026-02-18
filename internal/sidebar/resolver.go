package sidebar

import (
	"fmt"
	"log/slog"
	"path"
	"strings"

	"github.com/pv/uniset-panel/internal/config"
)

// SidebarItem представляет одну сущность в резолвленном дереве sidebar
type SidebarItem struct {
	Type        string `json:"type"`                  // "object", "launcher", "dashboard", "journal", "server"
	Name        string `json:"name"`                  // ID для паттернов и открытия вкладок
	DisplayName string `json:"displayName,omitempty"` // человекочитаемое имя для UI (если отличается от Name)
	ServerID    string `json:"serverId,omitempty"`
}

// SidebarGroup представляет резолвленную группу sidebar
type SidebarGroup struct {
	Name        string        `json:"name"`
	Icon        string        `json:"icon,omitempty"`
	GroupByType bool          `json:"groupByType"`
	Items       []SidebarItem `json:"items"`
}

// BuildEntityID формирует идентификатор сущности в формате {type}:{name}@{serverId}
func BuildEntityID(entityType, name, serverID string) string {
	if serverID != "" {
		return fmt.Sprintf("%s:%s@%s", entityType, name, serverID)
	}
	return fmt.Sprintf("%s:%s", entityType, name)
}

// MatchEntity проверяет соответствие сущности паттерну
// Паттерн с @ (напр. "object:*@diesel-srv") — матчит с учётом serverId
// Паттерн без @ (напр. "launcher:*") — матчит без учёта serverId
func MatchEntity(pattern, entityID string) bool {
	if strings.Contains(pattern, "@") {
		matched, err := path.Match(pattern, entityID)
		if err != nil {
			slog.Warn("invalid glob pattern", "pattern", pattern, "error", err)
			return false
		}
		return matched
	}
	// Паттерн без @ — сравниваем с entityID без @serverId
	bareID := entityID
	if idx := strings.Index(entityID, "@"); idx >= 0 {
		bareID = entityID[:idx]
	}
	matched, err := path.Match(pattern, bareID)
	if err != nil {
		slog.Warn("invalid glob pattern", "pattern", pattern, "error", err)
		return false
	}
	return matched
}

// defaultTypeOrder задаёт порядок типов для дефолтной группировки
var defaultTypeOrder = []struct {
	Type string
	Name string
}{
	{"object", "Objects"},
	{"launcher", "Launchers"},
	{"journal", "Journals"},
	{"dashboard", "Dashboards"},
	{"server", "Servers"},
}

// Resolve резолвит правила группировки из конфига против списка известных сущностей.
// Если конфиг пуст — формирует дефолтные группы по типам.
// Несовпавшие сущности попадают в автогруппу "Прочие".
func Resolve(groups []config.SidebarGroupConfig, entities []SidebarItem) []SidebarGroup {
	if len(groups) == 0 {
		return resolveDefault(entities)
	}

	matched := make(map[string]bool)
	result := make([]SidebarGroup, 0, len(groups))

	for _, gc := range groups {
		sg := SidebarGroup{
			Name:        gc.Name,
			Icon:        gc.Icon,
			GroupByType: gc.GroupByType,
			Items:       []SidebarItem{},
		}

		for _, entity := range entities {
			entityID := BuildEntityID(entity.Type, entity.Name, entity.ServerID)
			if matched[entityID] {
				continue
			}

			if matchGroup(gc, entity, entityID) {
				sg.Items = append(sg.Items, entity)
				matched[entityID] = true
			}
		}

		result = append(result, sg)
	}

	// Собираем несовпавшие в "Прочие"
	var other []SidebarItem
	for _, entity := range entities {
		entityID := BuildEntityID(entity.Type, entity.Name, entity.ServerID)
		if !matched[entityID] {
			other = append(other, entity)
		}
	}
	if len(other) > 0 {
		result = append(result, SidebarGroup{
			Name:  "Прочие",
			Items: other,
		})
	}

	return result
}

// resolveDefault формирует дефолтные группы по типам (когда конфиг не задан)
func resolveDefault(entities []SidebarItem) []SidebarGroup {
	if len(entities) == 0 {
		return []SidebarGroup{}
	}

	// Группируем по типу
	byType := make(map[string][]SidebarItem)
	for _, entity := range entities {
		byType[entity.Type] = append(byType[entity.Type], entity)
	}

	var result []SidebarGroup
	for _, dt := range defaultTypeOrder {
		items := byType[dt.Type]
		if len(items) == 0 {
			continue
		}
		result = append(result, SidebarGroup{
			Name:  dt.Name,
			Items: items,
		})
	}

	return result
}

// matchGroup проверяет соответствие сущности правилам группы
func matchGroup(gc config.SidebarGroupConfig, entity SidebarItem, entityID string) bool {
	// Проверяем items (exact match по имени, любой тип)
	for _, item := range gc.Items {
		if entity.Name == item {
			return true
		}
	}

	// Проверяем patterns (glob match по entityID)
	for _, pattern := range gc.Patterns {
		if MatchEntity(pattern, entityID) {
			return true
		}
	}

	return false
}
