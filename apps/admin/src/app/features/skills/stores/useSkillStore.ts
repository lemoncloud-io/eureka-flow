import { create } from 'zustand';

import { MOCK_SKILLS } from '../consts';

import type { Skill, SkillFormData } from '../types';

interface SkillState {
    skills: Skill[];
    addSkill: (data: SkillFormData) => Skill;
    updateSkill: (id: string, updates: Partial<SkillFormData>) => void;
    deleteSkill: (id: string) => void;
}

export const useSkillStore = create<SkillState>()((set, get) => ({
    skills: [...MOCK_SKILLS],
    addSkill: (data: SkillFormData) => {
        const now = Date.now();
        const maxId = Math.max(...get().skills.map(s => parseInt(s.id, 10)), 0);
        const newSkill: Skill = {
            ...data,
            id: String(maxId + 1).padStart(4, '0'),
            createdAt: now,
            updatedAt: now,
            deletedAt: 0,
        };
        set(state => ({ skills: [...state.skills, newSkill] }));
        return newSkill;
    },
    updateSkill: (id: string, updates: Partial<SkillFormData>) => {
        set(state => ({
            skills: state.skills.map(skill =>
                skill.id === id ? { ...skill, ...updates, updatedAt: Date.now() } : skill
            ),
        }));
    },
    deleteSkill: (id: string) => {
        set(state => ({ skills: state.skills.filter(skill => skill.id !== id) }));
    },
}));
