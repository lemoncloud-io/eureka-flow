import type { XY } from './canvasBinding';

/** A relative move delta in px (canvas coords: right = +dx, down = +dy). */
export interface Delta {
    dx: number;
    dy: number;
}

/** The move tool's input. Exactly one of `by` (relative) or `to` (absolute). */
export interface MoveNodeArgs {
    nodeId: string;
    /** Relative delta in px, in canvas coords (right = +dx, down = +dy). */
    by?: Delta;
    /** Absolute destination in px. */
    to?: XY;
}

/** Whether `args` carries exactly one of `by` / `to`. */
export const hasExactlyOneTarget = (args: Pick<MoveNodeArgs, 'by' | 'to'>): boolean =>
    (args.by !== undefined) !== (args.to !== undefined);

/**
 * Compute a node's new position from a relative delta or an absolute point.
 * No clamping; negative coordinates are valid.
 * @throws if neither or both of `by`/`to` are provided.
 */
export const applyMove = (current: XY, args: Pick<MoveNodeArgs, 'by' | 'to'>): XY => {
    if (!hasExactlyOneTarget(args)) {
        throw new Error('move requires exactly one of `by` or `to`');
    }
    if (args.to) {
        return { x: args.to.x, y: args.to.y };
    }
    // hasExactlyOneTarget guarantees `by` is set here.
    const by = args.by as Delta;
    return { x: current.x + by.dx, y: current.y + by.dy };
};
