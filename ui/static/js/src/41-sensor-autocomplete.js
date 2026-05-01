// ============================================================================
// setupSensorAutocomplete — переиспользуемый IONC sensor selector.
//
// Привязывается к input'у. По вводу — debounce, fetch к
// /api/objects/{objectName}/ionc/sensors?server=...&search=...&limit=20,
// показывает выпадающий suggest. Клик/Enter — подставляет name + сохраняет
// числовой id в hidden input. Стрелки ↑↓ — навигация. Esc — закрыть.
// При смене objectName (через resetOnObjectChange()) — очищает выбор.
// ============================================================================

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
        dropdown.style.zIndex = String(SENSOR_AUTOCOMPLETE_DROPDOWN_Z_INDEX);
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
                 data-id="${escapeAttr(s.id)}"
                 data-name="${escapeAttr(s.name)}">
                <div class="sensor-autocomplete-name">${escapeHtml(s.name)}</div>
                <div class="sensor-autocomplete-meta">id=${escapeHtml(String(s.id))} · type=${escapeHtml(s.type || '?')} · value=${escapeHtml(String(s.value ?? '—'))}</div>
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
        // Любая ручная правка инвалидирует ранее выбранный sensorId — иначе юзер
        // может оставить старый числовой ID при имени, не выбранном из dropdown,
        // и backend subscribe/write пойдёт в неправильный sensor. Перевыбор из
        // dropdown (mousedown в pickItem) перезапишет hidden обратно.
        if (hiddenIdEl) hiddenIdEl.value = '';
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => fetchAndShow(inputEl.value.trim()),
            AUTOCOMPLETE_DEBOUNCE_DELAY);
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
        setTimeout(destroyDropdown, SENSOR_AUTOCOMPLETE_BLUR_DELAY_MS);
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
