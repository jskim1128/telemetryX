'use client';

import React from 'react';
import { Skeleton } from 'primereact/skeleton';

/**
 * Skeleton placeholder for the dashboard body.
 *
 * This mirrors the app-specific dashboard layout in `page.tsx` (KPI row,
 * events-over-time chart + department doughnut, the two chart rows, and the
 * two data tables) so the transition into real content has no layout shift.
 *
 * It is exported both as the Next.js App Router route-level `loading.tsx`
 * default (shown during initial server navigation) AND as a named
 * `DashboardSkeleton` that `page.tsx` renders while it re-fetches data on the
 * client (app switch / date-range change), which route-level loading UI does
 * not cover.
 */

/** A single KPI tile skeleton matching <KpiCard />. */
const KpiSkeleton = () => (
    <div className="col-12 md:col-6 lg:col-3">
        <div className="card mb-0">
            <div className="flex align-items-center gap-3">
                <Skeleton shape="circle" size="2.5rem" />
                <div className="flex-1">
                    <Skeleton width="60%" height="0.75rem" className="mb-2" />
                    <Skeleton width="40%" height="1.5rem" />
                </div>
            </div>
        </div>
    </div>
);

/** A chart card skeleton with an optional header row. */
const ChartCardSkeleton = ({ colClass, titleWidth = '10rem' }: { colClass: string; titleWidth?: string }) => (
    <div className={colClass}>
        <div className="card h-full flex flex-column">
            <div className="flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
                <Skeleton width={titleWidth} height="1.25rem" />
                <Skeleton width="8rem" height="2rem" />
            </div>
            <div className="flex-1" style={{ minHeight: '320px' }}>
                <Skeleton width="100%" height="320px" />
            </div>
        </div>
    </div>
);

/** A data-table card skeleton (header + several rows). */
const TableCardSkeleton = ({ colClass }: { colClass: string }) => (
    <div className={colClass}>
        <div className="card h-full flex flex-column">
            <Skeleton width="10rem" height="1.25rem" className="mb-3" />
            <div className="flex-1">
                {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex align-items-center gap-3 py-2">
                        <Skeleton width="35%" height="1rem" />
                        <Skeleton width="35%" height="1rem" />
                        <Skeleton width="20%" height="1rem" />
                    </div>
                ))}
            </div>
        </div>
    </div>
);

export const DashboardSkeleton = () => {
    return (
        <div className="grid" aria-busy="true" aria-label="Loading dashboard">
            {/* AI summary card */}
            <div className="col-12">
                <div className="card mb-0">
                    <Skeleton width="30%" height="1.25rem" className="mb-3" />
                    {/* KPI chip row + trend */}
                    <div className="flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
                        <div className="flex flex-wrap gap-2">
                            {[0, 1, 2, 3].map((i) => (
                                <Skeleton key={i} width="8.5rem" height="3rem" borderRadius="8px" />
                            ))}
                        </div>
                        <Skeleton width="8rem" height="2.5rem" borderRadius="8px" />
                    </div>
                    <Skeleton width="100%" className="mb-2" />
                    <Skeleton width="90%" className="mb-2" />
                    <Skeleton width="75%" />
                </div>
            </div>

            {/* KPI row */}
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />

            {/* Events over time + By department */}
            <ChartCardSkeleton colClass="col-12 xl:col-8" titleWidth="12rem" />
            <ChartCardSkeleton colClass="col-12 xl:col-4" titleWidth="9rem" />

            {/* Top features pie + trend */}
            <ChartCardSkeleton colClass="col-12 lg:col-4" titleWidth="12rem" />
            <ChartCardSkeleton colClass="col-12 lg:col-8" titleWidth="12rem" />

            {/* Top tags pie + trend */}
            <ChartCardSkeleton colClass="col-12 lg:col-4" titleWidth="8rem" />
            <ChartCardSkeleton colClass="col-12 lg:col-8" titleWidth="10rem" />

            {/* Top users + Recent events tables */}
            <TableCardSkeleton colClass="col-12 lg:col-6" />
            <TableCardSkeleton colClass="col-12 lg:col-6" />
        </div>
    );
};

export default function Loading() {
    return <DashboardSkeleton />;
}
