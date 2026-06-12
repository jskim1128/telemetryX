import type { NextApiRequest, NextApiResponse } from 'next';
import { buildClearSessionCookie } from '@/lib/session';

/**
 * POST /api/auth/logout
 *
 * Clears the session cookie. Safe to call when no session is present.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }
    res.setHeader('Set-Cookie', buildClearSessionCookie());
    return res.status(200).json({ ok: true });
}
