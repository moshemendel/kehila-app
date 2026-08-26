/**
 * The city's kosher businesses, fetched once and shared — same reasoning as
 * SynagoguesContext, which explains it in more detail. useBusinesses(cityId)
 * had six independent call sites, SearchScreen among them alongside three
 * other collection-wide hooks called in the same screen at once.
 */
import React, { createContext, useContext, ReactNode } from 'react';
import { useCityId } from '../hooks/useCityId';
import { useBusinesses } from '../hooks/useBusinesses';
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
  return (
    <BusinessesContext.Provider value={{ businesses, loading, error }}>
      {children}
    </BusinessesContext.Provider>
  );
}

export function useBusinessesFeed(): Ctx {
  return useContext(BusinessesContext);
}
