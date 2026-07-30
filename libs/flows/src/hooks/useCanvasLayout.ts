import { DEFAULT_TEXTAREA_HEIGHT, getNodeHeight } from '@flows/engine';

import { getEffectiveState, isOutputConsole, isOutputPreview } from '../consts';

import type { BlockDefinition, NodeData } from '@lemoncloud/eureka-flows-api';

/** Layout configuration for auto-layout algorithm */
export const LAYOUT_CONFIG = {
    /** Horizontal spacing between levels (columns) */
    LEVEL_WIDTH: 300,
    /** Minimum vertical gap between nodes */
    MIN_GAP: 30,
    /** Default node height when definition is unavailable */
    DEFAULT_HEIGHT: 180,
    /** Initial X position */
    START_X: 50,
    /** Initial Y position */
    START_Y: 50,
} as const;

/** Port layout configuration - used for edge connection positioning */
export const PORT_LAYOUT = {
    /** Node header height */
    HEADER_HEIGHT: 45,
    /** First port Y offset from node top (header + centering) */
    FIRST_PORT_Y: 58,
    /** Vertical spacing between ports (port height 24px + gap 4px) */
    PORT_SPACING: 28,
    /** Input port X offset from node left edge */
    INPUT_X: -3,
    /** Output port X offset from node left edge (node width 260px + offset) */
    OUTPUT_X: 263,
    /** Node width */
    NODE_WIDTH: 260,
    /** Port circle size */
    PORT_SIZE: 12,
    /** Port visual offset from edge (half of port size) */
    PORT_EDGE_OFFSET: 6,
    /** Collapsed node: CSS top offset for port dots */
    COLLAPSED_PORT_CSS_TOP: 16,
    /** Port wrapper height (Tailwind h-6 = 24px) */
    PORT_WRAPPER_HEIGHT: 24,
} as const;

/** Collapsed node: port Y offset for edge connections (CSS_TOP + PORT_WRAPPER_HEIGHT/2) */
export const COLLAPSED_PORT_Y = PORT_LAYOUT.COLLAPSED_PORT_CSS_TOP + PORT_LAYOUT.PORT_WRAPPER_HEIGHT / 2;

/** Node height estimation constants */
const NODE_HEIGHT = {
    /** Base: header(40) + description(20) + border(10) + padding(40) */
    BASE: 110,
    /** Height per port row */
    PORT_ROW: 26,
    /** Extra height for input nodes (Run button + visualization) */
    INPUT_NODE: 100,
    /** Extra height for output-console nodes (visualization area) */
    DEBUG_LOG: 120,
    /** Extra height for output-preview nodes (image area) */
    PREVIEW: 100,
    /** Extra height for error state (error message box) */
    ERROR: 70,
} as const;

/**
 * Estimate node height based on node type and port count.
 * Avoids DOM measurement timing issues while providing accurate spacing.
 */
export const estimateNodeHeight = (node: NodeData, definition: BlockDefinition | undefined): number => {
    if (!definition) return LAYOUT_CONFIG.DEFAULT_HEIGHT;

    const portCount = Math.max(definition.inputs.length, definition.outputs.length);
    const portsHeight = portCount * NODE_HEIGHT.PORT_ROW;

    let extraHeight = 0;
    // Use definition.type since loaded nodes may have blockId as type
    if (definition.type.startsWith('input-')) {
        extraHeight += NODE_HEIGHT.INPUT_NODE;

        // input-text nodes have dynamic textarea height
        if (definition.type === 'input-text') {
            const textareaHeight = getNodeHeight(node, DEFAULT_TEXTAREA_HEIGHT) ?? DEFAULT_TEXTAREA_HEIGHT;
            // Add height beyond default textarea height (INPUT_NODE already includes base textarea)
            const additionalHeight = Math.max(0, textareaHeight - DEFAULT_TEXTAREA_HEIGHT);
            extraHeight += additionalHeight;
        }
    }
    if (isOutputConsole(definition.type)) extraHeight += NODE_HEIGHT.DEBUG_LOG;
    if (isOutputPreview(definition.type)) extraHeight += NODE_HEIGHT.PREVIEW;
    // Use getEffectiveState for backward compatibility (state preferred, status fallback)
    if (getEffectiveState(node.state, node.status) === 'ERROR') extraHeight += NODE_HEIGHT.ERROR;

    return NODE_HEIGHT.BASE + portsHeight + extraHeight;
};
