// Lightweight input validation helpers used by the tracking + admin APIs.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: unknown): value is string {
    return typeof value === 'string' && value.length <= 254 && EMAIL_RE.test(value);
}

export function asOptionalString(value: unknown, max = 255): string | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value !== 'string') return undefined;
    return value.length > max ? value.slice(0, max) : value;
}

export function asRequiredString(value: unknown, max = 255): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}
