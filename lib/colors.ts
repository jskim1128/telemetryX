/**
 * Deterministic color assignment helpers.
 *
 * Given an arbitrary string (e.g. a feature name or tag), these helpers pick a
 * stable [background, text] color tuple so the same input always maps to the
 * same color across renders and reloads.
 */

const BackgroundAndTextColorTuples: [string, string][] = [
    ['var(--primary-100)', 'var(--primary-600)'],
    ['var(--blue-100)', 'var(--blue-600)'],
    ['var(--green-100)', 'var(--green-600)'],
    ['var(--yellow-100)', 'var(--yellow-600)'],
    ['var(--cyan-100)', 'var(--cyan-600)'],
    ['var(--pink-100)', 'var(--pink-600)'],
    ['var(--indigo-100)', 'var(--indigo-600)'],
    ['var(--teal-100)', 'var(--teal-600)'],
    ['var(--orange-100)', 'var(--orange-600)'],
    ['var(--purple-100)', 'var(--purple-600)'],
    ['var(--red-100)', 'var(--red-600)']
];

/**
 * Map a string to a stable index in [0, length) using a simple, deterministic
 * hash (djb2). The same input always yields the same index.
 */
function getTupleIndexFromString(input: string, length: number): number {
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
        hash = (hash * 33) ^ input.charCodeAt(i);
    }
    // Ensure a non-negative index within range.
    return Math.abs(hash) % length;
}

/**
 * Return a stable [backgroundColor, textColor] tuple for the given string.
 */
export function getBackgroundAndTextColorTuples(input: string): [string, string] {
    const index = getTupleIndexFromString(input, BackgroundAndTextColorTuples.length);
    return BackgroundAndTextColorTuples[index];
}
