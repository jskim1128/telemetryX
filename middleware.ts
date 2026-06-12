import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { SESSION_COOKIE_NAME } from './lib/session';

// Paths that should NEVER require authentication. Anything else is gated
// behind a valid session cookie.
const PUBLIC_PATHS = [
    '/auth/login',
    '/api/auth/login',
    '/api/auth/logout',
    // External tracking ingestion uses x-api-key, not session auth.
    '/api/track'
];

function isPublicPath(pathname: string): boolean {
    return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

async function hasValidSession(req: NextRequest): Promise<boolean> {
    const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return false;
    const secret = process.env.JWT_SECRET;
    if (!secret) return false;
    try {
        await jwtVerify(token, new TextEncoder().encode(secret));
        return true;
    } catch {
        return false;
    }
}

export async function middleware(req: NextRequest) {
    const { pathname, search } = req.nextUrl;

    if (isPublicPath(pathname)) return NextResponse.next();

    const ok = await hasValidSession(req);
    if (ok) return NextResponse.next();

    // For API routes, return a 401 JSON response instead of redirecting.
    if (pathname.startsWith('/api/')) {
        return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'content-type': 'application/json' }
        });
    }

    // For page navigations, bounce to /auth/login and remember where we
    // were heading so we can come back after sign-in.
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/auth/login';
    loginUrl.search = '';
    if (pathname !== '/') {
        loginUrl.searchParams.set('next', pathname + (search || ''));
    }
    return NextResponse.redirect(loginUrl);
}

export const config = {
    // Apply to everything except Next internals, static files, and the
    // favicon. Public auth endpoints are filtered out inside the handler.
    matcher: ['/((?!_next/|favicon.ico|themes/|layout/|demo/|images/).*)']
};
