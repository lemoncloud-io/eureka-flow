import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { isOutputBlock } from '../consts';
import { useBlockRegistry } from '../stores/useFlowsStore';
import { blockMatchesQuery } from '../utils';

export const useBlockGroups = (searchQuery: string) => {
    const blockRegistry = useBlockRegistry();
    const { t } = useTranslation('blocks');

    return useMemo(() => {
        const blocks = Object.entries(blockRegistry)
            .filter(([key, block]) => key === block.type)
            .map(([, block]) => block);

        const query = searchQuery.toLowerCase().trim();
        const filtered = query ? blocks.filter(b => blockMatchesQuery(t, b, query)) : blocks;

        return {
            inputs: filtered.filter(b => b.stereo === 'input' || (!b.stereo && b.type.startsWith('input-'))),
            process: filtered.filter(
                b => b.stereo === 'process' || (!b.stereo && !b.type.startsWith('input-') && !isOutputBlock(b.type))
            ),
            outputs: filtered.filter(b => b.stereo === 'output' || (!b.stereo && isOutputBlock(b.type))),
        };
    }, [blockRegistry, searchQuery, t]);
};
