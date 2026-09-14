import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { useCityId } from '../hooks/useCityId';
import { useCity } from '../hooks/useCity';
import { useAreas } from '../hooks/useAreas';
import { useAuth } from './AuthContext';
import { useZmanimSettings } from './ZmanimSettingsContext';
import { useAppForegroundTick } from '../hooks/useAppForegroundTick';
import { calcZmanim, ZmanimResult } from '../utils/zmanim';
import { City, Area } from '../types';

/**
 * The point zmanim get computed from: the resident's own area if they've
 * picked one, else the tenant's one isDefault area, else the city document
 * itself — three levels of fallback so this never has nothing to return
 * while city/areas are still loading.
 *
 * The METHOD is untouched on purpose — elevation is still passed as 0 below,
 * unchanged, "always sea-level per Rav Ovadia" as it always was. What this
 * fixes is which point that method runs on: today every resident of a
 * multi-area tenant shared the one city-level point regardless of which of
 * its areas they actually live in. A halachic ruling on whether terrain
 * should adjust the times themselves (the architecture proposal's §08) is a
 * separate, still-open question — this is a geographic correction, not one.
 */
function resolveZmanimPoint(city: City | null, areas: Area[], homeAreaId?: string) {
  if (!city) return null;
  const area = (homeAreaId ? areas.find((a) => a.id === homeAreaId) : undefined)
    ?? areas.find((a) => a.isDefault)
    ?? null;
  return {
    latitude:  area?.latitude  ?? city.latitude,
    longitude: area?.longitude ?? city.longitude,
    timezone:  city.timezone || 'Asia/Jerusalem',
  };
}

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
  const { areas } = useAreas(cityId);
  const { appUser } = useAuth();
  const { settings } = useZmanimSettings();
  // Without this, `new Date()` below is evaluated once at mount and the answer
  // is stale after a background/resume the next day.
  const foregroundTick = useAppForegroundTick();

  const point = useMemo(
    () => resolveZmanimPoint(city, areas, appUser?.homeAreaId),
    [city, areas, appUser?.homeAreaId],
  );

  const zmanim = useMemo(() => {
    if (!point) return null;
    return calcZmanim(
      new Date(),
      point.latitude,
      point.longitude,
      settings,
      point.timezone,
      0, // elevation always sea-level per Rav Ovadia
      0, // mountainAngle: ZmanimScreen computes daily; the home widget uses astronomical netz
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point, settings, foregroundTick]);

  const value = useMemo(() => ({ cityId, zmanim }), [cityId, zmanim]);

  return <ZmanimContext.Provider value={value}>{children}</ZmanimContext.Provider>;
}

/** The shared result, or null outside the provider. */
export function useSharedZmanim(): Ctx | null {
  return useContext(ZmanimContext);
}
