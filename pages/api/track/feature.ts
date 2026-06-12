import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { authenticateApp } from '@/lib/auth';
import { isValidEmail, asOptionalString, asRequiredString } from '@/lib/validation';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const app = await authenticateApp(req, res);
    if (!app) return;

    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!isValidEmail(body.email)) {
        return res.status(400).json({ error: 'email is required and must be a valid email address' });
    }
    const featureName = asRequiredString(body.featureName, 200);
    if (!featureName) {
        return res.status(400).json({ error: 'featureName is required' });
    }

    try {
        await prisma.featureEvent.create({
            data: {
                appId: app.id,
                email: body.email as string,
                featureName,
                department: asOptionalString(body.department),
                metadata: body.metadata !== undefined && body.metadata !== null ? JSON.stringify(body.metadata) : null
            }
        });
        return res.status(202).json({ ok: true });
    } catch (err) {
        console.error('feature track error', err);
        return res.status(500).json({ error: 'Failed to record event' });
    }
}
