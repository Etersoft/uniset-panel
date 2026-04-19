// ============================================================================
// System Overview — orchestration: open/close tab, data fetch, init
// ============================================================================
// Public API (globals):
//   window.overviewInstances = { [serverId]: {graph, canvas, nodeMap, ...} }
//   openSystemOverview(serverId, serverName) -- entry point, called from sidebar
// ============================================================================

// Store active overview instances: serverId -> { graph, canvas, nodeMap, container }
// Exposed on window for debugging/testing
const overviewInstances = window.overviewInstances = {};

// ============================================================================
// openSystemOverview -- create or switch to overview tab
// ============================================================================

function openSystemOverview(serverId, serverName) {
    // Check LiteGraph availability
    if (typeof LiteGraph === 'undefined' || typeof LGraph === 'undefined' || typeof LGraphCanvas === 'undefined') {
        openOverviewErrorTab(serverId, serverName, 'LiteGraph.js not loaded. Cannot display System Overview.');
        return;
    }

    const tabKey = `${serverId}:overview`;

    // Switch to Objects view if on Dashboard
    if (dashboardManager && dashboardState.currentView !== 'objects') {
        dashboardManager.switchView('objects');
    }

    // If tab exists, just activate it
    if (state.tabs.has(tabKey)) {
        activateTab(tabKey);
        return;
    }

    // Create tab
    createOverviewTab(tabKey, serverId, serverName);
    activateTab(tabKey);

    // Fetch data and build graph
    fetchOverviewData(serverId, tabKey);
}

// ============================================================================
// Tab creation
// ============================================================================

function createOverviewTab(tabKey, serverId, serverName) {
    const tabsHeader = document.getElementById('tabs-header');
    const tabsContent = document.getElementById('tabs-content');

    const placeholder = tabsContent.querySelector('.placeholder');
    if (placeholder) placeholder.remove();

    // Tab button
    const tabBtn = document.createElement('button');
    tabBtn.className = 'tab-btn';
    tabBtn.dataset.name = tabKey;
    tabBtn.dataset.objectType = 'Overview';
    tabBtn.dataset.serverId = serverId;
    tabBtn.innerHTML = `
        <span class="tab-type-badge">Overview</span>
        <span class="tab-server-badge" data-server-id="${serverId}">${escapeHtml(serverName)}</span>
        System Overview
        <span class="close">&times;</span>
    `;
    tabBtn.addEventListener('click', (e) => {
        if (e.target.classList.contains('close')) {
            closeOverviewTab(tabKey, serverId);
        } else {
            activateTab(tabKey);
        }
    });
    tabsHeader.appendChild(tabBtn);

    // Tab panel with canvas
    const panel = document.createElement('div');
    panel.className = 'tab-panel';
    panel.dataset.name = tabKey;
    panel.dataset.objectType = 'Overview';
    panel.dataset.serverId = serverId;

    const canvasId = `overview-canvas-${serverId}`;
    panel.innerHTML = `
        <div class="overview-container">
            <div class="overview-toolbar">
                <button class="overview-fit-btn" title="Fit to Screen">&#x26F6;</button>
                <button class="overview-fit-btn overview-layout-btn" title="Auto-layout: minimize crossings">&#x2725;</button>
                <button class="overview-direction-btn" title="Toggle layout direction: Horizontal / Vertical"><span class="overview-dir-icon-h">▬</span><span class="overview-dir-icon-v" style="display:none">▮</span></button>
                <div class="overview-view-wrapper">
                    <button type="button" id="overview-view-btn-${serverId}" class="overview-view-btn" title="Toggle Values / Wires / Minimap">View ▾</button>
                    <div id="overview-view-menu-${serverId}" class="overview-view-menu hidden">
                        <label><input type="checkbox" data-toggle="values"/> Values</label>
                        <label><input type="checkbox" data-toggle="wires"/> Wires</label>
                        <label><input type="checkbox" data-toggle="minimap"/> Minimap</label>
                    </div>
                </div>
                <button type="button" id="overview-svg-export-${serverId}" class="overview-svg-export" title="Export overview as SVG">SVG</button>
            </div>
            <div class="overview-loading">Loading overview data...</div>
            <canvas id="${canvasId}"></canvas>
            <div id="overview-minimap-${serverId}" class="overview-minimap"></div>
            <div id="fb-status-panel-${serverId}" class="fb-status-panel"></div>
        </div>
    `;
    tabsContent.appendChild(panel);

    // Save tab state
    state.tabs.set(tabKey, {
        charts: new Map(),
        variables: {},
        objectType: 'Overview',
        renderer: null,
        updateInterval: null,
        displayName: 'System Overview',
        serverId: serverId,
        serverName: serverName
    });
}

function closeOverviewTab(tabKey, serverId) {
    // Cleanup overview instance
    const instance = overviewInstances[serverId];
    if (instance) {
        if (instance.resizeObserver) {
            instance.resizeObserver.disconnect();
        }
        if (instance.graph) {
            instance.graph.stop();
        }
        if (instance.hotkeyHandler) {
            document.removeEventListener('keydown', instance.hotkeyHandler);
        }
        // Detach Ctrl+wheel zoom listener (Task 9).
        if (instance.wheelZoomHandler && instance.canvas && instance.canvas.canvas) {
            instance.canvas.canvas.removeEventListener('wheel', instance.wheelZoomHandler);
        }
        // Nulling minimap causes the rAF redraw loop to short-circuit on
        // next tick (see initOverviewMinimap in 58-overview-navigation.js).
        if (instance.minimap) {
            instance.minimap = null;
        }
        delete overviewInstances[serverId];
    }

    // Notify listeners (e.g. Spec 4 detail panel) that this schema is gone.
    emitSchemaClosed(serverId);

    // Use standard closeTab (handles state.tabs, DOM, etc.)
    closeTab(tabKey);
}

function openOverviewErrorTab(serverId, serverName, message) {
    const tabKey = `${serverId}:overview`;

    if (dashboardManager && dashboardState.currentView !== 'objects') {
        dashboardManager.switchView('objects');
    }

    if (state.tabs.has(tabKey)) {
        activateTab(tabKey);
        return;
    }

    const tabsHeader = document.getElementById('tabs-header');
    const tabsContent = document.getElementById('tabs-content');

    const placeholder = tabsContent.querySelector('.placeholder');
    if (placeholder) placeholder.remove();

    const tabBtn = document.createElement('button');
    tabBtn.className = 'tab-btn';
    tabBtn.dataset.name = tabKey;
    tabBtn.dataset.objectType = 'Overview';
    tabBtn.innerHTML = `
        <span class="tab-type-badge">Overview</span>
        System Overview
        <span class="close">&times;</span>
    `;
    tabBtn.addEventListener('click', (e) => {
        if (e.target.classList.contains('close')) {
            closeTab(tabKey);
        } else {
            activateTab(tabKey);
        }
    });
    tabsHeader.appendChild(tabBtn);

    const panel = document.createElement('div');
    panel.className = 'tab-panel';
    panel.dataset.name = tabKey;
    panel.dataset.objectType = 'Overview';
    panel.innerHTML = `<div class="overview-container" style="display:flex;align-items:center;justify-content:center;">
        <div style="color:#f44336;font-size:16px;">${escapeHtml(message)}</div>
    </div>`;
    tabsContent.appendChild(panel);

    state.tabs.set(tabKey, {
        charts: new Map(),
        variables: {},
        objectType: 'Overview',
        renderer: null,
        updateInterval: null,
        displayName: 'System Overview',
        serverId: serverId,
        serverName: serverName
    });

    activateTab(tabKey);
}

// ============================================================================
// Fetch data and build graph
// ============================================================================

async function fetchOverviewData(serverId, tabKey) {
    try {
        const url = `/api/servers/${encodeURIComponent(serverId)}/overview`;
        const resp = await fetch(url);
        if (!resp.ok) {
            const errData = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
            showOverviewError(tabKey, serverId, errData.error || `HTTP ${resp.status}`);
            return;
        }

        const data = await resp.json();

        if ((!data.allNodes || data.allNodes.length === 0) && (!data.nodes || data.nodes.length === 0)) {
            showOverviewMessage(tabKey, serverId, 'No processes found for this server.');
            return;
        }

        initOverviewGraph(tabKey, serverId, data);
    } catch (err) {
        console.error('Failed to fetch overview data:', err);
        showOverviewError(tabKey, serverId, 'Failed to load overview data: ' + err.message);
    }
}

function showOverviewError(tabKey, serverId, message) {
    const panel = document.querySelector(`.tab-panel[data-name="${tabKey}"]`);
    if (!panel) return;
    const loading = panel.querySelector('.overview-loading');
    if (loading) {
        loading.textContent = message;
        loading.style.color = '#f44336';
    }
}

function showOverviewMessage(tabKey, serverId, message) {
    const panel = document.querySelector(`.tab-panel[data-name="${tabKey}"]`);
    if (!panel) return;
    const loading = panel.querySelector('.overview-loading');
    if (loading) {
        loading.textContent = message;
        loading.style.color = '#aaa';
    }
}

// ============================================================================
// Graph initialization
// ============================================================================

function initOverviewGraph(tabKey, serverId, data) {
    const panel = document.querySelector(`.tab-panel[data-name="${tabKey}"]`);
    if (!panel) return;

    const container = panel.querySelector('.overview-container');
    const canvasEl = panel.querySelector('canvas');
    const loading = panel.querySelector('.overview-loading');
    const fitBtn = panel.querySelector('.overview-fit-btn:not(.overview-layout-btn)');
    const layoutBtn = panel.querySelector('.overview-layout-btn');
    const dirBtn = panel.querySelector('.overview-direction-btn');

    if (!container || !canvasEl) return;

    // Hide loading
    if (loading) loading.style.display = 'none';

    // Calculate available height: tabs-content height minus tabs-header
    const tabsContent = document.getElementById('tabs-content');
    const tabsHeader = document.getElementById('tabs-header');
    const availableHeight = (tabsContent ? tabsContent.clientHeight : 600)
        - (tabsHeader ? tabsHeader.offsetHeight : 0);
    container.style.height = availableHeight + 'px';

    // Set canvas size to container
    canvasEl.width = container.clientWidth;
    canvasEl.height = availableHeight;

    // Increase vertical spacing between ports to fit value + connection labels
    LiteGraph.NODE_SLOT_HEIGHT = 48;

    // Create LiteGraph instances
    const graph = new LGraph();
    const lgCanvas = new LGraphCanvas(canvasEl, graph);

    // Configure canvas: dark background, read-only
    lgCanvas.clear_background_color = '#1a1a2e';
    lgCanvas.read_only = true;
    lgCanvas.allow_searchbox = false;
    lgCanvas.allow_interaction = true; // allow pan/zoom
    // Clamp native LiteGraph zoom to the same [OVERVIEW_SCALE_MIN,
    // OVERVIEW_SCALE_MAX] range used by Ctrl+wheel (navigation.js), so plain
    // wheel and Ctrl+wheel behave consistently. Defaults otherwise allow
    // zoom-out to 10x which is disorienting for the overview.
    if (typeof OVERVIEW_SCALE_MIN === 'number') lgCanvas.ds.min_scale = OVERVIEW_SCALE_MIN;
    if (typeof OVERVIEW_SCALE_MAX === 'number') lgCanvas.ds.max_scale = OVERVIEW_SCALE_MAX;
    lgCanvas.show_info = false; // hide debug info (FPS, node count, etc.)
    lgCanvas.render_canvas_border = false; // remove blue border around canvas
    lgCanvas.title_text_font = 'bold 14px sans-serif';
    lgCanvas.inner_text_font = '12px sans-serif';

    // LiteGraph draws native link lines by default. Task 13 made them the
    // primary visual at scale >= 0.5; port text-labels (below) render only
    // at mid-zoom [0.25, 0.5) for orientation.

    // Build graph from data
    const nodeMap = buildOverviewGraph(graph, data);

    // Populate text connection labels on each node
    populatePortConnections(nodeMap, data.edges || []);

    // Load saved direction from localStorage (default: horizontal)
    const dirLsKey = OVERVIEW_DIRECTION_LS_PREFIX + tabKey;
    let direction = 'horizontal';
    try {
        const saved = localStorage.getItem(dirLsKey);
        if (saved === 'vertical') direction = 'vertical';
    } catch (_) {}

    const getCanvasSize = () => ({ width: canvasEl.width, height: canvasEl.height });

    // Apply layout with direction
    applyOverviewLayout(nodeMap, data.edges || [], direction, getCanvasSize());

    // Start rendering
    graph.start();

    // Update direction button icon
    const updateDirBtnIcon = () => {
        if (!dirBtn) return;
        const iconH = dirBtn.querySelector('.overview-dir-icon-h');
        const iconV = dirBtn.querySelector('.overview-dir-icon-v');
        if (iconH) iconH.style.display = direction === 'horizontal' ? '' : 'none';
        if (iconV) iconV.style.display = direction === 'vertical' ? '' : 'none';
        dirBtn.title = direction === 'horizontal'
            ? 'Layout: Horizontal (click for Vertical)'
            : 'Layout: Vertical (click for Horizontal)';
    };
    updateDirBtnIcon();

    // Fit to screen after initial render
    setTimeout(() => {
        fitOverviewToScreen(lgCanvas, graph);
        if (typeof applyLOD === 'function') applyLOD(overviewInstances[serverId]);
    }, 100);

    // Fit button handler
    if (fitBtn) {
        fitBtn.addEventListener('click', () => {
            fitOverviewToScreen(lgCanvas, graph);
            if (typeof applyLOD === 'function') applyLOD(overviewInstances[serverId]);
        });
    }

    // Auto-layout button handler
    if (layoutBtn) {
        layoutBtn.addEventListener('click', () => {
            autoLayoutOverview(nodeMap, data.edges || [], direction, getCanvasSize());
            graph.setDirtyCanvas(true, true);
            setTimeout(() => {
                fitOverviewToScreen(lgCanvas, graph);
                if (typeof applyLOD === 'function') applyLOD(overviewInstances[serverId]);
            }, 50);
        });
    }

    // Direction toggle button handler
    if (dirBtn) {
        dirBtn.addEventListener('click', () => {
            direction = direction === 'horizontal' ? 'vertical' : 'horizontal';
            updateDirBtnIcon();
            try { localStorage.setItem(dirLsKey, direction); } catch (_) {}
            // Sync direction to instance for subsequent auto-layout calls
            const inst = overviewInstances[serverId];
            if (inst) inst.direction = direction;
            autoLayoutOverview(nodeMap, data.edges || [], direction, getCanvasSize());
            graph.setDirtyCanvas(true, true);
            setTimeout(() => {
                fitOverviewToScreen(lgCanvas, graph);
                if (typeof applyLOD === 'function') applyLOD(overviewInstances[serverId]);
            }, 50);
        });
    }

    // ResizeObserver on tabs-content to recalculate height
    const resizeTarget = tabsContent || container;
    const resizeObserver = new ResizeObserver(() => {
        const newHeight = (tabsContent ? tabsContent.clientHeight : 600)
            - (tabsHeader ? tabsHeader.offsetHeight : 0);
        container.style.height = newHeight + 'px';
        canvasEl.width = container.clientWidth;
        canvasEl.height = newHeight;
        lgCanvas.resize();
    });
    resizeObserver.observe(resizeTarget);

    // Store instance for SSE updates and cleanup
    overviewInstances[serverId] = {
        graph: graph,
        canvas: lgCanvas,
        nodeMap: nodeMap,
        container: container,
        resizeObserver: resizeObserver,
        allNodes: data.allNodes || [],
        data: data, // raw overview payload — highlight module reads .edges
        tabKey: tabKey,
        direction: direction,
        serverId: serverId
    };

    // Restore persisted view state (zoom, pan, toggles, etc.)
    // Actual apply of zoom/pan/toggles happens in later tasks (7-9, 14);
    // here we only load + attach the field so the state is available.
    overviewInstances[serverId].state = loadOverviewState(serverId);

    // Apply persisted toggle body-classes
    const _t = overviewInstances[serverId].state.toggles || {};
    document.body.classList.toggle('overview-no-values', _t.values === false);
    document.body.classList.toggle('overview-no-wires', _t.wires === false);

    // Minimap (Task 8): mount canvas + start redraw loop. Visibility driven
    // by body class `overview-minimap-hidden`; default hidden (minimap=false).
    if (typeof initOverviewMinimap === 'function') {
        initOverviewMinimap(overviewInstances[serverId]);
    }
    document.body.classList.toggle('overview-minimap-hidden', !_t.minimap);

    // Attach keyboard hotkeys (F/0/+/-/Home/V/W/M///Esc/?). Handler stored
    // for detach in closeOverviewTab.
    if (typeof attachOverviewHotkeys === 'function') {
        overviewInstances[serverId].hotkeyHandler = attachOverviewHotkeys(serverId);
    }

    // Ctrl+wheel zoom-around-cursor + initial LOD state (Task 9).
    if (typeof attachOverviewWheelZoom === 'function') {
        overviewInstances[serverId].wheelZoomHandler =
            attachOverviewWheelZoom(overviewInstances[serverId]);
    }
    if (typeof applyLOD === 'function') {
        applyLOD(overviewInstances[serverId]);
    }

    // Resolve serverName from tab state (captured in createOverviewTab).
    const tabInfo = state.tabs.get(tabKey);
    const serverName = tabInfo ? tabInfo.serverName : '';
    // Attach to instance so downstream modules (FB Status panel, Spec 4)
    // can emit events without re-reading state.tabs.
    overviewInstances[serverId].serverName = serverName;

    // Wire LGraphCanvas node-level callbacks to emit CustomEvents.
    // Callbacks are compose-safe: call any previously-assigned handler first,
    // so we don't clobber existing selection/drag behaviour.
    const prevOnNodeSelected = lgCanvas.onNodeSelected;
    lgCanvas.onNodeSelected = function(node) {
        if (prevOnNodeSelected) prevOnNodeSelected.call(this, node);
        if (!node) return;
        if (node.type !== 'uniset/process') return;
        const objectName = node.title || '';
        emitNodeClicked(serverId, serverName, objectName, node.id, null);
        // Task 10: click-to-highlight edges + dim non-neighbors. Defensive
        // typeof-guard so selection still works if highlight module absent.
        if (typeof applyOverviewHighlight === 'function') {
            applyOverviewHighlight(overviewInstances[serverId], node);
        }
    };

    const prevOnNodeDblClicked = lgCanvas.onNodeDblClicked;
    lgCanvas.onNodeDblClicked = function(node) {
        if (prevOnNodeDblClicked) prevOnNodeDblClicked.call(this, node);
        if (!node) return;
        if (node.type !== 'uniset/process') return;
        const objectName = node.title || '';
        emitNodeDoubleClicked(serverId, serverName, objectName, node.id);
    };

    // Notify listeners (e.g. Spec 4 detail panel) that the schema is ready.
    // nodeMap is a Map<name, LGraphNode>; names are the object names.
    emitSchemaOpened(serverId, serverName, Array.from(nodeMap.keys()));

    // Task 11: FB Status panel (per-server list with name/type filter).
    if (typeof initFBStatusPanel === 'function') {
        initFBStatusPanel(overviewInstances[serverId]);
    }

    // Task 14: View dropdown (Values/Wires/Minimap toggles) + SVG export.
    if (typeof initViewDropdown === 'function') {
        initViewDropdown(overviewInstances[serverId]);
    }
}

// ============================================================================
// Build graph from backend data
// ============================================================================

function buildOverviewGraph(graph, data) {
    const nodeMap = new Map(); // nodeName -> LGraphNode

    // Create nodes
    for (const nodeData of data.nodes) {
        const lgNode = LiteGraph.createNode('uniset/process');
        if (!lgNode) continue;

        lgNode.title = nodeData.name;
        lgNode.size[0] = OVERVIEW_NODE_WIDTH;

        // Add inputs
        if (nodeData.inputs) {
            for (const port of nodeData.inputs) {
                lgNode.addInput(port.name, 'sensor');
                lgNode.portValues[port.name] = port.value;
            }
        }

        // Add outputs
        if (nodeData.outputs) {
            for (const port of nodeData.outputs) {
                lgNode.addOutput(port.name, 'sensor');
                lgNode.portValues[port.name] = port.value;
            }
        }

        // Recalculate node height: add extra space for value labels below last port
        const maxPorts = Math.max(
            lgNode.inputs ? lgNode.inputs.length : 0,
            lgNode.outputs ? lgNode.outputs.length : 0
        );
        const slotHeight = LiteGraph.NODE_SLOT_HEIGHT;
        const titleHeight = LiteGraph.NODE_TITLE_HEIGHT || 30;
        lgNode.size[1] = titleHeight + maxPorts * slotHeight + 20; // 20px extra for bottom value

        graph.add(lgNode);
        // Force width after add (LiteGraph may auto-resize based on text)
        lgNode.size[0] = OVERVIEW_NODE_WIDTH;
        nodeMap.set(nodeData.name, lgNode);
    }

    // Create edges: actual LiteGraph links so the native renderer draws the lines.
    // Task 13: text-label fallback (in 58-overview-node.js) now only shows at
    // mid zoom — the primary rendering path is these links.
    if (data.edges) {
        for (const edge of data.edges) {
            const sourceNode = nodeMap.get(edge.fromNode);
            const targetNode = nodeMap.get(edge.toNode);
            if (!sourceNode || !targetNode) continue;

            const outputSlot = findSlotIndex(sourceNode.outputs, edge.fromPort);
            const inputSlot = findSlotIndex(targetNode.inputs, edge.toPort);

            if (outputSlot >= 0 && inputSlot >= 0) {
                try {
                    sourceNode.connect(outputSlot, targetNode, inputSlot);
                } catch (err) {
                    console.warn('[overview] link failed:', edge, err);
                }
            }
        }
    }

    return nodeMap;
}
