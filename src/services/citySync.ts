/**
 * Incremental sync of a city's public collections.
 *
 * WHY. The Firebase JS SDK's persistent cache needs IndexedDB, which React
 * Native does not have (firebase/firebase-js-sdk#7947), so Firestore here runs
 * with no local persistence. Google bills a listener without persistence as a
 * brand-new query on every reconnect, so every app open, and every return from
 * the background after the socket dropped, re-read every synagogue, business,
 * event and kashrut update in the city. For a 500-synagogue city that is ~860
 * reads per open, and it was the one cost in the whole system that grew with
 * how often people use the app.
 *
 * HOW. This keeps its own copy of the city in AsyncStorage and asks the server
 * only for what changed since:
 *
 *   docs        where cityId == X and syncedAt > cursor
 *   tombstones  syncTombstones where collection == C and cityId == X
 *               and deletedAt > tombCursor
 *
 * `syncedAt` and the tombstones are written by the syncStamp trigger in
 * functions/src/index.ts, never by a client, so every writer (app, console,
 * import scripts) is covered without having to remember anything.
 *
 * The cursor is the largest `syncedAt` this copy has seen. That is server time
 * end to end, so a phone with a wrong clock cannot skip anything. Each delta
 * reaches OVERLAP_MS behind it anyway: the trigger stamps a moment after the
 * write commits, and two stamps can land out of order. Re-reading the last
 * few minutes' edits costs a handful of reads and closes that gap.
 *
 * WHEN IT FALLS BACK to the old full query:
 *   - no cache yet, or no stamped document in it (nothing to resume from)
 *   - the copy is older than FULL_REFRESH_MS: a monthly full read heals any
 *     drift this design does not foresee, for one open in ~45
 *   - a delta listener fails, e.g. the composite index is not built yet. An
 *     app released before its index is deployed then behaves exactly as it
 *     did before this change, rather than showing nothing.
 *
 * Kept free of React and AsyncStorage imports so it runs under Node against
 * the emulator (scripts/check-city-sync.mjs).
 */
import {
  collection, query, where, onSnapshot, Timestamp,
  type Firestore, type DocumentData, type Unsubscribe,
} from 'firebase/firestore';

export type SyncedCollection = 'synagogues' | 'businesses' | 'events' | 'kashrutUpdates';

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface SyncState {
  /** Sorted by document id, the order a plain query returns them in. */
  docs: (DocumentData & { id: string })[];
  /** True once the server has answered in this session. False while showing
   *  only the stored copy, which may be missing anything created since. */
  synced: boolean;
  error: string | null;
}

const CACHE_VERSION = 1;
export const OVERLAP_MS = 10 * 60 * 1000;
export const FULL_REFRESH_MS = 30 * 24 * 60 * 60 * 1000;
const PERSIST_DEBOUNCE_MS = 400;

interface StoredCopy {
  v: number;
  docs: Record<string, DocumentData>;
  cursor: number | null;
  tombCursor: number | null;
  /** Device time of the last full read. Only decides when to do the next one. */
  fullAt: number;
}

export const syncCacheKey = (col: SyncedCollection, cityId: string) =>
  `@sync_v${CACHE_VERSION}_${col}_${cityId}`;

/** Timestamp.toJSON() writes this shape. Bring it back as a real Timestamp so
 *  a document read from the stored copy behaves like one read from the server. */
function revive(_key: string, v: unknown): unknown {
  if (v && typeof v === 'object'
      && (v as { type?: unknown }).type === 'firestore/timestamp/1.0'
      && typeof (v as { seconds?: unknown }).seconds === 'number') {
    const t = v as { seconds: number; nanoseconds?: number };
    return new Timestamp(t.seconds, t.nanoseconds ?? 0);
  }
  return v;
}

export function millisOf(ts: unknown): number | null {
  if (ts instanceof Timestamp) return ts.toMillis();
  if (ts && typeof ts === 'object' && typeof (ts as { seconds?: unknown }).seconds === 'number') {
    const t = ts as { seconds: number; nanoseconds?: number };
    return t.seconds * 1000 + Math.floor((t.nanoseconds ?? 0) / 1e6);
  }
  return null;
}

export function subscribeCitySync(
  db: Firestore,
  store: KeyValueStore,
  col: SyncedCollection,
  cityId: string,
  onState: (state: SyncState) => void,
  /** Overridable for the emulator check only. */
  { now = Date.now, overlapMs = OVERLAP_MS }: { now?: () => number; overlapMs?: number } = {},
): () => void {
  const key = syncCacheKey(col, cityId);
  let cancelled = false;
  let docs = new Map<string, DocumentData>();
  let cursor: number | null = null;
  let tombCursor: number | null = null;
  let fullAt = 0;
  let synced = false;
  let error: string | null = null;
  let listeners: Unsubscribe[] = [];
  let persistTimer: ReturnType<typeof setTimeout> | null = null;

  const emit = () => {
    if (cancelled) return;
    const list = [...docs.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([id, d]) => ({ id, ...d }));
    onState({ docs: list, synced, error });
  };

  const flush = () => {
    if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
    const copy: StoredCopy = {
      v: CACHE_VERSION, docs: Object.fromEntries(docs), cursor, tombCursor, fullAt,
    };
    store.setItem(key, JSON.stringify(copy)).catch(() => {});
  };
  const persist = () => {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(flush, PERSIST_DEBOUNCE_MS);
  };

  const stopListeners = () => {
    listeners.forEach((u) => u());
    listeners = [];
  };

  const bump = (data: DocumentData) => {
    const ms = millisOf(data.syncedAt);
    if (ms !== null && (cursor === null || ms > cursor)) cursor = ms;
  };

  const startFull = () => {
    stopListeners();
    synced = false;
    fullAt = 0;
    const q = query(collection(db, col), where('cityId', '==', cityId));
    listeners.push(onSnapshot(q, (snap) => {
      const next = new Map<string, DocumentData>();
      cursor = null;
      snap.docs.forEach((d) => {
        const data = d.data();
        next.set(d.id, data);
        bump(data);
      });
      docs = next;
      // Every deletion up to now is already reflected in a full read.
      tombCursor = cursor;
      if (!fullAt) fullAt = now();
      synced = true;
      error = null;
      emit();
      persist();
    }, (err) => {
      error = err.message;
      emit();
    }));
  };

  const startDelta = (from: number) => {
    stopListeners();
    synced = false;
    let docsIn = false;
    let tombsIn = false;
    let fellBack = false;
    const fallBack = (err: Error) => {
      if (cancelled || fellBack) return;
      fellBack = true;
      console.warn(`[citySync] ${col} delta failed, doing a full read instead: ${err.message}`);
      startFull();
    };
    const settle = () => {
      if (docsIn && tombsIn) synced = true;
      emit();
      persist();
    };

    const since = Timestamp.fromMillis(from - overlapMs);
    listeners.push(onSnapshot(
      query(collection(db, col), where('cityId', '==', cityId), where('syncedAt', '>', since)),
      (snap) => {
        snap.docChanges().forEach((ch) => {
          // 'removed' here means deleted, or moved to another city, while we
          // were listening: syncedAt only ever increases, so nothing else
          // takes a document out of this result set.
          if (ch.type === 'removed') { docs.delete(ch.doc.id); return; }
          const data = ch.doc.data();
          docs.set(ch.doc.id, data);
          bump(data);
        });
        docsIn = true;
        settle();
      },
      fallBack,
    ));

    const tombSince = Timestamp.fromMillis((tombCursor ?? from) - overlapMs);
    listeners.push(onSnapshot(
      query(
        collection(db, 'syncTombstones'),
        where('collection', '==', col),
        where('cityId', '==', cityId),
        where('deletedAt', '>', tombSince),
      ),
      (snap) => {
        snap.docChanges().forEach((ch) => {
          if (ch.type === 'removed') return;
          const t = ch.doc.data();
          const at = millisOf(t.deletedAt);
          if (at === null) return;
          if (tombCursor === null || at > tombCursor) tombCursor = at;
          const held = docs.get(t.docId);
          if (!held) return;
          // A document recreated under the same id after the delete carries a
          // newer stamp than the tombstone, and stays.
          const heldAt = millisOf(held.syncedAt);
          if (heldAt === null || heldAt < at) docs.delete(t.docId);
        });
        tombsIn = true;
        settle();
      },
      fallBack,
    ));
  };

  store.getItem(key)
    .then((raw) => {
      if (cancelled) return;
      let copy: StoredCopy | null = null;
      try { copy = raw ? JSON.parse(raw, revive) : null; } catch { copy = null; }
      if (copy && copy.v === CACHE_VERSION && copy.docs && typeof copy.docs === 'object') {
        docs = new Map(Object.entries(copy.docs));
        cursor = copy.cursor;
        tombCursor = copy.tombCursor;
        fullAt = copy.fullAt;
        emit(); // last session's copy, on screen before the network answers
      }
      const resumable = copy !== null && cursor !== null
        && Math.abs(now() - fullAt) < FULL_REFRESH_MS;
      if (resumable) {
        startDelta(cursor as number);
      } else {
        // The copy the previous design kept (useCachedLiveQuery); superseded.
        store.removeItem(`@cache_${col}_${cityId}`).catch(() => {});
        startFull();
      }
    })
    .catch(() => { if (!cancelled) startFull(); });

  return () => {
    cancelled = true;
    stopListeners();
    if (persistTimer) flush();
  };
}
