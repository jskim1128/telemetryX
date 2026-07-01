'use client';

import React from 'react';

export interface ComboMetric {
    label: string;
    value: number;
}

export interface ComboStatCardProps {
    title: string;
    icon: string;
    bg: string;
    color: string;
    accent: 'green' | 'orange';
    primary: ComboMetric;
    secondary: ComboMetric;
    search?: React.ReactNode;
}

const ComboStatCard = ({ title, icon, bg, color, accent, primary, secondary, search }: ComboStatCardProps) => (
    <div className="mb-3 pb-3 surface-border">
        {/* Row 1: icon + title + metrics */}
        <div className="flex align-items-center gap-3">
            {/* Icon badge */}
            <div className={`flex align-items-center justify-content-center flex-shrink-0 ${bg} border-round`} style={{ width: '2.5rem', height: '2.5rem' }}>
                <i className={`pi ${icon} ${color} text-xl`} />
            </div>

            {/* Title */}
            <span className="text-900 font-semibold text-lg flex-shrink-0" style={{ minWidth: '4rem' }}>{title}</span>

            {/* Row 2: search */}
            {search && <div className="justify-content-center">{search}</div>}

            {/* Two metrics side-by-side, separated by a divider */}
            <div className="flex align-items-center gap-3 flex-1 justify-content-end">
                <div className="text-right">
                    <span className="block text-500 text-sm">{primary.label}</span>
                    <span className={`text-${accent}-600 font-bold text-2xl`}>{primary.value.toLocaleString()}</span>
                </div>
                <div className="border-left-1 surface-border align-self-stretch" />
                <div className="text-right">
                    <span className="block text-500 text-sm">{secondary.label}</span>
                    <span className="text-900 font-bold text-2xl">{secondary.value.toLocaleString()}</span>
                </div>
            </div>
        </div>

    </div>
);

export default ComboStatCard;
