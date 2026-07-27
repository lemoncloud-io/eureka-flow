import { create } from 'zustand';

import { flowStorage } from '../utils/flowStorage';

import type { BlockDefinitionWithFrontend, FlowView } from '../types';
import type { FlowSnapshot } from '@flows/engine';

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
    flowDescription: string;
    flows: FlowView[];
    lastSavedAt: Date | null;
    isAutoSaveEnabled: boolean;
    saveStatus: SaveStatus;
    saveError: Error | null;
    /** WebSocket channel ID for real-time node status updates */
    channelId: string | null;
    /** Whether this flow is publicly accessible */
    isPublic: boolean;
    /** Whether the current user has edit permission (Owner OR same-workspace Editor) */
    isEditable: boolean;
    /** Whether the current user owns this flow (Owner only — gates structural/metadata edits) */
    hasOwned: boolean;
    /** Thumbnail URL (http or s3) */
    flowThumbnail: string;
    /**
     * The flow as the server last confirmed it — set on load, and again on a successful
     * save. What the canvas holds is the working copy; the gap between the two is the
     * unsaved work. `null` until a flow is loaded or created.
     */
    baseline: FlowSnapshot | null;

    setBlockRegistry: (blocks: BlockDefinitionWithFrontend[]) => void;
    setBlocksLoaded: (loaded: boolean) => void;
    setCurrentFlowId: (id: string | null) => void;
    setFlowName: (name: string) => void;
    setFlowDescription: (description: string) => void;
    setFlows: (flows: FlowView[]) => void;
    setLastSavedAt: (date: Date | null) => void;
    setAutoSaveEnabled: (enabled: boolean) => void;
    toggleAutoSave: () => void;
    setSaveStatus: (status: SaveStatus) => void;
    setSaveError: (error: Error | null) => void;
    setChannelId: (channelId: string | null) => void;
    setIsPublic: (isPublic: boolean) => void;
    setIsEditable: (isEditable: boolean) => void;
    setHasOwned: (hasOwned: boolean) => void;
    setFlowThumbnail: (thumbnail: string) => void;
    setBaseline: (baseline: FlowSnapshot | null) => void;
}

export const useFlowsStore = create<FlowsState>(set => ({
    blockRegistry: {},
    isBlocksLoaded: false,
    currentFlowId: null,
    flowName: 'Untitled Workflow',
    flowDescription: '',
    flows: [],
    lastSavedAt: null,
    isAutoSaveEnabled: flowStorage.getAutoSaveEnabled(),
    saveStatus: 'idle',
    saveError: null,
    channelId: '0000',
    isPublic: false,
    isEditable: false,
    hasOwned: false,
    flowThumbnail: '',
    baseline: null,

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

    setFlowDescription: description => set({ flowDescription: description }),

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

    setIsPublic: isPublic => set({ isPublic }),

    setIsEditable: isEditable => set({ isEditable }),

    setHasOwned: hasOwned => set({ hasOwned }),

    setFlowThumbnail: thumbnail => set({ flowThumbnail: thumbnail }),

    setBaseline: baseline => set({ baseline }),
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
export const useFlowDescription = () => useFlowsStore(state => state.flowDescription);
export const useIsPublic = () => useFlowsStore(state => state.isPublic);
export const useIsEditable = () => useFlowsStore(state => state.isEditable);
export const useHasOwned = () => useFlowsStore(state => state.hasOwned);
export const useFlowThumbnail = () => useFlowsStore(state => state.flowThumbnail);
