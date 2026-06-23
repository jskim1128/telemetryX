// Fetch the messages of a single conversation, or delete it.

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const session = await requireSession(req, res);
    if (!session) return;
    const id = req.query.id as string;
    if (!id) return res.status(400).json({ error: 'Missing id' });

    const conv = await prisma.aiChatConversation.findFirst({
        where: { id, userId: session.userId }
    });
    if (!conv) return res.status(404).json({ error: 'Not found' });

    if (req.method === 'GET') {
        const messages = await prisma.aiChatMessage.findMany({
            where: { conversationId: id },
            orderBy: { createdAt: 'asc' }
        });
        // Filter internal tool-call placeholders from the user-facing view.
        const visible = messages
            .filter((m) => !(m.role === 'assistant' && m.toolName === '__tool_calls__'))
            .filter((m) => m.role !== 'tool')
            .map((m) => ({
                id: m.id,
                role: m.role,
                content: m.content,
                createdAt: m.createdAt.toISOString()
            }));
        // Tool calls (for the "tool chip" UI) are returned separately so
        // the panel can render them inline if desired.
        const tools = messages
            .filter((m) => m.role === 'tool')
            .map((m) => ({
                id: m.id,
                name: m.toolName,
                createdAt: m.createdAt.toISOString()
            }));
        return res.status(200).json({ conversation: conv, messages: visible, toolCalls: tools });
    }

    if (req.method === 'DELETE') {
        await prisma.aiChatConversation.delete({ where: { id } });
        return res.status(204).end();
    }

    res.setHeader('Allow', 'GET, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
}
