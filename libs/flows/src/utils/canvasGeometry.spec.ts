import { describe, expect, it } from 'vitest';

import { findNodeAtPoint, nodesInRect, pasteOffsetTo } from './canvasGeometry';

import type { GraphNode } from '../types';

const node = (id: string, x: number, y: number): GraphNode => ({ id, position: { x, y } }) as GraphNode;

// Every node in these cases is 200 wide and 100 tall.
const size = () => ({ width: 200, height: 100 });

describe('findNodeAtPoint', () => {
    const nodes = [node('a', 0, 0), node('b', 500, 500)];

    it('finds the node whose box contains the point', () => {
        expect(findNodeAtPoint(nodes, { x: 100, y: 50 }, size)?.id).toBe('a');
        expect(findNodeAtPoint(nodes, { x: 600, y: 550 }, size)?.id).toBe('b');
    });

    it('returns undefined for a point in empty canvas', () => {
        expect(findNodeAtPoint(nodes, { x: 300, y: 300 }, size)).toBeUndefined();
    });

    it('counts the top-left corner as inside and the bottom-right edge as outside', () => {
        expect(findNodeAtPoint(nodes, { x: 0, y: 0 }, size)?.id).toBe('a');
        expect(findNodeAtPoint(nodes, { x: 200, y: 100 }, size)).toBeUndefined();
    });

    it('returns the last node when boxes overlap — the one drawn on top', () => {
        const stacked = [node('under', 0, 0), node('over', 50, 50)];
        expect(findNodeAtPoint(stacked, { x: 100, y: 80 }, size)?.id).toBe('over');
    });

    it('returns undefined for an empty graph', () => {
        expect(findNodeAtPoint([], { x: 0, y: 0 }, size)).toBeUndefined();
    });
});

describe('nodesInRect', () => {
    // 'a' sits at 0..200 x 0..100, 'b' at 300..500 x 300..400.
    const nodes = [node('a', 0, 0), node('b', 300, 300)];

    it('selects a node the rectangle fully contains', () => {
        expect(nodesInRect(nodes, { x: -50, y: -50, width: 400, height: 300 }, size)).toEqual(['a']);
    });

    it('selects a node the rectangle only clips', () => {
        expect(nodesInRect(nodes, { x: 150, y: 50, width: 100, height: 100 }, size)).toEqual(['a']);
    });

    it('skips a node the rectangle misses entirely', () => {
        expect(nodesInRect(nodes, { x: 210, y: 0, width: 50, height: 50 }, size)).toEqual([]);
    });

    it('selects every node the rectangle spans, in graph order', () => {
        expect(nodesInRect(nodes, { x: -10, y: -10, width: 600, height: 600 }, size)).toEqual(['a', 'b']);
    });

    it('treats a rectangle dragged up and to the left the same as one dragged down and right', () => {
        const downRight = { x: 0, y: 0, width: 250, height: 150 };
        const upLeft = { x: 250, y: 150, width: -250, height: -150 };
        expect(nodesInRect(nodes, upLeft, size)).toEqual(nodesInRect(nodes, downRight, size));
    });

    it('selects nothing for a zero-size rectangle — a click is not a selection box', () => {
        expect(nodesInRect(nodes, { x: 10, y: 10, width: 0, height: 0 }, size)).toEqual([]);
    });
});

describe('pasteOffsetTo', () => {
    const copied = [{ position: { x: 100, y: 200 } }, { position: { x: 400, y: 260 } }];

    it('moves the top-left of the copied group onto the cursor', () => {
        expect(pasteOffsetTo(copied, { x: 700, y: 700 })).toEqual({ x: 600, y: 500 });
    });

    it('keeps the group shape — the same offset applies to every node', () => {
        const offset = pasteOffsetTo(copied, { x: 0, y: 0 });
        const moved = copied.map(n => ({ x: n.position.x + offset.x, y: n.position.y + offset.y }));
        expect(moved).toEqual([
            { x: 0, y: 0 },
            { x: 300, y: 60 },
        ]);
    });

    it('measures from the top-left corner whatever order the nodes arrive in', () => {
        const reversed = [...copied].reverse();
        expect(pasteOffsetTo(reversed, { x: 700, y: 700 })).toEqual(pasteOffsetTo(copied, { x: 700, y: 700 }));
    });

    it('is a no-op offset for an empty payload', () => {
        expect(pasteOffsetTo([], { x: 700, y: 700 })).toEqual({ x: 0, y: 0 });
    });
});
