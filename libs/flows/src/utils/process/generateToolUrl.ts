export interface ToolContext {
    itemId?: string;
    itemName?: string;
    stageId?: string;
    stageName?: string;
    taskId?: string;
    taskTitle?: string;
}

export const generateToolUrl = (template: string, context: ToolContext): string => {
    return template
        .replace(/\{itemId\}/g, context.itemId || '')
        .replace(/\{itemName\}/g, encodeURIComponent(context.itemName || ''))
        .replace(/\{stageId\}/g, context.stageId || '')
        .replace(/\{stageName\}/g, encodeURIComponent(context.stageName || ''))
        .replace(/\{taskId\}/g, context.taskId || '')
        .replace(/\{taskTitle\}/g, encodeURIComponent(context.taskTitle || ''))
        .replace(/\{\w+\}/g, ''); // Remove any unsupported placeholders
};
