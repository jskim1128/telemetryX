'use client';

import React, { useMemo } from 'react';
import { Chart } from 'primereact/chart';
import { Skeleton } from 'primereact/skeleton';

/**
 * AppUsageCard
 *
 * A summary card describing how many people use (open) an app plus a trend
 * chart of daily active users across the selected range. Sits at the top of
 * the app "full data" page.
 *
 * Presentation logic is encapsulated in single-responsibility classes:
 *  - {@link ActiveUsersChartModel} turns the raw trend into Chart.js data/options.
 *  - {@link UsageMetric} describes one KPI tile.
 * The React component stays declarative and just composes them.
 */

export interface ActiveUsersPoint {
    day: string;
    users: number;
}

export interface AppUsageSummary {
    totalUsers: number;
    totalOpens: number;
    avgOpensPerUser: number;
    peakDailyUsers: number;
    trend: ActiveUsersPoint[];
}

// ---------------------------------------------------------------------------
// UsageMetric — a single KPI tile descriptor
// ---------------------------------------------------------------------------

class UsageMetric {
    constructor(
        readonly label: string,
        readonly value: number,
        readonly icon: string,
        readonly bg: string,
        readonly color: string,
        readonly hint?: string
    ) {}

    get displayValue(): string {
        return this.value.toLocaleString();
    }

    static fromSummary(summary: AppUsageSummary): UsageMetric[] {
        return [
            new UsageMetric('Total users', summary.totalUsers, 'pi-users', 'bg-blue-100', 'text-blue-600', 'Distinct people who opened the app'),
            new UsageMetric('App opens', summary.totalOpens, 'pi-sign-in', 'bg-green-100', 'text-green-600', 'Total open events in this range'),
            new UsageMetric('Avg opens / user', summary.avgOpensPerUser, 'pi-refresh', 'bg-purple-100', 'text-purple-600', 'How often each user comes back'),
            new UsageMetric('Peak daily users', summary.peakDailyUsers, 'pi-chart-line', 'bg-orange-100', 'text-orange-600', 'Busiest single day in this range')
        ];
    }
}

// ---------------------------------------------------------------------------
// ActiveUsersChartModel — build Chart.js data/options from the daily trend
// ---------------------------------------------------------------------------

class ActiveUsersChartModel {
    constructor(private readonly trend: ActiveUsersPoint[], private readonly accent: string = '#3b82f6') {}

    get isEmpty(): boolean {
        return this.trend.length === 0 || this.trend.every((p) => p.users === 0);
    }

    private get spansMultipleYears(): boolean {
        if (this.trend.length === 0) return false;
        return this.trend[0].day.slice(0, 4) !== this.trend[this.trend.length - 1].day.slice(0, 4);
    }

    private formatDay(dayKey: string): string {
        const [y, m, d] = dayKey.split('-').map((s) => Number(s));
        if (!y || !m || !d) return dayKey;
        return new Date(y, m - 1, d).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: this.spansMultipleYears ? 'numeric' : undefined
        });
    }

    get data() {
        const labels = this.trend.map((p) => this.formatDay(p.day));
        return {
            labels,
            datasets: [
                {
                    label: 'Active users',
                    data: this.trend.map((p) => p.users),
                    borderColor: this.accent,
                    backgroundColor: this.withAlpha(this.accent, 0.12),
                    tension: 0.35,
                    fill: true,
                    pointRadius: this.trend.length > 60 ? 0 : 2,
                    pointHoverRadius: 4,
                    borderWidth: 2
                }
            ]
        };
    }

    get options() {
        const maxTicks = Math.min(12, Math.max(1, this.trend.length));
        return {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: {
                    ticks: { autoSkip: true, maxTicksLimit: maxTicks, maxRotation: 0, minRotation: 0 },
                    grid: { display: false }
                },
                y: { beginAtZero: true, ticks: { precision: 0 } }
            }
        };
    }

    /** Apply an alpha to a #RRGGBB color; pass through anything else. */
    private withAlpha(color: string, alpha: number): string {
        if (typeof color !== 'string' || !color.startsWith('#') || color.length !== 7) return color;
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
}

interface Props {
    summary?: AppUsageSummary;
    loading?: boolean;
    /** Line color for the chart; defaults to a blue that matches the KPI tile. */
    accent?: string;
}

const AppUsageCard: React.FC<Props> = ({ summary, loading, accent = '#3b82f6' }) => {
    const metrics = useMemo(() => (summary ? UsageMetric.fromSummary(summary) : []), [summary]);
    const chart = useMemo(() => new ActiveUsersChartModel(summary?.trend ?? [], accent), [summary, accent]);

    return (
        <div className="card mb-0 h-full flex flex-column">
            {/* Header */}
            <div className="flex align-items-center gap-2 mb-3">
                <div className="flex align-items-center justify-content-center bg-blue-100 border-round flex-shrink-0" style={{ width: '2.5rem', height: '2.5rem' }}>
                    <i className="pi pi-users text-blue-600 text-xl" />
                </div>
                <div>
                    <h5 className="m-0">App usage</h5>
                    <small className="text-500">Active users and app opens over the selected range</small>
                </div>
            </div>

            {loading && !summary ? (
                <div className="grid">
                    {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="col-6 md:col-3">
                            <Skeleton height="4.5rem" />
                        </div>
                    ))}
                    <div className="col-12">
                        <Skeleton height="14rem" />
                    </div>
                </div>
            ) : (
                <>
                    {/* KPI tiles */}
                    <div className="grid">
                        {metrics.map((m) => (
                            <div key={m.label} className="col-6 md:col-3">
                                <div className="surface-card border-1 surface-border border-round p-3 h-full">
                                    <div className="flex align-items-center gap-2 mb-2">
                                        <div className={`flex align-items-center justify-content-center ${m.bg} border-round flex-shrink-0`} style={{ width: '2rem', height: '2rem' }}>
                                            <i className={`pi ${m.icon} ${m.color}`} />
                                        </div>
                                        <span className="text-500 text-sm" title={m.hint}>{m.label}</span>
                                    </div>
                                    <span className="text-900 font-bold text-2xl">{m.displayValue}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Active users trend */}
                    <div className="mt-3 flex-1 flex flex-column">
                        <span className="text-700 font-semibold text-sm mb-2">
                            <i className="pi pi-chart-line mr-2 text-500" style={{ fontSize: '0.8rem' }} />
                            Daily active users
                        </span>
                        <div className="flex-1" style={{ position: 'relative', minHeight: '260px' }}>
                            {chart.isEmpty ? (
                                <div className="flex align-items-center justify-content-center h-full">
                                    <p className="text-500 m-0">No app opens in this range.</p>
                                </div>
                            ) : (
                                <Chart type="line" data={chart.data} options={chart.options} style={{ height: '100%', width: '100%' }} />
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default AppUsageCard;
