import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
    EXECUTE_FUNCTIONS,
    getEffectiveState,
    getNode,
    getPortData,
    getStatePriority,
    useBlocks,
    useCanvasStore,
    useFlows,
} from '@flows/flows';
import { ApiKeyDialog } from '@flows/shared';
import { useInitFlowSocket } from '@flows/socket';
import { useWebCoreStore } from '@flows/web-core';

import { Header } from '../components/Header';
import { HelpDialog } from '../components/HelpDialog';
import { Sidebar } from '../components/Sidebar';
import { WorkflowCanvas } from '../components/WorkflowCanvas';

import type { HelpTab } from '../components/help';
import type { SidebarRef } from '../components/Sidebar';
import type { WorkflowCanvasRef } from '../components/WorkflowCanvas';
import type { NodeUpdateInfo, PortUpdateInfo } from '@flows/socket';

const serializeWorkflowState = (data: { nodes?: unknown[]; connections?: unknown[]; edges?: unknown[] }): string =>
    JSON.stringify({ nodes: data.nodes ?? [], connections: data.connections ?? data.edges ?? [] });

const isInputElement = (target: EventTarget | null): boolean => {
    if (!target || !(target instanceof HTMLElement)) return false;
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
};

export const FlowEditorPage = () => {
    const { t } = useTranslation(['flows']);
    const canvasRef = useRef<WorkflowCanvasRef>(null);
    const sidebarRef = useRef<SidebarRef>(null);

    const { loadBlocks, blockRegistry } = useBlocks();
    const {
        currentFlowId,
        flowName,
        isLoading,
        isSaving,
        lastSavedAt,
        isAutoSaveEnabled,
        saveStatus,
        saveError,
        channelId,
        initializeFlow,
        loadFlowById,
        saveCurrentFlow,
        createNewFlow,
        retrySave,
        toggleAutoSave,
        updateFlowName,
    } = useFlows();

    // Handle flow update notification from WebSocket (new format)
    // Fetches entire flow from server and updates canvas
    const handleFlowUpdate = useCallback(
        async (flowId: string) => {
            try {
                const flowData = await loadFlowById(flowId);
                if (canvasRef.current && flowData) {
                    canvasRef.current.loadWorkflow(flowData);
                    lastSavedStateRef.current = serializeWorkflowState(flowData);
                }
            } catch (error) {
                console.error('[FlowEditor] Failed to reload flow:', error);
            }
        },
        [loadFlowById]
    );

    // Track node sequence numbers to detect stale updates (higher no = newer)
    const nodeNoRef = useRef<Map<string, number>>(new Map());

    const handleNodeUpdate = useCallback(
        async (info: NodeUpdateInfo) => {
            const { nodeId, isPort, parentNodeId, state, progress, no } = info;

            // Check if this update is stale based on sequence number (no)
            // Higher 'no' means more recent - skip if we've seen a higher number
            // EXCEPTION: If same 'no' but higher priority state (ERROR > COMPLETED), allow update
            const prevNo = nodeNoRef.current.get(nodeId);
            if (no !== undefined) {
                if (prevNo !== undefined && prevNo > no) {
                    console.debug('[handleNodeUpdate] Skipping stale update:', nodeId, 'prevNo:', prevNo, 'no:', no);
                    return;
                }
                // Same 'no' - check if new state has higher priority (e.g., ERROR > COMPLETED)
                // This handles race condition where server sends COMPLETED and ERROR with same sequence number
                if (prevNo !== undefined && prevNo === no && state) {
                    const currentPriority = getStatePriority(
                        canvasRef.current?.getWorkflow().nodes.find(n => n.id === nodeId)?.state
                    );
                    const newPriority = getStatePriority(state);
                    if (newPriority <= currentPriority) {
                        console.debug('[handleNodeUpdate] Skipping same-no lower priority:', nodeId);
                        return;
                    }
                }
                nodeNoRef.current.set(nodeId, no);
            } else if (prevNo !== undefined) {
                // If we've been tracking sequence numbers for this node,
                // messages without 'no' are likely stale (from a different source)
                console.debug('[handleNodeUpdate] Skipping update without no (prevNo exists):', nodeId);
                return;
            }

            // When state field exists, update UI directly from socket data (no API fetch needed)
            // - state=RUNNING/COMPLETED is the execution state from server
            // - Output data comes separately via node/port messages
            // - API fetch only needed for isPort (port data) or state-less messages
            // NOTE: state field is preferred, status is deprecated but kept for backward compatibility
            if (state && !isPort && canvasRef.current) {
                // Reset executionStats when RUNNING starts, preserve progress if provided
                const executionStats =
                    state === 'RUNNING'
                        ? { startTime: Date.now(), duration: 0, progress: progress ?? 0 }
                        : progress !== undefined
                          ? { progress }
                          : undefined;

                canvasRef.current.updateNodeFromServer(nodeId, {
                    state,
                    status: state, // Deprecated: kept for backward compatibility
                    executionStats,
                });
                return;
            }

            try {
                if (isPort && parentNodeId) {
                    // ============================================================
                    // Port Update Handling
                    // ============================================================
                    // When socket notifies about port data changes, the server has
                    // ALREADY saved the data via propagateDownstreamV2. We only need
                    // to update the UI - no need to call upsertNode (it would be redundant).
                    //
                    // Data flow:
                    //   1. Server runs node → applyOutputs saves output port
                    //   2. Server propagateDownstreamV2 → saves to downstream input port
                    //   3. Socket notification sent to frontend
                    //   4. Frontend updates canvas UI (this code)
                    //
                    // Note: For isFrontend blocks where user enters data directly,
                    // the save happens in WorkflowCanvas when user finishes input,
                    // not here in socket handler.
                    // ============================================================

                    // Fetch port data for UI update only (no upsert needed)
                    const portData = await getNode(nodeId);

                    if (portData?.data$ && portData.direction && canvasRef.current) {
                        // Convert PortData to DataPacket format for canvas update
                        const portValue = portData.data$.S ?? portData.data$.N ?? portData.data$.F ?? portData.data$.M;
                        const portType = portData.dataType || 'text';
                        const portTimestamp = portData.data$.timestamp || info.timestamp;
                        const portKey = portData.name || nodeId.split(':')[1] || 'data';

                        const dataPacket = {
                            value: portValue,
                            type: portType,
                            timestamp: portTimestamp,
                        };

                        // Update canvas with port data (UI only, no API call)
                        const partialUpdate = {
                            inputData: portData.direction === 'in' ? { [portKey]: dataPacket } : undefined,
                            outputData: portData.direction === 'out' ? { [portKey]: dataPacket } : undefined,
                        };
                        canvasRef.current.updateNodeFromServer(parentNodeId, partialUpdate);
                    }
                    // Update state if provided (state preferred, status fallback)
                    else if (canvasRef.current && state) {
                        canvasRef.current.updateNodeFromServer(parentNodeId, {
                            state,
                            status: state, // Deprecated: kept for backward compatibility
                        });
                    }
                } else {
                    // ============================================================
                    // Regular Node Update Logic
                    // ============================================================
                    // When a socket notification arrives, we fetch full node data from API.
                    // However, there's a race condition:
                    //   - Socket delivers real-time state changes instantly
                    //   - API may return stale data if DB write hasn't committed yet
                    //
                    // Solution: Use the MORE COMPLETE state between socket and API
                    //   Priority: COMPLETED/ERROR > RUNNING > READY > IDLE
                    //
                    // Examples:
                    //   - Socket: COMPLETED, API: RUNNING → Use COMPLETED (socket is fresher)
                    //   - Socket: RUNNING, API: COMPLETED → Use COMPLETED (API caught up)
                    // ============================================================

                    const nodeData = await getNode(nodeId);

                    // Determine the best state to use (higher priority wins)
                    // Use getEffectiveState for backward compatibility
                    const socketState = state;
                    const apiState = getEffectiveState(nodeData?.state, nodeData?.status);
                    const socketPriority = getStatePriority(socketState);
                    const apiPriority = getStatePriority(apiState);
                    const finalState = socketPriority >= apiPriority ? socketState : apiState;

                    if (canvasRef.current && nodeData) {
                        // Merge API data with the resolved state
                        const mergedData = finalState
                            ? { ...nodeData, state: finalState, status: finalState }
                            : nodeData;
                        canvasRef.current.updateNodeFromServer(nodeId, mergedData);

                        // ============================================================
                        // Auto-execute isFrontend Nodes
                        // ============================================================
                        // When server propagates data to a downstream node and sets it
                        // to READY state, check if it's an isFrontend node that needs
                        // to be executed on the frontend.
                        //
                        // Flow:
                        //   1. Server executes node → propagateDownstreamV2
                        //   2. Server sets downstream node to READY (if all inputs ready)
                        //   3. Server tries to run but isFrontend → stops (checkRunnable returns false)
                        //   4. Socket notification: node state = READY
                        //   5. Frontend detects isFrontend + READY → auto-execute
                        // ============================================================
                        const effectiveState = finalState ?? getEffectiveState(nodeData?.state, nodeData?.status);
                        if (effectiveState === 'READY' && nodeData?.type) {
                            const nodeDef = blockRegistry[nodeData.type];
                            if (nodeDef?.isFrontend === true && EXECUTE_FUNCTIONS[nodeDef.type]) {
                                // Auto-execute this isFrontend node
                                // Use setTimeout to avoid blocking the socket handler
                                setTimeout(() => {
                                    canvasRef.current?.executeNode?.(nodeId);
                                }, 0);
                            }
                        }
                    } else if (canvasRef.current && state) {
                        // Fallback: No API data, use socket state
                        canvasRef.current.updateNodeFromServer(nodeId, {
                            state,
                            status: state, // Deprecated: kept for backward compatibility
                        });
                    }
                }
            } catch (error) {
                // Node reload failed - revert no to allow retry
                if (no !== undefined) {
                    const prevNo = nodeNoRef.current.get(nodeId);
                    if (prevNo === no) {
                        nodeNoRef.current.delete(nodeId);
                    }
                }
                console.debug('[handleNodeUpdate] Failed to update node:', nodeId, error);
            }
        },
        [blockRegistry]
    );

    // Track port sequence numbers to detect stale updates (higher no = newer)
    // Falls back to timestamp comparison when 'no' is not available
    const portNoRef = useRef<Map<string, number>>(new Map());
    const portTimestampsRef = useRef<Map<string, number>>(new Map());

    // Get port highlight actions from canvas store
    const setUpdatedPort = useCanvasStore(state => state.setUpdatedPort);
    const clearUpdatedPort = useCanvasStore(state => state.clearUpdatedPort);

    // Track highlight timeouts per port to cancel previous timeout on rapid updates
    const highlightTimeoutsRef = useRef<Map<string, number>>(new Map());

    /**
     * Handle port update notification from WebSocket (type: 'node/port')
     * Fetches port data and updates the parent node's inputData/outputData
     *
     * - 'in' direction: updates inputData (data flowing into the node)
     * - 'out' direction: updates outputData (execution results)
     */
    const handlePortUpdate = useCallback(
        async (info: PortUpdateInfo) => {
            const { portId, nodeId, direction, portName, timestamp, no } = info;

            // Use direction from message, default to 'in' if not specified
            const effectiveDirection = direction ?? 'in';

            // Check if this update is stale based on sequence number (no)
            // Higher 'no' means more recent - skip if we've seen a higher number
            if (no !== undefined) {
                const prevNo = portNoRef.current.get(portId);
                if (prevNo !== undefined && prevNo >= no) {
                    console.debug('[handlePortUpdate] Skipping stale update:', portId, 'prevNo:', prevNo, 'no:', no);
                    return;
                }
                portNoRef.current.set(portId, no);
            } else {
                // Fallback: Check if timestamp changed to prevent duplicate fetches
                const prevTimestamp = portTimestampsRef.current.get(portId);
                if (prevTimestamp && timestamp && prevTimestamp >= timestamp) return;

                // Update timestamp before fetch to prevent concurrent fetches
                if (timestamp) {
                    portTimestampsRef.current.set(portId, timestamp);
                }
            }

            try {
                // Fetch port data from server
                const portData = await getPortData(portId, effectiveDirection);

                if (portData?.data && canvasRef.current) {
                    // API returns data in DataPacket-like format: { value, type, timestamp }
                    const dataPacket = {
                        value: portData.data.value,
                        type: portData.data.type,
                        timestamp: portData.data.timestamp || timestamp,
                    };

                    // Use portId from response (e.g., "in", "out") as the key
                    const portKey = portData.portId || portName || 'data';

                    // Update canvas with port data based on direction
                    if (effectiveDirection === 'out') {
                        canvasRef.current.updateNodeFromServer(nodeId, {
                            outputData: { [portKey]: dataPacket },
                        });
                    } else {
                        canvasRef.current.updateNodeFromServer(nodeId, {
                            inputData: { [portKey]: dataPacket },
                        });
                    }

                    // Trigger port update highlight on the specific port
                    // Cancel existing timeout if rapid updates occur on same port
                    const existingTimeout = highlightTimeoutsRef.current.get(portId);
                    if (existingTimeout) {
                        window.clearTimeout(existingTimeout);
                    }

                    setUpdatedPort(portId);
                    const timeoutId = window.setTimeout(() => {
                        clearUpdatedPort(portId);
                        highlightTimeoutsRef.current.delete(portId);
                    }, 500);
                    highlightTimeoutsRef.current.set(portId, timeoutId);
                }
            } catch (error) {
                // Port fetch failed - revert no/timestamp to allow retry
                if (no !== undefined) {
                    const prevNo = portNoRef.current.get(portId);
                    // Only revert if we set it (prevNo would be our 'no' value)
                    if (prevNo === no) {
                        portNoRef.current.delete(portId);
                    }
                } else {
                    // Fallback: revert timestamp
                    const currentTimestamp = portTimestampsRef.current.get(portId);
                    if (currentTimestamp === timestamp) {
                        portTimestampsRef.current.delete(portId);
                    }
                }
                console.debug('[handlePortUpdate] Failed to fetch port data:', portId, error);
            }
        },
        [setUpdatedPort, clearUpdatedPort]
    );

    // Cleanup highlight timeouts on unmount
    useEffect(() => {
        const timeoutsMap = highlightTimeoutsRef.current;
        return () => {
            timeoutsMap.forEach(timeoutId => {
                window.clearTimeout(timeoutId);
            });
            timeoutsMap.clear();
        };
    }, []);

    // Track last local update to prevent self-echo from socket (use ref to avoid re-renders)
    const lastLocalUpdateTimestampRef = useRef<number | null>(null);
    const getLastLocalUpdateTimestamp = useCallback(() => lastLocalUpdateTimestampRef.current, []);

    // Initialize WebSocket connection when channelId is available
    const {
        isConnected: isSocketConnected,
        connectionStatus: socketStatus,
        reconnect: socketReconnect,
        reconnectAttempts,
        maxReconnectReached,
    } = useInitFlowSocket({
        channelId,
        currentFlowId,
        getLastLocalUpdateTimestamp,
        onFlowUpdate: handleFlowUpdate,
        onNodeReload: handleNodeUpdate,
        onPortUpdate: handlePortUpdate,
    });

    const [isAppReady, setIsAppReady] = useState(false);
    const [loadingText, setLoadingText] = useState('');
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [isApiKeyDialogOpen, setIsApiKeyDialogOpen] = useState(false);
    const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
    const [helpDialogTab, setHelpDialogTab] = useState<HelpTab>('gettingStarted');

    const { apiKey, setApiKey } = useWebCoreStore();
    const autoSaveTimerRef = useRef<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const lastSavedStateRef = useRef<string | null>(null);

    const handleOpenLibrary = useCallback(() => {
        sidebarRef.current?.open();
    }, []);

    const handleApiKeySettings = useCallback(() => {
        setIsApiKeyDialogOpen(true);
    }, []);

    const handleOpenHelp = useCallback((tab: HelpTab = 'gettingStarted') => {
        setHelpDialogTab(tab);
        setIsHelpDialogOpen(true);
    }, []);

    const handleApiKeySubmit = useCallback(
        async (key: string): Promise<boolean> => {
            setApiKey(key);
            setIsApiKeyDialogOpen(false);
            return true;
        },
        [setApiKey]
    );

    const updateUrl = useCallback((flowId: string | null, nodeId?: string | null) => {
        try {
            let path = '/';
            if (flowId) path = `/flows/${flowId}`;
            const hash = nodeId ? `#${nodeId}` : '';
            const url = path + hash;

            if (window.location.pathname + window.location.hash !== url) {
                window.history.pushState({ flowId, nodeId }, '', url);
            }
        } catch {
            // ignore
        }
    }, []);

    const bootedRef = useRef(false);
    useEffect(() => {
        if (bootedRef.current) return;
        bootedRef.current = true;

        const boot = async () => {
            setLoadingText(t('flowEditor.initializingEngine'));
            try {
                setLoadingText(t('flowEditor.loadingBlockRegistry'));
                await loadBlocks();

                const pathParts = window.location.pathname.split('/');
                const flowIdFromUrl = pathParts.length > 2 && pathParts[1] === 'flows' ? pathParts[2] : null;
                const nodeIdFromHash = window.location.hash.replace('#', '') || null;

                let loadedId: string | null = null;
                let initialFlow = null;

                if (flowIdFromUrl) {
                    setLoadingText(t('flowEditor.loadingFlow', { flowId: flowIdFromUrl }));
                    initialFlow = await loadFlowById(flowIdFromUrl);
                    loadedId = flowIdFromUrl;
                } else {
                    setLoadingText(t('flowEditor.initializingFlow'));
                    const result = await initializeFlow();
                    loadedId = result.flowId;
                    initialFlow = result.flowData;

                    if (result.isNew) {
                        setLoadingText(t('flowEditor.createdNewFlow'));
                    }
                }

                setIsAppReady(true);

                // Wait for canvas to mount after render
                const waitForCanvas = () => {
                    if (canvasRef.current) {
                        if (initialFlow) {
                            canvasRef.current.loadWorkflow(initialFlow);
                            lastSavedStateRef.current = serializeWorkflowState(initialFlow);
                        }
                        if (loadedId) {
                            updateUrl(loadedId, nodeIdFromHash);
                        }
                        if (nodeIdFromHash) {
                            canvasRef.current.selectNode(nodeIdFromHash);
                        }
                    } else {
                        // Canvas not ready yet, retry
                        requestAnimationFrame(waitForCanvas);
                    }
                };
                requestAnimationFrame(waitForCanvas);
            } catch (e) {
                setLoadingText(t('flowEditor.errorLoadingApp'));
                console.error(e);
            }
        };

        boot();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- Boot runs once on mount, dependencies are stable singletons
    }, []);

    const triggerAutoSave = useCallback(() => {
        if (!isAutoSaveEnabled) return;

        if (autoSaveTimerRef.current) {
            window.clearTimeout(autoSaveTimerRef.current);
        }

        autoSaveTimerRef.current = window.setTimeout(() => {
            if (canvasRef.current) {
                const data = canvasRef.current.getWorkflow();
                const currentState = serializeWorkflowState(data);

                if (currentState !== lastSavedStateRef.current) {
                    lastLocalUpdateTimestampRef.current = Date.now(); // Mark save time to ignore self-echo
                    saveCurrentFlow(data);
                    lastSavedStateRef.current = currentState;
                }
            }
        }, 2000);
    }, [isAutoSaveEnabled, saveCurrentFlow]);

    const showNotification = (message: string, type: 'success' | 'error') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 3000);
    };

    const handleSave = async () => {
        if (!canvasRef.current) return;
        const data = canvasRef.current.getWorkflow();
        lastLocalUpdateTimestampRef.current = Date.now(); // Mark save time to ignore self-echo from socket
        const result = await saveCurrentFlow(data);
        if (result.success) {
            lastSavedStateRef.current = serializeWorkflowState(data);
            showNotification(t('flowEditor.savedAs', { flowName }), 'success');
            if (result.id !== currentFlowId) {
                updateUrl(result.id, window.location.hash.replace('#', ''));
            }
        } else {
            showNotification(t('flowEditor.failedToSaveWorkflow'), 'error');
        }
    };

    const handleNew = async () => {
        if (!canvasRef.current) return;
        if (window.confirm(t('flowEditor.confirmNewFlow'))) {
            canvasRef.current.newWorkflow();
            lastSavedStateRef.current = serializeWorkflowState({ nodes: [], connections: [] });
            const newId = await createNewFlow();
            if (newId) {
                updateUrl(newId, null);
                showNotification(t('flowEditor.newFlowCreated'), 'success');
            } else {
                showNotification(t('flowEditor.failedToCreateFlow'), 'error');
            }
        }
    };

    const handleNameChange = async (newName: string) => {
        // Update flow name on server via POST /flows/:id
        await updateFlowName(newName);
    };

    const handleShare = async () => {
        if (canvasRef.current) {
            const data = canvasRef.current.getWorkflow();
            lastLocalUpdateTimestampRef.current = Date.now();
            await saveCurrentFlow(data);
        }

        try {
            await navigator.clipboard.writeText(window.location.href);
            showNotification(t('flowEditor.linkCopied'), 'success');
        } catch {
            showNotification(t('flowEditor.failedToCopyLink'), 'error');
        }
    };

    const handleClear = () => {
        if (!canvasRef.current) return;
        if (window.confirm(t('flowEditor.confirmClearCanvas'))) {
            canvasRef.current.clearWorkflow();
            showNotification(t('flowEditor.canvasCleared'), 'success');
        }
    };

    const handleAddNode = useCallback((type: string) => {
        canvasRef.current?.addNode(type);
    }, []);

    const handleSelectionChange = (nodeId: string | null) => {
        updateUrl(currentFlowId, nodeId);
    };

    const handleCanvasChange = () => {
        lastLocalUpdateTimestampRef.current = Date.now(); // Mark change time to ignore self-echo from socket
        triggerAutoSave();
    };

    const handleConnectionError = useCallback(
        (error: 'cycle' | 'invalid_type') => {
            if (error === 'cycle') {
                showNotification(t('flowEditor.circularConnectionError'), 'error');
            }
        },
        [t]
    );

    const handleExport = () => {
        if (!canvasRef.current) return;

        const data = canvasRef.current.getWorkflow();
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `${flowName.replace(/\s+/g, '-').toLowerCase()}-${currentFlowId || Date.now()}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        showNotification(t('flowEditor.exportedToJson'), 'success');
    };

    const handleImport = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = event => {
            try {
                const json = JSON.parse(event.target?.result as string);
                if (canvasRef.current && json.nodes && (json.edges || json.connections)) {
                    canvasRef.current.loadWorkflow(json);
                    lastSavedStateRef.current = null;
                    showNotification(t('flowEditor.workflowImported'), 'success');
                } else {
                    showNotification(t('flowEditor.invalidWorkflowFile'), 'error');
                }
            } catch {
                showNotification(t('flowEditor.failedToParseJson'), 'error');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const handlersRef = useRef({
        save: handleSave,
        new: handleNew,
        export: handleExport,
        showNotification,
        openHelp: handleOpenHelp,
    });
    handlersRef.current = {
        save: handleSave,
        new: handleNew,
        export: handleExport,
        showNotification,
        openHelp: handleOpenHelp,
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isInputElement(e.target)) return;

            // Handle ? key for help (Shift + / on most keyboards)
            if (e.key === '?' || (e.shiftKey && e.key === '/')) {
                e.preventDefault();
                handlersRef.current.openHelp('gettingStarted');
                return;
            }

            const isCtrlOrCmd = e.ctrlKey || e.metaKey;
            if (!isCtrlOrCmd) return;

            const key = e.key.toLowerCase();

            if (key === 's') {
                e.preventDefault();
                handlersRef.current.save();
            } else if (key === 'n') {
                e.preventDefault();
                handlersRef.current.new();
            } else if (key === 'e') {
                e.preventDefault();
                handlersRef.current.export();
            } else if (key === 'z' && !e.shiftKey) {
                e.preventDefault();
                canvasRef.current?.undo();
            } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
                e.preventDefault();
                canvasRef.current?.redo();
            } else if (key === 'l') {
                e.preventDefault();
                canvasRef.current?.autoLayout();
                handlersRef.current.showNotification(t('flowEditor.autoLayoutApplied'), 'success');
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- Uses handlersRef for stable callbacks, t is stable
    }, []);

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (!canvasRef.current) return;
            const currentState = serializeWorkflowState(canvasRef.current.getWorkflow());
            if (currentState !== lastSavedStateRef.current) {
                e.preventDefault();
                e.returnValue = '';
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, []);

    if (!isAppReady) {
        return (
            <div className="flex h-screen bg-background text-foreground font-sans items-center justify-center flex-col gap-4">
                <div className="relative w-16 h-16">
                    <div className="absolute inset-0 border-4 border-border rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-primary rounded-full border-t-transparent animate-spin"></div>
                </div>
                <div className="text-muted-foreground font-mono text-sm animate-pulse">{loadingText}</div>
            </div>
        );
    }

    return (
        <div className="relative h-screen bg-canvas text-foreground font-sans overflow-hidden animate-in fade-in duration-500">
            {/* Hidden file input */}
            <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileChange} />

            {/* Full-screen Canvas */}
            <div className="absolute inset-0">
                <WorkflowCanvas
                    ref={canvasRef}
                    flowId={currentFlowId}
                    onNodeSelect={handleSelectionChange}
                    onChange={handleCanvasChange}
                    onOpenLibrary={handleOpenLibrary}
                    onConnectionError={handleConnectionError}
                    onShowNotification={showNotification}
                />
            </div>

            {/* Floating Header */}
            <Header
                flowInfo={{
                    flowName,
                    onNameChange: handleNameChange,
                }}
                fileActions={{
                    onNew: handleNew,
                    onSave: handleSave,
                    onExport: handleExport,
                    onImport: handleImport,
                }}
                editActions={{
                    onUndo: () => canvasRef.current?.undo(),
                    onRedo: () => canvasRef.current?.redo(),
                    onAutoLayout: () => {
                        canvasRef.current?.autoLayout();
                        showNotification(t('flowEditor.autoLayoutApplied'), 'success');
                    },
                    onClear: handleClear,
                    onSave: handleSave,
                }}
                saveState={{
                    isSaving,
                    lastSavedAt,
                    isAutoSaveEnabled,
                    onToggleAutoSave: toggleAutoSave,
                    saveStatus,
                    saveError,
                    onRetrySave: retrySave,
                }}
                socketState={
                    channelId
                        ? {
                              isConnected: isSocketConnected,
                              connectionStatus: socketStatus,
                              reconnectAttempts,
                              maxReconnectReached,
                              onReconnect: socketReconnect,
                          }
                        : undefined
                }
                onShare={handleShare}
                onApiKeySettings={handleApiKeySettings}
                onHelp={() => handleOpenHelp('gettingStarted')}
            />

            {/* Floating Sidebar */}
            <Sidebar ref={sidebarRef} onAddNode={handleAddNode} isLoading={isLoading} />

            {/* API Key Dialog */}
            <ApiKeyDialog
                open={isApiKeyDialogOpen}
                onSubmit={handleApiKeySubmit}
                onOpenChange={setIsApiKeyDialogOpen}
                codesUrl={import.meta.env.VITE_CODES_URL}
                initialValue={apiKey ?? undefined}
            />

            {/* Help Dialog */}
            <HelpDialog open={isHelpDialogOpen} onOpenChange={setIsHelpDialogOpen} defaultTab={helpDialogTab} />

            {/* Notification Toast */}
            {notification && (
                <div
                    className={`absolute top-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full shadow-lg text-sm font-medium animate-in slide-in-from-top-2 fade-in z-50 backdrop-blur-sm ${
                        notification.type === 'success'
                            ? 'bg-success/90 text-success-foreground'
                            : 'bg-destructive/90 text-destructive-foreground'
                    }`}
                >
                    {notification.message}
                </div>
            )}

            {/* Loading Overlay */}
            {isLoading && (
                <div className="absolute inset-0 bg-background/50 z-50 flex items-center justify-center backdrop-blur-sm">
                    <div className="flex flex-col items-center bg-glass-bg backdrop-blur-[24px] border border-glass-border rounded-2xl p-6 shadow-floating">
                        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-3"></div>
                        <span className="text-sm font-medium text-foreground">{t('flowEditor.processing')}</span>
                    </div>
                </div>
            )}
        </div>
    );
};
