import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';

/**
 * GET /api/auth/me
 *
 * Returns the currently logged-in user's profile, or 401 if no valid
 * session is present. Used by client components to hydrate auth state.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });

    // Re-read from DB so role/profile updates are reflected without
    // requiring the user to log out and back in.
    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    return res.status(200).json({
        user: {
            id: user.id,
            email: user.email,
            employeeId: user.employeeId,
            displayName: user.displayName,
            title: user.title,
            role: user.role
        }
    });
}
