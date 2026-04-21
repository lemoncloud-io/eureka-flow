import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { ArrowRight, Globe, KeyRound, Lock, Search, ShieldX, X } from 'lucide-react';

import { useBlockRegistry, useCanvasStore, useFlows } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { ApiKeyDialog } from '@flows/shared';
import { Button } from '@flows/ui-kit';
import { useWebCoreStore } from '@flows/web-core';

import { AiKeyDialog } from '../../flows/components/AiKeyDialog';
import { FlowListDialog } from '../../flows/components/FlowListDialog';
import {
    MobileBlockLibrarySheet,
    MobileBottomBar,
    MobileConnectionSheet,
    MobileFlowMap,
    MobileHeader,
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

const serializeWorkflowState = (data: { nodes?: unknown[]; connections?: unknown[] }): string =>
    JSON.stringify({ nodes: data.nodes ?? [], connections: data.connections ?? [] });

export const MobileFlowEditorPage = () => {
    const { t } = useTranslation(['flows']);
    const { currentFlowId, flowName, isLoading, isSaving, saveStatus, updateFlowName, isEditable } = useFlows();
    const { apiKey } = useWebCoreStore();
    const blockRegistry = useBlockRegistry();
    const isPublicMode = !apiKey && window.location.pathname.startsWith('/flows/');
    const nodeCount = useCanvasStore(state => state.nodes.length);

    // Role derivation
    const computedRole: FlowRole = isPublicMode ? 'anonymous' : isEditable ? 'owner' : 'guest';
    const [devRoleOverride, setDevRoleOverride] = useState<FlowRole | null>(null);
    const role: FlowRole = devRoleOverride ?? computedRole;

    // Shared refs for cross-hook communication
    const lastSavedStateRef = useRef<string | null>(null);
    const lastLocalUpdateTimestampRef = useRef<number | null>(null);

    // UI state
    const [isFlowListOpen, setIsFlowListOpen] = useState(false);
    const [isBlockLibraryOpen, setIsBlockLibraryOpen] = useState(false);
    const [isFlowMapOpen, setIsFlowMapOpen] = useState(false);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isAiKeyDialogOpen, setIsAiKeyDialogOpen] = useState(false);

    // Step navigation (replaces configNodeId)
    const stepNav = useStepNavigation();

    // Hooks
    const {
        isAppReady,
        loadingText,
        bootError,
        isApiKeyDialogOpen,
        setIsApiKeyDialogOpen,
        handleApiKeySubmit,
        reBoot,
        updateUrl,
    } = useMobileEditorBoot({ serializeWorkflowState, lastSavedStateRef });

    useMobileAutoSave({
        isAppReady,
        canSave: role === 'owner',
        serializeWorkflowState,
        lastSavedStateRef,
        lastLocalUpdateTimestampRef,
    });

    const { isSocketConnected, socketConnectionId } = useMobileSocketSync({
        serializeWorkflowState,
        lastSavedStateRef,
        lastLocalUpdateTimestampRef,
        canEdit: role === 'owner',
    });

    const { runProgress, isRunning, handleRunAll } = useMobileRunAll();

    const { handleSave, handleSelectFlow, handleAddBlock, handleExport, handleNew, handleClear } = useMobileFlowActions(
        {
            updateUrl,
            serializeWorkflowState,
            lastSavedStateRef,
            lastLocalUpdateTimestampRef,
        }
    );

    const connectionMode = useConnectionMode(blockRegistry, currentFlowId);
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

    const handleRunNode = useCallback(
        (nodeId: string) => {
            executeNodeWithToast(nodeId, {
                flowId: currentFlowId,
                socketConnectionId,
                canEdit: role === 'owner',
            });
        },
        [currentFlowId, socketConnectionId, role]
    );

    const handleAddBlockWithRecent = useCallback(
        async (type: string) => {
            addRecent(type);
            const newNodeId = await handleAddBlock(type);

            // Auto-connect if there's a pending connection source
            if (newNodeId && pendingConnectSource) {
                const newNodeDef = blockRegistry[type];
                const srcType = pendingConnectSource.portDataType;
                const isCompatible = (portType: string | undefined) => {
                    const t = portType ?? 'any';
                    return srcType === 'any' || t === 'any' || srcType.toLowerCase() === t.toLowerCase();
                };

                if (pendingConnectSource.direction === 'output') {
                    // Original node's output → new block's input
                    const compatibleInput = newNodeDef?.inputs?.find(p => isCompatible(p.type));
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
                    const compatibleOutput = newNodeDef?.outputs?.find(p => isCompatible(p.type));
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
            }
        },
        [addRecent, handleAddBlock, pendingConnectSource, blockRegistry, connectionMode]
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
                onNew={role === 'owner' ? handleNew : undefined}
                onClear={role === 'owner' ? handleClear : undefined}
                onApiKeySettings={() => setIsApiKeyDialogOpen(true)}
                role={role}
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
                    <div className="fixed top-14 left-0 right-0 z-20 bg-background/95 backdrop-blur-md border-b border-border/40 px-3 py-2">
                        <div className="flex items-center gap-2 h-10 px-3 rounded-xl bg-muted/40 border border-border/50">
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
                        onAddStep={() => setIsBlockLibraryOpen(true)}
                        onAddBlockDirect={handleAddBlockWithRecent}
                        onRunNode={handleRunNode}
                        flowId={currentFlowId}
                        searchQuery={searchQuery}
                        role={role}
                    />
                </div>
            </div>

            {/* Full-screen step detail */}
            <MobileStepDetail
                nodeId={stepNav.activeNodeId}
                flowId={currentFlowId}
                socketConnectionId={socketConnectionId}
                role={role}
                onClose={stepNav.closeStep}
                onOpenOutputConnection={connectionMode.openForPort}
                onOpenInputConnection={connectionMode.openForInputPort}
                onOpenAiKeyDialog={() => setIsAiKeyDialogOpen(true)}
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
                onNewFlow={handleNew}
            />

            <ApiKeyDialog
                open={isApiKeyDialogOpen}
                onSubmit={handleApiKeySubmit}
                onOpenChange={setIsApiKeyDialogOpen}
                codesUrl={import.meta.env.VITE_CODES_URL}
                initialValue={apiKey ?? undefined}
            />

            <AiKeyDialog open={isAiKeyDialogOpen} onOpenChange={setIsAiKeyDialogOpen} />

            {/* Dev Role Toggle (hidden in production) */}
            {import.meta.env.VITE_ENV !== 'PROD' && (
                <div className="fixed top-16 right-2 z-50 flex gap-0.5 bg-background/90 backdrop-blur border border-border rounded-lg p-0.5 text-[10px] font-mono">
                    {(['owner', 'guest', 'anonymous'] as FlowRole[]).map(r => (
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
                </div>
            )}

            {isLoading && (
                <div className="fixed inset-0 bg-background/50 z-50 flex items-center justify-center backdrop-blur-sm">
                    <div className="flex flex-col items-center bg-glass-bg backdrop-blur-[24px] border border-glass-border rounded-2xl p-6 shadow-floating">
                        <div className="w-8 h-8 border-2 border-border/40 border-t-primary rounded-full animate-spin mb-3" />
                        <span className="text-sm font-medium">{t('flowEditor.processing')}</span>
                    </div>
                </div>
            )}

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
