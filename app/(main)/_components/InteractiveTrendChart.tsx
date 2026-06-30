'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Chart } from 'primereact/chart';

/**
 * InteractiveTrendChart
 *
 * Multi-line trend chart with two interactions on top of Chart.js:
 *  1. Hover a line  -> that line stands out, others fade.
 *  2. Click a line  -> hide the others (isolate). Click again -> restore.
 *
 * The implementation is split into small classes with single responsibilities
 * so each concern (color math, hit detection, styling, options, DOM event
 * wiring) can be reasoned about and tested in isolation. The React component
 * itself is intentionally thin and just composes them.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChartDataset {
    label?: string;
    data: number[];
    borderColor?: string;
    backgroundColor?: string;
    borderWidth?: number;
    hidden?: boolean;
    [key: string]: any;
}

interface ChartData {
    labels?: any[];
    datasets: ChartDataset[];
}

interface DatasetBaseStyle {
    borderColor: string;
    backgroundColor: string;
    borderWidth: number;
}

interface Props {
    /** Chart.js `data` object: `{ labels, datasets }`. */
    data: ChartData;
    /** Chart.js `options` object. Hover/click handlers will be replaced. */
    options: any;
}

// ---------------------------------------------------------------------------
// ColorUtils — hex/rgba conversion helpers
// ---------------------------------------------------------------------------

class ColorUtils {
    /**
     * Apply an alpha component to a color string.
     *
     * Supports `#RRGGBB` and `#RGB`. For any other format we return the
     * input unchanged — Chart.js will still render it, just without the
     * requested transparency.
     */
    static withAlpha(color: string, alpha: number): string {
        if (typeof color !== 'string') return color;
        if (!color.startsWith('#')) return color;

        let r: number;
        let g: number;
        let b: number;
        if (color.length === 7) {
            r = parseInt(color.slice(1, 3), 16);
            g = parseInt(color.slice(3, 5), 16);
            b = parseInt(color.slice(5, 7), 16);
        } else if (color.length === 4) {
            r = parseInt(color[1] + color[1], 16);
            g = parseInt(color[2] + color[2], 16);
            b = parseInt(color[3] + color[3], 16);
        } else {
            return color;
        }
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
}

// ---------------------------------------------------------------------------
// DatasetHitDetector — figure out which line the cursor is hovering over
// ---------------------------------------------------------------------------

/**
 * Chart.js's built-in 'nearest' modes find the nearest *data point* across
 * all datasets, which biases toward whichever dataset has a point near the
 * cursor x and makes hover feel "stuck" on a single line. This class walks
 * each dataset's polyline and interpolates the line's y at the cursor x,
 * then returns the dataset whose interpolated y is closest to the cursor y.
 */
class DatasetHitDetector {
    /** Max distance in pixels from a line for it to count as a hit. */
    constructor(private readonly threshold: number = 24) {}

    /**
     * Return the index of the dataset whose line is closest to the cursor,
     * or null when the cursor is outside the chart area or no line is
     * within `threshold` pixels.
     */
    detect(chart: any, cursorX: number, cursorY: number): number | null {
        const area = chart?.chartArea;
        if (!area) return null;
        if (cursorX < area.left || cursorX > area.right) return null;
        if (cursorY < area.top || cursorY > area.bottom) return null;

        let bestIdx: number | null = null;
        let bestDist = Infinity;

        for (let i = 0; i < chart.data.datasets.length; i++) {
            const meta = chart.getDatasetMeta(i);
            if (!meta || meta.hidden) continue;

            const yAtCursor = this.interpolateYAt(meta.data, cursorX);
            if (yAtCursor === null) continue;

            const dist = Math.abs(yAtCursor - cursorY);
            if (dist < bestDist) {
                bestDist = dist;
                bestIdx = i;
            }
        }

        if (bestIdx === null || bestDist > this.threshold) return null;
        return bestIdx;
    }

    /**
     * Linearly interpolate the y-pixel of the polyline at the given cursor x.
     * Returns null when there is no segment covering this x.
     */
    private interpolateYAt(points: ReadonlyArray<{ x: number; y: number }>, cursorX: number): number | null {
        if (!points || points.length === 0) return null;

        let left: { x: number; y: number } | null = null;
        let right: { x: number; y: number } | null = null;

        for (let j = 0; j < points.length; j++) {
            const p = points[j];
            if (p.x <= cursorX) left = p;
            if (p.x >= cursorX && right === null) {
                right = p;
                break;
            }
        }

        if (!left && !right) return null;
        if (left && right && left !== right && right.x !== left.x) {
            const t = (cursorX - left.x) / (right.x - left.x);
            return left.y + (right.y - left.y) * t;
        }
        return (left ?? right)!.y;
    }
}

// ---------------------------------------------------------------------------
// TrendChartStyler — derive styled datasets from (focused, isolated) state
// ---------------------------------------------------------------------------

class TrendChartStyler {
    constructor(
        private readonly baseStyles: ReadonlyArray<DatasetBaseStyle>,
        private readonly activeBorderWidth: number = 3,
        private readonly fadedAlpha: number = 0.15,
        private readonly fadedBorderWidth: number = 1
    ) {}

    /**
     * Snapshot the original per-dataset style so we can restore exact colors
     * when leaving a hover/isolate state without depending on Chart.js
     * internals.
     */
    static snapshot(datasets: ReadonlyArray<ChartDataset>): DatasetBaseStyle[] {
        return datasets.map((ds) => ({
            borderColor: (ds.borderColor as string) ?? '#999999',
            backgroundColor: (ds.backgroundColor as string) ?? '#999999',
            borderWidth: ds.borderWidth ?? 2
        }));
    }

    /**
     * Produce a new `data` object with datasets styled according to the
     * current focused (hover) and isolated (click) indices.
     */
    apply(data: ChartData, focused: number | null, isolated: number | null): ChartData {
        const datasets = data.datasets.map((ds, i) => this.styleOne(ds, i, focused, isolated));
        return { ...data, datasets };
    }

    private styleOne(ds: ChartDataset, i: number, focused: number | null, isolated: number | null): ChartDataset {
        const base = this.baseStyles[i];
        if (!base) return ds;

        // Isolation hides all other lines outright.
        if (isolated !== null && i !== isolated) {
            return { ...ds, hidden: true };
        }

        // Hover focus: dim the others (only when nothing is isolated).
        if (focused !== null && i !== focused && isolated === null) {
            return {
                ...ds,
                hidden: false,
                borderColor: ColorUtils.withAlpha(base.borderColor, this.fadedAlpha),
                backgroundColor: ColorUtils.withAlpha(base.backgroundColor, this.fadedAlpha),
                borderWidth: this.fadedBorderWidth
            };
        }

        const isActive = focused === i || isolated === i;
        return {
            ...ds,
            hidden: false,
            borderColor: base.borderColor,
            backgroundColor: base.backgroundColor,
            borderWidth: isActive ? this.activeBorderWidth : base.borderWidth
        };
    }
}

// ---------------------------------------------------------------------------
// TrendChartOptionsBuilder — produce an animation-free options object
// ---------------------------------------------------------------------------

/**
 * Wraps the caller's `options` with the settings needed for instant
 * style updates (no easing) and disables Chart.js's own hover handler so
 * our DOM-level controller is the single source of truth.
 */
class TrendChartOptionsBuilder {
    constructor(private readonly baseOptions: any) {}

    build(): any {
        return {
            ...this.baseOptions,
            animation: false,
            animations: { colors: false, x: false, y: false },
            transitions: {
                active: { animation: { duration: 0 } },
                resize: { animation: { duration: 0 } }
            },
            hover: { mode: undefined as any },
            interaction: { mode: 'nearest', intersect: false, axis: 'x' }
        };
    }
}

// ---------------------------------------------------------------------------
// InteractionController — bind native pointer events to the canvas
// ---------------------------------------------------------------------------

interface InteractionCallbacks {
    /** Read the current isolated dataset index (live, not snapshotted). */
    readIsolated: () => number | null;
    /** Read the current focused dataset index (live, not snapshotted). */
    readFocused: () => number | null;
    /** Called when the hovered dataset changes (or null when none). */
    onFocusChange: (idx: number | null) => void;
    /** Called when the user clicks a dataset to toggle isolation. */
    onToggleIsolate: (idx: number) => void;
    /** Returns the live Chart.js instance, or null if not yet mounted. */
    getChart: () => any | null;
}

/**
 * Manages the lifecycle of native `pointermove` / `pointerleave` / `click`
 * listeners on the canvas. Pointer moves are throttled with
 * `requestAnimationFrame` so we never run hit detection more than once per
 * frame, even on high-DPI mice.
 *
 * Why native events instead of Chart.js's `onHover`/`onClick`?
 *  - We avoid rebuilding the options object on every state change, which
 *    would force Chart.js to re-init and cause flicker.
 *  - We get pointer x/y directly, with no dependency on Chart.js's hit
 *    detection (which we are deliberately bypassing — see DatasetHitDetector).
 */
class InteractionController {
    private canvas: HTMLCanvasElement | null = null;
    private rafId = 0;
    private pendingEvent: PointerEvent | null = null;
    private attachAttempts = 0;
    private attachTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly detector: DatasetHitDetector;

    private readonly handleMove = (evt: PointerEvent): void => {
        this.pendingEvent = evt;
        if (!this.rafId) this.rafId = window.requestAnimationFrame(this.processMove);
    };

    private readonly handleLeave = (): void => {
        if (this.rafId) {
            window.cancelAnimationFrame(this.rafId);
            this.rafId = 0;
        }
        this.pendingEvent = null;
        if (this.callbacks.readFocused() !== null) this.callbacks.onFocusChange(null);
        if (this.canvas) this.canvas.style.cursor = 'default';
    };

    private readonly handleClick = (evt: PointerEvent): void => {
        if (!this.canvas) return;
        const chart = this.callbacks.getChart();
        if (!chart) return;
        const { x, y } = this.cursorPos(evt);
        const idx = this.detector.detect(chart, x, y);
        if (idx === null) return;
        const isolated = this.callbacks.readIsolated();
        // If a line is isolated, only that line accepts clicks (to un-isolate).
        if (isolated !== null && idx !== isolated) return;
        this.callbacks.onToggleIsolate(idx);
    };

    private readonly processMove = (): void => {
        this.rafId = 0;
        const evt = this.pendingEvent;
        this.pendingEvent = null;
        if (!evt || !this.canvas) return;
        const chart = this.callbacks.getChart();
        if (!chart) return;

        const { x, y } = this.cursorPos(evt);
        const idx = this.detector.detect(chart, x, y);

        if (idx === null) {
            if (this.callbacks.readFocused() !== null) this.callbacks.onFocusChange(null);
            this.canvas.style.cursor = 'default';
            return;
        }
        const isolated = this.callbacks.readIsolated();
        // Don't visually highlight a line that's currently hidden behind isolate.
        if (isolated !== null && idx !== isolated) {
            if (this.callbacks.readFocused() !== null) this.callbacks.onFocusChange(null);
            this.canvas.style.cursor = 'default';
            return;
        }

        this.canvas.style.cursor = 'pointer';
        if (this.callbacks.readFocused() !== idx) this.callbacks.onFocusChange(idx);
    };

    constructor(private readonly container: HTMLElement, private readonly callbacks: InteractionCallbacks, hitThreshold = 24) {
        this.detector = new DatasetHitDetector(hitThreshold);
    }

    /** Begin listening. Safe to call once per controller instance. */
    attach(): void {
        this.tryBindCanvas();
    }

    /** Stop listening and release timers/RAF. */
    dispose(): void {
        if (this.attachTimer) {
            clearTimeout(this.attachTimer);
            this.attachTimer = null;
        }
        if (this.rafId) {
            window.cancelAnimationFrame(this.rafId);
            this.rafId = 0;
        }
        this.pendingEvent = null;
        if (this.canvas) {
            this.canvas.removeEventListener('pointermove', this.handleMove);
            this.canvas.removeEventListener('pointerleave', this.handleLeave);
            this.canvas.removeEventListener('click', this.handleClick);
            this.canvas = null;
        }
    }

    private tryBindCanvas(): void {
        const canvas = this.container.querySelector('canvas');
        if (!canvas) {
            // The chart's canvas is created asynchronously by PrimeReact;
            // poll a few times until it appears.
            if (this.attachAttempts++ < 20) {
                this.attachTimer = setTimeout(() => this.tryBindCanvas(), 50);
            }
            return;
        }
        this.canvas = canvas as HTMLCanvasElement;
        this.canvas.addEventListener('pointermove', this.handleMove);
        this.canvas.addEventListener('pointerleave', this.handleLeave);
        this.canvas.addEventListener('click', this.handleClick);
    }

    private cursorPos(evt: PointerEvent): { x: number; y: number } {
        const rect = this.canvas!.getBoundingClientRect();
        return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
    }
}

// ---------------------------------------------------------------------------
// InteractiveTrendChart — thin React component composing the pieces above
// ---------------------------------------------------------------------------

const InteractiveTrendChart: React.FC<Props> = ({ data, options }) => {
    const chartRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [focused, setFocused] = useState<number | null>(null);
    const [isolated, setIsolated] = useState<number | null>(null);

    // Latest state in refs so the InteractionController (created once) can
    // read current values without triggering option-object rebuilds.
    const focusedRef = useRef<number | null>(null);
    const isolatedRef = useRef<number | null>(null);
    useEffect(() => {
        focusedRef.current = focused;
    }, [focused]);
    useEffect(() => {
        isolatedRef.current = isolated;
    }, [isolated]);

    // Re-snapshot base styles whenever the incoming data identity changes
    // (parent uses a `key` to remount on dataset shape changes, but defending
    // here keeps the component robust to in-place updates).
    const baseStyles = useMemo(() => TrendChartStyler.snapshot(data.datasets || []), [data]);
    const styler = useMemo(() => new TrendChartStyler(baseStyles), [baseStyles]);

    const styledData = useMemo(() => styler.apply(data, focused, isolated), [styler, data, focused, isolated]);

    const interactiveOptions = useMemo(() => new TrendChartOptionsBuilder(options).build(), [options]);

    // Wire pointer events to the canvas once the container is mounted.
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const controller = new InteractionController(container, {
            readFocused: () => focusedRef.current,
            readIsolated: () => isolatedRef.current,
            onFocusChange: (idx) => setFocused(idx),
            onToggleIsolate: (idx) => setIsolated((prev) => (prev === idx ? null : idx)),
            getChart: () => {
                const ref = chartRef.current;
                if (!ref) return null;
                // PrimeReact's Chart exposes getChart() returning the Chart.js instance.
                if (typeof ref.getChart === 'function') return ref.getChart();
                return ref;
            }
        });
        controller.attach();

        return () => controller.dispose();
    }, []);

    return (
        <div ref={containerRef} style={{ height: '100%', width: '100%' }}>
            <Chart
                ref={chartRef}
                type="line"
                data={styledData}
                options={interactiveOptions}
                style={{ height: '100%', width: '100%' }}
            />
        </div>
    );
};

export default InteractiveTrendChart;
