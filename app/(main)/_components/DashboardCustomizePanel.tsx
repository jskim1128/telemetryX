'use client';

import React, { useState } from 'react';
import { Button } from 'primereact/button';
import { Checkbox } from 'primereact/checkbox';
import { InputText } from 'primereact/inputtext';
import { DASHBOARD_WIDGETS } from './dashboardWidgets';
import type { UseDashboardPrefs } from './useDashboardPrefs';

interface Props {
    prefsApi: UseDashboardPrefs;
    editing: boolean;
    onToggleEditing: () => void;
}

/**
 * Contents of the "Customize dashboard" OverlayPanel: show/hide widgets,
 * enter/exit reorder mode, and manage saved views.
 */
const DashboardCustomizePanel = ({ prefsApi, editing, onToggleEditing }: Props) => {
    const { prefs, toggleWidget, resetLayout, saveView, applyView, renameView, deleteView } = prefsApi;
    const hidden = new Set(prefs.hiddenWidgets);

    const [newViewName, setNewViewName] = useState('');
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameText, setRenameText] = useState('');

    const visibleCount = DASHBOARD_WIDGETS.length - prefs.hiddenWidgets.length;

    const handleSaveView = () => {
        const name = newViewName.trim();
        if (!name) return;
        saveView(name);
        setNewViewName('');
    };

    const startRename = (id: string, current: string) => {
        setRenamingId(id);
        setRenameText(current);
    };

    const commitRename = () => {
        if (renamingId) renameView(renamingId, renameText);
        setRenamingId(null);
        setRenameText('');
    };

    return (
        <div className="flex flex-column gap-3" style={{ width: '20rem', maxWidth: '90vw' }}>
            {/* Header */}
            <div className="flex align-items-center justify-content-between">
                <span className="font-semibold text-900">Customize dashboard</span>
                <Button
                    label={editing ? 'Done' : 'Reorder'}
                    icon={editing ? 'pi pi-check' : 'pi pi-arrows-alt'}
                    size="small"
                    severity={editing ? 'success' : 'secondary'}
                    outlined={!editing}
                    onClick={onToggleEditing}
                />
            </div>
            {editing && (
                <small className="text-500 -mt-2">Drag the handles on each widget to reorder, then click Done.</small>
            )}

            {/* Show/hide widgets */}
            <div>
                <div className="flex align-items-center justify-content-between mb-2">
                    <span className="text-500 text-xs font-semibold uppercase">Widgets ({visibleCount} shown)</span>
                </div>
                <div className="flex flex-column gap-1" style={{ maxHeight: '16rem', overflowY: 'auto' }}>
                    {DASHBOARD_WIDGETS.map((w) => {
                        const isVisible = !hidden.has(w.id);
                        return (
                            <label
                                key={w.id}
                                htmlFor={`wtoggle-${w.id}`}
                                className="flex align-items-center gap-2 px-2 py-2 border-round cursor-pointer hover:surface-100"
                            >
                                <Checkbox
                                    inputId={`wtoggle-${w.id}`}
                                    checked={isVisible}
                                    onChange={(e) => toggleWidget(w.id, !!e.checked)}
                                />
                                <span className={`text-sm ${isVisible ? 'text-900' : 'text-500'}`}>{w.title}</span>
                            </label>
                        );
                    })}
                </div>
            </div>

            {/* Saved views */}
            <div className="border-top-1 surface-border pt-3">
                <span className="text-500 text-xs font-semibold uppercase">Saved views</span>
                <div className="flex flex-column gap-1 mt-2">
                    {prefs.savedViews.length === 0 && (
                        <small className="text-500">No saved views yet. Save your current layout below.</small>
                    )}
                    {prefs.savedViews.map((v) => {
                        const isActive = prefs.activeViewId === v.id;
                        if (renamingId === v.id) {
                            return (
                                <div key={v.id} className="flex align-items-center gap-2">
                                    <InputText
                                        value={renameText}
                                        onChange={(e) => setRenameText(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && commitRename()}
                                        className="p-inputtext-sm flex-1"
                                        autoFocus
                                    />
                                    <Button icon="pi pi-check" size="small" text onClick={commitRename} />
                                </div>
                            );
                        }
                        return (
                            <div
                                key={v.id}
                                className={`flex align-items-center gap-1 px-2 py-1 border-round ${isActive ? 'bg-primary-50' : ''}`}
                            >
                                <button
                                    type="button"
                                    onClick={() => applyView(v.id)}
                                    className={`flex-1 text-left border-none bg-transparent cursor-pointer text-sm ${isActive ? 'text-primary font-semibold' : 'text-700'}`}
                                >
                                    {isActive && <i className="pi pi-check mr-1" style={{ fontSize: '0.7rem' }} />}
                                    {v.name}
                                </button>
                                <Button icon="pi pi-pencil" size="small" text severity="secondary" onClick={() => startRename(v.id, v.name)} tooltip="Rename" tooltipOptions={{ position: 'top' }} />
                                <Button icon="pi pi-trash" size="small" text severity="danger" onClick={() => deleteView(v.id)} tooltip="Delete" tooltipOptions={{ position: 'top' }} />
                            </div>
                        );
                    })}
                </div>

                {/* Save current as new view */}
                <div className="flex align-items-center gap-2 mt-2">
                    <InputText
                        value={newViewName}
                        onChange={(e) => setNewViewName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveView()}
                        placeholder="Save current as…"
                        className="p-inputtext-sm flex-1"
                    />
                    <Button icon="pi pi-save" size="small" onClick={handleSaveView} disabled={!newViewName.trim()} tooltip="Save view" tooltipOptions={{ position: 'top' }} />
                </div>
            </div>

            {/* Reset */}
            <div className="border-top-1 surface-border pt-3">
                <Button
                    label="Reset to default layout"
                    icon="pi pi-refresh"
                    size="small"
                    text
                    severity="secondary"
                    className="p-0"
                    onClick={resetLayout}
                />
            </div>
        </div>
    );
};

export default DashboardCustomizePanel;
