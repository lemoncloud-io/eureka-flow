import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { ArrowRight, Globe, KeyRound, Lock, ShieldX } from 'lucide-react';

import { useBlockRegistry, useCanvasStore, useFlows } from '@flows/flows';
import { ApiKeyDialog } from '@flows/shared';
import { Button } from '@flows/ui-kit';
import { useWebCoreStore } from '@flows/web-core';

import { FlowListDialog } from '../../flows/components/FlowListDialog';
import {
    MobileBlockLibrarySheet,
    MobileBottomBar,
    MobileConnectionSheet,
    MobileFlowMap,
    MobileHeader,
    MobileNodeConfigSheet,
    MobileNodeList,
} from '../components';
import {
    useConnectionMode,
    useMobileAutoSave,
    useMobileEditorBoot,
    useMobileFlowActions,
    useMobileRunAll,
    useMobileSocketSync,
} from '../hooks';
import { useCollapseState } from '../hooks/useCollapseState';
import { useRecentBlocks } from '../hooks/useRecentBlocks';
import { useScrollRestore } from '../hooks/useScrollRestore';

const serializeWorkflowState = (data: { nodes?: unknown[]; connections?: unknown[] }): string =>
    JSON.stringify({ nodes: data.nodes ?? [], connections: data.connections ?? [] });

export const MobileFlowEditorPage = () => {
    const { t } = useTranslation(['flows']);
    const { currentFlowId, flowName, isLoading, isSaving, saveStatus, updateFlowName } = useFlows();
    const { apiKey } = useWebCoreStore();
    const blockRegistry = useBlockRegistry();
    const isPublicMode = !apiKey && window.location.pathname.startsWith('/flows/');
    const nodeCount = useCanvasStore(state => state.nodes.length);

    // Shared refs for cross-hook communication
    const lastSavedStateRef = useRef<string | null>(null);
    const lastLocalUpdateTimestampRef = useRef<number | null>(null);

    // Scroll container ref for scroll restoration
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // UI state
    const [isFlowListOpen, setIsFlowListOpen] = useState(false);
    const [isBlockLibraryOpen, setIsBlockLibraryOpen] = useState(false);
    const [isFlowMapOpen, setIsFlowMapOpen] = useState(false);
    const [configNodeId, setConfigNodeId] = useState<string | null>(null);

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
        isPublicMode,
        serializeWorkflowState,
        lastSavedStateRef,
        lastLocalUpdateTimestampRef,
    });

    const { isSocketConnected, socketConnectionId } = useMobileSocketSync({
        serializeWorkflowState,
        lastSavedStateRef,
        lastLocalUpdateTimestampRef,
    });

    const { runProgress, isRunning, handleRunAll } = useMobileRunAll({ socketConnectionId });

    const { handleSave, handleSelectFlow, handleAddBlock, handleExport, handleNew, handleClear } = useMobileFlowActions(
        {
            updateUrl,
            serializeWorkflowState,
            lastSavedStateRef,
            lastLocalUpdateTimestampRef,
        }
    );

    const connectionMode = useConnectionMode(blockRegistry, currentFlowId);
    const { collapsedNodes, toggleCollapse, collapseAll, expandAll, isAllCollapsed } = useCollapseState();
    const { recentIds, addRecent } = useRecentBlocks();

    const isAnySheetOpen = configNodeId !== null || isBlockLibraryOpen || connectionMode.isOpen;
    useScrollRestore(scrollContainerRef, isAnySheetOpen);

    const handleTapCard = useCallback((nodeId: string) => {
        setConfigNodeId(nodeId);
    }, []);

    const handleAddBlockWithRecent = useCallback(
        async (type: string) => {
            addRecent(type);
            await handleAddBlock(type);
        },
        [addRecent, handleAddBlock]
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
            <MobileHeader
                flowName={flowName}
                onNameChange={updateFlowName}
                saveStatus={saveStatus}
                isSaving={isSaving}
                isSocketConnected={isSocketConnected}
                onSave={handleSave}
                onOpenFlowList={() => setIsFlowListOpen(true)}
                onOpenFlowMap={() => setIsFlowMapOpen(true)}
                onExport={isPublicMode ? undefined : handleExport}
                onNew={isPublicMode ? undefined : handleNew}
                onClear={isPublicMode ? undefined : handleClear}
                onApiKeySettings={() => setIsApiKeyDialogOpen(true)}
            />

            <MobileFlowMap
                open={isFlowMapOpen}
                onClose={() => setIsFlowMapOpen(false)}
                onTapNode={nodeId => {
                    setIsFlowMapOpen(false);
                    setConfigNodeId(nodeId);
                }}
                flowId={currentFlowId}
            />

            <div ref={scrollContainerRef} className="fixed inset-0 overflow-y-auto overscroll-contain pt-14 pb-24">
                <div className="pt-2">
                    <MobileNodeList
                        onTapCard={handleTapCard}
                        onTapOutputPort={connectionMode.openForPort}
                        socketConnectionId={socketConnectionId}
                        selectedNodeId={configNodeId}
                        isReadOnly={isPublicMode}
                        flowId={currentFlowId}
                        collapsedNodes={collapsedNodes}
                        onToggleCollapse={toggleCollapse}
                    />
                </div>
            </div>

            <MobileBottomBar
                onAddBlock={() => setIsBlockLibraryOpen(true)}
                onRunAll={handleRunAll}
                isRunning={isRunning}
                progress={runProgress}
                isReadOnly={isPublicMode}
                nodeCount={nodeCount}
                isAllCollapsed={isAllCollapsed}
                onToggleCollapseAll={isAllCollapsed ? expandAll : collapseAll}
            />

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

            <MobileBlockLibrarySheet
                open={isBlockLibraryOpen}
                onOpenChange={setIsBlockLibraryOpen}
                onAddBlock={handleAddBlockWithRecent}
                recentBlockIds={recentIds}
            />

            <MobileNodeConfigSheet
                open={configNodeId !== null}
                onOpenChange={open => {
                    if (!open) setConfigNodeId(null);
                }}
                nodeId={configNodeId}
                flowId={currentFlowId}
                socketConnectionId={socketConnectionId}
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

            {isLoading && (
                <div className="fixed inset-0 bg-background/50 z-50 flex items-center justify-center backdrop-blur-sm">
                    <div className="flex flex-col items-center bg-glass-bg backdrop-blur-[24px] border border-glass-border rounded-2xl p-6 shadow-floating">
                        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-3" />
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
