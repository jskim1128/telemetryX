import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { getAllFeatureDetails, getAllTagDetails, getAppUsageSummary, getOverview, parseDateRange } from '@/lib/stats';

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

        const [overview, features, tags, usage] = await Promise.all([
            getOverview({ range, appId: id }),
            getAllFeatureDetails({ range, appId: id }),
            getAllTagDetails({ range, appId: id }),
            getAppUsageSummary({ range, appId: id })
        ]);

        return res.status(200).json({
            app,
            range,
            overview,
            features,
            tags,
            usage
        });
    } catch (err) {
        console.error('app detail stats error', err);
        return res.status(500).json({ error: 'Failed to compute app detail stats' });
    }
}
