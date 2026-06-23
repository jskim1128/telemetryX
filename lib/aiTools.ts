// Tools (a.k.a. functions) exposed to the LLM for the chatbot.
//
// Each tool is a thin wrapper around lib/stats.ts (or a small Prisma query
// for things stats.ts doesn't already cover). The LLM picks which tool to
// call based on the user's question, the gateway returns the call, the
// chat endpoint executes it server-side, appends the JSON result back into
// the conversation, and re-invokes the model. This avoids dumping raw
// event rows into the prompt and keeps token usage bounded.

import { prisma } from './prisma';
import {
    getDepartmentBreakdown,
    getOverview,
    getTimeSeries,
    getTopFeatures,
    getTopFeatureTimeSeries,
    getTopTags,
    getTopTagTimeSeries,
    getTopUsers,
    parseDateRange
} from './stats';
import type { ToolDef } from './aiClient';

// Hard caps on result sizes to keep token usage predictable.
const MAX_LIMIT = 25;
const MAX_RECENT = 50;

export const AI_TOOLS: ToolDef[] = [
    {
        type: 'function',
        function: {
            name: 'list_apps',
            description: 'List the apps the current user can access. Use this when the user references an app by name and you need its id, or to enumerate apps for cross-app questions.',
            parameters: {
                type: 'object',
                properties: {},
                additionalProperties: false
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_overview',
            description: 'Return KPI counts (app opens, feature triggers, tag instances, unique users) for an app in a date range.',
            parameters: {
                type: 'object',
                properties: {
                    appId: { type: 'string', description: 'The App.id. Required unless asking about global metrics.' },
                    from: { type: 'string', description: 'ISO date or datetime. Defaults to 30 days ago.' },
                    to: { type: 'string', description: 'ISO date or datetime. Defaults to now.' }
                },
                required: ['appId'],
                additionalProperties: false
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_time_series',
            description: 'Return daily counts (app_open / feature / tag) for an app within a date range. Useful for trend questions.',
            parameters: {
                type: 'object',
                properties: {
                    appId: { type: 'string' },
                    from: { type: 'string' },
                    to: { type: 'string' }
                },
                required: ['appId'],
                additionalProperties: false
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_top_features',
            description: 'Top N feature names triggered for an app in a date range.',
            parameters: {
                type: 'object',
                properties: {
                    appId: { type: 'string' },
                    from: { type: 'string' },
                    to: { type: 'string' },
                    limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT, default: 10 }
                },
                required: ['appId'],
                additionalProperties: false
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_top_features_trend',
            description: 'Daily counts per top-N feature name for an app within a date range. Use to compare feature growth/decline over time.',
            parameters: {
                type: 'object',
                properties: {
                    appId: { type: 'string' },
                    from: { type: 'string' },
                    to: { type: 'string' },
                    limit: { type: 'integer', minimum: 1, maximum: 10, default: 5 }
                },
                required: ['appId'],
                additionalProperties: false
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_top_tags',
            description: 'Top N tag values for an app in a date range.',
            parameters: {
                type: 'object',
                properties: {
                    appId: { type: 'string' },
                    from: { type: 'string' },
                    to: { type: 'string' },
                    limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT, default: 10 }
                },
                required: ['appId'],
                additionalProperties: false
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_top_tags_trend',
            description: 'Daily counts per top-N tag value for an app within a date range.',
            parameters: {
                type: 'object',
                properties: {
                    appId: { type: 'string' },
                    from: { type: 'string' },
                    to: { type: 'string' },
                    limit: { type: 'integer', minimum: 1, maximum: 10, default: 5 }
                },
                required: ['appId'],
                additionalProperties: false
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_top_users',
            description: 'Top N most-active user emails for an app in a date range, including each user\'s top event.',
            parameters: {
                type: 'object',
                properties: {
                    appId: { type: 'string' },
                    from: { type: 'string' },
                    to: { type: 'string' },
                    limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT, default: 10 }
                },
                required: ['appId'],
                additionalProperties: false
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_department_breakdown',
            description: 'Counts of events grouped by department for an app in a date range.',
            parameters: {
                type: 'object',
                properties: {
                    appId: { type: 'string' },
                    from: { type: 'string' },
                    to: { type: 'string' }
                },
                required: ['appId'],
                additionalProperties: false
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_recent_events',
            description: 'The most recent N events for an app (mixed across app opens, features, tags).',
            parameters: {
                type: 'object',
                properties: {
                    appId: { type: 'string' },
                    limit: { type: 'integer', minimum: 1, maximum: MAX_RECENT, default: 20 }
                },
                required: ['appId'],
                additionalProperties: false
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'compare_periods',
            description: 'Compare KPI overviews between two date ranges (A vs B) for an app. Returns both overviews and the absolute and percent deltas.',
            parameters: {
                type: 'object',
                properties: {
                    appId: { type: 'string' },
                    fromA: { type: 'string' },
                    toA: { type: 'string' },
                    fromB: { type: 'string' },
                    toB: { type: 'string' }
                },
                required: ['appId', 'fromA', 'toA', 'fromB', 'toB'],
                additionalProperties: false
            }
        }
    }
];

export interface ToolContext {
    /** When the chat is scoped to one app, all tool calls are forced to use this id. */
    appId: string | null;
}

function clampLimit(n: unknown, fallback: number, max: number): number {
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return fallback;
    return Math.min(max, Math.floor(v));
}

function resolveAppId(args: any, ctx: ToolContext): string {
    // Scoped conversations override whatever the LLM tries to pass — this
    // prevents cross-app data leakage if the LLM hallucinates an appId.
    if (ctx.appId) return ctx.appId;
    const id = typeof args?.appId === 'string' ? args.appId.trim() : '';
    if (!id) throw new Error('appId is required');
    return id;
}

/** Truncate a value so the JSON we hand back to the LLM stays small. */
function truncate<T>(value: T, max = 8000): T {
    const json = JSON.stringify(value);
    if (json.length <= max) return value;
    // Last-ditch fallback: return a string telling the model the data was too large.
    return ({
        truncated: true,
        note: `Result was ${json.length} chars; truncated for token budget. Re-run with a tighter date range or smaller limit.`
    } as unknown) as T;
}

function pctDelta(a: number, b: number): number | null {
    if (a === 0 && b === 0) return 0;
    if (a === 0) return null;
    return Number((((b - a) / a) * 100).toFixed(1));
}

export async function executeTool(name: string, rawArgs: string, ctx: ToolContext): Promise<string> {
    let args: any = {};
    try {
        args = rawArgs ? JSON.parse(rawArgs) : {};
    } catch {
        return JSON.stringify({ error: 'Invalid JSON arguments' });
    }

    try {
        switch (name) {
            case 'list_apps': {
                const apps = await prisma.app.findMany({
                    where: { active: true },
                    select: { id: true, name: true, ownerEmail: true, description: true, createdAt: true },
                    orderBy: { name: 'asc' },
                    take: 100
                });
                return JSON.stringify(truncate({ apps }));
            }
            case 'get_overview': {
                const appId = resolveAppId(args, ctx);
                const range = parseDateRange(args.from, args.to);
                const result = await getOverview({ range, appId });
                return JSON.stringify(truncate({ appId, range, ...result }));
            }
            case 'get_time_series': {
                const appId = resolveAppId(args, ctx);
                const range = parseDateRange(args.from, args.to);
                const series = await getTimeSeries({ range, appId });
                return JSON.stringify(truncate({ appId, range, series }));
            }
            case 'get_top_features': {
                const appId = resolveAppId(args, ctx);
                const range = parseDateRange(args.from, args.to);
                const limit = clampLimit(args.limit, 10, MAX_LIMIT);
                const features = await getTopFeatures({ range, appId, limit });
                return JSON.stringify(truncate({ appId, range, features }));
            }
            case 'get_top_features_trend': {
                const appId = resolveAppId(args, ctx);
                const range = parseDateRange(args.from, args.to);
                const limit = clampLimit(args.limit, 5, 10);
                const series = await getTopFeatureTimeSeries({ range, appId, limit });
                return JSON.stringify(truncate({ appId, range, series }));
            }
            case 'get_top_tags': {
                const appId = resolveAppId(args, ctx);
                const range = parseDateRange(args.from, args.to);
                const limit = clampLimit(args.limit, 10, MAX_LIMIT);
                const tags = await getTopTags({ range, appId, limit });
                return JSON.stringify(truncate({ appId, range, tags }));
            }
            case 'get_top_tags_trend': {
                const appId = resolveAppId(args, ctx);
                const range = parseDateRange(args.from, args.to);
                const limit = clampLimit(args.limit, 5, 10);
                const series = await getTopTagTimeSeries({ range, appId, limit });
                return JSON.stringify(truncate({ appId, range, series }));
            }
            case 'get_top_users': {
                const appId = resolveAppId(args, ctx);
                const range = parseDateRange(args.from, args.to);
                const limit = clampLimit(args.limit, 10, MAX_LIMIT);
                const users = await getTopUsers({ range, appId, limit });
                return JSON.stringify(truncate({ appId, range, users }));
            }
            case 'get_department_breakdown': {
                const appId = resolveAppId(args, ctx);
                const range = parseDateRange(args.from, args.to);
                const departments = await getDepartmentBreakdown({ range, appId });
                return JSON.stringify(truncate({ appId, range, departments }));
            }
            case 'get_recent_events': {
                const appId = resolveAppId(args, ctx);
                const limit = clampLimit(args.limit, 20, MAX_RECENT);
                const [opens, features, tags] = await Promise.all([
                    prisma.appOpenEvent.findMany({
                        where: { appId },
                        orderBy: { createdAt: 'desc' },
                        take: limit,
                        select: { createdAt: true, email: true, department: true, sessionId: true }
                    }),
                    prisma.featureEvent.findMany({
                        where: { appId },
                        orderBy: { createdAt: 'desc' },
                        take: limit,
                        select: { createdAt: true, email: true, department: true, featureName: true }
                    }),
                    prisma.tagEvent.findMany({
                        where: { appId },
                        orderBy: { createdAt: 'desc' },
                        take: limit,
                        select: { createdAt: true, email: true, department: true, tag: true }
                    })
                ]);
                const all = [
                    ...opens.map((e) => ({ ...e, type: 'app_open' as const, label: 'App opened' })),
                    ...features.map((e) => ({ ...e, type: 'feature' as const, label: e.featureName })),
                    ...tags.map((e) => ({ ...e, type: 'tag' as const, label: e.tag }))
                ];
                const recent = all
                    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
                    .slice(0, limit)
                    .map((e) => ({ ...e, createdAt: e.createdAt.toISOString() }));
                return JSON.stringify(truncate({ appId, recent }));
            }
            case 'compare_periods': {
                const appId = resolveAppId(args, ctx);
                const rA = parseDateRange(args.fromA, args.toA);
                const rB = parseDateRange(args.fromB, args.toB);
                const [a, b] = await Promise.all([
                    getOverview({ range: rA, appId }),
                    getOverview({ range: rB, appId })
                ]);
                const delta = {
                    appOpens: { abs: b.appOpens - a.appOpens, pct: pctDelta(a.appOpens, b.appOpens) },
                    featureTriggers: {
                        abs: b.featureTriggers - a.featureTriggers,
                        pct: pctDelta(a.featureTriggers, b.featureTriggers)
                    },
                    tagInstances: { abs: b.tagInstances - a.tagInstances, pct: pctDelta(a.tagInstances, b.tagInstances) },
                    uniqueUsers: { abs: b.uniqueUsers - a.uniqueUsers, pct: pctDelta(a.uniqueUsers, b.uniqueUsers) }
                };
                return JSON.stringify(truncate({ appId, periodA: { range: rA, overview: a }, periodB: { range: rB, overview: b }, delta }));
            }
            default:
                return JSON.stringify({ error: `Unknown tool: ${name}` });
        }
    } catch (err: any) {
        return JSON.stringify({ error: err?.message || 'Tool execution failed' });
    }
}
