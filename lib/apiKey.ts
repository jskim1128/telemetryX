import { createHash, randomBytes } from 'crypto';

const API_KEY_PREFIX = 'ft_';
const API_KEY_RANDOM_BYTES = 24; // 24 bytes -> 32 base64url chars
const PUBLIC_PREFIX_LENGTH = 12; // e.g. "ft_a1b2c3d4..."

export interface GeneratedApiKey {
    /** Full plaintext key. Show to the user ONCE — never store. */
    plaintext: string;
    /** sha256(plaintext) hex digest. Store in DB. */
    hash: string;
    /** First N chars of the plaintext (for visual identification in the UI). */
    prefix: string;
}

/** Generate a new API key. Returns plaintext + hash + display prefix. */
export function generateApiKey(): GeneratedApiKey {
    const random = randomBytes(API_KEY_RANDOM_BYTES).toString('base64url');
    const plaintext = `${API_KEY_PREFIX}${random}`;
    return {
        plaintext,
        hash: hashApiKey(plaintext),
        prefix: plaintext.slice(0, PUBLIC_PREFIX_LENGTH)
    };
}

/** sha256 hex of an API key string. */
export function hashApiKey(plaintext: string): string {
    return createHash('sha256').update(plaintext).digest('hex');
}

/** Extract the API key from an incoming request's x-api-key header. */
export function extractApiKey(req: { headers: Record<string, string | string[] | undefined> }): string | null {
    const raw = req.headers['x-api-key'];
    if (!raw) return null;
    const value = Array.isArray(raw) ? raw[0] : raw;
    return value?.trim() || null;
}
