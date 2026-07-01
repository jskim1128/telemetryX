'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Avatar } from 'primereact/avatar';
import { Badge } from 'primereact/badge';
import { Button } from 'primereact/button';
import { Calendar } from 'primereact/calendar';
import { Column } from 'primereact/column';
import { DataTable } from 'primereact/datatable';
import { DataView } from 'primereact/dataview';
import { InputText } from 'primereact/inputtext';
import { Message } from 'primereact/message';
import { OverlayPanel } from 'primereact/overlaypanel';
import { ProgressBar } from 'primereact/progressbar';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Tag } from 'primereact/tag';
import { Toast } from 'primereact/toast';
import { getBackgroundAndTextColorTuples } from '@/lib/colors';

interface FeatureDetailRow {
    featureName: string;
    count: number;
    uniqueUsers: number;
    firstSeen: string | null;
    lastSeen: string | null;
}

interface TagDetailRow {
    tag: string;
    count: number;
    uniqueUsers: number;
    firstSeen: string | null;
    lastSeen: string | null;
}

interface DetailResp {
    app: { id: string; name: string };
    range: { from: string; to: string };
    overview: {
        appOpens: number;
        featureTriggers: number;
        tagInstances: number;
        uniqueUsers: number;
    };
    features: FeatureDetailRow[];
    tags: TagDetailRow[];
}

// ---------------------------------------------------------------------------
// Date range helpers (mirrors the dashboard's behaviour)
// ---------------------------------------------------------------------------
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function rangeFromDays(days: number): [Date, Date] {
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    return [from, to];
}

function yearToDateRange(): [Date, Date] {
    const to = new Date();
    const from = new Date(to.getFullYear(), 0, 1);
    return [from, to];
}

type RangePresetKey = '7d' | '30d' | '90d' | 'ytd' | 'custom';

interface RangePreset {
    key: RangePresetKey;
    label: string;
    build: () => [Date, Date];
}

const RANGE_PRESETS: RangePreset[] = [
    { key: '7d', label: 'Past week', build: () => rangeFromDays(7) },
    { key: '30d', label: 'Past month', build: () => rangeFromDays(30) },
    { key: '90d', label: 'Past quarter', build: () => rangeFromDays(90) },
    { key: 'ytd', label: 'Past year', build: yearToDateRange }
];

function detectPreset(range: [Date | null, Date | null]): RangePresetKey {
    const [from, to] = range;
    if (!from || !to) return 'custom';
    const dayMs = 24 * 60 * 60 * 1000;
    for (const preset of RANGE_PRESETS) {
        const [pFrom, pTo] = preset.build();
        if (Math.abs(to.getTime() - pTo.getTime()) <= dayMs && Math.abs(from.getTime() - pFrom.getTime()) <= dayMs) {
            return preset.key;
        }
    }
    return 'custom';
}

function formatRangeSummary(range: [Date | null, Date | null]): string {
    const [from, to] = range;
    if (!from || !to) return '';
    const fmt = (d: Date) => `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    return `${fmt(from)} → ${fmt(to)}`;
}

function effectiveRange(range: [Date | null, Date | null]): { from: Date; to: Date } | null {
    const [rawFrom, rawTo] = range;
    if (!rawFrom || !rawTo) return null;
    const from = new Date(rawFrom);
    from.setHours(0, 0, 0, 0);
    const toEnd = new Date(rawTo);
    toEnd.setHours(23, 59, 59, 999);
    const now = new Date();
    const to = new Date(Math.max(toEnd.getTime(), now.getTime()));
    return { from, to };
}

/** Build the initial range from the URL (from/to ISO) or default to 30 days. */
function initialRangeFromParams(fromStr: string | null, toStr: string | null): [Date, Date] {
    if (fromStr && toStr) {
        const from = new Date(fromStr);
        const to = new Date(toStr);
        if (!isNaN(from.getTime()) && !isNaN(to.getTime())) return [from, to];
    }
    return rangeFromDays(30);
}

function formatDateTime(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString();
}

const AppDetailsPage = () => {
    const params = useParams<{ id: string }>();
    const id = params?.id as string;
    const router = useRouter();
    const searchParams = useSearchParams();
    const toast = useRef<Toast>(null);
    const rangeOverlay = useRef<OverlayPanel>(null);

    const [range, setRange] = useState<[Date | null, Date | null]>(
        initialRangeFromParams(searchParams?.get('from') || null, searchParams?.get('to') || null)
    );
    const activePreset = useMemo(() => detectPreset(range), [range]);

    const [data, setData] = useState<DetailResp | null>(null);
    const [loading, setLoading] = useState(false);

    const [featureFilter, setFeatureFilter] = useState('');
    const [tagFilter, setTagFilter] = useState('');

    const load = async () => {
        if (!id) return;
        const eff = effectiveRange(range);
        if (!eff) return;
        setLoading(true);
        try {
            const qs = new URLSearchParams();
            qs.set('from', eff.from.toISOString());
            qs.set('to', eff.to.toISOString());
            const res = await fetch(`/api/stats/app/${id}/details?${qs.toString()}`, { cache: 'no-store' });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || 'Failed to load details');
            setData(json);
        } catch (err: any) {
            toast.current?.show({ severity: 'error', summary: 'Error', detail: err.message });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, range]);

    const backToDashboard = () => {
        const eff = effectiveRange(range);
        const qs = new URLSearchParams();
        qs.set('app', id);
        router.push(`/?${qs.toString()}`);
    };

    // Filter (by name) + sort (by count desc) for the list views. Sorting is
    // fixed to most-triggered first so the list reads like a leaderboard.
    const filteredFeatures = useMemo(() => {
        const q = featureFilter.trim().toLowerCase();
        const rows = q ? (data?.features || []).filter((f) => f.featureName.toLowerCase().includes(q)) : data?.features || [];
        return [...rows].sort((a, b) => b.count - a.count);
    }, [data, featureFilter]);

    const filteredTags = useMemo(() => {
        const q = tagFilter.trim().toLowerCase();
        const rows = q ? (data?.tags || []).filter((t) => t.tag.toLowerCase().includes(q)) : data?.tags || [];
        return [...rows].sort((a, b) => b.count - a.count);
    }, [data, tagFilter]);

    // Max counts drive the proportional bar widths in each list.
    const maxFeatureCount = useMemo(() => filteredFeatures.reduce((m, f) => Math.max(m, f.count), 0), [filteredFeatures]);
    const maxTagCount = useMemo(() => filteredTags.reduce((m, t) => Math.max(m, t.count), 0), [filteredTags]);

    return (
        <div className="grid">
            <Toast ref={toast} />

            {/* Header: title + range picker */}
            <div className="col-12">
                <div className="px-5 mb-4">
                    <div className="flex flex-column md:flex-row md:align-items-end gap-3 flex-wrap">
                        <div className="flex-1">
                            <div className="flex align-items-center gap-2 flex-wrap">
                                <Button icon="pi pi-arrow-left" text rounded severity="secondary" onClick={backToDashboard} tooltip="Back to dashboard" tooltipOptions={{ position: 'top' }} />
                                <h3 className="m-0">{data ? `${data.app.name} — Full data` : 'Full data'}</h3>
                            </div>
                            <span className="text-500 text-sm ml-5 pl-2">Complete list of every feature and tag recorded in the selected range.</span>
                        </div>
                        <div className="flex flex-row gap-3 align-items-center">
                            <button
                                type="button"
                                onClick={(e) => rangeOverlay.current?.toggle(e)}
                                className="date-range-trigger flex align-items-center gap-2 surface-card border-1 surface-border border-round px-3 py-2 cursor-pointer"
                                style={{ minWidth: '15rem' }}
                                aria-label="Change date range"
                            >
                                <i className="pi pi-calendar text-primary" />
                                <div className="flex flex-column align-items-start flex-1 line-height-2">
                                    <span className="text-900 font-medium">
                                        {activePreset === 'custom' ? 'Custom range' : RANGE_PRESETS.find((p) => p.key === activePreset)?.label}
                                    </span>
                                    <span className="text-500" style={{ fontSize: '0.7rem' }}>{formatRangeSummary(range) || 'Pick a range'}</span>
                                </div>
                                <i className="pi pi-chevron-down text-500" style={{ fontSize: '0.7rem' }} />
                            </button>

                            <OverlayPanel ref={rangeOverlay} showCloseIcon={false} dismissable className="date-range-overlay">
                                <div className="flex" style={{ minWidth: '32rem' }}>
                                    <div className="flex flex-column gap-1 pr-3 border-right-1 surface-border" style={{ minWidth: '10rem' }}>
                                        <span className="text-500 text-xs font-semibold uppercase mb-1 px-2">Quick select</span>
                                        {RANGE_PRESETS.map((preset) => {
                                            const isActive = activePreset === preset.key;
                                            return (
                                                <button
                                                    key={preset.key}
                                                    type="button"
                                                    onClick={() => {
                                                        setRange(preset.build());
                                                        rangeOverlay.current?.hide();
                                                    }}
                                                    className={`date-range-preset flex align-items-center justify-content-between gap-2 px-2 py-2 border-round border-none cursor-pointer text-left text-sm ${isActive ? 'bg-primary-50 text-primary font-semibold' : 'surface-card text-700'}`}
                                                >
                                                    <span>{preset.label}</span>
                                                    {isActive && <i className="pi pi-check" style={{ fontSize: '0.75rem' }} />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <div className="pl-3 flex flex-column">
                                        <span className="text-500 text-xs font-semibold uppercase mb-2">Custom range</span>
                                        <Calendar
                                            value={range as any}
                                            onChange={(e) => setRange(e.value as any)}
                                            selectionMode="range"
                                            inline
                                            numberOfMonths={1}
                                            maxDate={new Date()}
                                            readOnlyInput
                                        />
                                        <div className="flex justify-content-between align-items-center mt-2 pt-2 border-top-1 surface-border">
                                            <small className="text-500">{range[0] && range[1] ? formatRangeSummary(range) : 'Select start and end dates'}</small>
                                            <Button label="Done" size="small" onClick={() => rangeOverlay.current?.hide()} disabled={!range[0] || !range[1]} />
                                        </div>
                                    </div>
                                </div>
                            </OverlayPanel>

                            <Button icon="pi pi-refresh" onClick={load} loading={loading} severity="secondary" outlined tooltip="Refresh data" tooltipOptions={{ position: 'top' }} />
                        </div>
                    </div>
                </div>
            </div>

            {loading && !data ? (
                <div className="col-12">
                    <div className="flex justify-content-center py-6">
                        <ProgressSpinner style={{ width: '3rem', height: '3rem' }} strokeWidth="4" />
                    </div>
                </div>
            ) : (
                <>
                    {/* KPI summary */}
                    {data && (
                        <>
                            <SummaryCard label="Total features" value={data.features.length} icon="pi-bolt" bg="bg-green-100" color="text-green-500" />
                            <SummaryCard label="Feature triggers" value={data.overview.featureTriggers} icon="pi-chart-bar" bg="bg-green-100" color="text-green-500" />
                            <SummaryCard label="Total tags" value={data.tags.length} icon="pi-tag" bg="bg-orange-100" color="text-orange-500" />
                            <SummaryCard label="Tag instances" value={data.overview.tagInstances} icon="pi-chart-bar" bg="bg-orange-100" color="text-orange-500" />
                        </>
                    )}

                    {/* Features list */}
                    <div className="col-12 xl:col-6">
                        <div className="card h-full flex flex-column" style={{ maxHeight: '700px', overflow: 'auto' }}>
                            <div className="flex flex-column md:flex-row md:justify-content-between md:align-items-center gap-2 mb-3">
                                <div>
                                    <h5 className="m-0">All features</h5>
                                    <span className="text-500 text-sm">{data ? `${data.features.length} feature(s)` : '—'}</span>
                                </div>
                                <span className="p-input-icon-left">
                                    <i className="pi pi-search" />
                                    <InputText value={featureFilter} onChange={(e) => setFeatureFilter(e.target.value)} placeholder="Search features…" />
                                </span>
                            </div>
                            <DetailList
                                appId={id}
                                type="feature"
                                range={effectiveRange(range)}
                                rows={filteredFeatures.map((f) => ({
                                    key: f.featureName,
                                    name: f.featureName,
                                    count: f.count,
                                    uniqueUsers: f.uniqueUsers,
                                    lastSeen: f.lastSeen
                                }))}
                                max={maxFeatureCount}
                                icon="pi-bolt"
                                countLabel="triggers"
                                emptyMessage="No feature triggers in this range."
                            />
                        </div>
                    </div>

                    {/* Tags list */}
                    <div className="col-12 xl:col-6">
                        <div className="card h-full flex flex-column" style={{ maxHeight: '700px', overflow: 'auto' }}>
                            <div className="flex flex-column md:flex-row md:justify-content-between md:align-items-center gap-2 mb-3">
                                <div>
                                    <h5 className="m-0">All tags</h5>
                                    <span className="text-500 text-sm">{data ? `${data.tags.length} tag(s)` : '—'}</span>
                                </div>
                                <span className="p-input-icon-left">
                                    <i className="pi pi-search" />
                                    <InputText value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} placeholder="Search tags…" />
                                </span>
                            </div>
                            <DetailList
                                appId={id}
                                type="tag"
                                range={effectiveRange(range)}
                                rows={filteredTags.map((t) => ({
                                    key: t.tag,
                                    name: t.tag,
                                    count: t.count,
                                    uniqueUsers: t.uniqueUsers,
                                    lastSeen: t.lastSeen
                                }))}
                                max={maxTagCount}
                                icon="pi-tag"
                                countLabel="instances"
                                emptyMessage="No tag events in this range."
                            />
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

interface ListRow {
    key: string;
    name: string;
    count: number;
    uniqueUsers: number;
    lastSeen: string | null;
}

interface EventInstance {
    id: string;
    email: string;
    department: string | null;
    createdAt: string;
}

const DetailList = ({
    appId,
    type,
    range,
    rows,
    max,
    icon,
    countLabel,
    emptyMessage
}: {
    appId: string;
    type: 'feature' | 'tag';
    range: { from: Date; to: Date } | null;
    rows: ListRow[];
    max: number;
    icon: string;
    countLabel: string;
    emptyMessage: string;
}) => {
    // Which row (by name) is currently expanded — only one at a time.
    const [expanded, setExpanded] = useState<string | null>(null);
    // Lazy-loaded instances keyed by row name, plus loading/error state.
    const [instances, setInstances] = useState<Record<string, EventInstance[]>>({});
    const [loadingName, setLoadingName] = useState<string | null>(null);
    const [errorName, setErrorName] = useState<Record<string, string>>({});

    const toggle = async (name: string) => {
        if (expanded === name) {
            setExpanded(null);
            return;
        }
        setExpanded(name);
        // Fetch instances the first time this row is opened.
        if (!instances[name] && range) {
            setLoadingName(name);
            setErrorName((e) => ({ ...e, [name]: '' }));
            try {
                const qs = new URLSearchParams();
                qs.set('type', type);
                qs.set('name', name);
                qs.set('from', range.from.toISOString());
                qs.set('to', range.to.toISOString());
                const res = await fetch(`/api/stats/app/${appId}/instances?${qs.toString()}`, { cache: 'no-store' });
                const json = await res.json();
                if (!res.ok) throw new Error(json?.error || 'Failed to load instances');
                setInstances((prev) => ({ ...prev, [name]: json.instances }));
            } catch (err: any) {
                setErrorName((e) => ({ ...e, [name]: err.message || 'Failed to load' }));
            } finally {
                setLoadingName(null);
            }
        }
    };

    const itemTemplate = (r: ListRow, index: number) => {
        const pct = max > 0 ? Math.round((r.count / max) * 100) : 0;
        // Derive a stable color per item from its name.
        const [accentSoft, accent] = getBackgroundAndTextColorTuples(r.name);
        const isOpen = expanded === r.name;
        return (
            <div className="col-12 p-0">
                <div
                    className={`flex align-items-center gap-3 p-3 cursor-pointer detail-list-row ${index !== 0 ? 'border-top-1 surface-border' : ''}`}
                    onClick={() => toggle(r.name)}
                    role="button"
                    aria-expanded={isOpen}
                >
                    {/* Expand chevron */}
                    <i
                        className={`pi ${isOpen ? 'pi-chevron-down' : 'pi-chevron-right'} text-500 flex-shrink-0`}
                        style={{ fontSize: '0.8rem', width: '1rem' }}
                    />

                    {/* Icon */}
                    <Avatar
                        icon={`pi ${icon}`}
                        shape="circle"
                        className="flex-shrink-0"
                        style={{ background: accentSoft, color: accent }}
                    />

                    {/* Name + meta + bar */}
                    <div className="flex-1" style={{ minWidth: 0 }}>
                        <div className="flex align-items-center justify-content-between gap-2">
                            <span className="font-medium text-900 white-space-nowrap overflow-hidden text-overflow-ellipsis" title={r.name}>
                                {r.name}
                            </span>
                            <Badge value={`${r.count.toLocaleString()} ${countLabel}`} style={{ background: accent }} />
                        </div>
                        <ProgressBar value={pct} showValue={false} className="mt-2" style={{ height: '6px' }} color={accent} />
                        <div className="flex align-items-center gap-3 mt-2 text-500 text-xs">
                            <span>
                                <i className="pi pi-users mr-1" style={{ fontSize: '0.7rem' }} />
                                {r.uniqueUsers.toLocaleString()} user{r.uniqueUsers === 1 ? '' : 's'}
                            </span>
                            <span>
                                <i className="pi pi-clock mr-1" style={{ fontSize: '0.7rem' }} />
                                {formatDateTime(r.lastSeen)}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Expanded instance detail */}
                {isOpen && (
                    <div className="surface-50 border-top-1 surface-border px-3 py-2">
                        <InstanceDetail
                            loading={loadingName === r.name}
                            error={errorName[r.name]}
                            instances={instances[r.name]}
                            total={r.count}
                            accent={accent}
                        />
                    </div>
                )}
            </div>
        );
    };

    return (
        <DataView
            value={rows}
            layout="list"
            itemTemplate={itemTemplate as any}
            paginator={rows.length > 10}
            rows={10}
            emptyMessage={emptyMessage}
            className="flex-1"
        />
    );
};

const InstanceDetail = ({
    loading,
    error,
    instances,
    total,
    accent
}: {
    loading: boolean;
    error?: string;
    instances?: EventInstance[];
    total: number;
    accent: string;
}) => {
    if (loading) {
        return (
            <div className="flex align-items-center gap-2 py-3 text-500 text-sm">
                <ProgressSpinner style={{ width: '1.25rem', height: '1.25rem' }} strokeWidth="6" />
                <span>Loading instances…</span>
            </div>
        );
    }
    if (error) {
        return (
            <div className="py-2">
                <Message severity="error" text={error} className="w-full" />
            </div>
        );
    }
    if (!instances || instances.length === 0) {
        return <div className="py-3 text-500 text-sm">No instances found.</div>;
    }

    const capped = instances.length < total;

    return (
        <div>
            <DataTable
                value={instances}
                size="small"
                scrollable
                scrollHeight="260px"
                className="p-datatable-sm"
                dataKey="id"
                sortField="createdAt"
                sortOrder={-1}
                removableSort
            >
                <Column
                    header="Who"
                    field="email"
                    sortable
                    body={(inst: EventInstance) => (
                        <span className="flex align-items-center gap-2">
                            <Avatar
                                label={(inst.email || '?').charAt(0).toUpperCase()}
                                shape="circle"
                                size="normal"
                                style={{ background: 'var(--surface-200)', color: accent, width: '1.75rem', height: '1.75rem', fontSize: '0.8rem' }}
                            />
                            <span className="text-900">{inst.email}</span>
                        </span>
                    )}
                />
                <Column
                    header="Department"
                    field="department"
                    sortable
                    body={(inst: EventInstance) => (inst.department ? <Tag value={inst.department} severity="info" /> : <span className="text-500">—</span>)}
                />
                <Column
                    header="When"
                    field="createdAt"
                    sortable
                    body={(inst: EventInstance) => <span className="text-700">{formatDateTime(inst.createdAt)}</span>}
                />
            </DataTable>
            {capped && (
                <div className="text-500 text-xs mt-2">
                    <i className="pi pi-info-circle mr-1" />
                    Showing the {instances.length.toLocaleString()} most recent of {total.toLocaleString()} instances.
                </div>
            )}
        </div>
    );
};

const SummaryCard = ({ label, value, icon, bg, color }: { label: string; value: number; icon: string; bg: string; color: string }) => (
    <div className="col-12 sm:col-6 xl:col-3">
        <div className="card mb-0">
            <div className="flex justify-content-between mb-3">
                <div>
                    <span className="block text-500 font-medium mb-3">{label}</span>
                    <div className="text-900 font-medium text-xl">{value.toLocaleString()}</div>
                </div>
                <div className={`flex align-items-center justify-content-center ${bg} border-round`} style={{ width: '2.5rem', height: '2.5rem' }}>
                    <i className={`pi ${icon} ${color} text-xl`} />
                </div>
            </div>
        </div>
    </div>
);

export default AppDetailsPage;
