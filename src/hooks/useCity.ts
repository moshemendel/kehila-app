import { useState, useEffect, useCallback, useRef } from 'react';
import { City } from '../types';
import { getCity, updateCityElevation, fetchElevationFromApi } from '../services/cities';

interface UseCityResult {
  city: City | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

export function useCity(cityId: string): UseCityResult {
  const [city, setCity]       = useState<City | null>(null);
  const [loading, setLoading] = useState(true);
  const cancelledRef = useRef(false);

  const load = useCallback(async () => {
    if (!cityId) return;
    setLoading(true);
    try {
      const data = await getCity(cityId);
      if (cancelledRef.current) return;

      if (data && data.elevation == null) {
        // Elevation missing — fetch from API and persist
        const elev = await fetchElevationFromApi(data.latitude, data.longitude);
        if (!cancelledRef.current && elev != null) {
          await updateCityElevation(cityId, elev);
          if (!cancelledRef.current) setCity({ ...data, elevation: elev });
          return;
        }
      }

      setCity(data);
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, [cityId]);

  // This is a one-time fetch (not a live Firestore listener like most of the
  // app's other data), so a city admin changing coordinates/timezone/elevation
  // won't be reflected here until something calls refetch() — see the pull-to-
  // refresh handler on HomeScreen.
  useEffect(() => {
    cancelledRef.current = false;
    load();
    return () => { cancelledRef.current = true; };
  }, [load]);

  return { city, loading, refetch: load };
}
