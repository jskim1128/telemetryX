import type { NextApiRequest, NextApiResponse } from 'next';
import { loginUser } from '@/lib/authService';
import { buildSessionCookie, signSession } from '@/lib/session';

/**
 * POST /api/auth/login
 *
 * Body: { username: string, password: string, domain?: string }
 *
 * Verifies credentials against the AD ASMX service, upserts the user
 * locally, and sets a 30-day session cookie. The plaintext password
 * never leaves this handler.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const domain = typeof body.domain === 'string' ? body.domain.trim() : '';

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    try {
        const user = await loginUser(username, password, domain);
        if (!user || user.id === undefined) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        let token: string;
        try {
            token = await signSession({
                userId: user.id,
                email: user.email,
                employeeId: user.employeeId,
                displayName: user.displayName,
                role: user.role ?? 'user'
            });
        } catch (signErr: any) {
            // Most likely cause: JWT_SECRET missing / too short. This is a
            // server-config bug, not a credential problem.
            console.error('[auth/login] session signing failed:', signErr);
            return res.status(500).json({
                error: 'Server is misconfigured — JWT_SECRET is missing or too short. Check the server logs and restart the dev server after fixing .env.'
            });
        }

        res.setHeader('Set-Cookie', buildSessionCookie(token));
        return res.status(200).json({
            user: {
                id: user.id,
                email: user.email,
                employeeId: user.employeeId,
                displayName: user.displayName,
                title: user.title,
                role: user.role ?? 'user'
            }
        });
    } catch (err: any) {
        // Log the full error server-side so it's actually debuggable.
        console.error('[auth/login] error:', {
            name: err?.name,
            message: err?.message,
            cause: err?.cause,
            stack: err?.stack
        });

        if (err?.name === 'AbortError') {
            return res.status(504).json({ error: 'Authentication service timed out — please try again.' });
        }
        // fetch() failures (DNS / connection refused / TLS) surface as
        // TypeError with cause set to an Error from undici. Surface that
        // detail to help diagnose connectivity problems.
        const causeMsg = err?.cause?.message || err?.message || 'unknown error';
        return res.status(502).json({
            error: `Authentication service unavailable: ${causeMsg}`
        });
    }
}
