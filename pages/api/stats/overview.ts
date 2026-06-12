import type { NextApiRequest, NextApiResponse } from 'next';
import { getDepartmentBreakdown, getOverview, getTopApps, getTopFeatures, parseDateRange } from '@/lib/stats';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method not allowed' });
    }
    const range = parseDateRange(req.query.from as any, req.query.to as any);
    const appId = (req.query.appId as string) || undefined;
    const department = (req.query.department as string) || undefined;

    try {
        const [overview, departments, topApps, topFeatures] = await Promise.all([
            getOverview({ range, appId, department }),
            getDepartmentBreakdown({ range, appId }),
            getTopApps({ range, limit: 10 }),
            getTopFeatures({ range, appId, limit: 10 })
        ]);
        return res.status(200).json({
            range,
            overview,
            departments,
            topApps,
            topFeatures
        });
    } catch (err) {
        console.error('overview stats error', err);
        return res.status(500).json({ error: 'Failed to compute overview' });
    }
}
