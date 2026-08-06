/**
 * A skill — the in-process port of a Claude Code **Agent Skill**: a named, described unit of **instructions**
 * a capable agent loads **on demand**. It is inert DATA, not a bundle of tool providers: `description` is the
 * always-in-context router the model matches a task against, and `instructions` is the lazy-loaded playbook it
 * follows once it invokes the skill (via the `use_skill` tool — see {@link ./skillProvider}). Progressive
 * disclosure keeps the body out of context until it is actually needed.
 *
 * This is consumed by the Builder — the shipped composition specialist that carries MANY skills and loads them
 * via `use_skill` ({@link ../agents/builderAgent}); the block specialists do NOT use skills — they just list
 * their tool values.
 */
export interface Skill {
    /** Selection + dispatch key — the value passed to `use_skill`. Analog of a SKILL.md directory name. */
    name: string;
    /** LEVEL 1, always in context: WHAT the skill does and WHEN to use it — the trigger the model matches. */
    description: string;
    /** LEVEL 2, loaded ON DEMAND: the workflow / domain playbook the model follows once it loads the skill. */
    instructions: string;
}
