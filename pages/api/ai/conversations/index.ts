// List the current user's chat conversations, or create a new blank one.

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const session = await requireSession(req, res);
    if (!session) return;

    if (req.method === 'GET') {
        const appId = (req.query.appId as string) || undefined;
        const where: any = { userId: session.userId };
        if (appId) where.appId = appId;
        const conversations = await prisma.aiChatConversation.findMany({
            where,
            orderBy: { updatedAt: 'desc' },
            take: 50,
            select: {
                id: true,
                title: true,
                appId: true,
                createdAt: true,
                updatedAt: true,
                _count: { select: { messages: true } }
            }
        });
        return res.status(200).json({ conversations });
    }

    if (req.method === 'POST') {
        const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) || {};
        const appId = typeof body.appId === 'string' ? body.appId : null;
        const conv = await prisma.aiChatConversation.create({
            data: { userId: session.userId, appId, title: null }
        });
        return res.status(201).json({ conversation: conv });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
}
