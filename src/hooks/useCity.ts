import { useCallback, useEffect, useState } from 'react';
import { City } from '../types';
import { getCity, updateCityElevation, fetchElevationFromApi } from '../services/cities';

interface UseCityResult {
  city: City | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

/**
 * fourteen call sites read the same handful of city documents — the active
 * city, mostly, though ProfileScreen also asks for a possibly-different
 * homeCityId for an admin. Each used to fetch independently: mount two of
 * them for the same cityId at once (HomeScreen + PrayerNotificationScheduler
 * both do, every app launch) and both raced to call getCity(), and if the
 * document's elevation field was still unset, both raced to call an EXTERNAL
 * elevation API and both tried to write the result back to Firestore.
 *
 * A city document rarely changes, so it is cached at module scope — not in
 * a Context, since unlike synagogues/businesses there can legitimately be
 * more than one cityId in play at once (ProfileScreen's homeCity). One
 * cache entry per cityId, shared across every hook instance asking for it;
 * an in-flight fetch is awaited rather than repeated, so two components
 * mounting for the same city at the same moment make one network round
 * trip between them, not two.
 */
interface CacheEntry {
  city: City | null;
  loading: boolean;
  error: string | null;
}

const cache = new Map<string, CacheEntry>();
const listeners = new Map<string, Set<() => void>>();
const inFlight = new Map<string, Promise<void>>();

function notify(cityId: string) {
  listeners.get(cityId)?.forEach((fn) => fn());
}

function fetchCity(cityId: string): Promise<void> {
  const existing = inFlight.get(cityId);
  if (existing) return existing;

  const p = (async () => {
    try {
      const data = await getCity(cityId);
      if (data && data.elevation == null) {
        // Elevation missing — fetch from API and persist. Only the caller
        // that won the inFlight race gets here; everyone else just reads
        // the cache entry this fills in.
        const elev = await fetchElevationFromApi(data.latitude, data.longitude);
        if (elev != null) {
          await updateCityElevation(cityId, elev);
          cache.set(cityId, { city: { ...data, elevation: elev }, loading: false, error: null });
          return;
        }
      }
      cache.set(cityId, { city: data, loading: false, error: null });
    } catch (e: any) {
      cache.set(cityId, {
        city: cache.get(cityId)?.city ?? null,
        loading: false,
        error: e?.message ?? 'שגיאה בטעינת נתוני העיר',
      });
    } finally {
      inFlight.delete(cityId);
      notify(cityId);
    }
  })();

  inFlight.set(cityId, p);
  return p;
}

export function useCity(cityId: string): UseCityResult {
  const [, forceRender] = useState(0);

  useEffect(() => {
    if (!cityId) return;
    let set = listeners.get(cityId);
    if (!set) { set = new Set(); listeners.set(cityId, set); }
    const rerender = () => forceRender((n) => n + 1);
    set.add(rerender);

    if (!cache.has(cityId)) {
      cache.set(cityId, { city: null, loading: true, error: null });
      fetchCity(cityId);
    }

    return () => { set!.delete(rerender); };
  }, [cityId]);

  // This is a one-time fetch (not a live Firestore listener like most of the
  // app's other data), so a city admin changing coordinates/timezone/elevation
  // won't be reflected here until something calls refetch() — see the pull-to-
  // refresh handler on HomeScreen. refetch() updates the shared cache entry,
  // so every mounted consumer of this cityId picks up the fresh data, not
  // just whichever screen happened to pull to refresh.
  const refetch = useCallback(async () => {
    if (!cityId) return;
    cache.set(cityId, { city: cache.get(cityId)?.city ?? null, loading: true, error: null });
    notify(cityId);
    inFlight.delete(cityId); // force a real re-fetch rather than joining a stale promise
    await fetchCity(cityId);
  }, [cityId]);

  const entry = cache.get(cityId);
  return {
    city: entry?.city ?? null,
    loading: entry?.loading ?? true,
    refetch,
  };
}
