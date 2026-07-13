import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Restaurant } from '../types';

export function useRestaurants(cityId: string, active = true) {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(active);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cityId || !active) return;
    setLoading(true);
    const q = query(collection(db, 'businesses'), where('cityId', '==', cityId));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setRestaurants(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Restaurant)));
        setLoading(false);
      },
      (err) => { setError(err.message); setLoading(false); }
    );
    return unsub;
  }, [cityId, active]);

  return { restaurants, loading, error };
}
