import { describe, expect, it } from 'vitest';

describe('createLineChartConfig', () => {
    it('builds the shared line chart defaults for discrete sensors', () => {
        const config = (globalThis as any).createLineChartConfig({
            datasets: [{
                label: 'Discrete',
                data: [{ x: new Date('2026-01-01T00:00:00Z'), y: 1 }],
                color: '#123456',
                isDiscrete: true,
            }],
            timeRange: { min: 10, max: 20 },
        });

        expect(config.type).toBe('line');
        expect(config.data.datasets[0]).toMatchObject({
            label: 'Discrete',
            borderColor: '#123456',
            backgroundColor: '#12345620',
            fill: true,
            tension: 0,
            stepped: 'before',
            pointRadius: 0,
            borderWidth: 2,
        });
        expect(config.options.scales.x.min).toBe(10);
        expect(config.options.scales.x.max).toBe(20);
        expect(config.options.scales.x.ticks.maxTicksLimit).toBe(10);
        expect(config.options.scales.y.beginAtZero).toBe(true);
        expect(config.options.scales.y.ticks.stepSize).toBe(1);
    });

    it('allows chart widgets to override shared defaults', () => {
        const config = (globalThis as any).createLineChartConfig({
            datasets: [{
                label: 'Analog',
                data: [],
                color: '#abcdef',
                fill: false,
                tension: 0,
            }],
            timeRange: { min: 100, max: 200 },
            options: {
                normalized: true,
                parsing: false,
                spanGaps: true,
                interactionMode: 'nearest',
                xMaxTicksLimit: 6,
                yMaxTicksLimit: 5,
                autoSkip: true,
                tickSource: 'auto',
                decimation: true,
            },
        });

        expect(config.data.datasets[0]).toMatchObject({
            fill: false,
            tension: 0,
            stepped: false,
            borderWidth: 1.5,
        });
        expect(config.options.normalized).toBe(true);
        expect(config.options.parsing).toBe(false);
        expect(config.options.spanGaps).toBe(true);
        expect(config.options.interaction.mode).toBe('nearest');
        expect(config.options.scales.x.ticks).toMatchObject({
            maxTicksLimit: 6,
            autoSkip: true,
            source: 'auto',
        });
        expect(config.options.scales.y.ticks.maxTicksLimit).toBe(5);
        expect(config.options.plugins.decimation).toMatchObject({
            enabled: true,
            algorithm: 'min-max',
        });
    });

    it('allows metric charts to show a positioned legend', () => {
        const config = (globalThis as any).createLineChartConfig({
            datasets: [],
            options: {
                discreteYAxis: true,
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: { boxWidth: 12, padding: 8 },
                },
                xMaxTicksLimit: 6,
            },
        });

        expect(config.options.scales.y.beginAtZero).toBe(true);
        expect(config.options.plugins.legend).toMatchObject({
            display: true,
            position: 'bottom',
            labels: { boxWidth: 12, padding: 8 },
        });
        expect(config.options.scales.x.ticks.maxTicksLimit).toBe(6);
    });
});
