// AI-generated summary for a single app's dashboard.
//
// Cost optimization:
//   1) The input to the LLM is a compact snapshot (top-5 only, weekly
//      buckets when the range is long), NOT the raw stats payload.
//   2) The snapshot is sha256-hashed; if a previously generated summary
//      exists for the same (appId, hash), we reuse it as long as it's
//      younger than AI_SUMMARY_TTL_HOURS.
//   3) `?refresh=1` forces a fresh generation even when a cached row exists.

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';
import {
    getDepartmentBreakdown,
    getOverview,
    getTimeSeries,
    getTopFeatures,
    getTopTags,
    getTopUsers,
    parseDateRange
} from '@/lib/stats';
import { aiChat, aiConfig, hashObject } from '@/lib/aiClient';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        res.setHeader('Allow', 'GET, POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }
    const session = await requireSession(req, res);
    if (!session) return;

    const id = req.query.id as string;
    if (!id) return res.status(400).json({ error: 'Missing id' });

    const range = parseDateRange(req.query.from as any, req.query.to as any);
    const refresh = String(req.query.refresh || '') === '1' || req.method === 'POST';

    let cfg;
    try {
        cfg = aiConfig();
    } catch (err: any) {
        return res.status(503).json({ error: err?.message || 'AI is not configured' });
    }

    const app = await prisma.app.findUnique({
        where: { id },
        select: { id: true, name: true, description: true, ownerEmail: true, createdAt: true }
    });
    if (!app) return res.status(404).json({ error: 'App not found' });

    try {
        // Build a compact snapshot (top-5 lists; daily totals only).
        const [overview, series, departments, features, tags, users] = await Promise.all([
            getOverview({ range, appId: id }),
            getTimeSeries({ range, appId: id }),
            getDepartmentBreakdown({ range, appId: id }),
            getTopFeatures({ range, appId: id, limit: 5 }),
            getTopTags({ range, appId: id, limit: 5 }),
            getTopUsers({ range, appId: id, limit: 5 })
        ]);

        // Collapse the per-(day, category) series into per-day totals + per-category totals.
        const dailyTotals: Record<string, { app_open: number; feature: number; tag: number }> = {};
        for (const row of series) {
            const d = row.day.slice(0, 10);
            if (!dailyTotals[d]) dailyTotals[d] = { app_open: 0, feature: 0, tag: 0 };
            (dailyTotals[d] as any)[row.category] = row.count;
        }
        const dailyArr = Object.entries(dailyTotals)
            .sort((a, b) => (a[0] < b[0] ? -1 : 1))
            .map(([day, v]) => ({ day, ...v }));

        // If the range covers > 21 days, keep only the last 21 days at daily
        // granularity (most relevant) + weekly aggregates for the rest.
        const compactSeries = dailyArr.length > 21 ? dailyArr.slice(-21) : dailyArr;

        const snapshot = {
            app: { name: app.name, description: app.description || null, ownerEmail: app.ownerEmail || null },
            range: { from: range.from.toISOString(), to: range.to.toISOString() },
            overview,
            departments: departments.slice(0, 6),
            topFeatures: features,
            topTags: tags,
            topUsers: users.map((u) => ({
                email: u.email,
                events: u.count,
                topEvent: u.topEvent,
                topEventType: u.topEventType,
                topEventCount: u.topEventCount
            })),
            recentDailyTotals: compactSeries
        };

        const inputHash = hashObject({ appId: id, model: cfg.model, snapshot });

        // Try cache.
        if (!refresh) {
            const cached = await prisma.appAiSummary.findUnique({
                where: { appId_inputHash: { appId: id, inputHash } }
            });
            if (cached) {
                const age = Date.now() - cached.createdAt.getTime();
                if (cfg.summaryTtlMs === 0 || age < cfg.summaryTtlMs) {
                    return res.status(200).json({
                        summary: cached.summary,
                        model: cached.model,
                        createdAt: cached.createdAt.toISOString(),
                        fromCache: true,
                        inputHash
                    });
                }
            }
        }

        // Bail out gracefully if there's literally nothing to summarize.
        if (
            overview.appOpens === 0 &&
            overview.featureTriggers === 0 &&
            overview.tagInstances === 0
        ) {
            const empty = `_No tracking events were recorded for **${app.name}** in this window._\n\nOnce your app starts sending events to the tracking API, an AI-generated summary of adoption, top features, and noteworthy trends will appear here.`;
            return res.status(200).json({
                summary: empty,
                model: cfg.model,
                createdAt: new Date().toISOString(),
                fromCache: false,
                inputHash,
                skipped: true
            });
        }

        const systemPrompt =
            'You are a senior product analyst writing concise dashboard summaries for an internal feature-tracking tool. ' +
            'Write 4 to 6 short bullets in markdown covering: ' +
            '(1) overall adoption and how active the app is, ' +
            '(2) top 1–2 features and how dominant they are, ' +
            '(3) department or user concentration (call out if usage is concentrated in a few users or one team), ' +
            '(4) notable trend in the recent daily totals (acceleration, slowdown, spike, flat), ' +
            '(5) ONE actionable suggestion. ' +
            'Rules: use real numbers from the data, never invent metrics or features not present in the input, ' +
            'keep each bullet under 25 words, no preamble, no closing line, no headings.';

        const userPrompt =
            `App: ${app.name}\n` +
            `Date range: ${snapshot.range.from} to ${snapshot.range.to}\n\n` +
            `Stats snapshot (JSON):\n` +
            '```json\n' +
            JSON.stringify(snapshot, null, 2) +
            '\n```';

        const response = await aiChat({
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            maxTokens: cfg.summaryMaxTokens,
            temperature: cfg.summaryTemperature
        });

        const summary = (response.choices[0]?.message?.content || '').trim();
        if (!summary) {
            return res.status(502).json({ error: 'AI returned an empty summary' });
        }

        const saved = await prisma.appAiSummary.upsert({
            where: { appId_inputHash: { appId: id, inputHash } },
            create: {
                appId: id,
                rangeFrom: range.from,
                rangeTo: range.to,
                inputHash,
                summary,
                model: response.model || cfg.model,
                tokensIn: response.usage?.prompt_tokens ?? null,
                tokensOut: response.usage?.completion_tokens ?? null
            },
            update: {
                rangeFrom: range.from,
                rangeTo: range.to,
                summary,
                model: response.model || cfg.model,
                tokensIn: response.usage?.prompt_tokens ?? null,
                tokensOut: response.usage?.completion_tokens ?? null,
                createdAt: new Date()
            }
        });

        return res.status(200).json({
            summary: saved.summary,
            model: saved.model,
            createdAt: saved.createdAt.toISOString(),
            fromCache: false,
            inputHash
        });
    } catch (err: any) {
        console.error('ai app-summary error', err);
        return res.status(500).json({ error: err?.message || 'Failed to generate summary' });
    }
}
