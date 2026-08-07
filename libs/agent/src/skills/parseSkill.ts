import type { Skill } from './skill';

/** `---` frontmatter block at the top, then the Markdown body. */
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** Strip a matching pair of surrounding quotes from a frontmatter value, if present. */
const unquote = (v: string): string =>
    (v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")) ? v.slice(1, -1) : v;

/** Parse the `name`/`description` scalars from a frontmatter block (single-line `key: value`; split on the FIRST colon so a value may itself contain `:`). */
const parseFrontmatter = (block: string): Record<string, string> => {
    const meta: Record<string, string> = {};
    for (const raw of block.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) {
            continue;
        }
        const colon = line.indexOf(':');
        if (colon === -1) {
            throw new Error(`parseSkill: malformed frontmatter line "${raw}"`);
        }
        meta[line.slice(0, colon).trim()] = unquote(line.slice(colon + 1).trim());
    }
    return meta;
};

/**
 * Parse a SKILL.md source into a {@link Skill}: a `---`-fenced frontmatter block carrying `name` +
 * `description` (single-line scalars — the always-in-context router), then the Markdown body as
 * `instructions` (the on-demand payload). Fails loud on a missing fence, a missing required key, or an empty
 * body, so a malformed playbook never ships silently. Skills are authored as .md files and bundled via `?raw`
 * (see skills.ts); this keeps the know-how as versionable content, separate from code.
 */
export const parseSkill = (source: string): Skill => {
    const match = FRONTMATTER.exec(source.trim());
    if (!match) {
        throw new Error('parseSkill: source has no `---` frontmatter block');
    }
    const [, frontmatter, body] = match;
    const meta = parseFrontmatter(frontmatter);
    const name = meta.name?.trim();
    const description = meta.description?.trim();
    const instructions = body.trim();

    if (!name) {
        throw new Error('parseSkill: frontmatter is missing `name`');
    }
    if (!description) {
        throw new Error(`parseSkill: skill "${name}" frontmatter is missing a description`);
    }
    if (!instructions) {
        throw new Error(`parseSkill: skill "${name}" has an empty body`);
    }
    return { name, description, instructions };
};
