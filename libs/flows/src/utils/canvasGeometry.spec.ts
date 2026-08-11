import { describe, expect, it } from 'vitest';

import { findNodeAtPoint } from './canvasGeometry';

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
