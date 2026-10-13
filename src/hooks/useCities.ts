import { useEffect, useMemo, useState } from 'react';
import { getAllCities } from '../services/cities';
import { City } from '../types';
import { useAuth } from '../context/AuthContext';
import { canSeeCity } from '../utils/roles';

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
 *
 * Returns only the cities this account should see: a hidden city (still being
 * set up) is left out for everyone but its own staff and super admins. The
 * cache holds the full list and the filter runs per caller, so signing in as
 * an admin shows it without refetching.
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
  const { appUser } = useAuth();
  const [all,     setAll]     = useState<City[]>(cached ?? []);
  const [loading, setLoading] = useState(!cached);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (cached) return;
    let live = true;
    load()
      .then((list) => { if (live) setAll(list); })
      .catch((e) => { if (live) setError(e.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  const cities = useMemo(() => all.filter((c) => canSeeCity(appUser, c)), [all, appUser]);
  return { cities, loading, error };
}

/** Forget the cached list — for after a city is created or deleted. */
export function invalidateCities() {
  cached = null;
}
