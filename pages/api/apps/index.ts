import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { generateApiKey } from '@/lib/apiKey';
import { asOptionalString, asRequiredString } from '@/lib/validation';
import { requireSession } from '@/lib/session';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === 'GET') return listApps(req, res);
    if (req.method === 'POST') return registerApp(req, res);
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
}

async function listApps(_req: NextApiRequest, res: NextApiResponse) {
    const apps = await prisma.app.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            name: true,
            description: true,
            ownerEmail: true,
            apiKeyPrefix: true,
            active: true,
            createdAt: true,
            _count: { select: { appOpens: true, features: true, tags: true } }
        }
    });

    const shaped = apps.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        ownerEmail: a.ownerEmail,
        apiKeyPrefix: a.apiKeyPrefix,
        active: a.active,
        createdAt: a.createdAt,
        eventCounts: {
            appOpens: a._count.appOpens,
            features: a._count.features,
            tags: a._count.tags,
            total: a._count.appOpens + a._count.features + a._count.tags
        }
    }));

    return res.status(200).json({ apps: shaped });
}

async function registerApp(req: NextApiRequest, res: NextApiResponse) {
    // Require a signed-in user — and use THEIR email as the app owner.
    // We deliberately ignore any `ownerEmail` field in the body so it
    // cannot be spoofed.
    const session = await requireSession(req, res);
    if (!session) return;

    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = asRequiredString(body.name, 100);
    if (!name) {
        return res.status(400).json({ error: 'name is required' });
    }
    const description = asOptionalString(body.description, 500);
    const ownerEmail = session.email;

    // Ensure name uniqueness explicitly for a friendlier error message.
    const existing = await prisma.app.findUnique({ where: { name } });
    if (existing) {
        return res.status(409).json({ error: 'An app with this name already exists' });
    }

    const key = generateApiKey();
    try {
        const app = await prisma.app.create({
            data: {
                name,
                description,
                ownerEmail,
                apiKeyHash: key.hash,
                apiKeyPrefix: key.prefix
            }
        });

        return res.status(201).json({
            app: {
                id: app.id,
                name: app.name,
                description: app.description,
                ownerEmail: app.ownerEmail,
                apiKeyPrefix: app.apiKeyPrefix,
                active: app.active,
                createdAt: app.createdAt
            },
            // Plaintext key shown ONCE — caller must save it now.
            apiKey: key.plaintext
        });
    } catch (err: any) {
        console.error('register app error', err);
        return res.status(500).json({ error: 'Failed to register app' });
    }
}
