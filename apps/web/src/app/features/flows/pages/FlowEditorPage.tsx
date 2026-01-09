import { useCallback, useEffect, useRef, useState } from 'react';

import { useBlocks, useFlows, useFlowsStore } from '@eureka/flows';

import { Header } from '../components/Header';
import { Sidebar } from '../components/Sidebar';
import { WorkflowCanvas } from '../components/WorkflowCanvas';
import { generateId } from '../utils';

import type { WorkflowCanvasRef } from '../components/WorkflowCanvas';

export const FlowEditorPage = () => {
    const canvasRef = useRef<WorkflowCanvasRef>(null);

    // Store state
    const { blockRegistry, isBlocksLoaded } = useFlowsStore();

    // Hooks
    const { loadBlocks } = useBlocks();
    const {
        currentFlowId,
        flowName,
        isLoading,
        isSaving,
        lastSavedAt,
        isAutoSaveEnabled,
        loadFlowById,
        loadFlowsList,
        saveCurrentFlow,
        createNewFlow,
        setFlowName,
        toggleAutoSave,
    } = useFlows();

    // Local state
    const [isAppReady, setIsAppReady] = useState(false);
    const [loadingText, setLoadingText] = useState('Initializing FlowMosaic Engine...');
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const autoSaveTimerRef = useRef<number | null>(null);

    // Helper to update URL state without reload
    const updateUrl = useCallback((flowId: string | null, nodeId?: string | null) => {
        try {
            let path = '/';
            if (flowId) path = `/flows/${flowId}`;
            const hash = nodeId ? `#${nodeId}` : '';
            const url = path + hash;

            if (window.location.pathname + window.location.hash !== url) {
                window.history.pushState({ flowId, nodeId }, '', url);
            }
        } catch (e) {
            // ignore
        }
    }, []);

    // Boot sequence
    useEffect(() => {
        const boot = async () => {
            try {
                setLoadingText('Loading Block Registry...');
                await loadBlocks();

                const pathParts = window.location.pathname.split('/');
                const flowIdFromUrl = pathParts.length > 2 && pathParts[1] === 'flows' ? pathParts[2] : null;
                const nodeIdFromHash = window.location.hash.replace('#', '') || null;

                setLoadingText(flowIdFromUrl ? `Loading Flow ${flowIdFromUrl}...` : 'Loading Default Flow...');

                let loadedId = flowIdFromUrl;
                const initialFlow = await loadFlowById(flowIdFromUrl || undefined);

                if (!flowIdFromUrl) {
                    loadedId = generateId();
                    createNewFlow(loadedId);
                }

                setIsAppReady(true);

                setTimeout(() => {
                    if (canvasRef.current && initialFlow) {
                        canvasRef.current.loadWorkflow(initialFlow);
                        updateUrl(loadedId, nodeIdFromHash);

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
    }, [loadBlocks, loadFlowById, createNewFlow, updateUrl]);

    // Auto save logic
    const triggerAutoSave = useCallback(() => {
        if (!isAutoSaveEnabled) return;

        if (autoSaveTimerRef.current) {
            window.clearTimeout(autoSaveTimerRef.current);
        }

        autoSaveTimerRef.current = window.setTimeout(() => {
            if (canvasRef.current) {
                const data = canvasRef.current.getWorkflow();
                saveCurrentFlow(data, true);
            }
        }, 2000);
    }, [isAutoSaveEnabled, saveCurrentFlow]);

    // Event handlers
    const showNotification = (message: string, type: 'success' | 'error') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 3000);
    };

    const handleSave = async () => {
        if (!canvasRef.current) return;
        const data = canvasRef.current.getWorkflow();
        const result = await saveCurrentFlow(data);
        if (result.success) {
            showNotification(`Saved as "${flowName}"`, 'success');
            if (result.id !== currentFlowId) {
                updateUrl(result.id, window.location.hash.replace('#', ''));
            }
        } else {
            showNotification('Failed to save workflow', 'error');
        }
    };

    const handleLoad = async () => {
        const flows = await loadFlowsList();
        if (flows.length === 0) {
            showNotification('No saved flows found', 'error');
            return;
        }

        const flowListStr = flows.map((f, i) => `${i + 1}. ${f.name} (ID: ${f.id})`).join('\n');
        const selection = prompt(`Enter number to load:\n${flowListStr}`);

        if (selection) {
            const index = parseInt(selection) - 1;
            if (flows[index]) {
                const flowId = flows[index].id;
                const data = await loadFlowById(flowId);
                if (canvasRef.current && data) {
                    canvasRef.current.loadWorkflow(data);
                    updateUrl(flowId, null);
                    showNotification(`Loaded "${flows[index].name}"`, 'success');
                }
            }
        }
    };

    const handleNew = () => {
        if (!canvasRef.current) return;
        if (confirm('Create new flow? Unsaved changes will be lost.')) {
            canvasRef.current.newWorkflow();
            const newId = generateId();
            createNewFlow(newId);
            updateUrl(newId, null);
            showNotification('New flow created', 'success');
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
            await saveCurrentFlow(data, true);
        }

        try {
            await navigator.clipboard.writeText(window.location.href);
            showNotification('Link copied to clipboard!', 'success');
        } catch (err) {
            showNotification('Failed to copy link', 'error');
        }
    };

    const handleClear = () => {
        if (!canvasRef.current) return;
        if (confirm('Clear the canvas?')) {
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

    // Loading screen
    if (!isAppReady) {
        return (
            <div className="flex h-screen bg-gray-950 text-white font-sans items-center justify-center flex-col gap-4">
                <div className="relative w-16 h-16">
                    <div className="absolute inset-0 border-4 border-gray-800 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-blue-500 rounded-full border-t-transparent animate-spin"></div>
                </div>
                <div className="text-gray-400 font-mono text-sm animate-pulse">{loadingText}</div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-gray-900 text-white font-sans overflow-hidden animate-in fade-in duration-500">
            <Header
                flowName={flowName}
                onNameChange={handleNameChange}
                onNew={handleNew}
                onLoad={handleLoad}
                onSave={handleSave}
                onExport={handleExport}
                onUndo={() => canvasRef.current?.undo()}
                onRedo={() => canvasRef.current?.redo()}
                onAutoLayout={() => {
                    canvasRef.current?.autoLayout();
                    showNotification('Auto-layout applied', 'success');
                }}
                onClear={handleClear}
                onShare={handleShare}
                isAutoSaveEnabled={isAutoSaveEnabled}
                onToggleAutoSave={toggleAutoSave}
                isSaving={isSaving}
                lastSavedAt={lastSavedAt}
            />

            <div className="flex flex-1 relative overflow-hidden">
                <Sidebar onAddNode={handleAddNode} isLoading={isLoading} />

                <div className="flex-1 relative h-full">
                    <WorkflowCanvas
                        ref={canvasRef}
                        onNodeSelect={handleSelectionChange}
                        onChange={handleCanvasChange}
                    />

                    {notification && (
                        <div
                            className={`absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded shadow-lg text-sm font-semibold animate-in slide-in-from-top-2 fade-in z-50 ${
                                notification.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                            }`}
                        >
                            {notification.message}
                        </div>
                    )}

                    {isLoading && (
                        <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
                            <div className="flex flex-col items-center">
                                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                                <span className="text-sm font-semibold">Processing...</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
