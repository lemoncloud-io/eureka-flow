import { useMemo } from 'react';

import { isOutputBlock } from '../consts';
import { useBlockRegistry } from '../stores/useFlowsStore';

import type { BlockDefinitionWithFrontend } from '../types';

export const useBlockGroups = (searchQuery: string) => {
    const blockRegistry = useBlockRegistry();

    return useMemo(() => {
        const blocks = Object.entries(blockRegistry)
            .filter(([key, block]) => key === block.type)
            .map(([, block]) => block);

        const query = searchQuery.toLowerCase().trim();
        const filtered = query
            ? blocks.filter(
                  (b: BlockDefinitionWithFrontend) =>
                      b.label.toLowerCase().includes(query) ||
                      b.description.toLowerCase().includes(query) ||
                      b.type.toLowerCase().includes(query)
              )
            : blocks;

        return {
            inputs: filtered.filter(b => b.stereo === 'input' || (!b.stereo && b.type.startsWith('input-'))),
            process: filtered.filter(
                b => b.stereo === 'process' || (!b.stereo && !b.type.startsWith('input-') && !isOutputBlock(b.type))
            ),
            outputs: filtered.filter(b => b.stereo === 'output' || (!b.stereo && isOutputBlock(b.type))),
        };
    }, [blockRegistry, searchQuery]);
};
