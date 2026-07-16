/**
 * Deterministic tile styling for entities that have no preview image — an App, a deployed product.
 * The gradient is derived from a stable seed (a code or id), so it is the same on every render and
 * distinct per entity.
 */

const GRADIENTS = [
    'from-violet-500/25 to-fuchsia-500/10',
    'from-sky-500/25 to-cyan-500/10',
    'from-amber-500/25 to-orange-500/10',
    'from-emerald-500/25 to-teal-500/10',
    'from-rose-500/25 to-pink-500/10',
    'from-indigo-500/25 to-blue-500/10',
];

/** Tailwind gradient stops for a seed. Pair with `bg-gradient-to-br`. */
export const gradientOf = (seed: string): string => {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    return GRADIENTS[hash % GRADIENTS.length];
};

/** Up to two initials for a label (e.g. 'Admin Run Cost' → 'AR'). */
export const initialsOf = (label: string): string =>
    label
        .split(/[\s-_]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part.charAt(0).toUpperCase())
        .join('');
