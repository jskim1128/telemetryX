import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { authenticateApp } from '@/lib/auth';
import { applyTrackCors } from '@/lib/cors';
import { isValidEmail, asOptionalString, asRequiredString } from '@/lib/validation';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (applyTrackCors(req, res)) return;

    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST, OPTIONS');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const app = await authenticateApp(req, res);
    if (!app) return;

    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!isValidEmail(body.email)) {
        return res.status(400).json({ error: 'email is required and must be a valid email address' });
    }
    const tag = asRequiredString(body.tag, 200);
    if (!tag) {
        return res.status(400).json({ error: 'tag is required' });
    }

    try {
        await prisma.tagEvent.create({
            data: {
                appId: app.id,
                email: body.email as string,
                tag,
                department: asOptionalString(body.department),
                metadata: body.metadata !== undefined && body.metadata !== null ? JSON.stringify(body.metadata) : null
            }
        });
        return res.status(202).json({ ok: true });
    } catch (err) {
        console.error('tag track error', err);
        return res.status(500).json({ error: 'Failed to record event' });
    }
}
