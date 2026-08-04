// Skills — progressively-disclosed playbooks a capable agent loads on demand (the Claude Code Agent Skills
// model, in process). Consumed by the Builder (the shipped composition specialist); the block/operation
// specialists wire their tool providers directly and do not use skills.
// Design: docs/browser-agent/design/skills.md.
export type { Skill } from './skill';
export { parseSkill } from './parseSkill';
export { createUseSkillToolProvider, USE_SKILL_TOOL } from './skillProvider';
export { SEED_SKILLS, buildLinearPipelineSkill, configureGeneratorSkill } from './skills';
