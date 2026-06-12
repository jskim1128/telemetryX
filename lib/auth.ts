import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from './prisma';
import { extractApiKey, hashApiKey } from './apiKey';

export interface AuthenticatedApp {
    id: string;
    name: string;
}

/**
 * Authenticate a tracking request by `x-api-key` header.
 * If invalid/missing/inactive, writes a JSON error response and returns null.
 */
export async function authenticateApp(req: NextApiRequest, res: NextApiResponse): Promise<AuthenticatedApp | null> {
    const plaintext = extractApiKey(req);
    if (!plaintext) {
        res.status(401).json({ error: 'Missing x-api-key header' });
        return null;
    }

    const hash = hashApiKey(plaintext);
    const app = await prisma.app.findUnique({
        where: { apiKeyHash: hash },
        select: { id: true, name: true, active: true }
    });

    if (!app) {
        res.status(401).json({ error: 'Invalid API key' });
        return null;
    }
    if (!app.active) {
        res.status(403).json({ error: 'App is deactivated' });
        return null;
    }

    return { id: app.id, name: app.name };
}
