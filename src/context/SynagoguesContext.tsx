/**
 * The city's synagogues, fetched once and shared.
 *
 * useSynagogues(cityId) used to be called directly from ten places —
 * PrayerNotificationScheduler and SynagogueEventRemindersContext among them,
 * both mounted for the whole app session — every one of them opening its
 * own live Firestore listener on the identical query and downloading its
 * own copy of the same ~70 documents. On a cold start that meant several
 * simultaneous full downloads of the same collection before the app felt
 * usable, which is what "slow to load" actually was.
 *
 * One listener, mounted once at the app root (same shape as EventsProvider),
 * removes the duplication rather than trying to make each copy faster. By
 * the time any screen that shows synagogues mounts, the data is usually
 * already warm from whichever always-on consumer paid for it first.
 *
 * Always-on rather than focus-gated, also matching EventsProvider: the
 * expensive part is the one-time initial snapshot, not an idle listener
 * sitting open, so there is no real cost to keeping it warm while a screen
 * showing synagogues is not the one in focus — and a real benefit when the
 * user comes back to one.
 */
import React, { createContext, useContext, ReactNode } from 'react';
import { useCityId } from '../hooks/useCityId';
import { useSynagogues } from '../hooks/useSynagogues';
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
  return (
    <SynagoguesContext.Provider value={{ synagogues, loading, error }}>
      {children}
    </SynagoguesContext.Provider>
  );
}

export function useSynagoguesFeed(): Ctx {
  return useContext(SynagoguesContext);
}
