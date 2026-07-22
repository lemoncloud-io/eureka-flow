/**
 * An App's real identity is its deploy slug, but the SEO payload only carries it inside
 * verbose marketing strings:
 *   title       "AIStudio App : photo-figure-creator | AI Visual 워크플로우…"
 *   description "[Flow] AIStudio WebApp : photo-figure-creator"
 *
 * `deriveAppIdentity` recovers the slug and a human name from it, so each App reads as a
 * distinct deployment instead of an identical "AIStudio App" row.
 */
export interface AppIdentity {
    /** Deploy slug, e.g. 'photo-figure-creator'. */
    slug: string;
    /** Title-cased human name, e.g. 'Photo Figure Creator'. */
    name: string;
}

/** Words that read as acronyms, not Title Case — 'ai-image-stylist' → 'AI Image Stylist', not 'Ai …'. */
const ACRONYMS = new Set(['ai', 'ui', 'ux', 'api', 'ml', 'llm', 'ar', 'vr', '3d', 'ocr', 'seo']);

const titleCase = (word: string): string => {
    if (!word) return word;
    if (ACRONYMS.has(word.toLowerCase())) return word.toUpperCase();
    return word[0].toUpperCase() + word.slice(1);
};

export const deriveAppIdentity = (app: { title?: string; description?: string; id?: string }): AppIdentity => {
    // The title's slug sits before the ` | ` site-name suffix; fall back to the description.
    const beforePipe = (app.title ?? '').split('|')[0];
    const source = beforePipe.includes(':') ? beforePipe : (app.description ?? '');
    const slug = (source.split(':').pop() ?? '').trim() || app.id || 'app';

    const words = slug.split(/[-_\s]+/).filter(Boolean);
    const name = words.map(titleCase).join(' ') || slug;

    return { slug, name };
};
