export interface TutorialStep {
    id: string;
    titleKey: string;
    descriptionKey: string;
    action: 'auto' | 'connect' | 'run' | 'done';
}

export const TUTORIAL_STEPS: TutorialStep[] = [
    {
        id: 'welcome',
        titleKey: 'tutorial:steps.welcome.title',
        descriptionKey: 'tutorial:steps.welcome.description',
        action: 'auto',
    },
    {
        id: 'connect',
        titleKey: 'tutorial:steps.connect.title',
        descriptionKey: 'tutorial:steps.connect.description',
        action: 'connect',
    },
    {
        id: 'run',
        titleKey: 'tutorial:steps.run.title',
        descriptionKey: 'tutorial:steps.run.description',
        action: 'run',
    },
    {
        id: 'done',
        titleKey: 'tutorial:steps.done.title',
        descriptionKey: 'tutorial:steps.done.description',
        action: 'done',
    },
];

export const TUTORIAL_STORAGE_KEY = 'eureka-flow-tutorial-completed';

const BLOCK_ID_TEXT_INPUT = '0004';
const BLOCK_ID_PREVIEW = '0007';

/** Fallback block definitions when public API is unavailable */
export const FALLBACK_BLOCKS = [
    {
        id: BLOCK_ID_TEXT_INPUT,
        type: 'input-text',
        label: 'Text Input',
        icon: '📝',
        description: 'User text input block',
        stereo: 'input' as const,
        isFrontend: true,
        inputs: [],
        outputs: [{ id: 'out', label: 'Text', type: 'text' }],
        defaultConfig: { text: '' },
        configSchema: [{ key: 'text', type: 'text', label: 'Text', placeholder: 'Enter text...' }],
    },
    {
        id: BLOCK_ID_PREVIEW,
        type: 'output-preview',
        label: 'Preview',
        icon: '👁️',
        description: 'Display output data',
        stereo: 'output' as const,
        isFrontend: true,
        inputs: [{ id: 'in', label: 'Input', type: 'any' }],
        outputs: [],
        defaultConfig: {},
        configSchema: [],
    },
];

/** Pre-built tutorial workflow: Text Input → Preview (user connects and runs) */
export const TUTORIAL_WORKFLOW = {
    nodes: [
        {
            id: 'tutorial-input',
            type: 'input-text',
            blockId: BLOCK_ID_TEXT_INPUT,
            position: { x: 200, y: 250 },
            customLabel: 'My First Input',
            config: { text: 'Hello, Eureka Flow! 🚀' },
        },
        {
            id: 'tutorial-preview',
            type: 'output-preview',
            blockId: BLOCK_ID_PREVIEW,
            position: { x: 650, y: 250 },
            customLabel: 'Result',
            config: {},
        },
    ],
    edges: [] as unknown[],
};
