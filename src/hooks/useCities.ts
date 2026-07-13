import { useState, useEffect } from 'react';
import { getAllCities } from '../services/cities';
import { City } from '../types';

export function useCities() {
  const [cities,  setCities]  = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    getAllCities()
      .then(setCities)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return { cities, loading, error };
}
