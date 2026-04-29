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

// Экранирование строки для вставки внутрь HTML-атрибута (`attr="..."`).
// escapeHtml() не покрывает кавычки/апострофы (textContent → innerHTML
// сериализует только <, >, &), поэтому в attribute context кавычка в
// значении ломает разметку. Используй здесь, когда подставляешь dynamic
// данные внутрь quoted attribute.
function escapeAttr(text) {
    if (text === null || text === undefined) return '';
    const s = String(text);
    if (s === '') return '';
    return s
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

if (typeof globalThis !== 'undefined') {
    globalThis.escapeHtml = escapeHtml;
    globalThis.escapeAttr = escapeAttr;
}

// Универсальный resize-handle: mousedown → mousemove → mouseup паттерн
function setupResizeHandle(handle, container, minHeight, onSave) {
    if (!handle || !container) return;
    let startY = 0, startHeight = 0, isResizing = false;

    const onMouseMove = (e) => {
        if (!isResizing) return;
        const newHeight = Math.max(minHeight, startHeight + e.clientY - startY);
        container.style.height = `${newHeight}px`;
        container.style.maxHeight = `${newHeight}px`;
    };
    const onMouseUp = () => {
        if (!isResizing) return;
        isResizing = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        onSave(container.offsetHeight);
    };
    handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isResizing = true;
        startY = e.clientY;
        startHeight = container.offsetHeight;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
    });
}

// Универсальный debounce — возвращает обёртку, откладывающую вызов fn на delay мс
function debounce(fn, delay) {
    let timer = null;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}
