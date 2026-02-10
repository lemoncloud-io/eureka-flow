/**
 * Block Type Constants
 * Supports backward compatibility with legacy type names.
 */

/** All output block types (new + legacy for backward compat) */
export const OUTPUT_BLOCK_TYPES = ['output-preview', 'result-preview', 'output-console', 'console-log'] as const;

/** Check if block type is output-preview (or legacy result-preview) */
export const isOutputPreview = (type: string): boolean => type === 'output-preview' || type === 'result-preview';

/** Check if block type is output-console (or legacy console-log) */
export const isOutputConsole = (type: string): boolean => type === 'output-console' || type === 'console-log';

/** Check if block type is any output block */
export const isOutputBlock = (type: string): boolean => isOutputPreview(type) || isOutputConsole(type);
