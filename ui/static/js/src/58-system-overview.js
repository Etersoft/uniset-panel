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

// ============================================================================
// Graph mutation (add/remove nodes, rebuild edges) — used by SSE / live updates
// ============================================================================

function addOverviewNode(serverId, nodeData) {
    const instance = overviewInstances[serverId];
    if (!instance || !instance.graph) return;
    if (instance.nodeMap.has(nodeData.name)) return; // already exists

    const lgNode = LiteGraph.createNode('uniset/process');
    if (!lgNode) return;

    lgNode.title = nodeData.name;
    lgNode.size[0] = OVERVIEW_NODE_WIDTH;

    if (nodeData.inputs) {
        for (const port of nodeData.inputs) {
            lgNode.addInput(port.name, 'sensor');
            lgNode.portValues[port.name] = port.value;
        }
    }
    if (nodeData.outputs) {
        for (const port of nodeData.outputs) {
            lgNode.addOutput(port.name, 'sensor');
            lgNode.portValues[port.name] = port.value;
        }
    }

    const maxPorts = Math.max(
        lgNode.inputs ? lgNode.inputs.length : 0,
        lgNode.outputs ? lgNode.outputs.length : 0
    );
    const slotHeight = LiteGraph.NODE_SLOT_HEIGHT;
    const titleHeight = LiteGraph.NODE_TITLE_HEIGHT || 30;
    lgNode.size[1] = titleHeight + maxPorts * slotHeight + 20;

    instance.graph.add(lgNode);
    lgNode.size[0] = OVERVIEW_NODE_WIDTH;
    instance.nodeMap.set(nodeData.name, lgNode);
}

function removeOverviewNode(serverId, nodeName) {
    const instance = overviewInstances[serverId];
    if (!instance || !instance.graph) return;

    const lgNode = instance.nodeMap.get(nodeName);
    if (!lgNode) return;

    instance.graph.remove(lgNode);
    instance.nodeMap.delete(nodeName);
}

function rebuildOverviewEdges(serverId) {
    const instance = overviewInstances[serverId];
    if (!instance || !instance.graph) return;

    // Remove all existing links
    const graph = instance.graph;
    const linkIds = Object.keys(graph._links || {});
    for (const id of linkIds) {
        const link = graph._links[id];
        if (link) {
            const srcNode = graph.getNodeById(link.origin_id);
            if (srcNode) {
                srcNode.disconnectOutput(link.origin_slot);
            }
        }
    }

    // Recompute edges from visible nodes
    const visibleNodes = [];
    for (const [name, lgNode] of instance.nodeMap) {
        const inputs = (lgNode.inputs || []).map(p => ({ name: p.name, value: lgNode.portValues[p.name] }));
        const outputs = (lgNode.outputs || []).map(p => ({ name: p.name, value: lgNode.portValues[p.name] }));
        visibleNodes.push({ name, inputs, outputs });
    }

    const edges = computeOverviewEdgesClient(visibleNodes);

    // Reconnect
    for (const edge of edges) {
        const sourceNode = instance.nodeMap.get(edge.fromNode);
        const targetNode = instance.nodeMap.get(edge.toNode);
        if (!sourceNode || !targetNode) continue;

        const outputSlot = findSlotIndex(sourceNode.outputs, edge.fromPort);
        const inputSlot = findSlotIndex(targetNode.inputs, edge.toPort);
        if (outputSlot >= 0 && inputSlot >= 0) {
            sourceNode.connect(outputSlot, targetNode, inputSlot);
        }
    }

    // Update text connection labels
    const nodeMap = instance.nodeMap;
    populatePortConnections(nodeMap, edges);

    // Re-layout and fit
    const dir = instance.direction || 'horizontal';
    const canvasSize = { width: instance.canvas.canvas.width, height: instance.canvas.canvas.height };
    applyOverviewLayout(nodeMap, edges, dir, canvasSize);
    graph.setDirtyCanvas(true, true);
    setTimeout(() => fitOverviewToScreen(instance.canvas, graph), 50);
}

// Client-side edge computation (mirrors backend computeOverviewEdges)
function computeOverviewEdgesClient(nodes) {
    const outputIndex = new Map();
    for (const node of nodes) {
        for (const out of node.outputs) {
            if (!outputIndex.has(out.name)) outputIndex.set(out.name, []);
            outputIndex.get(out.name).push(node.name);
        }
    }

    const edges = [];
    for (const node of nodes) {
        for (const inp of node.inputs) {
            const sources = outputIndex.get(inp.name);
            if (!sources) continue;
            for (const srcName of sources) {
                if (srcName === node.name) continue;
                edges.push({
                    fromNode: srcName,
                    fromPort: inp.name,
                    toNode: node.name,
                    toPort: inp.name
                });
            }
        }
    }

    edges.sort((a, b) => {
        if (a.fromNode !== b.fromNode) return a.fromNode.localeCompare(b.fromNode);
        if (a.fromPort !== b.fromPort) return a.fromPort.localeCompare(b.fromPort);
        if (a.toNode !== b.toNode) return a.toNode.localeCompare(b.toNode);
        return a.toPort.localeCompare(b.toPort);
    });

    return edges;
}
