import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { ArrowRight, Globe, KeyRound, Lock, Search, ShieldX, X } from 'lucide-react';

import { createFlowEngine } from '@flows/engine';
import {
    deriveRole,
    diffAgainstBaseline,
    getPermissions,
    useBlockRegistry,
    useCanvasStore,
    useFlows,
    useFlowsStore,
    useProductProgressStore,
} from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { ApiKeyDialog, useCreditsRefresh } from '@flows/shared';
import { Button } from '@flows/ui-kit';
import { isOAuthEnabled, redirectToLogin, useWebCoreStore } from '@flows/web-core';

import { useDebugMode } from '../../../hooks/useDebugMode';
import { AiKeyDialog } from '../../flows/components/AiKeyDialog';
import { ContentPreviewModal } from '../../flows/components/ContentPreviewModal';
import { DevSocketPanel } from '../../flows/components/DevSocketPanel';
import { FlowListDialog } from '../../flows/components/FlowListDialog';
import { useDraftPersistence } from '../../flows/hooks/useDraftPersistence';
import { useEngineMirror } from '../../flows/hooks/useEngineMirror';
import { useProductProgressToasts } from '../../flows/hooks/useProductProgressToasts';
import { useReconnectNotice } from '../../flows/hooks/useReconnectNotice';
import { useRunGate } from '../../flows/hooks/useRunGate';
import { useSocketRecorder } from '../../flows/hooks/useSocketRecorder';
import {
    MobileBlockLibrarySheet,
    MobileBottomBar,
    MobileConnectionSheet,
    MobileFlowMap,
    MobileFlowSettingsSheet,
    MobileHeader,
    MobileNewFlowSheet,
    MobileStepDetail,
    MobileStepList,
} from '../components';
import {
    useConnectionMode,
    useMobileAutoSave,
    useMobileEditorBoot,
    useMobileFlowActions,
    useMobileRunAll,
    useMobileSocketSync,
} from '../hooks';
import { useRecentBlocks } from '../hooks/useRecentBlocks';
import { useStepNavigation } from '../hooks/useStepNavigation';
import { executeNodeWithToast } from '../utils';

import type { FlowRole } from '@flows/flows';
import type { WebSocketMessage } from '@flows/socket';
import type { NodeData } from '@lemoncloud/eureka-flows-api';

const isPortTypeCompatible = (sourceType: string, targetType: string | undefined): boolean => {
    const target = targetType ?? 'any';
    return sourceType === 'any' || target === 'any' || sourceType.toLowerCase() === target.toLowerCase();
};

export const MobileFlowEditorPage = () => {
    const { t } = useTranslation(['flows']);
    const {
        currentFlowId,
        flowName,
        isLoading,
        isSaving,
        saveStatus,
        updateFlowName,
        isEditable,
        hasOwned,
        saveCurrentFlow,
    } = useFlows();
    const { apiKey } = useWebCoreStore();
    const blockRegistry = useBlockRegistry();
    const isPublicMode = !apiKey && window.location.pathname.startsWith('/flows/');
    const nodeCount = useCanvasStore(state => state.nodes.length);
    const { isDebugMode, handleVersionClick, disableDebugMode } = useDebugMode();
    const showDevTools = isDebugMode;

    // Role derivation: anonymous (no apiKey) / owner (hasOwned) / editor (isEditable, not owner) / viewer
    const computedRole: FlowRole = deriveRole({ isPublicMode, hasOwned, isEditable });
    const [devRoleOverride, setDevRoleOverride] = useState<FlowRole | null>(null);
    const role: FlowRole = devRoleOverride ?? computedRole;
    const permissions = getPermissions(role);

    // Shared refs for cross-hook communication
    const lastLocalUpdateTimestampRef = useRef<number | null>(null);

    /**
     * The graph, same as the desktop editor holds it. The registry goes in behind a getter
     * because blocks arrive over the network — an engine built with the empty map would
     * skip port-type checks for the rest of the session.
     */
    const blockRegistryRef = useRef(blockRegistry);
    blockRegistryRef.current = blockRegistry;
    const engine = useMemo(() => createFlowEngine({ getBlockRegistry: () => blockRegistryRef.current }), []);
    // No drag preview on mobile, so the store is never ahead of the engine and the mirror
    // never has to hold off.
    useEngineMirror(engine, { paused: false });

    // UI state
    const [isFlowListOpen, setIsFlowListOpen] = useState(false);
    const [isBlockLibraryOpen, setIsBlockLibraryOpen] = useState(false);
    const [isFlowMapOpen, setIsFlowMapOpen] = useState(false);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isNewFlowSheetOpen, setIsNewFlowSheetOpen] = useState(false);
    const [isFlowSettingsOpen, setIsFlowSettingsOpen] = useState(false);
    const [isAiKeyDialogOpen, setIsAiKeyDialogOpen] = useState(false);
    const [previewContent, setPreviewContent] = useState<{ value: unknown; type?: string } | null>(null);

    // Step navigation (replaces configNodeId)
    const stepNav = useStepNavigation();

    // Hooks
    const { isAppReady, bootError, isApiKeyDialogOpen, setIsApiKeyDialogOpen, handleApiKeySubmit, reBoot, updateUrl } =
        useMobileEditorBoot({ engine });

    useMobileAutoSave({
        isAppReady,
        canSave: permissions.canSave,
        lastLocalUpdateTimestampRef,
    });

    // Auto-save is off by default, so this is what stands between an unsaved flow and a
    // refresh. Only for users who could save it.
    useDraftPersistence({ enabled: isAppReady && permissions.canSave });
    useReconnectNotice();

    const socketRecorder = useSocketRecorder();
    const { record: recordSocketMessage } = socketRecorder;
    const refreshCredits = useCreditsRefresh();

    // Stable identity required — useInitFlowSocket's dispatch effect deps on onMessage;
    // an inline arrow re-runs that effect every render, re-processing lastMessage in a loop.
    const handleSocketMessage = useCallback(
        (message: WebSocketMessage) => {
            recordSocketMessage(message);
            if (message.action === 'trace' || message.action === 'message' || message.action === 'progress') {
                refreshCredits();
            }
        },
        [recordSocketMessage, refreshCredits]
    );

    const { isSocketConnected, socketConnectionId, replayMessage } = useMobileSocketSync({
        engine,
        lastLocalUpdateTimestampRef,
        canEdit: permissions.canEditStructure,
        onMessage: handleSocketMessage,
    });

    useProductProgressToasts();

    const clearProductProgress = useProductProgressStore(state => state.clearAll);
    useEffect(() => {
        return () => clearProductProgress();
    }, [currentFlowId, clearProductProgress]);

    const resetAllNodesToIdle = useCallback(() => {
        const { nodes, updateNodeData } = useCanvasStore.getState();
        nodes.forEach(n => updateNodeData(n.id, { state: 'IDLE' } as Partial<NodeData>));
    }, []);

    const runGate = useRunGate();
    const { runProgress, isRunning, handleRunAll } = useMobileRunAll({ socketConnectionId });

    const { handleSave, handleSelectFlow, handleAddBlock, handleExport, handleCreateNewFlow } = useMobileFlowActions({
        engine,
        updateUrl,
        lastLocalUpdateTimestampRef,
    });

    const connectionMode = useConnectionMode(blockRegistry);
    const { recentIds, addRecent } = useRecentBlocks();

    // Pending auto-connect: when user adds a new block via "Add new block & connect"
    const [pendingConnectSource, setPendingConnectSource] = useState<{
        nodeId: string;
        portId: string;
        portDataType: string;
        /** 'output' = new block feeds INTO this port; 'input' = this port feeds INTO new block */
        direction: 'output' | 'input';
    } | null>(null);

    // Auto-scroll to currently running node during Run All
    useEffect(() => {
        const nodeId = runProgress?.currentNodeId;
        if (!nodeId) return;
        const el = document.querySelector(`[data-node-id="${nodeId}"]`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, [runProgress?.currentNodeId]);

    const handleTapCard = useCallback(
        (nodeId: string) => {
            stepNav.openStep(nodeId);
        },
        [stepNav]
    );

    // Save on close so a refresh before the autosave debounce fires does not drop
    // edits made in MobileStepDetail. Skipped when Auto Save is off — the flow
    // reaches the server only through the header's save button.
    const handleCloseStep = useCallback(async () => {
        if (useFlowsStore.getState().isAutoSaveEnabled) {
            const { nodes, connections } = useCanvasStore.getState();
            if (!diffAgainstBaseline({ nodes, connections }).isEmpty) {
                lastLocalUpdateTimestampRef.current = Date.now();
                await saveCurrentFlow({ nodes, connections });
            }
        }
        stepNav.closeStep();
    }, [stepNav, saveCurrentFlow]);

    const handleRunNode = useCallback(
        async (nodeId: string, options?: { propagate?: boolean }) => {
            const runFlowId = await runGate();
            if (!runFlowId) return;
            await executeNodeWithToast(nodeId, {
                flowId: runFlowId,
                socketConnectionId,
                canEdit: permissions.canEditStructure,
                propagate: options?.propagate,
            });
        },
        [runGate, socketConnectionId, permissions.canEditStructure]
    );

    const handleAddBlockWithRecent = useCallback(
        async (type: string) => {
            addRecent(type);
            const newNodeId = await handleAddBlock(type);
            if (!newNodeId) return;

            // Auto-connect if there's a pending connection source
            if (pendingConnectSource) {
                const newNodeDef = blockRegistry[type];
                const srcType = pendingConnectSource.portDataType;

                if (pendingConnectSource.direction === 'output') {
                    // Original node's output → new block's input
                    const compatibleInput = newNodeDef?.inputs?.find(p => isPortTypeCompatible(srcType, p.type));
                    if (compatibleInput) {
                        await connectionMode.connectPorts(
                            pendingConnectSource.nodeId,
                            pendingConnectSource.portId,
                            newNodeId,
                            compatibleInput.id
                        );
                    }
                } else {
                    // New block's output → original node's input
                    const compatibleOutput = newNodeDef?.outputs?.find(p => isPortTypeCompatible(srcType, p.type));
                    if (compatibleOutput) {
                        await connectionMode.connectPorts(
                            newNodeId,
                            compatibleOutput.id,
                            pendingConnectSource.nodeId,
                            pendingConnectSource.portId
                        );
                    }
                }
                setPendingConnectSource(null);
                return;
            }

            // Plain add (no auto-connect) — open new node's detail
            stepNav.openStep(newNodeId);
        },
        [addRecent, handleAddBlock, pendingConnectSource, blockRegistry, connectionMode, stepNav]
    );

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
                                    <Button size="sm" onClick={reBoot}>
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
                    <div className="w-8 h-8 border-2 border-border/40 border-t-primary rounded-full animate-spin" />
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
            <MobileHeader
                flowName={flowName}
                onNameChange={updateFlowName}
                saveStatus={saveStatus}
                isSaving={isSaving}
                isSocketConnected={isSocketConnected}
                onSave={handleSave}
                onOpenFlowList={() => setIsFlowListOpen(true)}
                onOpenFlowMap={() => setIsFlowMapOpen(true)}
                onOpenFlowSettings={() => setIsFlowSettingsOpen(true)}
                onRunAll={handleRunAll}
                isRunning={isRunning}
                runProgress={runProgress}
                nodeCount={nodeCount}
                onToggleSearch={() => {
                    setIsSearchOpen(prev => {
                        if (prev) setSearchQuery('');
                        return !prev;
                    });
                }}
                onExport={handleExport}
                onNew={permissions.canCreate ? () => setIsNewFlowSheetOpen(true) : undefined}
                onApiKeySettings={() => {
                    if (!useWebCoreStore.getState().apiKey && redirectToLogin()) return;
                    setIsApiKeyDialogOpen(true);
                }}
                role={role}
                onVersionClick={handleVersionClick}
                isDebugMode={isDebugMode}
                onDisableDebugMode={isDebugMode ? disableDebugMode : undefined}
            />

            <MobileFlowMap
                open={isFlowMapOpen}
                onClose={() => setIsFlowMapOpen(false)}
                onTapNode={nodeId => {
                    setIsFlowMapOpen(false);
                    stepNav.openStep(nodeId);
                }}
                flowId={currentFlowId}
            />

            {/* Step list — kept mounted when detail is open for scroll preservation */}
            <div
                className={cn(
                    'fixed inset-0 overflow-y-auto overscroll-contain pb-20',
                    isSearchOpen ? 'pt-[104px]' : 'pt-14'
                )}
                style={{ visibility: stepNav.isOpen ? 'hidden' : 'visible' }}
            >
                {/* Search bar */}
                {isSearchOpen && (
                    <div className="fixed top-14 left-0 right-0 z-20 bg-glass-bg backdrop-blur-2xl border-b border-border/30 px-3 py-2">
                        <div className="flex items-center gap-2 h-10 px-3 rounded-xl bg-muted/40 border border-border/40">
                            <Search className="w-4 h-4 text-muted-foreground/50 shrink-0" />
                            <input
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder={t('mobile.searchNodes', 'Search nodes...')}
                                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/40"
                                autoFocus
                            />
                            {searchQuery && (
                                <button onClick={() => setSearchQuery('')} className="shrink-0">
                                    <X className="w-4 h-4 text-muted-foreground/50" />
                                </button>
                            )}
                        </div>
                    </div>
                )}
                <div className="pt-2">
                    <MobileStepList
                        onTapCard={handleTapCard}
                        onExpandContent={setPreviewContent}
                        onAddStep={() => setIsBlockLibraryOpen(true)}
                        onAddBlockDirect={handleAddBlockWithRecent}
                        onRunNode={handleRunNode}
                        searchQuery={searchQuery}
                        role={role}
                    />
                </div>
            </div>

            {/* Full-screen step detail */}
            <MobileStepDetail
                nodeId={stepNav.activeNodeId}
                role={role}
                onRun={handleRunNode}
                onClose={handleCloseStep}
                onOpenOutputConnection={connectionMode.openForPort}
                onOpenInputConnection={connectionMode.openForInputPort}
                onOpenAiKeyDialog={showDevTools ? () => setIsAiKeyDialogOpen(true) : undefined}
            />

            {/* Bottom bar — Add Node, hidden when step detail is open */}
            {!stepNav.isOpen && <MobileBottomBar onAddNode={() => setIsBlockLibraryOpen(true)} role={role} />}

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
                    direction={connectionMode.direction}
                    onAddNewAndConnect={() => {
                        if (connectionMode.source) {
                            setPendingConnectSource({
                                nodeId: connectionMode.source.nodeId,
                                portId: connectionMode.source.portId,
                                portDataType: connectionMode.source.portDataType,
                                direction: connectionMode.direction,
                            });
                        }
                        connectionMode.close();
                        setIsBlockLibraryOpen(true);
                    }}
                    role={role}
                />
            )}

            <MobileBlockLibrarySheet
                open={isBlockLibraryOpen}
                onOpenChange={setIsBlockLibraryOpen}
                onAddBlock={handleAddBlockWithRecent}
                recentBlockIds={recentIds}
            />

            <FlowListDialog
                open={isFlowListOpen}
                onOpenChange={setIsFlowListOpen}
                currentFlowId={currentFlowId}
                onSelectFlow={handleSelectFlow}
                onNewFlow={() => {
                    setIsFlowListOpen(false);
                    setIsNewFlowSheetOpen(true);
                }}
            />

            <MobileNewFlowSheet
                open={isNewFlowSheetOpen}
                onOpenChange={setIsNewFlowSheetOpen}
                onCreate={handleCreateNewFlow}
                onNameChange={updateFlowName}
            />

            <MobileFlowSettingsSheet open={isFlowSettingsOpen} onOpenChange={setIsFlowSettingsOpen} role={role} />

            <ApiKeyDialog
                open={isApiKeyDialogOpen}
                onSubmit={handleApiKeySubmit}
                onOpenChange={setIsApiKeyDialogOpen}
                codesUrl={import.meta.env.VITE_CODES_URL}
                initialValue={apiKey ?? undefined}
            />

            {showDevTools && <AiKeyDialog open={isAiKeyDialogOpen} onOpenChange={setIsAiKeyDialogOpen} />}

            {/* Content Preview Modal — expand from card */}
            <ContentPreviewModal
                open={!!previewContent}
                onOpenChange={open => !open && setPreviewContent(null)}
                content={previewContent}
            />

            {/* Dev Role Toggle (hidden in production unless debug mode) */}
            {showDevTools && (
                <div className="fixed top-16 right-2 z-50 flex gap-0.5 bg-background/90 backdrop-blur border border-border rounded-lg p-0.5 text-[10px] font-mono">
                    {(['owner', 'editor', 'viewer', 'anonymous'] as FlowRole[]).map(r => (
                        <button
                            key={r}
                            onClick={() => setDevRoleOverride(r === computedRole ? null : r)}
                            className={`px-1.5 py-0.5 rounded transition-colors ${
                                role === r
                                    ? 'bg-primary text-primary-foreground'
                                    : 'text-muted-foreground hover:bg-muted'
                            }`}
                        >
                            {r.slice(0, 5)}
                        </button>
                    ))}
                    {isDebugMode && (
                        <button
                            onClick={disableDebugMode}
                            className="px-1 py-0.5 rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                            title="Exit debug mode"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    )}
                </div>
            )}

            {showDevTools && (
                <DevSocketPanel
                    compact
                    messages={socketRecorder.messages}
                    isRecording={socketRecorder.isRecording}
                    replayState={socketRecorder.replayState}
                    onToggleRecording={socketRecorder.toggleRecording}
                    onClear={socketRecorder.clear}
                    onReplay={msg => replayMessage(msg)}
                    onReplayFromIndex={fromIndex => {
                        resetAllNodesToIdle();
                        socketRecorder.startReplayFromIndex(fromIndex, replayMessage);
                    }}
                    onStopReplay={() => {
                        socketRecorder.stopReplaySequence();
                        resetAllNodesToIdle();
                    }}
                    onResetNodes={resetAllNodesToIdle}
                    onMarkReplayed={socketRecorder.markReplayed}
                />
            )}

            {isLoading && (
                <div className="fixed inset-0 bg-background/50 z-50 flex items-center justify-center backdrop-blur-sm">
                    <div className="flex flex-col items-center bg-glass-bg backdrop-blur-2xl border border-border/40 rounded-2xl p-6 shadow-floating">
                        <div className="w-8 h-8 border-2 border-border/40 border-t-primary rounded-full animate-spin mb-3" />
                        <span className="text-sm font-medium">{t('flowEditor.processing')}</span>
                    </div>
                </div>
            )}

            {isPublicMode && (
                <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 mb-[env(safe-area-inset-bottom)]">
                    <Button
                        size="sm"
                        className="shadow-lg gap-2"
                        onClick={() => {
                            if (isOAuthEnabled) {
                                window.location.href = `/auth/login?from=${encodeURIComponent(window.location.pathname)}`;
                                return;
                            }
                            setIsApiKeyDialogOpen(true);
                        }}
                    >
                        <KeyRound className="w-4 h-4" />
                        {t('flowEditor.signInToEdit', 'Sign in to edit')}
                    </Button>
                </div>
            )}
        </div>
    );
};
