/**
 * Block Type Constants
 * Supports backward compatibility with legacy type names.
 *
 * Type mapping (server processType → frontend type):
 * - output-preview (new) / result-preview / preview (legacy)
 * - output-console (new) / console-log / debug-log (legacy)
 */

/** All output preview types (new + legacy) */
export const OUTPUT_PREVIEW_TYPES = ['output-preview', 'result-preview', 'preview'] as const;
/** All output console types (new + legacy) */
export const OUTPUT_CONSOLE_TYPES = ['output-console', 'console-log', 'debug-log'] as const;

/** All output block types (for Sidebar categorization fallback) */
export const OUTPUT_BLOCK_TYPES = [...OUTPUT_PREVIEW_TYPES, ...OUTPUT_CONSOLE_TYPES] as const;

/** Check if block type is output-preview (or legacy preview/result-preview) */
export const isOutputPreview = (type: string): boolean => OUTPUT_PREVIEW_TYPES.includes(type);

/** Check if block type is output-console (or legacy console-log/debug-log) */
export const isOutputConsole = (type: string): boolean => OUTPUT_CONSOLE_TYPES.includes(type);

/** Check if block type is any output block */
export const isOutputBlock = (type: string): boolean => isOutputPreview(type) || isOutputConsole(type);
