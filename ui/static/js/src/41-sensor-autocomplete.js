// ============================================================================
// setupSensorAutocomplete — переиспользуемый IONC sensor selector.
//
// Привязывается к input'у. По вводу — debounce, fetch к
// /api/objects/{objectName}/ionc/sensors?server=...&search=...&limit=20,
// показывает выпадающий suggest. Клик/Enter — подставляет name + сохраняет
// числовой id в hidden input. Стрелки ↑↓ — навигация. Esc — закрыть.
// При смене objectName (через resetOnObjectChange()) — очищает выбор.
// ============================================================================

const SENSOR_AUTOCOMPLETE_DEBOUNCE_MS = 150;
const SENSOR_AUTOCOMPLETE_LIMIT = 20;
// На focus показываем top-N из IONC объекта (без search фильтра), чтобы юзер
// сразу видел ассортимент, а не результат поиска по уже введённому тексту
// (typically — имя сохранённого sensor'а из existing config). Spec требует 10.
const SENSOR_AUTOCOMPLETE_FOCUS_LIMIT = 10;

function setupSensorAutocomplete(inputEl, hiddenIdEl, getObjectName, getServerId) {
    if (!inputEl) return null;

    let dropdown = null;
    let debounceTimer = null;
    let activeIndex = -1;
    let currentItems = [];

    function destroyDropdown() {
        if (dropdown) {
            dropdown.remove();
            dropdown = null;
        }
        activeIndex = -1;
        currentItems = [];
    }

    function buildDropdown() {
        destroyDropdown();
        dropdown = document.createElement('div');
        dropdown.className = 'sensor-autocomplete-dropdown';
        // Положение — fixed с подсчётом координат относительно input'а.
        const rect = inputEl.getBoundingClientRect();
        dropdown.style.position = 'fixed';
        dropdown.style.left = `${rect.left}px`;
        dropdown.style.top = `${rect.bottom + 2}px`;
        dropdown.style.width = `${rect.width}px`;
        dropdown.style.zIndex = '10000';
        document.body.appendChild(dropdown);
    }

    function renderItems(items) {
        if (!dropdown) return;
        currentItems = items;
        if (items.length === 0) {
            dropdown.innerHTML = '<div class="sensor-autocomplete-empty">Не найдено</div>';
            return;
        }
        dropdown.innerHTML = items.map((s, idx) => `
            <div class="sensor-autocomplete-item ${idx === activeIndex ? 'active' : ''}"
                 data-idx="${idx}"
                 data-id="${s.id}"
                 data-name="${escapeAttr(s.name)}">
                <div class="sensor-autocomplete-name">${escapeHtml(s.name)}</div>
                <div class="sensor-autocomplete-meta">id=${s.id} · type=${escapeHtml(s.type || '?')} · value=${s.value ?? '—'}</div>
            </div>
        `).join('');
        dropdown.querySelectorAll('.sensor-autocomplete-item').forEach(el => {
            el.addEventListener('mousedown', (e) => {
                e.preventDefault(); // prevent input blur before we read values
                pickItem(parseInt(el.dataset.idx, 10));
            });
        });
    }

    function pickItem(idx) {
        const item = currentItems[idx];
        if (!item) return;
        inputEl.value = item.name;
        if (hiddenIdEl) hiddenIdEl.value = String(item.id);
        destroyDropdown();
    }

    async function fetchAndShow(searchText, options = {}) {
        const limit = options.limit ?? SENSOR_AUTOCOMPLETE_LIMIT;
        const objectName = (getObjectName && getObjectName()) || 'SharedMemory';
        const serverId = (getServerId && getServerId()) || '';
        if (!serverId) {
            buildDropdown();
            renderItems([]);
            return;
        }
        try {
            const url = `/api/objects/${encodeURIComponent(objectName)}/ionc/sensors`
                + `?server=${encodeURIComponent(serverId)}`
                + (searchText ? `&search=${encodeURIComponent(searchText)}` : '')
                + `&limit=${limit}`;
            const resp = await fetch(url);
            if (!resp.ok) {
                buildDropdown();
                renderItems([]);
                return;
            }
            const data = await resp.json();
            const items = data.sensors || [];
            buildDropdown();
            activeIndex = -1;
            renderItems(items);
        } catch (e) {
            console.warn('sensor autocomplete fetch failed:', e);
        }
    }

    inputEl.addEventListener('focus', () => {
        // Focus всегда показывает top-N (limit=10) без search-фильтра — иначе при
        // editing existing config dropdown забит результатами по уже выбранному
        // имени, что бесполезно для просмотра «что ещё есть на этом объекте».
        fetchAndShow('', { limit: SENSOR_AUTOCOMPLETE_FOCUS_LIMIT });
    });

    inputEl.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => fetchAndShow(inputEl.value.trim()),
            SENSOR_AUTOCOMPLETE_DEBOUNCE_MS);
    });

    inputEl.addEventListener('keydown', (e) => {
        if (!dropdown || currentItems.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIndex = Math.min(activeIndex + 1, currentItems.length - 1);
            renderItems(currentItems);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIndex = Math.max(activeIndex - 1, 0);
            renderItems(currentItems);
        } else if (e.key === 'Enter') {
            if (activeIndex >= 0) {
                e.preventDefault();
                pickItem(activeIndex);
            }
        } else if (e.key === 'Escape') {
            destroyDropdown();
        }
    });

    inputEl.addEventListener('blur', () => {
        // Delay so click on dropdown item fires first (mousedown handler runs).
        setTimeout(destroyDropdown, 150);
    });

    return {
        // Каллер вызывает при смене IONC объекта в форме конфига.
        resetOnObjectChange() {
            inputEl.value = '';
            if (hiddenIdEl) hiddenIdEl.value = '';
            destroyDropdown();
        },
        destroy() {
            destroyDropdown();
        }
    };
}

window.setupSensorAutocomplete = setupSensorAutocomplete;
