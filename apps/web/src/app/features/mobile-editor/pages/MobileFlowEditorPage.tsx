import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { ArrowRight, Globe, KeyRound, Lock, Plus, ShieldX } from 'lucide-react';
import { toast } from 'sonner';

import { EXECUTE_FUNCTIONS, createNode, runNode, useBlocks, useCanvasStore, useFlows } from '@flows/flows';
import { ApiKeyDialog } from '@flows/shared';
import { useInitFlowSocket } from '@flows/socket';
import { Button } from '@flows/ui-kit';
import { useWebCoreStore } from '@flows/web-core';

import { FlowListDialog } from '../../flows/components/FlowListDialog';
import { generateTempId } from '../../flows/utils';
import {
    MobileBlockLibrarySheet,
    MobileConnectionSheet,
    MobileFlowMap,
    MobileHeader,
    MobileNodeConfigSheet,
    MobileNodeList,
} from '../components';
import { useConnectionMode } from '../hooks';
import { topologicalSort } from '../utils';

import type { NodeState } from '@flows/flows';
import type { NodeData } from '@lemoncloud/eureka-flows-api';

const serializeWorkflowState = (data: { nodes?: unknown[]; connections?: unknown[] }): string =>
    JSON.stringify({ nodes: data.nodes ?? [], connections: data.connections ?? [] });

export const MobileFlowEditorPage = () => {
    const { t } = useTranslation(['flows']);

    const { loadBlocks, blockRegistry } = useBlocks();
    const {
        currentFlowId,
        flowName,
        isLoading,
        isSaving,
        saveStatus,
        channelId,
        initializeFlow,
        loadFlowById,
        saveCurrentFlow,
        createNewFlow,
        updateFlowName,
    } = useFlows();

    const lastSavedStateRef = useRef<string | null>(null);
    const autoSaveTimerRef = useRef<number | null>(null);
    const lastLocalUpdateTimestampRef = useRef<number | null>(null);

    const [isAppReady, setIsAppReady] = useState(false);
    const [loadingText, setLoadingText] = useState('');
    const [bootError, setBootError] = useState<string | null>(null);
    const [isApiKeyDialogOpen, setIsApiKeyDialogOpen] = useState(false);
    const [isFlowListOpen, setIsFlowListOpen] = useState(false);
    const [isBlockLibraryOpen, setIsBlockLibraryOpen] = useState(false);
    const [isFlowMapOpen, setIsFlowMapOpen] = useState(false);
    const [configNodeId, setConfigNodeId] = useState<string | null>(null);
    const [isRunningAll, setIsRunningAll] = useState(false);

    const { apiKey, setApiKey } = useWebCoreStore();
    const isPublicMode = !apiKey && window.location.pathname.startsWith('/flows/');

    const connectionMode = useConnectionMode(blockRegistry);

    // ============================================================
    // Socket handlers (simplified for mobile - no canvasRef)
    // ============================================================
    const nodeNoRef = useRef<Map<string, number>>(new Map());
    const portNoRef = useRef<Map<string, number>>(new Map());

    const handleFlowUpdate = useCallback(
        async (flowId: string) => {
            try {
                const flowData = await loadFlowById(flowId);
                if (flowData) {
                    useCanvasStore.getState().loadWorkflow(flowData);
                    lastSavedStateRef.current = serializeWorkflowState(flowData);
                }
            } catch (error) {
                console.error('[MobileFlowEditor] Failed to reload flow:', error);
            }
        },
        [loadFlowById]
    );

    const handleNodeUpdate = useCallback(
        async (info: {
            nodeId: string;
            flowId?: string;
            state?: string;
            no?: number;
            error?: string;
            errorMessage?: string;
        }) => {
            if (!info.flowId || info.flowId !== currentFlowId) return;
            if (info.no !== undefined) {
                const prevNo = nodeNoRef.current.get(info.nodeId);
                if (prevNo !== undefined && prevNo >= info.no) return;
                nodeNoRef.current.set(info.nodeId, info.no);
            }

            const { updateNodeData } = useCanvasStore.getState();

            if (info.state === 'ERROR') {
                updateNodeData(info.nodeId, {
                    state: info.state as NodeState,
                    error: info.error ?? info.errorMessage,
                } as Partial<NodeData>);
                toast.error(`Node ${info.nodeId} failed`);
                return;
            }

            if (info.state) {
                updateNodeData(info.nodeId, { state: info.state as NodeState } as Partial<NodeData>);
            }

            if (info.state === 'COMPLETED') {
                toast.success(`Node completed`, { duration: 3000 });
            }
        },
        [currentFlowId]
    );

    const handlePortUpdate = useCallback(
        async (info: { portId: string; nodeId: string; flowId?: string; portName?: string; no?: number }) => {
            if (!info.flowId || info.flowId !== currentFlowId) return;
            if (info.no !== undefined) {
                const prevNo = portNoRef.current.get(info.portId);
                if (prevNo !== undefined && prevNo >= info.no) return;
                portNoRef.current.set(info.portId, info.no);
            }
            // Port data will be refreshed when user opens config sheet
        },
        [currentFlowId]
    );

    const handleTraceUpdate = useCallback(
        (info: {
            nodeId: string;
            traceId: string;
            seq: number;
            ts: number;
            stage: string;
            message: string;
            runId?: string;
            type?: string;
            data?: unknown;
        }) => {
            useCanvasStore.getState().appendTraceLog(info.nodeId, {
                traceId: info.traceId,
                seq: info.seq,
                ts: info.ts,
                stage: info.stage,
                message: info.message,
                runId: info.runId,
                type: info.type,
                data: info.data,
            });
        },
        []
    );

    const getLastLocalUpdateTimestamp = useCallback(() => lastLocalUpdateTimestampRef.current, []);

    const { isConnected: isSocketConnected, connectionId: socketConnectionId } = useInitFlowSocket({
        channelId,
        currentFlowId,
        getLastLocalUpdateTimestamp,
        onFlowUpdate: handleFlowUpdate,
        onNodeReload: handleNodeUpdate,
        onPortUpdate: handlePortUpdate,
        onTraceUpdate: handleTraceUpdate,
    });

    // ============================================================
    // Boot
    // ============================================================
    const updateUrl = useCallback((flowId: string | null) => {
        try {
            const path = flowId ? `/flows/${flowId}` : '/editor';
            if (window.location.pathname !== path) {
                window.history.replaceState({ flowId }, '', path);
            }
        } catch {
            // ignore
        }
    }, []);

    const boot = useCallback(async () => {
        setBootError(null);
        setIsAppReady(false);

        const currentApiKey = useWebCoreStore.getState().apiKey;
        const pathParts = window.location.pathname.split('/');
        const flowIdFromUrl = pathParts.length > 2 && pathParts[1] === 'flows' ? pathParts[2] : null;

        if (!currentApiKey && !flowIdFromUrl) {
            setIsApiKeyDialogOpen(true);
            return;
        }

        setLoadingText(t('flowEditor.initializingEngine'));
        try {
            setLoadingText(t('flowEditor.loadingBlockRegistry'));
            await loadBlocks();

            let loadedId: string | null = null;
            let initialFlow = null;

            if (flowIdFromUrl) {
                setLoadingText(t('flowEditor.loadingFlow', { flowId: flowIdFromUrl }));
                initialFlow = await loadFlowById(flowIdFromUrl);
                if (!initialFlow) {
                    if (!currentApiKey) {
                        throw new Error(t('flowEditor.flowNotPublic', 'This flow is private.'));
                    }
                    throw new Error(t('flowEditor.failedToLoadFlow'));
                }
                loadedId = flowIdFromUrl;
            } else {
                setLoadingText(t('flowEditor.initializingFlow'));
                const result = await initializeFlow();
                loadedId = result.flowId;
                initialFlow = result.flowData;
            }

            // Load workflow directly into store (no canvasRef needed)
            if (initialFlow) {
                useCanvasStore.getState().loadWorkflow(initialFlow);
                lastSavedStateRef.current = serializeWorkflowState(initialFlow);
            }

            if (loadedId) {
                updateUrl(loadedId);
            }

            setIsAppReady(true);
        } catch (e) {
            console.error('[MobileFlowEditor] Boot failed:', e);
            setBootError(e instanceof Error ? e.message : t('flowEditor.errorLoadingApp'));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const bootedRef = useRef(false);
    useEffect(() => {
        if (bootedRef.current) return;
        bootedRef.current = true;
        boot();
    }, [boot]);

    // ============================================================
    // Auto-save
    // ============================================================
    useEffect(() => {
        if (isPublicMode || !isAppReady) return;

        const unsub = useCanvasStore.subscribe((state, prevState) => {
            if (state.nodes !== prevState.nodes || state.connections !== prevState.connections) {
                if (autoSaveTimerRef.current) {
                    window.clearTimeout(autoSaveTimerRef.current);
                }
                autoSaveTimerRef.current = window.setTimeout(() => {
                    const { nodes, connections } = useCanvasStore.getState();
                    const currentState = serializeWorkflowState({ nodes, connections });
                    if (currentState !== lastSavedStateRef.current) {
                        lastLocalUpdateTimestampRef.current = Date.now();
                        saveCurrentFlow({ nodes, connections });
                        lastSavedStateRef.current = currentState;
                    }
                }, 2000);
            }
        });

        return () => {
            unsub();
            if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);
        };
    }, [isPublicMode, isAppReady, saveCurrentFlow]);

    // Clear sequence tracking on flow change
    useEffect(() => {
        nodeNoRef.current.clear();
        portNoRef.current.clear();
    }, [currentFlowId]);

    // ============================================================
    // Actions
    // ============================================================
    const handleApiKeySubmit = useCallback(
        async (key: string): Promise<boolean> => {
            setApiKey(key);
            setIsApiKeyDialogOpen(false);
            bootedRef.current = false;
            setTimeout(() => boot(), 0);
            return true;
        },
        [setApiKey, boot]
    );

    const handleSave = useCallback(async () => {
        const { nodes, connections } = useCanvasStore.getState();
        lastLocalUpdateTimestampRef.current = Date.now();
        const result = await saveCurrentFlow({ nodes, connections });
        if (result.success) {
            lastSavedStateRef.current = serializeWorkflowState({ nodes, connections });
            toast.success(t('flowEditor.savedAs', { flowName }));
            if (result.id !== currentFlowId) updateUrl(result.id);
        } else {
            toast.error(t('flowEditor.failedToSaveWorkflow'));
        }
    }, [saveCurrentFlow, flowName, currentFlowId, updateUrl, t]);

    const handleSelectFlow = useCallback(
        async (flowId: string) => {
            try {
                const flowData = await loadFlowById(flowId);
                if (flowData) {
                    useCanvasStore.getState().loadWorkflow(flowData);
                    lastSavedStateRef.current = serializeWorkflowState(flowData);
                }
                updateUrl(flowId);
            } catch {
                toast.error(t('flowEditor.failedToLoadFlow'));
            }
        },
        [loadFlowById, updateUrl, t]
    );

    const handleAddBlock = useCallback(
        async (type: string) => {
            const { nodes, connections } = useCanvasStore.getState();
            const def = blockRegistry[type];
            if (!def) return;

            const tempNodeId = generateTempId('node');
            const lastNode = nodes[nodes.length - 1];
            const posX = lastNode ? lastNode.position.x : 100;
            const posY = lastNode ? lastNode.position.y + 200 : 100;

            const newNode: NodeData = {
                id: tempNodeId,
                type,
                position: { x: posX, y: posY },
                config: { ...def.defaultConfig },
                state: 'IDLE' as NodeState,
                status: 'IDLE',
                inputData: {},
                outputData: {},
                autoExecutionEnabled: true,
            };

            useCanvasStore.getState().setNodes(prev => [...prev, newNode]);

            // Sync to backend
            try {
                const flowId = useCanvasStore.getState().flowId;
                const result = await createNode({
                    flowId: flowId ?? '',
                    type,
                    position: newNode.position,
                    config: newNode.config,
                });
                if (result?.id && result.id !== tempNodeId) {
                    useCanvasStore
                        .getState()
                        .setNodes(prev => prev.map(n => (n.id === tempNodeId ? { ...n, id: result.id } : n)));
                    // Update connections that reference temp ID
                    useCanvasStore.getState().setConnections(prev =>
                        prev.map(c => ({
                            ...c,
                            sourceNodeId: c.sourceNodeId === tempNodeId ? result.id : c.sourceNodeId,
                            targetNodeId: c.targetNodeId === tempNodeId ? result.id : c.targetNodeId,
                        }))
                    );
                }
            } catch {
                toast.error('Failed to create node');
            }
        },
        [blockRegistry]
    );

    const handleTapCard = useCallback((nodeId: string) => {
        setConfigNodeId(nodeId);
    }, []);

    const handleExport = useCallback(() => {
        const { nodes, connections } = useCanvasStore.getState();
        const jsonString = JSON.stringify({ nodes, edges: connections }, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${flowName.replace(/\s+/g, '-').toLowerCase()}-${currentFlowId || Date.now()}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success(t('flowEditor.exportedToJson'));
    }, [flowName, currentFlowId, t]);

    const handleRunAll = useCallback(async () => {
        const { nodes, connections, updateNodeData } = useCanvasStore.getState();
        if (nodes.length === 0) return;

        setIsRunningAll(true);
        const ordered = topologicalSort(nodes, connections);
        const nodeMap = new Map(nodes.map(n => [n.id, n]));
        const total = ordered.length;
        let completed = 0;

        toast.info(`Running ${total} nodes...`);

        for (const nodeId of ordered) {
            const node = nodeMap.get(nodeId);
            if (!node) continue;

            updateNodeData(nodeId, { state: 'RUNNING' } as Partial<NodeData>);

            try {
                const blockDef = blockRegistry[node.type];
                if (blockDef?.isFrontend && EXECUTE_FUNCTIONS[blockDef.type]) {
                    const executeFn = EXECUTE_FUNCTIONS[blockDef.type];
                    const result = await executeFn(node.inputData ?? {}, node.config ?? {});
                    updateNodeData(nodeId, { outputData: result, state: 'COMPLETED' } as Partial<NodeData>);
                    await runNode(nodeId, { output: result });
                } else {
                    await runNode(nodeId, undefined, { connectionId: socketConnectionId ?? undefined });
                }
                completed++;
            } catch {
                updateNodeData(nodeId, { state: 'ERROR' } as Partial<NodeData>);
                toast.error(`Node ${completed + 1}/${total} failed`);
                break;
            }
        }

        setIsRunningAll(false);
        if (completed === total) {
            toast.success(`All ${total} nodes completed`);
        }
    }, [blockRegistry, socketConnectionId]);

    const handleNew = useCallback(async () => {
        if (window.confirm(t('flowEditor.confirmNewFlow'))) {
            useCanvasStore.getState().clearWorkflow();
            lastSavedStateRef.current = serializeWorkflowState({ nodes: [], connections: [] });
            const newId = await createNewFlow();
            if (newId) {
                updateUrl(newId);
                toast.success(t('flowEditor.newFlowCreated'));
            }
        }
    }, [createNewFlow, updateUrl, t]);

    // ============================================================
    // Loading / Error state
    // ============================================================
    if (!isAppReady) {
        return (
            <div className="flex h-screen bg-background text-foreground items-center justify-center flex-col gap-4 px-6">
                {bootError ? (
                    <div className="flex flex-col items-center max-w-sm mx-auto animate-fade-in-up">
                        {isPublicMode ? (
                            <div className="w-16 h-16 rounded-2xl bg-muted/30 border border-border/40 flex items-center justify-center mb-5">
                                <Lock className="w-7 h-7 text-muted-foreground/50" />
                            </div>
                        ) : (
                            <div className="w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mb-5">
                                <ShieldX className="w-7 h-7 text-destructive/60" />
                            </div>
                        )}
                        <h2 className="text-base font-semibold text-foreground mb-1.5 text-center">
                            {isPublicMode
                                ? t('flowEditor.privateFlowTitle', 'Private Flow')
                                : t('flowEditor.loadErrorTitle', 'Failed to Load')}
                        </h2>
                        <p className="text-sm text-muted-foreground text-center mb-6 leading-relaxed">
                            {isPublicMode
                                ? t('flowEditor.privateFlowDescription', 'This flow is not publicly available.')
                                : bootError}
                        </p>
                        <div className="flex flex-col items-center gap-2.5">
                            {isPublicMode ? (
                                <Button size="sm" className="gap-2" onClick={() => setIsApiKeyDialogOpen(true)}>
                                    <KeyRound className="w-3.5 h-3.5" />
                                    {t('flowEditor.signInWithApiKey', 'Sign in with API Key')}
                                </Button>
                            ) : (
                                <div className="flex gap-2">
                                    <Button size="sm" onClick={boot}>
                                        {t('flowEditor.retry')}
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={() => setIsApiKeyDialogOpen(true)}>
                                        {t('flowEditor.resetApiKey')}
                                    </Button>
                                </div>
                            )}
                            <Link
                                to="/flows"
                                className="group flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-primary transition-colors mt-1"
                            >
                                <Globe className="w-3.5 h-3.5" />
                                {t('flowEditor.browsePublicFlows', 'Browse public flows')}
                                <ArrowRight className="w-3 h-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                            </Link>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="relative w-16 h-16">
                            <div className="absolute inset-0 border-4 border-border rounded-full" />
                            <div className="absolute inset-0 border-4 border-primary rounded-full border-t-transparent animate-spin" />
                        </div>
                        <div className="text-muted-foreground font-mono text-sm animate-pulse">{loadingText}</div>
                    </>
                )}
                <ApiKeyDialog
                    open={isApiKeyDialogOpen}
                    onSubmit={handleApiKeySubmit}
                    onOpenChange={open => {
                        setIsApiKeyDialogOpen(open);
                        if (!open && !useWebCoreStore.getState().apiKey) {
                            window.location.href = '/';
                        }
                    }}
                    codesUrl={import.meta.env.VITE_CODES_URL}
                    initialValue={apiKey ?? undefined}
                />
            </div>
        );
    }

    // ============================================================
    // Main render
    // ============================================================
    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* Header */}
            <MobileHeader
                flowName={flowName}
                onNameChange={updateFlowName}
                saveStatus={saveStatus}
                isSaving={isSaving}
                isSocketConnected={isSocketConnected}
                onSave={handleSave}
                onOpenFlowList={() => setIsFlowListOpen(true)}
                onOpenFlowMap={() => setIsFlowMapOpen(true)}
                onExport={handleExport}
                onRunAll={isPublicMode ? undefined : handleRunAll}
                isRunning={isRunningAll}
            />

            {/* Flow Map overlay */}
            <MobileFlowMap
                open={isFlowMapOpen}
                onClose={() => setIsFlowMapOpen(false)}
                onTapNode={nodeId => {
                    setIsFlowMapOpen(false);
                    setConfigNodeId(nodeId);
                }}
                selectedNodeId={configNodeId}
            />

            {/* Node list — scrollable area */}
            <div className="fixed inset-0 overflow-y-auto overscroll-contain pt-14 pb-24">
                <div className="pt-2">
                    <MobileNodeList
                        onTapCard={handleTapCard}
                        onTapOutputPort={connectionMode.openForPort}
                        socketConnectionId={socketConnectionId ?? undefined}
                        selectedNodeId={configNodeId}
                        isReadOnly={isPublicMode}
                    />
                </div>
            </div>

            {/* FAB - Add block */}
            {!isPublicMode && (
                <button
                    onClick={() => setIsBlockLibraryOpen(true)}
                    className="fixed bottom-6 right-6 z-30 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-95 transition-transform mb-[env(safe-area-inset-bottom)]"
                >
                    <Plus className="w-6 h-6" />
                </button>
            )}

            {/* Connection Sheet */}
            {connectionMode.source && (
                <MobileConnectionSheet
                    open={connectionMode.isOpen}
                    onOpenChange={open => {
                        if (!open) connectionMode.close();
                    }}
                    sourceNodeName={connectionMode.source.nodeName}
                    sourcePortName={connectionMode.source.portName}
                    sourcePortDataType={connectionMode.source.portDataType}
                    sourceNodeId={connectionMode.source.nodeId}
                    sourcePortId={connectionMode.source.portId}
                    compatibleTargets={connectionMode.compatibleTargets}
                    onConnect={(targetNodeId, targetPortId) => {
                        connectionMode.connectTo(targetNodeId, targetPortId);
                    }}
                    onDisconnect={connectionMode.disconnect}
                />
            )}

            {/* Block Library Sheet */}
            <MobileBlockLibrarySheet
                open={isBlockLibraryOpen}
                onOpenChange={setIsBlockLibraryOpen}
                onAddBlock={handleAddBlock}
            />

            {/* Node Config Sheet */}
            <MobileNodeConfigSheet
                open={configNodeId !== null}
                onOpenChange={open => {
                    if (!open) setConfigNodeId(null);
                }}
                nodeId={configNodeId}
            />

            {/* Flow List Dialog */}
            <FlowListDialog
                open={isFlowListOpen}
                onOpenChange={setIsFlowListOpen}
                currentFlowId={currentFlowId}
                onSelectFlow={handleSelectFlow}
                onNewFlow={handleNew}
            />

            {/* API Key Dialog */}
            <ApiKeyDialog
                open={isApiKeyDialogOpen}
                onSubmit={handleApiKeySubmit}
                onOpenChange={setIsApiKeyDialogOpen}
                codesUrl={import.meta.env.VITE_CODES_URL}
                initialValue={apiKey ?? undefined}
            />

            {/* Loading Overlay */}
            {isLoading && (
                <div className="fixed inset-0 bg-background/50 z-50 flex items-center justify-center backdrop-blur-sm">
                    <div className="flex flex-col items-center bg-glass-bg backdrop-blur-[24px] border border-glass-border rounded-2xl p-6 shadow-floating">
                        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-3" />
                        <span className="text-sm font-medium">{t('flowEditor.processing')}</span>
                    </div>
                </div>
            )}

            {/* Public Mode CTA */}
            {isPublicMode && (
                <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 mb-[env(safe-area-inset-bottom)]">
                    <Button size="sm" className="shadow-lg gap-2" onClick={() => setIsApiKeyDialogOpen(true)}>
                        <KeyRound className="w-4 h-4" />
                        {t('flowEditor.signInToEdit', 'Sign in to edit')}
                    </Button>
                </div>
            )}
        </div>
    );
};
