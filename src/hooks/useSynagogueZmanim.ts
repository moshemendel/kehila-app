import { useMemo } from 'react';
import { useCity } from './useCity';
import { useAreas } from './useAreas';
import { useAppForegroundTick } from './useAppForegroundTick';
import { Synagogue } from '../types';
import { ZmanimResult } from '../utils/zmanim';
import { cachedZmanim, synagogueZmanimSettings, zmanimPoint } from '../utils/zmanimProfile';

export type SynagogueZmanim = (synagogue: Synagogue, date?: Date) => ZmanimResult | null;

/**
 * The zmanim a synagogue's anchored prayer times resolve against: its own
 * method if its gabbai set one, else the city's — never the resident's personal
 * choice (see utils/zmanimProfile.ts for why). Returns a function so a list can
 * ask once per row; rows sharing a method share one computation.
 *
 * The returned function's identity changes when the city, its areas or the day
 * does, which is exactly when callers' memos must recompute — put it in their
 * dependency lists where they used to put a ZmanimResult.
 */
export function useSynagogueZmanim(cityId: string): SynagogueZmanim {
  const { city } = useCity(cityId);
  const { areas } = useAreas(cityId);
  const foregroundTick = useAppForegroundTick();

  return useMemo<SynagogueZmanim>(() => {
    // `foregroundTick` is only here to rebuild the closure after a resume, so a
    // default `new Date()` is today's date and not the one from first mount.
    void foregroundTick;
    return (synagogue, date = new Date()) => {
      const point = zmanimPoint(city, areas, synagogue.areaId);
      if (!point) return null;
      return cachedZmanim(date, point, synagogueZmanimSettings(synagogue, city));
    };
  }, [city, areas, foregroundTick]);
}
