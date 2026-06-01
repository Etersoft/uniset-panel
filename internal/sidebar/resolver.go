package sidebar

import (
	"fmt"
	"log/slog"
	"strings"

	"github.com/pv/uniset-panel/internal/config"
)

// matchGlob — простой glob matcher с поддержкой `*` (любая последовательность
// символов, включая `/`) и `?` (один символ). Используем вместо path.Match
// потому что entityID — НЕ файловый путь, и `/` в имени (напр. dashboard
// "DP/IJ Control") не должен ломать pattern `dashboard:*`. Возвращает
// (matched, ok); ok=false для malformed pattern.
func matchGlob(pattern, s string) (bool, bool) {
	// Iterative two-pointer алгоритм с backtracking на `*`.
	// Сложность O(n*m) worst case, что для коротких sidebar patterns ОК.
	pi, si := 0, 0
	starPi, starSi := -1, -1
	for si < len(s) {
		if pi < len(pattern) && (pattern[pi] == '?' || pattern[pi] == s[si]) {
			pi++
			si++
			continue
		}
		if pi < len(pattern) && pattern[pi] == '*' {
			starPi = pi
			starSi = si
			pi++
			continue
		}
		if starPi != -1 {
			pi = starPi + 1
			starSi++
			si = starSi
			continue
		}
		return false, true
	}
	// Consume trailing `*` in pattern
	for pi < len(pattern) && pattern[pi] == '*' {
		pi++
	}
	return pi == len(pattern), true
}

// SidebarItem представляет одну сущность в резолвленном дереве sidebar
type SidebarItem struct {
	Type        string `json:"type"`                  // "object", "launcher", "dashboard", "journal", "server"
	Name        string `json:"name"`                  // ID для паттернов и открытия вкладок
	DisplayName string `json:"displayName,omitempty"` // человекочитаемое имя для UI (если отличается от Name)
	ServerID    string `json:"serverId,omitempty"`
}

// SidebarGroup представляет резолвленную группу sidebar
type SidebarGroup struct {
	Name  string        `json:"name"`
	Icon  string        `json:"icon,omitempty"`
	Items []SidebarItem `json:"items"`
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
	target := entityID
	if !strings.Contains(pattern, "@") {
		// Паттерн без @ — сравниваем с entityID без @serverId
		if idx := strings.Index(entityID, "@"); idx >= 0 {
			target = entityID[:idx]
		}
	}
	matched, ok := matchGlob(pattern, target)
	if !ok {
		slog.Warn("invalid glob pattern", "pattern", pattern)
		return false
	}
	return matched
}

// Resolve резолвит правила группировки из конфига против списка известных сущностей.
// Если конфиг пуст — возвращает одну группу без имени со всеми сущностями.
// Несовпавшие сущности попадают в автогруппу "Прочие".
// Серверы включаются только если конфиг явно содержит паттерн "server:".
// exclude — глобальные паттерны исключения (сущности удаляются до обработки групп).
func Resolve(groups []config.SidebarGroupConfig, exclude []string, entities []SidebarItem) []SidebarGroup {
	if len(exclude) > 0 {
		entities = filterByExclude(entities, exclude)
	}

	if len(groups) == 0 {
		return resolveDefault(entities)
	}

	if !hasServerPatterns(groups) {
		entities = filterOutType(entities, "server")
	}

	matched := make(map[string]bool)
	result := make([]SidebarGroup, 0, len(groups))

	for _, gc := range groups {
		sg := SidebarGroup{
			Name:  gc.Name,
			Icon:  gc.Icon,
			Items: []SidebarItem{},
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

// resolveDefault формирует одну группу без имени со всеми сущностями (когда конфиг не задан).
// Серверы исключаются — их статус виден на объектах через точки подключения.
func resolveDefault(entities []SidebarItem) []SidebarGroup {
	entities = filterOutType(entities, "server")
	if len(entities) == 0 {
		return []SidebarGroup{}
	}

	return []SidebarGroup{{
		Items: entities,
	}}
}

// hasServerPatterns проверяет, есть ли в конфиге паттерны, явно ссылающиеся на серверы
func hasServerPatterns(groups []config.SidebarGroupConfig) bool {
	for _, g := range groups {
		for _, p := range g.Patterns {
			if strings.HasPrefix(p, "server:") {
				return true
			}
		}
	}
	return false
}

// filterOutType удаляет сущности заданного типа из списка
func filterOutType(entities []SidebarItem, entityType string) []SidebarItem {
	filtered := make([]SidebarItem, 0, len(entities))
	for _, e := range entities {
		if e.Type != entityType {
			filtered = append(filtered, e)
		}
	}
	return filtered
}

// matchGroup проверяет соответствие сущности правилам группы.
// Паттерны с префиксом "!" исключают сущность из группы.
// Логика: (совпал items ИЛИ совпал позитивный паттерн) И (не совпал ни один !-паттерн).
func matchGroup(gc config.SidebarGroupConfig, entity SidebarItem, entityID string) bool {
	// Проверяем items (exact match по имени, любой тип)
	itemMatch := false
	for _, item := range gc.Items {
		if entity.Name == item {
			itemMatch = true
			break
		}
	}

	// Проверяем patterns — разделяем на позитивные и негативные
	var positiveMatch, negativeMatch bool
	for _, pattern := range gc.Patterns {
		if strings.HasPrefix(pattern, "!") {
			if MatchEntity(pattern[1:], entityID) {
				negativeMatch = true
			}
		} else {
			if MatchEntity(pattern, entityID) {
				positiveMatch = true
			}
		}
	}

	return (itemMatch || positiveMatch) && !negativeMatch
}

// filterByExclude удаляет сущности, совпавшие с exclude-паттернами
func filterByExclude(entities []SidebarItem, exclude []string) []SidebarItem {
	filtered := make([]SidebarItem, 0, len(entities))
	for _, entity := range entities {
		entityID := BuildEntityID(entity.Type, entity.Name, entity.ServerID)
		excluded := false
		for _, pattern := range exclude {
			if MatchEntity(pattern, entityID) {
				excluded = true
				break
			}
		}
		if !excluded {
			filtered = append(filtered, entity)
		}
	}
	return filtered
}
