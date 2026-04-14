import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { ArrowRight, Globe, KeyRound, Lock, ShieldX, X } from 'lucide-react';
import { toast } from 'sonner';

import { getPermissions, useBlocks, useFlows } from '@flows/flows';
import { ApiKeyDialog } from '@flows/shared';
import { useInitFlowSocket } from '@flows/socket';
import { Button } from '@flows/ui-kit';
import { useWebCoreStore } from '@flows/web-core';

import { useTour } from '../../tutorial';
import { FlowGraphView } from '../components/FlowGraphView';
import { FlowListDialog } from '../components/FlowListDialog';
import { Header } from '../components/Header';
import { HelpDialog } from '../components/HelpDialog';
import { PublishDialog } from '../components/PublishDialog';
import { Sidebar } from '../components/Sidebar';
import { WorkflowCanvas } from '../components/WorkflowCanvas';
import { useSocketHandlers } from '../hooks/useSocketHandlers';

import type { HelpTab } from '../components/help';
import type { SidebarRef } from '../components/Sidebar';
import type { WorkflowCanvasRef } from '../components/WorkflowCanvas';
import type { FlowRole } from '@flows/flows';

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
        flowDescription,
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
        isPublic,
        flowThumbnail,
        togglePublic,
        publishFlow,
    } = useFlows();

    const lastSavedStateRef = useRef<string | null>(null);

    const {
        handleFlowUpdate,
        handleNodeUpdate,
        handlePortUpdate,
        handleTraceUpdate,
        getLastLocalUpdateTimestamp,
        lastLocalUpdateTimestampRef,
    } = useSocketHandlers({
        canvasRef,
        blockRegistry,
        currentFlowId,
        loadFlowById,
        lastSavedStateRef,
        serializeWorkflowState,
    });

    // Initialize WebSocket connection when channelId is available
    const {
        isConnected: isSocketConnected,
        connectionStatus: socketStatus,
        reconnect: socketReconnect,
        reconnectAttempts,
        maxReconnectReached,
        connectionId: socketConnectionId,
    } = useInitFlowSocket({
        channelId,
        currentFlowId,
        getLastLocalUpdateTimestamp,
        onFlowUpdate: handleFlowUpdate,
        onNodeReload: handleNodeUpdate,
        onPortUpdate: handlePortUpdate,
        onTraceUpdate: handleTraceUpdate,
    });

    const { startTourIfFirstVisit, startTour } = useTour();

    const [isAppReady, setIsAppReady] = useState(false);
    const [loadingText, setLoadingText] = useState('');
    const [bootError, setBootError] = useState<string | null>(null);
    const [isApiKeyDialogOpen, setIsApiKeyDialogOpen] = useState(false);
    const [isFlowListOpen, setIsFlowListOpen] = useState(false);
    const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
    const [helpDialogTab, setHelpDialogTab] = useState<HelpTab>('gettingStarted');
    const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
    const [isGraphViewOpen, setIsGraphViewOpen] = useState(false);

    const { apiKey, setApiKey } = useWebCoreStore();

    // Public mode: read-only viewing when no API key and viewing an existing flow
    const isPublicMode = !apiKey && window.location.pathname.startsWith('/flows/');

    // Role derivation: owner / guest / anonymous
    // TODO: Replace isOwner with server response field when API is ready
    const isOwner = !!apiKey; // Placeholder: all authenticated users are owners
    const computedRole: FlowRole = isPublicMode ? 'anonymous' : isOwner ? 'owner' : 'guest';

    // Dev-only role override for testing
    const [devRoleOverride, setDevRoleOverride] = useState<FlowRole | null>(null);
    const role: FlowRole = devRoleOverride ?? computedRole;
    const permissions = getPermissions(role);

    const autoSaveTimerRef = useRef<number | null>(null);

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

    const handleOpenFlowList = useCallback(() => {
        setIsFlowListOpen(true);
    }, []);

    const updateUrl = useCallback((flowId: string | null, nodeId?: string | null) => {
        try {
            let path = '/editor';
            if (flowId) path = `/flows/${flowId}`;
            const hash = nodeId ? `#${nodeId}` : '';
            const url = path + hash;

            if (window.location.pathname + window.location.hash !== url) {
                window.history.replaceState({ flowId, nodeId }, '', url);
            }
        } catch {
            // ignore
        }
    }, []);

    const handleSelectFlow = useCallback(
        async (flowId: string) => {
            try {
                const flowData = await loadFlowById(flowId);
                if (canvasRef.current && flowData) {
                    await canvasRef.current.loadWorkflow(flowData);
                    lastSavedStateRef.current = serializeWorkflowState(flowData);
                }
                updateUrl(flowId, null);
            } catch (error) {
                console.error('[FlowEditor] Failed to load flow:', error);
                handlersRef.current.showNotification(t('flowEditor.failedToLoadFlow'), 'error');
            }
        },
        [loadFlowById, updateUrl, t]
    );

    const boot = useCallback(async () => {
        setBootError(null);
        setIsAppReady(false);

        const currentApiKey = useWebCoreStore.getState().apiKey;
        const pathParts = window.location.pathname.split('/');
        const flowIdFromUrl = pathParts.length > 2 && pathParts[1] === 'flows' ? pathParts[2] : null;

        // Require API key unless viewing an existing flow (public mode)
        if (!currentApiKey && !flowIdFromUrl) {
            setIsApiKeyDialogOpen(true);
            return;
        }

        setLoadingText(t('flowEditor.initializingEngine'));
        try {
            setLoadingText(t('flowEditor.loadingBlockRegistry'));
            await loadBlocks();

            const nodeIdFromHash = window.location.hash.replace('#', '') || null;

            let loadedId: string | null = null;
            let initialFlow = null;

            if (flowIdFromUrl) {
                setLoadingText(t('flowEditor.loadingFlow', { flowId: flowIdFromUrl }));
                initialFlow = await loadFlowById(flowIdFromUrl);
                if (!initialFlow) {
                    // In public mode, failure likely means the flow is private
                    if (!currentApiKey) {
                        throw new Error(
                            t('flowEditor.flowNotPublic', 'This flow is private. Sign in with an API key to view it.')
                        );
                    }
                    throw new Error(t('flowEditor.failedToLoadFlow'));
                }
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
            const waitForCanvas = async () => {
                if (canvasRef.current) {
                    if (initialFlow) {
                        try {
                            await canvasRef.current.loadWorkflow(initialFlow);
                            lastSavedStateRef.current = serializeWorkflowState(initialFlow);
                        } catch (error) {
                            console.error('[FlowEditor] Failed to load workflow:', error);
                        }
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
            console.error('[FlowEditor] Boot failed:', e);
            setBootError(e instanceof Error ? e.message : t('flowEditor.errorLoadingApp'));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- Boot dependencies are stable singletons
    }, []);

    const bootedRef = useRef(false);
    useEffect(() => {
        if (bootedRef.current) return;
        bootedRef.current = true;
        boot();
    }, [boot]);

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

    const triggerAutoSave = useCallback(() => {
        if (!isAutoSaveEnabled || !permissions.canSave) return;

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
        // eslint-disable-next-line react-hooks/exhaustive-deps -- refs are stable, no need to trigger re-creation
    }, [isAutoSaveEnabled, saveCurrentFlow]);

    const showNotification = (message: string, type: 'success' | 'error') => {
        if (type === 'success') {
            toast.success(message);
        } else {
            toast.error(message);
        }
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

    const handleOpenPublish = useCallback(() => {
        setIsPublishDialogOpen(true);
    }, []);

    const handleGraphNodeClick = useCallback((nodeId: string) => {
        setIsGraphViewOpen(false);
        canvasRef.current?.selectNode(nodeId);
    }, []);

    const handleCaptureCanvas = useCallback(async () => {
        return canvasRef.current?.captureAsDataUrl() ?? null;
    }, []);

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

    const handleRunAll = useCallback(async () => {
        try {
            await canvasRef.current?.runAll();
        } catch {
            showNotification(t('flowEditor.failedToRunFlow', 'Failed to run flow'), 'error');
        }
    }, [t]);

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

    const handleExportPng = async () => {
        if (!canvasRef.current) return;
        try {
            const fileName = `${flowName.replace(/\s+/g, '-').toLowerCase()}-${currentFlowId || Date.now()}`;
            await canvasRef.current.exportAsImage(fileName);
            showNotification(t('flowEditor.exportedAsImage'), 'success');
        } catch {
            showNotification(t('flowEditor.exportImageFailed'), 'error');
        }
    };

    const handleExport = () => {
        if (!canvasRef.current) return;

        const data = canvasRef.current.getWorkflow();
        const exportData = {
            nodes: data.nodes.map(({ id, ...rest }) => rest),
            edges: data.edges.map(({ id, ...rest }) => rest),
        };
        const jsonString = JSON.stringify(exportData, null, 2);
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

    const handlersRef = useRef({
        save: handleSave,
        new: handleNew,
        export: handleExport,
        showNotification,
        openHelp: handleOpenHelp,
        openFlowList: handleOpenFlowList,
    });
    handlersRef.current = {
        save: handleSave,
        new: handleNew,
        export: handleExport,
        showNotification,
        openHelp: handleOpenHelp,
        openFlowList: handleOpenFlowList,
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

            if (key === 'o') {
                e.preventDefault();
                handlersRef.current.openFlowList();
            } else if (key === 's') {
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
            } else if (key === 'a') {
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

    useEffect(() => {
        if (isAppReady && !isPublicMode && !isLoading) {
            return startTourIfFirstVisit();
        }
    }, [isAppReady, isPublicMode, isLoading, startTourIfFirstVisit]);

    if (!isAppReady) {
        return (
            <div className="flex h-screen bg-background text-foreground font-sans items-center justify-center flex-col gap-4">
                {bootError ? (
                    <div className="flex flex-col items-center max-w-sm mx-auto px-4 animate-fade-in-up">
                        {/* Icon */}
                        {isPublicMode ? (
                            <div className="w-16 h-16 rounded-2xl bg-muted/30 border border-border/40 flex items-center justify-center mb-5">
                                <Lock className="w-7 h-7 text-muted-foreground/50" />
                            </div>
                        ) : (
                            <div className="w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mb-5">
                                <ShieldX className="w-7 h-7 text-destructive/60" />
                            </div>
                        )}

                        {/* Title */}
                        <h2 className="text-base font-semibold text-foreground mb-1.5 text-center">
                            {isPublicMode
                                ? t('flowEditor.privateFlowTitle', 'Private Flow')
                                : t('flowEditor.loadErrorTitle', 'Failed to Load')}
                        </h2>

                        {/* Description */}
                        <p className="text-sm text-muted-foreground text-center mb-6 leading-relaxed">
                            {isPublicMode
                                ? t(
                                      'flowEditor.privateFlowDescription',
                                      'This flow is not publicly available. Sign in with your API key to access it.'
                                  )
                                : bootError}
                        </p>

                        {/* Actions */}
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
                            <div className="absolute inset-0 border-4 border-border rounded-full"></div>
                            <div className="absolute inset-0 border-4 border-primary rounded-full border-t-transparent animate-spin"></div>
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

    return (
        <div className="relative h-screen bg-canvas text-foreground font-sans overflow-hidden animate-in fade-in duration-500">
            {/* Full-screen Canvas */}
            <div data-tour="canvas" className="absolute inset-0">
                <WorkflowCanvas
                    ref={canvasRef}
                    role={role}
                    flowId={currentFlowId}
                    connectionId={socketConnectionId ?? undefined}
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
                    onExportPng: handleExportPng,
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
                    onCollapseAll: () => canvasRef.current?.collapseAll(),
                    onExpandAll: () => canvasRef.current?.expandAll(),
                    onRunAll: handleRunAll,
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
                isPublic={isPublic}
                isPublicMode={isPublicMode}
                role={role}
                onTogglePublic={async () => {
                    const success = await togglePublic();
                    if (success) {
                        showNotification(t('publish.unpublished', 'Flow unpublished'), 'success');
                    }
                }}
                onPublish={handleOpenPublish}
                onApiKeySettings={handleApiKeySettings}
                onHelp={() => handleOpenHelp('gettingStarted')}
                onTour={startTour}
                onOpenFlowList={handleOpenFlowList}
                onGraphView={() => setIsGraphViewOpen(true)}
            />

            {/* Floating Sidebar */}
            <Sidebar ref={sidebarRef} onAddNode={handleAddNode} isLoading={isLoading} role={role} />

            {/* API Key Dialog */}
            <ApiKeyDialog
                open={isApiKeyDialogOpen}
                onSubmit={handleApiKeySubmit}
                onOpenChange={setIsApiKeyDialogOpen}
                codesUrl={import.meta.env.VITE_CODES_URL}
                initialValue={apiKey ?? undefined}
            />

            {/* Flow List Dialog */}
            <FlowListDialog
                open={isFlowListOpen}
                onOpenChange={setIsFlowListOpen}
                currentFlowId={currentFlowId}
                onSelectFlow={handleSelectFlow}
                onNewFlow={handleNew}
            />

            {/* Help Dialog */}
            <HelpDialog open={isHelpDialogOpen} onOpenChange={setIsHelpDialogOpen} defaultTab={helpDialogTab} />

            {/* Publish Dialog */}
            <PublishDialog
                open={isPublishDialogOpen}
                onOpenChange={setIsPublishDialogOpen}
                flowName={flowName}
                flowDescription={flowDescription}
                flowThumbnail={flowThumbnail}
                flowId={currentFlowId}
                onPublish={publishFlow}
                onCaptureCanvas={handleCaptureCanvas}
            />

            {/* Graph View Overlay */}
            {isGraphViewOpen && (
                <div className="absolute inset-0 z-40 animate-in fade-in duration-200">
                    <FlowGraphView
                        flowId={currentFlowId}
                        className="w-full h-full"
                        onNavigateToNode={handleGraphNodeClick}
                    />

                    {/* Floating Close Button */}
                    <div className="absolute top-3 right-3 z-10">
                        <button
                            onClick={() => setIsGraphViewOpen(false)}
                            className="flex items-center justify-center w-9 h-9 rounded-xl bg-background/80 backdrop-blur-xl border border-border/50 shadow-sm text-muted-foreground hover:text-foreground transition-colors duration-150"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* Public Mode Info Card */}
            {isPublicMode && (
                <div className="absolute bottom-4 left-4 z-30 pointer-events-auto">
                    <div className="bg-glass-bg backdrop-blur-[24px] border border-glass-border rounded-xl p-4 shadow-floating max-w-[280px]">
                        <h3 className="text-sm font-semibold text-foreground truncate">{flowName}</h3>
                        {flowDescription && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{flowDescription}</p>
                        )}
                        <Button size="sm" className="w-full mt-3 gap-2" onClick={() => setIsApiKeyDialogOpen(true)}>
                            <KeyRound className="w-3.5 h-3.5" />
                            {t('flowEditor.signInToEdit', 'Sign in to edit this flow')}
                        </Button>
                    </div>
                </div>
            )}

            {/* Dev Role Toggle (development only) */}
            {import.meta.env.DEV && (
                <div className="fixed bottom-4 right-4 z-50 flex gap-1 bg-background/90 backdrop-blur border border-border rounded-lg p-1 text-xs font-mono">
                    {(['owner', 'guest', 'anonymous'] as FlowRole[]).map(r => (
                        <button
                            key={r}
                            onClick={() => setDevRoleOverride(r === computedRole ? null : r)}
                            className={`px-2 py-1 rounded transition-colors ${
                                role === r
                                    ? 'bg-primary text-primary-foreground'
                                    : 'text-muted-foreground hover:bg-muted'
                            }`}
                        >
                            {r}
                        </button>
                    ))}
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
