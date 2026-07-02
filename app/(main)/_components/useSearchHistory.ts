'use client';

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'search-history-v1';

// Cap on how many *non-favourite* recent searches we keep per scope. Favourites
// are never auto-evicted so users can pin as many important queries as needed.
const MAX_RECENTS = 20;

export type SearchScope = 'feature' | 'tag';

export interface SearchEntry {
    /** The raw query string the user typed. */
    query: string;
    /** Whether the search was interpreted as a regular expression. */
    regex: boolean;
    /** Whether the search was case sensitive. */
    caseSensitive: boolean;
    /** Pinned by the user; always shown and never auto-evicted. */
    favourite: boolean;
    /** Epoch ms of the last time this search was used. */
    lastUsed: number;
}

// Persisted shape: { [appId]: { feature: SearchEntry[], tag: SearchEntry[] } }
type Store = Record<string, Partial<Record<SearchScope, SearchEntry[]>>>;

/** Two entries are considered the same search if query + flags all match. */
function sameSearch(a: SearchEntry, b: { query: string; regex: boolean; caseSensitive: boolean }): boolean {
    return a.query === b.query && a.regex === b.regex && a.caseSensitive === b.caseSensitive;
}

/* -------------------------------------------------------------------------- *
 * Shared module-level store.
 *
 * All hook instances (e.g. the feature list and tag list on the same page)
 * read from and write to this single source of truth. This is what prevents
 * one instance from clobbering another's data when both persist to the same
 * localStorage key. It also keeps the two lists in sync live.
 * -------------------------------------------------------------------------- */

let storeState: Store = {};
let loaded = false;
const listeners = new Set<() => void>();

function loadFromStorage(): Store {
    if (typeof window === 'undefined') return {};
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? (parsed as Store) : {};
    } catch {
        return {};
    }
}

function ensureLoaded() {
    if (loaded || typeof window === 'undefined') return;
    storeState = loadFromStorage();
    loaded = true;
}

function persist() {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(storeState));
    } catch {
        // ignore quota / privacy-mode errors
    }
}

function emit() {
    listeners.forEach((l) => l());
}

function setStore(next: Store) {
    storeState = next;
    persist();
    emit();
}

function subscribe(listener: () => void): () => void {
    ensureLoaded();
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

// Cross-tab / cross-instance sync: pick up external writes to the same key.
if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
        if (e.key !== STORAGE_KEY) return;
        storeState = loadFromStorage();
        emit();
    });
}

// Stable empty reference so getSnapshot doesn't return a new array each call
// (which would cause useSyncExternalStore to loop / warn).
const EMPTY: SearchEntry[] = [];

function getScopeList(appId: string | undefined, scope: SearchScope): SearchEntry[] {
    ensureLoaded();
    if (!appId) return EMPTY;
    return storeState[appId]?.[scope] ?? EMPTY;
}

function mutateScope(appId: string, scope: SearchScope, fn: (list: SearchEntry[]) => SearchEntry[]) {
    ensureLoaded();
    const forApp = storeState[appId] ?? {};
    const current = forApp[scope] ?? [];
    const next = fn(current);
    setStore({ ...storeState, [appId]: { ...forApp, [scope]: next } });
}

/* -------------------------------------------------------------------------- */

export interface UseSearchHistory {
    /** Favourites first (newest used first), then recent non-favourites. */
    entries: SearchEntry[];
    favourites: SearchEntry[];
    recents: SearchEntry[];
    /** Record a used search (creates or bumps the entry). No-op for blank queries. */
    record: (query: string, regex: boolean, caseSensitive: boolean) => void;
    /** Toggle the favourite flag for a search. Creates it if missing. */
    toggleFavourite: (query: string, regex: boolean, caseSensitive: boolean) => void;
    /** Remove a single search entry. */
    remove: (query: string, regex: boolean, caseSensitive: boolean) => void;
    /** Remove all non-favourite entries for this scope. */
    clearRecents: () => void;
    /** Remove everything (recents + favourites) for this scope. */
    clearAll: () => void;
}

/**
 * Per-app, per-type (feature/tag) search history with favourites, persisted to
 * localStorage via a shared module-level store. Favourites are pinned and
 * always surfaced; recents are capped and evicted oldest-first.
 */
export function useSearchHistory(appId: string | undefined, scope: SearchScope): UseSearchHistory {
    // Subscribe to the shared store. Server snapshot is always EMPTY so SSR and
    // the first client render agree (avoids hydration mismatch); the real data
    // arrives on the next tick once the store is read from localStorage.
    const list = useSyncExternalStore(
        subscribe,
        () => getScopeList(appId, scope),
        () => EMPTY
    );

    // Sort: favourites first, then recents; within each group newest-used first.
    const sorted = useMemo(() => {
        return [...list].sort((a, b) => {
            if (a.favourite !== b.favourite) return a.favourite ? -1 : 1;
            return b.lastUsed - a.lastUsed;
        });
    }, [list]);

    const favourites = useMemo(() => sorted.filter((e) => e.favourite), [sorted]);
    const recents = useMemo(() => sorted.filter((e) => !e.favourite), [sorted]);

    const record = useCallback(
        (query: string, regex: boolean, caseSensitive: boolean) => {
            if (!appId) return;
            const q = query.trim();
            if (!q) return;
            const key = { query: q, regex, caseSensitive };
            mutateScope(appId, scope, (current) => {
                const existing = current.find((e) => sameSearch(e, key));
                let next: SearchEntry[];
                if (existing) {
                    next = current.map((e) => (sameSearch(e, key) ? { ...e, lastUsed: Date.now() } : e));
                } else {
                    next = [{ ...key, favourite: false, lastUsed: Date.now() }, ...current];
                }
                // Evict oldest non-favourite recents beyond the cap.
                const favs = next.filter((e) => e.favourite);
                const recentsList = next
                    .filter((e) => !e.favourite)
                    .sort((a, b) => b.lastUsed - a.lastUsed)
                    .slice(0, MAX_RECENTS);
                return [...favs, ...recentsList];
            });
        },
        [appId, scope]
    );

    const toggleFavourite = useCallback(
        (query: string, regex: boolean, caseSensitive: boolean) => {
            if (!appId) return;
            const q = query.trim();
            if (!q) return;
            const key = { query: q, regex, caseSensitive };
            mutateScope(appId, scope, (current) => {
                const existing = current.find((e) => sameSearch(e, key));
                if (existing) {
                    return current.map((e) => (sameSearch(e, key) ? { ...e, favourite: !e.favourite } : e));
                }
                return [{ ...key, favourite: true, lastUsed: Date.now() }, ...current];
            });
        },
        [appId, scope]
    );

    const remove = useCallback(
        (query: string, regex: boolean, caseSensitive: boolean) => {
            if (!appId) return;
            const key = { query: query.trim(), regex, caseSensitive };
            mutateScope(appId, scope, (current) => current.filter((e) => !sameSearch(e, key)));
        },
        [appId, scope]
    );

    const clearRecents = useCallback(() => {
        if (!appId) return;
        mutateScope(appId, scope, (current) => current.filter((e) => e.favourite));
    }, [appId, scope]);

    const clearAll = useCallback(() => {
        if (!appId) return;
        mutateScope(appId, scope, () => []);
    }, [appId, scope]);

    return { entries: sorted, favourites, recents, record, toggleFavourite, remove, clearRecents, clearAll };
}
