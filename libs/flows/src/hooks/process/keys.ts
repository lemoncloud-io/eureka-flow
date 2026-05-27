export const processKeys = {
    all: ['processes'] as const,
    lists: () => [...processKeys.all, 'list'] as const,
    detail: (id: string) => [...processKeys.all, 'detail', id] as const,
};

export const itemKeys = {
    all: ['items'] as const,
    lists: (params?: Record<string, unknown>) => [...itemKeys.all, 'list', params].filter(Boolean) as const,
    detail: (id: string) => [...itemKeys.all, 'detail', id] as const,
};

export const stageKeys = {
    all: ['stages'] as const,
    detail: (id: string) => [...stageKeys.all, 'detail', id] as const,
};

export const actorKeys = {
    all: ['actors'] as const,
    lists: () => [...actorKeys.all, 'list'] as const,
};

export const toolKeys = {
    all: ['tools'] as const,
    lists: () => [...toolKeys.all, 'list'] as const,
};
