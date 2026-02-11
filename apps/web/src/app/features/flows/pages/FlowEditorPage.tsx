import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { EXECUTE_FUNCTIONS, getNode, getStatusPriority, useBlocks, useFlows } from '@flows/flows';
import { useInitFlowSocket } from '@flows/socket';

import { Header } from '../components/Header';
import { Sidebar } from '../components/Sidebar';
import { WorkflowCanvas } from '../components/WorkflowCanvas';

import type { SidebarRef } from '../components/Sidebar';
import type { WorkflowCanvasRef } from '../components/WorkflowCanvas';
import type { NodeData } from '@flows/flows';

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

    // Handle node update notification from WebSocket
    // - For regular nodes: fetch and update canvas with status priority logic
    // - For ports: update canvas UI only (server already saved data via propagation)
    const handleNodeUpdate = useCallback(
        async (info: {
            nodeId: string;
            flowId: string;
            timestamp: number;
            status?: string;
            prevStatus?: string;
            isPort: boolean;
            parentNodeId?: string;
        }) => {
            const { nodeId, status, isPort, parentNodeId } = info;

            // Always fetch latest node data from server
            // (timestamp comparison removed - status changes may have same timestamp)

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
                        } as NodeData;
                        canvasRef.current.updateNodeFromServer(parentNodeId, partialUpdate);
                    }
                    // Update status if provided
                    else if (canvasRef.current && status) {
                        canvasRef.current.updateNodeFromServer(parentNodeId, { status } as NodeData);
                    }
                } else {
                    // ============================================================
                    // Regular Node Update Logic
                    // ============================================================
                    // When a socket notification arrives, we fetch full node data from API.
                    // However, there's a race condition:
                    //   - Socket delivers real-time status changes instantly
                    //   - API may return stale data if DB write hasn't committed yet
                    //
                    // Solution: Use the MORE COMPLETE status between socket and API
                    //   Priority: COMPLETED/ERROR > RUNNING > READY > IDLE
                    //
                    // Examples:
                    //   - Socket: COMPLETED, API: RUNNING → Use COMPLETED (socket is fresher)
                    //   - Socket: RUNNING, API: COMPLETED → Use COMPLETED (API caught up)
                    // ============================================================

                    const nodeData = await getNode(nodeId);

                    // Determine the best status to use (higher priority wins)
                    const socketPriority = getStatusPriority(status);
                    const apiPriority = getStatusPriority(nodeData?.status);
                    const finalStatus = socketPriority >= apiPriority ? status : nodeData?.status;

                    if (canvasRef.current && nodeData) {
                        // Merge API data with the resolved status
                        const mergedData = finalStatus ? { ...nodeData, status: finalStatus } : nodeData;
                        canvasRef.current.updateNodeFromServer(nodeId, mergedData as NodeData);

                        // ============================================================
                        // Auto-execute isFrontend Nodes
                        // ============================================================
                        // When server propagates data to a downstream node and sets it
                        // to READY status, check if it's an isFrontend node that needs
                        // to be executed on the frontend.
                        //
                        // Flow:
                        //   1. Server executes node → propagateDownstreamV2
                        //   2. Server sets downstream node to READY (if all inputs ready)
                        //   3. Server tries to run but isFrontend → stops (checkRunnable returns false)
                        //   4. Socket notification: node status = READY
                        //   5. Frontend detects isFrontend + READY → auto-execute
                        // ============================================================
                        const effectiveStatus = finalStatus ?? nodeData?.status;
                        if (effectiveStatus === 'READY' && nodeData?.type) {
                            const nodeDef = blockRegistry[nodeData.type];
                            if (nodeDef?.isFrontend === true && EXECUTE_FUNCTIONS[nodeDef.type]) {
                                // Auto-execute this isFrontend node
                                // Use setTimeout to avoid blocking the socket handler
                                setTimeout(() => {
                                    canvasRef.current?.executeNode?.(nodeId);
                                }, 0);
                            }
                        }
                    } else if (canvasRef.current && status) {
                        // Fallback: No API data, use socket status
                        canvasRef.current.updateNodeFromServer(nodeId, { status } as NodeData);
                    }
                }
            } catch (error) {
                // Node reload failed - silent fail, user can refresh
                console.debug('[handleNodeUpdate] Failed to update node:', nodeId, error);
            }
        },
        [blockRegistry]
    );

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
    });

    const [isAppReady, setIsAppReady] = useState(false);
    const [loadingText, setLoadingText] = useState('');
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const autoSaveTimerRef = useRef<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const lastSavedStateRef = useRef<string | null>(null);

    const handleOpenLibrary = useCallback(() => {
        sidebarRef.current?.open();
    }, []);

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

                setTimeout(() => {
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
                    }
                }, 0);
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
    });
    handlersRef.current = {
        save: handleSave,
        new: handleNew,
        export: handleExport,
        showNotification,
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isInputElement(e.target)) return;

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
            />

            {/* Floating Sidebar */}
            <Sidebar ref={sidebarRef} onAddNode={handleAddNode} isLoading={isLoading} />

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
