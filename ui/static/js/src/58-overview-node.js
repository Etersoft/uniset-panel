// ============================================================================
// System Overview — UniSetProcessNode (LiteGraph custom node type)
// ============================================================================
// Renders one process as a block with input/output ports showing live values
// (via portValues + pulse on change). Connection labels at port level.
// ============================================================================

// ============================================================================
// Custom LiteGraph Node Type: UniSetProcessNode
// ============================================================================

if (typeof LiteGraph !== 'undefined') {
    function UniSetProcessNode() {
        this.portValues = {};    // name -> value
        this.prevValues = {};    // name -> previous value (for pulse detection)
        this.pulseTimers = {};   // name -> timer id
        this.portConnections = {}; // name -> [nodeName, ...] (connected processes)
        // Node colors
        this.color = '#151d28';      // title bar background
        this.bgcolor = '#131320';    // body background
    }

    UniSetProcessNode.title = 'Process';
    UniSetProcessNode.title_color = '#1c2836'; // title bar fill color

    UniSetProcessNode.prototype.onDrawForeground = function(ctx) {
        // LOD: skip port-value / connection-label detail when zoomed out far.
        // Body class `overview-lod-min` is toggled by applyLOD() in
        // 58-overview-navigation.js when canvas scale < 0.25.
        if (typeof document !== 'undefined'
            && document.body
            && document.body.classList.contains('overview-lod-min')) {
            return;
        }

        // Task 10 highlight: dim non-neighbors via alpha, outline neighbors.
        // __hi / __dim are set by applyOverviewHighlight (58-overview-highlight.js).
        const wasAlpha = ctx.globalAlpha;
        if (this.__dim) {
            ctx.globalAlpha = 0.3;
        }

        // Task 13: port-connection TEXT labels only at mid zoom.
        //   scale >= 0.5  — LiteGraph native link lines are legible, no text needed.
        //   0.25 <= scale < 0.5 — lines get thin/noisy; show compact text labels for orientation.
        //   scale < 0.25  — Task 9 LOD-min already returned early above.
        const gc = this.graph && this.graph.list_of_graphcanvas && this.graph.list_of_graphcanvas[0];
        const scale = (gc && gc.ds && typeof gc.ds.scale === 'number') ? gc.ds.scale : 1;
        const showConnLabels = scale >= 0.25 && scale < 0.5;

        if (this.inputs || this.outputs) {
            const slotHeight = LiteGraph.NODE_SLOT_HEIGHT;
            const startY = this.constructor.slot_start_y || 0;
            const valueOffsetY = 14; // offset below port name baseline
            const linkLabelOffsetY = valueOffsetY + 11; // connection labels below value

            // Draw input port values + connection labels
            if (this.inputs) {
                for (let i = 0; i < this.inputs.length; i++) {
                    const input = this.inputs[i];
                    const value = this.portValues[input.name];
                    const isActive = value !== 0 && value !== null && value !== undefined;
                    const isPulsing = this.pulseTimers[input.name];

                    ctx.fillStyle = isActive ? OVERVIEW_ACTIVE_COLOR : OVERVIEW_INACTIVE_COLOR;
                    if (isPulsing) ctx.fillStyle = '#8BC34A';

                    ctx.font = '9px monospace';
                    const text = formatOverviewPortValue(value);
                    const y = startY + (i + 0.75) * slotHeight;
                    ctx.textAlign = 'left';
                    ctx.fillText(text, 18, y + valueOffsetY);

                    // Connection labels: "← Proc1, Proc2 +N" (only at mid zoom)
                    if (showConnLabels) {
                        const conns = this.portConnections[input.name];
                        if (conns && conns.length > 0) {
                            ctx.fillStyle = OVERVIEW_LINK_LABEL_COLOR;
                            ctx.font = '8px sans-serif';
                            ctx.fillText(formatPortConnectionLabel('←', conns), 18, y + linkLabelOffsetY);
                        }
                    }
                }
            }

            // Draw output port values + connection labels (right-aligned)
            if (this.outputs) {
                for (let i = 0; i < this.outputs.length; i++) {
                    const output = this.outputs[i];
                    const value = this.portValues[output.name];
                    const isActive = value !== 0 && value !== null && value !== undefined;
                    const isPulsing = this.pulseTimers[output.name];

                    ctx.fillStyle = isActive ? OVERVIEW_ACTIVE_COLOR : OVERVIEW_INACTIVE_COLOR;
                    if (isPulsing) ctx.fillStyle = '#8BC34A';

                    ctx.font = '9px monospace';
                    const text = formatOverviewPortValue(value);
                    const y = startY + (i + 0.75) * slotHeight;
                    ctx.textAlign = 'right';
                    ctx.fillText(text, this.size[0] - 18, y + valueOffsetY);

                    // Connection labels: "→ Proc1, Proc2 +N" (only at mid zoom)
                    if (showConnLabels) {
                        const conns = this.portConnections[output.name];
                        if (conns && conns.length > 0) {
                            ctx.fillStyle = OVERVIEW_LINK_LABEL_COLOR;
                            ctx.font = '8px sans-serif';
                            ctx.fillText(formatPortConnectionLabel('→', conns), this.size[0] - 18, y + linkLabelOffsetY);
                        }
                    }
                }
            }
        }

        // Restore alpha before drawing the hi outline — the outline stays at
        // full opacity regardless of dim state (but a node is never __hi and
        // __dim at the same time; see applyOverviewHighlight).
        if (this.__dim) {
            ctx.globalAlpha = wasAlpha;
        }

        // Highlighted neighbour outline (drawn on top of body + ports).
        if (this.__hi) {
            ctx.save();
            ctx.strokeStyle = '#f0b040';
            ctx.lineWidth = 2;
            ctx.strokeRect(0, 0, this.size[0], this.size[1]);
            ctx.restore();
        }
    };

    LiteGraph.registerNodeType('uniset/process', UniSetProcessNode);
}

// Format port value for display
function formatOverviewPortValue(value) {
    if (value === null || value === undefined) return '--';
    if (typeof value === 'number') {
        return Number.isInteger(value) ? String(value) : value.toFixed(2);
    }
    return String(value);
}

// Format connection label: "→ Proc1, Proc2 +3"
function formatPortConnectionLabel(arrow, names) {
    if (names.length <= OVERVIEW_MAX_LINK_LABELS) {
        return `${arrow} ${names.join(', ')}`;
    }
    const shown = names.slice(0, OVERVIEW_MAX_LINK_LABELS).join(', ');
    return `${arrow} ${shown} +${names.length - OVERVIEW_MAX_LINK_LABELS}`;
}

// Populate portConnections on all nodes from edge data
function populatePortConnections(nodeMap, edges) {
    // Clear existing connections
    for (const lgNode of nodeMap.values()) {
        lgNode.portConnections = {};
    }

    // For outputs: edge.fromNode's output port → edge.toNode consumes it
    // For inputs: edge.toNode's input port → edge.fromNode produces it
    for (const edge of edges) {
        const sourceNode = nodeMap.get(edge.fromNode);
        const targetNode = nodeMap.get(edge.toNode);

        if (sourceNode) {
            if (!sourceNode.portConnections[edge.fromPort]) {
                sourceNode.portConnections[edge.fromPort] = [];
            }
            if (!sourceNode.portConnections[edge.fromPort].includes(edge.toNode)) {
                sourceNode.portConnections[edge.fromPort].push(edge.toNode);
            }
        }

        if (targetNode) {
            if (!targetNode.portConnections[edge.toPort]) {
                targetNode.portConnections[edge.toPort] = [];
            }
            if (!targetNode.portConnections[edge.toPort].includes(edge.fromNode)) {
                targetNode.portConnections[edge.toPort].push(edge.fromNode);
            }
        }
    }
}
