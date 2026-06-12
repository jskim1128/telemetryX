import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { generateApiKey } from '@/lib/apiKey';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }
    const id = req.query.id as string;
    if (!id) return res.status(400).json({ error: 'Missing id' });

    const key = generateApiKey();
    try {
        const app = await prisma.app.update({
            where: { id },
            data: { apiKeyHash: key.hash, apiKeyPrefix: key.prefix },
            select: { id: true, name: true, apiKeyPrefix: true }
        });
        return res.status(200).json({
            app,
            // Plaintext shown ONCE — caller must save it.
            apiKey: key.plaintext
        });
    } catch (err: any) {
        if (err?.code === 'P2025') return res.status(404).json({ error: 'App not found' });
        console.error('rotate key error', err);
        return res.status(500).json({ error: 'Failed to rotate API key' });
    }
}
