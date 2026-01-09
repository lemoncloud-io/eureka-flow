import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import { WorkflowCanvas, WorkflowCanvasRef } from '../components/WorkflowCanvas';
import { api, FlowMeta } from '../api';
import { initBlockRegistry } from '../constants';
import { generateId } from '../utils/';

const App: React.FC = () => {
  const canvasRef = useRef<WorkflowCanvasRef>(null);

  // App Initialization State
  const [isAppReady, setIsAppReady] = useState(false);
  const [loadingText, setLoadingText] = useState('Initializing FlowMosaic Engine...');
  const [currentFlowId, setCurrentFlowId] = useState<string | null>(null);
  const [flowName, setFlowName] = useState("Untitled Workflow");

  // Runtime State
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false); // For AutoSave indicator
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Auto Save State
  const [isAutoSaveEnabled, setIsAutoSaveEnabled] = useState(false);
  const autoSaveTimerRef = useRef<number | null>(null);

  // Helper to update URL state without reload
  const _updateUrl = (flowId: string | null, nodeId?: string | null) => {
      let path = '/';
      if (flowId) path = `/flows/${flowId}`;

      const hash = nodeId ? `#${nodeId}` : '';
      const url = path + hash;

      if (window.location.pathname + window.location.hash !== url) {
        window.history.pushState({ flowId, nodeId }, '', url);
      }
  };
  const updateUrl = (flowId: string | null, nodeId?: string | null) => {
    try{
      return _updateUrl(flowId, nodeId);
    }catch(e){
      //ignore.
    }
  }

  // --- 1. BOOT SEQUENCE & ROUTING ---
  useEffect(() => {
    const boot = async () => {
        try {
            // Step 1: Load Block Definitions
            setLoadingText('Loading Block Registry...');
            const blocks = await api.listBlocks();
            initBlockRegistry(blocks);

            // Step 2: Parse URL for Deep Linking
            const pathParts = window.location.pathname.split('/');
            const flowIdFromUrl = pathParts.length > 2 && pathParts[1] === 'flows' ? pathParts[2] : null;
            const nodeIdFromHash = window.location.hash.replace('#', '') || null;

            setLoadingText(flowIdFromUrl ? `Loading Flow ${flowIdFromUrl}...` : 'Loading Default Flow...');

            // Step 3: Load Flow Data
            let initialFlow;
            let loadedId = flowIdFromUrl;

            // Fetch flow metadata to get name
            const flows = await api.listFlows();

            if (flowIdFromUrl) {
                initialFlow = await api.loadFlow(flowIdFromUrl);
                const meta = flows.find(f => f.id === flowIdFromUrl);
                if (meta) setFlowName(meta.name);
            } else {
                initialFlow = await api.loadFlow();
                loadedId = generateId();
                // Default name for new session
            }

            // Step 4: Ready
            setCurrentFlowId(loadedId);
            setIsAppReady(true);

            // Step 5: Initialize Canvas
            setTimeout(() => {
                if (canvasRef.current) {
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

    const handlePopState = async () => {
        const pathParts = window.location.pathname.split('/');
        const flowId = pathParts.length > 2 && pathParts[1] === 'flows' ? pathParts[2] : null;
        const nodeId = window.location.hash.replace('#', '') || null;

        if (flowId && flowId !== currentFlowId) {
            setLoading(true);
            const flow = await api.loadFlow(flowId);
            const flows = await api.listFlows();
            const meta = flows.find(f => f.id === flowId);
            if (meta) setFlowName(meta.name);

            if (canvasRef.current) {
                canvasRef.current.loadWorkflow(flow);
                canvasRef.current.selectNode(nodeId);
            }
            setCurrentFlowId(flowId);
            setLoading(false);
        } else if (canvasRef.current) {
            canvasRef.current.selectNode(nodeId);
        }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // --- CORE ACTIONS ---

  const performSave = async (silent = false) => {
      if (!canvasRef.current) return;
      if (!silent) setLoading(true);
      else setSaving(true);

      const data = canvasRef.current.getWorkflow();
      const saveId = currentFlowId || generateId();

      const result = await api.saveFlow(data, flowName);

      if (result.success) {
          setLastSavedAt(new Date());
          if (!silent) showNotification(`Saved as "${flowName}"`, 'success');

          if (result.id !== currentFlowId) {
              setCurrentFlowId(result.id);
              updateUrl(result.id, window.location.hash.replace('#',''));
          }
      } else {
          if (!silent) showNotification("Failed to save workflow", 'error');
      }

      if (!silent) setLoading(false);
      else setTimeout(() => setSaving(false), 500); // Visual delay for quick saves
  };

  // --- AUTO SAVE LOGIC ---

  const triggerAutoSave = useCallback(() => {
      if (!isAutoSaveEnabled) return;

      if (autoSaveTimerRef.current) {
          window.clearTimeout(autoSaveTimerRef.current);
      }

      autoSaveTimerRef.current = window.setTimeout(() => {
          performSave(true);
      }, 2000); // 2 second debounce
  }, [isAutoSaveEnabled, flowName, currentFlowId]);

  // Handle flow name change triggers save (if autosave on)
  const handleNameChange = (newName: string) => {
      setFlowName(newName);
      if (isAutoSaveEnabled) {
          // Trigger faster autosave for name changes
          if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = window.setTimeout(() => performSave(true), 500);
      }
  };

  // --- EVENT HANDLERS ---

  const handleSelectionChange = (nodeId: string | null) => {
      updateUrl(currentFlowId, nodeId);
  };

  const handleCanvasChange = () => {
      triggerAutoSave();
  };

  const handleAddNode = useCallback((type: string) => {
      if (canvasRef.current) {
          canvasRef.current.addNode(type);
      }
  }, []);

  const handleSave = () => performSave(false);

  const handleLoad = async () => {
      const flows = await api.listFlows();
      if (flows.length === 0) {
          showNotification("No saved flows found", 'error');
          return;
      }

      const flowListStr = flows.map((f, i) => `${i + 1}. ${f.name} (ID: ${f.id})`).join('\n');
      const selection = prompt(`Enter number to load:\n${flowListStr}`);

      if (selection) {
          const index = parseInt(selection) - 1;
          if (flows[index]) {
              setLoading(true);
              const flowId = flows[index].id;
              const data = await api.loadDesign(flowId);
              if (canvasRef.current) {
                  canvasRef.current.loadWorkflow(data);
                  setCurrentFlowId(flowId);
                  setFlowName(flows[index].name);
                  updateUrl(flowId, null);
                  showNotification(`Loaded "${flows[index].name}"`, 'success');
              }
              setLoading(false);
          }
      }
  };

  const handleNew = () => {
    if (!canvasRef.current) return;
    if (confirm("Create new flow? Unsaved changes will be lost.")) {
        canvasRef.current.newWorkflow();
        const newId = generateId();
        setCurrentFlowId(newId);
        setFlowName("Untitled Workflow");
        setLastSavedAt(null);
        updateUrl(newId, null);
        showNotification("New flow created", 'success');
    }
  };

  const handleShare = async () => {
      // Force save before share if changed
      await performSave(true);

      const url = window.location.href;
      try {
          await navigator.clipboard.writeText(url);
          showNotification("Link copied to clipboard!", "success");
      } catch (err) {
          showNotification("Failed to copy link", "error");
      }
  };

  const handleClear = async () => {
      if (!canvasRef.current) return;
      if (confirm("Clear the canvas?")) {
          setLoading(true);
          canvasRef.current.clearWorkflow();
          showNotification("Canvas cleared", 'success');
          setLoading(false);
      }
  };

  const handleUndo = () => canvasRef.current?.undo();
  const handleRedo = () => canvasRef.current?.redo();
  const handleAutoLayout = () => {
      canvasRef.current?.autoLayout();
      showNotification("Auto-layout applied", 'success');
  };

  const handleExport = () => {
      if (!canvasRef.current) return;

      const data = canvasRef.current.getWorkflow();
      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `${flowName.replace(/\s+/g, '-').toLowerCase()}-${currentFlowId || Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showNotification("Exported to JSON", 'success');
  };

  const showNotification = (message: string, type: 'success' | 'error') => {
      setNotification({ message, type });
      setTimeout(() => setNotification(null), 3000);
  };

  // --- RENDER ---

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
        onUndo={handleUndo}
        onRedo={handleRedo}
        onAutoLayout={handleAutoLayout}
        onClear={handleClear}
        onShare={handleShare}
        isAutoSaveEnabled={isAutoSaveEnabled}
        onToggleAutoSave={() => setIsAutoSaveEnabled(!isAutoSaveEnabled)}
        isSaving={saving}
        lastSavedAt={lastSavedAt}
      />

      <div className="flex flex-1 relative overflow-hidden">
          <Sidebar
            onAddNode={handleAddNode}
            isLoading={loading}
          />

          <div className="flex-1 relative h-full">
              <WorkflowCanvas
                ref={canvasRef}
                onNodeSelect={handleSelectionChange}
                onChange={handleCanvasChange}
              />

              {/* Notification Toast */}
              {notification && (
                  <div className={`absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded shadow-lg text-sm font-semibold animate-in slide-in-from-top-2 fade-in z-50 ${
                      notification.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                  }`}>
                      {notification.message}
                  </div>
              )}

              {/* Loading Overlay (for manual loads) */}
              {loading && (
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

export default App;
