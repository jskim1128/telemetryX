'use client';

import React from 'react';
import Link from 'next/link';
import { Chart } from 'primereact/chart';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { SelectButton } from 'primereact/selectbutton';
import { Tag } from 'primereact/tag';
import AiSummaryCard from './AiSummaryCard';
import InteractiveTrendChart from './InteractiveTrendChart';

// ---------------------------------------------------------------------------
// Types shared with the dashboard page. Kept loose (`any`) for chart payloads
// to match the existing page conventions and avoid duplicating Chart.js types.
// ---------------------------------------------------------------------------

export type SeriesCategory = 'app_open' | 'feature' | 'tag';

export interface WidgetContext {
    appStats: any;
    // "Events over time" controls
    appSeriesCategory: SeriesCategory;
    setAppSeriesCategory: (v: SeriesCategory) => void;
    seriesOptions: Array<{ label: string; value: SeriesCategory; icon: string }>;
    seriesItemTemplate: (option: { label: string; value: SeriesCategory; icon: string }) => React.ReactNode;
    // Chart data (memoized in the page)
    appLine: { data: any; options: any };
    appDepartmentChart: any;
    appFeatureChart: any;
    appTagChart: any;
    appFeatureTrendChart: { data: any; options: any };
    appTagTrendChart: { data: any; options: any };
    featureTrendKey: string;
    tagTrendKey: string;
    // Misc helpers
    effectiveRangeForAi: { from: Date; to: Date } | null;
    detailsHref: string;
    typeLabel: (t: string) => string;
    // When true, charts/tables are non-interactive (edit/reorder mode).
    editing: boolean;
}

export interface DashboardWidget {
    id: string;
    /** Human-readable name shown in the customize panel. */
    title: string;
    /** Whether the widget is shown by default (before any user customization). */
    defaultVisible: boolean;
    /** PrimeFlex column classes controlling the widget's grid span. */
    colClass: string;
    /** Renders the widget body given the current dashboard context. */
    render: (ctx: WidgetContext) => React.ReactNode;
}

// Small presentational KPI card (moved from page.tsx). Renders WITHOUT the
// outer col wrapper — the grid wrapper is applied by the page loop.
const Kpi = ({ label, value, icon, bg, color }: { label: string; value: number; icon: string; bg: string; color: string }) => (
    <div className="card mb-0 h-full">
        <div className="flex justify-content-between mb-3">
            <div>
                <span className="block text-500 font-medium mb-3">{label}</span>
                <div className="text-900 font-medium text-xl">{(value ?? 0).toLocaleString()}</div>
            </div>
            <div className={`flex align-items-center justify-content-center ${bg} border-round`} style={{ width: '2.5rem', height: '2.5rem' }}>
                <i className={`pi ${icon} ${color} text-xl`} />
            </div>
        </div>
    </div>
);

/**
 * The full ordered registry of dashboard widgets. IDs are stable and used as
 * localStorage keys for order/visibility. Adding a new widget here makes it
 * appear automatically for existing users (the prefs hook appends unknown IDs).
 */
export const DASHBOARD_WIDGETS: DashboardWidget[] = [
    {
        id: 'ai-summary',
        title: 'AI Summary',
        defaultVisible: true,
        colClass: 'col-12',
        render: (ctx) => <AiSummaryCard appId={ctx.appStats.app.id} range={ctx.effectiveRangeForAi} />
    },
    {
        id: 'kpi-app-opens',
        title: 'KPI · App opens',
        defaultVisible: true,
        colClass: 'col-12 sm:col-6 xl:col-3',
        render: (ctx) => <Kpi label="App opens" value={ctx.appStats.overview.appOpens} icon="pi-sign-in" bg="bg-blue-100" color="text-blue-500" />
    },
    {
        id: 'kpi-feature-triggers',
        title: 'KPI · Feature triggers',
        defaultVisible: true,
        colClass: 'col-12 sm:col-6 xl:col-3',
        render: (ctx) => <Kpi label="Feature triggers" value={ctx.appStats.overview.featureTriggers} icon="pi-bolt" bg="bg-green-100" color="text-green-500" />
    },
    {
        id: 'kpi-tag-instances',
        title: 'KPI · Tag instances',
        defaultVisible: true,
        colClass: 'col-12 sm:col-6 xl:col-3',
        render: (ctx) => <Kpi label="Tag instances" value={ctx.appStats.overview.tagInstances} icon="pi-tag" bg="bg-orange-100" color="text-orange-500" />
    },
    {
        id: 'kpi-unique-users',
        title: 'KPI · Unique users',
        defaultVisible: true,
        colClass: 'col-12 sm:col-6 xl:col-3',
        render: (ctx) => <Kpi label="Unique users" value={ctx.appStats.overview.uniqueUsers} icon="pi-users" bg="bg-purple-100" color="text-purple-500" />
    },
    {
        id: 'events-over-time',
        title: 'Events over time',
        defaultVisible: true,
        colClass: 'col-12 xl:col-8',
        render: (ctx) => (
            <div className="card h-full flex flex-column">
                <div className="flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
                    <h5 className="m-0">Events over time</h5>
                    <SelectButton
                        value={ctx.appSeriesCategory}
                        options={ctx.seriesOptions}
                        itemTemplate={ctx.seriesItemTemplate}
                        onChange={(e) => {
                            if (e.value) ctx.setAppSeriesCategory(e.value as SeriesCategory);
                        }}
                        allowEmpty={false}
                    />
                </div>
                <div className="flex-1" style={{ position: 'relative', minHeight: '320px' }}>
                    <Chart type="line" data={ctx.appLine.data} options={ctx.appLine.options} style={{ height: '100%', width: '100%' }} />
                </div>
            </div>
        )
    },
    {
        id: 'by-department',
        title: 'By department',
        defaultVisible: true,
        colClass: 'col-12 xl:col-4',
        render: (ctx) => (
            <div className="card h-full flex flex-column">
                <h5>By department</h5>
                <div className="flex-1 flex align-items-center justify-content-center" style={{ minHeight: '320px' }}>
                    {ctx.appStats.departments.length === 0 ? (
                        <p className="text-500 m-0">No department data yet.</p>
                    ) : (
                        <Chart type="doughnut" data={ctx.appDepartmentChart} options={{ maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }} style={{ height: '100%', width: '100%', maxHeight: '320px' }} />
                    )}
                </div>
            </div>
        )
    },
    {
        id: 'top-features',
        title: 'Top features triggered',
        defaultVisible: true,
        colClass: 'col-12 lg:col-4',
        render: (ctx) => (
            <div className="card h-full flex flex-column">
                <div className="flex align-items-center justify-content-between gap-2 mb-2">
                    <h5 className="m-0">Top features triggered</h5>
                    <Link href={ctx.detailsHref} className="text-primary text-sm font-medium no-underline white-space-nowrap">
                        View full data <i className="pi pi-arrow-right" style={{ fontSize: '0.7rem' }} />
                    </Link>
                </div>
                <div className="flex-1 flex align-items-center justify-content-center" style={{ minHeight: '320px' }}>
                    {ctx.appStats.features.length === 0 ? (
                        <p className="text-500 m-0">No feature triggers yet.</p>
                    ) : (
                        <Chart type="pie" data={ctx.appFeatureChart} options={{ maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }} style={{ height: '100%', width: '100%', maxHeight: '320px' }} />
                    )}
                </div>
            </div>
        )
    },
    {
        id: 'top-features-trend',
        title: 'Top features trend',
        defaultVisible: true,
        colClass: 'col-12 lg:col-8',
        render: (ctx) => (
            <div className="card h-full flex flex-column">
                <h5>Top features trend</h5>
                <div className="flex-1" style={{ position: 'relative', minHeight: '320px' }}>
                    {ctx.appFeatureTrendChart.data.datasets.length === 0 ? (
                        <p className="text-500 m-0">No feature triggers yet.</p>
                    ) : (
                        <InteractiveTrendChart
                            key={ctx.featureTrendKey}
                            data={ctx.appFeatureTrendChart.data}
                            options={ctx.appFeatureTrendChart.options}
                        />
                    )}
                </div>
            </div>
        )
    },
    {
        id: 'top-tags',
        title: 'Top tags',
        defaultVisible: true,
        colClass: 'col-12 lg:col-4',
        render: (ctx) => (
            <div className="card h-full flex flex-column">
                <div className="flex align-items-center justify-content-between gap-2 mb-2">
                    <h5 className="m-0">Top tags</h5>
                    <Link href={ctx.detailsHref} className="text-primary text-sm font-medium no-underline white-space-nowrap">
                        View full data <i className="pi pi-arrow-right" style={{ fontSize: '0.7rem' }} />
                    </Link>
                </div>
                <div className="flex-1 flex align-items-center justify-content-center" style={{ minHeight: '320px' }}>
                    {ctx.appStats.tags.length === 0 ? (
                        <p className="text-500 m-0">No tag events yet.</p>
                    ) : (
                        <Chart type="pie" data={ctx.appTagChart} options={{ maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }} style={{ height: '100%', width: '100%', maxHeight: '320px' }} />
                    )}
                </div>
            </div>
        )
    },
    {
        id: 'top-tags-trend',
        title: 'Top tags trend',
        defaultVisible: true,
        colClass: 'col-12 lg:col-8',
        render: (ctx) => (
            <div className="card h-full flex flex-column">
                <h5>Top tags trend</h5>
                <div className="flex-1" style={{ position: 'relative', minHeight: '320px' }}>
                    {ctx.appTagTrendChart.data.datasets.length === 0 ? (
                        <p className="text-500 m-0">No tag events yet.</p>
                    ) : (
                        <InteractiveTrendChart
                            key={ctx.tagTrendKey}
                            data={ctx.appTagTrendChart.data}
                            options={ctx.appTagTrendChart.options}
                        />
                    )}
                </div>
            </div>
        )
    },
    {
        id: 'top-users',
        title: 'Top users',
        defaultVisible: true,
        colClass: 'col-12 lg:col-6',
        render: (ctx) => (
            <div className="card h-full flex flex-column">
                <h5>Top users</h5>
                <div className="flex-1">
                    <DataTable
                        value={ctx.appStats.users}
                        emptyMessage="No user activity yet."
                        responsiveLayout="scroll"
                        paginator
                        rows={5}
                        scrollable
                        scrollHeight="360px"
                    >
                        <Column field="email" header="Email" />
                        <Column
                            field="topEvent"
                            header="Top event"
                            body={(r: any) =>
                                r.topEvent ? (
                                    <span className="flex align-items-center gap-2">
                                        <Tag severity={r.topEventType === 'feature' ? 'success' : 'warning'} value={r.topEventType === 'feature' ? 'Feature' : 'Tag'} />
                                        <span>{r.topEvent}</span>
                                        <small className="text-500">({r.topEventCount})</small>
                                    </span>
                                ) : (
                                    <span className="text-500">—</span>
                                )
                            }
                        />
                        <Column field="count" header="Total events" sortable />
                    </DataTable>
                </div>
            </div>
        )
    },
    {
        id: 'recent-events',
        title: 'Recent events',
        defaultVisible: true,
        colClass: 'col-12 lg:col-6',
        render: (ctx) => (
            <div className="card h-full flex flex-column">
                <h5>Recent events</h5>
                <div className="flex-1">
                    <DataTable
                        value={ctx.appStats.recent}
                        emptyMessage="No events yet. Start sending tracking data via API."
                        paginator
                        rows={5}
                        responsiveLayout="scroll"
                        scrollable
                        scrollHeight="360px"
                    >
                        <Column header="When" body={(r: any) => new Date(r.createdAt).toLocaleString()} sortable sortField="createdAt" />
                        <Column header="Type" body={(r: any) => <Tag severity={r.type === 'app_open' ? 'info' : r.type === 'feature' ? 'success' : 'warning'} value={ctx.typeLabel(r.type)} />} />
                        <Column header="Details" body={(r: any) => r.label} />
                        <Column header="Email" field="email" />
                        <Column header="Department" body={(r: any) => r.department || <span className="text-500">—</span>} />
                    </DataTable>
                </div>
            </div>
        )
    }
];

/** All widget IDs in their default order. */
export const DEFAULT_WIDGET_ORDER: string[] = DASHBOARD_WIDGETS.map((w) => w.id);

/** Widget IDs hidden by default (currently none). */
export const DEFAULT_HIDDEN_WIDGETS: string[] = DASHBOARD_WIDGETS.filter((w) => !w.defaultVisible).map((w) => w.id);

/** Lookup a widget definition by id. */
export const WIDGET_BY_ID: Record<string, DashboardWidget> = Object.fromEntries(DASHBOARD_WIDGETS.map((w) => [w.id, w]));
