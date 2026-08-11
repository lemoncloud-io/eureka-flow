import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { isOutputBlock } from '../consts';
import { useBlockRegistry } from '../stores/useFlowsStore';
import { blockAcceptsPortType, blockMatchesQuery } from '../utils';

interface BlockGroupOptions {
    /** Keep only blocks that can receive a link dragged from a port of this type. */
    acceptsPortType?: string;
}

export const useBlockGroups = (searchQuery: string, options?: BlockGroupOptions) => {
    const blockRegistry = useBlockRegistry();
    const { t } = useTranslation('blocks');
    const acceptsPortType = options?.acceptsPortType;

    return useMemo(() => {
        const blocks = Object.entries(blockRegistry)
            .filter(([key, block]) => key === block.type)
            .map(([, block]) => block);

        const query = searchQuery.toLowerCase().trim();
        const matched = query ? blocks.filter(b => blockMatchesQuery(t, b, query)) : blocks;
        const filtered = acceptsPortType ? matched.filter(b => blockAcceptsPortType(b, acceptsPortType)) : matched;

        return {
            inputs: filtered.filter(b => b.stereo === 'input' || (!b.stereo && b.type.startsWith('input-'))),
            process: filtered.filter(
                b => b.stereo === 'process' || (!b.stereo && !b.type.startsWith('input-') && !isOutputBlock(b.type))
            ),
            outputs: filtered.filter(b => b.stereo === 'output' || (!b.stereo && isOutputBlock(b.type))),
        };
    }, [blockRegistry, searchQuery, acceptsPortType, t]);
};
