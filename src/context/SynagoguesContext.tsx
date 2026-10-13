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
 * One shared copy, mounted once at the app root (same shape as
 * EventsProvider), removes the duplication. useCitySync keeps that copy in
 * AsyncStorage and only asks the server for what changed since the last
 * session (see services/citySync.ts), so a cold start shows the stored list
 * at once and costs a few reads instead of one per synagogue.
 *
 * Always-on rather than focus-gated, also matching EventsProvider: the
 * expensive part is the initial snapshot, not an idle listener
 * sitting open, so there is no real cost to keeping it warm while a screen
 * showing synagogues is not the one in focus — and a real benefit when the
 * user comes back to one.
 */
import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { useCityId } from '../hooks/useCityId';
import { useCitySync } from '../hooks/useCitySync';
import { Synagogue } from '../types';

interface Ctx {
  synagogues: Synagogue[];
  loading: boolean;
  error: string | null;
}

const SynagoguesContext = createContext<Ctx>({ synagogues: [], loading: true, error: null });

export function SynagoguesProvider({ children }: { children: ReactNode }) {
  const cityId = useCityId();
  const feed = useCitySync<Synagogue>('synagogues', cityId);

  // Memoised, because a fresh object here re-renders every consumer of this
  // context whether or not anything in it changed — and these providers wrap
  // the whole app, so that means every mounted screen.
  const value = useMemo(
    () => ({ synagogues: feed.data, loading: feed.loading, error: feed.error }),
    [feed.data, feed.loading, feed.error],
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
