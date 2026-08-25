/**
 * parseSkill: SKILL.md (frontmatter `name`/`description` + Markdown body) → a {@link Skill}. Skills are
 * authored as .md files and bundled via `?raw`; this is the parser that turns that content into a skill.
 */
import { describe, expect, it } from 'vitest';

import { parseSkill } from '../../skills';

describe('parseSkill', () => {
    it('parses frontmatter name/description and the markdown body', () => {
        const skill = parseSkill('---\nname: demo\ndescription: A demo skill.\n---\n\nDo the thing.\nThen report.\n');
        expect(skill).toEqual({
            name: 'demo',
            description: 'A demo skill.',
            instructions: 'Do the thing.\nThen report.',
        });
    });

    it('keeps colons and arrows in the description (splits only on the first colon)', () => {
        const skill = parseSkill('---\nname: x\ndescription: input -> output: wire it end to end\n---\nbody\n');
        expect(skill.description).toBe('input -> output: wire it end to end');
    });

    it('strips a matching pair of surrounding quotes on a value', () => {
        expect(parseSkill('---\nname: x\ndescription: "quoted"\n---\nbody').description).toBe('quoted');
        expect(parseSkill("---\nname: x\ndescription: 'quoted'\n---\nbody").description).toBe('quoted');
    });

    it('throws when there is no frontmatter block', () => {
        expect(() => parseSkill('just a body, no fences')).toThrow(/frontmatter/);
    });

    it('throws when name or description is missing', () => {
        expect(() => parseSkill('---\ndescription: d\n---\nbody')).toThrow(/name/);
        expect(() => parseSkill('---\nname: n\n---\nbody')).toThrow(/description/);
    });

    it('throws on an empty body', () => {
        expect(() => parseSkill('---\nname: n\ndescription: d\n---\n   \n')).toThrow(/empty body/);
    });
});
