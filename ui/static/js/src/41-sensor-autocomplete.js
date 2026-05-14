// ============================================================================
// setupSensorAutocomplete — переиспользуемый IONC sensor selector.
//
// Привязывается к input'у. По вводу — debounce, fetch к
// /api/objects/{objectName}/ionc/sensors?server=...&search=...&limit=20,
// показывает выпадающий suggest. Клик/Enter — подставляет name + сохраняет
// числовой id в hidden input. Стрелки ↑↓ — навигация. Esc — закрыть.
// При смене objectName (через resetOnObjectChange()) — очищает выбор.
// ============================================================================

// URL builder для IONC sensors endpoint — единая точка композиции query
// (autocomplete, dashboard bootstrap, dashboard cold-resolve).
function buildIONCSensorsUrl({ objectName, serverId = '', search = '', limit = SENSOR_AUTOCOMPLETE_LIMIT, offset = null } = {}) {
    let url = `/api/objects/${encodeURIComponent(objectName)}/ionc/sensors?limit=${limit}`;
    if (serverId)        url += `&server=${encodeURIComponent(serverId)}`;
    if (search)          url += `&search=${encodeURIComponent(search)}`;
    if (offset !== null) url += `&offset=${offset}`;
    return url;
}

if (typeof globalThis !== 'undefined') {
    globalThis.buildIONCSensorsUrl = buildIONCSensorsUrl;
}

function setupSensorAutocomplete(inputEl, hiddenIdEl, getObjectName, getServerId) {
    if (!inputEl) return null;

    let dropdown = null;
    let debounceTimer = null;
    let activeIndex = -1;
    let currentItems = [];
    let currentSearch = '';
    let currentOffset = 0;
    let currentTotal = 0;
    let isLoading = false;
    let hasMore = false;
    let scrollHandler = null;
    // requestId защищает от race condition: устаревший fetch не должен затереть
    // более свежий результат, если user быстро перепечатывает search.
    let requestId = 0;

    function destroyDropdown() {
        if (dropdown) {
            if (scrollHandler) dropdown.removeEventListener('scroll', scrollHandler);
            dropdown.remove();
            dropdown = null;
        }
        scrollHandler = null;
        activeIndex = -1;
        currentItems = [];
        currentSearch = '';
        currentOffset = 0;
        currentTotal = 0;
        isLoading = false;
        hasMore = false;
    }

    function buildDropdown() {
        if (dropdown) return;
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

        scrollHandler = () => {
            if (!dropdown || isLoading || !hasMore) return;
            const remaining = dropdown.scrollHeight - (dropdown.scrollTop + dropdown.clientHeight);
            if (remaining <= SENSOR_AUTOCOMPLETE_SCROLL_THRESHOLD_PX) {
                fetchMore();
            }
        };
        dropdown.addEventListener('scroll', scrollHandler);
    }

    function renderItems() {
        if (!dropdown) return;
        if (currentItems.length === 0 && !isLoading) {
            dropdown.innerHTML = '<div class="sensor-autocomplete-empty">Не найдено</div>';
            return;
        }
        const itemsHtml = currentItems.map((s, idx) => `
            <div class="sensor-autocomplete-item ${idx === activeIndex ? 'active' : ''}"
                 data-idx="${idx}"
                 data-id="${escapeAttr(s.id)}"
                 data-name="${escapeAttr(s.name)}">
                <div class="sensor-autocomplete-name">${escapeHtml(s.name)}</div>
                <div class="sensor-autocomplete-meta">id=${escapeHtml(String(s.id))} · type=${escapeHtml(s.type || '?')} · value=${escapeHtml(String(s.value ?? '—'))}</div>
            </div>
        `).join('');
        let footerHtml = '';
        if (currentTotal > 0) {
            const showing = currentItems.length;
            const hint = isLoading
                ? `Загрузка ещё ${SENSOR_AUTOCOMPLETE_CHUNK_SIZE}…`
                : (showing < currentTotal ? 'прокрутите для загрузки или введите для фильтра' : 'весь список');
            footerHtml = `<div class="sensor-autocomplete-footer">${showing} из ${currentTotal} — ${hint}</div>`;
        }
        dropdown.innerHTML = itemsHtml + footerHtml;
        dropdown.querySelectorAll('.sensor-autocomplete-item').forEach(el => {
            el.addEventListener('mousedown', (e) => {
                e.preventDefault();
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

    async function fetchInitial(searchText) {
        const objectName = (getObjectName && getObjectName()) || 'SharedMemory';
        const serverId = (getServerId && getServerId()) || '';
        currentSearch = searchText;
        currentOffset = 0;
        currentItems = [];
        currentTotal = 0;
        hasMore = false;
        activeIndex = -1;
        if (!serverId) {
            buildDropdown();
            renderItems();
            return;
        }
        const myReq = ++requestId;
        isLoading = true;
        try {
            const resp = await fetch(buildIONCSensorsUrl({
                objectName, serverId, search: searchText,
                limit: SENSOR_AUTOCOMPLETE_CHUNK_SIZE, offset: 0,
            }));
            if (myReq !== requestId) return; // stale — newer request superseded
            buildDropdown();
            isLoading = false;
            if (!resp.ok) {
                renderItems();
                return;
            }
            const data = await resp.json();
            if (myReq !== requestId) return;
            currentItems = data.sensors || [];
            currentTotal = (typeof data.count === 'number') ? data.count : currentItems.length;
            currentOffset = currentItems.length;
            hasMore = currentItems.length > 0 && currentItems.length < currentTotal;
            renderItems();
        } catch (e) {
            if (myReq !== requestId) return;
            isLoading = false;
            console.warn('sensor autocomplete fetch failed:', e);
        }
    }

    async function fetchMore() {
        if (!dropdown || isLoading || !hasMore) return;
        const objectName = (getObjectName && getObjectName()) || 'SharedMemory';
        const serverId = (getServerId && getServerId()) || '';
        if (!serverId) return;
        const myReq = ++requestId;
        isLoading = true;
        renderItems(); // обновить footer на «Загрузка…»
        try {
            const resp = await fetch(buildIONCSensorsUrl({
                objectName, serverId, search: currentSearch,
                limit: SENSOR_AUTOCOMPLETE_CHUNK_SIZE, offset: currentOffset,
            }));
            if (myReq !== requestId) return;
            isLoading = false;
            if (!resp.ok) {
                hasMore = false;
                renderItems();
                return;
            }
            const data = await resp.json();
            if (myReq !== requestId) return;
            const newItems = data.sensors || [];
            // Сохранить scroll position при ре-рендере list (innerHTML wipe сбрасывает scrollTop)
            const savedScroll = dropdown.scrollTop;
            currentItems = currentItems.concat(newItems);
            if (typeof data.count === 'number') currentTotal = data.count;
            currentOffset = currentItems.length;
            hasMore = newItems.length > 0 && currentItems.length < currentTotal;
            renderItems();
            dropdown.scrollTop = savedScroll;
        } catch (e) {
            if (myReq !== requestId) return;
            isLoading = false;
            console.warn('sensor autocomplete fetch-more failed:', e);
        }
    }

    inputEl.addEventListener('focus', () => {
        fetchInitial('');
    });

    inputEl.addEventListener('input', () => {
        // Любая ручная правка инвалидирует ранее выбранный sensorId — иначе юзер
        // может оставить старый числовой ID при имени, не выбранном из dropdown,
        // и backend subscribe/write пойдёт в неправильный sensor. Перевыбор из
        // dropdown (mousedown в pickItem) перезапишет hidden обратно.
        if (hiddenIdEl) hiddenIdEl.value = '';
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => fetchInitial(inputEl.value.trim()),
            AUTOCOMPLETE_DEBOUNCE_DELAY);
    });

    inputEl.addEventListener('keydown', (e) => {
        if (!dropdown || currentItems.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIndex = Math.min(activeIndex + 1, currentItems.length - 1);
            renderItems();
            // Scroll active item into view if needed
            dropdown.querySelector('.sensor-autocomplete-item.active')?.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIndex = Math.max(activeIndex - 1, 0);
            renderItems();
            dropdown.querySelector('.sensor-autocomplete-item.active')?.scrollIntoView({ block: 'nearest' });
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
