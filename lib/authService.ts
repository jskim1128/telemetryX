// Port of the Python auth_service.py to TypeScript.
//
// Talks directly to the corporate AD ASMX endpoints to:
//   - Authenticate a user with username + password
//   - Look up a user's profile (employeeId, email, displayName, title)
//
// The plaintext password is ONLY sent to the upstream ASMX endpoint and
// is never stored anywhere (no DB, no logs, no cookies).

import { parseStringPromise } from 'xml2js';
import { prisma } from './prisma';

// Base URL of the internal AD ASMX service. Overridable via env so the
// app can be pointed at a different host (e.g. for testing).
const AUTH_BASE_URL =
    process.env.AUTH_ASMX_BASE_URL || 'http://sdsmsipiccsvip.ad.shared/adauth/service1.asmx';

const REQUEST_TIMEOUT_MS = 5000;

export interface AuthenticateResult {
    // Shape mirrors the AuthenticateResult schema in the Python service.
    // Fields are kept loose because the upstream response varies by domain.
    [key: string]: unknown;
    Authenticated?: string | boolean;
    Username?: string;
    Domain?: string;
    Message?: string;
}

export interface UserProfile {
    id?: number;
    employeeId: string | null;
    email: string;
    displayName: string | null;
    title: string | null;
    role?: string;
}

/**
 * fetch with a timeout. Throws on network error or non-2xx response.
 */
async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Parses an XML string and returns the inner object for the given
 * top-level tag (matching xmltodict's behaviour in the Python service).
 */
async function parseXmlRoot<T = any>(xml: string, rootKey: string): Promise<T | null> {
    const parsed = await parseStringPromise(xml, {
        explicitArray: false,
        ignoreAttrs: true,
        trim: true
    });
    if (!parsed || typeof parsed !== 'object') return null;
    return (parsed[rootKey] as T) ?? null;
}

/**
 * Authenticate a user against the AD ASMX endpoint. Returns the parsed
 * AuthenticateResult on a 2xx response, or null on a soft failure.
 * Throws on network/transport errors.
 */
export async function authenticate(
    username: string,
    password: string,
    domain = ''
): Promise<AuthenticateResult | null> {
    const url = `${AUTH_BASE_URL}/Authenticate`;
    const body = new URLSearchParams({ username, password, domain });

    const resp = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
    });

    if (!resp.ok) return null;

    const xml = await resp.text();
    const result = await parseXmlRoot<AuthenticateResult>(xml, 'AuthenticateResult');
    return result;
}

/**
 * Returns true when the AuthenticateResult indicates a successful login.
 * The upstream service serializes the boolean as a string ("true"/"false").
 */
export function isAuthenticated(result: AuthenticateResult | null): boolean {
    if (!result) return false;
    const v = result.Authenticated;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return v.trim().toLowerCase() === 'true';
    return false;
}

interface UserProfileLDAP {
    EmployeeID?: string;
    Mail?: string;
    Title?: string;
    DisplayName?: string;
}

/**
 * Fetches a user's profile from the AD ASMX endpoint. Returns null when
 * the upstream call fails or the response cannot be parsed into the
 * expected shape.
 */
export async function fetchUserProfile(username: string): Promise<UserProfile | null> {
    const url = `${AUTH_BASE_URL}/GetProfile?username=${encodeURIComponent(username)}`;

    let resp: Response;
    try {
        resp = await fetchWithTimeout(url, { method: 'GET' });
    } catch (e: any) {
        console.warn('[authService] GetProfile fetch failed:', e?.message || e);
        return null;
    }
    if (!resp.ok) {
        console.warn('[authService] GetProfile non-OK status:', resp.status);
        return null;
    }

    const xml = await resp.text();
    let ldap: UserProfileLDAP | null;
    try {
        ldap = await parseXmlRoot<UserProfileLDAP>(xml, 'UserProfile');
    } catch (e: any) {
        console.warn('[authService] GetProfile XML parse failed:', e?.message || e);
        console.warn('[authService] response snippet:', xml.slice(0, 300));
        return null;
    }
    if (!ldap || !ldap.Mail) {
        console.warn(
            '[authService] GetProfile returned no Mail field (raw response snippet):',
            xml.slice(0, 300)
        );
        return null;
    }

    return {
        employeeId: ldap.EmployeeID ?? null,
        email: ldap.Mail,
        displayName: ldap.DisplayName ?? null,
        title: ldap.Title ?? null
    };
}

/**
 * Reads a user profile from the local DB by employeeId or email.
 */
export async function getUserFromDb(usernameOrEmail: string): Promise<UserProfile | null> {
    const user = await prisma.user.findFirst({
        where: {
            OR: [{ employeeId: usernameOrEmail }, { email: usernameOrEmail }]
        }
    });
    if (!user) return null;
    return {
        id: user.id,
        employeeId: user.employeeId,
        email: user.email,
        displayName: user.displayName,
        title: user.title,
        role: user.role
    };
}

/**
 * Upserts a user profile in the local DB, refreshing their LDAP-sourced
 * fields and bumping `lastLoginAt`. The first user ever created becomes
 * admin automatically.
 */
export async function upsertUser(profile: UserProfile): Promise<UserProfile> {
    const now = new Date();
    const existing = await prisma.user.findUnique({ where: { email: profile.email } });

    if (existing) {
        const updated = await prisma.user.update({
            where: { id: existing.id },
            data: {
                employeeId: profile.employeeId ?? existing.employeeId,
                displayName: profile.displayName ?? existing.displayName,
                title: profile.title ?? existing.title,
                lastLoginAt: now
            }
        });
        return {
            id: updated.id,
            employeeId: updated.employeeId,
            email: updated.email,
            displayName: updated.displayName,
            title: updated.title,
            role: updated.role
        };
    }

    // First-user-becomes-admin policy.
    const userCount = await prisma.user.count();
    const role = userCount === 0 ? 'admin' : 'user';

    const created = await prisma.user.create({
        data: {
            employeeId: profile.employeeId,
            email: profile.email,
            displayName: profile.displayName,
            title: profile.title,
            role,
            lastLoginAt: now
        }
    });
    return {
        id: created.id,
        employeeId: created.employeeId,
        email: created.email,
        displayName: created.displayName,
        title: created.title,
        role: created.role
    };
}

/**
 * High-level login: authenticate against AD, fetch/refresh profile, and
 * upsert into the local DB. Returns the local UserProfile on success.
 *
 * Throws only on truly unexpected errors (e.g. DB failure). Returns null
 * for "credentials rejected" or "could not establish profile".
 */
export async function loginUser(
    username: string,
    password: string,
    domain = ''
): Promise<UserProfile | null> {
    // 1. Verify credentials against the ASMX service.
    let auth: AuthenticateResult | null;
    try {
        auth = await authenticate(username, password, domain);
    } catch (e: any) {
        console.error('[authService] authenticate() threw:', e?.message || e);
        throw e;
    }
    if (!isAuthenticated(auth)) {
        console.warn('[authService] authentication denied for', username, '->', auth?.Message);
        return null;
    }

    // 2. Get the user's profile. Prefer LDAP; fall back gracefully so
    //    a brief profile-API outage does not block sign-in.
    let profile: UserProfile | null = null;
    try {
        profile = await fetchUserProfile(username);
    } catch (e: any) {
        console.warn('[authService] fetchUserProfile() threw:', e?.message || e);
    }

    if (!profile) {
        const cached = await getUserFromDb(username);
        if (cached) return cached;
        if (username.includes('@')) {
            profile = {
                employeeId: null,
                email: username,
                displayName: null,
                title: null
            };
        } else {
            console.error(
                '[authService] credentials OK but no profile available for',
                username,
                '— provide an email-format username or seed the user row.'
            );
            return null;
        }
    }

    // 3. Upsert into the local DB.
    try {
        return await upsertUser(profile);
    } catch (e: any) {
        console.error('[authService] upsertUser() threw:', e?.message || e);
        throw e;
    }
}
