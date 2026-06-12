import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { asOptionalString } from '@/lib/validation';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const id = req.query.id as string;
    if (!id) return res.status(400).json({ error: 'Missing id' });

    if (req.method === 'GET') return getApp(id, res);
    if (req.method === 'PATCH') return updateApp(id, req, res);
    if (req.method === 'DELETE') return deleteApp(id, res);
    res.setHeader('Allow', 'GET, PATCH, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
}

async function getApp(id: string, res: NextApiResponse) {
    const app = await prisma.app.findUnique({
        where: { id },
        select: {
            id: true,
            name: true,
            description: true,
            ownerEmail: true,
            apiKeyPrefix: true, // Never returns the hash or plaintext.
            active: true,
            createdAt: true,
            updatedAt: true,
            _count: { select: { appOpens: true, features: true, tags: true } }
        }
    });
    if (!app) return res.status(404).json({ error: 'App not found' });
    return res.status(200).json({
        app: {
            ...app,
            eventCounts: {
                appOpens: app._count.appOpens,
                features: app._count.features,
                tags: app._count.tags,
                total: app._count.appOpens + app._count.features + app._count.tags
            },
            _count: undefined
        }
    });
}

async function updateApp(id: string, req: NextApiRequest, res: NextApiResponse) {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const data: any = {};
    if (body.name !== undefined) {
        const name = asOptionalString(body.name, 100);
        if (!name) return res.status(400).json({ error: 'name cannot be empty' });
        data.name = name;
    }
    if (body.description !== undefined) {
        data.description = asOptionalString(body.description, 500) ?? null;
    }
    if (body.active !== undefined) {
        if (typeof body.active !== 'boolean') return res.status(400).json({ error: 'active must be a boolean' });
        data.active = body.active;
    }

    try {
        const app = await prisma.app.update({
            where: { id },
            data,
            select: {
                id: true,
                name: true,
                description: true,
                ownerEmail: true,
                apiKeyPrefix: true,
                active: true,
                createdAt: true,
                updatedAt: true
            }
        });
        return res.status(200).json({ app });
    } catch (err: any) {
        if (err?.code === 'P2025') return res.status(404).json({ error: 'App not found' });
        if (err?.code === 'P2002') return res.status(409).json({ error: 'An app with this name already exists' });
        console.error('update app error', err);
        return res.status(500).json({ error: 'Failed to update app' });
    }
}

async function deleteApp(id: string, res: NextApiResponse) {
    try {
        await prisma.app.delete({ where: { id } });
        return res.status(200).json({ ok: true });
    } catch (err: any) {
        if (err?.code === 'P2025') return res.status(404).json({ error: 'App not found' });
        console.error('delete app error', err);
        return res.status(500).json({ error: 'Failed to delete app' });
    }
}
