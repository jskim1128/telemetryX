'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_HIDDEN_WIDGETS, DEFAULT_WIDGET_ORDER } from './dashboardWidgets';
import type { SeriesCategory } from './dashboardWidgets';

const STORAGE_KEY = 'dashboard-prefs-v1';

export interface StoredRange {
    start: string; // ISO date string
    end: string;   // ISO date string
}

export interface SavedView {
    id: string;
    name: string;
    order: string[];
    hidden: string[];
    range?: StoredRange | null;
    seriesCategory?: SeriesCategory;
}

export interface DashboardPrefs {
    widgetOrder: string[];
    hiddenWidgets: string[];
    lastRange: StoredRange | null;
    seriesCategory: SeriesCategory;
    savedViews: SavedView[];
    activeViewId: string | null;
}

const defaultPrefs = (): DashboardPrefs => ({
    widgetOrder: [...DEFAULT_WIDGET_ORDER],
    hiddenWidgets: [...DEFAULT_HIDDEN_WIDGETS],
    lastRange: null,
    seriesCategory: 'app_open',
    savedViews: [],
    activeViewId: null
});

/**
 * Reconcile a stored order/hidden set against the current widget registry:
 *  - Drop IDs that no longer exist.
 *  - Append newly-added widget IDs (not previously known) so future widgets
 *    appear automatically for existing users.
 */
function reconcileWidgets(order: string[], hidden: string[]): { order: string[]; hidden: string[] } {
    const known = new Set(DEFAULT_WIDGET_ORDER);
    const seen = new Set<string>();
    const nextOrder: string[] = [];
    for (const id of order) {
        if (known.has(id) && !seen.has(id)) {
            nextOrder.push(id);
            seen.add(id);
        }
    }
    // Append any registry widgets missing from the stored order (new widgets).
    for (const id of DEFAULT_WIDGET_ORDER) {
        if (!seen.has(id)) nextOrder.push(id);
    }
    const nextHidden = hidden.filter((id) => known.has(id));
    return { order: nextOrder, hidden: nextHidden };
}

function loadPrefs(): DashboardPrefs {
    if (typeof window === 'undefined') return defaultPrefs();
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaultPrefs();
        const parsed = JSON.parse(raw) as Partial<DashboardPrefs>;
        const base = defaultPrefs();
        const merged: DashboardPrefs = {
            ...base,
            ...parsed,
            widgetOrder: Array.isArray(parsed.widgetOrder) ? parsed.widgetOrder : base.widgetOrder,
            hiddenWidgets: Array.isArray(parsed.hiddenWidgets) ? parsed.hiddenWidgets : base.hiddenWidgets,
            savedViews: Array.isArray(parsed.savedViews) ? parsed.savedViews : base.savedViews
        };
        const reconciled = reconcileWidgets(merged.widgetOrder, merged.hiddenWidgets);
        merged.widgetOrder = reconciled.order;
        merged.hiddenWidgets = reconciled.hidden;
        return merged;
    } catch {
        return defaultPrefs();
    }
}

export interface UseDashboardPrefs {
    prefs: DashboardPrefs;
    hydrated: boolean;
    setWidgetOrder: (order: string[]) => void;
    toggleWidget: (id: string, visible: boolean) => void;
    setLastRange: (range: StoredRange | null) => void;
    setSeriesCategory: (c: SeriesCategory) => void;
    resetLayout: () => void;
    // Saved views
    saveView: (name: string) => SavedView;
    applyView: (id: string) => SavedView | null;
    renameView: (id: string, name: string) => void;
    deleteView: (id: string) => void;
    setActiveViewId: (id: string | null) => void;
}

export function useDashboardPrefs(): UseDashboardPrefs {
    const [prefs, setPrefs] = useState<DashboardPrefs>(defaultPrefs);
    const [hydrated, setHydrated] = useState(false);
    const hydratedRef = useRef(false);

    // Hydrate from localStorage on mount.
    useEffect(() => {
        setPrefs(loadPrefs());
        hydratedRef.current = true;
        setHydrated(true);
    }, []);

    // Persist whenever prefs change (after hydration).
    useEffect(() => {
        if (!hydratedRef.current) return;
        if (typeof window === 'undefined') return;
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
        } catch {
            // ignore storage errors (quota, privacy mode, etc.)
        }
    }, [prefs]);

    const setWidgetOrder = useCallback((order: string[]) => {
        setPrefs((p) => ({ ...p, widgetOrder: order }));
    }, []);

    const toggleWidget = useCallback((id: string, visible: boolean) => {
        setPrefs((p) => {
            const hidden = new Set(p.hiddenWidgets);
            if (visible) hidden.delete(id);
            else hidden.add(id);
            return { ...p, hiddenWidgets: Array.from(hidden) };
        });
    }, []);

    const setLastRange = useCallback((range: StoredRange | null) => {
        setPrefs((p) => {
            // Avoid redundant state churn if unchanged.
            const same =
                (p.lastRange?.start ?? null) === (range?.start ?? null) &&
                (p.lastRange?.end ?? null) === (range?.end ?? null);
            if (same) return p;
            return { ...p, lastRange: range };
        });
    }, []);

    const setSeriesCategory = useCallback((c: SeriesCategory) => {
        setPrefs((p) => (p.seriesCategory === c ? p : { ...p, seriesCategory: c }));
    }, []);

    const resetLayout = useCallback(() => {
        setPrefs((p) => ({
            ...p,
            widgetOrder: [...DEFAULT_WIDGET_ORDER],
            hiddenWidgets: [...DEFAULT_HIDDEN_WIDGETS],
            activeViewId: null
        }));
    }, []);

    const saveView = useCallback((name: string): SavedView => {
        const view: SavedView = {
            id: `view-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: name.trim() || 'Untitled view',
            order: [],
            hidden: [],
            range: null,
            seriesCategory: 'app_open'
        };
        setPrefs((p) => {
            view.order = [...p.widgetOrder];
            view.hidden = [...p.hiddenWidgets];
            view.range = p.lastRange;
            view.seriesCategory = p.seriesCategory;
            return { ...p, savedViews: [...p.savedViews, view], activeViewId: view.id };
        });
        return view;
    }, []);

    const applyView = useCallback((id: string): SavedView | null => {
        let applied: SavedView | null = null;
        setPrefs((p) => {
            const view = p.savedViews.find((v) => v.id === id);
            if (!view) return p;
            applied = view;
            const reconciled = reconcileWidgets(view.order, view.hidden);
            return {
                ...p,
                widgetOrder: reconciled.order,
                hiddenWidgets: reconciled.hidden,
                lastRange: view.range ?? p.lastRange,
                seriesCategory: view.seriesCategory ?? p.seriesCategory,
                activeViewId: id
            };
        });
        return applied;
    }, []);

    const renameView = useCallback((id: string, name: string) => {
        setPrefs((p) => ({
            ...p,
            savedViews: p.savedViews.map((v) => (v.id === id ? { ...v, name: name.trim() || v.name } : v))
        }));
    }, []);

    const deleteView = useCallback((id: string) => {
        setPrefs((p) => ({
            ...p,
            savedViews: p.savedViews.filter((v) => v.id !== id),
            activeViewId: p.activeViewId === id ? null : p.activeViewId
        }));
    }, []);

    const setActiveViewId = useCallback((id: string | null) => {
        setPrefs((p) => ({ ...p, activeViewId: id }));
    }, []);

    return {
        prefs,
        hydrated,
        setWidgetOrder,
        toggleWidget,
        setLastRange,
        setSeriesCategory,
        resetLayout,
        saveView,
        applyView,
        renameView,
        deleteView,
        setActiveViewId
    };
}
