// ============================================================================
// Gauge Widget (SVG)
// ============================================================================

class GaugeWidget extends DashboardWidget {
    static type = 'gauge';
    static usesNewSensorAutocomplete = true;
    static displayName = 'Gauge';
    static description = 'Circular gauge with needle';
    static icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>';
    static defaultSize = { width: 8, height: 4 };
    static GEOMETRY = GaugeGeometry;
    static MAJOR_STEP_RULES = GAUGE_MAJOR_STEP_RULES;

    static toRadians(angle) {
        return GaugeGeometry.toRadians(angle);
    }

    static polarPoint(cx, cy, radius, angle) {
        return GaugeGeometry.polarPoint(cx, cy, radius, angle);
    }

    static isArc270Style(style) {
        return GaugeGeometry.isArc270Style(style);
    }

    static cssArcStartForStyle(style) {
        return GaugeGeometry.cssArcStartForStyle(style);
    }

    static cssArcSpanForStyle(style) {
        return GaugeGeometry.cssArcSpanForStyle(style);
    }

    static angleForPercent(style, percent) {
        return GaugeGeometry.angleForPercent(style, percent);
    }

    static percentFromAngle(style, angle) {
        return GaugeGeometry.percentFromAngle(style, angle);
    }

    static sectorParamsForStyle(style) {
        return GaugeGeometry.sectorParamsForStyle(style);
    }

    static layoutForStyle(style) {
        return GaugeGeometry.layoutForStyle(style);
    }

    render() {
        const { style = 'default' } = this.config;

        this.element = document.createElement('div');
        this.element.className = 'widget-content';

        switch (style) {
            case 'semicircle':
                this.renderClassic();
                break;
            case 'arc270':
                this.renderModern();
                break;
            case 'speedometer':
                this.renderSpeedometer();
                break;
            case 'dual':
                this.renderDualScale();
                break;
            default:
                this.renderDefault();
        }

        this.container.appendChild(this.element);
    }

    // === Default style (current design) ===
    renderDefault() {
        const { min = WIDGET_DEFAULT_MIN, max = WIDGET_DEFAULT_MAX, unit = '' } = this.config;

        this.element.innerHTML = `
            <svg class="gauge-svg" viewBox="0 0 100 60">
                <!-- Background arc -->
                <path class="gauge-background" d="M 10 50 A 40 40 0 0 1 90 50"/>
                <!-- Sector fill (0 to value) -->
                <path class="gauge-sector-fill" id="gauge-sector-${this.id}" style="display: none; opacity: 0.3;"/>
                <!-- Value arc -->
                <path class="gauge-value-arc" id="gauge-arc-${this.id}" d="M 10 50 A 40 40 0 0 1 90 50"/>
                <!-- Needle -->
                <g class="gauge-needle" id="gauge-needle-${this.id}" style="transform-origin: 50px 50px; transform: rotate(${GaugeWidget.cssArcStartForStyle('default')}deg)">
                    <polygon points="50,15 48,50 52,50"/>
                </g>
                <!-- Center -->
                <circle class="gauge-center" cx="50" cy="50" r="6"/>
                <!-- Value text -->
                <text class="gauge-value-text" x="50" y="42" id="gauge-value-${this.id}">0</text>
                <text class="gauge-unit-text" x="50" y="52">${escapeHtml(unit)}</text>
                <!-- Min/Max labels -->
                <text class="gauge-min-text" x="12" y="58">${min}</text>
                <text class="gauge-max-text" x="88" y="58" text-anchor="end">${max}</text>
            </svg>
        `;

        this.arcEl = this.element.querySelector(`#gauge-arc-${this.id}`);
        this.needleEl = this.element.querySelector(`#gauge-needle-${this.id}`);
        this.valueEl = this.element.querySelector(`#gauge-value-${this.id}`);
        this.sectorEl = this.element.querySelector(`#gauge-sector-${this.id}`);
        this.updateArcColor(0);
    }

    // === Classic style (chrome rim, trading style) ===
    renderClassic() {
        const { min = WIDGET_DEFAULT_MIN, max = WIDGET_DEFAULT_MAX, unit = '', zones = [] } = this.config;
        const ticks = this.generateTicks(min, max, 5);

        // Semicircular gauge with value below on dark background
        const { cx, cy, r } = GaugeWidget.layoutForStyle('semicircle');

        this.element.innerHTML = `
            <svg class="gauge-svg gauge-semicircle" viewBox="0 0 100 72">
                <defs>
                    <!-- Chrome gradient for rim -->
                    <linearGradient id="chrome-${this.id}" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" style="stop-color:#f5f5f5"/>
                        <stop offset="30%" style="stop-color:#e0e0e0"/>
                        <stop offset="50%" style="stop-color:#c8c8c8"/>
                        <stop offset="70%" style="stop-color:#d5d5d5"/>
                        <stop offset="100%" style="stop-color:#a0a0a0"/>
                    </linearGradient>
                    <!-- Face gradient -->
                    <radialGradient id="face-${this.id}" cx="50%" cy="0%" r="100%">
                        <stop offset="0%" style="stop-color:#fafafa"/>
                        <stop offset="100%" style="stop-color:#e8e8e8"/>
                    </radialGradient>
                </defs>

                <!-- Chrome rim (semicircle only) -->
                <path d="M ${cx - r - 5} ${cy} A ${r + 5} ${r + 5} 0 0 1 ${cx + r + 5} ${cy}"
                      fill="none" stroke="url(#chrome-${this.id})" stroke-width="5"/>
                <path d="M ${cx - r - 5} ${cy} A ${r + 5} ${r + 5} 0 0 1 ${cx + r + 5} ${cy}"
                      fill="none" stroke="#888" stroke-width="0.5"/>

                <!-- Inner face (semicircle) -->
                <path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy} Z"
                      fill="url(#face-${this.id})" stroke="#999" stroke-width="0.3"/>

                <!-- Sector fill (0 to value) -->
                <path class="gauge-sector-fill" id="gauge-sector-${this.id}" style="display: none; opacity: 0.3;"/>

                <!-- Color zones arc -->
                ${this.renderClassicZones(zones, min, max)}

                <!-- Tick marks and labels -->
                ${ticks.map(t => this.renderClassicTick(t.angle, t.value, t.major)).join('')}

                <!-- Needle -->
                <g class="gauge-needle-semicircle" id="gauge-needle-${this.id}" style="transform-origin: ${cx}px ${cy}px; transform: rotate(${GaugeWidget.cssArcStartForStyle('semicircle')}deg)">
                    <polygon points="${cx},${cy - r + 6} ${cx - 2},${cy - 3} ${cx + 2},${cy - 3}" fill="#222"/>
                    <polygon points="${cx},${cy - r + 8} ${cx - 1.5},${cy - 4} ${cx + 1.5},${cy - 4}" fill="#c00"/>
                </g>

                <!-- Center cap -->
                <circle cx="${cx}" cy="${cy}" r="5" fill="url(#chrome-${this.id})" stroke="#666" stroke-width="0.5"/>
                <circle cx="${cx}" cy="${cy}" r="3" fill="#333"/>

                <!-- Unit inside gauge (center, below cap) -->
                <text x="${cx}" y="${cy - 8}" fill="#555" text-anchor="middle" font-size="9">${escapeHtml(unit)}</text>

                <!-- Value below gauge (white text on dark widget background) -->
                <text class="gauge-semicircle-value" x="${cx}" y="${cy + 17}" id="gauge-value-${this.id}">0</text>
            </svg>
        `;

        this.needleEl = this.element.querySelector(`#gauge-needle-${this.id}`);
        this.valueEl = this.element.querySelector(`#gauge-value-${this.id}`);
        this.sectorEl = this.element.querySelector(`#gauge-sector-${this.id}`);
    }

    renderClassicZones(zones, min, max) {
        const layout = GaugeWidget.layoutForStyle('semicircle');
        return this.renderZoneArcs(zones, min, max, {
            ...layout,
            r: layout.zoneR,
            startAngle: GaugeWidget.GEOMETRY.SEMICIRCLE_DEGREES,
            angleSpan: GaugeWidget.GEOMETRY.SEMICIRCLE_DEGREES,
            strokeWidth: 4, opacity: 0.8
        });
    }

    renderClassicTick(angle, value, major) {
        const layout = GaugeWidget.layoutForStyle('semicircle');
        const { cx, cy } = layout;
        const outerR = layout.tickOuterR;
        const innerR = major ? layout.tickMajorInnerR : layout.tickMinorInnerR;
        const textR = layout.tickTextR;

        // Convert from lower semicircle angles (180→0) to upper semicircle (180→360)
        const upperAngle = GaugeWidget.GEOMETRY.FULL_CIRCLE_DEGREES - angle;
        const outer = GaugeWidget.polarPoint(cx, cy, outerR, upperAngle);
        const inner = GaugeWidget.polarPoint(cx, cy, innerR, upperAngle);
        const text = GaugeWidget.polarPoint(cx, cy, textR, upperAngle);
        let ty = text.y;

        // Raise extreme labels (0 and max) by 3px so they don't extend beyond gauge background
        if (angle === GaugeWidget.GEOMETRY.SEMICIRCLE_DEGREES || angle === 0) {
            ty -= 3;
        }

        let html = `<line x1="${outer.x}" y1="${outer.y}" x2="${inner.x}" y2="${inner.y}"
                         stroke="#444" stroke-width="${major ? 1 : 0.5}"/>`;

        if (major) {
            html += `<text x="${text.x}" y="${ty}" class="gauge-semicircle-tick" text-anchor="middle" dominant-baseline="middle">${value}</text>`;
        }

        return html;
    }

    // === Modern style (Lada dashboard style) ===
    renderModern() {
        const { min = WIDGET_DEFAULT_MIN, max = WIDGET_DEFAULT_MAX, unit = '', zones = [] } = this.config;
        const ticks = this.generateTicks(min, max, 5);

        // Match speedometer outer diameter with thicker bezel
        const { cx, cy, r } = GaugeWidget.layoutForStyle('arc270');

        this.element.innerHTML = `
            <svg class="gauge-svg gauge-arc270" viewBox="0 0 120 115">
                <defs>
                    <!-- Chrome rim gradient (matching speedometer) -->
                    <linearGradient id="arc270-chrome-${this.id}" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" style="stop-color:#505050"/>
                        <stop offset="15%" style="stop-color:#404040"/>
                        <stop offset="50%" style="stop-color:#303030"/>
                        <stop offset="85%" style="stop-color:#404040"/>
                        <stop offset="100%" style="stop-color:#353535"/>
                    </linearGradient>
                    <!-- Glow filter -->
                    <filter id="glow-${this.id}" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="2" result="blur"/>
                        <feMerge>
                            <feMergeNode in="blur"/>
                            <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                    </filter>
                    <!-- Needle gradient -->
                    <linearGradient id="needle-grad-${this.id}" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" style="stop-color:#ff6b35"/>
                        <stop offset="100%" style="stop-color:#f7931e"/>
                    </linearGradient>
                </defs>

                <!-- Outer chrome bezel (thicker, matching speedometer) -->
                <circle cx="${cx}" cy="${cy}" r="${r + 6}" fill="url(#arc270-chrome-${this.id})" stroke="#555" stroke-width="0.5"/>

                <!-- Inner dark ring (matching speedometer) -->
                <circle cx="${cx}" cy="${cy}" r="${r + 1}" fill="#252525"/>

                <!-- Dark background -->
                <circle cx="${cx}" cy="${cy}" r="${r}" fill="#1a1a1a"/>

                <!-- Outer glow ring -->
                <circle cx="${cx}" cy="${cy}" r="${r - 2}" fill="none" stroke="#2a4a5a" stroke-width="2" filter="url(#glow-${this.id})"/>

                <!-- Inner ring -->
                <circle cx="${cx}" cy="${cy}" r="${r - 4}" fill="none" stroke="#1e3a4a" stroke-width="1"/>

                <!-- Sector fill (0 to value) -->
                <path class="gauge-sector-fill" id="gauge-sector-${this.id}" style="display: none; opacity: 0.3;"/>

                <!-- Red zone (if defined) -->
                ${this.renderModernRedZone(zones, min, max)}

                <!-- Tick marks and numbers -->
                ${ticks.map(t => this.renderModernTick(t.angle, t.value, t.major)).join('')}

                <!-- Needle -->
                <g class="gauge-needle-arc270" id="gauge-needle-${this.id}" style="transform-origin: ${cx}px ${cy}px; transform: rotate(${GaugeWidget.cssArcStartForStyle('arc270')}deg)">
                    <line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - r + 10}" stroke="#ff6b35" stroke-width="2" stroke-linecap="round"/>
                    <circle cx="${cx}" cy="${cy}" r="4" fill="#333" stroke="#ff6b35" stroke-width="1"/>
                </g>

                <!-- Center cap -->
                <circle cx="${cx}" cy="${cy}" r="6" fill="#222" stroke="#444" stroke-width="1"/>
                <circle cx="${cx}" cy="${cy}" r="3" fill="#333"/>

                <!-- Unit label (centered) -->
                <text class="gauge-arc270-unit" x="${cx}" y="${cy + 22}">${escapeHtml(unit)}</text>

                <!-- Value display (lower position, inside gauge) -->
                <text class="gauge-arc270-value-small" x="${cx}" y="${cy + 35}" id="gauge-value-${this.id}">0</text>
            </svg>
        `;

        this.needleEl = this.element.querySelector(`#gauge-needle-${this.id}`);
        this.valueEl = this.element.querySelector(`#gauge-value-${this.id}`);
        this.sectorEl = this.element.querySelector(`#gauge-sector-${this.id}`);
    }

    renderModernRedZone(zones, min, max) {
        const layout = GaugeWidget.layoutForStyle('arc270');
        return this.renderZoneArcs(zones, min, max, {
            ...layout,
            r: layout.zoneR,
            startAngle: GaugeWidget.GEOMETRY.ARC270_START_DEGREES,
            angleSpan: GaugeWidget.GEOMETRY.ARC270_DEGREES,
            strokeWidth: 4, opacity: 0.8
        });
    }

    renderModernTick(angle, value, major) {
        const layout = GaugeWidget.layoutForStyle('arc270');
        const { cx, cy } = layout;
        const outerR = layout.tickOuterR;
        const innerR = major ? layout.tickMajorInnerR : layout.tickMinorInnerR;
        const textR = layout.tickTextR;

        // Convert from semicircle position angles (180° to 0°) to arc270 (135° to 405°)
        const { ARC270_START_DEGREES, ARC270_DEGREES, SEMICIRCLE_DEGREES } = GaugeWidget.GEOMETRY;
        const adjustedAngle = ARC270_START_DEGREES
            + (SEMICIRCLE_DEGREES - angle) / SEMICIRCLE_DEGREES * ARC270_DEGREES;
        const outer = GaugeWidget.polarPoint(cx, cy, outerR, adjustedAngle);
        const inner = GaugeWidget.polarPoint(cx, cy, innerR, adjustedAngle);
        const text = GaugeWidget.polarPoint(cx, cy, textR, adjustedAngle);

        let html = `<line x1="${outer.x}" y1="${outer.y}" x2="${inner.x}" y2="${inner.y}"
                         stroke="${major ? '#888' : '#555'}" stroke-width="${major ? 1.5 : 0.5}"/>`;

        if (major) {
            html += `<text x="${text.x}" y="${text.y}" class="gauge-arc270-tick" text-anchor="middle" dominant-baseline="middle">${value}</text>`;
        }

        return html;
    }

    // === Speedometer style (realistic automotive gauge) ===
    renderSpeedometer() {
        const { min = WIDGET_DEFAULT_MIN, max = SPEEDOMETER_DEFAULT_MAX_RPM, unit = 'RPM', zones = [] } = this.config;
        const majorStep = this.calculateMajorStep(min, max);
        const ticks = this.generateSpeedoTicks(min, max, majorStep);

        const { cx, cy, r } = GaugeWidget.layoutForStyle('speedometer');

        this.element.innerHTML = `
            <svg class="gauge-svg gauge-speedometer" viewBox="0 0 120 115">
                <defs>
                    <!-- Chrome rim gradient -->
                    <linearGradient id="speedo-chrome-${this.id}" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" style="stop-color:#ffffff"/>
                        <stop offset="15%" style="stop-color:#e8e8e8"/>
                        <stop offset="30%" style="stop-color:#c0c0c0"/>
                        <stop offset="50%" style="stop-color:#a8a8a8"/>
                        <stop offset="70%" style="stop-color:#c0c0c0"/>
                        <stop offset="85%" style="stop-color:#d8d8d8"/>
                        <stop offset="100%" style="stop-color:#909090"/>
                    </linearGradient>

                    <!-- Inner chrome ring -->
                    <linearGradient id="speedo-chrome-inner-${this.id}" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" style="stop-color:#606060"/>
                        <stop offset="50%" style="stop-color:#404040"/>
                        <stop offset="100%" style="stop-color:#606060"/>
                    </linearGradient>

                    <!-- Face gradient (off-white) -->
                    <radialGradient id="speedo-face-${this.id}" cx="50%" cy="30%" r="70%">
                        <stop offset="0%" style="stop-color:#f8f8f8"/>
                        <stop offset="100%" style="stop-color:#e0e0e0"/>
                    </radialGradient>

                    <!-- Shadow filter -->
                    <filter id="speedo-shadow-${this.id}" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="1" stdDeviation="1" flood-opacity="0.3"/>
                    </filter>

                    <!-- Needle gradient -->
                    <linearGradient id="speedo-needle-${this.id}" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" style="stop-color:#cc0000"/>
                        <stop offset="50%" style="stop-color:#ff0000"/>
                        <stop offset="100%" style="stop-color:#cc0000"/>
                    </linearGradient>
                </defs>

                <!-- Outer chrome bezel -->
                <circle cx="${cx}" cy="${cy}" r="${r + 6}" fill="url(#speedo-chrome-${this.id})"
                        stroke="#707070" stroke-width="0.5"/>

                <!-- Inner dark ring -->
                <circle cx="${cx}" cy="${cy}" r="${r + 1}" fill="url(#speedo-chrome-inner-${this.id})"/>

                <!-- Main face -->
                <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#speedo-face-${this.id})"
                        filter="url(#speedo-shadow-${this.id})"/>

                <!-- Sector fill (0 to value) -->
                <path class="gauge-sector-fill" id="gauge-sector-${this.id}" style="display: none; opacity: 0.3;"/>

                <!-- Color zones (danger zone etc) -->
                ${this.renderSpeedoZones(zones, min, max, cx, cy, r - GaugeWidget.layoutForStyle('speedometer').zoneOffset)}

                <!-- Tick marks and numbers -->
                ${ticks.map(t => this.renderSpeedoTick(t, cx, cy, r)).join('')}

                <!-- Needle assembly -->
                <g class="gauge-needle-tacho" id="gauge-needle-${this.id}" style="transform-origin: ${cx}px ${cy}px; transform: rotate(${GaugeWidget.cssArcStartForStyle('speedometer')}deg)">
                    <!-- Needle shadow -->
                    <polygon points="${cx},${cy - r + 14} ${cx - 3},${cy + 8} ${cx + 3},${cy + 8}"
                             fill="rgba(0,0,0,0.2)" transform="translate(1, 1)"/>
                    <!-- Needle body -->
                    <polygon points="${cx},${cy - r + 14} ${cx - 2.5},${cy + 6} ${cx + 2.5},${cy + 6}"
                             fill="url(#speedo-needle-${this.id})" stroke="#800000" stroke-width="0.3"/>
                    <!-- Needle highlight -->
                    <line x1="${cx}" y1="${cy - r + 16}" x2="${cx}" y2="${cy - 4}"
                          stroke="rgba(255,255,255,0.3)" stroke-width="1"/>
                </g>

                <!-- Center cap (layered for 3D effect) -->
                <circle cx="${cx}" cy="${cy}" r="10" fill="url(#speedo-chrome-${this.id})"
                        stroke="#505050" stroke-width="0.5"/>
                <circle cx="${cx}" cy="${cy}" r="7" fill="#2a2a2a"/>
                <circle cx="${cx}" cy="${cy}" r="5" fill="#1a1a1a" stroke="#333" stroke-width="0.5"/>
                <circle cx="${cx}" cy="${cy}" r="2" fill="#444"/>

                <!-- Unit label (above digital display) -->
                <text class="speedo-unit" x="${cx}" y="${cy + 21}">${escapeHtml(unit)}</text>

                <!-- Digital display -->
                <rect x="${cx - 21}" y="${cy + 27}" width="42" height="11" rx="2"
                      fill="#2a2a2a" stroke="#1a1a1a" stroke-width="0.5"/>
                <rect x="${cx - 20}" y="${cy + 28}" width="40" height="9" rx="1.5"
                      fill="#1e1e1e"/>
                <text class="speedo-digital" x="${cx}" y="${cy + 35}" id="gauge-digital-${this.id}">0</text>
            </svg>
        `;

        this.needleEl = this.element.querySelector(`#gauge-needle-${this.id}`);
        this.digitalEl = this.element.querySelector(`#gauge-digital-${this.id}`);
        this.sectorEl = this.element.querySelector(`#gauge-sector-${this.id}`);
        // valueEl not used in speedometer - digital display shows the value
    }

    // === Dual Scale style (main value + target indicator) ===
    renderDualScale() {
        const { min = WIDGET_DEFAULT_MIN, max = WIDGET_DEFAULT_MAX, unit = '', zones = [], sensor2 = '' } = this.config;
        const hasSensor2 = sensor2 && sensor2.trim() !== '';

        const { cx, cy, r } = GaugeWidget.layoutForStyle('dual');
        const majorStep = this.calculateMajorStep(min, max);
        const ticks = this.generateSpeedoTicks(min, max, majorStep);

        this.element.innerHTML = `
            <svg class="gauge-svg gauge-dual" viewBox="0 0 120 125">
                <defs>
                    <!-- Dark background gradient -->
                    <radialGradient id="dual-bg-${this.id}" cx="50%" cy="30%" r="70%">
                        <stop offset="0%" style="stop-color:#3a3a3a"/>
                        <stop offset="100%" style="stop-color:#1a1a1a"/>
                    </radialGradient>

                    <!-- Chrome bezel gradient -->
                    <linearGradient id="dual-chrome-${this.id}" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" style="stop-color:#606060"/>
                        <stop offset="15%" style="stop-color:#505050"/>
                        <stop offset="50%" style="stop-color:#404040"/>
                        <stop offset="85%" style="stop-color:#505050"/>
                        <stop offset="100%" style="stop-color:#454545"/>
                    </linearGradient>

                    <!-- Cyan glow filter -->
                    <filter id="dual-glow-${this.id}" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="1.5" result="blur"/>
                        <feMerge>
                            <feMergeNode in="blur"/>
                            <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                    </filter>

                    <!-- Orange glow filter for target -->
                    <filter id="dual-target-glow-${this.id}" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="1" result="blur"/>
                        <feMerge>
                            <feMergeNode in="blur"/>
                            <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                    </filter>

                    <!-- Needle gradient (cyan) -->
                    <linearGradient id="dual-needle-${this.id}" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" style="stop-color:#00a8cc"/>
                        <stop offset="50%" style="stop-color:#00d4ff"/>
                        <stop offset="100%" style="stop-color:#00a8cc"/>
                    </linearGradient>
                </defs>

                <!-- Outer chrome bezel -->
                <circle cx="${cx}" cy="${cy}" r="${r + 6}" fill="url(#dual-chrome-${this.id})"
                        stroke="#303030" stroke-width="0.5"/>

                <!-- Inner ring -->
                <circle cx="${cx}" cy="${cy}" r="${r + 1}" fill="#2a2a2a"/>

                <!-- Main face (dark) -->
                <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#dual-bg-${this.id})"/>

                <!-- Sector fill (0 to value) -->
                <path class="gauge-sector-fill" id="gauge-sector-${this.id}" style="display: none; opacity: 0.3;"/>

                <!-- Color zones -->
                ${this.renderSpeedoZones(zones, min, max, cx, cy, r - GaugeWidget.layoutForStyle('dual').zoneOffset)}

                <!-- Scale: tick marks -->
                ${ticks.map(t => this.renderDualOuterTick(t, cx, cy, r)).join('')}

                <!-- Target arc (cyan, from 0 to target value) - updated via JS -->
                <path id="gauge-target-arc-${this.id}" class="dual-target-arc"
                      d="" fill="none" stroke="#00d4ff" stroke-width="2.5" opacity="0.6"
                      filter="url(#dual-target-glow-${this.id})" style="display: none;"/>

                <!-- Target indicator (invisible, used only for angle calculation) -->
                <g class="dual-target-marker" id="gauge-target-${this.id}" style="transform-origin: ${cx}px ${cy}px; transform: rotate(${GaugeWidget.cssArcStartForStyle('dual')}deg); display: none;"></g>

                <!-- Needle assembly (cyan) -->
                <g class="gauge-needle-dual" id="gauge-needle-${this.id}" style="transform-origin: ${cx}px ${cy}px; transform: rotate(${GaugeWidget.cssArcStartForStyle('dual')}deg)">
                    <!-- Needle glow -->
                    <polygon points="${cx},${cy - r + 14} ${cx - 2.5},${cy + 6} ${cx + 2.5},${cy + 6}"
                             fill="#00d4ff" filter="url(#dual-glow-${this.id})" opacity="0.5"/>
                    <!-- Needle body -->
                    <polygon points="${cx},${cy - r + 14} ${cx - 2},${cy + 5} ${cx + 2},${cy + 5}"
                             fill="url(#dual-needle-${this.id})" stroke="#008899" stroke-width="0.3"/>
                    <!-- Needle highlight -->
                    <line x1="${cx}" y1="${cy - r + 16}" x2="${cx}" y2="${cy - 4}"
                          stroke="rgba(255,255,255,0.4)" stroke-width="0.8"/>
                </g>

                <!-- Center cap (cyan glow) -->
                <circle cx="${cx}" cy="${cy}" r="10" fill="#2a2a2a" stroke="#00d4ff" stroke-width="1"/>
                <circle cx="${cx}" cy="${cy}" r="7" fill="#00d4ff" filter="url(#dual-glow-${this.id})"/>
                <circle cx="${cx}" cy="${cy}" r="5" fill="#1a1a1a"/>
                <circle cx="${cx}" cy="${cy}" r="2" fill="#00d4ff"/>

                <!-- Unit label -->
                <text class="dual-unit" x="${cx}" y="${cy + 21}">${escapeHtml(unit)}</text>

                <!-- Digital display for main value (white digits) -->
                <rect x="${cx - 21}" y="${cy + 27}" width="42" height="11" rx="2"
                      fill="#1a1a1a" stroke="#333" stroke-width="0.5"/>
                <rect x="${cx - 20}" y="${cy + 28}" width="40" height="9" rx="1.5"
                      fill="#0a0a0a"/>
                <text class="dual-digital-white" x="${cx}" y="${cy + 35}" id="gauge-digital-${this.id}">--</text>

                <!-- Target value (small, below digital display) - hidden if no sensor2 -->
                <text class="dual-target-small" x="${cx}" y="${cy + 44}" id="gauge-target-digital-${this.id}"
                      style="${hasSensor2 ? '' : 'display: none;'}">${hasSensor2 ? '--' : ''}</text>
            </svg>
        `;

        this.needleEl = this.element.querySelector(`#gauge-needle-${this.id}`);
        this.digitalEl = this.element.querySelector(`#gauge-digital-${this.id}`);
        this.targetEl = this.element.querySelector(`#gauge-target-${this.id}`);
        this.targetArcEl = this.element.querySelector(`#gauge-target-arc-${this.id}`);
        this.targetDigitalEl = this.element.querySelector(`#gauge-target-digital-${this.id}`);
        this.sectorEl = this.element.querySelector(`#gauge-sector-${this.id}`);
        // Store dimensions for arc calculation
        this.dualParams = { cx, cy, r, arcR: r - GaugeWidget.layoutForStyle('dual').targetArcOffset };
    }

    renderDualOuterTick(tick, cx, cy, r) {
        const { angle, value, major } = tick;
        // Outer scale: ticks at edge, numbers between ticks and inner dots
        const layout = GaugeWidget.layoutForStyle('dual');
        const outerR = r - layout.tickOuterOffset;
        const innerR = major ? r - layout.tickMajorInnerOffset : r - layout.tickMinorInnerOffset;
        const textR = r - layout.tickTextOffset;

        const outer = GaugeWidget.polarPoint(cx, cy, outerR, angle);
        const inner = GaugeWidget.polarPoint(cx, cy, innerR, angle);

        let html = `<line x1="${outer.x}" y1="${outer.y}" x2="${inner.x}" y2="${inner.y}"
                         stroke="#ccc" stroke-width="${major ? 1.8 : 0.8}"/>`;

        if (major) {
            const text = GaugeWidget.polarPoint(cx, cy, textR, angle);
            html += `<text x="${text.x}" y="${text.y}" class="dual-outer-label"
                          text-anchor="middle" dominant-baseline="middle">${value}</text>`;
        }

        return html;
    }

    calculateMajorStep(min, max) {
        const range = max - min;
        const rule = GaugeWidget.MAJOR_STEP_RULES.find(({ maxRange }) => range <= maxRange);
        if (rule) return rule.step;
        return GAUGE_FALLBACK_MAJOR_STEP;
    }

    generateSpeedoTicks(min, max, majorStep) {
        const ticks = [];
        const minorStep = majorStep / 5;
        const { ARC270_START_DEGREES, ARC270_DEGREES, MAJOR_STEP_EPSILON } = GaugeWidget.GEOMETRY;

        for (let v = min; v <= max; v += minorStep) {
            const isMajor = Math.abs(v % majorStep) < MAJOR_STEP_EPSILON
                || Math.abs(v % majorStep - majorStep) < MAJOR_STEP_EPSILON;
            const percent = percentInRange(v, min, max);
            // 270° arc for positioning with cos/sin (135° to 405°/45°)
            const angle = ARC270_START_DEGREES + (percent * ARC270_DEGREES);
            ticks.push({ value: Math.round(v), angle, major: isMajor });
        }

        return ticks;
    }

    renderSpeedoTick(tick, cx, cy, r) {
        const { angle, value, major } = tick;

        const layout = GaugeWidget.layoutForStyle('speedometer');
        const outerR = r - layout.tickOuterOffset;
        const innerR = major ? r - layout.tickMajorInnerOffset : r - layout.tickMinorInnerOffset;
        const textR = r - layout.tickTextOffset;

        const outer = GaugeWidget.polarPoint(cx, cy, outerR, angle);
        const inner = GaugeWidget.polarPoint(cx, cy, innerR, angle);

        let html = `<line x1="${outer.x}" y1="${outer.y}" x2="${inner.x}" y2="${inner.y}"
                         stroke="#333" stroke-width="${major ? 1.5 : 0.7}"/>`;

        if (major) {
            const text = GaugeWidget.polarPoint(cx, cy, textR, angle);
            html += `<text x="${text.x}" y="${text.y}" class="speedo-tick-label"
                          text-anchor="middle" dominant-baseline="middle">${value}</text>`;
        }

        return html;
    }

    renderSpeedoZones(zones, min, max, cx, cy, r) {
        return this.renderZoneArcs(zones, min, max, {
            cx, cy, r,
            startAngle: GaugeWidget.GEOMETRY.ARC270_START_DEGREES,
            angleSpan: GaugeWidget.GEOMETRY.ARC270_DEGREES,
            strokeWidth: 6, opacity: 0.7
        });
    }

    renderZoneArcs(zones, min, max, opts) {
        if (!zones || zones.length === 0) return '';

        let html = '';
        for (const zone of zones) {
            const startPercent = percentInRange(zone.from, min, max);
            const endPercent = percentInRange(zone.to, min, max);
            const startAngle = opts.startAngle + (startPercent * opts.angleSpan);
            const endAngle = opts.startAngle + (endPercent * opts.angleSpan);

            const start = GaugeWidget.polarPoint(opts.cx, opts.cy, opts.r, startAngle);
            const end = GaugeWidget.polarPoint(opts.cx, opts.cy, opts.r, endAngle);

            const arcSpan = Math.abs(endAngle - startAngle);
            const largeArc = arcSpan > GaugeWidget.GEOMETRY.SEMICIRCLE_DEGREES ? 1 : 0;

            html += `<path d="M ${start.x} ${start.y} A ${opts.r} ${opts.r} 0 ${largeArc} 1 ${end.x} ${end.y}"
                          fill="none" stroke="${zone.color}" stroke-width="${opts.strokeWidth}" opacity="${opts.opacity}"/>`;
        }

        return html;
    }

    // === Shared helpers ===
    generateTicks(min, max, majorCount) {
        const ticks = [];
        const range = max - min;
        const majorStep = range / majorCount;
        const minorPerMajor = GaugeWidget.GEOMETRY.MINOR_TICKS_PER_MAJOR;

        for (let i = 0; i <= majorCount; i++) {
            const value = min + (i * majorStep);
            const percent = i / majorCount;
            // Position angle for cos/sin: 180° (left) to 0° (right) via 90° (bottom)
            const angle = GaugeWidget.GEOMETRY.SEMICIRCLE_DEGREES
                - (percent * GaugeWidget.GEOMETRY.SEMICIRCLE_DEGREES);
            ticks.push({ angle, value: Math.round(value), major: true });

            // Minor ticks
            if (i < majorCount) {
                for (let j = 1; j <= minorPerMajor; j++) {
                    const minorPercent = (i + j / (minorPerMajor + 1)) / majorCount;
                    const minorAngle = GaugeWidget.GEOMETRY.SEMICIRCLE_DEGREES
                        - (minorPercent * GaugeWidget.GEOMETRY.SEMICIRCLE_DEGREES);
                    const minorValue = min + (minorPercent * range);
                    ticks.push({ angle: minorAngle, value: Math.round(minorValue), major: false });
                }
            }
        }

        return ticks;
    }

    getColorForValue(value) {
        return DashboardWidget.getColorForZones(value, this.config.zones);
    }

    updateArcColor(value) {
        if (this.arcEl) {
            this.arcEl.style.stroke = this.getColorForValue(value);
        }
    }

    update(value, error = null) {
        super.update(value, error);

        const { min = WIDGET_DEFAULT_MIN, max = WIDGET_DEFAULT_MAX, decimals = 1, style = 'default' } = this.config;

        // For speedometer/dual, check digitalEl; for others, check valueEl
        const hasDisplay = (style === 'speedometer' || style === 'dual') ? this.digitalEl : this.valueEl;
        if (!hasDisplay && !this.needleEl) return;

        if (error) {
            if (this.valueEl) this.valueEl.textContent = 'ERR';
            if (this.digitalEl) this.digitalEl.textContent = 'ERR';
            if (this.needleEl) this.needleEl.classList.remove('overrange');
            return;
        }

        const numValue = parseNumberOrDefault(value, 0);
        const clampedValue = Math.max(min, Math.min(max, numValue));
        const percent = percentInRange(clampedValue, min, max);

        // Detect overrange condition
        const isOverrange = numValue < min || numValue > max;

        // Update value text (always show actual value, not clamped)
        if (this.valueEl) this.valueEl.textContent = numValue.toFixed(decimals);

        const angle = GaugeWidget.angleForPercent(style, percent);
        if ((style === 'speedometer' || style === 'dual') && this.digitalEl) {
            this.digitalEl.textContent = numValue.toFixed(decimals);
        }

        // Apply needle rotation with CSS variable for animation
        this.needleEl.style.setProperty('--needle-angle', `${angle}deg`);
        this.needleEl.style.transform = `rotate(${angle}deg)`;

        // Toggle overrange shake animation
        if (isOverrange) {
            this.needleEl.classList.add('overrange');
        } else {
            this.needleEl.classList.remove('overrange');
        }

        // Update arc color for default style
        if (style === 'default') {
            this.updateArcColor(numValue);
            if (this.arcEl) {
                const arcLength = Math.PI * 40;
                const dashLength = percent * arcLength;
                this.arcEl.style.strokeDasharray = `${dashLength} ${arcLength}`;
            }
        }

        // Update sector fill
        this.lastValue = numValue;
        this.updateSectorFill(percent);
    }

    // Update target indicator for dual scale gauge (instant, no animation)
    updateSetpoint(value, error = null) {
        if (!this.targetEl) return;

        const { min = WIDGET_DEFAULT_MIN, max = WIDGET_DEFAULT_MAX, style = 'default', decimals = 1 } = this.config;

        // Only for dual style
        if (style !== 'dual') return;

        if (error) {
            this.targetEl.style.display = 'none';
            if (this.targetArcEl) this.targetArcEl.style.display = 'none';
            if (this.targetDigitalEl) this.targetDigitalEl.textContent = 'ERR';
            return;
        }

        const numValue = parseNumberOrDefault(value, 0);
        const clampedValue = Math.max(min, Math.min(max, numValue));
        const percent = percentInRange(clampedValue, min, max);

        const angle = GaugeWidget.angleForPercent(style, percent);

        // Set rotation directly without transition (instant move)
        this.targetEl.style.transform = `rotate(${angle}deg)`;
        this.targetEl.style.display = 'block';

        // Update target digital display
        if (this.targetDigitalEl) {
            this.targetDigitalEl.textContent = numValue.toFixed(decimals);
        }

        // Update target arc (from 0/min to target value)
        if (this.targetArcEl && this.dualParams) {
            const { cx, cy, arcR } = this.dualParams;
            const startAngle = GaugeWidget.cssArcStartForStyle(style);
            const endAngle = angle;  // End at target

            if (percent > GaugeWidget.GEOMETRY.TARGET_ARC_MIN_PERCENT) {
                const arcPath = this.describeArc(cx, cy, arcR, startAngle, endAngle);
                this.targetArcEl.setAttribute('d', arcPath);
                this.targetArcEl.style.display = 'block';
            } else {
                this.targetArcEl.style.display = 'none';
            }
        }
    }

    // Helper to create SVG arc path
    describeArc(cx, cy, r, startAngle, endAngle) {
        const start = this.polarToCartesian(cx, cy, r, endAngle);
        const end = this.polarToCartesian(cx, cy, r, startAngle);
        const largeArcFlag = endAngle - startAngle <= GaugeWidget.GEOMETRY.SEMICIRCLE_DEGREES ? "0" : "1";
        return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
    }

    polarToCartesian(cx, cy, r, angleDeg) {
        const angleRad = GaugeWidget.toRadians(angleDeg - 90);
        return {
            x: cx + r * Math.cos(angleRad),
            y: cy + r * Math.sin(angleRad)
        };
    }

    // Helper to create SVG sector (pie slice) path
    describeSector(cx, cy, r, startAngle, endAngle) {
        const start = this.polarToCartesian(cx, cy, r, startAngle);
        const end = this.polarToCartesian(cx, cy, r, endAngle);
        const largeArcFlag = Math.abs(endAngle - startAngle) > GaugeWidget.GEOMETRY.SEMICIRCLE_DEGREES ? 1 : 0;
        const sweepFlag = endAngle > startAngle ? 1 : 0;
        return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} ${sweepFlag} ${end.x} ${end.y} Z`;
    }

    // Animate sector fill by reading actual needle position from CSS computed style
    // This ensures perfect sync with CSS transition animation
    animateSectorTo(targetPercent) {
        const { fillSector = false, style = 'default' } = this.config;
        if (!fillSector || !this.sectorEl || !this.needleEl) return;

        // Cancel any running animation
        if (this.sectorAnimationId) {
            cancelAnimationFrame(this.sectorAnimationId);
        }

        // Store target for comparison
        this.targetPercent = targetPercent;
        const startTime = performance.now();
        const maxDuration = GaugeWidget.GEOMETRY.SECTOR_ANIMATION_MAX_MS;

        const animate = () => {
            // Read actual needle angle from computed transform
            const computedStyle = window.getComputedStyle(this.needleEl);
            const transform = computedStyle.transform;

            let currentPercent = targetPercent;

            if (transform && transform !== 'none') {
                // Parse matrix: matrix(a, b, c, d, e, f)
                const match = transform.match(/matrix\(([^)]+)\)/);
                if (match) {
                    const values = match[1].split(', ').map(parseFloat);
                    const a = values[0];
                    const b = values[1];
                    // Calculate rotation angle in radians, then convert to degrees
                    const angleRad = Math.atan2(b, a);
                    const angleDeg = angleRad * (GaugeWidget.GEOMETRY.SEMICIRCLE_DEGREES / Math.PI);
                    currentPercent = GaugeWidget.percentFromAngle(style, angleDeg);
                }
            }

            currentPercent = Math.max(0, Math.min(1, currentPercent));
            this.updateSectorPath(currentPercent);
            this.displayedPercent = currentPercent;

            // Continue animating until needle stops (close to target or timeout)
            const elapsed = performance.now() - startTime;
            if (Math.abs(currentPercent - this.targetPercent) > GaugeWidget.GEOMETRY.SECTOR_ANIMATION_EPSILON
                && elapsed < maxDuration) {
                this.sectorAnimationId = requestAnimationFrame(animate);
            }
        };

        this.sectorAnimationId = requestAnimationFrame(animate);
    }

    // Update sector path for given percent (called during animation)
    updateSectorPath(percent) {
        if (!this.sectorEl) return;

        if (percent <= GaugeWidget.GEOMETRY.SECTOR_MIN_PERCENT) {
            this.sectorEl.style.display = 'none';
            return;
        }

        this.sectorEl.style.display = 'block';

        const { style = 'default' } = this.config;
        const { cx, cy, r } = GaugeWidget.sectorParamsForStyle(style);
        const startAngle = GaugeWidget.cssArcStartForStyle(style);
        const endAngle = GaugeWidget.angleForPercent(style, percent);
        const path = this.describeSector(cx, cy, r, startAngle, endAngle);

        this.sectorEl.setAttribute('d', path);
        this.sectorEl.style.fill = this.getColorForValue(this.lastValue || 0);
    }

    // Update sector fill (starts animation to target percent)
    updateSectorFill(percent) {
        const { fillSector = false } = this.config;
        if (!fillSector) {
            if (this.sectorEl) this.sectorEl.style.display = 'none';
            return;
        }

        // Start animated transition to new value
        this.animateSectorTo(percent);
    }

    static getConfigForm(config = {}) {
        const zones = config.zones || [];
        const isDual = config.style === 'dual';
        return `
            ${renderSensorBindingFields(config, { fieldPrefix: '' })}
            <div class="dual-scale-fields" style="display: ${isDual ? 'block' : 'none'};">
                ${renderSensorBindingFields({
                    serverId:   config.serverId2   ?? config.serverId,
                    objectName: config.objectName2 ?? config.objectName,
                    sensor:     config.sensor2 || '',
                    sensorId:   config.sensorId2 ?? null,
                }, { fieldPrefix: 'sensor2-', sensorLabel: 'Target/Setpoint Sensor' })}
            </div>
            ${renderLabelField(config)}
            <div class="widget-config-field">
                <label>Style</label>
                <select class="widget-select" name="style">
                    <option value="default" ${!config.style || config.style === 'default' ? 'selected' : ''}>Default</option>
                    <option value="semicircle" ${config.style === 'semicircle' ? 'selected' : ''}>Semicircle White</option>
                    <option value="arc270" ${config.style === 'arc270' ? 'selected' : ''}>Arc 270° Black</option>
                    <option value="speedometer" ${config.style === 'speedometer' ? 'selected' : ''}>Speedometer White</option>
                    <option value="dual" ${config.style === 'dual' ? 'selected' : ''}>Dual Scale</option>
                </select>
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>Min</label>
                    <input type="number" class="widget-input" name="min" value="${config.min ?? 0}">
                </div>
                <div class="widget-config-field">
                    <label>Max</label>
                    <input type="number" class="widget-input" name="max" value="${config.max ?? 100}">
                </div>
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>Unit</label>
                    <input type="text" class="widget-input" name="unit"
                           value="${escapeAttr(config.unit || '')}" placeholder="°C, %, etc.">
                </div>
                <div class="widget-config-field">
                    <label>Decimals</label>
                    <input type="number" class="widget-input" name="decimals"
                           value="${config.decimals ?? 1}" min="0" max="4">
                </div>
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label class="widget-toggle">
                        <input type="checkbox" name="fillSector" ${config.fillSector ? 'checked' : ''}>
                        <span class="widget-toggle-track"><span class="widget-toggle-thumb"></span></span>
                        <span class="widget-toggle-label">Fill sector (0 to value)</span>
                    </label>
                </div>
            </div>
            <div class="widget-config-field">
                ${renderColorZonesEditor(zones, '#22c55e')}
            </div>
        `;
    }

    static parseConfigForm(form) {
        const zones = parseColorZones(form);

        const binding = parseSensorBindingFields(form, { fieldPrefix: '' });
        const style = form.querySelector('[name="style"]')?.value || 'default';
        const result = {
            ...binding,
            label: form.querySelector('[name="label"]')?.value || '',
            style,
            min: parseNumberOrDefault(form.querySelector('[name="min"]')?.value, 0),
            max: parseNumberOrDefault(form.querySelector('[name="max"]')?.value, 100),
            unit: form.querySelector('[name="unit"]')?.value || '',
            decimals: parseIntegerOrDefault(form.querySelector('[name="decimals"]')?.value, 1),
            fillSector: form.querySelector('[name="fillSector"]')?.checked || false,
            zones
        };
        if (style === 'dual') {
            const b2 = parseSensorBindingFields(form, { fieldPrefix: 'sensor2-' });
            result.serverId2   = b2.serverId;
            result.objectName2 = b2.objectName;
            result.sensor2     = b2.sensor;
            result.sensorId2   = b2.sensorId;
        }
        return result;
    }

    static initConfigHandlers(form, config = {}) {
        mountZonesReusePicker(form, 'gauge');
        initSensorBindingHandlers(form, config, { fieldPrefix: '' });

        const wireDual = () => {
            initSensorBindingHandlers(form, {
                serverId:   config.serverId2   ?? config.serverId,
                objectName: config.objectName2 ?? config.objectName,
                sensor:     config.sensor2,
                sensorId:   config.sensorId2,
            }, { fieldPrefix: 'sensor2-' });
        };

        if (config.style === 'dual') wireDual();

        // Если юзер переключит style → dual после открытия диалога, sensor2 поля
        // станут видны (toggleDualScaleFields), но без wiring останутся пустыми.
        // Listener wire'ит их при первом переходе в dual; helper idempotent.
        const styleSel = form.querySelector('[name="style"]');
        styleSel?.addEventListener('change', () => {
            toggleDualScaleFields(styleSel);
            if (styleSel.value === 'dual') wireDual();
        });
    }
}
