import { describe, expect, it } from 'vitest';

import { wouldCreateCycle } from '../core/cycle';

import type { Connection } from '@lemoncloud/eureka-flows-api';

const edge = (source: string, target: string): Connection =>
    ({
        id: `${source}->${target}`,
        sourceNodeId: source,
        sourcePortId: 'out',
        targetNodeId: target,
        targetPortId: 'in',
    }) as unknown as Connection;

describe('wouldCreateCycle', () => {
    it('rejects a self-loop', () => {
        expect(wouldCreateCycle([], 'a', 'a')).toBe(true);
    });

    it('rejects a direct back-edge', () => {
        expect(wouldCreateCycle([edge('a', 'b')], 'b', 'a')).toBe(true);
    });

    it('rejects an indirect cycle', () => {
        const chain = [edge('a', 'b'), edge('b', 'c'), edge('c', 'd')];
        expect(wouldCreateCycle(chain, 'd', 'a')).toBe(true);
    });

    it('allows an edge that keeps the graph acyclic', () => {
        const chain = [edge('a', 'b'), edge('b', 'c')];
        expect(wouldCreateCycle(chain, 'a', 'c')).toBe(false);
    });

    it('allows an edge between disconnected components', () => {
        const two = [edge('a', 'b'), edge('c', 'd')];
        expect(wouldCreateCycle(two, 'b', 'c')).toBe(false);
    });

    it('terminates on a graph that already contains a cycle', () => {
        const looped = [edge('a', 'b'), edge('b', 'a')];
        expect(wouldCreateCycle(looped, 'c', 'd')).toBe(false);
    });

    it('follows every branch out of a fan-out, not just the first', () => {
        const fan = [edge('a', 'b'), edge('a', 'c'), edge('c', 'd')];
        expect(wouldCreateCycle(fan, 'd', 'a')).toBe(true);
    });
});
