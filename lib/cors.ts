import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Apply permissive CORS headers for the public tracking ingestion endpoints
 * so they can be called from any origin (browser apps embedding the tracker).
 *
 * Returns `true` if the request was a preflight (OPTIONS) and a response was
 * already sent — caller should `return` immediately in that case.
 */
export function applyTrackCors(req: NextApiRequest, res: NextApiResponse): boolean {
    const origin = (req.headers.origin as string) || '*';

    // Allow any origin. Using `*` is fine because the tracking endpoints
    // don't rely on cookies — they authenticate via the `x-api-key` header.
    // If a specific Origin is present, echo it back (some clients/proxies are
    // happier with an exact match than the wildcard).
    res.setHeader('Access-Control-Allow-Origin', origin === 'null' ? '*' : origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
    res.setHeader('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return true;
    }
    return false;
}
