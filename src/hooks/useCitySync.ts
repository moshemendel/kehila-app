import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../services/firebase';
import { subscribeCitySync, SyncedCollection, SyncState } from '../services/citySync';
import { mark } from '../utils/startupTrace';

/**
 * One synced copy per (collection, city), however many components ask for it.
 * The providers at the app root hold one each for the whole session; a screen
 * that also wants the list (SearchScreen, ManageEventsScreen) attaches to the
 * same copy instead of opening a second listener and a second stored copy.
 */
interface Shared {
  state: SyncState | null;
  subscribers: Set<(s: SyncState) => void>;
  stop: () => void;
}
const shared = new Map<string, Shared>();

function attach(col: SyncedCollection, cityId: string, fn: (s: SyncState) => void): () => void {
  const key = `${col}:${cityId}`;
  let entry = shared.get(key);
  if (!entry) {
    const created: Shared = { state: null, subscribers: new Set(), stop: () => {} };
    created.stop = subscribeCitySync(db, AsyncStorage, col, cityId, (s) => {
      if (!created.state) mark(`${col} first data (${s.docs.length} docs${s.synced ? '' : ', stored copy'})`);
      if (s.synced && !created.state?.synced) mark(`${col} synced (${s.docs.length} docs)`);
      created.state = s;
      created.subscribers.forEach((f) => f(s));
    });
    shared.set(key, created);
    entry = created;
  }
  entry.subscribers.add(fn);
  if (entry.state) fn(entry.state);
  const mine = entry;
  return () => {
    mine.subscribers.delete(fn);
    if (mine.subscribers.size === 0) {
      mine.stop();
      shared.delete(key);
    }
  };
}

export interface CitySyncResult<T> {
  data: T[];
  /** Nothing to show yet: no stored copy and the server has not answered. */
  loading: boolean;
  /** The server has answered this session. Until then `data` is the stored
   *  copy, which may lack anything created since — so anything that prunes
   *  against "what exists" must wait for this. */
  synced: boolean;
  error: string | null;
}

export function useCitySync<T>(
  col: SyncedCollection,
  cityId: string,
  active = true,
): CitySyncResult<T> {
  const [state, setState] = useState<SyncState | null>(null);

  useEffect(() => {
    setState(null);
    if (!cityId || !active) return;
    return attach(col, cityId, setState);
  }, [col, cityId, active]);

  return {
    data: (state?.docs ?? EMPTY) as T[],
    loading: active && state === null,
    synced: state?.synced ?? false,
    error: state?.error ?? null,
  };
}

const EMPTY: never[] = [];
