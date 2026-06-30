'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AutoComplete, AutoCompleteCompleteEvent, AutoCompleteSelectEvent } from 'primereact/autocomplete';

interface AppOption {
    id: string;
    name: string;
    description?: string | null;
    ownerEmail?: string | null;
}

const LAST_APP_COOKIE = 'last_viewed_app';

function writeCookie(name: string, value: string, maxAgeDays = 365) {
    if (typeof document === 'undefined') return;
    const maxAge = maxAgeDays * 24 * 60 * 60;
    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

/**
 * Global app search shown in the top bar. Loads the list of apps and lets
 * the user jump to any app's dashboard. Selection navigates via the
 * `?app=` query param, which the dashboard page reacts to.
 */
const AppSearch = () => {
    const router = useRouter();
    const searchParams = useSearchParams();
    const appIdFromUrl = searchParams?.get('app') || null;

    const [apps, setApps] = useState<AppOption[]>([]);
    const [suggestions, setSuggestions] = useState<AppOption[]>([]);
    const [value, setValue] = useState<AppOption | string | null>(null);

    // Load the app list once for the search.
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/apps', { cache: 'no-store' });
                const data = await res.json();
                if (res.ok) {
                    const list: AppOption[] = (data.apps || []).map((a: any) => ({
                        id: a.id,
                        name: a.name,
                        description: a.description,
                        ownerEmail: a.ownerEmail
                    }));
                    setApps(list);
                }
            } catch {
                // non-fatal
            }
        })();
    }, []);

    // Keep the displayed value in sync with the currently selected app.
    useEffect(() => {
        if (!appIdFromUrl) {
            setValue(null);
            return;
        }
        const found = apps.find((a) => a.id === appIdFromUrl);
        if (found) setValue(found);
    }, [appIdFromUrl, apps]);

    const search = (event: AutoCompleteCompleteEvent) => {
        const q = (event.query || '').toLowerCase().trim();
        if (!q) {
            setSuggestions(apps);
            return;
        }
        setSuggestions(
            apps.filter(
                (a) =>
                    a.name.toLowerCase().includes(q) ||
                    (a.ownerEmail || '').toLowerCase().includes(q) ||
                    (a.description || '').toLowerCase().includes(q)
            )
        );
    };

    const onSelect = (e: AutoCompleteSelectEvent) => {
        const app = e.value as AppOption;
        if (!app?.id) return;
        writeCookie(LAST_APP_COOKIE, app.id);
        router.push(`/?app=${app.id}`);
    };

    const itemTemplate = (item: AppOption) => (
        <div className="flex flex-column">
            <span className="font-medium">{item.name}</span>
            {item.ownerEmail && <small className="text-500">{item.ownerEmail}</small>}
        </div>
    );

    return (
        <div className="layout-topbar-search">
            <span className="p-input-icon-left w-full">
                <i className="pi pi-search" />
                <AutoComplete
                    value={value}
                    suggestions={suggestions}
                    completeMethod={search}
                    field="name"
                    itemTemplate={itemTemplate}
                    onChange={(e) => {
                        if (e.value === null || e.value === '') {
                            setValue('');
                            return;
                        }
                        setValue(e.value);
                    }}
                    onSelect={onSelect}
                    placeholder="Search apps by name, owner…"
                    className="w-full ml-2"
                    inputClassName="w-full pl-5"
                />
            </span>
        </div>
    );
};

export default AppSearch;
