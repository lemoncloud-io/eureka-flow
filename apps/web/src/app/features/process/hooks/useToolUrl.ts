import { generateToolUrl, useTools } from '@flows/flows';

import type { ToolContext } from '@flows/flows';

export const useToolUrl = (toolId: string | undefined, context: ToolContext) => {
    const { data } = useTools();
    const tool = data?.data?.find(t => t.id === toolId);
    // For stereo='flow', urlTemplate holds the flowId — not a URL.
    if (!tool?.urlTemplate || tool.stereo === 'flow') return { tool, url: null };
    return { tool, url: generateToolUrl(tool.urlTemplate, context) };
};
