import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(__dirname, '../../ui/static/js/src');

describe('dashboard widget source layout', () => {
    it('keeps GaugeWidget in its own dashboard source file', () => {
        const gaugePath = resolve(SRC_DIR, '61-dashboard-widget-gauge.js');
        const aggregatePath = resolve(SRC_DIR, '61-dashboard-widgets.js');

        expect(existsSync(gaugePath)).toBe(true);

        const gaugeSource = readFileSync(gaugePath, 'utf8');
        const aggregateSource = readFileSync(aggregatePath, 'utf8');

        expect(gaugeSource).toContain('class GaugeWidget extends DashboardWidget');
        expect(aggregateSource).not.toContain('class GaugeWidget extends DashboardWidget');
        expect(aggregateSource).toContain('class LevelWidget extends DashboardWidget');
    });

    it('keeps shared gauge geometry helpers outside GaugeWidget', () => {
        const geometryPath = resolve(SRC_DIR, '61-dashboard-gauge-geometry.js');
        const gaugePath = resolve(SRC_DIR, '61-dashboard-widget-gauge.js');

        expect(existsSync(geometryPath)).toBe(true);

        const geometrySource = readFileSync(geometryPath, 'utf8');
        const gaugeSource = readFileSync(gaugePath, 'utf8');

        expect(geometrySource).toContain('const GaugeGeometry =');
        expect(geometrySource).toContain('const GAUGE_SECTOR_PRESETS =');
        expect(geometrySource).toContain('const GAUGE_STYLE_LAYOUTS =');
        expect(geometrySource).toContain('const GAUGE_MAJOR_STEP_RULES =');
        expect(gaugeSource).not.toContain('static GEOMETRY = {');
        expect(gaugeSource).toContain('static GEOMETRY = GaugeGeometry;');
        expect(gaugeSource).not.toContain('const cx = 50, cy = 46');
        expect(gaugeSource).not.toContain('const cx = 60, cy = 55');
    });

    it('does not keep unused OPCUA status variables', () => {
        const source = readFileSync(resolve(SRC_DIR, '21-opcua-exchange.js'), 'utf8');

        expect(source).not.toContain('const errClass =');
    });

    it('keeps repeated renderer helpers centralized', () => {
        const baseSource = readFileSync(resolve(SRC_DIR, '10-base-renderer.js'), 'utf8');
        const ioncSource = readFileSync(resolve(SRC_DIR, '20-ionc-renderer.js'), 'utf8');
        const opcuaExchangeSource = readFileSync(resolve(SRC_DIR, '21-opcua-exchange.js'), 'utf8');
        const opcuaServerSource = readFileSync(resolve(SRC_DIR, '24-opcua-server.js'), 'utf8');
        const uwsgateSource = readFileSync(resolve(SRC_DIR, '25-uwsgate.js'), 'utf8');

        expect(baseSource).toContain('loadMissingPinnedSensors(');
        expect(ioncSource).toContain("this.pinStorageKey = 'uniset-panel-ionc-pinned'");
        expect(ioncSource).not.toContain('getPinnedSensors()');
        expect(ioncSource).not.toContain('savePinnedSensors(pinnedSet)');

        expect(opcuaExchangeSource).not.toContain('async loadPinnedSensors()');
        expect(opcuaServerSource).not.toContain('async loadPinnedSensors()');

        expect(uwsgateSource).not.toContain('catch (e) {}');
    });

    it('keeps dashboard widget lifecycle and chart style values centralized', () => {
        const constantsSource = readFileSync(resolve(SRC_DIR, '00-constants.js'), 'utf8');
        const managerSource = readFileSync(resolve(SRC_DIR, '62-dashboard-manager.js'), 'utf8');
        const dialogSource = readFileSync(resolve(SRC_DIR, '41-dialogs.js'), 'utf8');
        const sectionsSource = readFileSync(resolve(SRC_DIR, '52-ui-sections.js'), 'utf8');
        const widgetsSource = readFileSync(resolve(SRC_DIR, '61-dashboard-widgets.js'), 'utf8');

        expect(constantsSource).toContain('const CHART_LINE_TENSION = 0.3;');
        expect(constantsSource).toContain('const CHART_LINE_BORDER_WIDTH = 1.5;');
        expect(managerSource).toContain('renderWidgetContent(widget, widgetConfig)');
        expect(managerSource).toContain('applyWidgetTransform(container, widgetConfig)');

        expect(dialogSource).not.toContain('tension = e.target.checked ? 0.3 : 0');
        expect(sectionsSource).not.toContain('tension = smoothEnabled ? 0.3 : 0');
        expect(widgetsSource).not.toContain('sensor.smooth !== false ? 0.3 : 0');
        expect(widgetsSource).not.toContain('sensor.stepped ? 2 : 1.5');
    });

    it('keeps tab lookup and object API URL helpers centralized', () => {
        const utilsSource = readFileSync(resolve(SRC_DIR, '06-utils.js'), 'utf8');
        const chartsSource = readFileSync(resolve(SRC_DIR, '40-charts.js'), 'utf8');
        const renderSource = readFileSync(resolve(SRC_DIR, '51-ui-render.js'), 'utf8');
        const settingsSource = readFileSync(resolve(SRC_DIR, '53-ui-settings.js'), 'utf8');
        const tabsSource = readFileSync(resolve(SRC_DIR, '50-ui-tabs.js'), 'utf8');
        const dialogsSource = readFileSync(resolve(SRC_DIR, '41-dialogs.js'), 'utf8');
        const widgetsSource = readFileSync(resolve(SRC_DIR, '61-dashboard-widgets.js'), 'utf8');

        expect(renderSource).toContain('function getTabPanel(tabKey)');
        expect(renderSource).toContain('panel.dataset.name === tabKey');
        expect(renderSource).not.toContain('document.querySelector(`.tab-panel[data-name="${tabKey}"]`)');
        expect(settingsSource).not.toContain('document.querySelector(`.tab-panel[data-name="${tabKey}"]`)');
        expect(tabsSource).not.toContain('document.querySelector(`.tab-btn[data-name="${name}"]`)');
        expect(tabsSource).not.toContain('document.querySelector(`.tab-panel[data-name="${name}"]`)');

        expect(dialogsSource).toContain('async function fetchObjectApi(tabKey, objectPath, options = {})');
        expect(utilsSource).toContain('function buildObjectUrl(objectName, objectPath = \'\', serverId = null, query = null)');
        expect(chartsSource).toContain('buildObjectUrl(name, \'\', serverId)');
        expect(chartsSource).toContain('buildObjectUrl(name, \'/watch\', serverId)');
        expect(dialogsSource).toContain('const url = buildObjectUrl(objectName, objectPath, serverId);');
        expect(widgetsSource).toContain('return buildObjectUrl(');
        expect(widgetsSource).not.toContain('typeof buildVariableHistoryUrl === \'function\'');
        expect(widgetsSource).not.toContain('let url = `/api/objects/${encodeURIComponent(objectName)}/variables/${encodeURIComponent(sensorName)}/history?count=${CHART_WIDGET_HISTORY_LIMIT}`');
        expect(dialogsSource).not.toContain('let url = `/api/objects/${encodeURIComponent(objectName)}/external-sensors`');
        expect(dialogsSource).not.toContain('let url = `/api/objects/${encodeURIComponent(objectName)}/ionc/subscribe`');
    });

    it('keeps small numeric policy values named', () => {
        const constantsSource = readFileSync(resolve(SRC_DIR, '00-constants.js'), 'utf8');
        const recordingSource = readFileSync(resolve(SRC_DIR, '03-recording.js'), 'utf8');
        const managerSource = readFileSync(resolve(SRC_DIR, '62-dashboard-manager.js'), 'utf8');

        expect(constantsSource).toContain('const BYTES_PER_KIB = 1024;');
        expect(constantsSource).toContain('const BYTE_UNITS = [\'B\', \'KB\', \'MB\', \'GB\'];');
        expect(constantsSource).toContain('const DASHBOARD_FINE_MOVE_STEP_PX = 1;');

        expect(recordingSource).not.toContain('const k = 1024;');
        expect(recordingSource).not.toContain('const sizes = [\'B\', \'KB\', \'MB\', \'GB\'];');
        expect(recordingSource).toContain('Math.log(BYTES_PER_KIB)');
        expect(recordingSource).toContain('BYTE_UNITS[i]');

        expect(managerSource).toContain('const step = DASHBOARD_FINE_MOVE_STEP_PX;');
        expect(managerSource).not.toContain('const step = 1;');
    });

    it('keeps dashboard layout math and bar percentage helpers shared', () => {
        const managerSource = readFileSync(resolve(SRC_DIR, '62-dashboard-manager.js'), 'utf8');
        const tabsSource = readFileSync(resolve(SRC_DIR, '50-ui-tabs.js'), 'utf8');
        const widgetsSource = readFileSync(resolve(SRC_DIR, '61-dashboard-widgets.js'), 'utf8');

        expect(managerSource).toContain('getGridMetrics()');
        expect(managerSource).not.toContain('const cellWidth = (contentWidth - gap * (DASHBOARD_GRID_COLS - 1)) / DASHBOARD_GRID_COLS');
        expect(managerSource).not.toContain('const cellWidth = (gridRect.width - gap * (DASHBOARD_GRID_COLS - 1)) / DASHBOARD_GRID_COLS');
        expect(tabsSource).toContain('createTabShell(');

        expect(widgetsSource).toContain('percentInRange(value, min, max, 100)');
        expect(widgetsSource).not.toContain('((value - min) / range) * 100');
    });

    it('keeps chart dialog handlers reset with other persistent config handlers', () => {
        const managerSource = readFileSync(resolve(SRC_DIR, '62-dashboard-manager.js'), 'utf8');
        const widgetsSource = readFileSync(resolve(SRC_DIR, '61-dashboard-widgets.js'), 'utf8');

        expect(widgetsSource).toContain("form.dataset.chartHandlersWired = 'true'");
        expect(managerSource).toContain('delete content.dataset.chartHandlersWired');
    });

    it('escapes tab shell labels and avoids raw tab panel lookup in renderers', () => {
        const tabsSource = readFileSync(resolve(SRC_DIR, '50-ui-tabs.js'), 'utf8');
        const baseSource = readFileSync(resolve(SRC_DIR, '10-base-renderer.js'), 'utf8');
        const ioncSource = readFileSync(resolve(SRC_DIR, '20-ionc-renderer.js'), 'utf8');
        const simpleSource = readFileSync(resolve(SRC_DIR, '11-simple-renderers.js'), 'utf8');

        expect(tabsSource).toContain('${escapeHtml(displayName)}');
        expect(tabsSource).toContain('${escapeHtml(serverName)}');

        [baseSource, ioncSource, simpleSource].forEach(source => {
            expect(source).not.toContain('document.querySelector(`.tab-panel[data-name="${this.tabKey}"]`)');
            expect(source).not.toContain('document.querySelector(`.tab-panel[data-name="${this.tabKey}"] .fallback-type`)');
        });
        // base.setupResize удалён в r7 (dead code), поэтому getTabPanel в нём
        // больше не вызывается; единственный сейчас потребитель в renderer'ах —
        // 20-ionc-renderer (resolveServerId / fallback-type lookup).
        expect(ioncSource).toContain('const panel = getTabPanel(this.tabKey)');
        expect(simpleSource).toContain("getElementsInTab(this.tabKey, '.fallback-type')");
    });

    it('keeps OPCUA paginated sensor URL construction centralized', () => {
        const baseSource = readFileSync(resolve(SRC_DIR, '10-base-renderer.js'), 'utf8');
        const opcuaExchangeSource = readFileSync(resolve(SRC_DIR, '21-opcua-exchange.js'), 'utf8');
        const opcuaServerSource = readFileSync(resolve(SRC_DIR, '24-opcua-server.js'), 'utf8');

        expect(baseSource).toContain('buildPaginatedSensorsUrl(apiPath, offset)');
        expect(opcuaExchangeSource).not.toContain('let url = `/api/objects/${encodeURIComponent(this.objectName)}/opcua/sensors?limit=${this.chunkSize}&offset=0`');
        expect(opcuaExchangeSource).not.toContain('let url = `/api/objects/${encodeURIComponent(this.objectName)}/opcua/sensors?limit=${this.chunkSize}&offset=${nextOffset}`');
        expect(opcuaServerSource).not.toContain('let url = `/api/objects/${encodeURIComponent(this.objectName)}/opcua/sensors?limit=${this.chunkSize}&offset=0`');
        expect(opcuaServerSource).not.toContain('let url = `/api/objects/${encodeURIComponent(this.objectName)}/opcua/sensors?limit=${this.chunkSize}&offset=${nextOffset}`');
    });

    it('keeps gauge tick density named with geometry constants', () => {
        const geometrySource = readFileSync(resolve(SRC_DIR, '61-dashboard-gauge-geometry.js'), 'utf8');
        const gaugeSource = readFileSync(resolve(SRC_DIR, '61-dashboard-widget-gauge.js'), 'utf8');

        expect(geometrySource).toContain('MINOR_TICKS_PER_MAJOR: 4');
        expect(gaugeSource).not.toContain('const minorPerMajor = 4');
        expect(gaugeSource).toContain('GaugeWidget.GEOMETRY.MINOR_TICKS_PER_MAJOR');
    });
});
