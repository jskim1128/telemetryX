'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from 'primereact/button';
import { Message } from 'primereact/message';
import { Skeleton } from 'primereact/skeleton';
import { Tag } from 'primereact/tag';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import MiniTrendChart, { TrendPoint } from './MiniTrendChart';
import './AiCard.css';

interface SummaryResp {
    summary: string;
    model: string;
    createdAt: string;
    fromCache: boolean;
    inputHash?: string;
    skipped?: boolean;
}

interface Overview {
    appOpens: number;
    featureTriggers: number;
    tagInstances: number;
    uniqueUsers: number;
}

interface SeriesPoint {
    day: string;
    category: string;
    count: number;
}

interface FeatureCount {
    featureName: string;
    count: number;
}

interface Props {
    appId: string;
    range: { from: Date; to: Date } | null;
    /** Overview KPIs — already loaded by the dashboard; drives the stat chips. */
    overview?: Overview;
    /** Per-(day, category) series — drives the sparkline & trend delta. */
    series?: SeriesPoint[];
    /** Top features — drives the share bars. */
    features?: FeatureCount[];
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

function fmtNum(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
}

// ---------------------------------------------------------------------------
// Derived visuals (all computed from data already loaded — no AI cost)
// ---------------------------------------------------------------------------

/** Collapse the per-(day, category) series into a dense daily-total trend. */
function buildDailyTrend(series?: SeriesPoint[]): TrendPoint[] {
    if (!series || series.length === 0) return [];
    const byDay: Record<string, number> = {};
    for (const row of series) {
        const day = row.day.slice(0, 10);
        byDay[day] = (byDay[day] || 0) + row.count;
    }
    return Object.entries(byDay)
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([day, count]) => ({ day, count }));
}

interface TrendDelta {
    pct: number;
    direction: 'up' | 'down' | 'flat';
}

/** Compare the total of the second half of the window against the first half. */
function computeTrendDelta(trend: TrendPoint[]): TrendDelta | null {
    if (trend.length < 2) return null;
    const mid = Math.floor(trend.length / 2);
    const first = trend.slice(0, mid).reduce((s, t) => s + t.count, 0);
    const second = trend.slice(mid).reduce((s, t) => s + t.count, 0);
    if (first === 0 && second === 0) return null;
    if (first === 0) return { pct: 100, direction: 'up' };
    const pct = Math.round(((second - first) / first) * 100);
    const direction = pct > 15 ? 'up' : pct < -15 ? 'down' : 'flat';
    return { pct, direction };
}

interface Sentiment {
    label: string;
    severity: 'success' | 'info' | 'warning' | 'danger' | undefined;
    icon: string;
}

/** Derive an at-a-glance health badge from the trend + feature concentration. */
function computeSentiment(
    delta: TrendDelta | null,
    features?: FeatureCount[]
): Sentiment | null {
    // Concentration risk: one feature dominates the rest.
    if (features && features.length >= 2) {
        const total = features.reduce((s, f) => s + f.count, 0);
        if (total > 0 && features[0].count / total >= 0.6) {
            return { label: 'Concentrated', severity: 'warning', icon: 'pi pi-exclamation-triangle' };
        }
    }
    if (!delta) return null;
    if (delta.direction === 'up') return { label: 'Growing', severity: 'success', icon: 'pi pi-arrow-up-right' };
    if (delta.direction === 'down') return { label: 'Cooling', severity: 'danger', icon: 'pi pi-arrow-down-right' };
    return { label: 'Steady', severity: 'info', icon: 'pi pi-minus' };
}

/** Top-N features expressed as a share of the leader (for bar widths). */
function buildFeatureBars(features?: FeatureCount[], limit = 4) {
    if (!features || features.length === 0) return [];
    const top = features.slice(0, limit);
    const max = Math.max(1, ...top.map((f) => f.count));
    return top.map((f) => ({
        name: f.featureName,
        count: f.count,
        pct: Math.round((f.count / max) * 100)
    }));
}

/** Pick a category icon for a summary bullet from its text (heuristic). */
function iconForBullet(text: string): string {
    const t = text.toLowerCase();
    if (/(suggest|recommend|consider|should|try|opportunit)/.test(t)) return 'pi pi-lightbulb';
    if (/(user|team|department|dept|concentrat|adopt)/.test(t)) return 'pi pi-users';
    if (/(feature|dominant|most|top)/.test(t)) return 'pi pi-star';
    if (/(trend|growth|grew|spike|slow|decline|accelerat|increase|decrease|flat)/.test(t)) return 'pi pi-chart-line';
    return 'pi pi-circle-fill';
}

/** Is this bullet the actionable suggestion (rendered as a callout)? */
function isSuggestion(text: string): boolean {
    return /(suggest|recommend|consider|you (should|could)|try |opportunit)/i.test(text);
}

function nodeText(node: any): string {
    if (node == null) return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(nodeText).join('');
    if (node.props?.children) return nodeText(node.props.children);
    return '';
}

const AiSummaryCard: React.FC<Props> = ({ appId, range, overview, series, features }) => {
    const [data, setData] = useState<SummaryResp | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const reqId = useRef(0);

    const trend = useMemo(() => buildDailyTrend(series), [series]);
    const delta = useMemo(() => computeTrendDelta(trend), [trend]);
    const sentiment = useMemo(() => computeSentiment(delta, features), [delta, features]);
    const featureBars = useMemo(() => buildFeatureBars(features), [features]);

    const activeDays = useMemo(() => trend.filter((t) => t.count > 0).length, [trend]);

    const hasVisuals =
        !!overview && (overview.appOpens + overview.featureTriggers + overview.tagInstances > 0);

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

    const kpis = overview
        ? [
              { label: 'App opens', value: overview.appOpens, icon: 'pi pi-sign-in', tone: 'blue' },
              { label: 'Feature triggers', value: overview.featureTriggers, icon: 'pi pi-bolt', tone: 'green' },
              { label: 'Unique users', value: overview.uniqueUsers, icon: 'pi pi-users', tone: 'purple' },
              { label: 'Active days', value: activeDays, icon: 'pi pi-calendar', tone: 'orange' }
          ]
        : [];

    // Custom markdown renderer: category icons on bullets + suggestion callout.
    const markdownComponents = {
        li: ({ children }: any) => {
            const text = nodeText(children);
            if (isSuggestion(text)) {
                return (
                    <li className="ai-suggestion-callout">
                        <i className="pi pi-lightbulb" aria-hidden="true" />
                        <span>{children}</span>
                    </li>
                );
            }
            return (
                <li className="ai-bullet">
                    <i className={iconForBullet(text)} aria-hidden="true" />
                    <span>{children}</span>
                </li>
            );
        }
    };

    return (
        <div className="col-12">
            <div className="ai-card card mb-0">
                <div className="flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
                    <div className="flex align-items-center gap-2">
                        <i className="fi fi-rr-sparkles ai-icon text-primary flex align-items-center justify-content-center" style={{ width: '2.25rem', height: '2.25rem' }} />
                        <div>
                            <div className="flex align-items-center gap-2 flex-wrap">
                                <h5 className="m-0">AI Summary</h5>
                                {sentiment && !loading && (
                                    <Tag
                                        value={sentiment.label}
                                        severity={sentiment.severity}
                                        icon={sentiment.icon}
                                        rounded
                                    />
                                )}
                            </div>
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

                {/* Data-driven visual band — shows immediately (independent of the AI fetch). */}
                {hasVisuals && (
                    <div className="ai-summary-visuals mb-3">
                        <div className="ai-summary-kpis">
                            {kpis.map((k) => (
                                <div key={k.label} className={`ai-kpi-chip ai-kpi-${k.tone}`}>
                                    <i className={k.icon} aria-hidden="true" />
                                    <div className="ai-kpi-meta">
                                        <span className="ai-kpi-value">{fmtNum(k.value)}</span>
                                        <span className="ai-kpi-label">{k.label}</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {trend.length > 1 && (
                            <div className="ai-trend">
                                <MiniTrendChart
                                    trend={trend}
                                    color="var(--primary-color)"
                                    width={120}
                                    height={40}
                                    ariaLabel="Daily activity trend"
                                />
                                {delta && (
                                    <span className={`ai-trend-delta ${delta.direction}`}>
                                        <i
                                            className={
                                                delta.direction === 'up'
                                                    ? 'pi pi-arrow-up'
                                                    : delta.direction === 'down'
                                                    ? 'pi pi-arrow-down'
                                                    : 'pi pi-minus'
                                            }
                                        />
                                        {delta.pct > 0 ? '+' : ''}
                                        {delta.pct}%
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {featureBars.length > 0 && (
                    <div className="ai-feature-bars mb-3">
                        <div className="ai-feature-bars-title">Top features</div>
                        {featureBars.map((f) => (
                            <div key={f.name} className="ai-feature-bar-row">
                                <span className="ai-feature-bar-label" title={f.name}>{f.name}</span>
                                <span className="ai-feature-bar-track">
                                    <span className="ai-feature-bar-fill" style={{ width: `${f.pct}%` }} />
                                </span>
                                <span className="ai-feature-bar-count">{fmtNum(f.count)}</span>
                            </div>
                        ))}
                    </div>
                )}

                {error && <Message severity="error" text={error} className="w-full mb-2" />}

                {loading && (
                    <div className="ai-summary-body py-2">
                        <Skeleton width="40%" height="1.25rem" className="mb-3" />
                        <Skeleton width="100%" className="mb-2" />
                        <Skeleton width="90%" className="mb-2" />
                        <Skeleton width="75%" />
                    </div>
                )}

                {data && !loading && (
                    <div className="ai-summary-body">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                            {data.summary}
                        </ReactMarkdown>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AiSummaryCard;
