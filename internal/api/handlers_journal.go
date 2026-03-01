package api

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"log/slog"

	"github.com/pv/uniset-panel/internal/journal"
)

const (
	defaultJournalLimit = 100  // лимит записей журнала по умолчанию
	maxJournalLimit     = 1000 // максимальный лимит записей журнала
)

// GetJournals возвращает список подключенных журналов
// GET /api/journals
func (h *Handlers) GetJournals(w http.ResponseWriter, r *http.Request) {
	if h.journalMgr == nil {
		h.writeJSON(w, []journal.JournalInfo{})
		return
	}

	h.writeJSON(w, h.journalMgr.GetAllInfos())
}

// requireJournalClient returns journal client for the request.
// Returns nil and false if unavailable (error already written).
func (h *Handlers) requireJournalClient(w http.ResponseWriter, r *http.Request) (*journal.Client, string, bool) {
	if h.journalMgr == nil {
		h.writeError(w, http.StatusNotFound, "journals not configured")
		return nil, "", false
	}

	id := r.PathValue("id")
	client := h.journalMgr.GetClient(id)
	if client == nil {
		h.writeError(w, http.StatusNotFound, "journal not found")
		return nil, "", false
	}

	return client, id, true
}

// GetJournalMessages возвращает сообщения из журнала с пагинацией и фильтрами
// GET /api/journals/{id}/messages
func (h *Handlers) GetJournalMessages(w http.ResponseWriter, r *http.Request) {
	client, id, ok := h.requireJournalClient(w, r)
	if !ok {
		return
	}

	// Парсим query параметры
	params := journal.QueryParams{}

	// from/to в формате RFC3339 или Unix timestamp
	if fromStr := r.URL.Query().Get("from"); fromStr != "" {
		if t, err := parseTime(fromStr); err == nil {
			params.From = t
		}
	}
	if toStr := r.URL.Query().Get("to"); toStr != "" {
		if t, err := parseTime(toStr); err == nil {
			params.To = t
		}
	}

	// mtype - фильтр по типам (comma-separated)
	if mtypeStr := r.URL.Query().Get("mtype"); mtypeStr != "" {
		params.MTypes = strings.Split(mtypeStr, ",")
	}

	// mgroup - фильтр по группам (comma-separated)
	if mgroupStr := r.URL.Query().Get("mgroup"); mgroupStr != "" {
		params.MGroups = strings.Split(mgroupStr, ",")
	}

	// search - текстовый поиск
	params.Search = r.URL.Query().Get("search")

	// limit/offset для пагинации
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			params.Limit = l
		}
	}
	if params.Limit == 0 {
		params.Limit = defaultJournalLimit
	}
	if params.Limit > maxJournalLimit {
		params.Limit = maxJournalLimit
	}

	if offsetStr := r.URL.Query().Get("offset"); offsetStr != "" {
		if o, err := strconv.Atoi(offsetStr); err == nil && o >= 0 {
			params.Offset = o
		}
	}

	ctx := r.Context()
	resp, err := client.Query(ctx, params)
	if err != nil {
		slog.Error("failed to query journal", "id", id, "error", err)
		h.writeError(w, http.StatusInternalServerError, "query failed: "+err.Error())
		return
	}

	h.writeJSON(w, resp)
}

// GetJournalMTypes возвращает список уникальных типов сообщений
// GET /api/journals/{id}/mtypes
func (h *Handlers) GetJournalMTypes(w http.ResponseWriter, r *http.Request) {
	client, id, ok := h.requireJournalClient(w, r)
	if !ok {
		return
	}

	ctx := r.Context()
	types, err := client.GetMTypes(ctx)
	if err != nil {
		slog.Error("failed to get mtypes", "id", id, "error", err)
		h.writeError(w, http.StatusInternalServerError, "query failed: "+err.Error())
		return
	}

	h.writeJSON(w, types)
}

// GetJournalMGroups возвращает список уникальных групп сообщений
// GET /api/journals/{id}/mgroups
func (h *Handlers) GetJournalMGroups(w http.ResponseWriter, r *http.Request) {
	client, id, ok := h.requireJournalClient(w, r)
	if !ok {
		return
	}

	ctx := r.Context()
	groups, err := client.GetMGroups(ctx)
	if err != nil {
		slog.Error("failed to get mgroups", "id", id, "error", err)
		h.writeError(w, http.StatusInternalServerError, "query failed: "+err.Error())
		return
	}

	h.writeJSON(w, groups)
}

// parseTime парсит время из строки (RFC3339 или Unix timestamp)
func parseTime(s string) (time.Time, error) {
	// Пробуем RFC3339
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t, nil
	}
	// Пробуем Unix timestamp (секунды)
	if ts, err := strconv.ParseInt(s, 10, 64); err == nil {
		return time.Unix(ts, 0), nil
	}
	// Пробуем Unix timestamp (миллисекунды)
	if ts, err := strconv.ParseInt(s, 10, 64); err == nil && ts > 1e12 {
		return time.UnixMilli(ts), nil
	}
	return time.Time{}, nil
}
