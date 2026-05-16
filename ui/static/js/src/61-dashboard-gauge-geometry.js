// ============================================================================
// Gauge Geometry Helpers
// ============================================================================

const GAUGE_SECTOR_PRESETS = {
    default: { cx: 50, cy: 50, r: 35 },
    semicircle: { cx: 50, cy: 46, r: 34 },
    arc270: { cx: 60, cy: 55, r: 44 },
    speedometer: { cx: 60, cy: 55, r: 44 },
    dual: { cx: 60, cy: 62, r: 44 }
};

const GAUGE_STYLE_LAYOUTS = {
    semicircle: {
        cx: 50, cy: 46, r: 41,
        zoneR: 34,
        tickOuterR: 36,
        tickMajorInnerR: 30,
        tickMinorInnerR: 33,
        tickTextR: 23
    },
    arc270: {
        cx: 60, cy: 55, r: 51,
        zoneR: 38,
        tickOuterR: 42,
        tickMajorInnerR: 34,
        tickMinorInnerR: 38,
        tickTextR: 26
    },
    speedometer: {
        cx: 60, cy: 55, r: 48,
        zoneOffset: 6,
        tickOuterOffset: 4,
        tickMajorInnerOffset: 12,
        tickMinorInnerOffset: 8,
        tickTextOffset: 24
    },
    dual: {
        cx: 60, cy: 62, r: 55,
        zoneOffset: 6,
        targetArcOffset: 2,
        tickOuterOffset: 4,
        tickMajorInnerOffset: 11,
        tickMinorInnerOffset: 7,
        tickTextOffset: 19
    }
};

const GaugeGeometry = {
    SEMICIRCLE_DEGREES: 180,
    ARC270_START_DEGREES: 135,
    ARC270_DEGREES: 270,
    FULL_CIRCLE_DEGREES: 360,
    CSS_SEMICIRCLE_START_DEGREES: -90,
    CSS_ARC270_START_DEGREES: -135,
    SECTOR_MIN_PERCENT: 0.001,
    TARGET_ARC_MIN_PERCENT: 0.01,
    SECTOR_ANIMATION_EPSILON: 0.002,
    SECTOR_ANIMATION_MAX_MS: 1500,
    MAJOR_STEP_EPSILON: 0.001,
    MINOR_TICKS_PER_MAJOR: 4,

    toRadians(angle) {
        return angle * Math.PI / GaugeGeometry.SEMICIRCLE_DEGREES;
    },

    polarPoint(cx, cy, radius, angle) {
        const rad = GaugeGeometry.toRadians(angle);
        return {
            x: cx + radius * Math.cos(rad),
            y: cy + radius * Math.sin(rad)
        };
    },

    isArc270Style(style) {
        return style === 'arc270' || style === 'speedometer' || style === 'dual';
    },

    cssArcStartForStyle(style) {
        return GaugeGeometry.isArc270Style(style)
            ? GaugeGeometry.CSS_ARC270_START_DEGREES
            : GaugeGeometry.CSS_SEMICIRCLE_START_DEGREES;
    },

    cssArcSpanForStyle(style) {
        return GaugeGeometry.isArc270Style(style)
            ? GaugeGeometry.ARC270_DEGREES
            : GaugeGeometry.SEMICIRCLE_DEGREES;
    },

    angleForPercent(style, percent) {
        return GaugeGeometry.cssArcStartForStyle(style)
            + (percent * GaugeGeometry.cssArcSpanForStyle(style));
    },

    percentFromAngle(style, angle) {
        return (angle - GaugeGeometry.cssArcStartForStyle(style))
            / GaugeGeometry.cssArcSpanForStyle(style);
    },

    sectorParamsForStyle(style) {
        return GAUGE_SECTOR_PRESETS[style] || GAUGE_SECTOR_PRESETS.default;
    },

    layoutForStyle(style) {
        return GAUGE_STYLE_LAYOUTS[style] || GAUGE_STYLE_LAYOUTS.semicircle;
    }
};

const GAUGE_MAJOR_STEP_RULES = [
    { maxRange: 100, step: 10 },
    { maxRange: 500, step: 50 },
    { maxRange: 1000, step: 100 },
    { maxRange: 5000, step: 500 },
    { maxRange: 10000, step: 1000 }
];
