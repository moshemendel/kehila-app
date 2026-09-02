import { useEffect, useState } from 'react';
import { getAllCities } from '../services/cities';
import { City } from '../types';

/**
 * The cities in the system, fetched once per launch and shared.
 *
 * Three components ask for this at startup (GuestCityBootstrap, CityGpsPrompt,
 * and CityPicker once opened) and each used to fetch independently — the same
 * shape as the duplicated city-document reads useCity() already caches, and the
 * same fix. A cities list is about as static as data gets: a new city appears
 * when someone onboards one, which is not something the app needs to notice
 * mid-session.
 *
 * The in-flight promise is shared too, so two components mounting in the same
 * tick make one round trip between them rather than two.
 */
let cached: City[] | null = null;
let inFlight: Promise<City[]> | null = null;

function load(): Promise<City[]> {
  if (cached) return Promise.resolve(cached);
  inFlight ??= getAllCities()
    .then((list) => { cached = list; return list; })
    .finally(() => { inFlight = null; });
  return inFlight;
}

export function useCities() {
  const [cities,  setCities]  = useState<City[]>(cached ?? []);
  const [loading, setLoading] = useState(!cached);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (cached) return;
    let live = true;
    load()
      .then((list) => { if (live) setCities(list); })
      .catch((e) => { if (live) setError(e.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  return { cities, loading, error };
}

/** Forget the cached list — for after a city is created or deleted. */
export function invalidateCities() {
  cached = null;
}
