import { toolUnknown } from './types';

import type { ToolCall, ToolHandler, ToolProvider } from './types';
import type { CanvasBinding } from '../canvas/canvasBinding';
import type { CatalogLookup } from '../catalog';
import type { ToolDef } from '../llm/llmGateway';

// Tool composition: a tool is a self-named value (`CanvasTool`); `toolset` binds the values an agent lists to
// the live deps and composes them into one `ToolProvider`.

/** The live deps a canvas tool binds to; a tool destructures only what it needs. */
export interface CanvasToolDeps {
    binding: CanvasBinding;
    catalog: CatalogLookup;
    /** If set, scopes `search_nodes` to ONE block type; ignored by every other tool. */
    searchType?: string;
}

/** A tool value: its `def` (the single source of its name + optional `requires`) and a `build` that binds it to the deps, yielding its handler. */
export interface CanvasTool {
    def: ToolDef;
    build(deps: CanvasToolDeps): ToolHandler;
}

/** Bind the listed tools to `deps` and compose them into one {@link ToolProvider}, routing calls by `def.name`. Throws on a duplicate name. */
export const toolset = (deps: CanvasToolDeps, tools: CanvasTool[]): ToolProvider => {
    const byName = new Map<string, ToolHandler>();
    for (const tool of tools) {
        if (byName.has(tool.def.name)) {
            throw new Error(`toolset: duplicate tool "${tool.def.name}"`);
        }
        byName.set(tool.def.name, tool.build(deps));
    }
    const defs = tools.map(tool => tool.def);
    return {
        listTools: () => defs,
        dispatch: (call: ToolCall) => byName.get(call.name)?.(call) ?? toolUnknown(call),
    };
};
