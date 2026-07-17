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

/** Held open across writes — they land on a debounce while someone types, and a fresh
 *  handshake each time buys nothing. Dropped on failure so the next call can retry. */
let dbPromise: Promise<IDBDatabase> | null = null;

const openDb = (): Promise<IDBDatabase> => {
    dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    }).catch(error => {
        dbPromise = null;
        throw error;
    });
    return dbPromise;
};

const withStore = async <T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await openDb();
    return new Promise<T>((resolve, reject) => {
        const request = run(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

/**
 * Whether the store holds anything, so a clear that would delete nothing can skip the
 * database entirely. A run rewrites node status continuously and every burst ends in a
 * clear, since none of that churn is work worth keeping.
 *
 * Starts unknown rather than false: a draft from a previous session is exactly what the
 * next boot is looking for, and a read is what settles it.
 */
let hasDraft: boolean | null = null;

export const readDraft = async (): Promise<FlowDraft | null> => {
    try {
        const draft = (await withStore<FlowDraft | undefined>('readonly', store => store.get(DRAFT_KEY))) ?? null;
        hasDraft = draft !== null;
        return draft;
    } catch {
        return null;
    }
};

export const writeDraft = async (draft: FlowDraft): Promise<void> => {
    try {
        await withStore('readwrite', store => store.put(draft, DRAFT_KEY));
        hasDraft = true;
    } catch {
        console.warn('[draftStorage] Could not keep a local copy of this flow');
    }
};

export const clearDraft = async (): Promise<void> => {
    if (hasDraft === false) return;
    try {
        await withStore('readwrite', store => store.delete(DRAFT_KEY));
        hasDraft = false;
    } catch {
        /* nothing to clean up if the store will not open */
    }
};
