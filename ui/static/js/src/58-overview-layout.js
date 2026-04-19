// ============================================================================
// System Overview — graph layout (Sugiyama via dagre + fallback H/V)
// ============================================================================
// Public:
//   autoLayoutOverview(nodeMap, edges, direction, canvasSize)
//   applyOverviewLayout(nodeMap, edges, direction, canvasSize)
//   findSlotIndex(slots, portName)
// Sugiyama-specific:
//   computeSugiyamaPositions(nodes, edges, opts) -> {name: {x,y}} | null
//   autoOrientation(nodes, edges) -> 'LR' | 'TB'
// Internal helpers: orderLayersByBarycenter, positionOverviewNodes
// ============================================================================

function findSlotIndex(slots, portName) {
    if (!slots) return -1;
    for (let i = 0; i < slots.length; i++) {
        if (slots[i].name === portName) return i;
    }
    return -1;
}

// ============================================================================
// Layout: topological sort (Kahn's algorithm), left-to-right
// ============================================================================

function applyOverviewLayout(nodeMap, edges, direction, canvasSize) {
    const nodeNames = Array.from(nodeMap.keys());
    if (nodeNames.length === 0) return;

    // Build adjacency and in-degree
    const inDegree = new Map();
    const adjacency = new Map(); // node -> [node, ...]

    for (const name of nodeNames) {
        inDegree.set(name, 0);
        adjacency.set(name, []);
    }

    for (const edge of edges) {
        if (nodeMap.has(edge.fromNode) && nodeMap.has(edge.toNode)) {
            adjacency.get(edge.fromNode).push(edge.toNode);
            inDegree.set(edge.toNode, (inDegree.get(edge.toNode) || 0) + 1);
        }
    }

    // Kahn's algorithm
    const queue = [];
    const layers = new Map(); // nodeName -> layer index

    for (const [name, degree] of inDegree) {
        if (degree === 0) {
            queue.push(name);
            layers.set(name, 0);
        }
    }

    const sorted = [];
    while (queue.length > 0) {
        const current = queue.shift();
        sorted.push(current);

        for (const neighbor of adjacency.get(current)) {
            const newDegree = inDegree.get(neighbor) - 1;
            inDegree.set(neighbor, newDegree);
            if (newDegree === 0) {
                queue.push(neighbor);
                const currentLayer = layers.get(current) || 0;
                const existingLayer = layers.get(neighbor) || 0;
                layers.set(neighbor, Math.max(existingLayer, currentLayer + 1));
            }
        }
    }

    // Cycle fallback: if not all nodes processed, assign alphabetically
    if (sorted.length < nodeNames.length) {
        const unsorted = nodeNames.filter(n => !layers.has(n));
        unsorted.sort();
        let fallbackLayer = 0;
        for (const name of unsorted) {
            layers.set(name, fallbackLayer);
            fallbackLayer++;
        }
    }

    // Ensure layer assignment is maximized (longest path)
    // Re-compute layers using BFS from roots for correct depth
    for (const name of sorted) {
        for (const neighbor of adjacency.get(name)) {
            const currentLayer = layers.get(name) || 0;
            const neighborLayer = layers.get(neighbor) || 0;
            if (neighborLayer <= currentLayer) {
                layers.set(neighbor, currentLayer + 1);
            }
        }
    }

    // Group nodes by layer
    const layerGroups = new Map(); // layer -> [nodeName, ...]
    for (const [name, layer] of layers) {
        if (!layerGroups.has(layer)) {
            layerGroups.set(layer, []);
        }
        layerGroups.get(layer).push(name);
    }

    // Barycenter heuristic: order nodes within each layer to minimize crossings
    orderLayersByBarycenter(layerGroups, edges, nodeMap);

    // Position nodes
    positionOverviewNodes(layerGroups, nodeMap, direction, canvasSize);
}

// ============================================================================
// Sugiyama layout via dagre.js
// ============================================================================

// Sugiyama layout via dagre. Returns { [nodeName]: {x, y} } or null.
function computeSugiyamaPositions(nodes, edges, opts) {
    if (typeof dagre === 'undefined') {
        console.warn('[overview-layout] dagre.js not loaded, falling back to H layout');
        return null;
    }
    const g = new dagre.graphlib.Graph().setGraph({
        rankdir: (opts && opts.direction) || 'LR',
        nodesep: 40,
        ranksep: 80,
    });
    for (const n of nodes) {
        g.setNode(n.name, { width: (opts && opts.nodeWidth) || 220, height: (opts && opts.nodeHeight) || 140 });
    }
    for (const e of edges) {
        // Empty label {} is required — dagre.layout() dereferences
        // edge labels in updateInputGraph() and crashes on undefined.
        g.setEdge(e.fromNode, e.toNode, {});
    }
    dagre.layout(g);
    const positions = {};
    for (const name of g.nodes()) {
        const { x, y } = g.node(name);
        positions[name] = { x, y };
    }
    return positions;
}

// Auto-detect orientation based on edge density.
function autoOrientation(nodes, edges) {
    return edges.length > nodes.length ? 'LR' : 'TB';
}

// ============================================================================
// Auto-layout entry point: Sugiyama (dagre) preferred, H/V fallback
// ============================================================================

// direction accepted values:
//   'auto'                        -> derive via autoOrientation()
//   'H' or 'horizontal'           -> dagre 'LR', fallback 'horizontal'
//   'V' or 'vertical'             -> dagre 'TB', fallback 'vertical'
//   'LR' / 'RL' / 'TB' / 'BT'     -> passed through to dagre as-is
function autoLayoutOverview(nodeMap, edges, direction, canvasSize) {
    const nodeNames = Array.from(nodeMap.keys());
    if (nodeNames.length === 0) return;

    const nodesArr = nodeNames.map(name => ({ name }));

    let dagreDir;
    if (direction === 'auto') dagreDir = autoOrientation(nodesArr, edges);
    else if (direction === 'H' || direction === 'horizontal') dagreDir = 'LR';
    else if (direction === 'V' || direction === 'vertical') dagreDir = 'TB';
    else dagreDir = direction; // assume already 'LR'/'TB'/'BT'/'RL'

    const positions = computeSugiyamaPositions(nodesArr, edges, { direction: dagreDir });
    if (positions) {
        for (const name in positions) {
            const lgNode = nodeMap.get ? nodeMap.get(name) : nodeMap[name];
            if (lgNode && positions[name]) {
                lgNode.pos[0] = positions[name].x;
                lgNode.pos[1] = positions[name].y;
            }
        }
        return;
    }

    // Fallback: existing H/V logic with barycenter multi-pass ordering
    const fallbackDir = (dagreDir === 'LR' || dagreDir === 'RL') ? 'horizontal' : 'vertical';
    autoLayoutOverviewFallback(nodeMap, edges, fallbackDir, canvasSize);
}

// H/V fallback layout (previous implementation, preserved verbatim).
// Used when dagre is unavailable.
function autoLayoutOverviewFallback(nodeMap, edges, direction, canvasSize) {
    const nodeNames = Array.from(nodeMap.keys());
    if (nodeNames.length === 0) return;

    // Build adjacency and compute layers (same as applyOverviewLayout)
    const inDegree = new Map();
    const adjacency = new Map();

    for (const name of nodeNames) {
        inDegree.set(name, 0);
        adjacency.set(name, []);
    }

    for (const edge of edges) {
        if (nodeMap.has(edge.fromNode) && nodeMap.has(edge.toNode)) {
            adjacency.get(edge.fromNode).push(edge.toNode);
            inDegree.set(edge.toNode, (inDegree.get(edge.toNode) || 0) + 1);
        }
    }

    const queue = [];
    const layers = new Map();

    for (const [name, degree] of inDegree) {
        if (degree === 0) {
            queue.push(name);
            layers.set(name, 0);
        }
    }

    const sorted = [];
    while (queue.length > 0) {
        const current = queue.shift();
        sorted.push(current);
        for (const neighbor of adjacency.get(current)) {
            const newDegree = inDegree.get(neighbor) - 1;
            inDegree.set(neighbor, newDegree);
            if (newDegree === 0) {
                queue.push(neighbor);
                layers.set(neighbor, Math.max(layers.get(neighbor) || 0, (layers.get(current) || 0) + 1));
            }
        }
    }

    if (sorted.length < nodeNames.length) {
        const unsorted = nodeNames.filter(n => !layers.has(n));
        unsorted.sort();
        let fallbackLayer = 0;
        for (const name of unsorted) {
            layers.set(name, fallbackLayer++);
        }
    }

    for (const name of sorted) {
        for (const neighbor of adjacency.get(name)) {
            const cl = layers.get(name) || 0;
            const nl = layers.get(neighbor) || 0;
            if (nl <= cl) layers.set(neighbor, cl + 1);
        }
    }

    const layerGroups = new Map();
    for (const [name, layer] of layers) {
        if (!layerGroups.has(layer)) layerGroups.set(layer, []);
        layerGroups.get(layer).push(name);
    }

    // Multiple passes of barycenter ordering for better results
    for (let pass = 0; pass < 4; pass++) {
        orderLayersByBarycenter(layerGroups, edges, nodeMap);
    }

    positionOverviewNodes(layerGroups, nodeMap, direction, canvasSize);
}

// Barycenter heuristic: for each node in a layer, compute the average
// position of its neighbors in the adjacent layer, then sort by that value.
function orderLayersByBarycenter(layerGroups, edges, nodeMap) {
    const sortedLayers = Array.from(layerGroups.keys()).sort((a, b) => a - b);

    // Build reverse adjacency: toNode -> [fromNode, ...]
    const reverseAdj = new Map();
    const forwardAdj = new Map();
    for (const edge of edges) {
        if (!nodeMap.has(edge.fromNode) || !nodeMap.has(edge.toNode)) continue;
        if (!reverseAdj.has(edge.toNode)) reverseAdj.set(edge.toNode, []);
        reverseAdj.get(edge.toNode).push(edge.fromNode);
        if (!forwardAdj.has(edge.fromNode)) forwardAdj.set(edge.fromNode, []);
        forwardAdj.get(edge.fromNode).push(edge.toNode);
    }

    // Forward sweep: order each layer based on positions in previous layer
    for (let li = 1; li < sortedLayers.length; li++) {
        const prevLayer = layerGroups.get(sortedLayers[li - 1]);
        const currGroup = layerGroups.get(sortedLayers[li]);

        // Position index of each node in previous layer
        const prevPos = new Map();
        prevLayer.forEach((name, idx) => prevPos.set(name, idx));

        // Compute barycenter for each node in current layer
        const barycenters = new Map();
        for (const name of currGroup) {
            const neighbors = reverseAdj.get(name) || [];
            const positions = neighbors.filter(n => prevPos.has(n)).map(n => prevPos.get(n));
            if (positions.length > 0) {
                barycenters.set(name, positions.reduce((a, b) => a + b, 0) / positions.length);
            } else {
                barycenters.set(name, Infinity);
            }
        }

        currGroup.sort((a, b) => {
            const ba = barycenters.get(a);
            const bb = barycenters.get(b);
            if (ba !== bb) return ba - bb;
            return a.localeCompare(b);
        });
    }

    // Backward sweep: refine based on positions in next layer
    for (let li = sortedLayers.length - 2; li >= 0; li--) {
        const nextLayer = layerGroups.get(sortedLayers[li + 1]);
        const currGroup = layerGroups.get(sortedLayers[li]);

        const nextPos = new Map();
        nextLayer.forEach((name, idx) => nextPos.set(name, idx));

        const barycenters = new Map();
        for (const name of currGroup) {
            const neighbors = forwardAdj.get(name) || [];
            const positions = neighbors.filter(n => nextPos.has(n)).map(n => nextPos.get(n));
            if (positions.length > 0) {
                barycenters.set(name, positions.reduce((a, b) => a + b, 0) / positions.length);
            } else {
                barycenters.set(name, Infinity);
            }
        }

        currGroup.sort((a, b) => {
            const ba = barycenters.get(a);
            const bb = barycenters.get(b);
            if (ba !== bb) return ba - bb;
            return a.localeCompare(b);
        });
    }
}

// Position nodes on canvas based on layer groups.
// direction: 'horizontal' (left-to-right) or 'vertical' (top-to-bottom)
// canvasSize: { width, height } — used for adaptive spacing
function positionOverviewNodes(layerGroups, nodeMap, direction, canvasSize) {
    const isVertical = direction === 'vertical';
    const numLayers = layerGroups.size;
    if (numLayers === 0) return;

    // LiteGraph draws the title bar ABOVE pos[1], so effective node height
    // is size[1] + NODE_TITLE_HEIGHT. Account for this in spacing.
    const titleH = LiteGraph.NODE_TITLE_HEIGHT || 30;

    if (isVertical) {
        // Vertical: layers go top-to-bottom, nodes within layer go left-to-right
        const layerMaxHeights = new Map();
        const layerWidths = new Map();
        for (const [layer, group] of layerGroups) {
            let maxH = 0;
            let totalW = 0;
            for (const name of group) {
                const lgNode = nodeMap.get(name);
                if (lgNode) {
                    maxH = Math.max(maxH, lgNode.size[1] + titleH);
                    totalW += lgNode.size[0] + OVERVIEW_MIN_NODE_GAP;
                }
            }
            layerMaxHeights.set(layer, maxH);
            layerWidths.set(layer, totalW - OVERVIEW_MIN_NODE_GAP);
        }

        // Adaptive vertical spacing: fit layers into canvas height if possible
        const totalLayerHeights = Array.from(layerMaxHeights.values()).reduce((a, b) => a + b, 0);
        const availableGap = canvasSize.height - totalLayerHeights;
        const adaptiveGap = numLayers > 1 ? availableGap / (numLayers + 1) : 0;
        // Clamp gap: at least MIN_NODE_GAP, at most 80px (don't spread too far)
        const gapPerLayer = Math.max(OVERVIEW_MIN_NODE_GAP, Math.min(80, adaptiveGap));

        // Max width across all layers for centering
        const maxWidth = Math.max(...layerWidths.values(), 0);

        const sortedLayers = Array.from(layerGroups.keys()).sort((a, b) => a - b);
        let yOffset = 0;
        for (const layer of sortedLayers) {
            const group = layerGroups.get(layer);
            const totalWidth = layerWidths.get(layer) || 0;
            let xOffset = (maxWidth - totalWidth) / 2; // center horizontally
            for (const name of group) {
                const lgNode = nodeMap.get(name);
                if (lgNode) {
                    lgNode.pos[0] = xOffset;
                    lgNode.pos[1] = yOffset;
                    xOffset += lgNode.size[0] + OVERVIEW_MIN_NODE_GAP;
                }
            }
            yOffset += (layerMaxHeights.get(layer) || 0) + gapPerLayer;
        }
    } else {
        // Horizontal: layers go left-to-right, nodes within layer go top-to-bottom
        const layerHeights = new Map();
        const layerMaxWidths = new Map();
        for (const [layer, group] of layerGroups) {
            let h = 0;
            let maxW = 0;
            for (const name of group) {
                const lgNode = nodeMap.get(name);
                if (lgNode) {
                    h += (lgNode.size[1] + titleH) + OVERVIEW_MIN_NODE_GAP;
                    maxW = Math.max(maxW, lgNode.size[0]);
                }
            }
            layerHeights.set(layer, h - OVERVIEW_MIN_NODE_GAP);
            layerMaxWidths.set(layer, maxW);
        }

        // Adaptive horizontal spacing: fit layers into canvas width if possible
        const totalLayerWidths = Array.from(layerMaxWidths.values()).reduce((a, b) => a + b, 0);
        const availableGap = canvasSize.width - totalLayerWidths;
        const adaptiveGap = numLayers > 1 ? availableGap / (numLayers + 1) : 0;
        // Clamp: at least MIN_LAYER_GAP between node edges
        const gapPerLayer = Math.max(OVERVIEW_MIN_LAYER_GAP, adaptiveGap);

        const maxHeight = Math.max(...layerHeights.values(), 0);

        const sortedLayers = Array.from(layerGroups.keys()).sort((a, b) => a - b);
        let xOffset = 0;
        for (const layer of sortedLayers) {
            const group = layerGroups.get(layer);
            const totalHeight = layerHeights.get(layer) || 0;
            let yOff = (maxHeight - totalHeight) / 2;
            const layerW = layerMaxWidths.get(layer) || OVERVIEW_NODE_WIDTH;
            for (const name of group) {
                const lgNode = nodeMap.get(name);
                if (lgNode) {
                    lgNode.pos[0] = xOffset;
                    lgNode.pos[1] = yOff;
                    yOff += (lgNode.size[1] + titleH) + OVERVIEW_MIN_NODE_GAP;
                }
            }
            xOffset += layerW + gapPerLayer;
        }
    }
}
