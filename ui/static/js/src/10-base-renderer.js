// ============================================================================
// Система рендереров для разных типов объектов
// ============================================================================

// Реестр рендереров по типу объекта
const objectRenderers = new Map();

// ============================================================================
// Миксины для переиспользования общей функциональности
// ============================================================================

/**
 * Миксин для виртуального скролла и бесконечной подгрузки
 *
 * Группа A (полный виртуальный скролл): setupFullVirtualScroll()
 *   RAF-throttled скролл, расчёт startIndex/endIndex, spacer, бесконечная подгрузка.
 *   Рендерер должен реализовать: getVScrollItems(), vscrollRenderVisible(), vscrollLoadMore()
 *
 * Группа B (простой бесконечный скролл): setupSimpleInfiniteScroll()
 *   Только подгрузка при приближении к низу, без windowing.
 *   Рендерер должен реализовать: getVScrollItems(), vscrollLoadMore()
 */
const VirtualScrollMixin = {
    // Инициализация свойств виртуального скролла
    initVirtualScrollProps() {
        this.rowHeight = this.rowHeight || DEFAULT_ROW_HEIGHT;
        this.bufferRows = this.bufferRows || DEFAULT_BUFFER_ROWS;
        this.startIndex = 0;
        this.endIndex = 0;
        this.chunkSize = this.chunkSize || VIRTUAL_SCROLL_CHUNK_SIZE;
        this.hasMore = true;
        this.isLoadingChunk = false;
    },

    // Группа A: RAF-throttled скролл + windowing + infinite scroll
    // config: { viewportId, threshold?, thresholdType? }
    //   viewportId - ID viewport-элемента (без objectName, будет добавлен)
    //   threshold - порог подгрузки (default: VIRTUAL_SCROLL_LOAD_THRESHOLD px или 80%)
    //   thresholdType - 'px' (default) или 'percent'
    setupFullVirtualScroll(config) {
        this._vscrollViewportId = config.viewportId;
        const viewport = this.getEl(config.viewportId);
        if (!viewport) return;

        const threshold = config.threshold ?? VIRTUAL_SCROLL_LOAD_THRESHOLD;
        const thresholdType = config.thresholdType || 'px';

        let ticking = false;
        viewport.addEventListener('scroll', () => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    this._updateVisibleRows(viewport);
                    this._checkInfiniteScroll(viewport, threshold, thresholdType);
                    ticking = false;
                });
                ticking = true;
            }
        });
    },

    // Публичный метод для пересчёта видимых строк (вызывается из loadSensors/loadMoreSensors)
    updateVisibleRows() {
        const viewport = this.getEl(this._vscrollViewportId);
        if (!viewport) return;
        this._updateVisibleRows(viewport);
    },

    // Группа B: простой scroll listener для infinite scroll (без windowing)
    // config: { viewportId, threshold? }
    setupSimpleInfiniteScroll(config) {
        const viewport = this.getEl(config.viewportId);
        if (!viewport) return;

        const threshold = config.threshold || 100;
        viewport.addEventListener('scroll', () => {
            const scrollTop = viewport.scrollTop;
            const viewportHeight = viewport.clientHeight;
            const scrollHeight = viewport.scrollHeight;

            if (scrollHeight - scrollTop - viewportHeight < threshold) {
                this.vscrollLoadMore();
            }
        });
    },

    // Расчёт видимого диапазона строк
    _updateVisibleRows(viewport) {
        const scrollTop = viewport.scrollTop;
        const viewportHeight = viewport.clientHeight;
        const totalRows = this.getVScrollItems().length;
        const visibleRows = Math.ceil(viewportHeight / this.rowHeight);

        this.startIndex = Math.max(0, Math.floor(scrollTop / this.rowHeight) - this.bufferRows);
        this.endIndex = Math.min(totalRows, this.startIndex + visibleRows + 2 * this.bufferRows);

        this.vscrollRenderVisible();
    },

    // Проверка необходимости подгрузки
    _checkInfiniteScroll(viewport, threshold, thresholdType) {
        if (this.isLoadingChunk || !this.hasMore) return;

        if (thresholdType === 'percent') {
            const scrollTop = viewport.scrollTop;
            const scrollHeight = viewport.scrollHeight;
            const clientHeight = viewport.clientHeight;
            if (scrollTop + clientHeight >= scrollHeight * (threshold / 100)) {
                this.vscrollLoadMore();
            }
        } else {
            const scrollBottom = viewport.scrollTop + viewport.clientHeight;
            const totalHeight = this.getVScrollItems().length * this.rowHeight;
            if (totalHeight - scrollBottom < threshold) {
                this.vscrollLoadMore();
            }
        }
    },

    // Показать/скрыть индикатор загрузки
    showVScrollLoadingIndicator(loadingId, show) {
        const el = this.getEl(loadingId);
        if (el) el.style.display = show ? 'block' : 'none';
    }
};

/**
 * Миксин для SSE подписок на обновления датчиков/регистров
 * Требует: objectName, apiPath, idField
 */
const SSESubscriptionMixin = {
    // Подписка на SSE обновления
    // apiPath - путь API (например '/ionc', '/opcua', '/modbus')
    // ids - массив ID для подписки
    // idField - имя поля в теле запроса (например 'sensor_ids', 'register_ids')
    // logPrefix - префикс для логов
    // extraBody - дополнительные поля для тела запроса (опционально)
    async subscribeToSSEFor(apiPath, ids, idField = 'sensor_ids', logPrefix = 'SSE', extraBody = {}) {
        if (!ids || ids.length === 0) return;

        // Сохраняем параметры подписки для повторной подписки (resubscribeIfNeeded)
        this._sseSubscriptionParams = { apiPath, idField, logPrefix, extraBody };

        // Пропускаем если уже подписаны на те же ID
        const newIds = new Set(ids);
        if (this.subscribedSensorIds.size === newIds.size &&
            [...newIds].every(id => this.subscribedSensorIds.has(id))) {
            return;
        }

        try {
            await this.fetchJSON(`/api/objects/${encodeURIComponent(this.objectName)}${apiPath}/subscribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [idField]: ids, ...extraBody })
            });

            this.subscribedSensorIds = newIds;
            console.log(`${logPrefix}: подписка на ${ids.length} элементов для ${this.objectName}`);
        } catch (err) {
            console.warn(`${logPrefix}: ошибка подписки:`, err);
        }
    },

    // Отписка от SSE обновлений
    async unsubscribeFromSSEFor(apiPath, idField = 'sensor_ids', logPrefix = 'SSE') {
        if (this.subscribedSensorIds.size === 0) return;

        try {
            const ids = [...this.subscribedSensorIds];
            await this.fetchJSON(`/api/objects/${encodeURIComponent(this.objectName)}${apiPath}/unsubscribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [idField]: ids })
            });

            console.log(`${logPrefix}: отписка от ${ids.length} элементов для ${this.objectName}`);
            this.subscribedSensorIds.clear();
        } catch (err) {
            console.warn(`${logPrefix}: ошибка отписки:`, err);
        }
    },

    // Повторная подписка после переподключения SSE
    // Сервер мог потерять состояние подписок при рестарте
    async resubscribeIfNeeded() {
        if (this.subscribedSensorIds.size === 0) return;
        if (!this._sseSubscriptionParams) return;

        const ids = [...this.subscribedSensorIds];
        const { apiPath, idField, logPrefix, extraBody } = this._sseSubscriptionParams;

        console.log(`${logPrefix}: Переподписка ${ids.length} элементов для ${this.objectName}`);
        this.subscribedSensorIds.clear(); // Очищаем кэш чтобы subscribeToSSEFor не пропустил
        await this.subscribeToSSEFor(apiPath, ids, idField, logPrefix, extraBody);
    }
};

/**
 * Миксин для изменяемых по высоте секций с сохранением в localStorage
 */
const ResizableSectionMixin = {
    // Loading сохранённой высоты
    loadSectionHeight(storageKey, defaultHeight = DEFAULT_SECTION_HEIGHT) {
        try {
            const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
            const value = saved[this.tabKey] ?? saved[this.objectName];
            if (typeof value === 'number' && value > 0) {
                return value;
            }
        } catch (err) {
            console.warn('Failed to load section height:', err);
        }
        return defaultHeight;
    },

    // Сохранение высоты
    saveSectionHeight(storageKey, value) {
        try {
            const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
            saved[this.tabKey] = value;
            localStorage.setItem(storageKey, JSON.stringify(saved));
        } catch (err) {
            console.warn('Failed to save section height:', err);
        }
    },

    // Настройка resize для секции
    // handleId - ID элемента resize-ручки
    // containerId - ID контейнера секции
    // storageKey - ключ для localStorage
    // heightProp - имя свойства для высоты (например 'sensorsHeight')
    // options - дополнительные параметры { minHeight, maxHeight }
    setupSectionResize(handleId, containerId, storageKey, heightProp, options = {}) {
        const handle = this.getEl(handleId);
        const container = this.getEl(containerId);
        if (!handle || !container) return;

        const minHeight = options.minHeight || MIN_SECTION_HEIGHT;
        const maxHeight = options.maxHeight || MAX_SECTION_HEIGHT;

        container.style.height = `${this[heightProp]}px`;

        let startY = 0;
        let startHeight = 0;
        let isResizing = false;

        const onMouseMove = (e) => {
            if (!isResizing) return;
            const delta = e.clientY - startY;
            const newHeight = Math.max(minHeight, Math.min(maxHeight, startHeight + delta));
            container.style.height = `${newHeight}px`;
        };

        const onMouseUp = () => {
            if (!isResizing) return;
            isResizing = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            const newHeight = parseInt(container.style.height, 10);
            if (!Number.isNaN(newHeight)) {
                this[heightProp] = newHeight;
                this.saveSectionHeight(storageKey, newHeight);
            }
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
};

/**
 * Миксин для фильтрации списка элементов
 */
const FilterMixin = {
    // Применение локальных фильтров к списку
    // extraFields - дополнительные поля для текстового поиска (например, ['mbreg'] для Modbus)
    // fieldAccessor - функция для получения значения поля (для вложенных объектов)
    applyFilters(items, nameField = 'name', typeField = 'type', statusField = null, extraFields = [], fieldAccessor = null) {
        let result = items;

        if (this.filter) {
            const filterLower = this.filter.toLowerCase();
            result = result.filter(item => {
                // Поиск по name
                if ((item[nameField] || '').toLowerCase().includes(filterLower)) return true;
                // Поиск по id
                if (String(item.id || '').includes(filterLower)) return true;
                // Поиск по дополнительным полям
                for (const field of extraFields) {
                    const value = fieldAccessor ? fieldAccessor(item, field) : item[field];
                    if (String(value || '').toLowerCase().includes(filterLower)) return true;
                }
                return false;
            });
        }

        if (this.typeFilter && this.typeFilter !== 'all') {
            result = result.filter(item => item[typeField] === this.typeFilter);
        }

        if (statusField && this.statusFilter && this.statusFilter !== 'all') {
            result = result.filter(item =>
                (item[statusField] || '').toLowerCase() === this.statusFilter.toLowerCase()
            );
        }

        return result;
    },

    // Полная настройка фильтров с ESC, type filter и опциональным status filter
    // onTextFilter — опциональный отдельный callback для текстового фильтра (если отличается от onFilter)
    setupFilterListeners(filterInputId, typeFilterId, onFilter, delay = FILTER_DEBOUNCE_DELAY, statusFilterId = null, onTextFilter = null) {
        const filterInput = this.getEl(filterInputId);
        const typeFilter = this.getEl(typeFilterId);
        const statusFilter = statusFilterId ? this.getEl(statusFilterId) : null;
        const textCallback = onTextFilter || onFilter;

        if (filterInput) {
            // Debounced input
            filterInput.addEventListener('input', (e) => {
                clearTimeout(this.filterDebounce);
                this.filterDebounce = setTimeout(() => {
                    this.filter = e.target.value.trim();
                    textCallback();
                }, delay);
            });

            // ESC сбрасывает фильтр
            filterInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    if (filterInput.value) {
                        filterInput.value = '';
                        this.filter = '';
                        textCallback();
                    }
                    filterInput.blur();
                    e.preventDefault();
                }
            });
        }

        if (typeFilter) {
            typeFilter.addEventListener('change', () => {
                this.typeFilter = typeFilter.value;
                onFilter();
            });
        }

        if (statusFilter) {
            statusFilter.addEventListener('change', () => {
                this.statusFilter = statusFilter.value;
                onFilter();
            });
        }
    },

    // Настройка ESC на контейнере для сброса фильтра
    setupContainerEscHandler(containerId, filterInputId, onFilter) {
        const container = this.getEl(containerId);
        const filterInput = this.getEl(filterInputId);
        if (!container || !filterInput) return;

        container.setAttribute('tabindex', '0');
        container.addEventListener('click', () => container.focus());
        container.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.filter) {
                filterInput.value = '';
                this.filter = '';
                onFilter();
                e.preventDefault();
            }
        });
    }
};

// Миксин для управления доступностью секции параметров на основе httpEnabledSetParams
const ParamsAccessibilityMixin = {
    /**
     * Обновляет доступность секции параметров на основе флага httpEnabledSetParams в статусе.
     * Если httpEnabledSetParams === false:
     * - Секция сворачивается
     * - Кнопка "Apply" блокируется
     * - Все input/select в таблице параметров блокируются
     * - Показывается предупреждающее сообщение
     * - Обновляется индикатор в шапке (если есть)
     *
     * @param {string} prefix - Префикс элементов (например, 'opcua', 'opcuasrv', 'mb', 'mbs')
     */
    updateParamsAccessibility(prefix) {
        // httpEnabledSetParams может быть: true/false, 1/0, или отсутствовать
        // Если статус не загружен - не меняем состояние секции
        if (!this.status) return;

        const val = this.status.httpEnabledSetParams;
        // Разрешено если значение === true или === 1
        // Также разрешено если значение не определено (для совместимости со старыми версиями)
        const enabled = val === true || val === 1 || val === undefined;
        const explicitlyDisabled = val === false || val === 0;

        // Заблокировать кнопку "Apply" (учитываем и httpEnabledSetParams, и control token)
        const saveBtn = this.getEl(`${prefix}-params-save-${this.objectName}`);
        if (saveBtn) {
            const blocked = explicitlyDisabled || !canControl();
            saveBtn.disabled = blocked;
            if (explicitlyDisabled) {
                saveBtn.title = 'Parameter modification disabled';
            } else if (!canControl()) {
                saveBtn.title = 'Read-only mode - take control first';
            } else {
                saveBtn.title = '';
            }
        }

        // Заблокировать все input в таблице параметров
        const paramsTable = this.getEl(`${prefix}-params-${this.objectName}`);
        if (paramsTable) {
            const inputs = paramsTable.querySelectorAll('input, select');
            inputs.forEach(input => {
                input.disabled = explicitlyDisabled || !canControl();
            });
        }

        // Обновить индикатор в шапке (если есть)
        const indParams = this.getEl(`${prefix}-ind-params-${this.objectName}`);
        if (indParams) {
            indParams.className = `header-indicator-dot ${enabled ? 'ok' : 'fail'}`;
            indParams.title = enabled ? 'Parameters: Yes' : 'Parameters: No';
        }

        // Показать предупреждение только если явно запрещено
        this.setNote(`${prefix}-params-note-${this.objectName}`,
            explicitlyDisabled ? 'Parameter modification disabled (httpEnabledSetParams=false)' : '',
            explicitlyDisabled);
    }
};

/**
 * Миксин для загрузки/сохранения параметров объекта через API
 * Требует: this.paramsApiPath ('modbus' или 'opcua'), this.paramsPrefix ('mb', 'mbs', 'opcua', 'opcuasrv'),
 *          this.paramNames (массив имён), this.renderParams() (метод рендеринга)
 */
const ParamsManagerMixin = {
    // Загрузка параметров с сервера
    async loadParams() {
        try {
            const query = this.paramNames.map(n => `name=${encodeURIComponent(n)}`).join('&');
            const data = await this.fetchJSON(
                `/api/objects/${encodeURIComponent(this.objectName)}/${this.paramsApiPath}/params?${query}`
            );
            this.params = data.params || {};
            this.renderParams();
            this.updateParamsAccessibility(this.paramsPrefix);
            this.setNote(`${this.paramsPrefix}-params-note-${this.objectName}`, '');
        } catch (err) {
            this.setNote(`${this.paramsPrefix}-params-note-${this.objectName}`, err.message, true);
        }
    },

    // Сохранение изменённых параметров на сервер
    async saveParams() {
        // Контейнер: ${prefix}-params-${obj} или ${prefix}-params-writable-${obj} (OPCUA Exchange)
        const container = this.getEl(`${this.paramsPrefix}-params-${this.objectName}`)
            || this.getEl(`${this.paramsPrefix}-params-writable-${this.objectName}`);
        if (!container) return;

        const changed = {};

        // Текстовые и числовые inputs
        container.querySelectorAll('input[data-param], input[data-name]').forEach(input => {
            if (input.type === 'checkbox') return;
            const name = input.dataset.param || input.dataset.name;
            const val = input.value.trim();
            if (val === '') return;
            if (String(this.params[name]) !== val) {
                changed[name] = val;
            }
        });

        // Selects (exchangeMode и др.)
        container.querySelectorAll('select[data-param], select[data-name]').forEach(select => {
            const name = select.dataset.param || select.dataset.name;
            const newValue = parseInt(select.value);
            if (this.params[name] !== newValue) {
                changed[name] = newValue;
            }
        });

        // Чекбоксы (writeToAllChannels и др.)
        container.querySelectorAll('input[type="checkbox"][data-param], input[type="checkbox"][data-name]').forEach(cb => {
            const name = cb.dataset.param || cb.dataset.name;
            const newValue = cb.checked ? 1 : 0;
            if (this.params[name] !== newValue) {
                changed[name] = newValue;
            }
        });

        if (Object.keys(changed).length === 0) {
            this.setNote(`${this.paramsPrefix}-params-note-${this.objectName}`, 'No changes');
            return;
        }

        try {
            const data = await this.fetchJSON(
                `/api/objects/${encodeURIComponent(this.objectName)}/${this.paramsApiPath}/params`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ params: changed })
                }
            );
            this.params = { ...this.params, ...(data.updated || {}) };
            this.renderParams();
            this.setNote(`${this.paramsPrefix}-params-note-${this.objectName}`, 'Parameters applied');
            this.loadStatus();
        } catch (err) {
            this.setNote(`${this.paramsPrefix}-params-note-${this.objectName}`, err.message, true);
        }
    },

    // Подключение кнопок Refresh и Apply
    setupParamsListeners() {
        const refreshBtn = this.getEl(`${this.paramsPrefix}-params-refresh-${this.objectName}`);
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.loadParams());
        }
        const saveBtn = this.getEl(`${this.paramsPrefix}-params-save-${this.objectName}`);
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveParams());
        }
    }
};

/**
 * Миксин для отображения счётчика загруженных/всего элементов
 * Показывает "loaded / total" или просто "total" когда всё загружено
 */
const ItemCounterMixin = {
    /**
     * Обновляет счётчик элементов
     * @param {string} elementId - ID элемента счётчика
     * @param {number} loaded - Количество загруженных элементов
     * @param {number} total - Общее количество элементов
     */
    updateItemCount(elementId, loaded, total) {
        const countEl = this.getEl(elementId);
        if (countEl) {
            countEl.textContent = loaded === total ? `${total}` : `${loaded} / ${total}`;
        }
    }
};

const PinManagementMixin = {
    /**
     * Получает закрепленные элементы (датчики/регистры)
     * @param {string} storageKey - Ключ в localStorage
     * @returns {Set<string>}
     */
    getPinnedItems(storageKey) {
        try {
            const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
            return new Set(saved[this.tabKey] || saved[this.objectName] || []);
        } catch (err) {
            return new Set();
        }
    },

    /**
     * Сохраняет закрепленные элементы
     * @param {string} storageKey - Ключ в localStorage
     * @param {Set<string>} pinnedSet - Множество ID закрепленных элементов
     */
    savePinnedItems(storageKey, pinnedSet) {
        try {
            const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
            saved[this.tabKey] = Array.from(pinnedSet);
            localStorage.setItem(storageKey, JSON.stringify(saved));
        } catch (err) {
            console.warn('Failed to save pinned items:', err);
        }
    },

    /**
     * Переключает закрепление элемента
     * @param {string} storageKey - Ключ в localStorage
     * @param {number|string} itemId - ID элемента
     * @param {Function} renderCallback - Callback для перерисовки
     */
    toggleItemPin(storageKey, itemId, renderCallback) {
        const pinned = this.getPinnedItems(storageKey);
        const idStr = String(itemId);

        if (pinned.has(idStr)) {
            pinned.delete(idStr);
        } else {
            pinned.add(idStr);
        }

        this.savePinnedItems(storageKey, pinned);
        if (renderCallback) {
            renderCallback.call(this);
        }
    },

    /**
     * Снимает закрепление со всех элементов
     * @param {string} storageKey - Ключ в localStorage
     * @param {Function} renderCallback - Callback для перерисовки
     */
    unpinAllItems(storageKey, renderCallback) {
        this.savePinnedItems(storageKey, new Set());
        if (renderCallback) {
            renderCallback.call(this);
        }
    },

    // Сокращённые методы, использующие this.pinStorageKey и this.renderAfterPinChange
    getPinned()    { return this.getPinnedItems(this.pinStorageKey); },
    togglePin(id)  { this.toggleItemPin(this.pinStorageKey, id, this.renderAfterPinChange); },
    unpinAll()     { this.unpinAllItems(this.pinStorageKey, this.renderAfterPinChange); }
};

/**
 * Миксин для сортировки таблиц по колонкам
 * Требует: sortColumnDefs - объект с описанием колонок
 */
const TableSortMixin = {
    /**
     * Инициализация свойств сортировки
     * Вызывать в конструкторе рендерера
     */
    initSortProps() {
        this.sortColumn = 'name';      // Текущая колонка сортировки
        this.sortDirection = 'asc';    // Направление: 'asc' | 'desc'
        this.sortStorageKey = null;    // Ключ для localStorage (устанавливается в loadSortState)
    },

    /**
     * Загрузка состояния сортировки из localStorage
     * @param {string} storageKey - Ключ в localStorage
     */
    loadSortState(storageKey) {
        this.sortStorageKey = storageKey;
        try {
            const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
            const sortState = saved[this.tabKey] || saved[this.objectName];
            if (sortState) {
                this.sortColumn = sortState.column || 'name';
                this.sortDirection = sortState.direction || 'asc';
            }
        } catch (err) {
            console.warn('Failed to load sort state:', err);
        }
    },

    /**
     * Сохранение состояния сортировки в localStorage
     */
    saveSortState() {
        if (!this.sortStorageKey) return;
        try {
            const saved = JSON.parse(localStorage.getItem(this.sortStorageKey) || '{}');
            saved[this.tabKey] = {
                column: this.sortColumn,
                direction: this.sortDirection
            };
            localStorage.setItem(this.sortStorageKey, JSON.stringify(saved));
        } catch (err) {
            console.warn('Failed to save sort state:', err);
        }
    },

    /**
     * Переключение сортировки по колонке
     * @param {string} column - Имя колонки
     */
    toggleSort(column) {
        if (this.sortColumn === column) {
            // Toggle direction
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = column;
            this.sortDirection = 'asc';
        }
        this.saveSortState();
        // Вызываем метод перерисовки (должен быть определён в рендерере)
        if (typeof this.renderAfterSort === 'function') {
            this.renderAfterSort();
        }
    },

    /**
     * Сортировка элементов с учётом закреплённых записей
     * @param {Array} items - Массив элементов для сортировки
     * @param {Set} pinnedSet - Множество ID закреплённых элементов
     * @param {Object} columnDefs - Определения колонок: { columnName: { field, type, accessor } }
     * @param {string} pinnedKey - Поле для проверки закреплённости (по умолчанию 'id')
     * @returns {Array} - Отсортированный массив
     */
    sortItems(items, pinnedSet, columnDefs, pinnedKey = 'id') {
        if (!items || items.length === 0) return items;

        const colDef = columnDefs[this.sortColumn];
        if (!colDef) return items;

        const { field, type = 'string', accessor } = colDef;

        // Функция получения значения
        const getValue = (item) => {
            if (accessor) return accessor(item);
            return item[field];
        };

        // Функция сравнения
        const compare = (a, b) => {
            let valA = getValue(a);
            let valB = getValue(b);

            // Обработка null/undefined
            if (valA == null && valB == null) return 0;
            if (valA == null) return 1;
            if (valB == null) return -1;

            // Сравнение по типу
            if (type === 'number') {
                valA = Number(valA) || 0;
                valB = Number(valB) || 0;
                return valA - valB;
            } else {
                // string comparison (case-insensitive)
                valA = String(valA).toLowerCase();
                valB = String(valB).toLowerCase();
                return valA.localeCompare(valB);
            }
        };

        // Разделяем на закреплённые и обычные
        const pinned = [];
        const unpinned = [];

        items.forEach(item => {
            const keyValue = String(item[pinnedKey]);
            if (pinnedSet && pinnedSet.has(keyValue)) {
                pinned.push(item);
            } else {
                unpinned.push(item);
            }
        });

        // Сортируем каждую группу
        const sortFn = this.sortDirection === 'asc' ? compare : (a, b) => -compare(a, b);
        pinned.sort(sortFn);
        unpinned.sort(sortFn);

        // Объединяем: закреплённые всегда вверху
        return [...pinned, ...unpinned];
    },

    /**
     * Рендеринг заголовка колонки с индикатором сортировки
     * @param {string} column - Имя колонки (ключ в sortColumnDefs)
     * @param {string} label - Отображаемый текст
     * @param {boolean} sortable - Можно ли сортировать по этой колонке
     * @param {string} className - Дополнительные CSS классы
     * @returns {string} HTML
     */
    renderSortableHeader(column, label, sortable = true, className = '') {
        if (!sortable) {
            return `<th class="${className}">${label}</th>`;
        }

        const isActive = this.sortColumn === column;
        const arrow = isActive ? (this.sortDirection === 'asc' ? ' ↑' : ' ↓') : '';
        const sortedClass = isActive ? 'th-sorted' : '';

        return `<th class="th-sortable ${sortedClass} ${className}" data-column="${column}">${label}<span class="sort-arrow">${arrow}</span></th>`;
    },

    /**
     * Привязка обработчиков сортировки к заголовкам таблицы
     * @param {HTMLElement} tableElement - Элемент таблицы или её контейнера
     */
    attachSortHandlers(tableElement) {
        if (!tableElement) return;

        const headers = tableElement.querySelectorAll('.th-sortable');
        headers.forEach(th => {
            // Удаляем старый обработчик если есть
            if (th._sortHandler) {
                th.removeEventListener('click', th._sortHandler);
            }

            const handler = () => {
                const column = th.dataset.column;
                if (column) {
                    this.toggleSort(column);
                }
            };

            th._sortHandler = handler;
            th.addEventListener('click', handler);
        });
    },

    /**
     * Обновление визуальных индикаторов сортировки
     * Требует: this.sortTableId — полный ID таблицы (задаётся в конструкторе рендерера)
     */
    updateSortHeaders() {
        const table = this.getEl(this.sortTableId);
        if (!table) return;
        table.querySelectorAll('th.th-sortable').forEach(th => {
            const column = th.dataset.column;
            th.classList.toggle('th-sorted', column === this.sortColumn);
            const arrow = th.querySelector('.sort-arrow');
            if (arrow) {
                if (column === this.sortColumn) {
                    arrow.textContent = this.sortDirection === 'asc' ? '↑' : '↓';
                } else {
                    arrow.textContent = '';
                }
            }
        });
    },

    /**
     * Перерисовка таблицы после смены сортировки
     * Требует: sortRenderVisible() — мост к render-методу рендерера
     */
    renderAfterSort() {
        this.sortRenderVisible();
        this.updateSortHeaders();
    }
};

/**
 * Миксин для батчевого рендеринга SSE-обновлений
 *
 * Контракт рендерера:
 *   - this.batchTbodyId  — ID элемента tbody (задаётся в конструкторе)
 *   - getBatchItems()     — возвращает backing-массив (this.allSensors / this.allRegisters)
 *   - updateRowCells(row, update) — обновление ячеек конкретной строки (renderer-specific)
 */
const BatchRenderMixin = {
    initBatchRenderProps() {
        this.pendingUpdates = [];
        this.renderScheduled = false;
    },

    /**
     * Общий SSE-обработчик: валидация, добавление в очередь, планирование RAF
     * @param {Array} items - Массив обновлений из SSE
     */
    handleBatchUpdates(items) {
        if (!Array.isArray(items) || items.length === 0) return;
        this.pendingUpdates.push(...items);
        if (!this.renderScheduled) {
            this.renderScheduled = true;
            requestAnimationFrame(() => this.batchRenderUpdates());
        }
    },

    /**
     * Общий batchRenderUpdates: drain → tbody → iterate rows → updateRowCells
     * Рендерер может переопределить если нужна нестандартная логика.
     */
    batchRenderUpdates() {
        const updateMap = this._drainPendingUpdates(this.getBatchItems());
        if (!updateMap) return;

        const tbody = this.getEl(this.batchTbodyId);
        if (!tbody) return;

        tbody.querySelectorAll('tr[data-sensor-id]').forEach(row => {
            const id = parseInt(row.dataset.sensorId);
            if (!id) return;

            const update = updateMap.get(id);
            if (!update) return;

            this.updateRowCells(row, update);
        });
    },

    /**
     * Утилита: обновить текст ячейки с CSS-анимацией при изменении
     * @param {HTMLElement} row - Строка таблицы
     * @param {string} selector - CSS-селектор ячейки
     * @param {string} newValue - Новое значение
     * @param {string} animationClass - CSS-класс для анимации
     */
    _animateCellValue(row, selector, newValue, animationClass) {
        const cell = row.querySelector(selector);
        if (!cell) return;
        if (cell.textContent !== newValue) {
            cell.textContent = newValue;
            cell.classList.remove(animationClass);
            void cell.offsetWidth;
            cell.classList.add(animationClass);
        }
    },

    /**
     * Слить очередь → обновить backing-массив → вернуть updateMap
     * @param {Array} items - Backing-массив (this.allSensors / this.allRegisters)
     * @returns {Map|null} updateMap или null если очередь пуста
     */
    _drainPendingUpdates(items) {
        this.renderScheduled = false;
        if (this.pendingUpdates.length === 0) return null;

        const updates = this.pendingUpdates;
        this.pendingUpdates = [];

        const updateMap = new Map();
        updates.forEach(item => updateMap.set(item.id, item));

        items.forEach((item, index) => {
            const update = updateMap.get(item.id);
            if (update) {
                items[index] = { ...item, ...update };
            }
        });

        return updateMap;
    }
};

const ModbusRegistersMixin = {
    async loadRegisterChunk(offset) {
        if (this.isLoadingChunk || !this.hasMore) return;
        this.isLoadingChunk = true;

        const prefix = this.paramsPrefix;
        const loadingEl = this.getEl(`${prefix}-loading-more-${this.objectName}`);
        if (loadingEl) loadingEl.style.display = 'block';

        try {
            let url = `/api/objects/${encodeURIComponent(this.objectName)}/modbus/registers?offset=${offset}&limit=${this.chunkSize}`;
            if (this.typeFilter && this.typeFilter !== 'all') {
                url += `&iotype=${encodeURIComponent(this.typeFilter)}`;
            }

            const data = await this.fetchJSON(url);
            const registers = data.registers || [];
            this.registersTotal = data.total || 0;

            // Merge devices dictionary
            if (data.devices) {
                Object.assign(this.devicesDict, data.devices);
            }

            if (offset === 0) {
                this.allRegisters = registers;
                this.registerMap.clear();
                registers.forEach(r => this.registerMap.set(r.id, r));

                // Если нет фильтра и есть закреплённые регистры - загрузить их отдельно
                if (!this.filter) {
                    await this.loadPinnedRegisters();
                }
            } else {
                this.allRegisters = this.allRegisters.concat(registers);
                registers.forEach(r => this.registerMap.set(r.id, r));
            }

            this.hasMore = this.allRegisters.length < this.registersTotal;
            this.renderRegisters();
            this.setNote(`${prefix}-registers-note-${this.objectName}`, '');

            this.updateItemCount(`${prefix}-register-count-${this.objectName}`, this.allRegisters.length, this.registersTotal);

            // Подписываемся на SSE обновления после загрузки
            this.subscribeToSSE();

            // Обработчики сортировки (только при первой загрузке)
            if (offset === 0) {
                const table = this.getEl(`${prefix}-registers-table-${this.objectName}`);
                if (table) {
                    this.attachSortHandlers(table);
                    this.updateSortHeaders();
                }
            }
        } catch (err) {
            this.setNote(`${prefix}-registers-note-${this.objectName}`, err.message, true);
        } finally {
            this.isLoadingChunk = false;
            if (loadingEl) loadingEl.style.display = 'none';
        }
    },

    // Загружает закреплённые регистры, если они не в текущем списке
    async loadPinnedRegisters() {
        const pinnedIds = this.getPinned();
        if (pinnedIds.size === 0) return;

        // Найти ID, которых нет в загруженных регистрах
        const missingIds = [];
        for (const idStr of pinnedIds) {
            const id = parseInt(idStr);
            if (!this.registerMap.has(id)) {
                missingIds.push(id);
            }
        }

        if (missingIds.length === 0) return;

        // Загрузить отсутствующие регистры по ID
        try {
            const idsParam = missingIds.join(',');
            const url = `/api/objects/${encodeURIComponent(this.objectName)}/modbus/get?filter=${idsParam}`;
            const response = await this.fetchJSON(url);
            const pinnedRegisters = response.registers || [];

            // Добавить закреплённые регистры в начало списка
            for (const reg of pinnedRegisters) {
                if (!this.registerMap.has(reg.id)) {
                    this.allRegisters.unshift(reg);
                    this.registerMap.set(reg.id, reg);
                }
            }
        } catch (err) {
            console.warn('Failed to load pinned registers:', err);
        }
    }
};

// Функция для применения миксина к классу
function applyMixin(targetClass, mixin) {
    Object.getOwnPropertyNames(mixin).forEach(name => {
        if (name !== 'constructor') {
            Object.defineProperty(
                targetClass.prototype,
                name,
                Object.getOwnPropertyDescriptor(mixin, name)
            );
        }
    });
}

// ============================================================================

// Базовый класс рендерера (общий функционал)
class BaseObjectRenderer {
    constructor(objectName, tabKey = null) {
        this.objectName = objectName;
        this.tabKey = tabKey || objectName; // tabKey для доступа к state.tabs

        // Префикс для ID элементов статуса (для updateStatusTimestamp)
        const typeName = this.constructor.getTypeName().toLowerCase();
        this.statusLastIdPrefix = `${typeName}-status-last`;

        // Timestamp последнего обновления статуса (для относительного времени)
        this.statusLastUpdate = null;
        this.statusDisplayTimer = null;

        // Показывать ли кнопку "+ Sensor" в секции Charts
        this.showAddSensorButton = true;
    }

    // Найти элемент по ID внутри панели своей вкладки
    getEl(id) {
        return getElementInTab(this.tabKey, id);
    }

    // Найти все элементы по CSS-селектору внутри панели своей вкладки
    getEls(selector) {
        return getElementsInTab(this.tabKey, selector);
    }

    // Получить тип объекта (для отображения)
    static getTypeName() {
        return 'Object';
    }

    // Создать HTML-структуру панели
    createPanelHTML() {
        return `
            <div class="tab-panel-loading">Loading...</div>
        `;
    }

    // Инициализация после создания DOM
    initialize() {
        // Переопределяется в наследниках
    }

    // Обновить данные (default: renderObjectInfo + updateChartLegends + handleLogServer)
    // Переопределяется в наследниках с уникальной логикой
    update(data) {
        renderObjectInfo(this.tabKey, data.object);
        updateChartLegends(this.tabKey, data);
        this.handleLogServer(data.LogServer);
    }

    // Очистка при закрытии
    destroy() {
        this.stopStatusAutoRefresh();
        this.stopStatusDisplayTimer();
    }

    // Форматирование относительного времени
    formatTimeAgo(timestamp) {
        if (!timestamp) return '';
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < TIME_AGO_MIN_SECONDS) return '';
        if (seconds < TIME_AGO_MINUTES_THRESHOLD) return `Updated ${seconds}s ago`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `Updated ${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        return `Updated ${hours}h ago`;
    }

    // Запуск таймера обновления отображения относительного времени
    startStatusDisplayTimer() {
        this.stopStatusDisplayTimer();
        this.statusDisplayTimer = setInterval(() => this.updateStatusDisplay(), STATUS_DISPLAY_UPDATE_INTERVAL);
    }

    // Остановка таймера обновления отображения
    stopStatusDisplayTimer() {
        if (this.statusDisplayTimer) {
            clearInterval(this.statusDisplayTimer);
            this.statusDisplayTimer = null;
        }
    }

    // Обновить отображение относительного времени
    updateStatusDisplay() {
        const el = this.getEl(`${this.statusLastIdPrefix}-${this.objectName}`);
        if (!el) return;
        el.textContent = this.formatTimeAgo(this.statusLastUpdate);
    }

    // --- Методы для автообновления статуса ---

    // Создать HTML для отображения времени последнего обновления статуса
    // Используется в headerExtra секций статуса
    createStatusHeaderExtra() {
        return `<span class="status-last" id="${this.statusLastIdPrefix}-${this.objectName}"></span>`;
    }

    // Инициализация автообновления статуса
    // Использует глобальный интервал state.sse.pollInterval
    initStatusAutoRefresh() {
        // Проверяем есть ли метод loadStatus у рендерера
        if (typeof this.loadStatus !== 'function') return;
        this.startStatusAutoRefresh();
        this.startStatusDisplayTimer();
    }

    // Вспомогательные методы для создания секций
    createCollapsibleSection(id, title, content, options = {}) {
        const { badge = false, hidden = false, headerExtra = '' } = options;
        const badgeHtml = badge ? `<span class="io-section-badge" id="${id}-count-${this.objectName}">0</span>` : '';
        const style = hidden ? 'style="display:none"' : '';
        const sectionId = options.sectionId || `${id}-section-${this.objectName}`;

        return `
            <div class="collapsible-section reorderable-section" data-section="${id}-${this.objectName}" data-section-id="${id}" id="${sectionId}" ${style}>
                <div class="collapsible-header" onclick="toggleSection('${id}-${this.objectName}')">
                    <svg class="collapsible-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M6 9l6 6 6-6"/>
                    </svg>
                    <span class="collapsible-title">${title}</span>
                    ${badgeHtml}
                    ${headerExtra}
                    <div class="section-reorder-buttons" onclick="event.stopPropagation()">
                        <button class="section-move-btn section-move-up" onclick="moveSectionUp('${this.tabKey}', '${id}')" title="Move up">↑</button>
                        <button class="section-move-btn section-move-down" onclick="moveSectionDown('${this.tabKey}', '${id}')" title="Move down">↓</button>
                    </div>
                </div>
                <div class="collapsible-content" id="section-${id}-${this.objectName}">
                    ${content}
                </div>
            </div>
        `;
    }

    createChartsSection() {
        return `
            <div class="collapsible-section reorderable-section" data-section="charts-${this.objectName}" data-section-id="charts" id="charts-section-${this.objectName}">
                <div class="collapsible-header" onclick="toggleSection('charts-${this.objectName}')">
                    <svg class="collapsible-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M6 9l6 6 6-6"/>
                    </svg>
                    <span class="collapsible-title">Charts</span>
                    ${this.showAddSensorButton ? `<button class="add-sensor-btn" id="add-sensor-btn-${this.objectName}"
                            onclick="event.stopPropagation(); openSensorDialog('${this.tabKey}')"
                            ${!state.capabilities.smEnabled ? 'disabled title="SM not connected (-sm-url not set)"' : ''}>+ Sensor</button>` : ''}
                    <div class="charts-time-range" onclick="event.stopPropagation()">
                        <div class="time-range-selector">
                            <button class="time-range-btn${state.timeRange === 60 ? ' active' : ''}" onclick="setTimeRange(60)">1m</button>
                            <button class="time-range-btn${state.timeRange === 180 ? ' active' : ''}" onclick="setTimeRange(180)">3m</button>
                            <button class="time-range-btn${state.timeRange === 300 ? ' active' : ''}" onclick="setTimeRange(300)">5m</button>
                            <button class="time-range-btn${state.timeRange === 900 ? ' active' : ''}" onclick="setTimeRange(900)">15m</button>
                            <button class="time-range-btn${state.timeRange === 3600 ? ' active' : ''}" onclick="setTimeRange(3600)">1h</button>
                            <button class="time-range-btn${state.timeRange === 10800 ? ' active' : ''}" onclick="setTimeRange(10800)">3h</button>
                        </div>
                    </div>
                    <div class="section-reorder-buttons" onclick="event.stopPropagation()">
                        <button class="section-move-btn section-move-up" onclick="moveSectionUp('${this.tabKey}', 'charts')" title="Move up">↑</button>
                        <button class="section-move-btn section-move-down" onclick="moveSectionDown('${this.tabKey}', 'charts')" title="Move down">↓</button>
                    </div>
                </div>
                <div class="collapsible-content" id="section-charts-${this.objectName}">
                    <div class="charts-container" id="charts-container-${this.objectName}">
                        <div id="charts-${this.objectName}" class="charts-grid"></div>
                    </div>
                    <div class="charts-resize-handle" id="charts-resize-${this.objectName}"></div>
                </div>
            </div>
        `;
    }

    createIOTimersSection() {
        return `
            <div class="collapsible-section io-timers-section reorderable-section" data-section="io-timers-${this.objectName}" data-section-id="io-timers" id="io-timers-section-${this.objectName}">
                <div class="collapsible-header" onclick="toggleSection('io-timers-${this.objectName}')">
                    <svg class="collapsible-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M6 9l6 6 6-6"/>
                    </svg>
                    <span class="collapsible-title">I/O</span>
                    <div class="io-filter-wrapper" onclick="event.stopPropagation()">
                        <input type="text" class="io-filter-input io-filter-global" id="io-filter-global-${this.objectName}"
                               placeholder="Filter..." data-object="${this.objectName}">
                    </div>
                    <label class="io-sequential-toggle" onclick="event.stopPropagation()">
                        <input type="checkbox" id="io-sequential-${this.objectName}" onchange="toggleIOLayout('${this.tabKey}', '${this.objectName}')">
                        <span>Sequential</span>
                    </label>
                    <div class="section-reorder-buttons" onclick="event.stopPropagation()">
                        <button class="section-move-btn section-move-up" onclick="moveSectionUp('${this.tabKey}', 'io-timers')" title="Move up">↑</button>
                        <button class="section-move-btn section-move-down" onclick="moveSectionDown('${this.tabKey}', 'io-timers')" title="Move down">↓</button>
                    </div>
                </div>
                <div class="collapsible-content" id="section-io-timers-${this.objectName}">
                    <div class="io-grid io-grid-3" id="io-grid-${this.objectName}">
                        ${this.createIOSection('inputs', 'Inputs')}
                        ${this.createIOSection('outputs', 'Outputs')}
                        ${this.createTimersSection()}
                    </div>
                </div>
            </div>
        `;
    }

    createIOSection(type, title) {
        const typeLower = type.toLowerCase();
        return `
            <div class="io-section" id="${typeLower}-section-${this.objectName}" data-section="${typeLower}-${this.objectName}">
                <div class="io-table-container" id="io-container-${typeLower}-${this.objectName}">
                    <table class="variables-table io-table io-table-io">
                        <thead>
                            <tr>
                                <th class="io-pin-col">
                                    <span class="io-unpin-all" id="io-unpin-${typeLower}-${this.objectName}" title="Unpin all" style="display:none">✕</span>
                                </th>
                                <th class="io-section-title io-section-toggle" data-section="${typeLower}-${this.objectName}">
                                    <svg class="io-collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M6 9l6 6 6-6"/>
                                    </svg>
                                    ${title} <span class="io-section-badge" id="${typeLower}-count-${this.objectName}">0</span>
                                </th>
                                <th class="io-spacer-col"></th>
                                <th>Type</th>
                                <th>ID</th>
                                <th>Name</th>
                                <th>Value</th>
                            </tr>
                        </thead>
                        <tbody id="${typeLower}-${this.objectName}"></tbody>
                    </table>
                </div>
                <div class="io-resize-handle" id="io-resize-${typeLower}-${this.objectName}"></div>
            </div>
        `;
    }

    createTimersSection() {
        return `
            <div class="io-section" id="timers-section-${this.objectName}" data-section="timers-${this.objectName}">
                <div class="io-table-container" id="io-container-timers-${this.objectName}">
                    <table class="variables-table io-table">
                        <thead>
                            <tr>
                                <th class="io-pin-col">
                                    <span class="io-unpin-all" id="io-unpin-timers-${this.objectName}" title="Unpin all" style="display:none">✕</span>
                                </th>
                                <th class="io-section-title io-section-toggle" data-section="timers-${this.objectName}">
                                    <svg class="io-collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M6 9l6 6 6-6"/>
                                    </svg>
                                    Timers <span class="io-section-badge" id="timers-count-${this.objectName}">0</span>
                                </th>
                                <th>Name</th>
                                <th>Interval</th>
                                <th>Remaining</th>
                                <th>Tick</th>
                            </tr>
                        </thead>
                        <tbody id="timers-${this.objectName}"></tbody>
                    </table>
                </div>
                <div class="io-resize-handle" id="io-resize-timers-${this.objectName}"></div>
            </div>
        `;
    }

    createVariablesSection() {
        return this.createCollapsibleSection('variables', 'Settings', `
            <table class="variables-table">
                <thead>
                    <tr>
                        <th colspan="2">
                            <input type="text"
                                   class="filter-input"
                                   id="filter-variables-${this.objectName}"
                                   placeholder="Filter by name..."
                                   data-object="${this.objectName}">
                        </th>
                        <th></th>
                    </tr>
                </thead>
                <tbody id="variables-${this.objectName}"></tbody>
            </table>
        `);
    }

    createLogServerSection() {
        return this.createCollapsibleSection('logserver', 'LogServer', `
            <table class="info-table">
                <tbody id="logserver-${this.objectName}"></tbody>
            </table>
        `, { hidden: true, sectionId: `logserver-section-${this.objectName}` });
    }

    createLogViewerSection() {
        // Контейнер для LogViewer - будет инициализирован позже
        // Обёртка reorderable-section для возможности перемещения
        return `<div class="reorderable-section logviewer-wrapper" data-section-id="logviewer" id="logviewer-wrapper-${this.objectName}">
            <div id="logviewer-container-${this.objectName}"></div>
        </div>`;
    }

    // Инициализация LogViewer (вызывается после создания DOM если LogServer доступен)
    initLogViewer(logServerData) {
        if (!logServerData || !logServerData.host) {
            return;
        }

        const container = this.getEl(`logviewer-container-${this.objectName}`);
        if (!container) return;

        // Создаём LogViewer только если его ещё нет
        if (!this.logViewer) {
            // Извлекаем serverId из tabKey (формат: serverId:objectName)
            const tabState = state.tabs.get(this.tabKey);
            const serverId = tabState ? tabState.serverId : null;
            this.logViewer = new LogViewer(this.objectName, container, serverId, this.tabKey);
            this.logViewer.restoreCollapsedState();
        }
    }

    // Уничтожение LogViewer
    destroyLogViewer() {
        if (this.logViewer) {
            this.logViewer.destroy();
            this.logViewer = null;
        }
    }

    // Общий метод для обработки LogServer (рендеринг секции + инициализация LogViewer)
    handleLogServer(logServerData) {
        renderLogServer(this.tabKey, logServerData);
        this.initLogViewer(logServerData);
    }

    // ========== Общие методы для работы с графиками ==========

    // Проверить, добавлен ли датчик на график
    isSensorOnChart(sensorName) {
        // Используем objectName (displayName) для localStorage - это имя объекта без serverId
        const addedSensors = getExternalSensorsFromStorage(this.objectName);
        return addedSensors.has(sensorName);
    }

    // Переключить датчик на графике (добавить/удалить)
    // sensor должен содержать: id, name, iotype (или type), value
    toggleSensorChart(sensor) {
        if (!sensor || !sensor.name) return;

        // Используем objectName (displayName) для localStorage
        const addedSensors = getExternalSensorsFromStorage(this.objectName);

        if (addedSensors.has(sensor.name)) {
            // Удаляем с графика
            removeExternalSensor(this.tabKey, sensor.name, this.getChartOptions());
        } else {
            // Добавляем на график
            const chartOptions = this.getChartOptions();
            const sensorForChart = {
                id: sensor.id,
                name: sensor.name,
                textname: sensor.textname || sensor.name,
                iotype: sensor.iotype || sensor.type,
                value: sensor.value,
                // Сохраняем опции графика для восстановления после перезагрузки
                chartOptions: chartOptions
            };

            // Добавляем в список внешних датчиков (сохраняем полные данные)
            addedSensors.set(sensor.name, sensorForChart);
            saveExternalSensorsToStorage(this.objectName, addedSensors);

            // Добавляем в state.sensorsByName если его там нет
            if (!state.sensorsByName.has(sensor.name)) {
                state.sensorsByName.set(sensor.name, sensorForChart);
                state.sensors.set(sensor.id, sensorForChart);
            }

            // Создаём график с опциями, специфичными для типа рендерера
            createExternalSensorChart(this.tabKey, sensorForChart, this.getChartOptions());

            // Подписываемся на обновления датчика
            this.subscribeToChartSensor(sensor.id);
        }
    }

    // Получить опции для создания графика
    // Переопределяется в наследниках для специфичных badge и prefix
    getChartOptions() {
        return { badge: 'SM', prefix: 'ext' };
    }

    // Подписаться на обновления датчика для графика
    // Переопределяется в наследниках для специфичных API
    subscribeToChartSensor(sensorId) {
        // По умолчанию используем IONC подписку
        subscribeToIONCSensor(this.tabKey, sensorId);
    }

    // Сгенерировать HTML для объединённой ячейки кнопок (Chart + Dashboard)
    renderAddButtonsCell(sensorId, sensorName, prefix = 'sensor', sensorLabel = null) {
        const isOnChart = this.isSensorOnChart(sensorName);
        const varName = `${prefix}-${sensorId}`;
        const checkboxId = `chart-${this.objectName}-${varName}`;
        const label = sensorLabel || sensorName;
        return `
            <td class="add-buttons-col">
                <span class="chart-toggle">
                    <input type="checkbox"
                           class="chart-checkbox chart-toggle-input"
                           id="${checkboxId}"
                           data-sensor-id="${sensorId}"
                           data-sensor-name="${escapeHtml(sensorName)}"
                           ${isOnChart ? 'checked' : ''}>
                    <label class="chart-toggle-label" for="${checkboxId}" title="Add to Chart">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 3v18h18"/>
                            <path d="M18 9l-5 5-4-4-3 3"/>
                        </svg>
                    </label>
                </span>
                <button class="dashboard-add-btn"
                        data-sensor-name="${escapeHtml(sensorName)}"
                        data-sensor-label="${escapeHtml(label)}"
                        title="Add to Dashboard">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="7" height="7" rx="1"/>
                        <rect x="14" y="3" width="7" height="7" rx="1"/>
                        <rect x="3" y="14" width="7" height="7" rx="1"/>
                        <rect x="14" y="14" width="7" height="7" rx="1"/>
                    </svg>
                </button>
            </td>
        `;
    }

    // Привязать обработчики событий для checkbox графиков
    // sensorMap - Map с данными датчиков по id
    attachChartToggleListeners(container, sensorMap) {
        if (!container) return;
        container.querySelectorAll('.chart-checkbox').forEach(cb => {
            cb.addEventListener('change', () => {
                const sensorId = parseInt(cb.dataset.sensorId, 10);
                const sensor = sensorMap.get(sensorId);
                if (sensor) {
                    this.toggleSensorChart(sensor);
                }
            });
        });
    }

    // Привязать обработчики для кнопок добавления на dashboard
    attachDashboardToggleListeners(container) {
        if (!container) return;
        container.querySelectorAll('.dashboard-add-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const sensorName = btn.dataset.sensorName;
                const sensorLabel = btn.dataset.sensorLabel;
                showAddToDashboardDialog(sensorName, sensorLabel);
            });
        });
    }

    createStatisticsSection() {
        return this.createCollapsibleSection('statistics', 'Statistics', `
            <div id="statistics-${this.objectName}"></div>
        `, { hidden: true, sectionId: `statistics-section-${this.objectName}` });
    }

    createObjectInfoSection() {
        return this.createCollapsibleSection('object', 'Object Information', `
            <table class="info-table">
                <tbody id="object-info-${this.objectName}"></tbody>
            </table>
        `);
    }

    // Построение URL с параметром server для multi-server режима
    buildUrl(path) {
        const tabState = state.tabs.get(this.tabKey);
        const serverId = tabState?.serverId;
        if (serverId) {
            return `${path}${path.includes('?') ? '&' : '?'}server=${encodeURIComponent(serverId)}`;
        }
        return path;
    }

    // Выполнить запрос и вернуть JSON
    async fetchJSON(path, options = {}) {
        const url = this.buildUrl(path);
        const response = await fetch(url, options);
        if (!response.ok) {
            const text = await response.text();
            throw new Error(text || `HTTP ${response.status}`);
        }
        return response.json();
    }

    // Set текст уведомления
    setNote(id, text, isError = false) {
        const el = this.getEl(id);
        if (!el) return;
        el.textContent = text || '';
        el.classList.toggle('note-error', !!(text && isError));
    }

    // Базовый resize handler для секций
    setupResize(containerSelector, handleSelector, storageKey, minHeight = 100, maxHeight = 800) {
        const panel = document.querySelector(`.tab-panel[data-name="${this.tabKey}"]`);
        const container = panel ? panel.querySelector(containerSelector) : document.querySelector(containerSelector);
        const handle = panel ? panel.querySelector(handleSelector) : document.querySelector(handleSelector);
        if (!container || !handle) return;

        let startY, startHeight;

        const onMouseMove = (e) => {
            const delta = e.clientY - startY;
            const newHeight = Math.min(maxHeight, Math.max(minHeight, startHeight + delta));
            container.style.height = `${newHeight}px`;
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            localStorage.setItem(storageKey, container.style.height);
        };

        handle.addEventListener('mousedown', (e) => {
            startY = e.clientY;
            startHeight = container.offsetHeight;
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            e.preventDefault();
        });

        // Восстановить из localStorage
        const savedHeight = localStorage.getItem(storageKey);
        if (savedHeight) {
            container.style.height = savedHeight;
        }
    }

    // --- Status auto-refresh (использует глобальный state.sse.pollInterval) ---

    startStatusAutoRefresh() {
        this.stopStatusAutoRefresh();
        const interval = state.sse.pollInterval || 5000;
        if (interval <= 0) return;
        this.statusTimer = setInterval(() => this.loadStatus(), interval);
    }

    stopStatusAutoRefresh() {
        if (this.statusTimer) {
            clearInterval(this.statusTimer);
            this.statusTimer = null;
        }
    }

    updateStatusTimestamp() {
        this.statusLastUpdate = Date.now();
        this.updateStatusDisplay();
    }
}

// Рендерер для UniSetManager (полный функционал)
