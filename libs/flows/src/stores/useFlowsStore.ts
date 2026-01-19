import { create } from 'zustand';

import type { FlowView } from '../types';
import type { BlockDefinition } from '@lemoncloud/eureka-flows-api';

/**
 * FlowsStore - manages flow metadata and block registry
 *
 * NOTE: Execution state is managed at the NODE level, not flow level.
 * Each node has its own `status`, `executionStats`, `errorMessage`.
 * See useCanvasStore for node-level state management.
 */
interface FlowsState {
    blockRegistry: Record<string, BlockDefinition>;
    isBlocksLoaded: boolean;
    currentFlowId: string | null;
    flowName: string;
    flows: FlowView[];
    isLoading: boolean;
    isSaving: boolean;
    lastSavedAt: Date | null;
    isAutoSaveEnabled: boolean;

    setBlockRegistry: (blocks: BlockDefinition[]) => void;
    setBlocksLoaded: (loaded: boolean) => void;
    setCurrentFlowId: (id: string | null) => void;
    setFlowName: (name: string) => void;
    setFlows: (flows: FlowView[]) => void;
    setLoading: (loading: boolean) => void;
    setSaving: (saving: boolean) => void;
    setLastSavedAt: (date: Date | null) => void;
    setAutoSaveEnabled: (enabled: boolean) => void;
    toggleAutoSave: () => void;
}

export const useFlowsStore = create<FlowsState>((set, _get) => ({
    blockRegistry: {},
    isBlocksLoaded: false,
    currentFlowId: null,
    flowName: 'Untitled Workflow',
    flows: [],
    isLoading: false,
    isSaving: false,
    lastSavedAt: null,
    isAutoSaveEnabled: false,

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

export const useBlockRegistry = () => useFlowsStore(state => state.blockRegistry);
export const useIsBlocksLoaded = () => useFlowsStore(state => state.isBlocksLoaded);
export const useCurrentFlowId = () => useFlowsStore(state => state.currentFlowId);
export const useFlowName = () => useFlowsStore(state => state.flowName);
export const useFlowsList = () => useFlowsStore(state => state.flows);
export const useIsFlowLoading = () => useFlowsStore(state => state.isLoading);
export const useIsSaving = () => useFlowsStore(state => state.isSaving);
export const useLastSavedAt = () => useFlowsStore(state => state.lastSavedAt);
export const useIsAutoSaveEnabled = () => useFlowsStore(state => state.isAutoSaveEnabled);
