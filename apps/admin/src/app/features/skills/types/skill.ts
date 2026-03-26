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

export interface SkillFormData {
    name: string;
    label: string;
    icon: string;
    description: string;
    prompt: string;
    toolIds: string[];
    isEnabled: boolean;
}
