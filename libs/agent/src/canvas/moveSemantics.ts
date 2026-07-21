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

/** The eight relocation directions the model may name. */
export type Direction = 'right' | 'left' | 'up' | 'down' | 'up-right' | 'up-left' | 'down-right' | 'down-left';

/** The default step (px) for a vague amount ("nudge it right"). */
export const DEFAULT_STEP = 20;

/**
 * Canonical direction → delta mapping in canvas coordinates (origin top-left,
 * x increases right, y increases down): right = +x, left = −x, up = −y, down = +y.
 * Diagonals combine the two axes.
 *
 * NOTE: the live path does not call this — the model emits `by` directly, steered by the
 * coordinate convention stated in the system prompt + tool description. This is the
 * reference/tested encoding of that convention for any future non-LLM caller.
 */
export const directionToDelta = (direction: Direction, amount: number = DEFAULT_STEP): Delta => {
    const right = direction.includes('right') ? amount : 0;
    const left = direction.includes('left') ? amount : 0;
    const up = direction.includes('up') ? amount : 0;
    const down = direction.includes('down') ? amount : 0;
    return { dx: right - left, dy: down - up };
};

/** Whether `args` carries exactly one of `by` / `to`. */
export const hasExactlyOneTarget = (args: Pick<MoveNodeArgs, 'by' | 'to'>): boolean =>
    (args.by !== undefined) !== (args.to !== undefined);

/**
 * Compute a node's new position from a relative delta or an absolute point.
 * No clamping — negative coordinates are allowed (off-origin nodes are valid).
 *
 * @throws if neither or both of `by`/`to` are provided (a caller-side bug; the tool
 *   handler validates this and returns a `ToolResult` error instead of throwing).
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
