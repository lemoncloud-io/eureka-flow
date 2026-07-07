import { useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { updateBlock } from '../apis';
import { resolveFieldKey } from '../consts';
import { blockKeys } from './blockKeys';

import type { ConfigItem, Port } from '../types';
import type { Block, BlockFormData } from '../types';

const KEY_PATTERN = /^[a-z0-9_]+$/;
const toKey = (type: string) => type.replace(/-/g, '_');

/** Apply key mapping to port/config labels; returns the new arrays plus any labels left unmapped. */
const keyFields = (block: Block): { input$: Port[]; output$: Port[]; config$: ConfigItem[]; unmapped: string[] } => {
    const unmapped: string[] = [];
    const mapPort = (p: Port): Port => {
        const key = resolveFieldKey(p.label);
        if (!key && p.label && !KEY_PATTERN.test(p.label)) unmapped.push(p.label);
        return key ? { ...p, label: key } : p;
    };
    const mapConfig = (c: ConfigItem): ConfigItem => {
        const key = resolveFieldKey(c.label);
        if (!key && c.label && !KEY_PATTERN.test(c.label)) unmapped.push(c.label);
        return key ? { ...c, label: key } : c;
    };
    return {
        input$: block.input$.map(mapPort),
        output$: block.output$.map(mapPort),
        config$: block.config$.map(mapConfig),
        unmapped,
    };
};

export interface MigrationPlanItem {
    id: string;
    name: string;
    currentLabel: string;
    labelKey: string;
    descKey: string;
    /** port/config labels that will be converted to keys */
    fieldCount: number;
    /** port/config labels with no key mapping (left as-is → humanize fallback) */
    unmapped: string[];
    /** label already a snake_case key AND no field work left → skipped */
    alreadyKeyed: boolean;
}

/** Build the plan: label = {block_type}, description = {block_type}_desc, plus port/config label keys. */
export const buildBlockMigrationPlan = (blocks: Block[]): MigrationPlanItem[] =>
    blocks.map(b => {
        const labelKey = toKey(b.processType || b.id);
        const fields = keyFields(b);
        const fieldCount =
            countKeyed(b.input$) + countKeyed(b.output$) + countKeyed(b.config$) - fields.unmapped.length;
        const labelDone = KEY_PATTERN.test(b.label);
        return {
            id: b.id,
            name: b.name,
            currentLabel: b.label,
            labelKey,
            descKey: `${labelKey}_desc`,
            fieldCount: Math.max(0, fieldCount),
            unmapped: fields.unmapped,
            alreadyKeyed: labelDone && fieldCount === 0 && fields.unmapped.length === 0,
        };
    });

/** Count fields whose label is convertible to a key (not already a key, has a mapping). */
const countKeyed = (fields: { label: string }[]): number =>
    fields.filter(f => resolveFieldKey(f.label) !== null).length;

export interface MigrationProgress {
    running: boolean;
    done: number;
    total: number;
    errors: { id: string; message: string }[];
}

const IDLE: MigrationProgress = { running: false, done: 0, total: 0, errors: [] };

/** A block needs migration if its label isn't a key, or any port/config label is still convertible. */
const needsMigration = (b: Block): boolean =>
    !KEY_PATTERN.test(b.label) || countKeyed(b.input$) > 0 || countKeyed(b.output$) > 0 || countKeyed(b.config$) > 0;

/**
 * Runs the label→key migration sequentially (one update per pending block),
 * then reconciles the list cache. Idempotent: already-keyed labels/fields are left untouched.
 */
export const useBlockMigration = () => {
    const qc = useQueryClient();
    const [progress, setProgress] = useState<MigrationProgress>(IDLE);

    const run = async (blocks: Block[]) => {
        const pending = blocks.filter(needsMigration);
        setProgress({ running: true, done: 0, total: pending.length, errors: [] });

        for (const block of pending) {
            const labelKey = toKey(block.processType || block.id);
            const { input$, output$, config$ } = keyFields(block);
            const { id, createdAt: _c, updatedAt: _u, deletedAt: _d, ...rest } = block;
            const form: BlockFormData = {
                ...rest,
                label: KEY_PATTERN.test(block.label) ? block.label : labelKey,
                description: KEY_PATTERN.test(block.description) ? block.description : `${labelKey}_desc`,
                input$,
                output$,
                config$,
            };
            try {
                const updated = await updateBlock(id, form);
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
