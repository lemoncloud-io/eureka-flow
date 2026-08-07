// A Markdown file imported with Vite's `?raw` suffix resolves to its verbatim string content (inlined at
// build time — no runtime filesystem). Used to author skills as SKILL.md files. See skills/skills.ts.
declare module '*.md?raw' {
    const content: string;
    export default content;
}
