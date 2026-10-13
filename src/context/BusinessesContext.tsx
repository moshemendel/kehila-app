/**
 * The city's kosher businesses, fetched once and shared — same reasoning as
 * SynagoguesContext, which explains it in more detail. useBusinesses(cityId)
 * had six independent call sites, SearchScreen among them alongside three
 * other collection-wide hooks called in the same screen at once.
 *
 * useCitySync keeps the list in AsyncStorage and syncs only what changed, so
 * the last copy renders instantly on a cold start instead of a blank spinner
 * for the few seconds the first connection genuinely takes.
 */
import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { useCityId } from '../hooks/useCityId';
import { useCitySync } from '../hooks/useCitySync';
import { Business } from '../types';

interface Ctx {
  businesses: Business[];
  loading: boolean;
  error: string | null;
}

const BusinessesContext = createContext<Ctx>({ businesses: [], loading: true, error: null });

export function BusinessesProvider({ children }: { children: ReactNode }) {
  const cityId = useCityId();
  const feed = useCitySync<Business>('businesses', cityId);

  // Memoised, because a fresh object here re-renders every consumer of this
  // context whether or not anything in it changed — and these providers wrap
  // the whole app, so that means every mounted screen.
  const value = useMemo(
    () => ({ businesses: feed.data, loading: feed.loading, error: feed.error }),
    [feed.data, feed.loading, feed.error],
  );

  return (
    <BusinessesContext.Provider value={value}>
      {children}
    </BusinessesContext.Provider>
  );
}

export function useBusinessesFeed(): Ctx {
  return useContext(BusinessesContext);
}
