import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { getDepartmentBreakdown, getOverview, getTimeSeries, getTopFeatures, getTopTags, getTopUsers, parseDateRange } from '@/lib/stats';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method not allowed' });
    }
    const id = req.query.id as string;
    if (!id) return res.status(400).json({ error: 'Missing id' });

    const range = parseDateRange(req.query.from as any, req.query.to as any);

    try {
        const app = await prisma.app.findUnique({ where: { id }, select: { id: true, name: true } });
        if (!app) return res.status(404).json({ error: 'App not found' });

        const [overview, series, departments, features, users, tags, recent] = await Promise.all([
            getOverview({ range, appId: id }),
            getTimeSeries({ range, appId: id }),
            getDepartmentBreakdown({ range, appId: id }),
            getTopFeatures({ range, appId: id, limit: 10 }),
            getTopUsers({ range, appId: id, limit: 10 }),
            getTopTags({ range, appId: id, limit: 10 }),
            getRecentEvents(id, 20)
        ]);

        return res.status(200).json({
            app,
            range,
            overview,
            series,
            departments,
            features,
            users,
            tags,
            recent
        });
    } catch (err) {
        console.error('app stats error', err);
        return res.status(500).json({ error: 'Failed to compute app stats' });
    }
}

async function getRecentEvents(appId: string, limit: number) {
    const [opens, features, tags] = await Promise.all([
        prisma.appOpenEvent.findMany({
            where: { appId },
            orderBy: { createdAt: 'desc' },
            take: limit,
            select: { id: true, createdAt: true, email: true, department: true, sessionId: true }
        }),
        prisma.featureEvent.findMany({
            where: { appId },
            orderBy: { createdAt: 'desc' },
            take: limit,
            select: { id: true, createdAt: true, email: true, department: true, featureName: true }
        }),
        prisma.tagEvent.findMany({
            where: { appId },
            orderBy: { createdAt: 'desc' },
            take: limit,
            select: { id: true, createdAt: true, email: true, department: true, tag: true }
        })
    ]);

    const all = [
        ...opens.map((e) => ({ ...e, type: 'app_open' as const, label: 'App opened' })),
        ...features.map((e) => ({ ...e, type: 'feature' as const, label: e.featureName })),
        ...tags.map((e) => ({ ...e, type: 'tag' as const, label: e.tag }))
    ];
    return all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
}
