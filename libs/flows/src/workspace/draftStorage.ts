import type { FlowDraft } from './draft';

/**
 * The working copy outlives the tab in IndexedDB rather than localStorage.
 *
 * That is not a size preference. An unsaved image keeps its base64 in node config —
 * there is no upload endpoint, so the bytes have nowhere else to live until a save. One
 * 5MB image is roughly 6.7MB of base64, past a whole 5MB localStorage quota on its own,
 * and an uncompressed zip is an order of magnitude past that. Nor can the bytes be left
 * out of the draft: they are the unsaved work, and a draft restored without them is a
 * flow with holes where the user's images were.
 *
 * Every call swallows its failure. IndexedDB is absent in some private-browsing modes and
 * can refuse a write on quota, and neither is a reason to interrupt someone's editing —
 * the canvas is still the real working copy. Losing the draft costs a refresh; throwing
 * here would cost the session.
 */
const DB_NAME = 'eureka-flow';
const STORE_NAME = 'drafts';

/**
 * One slot, so only the open flow's work survives a refresh.
 *
 * Switching flows mid-edit still drops the first one's unsaved changes — the same as
 * before any of this existed, but not something this closes. Keying by flow id would,
 * and would also let several multi-megabyte drafts pile up, so it needs eviction to go
 * with it. See the plan's S7 entry.
 */
const DRAFT_KEY = 'current';

const openDb = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

const withStore = async <T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await openDb();
    try {
        return await new Promise<T>((resolve, reject) => {
            const request = run(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } finally {
        db.close();
    }
};

export const readDraft = async (): Promise<FlowDraft | null> => {
    try {
        return (await withStore('readonly', store => store.get(DRAFT_KEY))) ?? null;
    } catch {
        return null;
    }
};

export const writeDraft = async (draft: FlowDraft): Promise<void> => {
    try {
        await withStore('readwrite', store => store.put(draft, DRAFT_KEY));
    } catch {
        console.warn('[draftStorage] Could not keep a local copy of this flow');
    }
};

export const clearDraft = async (): Promise<void> => {
    try {
        await withStore('readwrite', store => store.delete(DRAFT_KEY));
    } catch {
        /* nothing to clean up if the store will not open */
    }
};
