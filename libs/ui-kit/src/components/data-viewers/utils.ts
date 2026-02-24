/**
 * Detect if content appears to be Markdown format.
 * Checks for common Markdown patterns at the start of lines:
 * - Headers: # to ######
 * - Bold: **text**
 * - Code blocks: ```
 * - Tables: |...|
 */
export const isMarkdownContent = (value: unknown): boolean => {
    if (typeof value !== 'string') return false;
    return /^#{1,6}\s|^\*\*.+\*\*|^```|^\|.+\|/m.test(value);
};
