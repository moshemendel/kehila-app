import { useMemo } from 'react';
import { CommunityEvent } from '../types';
import { useCitySync } from './useCitySync';

function isExpired(e: CommunityEvent): boolean {
  const ts: any = e.expiresAt;
  if (!ts) return false; // no expiry field = legacy doc, keep it
  const ms = ts?.toMillis ? ts.toMillis() : ts?.seconds ? ts.seconds * 1000 : null;
  if (ms === null) return false;
  return ms < Date.now();
}

/** The city's events with only `expiresAt` applied — unlike EventsProvider's
 *  feed, which also drops past start dates and the user's dismissed ones.
 *  Shares EventsProvider's synced copy rather than opening its own listener. */
export function useEvents(cityId: string) {
  const { data, loading, error } = useCitySync<CommunityEvent>('events', cityId);
  const events = useMemo(
    () => data
      .filter((e) => !isExpired(e))               // hide expired events client-side
      .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [data],
  );
  return { events, loading, error };
}
