export interface WorkflowTemplate {
    id: string;
    nameKey: string;
    category: 'gettingStarted' | 'textProcessing' | 'aiGeneration';
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    nodes: TemplateNode[];
    edges: TemplateEdge[];
}

export interface TemplateNode {
    id: string;
    type: string;
    position: { x: number; y: number };
    data: {
        label?: string;
        config?: Record<string, unknown>;
    };
}

export interface TemplateEdge {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
}

export type HelpTab = 'gettingStarted' | 'blocks' | 'shortcuts' | 'examples';
