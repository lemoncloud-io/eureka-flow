export const blockKeys = {
    all: ['admin', 'blocks'] as const,
    lists: () => [...blockKeys.all, 'list'] as const,
    detail: (id: string) => [...blockKeys.all, 'detail', id] as const,
};
