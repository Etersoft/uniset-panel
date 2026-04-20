// ============================================================================
// System Overview -- LiteGraph.js blueprint diagram of inter-process data flow
// ============================================================================

// UniSetProcessNode class + port-label helpers moved to 58-overview-node.js
// (formatOverviewPortValue, formatPortConnectionLabel, populatePortConnections)
//
// orchestration (overviewInstances, openSystemOverview, createOverviewTab,
// closeOverviewTab, openOverviewErrorTab, fetchOverviewData, showOverviewError,
// showOverviewMessage, initOverviewGraph, buildOverviewGraph) moved to
// 58-overview-core.js
//
// layout (findSlotIndex, applyOverviewLayout, autoLayoutOverview,
// orderLayersByBarycenter, positionOverviewNodes) moved to 58-overview-layout.js.
// Now autoLayoutOverview tries Sugiyama (dagre) first, falls back to H/V on
// dagre absence.

// ============================================================================
// Center viewport on the first (top-most) block at scale = 1.
// Used as the initial viewport for vertical layouts so the user starts at
// actual size with one or two blocks visible, then scrolls wheel to reveal
// subsequent blocks.
// ============================================================================

function centerOverviewOnFirstBlock(lgCanvas, nodeMap) {
    if (!lgCanvas || !lgCanvas.canvas || !nodeMap || nodeMap.size === 0) return;
    let topNode = null;
    for (const node of nodeMap.values()) {
        if (!topNode || node.pos[1] < topNode.pos[1]) topNode = node;
    }
    if (!topNode) return;
    const canvasEl = lgCanvas.canvas;
    const titleH = LiteGraph.NODE_TITLE_HEIGHT || 30;
    lgCanvas.ds.scale = 1;
    lgCanvas.ds.offset = [
        -topNode.pos[0] - topNode.size[0] / 2 + canvasEl.width / 2,
        -topNode.pos[1] + titleH + 24
    ];
    lgCanvas.setDirty(true, true);
}

// ============================================================================
// Fit to Screen
// ============================================================================

function fitOverviewToScreen(lgCanvas, graph) {
    const nodes = graph._nodes;
    if (!nodes || nodes.length === 0) return;

    // Compute bounding box (use OVERVIEW_NODE_WIDTH as minimum — LiteGraph may
    // report smaller size[0] while actually rendering wider due to port labels)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of nodes) {
        const nodeW = Math.max(node.size[0], OVERVIEW_NODE_WIDTH);
        minX = Math.min(minX, node.pos[0]);
        minY = Math.min(minY, node.pos[1]);
        maxX = Math.max(maxX, node.pos[0] + nodeW);
        maxY = Math.max(maxY, node.pos[1] + node.size[1]);
    }

    // Determine layout direction from the first overview instance
    const firstInst = Object.values(overviewInstances).find(i => i.graph === graph);
    const fitDirection = (firstInst && firstInst.direction) || 'horizontal';
    const fitIsVertical = fitDirection === 'vertical';

    // Check for routed links and expand bbox accordingly.
    // Max stagger: 10 levels * 12px = 120px, plus base offset.
    const links = graph.links || {};
    const maxStagger = 140; // 20 base + 120 max stagger

    if (fitIsVertical) {
        // Vertical mode: all forward links route to the right, backward to the left.
        let hasForward = false;
        let hasBackward = false;
        for (const link of Object.values(links)) {
            const src = nodes.find(n => n.id === link.origin_id);
            const dst = nodes.find(n => n.id === link.target_id);
            if (!src || !dst) continue;
            if (dst.pos[1] < src.pos[1] - 50) hasBackward = true;
            else hasForward = true;
            if (hasForward && hasBackward) break;
        }
        if (hasForward) maxX += maxStagger;
        if (hasBackward) minX -= maxStagger;
    } else {
        // Horizontal mode: backward above, forward multi-layer below.
        let hasRoutedAbove = false;
        let hasRoutedBelow = false;
        const threshold = OVERVIEW_NODE_WIDTH + OVERVIEW_MIN_LAYER_GAP;
        for (const link of Object.values(links)) {
            const src = nodes.find(n => n.id === link.origin_id);
            const dst = nodes.find(n => n.id === link.target_id);
            if (!src || !dst) continue;
            if (dst.pos[0] < src.pos[0] - 50) hasRoutedAbove = true;
            const dist = dst.pos[0] - src.pos[0];
            if (dist > threshold) {
                for (const n of nodes) {
                    if (n.id === src.id || n.id === dst.id) continue;
                    const nx = n.pos[0] + Math.max(n.size[0], OVERVIEW_NODE_WIDTH) / 2;
                    if (nx > src.pos[0] && nx < dst.pos[0]) {
                        hasRoutedBelow = true;
                        break;
                    }
                }
            }
            if (hasRoutedAbove && hasRoutedBelow) break;
        }
        if (hasRoutedAbove) minY -= 160;
        if (hasRoutedBelow) maxY += 160;
    }

    const graphWidth = maxX - minX;
    const graphHeight = maxY - minY;

    if (graphWidth <= 0 || graphHeight <= 0) return;

    const canvasWidth = lgCanvas.canvas.width;
    const canvasHeight = lgCanvas.canvas.height;

    const padding = OVERVIEW_FIT_PADDING;
    const scaleX = (canvasWidth - padding * 2) / graphWidth;
    const scaleY = (canvasHeight - padding * 2) / graphHeight;
    const scale = Math.min(scaleX, scaleY, 1); // don't zoom in beyond 1:1

    lgCanvas.ds.scale = scale;
    // Center the graph in canvas (offset is in screen coordinates)
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    lgCanvas.ds.offset[0] = canvasWidth / (2 * scale) - centerX;
    lgCanvas.ds.offset[1] = canvasHeight / (2 * scale) - centerY;
    lgCanvas.setDirty(true, true);
}

// ============================================================================
// SSE integration: update port values when object_data arrives
// ============================================================================

function updateOverviewFromSSE(serverId, objectName, ioData) {
    const instance = overviewInstances[serverId];
    if (!instance || !instance.nodeMap) return;

    const lgNode = instance.nodeMap.get(objectName);
    if (!lgNode) return;

    let changed = false;

    // Update input port values
    // ioData.in keys are internal (e.g. "in_raw_temp"), but portValues uses sensor name (e.g. "RawTemp_AI")
    if (ioData.in) {
        for (const ioVar of Object.values(ioData.in)) {
            const portName = ioVar.name;
            if (!portName) continue;
            const newValue = ioVar.value;
            if (lgNode.portValues[portName] !== newValue) {
                lgNode.prevValues[portName] = lgNode.portValues[portName];
                lgNode.portValues[portName] = newValue;
                triggerOverviewPulse(lgNode, portName);
                changed = true;
            }
        }
    }

    // Update output port values
    if (ioData.out) {
        for (const ioVar of Object.values(ioData.out)) {
            const portName = ioVar.name;
            if (!portName) continue;
            const newValue = ioVar.value;
            if (lgNode.portValues[portName] !== newValue) {
                lgNode.prevValues[portName] = lgNode.portValues[portName];
                lgNode.portValues[portName] = newValue;
                triggerOverviewPulse(lgNode, portName);
                changed = true;
            }
        }
    }

    if (changed) {
        if (instance.canvas) {
            instance.canvas.setDirty(true, true);
        }
    }
}

// Update link colors: active (non-zero source value) = green, inactive = gray.
// Links whose source port is pulsing get a bright highlight color.
function triggerOverviewPulse(lgNode, portName) {
    // Clear existing timer
    if (lgNode.pulseTimers[portName]) {
        clearTimeout(lgNode.pulseTimers[portName]);
    }

    // Set pulse flag (used in onDrawForeground and link color)
    lgNode.pulseTimers[portName] = setTimeout(() => {
        delete lgNode.pulseTimers[portName];
        // Repaint after pulse ends to restore normal colors
        if (lgNode.graph) {
            lgNode.graph.setDirtyCanvas(true, true);
        }
    }, OVERVIEW_PULSE_DURATION_MS);
}
