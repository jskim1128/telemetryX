'use client';

import React, { useMemo, useState } from 'react';
import { Button } from 'primereact/button';
import type { SearchEntry } from './useSearchHistory';

export interface SearchChipsProps {
    favourites: SearchEntry[];
    recents: SearchEntry[];
    /** Currently active query text so the matching chip can be highlighted. */
    activeQuery?: string;
    activeRegex?: boolean;
    activeCase?: boolean;
    accent?: 'green' | 'orange' | 'blue';
    /** Apply a chip's search (fills the input + flags). */
    onApply: (entry: SearchEntry) => void;
    onToggleFavourite: (entry: SearchEntry) => void;
    onRemove: (entry: SearchEntry) => void;
    onClearRecents: () => void;
}

// How many chips to show before collapsing behind "Show more".
const COLLAPSED_CHIPS = 8;

function isActive(entry: SearchEntry, q?: string, regex?: boolean, cs?: boolean): boolean {
    return entry.query === (q ?? '').trim() && entry.regex === !!regex && entry.caseSensitive === !!cs;
}

const Chip = ({
    entry,
    active,
    accent,
    onApply,
    onToggleFavourite,
    onRemove
}: {
    entry: SearchEntry;
    active: boolean;
    accent: 'green' | 'orange' | 'blue';
    onApply: (e: SearchEntry) => void;
    onToggleFavourite: (e: SearchEntry) => void;
    onRemove: (e: SearchEntry) => void;
}) => {
    const activeCls = active ? `bg-${accent}-100 border-${accent}-300 text-${accent}-700` : 'surface-100 surface-border text-700';
    return (
        <div
            className={`inline-flex align-items-center gap-1 border-1 border-round-lg pl-2 pr-1 py-1 ${activeCls}`}
            style={{ maxWidth: '100%' }}
        >
            {/* Favourite toggle */}
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavourite(entry);
                }}
                className="p-0 bg-transparent border-none cursor-pointer flex align-items-center"
                aria-label={entry.favourite ? 'Unfavourite search' : 'Favourite search'}
                title={entry.favourite ? 'Remove from favourites' : 'Save to favourites'}
                style={{ lineHeight: 1 }}
            >
                <i
                    className={`pi ${entry.favourite ? 'pi-star-fill text-yellow-500' : 'pi-star text-400'}`}
                    style={{ fontSize: '0.75rem' }}
                />
            </button>

            {/* Query label (click to apply) */}
            <button
                type="button"
                onClick={() => onApply(entry)}
                className="p-0 bg-transparent border-none cursor-pointer text-left flex align-items-center gap-1 white-space-nowrap overflow-hidden text-overflow-ellipsis"
                title={entry.query}
                style={{ maxWidth: '14rem', color: 'inherit' }}
            >
                <span className="text-sm white-space-nowrap overflow-hidden text-overflow-ellipsis">{entry.query}</span>
                {entry.regex && (
                    <span className="text-xs px-1 border-round surface-200 text-500" title="Regular expression">
                        .*
                    </span>
                )}
                {entry.caseSensitive && (
                    <span className="text-xs px-1 border-round surface-200 text-500" title="Case sensitive">
                        Aa
                    </span>
                )}
            </button>

            {/* Remove */}
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    onRemove(entry);
                }}
                className="p-0 bg-transparent border-none cursor-pointer flex align-items-center text-400 hover:text-700"
                aria-label="Remove search"
                title="Remove"
                style={{ lineHeight: 1 }}
            >
                <i className="pi pi-times" style={{ fontSize: '0.7rem' }} />
            </button>
        </div>
    );
};

const SearchChips = ({
    favourites,
    recents,
    activeQuery,
    activeRegex,
    activeCase,
    accent = 'blue',
    onApply,
    onToggleFavourite,
    onRemove,
    onClearRecents
}: SearchChipsProps) => {
    const [expanded, setExpanded] = useState(false);

    // Single combined list: favourites first (star indicates them), then recents.
    const all = useMemo(() => [...favourites, ...recents], [favourites, recents]);

    const visible = useMemo(() => (expanded ? all : all.slice(0, COLLAPSED_CHIPS)), [all, expanded]);
    const hiddenCount = all.length - visible.length;

    if (all.length === 0) return null;

    return (
        <div className="mt-1 mb-2 flex flex-wrap align-items-center gap-2">
            {visible.map((entry) => (
                <Chip
                    key={`${entry.query}-${entry.regex}-${entry.caseSensitive}`}
                    entry={entry}
                    active={isActive(entry, activeQuery, activeRegex, activeCase)}
                    accent={accent}
                    onApply={onApply}
                    onToggleFavourite={onToggleFavourite}
                    onRemove={onRemove}
                />
            ))}
            {hiddenCount > 0 && (
                <Button
                    type="button"
                    label={`+${hiddenCount} more`}
                    text
                    size="small"
                    className="p-1 text-xs"
                    style={{ height: 'auto' }}
                    onClick={() => setExpanded(true)}
                />
            )}
            {expanded && all.length > COLLAPSED_CHIPS && (
                <Button
                    type="button"
                    label="Show less"
                    text
                    size="small"
                    className="p-1 text-xs"
                    style={{ height: 'auto' }}
                    onClick={() => setExpanded(false)}
                />
            )}
            {recents.length > 0 && (
                <Button
                    type="button"
                    icon="pi pi-trash"
                    text
                    severity="secondary"
                    size="small"
                    className="p-1 text-xs text-400"
                    style={{ height: 'auto' }}
                    onClick={onClearRecents}
                    tooltip="Clear recent searches"
                    tooltipOptions={{ position: 'top' }}
                />
            )}
        </div>
    );
};

export default SearchChips;
