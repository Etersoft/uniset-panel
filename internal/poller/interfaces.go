package poller

// ItemFetcher определяет специфичные для типа операции получения и обработки элементов
type ItemFetcher[T any] interface {
	// FetchItems получает элементы по списку ID
	FetchItems(objectName string, ids []int64) ([]T, error)

	// GetItemID возвращает ID элемента
	GetItemID(item T) int64

	// GetValueHash возвращает хеш значения для определения изменений
	GetValueHash(item T) string
}
