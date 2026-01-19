import { create } from 'zustand';

import type { BlockDefinition, FlowMeta } from '../api';

interface FlowsState {
    // Block Registry
    blockRegistry: Record<string, BlockDefinition>;
    isBlocksLoaded: boolean;

    // Current Flow
    currentFlowId: string | null;
    flowName: string;
    flows: FlowMeta[];

    // Loading States
    isLoading: boolean;
    isSaving: boolean;
    lastSavedAt: Date | null;

    // Auto Save
    isAutoSaveEnabled: boolean;

    // Actions
    setBlockRegistry: (blocks: BlockDefinition[]) => void;
    setBlocksLoaded: (loaded: boolean) => void;
    setCurrentFlowId: (id: string | null) => void;
    setFlowName: (name: string) => void;
    setFlows: (flows: FlowMeta[]) => void;
    setLoading: (loading: boolean) => void;
    setSaving: (saving: boolean) => void;
    setLastSavedAt: (date: Date | null) => void;
    setAutoSaveEnabled: (enabled: boolean) => void;
    toggleAutoSave: () => void;
}

export const useFlowsStore = create<FlowsState>((set, _get) => ({
    // Initial State
    blockRegistry: {},
    isBlocksLoaded: false,
    currentFlowId: null,
    flowName: 'Untitled Workflow',
    flows: [],
    isLoading: false,
    isSaving: false,
    lastSavedAt: null,
    isAutoSaveEnabled: false,

    // Actions
    setBlockRegistry: blocks => {
        const registry = blocks.reduce<Record<string, BlockDefinition>>((acc, block) => {
            acc[block.type] = block;
            return acc;
        }, {});
        set({ blockRegistry: registry });
    },

    setBlocksLoaded: loaded => set({ isBlocksLoaded: loaded }),

    setCurrentFlowId: id => set({ currentFlowId: id }),

    setFlowName: name => set({ flowName: name }),

    setFlows: flows => set({ flows }),

    setLoading: loading => set({ isLoading: loading }),

    setSaving: saving => set({ isSaving: saving }),

    setLastSavedAt: date => set({ lastSavedAt: date }),

    setAutoSaveEnabled: enabled => set({ isAutoSaveEnabled: enabled }),

    toggleAutoSave: () => set(state => ({ isAutoSaveEnabled: !state.isAutoSaveEnabled })),
}));

// Selector hooks for better performance
export const useBlockRegistry = () => useFlowsStore(state => state.blockRegistry);
export const useIsBlocksLoaded = () => useFlowsStore(state => state.isBlocksLoaded);
export const useCurrentFlowId = () => useFlowsStore(state => state.currentFlowId);
export const useFlowName = () => useFlowsStore(state => state.flowName);
export const useFlowsList = () => useFlowsStore(state => state.flows);
export const useIsFlowLoading = () => useFlowsStore(state => state.isLoading);
export const useIsSaving = () => useFlowsStore(state => state.isSaving);
export const useLastSavedAt = () => useFlowsStore(state => state.lastSavedAt);
export const useIsAutoSaveEnabled = () => useFlowsStore(state => state.isAutoSaveEnabled);
