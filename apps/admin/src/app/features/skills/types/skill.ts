export interface Skill {
    id: string;
    createdAt: number;
    updatedAt: number;
    deletedAt: number;
    name: string;
    label: string;
    icon: string;
    description: string;
    prompt: string;
    toolIds: string[];
    isEnabled: boolean;
}

export type SkillFormData = Omit<Skill, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;
