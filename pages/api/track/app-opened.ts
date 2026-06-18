import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { authenticateApp } from '@/lib/auth';
import { applyTrackCors } from '@/lib/cors';
import { isValidEmail, asOptionalString } from '@/lib/validation';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (applyTrackCors(req, res)) return;

    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST, OPTIONS');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const app = await authenticateApp(req, res);
    if (!app) return; // response already sent

    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!isValidEmail(body.email)) {
        return res.status(400).json({ error: 'email is required and must be a valid email address' });
    }

    try {
        await prisma.appOpenEvent.create({
            data: {
                appId: app.id,
                email: body.email as string,
                department: asOptionalString(body.department),
                sessionId: asOptionalString(body.sessionId),
                metadata: body.metadata !== undefined && body.metadata !== null ? JSON.stringify(body.metadata) : null
            }
        });
        return res.status(202).json({ ok: true });
    } catch (err) {
        console.error('app-opened track error', err);
        return res.status(500).json({ error: 'Failed to record event' });
    }
}
