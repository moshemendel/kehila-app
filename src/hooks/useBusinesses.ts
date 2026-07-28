import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Business } from '../types';

export function useBusinesses(cityId: string, active = true) {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(active);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cityId || !active) return;
    setLoading(true);
    const q = query(collection(db, 'businesses'), where('cityId', '==', cityId));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setBusinesses(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Business)));
        setLoading(false);
      },
      (err) => { setError(err.message); setLoading(false); }
    );
    return unsub;
  }, [cityId, active]);

  return { businesses, loading, error };
}
