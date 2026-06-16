// Session management — signed JWT stored in an httpOnly cookie.
//
// The cookie lasts 30 days ("1 month"). The payload never contains the
// user's password — only a small set of profile fields needed to render
// the UI and authorise requests.

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import type { NextApiRequest, NextApiResponse } from 'next';

interface CookieOptions {
    httpOnly?: boolean;
    sameSite?: 'lax' | 'strict' | 'none';
    secure?: boolean;
    path?: string;
    maxAge?: number;
}

function serializeCookie(name: string, value: string, opts: CookieOptions = {}): string {
    const parts = [`${name}=${encodeURIComponent(value)}`];
    if (opts.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(opts.maxAge)}`);
    if (opts.path) parts.push(`Path=${opts.path}`);
    if (opts.httpOnly) parts.push('HttpOnly');
    if (opts.secure) parts.push('Secure');
    if (opts.sameSite) parts.push(`SameSite=${opts.sameSite.charAt(0).toUpperCase()}${opts.sameSite.slice(1)}`);
    return parts.join('; ');
}

function parseCookieHeader(header: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const segment of header.split(';')) {
        const idx = segment.indexOf('=');
        if (idx < 0) continue;
        const k = segment.slice(0, idx).trim();
        const v = segment.slice(idx + 1).trim();
        if (k) out[k] = decodeURIComponent(v);
    }
    return out;
}

export const SESSION_COOKIE_NAME = 'ft_session';

// 30 days in seconds — used both for the JWT expiry and the cookie Max-Age.
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';

export interface SessionPayload extends JWTPayload {
    userId: number;
    email: string;
    employeeId: string | null;
    displayName: string | null;
    role: string;
}

function getSecretKey(): Uint8Array {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 16) {
        throw new Error(
            'JWT_SECRET environment variable is missing or too short (need >= 16 chars).'
        );
    }
    return new TextEncoder().encode(secret);
}

/**
 * Signs a session payload as a JWT (HS256) that expires in 30 days.
 */
export async function signSession(payload: Omit<SessionPayload, keyof JWTPayload>): Promise<string> {
    return new SignJWT(payload as JWTPayload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
        .sign(getSecretKey());
}

/**
 * Verifies a JWT and returns its payload, or null if invalid/expired.
 */
export async function verifySession(token: string): Promise<SessionPayload | null> {
    try {
        const { payload } = await jwtVerify(token, getSecretKey());
        return payload as SessionPayload;
    } catch {
        return null;
    }
}

/**
 * Builds the Set-Cookie header string for the session cookie.
 */
export function buildSessionCookie(token: string): string {
    return serializeCookie(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: COOKIE_SECURE,
        path: '/',
        maxAge: SESSION_MAX_AGE_SECONDS
    });
}

/**
 * Builds a Set-Cookie header that clears the session cookie.
 */
export function buildClearSessionCookie(): string {
    return serializeCookie(SESSION_COOKIE_NAME, '', {
        httpOnly: true,
        sameSite: 'lax',
        secure: COOKIE_SECURE,
        path: '/',
        maxAge: 0
    });
}

/**
 * Extracts the raw session token from a Pages Router request.
 */
export function getSessionTokenFromReq(req: NextApiRequest): string | null {
    const header = req.headers.cookie;
    if (!header) return null;
    const cookies = parseCookieHeader(header);
    return cookies[SESSION_COOKIE_NAME] || null;
}

/**
 * Convenience: returns the verified session for a Pages Router request,
 * or null if missing/invalid.
 */
export async function getSession(req: NextApiRequest): Promise<SessionPayload | null> {
    const token = getSessionTokenFromReq(req);
    if (!token) return null;
    return verifySession(token);
}

/**
 * Guards a Pages Router API handler. If the request has no valid session,
 * writes a 401 response and returns null. Otherwise returns the session.
 */
export async function requireSession(
    req: NextApiRequest,
    res: NextApiResponse
): Promise<SessionPayload | null> {
    const session = await getSession(req);
    if (!session) {
        res.status(401).json({ error: 'Unauthorized' });
        return null;
    }
    return session;
}
