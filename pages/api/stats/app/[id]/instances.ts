import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { getFeatureInstances, getTagInstances, parseDateRange } from '@/lib/stats';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method not allowed' });
    }
    const id = req.query.id as string;
    if (!id) return res.status(400).json({ error: 'Missing id' });

    const type = req.query.type as string;
    const name = req.query.name as string;
    if (type !== 'feature' && type !== 'tag') {
        return res.status(400).json({ error: 'type must be "feature" or "tag"' });
    }
    if (!name) return res.status(400).json({ error: 'Missing name' });

    const range = parseDateRange(req.query.from as any, req.query.to as any);

    try {
        const app = await prisma.app.findUnique({ where: { id }, select: { id: true } });
        if (!app) return res.status(404).json({ error: 'App not found' });

        const instances =
            type === 'feature'
                ? await getFeatureInstances({ range, appId: id, featureName: name })
                : await getTagInstances({ range, appId: id, tag: name });

        return res.status(200).json({ type, name, instances });
    } catch (err) {
        console.error('app instances error', err);
        return res.status(500).json({ error: 'Failed to fetch instances' });
    }
}
