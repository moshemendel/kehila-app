import { useState, useEffect } from 'react';
import { City } from '../types';
import { getCity, updateCityElevation, fetchElevationFromApi } from '../services/cities';

interface UseCityResult {
  city: City | null;
  loading: boolean;
}

export function useCity(cityId: string): UseCityResult {
  const [city, setCity]       = useState<City | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!cityId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const data = await getCity(cityId);
        if (cancelled) return;

        if (data && data.elevation == null) {
          // Elevation missing — fetch from API and persist
          const elev = await fetchElevationFromApi(data.latitude, data.longitude);
          if (!cancelled && elev != null) {
            await updateCityElevation(cityId, elev);
            setCity({ ...data, elevation: elev });
            return;
          }
        }

        setCity(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [cityId]);

  return { city, loading };
}
