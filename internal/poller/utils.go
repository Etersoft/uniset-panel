package poller

import (
	"strconv"
	"strings"
)

// BuildIDQuery формирует строку запроса из списка ID: "id1,id2,id3"
func BuildIDQuery(ids []int64) string {
	if len(ids) == 0 {
		return ""
	}

	var sb strings.Builder
	sb.Grow(len(ids) * 8) // примерная оценка размера

	for i, id := range ids {
		if i > 0 {
			sb.WriteByte(',')
		}
		sb.WriteString(strconv.FormatInt(id, 10))
	}

	return sb.String()
}
