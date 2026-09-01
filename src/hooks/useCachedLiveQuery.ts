import { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { mark } from '../utils/startupTrace';

/**
 * Shows the last-known result of a live query instantly, then lets the live
 * data take over once it arrives.
 *
 * The Firebase JS SDK's persistent cache needs IndexedDB, which React Native
 * does not have — see firebase/firebase-js-sdk#7947 — so this app's Firestore
 * runs with no local persistence at all. Every cold start genuinely starts
 * from zero: a fresh realtime connection has to be negotiated and the first
 * snapshot downloaded before a live-query consumer has anything to show,
 * which is a real few seconds on a cold launch — a blank spinner every
 * single time the app is opened, on every screen depending on the query,
 * regardless of how many duplicate listeners are or are not open.
 *
 * This does not shorten that connection setup. It just means the user is not
 * staring at a spinner for it: whatever the query last returned is persisted
 * to AsyncStorage, shown immediately on the next mount, and silently replaced
 * the moment the live listener catches up — stale for at most that one
 * window, never after.
 */
export function useCachedLiveQuery<T>(
  cacheKey: string,
  live: { data: T[]; loading: boolean; error: string | null },
): { data: T[]; loading: boolean; error: string | null } {
  const [cached, setCached] = useState<T[] | null>(null);
  const [cacheChecked, setCacheChecked] = useState(false);

  // Read the last snapshot once per cacheKey. A local AsyncStorage read is
  // fast but still async, so cacheChecked exists to avoid a one-frame flash
  // of "nothing" before it resolves.
  useEffect(() => {
    let cancelled = false;
    setCacheChecked(false);
    setCached(null);
    AsyncStorage.getItem(cacheKey).then((raw) => {
      if (cancelled) return;
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          mark(`cache hit ${cacheKey} (${Array.isArray(parsed) ? parsed.length : '?'} items)`);
          setCached(parsed);
        } catch { /* corrupt cache — ignore, wait for live */ }
      } else {
        mark(`cache miss ${cacheKey}`);
      }
      setCacheChecked(true);
    });
    return () => { cancelled = true; };
  }, [cacheKey]);

  // Persist every successful live snapshot, so the NEXT cold start has
  // something to show. Empty results are not persisted — a transient
  // permission hiccup or a slow-to-settle query returning [] first should
  // not overwrite a real cached list with nothing.
  useEffect(() => {
    if (!live.loading && live.data.length > 0) {
      AsyncStorage.setItem(cacheKey, JSON.stringify(live.data)).catch(() => {});
    }
  }, [live.data, live.loading, cacheKey]);

  return useMemo(() => {
    if (!live.loading) return live; // live data always wins once it exists
    if (cached) return { data: cached, loading: false, error: null };
    return { data: [], loading: !cacheChecked || live.loading, error: live.error };
  }, [live, cached, cacheChecked]);
}
