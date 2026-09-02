/**
 * The city's synagogues, fetched once and shared.
 *
 * useSynagogues(cityId) used to be called directly from ten places —
 * PrayerNotificationScheduler and SynagogueEventRemindersContext among them,
 * both mounted for the whole app session — every one of them opening its
 * own live Firestore listener on the identical query and downloading its
 * own copy of the same ~70 documents. On a cold start that meant several
 * simultaneous full downloads of the same collection before the app felt
 * usable.
 *
 * One listener, mounted once at the app root (same shape as EventsProvider),
 * removes the duplication. It does not remove the remaining "few seconds
 * before the first screen that needs this can show anything" — that is
 * useCachedLiveQuery's job, layered on top: the last snapshot persists to
 * AsyncStorage and renders instantly on the next cold start, replaced the
 * moment this listener's live data arrives.
 *
 * Always-on rather than focus-gated, also matching EventsProvider: the
 * expensive part is the one-time initial snapshot, not an idle listener
 * sitting open, so there is no real cost to keeping it warm while a screen
 * showing synagogues is not the one in focus — and a real benefit when the
 * user comes back to one.
 */
import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { useCityId } from '../hooks/useCityId';
import { useSynagogues } from '../hooks/useSynagogues';
import { useCachedLiveQuery } from '../hooks/useCachedLiveQuery';
import { Synagogue } from '../types';

interface Ctx {
  synagogues: Synagogue[];
  loading: boolean;
  error: string | null;
}

const SynagoguesContext = createContext<Ctx>({ synagogues: [], loading: true, error: null });

export function SynagoguesProvider({ children }: { children: ReactNode }) {
  const cityId = useCityId();
  const { synagogues, loading, error } = useSynagogues(cityId);
  const cached = useCachedLiveQuery(`@cache_synagogues_${cityId}`, { data: synagogues, loading, error });

  // Memoised, because a fresh object here re-renders every consumer of this
  // context whether or not anything in it changed — and these providers wrap
  // the whole app, so that means every mounted screen.
  const value = useMemo(
    () => ({ synagogues: cached.data, loading: cached.loading, error: cached.error }),
    [cached.data, cached.loading, cached.error],
  );

  return (
    <SynagoguesContext.Provider value={value}>
      {children}
    </SynagoguesContext.Provider>
  );
}

export function useSynagoguesFeed(): Ctx {
  return useContext(SynagoguesContext);
}
