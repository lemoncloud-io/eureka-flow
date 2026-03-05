/**
 * FlowExamplesPage - Demo page for flow examples
 *
 * Features:
 * - Works without API authentication
 * - Hardcoded block definitions and example workflows
 * - JSON export/import functionality
 * - No node execution (demo only)
 */
import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Download, FileJson, LayoutGrid, Plus, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@flows/lib/utils';
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@flows/ui-kit';

import { Sidebar } from '../components/Sidebar';
import { WorkflowCanvas } from '../components/WorkflowCanvas';
import { useDemoMode } from '../hooks/useDemoMode';

import type { SidebarRef } from '../components/Sidebar';
import type { WorkflowCanvasRef } from '../components/WorkflowCanvas';

export const FlowExamplesPage = () => {
    const { t } = useTranslation(['flows']);
    const canvasRef = useRef<WorkflowCanvasRef>(null);
    const sidebarRef = useRef<SidebarRef>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const {
        isInitialized,
        workflows,
        selectedWorkflowId,
        currentWorkflow,
        selectWorkflow,
        exportWorkflow,
        importWorkflow,
        clearWorkflow,
    } = useDemoMode();

    // Load workflow into canvas when selected
    useEffect(() => {
        if (currentWorkflow && canvasRef.current) {
            canvasRef.current.loadWorkflow({
                nodes: currentWorkflow.nodes,
                edges: currentWorkflow.edges,
            });
        }
    }, [currentWorkflow]);

    // Handle adding a node from sidebar
    const handleAddNode = useCallback((type: string) => {
        if (canvasRef.current) {
            canvasRef.current.addNode(type);
        }
    }, []);

    // Handle export
    const handleExport = useCallback(() => {
        if (canvasRef.current) {
            const workflow = canvasRef.current.getWorkflow();
            exportWorkflow(workflow.nodes, workflow.edges ?? []);
            toast.success(t('flows:demo.exportSuccess', 'Workflow exported successfully'));
        }
    }, [exportWorkflow, t]);

    // Handle import
    const handleImportClick = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const handleFileChange = useCallback(
        async (event: React.ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            if (!file) return;

            const result = await importWorkflow(file);
            if (result && canvasRef.current) {
                canvasRef.current.loadWorkflow(result);
                toast.success(t('flows:demo.importSuccess', 'Workflow imported successfully'));
            } else {
                toast.error(t('flows:demo.importError', 'Failed to import workflow'));
            }

            // Reset file input
            event.target.value = '';
        },
        [importWorkflow, t]
    );

    // Handle new workflow
    const handleNewWorkflow = useCallback(() => {
        clearWorkflow();
        if (canvasRef.current) {
            canvasRef.current.clearWorkflow();
        }
    }, [clearWorkflow]);

    // Open sidebar (called from empty state)
    const handleOpenLibrary = useCallback(() => {
        sidebarRef.current?.open();
    }, []);

    // Handle auto layout
    const handleAutoLayout = useCallback(() => {
        if (canvasRef.current) {
            canvasRef.current.autoLayout();
            toast.success(t('flows:flowEditor.autoLayoutApplied', 'Auto layout applied'));
        }
    }, [t]);

    if (!isInitialized) {
        return (
            <div className="flex h-screen items-center justify-center bg-background">
                <div className="text-muted-foreground">Loading demo...</div>
            </div>
        );
    }

    return (
        <div className="relative h-screen bg-canvas text-foreground font-sans overflow-hidden">
            {/* Hidden file input */}
            <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileChange} />

            {/* Full-screen Canvas */}
            <div className="absolute inset-0">
                <WorkflowCanvas
                    ref={canvasRef}
                    flowId={null}
                    onOpenLibrary={handleOpenLibrary}
                    onConnectionError={error => {
                        if (error === 'cycle') {
                            toast.error(t('flows:errors.cycleDetected', 'Cannot create circular connection'));
                        } else if (error === 'invalid_type') {
                            toast.error(t('flows:errors.invalidType', 'Incompatible port types'));
                        }
                    }}
                />
            </div>

            {/* Floating Header */}
            <header className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 rounded-xl bg-glass-bg backdrop-blur-[24px] border border-glass-border px-4 py-2 shadow-floating">
                <div className="flex items-center gap-3 border-r border-border pr-3">
                    <h1 className="text-sm font-semibold">Flow Examples</h1>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">Demo</span>
                </div>

                {/* Example Selector */}
                <Select value={selectedWorkflowId ?? ''} onValueChange={selectWorkflow}>
                    <SelectTrigger className="w-[180px] h-8 text-sm">
                        <SelectValue placeholder={t('flows:demo.selectExample', 'Select example...')} />
                    </SelectTrigger>
                    <SelectContent>
                        {workflows.map(workflow => (
                            <SelectItem key={workflow.id} value={workflow.id}>
                                <div className="flex items-center gap-2">
                                    <span>{workflow.name}</span>
                                    <span
                                        className={cn(
                                            'text-xs px-1.5 py-0.5 rounded',
                                            workflow.difficulty === 'beginner' && 'bg-green-500/10 text-green-600',
                                            workflow.difficulty === 'intermediate' &&
                                                'bg-yellow-500/10 text-yellow-600',
                                            workflow.difficulty === 'advanced' && 'bg-red-500/10 text-red-600'
                                        )}
                                    >
                                        {workflow.difficulty}
                                    </span>
                                </div>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <div className="flex items-center gap-1 border-l border-border pl-3">
                    {/* New Workflow */}
                    <Button variant="ghost" size="sm" onClick={handleNewWorkflow} className="h-8 px-2">
                        <Plus className="h-4 w-4" />
                    </Button>

                    {/* Auto Layout */}
                    <Button variant="ghost" size="sm" onClick={handleAutoLayout} className="h-8 px-2">
                        <LayoutGrid className="h-4 w-4" />
                    </Button>

                    {/* Import */}
                    <Button variant="ghost" size="sm" onClick={handleImportClick} className="h-8 px-2">
                        <Upload className="h-4 w-4" />
                    </Button>

                    {/* Export */}
                    <Button variant="ghost" size="sm" onClick={handleExport} className="h-8 px-2">
                        <Download className="h-4 w-4" />
                    </Button>
                </div>
            </header>

            {/* Floating Sidebar */}
            <Sidebar ref={sidebarRef} onAddNode={handleAddNode} isLoading={false} />

            {/* Demo Mode Notice */}
            <div className="absolute bottom-4 left-4 z-10 rounded-lg bg-glass-bg backdrop-blur-[24px] border border-glass-border px-3 py-2 text-xs text-muted-foreground shadow-floating">
                <FileJson className="mr-1.5 inline-block h-3.5 w-3.5" />
                {t('flows:demo.notice', 'Demo mode - changes are not saved to server')}
            </div>
        </div>
    );
};
