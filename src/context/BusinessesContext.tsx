/**
 * The city's kosher businesses, fetched once and shared — same reasoning as
 * SynagoguesContext, which explains it in more detail. useBusinesses(cityId)
 * had six independent call sites, SearchScreen among them alongside three
 * other collection-wide hooks called in the same screen at once.
 *
 * Layers useCachedLiveQuery on top so the last snapshot renders instantly on
 * a cold start instead of a blank spinner for the few seconds the live
 * listener's first connection genuinely takes.
 */
import React, { createContext, useContext, ReactNode } from 'react';
import { useCityId } from '../hooks/useCityId';
import { useBusinesses } from '../hooks/useBusinesses';
import { useCachedLiveQuery } from '../hooks/useCachedLiveQuery';
import { Business } from '../types';

interface Ctx {
  businesses: Business[];
  loading: boolean;
  error: string | null;
}

const BusinessesContext = createContext<Ctx>({ businesses: [], loading: true, error: null });

export function BusinessesProvider({ children }: { children: ReactNode }) {
  const cityId = useCityId();
  const { businesses, loading, error } = useBusinesses(cityId);
  const cached = useCachedLiveQuery(`@cache_businesses_${cityId}`, { data: businesses, loading, error });

  return (
    <BusinessesContext.Provider value={{ businesses: cached.data, loading: cached.loading, error: cached.error }}>
      {children}
    </BusinessesContext.Provider>
  );
}

export function useBusinessesFeed(): Ctx {
  return useContext(BusinessesContext);
}
