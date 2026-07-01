'use client';

import React, { useMemo } from 'react';

/**
 * MiniTrendChart
 *
 * A compact, dependency-free SVG sparkline used beside each feature/tag title
 * to show its daily activity trend at a glance. A full Chart.js instance per
 * list row would be prohibitively heavy (dozens of canvases), so we render a
 * lightweight inline SVG polyline instead.
 *
 * The drawing logic is split into small single-responsibility classes:
 *  - {@link SparklineScale}  maps data values to SVG pixel coordinates.
 *  - {@link SparklineGeometry} turns points into path/area/last-point data.
 * The React component stays thin and simply composes them.
 */

export interface TrendPoint {
    day: string;
    count: number;
}

interface Props {
    /** Dense daily trend (one entry per day; 0 for inactive days). */
    trend: TrendPoint[];
    /** Line/area color (any valid CSS color, incl. CSS variables). */
    color: string;
    /** Overall SVG width in pixels. */
    width?: number;
    /** Overall SVG height in pixels. */
    height?: number;
    /** Accessible label describing the series. */
    ariaLabel?: string;
}

// ---------------------------------------------------------------------------
// SparklineScale — map data-space values into SVG pixel-space coordinates
// ---------------------------------------------------------------------------

class SparklineScale {
    private readonly maxValue: number;
    private readonly stepX: number;

    constructor(
        private readonly values: number[],
        private readonly width: number,
        private readonly height: number,
        private readonly padding: number
    ) {
        this.maxValue = Math.max(1, ...values);
        const usableWidth = Math.max(1, width - padding * 2);
        this.stepX = values.length > 1 ? usableWidth / (values.length - 1) : 0;
    }

    x(index: number): number {
        return this.padding + index * this.stepX;
    }

    y(value: number): number {
        const usableHeight = Math.max(1, this.height - this.padding * 2);
        const ratio = value / this.maxValue;
        // SVG y grows downward, so invert.
        return this.padding + (1 - ratio) * usableHeight;
    }

    get baselineY(): number {
        return this.height - this.padding;
    }
}

// ---------------------------------------------------------------------------
// SparklineGeometry — produce SVG path strings from the scaled points
// ---------------------------------------------------------------------------

interface SparklinePaths {
    line: string;
    area: string;
    last: { x: number; y: number } | null;
}

class SparklineGeometry {
    constructor(private readonly values: number[], private readonly scale: SparklineScale) {}

    build(): SparklinePaths {
        if (this.values.length === 0) return { line: '', area: '', last: null };

        const points = this.values.map((v, i) => ({ x: this.scale.x(i), y: this.scale.y(v) }));

        const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');

        const first = points[0];
        const lastPoint = points[points.length - 1];
        const area =
            `${line} L ${lastPoint.x.toFixed(2)} ${this.scale.baselineY.toFixed(2)}` +
            ` L ${first.x.toFixed(2)} ${this.scale.baselineY.toFixed(2)} Z`;

        return { line, area, last: lastPoint };
    }
}

// ---------------------------------------------------------------------------
// MiniTrendChart — thin React wrapper composing the geometry helpers
// ---------------------------------------------------------------------------

const MiniTrendChart: React.FC<Props> = ({ trend, color, width = 96, height = 28, ariaLabel }) => {
    const padding = 3;

    const paths = useMemo(() => {
        const values = trend.map((t) => t.count);
        const scale = new SparklineScale(values, width, height, padding);
        return new SparklineGeometry(values, scale).build();
    }, [trend, width, height]);

    const gradientId = useMemo(() => `spark-grad-${Math.random().toString(36).slice(2)}`, []);

    // Nothing to draw (e.g. missing/empty trend) — render a flat placeholder.
    if (!paths.last) {
        return (
            <svg width={width} height={height} role="img" aria-label={ariaLabel || 'No trend data'}>
                <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke="var(--surface-300)" strokeWidth={1} strokeDasharray="3 3" />
            </svg>
        );
    }

    return (
        <svg width={width} height={height} role="img" aria-label={ariaLabel || 'Activity trend'} style={{ overflow: 'visible' }}>
            <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
            </defs>
            <path d={paths.area} fill={`url(#${gradientId})`} stroke="none" />
            <path d={paths.line} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={paths.last.x} cy={paths.last.y} r={2.2} fill={color} />
        </svg>
    );
};

export default MiniTrendChart;
