import type { FlowWorkspace } from '../repository/workspace';
import type { RunSession } from '../runtime/runSession';

export interface DemoOptions {
    flowId: string;
    /** Block type to add. Falls back to whatever the registry offers first. */
    blockType?: string;
    log?: (line: string) => void;
    /** Supply a session to also run a node and follow it to completion (step 6). */
    session?: RunSession;
    /**
     * Stop after the load. Every step past it writes — the save replaces the whole graph
     * — which is fine against the stub and is somebody's flow against a real server.
     */
    readOnly?: boolean;
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
    /** Present only when a session was supplied. */
    run?: RunOutcome;
    /** The run stopped after the load, so only the load's numbers mean anything. */
    readOnly?: boolean;
}

export interface RunOutcome {
    nodeId: string;
    state: 'COMPLETED' | 'ERROR';
    /**
     * The state the engine ended up holding for that node. The stub sends a stale frame
     * *after* the terminal one, so this matching `state` is what proves the drop rule ran.
     */
    stateInGraph?: string;
    /** Whether following the run left the graph looking unsaved. It must not. */
    dirtyAfterRun: boolean;
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
    { flowId, blockType, log = () => undefined, session, readOnly = false }: DemoOptions
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

    if (readOnly) {
        log('\n    stopping here — the rest of the demo writes');
        return {
            flowId,
            nodeCountAfterLoad,
            dirtyAfterLoad,
            // Nothing ran, so the counts report the loaded graph and the dirty flags report
            // what they were: a caller checking "undo returned to the loaded graph" against
            // a run that never happened would be reading agreement into silence.
            nodeCountAfterAdd: nodeCountAfterLoad,
            nodeCountAfterUndo: nodeCountAfterLoad,
            nodeCountAfterRedo: nodeCountAfterLoad,
            dirtyAfterAdd: dirtyAfterLoad,
            dirtyAfterUndo: dirtyAfterLoad,
            savedFlowId: flowId,
            structureDropped: false,
            dirtyAfterSave: dirtyAfterLoad,
            readOnly: true,
        };
    }

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

    const run = session ? await runNodeStep({ engine, repository }, session, log) : undefined;

    return {
        run,
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

/**
 * Step 6: run a node and follow it to the end, over a socket, with no browser.
 *
 * The waiter is registered *before* the run is asked for. A real server starts streaming
 * the moment it accepts the request, so a caller that waits afterwards can miss the whole
 * run — the ordering is the point, not an artefact of the stub.
 */
const runNodeStep = async (
    { engine, repository }: FlowWorkspace,
    session: RunSession,
    log: (line: string) => void
): Promise<RunOutcome | undefined> => {
    const nodeId = engine.getGraph().nodes[0]?.id;
    if (!nodeId) return undefined;

    log(`\n[6] run ${nodeId} and follow it over the socket`);

    const settled = session.waitForNode(nodeId, { timeoutMs: 5_000 });
    await repository.runNode(nodeId, undefined, { async: true, propagate: true });
    const outcome = await settled;

    const node = engine.getGraph().nodes.find(n => n.id === nodeId);
    const stateInGraph = (node as { state?: string } | undefined)?.state;
    // Following a run must not make the graph look edited: runtime lands outside history
    // and `toSnapshot` drops it, so a run leaves nothing for the next save to send.
    const dirtyAfterRun = repository.isDirty();

    log(`    outcome=${outcome.state} stateInGraph=${stateInGraph} dirty=${dirtyAfterRun}`);
    log(`    canUndo=${engine.canUndo()}  (a run is not an edit — nothing was pushed onto history)`);

    return { nodeId, state: outcome.state, stateInGraph, dirtyAfterRun };
};
