import { create } from 'zustand';

import { flowStorage } from '../utils/flowStorage';

import type { BlockDefinitionWithFrontend, FlowView } from '../types';

export type SaveStatus = 'idle' | 'saving' | 'success' | 'error';

/**
 * FlowsStore - manages flow metadata and block registry
 *
 * NOTE: Execution state is managed at the NODE level, not flow level.
 * Each node has its own `status`, `executionStats`, `errorMessage`.
 * See useCanvasStore for node-level state management.
 */
interface FlowsState {
    blockRegistry: Record<string, BlockDefinitionWithFrontend>;
    isBlocksLoaded: boolean;
    currentFlowId: string | null;
    flowName: string;
    flows: FlowView[];
    lastSavedAt: Date | null;
    isAutoSaveEnabled: boolean;
    saveStatus: SaveStatus;
    saveError: Error | null;
    /** WebSocket channel ID for real-time node status updates */
    channelId: string | null;

    setBlockRegistry: (blocks: BlockDefinitionWithFrontend[]) => void;
    setBlocksLoaded: (loaded: boolean) => void;
    setCurrentFlowId: (id: string | null) => void;
    setFlowName: (name: string) => void;
    setFlows: (flows: FlowView[]) => void;
    setLastSavedAt: (date: Date | null) => void;
    setAutoSaveEnabled: (enabled: boolean) => void;
    toggleAutoSave: () => void;
    setSaveStatus: (status: SaveStatus) => void;
    setSaveError: (error: Error | null) => void;
    setChannelId: (channelId: string | null) => void;
}

export const useFlowsStore = create<FlowsState>(set => ({
    blockRegistry: {},
    isBlocksLoaded: false,
    currentFlowId: null,
    flowName: 'Untitled Workflow',
    flows: [],
    lastSavedAt: null,
    isAutoSaveEnabled: flowStorage.getAutoSaveEnabled(),
    saveStatus: 'idle',
    saveError: null,
    channelId: null,

    setBlockRegistry: blocks => {
        const registry = blocks.reduce<Record<string, BlockDefinitionWithFrontend>>((acc, block) => {
            // Primary key: block.type (e.g., "input-text")
            acc[block.type] = block;
            // Secondary key: block.id (e.g., "1000006") for backward compatibility
            // Server load API returns blockId as type, so we need to index by id too
            if (block.id && block.id !== block.type) {
                acc[block.id] = block;
            }
            return acc;
        }, {});
        set({ blockRegistry: registry });
    },

    setBlocksLoaded: loaded => set({ isBlocksLoaded: loaded }),

    setCurrentFlowId: id => set({ currentFlowId: id }),

    setFlowName: name => set({ flowName: name }),

    setFlows: flows => set({ flows }),

    setLastSavedAt: date => set({ lastSavedAt: date }),

    setAutoSaveEnabled: enabled => {
        flowStorage.setAutoSaveEnabled(enabled);
        set({ isAutoSaveEnabled: enabled });
    },

    toggleAutoSave: () =>
        set(state => {
            const newValue = !state.isAutoSaveEnabled;
            flowStorage.setAutoSaveEnabled(newValue);
            return { isAutoSaveEnabled: newValue };
        }),

    setSaveStatus: status => set({ saveStatus: status }),

    setSaveError: error => set({ saveError: error }),

    setChannelId: channelId => set({ channelId }),
}));

export const useBlockRegistry = () => useFlowsStore(state => state.blockRegistry);
export const useIsBlocksLoaded = () => useFlowsStore(state => state.isBlocksLoaded);
export const useCurrentFlowId = () => useFlowsStore(state => state.currentFlowId);
export const useFlowName = () => useFlowsStore(state => state.flowName);
export const useFlowsList = () => useFlowsStore(state => state.flows);
export const useLastSavedAt = () => useFlowsStore(state => state.lastSavedAt);
export const useIsAutoSaveEnabled = () => useFlowsStore(state => state.isAutoSaveEnabled);
export const useSaveStatus = () => useFlowsStore(state => state.saveStatus);
export const useSaveError = () => useFlowsStore(state => state.saveError);
export const useChannelId = () => useFlowsStore(state => state.channelId);
