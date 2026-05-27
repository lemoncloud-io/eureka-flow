import { create } from 'zustand';

export interface ProductProgressEntry {
    productId: string;
    progress$: Record<string, number>;
    state: string;
    timestamps: number[];
    updatedAt: number;
}

export interface ProductProgressInput {
    productId: string;
    progress$: Record<string, number>;
    state: string;
    timestamps: number[];
}

interface ProductProgressState {
    entries: Record<string, ProductProgressEntry>;
    setProgress: (input: ProductProgressInput) => void;
    dismissProgress: (productId: string) => void;
    clearAll: () => void;
}

const shallowEqualProgressMap = (a: Record<string, number>, b: Record<string, number>): boolean => {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every(k => a[k] === b[k]);
};

const shallowEqualNumberArr = (a: number[], b: number[]): boolean => {
    if (a.length !== b.length) return false;
    return a.every((v, i) => v === b[i]);
};

export const useProductProgressStore = create<ProductProgressState>(set => ({
    entries: {},
    setProgress: input =>
        set(state => {
            const existing = state.entries[input.productId];
            if (
                existing &&
                existing.state === input.state &&
                shallowEqualProgressMap(existing.progress$, input.progress$) &&
                shallowEqualNumberArr(existing.timestamps, input.timestamps)
            ) {
                return state;
            }
            return {
                entries: {
                    ...state.entries,
                    [input.productId]: {
                        productId: input.productId,
                        progress$: input.progress$,
                        state: input.state,
                        timestamps: input.timestamps,
                        updatedAt: Date.now(),
                    },
                },
            };
        }),
    dismissProgress: productId =>
        set(state => {
            if (!(productId in state.entries)) return state;
            const next = { ...state.entries };
            delete next[productId];
            return { entries: next };
        }),
    clearAll: () => set({ entries: {} }),
}));
