import { DebugLogVisualization } from './DebugLogVisualization';
import { PreviewVisualization } from './PreviewVisualization';

import type { VisualizationProps } from './types';
import type { BlockDefinitionWithFrontend, DataPacket, GraphNode, TraceEntry, TraceStage } from '@flows/flows';
import type React from 'react';

/** Get first input data from node using definition's port ID or fallback to first available */
export const getFirstInputData = (node: GraphNode, definition: BlockDefinitionWithFrontend) => {
    const inputPortId = definition.inputs?.[0]?.id;
    return inputPortId ? node.inputData?.[inputPortId] : Object.values(node.inputData ?? {})[0];
};

/** Get first output data from node */
export const getFirstOutputData = (
    node: GraphNode,
    definition: BlockDefinitionWithFrontend
): DataPacket | undefined => {
    const outputPortId = definition.outputs?.[0]?.id;
    return outputPortId ? node.outputData?.[outputPortId] : Object.values(node.outputData ?? {})[0];
};

export const STAGE_STYLES = {
    run: { label: 'RUN', color: 'text-violet-400' },
    planner: { label: 'PLAN', color: 'text-violet-400' },
    step: { label: 'STEP', color: 'text-cyan-400' },
    tool: { label: 'TOOL', color: 'text-amber-400' },
    approval: { label: 'APPROVE', color: 'text-yellow-300' },
    reflector: { label: 'REFLECT', color: 'text-pink-400' },
    finalizer: { label: 'FINAL', color: 'text-emerald-400' },
    trace: { label: 'TRACE', color: 'text-muted-foreground' },
    error: { label: 'ERROR', color: 'text-red-400' },
    runtime: { label: 'RUNTIME', color: 'text-orange-400' },
} satisfies Record<TraceStage, { label: string; color: string }>;

/** Extract contextual detail from trace entry data for inline display */
export const getTraceDetail = (entry: TraceEntry): string | null => {
    const d = entry.data;
    if (!d) return null;
    if (d['toolName']) return String(d['toolName']);
    if (d['skillName']) return String(d['skillName']);
    if (d['status']) return String(d['status']);
    if (d['mode']) return String(d['mode']);
    return null;
};

export const VISUALIZATION_COMPONENTS: Record<string, React.FC<VisualizationProps>> = {
    // New type names
    'output-console': DebugLogVisualization,
    'output-preview': PreviewVisualization,
    // Legacy type names (backward compat)
    'console-log': DebugLogVisualization,
    'debug-log': DebugLogVisualization,
    'result-preview': PreviewVisualization,
    preview: PreviewVisualization,
};
