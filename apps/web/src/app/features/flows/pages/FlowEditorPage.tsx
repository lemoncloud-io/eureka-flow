import { useCallback, useEffect, useRef, useState } from 'react';

import { useBlocks, useFlows } from '@flows/flows';

import { Header } from '../components/Header';
import { Sidebar } from '../components/Sidebar';
import { WorkflowCanvas } from '../components/WorkflowCanvas';

import type { WorkflowCanvasRef } from '../components/WorkflowCanvas';

const serializeWorkflowState = (data: { nodes?: unknown[]; connections?: unknown[]; edges?: unknown[] }): string =>
    JSON.stringify({ nodes: data.nodes ?? [], connections: data.connections ?? data.edges ?? [] });

const isInputElement = (target: EventTarget | null): boolean => {
    if (!target || !(target instanceof HTMLElement)) return false;
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
};

export const FlowEditorPage = () => {
    const canvasRef = useRef<WorkflowCanvasRef>(null);

    const { loadBlocks } = useBlocks();
    const {
        currentFlowId,
        flowName,
        isLoading,
        isSaving,
        lastSavedAt,
        isAutoSaveEnabled,
        saveStatus,
        saveError,
        initializeFlow,
        loadFlowById,
        saveCurrentFlow,
        createNewFlow,
        retrySave,
        setFlowName,
        toggleAutoSave,
    } = useFlows();

    const [isAppReady, setIsAppReady] = useState(false);
    const [loadingText, setLoadingText] = useState('Initializing FlowMosaic Engine...');
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const autoSaveTimerRef = useRef<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const lastSavedStateRef = useRef<string | null>(null);

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
            try {
                setLoadingText('Loading Block Registry...');
                await loadBlocks();

                const pathParts = window.location.pathname.split('/');
                const flowIdFromUrl = pathParts.length > 2 && pathParts[1] === 'flows' ? pathParts[2] : null;
                const nodeIdFromHash = window.location.hash.replace('#', '') || null;

                let loadedId: string | null = null;
                let initialFlow = null;

                if (flowIdFromUrl) {
                    setLoadingText(`Loading Flow ${flowIdFromUrl}...`);
                    initialFlow = await loadFlowById(flowIdFromUrl);
                    loadedId = flowIdFromUrl;
                } else {
                    setLoadingText('Initializing Flow...');
                    const result = await initializeFlow();
                    loadedId = result.flowId;
                    initialFlow = result.flowData;

                    if (result.isNew) {
                        setLoadingText('Created new flow');
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
                setLoadingText('Error loading application. Please refresh.');
                console.error(e);
            }
        };

        boot();
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
        const result = await saveCurrentFlow(data);
        if (result.success) {
            lastSavedStateRef.current = serializeWorkflowState(data);
            showNotification(`Saved as "${flowName}"`, 'success');
            if (result.id !== currentFlowId) {
                updateUrl(result.id, window.location.hash.replace('#', ''));
            }
        } else {
            showNotification('Failed to save workflow', 'error');
        }
    };

    const handleLoad = async () => {
        const flowId = prompt('Enter flow ID to load:');

        if (flowId && flowId.trim()) {
            const data = await loadFlowById(flowId.trim());
            if (canvasRef.current && data) {
                canvasRef.current.loadWorkflow(data);
                lastSavedStateRef.current = serializeWorkflowState(data);
                updateUrl(flowId.trim(), null);
                showNotification(`Loaded flow: ${flowId.trim()}`, 'success');
            } else {
                showNotification('Failed to load flow', 'error');
            }
        }
    };

    const handleNew = async () => {
        if (!canvasRef.current) return;
        if (window.confirm('Create new flow? Unsaved changes will be lost.')) {
            canvasRef.current.newWorkflow();
            lastSavedStateRef.current = serializeWorkflowState({ nodes: [], connections: [] });
            const newId = await createNewFlow();
            if (newId) {
                updateUrl(newId, null);
                showNotification('New flow created', 'success');
            } else {
                showNotification('Failed to create new flow', 'error');
            }
        }
    };

    const handleNameChange = (newName: string) => {
        setFlowName(newName);
        if (isAutoSaveEnabled) {
            triggerAutoSave();
        }
    };

    const handleShare = async () => {
        if (canvasRef.current) {
            const data = canvasRef.current.getWorkflow();
            await saveCurrentFlow(data);
        }

        try {
            await navigator.clipboard.writeText(window.location.href);
            showNotification('Link copied to clipboard!', 'success');
        } catch (_err) {
            showNotification('Failed to copy link', 'error');
        }
    };

    const handleClear = () => {
        if (!canvasRef.current) return;
        if (window.confirm('Clear the canvas?')) {
            canvasRef.current.clearWorkflow();
            showNotification('Canvas cleared', 'success');
        }
    };

    const handleAddNode = useCallback((type: string) => {
        canvasRef.current?.addNode(type);
    }, []);

    const handleSelectionChange = (nodeId: string | null) => {
        updateUrl(currentFlowId, nodeId);
    };

    const handleCanvasChange = () => {
        triggerAutoSave();
    };

    const handleBeforeBackendRun = useCallback(async () => {
        if (!canvasRef.current) return;
        const data = canvasRef.current.getWorkflow();
        const result = await saveCurrentFlow(data);
        if (result.success) {
            lastSavedStateRef.current = serializeWorkflowState(data);
        }
    }, [saveCurrentFlow]);

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

        showNotification('Exported to JSON', 'success');
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
                if (canvasRef.current && json.nodes && json.connections) {
                    canvasRef.current.loadWorkflow(json);
                    lastSavedStateRef.current = null;
                    showNotification('Workflow imported successfully', 'success');
                } else {
                    showNotification('Invalid workflow file', 'error');
                }
            } catch (_err) {
                showNotification('Failed to parse JSON file', 'error');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const handleRunAll = async () => {
        if (!canvasRef.current) return;
        setIsRunning(true);
        showNotification('Running all nodes...', 'success');
        try {
            await canvasRef.current.runAll();
        } finally {
            setIsRunning(false);
        }
    };

    const handleStopAll = () => {
        if (!canvasRef.current) return;
        setIsRunning(false);
        canvasRef.current.stopAll();
        showNotification('Execution stopped', 'success');
    };

    const handlersRef = useRef({
        save: handleSave,
        load: handleLoad,
        new: handleNew,
        export: handleExport,
        showNotification,
    });
    handlersRef.current = {
        save: handleSave,
        load: handleLoad,
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
            } else if (key === 'o') {
                e.preventDefault();
                handlersRef.current.load();
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
                handlersRef.current.showNotification('Auto-layout applied', 'success');
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
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
        <div className="flex flex-col h-screen bg-background text-foreground font-sans overflow-hidden animate-in fade-in duration-500">
            <Header
                flowInfo={{
                    flowName,
                    onNameChange: handleNameChange,
                }}
                fileActions={{
                    onNew: handleNew,
                    onLoad: handleLoad,
                    onSave: handleSave,
                    onExport: handleExport,
                    onImport: handleImport,
                }}
                editActions={{
                    onUndo: () => canvasRef.current?.undo(),
                    onRedo: () => canvasRef.current?.redo(),
                    onAutoLayout: () => {
                        canvasRef.current?.autoLayout();
                        showNotification('Auto-layout applied', 'success');
                    },
                    onClear: handleClear,
                }}
                executionActions={{
                    onRunAll: handleRunAll,
                    onStopAll: handleStopAll,
                    isRunning,
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
                onShare={handleShare}
            />

            <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileChange} />

            <div className="flex flex-1 relative overflow-hidden">
                <Sidebar onAddNode={handleAddNode} isLoading={isLoading} />

                <div className="flex-1 relative h-full">
                    <WorkflowCanvas
                        ref={canvasRef}
                        onNodeSelect={handleSelectionChange}
                        onChange={handleCanvasChange}
                        onBeforeBackendRun={handleBeforeBackendRun}
                    />

                    {notification && (
                        <div
                            className={`absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded shadow-lg text-sm font-semibold animate-in slide-in-from-top-2 fade-in z-50 ${
                                notification.type === 'success'
                                    ? 'bg-success text-success-foreground'
                                    : 'bg-destructive text-destructive-foreground'
                            }`}
                        >
                            {notification.message}
                        </div>
                    )}

                    {isLoading && (
                        <div className="absolute inset-0 bg-background/50 z-50 flex items-center justify-center backdrop-blur-sm">
                            <div className="flex flex-col items-center">
                                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-2"></div>
                                <span className="text-sm font-semibold text-foreground">Processing...</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
