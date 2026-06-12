import type { NextApiRequest, NextApiResponse } from 'next';
import { getTimeSeries, parseDateRange } from '@/lib/stats';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method not allowed' });
    }
    const range = parseDateRange(req.query.from as any, req.query.to as any);
    const appId = (req.query.appId as string) || undefined;
    const department = (req.query.department as string) || undefined;

    try {
        const rows = await getTimeSeries({ range, appId, department });
        return res.status(200).json({ range, series: rows });
    } catch (err) {
        console.error('timeseries stats error', err);
        return res.status(500).json({ error: 'Failed to compute time series' });
    }
}
