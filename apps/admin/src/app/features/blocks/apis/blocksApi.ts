import { api } from '@flows/web-core';

import { blockToBlockBody, blockViewToBlock } from './blockMappers';

import type { BlockView } from './blockMappers';
import type { Block, BlockFormData } from '../types';

interface ListBlocksResponse {
    list?: BlockView[];
    total?: number;
}

/** GET /blocks/0/list — all blocks with core `$definition` fields. */
export const listBlocks = async (): Promise<Block[]> => {
    const response = await api.get<ListBlocksResponse>('/blocks/0/list?cores=1&limit=-1');
    const list = response.data?.list ?? [];
    return list.filter(v => !v.deletedAt).map(blockViewToBlock);
};

/**
 * POST /blocks/0?save=1 — create a new block.
 * `?save=1` is required; without it the server only returns a dry preview (no persist).
 */
export const createBlock = async (form: BlockFormData): Promise<Block> => {
    const response = await api.post<BlockView>('/blocks/0?save=1', blockToBlockBody(form));
    return blockViewToBlock(response.data);
};

/** POST /blocks/:id?save=1 — update an existing block by id. */
export const updateBlock = async (id: string, form: BlockFormData): Promise<Block> => {
    const response = await api.post<BlockView>(`/blocks/${id}?save=1`, blockToBlockBody(form));
    return blockViewToBlock(response.data);
};
