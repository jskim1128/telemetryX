'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AutoComplete, AutoCompleteCompleteEvent, AutoCompleteSelectEvent } from 'primereact/autocomplete';
import { Button } from 'primereact/button';
import { Calendar } from 'primereact/calendar';
import { Chart } from 'primereact/chart';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { Message } from 'primereact/message';
import { Tag } from 'primereact/tag';
import { Toast } from 'primereact/toast';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';

interface AppOption {
    id: string;
    name: string;
    description?: string | null;
    ownerEmail?: string | null;
    apiKeyPrefix?: string;
    active?: boolean;
    createdAt?: string;
}

interface OverviewResp {
    range: { from: string; to: string };
    overview: {
        appOpens: number;
        featureTriggers: number;
        tagInstances: number;
        uniqueUsers: number;
        activeApps: number;
    };
    departments: Array<{ department: string; count: number }>;
    topApps: Array<{ appId: string; name: string; count: number }>;
    topFeatures: Array<{ featureName: string; count: number }>;
}

interface SeriesResp {
    range: { from: string; to: string };
    series: Array<{ day: string; category: string; count: number }>;
}

interface AppStatsResp {
    app: { id: string; name: string };
    range: { from: string; to: string };
    overview: {
        appOpens: number;
        featureTriggers: number;
        tagInstances: number;
        uniqueUsers: number;
    };
    series: Array<{ day: string; category: string; count: number }>;
    departments: Array<{ department: string; count: number }>;
    features: Array<{ featureName: string; count: number }>;
    users: Array<{ email: string; count: number }>;
    tags: Array<{ tag: string; count: number }>;
    recent: Array<any>;
}

interface AppDetail extends AppOption {
    apiKeyPrefix: string;
    active: boolean;
    createdAt: string;
    updatedAt?: string;
    eventCounts?: { appOpens: number; features: number; tags: number; total: number };
}

const CATEGORY_COLORS = {
    app_open: '#42A5F5',
    feature: '#66BB6A',
    tag: '#FFA726'
};

const PALETTE = ['#42A5F5', '#66BB6A', '#FFA726', '#AB47BC', '#EF5350', '#26C6DA', '#FFCA28', '#8D6E63', '#5C6BC0', '#EC407A'];

function defaultRange(): [Date, Date] {
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    return [from, to];
}

const DashboardPage = () => {
    const toast = useRef<Toast>(null);
    const router = useRouter();
    const searchParams = useSearchParams();
    const appIdFromUrl = searchParams?.get('app') || null;

    const [range, setRange] = useState<[Date | null, Date | null]>(defaultRange());
    const [departmentFilter, setDepartmentFilter] = useState<string | null>(null);

    // App list & search
    const [appsList, setAppsList] = useState<AppOption[]>([]);
    const [searchValue, setSearchValue] = useState<AppOption | string | null>(null);
    const [suggestions, setSuggestions] = useState<AppOption[]>([]);
    const [selectedAppId, setSelectedAppId] = useState<string | null>(appIdFromUrl);

    // Global view state
    const [overview, setOverview] = useState<OverviewResp | null>(null);
    const [series, setSeries] = useState<SeriesResp | null>(null);

    // App-specific view state
    const [appDetail, setAppDetail] = useState<AppDetail | null>(null);
    const [appStats, setAppStats] = useState<AppStatsResp | null>(null);

    const [loading, setLoading] = useState(true);

    // Credentials dialog
    const [credsOpen, setCredsOpen] = useState(false);
    const [rotating, setRotating] = useState(false);
    const [newKey, setNewKey] = useState<string | null>(null);

    // Load apps list once for the search
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/apps');
                const data = await res.json();
                if (res.ok) {
                    const list: AppOption[] = data.apps.map((a: any) => ({
                        id: a.id,
                        name: a.name,
                        description: a.description,
                        ownerEmail: a.ownerEmail,
                        apiKeyPrefix: a.apiKeyPrefix,
                        active: a.active,
                        createdAt: a.createdAt
                    }));
                    setAppsList(list);

                    // If URL has an app param, pre-select it in the search box
                    if (appIdFromUrl) {
                        const found = list.find((a) => a.id === appIdFromUrl);
                        if (found) setSearchValue(found);
                    }
                }
            } catch {
                // non-fatal
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Keep selectedAppId in sync with URL when it changes externally
    useEffect(() => {
        setSelectedAppId(appIdFromUrl);
        if (!appIdFromUrl) {
            setSearchValue(null);
            setAppDetail(null);
            setAppStats(null);
        } else {
            const found = appsList.find((a) => a.id === appIdFromUrl);
            if (found) setSearchValue(found);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [appIdFromUrl]);

    const loadGlobal = async () => {
        if (!range[0] || !range[1]) return;
        setLoading(true);
        try {
            const qs = new URLSearchParams();
            qs.set('from', range[0].toISOString());
            qs.set('to', range[1].toISOString());
            if (departmentFilter) qs.set('department', departmentFilter);

            const [oRes, sRes] = await Promise.all([fetch(`/api/stats/overview?${qs.toString()}`), fetch(`/api/stats/timeseries?${qs.toString()}`)]);
            const oData = await oRes.json();
            const sData = await sRes.json();
            if (!oRes.ok) throw new Error(oData?.error || 'Failed to load overview');
            if (!sRes.ok) throw new Error(sData?.error || 'Failed to load series');
            setOverview(oData);
            setSeries(sData);
        } catch (err: any) {
            toast.current?.show({ severity: 'error', summary: 'Error', detail: err.message });
        } finally {
            setLoading(false);
        }
    };

    const loadApp = async (id: string) => {
        if (!range[0] || !range[1]) return;
        setLoading(true);
        try {
            const qs = new URLSearchParams();
            qs.set('from', range[0].toISOString());
            qs.set('to', range[1].toISOString());

            const [appRes, statsRes] = await Promise.all([fetch(`/api/apps/${id}`), fetch(`/api/stats/app/${id}?${qs.toString()}`)]);
            const appData = await appRes.json();
            const statsData = await statsRes.json();
            if (!appRes.ok) throw new Error(appData?.error || 'Failed to load app');
            if (!statsRes.ok) throw new Error(statsData?.error || 'Failed to load stats');
            setAppDetail(appData.app);
            setAppStats(statsData);
        } catch (err: any) {
            toast.current?.show({ severity: 'error', summary: 'Error', detail: err.message });
        } finally {
            setLoading(false);
        }
    };

    // Load data based on selection
    useEffect(() => {
        if (selectedAppId) {
            loadApp(selectedAppId);
        } else {
            loadGlobal();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedAppId, range, departmentFilter]);

    const search = (event: AutoCompleteCompleteEvent) => {
        const q = (event.query || '').toLowerCase().trim();
        if (!q) {
            setSuggestions(appsList);
            return;
        }
        setSuggestions(appsList.filter((a) => a.name.toLowerCase().includes(q) || (a.ownerEmail || '').toLowerCase().includes(q) || (a.description || '').toLowerCase().includes(q)));
    };

    const onSelectApp = (e: AutoCompleteSelectEvent) => {
        const app = e.value as AppOption;
        setSelectedAppId(app.id);
        router.push(`/?app=${app.id}`);
    };

    const clearSelection = () => {
        setSearchValue(null);
        setSelectedAppId(null);
        router.push('/');
    };

    const refresh = () => {
        if (selectedAppId) loadApp(selectedAppId);
        else loadGlobal();
    };

    // App-specific actions
    const openCredentials = () => {
        setNewKey(null);
        setCredsOpen(true);
    };

    const closeCredentials = () => {
        setCredsOpen(false);
        const had = newKey;
        setNewKey(null);
        if (had && selectedAppId) loadApp(selectedAppId);
    };

    const copyText = async (text: string, label = 'Value') => {
        try {
            await navigator.clipboard.writeText(text);
            toast.current?.show({ severity: 'success', summary: 'Copied', detail: `${label} copied to clipboard` });
        } catch {
            toast.current?.show({ severity: 'warn', summary: 'Copy failed', detail: 'Select and copy manually' });
        }
    };

    const handleRotate = () => {
        if (!appDetail) return;
        const id = appDetail.id;
        confirmDialog({
            message: 'Rotating will invalidate the old API key immediately. Your apps using the old key will stop working until updated. Continue?',
            header: 'Rotate API Key',
            icon: 'pi pi-exclamation-triangle',
            acceptClassName: 'p-button-warning',
            accept: async () => {
                setRotating(true);
                try {
                    const res = await fetch(`/api/apps/${id}/rotate-key`, { method: 'POST' });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data?.error || 'Rotate failed');
                    setNewKey(data.apiKey);
                    if (appDetail) setAppDetail({ ...appDetail, apiKeyPrefix: data.app.apiKeyPrefix });
                } catch (err: any) {
                    toast.current?.show({ severity: 'error', summary: 'Error', detail: err.message });
                } finally {
                    setRotating(false);
                }
            }
        });
    };

    // Build charts
    const globalLine = useMemo(() => buildLineChart(series?.series), [series]);
    const appLine = useMemo(() => buildLineChart(appStats?.series), [appStats]);

    const globalDepartmentChart = useMemo(() => buildDoughnut(overview?.departments || []), [overview]);
    const appDepartmentChart = useMemo(() => buildDoughnut(appStats?.departments || []), [appStats]);

    const topAppsChart = useMemo(() => buildBar((overview?.topApps || []).map((a) => ({ label: a.name, count: a.count })), '#42A5F5'), [overview]);
    const topFeaturesChart = useMemo(() => buildBar((overview?.topFeatures || []).map((f) => ({ label: f.featureName, count: f.count })), '#66BB6A'), [overview]);
    const appFeatureChart = useMemo(() => buildBar((appStats?.features || []).map((f) => ({ label: f.featureName, count: f.count })), '#66BB6A'), [appStats]);

    const departmentOptions = (overview?.departments || []).map((d) => ({ label: d.department, value: d.department }));

    const itemTemplate = (item: AppOption) => (
        <div className="flex flex-column">
            <span className="font-medium">{item.name}</span>
            {item.ownerEmail && <small className="text-500">{item.ownerEmail}</small>}
        </div>
    );

    const title = selectedAppId ? (appDetail ? appDetail.name : 'Loading…') : 'All Apps Overview';

    return (
        <div className="grid">
            <Toast ref={toast} />
            <ConfirmDialog />

            {/* Search + Title + Filters (no card wrapper, but padded to align with cards below) */}
            <div className="col-12">
                <div className="px-5 mb-4">
                {/* Search bar row */}
                <div className="flex align-items-center gap-2 mb-3">
                    <span className="p-input-icon-left flex-1">
                        <i className="pi pi-search" />
                        <AutoComplete
                            value={searchValue}
                            suggestions={suggestions}
                            completeMethod={search}
                            field="name"
                            itemTemplate={itemTemplate}
                            onChange={(e) => {
                                setSearchValue(e.value);
                                if (e.value === null || e.value === '') {
                                    if (selectedAppId) {
                                        setSelectedAppId(null);
                                        router.push('/');
                                    }
                                }
                            }}
                            onSelect={onSelectApp}
                            placeholder="Search apps by name, owner… (leave empty for all apps)"
                            dropdown
                            forceSelection
                            className="w-full"
                            inputClassName="w-full pl-5"
                        />
                    </span>
                    {selectedAppId && <Button label="View all apps" icon="pi pi-times" outlined onClick={clearSelection} />}
                </div>

                {/* Title + filters */}
                <div className="flex flex-column md:flex-row md:align-items-end gap-3 flex-wrap">
                    <div className="flex-1">
                        <div className="flex align-items-center gap-2 flex-wrap">
                            <h3 className="m-0">{title}</h3>
                            {selectedAppId && appDetail && (appDetail.active ? <Tag severity="success" value="Active" /> : <Tag severity="danger" value="Disabled" />)}
                        </div>
                    </div>
                    <div className="field m-0">
                        <label className="block text-500 text-sm mb-1">Date range</label>
                        <Calendar
                            value={range as any}
                            onChange={(e) => setRange(e.value as any)}
                            selectionMode="range"
                            readOnlyInput
                            dateFormat="yy-mm-dd"
                            showIcon
                            placeholder="Pick a range"
                        />
                    </div>
                    {!selectedAppId && (
                        <div className="field m-0">
                            <label className="block text-500 text-sm mb-1">Department</label>
                            <Dropdown value={departmentFilter} options={departmentOptions} onChange={(e) => setDepartmentFilter(e.value)} placeholder="All departments" showClear />
                        </div>
                    )}
                    <Button icon="pi pi-refresh" onClick={refresh} loading={loading} tooltip="Refresh" />
                    {selectedAppId && appDetail && (
                        <Button icon="pi pi-key" label="Show App ID & API Key" onClick={openCredentials} severity="info" outlined />
                    )}
                </div>
                </div>
            </div>

            {/* === GLOBAL VIEW === */}
            {!selectedAppId && (
                <>
                    <KpiCard label="App opens" value={overview?.overview.appOpens ?? 0} icon="pi-sign-in" bg="bg-blue-100" color="text-blue-500" />
                    <KpiCard label="Feature triggers" value={overview?.overview.featureTriggers ?? 0} icon="pi-bolt" bg="bg-green-100" color="text-green-500" />
                    <KpiCard label="Tag instances" value={overview?.overview.tagInstances ?? 0} icon="pi-tag" bg="bg-orange-100" color="text-orange-500" />
                    <KpiCard label="Unique users" value={overview?.overview.uniqueUsers ?? 0} icon="pi-users" bg="bg-purple-100" color="text-purple-500" />

                    <div className="col-12 xl:col-8">
                        <div className="card h-full flex flex-column">
                            <h5>Events over time</h5>
                            <div className="flex-1" style={{ position: 'relative', minHeight: '320px' }}>
                                <Chart type="line" data={globalLine.data} options={globalLine.options} style={{ height: '100%', width: '100%' }} />
                            </div>
                        </div>
                    </div>

                    <div className="col-12 xl:col-4">
                        <div className="card h-full flex flex-column">
                            <h5>Events by department</h5>
                            <div className="flex-1 flex align-items-center justify-content-center" style={{ minHeight: '320px' }}>
                                {!overview || overview.departments.length === 0 ? (
                                    <p className="text-500 m-0">No department data in this range.</p>
                                ) : (
                                    <Chart type="doughnut" data={globalDepartmentChart} options={{ maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }} style={{ height: '100%', width: '100%', maxHeight: '320px' }} />
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="col-12 lg:col-6">
                        <div className="card h-full flex flex-column">
                            <h5>Top apps by events</h5>
                            <div className="flex-1" style={{ position: 'relative', minHeight: '360px' }}>
                                {!overview || overview.topApps.length === 0 ? (
                                    <p className="text-500">No data yet.</p>
                                ) : (
                                    <Chart type="bar" data={topAppsChart} options={{ maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } } }} style={{ height: '100%', width: '100%' }} />
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="col-12 lg:col-6">
                        <div className="card h-full flex flex-column">
                            <h5>Top features triggered</h5>
                            <div className="flex-1" style={{ position: 'relative', minHeight: '360px' }}>
                                {!overview || overview.topFeatures.length === 0 ? (
                                    <p className="text-500">No feature triggers yet.</p>
                                ) : (
                                    <Chart type="bar" data={topFeaturesChart} options={{ maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } } }} style={{ height: '100%', width: '100%' }} />
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="col-12">
                        <div className="card">
                            <div className="flex justify-content-between align-items-center mb-3">
                                <h5 className="m-0">All apps</h5>
                                <Link href="/apps">
                                    <Button label="Manage apps" icon="pi pi-arrow-right" iconPos="right" text />
                                </Link>
                            </div>
                            <DataTable value={overview?.topApps || []} emptyMessage="No apps yet." responsiveLayout="scroll">
                                <Column field="name" header="App" body={(r) => <Link href={`/?app=${r.appId}`}>{r.name}</Link>} />
                                <Column field="count" header="Total events" sortable />
                            </DataTable>
                        </div>
                    </div>
                </>
            )}

            {/* === APP-SPECIFIC VIEW === */}
            {selectedAppId && appStats && (
                <>
                    <KpiCard label="App opens" value={appStats.overview.appOpens} icon="pi-sign-in" bg="bg-blue-100" color="text-blue-500" />
                    <KpiCard label="Feature triggers" value={appStats.overview.featureTriggers} icon="pi-bolt" bg="bg-green-100" color="text-green-500" />
                    <KpiCard label="Tag instances" value={appStats.overview.tagInstances} icon="pi-tag" bg="bg-orange-100" color="text-orange-500" />
                    <KpiCard label="Unique users" value={appStats.overview.uniqueUsers} icon="pi-users" bg="bg-purple-100" color="text-purple-500" />

                    <div className="col-12 xl:col-8">
                        <div className="card h-full flex flex-column">
                            <h5>Events over time</h5>
                            <div className="flex-1" style={{ position: 'relative', minHeight: '320px' }}>
                                <Chart type="line" data={appLine.data} options={appLine.options} style={{ height: '100%', width: '100%' }} />
                            </div>
                        </div>
                    </div>

                    <div className="col-12 xl:col-4">
                        <div className="card h-full flex flex-column">
                            <h5>By department</h5>
                            <div className="flex-1 flex align-items-center justify-content-center" style={{ minHeight: '320px' }}>
                                {appStats.departments.length === 0 ? (
                                    <p className="text-500 m-0">No department data yet.</p>
                                ) : (
                                    <Chart type="doughnut" data={appDepartmentChart} options={{ maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }} style={{ height: '100%', width: '100%', maxHeight: '320px' }} />
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="col-12 lg:col-6">
                        <div className="card h-full flex flex-column">
                            <h5>Top features triggered</h5>
                            <div className="flex-1" style={{ position: 'relative', minHeight: '320px' }}>
                                {appStats.features.length === 0 ? (
                                    <p className="text-500">No feature triggers yet.</p>
                                ) : (
                                    <Chart type="bar" data={appFeatureChart} options={{ maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } } }} style={{ height: '100%', width: '100%' }} />
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="col-12 lg:col-6">
                        <div className="card h-full flex flex-column">
                            <h5>Top users</h5>
                            <div className="flex-1">
                                <DataTable value={appStats.users} emptyMessage="No user activity yet." responsiveLayout="scroll">
                                    <Column field="email" header="Email" />
                                    <Column field="count" header="Events" sortable />
                                </DataTable>
                            </div>
                        </div>
                    </div>

                    <div className="col-12">
                        <div className="card">
                            <h5>Recent events</h5>
                            <DataTable value={appStats.recent} emptyMessage="No events yet. Start sending tracking data via API." paginator rows={10} responsiveLayout="scroll">
                                <Column header="When" body={(r: any) => new Date(r.createdAt).toLocaleString()} sortable sortField="createdAt" />
                                <Column header="Type" body={(r: any) => <Tag severity={r.type === 'app_open' ? 'info' : r.type === 'feature' ? 'success' : 'warning'} value={typeLabel(r.type)} />} />
                                <Column header="Details" body={(r: any) => r.label} />
                                <Column header="Email" field="email" />
                                <Column header="Department" body={(r: any) => r.department || <span className="text-500">—</span>} />
                            </DataTable>
                        </div>
                    </div>
                </>
            )}

            {/* Credentials Dialog */}
            {appDetail && (
                <Dialog header={newKey ? 'New API Key — save this now' : 'App Credentials'} visible={credsOpen} modal style={{ width: '90vw', maxWidth: '720px' }} onHide={closeCredentials}>
                    {!newKey && (
                        <div>
                            <Message severity="info" text="The full API key is hashed and cannot be retrieved. If lost, rotate the key below — the old key will stop working immediately." className="w-full mb-3" />

                            <div className="mb-3">
                                <div className="text-500 text-sm">App name</div>
                                <div className="font-medium text-lg">{appDetail.name}</div>
                            </div>

                            <div className="mb-3">
                                <div className="text-500 text-sm">App ID</div>
                                <div className="flex align-items-center gap-2">
                                    <code className="surface-100 p-2 border-round flex-1" style={{ wordBreak: 'break-all' }}>
                                        {appDetail.id}
                                    </code>
                                    <Button icon="pi pi-copy" onClick={() => copyText(appDetail.id, 'App ID')} tooltip="Copy" tooltipOptions={{ position: 'left' }} />
                                </div>
                            </div>

                            <div className="mb-4">
                                <div className="text-500 text-sm">API Key prefix (for identification only)</div>
                                <div className="flex align-items-center gap-2">
                                    <code className="surface-100 p-2 border-round flex-1">{appDetail.apiKeyPrefix}…</code>
                                </div>
                                <div className="text-500 text-xs mt-1">Use this prefix to confirm the key stored in your app matches.</div>
                            </div>

                            <UsageExamples />

                            <div className="flex justify-content-end gap-2 mt-4">
                                <Button label="Close" text onClick={closeCredentials} />
                                <Button label="Rotate API Key" icon="pi pi-refresh" severity="warning" loading={rotating} onClick={handleRotate} />
                            </div>
                        </div>
                    )}

                    {newKey && (
                        <div>
                            <Message severity="warn" text="This API key will not be shown again. Save it now and update your app's configuration. The old key has been invalidated." className="w-full mb-3" />
                            <div className="mb-3">
                                <div className="text-500 text-sm">New API Key</div>
                                <div className="flex align-items-center gap-2">
                                    <code className="surface-100 p-2 border-round flex-1" style={{ wordBreak: 'break-all' }}>
                                        {newKey}
                                    </code>
                                    <Button icon="pi pi-copy" onClick={() => copyText(newKey, 'API key')} tooltip="Copy" tooltipOptions={{ position: 'left' }} />
                                </div>
                            </div>

                            <UsageExamples apiKey={newKey} />

                            <div className="flex justify-content-end mt-4">
                                <Button label="Done" icon="pi pi-check" onClick={closeCredentials} />
                            </div>
                        </div>
                    )}
                </Dialog>
            )}
        </div>
    );
};

function typeLabel(t: string) {
    if (t === 'app_open') return 'App open';
    if (t === 'feature') return 'Feature';
    return 'Tag';
}

const UsageExamples = ({ apiKey }: { apiKey?: string }) => {
    const [expanded, setExpanded] = useState(false);
    const key = apiKey || '<YOUR_API_KEY>';
    return (
        <div className="mt-2">
            <Button
                label={expanded ? 'Hide usage examples' : 'Show usage examples'}
                icon={expanded ? 'pi pi-chevron-up' : 'pi pi-chevron-down'}
                iconPos="right"
                text
                onClick={() => setExpanded(!expanded)}
                className="p-0"
            />
            {expanded && (
                <div className="mt-3">
                    <p className="text-500 mt-0 mb-2 text-sm">Send tracking events with these HTTP requests:</p>

                    <h6 className="mb-2">App opened</h6>
                    <pre className="surface-100 p-3 border-round overflow-auto" style={{ fontSize: '0.8rem' }}>
{`curl -X POST https://<your-host>/api/track/app-opened \\
  -H "x-api-key: ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{"email":"jane@company.com","department":"Finance"}'`}
                    </pre>

                    <h6 className="mb-2 mt-3">Feature triggered</h6>
                    <pre className="surface-100 p-3 border-round overflow-auto" style={{ fontSize: '0.8rem' }}>
{`curl -X POST https://<your-host>/api/track/feature \\
  -H "x-api-key: ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{"email":"jane@company.com","featureName":"export_csv","department":"Finance"}'`}
                    </pre>

                    <h6 className="mb-2 mt-3">Tag</h6>
                    <pre className="surface-100 p-3 border-round overflow-auto" style={{ fontSize: '0.8rem' }}>
{`curl -X POST https://<your-host>/api/track/tag \\
  -H "x-api-key: ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{"email":"jane@company.com","tag":"beta-tester","department":"Finance"}'`}
                    </pre>
                </div>
            )}
        </div>
    );
};

const KpiCard = ({ label, value, icon, bg, color }: { label: string; value: number; icon: string; bg: string; color: string }) => (
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

function buildLineChart(rows: Array<{ day: string; category: string; count: number }> | undefined) {
    if (!rows || rows.length === 0) {
        return {
            data: { labels: [], datasets: [] as any[] },
            options: { responsive: true, maintainAspectRatio: false }
        };
    }
    const dayMap = new Map<string, { app_open: number; feature: number; tag: number }>();
    for (const row of rows) {
        const dayKey = row.day.slice(0, 10);
        if (!dayMap.has(dayKey)) dayMap.set(dayKey, { app_open: 0, feature: 0, tag: 0 });
        const entry = dayMap.get(dayKey)!;
        (entry as any)[row.category] = row.count;
    }
    const days = Array.from(dayMap.keys()).sort();
    return {
        data: {
            labels: days,
            datasets: [
                { label: 'App opens', data: days.map((d) => dayMap.get(d)!.app_open), borderColor: CATEGORY_COLORS.app_open, backgroundColor: CATEGORY_COLORS.app_open, tension: 0.3, fill: false },
                { label: 'Feature triggers', data: days.map((d) => dayMap.get(d)!.feature), borderColor: CATEGORY_COLORS.feature, backgroundColor: CATEGORY_COLORS.feature, tension: 0.3, fill: false },
                { label: 'Tags', data: days.map((d) => dayMap.get(d)!.tag), borderColor: CATEGORY_COLORS.tag, backgroundColor: CATEGORY_COLORS.tag, tension: 0.3, fill: false }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'top' as const } },
            scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
        }
    };
}

function buildDoughnut(rows: Array<{ department: string; count: number }>) {
    return {
        labels: rows.map((r) => r.department),
        datasets: [
            {
                data: rows.map((r) => r.count),
                backgroundColor: rows.map((_, i) => PALETTE[i % PALETTE.length])
            }
        ]
    };
}

function buildBar(rows: Array<{ label: string; count: number }>, color: string) {
    return {
        labels: rows.map((r) => r.label),
        datasets: [{ label: 'Count', data: rows.map((r) => r.count), backgroundColor: color }]
    };
}

export default DashboardPage;
