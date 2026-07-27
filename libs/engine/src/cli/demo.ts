import type { FlowWorkspace } from '../repository/workspace';

export interface DemoOptions {
    flowId: string;
    /** Block type to add. Falls back to whatever the registry offers first. */
    blockType?: string;
    log?: (line: string) => void;
}

export interface DemoResult {
    flowId: string;
    nodeCountAfterLoad: number;
    nodeCountAfterAdd: number;
    nodeCountAfterUndo: number;
    nodeCountAfterRedo: number;
    dirtyAfterLoad: boolean;
    dirtyAfterAdd: boolean;
    dirtyAfterUndo: boolean;
    savedFlowId: string;
    structureDropped: boolean;
    dirtyAfterSave: boolean;
}

/**
 * The whole point of the engine, in one function: `load → add → undo → redo → save`.
 *
 * No DOM, no React, no store. If this runs under Node then the graph, its history and its
 * save semantics are genuinely portable — which is a claim worth being able to execute
 * rather than assert.
 */
export const runDemo = async (
    { engine, repository }: FlowWorkspace,
    { flowId, blockType, log = () => undefined }: DemoOptions
): Promise<DemoResult> => {
    const step = (n: number, title: string): void => log(`\n[${n}] ${title}`);

    step(1, `load(${flowId})`);
    await repository.load(flowId);
    const nodeCountAfterLoad = engine.getGraph().nodes.length;
    const dirtyAfterLoad = repository.isDirty();
    log(`    nodes=${nodeCountAfterLoad} edges=${engine.getGraph().edges.length} dirty=${dirtyAfterLoad}`);
    // A freshly loaded flow that reads dirty means the baseline was taken from the wrong
    // graph — the failure invariant 7 exists to catch.
    if (dirtyAfterLoad) log('    !! dirty right after load — baseline disagrees with the loaded graph');

    const registry = repository.blockRegistry();
    const type = blockType ?? Object.keys(registry)[0] ?? 'input-text';

    step(2, `add a ${type} node`);
    let addedId = '';
    engine.transact('cli:add-node', ops => {
        addedId = ops.addNode({ type, position: { x: 120, y: 80 }, config: { ...registry[type]?.defaultConfig } });
    });
    const nodeCountAfterAdd = engine.getGraph().nodes.length;
    const dirtyAfterAdd = repository.isDirty();
    log(`    id=${addedId} nodes=${nodeCountAfterAdd} dirty=${dirtyAfterAdd}`);

    step(3, 'undo');
    log(`    undo() -> ${engine.undo()}`);
    const nodeCountAfterUndo = engine.getGraph().nodes.length;
    const dirtyAfterUndo = repository.isDirty();
    log(`    nodes=${nodeCountAfterUndo} dirty=${dirtyAfterUndo}  (back to the loaded graph)`);

    step(4, 'redo');
    log(`    redo() -> ${engine.redo()}`);
    const nodeCountAfterRedo = engine.getGraph().nodes.length;
    log(`    nodes=${nodeCountAfterRedo} canUndo=${engine.canUndo()} canRedo=${engine.canRedo()}`);

    step(5, 'save');
    const { flowId: savedFlowId, structureDropped } = await repository.save();
    const dirtyAfterSave = repository.isDirty();
    log(`    flowId=${savedFlowId} structureDropped=${structureDropped} dirty=${dirtyAfterSave}`);
    if (structureDropped) log('    !! the server answered 200 and dropped the structure (non-owner editor)');

    return {
        flowId,
        nodeCountAfterLoad,
        nodeCountAfterAdd,
        nodeCountAfterUndo,
        nodeCountAfterRedo,
        dirtyAfterLoad,
        dirtyAfterAdd,
        dirtyAfterUndo,
        savedFlowId,
        structureDropped,
        dirtyAfterSave,
    };
};
