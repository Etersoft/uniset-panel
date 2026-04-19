// ============================================================================
// System Overview — click-to-highlight edges + neighbors
// ============================================================================
// Public API (globals):
//   applyOverviewHighlight(inst, clickedNode) -- mark neighbors as __hi,
//       others as __dim; populate inst._hiEdges with "from->to" keys; set
//       inst._hiActive = true; request canvas redraw.
//   clearOverviewHighlight(inst)              -- clear flags, reset state,
//       request canvas redraw.
//
// Rendering: `58-overview-node.js` reads __hi / __dim on each node in
// onDrawForeground and applies outline / alpha accordingly.
//
// Edge double-click ("signal info tooltip") is deferred to Spec 4.
// ============================================================================

function applyOverviewHighlight(inst, clickedNode) {
    if (!inst || !clickedNode) return;
    const edges = (inst.data && inst.data.edges) || [];
    const neighbors = new Set();
    const hiEdges = new Set();
    const clickedTitle = clickedNode.title;

    for (const e of edges) {
        if (e.fromNode === clickedTitle || e.toNode === clickedTitle) {
            hiEdges.add(e.fromNode + '->' + e.toNode);
            neighbors.add(e.fromNode);
            neighbors.add(e.toNode);
        }
    }

    for (const n of inst.nodeMap.values()) {
        n.__hi = neighbors.has(n.title);
        n.__dim = !n.__hi && n.title !== clickedTitle;
    }
    inst._hiEdges = hiEdges;
    inst._hiActive = true;
    if (inst.canvas && typeof inst.canvas.setDirty === 'function') {
        inst.canvas.setDirty(true, true);
    }
}

function clearOverviewHighlight(inst) {
    if (!inst || !inst._hiActive) return;
    for (const n of inst.nodeMap.values()) {
        delete n.__hi;
        delete n.__dim;
    }
    inst._hiEdges = new Set();
    inst._hiActive = false;
    if (inst.canvas && typeof inst.canvas.setDirty === 'function') {
        inst.canvas.setDirty(true, true);
    }
}
