import { parseSkill } from './parseSkill';
import buildLinearPipelineMd from './playbooks/build-linear-pipeline.md?raw';
import configureGeneratorMd from './playbooks/configure-generator.md?raw';

import type { Skill } from './skill';

/**
 * Seed playbook skills — authored as Markdown files under ./playbooks (the SKILL.md shape: `---` frontmatter
 * with `name` + `description`, then the instructions body). The bodies are content, kept out of code: they are
 * bundled at build via Vite `?raw` (no runtime filesystem) and parsed by {@link parseSkill}. Add a playbook by
 * dropping a new `<name>.md` under ./playbooks and parsing it here.
 */
export const buildLinearPipelineSkill: Skill = parseSkill(buildLinearPipelineMd);
export const configureGeneratorSkill: Skill = parseSkill(configureGeneratorMd);
/** The seed set a composition agent starts from. */
export const SEED_SKILLS: Skill[] = [buildLinearPipelineSkill, configureGeneratorSkill];
