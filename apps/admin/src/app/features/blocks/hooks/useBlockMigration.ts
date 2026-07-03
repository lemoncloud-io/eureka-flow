import { useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { updateBlock } from '../apis';
import { blockKeys } from './blockKeys';

import type { Block } from '../types';

const KEY_PATTERN = /^[a-z0-9_]+$/;
const toKey = (type: string) => type.replace(/-/g, '_');

export interface MigrationPlanItem {
    id: string;
    name: string;
    currentLabel: string;
    labelKey: string;
    descKey: string;
    /** already a snake_case key → skipped */
    alreadyKeyed: boolean;
}

/** Build the label→key plan: label = {block_type}, description = {block_type}_desc. */
export const buildBlockMigrationPlan = (blocks: Block[]): MigrationPlanItem[] =>
    blocks.map(b => {
        const labelKey = toKey(b.processType || b.id);
        return {
            id: b.id,
            name: b.name,
            currentLabel: b.label,
            labelKey,
            descKey: `${labelKey}_desc`,
            alreadyKeyed: KEY_PATTERN.test(b.label),
        };
    });

export interface MigrationProgress {
    running: boolean;
    done: number;
    total: number;
    errors: { id: string; message: string }[];
}

const IDLE: MigrationProgress = { running: false, done: 0, total: 0, errors: [] };

/**
 * Runs the label→key migration sequentially (one update per pending block),
 * then reconciles the list cache. Idempotent: blocks whose label is already a key are skipped.
 */
export const useBlockMigration = () => {
    const qc = useQueryClient();
    const [progress, setProgress] = useState<MigrationProgress>(IDLE);

    const run = async (blocks: Block[]) => {
        const pending = blocks.filter(b => !KEY_PATTERN.test(b.label));
        setProgress({ running: true, done: 0, total: pending.length, errors: [] });

        for (const block of pending) {
            const labelKey = toKey(block.processType || block.id);
            const { id, createdAt: _c, updatedAt: _u, deletedAt: _d, ...form } = block;
            try {
                const updated = await updateBlock(id, { ...form, label: labelKey, description: `${labelKey}_desc` });
                qc.setQueryData<Block[]>(blockKeys.lists(), (old = []) =>
                    old.map(b => (b.id === updated.id ? updated : b))
                );
                setProgress(p => ({ ...p, done: p.done + 1 }));
            } catch (e) {
                setProgress(p => ({
                    ...p,
                    done: p.done + 1,
                    errors: [...p.errors, { id, message: e instanceof Error ? e.message : 'update failed' }],
                }));
            }
        }

        setProgress(p => ({ ...p, running: false }));
    };

    const reset = () => setProgress(IDLE);

    return { progress, run, reset };
};
