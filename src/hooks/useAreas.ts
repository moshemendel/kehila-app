import { useEffect, useState } from 'react';
import { getAreasForCity } from '../services/areas';
import { Area } from '../types';

/**
 * A tenant's areas — its settlements, or its neighbourhoods. Same shape as
 * useCities(), scoped per city instead of global: an area list is exactly as
 * static within a session (new ones arrive by admin action, not mid-session),
 * but unlike cities there can legitimately be several cityIds' worth of areas
 * wanted across a session (an admin's own tenant, plus whichever tenant a
 * synagogue/mikveh/business being edited belongs to) — one cache entry per
 * cityId, not one list for the whole app.
 *
 * For the common case — a plain city with its one isDefault area — this is a
 * single cheap read whose result almost nothing in the UI ever surfaces: see
 * the "golden rule" in the architecture proposal. `areas.length <= 1` is the
 * condition every area-aware control checks before rendering anything.
 */
const cache = new Map<string, Area[]>();
const inFlight = new Map<string, Promise<Area[]>>();

function load(cityId: string): Promise<Area[]> {
  const hit = cache.get(cityId);
  if (hit) return Promise.resolve(hit);
  let p = inFlight.get(cityId);
  if (!p) {
    p = getAreasForCity(cityId)
      .then((list) => { cache.set(cityId, list); return list; })
      .finally(() => { inFlight.delete(cityId); });
    inFlight.set(cityId, p);
  }
  return p;
}

export function useAreas(cityId: string) {
  const [areas, setAreas]     = useState<Area[]>(cache.get(cityId) ?? []);
  const [loading, setLoading] = useState(!cache.has(cityId));

  useEffect(() => {
    if (!cityId) { setAreas([]); setLoading(false); return; }
    if (cache.has(cityId)) { setAreas(cache.get(cityId)!); setLoading(false); return; }
    let live = true;
    setLoading(true);
    load(cityId)
      .then((list) => { if (live) setAreas(list); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [cityId]);

  return { areas, loading };
}

/** Forget a tenant's cached area list — for after an area is added or edited. */
export function invalidateAreas(cityId: string) {
  cache.delete(cityId);
}
