'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { InputText } from 'primereact/inputtext';
import { Button } from 'primereact/button';
import { Tag } from 'primereact/tag';
import { Toast } from 'primereact/toast';
import { FilterMatchMode } from 'primereact/api';
import { useRouter } from 'next/navigation';

interface AppRow {
    id: string;
    name: string;
    description: string | null;
    ownerEmail: string | null;
    apiKeyPrefix: string;
    active: boolean;
    createdAt: string;
    eventCounts: { appOpens: number; features: number; tags: number; total: number };
}

const AppsPage = () => {
    const router = useRouter();
    const toast = useRef<Toast>(null);
    const [apps, setApps] = useState<AppRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [globalFilter, setGlobalFilter] = useState('');

    const filters = {
        global: { value: globalFilter, matchMode: FilterMatchMode.CONTAINS }
    };

    const load = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/apps');
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'Failed to load apps');
            setApps(data.apps);
        } catch (err: any) {
            toast.current?.show({ severity: 'error', summary: 'Error', detail: err.message });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const statusBody = (row: AppRow) => (row.active ? <Tag severity="success" value="Active" /> : <Tag severity="danger" value="Disabled" />);

    const eventsBody = (row: AppRow) => (
        <div className="flex flex-column" style={{ minWidth: '140px' }}>
            <span className="font-medium">{row.eventCounts.total.toLocaleString()} total</span>
            <span className="text-500 text-xs">
                {row.eventCounts.appOpens} opens · {row.eventCounts.features} features · {row.eventCounts.tags} tags
            </span>
        </div>
    );

    const createdBody = (row: AppRow) => new Date(row.createdAt).toLocaleDateString();

    const actionsBody = (row: AppRow) => (
        <div className="flex gap-2">
            <Button icon="pi pi-chart-bar" tooltip="View" tooltipOptions={{ position: 'top' }} text onClick={() => router.push(`/?app=${row.id}`)} />
        </div>
    );

    const header = (
        <div className="flex flex-column md:flex-row md:justify-content-between md:align-items-center gap-3">
            <div>
                <h4 className="m-0">Registered Apps</h4>
                <span className="text-500 text-sm">{apps.length} app(s) registered</span>
            </div>
            <div className="flex gap-2">
                <span className="p-input-icon-left">
                    <i className="pi pi-search" />
                    <InputText value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} placeholder="Search by name, owner…" />
                </span>
                <Link href="/apps/register">
                    <Button label="Register App" icon="pi pi-plus" />
                </Link>
            </div>
        </div>
    );

    return (
        <div className="grid">
            <Toast ref={toast} />
            <div className="col-12">
                <div className="card">
                    <DataTable
                        value={apps}
                        loading={loading}
                        paginator
                        rows={15}
                        rowsPerPageOptions={[10, 15, 25, 50]}
                        dataKey="id"
                        filters={filters}
                        globalFilterFields={['name', 'description', 'ownerEmail', 'apiKeyPrefix']}
                        header={header}
                        emptyMessage="No apps registered yet. Click ‘Register App’ to get started."
                        onRowClick={(e) => router.push(`/?app=${(e.data as AppRow).id}`)}
                        rowClassName={() => ({ 'cursor-pointer': true } as any)}
                        responsiveLayout="scroll"
                    >
                        <Column field="name" header="Name" sortable body={(r: AppRow) => <span className="font-medium">{r.name}</span>} />
                        <Column field="ownerEmail" header="Owner" body={(r: AppRow) => r.ownerEmail || <span className="text-500">—</span>} />
                        <Column header="Events" body={eventsBody} sortable sortField="eventCounts.total" />
                        <Column field="active" header="Status" body={statusBody} sortable />
                        <Column field="createdAt" header="Created" body={createdBody} sortable />
                        <Column header="" body={actionsBody} style={{ width: '5rem' }} />
                    </DataTable>
                </div>
            </div>
        </div>
    );
};

export default AppsPage;
