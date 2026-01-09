import type {
    BlockDefinition,
    BlockView,
    DataPacket,
    ListResult,
    LogEntry,
    ProcessBody,
    ProcessResult,
    WorkflowState,
} from '@lemoncloud/eureka-flows-api';

const STORAGE_PREFIX = 'flow_mosaic_';
const INDEX_KEY = 'flow_mosaic_index';
const _log = console.log.bind(console, '[flows-api]');

// Type for Flow Metadata
export interface FlowMeta {
    id: string;
    name: string;
    updatedAt: number;
}

// Helpers
export const createPacket = (value: unknown, type: 'text' | 'image' | 'number'): DataPacket => ({
    value,
    type,
    timestamp: Date.now(),
});

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Default Demo Workflow
const DEFAULT_FLOW: WorkflowState = {
    nodes: [
        {
            id: 'node-1',
            type: 'input-text',
            position: { x: 100, y: 150 },
            config: { text: 'Hello Component!' },
            status: 'IDLE',
            inputData: {},
            outputData: {},
        },
        {
            id: 'node-2',
            type: 'text-transform',
            position: { x: 450, y: 150 },
            config: { mode: 'uppercase' },
            status: 'IDLE',
            inputData: {},
            outputData: {},
        },
    ],
    connections: [
        {
            id: 'conn-1',
            sourceNodeId: 'node-1',
            sourcePortId: 'out',
            targetNodeId: 'node-2',
            targetPortId: 'in',
        },
    ],
};

/**
 * List all saved flows
 */
export const listFlows = async (): Promise<FlowMeta[]> => {
    try {
        const indexStr = localStorage.getItem(INDEX_KEY);
        return indexStr ? JSON.parse(indexStr) : [];
    } catch (e) {
        return [];
    }
};

/**
 * Load a flow by ID or return the default flow
 */
export const loadFlow = async (id?: string): Promise<WorkflowState> => {
    await delay(300);

    if (!id) {
        const list = await listFlows();
        if (list.length > 0) {
            id = list[0].id;
        } else {
            return JSON.parse(JSON.stringify(DEFAULT_FLOW));
        }
    }

    try {
        const stored = localStorage.getItem(STORAGE_PREFIX + id);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (e) {
        console.error('Failed to load', e);
    }

    return JSON.parse(JSON.stringify(DEFAULT_FLOW));
};

/**
 * Load flow design (alias for loadFlow)
 */
export const loadDesign = async (id?: string): Promise<WorkflowState> => {
    return loadFlow(id);
};

/**
 * Save a flow with a name
 */
export const saveFlow = async (
    state: WorkflowState,
    name: string
): Promise<{ success: boolean; id: string }> => {
    await delay(300);
    try {
        const list = await listFlows();
        const existing = list.find(f => f.name === name);
        const id = existing ? existing.id : Math.random().toString(36).slice(2, 11);

        localStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(state));

        if (!existing) {
            const newMeta: FlowMeta = { id, name, updatedAt: Date.now() };
            localStorage.setItem(INDEX_KEY, JSON.stringify([...list, newMeta]));
        } else {
            const updatedList = list.map(f => (f.id === id ? { ...f, updatedAt: Date.now() } : f));
            localStorage.setItem(INDEX_KEY, JSON.stringify(updatedList));
        }

        return { success: true, id };
    } catch (e) {
        console.error('Failed to save', e);
        return { success: false, id: '' };
    }
};

/**
 * Reset flow to default
 */
export const resetFlow = async (): Promise<boolean> => {
    return true;
};

/**
 * Fetch execution logs for a block
 */
export const fetchBlockLogs = async (nodeId: string): Promise<LogEntry[]> => {
    await delay(500);

    const now = Date.now();
    const randomLogs: LogEntry[] = [];
    const count = Math.floor(Math.random() * 10) + 5;

    for (let i = 0; i < count; i++) {
        const timeOffset = (count - i) * 1000 * 60;
        const isError = Math.random() > 0.8;
        const isWarn = Math.random() > 0.7;

        randomLogs.push({
            id: Math.random().toString(36).slice(2, 11),
            timestamp: new Date(now - timeOffset).toISOString(),
            type: i === 0 ? 'INIT' : 'EXECUTION',
            level: isError ? 'ERROR' : isWarn ? 'WARN' : 'INFO',
            message: isError
                ? `Failed to process input data at index ${i}`
                : isWarn
                  ? `High latency detected during step ${i}`
                  : `Successfully processed chunk ${i}`,
        });
    }

    return randomLogs.reverse();
};

// Re-export types
export type { BlockDefinition, BlockView, DataPacket, ListResult, LogEntry, ProcessBody, ProcessResult, WorkflowState };
