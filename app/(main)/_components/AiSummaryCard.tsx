'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Button } from 'primereact/button';
import { Message } from 'primereact/message';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Tag } from 'primereact/tag';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './AiCard.css';

interface SummaryResp {
    summary: string;
    model: string;
    createdAt: string;
    fromCache: boolean;
    inputHash?: string;
    skipped?: boolean;
}

interface Props {
    appId: string;
    range: { from: Date; to: Date } | null;
}

function fmtRelative(iso: string): string {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const s = Math.round(diff / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.round(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    return d.toLocaleString();
}

const AiSummaryCard: React.FC<Props> = ({ appId, range }) => {
    const [data, setData] = useState<SummaryResp | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const reqId = useRef(0);

    const load = async (refresh = false) => {
        if (!range) return;
        const myReq = ++reqId.current;
        setLoading(true);
        setError(null);
        try {
            const qs = new URLSearchParams();
            qs.set('from', range.from.toISOString());
            qs.set('to', range.to.toISOString());
            if (refresh) qs.set('refresh', '1');
            const res = await fetch(`/api/ai/app-summary/${appId}?${qs.toString()}`, {
                method: refresh ? 'POST' : 'GET',
                cache: 'no-store'
            });
            const json = await res.json();
            if (myReq !== reqId.current) return; // stale
            if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
            setData(json);
        } catch (err: any) {
            if (myReq !== reqId.current) return;
            setError(err?.message || 'Failed to load summary');
        } finally {
            if (myReq === reqId.current) setLoading(false);
        }
    };

    useEffect(() => {
        if (appId && range) load(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [appId, range?.from?.getTime(), range?.to?.getTime()]);

    return (
        <div className="col-12">
            <div className="ai-card card mb-0">
                <div className="flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
                    <div className="flex align-items-center gap-2">
                        <i className="fi fi-rr-sparkles ai-icon text-primary flex align-items-center justify-content-center" style={{ width: '2.25rem', height: '2.25rem' }} />
                        <div>
                            <h5 className="m-0">AI Summary</h5>
                            <small className="text-500">
                                Generated from the current date range
                                {data && (
                                    <>
                                        {' · '}
                                        <span title={new Date(data.createdAt).toLocaleString()}>
                                            {data.fromCache ? 'cached ' : ''}
                                            {fmtRelative(data.createdAt)}
                                        </span>
                                    </>
                                )}
                            </small>
                        </div>
                    </div>
                    <div className="flex align-items-center gap-2">
                        {data?.skipped && <Tag value="No data" severity="warning" rounded />}
                        <Button
                            icon={loading ? 'pi pi-spin pi-spinner' : 'pi pi-refresh'}
                            text
                            severity='secondary'
                            disabled={loading || !range}
                            onClick={() => load(true)}
                        />
                    </div>
                </div>

                {error && <Message severity="error" text={error} className="w-full mb-2" />}

                {loading && !data && (
                    <div className="flex align-items-center gap-3 py-3">
                        <ProgressSpinner style={{ width: '1.75rem', height: '1.75rem' }} strokeWidth="4" />
                        <span className="text-500">Analyzing tracking data…</span>
                    </div>
                )}

                {data && (
                    <div className={`ai-summary-body ${loading ? 'opacity-60' : ''}`}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.summary}</ReactMarkdown>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AiSummaryCard;
