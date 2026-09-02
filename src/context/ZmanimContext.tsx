import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { useCityId } from '../hooks/useCityId';
import { useCity } from '../hooks/useCity';
import { useZmanimSettings } from './ZmanimSettingsContext';
import { useAppForegroundTick } from '../hooks/useAppForegroundTick';
import { calcZmanim, ZmanimResult } from '../utils/zmanim';

/**
 * Today's zmanim for the city being browsed, computed once.
 *
 * calcZmanim builds a ComplexZmanimCalendar and reads a dozen solar times off
 * it — about 0.9ms measured on V8, and several times that on Hermes. It was
 * being called from eight independent places, each with its own useMemo, and
 * one of them was MikvehCard, a *per-row* component: a list of mikvaot
 * recomputed the same sunset once per card.
 *
 * The same shape as SynagoguesProvider and BusinessesProvider, and for the same
 * reason — the work does not depend on who is asking, so asking once is enough.
 * That matters most on a screen transition, where a newly mounted screen's
 * first render is exactly the frame that must not be late.
 */
interface Ctx {
  cityId: string;
  zmanim: ZmanimResult | null;
}

const ZmanimContext = createContext<Ctx | null>(null);

export function ZmanimProvider({ children }: { children: ReactNode }) {
  const cityId = useCityId();
  const { city } = useCity(cityId);
  const { settings } = useZmanimSettings();
  // Without this, `new Date()` below is evaluated once at mount and the answer
  // is stale after a background/resume the next day.
  const foregroundTick = useAppForegroundTick();

  const zmanim = useMemo(() => {
    if (!city) return null;
    return calcZmanim(
      new Date(),
      city.latitude,
      city.longitude,
      settings,
      city.timezone || 'Asia/Jerusalem',
      0, // elevation always sea-level per Rav Ovadia
      0, // mountainAngle: ZmanimScreen computes daily; the home widget uses astronomical netz
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, settings, foregroundTick]);

  const value = useMemo(() => ({ cityId, zmanim }), [cityId, zmanim]);

  return <ZmanimContext.Provider value={value}>{children}</ZmanimContext.Provider>;
}

/** The shared result, or null outside the provider. */
export function useSharedZmanim(): Ctx | null {
  return useContext(ZmanimContext);
}
