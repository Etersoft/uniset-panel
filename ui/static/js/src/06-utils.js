// ============================================================================
// Общие утилиты
// ============================================================================

// Экранирование HTML для безопасной вставки текста
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Универсальный debounce — возвращает обёртку, откладывающую вызов fn на delay мс
function debounce(fn, delay) {
    let timer = null;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}
